/** English strings of the stack cards (`cards/`): state labels, button names (read by assistive
 *  technology only — a card button shows an icon, never text), and the lines a card writes. Text
 *  that comes from Home Assistant (titles, room names) never lives here.
 *
 *  Numbers, times and durations reach these functions ALREADY formatted with `Intl` in the
 *  person's locale; a count that picks a plural form comes as the raw number too. */
import { plural } from './locale';

/** "and 3 others": the cards that list more than they have room for. */
const more = (count: number, shown: string): string =>
  plural(count, { one: `and ${shown} other`, other: `and ${shown} others` });

export const enCards = {
  /** The button that hides a card on every tablet for two hours. */
  later: 'Later',
  mediaPlaying: 'PLAYING',
  previous: 'Previous track',
  pause: 'Pause',
  play: 'Play',
  next: 'Next track',
  timer: 'TIMER',
  timerAddMinute: 'Add a minute',
  timerStop: 'Stop the timer',
  rings: (time: string): string => `Rings at ${time}`,
  recipe: 'RECIPE',
  recipeFallback: 'Recipe',
  recipeOpen: 'Reopen the recipe',
  step: (n: string, total: string): string => `Step ${n}/${total}`,
  vacuum: 'Vacuum',
  /** Vacuum states as Home Assistant names them; an unknown state falls back on `vacuumBusy`. */
  vacuumStates: { cleaning: 'Cleaning', returning: 'Returning', paused: 'Paused', error: 'Stuck' } as Record<string, string>,
  vacuumBusy: 'Running',
  vacuumBase: 'Back to the dock',
  vacuumRooms: 'Choose the rooms',
  car: 'Car',
  carCharging: 'Charging',
  carPlugIn: 'Plug in',
  carLimit: 'Charge limit',
  carStart: 'Start charging',
  carStop: 'Stop charging',
  carClimStart: 'Start the air conditioning',
  carClimStop: 'Stop the air conditioning',
  chargeEnds: (time: string): string => `Ends at ${time}`,
  chargeLimit: (pct: string): string => `Limit ${pct}`,
  printer: '3D printer',
  /** `print_status` values of ha-bambulab (`cards/printer.ts`); any other has no card. */
  printerStates: { running: 'Printing', prepare: 'Preparing', slicing: 'Slicing',
    pause: 'Paused', finish: 'Finished', failed: 'Failed' } as Record<string, string>,
  printerError: 'Error',
  printerCamera: 'Camera',
  printerResume: 'Resume the print',
  printerStop: 'Stop the print',
  printEnds: (time: string): string => `Ends at ${time}`,
  layer: (n: string, total?: string): string => (total === undefined ? `Layer ${n}` : `Layer ${n} / ${total}`),
  airing: 'TO DO',
  openSince: (duration: string): string => `Open for ${duration}`,
  /** The label of a soft reminder card that lists what is left to do. */
  todo: 'TO DO',
  /** The button that clears a card by hand: it hides the card like "later" when nothing else can. */
  done: 'Done',
  pets: 'Pets',
  petsFeed: 'Feed',
  petsFountainEmpty: 'Out of water',
  petsFilter: 'Filter to replace',
  petsFountainFault: 'Fountain fault',
  petsFeederFault: 'Feeder fault',
  petsFilterLeft: (days: string): string => `${days} left`,
  plants: 'Plants',
  plantsWatered: 'Watered',
  plantsDetails: 'Details',
  plantsMore: more,
  treadmill: 'Walking pad',
  treadmillWalking: 'WALKING',
  treadmillSlower: 'Slower',
  treadmillFaster: 'Faster',
  treadmillStop: 'Stop the walking pad',
  air: 'Air quality',
  airLabel: 'PM2.5',
  airOn: 'Turn the purifier on',
  airOff: 'Turn the purifier off',
  airFavourite: 'Favourite mode',
  airMotor: (speed: string): string => `Motor ${speed}`,
  ink: 'Ink levels',
  inkLabel: 'INK LOW',
  inkMore: more,
  meal: 'MEAL',
  mealOpenRecipe: 'Open the recipe',
  mealValidate: 'Confirm the meal',
  shopping: 'Shopping',
  mealMissing: (shown: string): string => `Missing: ${shown}`,
  pantry: 'Pantry',
  pantryLabel: 'EAT SOON',
  pantryOpen: 'Open the pantry',
  pantryMore: more,
  alarm: 'Alarm',
  alarmLabel: 'ARMED',
  alarmMore: more,
  alarmDisarm: 'Disarm',
  /** The middle line of an armed zone that asks for a code: the card has no keypad. */
  alarmCode: 'A code is required: disarm from the alarm panel',
};

export type CardMessages = typeof enCards;
