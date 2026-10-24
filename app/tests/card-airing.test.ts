// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/airing';
import type { ContexteModes } from '../src/modes';
import { etatWith, frameWith, pieceWith, screenWith, T0 } from './card-aides';
import { CALME } from './contextes';

const A = 'binary_sensor.window_a';
const B = 'binary_sensor.window_b';
const AIRING: ContexteModes = { ...CALME, ouvrantOuvertDepuisMs: 25 * 60_000, chauffageEnMarche: true };

/** `a` opened 25 min before T0, `b` 12 min before (both still open unless said otherwise). */
function airing(ctx: ContexteModes, bState = 'on') {
  vi.useFakeTimers();
  vi.setSystemTime(T0 - 25 * 60_000);
  const etat = etatWith({ [A]: ['on', { friendly_name: 'Window A (K) Ouverture' }] });
  vi.setSystemTime(T0 - 12 * 60_000);
  etat.appliquer({ entity_id: B, state: bState, attributes: { friendly_name: 'Window B' } });
  vi.useRealTimers();
  return [frameWith({ ctx }), screenWith({ etat, piece: pieceWith({ ouvrants: [B, A] }) })] as const;
}

afterEach(() => { vi.useRealTimers(); });

describe('airing card — detect', () => {
  it('the airing condition gives one rank-2 card, keyed by the opening open longest', () => {
    expect(detect(...airing(AIRING))).toEqual([{ key: `aeration:${A}`, type: 'aeration', rank: 2 }]);
  });
  it('no heating and no rain: no card, however long the window is open', () => {
    expect(detect(...airing({ ...AIRING, chauffageEnMarche: false }))).toEqual([]);
  });
});

describe('airing card — frame', () => {
  it('names every open opening, says since when, neutral, never the error red', () => {
    const [f, s] = airing(AIRING);
    const fr = frame(detect(f, s)[0], f, s);
    expect(fr.title).toContain('Window A');
    expect(fr.title).toContain('Window B');
    expect(fr.title).not.toContain('Ouverture');
    expect(fr.background).toEqual({ kind: 'solid', token: 'neutral' });
    const hote = document.createElement('div');
    render(fr.middle, hote);
    expect(hote.textContent).toContain(
      new Intl.NumberFormat(undefined, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(25));
  });

  it('no button until "later" exists (task 7): three empty slots, never a dead one', () => {
    const [f, s] = airing(AIRING);
    expect(frame(detect(f, s)[0], f, s).buttons).toEqual([undefined, undefined, undefined]);
  });
});
