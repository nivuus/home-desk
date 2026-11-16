// @vitest-environment jsdom
/** The permanent intervals of a mounted screen are armed once for the lifetime of the page.
 *
 *  Anything that throws after the connect step of `startWithScreen` sends its routine back to the
 *  beginning; the four intervals (clock, weather, calendar, maintenance tasks) used to be armed
 *  after that step, so every retry added four more that never stop. */
import { describe, it, expect, vi } from 'vitest';
import { ECRANS } from '../src/ecran';

const painter = vi.hoisted(() => ({ throwOnce: false }));
vi.mock('../src/boot/draw', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/boot/draw')>();
  return {
    ...actual,
    dessiner: (s: Parameters<typeof actual.dessiner>[0]) => {
      if (painter.throwOnce) { painter.throwOnce = false; throw new Error('painter failed once'); }
      actual.dessiner(s);
    },
  };
});

const { startWithScreen } = await import('../src/demarrage');

describe('startWithScreen — intervals across a retry', () => {
  it('a painter that throws once, then a retry, leaves exactly four intervals', async () => {
    const intervalFn = vi.fn();
    const retries: (() => Promise<void>)[] = [];
    const tokens = JSON.stringify({ access_token: 'a', refresh_token: 'r', expires: 0, clientId: 'c' });
    await startWithScreen(document.createElement('div'), ECRANS.bureau, {
      stockage: { getItem: () => tokens, setItem: vi.fn() } as any,
      createConnection: () => ({
        // The first paint after a successful connect throws, once.
        connecter: async () => { painter.throwOnce = retries.length === 0; },
        prete: async () => {},
        suivreEntites: () => {}, surChangement: () => {}, surSilence: () => {}, appelerService: () => {},
        listerTaches: async () => [],
        envoyerCommande: async () => { throw new Error('no answer in this test'); },
        abonner: () => {},
      }),
      intervalFn: intervalFn as any,
      // The start-up retry is the one scheduled with the first reconnection delay (1 s).
      minuteurFn: ((cb: () => Promise<void>, ms: number) => { if (ms === 1_000) retries.push(cb); }) as any,
      maintenant: () => new Date(2026, 10, 14, 14, 0),
    });
    expect(retries, 'the failed paint schedules a retry').toHaveLength(1);
    await retries[0]();
    await Promise.resolve();

    const permanent = intervalFn.mock.calls.filter(([, ms]) => ms === 20_000 || ms === 15 * 60_000);
    expect(permanent.map(([, ms]) => ms)).toEqual([20_000, 15 * 60_000, 15 * 60_000, 15 * 60_000]);
  });
});
