// @vitest-environment jsdom
//
// Performance P-5 (audit of 2026-11-16): the tablet subscribed to every `state_changed` of the
// house and asked for a full `get_states` on every connection, so it received, parsed and kept
// all ~1 700 entities — on a device with ~130 MB free. It now follows only the entities its
// screen reads, through `subscribe_entities` with `entity_ids` (Home Assistant 2022.4 or later,
// the version its own JS client requires for that command).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connexion, type EvenementEtat } from '../src/connexion';
import { Etat } from '../src/etat';
import { ECRANS } from '../src/ecran';
import { monterDemarrage, vider, SocketFactice, jetons, stockageSansSession } from './aides';

type Envoi = Record<string, any>;

function connexion(intervalFn = vi.fn()) {
  return new Connexion({ ...jetons, expires: Date.now() + 3_600_000 }, {
    origineWs: 'ws://test', WebSocketImpl: SocketFactice as any,
    intervalFn: intervalFn as any, minuteurFn: vi.fn() as any, stockage: stockageSansSession,
  });
}

async function ouverte(cx: Connexion): Promise<SocketFactice> {
  await cx.connecter();
  await vider();   // `auth_ok`, played by the double at the next microtask
  return SocketFactice.ouvertes.at(-1)!;
}

const souscriptions = (ws: SocketFactice): Envoi[] => ws.envoyes.filter((m) => m.type === 'subscribe_entities');

beforeEach(() => { SocketFactice.ouvertes = []; });

describe('what goes over the wire', () => {
  it('never the whole house: no state_changed subscription, no get_states', async () => {
    const cx = connexion();
    cx.followEntities(['light.a']);
    const ws = await ouverte(cx);
    expect(ws.envoyes.filter((m) => m.type === 'subscribe_events' || m.type === 'get_states')).toEqual([]);
    expect(souscriptions(ws)).toEqual([{ id: expect.any(Number), type: 'subscribe_entities', entity_ids: ['light.a'] }]);
  });

  it('a newly followed entity is subscribed alone, an already followed one never again', async () => {
    const cx = connexion();
    const ws = await ouverte(cx);
    expect(souscriptions(ws)).toEqual([]);   // nothing asked yet: nothing subscribed
    cx.followEntities(['light.a', 'sensor.b']);
    cx.followEntities(['light.a', 'cover.c']);
    expect(souscriptions(ws).map((m) => m.entity_ids)).toEqual([['light.a', 'sensor.b'], ['cover.c']]);
  });

  it('a reconnection subscribes to every followed entity at once, under a new id', async () => {
    const cx = connexion();
    const premiere = await ouverte(cx);
    cx.followEntities(['light.a']);
    cx.followEntities(['sensor.b']);
    premiere.couper();
    const seconde = await ouverte(cx);
    expect(seconde).not.toBe(premiere);
    expect(souscriptions(seconde).map((m) => m.entity_ids)).toEqual([['light.a', 'sensor.b']]);
  });

  it('an id Home Assistant would refuse is not sent: one would refuse the whole command', async () => {
    const cx = connexion();
    const ws = await ouverte(cx);
    cx.followEntities(['light.a', '', 'Light.B', 'light.', 'light.__x', 'sensor.c_1']);
    expect(souscriptions(ws).map((m) => m.entity_ids)).toEqual([['light.a', 'sensor.c_1']]);
  });
});

describe('what comes back, applied as Home Assistant\'s own client applies it', () => {
  async function abonne(ids: string[]) {
    const cx = connexion();
    const vus: EvenementEtat[] = [];
    cx.surChangement((e) => vus.push(e));
    cx.followEntities(ids);
    const ws = await ouverte(cx);
    const id = souscriptions(ws)[0]!.id;
    return { cx, ws, vus, recevoir: (event: unknown) => ws.recevoir({ type: 'event', id, event }) };
  }

  it('full states, then changes against the last state, attributes added and removed', async () => {
    const { vus, recevoir } = await abonne(['light.a']);
    recevoir({ a: { 'light.a': { s: 'on', a: { brightness: 10, friendly_name: 'A' }, lc: 1_700_000_000 } } });
    recevoir({ c: { 'light.a': { '+': { a: { brightness: 200 } }, '-': { a: ['friendly_name'] } } } });
    recevoir({ c: { 'light.a': { '+': { s: 'off', lc: 1_700_000_060 } } } });
    expect(vus).toEqual([
      { entity_id: 'light.a', state: 'on', attributes: { brightness: 10, friendly_name: 'A' }, last_changed: '2023-11-14T22:13:20.000Z' },
      { entity_id: 'light.a', state: 'on', attributes: { brightness: 200 }, last_changed: '2023-11-14T22:13:20.000Z' },
      { entity_id: 'light.a', state: 'off', attributes: { brightness: 200 }, last_changed: '2023-11-14T22:14:20.000Z' },
    ]);
  });

  it('an entity removed from Home Assistant leaves the state store', async () => {
    const etat = new Etat();
    const { cx, recevoir } = await abonne(['light.a']);
    cx.surChangement((e) => etat.appliquer(e));
    recevoir({ a: { 'light.a': { s: 'on', a: {} } } });
    expect(etat.isPresent('light.a')).toBe(true);
    recevoir({ r: ['light.a'] });
    expect(etat.isPresent('light.a')).toBe(false);
  });

  it('after a reconnection, an entity that left meanwhile leaves too', async () => {
    const { cx, ws, vus, recevoir } = await abonne(['light.a', 'light.b']);
    recevoir({ a: { 'light.a': { s: 'on', a: {} }, 'light.b': { s: 'on', a: {} } } });
    ws.couper();
    const seconde = await ouverte(cx);
    seconde.recevoir({ type: 'event', id: souscriptions(seconde)[0]!.id, event: { a: { 'light.a': { s: 'off', a: {} } } } });
    expect(vus.slice(2).map((e) => [e.entity_id, e.removed ?? e.state])).toEqual([['light.b', true], ['light.a', 'off']]);
  });
});

describe('the silence watch measures the link, not how busy the house is', () => {
  it('a quiet link is asked for a pong; a busy one is not', async () => {
    vi.useFakeTimers();
    try {
      const intervalFn = vi.fn();
      const cx = connexion(intervalFn);
      cx.followEntities(['light.a']);
      const ws = await ouverte(cx);
      const tick = intervalFn.mock.calls[0]![0] as () => void;
      const pings = () => ws.envoyes.filter((m) => m.type === 'ping').length;

      vi.advanceTimersByTime(5_000);
      tick();
      expect(pings()).toBe(0);
      vi.advanceTimersByTime(6_000);   // 11 s without a message
      tick();
      expect(pings()).toBe(1);

      const silences: number[] = [];
      cx.surSilence((ms) => silences.push(ms));
      ws.recevoir({ type: 'pong', id: ws.envoyes.at(-1)!.id });
      tick();
      expect(silences.at(-1)).toBe(0);   // the pong is the link answering
      expect(pings()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the screen asks for what it reads', () => {
  it('every entity read, once, at most one call per task', async () => {
    const etat = new Etat();
    const demandes: string[][] = [];
    etat.onRequest((ids) => demandes.push(ids));
    etat.lire('light.a');
    etat.estUtilisable('sensor.b');
    etat.isPresent('light.a');
    etat.follow('todo.c');
    await Promise.resolve();
    etat.lire('light.a');
    await Promise.resolve();
    expect(demandes).toEqual([['light.a', 'sensor.b', 'todo.c']]);
  });

  // Measured, not estimated: every room of this house mounted on a REAL `Connexion`, counting the
  // entities it subscribes to. Home Assistant forwards a change only to a subscription that names
  // the entity (`_forward_entity_changes`, core). Nothing was measured on a real tablet.
  it.each(Object.keys(ECRANS))('%s follows its own entities only, never the house\'s 1 708', async (nom) => {
    const piece = ECRANS[nom as keyof typeof ECRANS];
    const cx = connexion();
    await monterDemarrage(piece, { createConnection: () => cx });
    await vider();
    const ws = SocketFactice.ouvertes.at(-1)!;
    const suivies = new Set(souscriptions(ws).flatMap((m) => m.entity_ids as string[]));

    expect(ws.envoyes.filter((m) => m.type === 'get_states' || m.type === 'subscribe_events')).toEqual([]);
    expect(suivies.size).toBeGreaterThan(5);
    expect(suivies.size).toBeLessThan(120);
    // A change of every entity of the house used to reach the tablet as 1 708 messages, plus a
    // 1 708-state `get_states` on every connection; it now reaches it as one message per followed
    // entity, and a reconnection resends only those.
    console.info(`P-5 ${nom}: ${suivies.size} entities followed, in ${souscriptions(ws).length} subscription message(s)`);
  });
});
