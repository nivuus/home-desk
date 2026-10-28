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
  /** Brightness factor of the image layer (`poster-filter.ts`): 1 leaves the blurred poster as it
   *  is; below 1, the least dimming that lifts light text to 5:1 where nothing else could. */
  dim: number;
  primary: string;
  onPrimary: string;
  secondary: string;
  onSecondary: string;
  /** Worst-pixel contrast of the text over the boxes, as painted (dimmed when `dim` < 1). */
  worstContrast: number;
};

const TEXT_TONES = [0, 5, 10, 95, 98, 100];
const LIGHT_TEXT_TONES = TEXT_TONES.filter((t) => t > 50);
const QUANT_COLORS = 128;
const MIN_CHROMA = 36;
const TEXT_CONTRAST_MIN = 5;
/** Halvings of the dimming search: 2^-16 is far below one 8-bit step of the painted pixel. */
const DIM_SEARCH_STEPS = 16;

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

/** `linear` for each 8-bit value: the dimming search reads it hundreds of thousands of times. */
const LINEAR = Float64Array.from({ length: 256 }, (_, v) => linear(v));

/** Brightest luminance under the boxes once the browser applies `brightness(k)`: each channel is
 *  scaled by `k` then rounded UP to 8 bits, the brighter side of the painter's rounding, so the
 *  contrast computed here is never better than the one on screen. */
function brightestDimmed(rgba: Uint8ClampedArray, width: number, boxes: Box[], k: number): number {
  let hi = 0;
  for (const box of boxes) {
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const i = (y * width + x) * 4;
        const l = 0.2126 * LINEAR[Math.min(255, Math.ceil(rgba[i] * k))]
          + 0.7152 * LINEAR[Math.min(255, Math.ceil(rgba[i + 1] * k))]
          + 0.0722 * LINEAR[Math.min(255, Math.ceil(rgba[i + 2] * k))];
        if (l > hi) hi = l;
      }
    }
  }
  return hi;
}

/** The largest brightness factor (the least dimming) at which text of luminance `textL` reaches
 *  `TEXT_CONTRAST_MIN` over every pixel of the boxes. Dimming only darkens, so the contrast of
 *  light text only grows as `k` falls: a bisection, kept on the side that passes. `k` = 0 (black)
 *  always passes for the light tones (≥ 18:1). */
function leastDimming(rgba: Uint8ClampedArray, width: number, boxes: Box[], textL: number): number {
  let pass = 0;
  let fail = 1;
  for (let step = 0; step < DIM_SEARCH_STEPS; step++) {
    const k = (pass + fail) / 2;
    if (contrastRatio(textL, brightestDimmed(rgba, width, boxes, k)) >= TEXT_CONTRAST_MIN) pass = k;
    else fail = k;
  }
  // Three decimals for the CSS value, rounded down: darker, so still passing.
  return Math.floor(pass * 1000) / 1000;
}

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

/** The poster's tonal palette: the dominant colour's hue, chroma floored so a dull poster still
 *  gets visible discs. Depends on the poster alone, never on the card's size or text boxes. */
export function posterPalette(quantPixels: number[]): TonalPalette {
  const source = Score.score(QuantizerCelebi.quantize(quantPixels, QUANT_COLORS))[0];
  const hct = Hct.fromInt(source);
  return TonalPalette.fromHueAndChroma(hct.hue, Math.max(hct.chroma, MIN_CHROMA));
}

/**
 * Derives the card colours from the poster's palette: the text tone is the one with the best
 * worst-pixel contrast under the text boxes; buttons are solid discs whose icons are guaranteed
 * contrast whatever is behind them. When no tone reaches 5:1 over the poster as it is, the text
 * turns light and the poster is dimmed by the least amount that gets it there (`dim`), never
 * lightened: a light veil on the poster was refused (spec 2026-10-23, anti-goals).
 */
export function tonesOver(
  palette: TonalPalette,
  rgba: Uint8ClampedArray,
  width: number,
  textBoxes: Box[],
): CardTones {
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

  let dim = 1;
  if (worstContrast < TEXT_CONTRAST_MIN) {
    dim = -1;
    for (const tone of LIGHT_TEXT_TONES) {
      const textL = argbLuminance(palette.tone(tone));
      const k = leastDimming(rgba, width, textBoxes, textL);
      if (k > dim) {
        dim = k;
        bestTone = tone;
        worstContrast = contrastRatio(textL, brightestDimmed(rgba, width, textBoxes, k));
      }
    }
  }

  const darkText = bestTone < 50;
  const hexAt = (tone: number): string => hexFromArgb(palette.tone(tone));

  return {
    text: hexAt(bestTone),
    dim,
    primary: hexAt(darkText ? 30 : 90),
    onPrimary: hexAt(darkText ? 98 : 10),
    secondary: hexAt(darkText ? 90 : 25),
    onSecondary: hexAt(darkText ? 10 : 95),
    worstContrast,
  };
}

/** `posterPalette` then `tonesOver`, in one call. */
export function cardTones(
  quantPixels: number[],
  rgba: Uint8ClampedArray,
  width: number,
  textBoxes: Box[],
): CardTones {
  return tonesOver(posterPalette(quantPixels), rgba, width, textBoxes);
}
