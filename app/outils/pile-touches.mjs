/** The card buttons of a stacked card under REAL touches (`verifier-pile.mjs`): touch points sent
 *  through the Chrome DevTools Protocol (`Input.dispatchTouchEvent`), so Chromium itself turns
 *  them into pointer events, with its own pointer ids, `touch-action` and the implicit pointer
 *  capture of touch input — what `stack/swipe.ts` relies on and what jsdom cannot show.
 *
 *  The phantom: the tablets' WebView sends a second `pointerdown`, with its own pointer id,
 *  during a contact (`geste.ts`). A second touch point is exactly that to the page. Each
 *  scenario also checks that the contacts it made really reached the page (`__pointers`), so a
 *  scenario that silently touched nothing cannot pass. */

const STEP_PX = 10;
const SWIPE_PX = 120;
/** Under `SEUIL_PX` (11 px, `geste.ts`): a tap whose finger slid a little. */
const TAP_SLIDE_PX = 4;

/** The centre of `selector`'s `nth` match, in viewport pixels. */
async function centre(page, selector, nth = 0) {
  const box = await page.locator(selector).nth(nth).boundingBox();
  if (box === null) throw new Error(`nothing to touch at ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Touch points 1 and 2 (`id`), driven one event at a time. A `touchEnd` lifts the points it
 *  lists, or every point when it lists none (measured on this Chromium: a point merely left out
 *  of a `touchMove` stays down). */
function touchscreen(cdp) {
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: points.map(({ x, y, id }) => ({ x, y, id })),
  });
  return {
    start: (points) => send('touchStart', points),
    lift: (points) => send('touchEnd', points),
    end: () => send('touchEnd', []),
    /** Slides point `p` by `dx` in `STEP_PX` steps, `others` held still. */
    async slide(p, dx, others = []) {
      const n = Math.ceil(Math.abs(dx) / STEP_PX);
      for (let i = 1; i <= n; i++) {
        p.x += Math.sign(dx) * Math.min(STEP_PX, Math.abs(dx) - (i - 1) * STEP_PX);
        await send('touchMove', [p, ...others]);
      }
    },
  };
}

const PAUSE = '.actions .bouton.primaire';
const NEXT = '.actions .bouton >> nth=2';
const PLUS = '.media-pas >> nth=1';
const acts = (log) => log.filter((l) => !l.startsWith('swipe.'));
const swipes = (log) => log.filter((l) => l.startsWith('swipe.'));

/** A swipe from `from`, with a phantom pointerdown on `phantom` half-way, lifted before the swipe ends. */
const swipeWithPhantom = (from, phantom) => async (page, t) => {
  const p1 = { ...(await centre(page, from)), id: 1 };
  await t.start([p1]);
  await t.slide(p1, -SWIPE_PX / 2);
  const p2 = { ...(await centre(page, phantom)), id: 2 };
  await t.start([p1, p2]);
  await t.lift([p2]);
  await t.slide(p1, -SWIPE_PX / 2);
  await t.end();
};
const swipeFrom = (from) => async (page, t) => {
  const p1 = { ...(await centre(page, from)), id: 1 };
  await t.start([p1]);
  await t.slide(p1, -SWIPE_PX);
  await t.end();
};
const tapOn = (on) => async (page, t) => {
  const p1 = { ...(await centre(page, on)), id: 1 };
  await t.start([p1]);
  await t.slide(p1, TAP_SLIDE_PX);
  await t.end();
};

/** `contacts`: the pointerdowns the page must have seen, with distinct ids. */
export const SCENARIOS = [
  { what: 'a phantom pointerdown on the pause button during a swipe from the title fires nothing',
    run: swipeWithPhantom('.carte .titre', PAUSE), contacts: 2,
    expected: (log) => acts(log).length === 0 && swipes(log).length === 1 },
  { what: 'a phantom pointerdown on a volume stepper during a swipe from the next button fires nothing',
    run: swipeWithPhantom(NEXT, PLUS), contacts: 2,
    expected: (log) => acts(log).length === 0 && swipes(log).length === 1 },
  { what: 'a swipe that starts on the pause button does not fire it',
    run: swipeFrom(PAUSE), contacts: 1,
    expected: (log) => acts(log).length === 0 && swipes(log).length === 1 },
  { what: 'a swipe that starts on a volume stepper does not step',
    run: swipeFrom(PLUS), contacts: 1,
    expected: (log) => acts(log).length === 0 && swipes(log).length === 1 },
  { what: `a tap on the pause button that slides ${TAP_SLIDE_PX} px fires it exactly once`,
    run: tapOn(PAUSE), contacts: 1,
    expected: (log) => acts(log).length === 1 && swipes(log).length === 0 },
  { what: `a tap on a volume stepper that slides ${TAP_SLIDE_PX} px steps exactly once`,
    run: tapOn(PLUS), contacts: 1,
    expected: (log) => acts(log).length === 1 && swipes(log).length === 0 },
];

/** Runs one scenario on a fresh page of `ctx` (a context with `hasTouch`); `{ ok, detail }`. */
export async function runScenario(ctx, url, sc) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(url);
    await page.evaluate(() => window.__touchSetup());
    const cdp = await ctx.newCDPSession(page);
    await sc.run(page, touchscreen(cdp));
    // The slide animation and any repaint queued by the last event.
    await page.waitForTimeout(250);
    const { log, pointers } = await page.evaluate(() => ({ log: window.__log, pointers: window.__pointers }));
    const ids = new Set(pointers.filter((p) => p.startsWith('pointerdown:')).map((p) => p.split(':')[1]));
    const reached = ids.size === sc.contacts;
    const ok = errors.length === 0 && reached && sc.expected(log);
    const detail = `actions [${acts(log).join(', ')}], swipes ${swipes(log).length}, `
      + `pointers [${pointers.join(' ')}]${reached ? '' : ` — expected ${sc.contacts} contact(s)`}`
      + `${errors.length ? ` — page errors: ${errors.join(' | ')}` : ''}`;
    return { ok, detail };
  } finally {
    await page.close();
  }
}

/** Mutations of `src/stack/swipe.ts`, applied on its way into the bundle (`--mutant=<name>`):
 *  each removes one guard, and the touch scenarios must catch it. */
export const MUTANTS = {
  lock: { what: 'the capture-phase lock: a second contact reaches the card buttons',
    from: '    if (g !== null) { e.stopPropagation(); return; }\n', to: '' },
  threshold: { what: 'the travel threshold: a press that slid still acts on release',
    from: '      p.armed = false;\n', to: '' },
  contact: { what: 'act on release: the press also acts on contact',
    from: "      b.classList.add('appuye');\n", to: "      b.classList.add('appuye');\n      act();\n" },
};

/** The esbuild plugin that applies `mutant` to `stack/swipe.ts`; refuses a mutation whose
 *  source text is gone (a mutant that changes nothing would prove nothing). */
export function mutationPlugin(name, readFile) {
  const m = MUTANTS[name];
  if (m === undefined) throw new Error(`unknown mutant ${name}: ${Object.keys(MUTANTS).join(', ')}`);
  return {
    name: `mutant-${name}`,
    setup(b) {
      b.onLoad({ filter: /[\\/]src[\\/]stack[\\/]swipe\.ts$/ }, (args) => {
        const source = readFile(args.path, 'utf8');
        if (!source.includes(m.from)) throw new Error(`mutant ${name}: its source text is no longer in swipe.ts`);
        return { contents: source.replace(m.from, m.to), loader: 'ts' };
      });
    },
  };
}
