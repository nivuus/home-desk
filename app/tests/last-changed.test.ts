// @vitest-environment jsdom
/** "Open since" and "last motion" come from Home Assistant's `last_changed`, not from the moment
 *  the page received the state. `subscribe_entities` carries it (`lc`, epoch seconds) on every
 *  full state and on every change of state; dropping it made every duration restart from zero on
 *  each page load. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'lit';
import { Connexion, type EvenementEtat } from '../src/connexion';
import { Etat } from '../src/etat';
import { detect, frame } from '../src/cards/airing';
import { frameWith, pieceWith, screenWith, T0 } from './card-aides';
import { CALME } from './contextes';

class RecordingSocket {
  static last: RecordingSocket | undefined;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Record<string, any>[] = [];
  constructor(readonly url: string) { RecordingSocket.last = this; }
  send(raw: string): void { this.sent.push(JSON.parse(raw)); }
  receive(m: unknown): void { this.onmessage?.({ data: JSON.stringify(m) }); }
}

const TWO_HOURS_AGO = new Date(T0 - 2 * 3_600_000).toISOString();
const WINDOW = 'binary_sensor.window';

afterEach(() => { vi.useRealTimers(); });

describe('last_changed is carried from Home Assistant', () => {
  it('Connexion passes it on from the initial states and from a change', async () => {
    const cx = new Connexion(
      { access_token: 'a', refresh_token: 'r', clientId: 'c', expires: Date.now() + 3_600_000 },
      { origineWs: 'ws://test', WebSocketImpl: RecordingSocket as any, intervalFn: vi.fn() as any,
        minuteurFn: vi.fn() as any, stockage: { getItem: () => null, setItem: vi.fn() } as any },
    );
    const seen: EvenementEtat[] = [];
    cx.surChangement((e) => seen.push(e));
    cx.followEntities([WINDOW, 'light.x']);
    await cx.connecter();
    const ws = RecordingSocket.last!;
    ws.receive({ type: 'auth_ok' });
    const sub = ws.sent.find((m) => m.type === 'subscribe_entities')!;
    const lc = Date.parse(TWO_HOURS_AGO) / 1000;
    ws.receive({ type: 'event', id: sub.id, event: { a: {
      [WINDOW]: { s: 'on', a: {}, lc }, 'light.x': { s: 'on', a: {}, lc: lc - 60 },
    } } });
    ws.receive({ type: 'event', id: sub.id, event: { c: { 'light.x': { '+': { s: 'off', lc } } } } });

    expect(seen.map((e) => e.last_changed)).toEqual([TWO_HOURS_AGO, new Date((lc - 60) * 1000).toISOString(), TWO_HOURS_AGO]);
  });

  it('a window whose last_changed is two hours old shows two hours open, not zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);   // the page receives the state NOW
    const etat = new Etat();
    etat.appliquer({ entity_id: WINDOW, state: 'on', attributes: {}, last_changed: TWO_HOURS_AGO });
    expect(etat.lire(WINDOW)!.changeLe).toBe(T0 - 2 * 3_600_000);

    const f = frameWith({ ctx: { ...CALME, ouvrantOuvertDepuisMs: 2 * 3_600_000, chauffageEnMarche: true } });
    const s = screenWith({ etat, piece: pieceWith({ nom: 'Kitchen', ouvrants: [WINDOW] }) });
    const host = document.createElement('div');
    render(frame(detect(f, s)[0], f, s).middle, host);
    expect(host.textContent).toContain(
      new Intl.NumberFormat('fr', { style: 'unit', unit: 'hour', unitDisplay: 'long' }).format(2));
  });

  it('falls back on the reception time only when last_changed is missing or unreadable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const etat = new Etat();
    etat.appliquer({ entity_id: 'a.x', state: 'on', attributes: {} });
    etat.appliquer({ entity_id: 'b.x', state: 'on', attributes: {}, last_changed: 'not a date' });
    expect(etat.lire('a.x')!.changeLe).toBe(T0);
    expect(etat.lire('b.x')!.changeLe).toBe(T0);
  });
});
