/** The REST loaders (`chargerMeteo`, `chargerAgenda`) must authenticate with a VALID access token,
 *  however long the websocket has stayed open.
 *
 *  Measured in production on 2026-11-27: ~175 HTTP 401 a day from Home Assistant on
 *  `/api/calendars/calendar.*` and `/api/services/weather/get_forecasts`, from all three wall
 *  tablets. The loaders read the token from storage and used it as is, while only
 *  `Connexion.connecter()` ever refreshed it — that is, only when a socket was (re)opened. The
 *  token lives 30 minutes, a tablet keeps its socket for days.
 *
 *  These tests drive a REAL `Connexion` over `SocketFactice`, let the clock run 45 minutes past
 *  the connection with the socket still open, then run the loaders. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connexion, type Jetons } from '../src/connexion';
import { chargerAgenda, chargerMeteo } from '../src/boot/loaders';
import type { ScreenState } from '../src/boot/state';
import { SocketFactice, vider } from './aides';

const DEBUT = new Date(2026, 10, 27, 8, 0).getTime();
const MINUTE = 60_000;

type Appel = { url: string; autorisation: string | undefined };

/** Home Assistant as seen over HTTP: `/auth/token` issues a new 30-minute token every time it is
 *  asked, and every other endpoint answers 401 unless the bearer is the CURRENT, unexpired one. */
function homeAssistantHttp() {
  const appels: Appel[] = [];
  let emis = 0;
  let valide = { jeton: 'initial', expire: DEBUT + 30 * MINUTE };
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const autorisation = (init?.headers as Record<string, string> | undefined)?.Authorization;
    appels.push({ url: u, autorisation });
    if (u === '/auth/token') {
      emis++;
      // Let several callers overlap on the same refresh, as a real network round trip would.
      await vider();
      valide = { jeton: `frais-${emis}`, expire: Date.now() + 30 * MINUTE };
      return { ok: true, status: 200, json: async () => ({ access_token: valide.jeton, expires_in: 1800 }) } as Response;
    }
    if (autorisation !== `Bearer ${valide.jeton}` || Date.now() >= valide.expire) {
      return { ok: false, status: 401, json: async () => ({}) } as Response;
    }
    if (u.startsWith('/api/services/weather/get_forecasts')) {
      return { ok: true, status: 200, json: async () => ({
        service_response: { 'weather.maison': { forecast: [{ datetime: '2026-11-27', condition: 'sunny' }] } },
      }) } as Response;
    }
    if (u.startsWith('/api/calendars/calendar.')) {
      return { ok: true, status: 200, json: async () => ([
        { summary: 'Dentiste', start: { dateTime: '2026-11-27T10:00:00+01:00' } },
      ]) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  return { fetchFn, appels, refreshs: () => emis };
}

function stockage(initial: Jetons) {
  const contenu = new Map<string, string>([['hassTokens', JSON.stringify(initial)]]);
  return {
    getItem: (k: string) => contenu.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => { contenu.set(k, v); }),
    lu: () => JSON.parse(contenu.get('hassTokens')!) as Jetons,
  };
}

/** Just what the two loaders read from a `ScreenState`. */
function etatEcran(cx: Connexion, store: ReturnType<typeof stockage>) {
  return {
    cx, d: { stockage: store, maintenant: () => new Date(Date.now()) },
    jours: [], evenements: [], dessiner: vi.fn(),
  } as unknown as ScreenState;
}

describe('REST loaders past the access token lifetime', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(DEBUT);
    SocketFactice.ouvertes = [];
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  async function connecteDepuis45Minutes() {
    const ha = homeAssistantHttp();
    globalThis.fetch = ha.fetchFn as unknown as typeof fetch;
    const store = stockage({ access_token: 'initial', refresh_token: 'r', expires: DEBUT + 30 * MINUTE, clientId: 'c' });
    const cx = new Connexion(store.lu(), {
      fetchFn: ha.fetchFn as unknown as typeof fetch, stockage: store as unknown as Storage,
      intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any, origineWs: 'ws://ha',
      WebSocketImpl: SocketFactice as any, page: undefined,
    });
    await cx.connecter();
    await cx.prete();
    expect(ha.refreshs()).toBe(0);   // the boot token was fresh: nothing to refresh at connect
    vi.setSystemTime(DEBUT + 45 * MINUTE);   // socket still open, token expired 15 minutes ago
    expect(SocketFactice.ouvertes).toHaveLength(1);
    return { ha, store, s: etatEcran(cx, store) };
  }

  it('the weather loader refreshes the expired token and gets the forecast', async () => {
    const { ha, store, s } = await connecteDepuis45Minutes();
    await chargerMeteo(s);
    const meteo = ha.appels.find((a) => a.url.startsWith('/api/services/weather/'));
    expect(meteo?.autorisation).toBe('Bearer frais-1');
    expect(s.jours).toHaveLength(1);
    expect(store.lu().access_token).toBe('frais-1');   // written back, as `connecter()` does
  });

  it('the calendar loader refreshes the expired token and gets the events', async () => {
    const { ha, s } = await connecteDepuis45Minutes();
    await chargerAgenda(s);
    const calendriers = ha.appels.filter((a) => a.url.startsWith('/api/calendars/'));
    expect(calendriers.length).toBeGreaterThan(0);
    for (const a of calendriers) expect(a.autorisation).toBe('Bearer frais-1');
    expect(s.evenements.length).toBeGreaterThan(0);
  });

  it('loaders running together share ONE refresh of the refresh token', async () => {
    const { ha, s } = await connecteDepuis45Minutes();
    await Promise.all([chargerMeteo(s), chargerAgenda(s)]);
    expect(ha.refreshs()).toBe(1);
    expect(ha.appels.filter((a) => a.url === '/auth/token')).toHaveLength(1);
  });

  it('a valid token is reused, never refreshed for nothing', async () => {
    const { ha, s } = await connecteDepuis45Minutes();
    await chargerMeteo(s);
    vi.setSystemTime(DEBUT + 50 * MINUTE);   // the refreshed token still has 25 minutes
    await chargerMeteo(s);
    expect(ha.refreshs()).toBe(1);
  });

  it('a refused refresh leaves the loaders silent, never throwing', async () => {
    const { ha, s } = await connecteDepuis45Minutes();
    ha.fetchFn.mockImplementation(async () => ({ ok: false, status: 400, json: async () => ({}) }) as Response);
    await expect(chargerMeteo(s)).resolves.toBeUndefined();
    await expect(chargerAgenda(s)).resolves.toBeUndefined();
    expect(s.dessiner).toHaveBeenCalledTimes(2);
  });
});
