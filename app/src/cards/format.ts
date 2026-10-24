/** Numbers and times on cards, always through `Intl` in the page's locale: the unit, its
 *  position and the digits are the locale's, never a `%` or `km` glued by hand. */
const unit = (u: string, display: 'short' | 'long' = 'short') =>
  new Intl.NumberFormat(undefined, { style: 'unit', unit: u, unitDisplay: display, maximumFractionDigits: 0 });

export const percent = (n: number): string => unit('percent').format(n);
export const kilometres = (n: number): string => unit('kilometer').format(n);

/** A duration rounded to the minute: minutes under an hour, hours and minutes beyond ("1 hour,
 *  59 minutes", never "1 hour"). Not `Intl.DurationFormat`: Chromium shipped it in 129
 *  and the tablets' WebView is 119. Each unit is the locale's own, joined by the locale's unit
 *  list (`Intl.ListFormat`, `type: 'unit'`), which is what DurationFormat does too. */
export function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return unit('minute', 'long').format(minutes);
  const parts = [unit('hour', 'long').format(hours), ...(minutes > 0 ? [unit('minute', 'long').format(minutes)] : [])];
  return new Intl.ListFormat(undefined, { type: 'unit', style: 'long' }).format(parts);
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
