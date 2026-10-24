// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SourceResolue } from '../src/media';
import type { ScreenState } from '../src/boot/state';

const tonesFor = vi.hoisted(() => vi.fn());
vi.mock('../src/rendu/poster-sampler', async (original) => ({
  ...(await original<typeof import('../src/rendu/poster-sampler')>()),
  tonesFor,
}));

const { tonesToPaint, measureCard } = await import('../src/boot/card-tones');
const { afterMediaPaint } = await import('../src/boot/media-tones');

const SOURCE = { nom: 'Musique', titre: 'Nude', affiche: '/api/vignette?url=a' } as SourceResolue;
const SPEC = { w: 311, h: 260, boxes: [{ x: 16, y: 12, w: 80, h: 15 }] };
const READY = { status: 'ready', tones: {} };

/** jsdom lays nothing out: give each element the offsets a browser would compute. */
function lay(el: HTMLElement, o: { l?: number; t?: number; w: number; h: number; parent: Element | null }) {
  Object.defineProperty(el, 'offsetLeft', { configurable: true, value: o.l ?? 0 });
  Object.defineProperty(el, 'offsetTop', { configurable: true, value: o.t ?? 0 });
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: o.w });
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: o.h });
  Object.defineProperty(el, 'offsetParent', { configurable: true, value: o.parent });
}

/** `.carte` 311 × 260 holding one tone box at (16, 12), 80 × 15. */
function card(boxParent?: 'card' | 'elsewhere'): HTMLElement {
  const c = document.createElement('div');
  c.className = 'carte media';
  const box = document.createElement('div');
  box.setAttribute('data-tone-box', '');
  c.appendChild(box);
  lay(c, { w: 311, h: 260, parent: document.body });
  lay(box, { l: 16, t: 12, w: 80, h: 15, parent: boxParent === 'elsewhere' ? null : c });
  return c;
}

function screen(c: HTMLElement | null) {
  const racine = document.createElement('div');
  if (c) racine.appendChild(c);
  const minuteurFn = vi.fn();
  const s = { racine, measuredCard: null, d: { minuteurFn }, dessiner: () => {} } as unknown as ScreenState;
  return { s, minuteurFn };
}

beforeEach(() => { tonesFor.mockReset(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('tonesToPaint', () => {
  it('pending, without asking, until the card was measured for this very poster', () => {
    expect(tonesToPaint(SOURCE, null).status).toBe('pending');
    expect(tonesToPaint(SOURCE, { url: '/api/vignette?url=other', spec: SPEC }).status).toBe('pending');
    expect(tonesToPaint({ ...SOURCE, affiche: undefined }, { url: SOURCE.affiche!, spec: SPEC }).status)
      .toBe('pending');
    expect(tonesFor).not.toHaveBeenCalled();
  });

  it('asks the sampler with the measured card for the same poster', () => {
    tonesFor.mockReturnValue(READY);
    expect(tonesToPaint(SOURCE, { url: SOURCE.affiche!, spec: SPEC })).toBe(READY);
    expect(tonesFor).toHaveBeenCalledWith(SOURCE.affiche, SPEC);
  });
});

describe('measureCard', () => {
  it('reads the size and the boxes relative to .carte', () => {
    expect(measureCard(card())).toEqual(SPEC);
  });

  it('zero size is not measured', () => {
    const c = card();
    lay(c, { w: 0, h: 0, parent: null });
    expect(measureCard(c)).toBeNull();
  });

  it('throws when a tone box is not laid out inside .carte', () => {
    expect(() => measureCard(card('elsewhere'))).toThrow(/tone box/);
  });
});

describe('afterMediaPaint', () => {
  it('a zero-size card asks nothing and forgets the measurement', () => {
    const c = card();
    lay(c, { w: 0, h: 0, parent: null });
    const { s } = screen(c);
    s.measuredCard = { url: SOURCE.affiche!, spec: SPEC };
    afterMediaPaint(s, SOURCE);
    expect(tonesFor).not.toHaveBeenCalled();
    expect(s.measuredCard).toBeNull();
  });

  it('a new measurement asks for the tones; a miss waits for onTonesReady', () => {
    tonesFor.mockReturnValue({ status: 'pending' });
    const { s, minuteurFn } = screen(card());
    afterMediaPaint(s, SOURCE);
    expect(s.measuredCard).toEqual({ url: SOURCE.affiche, spec: SPEC });
    expect(tonesFor).toHaveBeenCalledWith(SOURCE.affiche, SPEC);
    expect(minuteurFn).not.toHaveBeenCalled();
  });

  it('a cache hit schedules exactly one redraw', () => {
    tonesFor.mockReturnValue(READY);
    const { s, minuteurFn } = screen(card());
    afterMediaPaint(s, SOURCE);
    expect(minuteurFn).toHaveBeenCalledTimes(1);
    expect(minuteurFn).toHaveBeenCalledWith(s.dessiner, 0);
  });

  it('the same measurement again does nothing: no paint loop', () => {
    tonesFor.mockReturnValue(READY);
    const { s, minuteurFn } = screen(card());
    afterMediaPaint(s, SOURCE);
    afterMediaPaint(s, SOURCE);
    afterMediaPaint(s, SOURCE);
    expect(tonesFor).toHaveBeenCalledTimes(1);
    expect(minuteurFn).toHaveBeenCalledTimes(1);
  });

  it('a new poster on the same layout is measured again', () => {
    tonesFor.mockReturnValue({ status: 'pending' });
    const { s } = screen(card());
    afterMediaPaint(s, SOURCE);
    afterMediaPaint(s, { ...SOURCE, affiche: '/api/vignette?url=b' });
    expect(s.measuredCard!.url).toBe('/api/vignette?url=b');
    expect(tonesFor).toHaveBeenCalledTimes(2);
  });
});
