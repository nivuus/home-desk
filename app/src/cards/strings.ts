/** The strings of the stack cards, in the person's language: the `cards` section of the active
 *  catalog (`i18n/en-cards.ts` is the reference). A function, read at render time: a string
 *  captured when a module loads would stay in the language of the first paint. Text that comes
 *  from Home Assistant (titles, room names) never lives in the catalog. */
import { t } from '../i18n';
import type { CardMessages } from '../i18n/en-cards';

export function S(): CardMessages {
  return t().cards;
}
