// Reads the pixels of the poster vignette in the browser and caches the card tones.
// Only same-origin images (the /api/vignette output) are read; anything else is unreadable.
import type { TonalPalette } from '@material/material-color-utilities';
import { posterPalette, tonesOver, type Box, type CardTones } from '../tones';

export type ToneState =
  | { status: 'pending' }
  | { status: 'ready'; tones: CardTones }
  /** The poster cannot be read (external URL, load error, tainted canvas): theme card. */
  | { status: 'unreadable' }
  /** Reading it hit an unexpected error, logged once: theme card, no retry. */
  | { status: 'failed' };

export type CardSpec = { w: number; h: number; boxes: Box[] };

/** What a sampler hands over once per poster: the 64 x 64 ARGB sample for the palette, and a
 *  synchronous drawing of the poster's cover crop at any card size (RGBA, `width` per row). */
export type PosterImage = {
  quantPixels: number[];
  draw: (w: number, h: number) => { rgba: Uint8ClampedArray; width: number };
};
export type Sampler = (url: string) => Promise<PosterImage>;

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

/** What a paint is drawn with: one poster, one card size, one set of text boxes. */
export function cacheKey(url: string, card: CardSpec): string {
  return JSON.stringify([url, card.w, card.h, card.boxes.map((b) => [b.x, b.y, b.w, b.h])]);
}

function isUnreadable(e: unknown): boolean {
  return e instanceof PosterLoadError || (e instanceof DOMException && e.name === 'SecurityError');
}

/** A poster read once: the box- and size-independent palette, and the decoded image to draw at
 *  any card size. */
export type PosterReading =
  | { status: 'unreadable' }
  | { status: 'ready'; palette: TonalPalette; draw: PosterImage['draw'] };

/** The asynchronous part, once per poster URL: loading and decoding the image, quantizing it. */
export async function readPoster(url: string, sampler: Sampler, origin: string): Promise<PosterReading> {
  if (!isSameOrigin(url, origin)) return { status: 'unreadable' };
  let image: PosterImage;
  try {
    image = await sampler(url);
  } catch (e) {
    if (isUnreadable(e)) return { status: 'unreadable' };
    throw e;
  }
  return { status: 'ready', palette: posterPalette(image.quantPixels), draw: image.draw };
}

/** The synchronous part, for any card size and text boxes of a poster already read. */
export function tonesOn(
  reading: Extract<PosterReading, { status: 'ready' }>, card: CardSpec,
): CardTones {
  const { rgba, width } = reading.draw(card.w, card.h);
  const boxes = card.boxes.flatMap((b) => clampBox(b, card.w, card.h) ?? []);
  return tonesOver(reading.palette, rgba, width, boxes);
}

/** `readPoster` then `tonesOn`, for one card (the render checks, `outils/verifier-carte-media.mjs`). */
export async function computeTones(
  url: string, card: CardSpec, sampler: Sampler, origin: string,
): Promise<ToneState> {
  const reading = await readPoster(url, sampler, origin);
  if (reading.status !== 'ready') return reading;
  return { status: 'ready', tones: tonesOn(reading, card) };
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

/** Browser sampler: loads the image, reads the 64 x 64 whole image (a SecurityError there, on a
 *  tainted canvas, makes the poster unreadable before any card is drawn), and keeps the decoded
 *  image to draw the card-size cover crop on demand — the pixels the browser shows under the text. */
export const browserSampler: Sampler = async (url) => {
  const img = await loadImage(url);
  const quantCtx = context(QUANT_SIZE, QUANT_SIZE);
  quantCtx.drawImage(img, 0, 0, QUANT_SIZE, QUANT_SIZE);
  const q = quantCtx.getImageData(0, 0, QUANT_SIZE, QUANT_SIZE).data;
  const quantPixels: number[] = [];
  for (let i = 0; i < q.length; i += 4) {
    quantPixels.push(((q[i + 3]! << 24) | (q[i]! << 16) | (q[i + 1]! << 8) | q[i + 2]!) >>> 0);
  }
  const draw = (w: number, h: number) => {
    const cardCtx = context(w, h);
    const c = coverCrop(img.naturalWidth, img.naturalHeight, w, h);
    cardCtx.drawImage(img, c.sx, c.sy, c.sw, c.sh, 0, 0, w, h);
    return { rgba: cardCtx.getImageData(0, 0, w, h).data, width: w };
  };
  return { quantPixels, draw };
};

/** Posters kept read at once: the one on screen and the one before it (a track change back and
 *  forth). Each holds a decoded image and one card-size sample: on a Fire 7 the memory is short. */
const KEPT_POSTERS = 2;

type Entry =
  | { status: 'pending' | 'unreadable' | 'failed' }
  | { status: 'ready'; reading: Extract<PosterReading, { status: 'ready' }>; last?: { key: string; tones: CardTones } };

/** The tone cache. The poster is read ONCE PER URL (asynchronously); the tones of a given card
 *  size and set of text boxes are then computed synchronously from that reading. So a text box
 *  that changes on the same poster (volume 5 -> 10 %, elapsed 9:59 -> 10:00, a new track sharing
 *  the art) gets its exact tones at once, never `pending`, and the card never drops its poster. */
export function createToneCache(sampler: Sampler, origin: () => string) {
  const entries = new Map<string, Entry>();
  const listeners: Array<() => void> = [];
  const settle = (url: string, pending: Entry, next: Entry) => {
    // Evicted meanwhile: the result belongs to nobody any more.
    if (entries.get(url) !== pending) return;
    entries.set(url, next);
    for (const fn of listeners) fn();
  };
  const start = (url: string): void => {
    const pending: Entry = { status: 'pending' };
    entries.set(url, pending);
    while (entries.size > KEPT_POSTERS) entries.delete(entries.keys().next().value!);
    readPoster(url, sampler, origin()).then(
      (reading) => settle(url, pending,
        reading.status === 'ready' ? { status: 'ready', reading } : { status: 'unreadable' }),
      (e: unknown) => {
        // Neither a load error nor a tainted canvas: a defect, reported. The card shows this poster
        // without its tones (the theme card), as for an unreadable one; no retry.
        console.error(`media card: reading the poster ${url} failed`, e);
        settle(url, pending, { status: 'failed' });
      },
    );
  };
  return {
    /** Synchronous lookup; an unknown poster starts its reading and returns `pending`. */
    tonesFor(url: string, card: CardSpec): ToneState {
      const entry = entries.get(url);
      if (entry === undefined) { start(url); return { status: 'pending' }; }
      if (entry.status !== 'ready') return { status: entry.status };
      const key = cacheKey(url, card);
      if (entry.last?.key !== key) {
        let tones: CardTones;
        try {
          tones = tonesOn(entry.reading, card);
        } catch (e) {
          // Drawing a poster already read cannot fail but by a defect (no 2d context): reported,
          // and the card is painted without the poster's tones from now on.
          console.error(`media card: drawing the poster ${url} failed`, e);
          entries.set(url, { status: 'failed' });
          return { status: 'failed' };
        }
        entry.last = { key, tones };
      }
      return { status: 'ready', tones: entry.last.tones };
    },
    /** Called once per finished reading so the caller re-renders. */
    onTonesReady(fn: () => void): void {
      listeners.push(fn);
    },
  };
}

const browserCache = createToneCache(browserSampler, () => location.origin);

export const tonesFor = browserCache.tonesFor;
export const onTonesReady = browserCache.onTonesReady;
