import { describe, it, expect, vi } from 'vitest';
import {
  coverCrop, clampBox, isSameOrigin, cacheKey, computeTones, PosterLoadError, type PosterSample, type Sampler,
} from '../src/rendu/poster-sampler';

const ORIGIN = 'http://tablet.local';
const CARD = { w: 311, h: 260, boxes: [{ x: 16, y: 12, w: 279, h: 50 }] };

function flatSample(width: number, height: number): PosterSample {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 40; rgba[i + 1] = 60; rgba[i + 2] = 90; rgba[i + 3] = 255; }
  return { quantPixels: new Array(64 * 64).fill(0xff283c5a), rgba, width };
}

describe('coverCrop', () => {
  it('centres a portrait poster in a landscape card', () => {
    const c = coverCrop(400, 600, 311, 260);
    expect(c.sw).toBe(400);
    expect(c.sh).toBeCloseTo(400 * 260 / 311, 6);
    expect(c.sx).toBe(0);
    expect(c.sy).toBeCloseTo((600 - c.sh) / 2, 6);
  });
  it('centres a landscape poster in a portrait card', () => {
    const c = coverCrop(600, 400, 260, 311);
    expect(c.sh).toBe(400);
    expect(c.sw).toBeCloseTo(400 * 260 / 311, 6);
    expect(c.sy).toBe(0);
    expect(c.sx).toBeCloseTo((600 - c.sw) / 2, 6);
  });
});

describe('clampBox', () => {
  it('keeps a box inside the card untouched', () => {
    expect(clampBox({ x: 16, y: 12, w: 100, h: 50 }, 311, 260)).toEqual({ x: 16, y: 12, w: 100, h: 50 });
  });
  it('trims a box partly outside the card', () => {
    expect(clampBox({ x: 250, y: 240, w: 100, h: 50 }, 311, 260)).toEqual({ x: 250, y: 240, w: 61, h: 20 });
    expect(clampBox({ x: -10, y: -5, w: 30, h: 20 }, 311, 260)).toEqual({ x: 0, y: 0, w: 20, h: 15 });
  });
  it('drops a box fully outside the card', () => {
    expect(clampBox({ x: 400, y: 10, w: 20, h: 20 }, 311, 260)).toBeUndefined();
  });
});

describe('isSameOrigin', () => {
  it('accepts relative and same-origin URLs only', () => {
    expect(isSameOrigin('/api/vignette?w=400&url=x', ORIGIN)).toBe(true);
    expect(isSameOrigin(`${ORIGIN}/a.jpg`, ORIGIN)).toBe(true);
    expect(isSameOrigin('http://example.com/a.jpg', ORIGIN)).toBe(false);
  });
});

describe('cacheKey', () => {
  it('depends on url, card size and boxes', () => {
    const k = cacheKey('/a', CARD);
    expect(cacheKey('/a', { ...CARD })).toBe(k);
    expect(cacheKey('/b', CARD)).not.toBe(k);
    expect(cacheKey('/a', { ...CARD, w: 300 })).not.toBe(k);
    expect(cacheKey('/a', { ...CARD, boxes: [] })).not.toBe(k);
  });
});

describe('computeTones', () => {
  it('yields unreadable for an external URL without sampling', async () => {
    const sampler = vi.fn<Sampler>();
    expect(await computeTones('http://example.com/p.jpg', CARD, sampler, ORIGIN)).toEqual({ status: 'unreadable' });
    expect(sampler).not.toHaveBeenCalled();
  });
  it('yields ready tones for a readable sample', async () => {
    const r = await computeTones('/api/vignette?x', CARD, async () => flatSample(311, 260), ORIGIN);
    expect(r.status).toBe('ready');
  });
  it('treats a tainted canvas (SecurityError) as unreadable', async () => {
    const sampler: Sampler = async () => { throw new DOMException('tainted', 'SecurityError'); };
    expect(await computeTones('/api/vignette?x', CARD, sampler, ORIGIN)).toEqual({ status: 'unreadable' });
  });
  it('treats an image load error as unreadable', async () => {
    const sampler: Sampler = async () => { throw new PosterLoadError('/p'); };
    expect((await computeTones('/p', CARD, sampler, ORIGIN)).status).toBe('unreadable');
  });
  it('only SecurityError is treated as unreadable', async () => {
    const sampler: Sampler = async () => { throw new TypeError('boom'); };
    await expect(computeTones('/api/vignette?x', CARD, sampler, ORIGIN)).rejects.toThrow(TypeError);
  });
  it('clamps boxes to the card before computing tones', async () => {
    const card = { w: 311, h: 260, boxes: [{ x: 250, y: 240, w: 400, h: 400 }] };
    const r = await computeTones('/p', card, async () => flatSample(311, 260), ORIGIN);
    expect(r.status).toBe('ready');
    if (r.status === 'ready') expect(Number.isFinite(r.tones.worstContrast)).toBe(true);
  });
});
