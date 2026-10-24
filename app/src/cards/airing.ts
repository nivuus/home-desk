/** The "À faire" card for airing (rank 2): an opening left open with the heating on or in the
 *  rain — the very condition of the `aeration` mode (`CONDITIONS.aeration`, `modes.ts`), never a
 *  second copy of it. Not an alert (`alertes.ts` took windows out of that rank on purpose): a
 *  `neutral` background, never the error red.
 *
 *  Its centre button is "later" (task 7 wires it); until then the three places stay empty. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Etat } from '../etat';
import { CONDITIONS } from '../modes';
import type { CardFrame } from '../rendu/card-frame';
import type { Card } from '../stack/types';
import { duration } from './format';
import { S } from './strings';

const TYPE = 'aeration';

/** « Porte balcon (S) Ouverture » → « Porte balcon ». The room code in brackets and the sensor
 *  suffix are the installer's vocabulary; a name in any other language is left as it is. Falls
 *  back on the entity id, never an empty string. */
function openingName(etat: Etat, id: string): string {
  const raw = String(etat.lire(id)?.attributs['friendly_name'] ?? '');
  const clean = raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s*Ouverture\s*$/i, '').trim();
  return clean || id;
}

/** The open openings of the room, the one open longest first. */
function openOnes(s: ScreenState): string[] {
  return s.piece.ouvrants
    .filter((id) => s.etat.estUtilisable(id) && s.etat.lire(id)!.etat === 'on')
    .sort((a, b) => s.etat.lire(a)!.changeLe - s.etat.lire(b)!.changeLe);
}

export function detect(f: Frame, s: ScreenState): Card[] {
  const first = openOnes(s)[0];
  return first !== undefined && CONDITIONS.aeration(f.ctx)
    ? [{ key: `${TYPE}:${first}`, type: TYPE, rank: 2 }] : [];
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
    buttons: [undefined, undefined, undefined],
    background: { kind: 'solid', token: 'neutral' },
    motion: { block: 'bloc:aeration' },
  };
}
