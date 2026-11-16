/** The language Home Assistant reports for the tablet's user, read once the socket is
 *  authenticated (`startScreen`, `demarrage.ts`).
 *
 *  Two sources, in Home Assistant's own order:
 *   1. the language the user chose in their profile: `frontend/get_user_data` with the key
 *      `language` answers `{ value: { language, number_format, time_format, ... } }`, or
 *      `{ value: null }` when the user never chose one. Per user, so each tablet account can have
 *      its own;
 *   2. otherwise the instance language, `language` in the `get_config` answer (Home Assistant
 *      defaults it to `en`, never empty).
 *
 *  Home Assistant's own frontend falls back to the browser language instead of 2. A wall tablet's
 *  browser language is whatever its Android image shipped with, not a choice made in Home
 *  Assistant, so the instance language is the better "what Home Assistant reports" here.
 *
 *  Same failure vocabulary as the screen and the house (`configuration.ts`): a lost link is
 *  `reseau`, so the start-up retries instead of rendering in a guessed language. A refused
 *  `frontend/get_user_data` (no `frontend` integration, for a headless instance) moves on to the
 *  instance language. */
import { RefusHA } from '../connexion';
import type { Result, TransportConfig } from '../configuration';
import { SOURCE_LANGUAGE } from '../i18n';

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

async function profileLanguage(cx: TransportConfig): Promise<string | null> {
  try {
    const answer = await cx.envoyerCommande({ type: 'frontend/get_user_data', key: 'language' });
    const value = (answer as { value?: { language?: unknown } | null } | null)?.value;
    return text(value?.language);
  } catch (error) {
    if (error instanceof RefusHA && error.code !== 'delai_depasse') return null;
    throw error;
  }
}

export async function loadLanguage(cx: TransportConfig): Promise<Result<string>> {
  try {
    const chosen = await profileLanguage(cx);
    if (chosen !== null) return { ok: true, value: chosen };
    const config = await cx.envoyerCommande({ type: 'get_config' });
    const instance = text((config as { language?: unknown } | null)?.language);
    if (instance !== null) return { ok: true, value: instance };
    // Home Assistant always sends one ("en" by default, `core_config.py`); a build that does not
    // gets that same default, said rather than guessed.
    console.warn(`home-desk: Home Assistant reported no language; using "${SOURCE_LANGUAGE}"`);
    return { ok: true, value: SOURCE_LANGUAGE };
  } catch {
    return { ok: false, panne: 'reseau' };
  }
}
