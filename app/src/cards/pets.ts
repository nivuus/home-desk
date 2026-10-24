/** The pets card: the fountain and the feeder of the room, shown while one of them has a problem
 *  (rank 2, it waits for a gesture). The appliance exists only in the house (`stack/appliances.ts`).
 *
 *  Roles, each a `binary_sensor` (the contract enforces it) that is `on` while its problem lasts
 *  (at least one is required): `fontaineVide` the fountain has no water, `filtre` its filter is to
 *  be changed, `panneFontaine` and `panneDistributeur` a fault. `joursFiltre` is a `sensor`, the
 *  days of filter life left, shown on the filter line while it is not negative; `nourrir` a
 *  `number` or `input_number` (called with its own domain's `set_value`) whose `min` is one
 *  portion, the smallest the feeder accepts, so the card never invents a quantity.
 *
 *  A role that is missing, `unavailable` or `unknown` is absent: no line, and a feed slot that
 *  stays empty rather than a button that cannot act. "Done" has no Home Assistant action to run (a
 *  fountain refilled by hand reports itself): it is "later" (`doneButton`). */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Appareil } from '../configuration';
import type { CardButton, CardFrame } from '../rendu/card-frame';
import { cardEntities, role } from '../stack/appliances';
import type { Card, Rank } from '../stack/types';
import { cardAct, doneButton, laterButton } from './actions';
import { numberOf } from './format';
import { nameOf, attributeOf, stateOf } from './readings';
import { S } from './strings';

const TYPE = 'animaux';
/** The problem roles, in the order of their lines — and of the key: the first one declared. */
const PROBLEMS = ['fontaineVide', 'filtre', 'panneFontaine', 'panneDistributeur'] as const;
type Problem = typeof PROBLEMS[number];
const TEXT: Record<Problem, string> = {
  fontaineVide: S.petsFountainEmpty, filtre: S.petsFilter,
  panneFontaine: S.petsFountainFault, panneDistributeur: S.petsFeederFault,
};

type Pets = Partial<Record<Problem | 'joursFiltre' | 'nourrir', string>>;

function adapt(a: Appareil): Pets {
  const p: Pets = {};
  for (const r of [...PROBLEMS, 'joursFiltre', 'nourrir'] as const) {
    const id = role(a, r);
    if (id !== undefined) p[r] = id;
  }
  return p;
}

const first = (p: Pets): string => p[PROBLEMS.find((r) => p[r] !== undefined)!]!;
const keyOf = (p: Pets): string => `${TYPE}:${first(p)}`;
const raised = (s: ScreenState, p: Pets): Problem[] =>
  PROBLEMS.filter((r) => stateOf(s.etat, p[r]) === 'on');
const rankOf = (s: ScreenState, p: Pets): Rank | null => (raised(s, p).length > 0 ? 2 : null);

const pets = (s: ScreenState): Pets[] =>
  cardEntities(s, { type: TYPE, own: undefined, adapt, key: keyOf, rank: rankOf });

export function detect(_f: Frame, s: ScreenState): Card[] {
  return pets(s).flatMap((p) => {
    const rank = rankOf(s, p);
    return rank === null ? [] : [{ key: keyOf(p), type: TYPE, rank }];
  });
}

/** Days of filter life left, through `Intl`; nothing when unreadable or already past. */
function daysLeft(s: ScreenState, p: Pets): string | undefined {
  const n = numberOf(stateOf(s.etat, p.joursFiltre));
  if (n === null || n < 0) return undefined;
  return S.petsFilterLeft(new Intl.NumberFormat(undefined,
    { style: 'unit', unit: 'day', unitDisplay: 'long', maximumFractionDigits: 0 }).format(n));
}

/** The pieces of a line are spans, the separators too: a text node of the line itself would be a
 *  second text box over the first. */
function line(s: ScreenState, p: Pets, r: Problem) {
  const name = nameOf(s.etat, p[r]);
  const days = r === 'filtre' ? daysLeft(s, p) : undefined;
  const sep = html`<span class="sep">${S.separator}</span>`;
  return html`<div class="carte-ligne composee"><span>${TEXT[r]}</span>${days !== undefined
    ? html`${sep}<span>${days}</span>` : ''}${name !== undefined
    ? html`${sep}<span dir="auto">${name}</span>` : ''}</div>`;
}

/** One portion: the entity's own `min`. Without a number there, there is no feeding to offer. */
function feedButton(s: ScreenState, id: string | undefined): CardButton | undefined {
  if (id === undefined || stateOf(s.etat, id) === undefined) return undefined;
  const portion = numberOf(attributeOf(s.etat, id, 'min'));
  if (portion === null) return undefined;
  return { icon: 'gamelle', label: S.petsFeed, act: () => cardAct(id.split('.')[0], 'set_value', id, { value: portion }) };
}

export function frame(card: Card, _f: Frame, s: ScreenState): CardFrame {
  const p = pets(s).find((x) => keyOf(x) === card.key);
  if (p === undefined) throw new Error(`pets card: no appliance for ${card.key}`);
  return {
    key: card.key,
    label: S.todo,
    title: S.pets,
    middle: html`${raised(s, p).map((r) => line(s, p, r))}`,
    buttons: [feedButton(s, p.nourrir), doneButton(s, card.key), laterButton(s, card.key, false)],
    background: { kind: 'solid', token: 'calm' },
    motion: { block: 'bloc:animaux' },
  };
}
