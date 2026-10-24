/** The stack on screen (spec 2026-10-24, "Anatomie d'une carte"): the displayed card alone in the
 *  DOM, with one dot per card, the current one elongated — only when there is more than one
 *  card. The dots sit INSIDE the card, at the end of its label row (`renderCardFrame`'s
 *  `position`): the stack block is exactly the card's 264 px, which is what the budget bills.
 *  Swiping is attached by the caller on the `.pile` around the card (`boot/home-stack.ts`, `stack/swipe.ts`). */
import { html, type TemplateResult } from 'lit';
import { renderCardFrame, type CardFrame } from './card-frame';

export function renderStack(frames: CardFrame[], displayedIndex: number): TemplateResult {
  const shown = frames[displayedIndex];
  // An empty stack shows the screen's default block, never this: a missing card is a caller bug.
  if (shown === undefined) throw new RangeError(`no card at ${displayedIndex} in a stack of ${frames.length}`);
  const dots = frames.length > 1
    ? html`<div class="points" aria-hidden="true">${frames.map((f, i) =>
        html`<span class=${i === displayedIndex ? 'courant' : ''} data-card=${f.key}></span>`)}</div>`
    : undefined;
  return html`<div class="pile">${renderCardFrame(shown, dots)}</div>`;
}
