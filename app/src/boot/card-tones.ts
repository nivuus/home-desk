/** The image tones of the card on screen, between two paints.
 *
 *  `tonesFor` (`rendu/poster-sampler.ts`) needs the card's size and the boxes of its texts, and
 *  those only exist once the card is laid out. So each paint uses what the PREVIOUS paint
 *  measured, and the card is measured again right after painting: when the measurement changed
 *  (first appearance, new image, a title on one more line, a wider time), the card is repainted
 *  with the new boxes. The plate and the image layer never change the layout (`cards.css`), so
 *  the measurement after that repaint is the same and no further paint follows.
 *
 *  The image is read once per URL; the tones of any boxes on it are then synchronous. So only a
 *  NEW image paints the theme card while it is read; a box that changes on the same image keeps
 *  it, and its one intermediate paint uses the tones of the boxes measured a paint earlier on
 *  that same image, corrected by the repaint queued on the next task. */
import type { Box } from '../tones';
import { cacheKey, tonesFor, type CardSpec, type ToneState } from '../rendu/poster-sampler';
import type { ScreenState } from './state';

/** What the last paint measured, and for which image. */
export type MeasuredCard = { url: string; spec: CardSpec };

const NO_IMAGE: ToneState = { status: 'pending' };

/** The tones to paint a subject's image (`affiche`) with. Pending (the theme card) until the
 *  card has been measured, with a non-zero size, for this very image. */
export function tonesToPaint(subject: { affiche?: string }, measured: MeasuredCard | null): ToneState {
  if (subject.affiche === undefined || measured === null || measured.url !== subject.affiche) {
    return NO_IMAGE;
  }
  return tonesFor(subject.affiche, measured.spec);
}

/** Layout position of `el` inside `card`, through the offset chain: layout coordinates, never
 *  `getBoundingClientRect`, which a running motion-engine transform would skew. `cards.css`
 *  keeps every ancestor of a tone box between it and `.carte` unpositioned, so the chain ends
 *  on the card; anything else is a broken stylesheet, reported rather than measured wrong. */
function boxIn(el: HTMLElement, card: HTMLElement): Box {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node !== null && node !== card) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== card) throw new Error('card: a tone box is not laid out inside .carte');
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** The card's size and text boxes, or null while it is not laid out (zero size: hidden page,
 *  or jsdom, which lays nothing out). */
export function measureCard(card: HTMLElement): CardSpec | null {
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  if (w === 0 || h === 0) return null;
  const boxes = Array.from(card.querySelectorAll<HTMLElement>('[data-tone-box]'))
    .map((el) => boxIn(el, card));
  return { w, h, boxes };
}

/** Called right after a paint that put an image card on screen with the image `url`. */
export function afterCardPaint(s: ScreenState, url: string): void {
  // The live card comes first in the tree: the engine's exit layer is the last child of `racine`.
  const card = s.racine.querySelector<HTMLElement>('.carte');
  const spec = card === null ? null : measureCard(card);
  if (spec === null) { s.measuredCard = null; return; }
  const before = s.measuredCard;
  if (before !== null && cacheKey(before.url, before.spec) === cacheKey(url, spec)) return;
  s.measuredCard = { url, spec };
  // An image still unknown starts its reading and `onTonesReady` repaints; an image already read
  // gives these boxes' tones at once, so the repaint is asked for here — on the next task, never
  // from inside the current paint.
  if (tonesFor(url, spec).status !== 'pending') s.d.minuteurFn(s.dessiner, 0);
}
