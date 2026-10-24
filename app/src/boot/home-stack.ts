/** The card stack in the home view's central block (spec 2026-10-24): which card is displayed,
 *  the swipe between cards, the return to the head card after a minute without a touch, and
 *  what the displayed card needs once painted (the timer and progress anchors of the per-second
 *  ticks, the image tones). `boot/home.ts` calls `paintStack` before painting and
 *  `afterStackPaint` after; nothing else of the stack lives there. */
import type { TemplateResult } from 'lit';
import { ancrerMinuteur } from '../minuteur';
import { ancrerProgression } from '../progression';
import { renderStack } from '../rendu/stack';
import { sourceOf } from '../cards/media';
import { timerOf } from '../cards/timer';
import { frameCard } from '../stack/collect';
import { followStack, touchStack, RETURN_MS } from '../stack/follow';
import { attachSwipe, type SwipeHandlers } from '../stack/swipe';
import type { Card } from '../stack/types';
import { afterCardPaint } from './card-tones';
import { horlogeMonotone } from './constants';
import type { Frame } from './frame';
import type { ScreenState } from './state';

/** The stack's block for this frame, `undefined` when it is empty (the screen's default block
 *  comes back). `cards` is the ordered stack (`collectStack`). */
export function paintStack(s: ScreenState, f: Frame, cards: Card[]): TemplateResult | undefined {
  const view = followStack(s.stack, cards, f.maintenantMs);
  // A view without a touch — a card that took the place, the return to the head, an emptied
  // stack — has nothing left to return from: a return armed by an earlier touch must not fire.
  if (view.lastTouchMs === null) s.jetonRetourPile++;
  s.stack = view;
  const index = view.displayedKey === null ? -1 : view.known.indexOf(view.displayedKey);
  if (index < 0) { s.stackShown = null; return undefined; }
  const frames = cards.map((c) => frameCard(c, f, s));
  s.stackShown = { card: cards[index], frame: frames[index] };
  return renderStack(frames, index);
}

/** Called right after the home view was painted, whatever its central block: the stack may have
 *  left the screen (alert, offline, a layout without the central block) as well as entered it. */
export function afterStackPaint(s: ScreenState, f: Frame): void {
  const shown = s.stackShown;
  const pile = shown === null ? null : s.racine.querySelector<HTMLElement>('.pile');
  bindSwipe(s, pile);
  if (shown === null || pile === null) {
    s.ancreProgression = null;
    s.measuredCard = null;
    return;
  }
  const { card, frame } = shown;
  // The per-second ticks write into the displayed card only (`boot/timers.ts`): its countdown,
  // or its progress rail. `ancresMinuteurs` was emptied by `dessiner()` before any early return.
  const v = card.type === 'minuteur' ? timerOf(card, f) : undefined;
  if (v !== undefined) s.ancresMinuteurs = new Map([[v.slot, ancrerMinuteur(v, horlogeMonotone())]]);
  s.ancreProgression = card.type === 'media' || card.type === 'cinema'
    ? ancrerProgression(sourceOf(card, f).progression, f.maintenantMs, horlogeMonotone())
    : null;
  if (frame.background.kind === 'image') afterCardPaint(s, frame.background.url);
  else s.measuredCard = null;
}

/** Attaches the swipe to `.pile`, never to `.carte`: `lit` rewrites the card's `style` (its
 *  colour token, its tones) on a redraw, which would drop the offset of a drag in progress; the
 *  wrapper keeps no binding. Attached even to a stack of one card, whose capture-phase lock is
 *  what keeps a phantom contact from opening a press of its own (`stack/swipe.ts`). */
function bindSwipe(s: ScreenState, pile: HTMLElement | null): void {
  if (s.stackSwipe !== null && s.stackSwipe.el !== pile) {
    s.stackSwipe.detach();
    s.stackSwipe = null;
  }
  if (pile === null) return;
  const count = s.stack.known.length;
  const index = s.stack.displayedKey === null ? 0 : s.stack.known.indexOf(s.stack.displayedKey);
  if (s.stackSwipe !== null) {
    // The handlers are read at each gesture: updated in place, a gesture in progress keeps going.
    s.stackSwipe.h.count = count;
    s.stackSwipe.h.index = index;
    return;
  }
  const h: SwipeHandlers = { count, index, onChange: (i) => choose(s, i), onTouch: () => touched(s) };
  s.stackSwipe = { el: pile, h, detach: attachSwipe(pile, h, s.d.minuteurFn) };
}

/** Arms the return to the head card a minute after this touch; the token makes it the only one. */
function armReturn(s: ScreenState): void {
  const mine = ++s.jetonRetourPile;
  s.d.minuteurFn(() => { if (mine === s.jetonRetourPile) s.dessiner(); }, RETURN_MS);
}

function touched(s: ScreenState): void {
  if (s.stack.displayedKey === null) return;
  s.stack = touchStack(s.stack, s.stack.displayedKey, s.d.maintenant().getTime());
  armReturn(s);
}

function choose(s: ScreenState, index: number): void {
  const key = s.stack.known[index];
  if (key === undefined) return;
  s.stack = touchStack(s.stack, key, s.d.maintenant().getTime());
  armReturn(s);
  s.dessiner();
}
