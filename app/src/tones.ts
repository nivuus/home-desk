import {
  QuantizerCelebi,
  Score,
  TonalPalette,
  Hct,
  hexFromArgb,
} from '@material/material-color-utilities';

/** Pixel rectangle of the sampled image. */
export type Box = { x: number; y: number; w: number; h: number };

export type CardTones = {
  text: string;
  /** Solid plate colour behind the text; set only when the text alone cannot reach 5:1. */
  plate?: string;
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  /** Worst-pixel contrast of the text over the boxes, WITHOUT the plate. */
  worstContrast: number;
};

const TEXT_TONES = [0, 5, 10, 95, 98, 100];
const QUANT_COLORS = 128;
const MIN_CHROMA = 36;
const PLATE_THRESHOLD = 5;

const linear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an sRGB colour (channels 0-255). */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two relative luminances, in either order. */
export function contrastRatio(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const argbLuminance = (argb: number): number =>
  relativeLuminance((argb >> 16) & 255, (argb >> 8) & 255, argb & 255);

/** Luminance range over EVERY pixel of every box: the worst case, not the average. */
function luminanceRange(rgba: Uint8ClampedArray, width: number, boxes: Box[]): [number, number] {
  let lo = 1;
  let hi = 0;
  for (const box of boxes) {
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const i = (y * width + x) * 4;
        const l = relativeLuminance(rgba[i], rgba[i + 1], rgba[i + 2]);
        if (l < lo) lo = l;
        if (l > hi) hi = l;
      }
    }
  }
  return lo > hi ? [0, 1] : [lo, hi];
}

/**
 * Derives the card colours from the poster: the dominant colour's hue (chroma floored so a dull
 * poster still gets visible discs) drives a tonal palette; the text tone is the one with the best
 * worst-pixel contrast under the text boxes; buttons are solid discs whose icons are guaranteed
 * contrast whatever is behind them.
 */
export function cardTones(
  quantPixels: number[],
  rgba: Uint8ClampedArray,
  width: number,
  textBoxes: Box[],
): CardTones {
  const source = Score.score(QuantizerCelebi.quantize(quantPixels, QUANT_COLORS))[0];
  const hct = Hct.fromInt(source);
  const palette = TonalPalette.fromHueAndChroma(hct.hue, Math.max(hct.chroma, MIN_CHROMA));

  const [lo, hi] = luminanceRange(rgba, width, textBoxes);
  let bestTone = TEXT_TONES[0];
  let worstContrast = -1;
  for (const tone of TEXT_TONES) {
    const l = argbLuminance(palette.tone(tone));
    const worst = Math.min(contrastRatio(l, lo), contrastRatio(l, hi));
    if (worst > worstContrast) {
      worstContrast = worst;
      bestTone = tone;
    }
  }

  const darkText = bestTone < 50;
  const hexAt = (tone: number): string => hexFromArgb(palette.tone(tone));
  const needsPlate = worstContrast < PLATE_THRESHOLD;

  return {
    text: hexAt(bestTone),
    ...(needsPlate ? { plate: hexAt(darkText ? 92 : 15) } : {}),
    primary: hexAt(darkText ? 30 : 90),
    onPrimary: hexAt(darkText ? 98 : 10),
    secondary: hexAt(darkText ? 90 : 25),
    onSecondary: hexAt(darkText ? 10 : 95),
    worstContrast,
  };
}
