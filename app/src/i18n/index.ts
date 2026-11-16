/** The tablet's language: which catalog its own strings come from, and which locale `Intl`
 *  formats dates, numbers and comparisons with.
 *
 *  The language is the one Home Assistant reports for the tablet's user (`boot/language.ts`), set
 *  once at start-up through `setLanguage`. Two things follow from it, kept apart on purpose:
 *   - the FORMATTING locale is the reported tag itself (`de-CH`, `ja`, `pt-BR`, ...): `Intl` knows
 *     every language the browser does, so dates and numbers follow the person's language even
 *     when this app has no catalog for it;
 *   - the CATALOG is the best match among the catalogs that exist (`CATALOGS`), by base language.
 *     With none, the strings fall back to English, the reference language of the code, and the
 *     fallback is said (a console warning, and `<html lang>` names the language actually shown),
 *     never silent.
 *
 *  No i18n library: what the screens need is a typed lookup plus `Intl` (plural rules, number,
 *  date and list formats, collation), all native. ICU message parsing (intl-messageformat) would
 *  add its parser to the tablet bundle for plural selection that `Intl.PluralRules` already does. */
import { en, type Messages } from './en';
import { fr } from './fr';
import { useLocale } from './locale';

export type { Messages };
export { locale, language, numberFormat, dateTimeFormat, compareText, plural, capitalise } from './locale';

/** The reference language of the code, and the fallback catalog. */
export const SOURCE_LANGUAGE = 'en';

export const CATALOGS: Readonly<Record<string, Messages>> = { en, fr };

let messages: Messages = en;

/** The canonical form of a BCP 47 tag, or `null` when `Intl` rejects it. Home Assistant stores
 *  `zh-Hans`, `pt-BR`, `en-GB`: all valid. Anything else is not a language. */
function canonical(tag: string): string | null {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** Applies a language tag. Returns the catalog language actually used, which differs from the
 *  tag's base language when no catalog exists for it. */
export function setLanguage(tag: string): string {
  const tagLocale = canonical(tag.trim());
  let shown = SOURCE_LANGUAGE;
  if (tagLocale === null) {
    console.warn(`home-desk: "${tag}" is not a language tag; showing English`);
    messages = en;
    useLocale(SOURCE_LANGUAGE, SOURCE_LANGUAGE);
  } else {
    const base = new Intl.Locale(tagLocale).language;
    const found = CATALOGS[base];
    if (found === undefined) {
      console.warn(`home-desk: no tablet strings for "${base}" yet (catalogs: ${Object.keys(CATALOGS).join(', ')}); `
        + `showing English, with dates and numbers in "${tagLocale}"`);
    } else {
      shown = base;
    }
    messages = found ?? en;
    useLocale(tagLocale, shown);
  }
  if (typeof document !== 'undefined') document.documentElement.lang = shown;
  return shown;
}

/** The strings of the active catalog. Read at render time, never captured at import time. */
export function t(): Messages {
  return messages;
}
