// Reads the pixels of the poster vignette in the browser and caches the card tones.
// Only same-origin images (the /api/vignette output) are read; anything else is unreadable.
import { cardTones, type Box, type CardTones } from '../tones';

export type ToneState =
  | { status: 'pending' }
  | { status: 'ready'; tones: CardTones }
  | { status: 'unreadable' };

export type CardSpec = { w: number; h: number; boxes: Box[] };

/** What a sampler hands to `cardTones`: the 64 x 64 ARGB sample and the card-size RGBA sample. */
export type PosterSample = { quantPixels: number[]; rgba: Uint8ClampedArray; width: number };
export type Sampler = (url: string, card: { w: number; h: number }) => Promise<PosterSample>;

/** The image could not be loaded (network error, undecodable). */
export class PosterLoadError extends Error {
  constructor(url: string) {
    super(`poster image failed to load: ${url}`);
    this.name = 'PosterLoadError';
  }
}

const QUANT_SIZE = 64;

/** The source rectangle `background-size: cover; background-position: center` shows. */
export function coverCrop(imgW: number, imgH: number, boxW: number, boxH: number):
  { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const sw = boxW / scale;
  const sh = boxH / scale;
  return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
}

/** Intersects a box with the card; undefined when nothing is left. */
export function clampBox(b: Box, w: number, h: number): Box | undefined {
  const x0 = Math.max(0, b.x);
  const y0 = Math.max(0, b.y);
  const x1 = Math.min(w, b.x + b.w);
  const y1 = Math.min(h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return undefined;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url, origin).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export function cacheKey(url: string, card: CardSpec): string {
  return JSON.stringify([url, card.w, card.h, card.boxes.map((b) => [b.x, b.y, b.w, b.h])]);
}

function isUnreadable(e: unknown): boolean {
  return e instanceof PosterLoadError || (e instanceof DOMException && e.name === 'SecurityError');
}

export async function computeTones(
  url: string, card: CardSpec, sampler: Sampler, origin: string,
): Promise<ToneState> {
  if (!isSameOrigin(url, origin)) return { status: 'unreadable' };
  let sample: PosterSample;
  try {
    sample = await sampler(url, { w: card.w, h: card.h });
  } catch (e) {
    if (isUnreadable(e)) return { status: 'unreadable' };
    throw e;
  }
  const boxes = card.boxes.flatMap((b) => clampBox(b, card.w, card.h) ?? []);
  return { status: 'ready', tones: cardTones(sample.quantPixels, sample.rgba, sample.width, boxes) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new PosterLoadError(url));
    img.src = url;
  });
}

function context(w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('2d canvas context unavailable');
  return ctx;
}

/** Browser sampler: draws the image twice (card-size cover crop, 64 x 64 whole image). */
export const browserSampler: Sampler = async (url, card) => {
  const img = await loadImage(url);
  const cardCtx = context(card.w, card.h);
  const c = coverCrop(img.naturalWidth, img.naturalHeight, card.w, card.h);
  cardCtx.drawImage(img, c.sx, c.sy, c.sw, c.sh, 0, 0, card.w, card.h);
  const quantCtx = context(QUANT_SIZE, QUANT_SIZE);
  quantCtx.drawImage(img, 0, 0, QUANT_SIZE, QUANT_SIZE);
  // getImageData throws a SecurityError on a tainted canvas.
  const rgba = cardCtx.getImageData(0, 0, card.w, card.h).data;
  const q = quantCtx.getImageData(0, 0, QUANT_SIZE, QUANT_SIZE).data;
  const quantPixels: number[] = [];
  for (let i = 0; i < q.length; i += 4) {
    quantPixels.push(((q[i + 3]! << 24) | (q[i]! << 16) | (q[i + 1]! << 8) | q[i + 2]!) >>> 0);
  }
  return { quantPixels, rgba, width: card.w };
};

const cache = new Map<string, ToneState>();
const listeners: Array<() => void> = [];

/** Synchronous lookup; a miss starts the computation and returns `pending`. */
export function tonesFor(url: string, card: CardSpec): ToneState {
  const key = cacheKey(url, card);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  cache.set(key, { status: 'pending' });
  void computeTones(url, card, browserSampler, location.origin).then((state) => {
    cache.set(key, state);
    for (const fn of listeners) fn();
  });
  return { status: 'pending' };
}

/** Called once per finished computation so the caller re-renders. */
export function onTonesReady(fn: () => void): void {
  listeners.push(fn);
}
