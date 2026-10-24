/** Numbers and times on cards, always through `Intl` in the page's locale: the unit, its
 *  position and the digits are the locale's, never a `%` or `km` glued by hand. */
const unit = (u: string, display: 'short' | 'long' = 'short') =>
  new Intl.NumberFormat(undefined, { style: 'unit', unit: u, unitDisplay: display, maximumFractionDigits: 0 });

export const percent = (n: number): string => unit('percent').format(n);
export const kilometres = (n: number): string => unit('kilometer').format(n);

/** A duration in whole minutes under an hour, in whole hours beyond. */
export function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes < 60 ? unit('minute', 'long').format(minutes) : unit('hour', 'long').format(Math.floor(minutes / 60));
}

export const clockTime = (ms: number): string =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));

/** A number an entity publishes, or null: a missing value disappears from the card rather than
 *  showing as zero. */
export function numberOf(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
