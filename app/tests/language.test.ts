// @vitest-environment jsdom
//
// Where the tablet's language comes from (`src/boot/language.ts`), and that `startScreen` applies
// it before the screen is rendered.
import { describe, it, expect, vi } from 'vitest';
import { loadLanguage } from '../src/boot/language';
import { RefusHA } from '../src/connexion';
import { startScreen } from '../src/demarrage';
import { language } from '../src/i18n';
import { ecranVide, stockageAvecSession } from './aides';

type Answer = unknown | Error;

function transport(answers: Record<string, Answer>) {
  const envoyerCommande = vi.fn(async (p: Record<string, unknown>) => {
    const a = answers[String(p.type)];
    if (a instanceof Error) throw a;
    return a;
  });
  return { envoyerCommande };
}

describe('loadLanguage', () => {
  it('prefers the language the user chose in their profile', async () => {
    const cx = transport({ 'frontend/get_user_data': { value: { language: 'nl', number_format: 'language' } } });
    expect(await loadLanguage(cx)).toEqual({ ok: true, value: 'nl' });
    expect(cx.envoyerCommande).toHaveBeenCalledWith({ type: 'frontend/get_user_data', key: 'language' });
    expect(cx.envoyerCommande).toHaveBeenCalledTimes(1);
  });

  it('falls back to the instance language when the user chose none', async () => {
    const cx = transport({ 'frontend/get_user_data': { value: null }, get_config: { language: 'ja', version: '2026.11.1' } });
    expect(await loadLanguage(cx)).toEqual({ ok: true, value: 'ja' });
  });

  it('falls back to the instance language when the frontend command is refused', async () => {
    const cx = transport({
      'frontend/get_user_data': new RefusHA('unknown_command', 'Unknown command.'),
      get_config: { language: 'de' },
    });
    expect(await loadLanguage(cx)).toEqual({ ok: true, value: 'de' });
  });

  it('a lost link is a network failure, never a guessed language', async () => {
    expect(await loadLanguage(transport({ 'frontend/get_user_data': new Error('websocket indisponible') })))
      .toEqual({ ok: false, panne: 'reseau' });
    expect(await loadLanguage(transport({ 'frontend/get_user_data': new RefusHA('delai_depasse', 'timeout') })))
      .toEqual({ ok: false, panne: 'reseau' });
    expect(await loadLanguage(transport({ 'frontend/get_user_data': { value: null }, get_config: new Error('closed') })))
      .toEqual({ ok: false, panne: 'reseau' });
  });
});

describe('startScreen applies the reported language', () => {
  function deps(loadLanguageFn: () => Promise<unknown>, chargerEcran = vi.fn(async () => ({ ok: true as const, value: ecranVide }))) {
    return {
      stockage: stockageAvecSession,
      createConnection: () => ({
        connecter: () => Promise.resolve(), prete: () => Promise.resolve(),
        surChangement: () => {}, surSilence: () => {},
        appelerService: vi.fn(), listerTaches: vi.fn(async () => []), envoyerCommande: vi.fn(),
        abonner: () => {},
      }),
      intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 14, 0),
      chargerEcran,
      loadHouse: async () => ({ ok: true as const, value: { sources: [], appareils: [] } }),
      loadLanguage: loadLanguageFn as any,
    };
  }

  it('before the screen is loaded', async () => {
    const order: string[] = [];
    const chargerEcran = vi.fn(async () => { order.push('screen'); return { ok: true as const, value: ecranVide }; });
    await startScreen(document.createElement('div'), 'Salon', deps(async () => {
      order.push('language');
      return { ok: true, value: 'en-GB' };
    }, chargerEcran));
    expect(order).toEqual(['language', 'screen']);
    expect(language()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('retries like an unreachable screen when the language cannot be read', async () => {
    const d = deps(async () => ({ ok: false, panne: 'reseau' }));
    await startScreen(document.createElement('div'), 'Salon', d);
    expect(d.chargerEcran).not.toHaveBeenCalled();
    expect(d.minuteurFn).toHaveBeenCalledTimes(1);
  });
});
