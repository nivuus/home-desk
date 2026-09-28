/** The recipe in progress (batch 6, "recipe" batch of 2026-08-17): opening it from the next meal,
 *  loading its steps and decrement plan, persisting the step being read, restoring it after the
 *  app was killed, and validating the meal. Every function works on the shared `ScreenState`;
 *  none of them renders — they end with `s.dessiner()` when the screen must change. */
import { nextMeal, type NextMeal } from '../garde-manger';
import { pagesDepuisEtapes, type EtapeRecette } from '../recette';
import type { LigneIngredient } from '../rendu/recette';
import { writeRecipeProgress, clearRecipeProgress, readRecipeProgress } from '../recette-en-cours';
import type { ScreenState } from './state';

/** The next meal as the screen must show it NOW. PURE (`nextMeal` receives `Etat` and the clock),
 *  hence callable at will at no cost. */
export function currentMeal(s: ScreenState): NextMeal | undefined {
  if (s.repasInjecte !== undefined) return s.repasInjecte ?? undefined;
  return nextMeal(s.etat, s.d.maintenant());
}

/** The message of a server refusal, as the component wrote it (`messages.py` already translates
 *  into French). Generic fallback if the answer carries nothing readable: never an empty message,
 *  which would leave the screen silent about a gesture that did not happen. */
function messageDeRefus(e: unknown): string {
  const m = (e as { message?: unknown })?.message;
  return typeof m === 'string' && m.trim() !== '' ? m : 'La validation a été refusée.';
}

/** The two reads of opening a recipe, ONE-OFF — never periodic, that is the lesson the former
 *  source cost three months. Never throw: `envoyerCommande` rejects on a dead connection, and a
 *  `#recette` that cannot open must render the home view, not break the screen. */
async function commande(s: ScreenState, payload: Record<string, unknown>): Promise<unknown | undefined> {
  try {
    return await s.cx.envoyerCommande(payload);
  } catch {
    return undefined;
  }
}

/** The lines of the decrement plan, as the panel READS them. `lines` (what will be decremented)
 *  then `by_hand` (what the component cannot quantify — to be taken out of the cupboard by hand):
 *  both get cooked, both are displayed, in that order.
 *
 *  `status === 'short'` and not `preview.blocking`: `blocking` is a list of REASONS (`["short"]`),
 *  not of ingredients — it says something is missing, never what. The "missing" mention is
 *  therefore set on the line that carries it. */
function lignesDuPlan(preview: unknown): LigneIngredient[] {
  const p = (preview ?? {}) as { lines?: unknown; by_hand?: unknown };
  const brutes = [...(Array.isArray(p.lines) ? p.lines : []),
                  ...(Array.isArray(p.by_hand) ? p.by_hand : [])];
  return brutes.map((l) => {
    const o = (l ?? {}) as Record<string, unknown>;
    return {
      nom: String(o.product_name ?? o.raw_text ?? 'Ingrédient'),
      quantite: String(o.label ?? ''),
      manque: o.status === 'short',
    };
  });
}

/** Loads a recipe and its decrement plan, then fills the view. TWO commands, once per opening —
 *  `home_stock/meal/preview` WRITES ABSOLUTELY NOTHING (it runs on a read-only connection), which
 *  is what allows calling it on opening rather than on arming.
 *
 *  `meal/preview` is only requested if the meal carries a `meal_id`: a component older than this
 *  bundle does not publish one, and the recipe then remains readable — just not validatable. */
async function chargerRecette(s: ScreenState, recetteId: number, mealId: number | null): Promise<void> {
  const mien = ++s.jetonRecette;
  const vue = await commande(s, { type: 'home_stock/recipe/get', recipe_id: recetteId });
  if (mien !== s.jetonRecette) return;
  const v = (vue ?? {}) as { recipe?: { name?: unknown }; steps?: EtapeRecette[] };
  if (typeof v.recipe?.name === 'string') s.platRecette = v.recipe.name;
  s.pagesRecette = pagesDepuisEtapes(v.steps as EtapeRecette[]);
  s.pageSourceIndex = s.pagesRecette.map((_, i) => i);   // identity: nothing has been sub-split yet
  const memoire = readRecipeProgress(s.d.stockage, s.d.maintenant().getTime());
  s.pageRecette = memoire?.uid === s.recetteUid ? bornerEtape(s, memoire.page) : 0;
  s.dessiner();
  if (mealId === null) return;
  const preview = await commande(s, { type: 'home_stock/meal/preview', meal_id: mealId });
  if (mien !== s.jetonRecette) return;
  s.ingredients = lignesDuPlan(preview);
  s.dessiner();
}

/** Clamps a step index to the pages actually split. An empty description yields ZERO pages
 *  (`decouperPages`): without this floor at 0, `pagesRecette.length - 1` would be -1 and the
 *  screen would show "Step 0/1". */
function bornerEtape(s: ScreenState, n: number): number {
  return Math.max(0, Math.min(n, s.pagesRecette.length - 1));
}

/** Opens the recipe of the next meal. Called by the `hashchange` listener (the home block and the
 *  recipe tile only set `#recette`, see `rendu/defaut.ts`/`interaction.ts`) — never from a render.
 *
 *  IDEMPOTENT while a recipe is in progress: reopening a COLLAPSED recipe must find its step
 *  again, that is the whole difference between collapsing and "Terminer". Without this refusal,
 *  every return to the view would start again from the first page.
 *
 *  A NOTE (such as "leftover quinoa and vegetables") or a mere product has no recipe: nothing to open, the view is
 *  not entered — the block is inert anyway and the tile hidden in that case. */
export function ouvrirRecette(s: ScreenState): void {
  if (s.recetteUid !== null) return;
  const r = currentMeal(s);
  if (!r || r.recetteId === null) return;
  // The PERSISTENCE key is the `meal_id` when there is one: it identifies THAT meal, not the
  // recipe (the same recipe can be planned twice in the same week). Without a `meal_id`
  // (component older than this bundle), the recipe is used instead: resuming stays possible,
  // validating does not — and the screen says so by not opening `meal/preview`.
  s.recetteUid = r.mealId !== null ? String(r.mealId) : `recette:${r.recetteId}`;
  s.mealEnCours = r.mealId;
  s.recetteEnCours = r.recetteId;
  s.platRecette = r.plat;
  s.etiquetteRecette = r.etiquette;
  s.pagesRecette = [];
  s.pageSourceIndex = [];
  s.pageRecette = 0;
  s.ingredients = undefined;
  s.panneauIngredients = false;
  s.pageIngredients = 0;
  s.messageRecette = null;
  void chargerRecette(s, r.recetteId, r.mealId);
}

/** Writes the current step outside the page. Android regularly kills Fully on these Fire 7:
 *  without this, losing the app in the middle of cooking would cost the step.
 *
 *  Persists the SOURCE index (`pageSourceIndex[pageRecette]`), never the raw `pageRecette`:
 *  `pageRecette` indexes `pagesRecette`, which can be finer than the source pages since
 *  `reScinder` sub-splits — on restart, `ouvrirRecette`/`restaurerRecette` ALWAYS rebuild the
 *  coarse source pages (never a sub-split that depends on a DOM measurement absent from storage).
 *  Persisting the fine index would resume on the wrong step as soon as a sub-split happened
 *  before the write. */
export function memoriserRecette(s: ScreenState): void {
  if (s.recetteUid === null) return;
  const pageSource = s.pageSourceIndex[s.pageRecette] ?? s.pageRecette;
  writeRecipeProgress(s.d.stockage, { uid: s.recetteUid, page: pageSource, majLe: s.d.maintenant().getTime() });
}

/** Forgets the recipe in progress — "Terminer", or a meal that disappeared from the plan. Does NOT
 *  touch the hash: the caller decides where the screen goes next. */
export function fermerRecette(s: ScreenState): void {
  s.recetteUid = null;
  s.mealEnCours = null;
  s.recetteEnCours = null;
  s.platRecette = '';
  s.etiquetteRecette = '';
  s.pagesRecette = [];
  s.pageRecette = 0;
  s.pageSourceIndex = [];
  s.ingredients = undefined;
  s.panneauIngredients = false;
  s.pageIngredients = 0;
  s.messageRecette = null;
  s.jetonRecette++;   // any read still in flight loses its turn: it speaks of a closed recipe
  clearRecipeProgress(s.d.stockage);
}

/** Resumes the recipe left in progress by the previous instance of the app (tablet restart, or
 *  Fully killed by Android). ONCE only, and only if the remembered meal is indeed the one the
 *  sensor announces today: a stale state (more than 4 h) is already discarded by
 *  `readRecipeProgress` itself.
 *
 *  A still silent sensor does NOT CONSUME the attempt: at start-up, the entities take about 70 s
 *  to come back after a Home Assistant restart, and losing the resume for that would mean losing
 *  a cooking in progress. */
export function restaurerRecette(s: ScreenState): void {
  if (s.recetteRestauree || s.recetteUid !== null) return;
  const r = currentMeal(s);
  if (!r) return;                       // silent sensor: try again on the next state
  s.recetteRestauree = true;
  if (r.recetteId === null) return;
  const memoire = readRecipeProgress(s.d.stockage, s.d.maintenant().getTime());
  const cle = r.mealId !== null ? String(r.mealId) : `recette:${r.recetteId}`;
  if (memoire?.uid !== cle) return;     // the remembered meal is no longer today's
  ouvrirRecette(s);                     // `chargerRecette` re-reads the step from storage
}

/** "Terminer": two presses, then `home_stock/meal/validate`.
 *
 *  IRREVERSIBLE from the wall — the component says so itself ("Cook, then eat. Not reversible at
 *  lot 3, and the screen says so"); `meal/correct` has existed since batch 4, but in the journal
 *  of the PANEL, not here. Hence the arming, and hence the label that says what it does rather
 *  than a generic "touch to confirm" (`rendu/recette.ts`).
 *
 *  THREE DEFENCES, all already written elsewhere: `meal/preview` returned the plan on opening
 *  WITHOUT WRITING ANYTHING (the panel shows it); `envoyerCommande` returns a promise, so a
 *  refusal (`InsufficientStock`) is translated into French by the component and DISPLAYABLE; and
 *  the `horsLigne` guard applies as to any other write.
 *
 *  OFFLINE: refused VISIBLY (the button is greyed out, see `rendu/recette.ts`), never queued. The
 *  panel has a queue because one scans in a shop without network; a wall tablet is three metres
 *  from the router, WHICH IS the HA server. Replaying a meal validation an hour later, without a
 *  witness, would decrement a stock blindly.
 *
 *  `portions_eaten: 1`: the default value of the panel (`validation.ts`). The wall has no portion
 *  selector — and it will not have one: a gesture that asks for a choice lives in the panel, and
 *  only there.
 *
 *  Without a `meal_id` (component older than this bundle), there is nothing to validate: the view
 *  is closed as "Terminer" did before this batch, rather than sending a command that would be
 *  refused. */
export async function validerRepas(s: ScreenState): Promise<void> {
  if (s.horsLigne) return;
  if (s.mealEnCours === null) { fermerRecette(s); location.hash = ''; s.dessiner(); return; }
  if (!s.armementRepas.estArmee('terminer')) {
    s.armementRepas.armer('terminer', s.dessiner);
    s.dessiner();
    return;
  }
  s.armementRepas.desarmer();
  const mealId = s.mealEnCours;
  try {
    await s.cx.envoyerCommande({
      type: 'home_stock/meal/validate', meal_id: mealId, portions_eaten: 1,
      // Every write command of `home_stock` accepts an idempotency key — not because the tablet
      // has a queue (it has none), but because a websocket reconnection can cast doubt on a send.
      idempotency_key: `mur-${mealId}-${s.d.maintenant().getTime()}`,
    });
  } catch (e) {
    // A refusal erases NOTHING from the screen: the steps stay, the recipe stays open, and the
    // component's French message is shown in place of the label.
    s.messageRecette = messageDeRefus(e);
    s.dessiner();
    return;
  }
  fermerRecette(s);
  location.hash = '';
  s.dessiner();
}
