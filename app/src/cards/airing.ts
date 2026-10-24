/** The "À faire" card for airing (rank 2): an opening left open with the heating on or in the
 *  rain — the very condition of the `aeration` mode (`CONDITIONS.aeration`, `modes.ts`), never a
 *  second copy of it. Not an alert (`alertes.ts` took windows out of that rank on purpose): a
 *  `neutral` background, never the error red.
 *
 *  Its one button, in the centre, is "later": the window itself is closed by hand. One card per
 *  room, keyed by the room: which openings are open changes under it, and a "later" must not. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Etat } from '../etat';
import { CONDITIONS } from '../modes';
import type { CardFrame } from '../rendu/card-frame';
import type { Card } from '../stack/types';
import { laterButton } from './actions';
import { duration } from './format';
import { S } from './strings';

const TYPE = 'aeration';

/** The opening's name without its room code in brackets (« Porte balcon (S) » → « Porte
 *  balcon »): the card already stands in that room. No word is ever stripped — a name reads as
 *  the owner gave it, in any language. Falls back on the entity id, never an empty string. */
function openingName(etat: Etat, id: string): string {
  const raw = String(etat.lire(id)?.attributs['friendly_name'] ?? '');
  const clean = raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return clean || id;
}

/** The open openings of the room, the one open longest first. */
function openOnes(s: ScreenState): string[] {
  return s.piece.ouvrants
    .filter((id) => s.etat.estUtilisable(id) && s.etat.lire(id)!.etat === 'on')
    .sort((a, b) => s.etat.lire(a)!.changeLe - s.etat.lire(b)!.changeLe);
}

export function detect(f: Frame, s: ScreenState): Card[] {
  return openOnes(s).length > 0 && CONDITIONS.aeration(f.ctx)
    ? [{ key: `${TYPE}:${s.piece.nom}`, type: TYPE, rank: 2 }] : [];
}

export function frame(card: Card, f: Frame, s: ScreenState): CardFrame {
  const open = openOnes(s);
  if (open.length === 0) throw new Error(`airing card: nothing open for ${card.key}`);
  const since = f.maintenantMs - s.etat.lire(open[0])!.changeLe;
  return {
    key: card.key,
    label: S.airing,
    title: open.map((id) => openingName(s.etat, id)).join(S.separator),
    middle: html`<div class="carte-ligne">${S.openSince(duration(since))}</div>`,
    buttons: [undefined, laterButton(s, card.key), undefined],
    background: { kind: 'solid', token: 'neutral' },
    motion: { block: 'bloc:aeration' },
  };
}
