#!/usr/bin/env node
/** Render check of the card stack's first batch (spec 2026-10-24), in a real Chromium, WITHOUT
 *  Home Assistant: `src/` bundled by esbuild with the stylesheets of `src/index.ts`, viewport
 *  343 × 585, the system's fallback font (DejaVu Sans here, wider than Roboto: conservative).
 *
 *  1. Every card of the batch (timer, recipe, media, cinema, vacuum, car, airing), built from
 *     fixture states by the app's own `collectStack`/`frameCard`, shown in turn in its stack, in
 *     two variants (each card in its other state: the late timer, the car to plug in, the
 *     stuck robot, other posters) × three scripts (Latin, CJK, Arabic, with titles and room
 *     names too long): the rules of `card-check.mjs` — 311 × 264 at ±0.5 px, title on two lines
 *     at most, nothing past the 585 px frame, worst-pixel contrast ≥ 5:1 for text and ≥ 4.5:1
 *     for icons and dots, dots inside the card overlapping nothing. Then one plain card per
 *     solid token: each of the eight colours carries the dots once.
 *  2. Real touches on a stacked card (`pile-touches.mjs`): a phantom contact during a swipe, a
 *     swipe that starts on a button or a volume stepper, a tap under the threshold.
 *
 *  Exits non-zero at the first fault. Counter-proofs, each of which MUST exit non-zero:
 *    --contre-epreuve            every card forced to 300 px tall
 *    --contre-epreuve=points     the dots laid over the action buttons
 *    --contre-epreuve=contraste  dots the colour of their pill
 *    --contre-epreuve=sans-points  a stack that lost its dots
 *    --contre-epreuve=trois-lignes  titles clamped on three lines
 *    --mutant=lock|threshold|contact   a guard of `stack/swipe.ts` removed (touches only)
 *
 *  Usage: cd app && node outils/verifier-pile.mjs [option] */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import {
  attendreCarteTeintee, bundlePage, jugerCarte, mesurerCarte, resumerCarte, servirPage,
  STYLESHEET_IMPORTS, BLOC_CARTE, HEIGHT, WIDTH,
} from './card-check.mjs';
import { MUTANTS, SCENARIOS, mutationPlugin, runScenario } from './pile-touches.mjs';

const ORIGIN = 'http://verifier-pile.test';
const SCRIPTS = ['latin', 'cjk', 'arabe'];
const VARIANTS = ['a', 'b'];
/** The batch: a stack missing one of them is a fixture that no longer reaches a card. */
const BATCH = ['recette', 'minuteur', 'media', 'cinema', 'aspirateur', 'voiture', 'aeration'];
const TEXT_BOXES = '[data-tone-box], .milieu *';

const COUNTER_PROOFS = {
  '': { css: '.carte { height: 300px !important; }', what: 'every card forced to 300 px' },
  points: { css: '.carte .points { position: absolute; left: 140px; bottom: 30px; }',
    what: 'the dots laid over the action buttons' },
  'trois-lignes': { css: '.carte .titre.deux-lignes { -webkit-line-clamp: 3 !important; }',
    what: 'titles clamped on three lines' },
  'sans-points': { css: '.carte .points { display: none; }', what: 'a stack that lost its dots' },
  contraste: { css: '.carte .points > span { background: '
    + 'var(--mc-secondary, var(--c-disque, var(--md-surface-container-highest))) !important; }',
  what: 'dots the colour of their pill' },
};

function option(name) {
  const arg = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return arg === undefined ? undefined : (arg.split('=')[1] ?? '');
}

async function renderChecks(ctx, url, css) {
  let count = 0;
  const sets = [...SCRIPTS.flatMap((s) => VARIANTS.map((v) => [s, v])), ...SCRIPTS.map((s) => [s, 'tokens'])];
  for (const [script, variant] of sets) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    if (css) await page.evaluate((c) => window.__css(c), css);
    const bottom = await page.evaluate((b) => window.__layout(b), BLOC_CARTE);
    const types = await page.evaluate(([s, v]) => window.__setup(s, v), [script, variant]);
    const missing = variant === 'tokens' ? [] : BATCH.filter((t) => !types.includes(t));
    if (missing.length) return fault(`${script}/${variant}: the stack lacks ${missing.join(', ')} (${types.join(', ')})`);
    for (let i = 0; i < types.length; i++) {
      await page.evaluate((n) => window.__show(n), i);
      const image = await page.evaluate(() => document.querySelector('.carte')?.classList.contains('media'));
      const tinted = !image || await attendreCarteTeintee(page, '.carte');
      const m = tinted ? await mesurerCarte(page, { selector: '.carte', textSelector: TEXT_BOXES }) : null;
      let j = tinted ? jugerCarte(m) : { ok: false, reason: 'the card never showed its picture' };
      const more = [];
      // Every stack posed here holds several cards: its dots must be there.
      if (m && !m.stack?.pill) more.push(`a stack of ${types.length} without its dots`);
      if (m && Math.abs(m.size.bottom - bottom) > 0.5) more.push(`card bottom at ${m.size.bottom} px, not on the frame edge ${bottom}`);
      if (more.length) j = { ok: false, reason: [j.reason, ...more].filter(Boolean).join(' ; ') };
      const ok = j.ok && errors.length === 0;
      count++;
      console.log(`  ${ok ? '✓' : '✗'} ${script}/${variant} ${types[i]} (${i + 1}/${types.length})`
        + `${m ? ` — ${resumerCarte(m)}` : ''}`);
      if (!ok) {
        await page.close();
        return fault(`${script}/${variant} ${types[i]}: ${j.reason}${errors.length ? ` ; page errors: ${errors.join(' | ')}` : ''}`);
      }
    }
    await page.close();
  }
  return count;
}

/** Stops at the first fault, except under a mutant: there every scenario runs, to show which
 *  ones catch it. */
async function touchChecks(ctx, url, everyScenario) {
  let failed = 0;
  for (const sc of SCENARIOS) {
    const r = await runScenario(ctx, url, sc);
    console.log(`  ${r.ok ? '✓' : '✗'} ${sc.what}\n      ${r.detail}`);
    if (!r.ok && !everyScenario) return fault(sc.what);
    if (!r.ok) failed++;
  }
  if (failed) return fault(`${failed}/${SCENARIOS.length} touch scenario(s) failed`);
  return SCENARIOS.length;
}

function fault(reason) {
  console.error(`\nFAULT: ${reason}`);
  return -1;
}

async function main() {
  const proofName = option('contre-epreuve');
  const mutant = option('mutant');
  const proof = proofName === undefined ? undefined : COUNTER_PROOFS[proofName];
  if (proofName !== undefined && proof === undefined) {
    throw new Error(`unknown counter-proof "${proofName}": ${Object.keys(COUNTER_PROOFS).map((k) => k || '(none)').join(', ')}`);
  }
  if (proof) console.log(`COUNTER-PROOF: ${proof.what}. This run MUST fail.`);
  if (mutant) console.log(`MUTANT ${mutant}: ${MUTANTS[mutant]?.what}. This run MUST fail.`);
  const plugins = mutant ? [mutationPlugin(mutant, readFileSync)] : [];
  const pageHtml = await bundlePage(`${STYLESHEET_IMPORTS}\nimport '../outils/pile-fixture.js';\n`, {
    sourcefile: 'pile.ts', plugins,
    appHtml: `<div id="app" class="m3" style="box-sizing:border-box;height:${HEIGHT}px;display:flex;flex-direction:column;">
<div class="corps"><div id="spacer" style="flex:none"></div><div id="pile-host"></div></div></div>`,
  });
  const nav = await chromium.launch({ headless: true });
  try {
    const ctx = await nav.newContext({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });
    await servirPage(ctx, ORIGIN, pageHtml);
    const url = `${ORIGIN}/`;
    let renders = 0;
    // A mutant changes the touch handling only: the renders would say nothing about it.
    if (!mutant) {
      console.log('Stack cards, painted (311 × 264, contrast, dots, the 585 px frame):');
      renders = await renderChecks(ctx, url, proof?.css);
      if (renders < 0) return 1;
    }
    console.log('Card buttons under real touches (CDP touch points):');
    const touches = await touchChecks(ctx, url, mutant !== undefined);
    if (touches < 0) return 1;
    console.log(`\n${renders} card render(s) and ${touches} touch scenario(s): 0 faults.`);
    return 0;
  } finally {
    await nav.close();
  }
}

process.exitCode = await main();
