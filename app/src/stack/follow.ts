import type { Card, StackView } from './types';

/** Without a touch for this long, the stack goes back to its head card. */
export const RETURN_MS = 60_000;

/** Reconciles the view with the freshly ordered stack. Pure: no clock, no state reads. */
export function followStack(prev: StackView, ordered: Card[], nowMs: number): StackView {
  const known = ordered.map((card) => card.key);
  if (known.length === 0) return { displayedKey: null, lastTouchMs: null, known };
  const head = (): StackView => ({ displayedKey: known[0], lastTouchMs: null, known });

  const shown = prev.displayedKey === null ? -1 : known.indexOf(prev.displayedKey);
  if (shown < 0) return head();
  if (prev.lastTouchMs !== null && nowMs - prev.lastTouchMs >= RETURN_MS) return head();

  // Only a card that just appeared may take the place; one that was already there waits for the minute.
  const seen = new Set(prev.known);
  const taker = known.findIndex((key, i) => i < shown && !seen.has(key));
  if (taker >= 0) return { displayedKey: known[taker], lastTouchMs: null, known };

  return { displayedKey: prev.displayedKey, lastTouchMs: prev.lastTouchMs, known };
}

/** Records the user's choice of card and when it was made. */
export function touchStack(prev: StackView, displayedKey: string, nowMs: number): StackView {
  return { ...prev, displayedKey, lastTouchMs: nowMs };
}
