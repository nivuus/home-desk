/** The poster tones of the media card: the generic image-card gesture (`card-tones.ts`) applied
 *  to the source's poster. A source without a poster forgets the last measurement, so a poster
 *  that comes back is measured afresh. */
import type { SourceResolue } from '../media';
import { afterCardPaint } from './card-tones';
import type { ScreenState } from './state';

/** Called right after a paint that put the card on screen with `source`. */
export function afterMediaPaint(s: ScreenState, source: SourceResolue): void {
  if (source.affiche === undefined) { s.measuredCard = null; return; }
  afterCardPaint(s, source.affiche);
}
