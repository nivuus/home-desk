/** The four full-screen sub-views, each entered through its hash: the whole house (`#maison`),
 *  the tasks (`#taches`), the timer setting (`#minuteur`) and the recipe (`#recette`). None of
 *  them has a header, a row of controls or a summary line. */
import { html } from 'lit';
import { rendreMaison } from '../rendu/maison';
import { rendreTaches } from '../rendu/taches';
import { rendreReglageMinuteur } from '../rendu/minuteur';
import { rendreVueRecette, reScinder, etendreIndexSource, type VueRecette } from '../rendu/recette';
import { aplatirTaches, repartirTaches } from '../cochage';
import { renderPantry } from '../rendu/pantry-lists';
import type { Frame } from './frame';
import type { ScreenState } from './state';

/** Paints the sub-view designated by the hash, if any, and says whether it did — `false` hands
 *  over to the home view. */
export function paintSubView(s: ScreenState, f: Frame): boolean {
  // Task 9, correction round 1: the whole-house view receives `horsLigne` too (a signal, see
  // `rendu/maison.ts`); refusing the actions themselves is independent of this render, set once
  // only in `createPress` (`estHorsLigne`, `boot/wiring.ts`).
  if (location.hash === '#maison') {
    s.moteur.peindre(html`${rendreMaison(s.etat, s.piece, s.horsLigne)}`);
    return true;
  }
  // Task 18: tasks view — `aplatirTaches`/`repartirTaches` (`cochage.ts`) turn the raw cache
  // (`taches`, fed by `chargerTaches`) into lines ready to render, excluding those already checked
  // off locally (`cochage.estMasquee`, optimistic removal) and reserving the last line for a
  // summary if everything does not fit in the budget of the view.
  if (location.hash === '#taches') {
    const plates = aplatirTaches(s.taches, s.roomLists, s.cochage.estMasquee);
    const { visibles, reste } = repartirTaches(plates);
    s.moteur.peindre(html`${rendreTaches(visibles, reste, s.cochage.estArmee, s.horsLigne)}`);
    return true;
  }
  // Task 10 bis: third full-screen sub-view, exactly on the same level as the two above.
  // `dureeMinuteur`/`etiquetteMinuteur` remain the same page-local values as before that task;
  // only their ENTRANCE DOOR (`location.hash` rather than a local boolean) changed, see
  // `brancherMinuteurs` (`boot/controls.ts`).
  if (location.hash === '#minuteur') {
    s.moteur.peindre(html`${rendreReglageMinuteur(s.dureeMinuteur, s.etiquetteMinuteur,
                                          s.piece.etiquettesMinuteur ?? [])}`);
    return true;
  }
  // "Recipe" batch (2026-08-17): fourth and last sub-view, on the same level as the three above.
  // `recetteUid !== null` on top of the hash: a leftover `#recette` (earlier navigation, meal gone
  // from the plan) must not render an empty frame — the screen then falls back on the home view,
  // exactly as if the hash had not been set.
  //
  // The label and the dish are taken from the next meal only if it is INDEED the recipe in
  // progress: during cooking, the plan may have switched to the following meal (grace margin
  // exceeded), and writing "Breakfast · 7:30" above the steps of the dinner would be a lie. The
  // countdowns of the buttons come from HA (`vuesMinuteurs`), never from a local countdown — see
  // `VueRecette.minuteurs` (`rendu/recette.ts`).
  if (location.hash === '#recette' && s.recetteUid !== null) {
    // Built ONCE: `reScinder` needs the same `minuteurs`/`slotLibre` as the render it has just
    // painted (`ContexteMinuteurs`, `rendu/recette.ts`) — never a second copy that could diverge
    // from what is actually displayed.
    //
    // The label and the dish are those taken WHEN OPENING, never re-read from the sensor: during
    // cooking, `sensor.home_stock_next_meal` may switch to the following meal, and writing
    // "Tomorrow, breakfast" above the steps of the dinner in progress would be a lie.
    const vueRecette: VueRecette = {
      etiquette: s.etiquetteRecette || 'Recette',
      plat: s.platRecette,
      pages: s.pagesRecette,
      page: s.pageRecette,
      minuteurs: f.vuesMinuteurs.map((v) => ({ nom: v.nom, restantS: v.restantS, actif: v.actif })),
      slotLibre: f.slotLibre,
      ingredients: s.ingredients,
      panneauOuvert: s.panneauIngredients,
      pageIngredients: s.pageIngredients,
      horsLigne: s.horsLigne,
      armee: (cle: string) => s.armementRepas.estArmee(cle),
      ...(s.messageRecette ? { message: s.messageRecette } : {}),
    };
    s.moteur.peindre(html`${rendreVueRecette(vueRecette)}`);
    // Sub-splitting: measured on the painted DOM, never estimated. `reScinder` returns `null` when
    // the page fits — otherwise every painting would trigger another. ALWAYS starts again from the
    // SOURCE (see its docstring): the recomposed pages still carry their timer tags, alive on the
    // next render.
    const recalculees = reScinder(s.racine, s.pagesRecette, s.pageRecette, vueRecette);
    if (recalculees) {
      // `pageSourceIndex` follows the same recomposition as `pagesRecette` (`etendreIndexSource`,
      // `rendu/recette.ts`): `memoriserRecette` depends on it, see its docstring.
      s.pageSourceIndex = etendreIndexSource(
        s.pageSourceIndex, s.pageRecette, s.pagesRecette.length, recalculees.length);
      s.pagesRecette = recalculees;
      s.dessiner();
    }
    return true;
  }
  // The pantry (spec 2026-09-28): fifth sub-view, entered through its hash like the others.
  if (location.hash === '#garde-manger') {
    s.moteur.peindre(html`${renderPantry({
      state: s.pantry, horsLigne: s.horsLigne, today: localDay(s.d.maintenant()),
      armed: (reason) => s.armementStock.estArmee(reason),
    })}`);
    return true;
  }
  return false;
}

/** `YYYY-MM-DD` of the tablet's own day: a best-before date is a calendar day, compared as is. */
function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
