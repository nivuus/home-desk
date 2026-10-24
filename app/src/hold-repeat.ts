/** Repeat while a button is held (the media card's volume steps). The press itself — the step
 *  of a tap, what a swipe cancels, and the end of the press — belongs to `cardPress`
 *  (`stack/swipe.ts`), which starts this at contact: nothing fires here before `delayMs`, so a
 *  tap or a swipe never repeats. */
import { DELAI_SECOURS_MS } from './geste';

export type HoldTiming = { delayMs: number; everyMs: number };

/** Fires once the press has lasted `delayMs`, then every `everyMs`, until it is stopped, or the
 *  press of `pointerId` ends on its own: that pointer is cancelled, leaves the button or loses
 *  its capture, lifts anywhere in the document (a touch can be released elsewhere), or the button
 *  leaves the DOM (re-rendered away mid-press: it would never see its own `pointerup`).
 *  Only THAT pointer ends it: the WebView's phantom contact, or another finger, carries another
 *  id. A release that never arrives at all stops it at `DELAI_SECOURS_MS` (`geste.ts`'s net):
 *  a lost `pointerup` must not run the volume to the end of the scale.
 *  `onEnd` runs once, whatever ended it, unless the caller stopped it. Returns the stop function. */
export function holdRepeat(
  el: HTMLElement, fire: () => void, opts: HoldTiming, pointerId: number,
  onEnd: () => void = () => {},
): () => void {
  let repeat: ReturnType<typeof setInterval> | undefined;
  let ended = false;
  const startedMs = Date.now();
  const tick = (): void => {
    if (!el.isConnected || Date.now() - startedMs >= DELAI_SECOURS_MS) { end(); return; }
    fire();
  };
  const stop = (): void => {
    if (ended) return;
    ended = true;
    clearTimeout(delay);
    if (repeat !== undefined) clearInterval(repeat);
    for (const type of BUTTON_ENDS) el.removeEventListener(type, ownEnd);
    for (const type of DOCUMENT_ENDS) document.removeEventListener(type, ownEnd);
  };
  const end = (): void => { if (!ended) { stop(); onEnd(); } };
  const ownEnd = (e: Event): void => { if ((e as PointerEvent).pointerId === pointerId) end(); };
  const delay = setTimeout(() => { tick(); repeat = setInterval(tick, opts.everyMs); }, opts.delayMs);
  for (const type of BUTTON_ENDS) el.addEventListener(type, ownEnd);
  for (const type of DOCUMENT_ENDS) document.addEventListener(type, ownEnd);
  return stop;
}

// `pointerup` is not among the button's ends: the press's own release reaches `cardPress`, which
// decides the tap and then stops the hold. The document's `pointerup` comes after it (bubbling).
const BUTTON_ENDS = ['pointercancel', 'pointerleave', 'lostpointercapture'] as const;
const DOCUMENT_ENDS = ['pointerup', 'pointercancel'] as const;
