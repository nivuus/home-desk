/** The media cards (rank 3): `cinema` for a source whose screen is on, `media` for the source the
 *  tablet follows (own, else what plays elsewhere). Both draw the existing media card
 *  (`mediaFrame`); only the key differs. A source that is both is a single `cinema` card. */
import type { Frame } from '../boot/frame';
import { tonesToPaint } from '../boot/card-tones';
import type { ScreenState } from '../boot/state';
import type { SourceResolue } from '../media';
import { sourceKey } from '../media-choice';
import type { CardFrame } from '../rendu/card-frame';
import { mediaFrame } from '../rendu/media';
import type { Card } from '../stack/types';

export function detect(f: Frame, _s: ScreenState): Card[] {
  const cards: Card[] = [];
  const screenOn = f.sources.find((x) => x.allumee);
  if (screenOn !== undefined) cards.push({ key: `cinema:${sourceKey(screenOn)}`, type: 'cinema', rank: 3 });
  const followed = f.media.source;
  if (followed !== undefined && (screenOn === undefined || sourceKey(followed) !== sourceKey(screenOn))) {
    cards.push({ key: `media:${sourceKey(followed)}`, type: 'media', rank: 3 });
  }
  return cards;
}

export function frame(card: Card, f: Frame, s: ScreenState): CardFrame {
  const wanted = card.key.slice(card.type.length + 1);
  const cinema = card.type === 'cinema';
  const candidates: (SourceResolue | undefined)[] = cinema ? f.sources : [f.media.source];
  const src = candidates.find((x) => x !== undefined && sourceKey(x) === wanted);
  if (src === undefined) throw new Error(`media card: no source for ${card.key}`);
  // Pausing a source of another room pins it; only the followed card can be that source.
  const remote = !cinema && f.media.remote;
  return { ...mediaFrame(src, f.maintenantMs, tonesToPaint(src, s.measuredCard), remote), key: card.key };
}
