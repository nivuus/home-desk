/** The gestures of the pantry views, wired ONCE by `wireScreen` (`boot/wiring.ts`) — same pattern
 *  as `brancherCochageTaches` (`rendu/taches.ts`): the render functions stay pure templates, and
 *  the functions of `boot/pantry.ts` stay free of any DOM. Shared by `pantry-lists.ts` and
 *  `pantry-sheet.ts`. */
import type { Batch } from '../pantry/model';
import type { Fraction } from '../pantry/quantity';
import type { Reason } from '../boot/pantry';

export type PantryActions = {
  openSoon(): void;
  openLocation(locationId: number): void;
  openAisle(aisleId: number | null): void;
  openBatch(batch: Batch): void;
  nextPage(): void;
  back(): void;
  retry(): void;
  chooseFraction(f: Fraction): void;
  step(dir: 1 | -1): void;
  press(reason: Reason): void;
};

const NOOP: PantryActions = {
  openSoon: () => {}, openLocation: () => {}, openAisle: () => {}, openBatch: () => {},
  nextPage: () => {}, back: () => {}, retry: () => {}, chooseFraction: () => {}, step: () => {},
  press: () => {},
};

export let pantryActions: PantryActions = NOOP;

export function wirePantry(a: PantryActions): void {
  pantryActions = a;
}
