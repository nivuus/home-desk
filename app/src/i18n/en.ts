/** English strings of the tablet, the reference catalog: every other catalog has exactly its
 *  shape (`Messages`, checked by `tsc` and by `tests/i18n.test.ts`).
 *
 *  A value that embeds data is a function; numbers and dates reach it ALREADY formatted with
 *  `Intl` in the person's locale (`i18n/locale.ts`), never as raw numbers to print. Text that
 *  comes from Home Assistant (product, room and location names) is passed through unchanged. */
import { plural } from './locale';
import { enCards } from './en-cards';
import { enSetup } from './en-setup';

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
    appointment: 'Appointment',
    /** The time comes formatted by `Intl`; the summary is the calendar's text. */
    appointmentLine: (time: string, summary: string): string => `${time} — ${summary}`,
  },

  /** A day's weather, one whole sentence per kind of weather (`meteo.ts` maps Home Assistant's
   *  conditions onto these keys). `temperature` comes formatted (`18°`). */
  weather: {
    rain: (temperature: string): string => `${temperature} and rain`,
    storm: (temperature: string): string => `${temperature} and thunderstorms`,
    snow: (temperature: string): string => `${temperature} and snow`,
    sun: (temperature: string): string => `${temperature} and sunshine`,
    someClouds: (temperature: string): string => `${temperature} and some clouds`,
    clouds: (temperature: string): string => `${temperature} and clouds`,
    fog: (temperature: string): string => `${temperature} and fog`,
    wind: (temperature: string): string => `${temperature} and wind`,
    overcast: (temperature: string): string => `${temperature} and overcast skies`,
  },

  band: {
    /** The indoor temperature sentence. `value` is the drawn number (an element of its own, which
     *  the motion engine animates), placed where the language puts it. */
    inside: (value: unknown): unknown[] => ['It is ', value, ' in here.'],
  },

  home: {
    wholeHouse: 'Whole house',
    ambience: 'Ambience',
    lastKnownData: 'Last known data',
    /** The synthesis line, followed by what is not as it should be (or by nothing). */
    allClosedBut: 'All closed —',
    allClosed: 'All closed, nothing to report',
    maintenance: (count: number, shown: string): string =>
      plural(count, { one: `Maintenance — ${shown} task`, other: `Maintenance — ${shown} tasks` }),
  },

  /** What a control tile says under its name, from the entity's state. */
  tiles: {
    unknownState: 'Unknown state',
    lock: { locked: 'Locked', unlocked: 'Unlocked', locking: 'Locking…', unlocking: 'Unlocking…',
      jammed: 'Jammed', open: 'Open', opening: 'Opening…' } as Record<string, string>,
    cover: { closed: 'Closed', opening: 'Opening…', closing: 'Closing…', open: 'Open' } as Record<string, string>,
    /** A cover that is not fully open; `percent` comes formatted. */
    openAt: (percent: string): string => `Open ${percent}`,
    opened: 'Open',
    closed: 'Closed',
    running: 'Running',
    stopped: 'Off',
    off: 'Off',
    heating: 'Heating',
    on: 'On',
    onAt: (percent: string): string => `On ${percent}`,
    /** A curtain tile under a heat wave: the label becomes what to do. */
    closeCurtain: 'Close',
  },

  car: {
    climOn: 'Air conditioning on',
    charging: 'Charging',
    pluggedIn: 'Plugged in',
    unplugged: 'Unplugged',
    starting: 'Starting…',
    stopping: 'Stopping…',
    climStart: 'Start the air conditioning',
    climStop: 'Stop the air conditioning',
  },

  timer: {
    title: 'Timer',
    start: 'Start',
  },

  tasks: {
    title: 'Tasks',
    empty: 'No tasks',
    touchToConfirm: 'Touch to confirm',
    more: (count: number, shown: string): string => plural(count, { one: `+${shown} task`, other: `+${shown} tasks` }),
    seeHomeAssistant: 'See Home Assistant for the rest',
  },

  recipe: {
    /** A step heading of the recipe pages; `title` is the recipe's own text, when it has one. */
    step: (n: string, title?: string): string => (title === undefined ? `Step ${n}` : `Step ${n} — ${title}`),
    noIngredients: 'No ingredients',
    missing: 'missing',
    /** The page counter of the recipe view; both numbers come formatted. */
    pages: (n: string, total: string): string => `${n}/${total}`,
    close: 'Close',
    ingredients: 'Ingredients',
    collapse: 'Collapse',
    finish: 'Finish',
    confirm: 'Confirm',
    finishArmed: 'Finish — the stock will be decremented',
    ingredientFallback: 'Ingredient',
    notPlanned: 'This meal is no longer planned.',
    refused: 'The confirmation was refused.',
  },

  vacuum: {
    title: 'Vacuum',
    passes: 'Passes',
    singlePass: 'One pass only: the robot did not give its limits.',
    readingRooms: 'Reading the rooms…',
    noRooms: 'No room is linked to a vacuum in Home Assistant (vacuum settings, “map segments to areas”).',
    sending: 'Sending…',
    launch: 'Start',
    loadFailed: 'Could not read the vacuums’ rooms.',
    /** The cleaning did not start; `reason` is one of `reasons`, or `noAnswer`. */
    launchFailed: (reason: string): string => `The cleaning did not start: ${reason}`,
    reasons: {
      robot_injoignable: 'the robot is not answering.',
      passages_hors_bornes: 'the robot refuses this number of passes.',
      pieces_non_cartographiees: 'a room is no longer linked to this robot.',
      aspirateur_inconnu: 'this vacuum no longer exists in Home Assistant.',
      nettoyage_refuse: 'Home Assistant refused the command.',
    } as Record<string, string>,
    noAnswer: 'the house is not answering.',
  },

  /** The alerts of the central block: a short subject, then the sentence. */
  alerts: {
    feeder: { subject: 'Kibble', text: 'Kibble feeder out of order' },
    fountain: { subject: 'Fountain', text: (pet: string): string => `Refill ${pet}’s fountain` },
    door: { subject: 'Door', text: 'Door unlocked' },
  },

  cards: enCards,
  setup: enSetup,
};

export type Messages = typeof en;
