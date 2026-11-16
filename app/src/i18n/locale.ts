/** The active formatting locale and the `Intl` helpers built on it. Kept apart from the catalogs
 *  (`index.ts`) so that a catalog can use these helpers without an import cycle. */

let current = { locale: 'en', language: 'en' };

/** Set by `setLanguage` (`index.ts`) only. */
export function useLocale(locale: string, language: string): void {
  current = { locale, language };
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

export function numberFormat(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  return cached(`n${JSON.stringify(options)}`, () => new Intl.NumberFormat(current.locale, options));
}

export function dateTimeFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return cached(`d${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(current.locale, options));
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
