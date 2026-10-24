/** The alarm card (Alarmo, `alarm_control_panel`): a soft reminder (rank 5) while any zone is
 *  armed. `zones` lists the panels (the contract takes `alarm_control_panel.*` only).
 *
 *  States, from home-assistant/core `alarm_control_panel/const.py` and the Alarmo wiki "Alarm panel
 *  states" (read 2026-10-24): armed is exactly `armed_home`, `armed_away`, `armed_night`,
 *  `armed_vacation`, `armed_custom_bypass`. The others are left out on purpose: `arming` is the exit
 *  delay (not armed yet), `disarming` the way out, `pending` the entry delay (the alarm has been
 *  tripped) and `triggered` it going off — these two are not a soft reminder but an alert, which
 *  belongs outside the stack and is NOT built here. `unavailable`/`unknown` are absent.
 *
 *  Disarming: the central button exists only when NO armed zone asks for a code, that is every
 *  armed zone publishes `code_format: null`. Three round buttons have no keypad; with a code the
 *  slot stays empty and the middle says so. An attribute that is not published is not "no code".
 *  It departs from the spec, which has Alarmo ask for the code. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Appareil } from '../configuration';
import type { CardButton, CardFrame } from '../rendu/card-frame';
import { cardEntities } from '../stack/appliances';
import type { Card, Rank } from '../stack/types';
import { cardAct } from './actions';
import { attributeOf, nameOf, stateOf } from './readings';
import { S } from './strings';

const TYPE = 'alarme';
const ARMED = new Set(['armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'armed_custom_bypass']);
/** Zones the middle lists; the card says how many it hides. */
const MAX_ZONES = 4;

type Alarm = { zones: string[] };

function adapt(a: Appareil): Alarm {
  const zones = a.entites['zones'];
  if (!Array.isArray(zones) || zones.length === 0) throw new Error(`house: ${a.type} in ${a.piece} declares no zones`);
  return { zones };
}

const keyOf = (a: Alarm): string => `${TYPE}:${a.zones[0]}`;
const armed = (s: ScreenState, a: Alarm): string[] => a.zones.filter((z) => ARMED.has(stateOf(s.etat, z) ?? ''));
const rankOf = (s: ScreenState, a: Alarm): Rank | null => (armed(s, a).length > 0 ? 5 : null);

const alarms = (s: ScreenState): Alarm[] =>
  cardEntities(s, { type: TYPE, own: undefined, adapt, key: keyOf, rank: rankOf });

export function detect(_f: Frame, s: ScreenState): Card[] {
  return alarms(s).flatMap((a) => {
    const rank = rankOf(s, a);
    return rank === null ? [] : [{ key: keyOf(a), type: TYPE, rank }];
  });
}

const needsCode = (s: ScreenState, zones: string[]): boolean =>
  zones.some((z) => attributeOf(s.etat, z, 'code_format') !== null);

export function frame(card: Card, _f: Frame, s: ScreenState): CardFrame {
  const a = alarms(s).find((x) => keyOf(x) === card.key);
  if (a === undefined) throw new Error(`alarm card: no appliance for ${card.key}`);
  const zones = armed(s, a);
  const coded = needsCode(s, zones);
  const hidden = zones.length - MAX_ZONES;
  const disarm: CardButton | undefined = coded ? undefined : {
    icon: 'lock', label: S.alarmDisarm, primary: true,
    act: () => { for (const z of zones) cardAct('alarm_control_panel', 'alarm_disarm', z); },
  };
  return {
    key: card.key,
    label: S.alarmLabel,
    title: S.alarm,
    ...(hidden > 0 ? { subtitle: S.alarmMore(new Intl.NumberFormat().format(hidden)) } : {}),
    middle: html`${zones.slice(0, MAX_ZONES).map((z) => html`<div class="carte-ligne" dir="auto">${nameOf(s.etat, z) ?? z}</div>`)}
      ${coded ? html`<div class="carte-ligne">${S.alarmCode}</div>` : ''}`,
    buttons: [undefined, disarm, undefined],
    background: { kind: 'solid', token: 'neutral' },
    motion: { block: 'bloc:alarme' },
  };
}
