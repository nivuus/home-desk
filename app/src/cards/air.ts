/** The air card (Xiaomi purifier, `xiaomi_miio`): a soft reminder (rank 5) while the PM2.5 reading
 *  is above the appliance's `seuil` (strictly: at the threshold the air is fine). The appliance
 *  exists only in the house (`stack/appliances.ts`); a reminder is not a gesture the other rooms
 *  wait for, so a card of the whole house never shows.
 *
 *  Roles: `pm25` a `sensor`, `purificateur` a `fan` (the contract enforces both). Unreadable
 *  (`unavailable`, `unknown`, not a number) is absent: no card for the reading, an empty slot for
 *  the purifier's buttons.
 *
 *  Background: the card exists only above the threshold, so it is always `air-bad`. The
 *  integration offers no air-quality level on the fan entity (docs: home-assistant.io
 *  /integrations/xiaomi_miio, 2026-10-24 — AQI is a separate monitor entity), so the colour is not
 *  graded by level.
 *
 *  Favourite: `fan.set_preset_mode` with the preset the entity itself lists. `xiaomi_miio` names
 *  it `Favorite` (same docs: "Auto, Silent, Favorite"); when `preset_modes` has no such entry the
 *  slot stays empty. The motor speed is the standard fan attribute `percentage`. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Appareil } from '../configuration';
import type { CardButton, CardFrame } from '../rendu/card-frame';
import { cardEntities, requiredRole } from '../stack/appliances';
import type { Card, Rank } from '../stack/types';
import { cardAct, laterButton } from './actions';
import { numberOf, percent } from './format';
import { reading, valueOf } from './measure';
import { attributeOf, stateOf } from './readings';
import { S } from './strings';

const TYPE = 'air';
/** The preset `xiaomi_miio` calls its favourite mode; matched against the entity's own list. */
const FAVOURITE = 'Favorite';

type Air = { pm25: string; purificateur: string; seuil: number };

function adapt(a: Appareil): Air {
  if (a.seuil === undefined) throw new Error(`house: ${a.type} in ${a.piece} declares no seuil`);
  return { pm25: requiredRole(a, 'pm25'), purificateur: requiredRole(a, 'purificateur'), seuil: a.seuil };
}

const keyOf = (a: Air): string => `${TYPE}:${a.pm25}`;
const rankOf = (s: ScreenState, a: Air): Rank | null => {
  const pm = valueOf(s, a.pm25);
  return pm !== null && pm > a.seuil ? 5 : null;
};

const airs = (s: ScreenState): Air[] =>
  cardEntities(s, { type: TYPE, own: undefined, adapt, key: keyOf, rank: rankOf });

export function detect(_f: Frame, s: ScreenState): Card[] {
  return airs(s).flatMap((a) => {
    const rank = rankOf(s, a);
    return rank === null ? [] : [{ key: keyOf(a), type: TYPE, rank }];
  });
}

function toggleButton(s: ScreenState, id: string): CardButton | undefined {
  const state = stateOf(s.etat, id);
  if (state === undefined) return undefined;
  return { icon: 'purificateur', label: state === 'on' ? S.airOff : S.airOn, primary: true,
    act: () => cardAct('fan', 'toggle', id) };
}

function favouriteButton(s: ScreenState, id: string): CardButton | undefined {
  const presets = attributeOf(s.etat, id, 'preset_modes');
  if (stateOf(s.etat, id) === undefined || !Array.isArray(presets) || !presets.includes(FAVOURITE)) return undefined;
  return { icon: 'etoile', label: S.airFavourite,
    act: () => cardAct('fan', 'set_preset_mode', id, { preset_mode: FAVOURITE }) };
}

export function frame(card: Card, _f: Frame, s: ScreenState): CardFrame {
  const a = airs(s).find((x) => keyOf(x) === card.key);
  if (a === undefined) throw new Error(`air card: no appliance for ${card.key}`);
  const motor = numberOf(attributeOf(s.etat, a.purificateur, 'percentage'));
  return {
    key: card.key,
    label: S.airLabel,
    title: S.air,
    middle: html`<div class="carte-chiffres"><span class="carte-chiffre composee">${reading(s, a.pm25)}</span></div>
      ${motor !== null ? html`<div class="carte-ligne">${S.airMotor(percent(motor))}</div>` : ''}`,
    buttons: [laterButton(s, card.key, false), toggleButton(s, a.purificateur), favouriteButton(s, a.purificateur)],
    background: { kind: 'solid', token: 'air-bad' },
    motion: { block: 'bloc:air' },
  };
}
