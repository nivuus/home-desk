// @vitest-environment jsdom
//
// The shared house source list (`home_desk/maison`) is loaded by the start-up shell along with
// the screen, and a change of the house list reloads the tablet like any screen edit does.
import { describe, it, expect, vi } from 'vitest';
import { startScreen } from '../src/demarrage';
import type { DeclarationSource } from '../src/media';
import type { Result } from '../src/configuration';
import { ecranVide, monterDemarrage, stockageAvecSession, vider } from './aides';

const music: DeclarationSource = {
  nom: 'Music', piece: 'Chambre', titre: ['media_player.music_bedroom'], sousTitre: [],
  affiche: [], progression: [], transport: [], volume: [],
};

function deps(sur: Record<string, unknown> = {}) {
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
    chargerEcran: async () => ({ ok: true as const, value: ecranVide }),
    ...sur,
  };
}

describe('startScreen — the shared house list', () => {
  it('startup loads the house list with the screen and reloads it on the change event', async () => {
    const loadHouse = vi.fn(async (): Promise<Result<DeclarationSource[]>> => ({ ok: true, value: [music] }));
    let onChange: ((e: Record<string, unknown>) => void) | undefined;
    const reloads: Promise<void>[] = [];
    const d = deps({
      loadHouse,
      createConnection: () => ({
        connecter: () => Promise.resolve(), prete: () => Promise.resolve(),
        surChangement: () => {}, surSilence: () => {},
        appelerService: vi.fn(), listerTaches: vi.fn(async () => []), envoyerCommande: vi.fn(),
        abonner: (c: Record<string, unknown>, cb: (e: Record<string, unknown>) => void) => {
          if (c.type === 'home_desk/abonner') onChange = cb;
        },
      }),
      // The production reload is `location.reload()`: a fresh start-up of the same page.
      recharger: () => { reloads.push(startScreen(document.createElement('div'), 'Salon', d)); },
    });

    await startScreen(document.createElement('div'), 'Salon', d);
    expect(loadHouse).toHaveBeenCalledTimes(1);

    // Editing the house fires the change event for every screen name, this one included.
    onChange!({ nom: 'Salon' });
    await Promise.all(reloads);
    expect(loadHouse).toHaveBeenCalledTimes(2);
  });

  it('a corrupt house list shows the configuration failure, not a half-working screen', async () => {
    const racine = document.createElement('div');
    await startScreen(racine, 'Salon', deps({
      loadHouse: async () => ({ ok: false as const, panne: 'corrompu' as const }),
    }));
    expect(racine.textContent).toContain('Configuration invalide');
  });

  it('an unreachable house list is retried like an unreachable screen', async () => {
    const racine = document.createElement('div');
    const minuteurFn = vi.fn();
    await startScreen(racine, 'Salon', deps({
      minuteurFn,
      loadHouse: async () => ({ ok: false as const, panne: 'reseau' as const }),
    }));
    expect(minuteurFn).toHaveBeenCalledTimes(1);
  });

  it('a remote source playing in another room shows the media card on this tablet', async () => {
    const m = await monterDemarrage(ecranVide, {
      house: [music],
      etats: [['media_player.music_bedroom', 'playing', { media_title: 'Song' }]],
    });
    await vider();
    expect(m.racine.querySelector('.media')?.textContent).toContain('Song');
  });
});
