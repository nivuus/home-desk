import { describe, expect, it } from 'vitest';
import { RETURN_MS, followStack, touchStack } from '../src/stack/follow';
import type { Card, CardType, Rank, StackView } from '../src/stack/types';

const c = (type: CardType, rank: Rank): Card => ({ key: `${type}:x`, type, rank });
const v0: StackView = { displayedKey: null, lastTouchMs: null, known: [] };

describe('followStack', () => {
  it('displays the head when nothing was displayed yet', () => {
    const v = followStack(v0, [c('minuteur', 1), c('media', 3)], 0);
    expect(v.displayedKey).toBe('minuteur:x');
    expect(v.known).toEqual(['minuteur:x', 'media:x']);
  });
  it('a higher card that appears takes the place', () => {
    const a = followStack(v0, [c('media', 3)], 0);
    const b = followStack(touchStack(a, 'media:x', 0), [c('minuteur', 1), c('media', 3)], 1_000);
    expect(b.displayedKey).toBe('minuteur:x');
  });
  it('a lower card that appears does not take the place', () => {
    const a = followStack(v0, [c('minuteur', 1)], 0);
    expect(followStack(a, [c('minuteur', 1), c('media', 3)], 10).displayedKey).toBe('minuteur:x');
  });
  it('a card already there never comes back on its own before the minute', () => {
    let v = followStack(v0, [c('minuteur', 1), c('media', 3)], 0);
    v = touchStack(v, 'media:x', 0);
    expect(followStack(v, [c('minuteur', 1), c('media', 3)], RETURN_MS - 1).displayedKey).toBe('media:x');
    const back = followStack(v, [c('minuteur', 1), c('media', 3)], RETURN_MS);
    expect(back.displayedKey).toBe('minuteur:x');
    expect(back.lastTouchMs).toBeNull();
  });
  it('keeps an untouched displayed card unless a higher one appears', () => {
    const v = { displayedKey: 'media:x', lastTouchMs: null, known: ['minuteur:x', 'media:x'] };
    expect(followStack(v, [c('minuteur', 1), c('media', 3)], 999_999).displayedKey).toBe('media:x');
  });
  it('displayed card vanishing falls back to head', () => {
    const v = touchStack(followStack(v0, [c('minuteur', 1), c('aspirateur', 4)], 0), 'aspirateur:x', 0);
    expect(followStack(v, [c('minuteur', 1)], 10).displayedKey).toBe('minuteur:x');
  });
  it('empty stack displays nothing', () => {
    expect(followStack(v0, [], 0).displayedKey).toBeNull();
  });
});

describe('touchStack', () => {
  it('records the choice and the time', () => {
    const v = touchStack(v0, 'media:x', 5);
    expect(v).toEqual({ displayedKey: 'media:x', lastTouchMs: 5, known: [] });
  });
});
