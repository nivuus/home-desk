// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tonesFor } from '../src/rendu/poster-sampler';

afterEach(() => { vi.unstubAllGlobals(); });

describe('tonesFor cache', () => {
  // `tonesToPaint` (`boot/media-tones.ts`) asks on every paint: a computation still running must
  // not be started a second time. The browser sampler loads the image synchronously from the
  // first call, so counting the images created counts the computations started.
  it('repeated calls with the same key while pending start one computation', () => {
    let images = 0;
    vi.stubGlobal('Image', class { constructor() { images++; } set src(_v: string) {} });
    const card = { w: 311, h: 260, boxes: [{ x: 16, y: 12, w: 80, h: 15 }] };
    expect(tonesFor('/api/vignette?url=cache', card).status).toBe('pending');
    expect(tonesFor('/api/vignette?url=cache', card).status).toBe('pending');
    expect(tonesFor('/api/vignette?url=cache', card).status).toBe('pending');
    expect(images).toBe(1);
    tonesFor('/api/vignette?url=cache', { ...card, w: 300 });   // another key: a new one
    expect(images).toBe(2);
  });
});
