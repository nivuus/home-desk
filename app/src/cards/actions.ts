/** The Home Assistant call behind a card button, wired once by `wireScreen` (`boot/wiring.ts`),
 *  which alone holds the connection and refuses any call while offline. Read at press time: a card
 *  built before the wiring still acts. */
import type { Agir } from '../boot/controls';

let agir: Agir = () => {};
export function wireCardActions(fn: Agir): void { agir = fn; }
export const cardAct: Agir = (...args) => agir(...args);
