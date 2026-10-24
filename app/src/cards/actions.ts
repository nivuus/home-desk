/** The Home Assistant call behind a card button, wired once by `wireScreen` (`boot/wiring.ts`),
 *  which alone holds the connection and refuses any call while offline. Read at press time: a card
 *  built before the wiring still acts. And the "later" button every card may carry. */
import type { Agir } from '../boot/controls';
import type { ScreenState } from '../boot/state';
import type { CardButton } from '../rendu/card-frame';
import { snoozeCard } from '../stack/snooze';
import { S } from './strings';

let agir: Agir = () => {};
export function wireCardActions(fn: Agir): void { agir = fn; }
export const cardAct: Agir = (...args) => agir(...args);

/** "Later": hides the card `key` on every tablet for two hours (`stack/snooze.ts`). The card
 *  leaves when the integration pushes the new set back; refused, it stays, and the refusal is
 *  logged. Offline, nothing is sent, like any other card action. */
export function laterButton(s: ScreenState, key: string): CardButton {
  return {
    icon: 'snooze', label: S.later, primary: true,
    act: () => {
      if (s.horsLigne) return;
      snoozeCard(s.cx, key).catch((err: unknown) => console.error('home-desk: snooze refused', key, err));
    },
  };
}
