/** The treadmill card (KingSmith walking pad): shown while it walks (rank 4, it runs on its own).
 *  The appliance exists only in the house (`stack/appliances.ts`).
 *
 *  Roles, each a domain the contract enforces: `vitesse` a `sensor`, the speed, walking while it
 *  is above zero; `pas` and `distance` sensors, `reglageVitesse` a `number` or `input_number`,
 *  `arret` a `button`. A reading that is missing, `unavailable` or `unknown` is absent: no line; a
 *  button that is missing or `unavailable` is an empty slot.
 *
 *  Speed steps: `<domain>.set_value` on `reglageVitesse`, its current value ± its own `step`
 *  attribute, held between its `min` and `max`. A button at its bound leaves its slot empty, and
 *  when `step`, `min` or `max` is missing or not a number there is no step to offer: both slots
 *  stay empty rather than a step of ours.
 *
 *  No duration line: no role publishes it, and the walking pad integrations known to Home Assistant
 *  document no duration entity or attribute (checked 2026-10-24). The card never works one out from
 *  the tablet's clock — a duration that restarts at every reload would be wrong. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Appareil } from '../configuration';
import type { CardButton, CardFrame } from '../rendu/card-frame';
import { cardEntities, requiredRole, role } from '../stack/appliances';
import type { Card, Rank } from '../stack/types';
import { cardAct } from './actions';
import { numberOf } from './format';
import { reading, valueOf } from './measure';
import { attributeOf } from './readings';
import { S } from './strings';

const TYPE = 'tapis';
const OPTIONAL = ['pas', 'distance', 'reglageVitesse', 'arret'] as const;
type Treadmill = { vitesse: string } & Partial<Record<typeof OPTIONAL[number], string>>;

function adapt(a: Appareil): Treadmill {
  const t: Treadmill = { vitesse: requiredRole(a, 'vitesse') };
  for (const r of OPTIONAL) {
    const id = role(a, r);
    if (id !== undefined) t[r] = id;
  }
  return t;
}

const keyOf = (t: Treadmill): string => `${TYPE}:${t.vitesse}`;
const rankOf = (s: ScreenState, t: Treadmill): Rank | null => {
  const speed = valueOf(s, t.vitesse);
  return speed !== null && speed > 0 ? 4 : null;
};

const treadmills = (s: ScreenState): Treadmill[] =>
  cardEntities(s, { type: TYPE, own: undefined, adapt, key: keyOf, rank: rankOf });

export function detect(_f: Frame, s: ScreenState): Card[] {
  return treadmills(s).flatMap((t) => {
    const rank = rankOf(s, t);
    return rank === null ? [] : [{ key: keyOf(t), type: TYPE, rank }];
  });
}

/** Rounds away the binary noise of `3.5 + 0.1`; steps are decimals of a few digits at most. */
const tidy = (n: number): number => Number(n.toFixed(6));

/** The two step buttons, each undefined at its bound or when the entity gives no usable step. */
function stepButtons(s: ScreenState, id: string | undefined): [CardButton?, CardButton?] {
  const current = valueOf(s, id);
  const step = numberOf(attributeOf(s.etat, id, 'step'));
  const min = numberOf(attributeOf(s.etat, id, 'min'));
  const max = numberOf(attributeOf(s.etat, id, 'max'));
  if (id === undefined || current === null || step === null || step <= 0 || min === null || max === null) return [];
  const set = (value: number) => () => cardAct(id.split('.')[0], 'set_value', id, { value: tidy(value) });
  return [
    current > min ? { icon: 'moins', label: S.treadmillSlower, act: set(Math.max(min, current - step)) } : undefined,
    current < max ? { icon: 'plus', label: S.treadmillFaster, act: set(Math.min(max, current + step)) } : undefined,
  ];
}

/** A button entity is pressable unless the integration marks it `unavailable`: one never pressed
 *  reads `unknown` (the printer card's rule, `etat.isPresent`). */
function stopButton(s: ScreenState, id: string | undefined): CardButton | undefined {
  return id === undefined || !s.etat.isPresent(id) ? undefined
    : { icon: 'stop', label: S.treadmillStop, primary: true, act: () => cardAct('button', 'press', id) };
}

export function frame(card: Card, _f: Frame, s: ScreenState): CardFrame {
  const t = treadmills(s).find((x) => keyOf(x) === card.key);
  if (t === undefined) throw new Error(`treadmill card: no appliance for ${card.key}`);
  const [slower, faster] = stepButtons(s, t.reglageVitesse);
  const line = (id: string | undefined) => {
    const r = reading(s, id);
    return r === undefined ? '' : html`<div class="carte-ligne composee">${r}</div>`;
  };
  return {
    key: card.key,
    label: S.treadmillWalking,
    title: S.treadmill,
    middle: html`<div class="carte-chiffres"><span class="carte-chiffre composee">${reading(s, t.vitesse)}</span></div>
      ${line(t.pas)}${line(t.distance)}`,
    buttons: [slower, stopButton(s, t.arret), faster],
    background: { kind: 'solid', token: 'neutral' },
    motion: { block: 'bloc:tapis' },
  };
}
