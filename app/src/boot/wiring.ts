/** The ONE-TIME wiring of a mounted screen: the connection and state objects, their
 *  subscriptions, the gesture dispatchers, the controls, the local tickers and the page-wide
 *  listeners. Run by `tenter()` (`demarrage.ts`) under its `initialise` guard, so exactly once
 *  for the lifetime of the page even after several failed attempts — see the correction rounds 2
 *  and 3 documented there. */
import { Etat } from '../etat';
import { brancherAppui, brancherGeste } from '../rendu/tile';
import { brancherAppuiMaison, brancherGesteMaison } from '../rendu/maison';
import { brancherCochageTaches } from '../rendu/taches';
import { brancherMedia } from '../rendu/media';
import { brancherModes } from '../rendu/modes';
import { ENTITE_ENTRETIEN } from '../rendu/defaut';
import { createPress } from '../interaction';
import { createGesture } from '../geste';
import { createTaskCheck, createArming } from '../cochage';
import { CAPTEUR_REPAS } from '../garde-manger';
import { SEUIL_MUET_MS, PAS_PROGRESSION_MS, RETOUR_MS, RETOUR_RECETTE_MS } from './constants';
import { chargerTaches } from './loaders';
import { ouvrirRecette, restaurerRecette, memoriserRecette } from './recipe';
import { tictacProgression, tictacMinuteurs, reveiller, couperDelorean } from './timers';
import { brancherMinuteurs, brancherClim, brancherVueRecette, wirePantryView, type Agir } from './controls';
import { enterPantry } from './pantry';
import { poserPointsInjection } from './test-hooks';
import type { Jetons } from '../connexion';
import type { ScreenState } from './state';

export function wireScreen(s: ScreenState, jetons: Jetons): void {
  s.etat = new Etat();
  s.cx = s.d.createConnection(jetons);
  // Task 17 bis (independent review, defect D1): the state of `todo.maintenance` IS pushed, and
  // it is what triggers the reload of the labels — never the 15-minute poll alone. The list is
  // reconciled by an HOURLY automation (the maintenance task-list synchronisation) that
  // closes and reopens tasks in bulk: the entity's counter changes within the second, the cache
  // of `chargerTaches` stayed stale for up to a quarter of an hour. The central block then
  // announced "Maintenance — 3 tasks" with two ghost summaries, and `masquerEntretien` had
  // precisely removed from the summary the ONLY fresh value of the screen.
  //
  // Three precautions, each one paid for by a real defect:
  //  - on the CHANGE of value, never on reception: `Etat.appliquer` is called back for every
  //    pushed state, including the massive refresh that follows a reconnection (`get_states`,
  //    see its comment) — reloading on every reception would send one websocket command per
  //    republication, without any label having moved;
  //  - the state from BEFORE is read before `appliquer`, otherwise the comparison would be made
  //    against the value just written, would NEVER be true, and nothing would reload any more;
  //  - `chargerTaches` pushes no state (it only writes the cache then `dessiner()`s), so this
  //    callback cannot call itself back: no loop.
  // Kept to the two rooms that actually render this block, exactly the same rule as the periodic
  // callback in `tenter()`: the living room (car block in all circumstances) never renders these
  // labels, and its tasks view already reloads on every entry.
  const rechargerSurEtatEntretien = s.agencement.blocDefaut === 'repas' || s.agencement.blocDefaut === 'agenda';
  s.cx.surChangement((e) => {
    const before = s.etat.lire(e.entity_id)?.etat;
    s.etat.appliquer(e);
    if (rechargerSurEtatEntretien && e.entity_id === ENTITE_ENTRETIEN && e.state !== before) {
      void chargerTaches(s);
    }
    // Batch 6: resuming an interrupted cooking waits for the first USABLE state of the meal
    // sensor, never for the mount — when a tablet starts, the entities take ~70 s to come back
    // (see `SEUIL_MUET_MS`), and attempting the resume on a silent sensor would lose it for good.
    // `restaurerRecette` is idempotent and only consumes its attempt on a successful read.
    if (e.entity_id === CAPTEUR_REPAS) {
      restaurerRecette(s);
      // Page reloaded while the view was open (Fully killed by Android, tablet rebooted): NO
      // `hashchange` happens in that case, so it is here — at the first known meal — that the
      // view takes over. Without this, the screen would stay on the home view with a `#recette`
      // stuck in the hash, and the block could not even reopen the recipe: setting the same hash
      // again emits no event, the touch would be dead.
      if (location.hash === '#recette' && s.recetteUid === null) {
        ouvrirRecette(s);
        if (s.recetteUid === null) location.hash = '';   // nothing to open: never a dead hash
      }
    }
  });
  s.etat.surMaj(s.dessiner);

  // Task 9: the screen never goes blank after a cut — it keeps the last known state and greys it
  // out, rather than staying frozen without saying so. `cx.surSilence` is called back every 5 s by
  // `Connexion` (armed once only, see `armerSurveillanceSilence`) as long as the object exists —
  // including when its internal reconnection is broken for good (see `Connexion.reconnecter` in
  // `connexion.ts`), since this timer depends on no successful reconnection. Two distinct
  // effects, one immediate, the other on the next redraw: `racine.classList.toggle` greys out the
  // WHOLE screen (night, whole house, normal screen) without waiting for `dessiner()`;
  // `horsLigne` + the call to `dessiner()` on transition only additionally show the explicit
  // `.hors-ligne` banner (normal screen only, see the priority in `boot/home.ts`) — not on every
  // tick, so as not to pile up useless rendering every 5 s.
  s.cx.surSilence((ms) => {
    s.racine.classList.toggle('muet', ms > SEUIL_MUET_MS);
    const muted = ms > SEUIL_MUET_MS;
    if (muted !== s.horsLigne) { s.horsLigne = muted; s.dessiner(); }
  });

  // Task 7: attachment point of the optimistic touch feedback (see `interaction.ts`). The brief
  // illustrated this wiring in `index.ts`, but `etat`/`cx` only exist in the screen state —
  // `index.ts` merely starts the page and never has access to either (isolated to be testable
  // without depending on a real WebSocket). `d.minuteurFn` rather than the global `setTimeout`,
  // for consistency with the rest of `boot/` and to stay testable without a real timer.
  // Task 8: a single instance of `createPress` shared between the room screen and the whole-house
  // view — same "a single rollback timer per entity" invariant (see `interaction.ts`) rather than
  // two independent tables that could desynchronise the same entity visible on both screens (e.g.
  // `light.lumiere_salon`, present both in `piece.commandes` and in `TOUTE_LA_MAISON`).
  // Task 9, correction round 1: `() => s.horsLigne` reads the same field that the `cx.surSilence`
  // callback above updates — a live getter, not a value frozen at the time of this call (which
  // happens once only, under the `initialise` guard, well before an outage could occur).
  const appui = createPress(s.etat, s.cx, s.d.minuteurFn, () => s.horsLigne);
  brancherAppui(appui);
  brancherAppuiMaison(appui);
  // Task 13: the same instance shared between the two screens as `appui` above, same reason (see
  // the docstring of `rendu/maison.ts`) — a single service-call throttle per entity, never two
  // independent tables that could step on each other for the same entity visible on both screens
  // (e.g. `light.lumiere_salon`). `() => s.horsLigne`: the same live getter as the one given to
  // `createPress`.
  // Correction round 4: `d.minuteurFn` as 5th argument (`maintenant` explicitly `undefined` to
  // keep its `Date.now` default — only the tests override it) — the same injectable timer as
  // `createPress`/`armerRetour`, so that the safety net of the per-tile lock (`geste.ts`,
  // `DELAI_SECOURS_MS`) stays testable without a real timer, like everything else in `boot/`.
  const geste = createGesture(s.etat, s.cx, () => s.horsLigne, undefined, s.d.minuteurFn);
  brancherGeste(geste);
  brancherGesteMaison(geste);

  // Task 12: the media card (`rendu/media.ts`) and the mode blocks (`rendu/modes.ts`) call
  // services directly — not through `createPress`, which is made for tiles with a STATE and an
  // optimistic feedback. A `media_pause` has no state to anticipate, and optimism on the volume
  // would lie about what the player actually applied (the rail gives its own immediate feedback,
  // locally, see `rendu/media.ts`). Set under the `initialise` guard like everything else:
  // `brancherMedia`/`brancherModes` overwrite a module variable, calling them again on every
  // redraw would not leak but would install a fresh closure every 20 s, for nothing.
  const agir: Agir = (domaine, service, entite, data = {}) => {
    if (s.horsLigne) return;   // same refusal as `createPress`: never an action that lies
    s.cx.appelerService(domaine, service, { entity_id: entite, ...data });
  };
  brancherMedia(agir);
  brancherModes(agir);
  brancherMinuteurs(s, agir);
  brancherClim(s, agir);

  // Task 18: check-off dispatcher of the tasks view, same "a single instance for the whole page"
  // invariant as `appui`/`geste` above (see the docstring of `createTaskCheck`, `cochage.ts`) —
  // set once only under the same `initialise` guard. `() => s.horsLigne`: the same live getter as
  // the one given to `createPress`/`createGesture`.
  s.cochage = createTaskCheck({
    cx: s.cx, estHorsLigne: () => s.horsLigne, minuteurFn: s.d.minuteurFn, surChangement: s.dessiner,
  });
  brancherCochageTaches((entiteTache, uid) => s.cochage.cocher(entiteTache, uid));

  // `armementRepas` is created here and not at module level: it depends on `d.minuteurFn`, and a
  // single instance must serve the whole page (see its declaration in `boot/state.ts`).
  s.armementRepas = createArming(s.d.minuteurFn);
  brancherVueRecette(s, agir);

  // The pantry view: same single-instance arming as `armementRepas` — taking a batch out of
  // stock is not reversible from the wall either.
  s.armementStock = createArming(s.d.minuteurFn);
  wirePantryView(s);

  // Task 15 review (I1): the media progress rail moves second by second, counted here and not by
  // Home Assistant (which does not republish `media_position` continuously). Armed ONCE only,
  // under the `initialise` guard — unlike the `dessiner`/`chargerMeteo` intervals in `tenter()`,
  // re-armed on every successful attempt. It renders nothing and reads no state: it writes a CSS
  // custom property on an already-rendered element, from an anchor `dessiner()` already computed.
  s.d.intervalFn(() => tictacProgression(s), PAS_PROGRESSION_MS);
  // Task 8: the same one-second step, and deliberately an interval SEPARATE from the previous
  // one — mixing both would let an absent media rail (hence a `tictacProgression` that returns
  // early) prevent the countdown from moving, or conversely. Armed once only, under the same
  // `initialise` guard, for the same reason as `tictacProgression`.
  s.d.intervalFn(() => tictacMinuteurs(s), PAS_PROGRESSION_MS);

  armerRetourAutomatique(s);

  // Task 9 (waking the night screen): re-arms the return on EVERY touch while the screen is awake
  // — set ONCE only here, under the same `initialise` guard (same reason as documented for
  // `armerRetour`: setting it in `dessiner()`, called back by the clock/state/weather, would pile
  // one more up on every repaint). On `racine` (`#app`, never rewritten by `render()` — only its
  // children are) and not `document`: this gesture only makes sense on THIS screen, not on the
  // whole page. Capture (`true`), like `armerRetour`: the re-arming must happen BEFORE the control
  // that may have been touched acts, never after — otherwise a gesture on the first press that
  // wakes the screen could be swallowed by a redraw triggered in between. `reveiller()` itself
  // tells a first wake from a mere re-arming (see its docstring): this call therefore does NOT
  // redraw on every touch, only on the very first.
  s.racine.addEventListener('pointerdown', () => { if (s.reveilNuit) reveiller(s); }, true);

  // Same pattern, same element, same capture: the first touch cuts the DeLorean scene. Set here,
  // once only, never in `dessiner()` (which would pile one up per repaint).
  s.racine.addEventListener('pointerdown', () => couperDelorean(s), true);

  poserPointsInjection(s);
}

/** Task 8: automatic return to the home view after 45 s of inactivity on the whole-house view —
 *  the wall screen always comes back home, nobody should have to tidy it up. Task 18: the tasks
 *  view follows exactly the same rule, `isSubView` groups both (a single level of depth each,
 *  never one inside the other). Task 10 bis: the timer setting (`#minuteur`) joins this same group
 *  — that is what gives it the automatic return FOR FREE, without any mechanism of its own (the
 *  former `jetonReglage`/`armerFermetureReglage` token, which duplicated this one, has been
 *  removed). The entry animation, for its part, no longer depends on `isSubView` since task 3 —
 *  the motion engine triggers it for ANY crossing of a view marked `data-mvt`, `#minuteur`
 *  included, independently of this group. Listeners set ONCE only here, under the `initialise`
 *  guard: setting them in `dessiner()` (called back by `etat.surMaj`, the 20 s clock, the 15 min
 *  weather...) would silently pile up one more on every repaint — exactly the trap this project
 *  already paid for (see the comments of `interaction.ts`). `armerRetour` always cancels the
 *  previous timer before setting a new one: at most a single live return timer at a time,
 *  whatever the number of touches.
 *  "Recipe" batch: `#recette` joins this group (hence the deduplication and the re-arming on
 *  touch), but with ITS delay — see `RETOUR_RECETTE_MS` in `boot/constants.ts`. */
function armerRetourAutomatique(s: ScreenState): void {
  const isSubView = (h: string) =>
    h === '#maison' || h === '#taches' || h === '#minuteur' || h === '#recette'
    || h === '#garde-manger';
  let retour: ReturnType<typeof setTimeout> | undefined;
  const armerRetour = () => {
    clearTimeout(retour);
    const delai = location.hash === '#recette' ? RETOUR_RECETTE_MS : RETOUR_MS;
    // `#recette`: the hash goes back to empty WITHOUT closing the recipe (`recetteUid` intact),
    // and the step is written before leaving. The wall screen goes back home, the cooking keeps
    // its resume point.
    retour = s.d.minuteurFn(() => { memoriserRecette(s); location.hash = ''; }, delai);
  };

  window.addEventListener('hashchange', () => {
    // Task 18: the side slide between the home view and a sub-view lived here, as
    // `.entree-droite`/`.entree-gauche` set by hand on `racine`. Task 3 (motion engine): replaced
    // by the engine's `traversee` verdict, which deduces the direction itself from the
    // `data-mvt="vue:…"` key of the incoming view (`comparer()`, `diff.ts`) — nothing to set here,
    // neither before nor after `dessiner()`. The return on touch remains strictly instantaneous,
    // outside the engine, see the task 18 report.
    if (location.hash === '#taches') void chargerTaches(s);
    // "Recipe" batch: this is the ONLY place that opens the recipe. The home block and the recipe
    // tile only set the hash (`rendu/defaut.ts`, `interaction.ts`) — like the three other
    // sub-views, the entrance door is the hash, never a state set on the sly by a render.
    // `ouvrirRecette` refuses to reset itself if a recipe is already in progress (see its
    // docstring): coming back to a collapsed recipe finds its step again.
    if (location.hash === '#recette') ouvrirRecette(s);
    // The pantry reads the stock on every entry, never periodically (spec 2026-09-28).
    if (location.hash === '#garde-manger') enterPantry(s);
    s.dessiner();
    if (isSubView(location.hash)) armerRetour();
    else { clearTimeout(retour); retour = undefined; }
  });
  document.addEventListener('pointerdown', () => {
    if (!isSubView(location.hash)) return;
    armerRetour();
  }, true);
}
