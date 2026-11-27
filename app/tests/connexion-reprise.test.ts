import { describe, it, expect, vi } from 'vitest';
import { Connexion } from '../src/connexion';

/** The wall tablets turn their screen off; Fully then hides the WebView and the page's JavaScript
 *  is throttled, then frozen. Measured on the living-room tablet on 2026-11-27: frozen from 12:17
 *  to 13:23, Home Assistant dropped the socket for lack of pong (`heartbeat=55` in
 *  `websocket_api/http.py`), and on wake the page first replayed 232 stale buffered messages
 *  (5.5 s, one redraw each) before learning the socket was dead, then reconnected. These tests pin
 *  what must happen instead when the page becomes visible again. */

class Ws {
  static toutes: Ws[] = [];
  readyState = 1;
  onmessage: ((ev: any) => void) | null = null;
  onclose: (() => void) | null = null;
  envoyes: any[] = [];
  fermee = false;
  constructor(public url: string) { Ws.toutes.push(this); }
  send(brut: string) { this.envoyes.push(JSON.parse(brut)); }
  close() { this.fermee = true; this.readyState = 3; }
  recevoir(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

class FaussePage {
  visibilityState: 'visible' | 'hidden' = 'visible';
  private ecouteurs: (() => void)[] = [];
  addEventListener(type: string, cb: () => void) { if (type === 'visibilitychange') this.ecouteurs.push(cb); }
  basculer(etat: 'visible' | 'hidden') { this.visibilityState = etat; for (const cb of this.ecouteurs) cb(); }
}

function monter() {
  Ws.toutes = [];
  const page = new FaussePage();
  const cx = new Connexion(
    { access_token: 'a', refresh_token: 'r', clientId: 'c', expires: Date.now() + 3_600_000 } as any,
    { origineWs: 'ws://test', WebSocketImpl: Ws as any, intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any, stockage: { getItem: () => null, setItem: vi.fn() } as any,
      page } as any,
  );
  return { cx, page };
}

const etat = (entity_id: string, state: string) => ({
  type: 'event', id: 1, event: { data: { new_state: { entity_id, state, attributes: {} } } },
});

describe('Connexion — waking up after the screen was off', () => {
  it('opens a fresh socket as soon as the page is visible again, without waiting for the old one to die', async () => {
    const { cx, page } = monter();
    await cx.connecter();
    page.basculer('hidden');
    expect(Ws.toutes).toHaveLength(1);   // hiding alone changes nothing

    page.basculer('visible');
    await Promise.resolve();

    expect(Ws.toutes).toHaveLength(2);
    expect(Ws.toutes[0].fermee).toBe(true);
  });

  it('drops what the old socket still had buffered: those states predate the freeze', async () => {
    const { cx, page } = monter();
    const recus: string[] = [];
    cx.surChangement((e) => recus.push(`${e.entity_id}=${e.state}`));
    await cx.connecter();
    const ancienne = Ws.toutes[0];
    page.basculer('hidden');
    page.basculer('visible');

    // The browser may still deliver what it queued for the abandoned socket, and close it late.
    ancienne.recevoir(etat('sensor.steps', '1426'));
    ancienne.onclose?.();

    expect(recus).toEqual([]);
    await Promise.resolve();
    expect(Ws.toutes).toHaveLength(2);   // no second reconnection from the old socket's close
  });

  it('asks the new socket for the whole current state once authenticated', async () => {
    const { cx, page } = monter();
    await cx.connecter();
    page.basculer('hidden');
    page.basculer('visible');
    await Promise.resolve();
    const neuve = Ws.toutes[1];

    neuve.recevoir({ type: 'auth_required' });
    neuve.recevoir({ type: 'auth_ok' });

    expect(neuve.envoyes.map((m) => m.type)).toEqual(['auth', 'subscribe_events', 'get_states']);
  });

  it('does nothing before the first connection: start-up owns that socket', () => {
    const { page } = monter();
    page.basculer('hidden');
    page.basculer('visible');
    expect(Ws.toutes).toHaveLength(0);
  });

  it('a backoff timer that fires while the fresh socket is still opening does not open another', async () => {
    const { cx, page } = monter();
    await cx.connecter();
    page.basculer('hidden');
    page.basculer('visible');
    await Promise.resolve();
    Ws.toutes[1].readyState = 0;   // CONNECTING

    await cx.connecter();          // what the old socket's pending `reconnecter()` would do

    expect(Ws.toutes).toHaveLength(2);
  });

  it('listens to the page only once, however many times it reconnects', async () => {
    const { cx, page } = monter();
    const ajout = vi.spyOn(page, 'addEventListener');
    await cx.connecter();
    Ws.toutes[0].readyState = 3;
    await cx.connecter();
    expect(ajout).toHaveBeenCalledTimes(1);
  });
});
