/** Test posters for the media card, encoded as PNG in memory and served by request interception
 *  (`context.route`) — never written into `config/www/wallpanel/`, which is the folder of the
 *  three real tablets.
 *
 *  Two families:
 *  - three banded greys (`claire`, `moyenne`, `sombre`), the posters the render check has used
 *    since task 13. Banded rather than flat: a flat poster has one luminance and would hide what
 *    a worst-pixel measurement is for;
 *  - the two "trap" posters of the colour mockup (`carte-media-c-couleurs.html`, 2026-10-23):
 *    `rayures` (red / blue / cream diagonal stripes, no tone of any hue reads over all three)
 *    and `pastel` (a very light poster). Their canvas drawings are transcribed here as pixel
 *    functions with the same geometry (311 x 260, same colours, same coordinates), so the very
 *    same PNG bytes serve the in-memory auto-test and the live pages.
 *
 *  No image-encoding dependency: a PNG is a signature, three chunks and a CRC32. `pngjs` would
 *  do it, but this encoder already existed in `verifier-rendu.mjs` (task 13) and needs nothing
 *  more than `zlib`. */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, sum]);
}

/** An 8-bit RGB PNG, `colour(x, y) → [r, g, b]`. */
export function encodePng(width, height, colour) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let i = 0;
  for (let y = 0; y < height; y++) {
    raw[i++] = 0;   // filter "none"
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colour(x, y);
      raw[i++] = r; raw[i++] = g; raw[i++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Horizontal bands around a base grey: two real extremes to sample instead of one flat value. */
function banded(base, amplitude) {
  return encodePng(96, 96, (x, y) => {
    const v = Math.max(0, Math.min(255, base + (Math.floor(y / 12) % 2 ? amplitude : -amplitude)));
    return [v, v, v];
  });
}

/** The mockup's canvas size. */
const W = 311;
const H = 260;

/** Mockup "Rayures chargées": 18 px parallelograms from (i + o, 0) to (i + o + H, H), i stepping
 *  by 54 from -H — so a pixel's colour depends on `x - y` only. */
const STRIPES = [[0, hex('#e04a2f')], [18, hex('#1d6fd1')], [36, hex('#f4f1e8')]];
function stripes() {
  return encodePng(W, H, (x, y) => {
    const phase = (((x - y + H) % 54) + 54) % 54;
    return STRIPES.findLast(([offset]) => phase >= offset)[1];
  });
}

/** Mockup "Pastel très clair": a light pink ground, a pale yellow disc and a white core. */
function pastel() {
  const ground = hex('#f6d2c4');
  const disc = hex('#ffe9a8');
  const core = [255, 255, 255];
  return encodePng(W, H, (x, y) => {
    const d = Math.hypot(x + 0.5 - 90, y + 0.5 - 80);
    return d <= 55 ? core : d <= 110 ? disc : ground;
  });
}

/** Every test poster, by name. The live pages serve each one at
 *  `/local/wallpanel/essai-affiche-<name>.png` (`poserInterceptions`, `verifier-rendu.mjs`). */
export const AFFICHES_PNG = new Map([
  ['claire', banded(232, 23)],
  ['moyenne', banded(112, 40)],
  ['sombre', banded(10, 22)],
  ['rayures', stripes()],
  ['pastel', pastel()],
]);
