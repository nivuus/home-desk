/** The media card on its untouched poster: what the render check measures (spec 2026-10-23,
 *  "Couleurs" and "Fond de texte conditionnel").
 *
 *  Since the redesign the poster covers the whole card with no veil, and the colours of the text,
 *  the discs and the bars are derived from the poster (`src/tones.ts`), with a solid plate behind
 *  the text only when the text alone cannot reach 5:1. `analyserRendu` (`verifier-rendu.mjs`)
 *  composes computed `backgroundColor`s and is blind to a `background-image` by construction: the
 *  only honest measurement is the pixels actually painted. Three rules, per card:
 *
 *  1. every `[data-tone-box]` (label, title, subtitle, times, volume level): the WORST pixel under
 *     its content box, against the text colour, ≥ 5:1. The text is made transparent first
 *     (`color: transparent`, which moves nothing): otherwise the glyphs themselves are sampled
 *     and every ratio reads 1:1. Worst pixel means the minimum ratio over every pixel, not over
 *     the two luminance extremes: a mid-grey text over a black-and-white poster has both
 *     extremes far from it and still a pixel at its own luminance. The content box (padding
 *     excluded) is where the glyphs are; it stays clear of the plate's rounded corners.
 *  2. every disc (`.media-bouton`, `.media-pas`): a solid fill (alpha 1 — the poster must not show
 *     through) and an icon colour ≥ 4.5:1 against it.
 *  3. no element of the card below the frame (585 px).
 *
 *  `mesurerCarteMedia` runs on any page that shows the card (the live pages of
 *  `verifier-rendu.mjs`, or the in-memory fixtures below); `autoTestCarteMedia` proves the check
 *  can both fail and pass, on the real render functions and stylesheets bundled from `src/`. */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AFFICHES_PNG } from './affiches-essai.mjs';

export const TEXT_CONTRAST_MIN = 5;
export const ICON_CONTRAST_MIN = 4.5;
const WIDTH = 343;
const HEIGHT = 585;
const TONE_WAIT_MS = 10_000;

/** Waits until the card shows its poster with ready tones (`.avec-affiche`, set by
 *  `rendreCarteMedia` only then) AND the poster bitmap is decoded, so the pixels sampled are the
 *  poster's and not the theme fill under a still-loading image. False on timeout. */
export async function attendreCarteTeintee(page, limitMs = TONE_WAIT_MS) {
  try {
    await page.waitForSelector('.media.avec-affiche .media-affiche', { timeout: limitMs });
  } catch {
    return false;
  }
  return page.evaluate(async () => {
    const layer = document.querySelector('.media.avec-affiche .media-affiche');
    const url = /url\("?(.*?)"?\)/.exec(getComputedStyle(layer).backgroundImage)?.[1];
    if (!url) return false;
    const img = new Image();
    img.src = url;
    await img.decode();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  });
}

/** Runs IN THE PAGE: the boxes to sample, the discs and the overflow, in viewport pixels. */
function relever(frameBottom) {
  const card = document.querySelector('.media');
  if (!card) return null;
  const c = card.getBoundingClientRect();
  const px = (v) => Number.parseFloat(v) || 0;
  const boxes = [...card.querySelectorAll('[data-tone-box]')].map((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      cls: String(el.className), text: (el.textContent || '').trim().slice(0, 30),
      colour: s.color, plate: !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor),
      x0: Math.ceil(r.left + px(s.paddingLeft)), y0: Math.ceil(r.top + px(s.paddingTop)),
      x1: Math.floor(r.right - px(s.paddingRight)), y1: Math.floor(r.bottom - px(s.paddingBottom)),
    };
  }).filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
  const discs = [...card.querySelectorAll('.media-bouton, .media-pas')].map((el) => {
    const s = getComputedStyle(el);
    return { cls: String(el.className).trim(), fill: s.backgroundColor, icon: s.color };
  });
  const overflow = [card, ...card.querySelectorAll('*')]
    .filter((el) => el.getBoundingClientRect().bottom > frameBottom + 0.5)
    .map((el) => String(el.className?.baseVal ?? el.className ?? el.tagName));
  return {
    clip: { x: Math.max(0, Math.floor(c.left)), y: Math.max(0, Math.floor(c.top)),
      width: Math.ceil(Math.min(c.right, innerWidth) - Math.max(0, Math.floor(c.left))),
      height: Math.ceil(Math.min(c.bottom, innerHeight) - Math.max(0, Math.floor(c.top))) },
    boxes, discs, overflow,
  };
}

/** Runs IN THE PAGE: decodes the card screenshot and returns, per box, the minimum contrast
 *  ratio between the text colour and every pixel of its content box. */
async function pireParBoite({ b64, clip, boxes }) {
  const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  return boxes.map((b) => {
    const [r, g, bl] = (b.colour.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
    const lt = lum(r, g, bl);
    let worst = Infinity;
    let pixels = 0;
    for (let y = Math.max(b.y0, clip.y); y < Math.min(b.y1, clip.y + img.height); y++) {
      for (let x = Math.max(b.x0, clip.x); x < Math.min(b.x1, clip.x + img.width); x++) {
        const i = ((y - clip.y) * img.width + (x - clip.x)) * 4;
        const k = ratio(lt, lum(data[i], data[i + 1], data[i + 2]));
        if (k < worst) worst = k;
        pixels++;
      }
    }
    return { worst, pixels };
  });
}

const rgba = (css) => (css.match(/[\d.]+/g) ?? []).map(Number);
const lumCss = ([r, g, b]) => {
  const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratioCss = (a, b) => {
  const [la, lb] = [lumCss(rgba(a)), lumCss(rgba(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const round2 = (v) => Math.round(v * 100) / 100;

/** Measures the card on `page`; null when no card is on screen. The caller waits for the card
 *  to settle first (`attendreCarteTeintee`, and its own animation guard on the live pages). */
export async function mesurerCarteMedia(page, frameBottom = HEIGHT) {
  const r = await page.evaluate(relever, frameBottom);
  if (!r) return null;
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = '__mask-tone-text';
    style.textContent = '.media [data-tone-box] { color: transparent !important; }';
    document.head.appendChild(style);
  });
  let worst;
  try {
    const shot = await page.screenshot({ clip: r.clip });
    worst = await page.evaluate(pireParBoite, { b64: shot.toString('base64'), clip: r.clip, boxes: r.boxes });
  } finally {
    await page.evaluate(() => document.getElementById('__mask-tone-text')?.remove());
  }
  return {
    boxes: r.boxes.map((b, i) => ({
      cls: b.cls, text: b.text, plate: b.plate, pixels: worst[i].pixels, ratio: round2(worst[i].worst),
    })),
    discs: r.discs.map((d) => ({
      cls: d.cls, solid: (rgba(d.fill)[3] ?? 1) === 1, ratio: round2(ratioCss(d.fill, d.icon)),
    })),
    overflow: r.overflow,
  };
}

/** `{ ok, reason }` for a measurement of `mesurerCarteMedia`. */
export function jugerCarte(m) {
  if (!m) return { ok: false, reason: 'no media card on screen' };
  const faults = [];
  if (m.boxes.length === 0) faults.push('no [data-tone-box] measured');
  const empty = m.boxes.filter((b) => b.pixels === 0);
  if (empty.length) faults.push(`box(es) with no pixel sampled: ${empty.map((b) => b.cls).join(', ')}`);
  const lowText = m.boxes.filter((b) => b.pixels > 0 && b.ratio < TEXT_CONTRAST_MIN);
  if (lowText.length) {
    faults.push(`text contrast under ${TEXT_CONTRAST_MIN}:1 (${lowText
      .map((b) => `"${b.text}" ${b.ratio}:1${b.plate ? ' on its plate' : ', no plate'}`).join('; ')})`);
  }
  const notSolid = m.discs.filter((d) => !d.solid);
  if (notSolid.length) faults.push(`disc not solid: ${notSolid.map((d) => d.cls).join(', ')}`);
  const lowIcon = m.discs.filter((d) => d.ratio < ICON_CONTRAST_MIN);
  if (lowIcon.length) {
    faults.push(`icon contrast under ${ICON_CONTRAST_MIN}:1 (${lowIcon.map((d) => `${d.cls} ${d.ratio}:1`).join('; ')})`);
  }
  if (m.overflow.length) faults.push(`below the ${HEIGHT} px frame: ${m.overflow.join(', ')}`);
  return { ok: faults.length === 0, reason: faults.join(' ; ') };
}

/** One line: the worst box, the worst disc, how many plates. */
export function resumerCarte(m) {
  const wb = m.boxes.reduce((a, b) => (b.ratio < a.ratio ? b : a), { ratio: Infinity });
  const wd = m.discs.reduce((a, d) => (d.ratio < a.ratio ? d : a), { ratio: Infinity });
  return `worst text ${wb.ratio}:1 on "${wb.text}", worst icon ${wd.ratio}:1 (${wd.cls ?? 'no disc'}), `
    + `${m.boxes.filter((b) => b.plate).length}/${m.boxes.length} box(es) on a plate`;
}

// --- Auto-test: the real card, bundled from `src/`, on the five test posters ---------------

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://carte-media.test';

/** The real render functions and the real stylesheets (taken from `src/index.ts`, never
 *  re-listed). `__poser` renders the worst-case card (remote source, two-line title, subtitle,
 *  progress, three transport discs, a volume level), measures it, computes its tones with the
 *  app's own sampler (`computeTones` + `browserSampler`, same origin as the page), and renders it
 *  again with them — the sequence `boot/media-tones.ts` runs on the tablet. `withoutPlate` drops
 *  the plate from the computed tones; `css` overrides the stylesheets before the card is drawn;
 *  `top` moves the card down so its bottom sits on the frame when it is `blocCarte` tall: the
 *  counter-proofs. */
async function bundleFixture() {
  const sheets = readFileSync(join(APP, 'src', 'index.ts'), 'utf8')
    .split('\n').filter((l) => /^import '\.\/styles\/[^']+\.css';$/.test(l)).join('\n');
  const entry = `${sheets}
import { render } from 'lit';
import { Etat } from './etat';
import { resoudreSource, CAP } from './media';
import { rendreCarteMedia } from './rendu/media';
import { measureCard } from './boot/media-tones';
import { computeTones, browserSampler } from './rendu/poster-sampler';
const P = 'media_player.verifier_carte';
const DECL = { nom: 'Musique', titre: [P], sousTitre: [P], affiche: [P],
  progression: [P], transport: [P], volume: [P] };
const TEXTS = {
  latin: { piece: 'Chambre',
    title: 'Un titre de chanson assez long pour tenir sur deux lignes entieres de la carte',
    artist: 'Un artiste au nom lui aussi passablement long' },
  cjk: { piece: "Chambre d'amis du deuxieme etage, cote jardin, au fond du couloir",
    title: '夜に駆ける — 二行に収まらないほど長い曲名をここに書いて、カードの高さを確かめる',
    artist: '坂本龍一と東京フィルハーモニー交響楽団' },
};
window.__poser = async (poster, { withoutPlate = false, script = 'latin', top = 0, css = '' } = {}) => {
  const t = TEXTS[script];
  const etat = new Etat();
  etat.appliquer({ entity_id: P, state: 'playing', attributes: {
    media_title: t.title, media_artist: t.artist, entity_picture: poster,
    media_position: 61, media_duration: 245, volume_level: 0.5,
    supported_features: CAP.PAUSE | CAP.PLAY | CAP.PRECEDENT | CAP.SUIVANT | CAP.VOLUME_SET } });
  const s = resoudreSource(etat, { ...DECL, piece: t.piece });
  const override = document.createElement('style');
  override.textContent = css;
  document.head.appendChild(override);
  const app = document.getElementById('app');
  app.style.paddingTop = top + 'px';
  const now = Date.now();
  render(rendreCarteMedia(s, now, { status: 'pending' }, true), app);
  const spec = measureCard(app.querySelector('.media'));
  const state = await computeTones(s.affiche, spec, browserSampler, location.origin);
  if (state.status !== 'ready') throw new Error('poster tones: ' + state.status);
  const tones = withoutPlate ? { status: 'ready', tones: { ...state.tones, plate: undefined } } : state;
  render(rendreCarteMedia(s, now, tones, true), app);
};
`;
  const out = await build({
    stdin: { contents: entry, resolveDir: join(APP, 'src'), loader: 'ts', sourcefile: 'carte.ts' },
    bundle: true, write: false, format: 'iife', outdir: join(APP, '.verifier-carte'), logLevel: 'error',
  });
  const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const css = out.outputFiles.find((f) => f.path.endsWith('.css')).text;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head>
<body><div id="app" class="m3" style="box-sizing:border-box;padding:12px 16px;"></div>
<script>${js}</script></body></html>`;
}

const pass = (j) => j.ok;
/** `blocCarte` (`contrat/budget.json`): the height the budget promises for the card. Posed with
 *  its top at `HEIGHT - blocCarte`, a card taller than its budget crosses the frame. */
const BLOC_CARTE = JSON.parse(readFileSync(join(APP, '..', 'contrat', 'budget.json'), 'utf8')).hauteurs.blocCarte;
/** What the card looked like before the final review (2026-10-24): `line-height: normal` on the
 *  label, subtitle and times, and a label that wraps. A fallback font grew it past its budget. */
const LINE_HEIGHT_NORMAL = `.media .t, .media-sous, .media-temps { line-height: normal !important; }
  .media .t { white-space: normal !important; }`;
const CASES = [
  ...['claire', 'moyenne', 'sombre', 'pastel'].map((poster) => ({
    poster, options: {}, expected: pass,
    what: `poster "${poster}" with its computed tones: every rule holds`,
  })),
  { poster: 'rayures', options: {},
    expected: (j, m) => j.ok && m.boxes.some((b) => b.plate),
    what: 'stripes with their computed tones: needs the plate, and passes on it' },
  { poster: 'rayures', options: { withoutPlate: true },
    expected: (j) => !j.ok && /text contrast under/.test(j.reason),
    what: 'COUNTER-PROOF: stripes with the plate forced off must be flagged' },
  { poster: 'moyenne', options: { script: 'cjk', top: HEIGHT - BLOC_CARTE },
    expected: pass,
    what: `CJK title and subtitle, room name too long for the label: within its ${BLOC_CARTE} px budget` },
  { poster: 'moyenne', options: { script: 'cjk', top: HEIGHT - BLOC_CARTE, css: LINE_HEIGHT_NORMAL },
    expected: (j) => !j.ok && /below the 585 px frame/.test(j.reason),
    what: 'COUNTER-PROOF: the same card with line-height normal and a wrapping label must overflow' },
  { poster: 'moyenne', options: { css: '.media .media-bouton { background: rgba(20, 20, 20, .6) !important; }' },
    expected: (j) => !j.ok && /disc not solid/.test(j.reason),
    what: 'COUNTER-PROOF: a translucent disc must be flagged' },
  { poster: 'moyenne', options: { css: '.media .media-bouton, .media .media-pas { color: var(--mc-secondary) !important; }' },
    expected: (j) => !j.ok && /icon contrast under/.test(j.reason),
    what: 'COUNTER-PROOF: an icon the colour of its disc must be flagged' },
];

/** 0 when every case came out as expected, 1 otherwise. */
export async function autoTestCarteMedia(nav) {
  console.log('Media card auto-test on the untouched poster (painted pixels, the real card from `src/`):');
  const ctx = await nav.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  const pageHtml = await bundleFixture();
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const poster = /^\/affiche-(\w+)\.png$/.exec(path)?.[1];
    if (poster && AFFICHES_PNG.has(poster)) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: AFFICHES_PNG.get(poster) });
    }
    if (path === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml });
    return route.fulfill({ status: 404, body: '' });
  });
  let failures = 0;
  for (const c of CASES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${ORIGIN}/`);
    await page.evaluate(([p, o]) => window.__poser(p, o), [`/affiche-${c.poster}.png`, c.options]);
    const tinted = await attendreCarteTeintee(page);
    const m = tinted ? await mesurerCarteMedia(page) : null;
    const j = tinted ? jugerCarte(m) : { ok: false, reason: 'the card never showed its poster' };
    const ok = errors.length === 0 && c.expected(j, m);
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${c.what}`);
    console.log(`      ${m ? `${resumerCarte(m)} — ` : ''}${j.ok ? 'accepted' : `flagged: ${j.reason}`}`
      + `${errors.length ? ` — page errors: ${errors.join(' | ')}` : ''}`);
    await page.close();
  }
  await ctx.close();
  console.log('');
  if (failures) {
    console.error(`${failures} media card case(s) did not come out as expected: the check has a blind spot.`);
    return 1;
  }
  console.log('Media card auto-test passed: the five posters pass on their computed tones, the '
    + 'stripes only through their plate, a CJK card fits its budget, and the plate-less stripes, '
    + 'the line-height-normal card, the translucent disc and the low-contrast icon are flagged.');
  return 0;
}
