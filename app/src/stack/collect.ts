/** The stack of one frame: every card module asked what it has to show (`detect`), the cards
 *  "plus tard" hid removed (`s.snoozed`, task 7), then ordered by rank and by the screen's declared
 *  modes (`orderStack`). And the one dispatch from a card to its module's `frame`. */
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import { AGENCEMENT_DEFAUT } from '../agencement';
import type { CardFrame } from '../rendu/card-frame';
import * as recipe from '../cards/recipe';
import * as timer from '../cards/timer';
import * as media from '../cards/media';
import * as vacuum from '../cards/vacuum';
import * as car from '../cards/car';
import * as airing from '../cards/airing';
import { orderStack } from './order';
import type { Card, CardType } from './types';

type CardModule = {
  detect(f: Frame, s: ScreenState): Card[];
  frame(card: Card, f: Frame, s: ScreenState): CardFrame;
};

/** The modules of the first batch, by the type(s) of card they draw. */
const MODULES: Partial<Record<CardType, CardModule>> = {
  recette: recipe, minuteur: timer, media, cinema: media, aspirateur: vacuum, voiture: car,
  aeration: airing,
};

/** Each module once, even when it draws two types (`media`/`cinema`). */
const DETECTORS: CardModule[] = [...new Set(Object.values(MODULES))];

export function collectStack(f: Frame, s: ScreenState): Card[] {
  const cards = DETECTORS.flatMap((m) => m.detect(f, s)).filter((c) => !s.snoozed.has(c.key));
  return orderStack(cards, f.ctx.modes ?? AGENCEMENT_DEFAUT.modes);
}

export function frameCard(card: Card, f: Frame, s: ScreenState): CardFrame {
  const m = MODULES[card.type];
  if (m === undefined) throw new Error(`stack: no card module for ${card.type}`);
  return m.frame(card, f, s);
}
