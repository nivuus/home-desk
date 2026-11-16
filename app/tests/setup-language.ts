/** The suites assert the French strings they were written against: every test starts with the
 *  French catalog and a French locale, whatever the machine running them. The language mechanism
 *  itself, other languages included, is tested in `tests/i18n.test.ts`. */
import { beforeEach } from 'vitest';
import { setLanguage } from '../src/i18n';

beforeEach(() => {
  setLanguage('fr');
});
