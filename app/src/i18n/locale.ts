/** The active formatting locale and the `Intl` helpers built on it. Kept apart from the catalogs
 *  (`index.ts`) so that a catalog can use these helpers without an import cycle.
 *
 *  Besides the language, the person's Home Assistant profile carries two format preferences
 *  (`frontend/get_user_data`, key `language`: `number_format` and `time_format`, the
 *  `NumberFormat` and `TimeFormat` enums of the frontend's `src/data/translation.ts`). They are
 *  applied the way Home Assistant's own frontend applies them, so a tablet writes numbers and
 *  hours like the person's Home Assistant does:
 *   - `number_format` picks the locale numbers are written in (`numberFormatToLocale`,
 *     `src/common/number/format_number.ts`), `none` drops the grouping;
 *   - `time_format` picks the 12 or 24 hour clock (`useAmPm`, `src/common/datetime/use_am_pm.ts`).
 *  `language` (the default of both) leaves it to the language; `system` to the browser. */

/** `NumberFormat` of the Home Assistant frontend, mapped to the locales it formats numbers with. */
const NUMBER_LOCALES: Readonly<Record<string, readonly string[]>> = {
  comma_decimal: ['en-US', 'en'],
  decimal_comma: ['de', 'es', 'it'],
  space_comma: ['fr', 'sv', 'cs'],
  quote_decimal: ['de-CH'],
  none: ['en-US'],
};

/** The two profile preferences, as Home Assistant stores them. Absent = `language`. */
export type FormatPreferences = { numberFormat?: string; timeFormat?: string };

type Current = {
  locale: string;
  language: string;
  /** The locales `Intl.NumberFormat` is built with; `undefined` = the browser's own. */
  numberLocales: string | string[] | undefined;
  grouping: boolean;
  /** Forced by the profile; `undefined` = the locale's own clock. */
  hourCycle: 'h12' | 'h23' | undefined;
};

let current: Current = { locale: 'en', language: 'en', numberLocales: 'en', grouping: true, hourCycle: undefined };

function hourCycleOf(timeFormat: string | undefined): Current['hourCycle'] {
  if (timeFormat === '12') return 'h12';
  if (timeFormat === '24') return 'h23';
  if (timeFormat === 'system') {
    // The browser's own clock: what `Intl` resolves with no locale given.
    const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h11' || cycle === 'h12' ? 'h12' : 'h23';
  }
  return undefined;
}

function numberLocalesOf(locale: string, numberFormat: string | undefined): string | string[] | undefined {
  if (numberFormat === 'system') return undefined;
  const mapped = numberFormat === undefined ? undefined : NUMBER_LOCALES[numberFormat];
  return mapped === undefined ? locale : [...mapped];
}

/** Set by `setLanguage` (`index.ts`) only. */
export function useLocale(locale: string, language: string, preferences: FormatPreferences = {}): void {
  current = {
    locale,
    language,
    numberLocales: numberLocalesOf(locale, preferences.numberFormat),
    grouping: preferences.numberFormat !== 'none',
    hourCycle: hourCycleOf(preferences.timeFormat),
  };
  formats.clear();
}

/** The formatting locale: the tag Home Assistant reported. */
export function locale(): string {
  return current.locale;
}

/** The language of the strings shown (`en` when the reported one has no catalog). */
export function language(): string {
  return current.language;
}

const formats = new Map<string, unknown>();

function cached<T>(key: string, make: () => T): T {
  let f = formats.get(key) as T | undefined;
  if (f === undefined) { f = make(); formats.set(key, f); }
  return f;
}

/** Numbers in the person's number format (the profile's, else the language's).
 *
 *  A number WITH a unit name (`style: 'unit'`) is written in the language's locale instead: the
 *  unit is a word of the language ("minutes", "Tage"), and the profile's number format, mapped to
 *  another language's locale (`space_comma` is French), would write that word in that language. */
export function numberFormat(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const locales = options.style === 'unit' && options.unit !== 'percent' ? current.locale : current.numberLocales;
  return cached(`n${String(locales)}${JSON.stringify(options)}`, () => new Intl.NumberFormat(locales,
    current.grouping ? options : { ...options, useGrouping: false }));
}

/** Dates and hours in the person's locale, on the clock the profile asks for. */
export function dateTimeFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const withClock = current.hourCycle !== undefined && options.hour !== undefined
    ? { ...options, hourCycle: current.hourCycle } : options;
  return cached(`d${JSON.stringify(withClock)}`, () => new Intl.DateTimeFormat(current.locale, withClock));
}

/** A list of names joined the way the person's language joins them ("A, B and C", "A, B et C",
 *  "A、B、C"). `unit` lists ("1 hour, 5 minutes") for enumerations that are not a sentence. */
export function listFormat(items: readonly string[], type: Intl.ListFormatType = 'conjunction'): string {
  return cached(`l${type}`, () => new Intl.ListFormat(current.locale, { type, style: 'long' })).format(items);
}

/** Compares two names the way the person's language sorts them (accents, case, `ß`, `ø`…). */
export function compareText(a: string, b: string): number {
  return cached('collator', () => new Intl.Collator(current.locale)).compare(a, b);
}

/** Picks the plural form of `n` by the rules of the catalog's language — a catalog's forms are
 *  written for its own language, whatever the formatting locale. `other` is the one form every
 *  language has. */
export function plural(n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }): string {
  const rule = cached('plural', () => new Intl.PluralRules(current.language)).select(n);
  return forms[rule] ?? forms.other;
}

/** Upper-cases the first character for the catalog's language — a weekday from `Intl` is
 *  lower-case in French ("lundi") and needs a capital at the start of a label. */
export function capitalise(text: string): string {
  const first = String.fromCodePoint(text.codePointAt(0) ?? 0);
  return text === '' ? text : first.toLocaleUpperCase(current.language) + text.slice(first.length);
}
