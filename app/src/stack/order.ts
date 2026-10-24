import type { ModePrincipal } from '../modes';
import type { Card, CardType } from './types';

/** Card types that are also a main mode; types absent here have no place in `agencement.modes`. */
export const MODE_OF: Partial<Record<CardType, ModePrincipal>> = {
  recette: 'recette',
  minuteur: 'minuteur',
  media: 'media',
  cinema: 'cinema',
  aspirateur: 'menage',
  aeration: 'aeration',
  voiture: 'voiture',
};

/** Stable sort by rank, then by the position of the card's mode in `modes`; no mode sorts last in its rank. */
export function orderStack(cards: Card[], modes: ModePrincipal[]): Card[] {
  const position = (card: Card): number => {
    const mode = MODE_OF[card.type];
    const index = mode === undefined ? -1 : modes.indexOf(mode);
    return index < 0 ? Number.POSITIVE_INFINITY : index;
  };
  return cards
    .map((card, i) => ({ card, i, pos: position(card) }))
    .sort((a, b) => a.card.rank - b.card.rank || (a.pos === b.pos ? 0 : a.pos < b.pos ? -1 : 1) || a.i - b.i)
    .map((x) => x.card);
}
