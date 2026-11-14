// @vitest-environment jsdom
/** `Connexion.connecter()` is single-flight, and the connection owns its retries.
 *
 *  After a Home Assistant restart or a Wi-Fi drop during start-up, the connection's own retry
 *  chain and the start-up retry of `startScreen` both called `connecter()`. The guard only
 *  recognised an OPEN socket, so a socket still CONNECTING — or an attempt still refreshing its
 *  token — let a second one through: two sockets, the older one's handlers writing to the newer
 *  one, and an idle authenticated socket leaked on a device that runs for weeks. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connexion, type Jetons } from '../src/connexion';
import { startScreen } from '../src/demarrage';
import type { ConnexionLike } from '../src/demarrage';
import { ecranVide } from './aides';

class HeldSocket {
  static all: HeldSocket[] = [];
  readyState = 0;   // CONNECTING until the test says otherwise
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Record<string, any>[] = [];
  constructor(readonly url: string) { HeldSocket.all.push(this); }
  send(raw: string): void { this.sent.push(JSON.parse(raw)); }
  receive(m: unknown): void { this.onmessage?.({ data: JSON.stringify(m) }); }
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const freshTokens = (): Jetons => ({
  access_token: 'a', refresh_token: 'r', clientId: 'c', expires: Date.now() + 60 * 60_000,
});

function connection(tokens: Jetons, fetchFn: unknown = vi.fn()) {
  return new Connexion(tokens, {
    origineWs: 'ws://test', WebSocketImpl: HeldSocket as any,
    intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any,
    stockage: { getItem: () => null, setItem: vi.fn() } as any, fetchFn: fetchFn as any,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 14, 9, 0));
  HeldSocket.all = [];
});
afterEach(() => { vi.useRealTimers(); });

describe('Connexion.connecter is single-flight', () => {
  it('opens one socket when called again while the first one is still CONNECTING', async () => {
    const cx = connection(freshTokens());
    await cx.connecter();
    await cx.connecter();
    expect(HeldSocket.all).toHaveLength(1);
  });

  it('opens one socket when two calls overlap during the token refresh', async () => {
    const answers: ((r: unknown) => void)[] = [];
    const fetchFn = vi.fn(() => new Promise((r) => { answers.push(r); }));
    const cx = connection({ ...freshTokens(), expires: 0 }, fetchFn);
    const first = cx.connecter();
    const second = cx.connecter();
    for (const answer of answers) answer({ ok: true, json: async () => ({ access_token: 'new', expires_in: 1800 }) });
    await Promise.all([first, second]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(HeldSocket.all).toHaveLength(1);
  });

  it('a socket that is no longer the current one sends nothing on the current one', async () => {
    const cx = connection(freshTokens());
    await cx.connecter();
    const stale = HeldSocket.all[0];
    stale.readyState = 3;   // dropped: the next call opens a new socket
    await cx.connecter();
    const current = HeldSocket.all[1];
    expect(current).toBeDefined();

    stale.receive({ type: 'auth_ok' });   // a late answer on the old socket
    expect(current.sent).toEqual([]);
    expect(stale.sent).toEqual([]);
  });

  it('retries a failed attempt by itself, once, with the usual backoff', async () => {
    const refused = { ok: false, status: 503, json: async () => ({}) };
    const granted = { ok: true, json: async () => ({ access_token: 'new', expires_in: 1800 }) };
    const fetchFn = vi.fn().mockResolvedValueOnce(refused).mockResolvedValue(granted);
    const cx = connection({ ...freshTokens(), expires: 0 }, fetchFn);

    await expect(cx.connecter()).rejects.toThrow();
    expect(HeldSocket.all).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(HeldSocket.all).toHaveLength(1);
    // A single chain: nothing else is pending once that attempt succeeded.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(HeldSocket.all).toHaveLength(1);
  });
});

describe('startScreen — the start-up retry opens no connection of its own', () => {
  it('calls connecter() once, then waits for the connection to authenticate', async () => {
    let authenticated!: () => void;
    const ready = new Promise<void>((r) => { authenticated = r; });
    const connecter = vi.fn().mockRejectedValueOnce(new Error('refresh refused')).mockResolvedValue(undefined);
    const cx: ConnexionLike = {
      connecter, prete: () => ready,
      surChangement: () => {}, surSilence: () => {}, appelerService: () => {},
      listerTaches: async () => [], envoyerCommande: async () => { throw new Error('closed'); },
      abonner: () => {},
    };
    const retries: (() => Promise<void>)[] = [];
    const chargerEcran = vi.fn(async () => ({ ok: true as const, value: { ...ecranVide, nom: 'Cuisine' } }));
    const tokens = JSON.stringify(freshTokens());
    await startScreen(document.createElement('div'), 'Cuisine', {
      stockage: { getItem: () => tokens, setItem: vi.fn() } as any,
      createConnection: () => cx,
      chargerEcran,
      loadHouse: async () => ({ ok: true as const, value: { sources: [], appareils: [] } }),
      minuteurFn: ((cb: () => Promise<void>) => { retries.push(cb); }) as any,
      intervalFn: vi.fn() as any, recharger: vi.fn(),
      maintenant: () => new Date(2026, 10, 14, 9, 0),
    });
    expect(retries).toHaveLength(1);

    const retry = retries[0]();
    await flush();
    expect(connecter).toHaveBeenCalledTimes(1);
    authenticated();
    await retry;
    expect(chargerEcran).toHaveBeenCalledTimes(1);
  });
});
