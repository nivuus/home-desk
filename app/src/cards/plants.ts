/** The plants card: a soft reminder (rank 5) while a probe reads under its threshold. The
 *  appliance exists only in the house (`stack/appliances.ts`); a card of the whole house never
 *  shows, a reminder is not a gesture the other rooms wait for.
 *
 *  Each probe in `sondes` is a soil moisture sensor, in percent. Its threshold is its own
 *  `soil_warning` attribute when it publishes one, the appliance's `seuil` otherwise (the plan's
 *  batch-3 rule); a probe with neither is not judged. Under is strict: at the threshold the plant
 *  is fine. A probe that is missing, `unavailable`, `unknown` or not a number is absent.
 *
 *  "Watered" runs the `habitude` input_boolean when it is usable, then hides the card like
 *  "later" does; without it, it is "later" alone. "Details" opens the view the screen declares
 *  for the plants (a command with `vue: '#plantes'`) and leaves its place empty otherwise. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Appareil } from '../configuration';
import type { CardButton, CardFrame } from '../rendu/card-frame';
import { cardEntities, role } from '../stack/appliances';
import type { Card, Rank } from '../stack/types';
import { cardAct, laterButton } from './actions';
import { numberOf, percent } from './format';
import { attributeOf, nameOf, stateOf } from './readings';
import { S } from './strings';

const TYPE = 'plantes';
/** The view a screen declares (as a command's `vue`) to show the plants in detail. */
export const PLANTS_VIEW = '#plantes';
/** Gauges the middle zone holds; the driest come first and the rest are counted. */
const MAX_GAUGES = 3;

type Plants = { sondes: string[]; habitude?: string; seuil?: number };

function adapt(a: Appareil): Plants {
  const sondes = a.entites['sondes'];
  if (!Array.isArray(sondes)) throw new Error(`house: ${a.type} in ${a.piece} declares no sondes`);
  const habitude = role(a, 'habitude');
  return { sondes, ...(habitude !== undefined ? { habitude } : {}), ...(a.seuil !== undefined ? { seuil: a.seuil } : {}) };
}

const keyOf = (p: Plants): string => `${TYPE}:${p.sondes[0]}`;

type Dry = { id: string; value: number; threshold: number };
/** The probes under their threshold, the furthest below it first. */
function dryProbes(s: ScreenState, p: Plants): Dry[] {
  return p.sondes.flatMap((id): Dry[] => {
    const value = numberOf(stateOf(s.etat, id));
    const threshold = numberOf(attributeOf(s.etat, id, 'soil_warning')) ?? p.seuil;
    return value !== null && threshold !== undefined && value < threshold ? [{ id, value, threshold }] : [];
  }).sort((a, b) => (b.threshold - b.value) - (a.threshold - a.value));
}

const rankOf = (s: ScreenState, p: Plants): Rank | null => (dryProbes(s, p).length > 0 ? 5 : null);

const plants = (s: ScreenState): Plants[] =>
  cardEntities(s, { type: TYPE, own: undefined, adapt, key: keyOf, rank: rankOf });

export function detect(_f: Frame, s: ScreenState): Card[] {
  return plants(s).flatMap((p) => {
    const rank = rankOf(s, p);
    return rank === null ? [] : [{ key: keyOf(p), type: TYPE, rank }];
  });
}

function gauge(s: ScreenState, d: Dry) {
  const name = nameOf(s.etat, d.id);
  const fill = Math.min(100, Math.max(0, d.value));
  return html`<div class="jauge">
    <div class="jauge-tete">
      <span class="carte-ligne" dir="auto">${name ?? ''}</span>
      <span class="jauge-valeur">${percent(d.value)}</span>
    </div>
    <div class="jauge-piste"><div class="jauge-niveau" style="width:${fill}%"></div></div>
  </div>`;
}

function wateredButton(s: ScreenState, p: Plants, key: string): CardButton {
  const later = laterButton(s, key);
  const habit = stateOf(s.etat, p.habitude) !== undefined ? p.habitude : undefined;
  return {
    icon: 'arrosoir', label: S.plantsWatered, primary: true,
    act: () => {
      if (habit !== undefined) cardAct('input_boolean', 'turn_on', habit);
      later.act();
    },
  };
}

function detailsButton(s: ScreenState): CardButton | undefined {
  const view = s.piece.commandes.find((c) => c.vue === PLANTS_VIEW)?.vue;
  return view === undefined ? undefined
    : { icon: 'list', label: S.plantsDetails, act: () => { location.hash = view; } };
}

export function frame(card: Card, _f: Frame, s: ScreenState): CardFrame {
  const p = plants(s).find((x) => keyOf(x) === card.key);
  if (p === undefined) throw new Error(`plants card: no appliance for ${card.key}`);
  const dry = dryProbes(s, p);
  const extra = dry.length - MAX_GAUGES;
  return {
    key: card.key,
    label: S.todo,
    title: S.plants,
    ...(extra > 0 ? { subtitle: S.plantsMore(new Intl.NumberFormat().format(extra)) } : {}),
    middle: html`${dry.slice(0, MAX_GAUGES).map((d) => gauge(s, d))}`,
    buttons: [laterButton(s, card.key, false), wateredButton(s, p, card.key), detailsButton(s)],
    background: { kind: 'solid', token: 'neutral' },
    motion: { block: 'bloc:plantes' },
  };
}
