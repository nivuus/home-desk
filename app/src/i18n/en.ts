/** English strings of the tablet, the reference catalog: every other catalog has exactly its
 *  shape (`Messages`, checked by `tsc` and by `tests/i18n.test.ts`).
 *
 *  A value that embeds data is a function; numbers and dates reach it ALREADY formatted with
 *  `Intl` in the person's locale (`i18n/locale.ts`), never as raw numbers to print. Text that
 *  comes from Home Assistant (product, room and location names) is passed through unchanged. */
import { plural } from './locale';

const MEAL_SLOTS_INLINE: Record<string, string> = {
  breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack',
};

export const en = {
  separator: ' · ',
  offline: 'Offline',
  back: 'Back',

  pantry: {
    title: 'Pantry',
    /** The products that have no aisle. Shown last, never dropped. */
    noAisle: 'No aisle',
    /** The count is the raw number for the plural rule, `shown` the same number formatted. */
    batches: (count: number, shown: string): string => (count === 0 ? 'Empty'
      : plural(count, { one: `${shown} batch`, other: `${shown} batches` })),
    more: (shown: string): string => `More › (${shown})`,
    soon: 'Eat soon',
    soonCount: (shown: string): string => `Eat soon (${shown})`,
    soonUnavailable: 'Eat soon — unavailable',
    unavailable: 'Pantry unavailable',
    empty: 'Nothing in stock',
    loading: 'Loading…',
    retry: 'Try again',
    all: 'All',
    left: (quantity: string): string => `${quantity} left`,
    bestBefore: (date: string): string => `Best before ${date}`,
    takeOut: 'Take out of stock',
    confirm: 'Confirm — cannot be undone',
    touchToConfirm: 'Touch to confirm',
    takingOut: (quantity: string, remaining: string): string => `Take out ${quantity} · ${remaining} will remain`,
    reasons: { consumption: 'Eaten', discard: 'Thrown away', expired: 'Expired' },
    /** The banner after a confirmed removal: the reason, then what left the stock. */
    removed: (reason: string, quantity: string, product: string): string => `${reason}: ${quantity} of ${product}`,
    /** home-stock did not answer: the removal may or may not have happened. */
    noAnswer: 'home-stock is not answering — removal uncertain',
    /** home-stock answered with a refusal and gave no reason of its own. */
    refused: 'home-stock refused — nothing was removed',
    pieces: (count: number, shown: string): string => plural(count, { one: `${shown} piece`, other: `${shown} pieces` }),
  },

  night: {
    lastData: 'Last known data',
    allLocked: 'All locked',
    temperature: (degrees: string, room: string): string => `${degrees}° ${room}`,
  },

  meal: {
    /** home-stock's four slots (`MEAL_SLOT_KEYS`), as a label of their own. */
    slots: { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as Record<string, string>,
    fallback: 'Meal',
    tomorrow: (slot: string): string => `Tomorrow, ${MEAL_SLOTS_INLINE[slot]}`,
    /** `weekday` comes from `Intl` (`weekday: 'long'`) in the person's locale. */
    onDay: (weekday: string, slot: string): string => `${weekday}, ${MEAL_SLOTS_INLINE[slot]}`,
  },

  agenda: {
    today: 'Today',
    tomorrow: 'Tomorrow',
  },
};

export type Messages = typeof en;
