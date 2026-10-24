/** The car card: charging (rank 4, it runs on its own) or to plug in (rank 2: unplugged AND under
 *  the declared charge limit — no limit declared, never "to plug in"). The middle holds the charge
 *  and the range large, and the limit; the subtitle the end of the charge. Every field beyond the
 *  original seven is optional: a missing entity leaves its button's place empty. `Voiture.limite`
 *  is the charge limit (a number), `finCharge` the charge's end (a timestamp sensor);
 *  `demarrerCharge`, `arreterCharge` and `boutonLimite` are `button.*` entities, pressed like
 *  `demarrerClim`/`arreterClim`. They are documented here, not in `ecran.ts`: a comment there
 *  shifts the comment registry (`outils/verdicts-commentaires.tsv`, keyed by line).
 *
 *  The car comes from the screen (`piece.voiture`) and from the house appliances
 *  (`stack/appliances.ts`), merged into one card per battery. The appliance declares no climate
 *  and no limit button: those places stay empty for a car only the house declares.
 *
 *  The climate button keeps the optimistic flight of the car block (`rendu/voiture.ts`): the car
 *  answers one to three minutes late, and a second order in flight would contradict the first. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import type { Appareil } from '../configuration';
import type { Voiture } from '../ecran';
import type { Etat } from '../etat';
import type { CardButton, CardFrame } from '../rendu/card-frame';
import { actionsVoiture } from '../rendu/voiture';
import { cardEntities, requiredRole, role } from '../stack/appliances';
import type { Card, Rank } from '../stack/types';
import { cardAct } from './actions';
import { clockTime, kilometres, numberOf, percent } from './format';
import { S } from './strings';

const TYPE = 'voiture';

const value = (etat: Etat, id: string | undefined): number | null =>
  id !== undefined && etat.estUtilisable(id) ? numberOf(etat.lire(id)!.etat) : null;
/** Only a state the car actually publishes: an unreadable entity is neither on nor off. */
const is = (etat: Etat, id: string, state: 'on' | 'off'): boolean =>
  etat.estUtilisable(id) && etat.lire(id)!.etat === state;

/** A car as the card reads it: the battery and the plug, everything else optional. `clim` is the
 *  screen's alone (its button drives the screen's car block, `rendu/voiture.ts`). */
type Car = { batterie: string; branchee: string } & Partial<Pick<Voiture, 'enCharge' | 'autonomie'
  | 'limite' | 'finCharge' | 'demarrerCharge' | 'arreterCharge' | 'boutonLimite' | 'clim'>>;

const OPTIONAL_ROLES = ['enCharge', 'autonomie', 'limite', 'finCharge', 'demarrerCharge', 'arreterCharge'] as const;

function adapt(a: Appareil): Car {
  const car: Car = { batterie: requiredRole(a, 'batterie'), branchee: requiredRole(a, 'branchee') };
  for (const r of OPTIONAL_ROLES) {
    const id = role(a, r);
    if (id !== undefined) car[r] = id;
  }
  return car;
}

/** The screen's car in the card's shape: the climate's start/stop buttons and the note stay with
 *  the car block. */
function own(v: Voiture | undefined): Car | undefined {
  if (v === undefined) return undefined;
  const { demarrerClim: _on, arreterClim: _off, note: _note, ...car } = v;
  return car;
}

const keyOf = (v: Car): string => `${TYPE}:${v.batterie}`;

function charging(etat: Etat, v: Car): boolean { return v.enCharge !== undefined && is(etat, v.enCharge, 'on'); }

function rankOf(s: ScreenState, v: Car): Rank | null {
  if (charging(s.etat, v)) return 4;
  const level = value(s.etat, v.batterie);
  const limit = value(s.etat, v.limite);
  const toPlug = is(s.etat, v.branchee, 'off') && level !== null && limit !== null && level < limit;
  return toPlug ? 2 : null;
}

const cars = (s: ScreenState): Car[] =>
  cardEntities(s, { type: TYPE, own: own(s.piece.voiture), adapt, key: keyOf, rank: rankOf });

export function detect(_f: Frame, s: ScreenState): Card[] {
  return cars(s).flatMap((v) => {
    const rank = rankOf(s, v);
    return rank === null ? [] : [{ key: keyOf(v), type: TYPE, rank }];
  });
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
  const v = cars(s).find((c) => keyOf(c) === card.key);
  if (v === undefined) throw new Error(`car card: no car for ${card.key}`);
  const on = charging(s.etat, v);
  const level = value(s.etat, v.batterie);
  const range = value(s.etat, v.autonomie);
  const limit = value(s.etat, v.limite);
  const climOn = v.clim !== undefined && is(s.etat, v.clim, 'on');
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
      v.clim === undefined ? undefined : {
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
