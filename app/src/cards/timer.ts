/** The timer card (rank 1): the most urgent timer of the room, running or paused. The countdown
 *  node is the one the per-second tick writes (`tictacMinuteurs`: `.mn-temps[data-minuteur]`),
 *  and the buttons call the actions the timer block already uses (`ActionsMinuteur`). */
import { html } from 'lit';
import type { Frame } from '../boot/frame';
import type { ScreenState } from '../boot/state';
import { formaterRestant, PAS_FIN_MINUTEUR_S, type VueMinuteur } from '../minuteur';
import type { CardFrame } from '../rendu/card-frame';
import { actionsMinuteur, libelle } from '../rendu/minuteur';
import type { Card } from '../stack/types';
import { S } from './strings';

const TYPE = 'minuteur';
/** Under this many seconds left the card turns to its urgent colour. */
const LATE_S = 60;

export function detect(f: Frame, _s: ScreenState): Card[] {
  // Least time left, running or paused: a paused timer keeps its frozen time, so pausing the head
  // never swaps the card away from the timer the user just paused. (`listerMinuteurs` sorts
  // running timers first, which would.)
  const v = f.vuesMinuteurs.reduce<VueMinuteur | undefined>(
    (head, x) => (head === undefined || x.restantS < head.restantS ? x : head), undefined);
  return v === undefined ? [] : [{ key: `${TYPE}:${v.timer}`, type: TYPE, rank: 1 }];
}

function ringTime(f: Frame, v: VueMinuteur): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(f.maintenantMs + v.restantS * 1000));
}

export function frame(card: Card, f: Frame, _s: ScreenState): CardFrame {
  const v = f.vuesMinuteurs.find((x) => `${TYPE}:${x.timer}` === card.key);
  if (v === undefined) throw new Error(`timer card: no timer for ${card.key}`);
  const others = f.vuesMinuteurs.length - 1;
  const more = others > 0
    ? html`<span class="timer-autres">${new Intl.NumberFormat(undefined, { signDisplay: 'always' }).format(others)}</span>`
    : '';
  return {
    key: card.key,
    label: S.timer,
    title: libelle(v),
    // A paused timer rings at no time.
    ...(v.actif ? { subtitle: S.rings(ringTime(f, v)) } : {}),
    middle: html`<span class="mn-temps timer-decompte" data-minuteur=${v.slot}>${formaterRestant(v.restantS)}</span>${more}`,
    buttons: [
      // A step on a paused timer would restart it (`ajuster`, `boot/controls.ts`): no button.
      v.actif
        ? { icon: 'plus', label: S.timerAddMinute, act: () => actionsMinuteur().ajuster(v.slot, PAS_FIN_MINUTEUR_S) }
        : undefined,
      v.actif
        ? { icon: 'pause', label: S.pause, primary: true, act: () => actionsMinuteur().pause(v.slot) }
        : { icon: 'lecture', label: S.play, primary: true, act: () => actionsMinuteur().reprendre(v.slot) },
      { icon: 'stop', label: S.timerStop, act: () => actionsMinuteur().annuler(v.slot) },
    ],
    background: { kind: 'solid', token: v.actif && v.restantS < LATE_S ? 'timer-late' : 'timer' },
    motion: { block: 'bloc:minuteur-solo' },
  };
}
