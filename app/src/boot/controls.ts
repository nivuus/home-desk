/** The actions behind the controls that call Home Assistant services DIRECTLY — the kitchen
 *  timers, the car's air conditioning and the recipe view — wired once only by `wireScreen`
 *  (`boot/wiring.ts`) under the `initialise` guard: each `brancher*` overwrites a module variable,
 *  calling them again on every redraw would install a fresh closure every 20 s, for nothing. */
import { listerMinuteurs, premierSlotLibre, bornerDuree, dureeHms, hms } from '../minuteur';
import { brancherMinuteur } from '../rendu/minuteur';
import { brancherVoiture } from '../rendu/voiture';
import { brancherRecette } from '../rendu/recette';
import { memoriserRecette, validerRepas } from './recipe';
import type { ScreenState } from './state';

/** Calls a service on one entity, unless the screen is offline. */
export type Agir = (domaine: string, service: string, entite: string,
                    data?: Record<string, unknown>) => void;

/** The timer slots of the room — empty for any room that declares no `piece.minuteurs`. */
const slots = (s: ScreenState) => s.piece.minuteurs ?? [];

/** Task 7: the timers call the `timer.*` services DIRECTLY, never the scripts
 *  `script.toggle_minuteur_cuisine`/`…_plus_5`: those remain for the voice assistant and the old
 *  dashboard, but they pass the duration through an `input_number`, which would add a network
 *  round trip to every gesture on an already slow panel.
 *
 *  Task 10 bis: `ouvrir`/`fermer`/`start` now drive `location.hash` rather than a local state —
 *  the setting has become the sub-view `#minuteur`, on a par with the whole-house and tasks views.
 *  Each one redraws explicitly (`dessiner()`) instead of relying on the `hashchange` listener (set
 *  in `boot/wiring.ts`, next to `armerRetour`): the latter only ARMS the automatic return on top,
 *  it remains solely responsible for that — the same synchronous gesture as every other action of
 *  `boot/` (immediate feedback under the finger, never a wait for an asynchronous event). */
export function brancherMinuteurs(s: ScreenState, agir: Agir): void {
  brancherMinuteur({
    ouvrir: () => {
      if (premierSlotLibre(s.etat, slots(s)) === null) return;   // nothing to open
      const memoire = Number(s.etat.lire('input_number.duree_minuteur_cuisine')?.etat);
      s.dureeMinuteur = bornerDuree(Number.isFinite(memoire) ? memoire : 7);
      s.etiquetteMinuteur = null;
      location.hash = '#minuteur';
      s.dessiner();
    },
    fermer: () => { location.hash = ''; s.dessiner(); },
    changerDuree: (delta) => {
      s.dureeMinuteur = bornerDuree(s.dureeMinuteur + delta);
      s.dessiner();
    },
    choisirEtiquette: (nom) => {
      s.etiquetteMinuteur = s.etiquetteMinuteur === nom ? null : nom;
      s.dessiner();
    },
    start: () => {
      const slot = premierSlotLibre(s.etat, slots(s));
      if (slot === null) return;   // the three slots filled up in the meantime
      const t = slots(s)[slot];
      agir('timer', 'start', t.timer, { duration: dureeHms(s.dureeMinuteur) });
      agir('input_text', 'set_value', t.nom, { value: s.etiquetteMinuteur ?? '' });
      agir('input_number', 'set_value', 'input_number.duree_minuteur_cuisine',
           { value: s.dureeMinuteur });
      location.hash = '';
      s.dessiner();
    },
    pause: (slot) => agir('timer', 'pause', slots(s)[slot].timer),
    reprendre: (slot) => agir('timer', 'start', slots(s)[slot].timer),
    annuler: (slot) => agir('timer', 'cancel', slots(s)[slot].timer),
    // NOT `timer.change`: found on the real installation at task 1, Home Assistant refuses
    // (`HomeAssistantError: beyond duration`, HTTP 500) any `change` that would bring the
    // remaining time beyond the duration of the last `start` — so "+ 5" would fail precisely in
    // the most common case, a timer that has just been started. `timer.start` with a recomputed
    // duration always succeeds and redefines the reference. Only concerns a RUNNING timer: the
    // render does not offer ± 5 while paused, a `start` would restart it there.
    ajuster: (slot, deltaS) => {
      const vue = listerMinuteurs(s.etat, slots(s), s.d.maintenant().getTime())
        .find((v) => v.slot === slot);
      if (!vue || !vue.actif) return;
      const secondes = Math.max(1, Math.round(vue.restantS) + deltaS);
      agir('timer', 'start', slots(s)[slot].timer, { duration: hms(secondes) });
    },
  });
}

/** Task 9 bis: the car. `piece.voiture` only exists in the living room — `clim` does nothing in
 *  any other room (`if (!v) return;`), the same guard as the timer tile of `dessiner()`. */
export function brancherClim(s: ScreenState, agir: Agir): void {
  brancherVoiture({
    clim: (start: boolean) => {
      const v = s.piece.voiture;
      if (!v) return;
      agir('button', 'press', start ? v.demarrerClim : v.arreterClim);   // policy: allow-fr — keys of the screen contract (contrat/ecran.schema.json)
      s.climEnVol = start ? 'demarrage' : 'arret';
      const mien = ++s.jetonClim;
      // Three minutes: the high latency measured on this car (Stellantis cloud). Beyond that, we
      // stop pretending something is happening rather than leaving a perpetual "starting…" — the
      // retry automation, for its part, keeps doing its job.
      s.d.minuteurFn(() => {
        if (mien !== s.jetonClim) return;
        s.climEnVol = null;
        s.dessiner();
      }, 180_000);
      s.dessiner();
    },
  });
}

/** "Recipe" batch (2026-08-17): the actions of the `#recette` view. */
export function brancherVueRecette(s: ScreenState, agir: Agir): void {
  brancherRecette({
    // Turning a page is not a navigation: we stay in the same view, and remember at every step
    // rather than on leaving (Android can kill the app in between).
    page: (n) => { s.pageRecette = n; memoriserRecette(s); s.dessiner(); },
    pageIngredients: (n) => { s.pageIngredients = n; s.dessiner(); },
    // Collapsing KEEPS the recipe (`recette` mode, see `modes.ts`); "Terminer" VALIDATES it then
    // forgets it. These are the only two ways out of this view.
    reduire: () => { memoriserRecette(s); location.hash = ''; s.dessiner(); },
    terminer: () => { void validerRepas(s); },
    ouvrirPanneau: () => {
      // No read here: the decrement plan was requested ONCE when the view opened
      // (`chargerRecette`), and it does not move while cooking. Calling `meal/preview` again on
      // every opening of the panel would reproduce the periodic read this batch has precisely
      // removed.
      s.panneauIngredients = true;
      s.pageIngredients = 0;
      s.dessiner();
    },
    fermerPanneau: () => {
      s.panneauIngredients = false;
      s.dessiner();
    },
    // The render always calls with the duration of the TAG (it does not know the slots): the
    // arbitration happens here. A timer that already carries this name is paused / resumed, never
    // a second slot for the same step — otherwise a press on a cooking in progress would lose its
    // progress. Resumed through a RECOMPUTED `timer.start`: `timer.change` fails (HTTP 500,
    // "beyond duration") as soon as the remaining time would exceed the duration of the last
    // `start`, a trap already paid for by "+ 5" (see `ajuster`, `brancherMinuteurs` above).
    minuteur: (nom, secondes) => {
      if (s.horsLigne) return;
      const enCours = listerMinuteurs(s.etat, slots(s), s.d.maintenant().getTime())
        .find((v) => v.nom === nom);
      if (enCours) {
        if (enCours.actif) agir('timer', 'pause', enCours.timer);
        else agir('timer', 'start', enCours.timer, { duration: hms(enCours.restantS) });
        return;
      }
      const libre = premierSlotLibre(s.etat, slots(s));
      if (libre === null) return;   // the three slots are taken: the button was already greyed out
      agir('timer', 'start', slots(s)[libre].timer, { duration: hms(secondes) });
      agir('input_text', 'set_value', slots(s)[libre].nom, { value: nom });
    },
  });
}
