import { describe, it, expect } from 'vitest';
import { argbFromRgb } from '@material/material-color-utilities';
import { cardTones, contrastRatio, relativeLuminance, type Box } from '../src/tones';

const W = 311;
const H = 260;
const BOXES: Box[] = [
  { x: 16, y: 12, w: 279, h: 50 },
  { x: 16, y: 72, w: 279, h: 28 },
];

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

function render(paint: (x: number, y: number) => string): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = hex(paint(x, y));
      rgba.set([r, g, b, 255], (y * W + x) * 4);
    }
  }
  return rgba;
}

// The 64 x 64 downscale the browser would hand over, as ARGB ints (nearest neighbour is enough here).
function quant(rgba: Uint8ClampedArray): number[] {
  const out: number[] = [];
  for (let j = 0; j < 64; j++) {
    for (let i = 0; i < 64; i++) {
      const p = (Math.floor((j * H) / 64) * W + Math.floor((i * W) / 64)) * 4;
      out.push(argbFromRgb(rgba[p], rgba[p + 1], rgba[p + 2]));
    }
  }
  return out;
}

const lumHex = (h: string) => relativeLuminance(...hex(h));
const ratioHex = (a: string, b: string) => contrastRatio(lumHex(a), lumHex(b));

const pastel = render((x, y) => ((x - 90) ** 2 + (y - 80) ** 2 < 55 * 55 ? '#ffffff' : '#f6d2c4'));
const stripes = render((x, y) => {
  const phase = (((x - y) % 54) + 54) % 54;
  return phase < 18 ? '#e04a2f' : phase < 36 ? '#1d6fd1' : '#f4f1e8';
});
const night = render((x, y) => {
  if ((x - 240) ** 2 + (y - 80) ** 2 < 14 * 14) return '#c9a227';
  return (x - 220) ** 2 + (y - 100) ** 2 < 80 * 80 ? '#2a1d4a' : '#06060c';
});
const grey = render(() => '#808080');

const tones = (rgba: Uint8ClampedArray) => cardTones(quant(rgba), rgba, W, BOXES);

describe('contrast helpers', () => {
  it('matches the WCAG extremes', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 5);
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 5);
  });
});

describe('cardTones', () => {
  it('pastel poster gets dark text and no plate', () => {
    const t = tones(pastel);
    expect(t.worstContrast).toBeGreaterThanOrEqual(5);
    expect(t.plate).toBeUndefined();
    expect(lumHex(t.text)).toBeLessThan(0.2);
  });

  it('diagonal stripes need a plate and reach 5:1 on it', () => {
    const t = tones(stripes);
    expect(t.worstContrast).toBeLessThan(5);
    expect(t.plate).toBeDefined();
    expect(ratioHex(t.text, t.plate as string)).toBeGreaterThanOrEqual(5);
  });

  it('dark poster gets light text', () => {
    const t = tones(night);
    expect(lumHex(t.text)).toBeGreaterThan(0.5);
    // The gold moon sits under the time labels, so light text alone dips below 5:1 there: the
    // plate (dark under light text) must make up for it.
    expect(t.plate).toBeDefined();
    expect(lumHex(t.plate as string)).toBeLessThan(0.05);
    expect(ratioHex(t.text, t.plate as string)).toBeGreaterThanOrEqual(5);
  });

  it('icon contrast on every disc is at least 4.5:1', () => {
    for (const rgba of [pastel, stripes, night]) {
      const t = tones(rgba);
      expect(ratioHex(t.primary, t.onPrimary)).toBeGreaterThanOrEqual(4.5);
      expect(ratioHex(t.secondary, t.onSecondary)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('a dull grey poster still gets chroma 36 discs', () => {
    const t = tones(grey);
    const [r, g, b] = hex(t.primary);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(10);
  });
});
