/** Repeat while a button is held (the media card's volume steps). The press itself — the step
 *  of a tap, and what a swipe cancels — belongs to `cardPress` (`stack/swipe.ts`), which starts
 *  this at contact: nothing fires here before `delayMs`, so a tap or a swipe never repeats.
 *
 *  The end listeners are added at contact, after the button's own `lit` handlers: on the same
 *  `pointerup`, `cardPress` decides the tap first, then this ends (DOM listener order). */
export type HoldTiming = { delayMs: number; everyMs: number };

/** Fires once the press has lasted `delayMs`, then every `everyMs`, until the press ends: the
 *  finger lifts or is cancelled (on the button or anywhere in the document — a touch can be
 *  released elsewhere), leaves the button, loses its pointer capture, or the button
 *  leaves the DOM (re-rendered away mid-press: it would never see its own `pointerup`, and the
 *  repeat would run to the end of the scale and on forever). `onEnd` runs once, whatever ended
 *  it. Returns the stop function. */
export function holdRepeat(
  el: HTMLElement, fire: () => void, opts: HoldTiming,
  onEnd: () => void = () => {},
): () => void {
  let repeat: ReturnType<typeof setInterval> | undefined;
  let ended = false;
  const tick = (): void => {
    if (!el.isConnected) { stop(); return; }
    fire();
  };
  const stop = (): void => {
    if (ended) return;
    ended = true;
    clearTimeout(delay);
    if (repeat !== undefined) clearInterval(repeat);
    for (const type of BUTTON_ENDS) el.removeEventListener(type, stop);
    for (const type of DOCUMENT_ENDS) document.removeEventListener(type, stop);
    onEnd();
  };
  const delay = setTimeout(() => { tick(); repeat = setInterval(tick, opts.everyMs); }, opts.delayMs);
  for (const type of BUTTON_ENDS) el.addEventListener(type, stop);
  for (const type of DOCUMENT_ENDS) document.addEventListener(type, stop);
  return stop;
}

const BUTTON_ENDS = ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'] as const;
const DOCUMENT_ENDS = ['pointerup', 'pointercancel'] as const;
