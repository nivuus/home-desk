// @vitest-environment jsdom
//
// Production gate of step 5, 2026-09-28, defect B: with Home Assistant unreachable at cold start,
// the tablet stayed on "Chargement de la configuration…" forever (probed for 60 s, six websocket
// attempts). `startScreen` awaited `cx.prete()`, which only resolves at the first `auth_ok` and
// never rejects — `Connexion` reconnects internally — so the `catch` that renders
// `startupError()` was unreachable. The spec promises the waiting screen, THEN the offline
// message.
//
// These tests mount a REAL `Connexion` over a fake socket rather than a `ConnexionLike` double:
// the defect lived precisely in the contract between the two (a promise that never settles plus
// an internal reconnection), which a double reproduces only if it already knows the answer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startScreen } from '../src/demarrage';
import { Connexion, type Jetons } from '../src/connexion';
import { SEUIL_MUET_MS } from '../src/boot/constants';
import { ecranVide } from './aides';

/** A browser WebSocket as `Connexion` sees it. While `haDown` is set, every socket is refused
 *  the way a browser reports it: a `close` without a single message. */
class FakeSocket {
  static all: FakeSocket[] = [];
  static haDown = true;
  readyState = 0;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: { type: string; id?: number }[] = [];
  constructor(public url: string) {
    FakeSocket.all.push(this);
    if (FakeSocket.haDown) queueMicrotask(() => { this.readyState = 3; this.onclose?.(); });
  }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  /** HA answers: the socket opens and the authentication handshake completes. */
  authenticate() {
    this.readyState = 1;
    this.onmessage?.({ data: JSON.stringify({ type: 'auth_required' }) });
    this.onmessage?.({ data: JSON.stringify({ type: 'auth_ok' }) });
  }
}

const live = () => FakeSocket.all.filter((s) => s.readyState !== 3);
const text = (el: HTMLElement) => el.textContent!.replace(/\s+/g, ' ').trim();

function mount() {
  const tokens: Jetons = {
    access_token: 'a', refresh_token: 'r', clientId: 'c', expires: Date.now() + 60 * 60_000,
  };
  const storage = { getItem: () => JSON.stringify(tokens), setItem: vi.fn() } as unknown as Storage;
  const racine = document.createElement('div');
  const chargerEcran = vi.fn(async () => ({ ok: true as const, value: { ...ecranVide, nom: 'Cuisine' } }));
  const recharger = vi.fn();
  const createConnection = vi.fn((j: Jetons) => new Connexion(j, {
    WebSocketImpl: FakeSocket as unknown as new (url: string) => WebSocket,
    origineWs: 'ws://ha',
    // Resolved at call time, so that the fake clock installed by `vi.useFakeTimers` drives them.
    intervalFn: ((cb: () => void, ms: number) => setInterval(cb, ms)) as unknown as typeof setInterval,
    minuteurFn: ((cb: () => void, ms: number) => setTimeout(cb, ms)) as unknown as typeof setTimeout,
    stockage: storage,
    fetchFn: vi.fn() as unknown as typeof fetch,
  }));
  void startScreen(racine, 'Cuisine', {
    stockage: storage, createConnection, chargerEcran, recharger,
    intervalFn: vi.fn() as unknown as typeof setInterval,
    minuteurFn: vi.fn() as unknown as typeof setTimeout,
    maintenant: () => new Date(2026, 7, 1, 14, 0),
  });
  return { racine, chargerEcran, recharger, createConnection };
}

describe('startScreen — Home Assistant unreachable at cold start', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 14, 0));
    FakeSocket.all = [];
    FakeSocket.haDown = true;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps the waiting screen while the silence is short, then says it cannot reach the house', async () => {
    const { racine, chargerEcran } = mount();

    // Well under the threshold the body itself uses to call the house silent: still waiting.
    await vi.advanceTimersByTimeAsync(SEUIL_MUET_MS - 10_000);
    expect(text(racine)).toBe('Cuisine Chargement de la configuration depuis Home Assistant…');
    expect(FakeSocket.all.length).toBeGreaterThan(1);   // the internal reconnection is running

    // The gate probed for 60 s: by then the waiting screen must have given way.
    await vi.advanceTimersByTimeAsync(60_000 - (SEUIL_MUET_MS - 10_000));
    expect(text(racine)).toMatch(/^Connexion impossible/);
    expect(chargerEcran).not.toHaveBeenCalled();
  });

  it('proceeds on its own when Home Assistant comes back: one socket, no reload', async () => {
    const { racine, chargerEcran, recharger, createConnection } = mount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(text(racine)).toMatch(/^Connexion impossible/);

    // HA is back: the next internal reconnection attempt succeeds (backoff capped at 30 s).
    FakeSocket.haDown = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(live()).toHaveLength(1);
    live()[0].authenticate();
    await vi.advanceTimersByTimeAsync(0);

    expect(chargerEcran).toHaveBeenCalledTimes(1);
    expect(text(racine)).not.toMatch(/Connexion impossible|Chargement de la configuration/);
    expect(racine.querySelector('.corps')).not.toBeNull();
    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(live()).toHaveLength(1);
    expect(recharger).not.toHaveBeenCalled();

    // Once the body is mounted, a later silence is the body's business (grey + offline banner):
    // the start-up message must never replace a mounted screen.
    await vi.advanceTimersByTimeAsync(2 * SEUIL_MUET_MS);
    expect(text(racine)).not.toMatch(/Connexion impossible/);
    expect(racine.querySelector('.corps')).not.toBeNull();
  });
});
