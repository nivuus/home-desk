/** The height budget of a screen: what its `.corps` column costs, how many controls fit under
 *  the central block, and the arrangement a block kind gets on a given screen. Moved out of
 *  `modes.ts` on 2026-10-24 (task 9 of the media card redesign), which was nearing 500 lines:
 *  `modes.ts` decides WHAT is shown, this module decides what that block can afford.
 *
 *  Pure functions over `contrat/budget.json`. Their Python twin is
 *  `custom_components/home_desk/budget.py` (the integration's form refuses an input on the
 *  strength of `verifierBudget`), and `contrat/cas-budget.json` is replayed by both suites. */
import { AGENCEMENT_DEFAUT } from './agencement';
import type { Zone } from './agencement';
import BUDGET from '../../contrat/budget.json';

export { BUDGET };

/** The kind of central block a screen bills: the fixed-size card of the stack (`carte`, 264 px),
 *  the tall empty-stack block (`haut`, 153 px, the car) or the default one (`defaut`, 84 px).
 *  The budget no longer knows display modes: only `carte` climbs the ladder. */
export type BudgetBlock = 'carte' | 'haut' | 'defaut';

/** What a screen shows under a given block: whether its Ambiance row is drawn, whether its synthèse
 *  is reduced to one line, and how many controls fit. Returned by `arrangement`. */
export type Arrangement = { rangeeAmbiance: boolean; syntheseReduite: boolean; commandes: number };

/** What the screen measures for `rangees` rows of controls, for a given block kind, ambiance row
 *  and zones. `.corps` is a FLEX COLUMN with a fixed gutter: its cost is the sum of its children
 *  plus one gutter between each pair, plus its vertical padding, the header band above it. ONE
 *  child is always there, the "Toute la maison" button — it lives outside the adjustable order
 *  (cf. `rendu/corps.ts`, where it is written after the `repeat` of the zones and pushed down by
 *  `margin-top: auto`). The others count only if `zones` asks for them: the central block ONE,
 *  the synthèse line ONE, the "Ambiance" row TWO (its label is a child in its own right), the
 *  control grid ONE.
 *
 *  2026-09-12, plan 2: extracted from the `cout` closure that lived in `combien` —
 *  `verifierBudget` reuses it without duplicating the sum. Two sums of the same budget would end
 *  up diverging, which is precisely what `contrat/budget.json` exists to prevent.
 *
 *  Final review of plan 2 (I4): `zones` arrived here because this function billed the four
 *  zones HARD-CODED. The default (`AGENCEMENT_DEFAUT.zones`) holds all four, so the sum is TERM
 *  FOR TERM the former one when nothing is passed (`tests/budget.test.ts`).
 *
 *  2026-10-24: `syntheseReduite` bills the one-line synthèse (`hauteurs.syntheseReduite`) instead
 *  of the two-line one, and a `carte` block bills the stack card (`hauteurs.blocCarte`). Both
 *  measured by `outils/mesurer-carte-media.mjs`. */
function coutEcran(bloc: BudgetBlock, rangeeAmbiance: boolean, rangees: number,
                   zones: Zone[] = AGENCEMENT_DEFAUT.zones,
                   syntheseReduite = false): number {
  const h = BUDGET.hauteurs;
  // One central block per screen, chosen by its kind, never "on top of": the stack card
  // (264 px), the tall block (`voiture`, 153 px), the default one (84 px).
  const hauteurBloc = bloc === 'carte' ? h.blocCarte : bloc === 'haut' ? h.blocHaut : h.blocDefaut;
  // "Toute la maison" is OUTSIDE the adjustable order: always there, always billed. The four
  // others cost only if the layout asks for them (final review of plan 2, I4).
  let enfants = 1;
  let somme = h.touteLaMaison;
  if (zones.includes('blocCentral')) {
    enfants += 1;
    somme += hauteurBloc;
  }
  if (zones.includes('synthese')) {
    enfants += 1;
    somme += syntheseReduite ? h.syntheseReduite : h.synthese;
  }
  if (rangeeAmbiance && zones.includes('ambiances')) {
    // The "Ambiance" label is a child in its own right of the flex column, not a title inside
    // the group: two children, hence two gutters.
    enfants += 2;
    somme += h.etiquetteAmbiance + h.rangeeAmbiance;
  }
  if (rangees > 0) {
    enfants += 1;
    // The rows live in ONE grid: their gutter is the grid's (10 px), not the column's (8 px) —
    // and there is none after the last one.
    somme += h.rangeeCommandes * rangees + h.gouttiereCommandes * (rangees - 1);
  }
  return h.bandeau + h.paddingCorps + somme + h.gouttiere * (enfants - 1);
}

/** How many controls the screen shows in the composition described by the arguments. NEVER
 *  RAISES: an untenable budget returns 0, and the screen then shows its other zones without a
 *  row of controls.
 *
 *  2026-09-12, plan 2: this function RAISED `BudgetIntenable` until then. Rendering calls it
 *  (through `ordreCommandes`): a misconfigured screen would have been a blank screen. The verdict
 *  moved to `verifierBudget`, which rendering never calls. Rendering degrades, input refuses.
 *
 *  THIS IS A COMPUTATION, NOT A TABLE (2026-09-12). The zone heights are MEASURED in a real
 *  browser at the reference viewport (`outils/mesurer-hauteurs.mjs`, `data-zone` attributes) and
 *  live under `hauteurs` in `contrat/budget.json`. `combien` adds up the `.corps` column as the
 *  layout engine does and keeps the largest composition that fits. The model was checked against
 *  the measurement before being written: for each block measured, the remainder it predicts is
 *  EXACTLY the remainder measured on screen.
 *
 *  NOT TO BE CONFUSED with the `mesures` key of the same file, the 2026-08-29 record, which counts
 *  a zone's cost GUTTER INCLUDED ("rangeeCommandes: 74 px = 64 + 10"). The `hauteurs` read here
 *  are NET costs, `coutEcran` adding the gutters — otherwise they would be counted twice.
 *
 *  Never a row cut in half: it is the whole row or nothing, or the grid becomes unbalanced. The
 *  pinned controls (`epingler`, `modes.ts`) take places counted here, they never add one. */
export function combien(
  bloc: BudgetBlock,
  rangeeAmbiance = true,
  hauteurUtile: number = BUDGET.hauteurUtileParDefaut,
  zones: Zone[] = AGENCEMENT_DEFAUT.zones,
  syntheseReduite = false,
): number {
  // Final review of plan 2 (I4): a screen that does not show the `commandes` zone shows NO
  // control — a question of composition, not of budget. The schema requires the zone
  // (`contains`, `contrat/ecran.schema.json`); this guard keeps `combien` honest if the data
  // comes in through another door anyway.
  if (!zones.includes('commandes')) return 0;
  // The ceiling of TWO rows is not one more number: it is what `commandesParDefaut` (4 places)
  // and `tuilesParRangee` (2 columns) already say.
  const rangeesMax = Math.floor(BUDGET.commandesParDefaut / BUDGET.tuilesParRangee);
  for (let rangees = rangeesMax; rangees >= 1; rangees--) {
    if (coutEcran(bloc, rangeeAmbiance, rangees, zones, syntheseReduite) <= hauteurUtile) {
      return rangees * BUDGET.tuilesParRangee;
    }
  }
  return 0;
}

/** The rungs of the ladder, in the owner's order (spec 2026-10-23, "Place à l'écran", decided
 *  on 2026-10-24): the full composition, then the reduced synthèse, then the reduced synthèse
 *  without the Ambiance row. A screen without an Ambiance row has its last two rungs equal. */
function echelons(rangeeAmbiance: boolean): Omit<Arrangement, 'commandes'>[] {
  return [
    { rangeeAmbiance, syntheseReduite: false },
    { rangeeAmbiance, syntheseReduite: true },
    { rangeeAmbiance: false, syntheseReduite: true },
  ];
}

const parEchelle = (bloc: BudgetBlock): boolean => bloc === 'carte';

/** What the screen shows under a `bloc`: the first rung of the ladder whose `combien` reaches
 *  `commandesSousBlocHaut`, or the last rung if none does. Only `carte` climbs it — the card is
 *  the one block that needs more room than the screen has; the empty-stack blocks get their full
 *  composition.
 *
 *  THE BUDGET DECIDES, never a list of rooms: a screen with the room keeps its Ambiance row
 *  (`contrat/cas-budget.json` has a 687 px case that does). On the three Fire 7 screens, measured
 *  on 2026-10-24: the living room (no Ambiance row) gets the reduced synthèse and two controls;
 *  the office and the kitchen lose their Ambiance row too and keep two controls (582 px). */
export function arrangement(
  bloc: BudgetBlock,
  rangeeAmbiance = true,
  hauteurUtile: number = BUDGET.hauteurUtileParDefaut,
  zones: Zone[] = AGENCEMENT_DEFAUT.zones,
): Arrangement {
  const rungs = parEchelle(bloc) ? echelons(rangeeAmbiance) : echelons(rangeeAmbiance).slice(0, 1);
  const chiffres = rungs.map((r): Arrangement => ({
    ...r, commandes: combien(bloc, r.rangeeAmbiance, hauteurUtile, zones, r.syntheseReduite),
  }));
  return chiffres.find((a) => a.commandes >= BUDGET.commandesSousBlocHaut)
    ?? chiffres[chiffres.length - 1];
}

/** By how many pixels this composition overflows; 0 if it fits. Written for the form of the
 *  Home Assistant integration (plan 3), which must be able to say "this screen overflows by
 *  45 px" WHILE IT IS BEING FILLED IN — not in front of the tablet. Rendering never calls it.
 *
 *  It always counts ZERO rows of controls: the smallest composition the screen can render, hence
 *  the question "does it fit, even empty?". Since 2026-10-24 that smallest composition, for a
 *  `carte`, is the LAST rung of the ladder (reduced synthèse, no Ambiance row):
 *  the screen draws it whenever nothing else fits, so the form must not refuse a screen that the
 *  ladder makes hold — nor accept one that overflows even there.
 *
 *  EVERY BLOCK KIND IS BILLED: `verifierBudget('carte', true, 585)` gives 0 (583 px on the last
 *  rung), `verifierBudget('carte', true, 500)` gives the real overflow of that rung.
 *
 *  `zones` is OPTIONAL and defaults to the four zones of the default layout (final review of
 *  plan 2, I4): a zone the layout does not show does not cost its height. */
export function verifierBudget(bloc: BudgetBlock, rangeeAmbiance: boolean,
                               hauteurUtile: number,
                               zones: Zone[] = AGENCEMENT_DEFAUT.zones): number {
  const r = parEchelle(bloc) ? echelons(rangeeAmbiance)[2] : echelons(rangeeAmbiance)[0];
  return Math.max(0, coutEcran(bloc, r.rangeeAmbiance, 0, zones, r.syntheseReduite) - hauteurUtile);
}
