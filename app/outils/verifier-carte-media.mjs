/** The media card on its blurred poster: what the render check measures (spec 2026-10-23,
 *  "Couleurs", amended 2026-10-28: blur and least dimming instead of the plates).
 *
 *  The poster covers the whole card, blurred (`src/poster-filter.ts`); the colours of the text,
 *  the discs and the bars are derived from it (`src/tones.ts`), and it is dimmed only by the
 *  least amount that lifts light text to 5:1 when no tone reaches it otherwise. The rules and the painted-pixel
 *  measurement are shared with the stack check (`card-check.mjs`); this module poses the media
 *  card on the five test posters.
 *
 *  `mesurerCarteMedia` runs on any page that shows the card (the live pages of
 *  `verifier-rendu.mjs`, or the in-memory fixtures below); `autoTestCarteMedia` proves the check
 *  can both fail and pass, on the real render functions and stylesheets bundled from `src/`. */
import {
  attendreCarteTeintee as attendreTeinte, bundlePage, jugerCarte, mesurerCarte, resumerCarte,
  servirPage, STYLESHEET_IMPORTS, BLOC_CARTE, HEIGHT, WIDTH,
} from './card-check.mjs';

export { jugerCarte, resumerCarte };
export { TEXT_CONTRAST_MIN, ICON_CONTRAST_MIN } from './card-check.mjs';

/** Waits for the media card's poster and its tones (`card-check.mjs`). */
export const attendreCarteTeintee = (page, limitMs) => attendreTeinte(page, '.media', limitMs);

/** Measures the media card on `page`; null when no card is on screen. The caller waits for the
 *  card to settle first (`attendreCarteTeintee`, and its own animation guard on the live pages). */
export const mesurerCarteMedia = (page, frameBottom = HEIGHT) =>
  mesurerCarte(page, { selector: '.media', frameBottom });

// --- Auto-test: the real card, bundled from `src/`, on the five test posters ---------------

const ORIGIN = 'http://carte-media.test';

/** The real render functions and the real stylesheets (taken from `src/index.ts`, never
 *  re-listed). `__poser` renders the worst-case card (remote source, two-line title, subtitle,
 *  progress, three transport discs, a volume level), measures it, computes its tones with the
 *  app's own sampler (`computeTones` + `browserSampler`, same origin as the page), and renders it
 *  again with them — the sequence `boot/card-tones.ts` runs on the tablet. `withoutDim` drops
 *  the dimming from the computed tones; `css` overrides the stylesheets before the card is drawn;
 *  `top` moves the card down so its bottom sits on the frame when it is `blocCarte` tall: the
 *  counter-proofs. */
async function bundleFixture() {
  const entry = `${STYLESHEET_IMPORTS}
import { render } from 'lit';
import { Etat } from './etat';
import { resoudreSource, CAP } from './media';
import { rendreCarteMedia, mediaFrame } from './rendu/media';
import { renderStack } from './rendu/stack';
import { measureCard } from './boot/card-tones';
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
/** \`stack\` cards in all: the media card first, then plain solid ones (\`renderStack\`). */
const OTHERS = (n) => Array.from({ length: n - 1 }, (_, i) => ({ key: 'essai:' + i, label: 'ESSAI',
  title: 'Carte ' + i, middle: '', buttons: [undefined, undefined, undefined],
  background: { kind: 'solid', token: 'neutral' } }));
window.__poser = async (poster, { withoutDim = false, script = 'latin', top = 0, css = '', stack = 1 } = {}) => {
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
  const draw = (tones) => (stack > 1
    ? renderStack([mediaFrame(s, now, tones, true), ...OTHERS(stack)], 0)
    : rendreCarteMedia(s, now, tones, true));
  render(draw({ status: 'pending' }), app);
  const spec = measureCard(app.querySelector('.media'));
  const state = await computeTones(s.affiche, spec, browserSampler, location.origin);
  if (state.status !== 'ready') throw new Error('poster tones: ' + state.status);
  const tones = withoutDim ? { status: 'ready', tones: { ...state.tones, dim: 1 } } : state;
  render(draw(tones), app);
};
`;
  return bundlePage(entry, { sourcefile: 'carte.ts',
    appHtml: '<div id="app" class="m3" style="box-sizing:border-box;padding:12px 16px;"></div>' });
}

const pass = (j) => j.ok;
/** What the card looked like before the final review (2026-10-24): `line-height: normal` on the
 *  label, subtitle and times, and a label that wraps. A fallback font grew it past its budget. */
const LINE_HEIGHT_NORMAL = `.media .etiquette, .media .sous-titre, .media-temps { line-height: normal !important; }
  .media .etiquette { white-space: normal !important; }`;
const CASES = [
  ...['claire', 'moyenne', 'sombre', 'pastel'].map((poster) => ({
    poster, options: {}, expected: pass,
    what: `poster "${poster}" with its computed tones: every rule holds`,
  })),
  { poster: 'rayures', options: {}, expected: pass,
    what: 'stripes with their computed tones: the blur alone or with its dimming, every rule holds' },
  { poster: 'moyenne', options: {},
    expected: (j, m) => j.ok && /brightness/.test(m.poster ?? ''),
    what: 'mid-tone poster: no tone reaches 5:1 even blurred, so it is dimmed, and passes' },
  { poster: 'moyenne', options: { withoutDim: true },
    expected: (j) => !j.ok && /text contrast under/.test(j.reason),
    what: 'COUNTER-PROOF: the mid-tone poster with its dimming forced off must be flagged' },
  { poster: 'rayures', options: { css: '.media .carte-image { filter: none !important; }' },
    expected: (j) => !j.ok && /text contrast under/.test(j.reason),
    what: 'COUNTER-PROOF: stripes left sharp under tones computed for the blur must be flagged' },
  { poster: 'claire', options: { css: '.media .titre { background: #f0f0f0; }' },
    expected: (j) => !j.ok && /text on a plate/.test(j.reason),
    what: 'COUNTER-PROOF: a plate put back behind the title must be flagged' },
  { poster: 'moyenne', options: { script: 'cjk', top: HEIGHT - BLOC_CARTE },
    expected: pass,
    what: `CJK title and subtitle, room name too long for the label: within its ${BLOC_CARTE} px budget` },
  { poster: 'moyenne', options: { script: 'cjk', top: HEIGHT - BLOC_CARTE, css: LINE_HEIGHT_NORMAL },
    expected: (j) => !j.ok && /does not fit the card/.test(j.reason),
    what: 'COUNTER-PROOF: the same card with line-height normal and a wrapping label must not fit' },
  ...['claire', 'sombre', 'rayures'].map((poster) => ({
    poster, options: { stack: 3 }, expected: pass,
    what: `stack of 3 on "${poster}": ${BLOC_CARTE} px block, solid dots that overlap nothing` })),
  { poster: 'moyenne', options: { script: 'cjk', top: HEIGHT - BLOC_CARTE, stack: 16 },
    expected: pass,
    what: 'stack of 16 (the widest dots) with a CJK card at the frame bottom: still fits' },
  { poster: 'moyenne', options: { stack: 3, css: '.pile::after { content: ""; display: block; height: 14px; }' },
    expected: (j) => !j.ok && /stack block/.test(j.reason),
    what: 'COUNTER-PROOF: a 14 px row under the card (dots outside it) must be flagged' },
  { poster: 'moyenne', options: { stack: 3, css: '.carte .points { position: absolute; left: 140px; bottom: 30px; }' },
    expected: (j) => !j.ok && /dots overlap/.test(j.reason),
    what: 'COUNTER-PROOF: dots laid over the action buttons must be flagged' },
  { poster: 'moyenne', options: { stack: 3, css: '.carte .points > span { background: var(--mc-secondary) !important; }' },
    expected: (j) => !j.ok && /dots contrast under/.test(j.reason),
    what: 'COUNTER-PROOF: dots the colour of their pill must be flagged' },
  { poster: 'moyenne', options: { css: '.media .bouton { background: rgba(20, 20, 20, .6) !important; }' },
    expected: (j) => !j.ok && /disc not solid/.test(j.reason),
    what: 'COUNTER-PROOF: a translucent disc must be flagged' },
  { poster: 'moyenne', options: { css: '.media .disque { opacity: .55 !important; }' },
    expected: (j) => !j.ok && /disc not solid/.test(j.reason),
    what: 'COUNTER-PROOF: a solid disc made see-through by opacity must be flagged' },
  { poster: 'moyenne', options: { css: '.media .disque { color: var(--mc-secondary) !important; }' },
    expected: (j) => !j.ok && /icon contrast under/.test(j.reason),
    what: 'COUNTER-PROOF: an icon the colour of its disc must be flagged' },
];

/** 0 when every case came out as expected, 1 otherwise. */
export async function autoTestCarteMedia(nav) {
  console.log('Media card auto-test on the blurred poster (painted pixels, the real card from `src/`):');
  const ctx = await nav.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  const pageHtml = await bundleFixture();
  await servirPage(ctx, ORIGIN, pageHtml);
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
    + 'mid-tone one only through its dimming, a CJK card fits its budget, a stack keeps it with solid '
    + 'dots, and a row under the card, overlapping or low-contrast dots, the undimmed mid-tone poster, '
    + 'the unblurred stripes, a plate behind a text, the line-height-normal card, the translucent '
    + 'disc, the see-through disc and the low-contrast icon are flagged.');
  return 0;
}
