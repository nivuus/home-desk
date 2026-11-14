// @vitest-environment jsdom
/** The weather and calendar loaders (`src/boot/loaders.ts`) on a socket that stays open for
 *  longer than an access token lives.
 *
 *  A wall tablet keeps ONE websocket open for days, and the access token expires 30 minutes after
 *  it was issued. Anything that authenticates with that token outside the socket must therefore
 *  either refresh it or not need it at all. These tests drive a REAL `Connexion` over a recording
 *  socket double and stub the global `fetch`, so that no run of this file — red or green — can
 *  ever send a real request. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connexion } from '../src/connexion';
import { chargerMeteo, chargerAgenda } from '../src/boot/loaders';
import type { ScreenState } from '../src/boot/state';

class RecordingSocket {
  static last: RecordingSocket | undefined;
  readyState = 1;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Record<string, any>[] = [];
  constructor(readonly url: string) { RecordingSocket.last = this; }
  send(raw: string): void { this.sent.push(JSON.parse(raw)); }
  receive(m: unknown): void { this.onmessage?.({ data: JSON.stringify(m) }); }
}

const T0 = new Date(2026, 10, 14, 9, 0);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

let fetchStub: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  // Answers like Home Assistant does to an expired bearer token. Never a real request.
  fetchStub = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
  vi.stubGlobal('fetch', fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A connection opened at T0 with a token that expires at T0 + 30 min, authenticated, then left
 *  open for 45 minutes — the ordinary life of a wall tablet. */
async function connectionOpenFor45Minutes() {
  const tokens = {
    access_token: 'issued-at-t0', refresh_token: 'r', clientId: 'c',
    expires: T0.getTime() + 30 * 60_000,
  };
  const storage = { getItem: () => JSON.stringify(tokens), setItem: vi.fn() } as unknown as Storage;
  const cx = new Connexion(tokens, {
    origineWs: 'ws://test', WebSocketImpl: RecordingSocket as any,
    intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any, stockage: storage,
    fetchFn: fetchStub as any,
  });
  await cx.connecter();
  const ws = RecordingSocket.last!;
  ws.receive({ type: 'auth_ok' });
  vi.setSystemTime(new Date(T0.getTime() + 45 * 60_000));
  const s = {
    cx, d: { stockage: storage, maintenant: () => new Date() },
    dessiner: vi.fn(), jours: [], evenements: [], evenementsParCalendrier: {},
  } as unknown as ScreenState;
  return { cx, ws, s };
}

describe('weather loader on a long-lived socket', () => {
  it('still gets the forecast 45 minutes after connecting, without the expired token', async () => {
    const { ws, s } = await connectionOpenFor45Minutes();
    const forecast = [{ datetime: '2026-11-14', condition: 'sunny', temperature: 12 }];

    const loading = chargerMeteo(s);
    await flush();
    // The stale token must not be sent anywhere: the socket is authenticated already.
    expect(fetchStub).not.toHaveBeenCalled();
    const call = ws.sent.find((m) => m.type === 'call_service' && m.domain === 'weather');
    expect(call).toMatchObject({
      service: 'get_forecasts', return_response: true,
      service_data: { type: 'daily' }, target: { entity_id: 'weather.maison' },
    });
    ws.receive({ id: call!.id, type: 'result', success: true,
      result: { context: {}, response: { 'weather.maison': { forecast } } } });
    await loading;

    expect(s.jours).toEqual(forecast);
  });

  it('drops the previous forecast when the request fails, instead of showing it as current', async () => {
    const { ws, s } = await connectionOpenFor45Minutes();
    s.jours = [{ datetime: '2026-11-13', condition: 'rainy', temperature: 9 } as any];

    const loading = chargerMeteo(s);
    await flush();
    const call = ws.sent.find((m) => m.type === 'call_service' && m.domain === 'weather');
    expect(call, 'the forecast request goes through the socket').toBeDefined();
    ws.receive({ id: call!.id, type: 'result', success: false,
      error: { code: 'service_validation_error', message: 'unavailable' } });
    await loading;

    expect(s.jours).toEqual([]);
    expect(s.dessiner).toHaveBeenCalled();
  });
});

describe('calendar loader on a long-lived socket', () => {
  it('queries every calendar through the socket 45 minutes after connecting', async () => {
    const { ws, s } = await connectionOpenFor45Minutes();

    const loading = chargerAgenda(s);
    await flush();
    expect(fetchStub).not.toHaveBeenCalled();
    const calls = ws.sent.filter((m) => m.type === 'call_service' && m.domain === 'calendar');
    expect(calls.map((m) => m.target.entity_id)).toEqual([
      'calendar.anniversaires', 'calendar.famille', 'calendar.personnel', 'calendar.professionnel',
    ]);
    for (const m of calls) {
      expect(m).toMatchObject({ service: 'get_events', return_response: true });
      const events = m.target.entity_id === 'calendar.famille'
        ? [{ summary: 'Dentist', start: '2026-11-14T11:00:00+01:00', end: '2026-11-14T12:00:00+01:00' }]
        : [];
      ws.receive({ id: m.id, type: 'result', success: true,
        result: { context: {}, response: { [m.target.entity_id]: { events } } } });
    }
    await loading;

    expect(s.evenements.map((e) => [e.resume, e.debut])).toEqual([
      ['Dentist', '2026-11-14T11:00:00+01:00'],
    ]);
  });

  it('keeps the last known events of a calendar whose request fails, never "no appointments"', async () => {
    const { ws, s } = await connectionOpenFor45Minutes();
    const answer = (fail: boolean) => {
      const calls = ws.sent.filter((m) => m.type === 'call_service' && m.domain === 'calendar');
      for (const m of calls.slice(-4)) {
        if (fail && m.target.entity_id === 'calendar.famille') {
          ws.receive({ id: m.id, type: 'result', success: false,
            error: { code: 'home_assistant_error', message: 'calendar offline' } });
          continue;
        }
        const events = m.target.entity_id === 'calendar.famille'
          ? [{ summary: 'Dentist', start: '2026-11-14T11:00:00+01:00', end: '2026-11-14T12:00:00+01:00' }]
          : [];
        ws.receive({ id: m.id, type: 'result', success: true,
          result: { context: {}, response: { [m.target.entity_id]: { events } } } });
      }
    };

    let loading = chargerAgenda(s);
    await flush();
    answer(false);
    await loading;
    loading = chargerAgenda(s);
    await flush();
    answer(true);
    await loading;

    expect(s.evenements.map((e) => e.resume)).toEqual(['Dentist']);
  });
});
