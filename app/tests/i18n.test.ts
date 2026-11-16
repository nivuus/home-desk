// @vitest-environment jsdom
//
// The tablet's language mechanism (`src/i18n/`): catalog parity, the explicit English fallback,
// and the screens it converts, in a language other than French.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'lit';
import { CATALOGS, SOURCE_LANGUAGE, setLanguage, t, locale, compareText, numberFormat, dateTimeFormat, listFormat } from '../src/i18n';
import { phraseDemain } from '../src/meteo';
import { formatQuantity } from '../src/pantry/quantity';
import { shortDate } from '../src/rendu/pantry-frame';
import { aislesOf, parseBatches } from '../src/pantry/model';
import { rendreNuit } from '../src/rendu/nuit';
import { etiquetteRepas } from '../src/repas';
import { prochainChangement } from '../src/agenda';
import { Etat } from '../src/etat';
import { ECRANS } from '../src/ecran';

afterEach(() => { vi.restoreAllMocks(); });

/** Every key path of a catalog, with the arity of each function: two catalogs of the same shape
 *  give the same set; a key missing, added or renamed on one side, or a function taking other
 *  arguments, does not. */
function shape(node: unknown, prefix = ''): string[] {
  if (typeof node === 'function') return [`${prefix}()${node.length}`];
  if (node === null || typeof node !== 'object') return [prefix];
  return Object.entries(node).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
}

describe('catalogs', () => {
  it.each(Object.keys(CATALOGS).filter((l) => l !== SOURCE_LANGUAGE))('%s has exactly the keys of English', (lang) => {
    expect(shape(CATALOGS[lang]).sort()).toEqual(shape(CATALOGS[SOURCE_LANGUAGE]).sort());
  });

  it('the shape check sees a missing key', () => {
    const { pantry: { noAnswer: _dropped, ...pantry }, ...rest } = CATALOGS[SOURCE_LANGUAGE];
    expect(shape({ ...rest, pantry }).sort()).not.toEqual(shape(CATALOGS[SOURCE_LANGUAGE]).sort());
  });
});

describe('setLanguage', () => {
  it('uses the catalog of the base language and keeps the full tag for formats', () => {
    expect(setLanguage('fr-CA')).toBe('fr');
    expect(t().pantry.title).toBe('Garde-manger');
    expect(locale()).toBe('fr-CA');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('falls back to English for a language without a catalog, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(setLanguage('de')).toBe('en');
    expect(t().pantry.title).toBe('Pantry');
    expect(locale()).toBe('de');
    expect(document.documentElement.lang).toBe('en');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"de"');
  });

  it('falls back to English for something that is not a language tag, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(setLanguage('not a tag')).toBe('en');
    expect(locale()).toBe('en');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns about nothing when the catalog exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLanguage('en-GB');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('formats follow the locale, not fr-FR', () => {
  it('quantities: decimal separator of the locale, plural of the catalog', () => {
    setLanguage('en');
    expect(formatQuantity(1, 'piece')).toBe('1 piece');
    expect(formatQuantity(1.5, 'piece')).toBe('1.5 pieces');
    expect(formatQuantity(350, 'g')).toBe('350 g');
    setLanguage('fr');
    expect(formatQuantity(1.5, 'piece')).toBe('1,5 pièce');
    expect(formatQuantity(3, 'piece')).toBe('3 pièces');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLanguage('de');
    expect(formatQuantity(1.5, 'piece')).toBe('1,5 pieces');
  });

  it('short dates', () => {
    setLanguage('en-US');
    expect(shortDate('2026-09-20')).toBe('Sep 20');
    setLanguage('fr');
    expect(shortDate('2026-09-20')).toBe('20 sept.');
  });

  it('names sort by the rules of the locale', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLanguage('de');
    expect(['Zucker', 'Äpfel'].sort(compareText)).toEqual(['Äpfel', 'Zucker']);
    setLanguage('sv');
    expect(['Zucker', 'Äpfel'].sort(compareText)).toEqual(['Zucker', 'Äpfel']);
  });

  it('the aisle without a name is named by the catalog', () => {
    setLanguage('en');
    const batches = parseBatches([{
      id: 1, remaining: 1, best_before: null, product_id: 1, product_name: 'X', base_unit: 'g',
      location_id: 1, location_name: 'Fridge', location_position: 1,
      aisle_id: null, aisle_name: null, aisle_position: null,
    }]);
    expect(aislesOf(batches, 1).map((a) => a.name)).toEqual(['No aisle']);
  });
});

describe('the profile\'s number and time formats, applied like Home Assistant\'s frontend', () => {
  const late = new Date(2026, 7, 1, 23, 5);
  const clock = () => dateTimeFormat({ hour: 'numeric', minute: '2-digit' }).format(late);

  it('the language decides when the profile says nothing', () => {
    setLanguage('en-US');
    expect(clock()).toMatch(/^11:05\sPM$/u);
    expect(numberFormat().format(1234.5)).toBe('1,234.5');
    setLanguage('fr');
    expect(clock()).toBe('23:05');
  });

  it('time_format 24 and 12 force the clock, whatever the language', () => {
    setLanguage('en-US', { timeFormat: '24' });
    expect(clock()).toBe('23:05');
    setLanguage('fr', { timeFormat: '12' });
    expect(clock()).toMatch(/^11:05\sPM$/u);
  });

  it('number_format picks the separators Home Assistant picks, the words stay the language\'s', () => {
    setLanguage('en-US', { numberFormat: 'decimal_comma' });
    expect(numberFormat().format(1234.5)).toBe('1.234,5');
    setLanguage('en-US', { numberFormat: 'space_comma' });
    expect(numberFormat().format(1234.5)).toBe('1\u202f234,5');
    setLanguage('fr', { numberFormat: 'comma_decimal' });
    expect(numberFormat().format(1234.5)).toBe('1,234.5');
    setLanguage('fr', { numberFormat: 'quote_decimal' });
    expect(numberFormat().format(1234.5)).toBe("1'234.5");
    setLanguage('fr', { numberFormat: 'none' });
    expect(numberFormat().format(1234.5)).toBe('1234.5');
    setLanguage('en-US', { numberFormat: 'space_comma' });
    expect(numberFormat({ style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(5)).toBe('5 minutes');
  });

  it('startScreen applies the formats Home Assistant reported', async () => {
    const { startScreen } = await import('../src/demarrage');
    const { ecranVide, stockageAvecSession } = await import('./aides');
    await startScreen(document.createElement('div'), 'Salon', {
      stockage: stockageAvecSession,
      createConnection: () => ({
        connecter: () => Promise.resolve(), prete: () => Promise.resolve(),
        followEntities: () => {}, surChangement: () => {}, surSilence: () => {},
        appelerService: vi.fn(), listerTaches: vi.fn(async () => []), envoyerCommande: vi.fn(),
        abonner: () => {},
      }) as never,
      intervalFn: vi.fn() as never, minuteurFn: vi.fn() as never,
      maintenant: () => new Date(2026, 7, 1, 14, 0),
      chargerEcran: async () => ({ ok: true as const, value: ecranVide }),
      loadHouse: async () => ({ ok: true as const, value: { sources: [], appareils: [] } }),
      loadLanguage: async () => ({ ok: true as const, value: { language: 'en-US', timeFormat: '24', numberFormat: 'decimal_comma' } }),
    } as never);
    expect(clock()).toBe('23:05');
    expect(numberFormat().format(1234.5)).toBe('1.234,5');
  });
});

describe('whole sentences, not word groups', () => {
  it('the weather is one sentence per kind of weather, in each catalog', () => {
    const day = { datetime: '2026-08-02T00:00:00', condition: 'cloudy', temperature: 18.4 };
    setLanguage('en');
    expect(phraseDemain(day)).toBe('18° and clouds');
    expect(phraseDemain({ ...day, precipitation: 3 })).toBe('18° and rain');
    expect(phraseDemain({ ...day, condition: 'exceptional' })).toBe('18° and overcast skies');
    setLanguage('fr');
    expect(phraseDemain(day)).toBe('18° et des nuages');
  });

  it('plurals through the language\'s rules: French 0 and 1 are singular, English 0 is plural', () => {
    setLanguage('en');
    expect(t().tasks.more(1, '1')).toBe('+1 task');
    expect(t().cards.inkMore(0, '0')).toBe('and 0 others');
    setLanguage('fr');
    expect(t().cards.inkMore(0, '0')).toBe('et 0 autre');
    expect(t().home.maintenance(2, '2')).toBe('Entretien — 2 tâches');
  });

  it('lists are joined by the language', () => {
    setLanguage('en');
    expect(listFormat(['a', 'b', 'c'])).toBe('a, b, and c');
    setLanguage('fr');
    expect(listFormat(['a', 'b', 'c'])).toBe('a, b et c');
  });
});

describe('converted screens in English', () => {
  it('the night screen: clock and temperature in the locale, room name unchanged', () => {
    setLanguage('en-US');
    const etat = new Etat();
    etat.appliquer({ entity_id: 'sensor.capteur_humain_temperature', state: '19.6', attributes: {} });
    etat.appliquer({ entity_id: 'lock.aqara_smart_lock_u200_lite', state: 'locked', attributes: {} });
    const div = document.createElement('div');
    render(rendreNuit(etat, new Date(2026, 7, 1, 23, 42), { ...ECRANS.salon, nom: 'İstanbul Küche' }), div);
    expect(div.querySelector('.hn')?.textContent).toBe('11:42 PM');
    expect(div.querySelector('.tn')?.textContent).toBe('19.6° İstanbul Küche');
    expect(div.querySelector('.on')?.textContent).toContain('All locked');
  });

  it('the next meal label', () => {
    setLanguage('en');
    const now = new Date(2026, 8, 30, 10, 0);   // a Wednesday
    expect(etiquetteRepas('2026-09-30', 'dinner', now)).toBe('Dinner');
    expect(etiquetteRepas('2026-10-01', 'dinner', now)).toBe('Tomorrow, dinner');
    expect(etiquetteRepas('2026-10-05', 'lunch', now)).toBe('Monday, lunch');
    expect(etiquetteRepas(null, 'nope', now)).toBe('Meal');
    setLanguage('fr');
    expect(etiquetteRepas('2026-10-05', 'lunch', now)).toBe('Lundi, déjeuner');
  });

  it('the weather change day of the band', () => {
    setLanguage('en');
    const now = new Date(2026, 8, 30, 10, 0);
    const days = [
      { datetime: '2026-09-30T00:00:00', condition: 'sunny', temperature: 20 },
      { datetime: '2026-10-01T00:00:00', condition: 'sunny', temperature: 20 },
      { datetime: '2026-10-02T00:00:00', condition: 'rainy', temperature: 15 },
    ];
    expect(prochainChangement(days as never, now)?.jour).toBe('Friday');
  });
});
