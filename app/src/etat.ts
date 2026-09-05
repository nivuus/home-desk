import type { EvenementEtat } from './connexion';

export type Entite = {
  etat: string;
  attributs: Record<string, unknown>;
  /** Horodaté par nous : les événements `state_changed` portent `last_changed` hors des
   *  attributs, et `get_states` ne le donne pas dans la même forme. La tâche 8 bis en a
   *  besoin pour savoir depuis quand la maison ne bouge plus. */
  changeLe: number;
  optimisteDepuis?: number;
};

const INUTILISABLES = new Set(['unavailable', 'unknown', '']);

export class Etat {
  private entites = new Map<string, Entite>();
  private rappels: (() => void)[] = [];

  surMaj(cb: () => void) { this.rappels.push(cb); }

  /** Un état venu de HA fait autorité : il écrase toujours un état optimiste. */
  appliquer(e: EvenementEtat) {
    const avant = this.entites.get(e.entity_id);
    // On ne réhorodate que si l'état a réellement changé : un rafraîchissement massif
    // (get_states après reconnexion) ne doit pas faire croire que la maison vient de bouger.
    const changeLe = avant && avant.etat === e.state && avant.optimisteDepuis === undefined
      ? avant.changeLe : Date.now();
    this.entites.set(e.entity_id, { etat: e.state, attributs: e.attributes, changeLe });
    this.notifier();
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
    const e = this.entites.get(id);
    return e ? e.optimisteDepuis === undefined : false;
  }

  lire(id: string): Entite | undefined { return this.entites.get(id); }

  /** Une entité absente ou muette n'est jamais rendue : sa tuile est masquée plutôt que de
   *  faire échouer l'écran entier. */
  estUtilisable(id: string): boolean {
    const e = this.entites.get(id);
    return e !== undefined && !INUTILISABLES.has(e.etat);
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
