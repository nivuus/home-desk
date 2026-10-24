/** What the kitchen cards (meal, pantry) read from the screen alike: which home-stock views it
 *  declares, and the shopping button its tasks view makes possible. */
import type { ScreenState } from '../boot/state';
import { LISTE_COURSES } from '../garde-manger';
import type { CardButton } from '../rendu/card-frame';
import { S } from './strings';

/** Does the screen open the home-stock view `view` (`#recette`, `#garde-manger`) from a command? */
export const declaresView = (s: ScreenState, view: string): boolean => s.piece.commandes.some((c) => c.vue === view);

/** The shopping button, when the screen lists the shopping list in its tasks view. */
export function shoppingButton(s: ScreenState): CardButton | undefined {
  if (!(s.piece.listesTachesExtra ?? []).includes(LISTE_COURSES)) return undefined;
  return { icon: 'list', label: S.shopping, act: () => { location.hash = '#taches'; } };
}
