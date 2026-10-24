import { describe, expect, it } from 'vitest';
import { AGENCEMENT_DEFAUT } from '../src/agencement';
import { orderStack } from '../src/stack/order';
import type { Card, CardType, Rank } from '../src/stack/types';

const c = (type: CardType, rank: Rank): Card => ({ key: `${type}:x`, type, rank });

describe('orderStack', () => {
  it('ranks first, then agencement.modes, unknown types last in their rank', () => {
    const out = orderStack([c('imprimante', 4), c('aspirateur', 4), c('media', 3), c('minuteur', 1)],
      ['alerte', 'recette', 'minuteur', 'menage', 'media', 'defaut']);
    expect(out.map((x) => x.type)).toEqual(['minuteur', 'media', 'aspirateur', 'imprimante']);
  });
  it('recipe before timer', () => {
    expect(orderStack([c('minuteur', 1), c('recette', 0)], AGENCEMENT_DEFAUT.modes)[0].type).toBe('recette');
  });
  it('is stable for equal rank and mode position, and does not mutate its input', () => {
    const input = [{ ...c('imprimante', 4), key: 'imprimante:a' }, { ...c('animaux', 4), key: 'animaux:b' }];
    const copy = [...input];
    expect(orderStack(input, AGENCEMENT_DEFAUT.modes).map((x) => x.key)).toEqual(['imprimante:a', 'animaux:b']);
    expect(input).toEqual(copy);
  });
});
