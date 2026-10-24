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
function airing(ctx: ContexteModes, bState = 'on', aState = 'on') {
  vi.useFakeTimers();
  vi.setSystemTime(T0 - 25 * 60_000);
  const etat = etatWith({ [A]: [aState, { friendly_name: 'Window A (K) Ouverture' }] });
  vi.setSystemTime(T0 - 12 * 60_000);
  etat.appliquer({ entity_id: B, state: bState, attributes: { friendly_name: 'Window B' } });
  vi.useRealTimers();
  return [frameWith({ ctx }), screenWith({ etat, piece: pieceWith({ nom: 'Kitchen', ouvrants: [B, A] }) })] as const;
}

afterEach(() => { vi.useRealTimers(); });

describe('airing card — detect', () => {
  it('the airing condition gives one rank-2 card, keyed by the room', () => {
    expect(detect(...airing(AIRING))).toEqual([{ key: 'aeration:Kitchen', type: 'aeration', rank: 2 }]);
  });
  it('the key, which "later" snoozes, survives the first opening closing while another stays open', () => {
    const before = detect(...airing(AIRING))[0].key;
    expect(detect(...airing(AIRING, 'on', 'off'))[0].key).toBe(before);
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
    expect(fr.title).not.toContain('(K)');
    expect(fr.background).toEqual({ kind: 'solid', token: 'neutral' });
    const hote = document.createElement('div');
    render(fr.middle, hote);
    expect(hote.textContent).toContain(
      new Intl.NumberFormat(undefined, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(25));
  });

  it('only the bracketed room code leaves the name: no word is stripped, in any language', () => {
    const [f, s] = airing(AIRING, 'off');
    expect(frame(detect(f, s)[0], f, s).title).toBe('Window A Ouverture');
  });

  // Replaces `rendu-modes.test.ts` ("nomme l'ouvrant réellement ouvert"), gone with the airing
  // mode block in card-stack task 6.
  it('names only the openings really open, never a closed one', () => {
    const [f, s] = airing(AIRING, 'off');
    const fr = frame(detect(f, s)[0], f, s);
    expect(fr.title).toContain('Window A');
    expect(fr.title).not.toContain('Window B');
  });

  it('one button, "later", in the centre; the sides stay empty, never a dead one', () => {
    const [f, s] = airing(AIRING);
    const [left, centre, right] = frame(detect(f, s)[0], f, s).buttons;
    expect([left, centre?.icon, right]).toEqual([undefined, 'snooze', undefined]);
  });
});
