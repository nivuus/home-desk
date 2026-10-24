// @vitest-environment jsdom
//
// Navigation into the pantry view (`#garde-manger`), on a real mounted screen — the same harness
// as tests/navigation.test.ts, in a file of its own: every screen mounted in a file keeps its page
// listeners for the rest of that file, and a fake-timer test placed after dozens of them pays for
// all their animations.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startWithScreen, type ConnexionLike } from '../src/demarrage';
import type { Ecran } from '../src/ecran';
import { ENTREE_MS, GARDE_MS } from '../src/mouvement/grammaire';
import { connexionFactice as doubleConnexion, ecranVide, stockageAvecSession, vider } from './aides';

/** See tests/navigation.test.ts: the safety timer of every view crossing. */
const GARDE_TRAVERSEE_MS = ENTREE_MS + GARDE_MS;
const piece: Ecran = ecranVide;
const connexionFactice = () => doubleConnexion('succes');

afterEach(() => { location.hash = ''; });

// Pantry view (spec 2026-09-28): a full-screen sub-view on a par with `#taches` — entered through
// its hash, loaded on entry (never periodically), automatic return after `RETOUR_MS`, Back from
// its entry level goes home. The soon list is the pantry tile's own `entite`, never a literal.
describe('pantry view (#garde-manger)', () => {
  const kitchen: Ecran = {
    ...piece,
    commandes: [{ libelle: 'Garde-manger', icone: 'jar', entite: 'todo.stock_soon', vue: '#garde-manger' }],
  };
  const BATCHES = [
    { id: 11, remaining: 350, best_before: null, product_id: 1, product_name: 'Yaourt', base_unit: 'g',
      location_id: 1, location_name: 'Frigo', location_position: 1,
      aisle_id: null, aisle_name: null, aisle_position: null },
  ];

  function stockConnection() {
    const envoyerCommande = vi.fn(async (p: Record<string, unknown>) => {
      if (p.type === 'home_stock/batches/list') return { batches: BATCHES };
      if (p.type === 'home_stock/locations/list') return { locations: [{ id: 1, name: 'Frigo', position: 1 }] };
      throw new Error(`unexpected command ${String(p.type)}`);
    });
    const listerTaches = vi.fn(async () => [{ uid: '11', texte: 'Yaourt' }]);
    const cx: ConnexionLike = { ...connexionFactice(), envoyerCommande, listerTaches };
    return { cx, envoyerCommande, listerTaches };
  }

  const listReads = (spy: ReturnType<typeof vi.fn>) =>
    spy.mock.calls.filter((c) => c[0].type === 'home_stock/batches/list').length;

  async function mount(cx: ConnexionLike, minuteurFn: typeof setTimeout = vi.fn() as any) {
    const racine = document.createElement('div');
    await startWithScreen(racine, kitchen, {
      stockage: stockageAvecSession, createConnection: () => cx,
      intervalFn: vi.fn() as any, minuteurFn,
      maintenant: () => new Date(2026, 7, 1, 14, 0),
    });
    return racine;
  }

  async function enter(hash: string) {
    location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
    await vider();
  }

  it('entering loads the stock once, from the tile entity, and shows the entry level', async () => {
    const { cx, envoyerCommande, listerTaches } = stockConnection();
    const racine = await mount(cx);
    expect(listReads(envoyerCommande)).toBe(0);   // nothing is read before the view opens

    await enter('#garde-manger');

    expect(racine.querySelector('[data-mvt="vue:garde-manger"]')).not.toBeNull();
    expect(listReads(envoyerCommande)).toBe(1);
    expect(listerTaches).toHaveBeenCalledWith('todo.stock_soon');
    expect(racine.textContent).toContain('À consommer vite (1)');
  });

  it('reopening starts again from the entry level and reads the stock again', async () => {
    const { cx, envoyerCommande } = stockConnection();
    const racine = await mount(cx);
    await enter('#garde-manger');
    racine.querySelectorAll('.ligne-tache')[1].dispatchEvent(new Event('pointerdown'));   // Frigo
    await vider();
    expect(racine.textContent).toContain('Yaourt');

    await enter('');
    await enter('#garde-manger');
    expect(listReads(envoyerCommande)).toBe(2);
    expect(racine.textContent).toContain('À consommer vite (1)');
  });

  it('a page reloaded on the view loads the stock once connected, without any hashchange', async () => {
    location.hash = '#garde-manger';
    const { cx, envoyerCommande } = stockConnection();
    const racine = await mount(cx);
    await vider();
    expect(listReads(envoyerCommande)).toBe(1);
    expect(racine.textContent).toContain('À consommer vite (1)');
  });

  it('under ?essai=1, the render checker injects a synthetic stock over any real read', async () => {
    history.replaceState(null, '', '/?essai=1');
    try {
      const { cx } = stockConnection();
      const racine = await mount(cx);
      await enter('#garde-manger');
      const inject = (window as unknown as Record<string, (...a: unknown[]) => void>).__injecterStock;
      expect(typeof inject).toBe('function');
      inject(
        [{ ...BATCHES[0], id: 50, product_name: 'Riz' }, { ...BATCHES[0], id: 51, product_name: 'Thé' }],
        [{ id: 1, name: 'Frigo', position: 1 }, { id: 2, name: 'Cave', position: 2 }],
        ['50', '51'],
      );
      await vider();
      expect(racine.textContent).toContain('À consommer vite (2)');
      expect(racine.textContent).toContain('Cave');
    } finally {
      history.replaceState(null, '', '/');
      delete (window as unknown as Record<string, unknown>).__injecterStock;
    }
  });

  it('without ?essai=1, no injection point exists', async () => {
    const { cx } = stockConnection();
    await mount(cx);
    expect((window as unknown as Record<string, unknown>).__injecterStock).toBeUndefined();
  });

  it('Back from the entry level goes home', async () => {
    const { cx } = stockConnection();
    const racine = await mount(cx);
    await enter('#garde-manger');
    racine.querySelector('[data-mvt="vue:garde-manger"] .xl')!.dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('');
  });

  it('returns home by itself after RETOUR_MS, like the other sub-views', async () => {
    vi.useFakeTimers();
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('no network in this test')) as any;
    try {
      const { cx } = stockConnection();
      const racine = await mount(cx, setTimeout);
      location.hash = '#garde-manger';
      await vi.advanceTimersByTimeAsync(0);
      expect(racine.querySelector('[data-mvt="vue:garde-manger"]')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
      await vi.advanceTimersByTimeAsync(45_000);
      window.dispatchEvent(new Event('hashchange'));   // same jsdom/fake-timers limit as the #taches test
      await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
      expect(location.hash).toBe('');
      expect(racine.querySelector('[data-mvt="vue:garde-manger"]')).toBeNull();
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.useRealTimers();
    }
  });
});
