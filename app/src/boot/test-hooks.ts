/** Task 13 — injection points of the render checker (`outils/verifier-rendu.mjs`), which must be
 *  able to put the screen in each of the six main modes without ever touching the real house (no
 *  service call, no write into Home Assistant: the state is pushed INTO the page, through the same
 *  path as the websocket).
 *
 *  Set ONLY if the page was opened with `?essai=1` — on the three real tablets, whose Fully Kiosk
 *  start URL does not carry this parameter, the properties do not exist at all: no write surface
 *  is offered to anything. Set by `wireScreen` under the `initialise` guard like the rest of the
 *  wiring, hence once only. */
import { decouperPages } from '../recette';
import type { NextMeal } from '../garde-manger';
import type { LigneIngredient } from '../rendu/recette';
import type { Evenement } from '../agenda';
import { fermerRecette } from './recipe';
import type { ScreenState } from './state';

export function poserPointsInjection(s: ScreenState): void {
  if (new URL(location.href).searchParams.get('essai') !== '1') return;
  const fenetre = window as unknown as Record<string, unknown>;

  // `ilYaMs` (4th argument) backdates the timestamp that `Etat.appliquer` sets itself
  // (`changeLe`, see `etat.ts`). It is essential to the `aeration` mode, which only exists beyond
  // ten minutes of an open window (`AERATION_MS`, `modes.ts`): without it, a checker would have
  // to wait ten minutes to measure this mode, or fake the clock of the whole document — which
  // would trigger along the way the websocket silence watch (`SEUIL_MUET_MS`) and display the
  // offline screen instead of the measured mode. The swap of `Date.now` is strictly synchronous
  // and restored in a `finally`, hence invisible to the rest of the application.
  fenetre.__injecter = (
    id: string, value: string, attributs: Record<string, unknown> = {}, ilYaMs = 0,
  ) => {
    const vrai = Date.now;
    if (ilYaMs > 0) Date.now = () => vrai.call(Date) - ilYaMs;
    try {
      s.etat.appliquer({ entity_id: id, state: value, attributes: attributs });
    } finally {
      Date.now = vrai;
    }
  };
  // `evenements` does NOT arrive through an HA state (`Etat.appliquer`, above): the calendar goes
  // through a REST request (`chargerAgenda`), out of reach of `__injecter`. These injection
  // points, under the SAME test-mode URL guard (same write surface as `__injecter`, absent on the
  // three real tablets), give the render checker (in `outils/`) a deterministic way to
  // measure the WORST CASE without depending on the real state of the installation at the time
  // of the measurement.
  //
  // Batch 6: `__injecterRepas` stays, and that is essential. The meal now comes from an entity
  // attribute, so `__injecter` could technically set it — but the house's meal plan is EMPTY most
  // of the time, and a check that then measured a screen without a block would pass on empty. A
  // check that checks nothing is worse than no check. `null` EMPTIES the block, `undefined` hands
  // control back to `Etat`.
  fenetre.__injecterRepas = (
    next: NextMeal | null,
  ) => { s.repasInjecte = next; s.dessiner(); };
  // Batch 6: REPLACES `__injecterPlan`, which carried a meal plan from a third-party source. The
  // checker opens `#recette` on load (`page.goto(...#recette)`, without any touch): without this
  // point, `ouvrirRecette` would send `home_stock/recipe/get` to the real instance and measure
  // the recipe of the day — a height budget that changes from one run to the next without any
  // code having changed.
  //
  // This REPLACES the answer of both opening reads, without going through the websocket: the
  // `pages` are set as is (the checker carries its own HTML fixtures, measured and precious) and
  // so are the `ingredients`. `jetonRecette++` invalidates any real read still in flight —
  // otherwise it would resolve AFTER the injection and overwrite the injected data with the real
  // ones.
  fenetre.__injecterRecette = (
    r: { etiquette?: string; plat?: string; description?: string;
         ingredients?: LigneIngredient[] } | null,
  ) => {
    s.jetonRecette++;
    if (!r) { fermerRecette(s); s.dessiner(); return; }
    s.recetteUid = s.recetteUid ?? 'essai';
    s.mealEnCours = s.mealEnCours ?? 0;
    s.recetteEnCours = s.recetteEnCours ?? 0;
    s.etiquetteRecette = r.etiquette ?? s.etiquetteRecette;
    s.platRecette = r.plat ?? s.platRecette;
    if (r.description !== undefined) {
      // `decouperPages` and not `pagesDepuisEtapes`: the checker's fixtures are HTML
      // descriptions, measured and precious — the worst height case they carry (454 characters +
      // an image) is not rewritten for a switch of source, and this entry remains supported
      // precisely for that.
      s.pagesRecette = decouperPages(r.description);
      s.pageSourceIndex = s.pagesRecette.map((_, i) => i);
      s.pageRecette = 0;
    }
    if (r.ingredients) s.ingredients = r.ingredients;
    s.dessiner();
  };
  fenetre.__injecterEvenements = (evs: Evenement[]) => {
    s.evenements = evs; s.dessiner();
  };
  // Task 17: exactly the same reason for the maintenance tasks — `todo/item/list` is a websocket
  // command, not a state, hence out of reach of `__injecter`. Without this third point, the
  // checker would measure the fallback block on the house's REAL maintenance list at the time of
  // the check (3 tasks today, 0 tomorrow): a height budget that changes from one run to the next
  // without any code having changed, exactly the defect fixed at round 1 of task 10 bis for
  // `.synthese`.
  fenetre.__injecterTaches = (
    entite: string, items: { uid: string; texte: string }[],
  ) => { s.taches[entite] = items; s.dessiner(); };
}
