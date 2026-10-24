/** The car card: charging (rank 4, it runs on its own) or to plug in (rank 2: unplugged AND under
 *  the declared charge limit — no limit declared, never "to plug in"). The middle holds the charge
 *  and the range large, and the limit; the subtitle the end of the charge. Every field beyond the
 *  original seven is optional: a missing entity leaves its button's place empty.
 *
 *  The climate button keeps the optimistic flight of the car block (`rendu/voiture.ts`): the car
 *  answers one to three minutes late, and a second order in flight would contradict the first. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Voiture } from '../ecran';
import type { Etat } from '../etat';
import type { CardButton, CardFrame } from '../rendu/card-frame';
import { actionsVoiture } from '../rendu/voiture';
import type { Card } from '../stack/types';
import { cardAct } from './actions';
import { clockTime, kilometres, numberOf, percent } from './format';
import { S } from './strings';

const TYPE = 'voiture';

const value = (etat: Etat, id: string | undefined): number | null =>
  id !== undefined && etat.estUtilisable(id) ? numberOf(etat.lire(id)!.etat) : null;
/** Only a state the car actually publishes: an unreadable entity is neither on nor off. */
const is = (etat: Etat, id: string, state: 'on' | 'off'): boolean =>
  etat.estUtilisable(id) && etat.lire(id)!.etat === state;

function charging(etat: Etat, v: Voiture): boolean { return is(etat, v.enCharge, 'on'); }

export function detect(_f: Frame, s: ScreenState): Card[] {
  const v = s.piece.voiture;
  if (v === undefined) return [];
  const key = `${TYPE}:${v.batterie}`;
  if (charging(s.etat, v)) return [{ key, type: TYPE, rank: 4 }];
  const level = value(s.etat, v.batterie);
  const limit = value(s.etat, v.limite);
  const toPlug = is(s.etat, v.branchee, 'off') && level !== null && limit !== null && level < limit;
  return toPlug ? [{ key, type: TYPE, rank: 2 }] : [];
}

/** A button pressing `id`, or an empty place when the entity is not declared. */
function press(id: string | undefined, b: Omit<CardButton, 'act'>): CardButton | undefined {
  return id === undefined ? undefined : { ...b, act: () => cardAct('button', 'press', id) };
}

function endTime(etat: Etat, id: string | undefined): string | undefined {
  if (id === undefined || !etat.estUtilisable(id)) return undefined;
  const ms = Date.parse(etat.lire(id)!.etat);
  return Number.isFinite(ms) ? S.chargeEnds(clockTime(ms)) : undefined;
}

export function frame(card: Card, _f: Frame, s: ScreenState): CardFrame {
  const v = s.piece.voiture;
  if (v === undefined || card.key !== `${TYPE}:${v.batterie}`) throw new Error(`car card: no car for ${card.key}`);
  const on = charging(s.etat, v);
  const level = value(s.etat, v.batterie);
  const range = value(s.etat, v.autonomie);
  const limit = value(s.etat, v.limite);
  const climOn = is(s.etat, v.clim, 'on');
  const end = on ? endTime(s.etat, v.finCharge) : undefined;
  return {
    key: card.key,
    label: on ? S.carCharging : S.carPlugIn,
    title: S.car,
    ...(end !== undefined ? { subtitle: end } : {}),
    middle: html`<div class="carte-chiffres">
        ${level !== null ? html`<span class="carte-chiffre">${percent(level)}</span>` : ''}
        ${range !== null ? html`<span class="carte-ligne">${kilometres(range)}</span>` : ''}
      </div>
      ${limit !== null ? html`<div class="carte-ligne">${S.chargeLimit(percent(limit))}</div>` : ''}`,
    buttons: [
      press(v.boutonLimite, { icon: 'batterie', label: S.carLimit }),
      on ? press(v.arreterCharge, { icon: 'stop', label: S.carStop, primary: true })
        : press(v.demarrerCharge, { icon: 'lecture', label: S.carStart, primary: true }),
      {
        icon: 'clim', label: climOn ? S.carClimStop : S.carClimStart,
        act: () => actionsVoiture().clim(!climOn),
        // An order in flight: the press would contradict it. Kept in place, bound to nothing.
        ...(s.climEnVol !== null ? { inert: true as const } : {}),
      },
    ],
    background: { kind: 'solid', token: on ? 'charging' : 'plug-in' },
    motion: { block: 'bloc:voiture' },
  };
}
