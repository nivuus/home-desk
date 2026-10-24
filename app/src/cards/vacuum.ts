/** The vacuum card: the room's robot while it cleans or heads back (rank 4, it runs on its own),
 *  and while it is stuck or paused (rank 2, it waits for a gesture). Paused is kept on purpose: a
 *  pause button whose press made the card vanish would take its own resume button with it.
 *
 *  The robot comes from the screen (`piece.aspirateur`) and from the house appliances
 *  (`stack/appliances.ts`), merged into one card per robot. The background is the picture of the
 *  robot's map camera (`plan`) when one is declared and publishes one, `neutral` otherwise. The
 *  remaining time is not shown: the robots publish none to Home Assistant. */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import { imageToPaint } from '../boot/card-tones';
import { openVacuumChoice } from '../boot/vacuum';
import type { Appareil } from '../configuration';
import type { CardFrame } from '../rendu/card-frame';
import { cardEntities, requiredRole, role } from '../stack/appliances';
import type { Card, Rank } from '../stack/types';
import { cardAct } from './actions';
import { numberOf, percent } from './format';
import { S } from './strings';

const TYPE = 'aspirateur';
const RANKS: Record<string, 2 | 4> = { cleaning: 4, returning: 4, error: 2, paused: 2 };

/** A robot as the card reads it: the robot itself and, optionally, its map camera. */
type Robot = { aspirateur: string; plan?: string };

const adapt = (a: Appareil): Robot => {
  const plan = role(a, 'plan');
  return { aspirateur: requiredRole(a, 'aspirateur'), ...(plan !== undefined ? { plan } : {}) };
};

function rankOf(s: ScreenState, r: Robot): Rank | null {
  return s.etat.estUtilisable(r.aspirateur) ? RANKS[s.etat.lire(r.aspirateur)!.etat] ?? null : null;
}

const robots = (s: ScreenState): Robot[] => cardEntities(s, {
  type: TYPE,
  own: s.piece.aspirateur !== undefined ? { aspirateur: s.piece.aspirateur } : undefined,
  adapt, key: (r) => `${TYPE}:${r.aspirateur}`, rank: rankOf,
});

export function detect(_f: Frame, s: ScreenState): Card[] {
  return robots(s).flatMap((r) => {
    const rank = rankOf(s, r);
    return rank === null ? [] : [{ key: `${TYPE}:${r.aspirateur}`, type: TYPE, rank }];
  });
}

/** The map camera's picture, when it publishes one. */
function mapPicture(s: ScreenState, plan: string | undefined): string | undefined {
  if (plan === undefined || !s.etat.estUtilisable(plan)) return undefined;
  const url = s.etat.lire(plan)!.attributs['entity_picture'];
  return typeof url === 'string' && url !== '' ? url : undefined;
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
  const robot = robots(s).find((r) => `${TYPE}:${r.aspirateur}` === card.key);
  if (robot === undefined) throw new Error(`vacuum card: no robot for ${card.key}`);
  const id = robot.aspirateur;
  const e = s.etat.lire(id);
  if (e === undefined) throw new Error(`vacuum card: no state for ${card.key}`);
  const battery = numberOf(e.attributs['battery_level']);
  const rooms = chosenRooms(s, id);
  const running = e.etat === 'cleaning' || e.etat === 'returning';
  const map = mapPicture(s, robot.plan);
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
    ...(map !== undefined
      ? imageToPaint(card.key, map, s.measuredCard)
      : { background: { kind: 'solid', token: 'neutral' } }),
    motion: { block: 'bloc:menage' },
  };
}
