/** The vacuum card: the room's robot while it cleans or heads back (rank 4, it runs on its own),
 *  and while it is stuck or paused (rank 2, it waits for a gesture). Paused is kept on purpose: a
 *  pause button whose press made the card vanish would take its own resume button with it.
 *
 *  The background is `neutral` until the devices declare the robot's map camera (batch 2). The
 *  remaining time is not shown: the robots publish none to Home Assistant. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import { openVacuumChoice } from '../boot/vacuum';
import type { CardFrame } from '../rendu/card-frame';
import type { Card } from '../stack/types';
import { cardAct } from './actions';
import { numberOf, percent } from './format';
import { S } from './strings';

const TYPE = 'aspirateur';
const RANKS: Record<string, 2 | 4> = { cleaning: 4, returning: 4, error: 2, paused: 2 };

export function detect(_f: Frame, s: ScreenState): Card[] {
  const id = s.piece.aspirateur;
  if (id === undefined || !s.etat.estUtilisable(id)) return [];
  const rank = RANKS[s.etat.lire(id)!.etat];
  return rank === undefined ? [] : [{ key: `${TYPE}:${id}`, type: TYPE, rank }];
}

/** The rooms this tablet launched the robot on, in their order, when the choice is still known. */
function chosenRooms(s: ScreenState, id: string): string[] {
  const robot = s.vacuum.robots.find((r) => r.entite === id);
  if (robot === undefined) return [];
  return s.vacuum.chosen
    .filter((c) => c.entite === id)
    .map((c) => robot.pieces.find((p) => p.zone === c.zone)?.nom)
    .filter((n): n is string => n !== undefined);
}

export function frame(card: Card, _f: Frame, s: ScreenState): CardFrame {
  const id = card.key.slice(TYPE.length + 1);
  const e = s.etat.lire(id);
  if (e === undefined) throw new Error(`vacuum card: no state for ${card.key}`);
  const battery = numberOf(e.attributs['battery_level']);
  const rooms = chosenRooms(s, id);
  const running = e.etat === 'cleaning' || e.etat === 'returning';
  return {
    key: card.key,
    label: S.vacuumStates[e.etat] ?? S.vacuumBusy,
    title: String(e.attributs['friendly_name'] ?? '') || S.vacuum,
    middle: html`${battery !== null ? html`<div class="carte-chiffre">${percent(battery)}</div>` : ''}
      ${rooms.length ? html`<div class="carte-ligne" dir="auto">${rooms.join(S.separator)}</div>` : ''}`,
    buttons: [
      // Already on its way to the base: a base button would do nothing new.
      e.etat === 'returning'
        ? undefined
        : { icon: 'home', label: S.vacuumBase, act: () => cardAct('vacuum', 'return_to_base', id) },
      running
        ? { icon: 'pause', label: S.pause, primary: true, act: () => cardAct('vacuum', 'pause', id) }
        : { icon: 'lecture', label: S.play, primary: true, act: () => cardAct('vacuum', 'start', id) },
      { icon: 'list', label: S.vacuumRooms, act: () => openVacuumChoice(s, id) },
    ],
    background: { kind: 'solid', token: 'neutral' },
    motion: { block: 'bloc:menage' },
  };
}
