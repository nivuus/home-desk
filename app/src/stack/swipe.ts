/** Decision (2026-10-24): built on `geste.ts` rather than Embla Carousel 8.6.0. Embla wants every
 *  slide in the DOM (sixteen cards, some with images; `renderStack` keeps one), listens to
 *  touch/mouse events and only cancels the `click` that follows a drag (`dragThreshold` decides
 *  that click), while card buttons act on pointer events (`cardPress`); Chromium 119 rules out
 *  neither. Sources: embla-carousel.com/docs/api/options, embla-carousel@8.6.0 `DragHandler`.
 *
 *  Swiping between stack cards, and the press of a card button that a swipe must not fire.
 *
 *  Both rely on the implicit pointer capture of touch input (Pointer Events, "implicit pointer
 *  capture"): every event of a contact goes to its `pointerdown` target and bubbles from there.
 *  A button therefore always sees its own release, and the card, an ancestor, sees the whole
 *  swipe. Neither calls `setPointerCapture`: capturing on the card would steal the button's
 *  release, and capturing on the button would do nothing more.
 *
 *  The tablets' WebView sends a phantom `pointerdown`, with its own pointer id, during a contact
 *  (`geste.ts`, correction round 5): one gesture per element, whatever the pointer id. */
import { SEUIL_PX, DELAI_SECOURS_MS } from '../geste';
import { minuteurFnParDefaut } from '../minuteurs';

/** The card's translation when it changes or snaps back: short, a slide and nothing else. */
export const SLIDE_MS = 180;
/** At either end of the stack the card moves a quarter of the finger: there is nothing further. */
const END_RESISTANCE = 0.25;

export type SwipeHandlers = {
  count: number; index: number; onChange(index: number): void; onTouch(): void;
};

/** Makes `el` (the displayed `.carte`) swipeable. `h` is read at each gesture, so the caller may
 *  update `index`/`count` in place. Returns the detacher, which also ends an open gesture. */
export function attachSwipe(
  el: HTMLElement, h: SwipeHandlers,
  // Injectable like `createGesture`'s, for the safety net below.
  minuteurFn: typeof setTimeout = minuteurFnParDefaut,
): () => void {
  type Gesture = {
    id: number; x0: number; y0: number; dx: number;
    phase: 'pending' | 'swiping' | 'dropped';   // dropped: a vertical move, not ours
    safety: ReturnType<typeof setTimeout>;
  };
  let g: Gesture | null = null;

  const target = (dx: number): number => h.index + (dx < 0 ? 1 : -1);
  const inStack = (i: number): boolean => i >= 0 && i < h.count;
  const offset = (dx: number): number => (inStack(target(dx)) ? dx : dx * END_RESISTANCE);

  function slide(fromPx: number) {
    if (fromPx === 0) return;
    el.animate([{ transform: `translateX(${fromPx}px)` }, { transform: 'none' }],
      { duration: SLIDE_MS, easing: 'ease-out' });
  }

  /** Ends the gesture on every exit path: release, cancel, safety net, detach. */
  function end(): Gesture | null {
    const done = g;
    if (done === null) return null;
    clearTimeout(done.safety);
    g = null;
    el.style.transform = '';
    return done;
  }

  function down(e: PointerEvent) {
    if (g !== null) return;   // the phantom contact, or a second finger
    h.onTouch();
    // A release the WebView never delivers must not leave the card offset and locked for good.
    const safety = minuteurFn(() => { const lost = end(); if (lost) slide(offset(lost.dx)); }, DELAI_SECOURS_MS);
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, phase: 'pending', safety };
  }

  /** The gesture belongs to the pointer that opened it: a phantom's moves and release are not its. */
  const mine = (e: PointerEvent): boolean => g !== null && e.pointerId === g.id;

  function move(e: PointerEvent) {
    if (g === null || !mine(e) || g.phase === 'dropped') return;
    const dx = e.clientX - g.x0;
    if (g.phase === 'pending') {
      const dy = e.clientY - g.y0;
      if (Math.hypot(dx, dy) < SEUIL_PX) return;
      // Decided once, like `geste.ts`: a mostly vertical move stays the page's (`pan-y`).
      g.phase = Math.abs(dx) > Math.abs(dy) ? 'swiping' : 'dropped';
      if (g.phase === 'dropped') return;
    }
    g.dx = dx;
    el.style.transform = `translateX(${offset(dx)}px)`;
  }

  function up(e: PointerEvent) {
    if (!mine(e)) return;
    const done = end();
    if (done === null || done.phase !== 'swiping') return;
    const next = target(done.dx);
    // Brought back near its start, the finger changed its mind: the card stays.
    if (!inStack(next) || Math.abs(done.dx) < SEUIL_PX) { slide(offset(done.dx)); return; }
    h.onChange(next);
    // The new card comes in from the side opposite the push, as if the stack slid under the finger.
    slide(-Math.sign(done.dx) * el.getBoundingClientRect().width);
  }

  function cancel(e: PointerEvent) {
    if (!mine(e)) return;
    const done = end();
    if (done !== null && done.phase === 'swiping') slide(offset(done.dx));
  }

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    end();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
  };
}

/** Press state, kept per button ELEMENT and not in the handlers' closure: `lit` installs new
 *  handlers at every render (the clock, any HA state), and a render between contact and release
 *  must not lose the press. */
type PressState = { id: number; x0: number; y0: number; t0: number; armed: boolean };
const presses = new WeakMap<Element, PressState>();

export type CardPressHandlers = {
  onpointerdown: (e: PointerEvent) => void; onpointermove: (e: PointerEvent) => void;
  onpointerup: (e: PointerEvent) => void; onpointercancel: (e: PointerEvent) => void;
};

/** A card button: `.appuye` from contact, the action on release if the finger moved less than
 *  `SEUIL_PX`. Acting at contact (`interaction.ts`) would fire every swipe that starts on a
 *  button; the immediate feedback keeps the press feeling instant. */
export function cardPress(act: () => void): CardPressHandlers {
  const settle = (b: Element) => { presses.delete(b); b.classList.remove('appuye'); };
  return {
    onpointerdown(e) {
      const b = e.currentTarget as Element;
      const open = presses.get(b);
      // A release lost by the WebView leaves a press open: past the same delay as `geste.ts`'s
      // safety net it is stale, read from the event's own clock so a press arms no timer.
      if (open !== undefined && e.timeStamp - open.t0 < DELAI_SECOURS_MS) return;   // phantom
      presses.set(b, { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, armed: true });
      b.classList.add('appuye');
    },
    onpointermove(e) {
      const b = e.currentTarget as Element;
      const p = presses.get(b);
      if (p === undefined || p.id !== e.pointerId || !p.armed) return;
      if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < SEUIL_PX) return;
      // Kept open but disarmed until its release: a phantom contact must not re-arm it.
      p.armed = false;
      b.classList.remove('appuye');
    },
    onpointerup(e) {
      const b = e.currentTarget as Element;
      const p = presses.get(b);
      if (p === undefined || p.id !== e.pointerId) return;   // nothing pressed, or the phantom's release
      settle(b);
      if (p.armed) act();
    },
    onpointercancel(e) {
      const b = e.currentTarget as Element;
      if (presses.get(b)?.id === e.pointerId) settle(b);
    },
  };
}
