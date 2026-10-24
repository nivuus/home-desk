import { describe, it, expect, vi, afterEach } from 'vitest';
import { createToneCache, type Sampler, type PosterImage } from '../src/rendu/poster-sampler';

const ORIGIN = 'http://tablet.local';
const URL_A = '/api/vignette?url=a';
const CARD = { w: 311, h: 260, boxes: [{ x: 16, y: 12, w: 80, h: 15 }] };

/** A flat poster: drawn at any card size, synchronously, like the decoded browser image. */
function flatPoster(): PosterImage {
  return {
    quantPixels: new Array(64 * 64).fill(0xff283c5a),
    draw: (w, h) => {
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 40; rgba[i + 1] = 60; rgba[i + 2] = 90; rgba[i + 3] = 255; }
      return { rgba, width: w };
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { vi.restoreAllMocks(); });

describe('tone cache', () => {
  // `tonesToPaint` (`boot/media-tones.ts`) asks on every paint: a load still running must not be
  // started a second time.
  it('repeated calls for one poster while it loads start one load', () => {
    const sampler = vi.fn<Sampler>(() => new Promise(() => {}));
    const cache = createToneCache(sampler, () => ORIGIN);
    expect(cache.tonesFor(URL_A, CARD).status).toBe('pending');
    expect(cache.tonesFor(URL_A, CARD).status).toBe('pending');
    expect(cache.tonesFor(URL_A, { ...CARD, boxes: [] }).status).toBe('pending');
    expect(sampler).toHaveBeenCalledTimes(1);
    cache.tonesFor('/api/vignette?url=b', CARD);   // another poster: a new load
    expect(sampler).toHaveBeenCalledTimes(2);
  });

  // Final review, Important #1: a box that changes size on the SAME poster (volume 5 -> 10 %,
  // elapsed 9:59 -> 10:00, a new track sharing the art with a longer title) used to miss the
  // cache and paint the card without its poster until the new tones were computed.
  it('same poster, other boxes or card height: ready at once, never pending again', async () => {
    const sampler = vi.fn<Sampler>(async () => flatPoster());
    const cache = createToneCache(sampler, () => ORIGIN);
    const ready = vi.fn();
    cache.onTonesReady(ready);
    expect(cache.tonesFor(URL_A, CARD).status).toBe('pending');
    await settle();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(cache.tonesFor(URL_A, CARD).status).toBe('ready');
    expect(cache.tonesFor(URL_A, { ...CARD, boxes: [{ x: 16, y: 12, w: 96, h: 15 }] }).status).toBe('ready');
    expect(cache.tonesFor(URL_A, { ...CARD, h: 279, boxes: [{ x: 16, y: 12, w: 279, h: 38 }] }).status)
      .toBe('ready');
    expect(sampler).toHaveBeenCalledTimes(1);
  });

  it('an unexpected sampler error is recorded as failed, logged, and not retried', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sampler = vi.fn<Sampler>(async () => { throw new TypeError('boom'); });
    const cache = createToneCache(sampler, () => ORIGIN);
    const ready = vi.fn();
    cache.onTonesReady(ready);
    cache.tonesFor(URL_A, CARD);
    await settle();
    expect(cache.tonesFor(URL_A, CARD).status).toBe('failed');
    expect(error).toHaveBeenCalledWith(expect.stringContaining(URL_A), expect.any(TypeError));
    expect(ready).toHaveBeenCalledTimes(1);   // the card repaints without the poster
    cache.tonesFor(URL_A, CARD);
    expect(sampler).toHaveBeenCalledTimes(1);
  });

  it('a drawing error on a poster already read is recorded as failed and logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const poster = { ...flatPoster(), draw: () => { throw new Error('2d canvas context unavailable'); } };
    const cache = createToneCache(async () => poster, () => ORIGIN);
    cache.tonesFor(URL_A, CARD);
    await settle();
    expect(cache.tonesFor(URL_A, CARD).status).toBe('failed');
    expect(cache.tonesFor(URL_A, CARD).status).toBe('failed');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('an unreadable poster stays unreadable', async () => {
    const cache = createToneCache(vi.fn<Sampler>(), () => ORIGIN);
    cache.tonesFor('http://example.com/p.jpg', CARD);
    await settle();
    expect(cache.tonesFor('http://example.com/p.jpg', CARD).status).toBe('unreadable');
  });
});
