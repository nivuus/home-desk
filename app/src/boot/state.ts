/** The state of ONE mounted wall screen, for the whole lifetime of the page.
 *
 *  Before the split of `demarrage.ts` (2026-09-28), every field below was a `let` of a single
 *  1,750-line closure. They are gathered here, unchanged in meaning and initial value, so that the
 *  modules of `boot/` (loaders, recipe, timers, wiring, drawing) share them explicitly instead of
 *  through a closure — each module receives this object and nothing else. Nothing in here renders
 *  or talks to Home Assistant: it is data plus the one `dessiner` entry point. */
import type { Etat } from '../etat';
import type { Ecran } from '../ecran';
import type { Agencement } from '../agencement';
import type { Niveau } from '../mouvement';
import type { Moteur } from '../mouvement/moteur';
import type { Ancre } from '../progression';
import type { AncreMinuteur } from '../minuteur';
import type { EnVolClim } from '../rendu/voiture';
import type { NextMeal } from '../garde-manger';
import type { LigneIngredient } from '../rendu/recette';
import type { Prevision } from '../meteo';
import type { Evenement } from '../agenda';
import type { createTaskCheck, createArming } from '../cochage';
import type { ConnexionLike, DependancesDemarrage } from './types';
import { newPantryState, type PantryState } from './pantry';

export class ScreenState {
  // Correction round 2: a single instance of `Connexion` (and of `Etat`) for the whole lifetime
  // of the page — not one per attempt. Both are assigned by `wireScreen` (`boot/wiring.ts`) under
  // the `initialise` guard of `tenter()` (`demarrage.ts`); the definite-assignment `!` mirrors
  // the `let etat!` / `let cx!` they used to be.
  etat!: Etat;
  cx!: ConnexionLike;
  // Task 18: `cochage` must be visible from `dessiner()` — same reason as `etat`/`cx` just above:
  // assigned in `wireScreen` under the `initialise` guard, never a local of it that would stay
  // invisible elsewhere.
  cochage!: ReturnType<typeof createTaskCheck>;
  // Batch 6: the two-press arming of "Terminer" (`createArming`, `cochage.ts`). Validating a meal
  // decrements the stock and IS NOT REVERSIBLE from the wall — same mechanism as checking off a
  // task, never a long press. Same "a single instance for the whole page" invariant as
  // `cochage`/`appui`/`geste`, hence the same pattern: assigned in `wireScreen` under the
  // `initialise` guard (it depends on `d.minuteurFn`).
  armementRepas!: ReturnType<typeof createArming>;

  /** The pantry view (`#garde-manger`, `boot/pantry.ts`): the stock read from home-stock, the
   *  level being browsed and the sheet of the selected batch. `soonList` is set by `wireScreen`
   *  from the screen configuration. */
  pantry: PantryState = newPantryState();
  /** Two-press arming of "Mangé" / "Jeté" / "Périmé": taking a batch out of stock is not
   *  reversible from the wall. Same single-instance pattern as `armementRepas`. */
  armementStock!: ReturnType<typeof createArming>;

  // Raw cache of the active tasks per list, fed by `chargerTaches` (`boot/loaders.ts`) (a separate
  // websocket request, `todo/item/list` has no counterpart pushed by `subscribe_events` — no task
  // checked off elsewhere, for instance from the Home Assistant app, would otherwise be reflected
  // here before the next visit to the view). Empty on the very first render, before the first
  // request had time to answer — the view then briefly shows its empty state rather than a
  // broken screen, same discipline as `jours` below.
  taches: Record<string, { uid: string; texte: string }[]> = {};

  /** What is planned to eat. Batch 6: no longer a variable FED by a request, but a value DERIVED
   *  from `Etat` — `currentMeal()` (`boot/recipe.ts`) recomputes it on every redraw, for free,
   *  from the attributes of `sensor.home_stock_next_meal`. No more `setInterval`, no more HTTP
   *  read: the block follows `subscribe_events`, already coalesced (`Etat.notifier`).
   *
   *  `repasInjecte` is the entry point of the render checker (`__injecterRepas`, guard
   *  `?essai=1` only): `undefined` = no injection, `null` = no meal, an object = that very meal.
   *  Three states and not two — without the third, the check could not tell "I inject nothing"
   *  from "I inject the absence". */
  repasInjecte: NextMeal | null | undefined;

  // The recipe in progress — collapsed (block `rendreRecetteReduite` on the home view) or open
  // (sub-view `#recette`). `recetteUid` is the id of the `meal_plan` entry, the same key as the
  // persistence (`src/recette-en-cours.ts`): `null` = no recipe in progress, and it is IT that
  // decides the `recette` mode (see `ctx` in `boot/frame.ts`), never the hash — a collapsed
  // recipe stays "in progress" on the home view. `pagesRecette` is already split
  // (`decouperPages`), `pageRecette` the step being read.
  recetteUid: string | null = null;
  pagesRecette: string[] = [];
  pageRecette = 0;
  /** `pageSourceIndex[i]` = the index, among the SOURCE pages (`decouperPages`, before any
   *  sub-split), that `pagesRecette[i]` comes from — identity as long as `reScinder` has cut
   *  nothing, several consecutive entries pointing to the SAME source index after a cut (round 1,
   *  task 12 review): `pagesRecette` can be finer than the source pages, but the PERSISTED step
   *  (`memoriserRecette`) must remain a SOURCE index — stable across a restart, which always
   *  rebuilds the coarse source pages, never the fine sub-split from before (it depends on a DOM
   *  measurement no storage carries). Without this table, persisting the fine index would make
   *  the resume land on another step than the one actually left. */
  pageSourceIndex: number[] = [];
  /** The id of the meal (`meal_id`) and of the recipe (`recipe_id`) actually open, plus the dish
   *  name and the label taken WHEN OPENING. Re-reading `currentMeal()` to display them would be a
   *  lie waiting to happen: during cooking, the sensor may switch to the next meal, and write
   *  "Tomorrow, breakfast" above the steps of the dinner in progress. */
  mealEnCours: number | null = null;
  recetteEnCours: number | null = null;
  platRecette = '';
  etiquetteRecette = '';
  // Ingredients of the panel: `undefined` = not loaded yet (the panel then shows its empty state
  // for a fraction of a second rather than a broken screen, same discipline as `taches`).
  // `pageIngredients` is DISTINCT from `pageRecette`: the row of arrows of the view is shared
  // (`rendu/recette.ts`) and pages through one or the other depending on whether the panel is
  // open — a single index for both would make the step jump while turning ingredient pages.
  ingredients: LigneIngredient[] | undefined;
  panneauIngredients = false;
  pageIngredients = 0;
  /** Race token for opening a recipe, same pattern as `jetonClim` below: one token per opening,
   *  a single winner. Without it, "Terminer" then reopening ANOTHER recipe while both reads of
   *  the previous one are pending would display the steps of a recipe foreign to the one
   *  announced. */
  jetonRecette = 0;
  /** A refusal from the server, already translated into French by the component
   *  (`messages.py`), displayed in place of the label of the view. `null` = nothing to say. */
  messageRecette: string | null = null;
  /** Restoring from storage happens only ONCE: afterwards `recetteUid` is the truth of the
   *  screen, and re-reading the storage on every state change would resurrect a recipe that
   *  "Terminer" has just closed. */
  recetteRestauree = false;

  // Weather forecasts: loaded apart from the websocket (`weather.maison` is not pushed by
  // `subscribe_events` with its forecasts), through a plain REST request. `jours` lives here to be
  // read by `dessiner()`.
  // Task 9, correction 1 (coordinator, 2026-08-02): `demain` had been removed from here, having
  // become dead once `rendreCorps` lost its `demain` parameter. Task 12: RESTORED, with the
  // `type: 'daily'` request that feeds it — it is the PERMANENT fallback of the header badge
  // (`pastilleBandeau`, `agenda.ts`), the only thing that guarantees the right column of the
  // header is never empty without a reason. Without it, the emptiness this whole plan started
  // from comes back.
  // Task 13: `demain` (a single `Prevision`) becomes `jours`, the COMPLETE `daily` window — the
  // fallback is no longer always "Tomorrow", `pastilleBandeau` now chooses between the next
  // change of condition and the old behaviour (`prochainChangement`, `agenda.ts`), and it needs
  // the whole window for that, not only tomorrow's entry.
  // Task 14: the `hourly` forecast (`horaire`) disappeared from here along with the `previsions`
  // mode that was its only reader (`rendreCorps`) — no caller left, see `chargerMeteo`.
  jours: Prevision[] = [];

  // Calendar: loaded apart from the websocket like the weather (`/api/calendars` has no
  // counterpart pushed by `subscribe_events`). Empty until the first request has answered — the
  // badge then falls back on "Tomorrow", never a broken screen, same discipline as `taches`.
  // Task 14: also the source of the next appointment of the office (`rendreProchainRdv`,
  // `rendu/defaut.ts`) — the same data as the badge, never a second request.
  evenements: Evenement[] = [];

  // Task 9: switched on transition only (not on every `surSilence` callback, every 5 s) —
  // `dessiner()` only needs to be called back when the displayed value must actually change,
  // consistent with the rest of `boot/`, which avoids piling up useless work.
  horsLigne = false;

  // Task 9 (waking the night screen): the night screen has been woken by a press — the full screen
  // is rendered, in the evening palette, until the automatic return. Local to the page on
  // purpose, exactly like `dureeMinuteur`/`etiquetteMinuteur` below: none of this belongs in Home
  // Assistant. `jetonReveil` follows the same pattern as one token per gesture (see `jetonClim`
  // below): one token per call to `reveiller()`, a single winner, see its docstring.
  reveilNuit = false;
  jetonReveil = 0;

  // Task 15 review (I1): the starting point of the media progress rail, recomputed on every
  // `dessiner()` and consumed by the one-second tick armed in `wireScreen`. `null` = nothing to
  // show (no source, no published progress, zero duration): the rail stays at zero.
  ancreProgression: Ancre | null = null;

  // Task 7: what the timer setting offers — whether it is open is no longer tracked here since
  // task 10 bis (opening/closing is carried by `location.hash === '#minuteur'`, like the other two
  // sub-views). Local to the page on purpose, it is a state of a few seconds, not a piece of house
  // data. The initial duration, however, comes from HA (`input_number.duree_minuteur_cuisine`) so
  // as to be shared with the voice assistant.
  dureeMinuteur = 7;
  etiquetteMinuteur: string | null = null;
  /** Anchor per slot, set by `dessiner()` and consumed by the one-second tick (task 8). */
  ancresMinuteurs = new Map<number, AncreMinuteur>();

  /** Task 9 bis: optimistic feedback of the car's air conditioning — what the screen shows while
   *  the car has not answered yet. Local to the page on purpose, exactly like `dureeMinuteur`
   *  above: none of this belongs in Home Assistant. `jetonClim` follows the same pattern as one
   *  token per press (see `reveiller`, `boot/timers.ts`): one token per press, a single winner — a
   *  second press while waiting cannot set anything anyway (`brancherVoiture`, in
   *  `boot/controls.ts`, refuses any press as long as `climEnVol` is not `null`), so in practice
   *  at most one live token at a time; it still follows the same mechanism to stay consistent
   *  with the rest of `boot/` should that refusal ever change. */
  climEnVol: EnVolClim = null;
  jetonClim = 0;

  /** Redraws the screen. An arrow property, not a method, so that it can be handed out as a
   *  callback (`etat.surMaj`, `d.intervalFn`, `armer`...) exactly like the hoisted `dessiner`
   *  function of the former closure. */
  readonly dessiner = (): void => { this.peintre(this); };

  constructor(
    /** `#app`: never rewritten by `render()` — only its children are. */
    readonly racine: HTMLElement,
    /** The ALREADY RESOLVED screen; it never changes for the lifetime of the page. */
    readonly piece: Ecran,
    readonly d: DependancesDemarrage,
    /** Plan 2, task 3: resolved ONCE — `piece` never changes for the lifetime of the page, and
     *  `resoudreAgencement` is pure. A second resolution point would be a second defect liable to
     *  diverge, exactly what `resoudreAgencement` exists to forbid (see its docstring,
     *  `agencement.ts`). */
    readonly agencement: Agencement,
    /** Task 18: the `todo.*` lists of this room (summary + extras, see `cochage.ts`) — computed
     *  once only: `piece` never changes for the lifetime of the page. */
    readonly roomLists: string[],
    /** The motion level requested at start-up, FIXED for the lifetime of the page, see
     *  `startWithScreen` (`demarrage.ts`). */
    readonly niveauInitial: Niveau,
    /** Created once only: it carries the memory of the previous painting from one `dessiner()` to
     *  the next (see `src/mouvement/moteur.ts`, the snapshot trap). */
    readonly moteur: Moteur,
    private readonly peintre: (s: ScreenState) => void,
  ) {}
}
