/** Quantities of the pantry sheet: the Tout / ½ / ¼ shortcuts, the − / + step, the bounds a
 *  quantity stays within, and how a quantity reads on screen. PURE, like `model.ts`.
 *
 *  home-stock's base units are 'g', 'ml' and 'piece' (`const.BASE_UNITS`, and the CHECK of the
 *  `product.base_unit` column). An unknown unit is shown as sent, never guessed. */

export type Fraction = 'all' | 'half' | 'quarter';

/** Rounds to two decimals: 0.1 + 0.2 must never reach the screen or the command as
 *  0.30000000000000004. */
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** One piece at a time; 50 g / 50 ml, or 10 when less than 200 is left. */
export function stepFor(unit: string, remaining: number): number {
  if (unit === 'piece') return 1;
  return remaining < 200 ? 10 : 50;
}

/** A fraction of the remaining. "All" is the remaining itself, unrounded, so that taking
 *  everything always closes the batch exactly. */
export function fromFraction(f: Fraction, remaining: number): number {
  if (f === 'all') return remaining;
  return round2(f === 'half' ? remaining / 2 : remaining / 4);
}

/** Keeps `q` within [step, remaining]. The upper bound wins: when less than one step is left,
 *  the only possible quantity is the remaining. */
export function clampQuantity(q: number, remaining: number, step: number): number {
  return Math.min(Math.max(q, step), remaining);
}

/** One press on − (`dir = -1`) or + (`dir = 1`). */
export function increment(q: number, remaining: number, unit: string, dir: 1 | -1): number {
  const step = stepFor(unit, remaining);
  return clampQuantity(round2(q + dir * step), remaining, step);
}

const NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2, useGrouping: false });

/** "350 g", "250 ml", "1,5 pièce", "3 pièces": at most two decimals, none when whole. French
 *  writes the singular below two ("1,5 pièce"). */
export function formatQuantity(q: number, unit: string): string {
  const n = NUMBER.format(q);
  if (unit === 'piece') return `${n} ${Math.abs(q) >= 2 ? 'pièces' : 'pièce'}`;
  return unit === '' ? n : `${n} ${unit}`;
}
