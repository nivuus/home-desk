/** The ink card (an IPP printer, Home Assistant's `ipp` integration): a soft reminder (rank 5)
 *  while a cartridge reads under the appliance's `seuil` (strictly). A card of the whole house
 *  never shows.
 *
 *  `niveaux` lists the marker sensors (the contract takes `sensor.*`). Source, home-assistant/core
 *  `components/ipp/sensor.py`, read 2026-10-24: one sensor per marker, named by the printer
 *  (`marker.name`), unit `%`, state the marker `level` — `None` (so `unknown`) when the printer
 *  reports a negative level; attributes `marker_type`, `marker_high_level`, `marker_low_level`.
 *  The integration publishes NO marker colour, so the bars are the stack's flat gauge, labelled
 *  by the sensor's `friendly_name`, never tinted by a colour we would have to guess.
 *
 *  A level that is `unavailable`, `unknown` or not a number is absent: no bar, and no card by
 *  itself. Only the central button, "later". */
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Appareil } from '../configuration';
import type { CardFrame } from '../rendu/card-frame';
import { html } from 'lit';
import { cardEntities } from '../stack/appliances';
import type { Card, Rank } from '../stack/types';
import { laterButton } from './actions';
import { gaugeRow } from './gauge';
import { valueOf } from './measure';
import { nameOf } from './readings';
import { S } from './strings';

const TYPE = 'encre';
/** Bars the middle zone holds; the lowest levels keep theirs. */
const MAX_BARS = 5;

type Ink = { niveaux: string[]; seuil: number };

function adapt(a: Appareil): Ink {
  const niveaux = a.entites['niveaux'];
  if (!Array.isArray(niveaux) || niveaux.length === 0) throw new Error(`house: ${a.type} in ${a.piece} declares no niveaux`);
  if (a.seuil === undefined) throw new Error(`house: ${a.type} in ${a.piece} declares no seuil`);
  return { niveaux, seuil: a.seuil };
}

const keyOf = (i: Ink): string => `${TYPE}:${i.niveaux[0]}`;

type Level = { id: string; value: number };
const levels = (s: ScreenState, i: Ink): Level[] =>
  i.niveaux.flatMap((id): Level[] => { const value = valueOf(s, id); return value === null ? [] : [{ id, value }]; });

const rankOf = (s: ScreenState, i: Ink): Rank | null => (levels(s, i).some((l) => l.value < i.seuil) ? 5 : null);

const inks = (s: ScreenState): Ink[] =>
  cardEntities(s, { type: TYPE, own: undefined, adapt, key: keyOf, rank: rankOf });

export function detect(_f: Frame, s: ScreenState): Card[] {
  return inks(s).flatMap((i) => {
    const rank = rankOf(s, i);
    return rank === null ? [] : [{ key: keyOf(i), type: TYPE, rank }];
  });
}

/** The bars shown: all of them, or the `MAX_BARS` lowest in declared order. */
function shown(all: Level[]): Level[] {
  if (all.length <= MAX_BARS) return all;
  const kept = new Set([...all].sort((a, b) => a.value - b.value).slice(0, MAX_BARS));
  return all.filter((l) => kept.has(l));
}

export function frame(card: Card, _f: Frame, s: ScreenState): CardFrame {
  const i = inks(s).find((x) => keyOf(x) === card.key);
  if (i === undefined) throw new Error(`ink card: no appliance for ${card.key}`);
  return {
    key: card.key,
    label: S.inkLabel,
    title: S.ink,
    middle: html`<div class="encre-barres">${shown(levels(s, i)).map((l) => gaugeRow(nameOf(s.etat, l.id), l.value))}</div>`,
    buttons: [undefined, laterButton(s, card.key), undefined],
    background: { kind: 'solid', token: 'neutral' },
    motion: { block: 'bloc:encre' },
  };
}
