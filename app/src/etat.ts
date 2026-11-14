import type { EvenementEtat } from './connexion';

export type Entite = {
  etat: string;
  attributs: Record<string, unknown>;
  /** When the state last changed, in ms: Home Assistant's `last_changed`, which both
   *  `get_states` and `state_changed` carry on every state object (outside the attributes). The
   *  reception time stands in for it only when it is missing — a state made up by the page.
   *  Task 8 bis needs it to know since when the house has stopped moving. */
  changeLe: number;
  optimisteDepuis?: number;
};

const INUTILISABLES = new Set(['unavailable', 'unknown', '']);

export class Etat {
  private entites = new Map<string, Entite>();
  private rappels: (() => void)[] = [];

  surMaj(cb: () => void) { this.rappels.push(cb); }

  /** The entity ids the last COMPLETE paint read, or `null` when unknown (no paint yet, or the
   *  last one threw): then every change notifies.
   *
   *  The connection subscribes to every `state_changed` of the installation, and each applied
   *  state used to schedule a full repaint. Which entities a screen shows is decided by its
   *  renderers — the screen configuration, the house, the card detectors, the named constants —
   *  and every one of them reads through this object. Recording those reads derives the set from
   *  what the renderers actually read, never from a second list kept by hand: an entity a paint
   *  did not read cannot change that paint, and a branch that would read it is taken only after
   *  an entity the paint DID read has changed. */
  private lusParLaPeinture: Set<string> | null = null;
  private lectureEnCours: Set<string> | null = null;

  /** Runs `peindre`, recording every entity it reads (see `lusParLaPeinture`). */
  suivreLectures(peindre: () => void): void {
    const lus = new Set<string>();
    this.lectureEnCours = lus;
    let complete = false;
    try {
      peindre();
      complete = true;
    } finally {
      this.lectureEnCours = null;
      this.lusParLaPeinture = complete ? lus : null;
    }
  }

  private noterLecture(id: string) { this.lectureEnCours?.add(id); }

  /** Would a change of this entity change what is painted? */
  private estPeinte(id: string): boolean {
    return this.lusParLaPeinture === null || this.lusParLaPeinture.has(id);
  }

  /** Un état venu de HA fait autorité : il écrase toujours un état optimiste. */
  appliquer(e: EvenementEtat) {
    const avant = this.entites.get(e.entity_id);
    // On ne réhorodate que si l'état a réellement changé : un rafraîchissement massif
    // (get_states après reconnexion) ne doit pas faire croire que la maison vient de bouger.
    const changeLe = avant && avant.etat === e.state && avant.optimisteDepuis === undefined
      ? avant.changeLe : Date.now();
    // Home Assistant's own time wins; the reception time above only stands in when it is absent.
    const reported = e.last_changed === undefined ? NaN : Date.parse(e.last_changed);
    this.entites.set(e.entity_id, {
      etat: e.state, attributs: e.attributes, changeLe: Number.isFinite(reported) ? reported : changeLe,
    });
    if (this.estPeinte(e.entity_id)) this.notifier();
  }

  optimiste(id: string, etat: string) {
    const a = this.entites.get(id);
    this.entites.set(id, {
      etat, attributs: a?.attributs ?? {}, changeLe: a?.changeLe ?? Date.now(),
      optimisteDepuis: Date.now(),
    });
    this.notifier();
  }

  confirme(id: string): boolean {
    this.noterLecture(id);
    const e = this.entites.get(id);
    return e ? e.optimisteDepuis === undefined : false;
  }

  lire(id: string): Entite | undefined { this.noterLecture(id); return this.entites.get(id); }

  /** Une entité absente ou muette n'est jamais rendue : sa tuile est masquée plutôt que de
   *  faire échouer l'écran entier. */
  estUtilisable(id: string): boolean {
    this.noterLecture(id);
    const e = this.entites.get(id);
    return e !== undefined && !INUTILISABLES.has(e.etat);
  }

  /** Does Home Assistant know this entity right now? Not the same question as `estUtilisable`.
   *
   *  `unknown` means the entity EXISTS and has nothing to say — `sensor.home_stock_next_meal`
   *  with no meal planned. Missing or `unavailable` means whatever provides it is not there — the
   *  integration is not installed or not loaded. The generic masking treats both alike, and
   *  rightly: neither has a value to draw. `absenceNommee` must NOT: it names a missing
   *  integration, and saying so of an installed one is a false diagnosis (production gate of
   *  2026-09-28, defect A: "Garde-manger non installé" with `home_stock` loaded). */
  isPresent(id: string): boolean {
    this.noterLecture(id);
    const e = this.entites.get(id);
    return e !== undefined && e.etat !== 'unavailable';
  }

  /** Un redessin AU PLUS par tâche, jamais un par entité reçue.
   *
   *  Root cause de la panne « Fully redémarre en boucle » (2026-08-20, tablettes salon et
   *  bureau) : `appliquer` est rappelé pour chaque état poussé par Home Assistant, et notifiait
   *  sur-le-champ. Or `connexion.ts` demande un `get_states` à chaque connexion, dont la réponse
   *  republie les 1708 entités de l'installation dans un SEUL message websocket : la boucle qui
   *  la déplie faisait donc 1708 redessins complets d'affilée. Mesuré sur la page réelle dans un
   *  vrai navigateur (`outils/mesurer-salve.mjs`) : 1712 recalculs de style, 1712 mises en page,
   *  28 149 nœuds DOM créés en une seconde et 2,44 s de temps de script sur un x86 moderne —
   *  soit des dizaines de secondes sur le Cortex-A7 des Fire 7. Android tuait Fully pendant cette
   *  rafale ; Fully redémarrait, se reconnectait, et repartait pour une salve identique — d'où
   *  les séries de morts toutes les 30 s relevées dans `data/diag_tablette_salon/journal.log`.
   *
   *  `queueMicrotask` et non `requestAnimationFrame` : la microtâche s'exécute à la fin de la
   *  tâche courante, donc avant que le navigateur ne peigne — le retour tactile optimiste
   *  (`optimiste`, cf. `interaction.ts`) reste perceptiblement immédiat — et elle reste
   *  déclenchable en test sans horloge simulée, contrairement à une frame d'animation que jsdom
   *  ne rend jamais. Une salve = une microtâche = un redessin ; deux messages websocket reçus
   *  dans deux tâches distinctes gardent bien leurs deux redessins.
   *
   *  Ce qui est coalescé est le REDESSIN, jamais la donnée : chaque état est appliqué
   *  intégralement au passage, dans l'ordre. */
  private redessinPlanifie = false;

  private notifier() {
    if (this.redessinPlanifie) return;
    this.redessinPlanifie = true;
    queueMicrotask(() => {
      this.redessinPlanifie = false;
      for (const cb of this.rappels) cb();
    });
  }
}
