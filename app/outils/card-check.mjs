/** What every card render check shares (`verifier-carte-media.mjs`, `verifier-pile.mjs`): the
 *  measurement of a card on the pixels actually painted, its verdict, and the in-memory page
 *  that bundles `src/` with esbuild and serves the test posters.
 *
 *  Why painted pixels: an image card's text sits on the picture itself, with a solid plate only
 *  where the text alone cannot reach 5:1. A computed `backgroundColor` is blind to a
 *  `background-image` by construction; the only honest measurement is the screenshot. The rules,
 *  per card (`mesurerCarte`, `jugerCarte`):
 *
 *  1. every text box: the WORST pixel under its content box, against the text colour, ≥ 5:1. The
 *     text is made transparent first (`color: transparent`, which moves nothing): otherwise the
 *     glyphs themselves are sampled and every ratio reads 1:1. Worst pixel means the minimum
 *     ratio over every pixel, not over the two luminance extremes: a mid-grey text over a
 *     black-and-white picture has both extremes far from it and still a pixel at its own
 *     luminance. The content box (padding excluded) is where the glyphs are; it stays clear of
 *     the plate's rounded corners.
 *  2. every disc (`.disque`): a solid fill (alpha 1 and an effective opacity of 1 up the tree —
 *     the picture must not show through) and an icon colour ≥ 4.5:1 against it.
 *  3. the card is the fixed 311 × `blocCarte` frame, its title two lines at most, and no element
 *     of it lies below the screen frame (585 px) or outside the card, nor a row of the middle
 *     zone outside that zone (the frame clips: a content too tall is cut, not grown).
 *  4. in a stack (`.pile`): the block is exactly `blocCarte` tall — the dots live inside the
 *     card —, the dots' pill is solid with dots ≥ 4.5:1 against it (the icons' rule: it may sit
 *     on a picture), and the pill overlaps no disc and no text box. A stack of one card has no
 *     dots: whether they must be there is the caller's to say (it knows the count). */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AFFICHES_PNG } from './affiches-essai.mjs';

export const TEXT_CONTRAST_MIN = 5;
export const ICON_CONTRAST_MIN = 4.5;
export const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET = JSON.parse(readFileSync(join(APP, '..', 'contrat', 'budget.json'), 'utf8'));
export const { largeur: WIDTH, hauteur: HEIGHT } = BUDGET.viewportReference;
/** `blocCarte` (`contrat/budget.json`): the height the budget bills for a card. */
export const BLOC_CARTE = BUDGET.hauteurs.blocCarte;
/** The card's width: the `.corps` column, 343 px less its 16 px gutters. */
export const CARD_WIDTH = 311;
const TONE_WAIT_MS = 10_000;

/** Waits until the card `selector` shows its picture with ready tones (`.avec-image`, set by
 *  the card frame only then) AND the bitmap is decoded, so the pixels sampled are the picture's
 *  and not the theme fill under a still-loading image. False on timeout. */
export async function attendreCarteTeintee(page, selector = '.media', limitMs = TONE_WAIT_MS) {
  const layer = `${selector}.avec-image .carte-image`;
  try {
    await page.waitForSelector(layer, { timeout: limitMs });
  } catch {
    return false;
  }
  return page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    const url = /url\("?(.*?)"?\)/.exec(getComputedStyle(el).backgroundImage)?.[1];
    if (!url) return false;
    const img = new Image();
    img.src = url;
    await img.decode();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  }, layer);
}

/** Runs IN THE PAGE: the boxes to sample, the discs, the geometry, in viewport pixels. A text box
 *  is every `textSelector` match that is a `[data-tone-box]` or holds text of its own outside a
 *  disc; each one is marked `data-measured-text` for the mask. */
function relever({ frameBottom, selector, textSelector }) {
  const card = document.querySelector(selector);
  if (!card) return null;
  const c = card.getBoundingClientRect();
  const px = (v) => Number.parseFloat(v) || 0;
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
  const texts = [...card.querySelectorAll(textSelector)]
    .filter((el) => el.hasAttribute('data-tone-box') || (ownText(el) && !el.closest('.disque')));
  const boxes = texts.map((el) => {
    el.setAttribute('data-measured-text', '');
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      cls: String(el.className), text: (el.textContent || '').trim().slice(0, 30),
      colour: s.color, plate: !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor),
      x0: Math.ceil(r.left + px(s.paddingLeft)), y0: Math.ceil(r.top + px(s.paddingTop)),
      x1: Math.floor(r.right - px(s.paddingRight)), y1: Math.floor(r.bottom - px(s.paddingBottom)),
    };
  }).filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
  // A disc is solid only if nothing lets the image through: its fill's alpha AND the effective
  // opacity of the disc and every ancestor (an `opacity` anywhere up the tree composites the
  // disc, icon included, with what is behind it — the fill's alpha alone never sees it).
  const opacity = (el) => {
    let o = 1;
    for (let n = el; n !== null && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const discs = [...card.querySelectorAll('.disque')].map((el) => {
    const s = getComputedStyle(el);
    return { cls: String(el.className).trim(), fill: s.backgroundColor, icon: s.color, opacity: opacity(el) };
  });
  const name = (el) => String(el.className?.baseVal ?? el.className ?? el.tagName);
  const overflow = [card, ...card.querySelectorAll('*')]
    .filter((el) => el.getBoundingClientRect().bottom > frameBottom + 0.5)
    .map(name);
  // What the fixed frame hides: an element past the card's edge, or a row of the middle zone
  // pushed past that zone (onto the buttons) by a header that grew.
  const middle = card.querySelector('.milieu');
  const m = middle?.getBoundingClientRect();
  const unfit = [
    ...[...card.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().bottom > c.bottom + 0.5),
    ...(m ? [...middle.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < m.top - 0.5 || r.bottom > m.bottom + 0.5;
    }) : []),
  ].map(name);
  // Lines of the title: its content height (the plate's padding excluded) over its line height.
  const title = card.querySelector('.titre');
  const ts = title && getComputedStyle(title);
  const titleLines = title
    ? (title.getBoundingClientRect().height - px(ts.paddingTop) - px(ts.paddingBottom)) / px(ts.lineHeight) : 0;
  const pile = card.closest('.pile');
  const pill = card.querySelector('.points');
  let stack = null;
  if (pile) {
    const p = pill?.getBoundingClientRect();
    const hit = (r) => p !== undefined && r.left < p.right && p.left < r.right && r.top < p.bottom && p.top < r.bottom;
    const inCard = p !== undefined && p.left >= c.left - 0.5 && p.right <= c.right + 0.5
      && p.top >= c.top - 0.5 && p.bottom <= c.bottom + 0.5;
    stack = {
      height: pile.getBoundingClientRect().height,
      pill: pill ? { fill: getComputedStyle(pill).backgroundColor, opacity: opacity(pill), inCard,
        dots: [...pill.children].map((d) => getComputedStyle(d).backgroundColor) } : null,
      overlaps: pill ? [...card.querySelectorAll('.disque, [data-tone-box], [data-measured-text]')]
        .filter((el) => hit(el.getBoundingClientRect())).map(name) : [],
    };
  }
  return {
    stack, titleLines,
    size: { width: c.width, height: c.height, bottom: c.bottom },
    clip: { x: Math.max(0, Math.floor(c.left)), y: Math.max(0, Math.floor(c.top)),
      width: Math.ceil(Math.min(c.right, innerWidth) - Math.max(0, Math.floor(c.left))),
      height: Math.ceil(Math.min(c.bottom, innerHeight) - Math.max(0, Math.floor(c.top))) },
    boxes, discs, overflow, unfit: [...new Set(unfit)],
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

/** Measures the card `selector` on `page`; null when it is not on screen. The caller waits for
 *  the card to settle first (`attendreCarteTeintee` for a picture). `textSelector` names the text
 *  boxes to sample: the tone boxes alone by default (the media card puts every text in one). */
export async function mesurerCarte(page, {
  selector = '.media', frameBottom = HEIGHT, textSelector = '[data-tone-box]',
} = {}) {
  const r = await page.evaluate(relever, { frameBottom, selector, textSelector });
  if (!r) return null;
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = '__mask-text';
    style.textContent = '[data-measured-text] { color: transparent !important; }';
    document.head.appendChild(style);
  });
  let worst;
  try {
    const shot = await page.screenshot({ clip: r.clip });
    worst = await page.evaluate(pireParBoite, { b64: shot.toString('base64'), clip: r.clip, boxes: r.boxes });
  } finally {
    await page.evaluate(() => {
      document.getElementById('__mask-text')?.remove();
      for (const el of document.querySelectorAll('[data-measured-text]')) el.removeAttribute('data-measured-text');
    });
  }
  return {
    size: { width: round2(r.size.width), height: round2(r.size.height), bottom: round2(r.size.bottom) },
    titleLines: round2(r.titleLines),
    boxes: r.boxes.map((b, i) => ({
      cls: b.cls, text: b.text, plate: b.plate, pixels: worst[i].pixels, ratio: round2(worst[i].worst),
    })),
    discs: r.discs.map((d) => ({
      cls: d.cls, solid: (rgba(d.fill)[3] ?? 1) === 1 && d.opacity === 1,
      ratio: round2(ratioCss(d.fill, d.icon)),
    })),
    overflow: r.overflow,
    unfit: r.unfit,
    stack: r.stack && {
      height: round2(r.stack.height),
      overlaps: r.stack.overlaps,
      pill: r.stack.pill && {
        solid: (rgba(r.stack.pill.fill)[3] ?? 1) === 1 && r.stack.pill.opacity === 1,
        inCard: r.stack.pill.inCard,
        ratio: round2(Math.min(...r.stack.pill.dots.map((d) => ratioCss(r.stack.pill.fill, d)))),
      },
    },
  };
}

/** `{ ok, reason }` for a measurement of `mesurerCarte`. */
export function jugerCarte(m) {
  if (!m) return { ok: false, reason: 'no card on screen' };
  const faults = [];
  if (Math.abs(m.size.width - CARD_WIDTH) > 0.5 || Math.abs(m.size.height - BLOC_CARTE) > 0.5) {
    faults.push(`card ${m.size.width} × ${m.size.height} px, not ${CARD_WIDTH} × ${BLOC_CARTE}`);
  }
  if (m.titleLines > 2.01) faults.push(`title on ${m.titleLines} lines`);
  if (m.boxes.length === 0) faults.push('no text box measured');
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
  if (m.unfit.length) faults.push(`does not fit the card: ${m.unfit.join(', ')}`);
  if (m.stack) {
    const st = m.stack;
    if (Math.abs(st.height - BLOC_CARTE) > 0.5) faults.push(`stack block ${st.height} px, not ${BLOC_CARTE}`);
    // A stack of one card has no dots (`renderStack`); only the caller knows how many it holds.
    if (st.pill) {
      if (!st.pill.inCard) faults.push('dots outside the card');
      if (!st.pill.solid) faults.push('dots pill not solid');
      if (st.pill.ratio < ICON_CONTRAST_MIN) faults.push(`dots contrast under ${ICON_CONTRAST_MIN}:1 (${st.pill.ratio}:1)`);
    }
    if (st.overlaps.length) faults.push(`dots overlap: ${st.overlaps.join(', ')}`);
  }
  return { ok: faults.length === 0, reason: faults.join(' ; ') };
}

/** One line: the worst box, the worst disc, how many plates, and the dots when stacked. */
export function resumerCarte(m) {
  const wb = m.boxes.reduce((a, b) => (b.ratio < a.ratio ? b : a), { ratio: Infinity });
  const wd = m.discs.reduce((a, d) => (d.ratio < a.ratio ? d : a), { ratio: Infinity });
  return `${m.size.width} × ${m.size.height}, worst text ${wb.ratio}:1 on "${wb.text}", worst icon ${wd.ratio}:1 `
    + `(${wd.cls ?? 'no disc'}), ${m.boxes.filter((b) => b.plate).length}/${m.boxes.length} box(es) on a plate`
    + `${m.stack?.pill ? `, dots ${m.stack.pill.ratio}:1` : ''}`;
}

// --- The in-memory page: `src/` bundled, the test posters served ------------------------------

/** The real stylesheets, taken from `src/index.ts` and never re-listed here. */
export const STYLESHEET_IMPORTS = readFileSync(join(APP, 'src', 'index.ts'), 'utf8')
  .split('\n').filter((l) => /^import '\.\/styles\/[^']+\.css';$/.test(l)).join('\n');

/** Bundles `entry` (TypeScript resolved from `src/`) and returns the page that runs it, `#app`
 *  being `appHtml`. `plugins` lets a check mutate a module of `src/` on its way in. */
export async function bundlePage(entry, { sourcefile, appHtml, plugins = [] }) {
  const out = await build({
    stdin: { contents: entry, resolveDir: join(APP, 'src'), loader: 'ts', sourcefile },
    bundle: true, write: false, format: 'iife', outdir: join(APP, '.verifier-carte'), logLevel: 'error',
    plugins,
  });
  const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const css = out.outputFiles.find((f) => f.path.endsWith('.css')).text;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${css}</style></head>
<body>${appHtml}<script>${js}</script></body></html>`;
}

/** Serves `pageHtml` at `${origin}/` and the test posters at `${origin}/affiche-<name>.png`
 *  (`affiches-essai.mjs`) on `ctx`: the posters are same-origin, as the tones sampler wants. */
export async function servirPage(ctx, origin, pageHtml) {
  await ctx.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const poster = /^\/affiche-(\w+)\.png$/.exec(path)?.[1];
    if (poster && AFFICHES_PNG.has(poster)) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: AFFICHES_PNG.get(poster) });
    }
    if (path === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml });
    return route.fulfill({ status: 404, body: '' });
  });
}
