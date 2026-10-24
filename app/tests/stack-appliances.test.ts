// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { appliancesFor } from '../src/stack/appliances';
import { collectStack, frameCard } from '../src/stack/collect';
import type { Appareil } from '../src/configuration';
import type { Voiture } from '../src/ecran';
import type { Rank } from '../src/stack/types';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';

const ROBOT = 'vacuum.robot';
const MAP = 'camera.robot_map';

const vacuumAt = (piece: string, extra: Record<string, string> = {}): Appareil =>
  ({ type: 'aspirateur', piece, entites: { aspirateur: ROBOT, ...extra } });

/** A screen of room `nom`, its own declarations in `own`, the house's appliances in `appareils`. */
function screen(nom: string, states: Parameters<typeof etatWith>[0], appareils: Appareil[],
  own: Parameters<typeof pieceWith>[0] = {}) {
  return screenWith({ etat: etatWith(states), piece: pieceWith({ nom, ...own }),
    house: { sources: [], appareils }, vacuum: { robots: [], chosen: [] }, snoozed: new Set<string>() });
}

const keys = (s: ReturnType<typeof screen>) => collectStack(frameWith(), s).map((c) => c.key);

describe('appliancesFor', () => {
  const kitchen: Appareil = { type: 'aspirateur', piece: 'Kitchen', entites: { aspirateur: 'vacuum.a' } };
  const house: Appareil = { type: 'aspirateur', piece: 'maison', entites: { aspirateur: 'vacuum.b' } };
  const rankOf = (r: Rank | null) => () => r;

  it('an appliance of the room always; a house appliance only while it waits for a gesture', () => {
    expect(appliancesFor([kitchen, house], 'Kitchen', rankOf(4))).toEqual([kitchen]);
    expect(appliancesFor([kitchen, house], 'Kitchen', rankOf(2))).toEqual([kitchen, house]);
    expect(appliancesFor([kitchen, house], 'Office', rankOf(2))).toEqual([house]);
    expect(appliancesFor([kitchen, house], 'Office', rankOf(null))).toEqual([]);
  });

  it('"maison" is not a room: a screen named so still sees house appliances at rank 2 only', () => {
    expect(appliancesFor([house], 'maison', rankOf(4))).toEqual([]);
  });

  it('room names compare exactly, in any script', () => {
    const room: Appareil = { ...kitchen, piece: 'المطبخ' };
    expect(appliancesFor([room], 'المطبخ', rankOf(4))).toEqual([room]);
    expect(appliancesFor([{ ...kitchen, piece: 'Küche' }], 'kuche', rankOf(4))).toEqual([]);
  });
});

describe('house appliances in the stack', () => {
  it('house vacuum stuck shows on every room', () => {
    const appareils = [vacuumAt('maison')];
    expect(keys(screen('Office', { [ROBOT]: 'error' }, appareils))).toEqual([`aspirateur:${ROBOT}`]);
    expect(keys(screen('寝室', { [ROBOT]: 'error' }, appareils))).toEqual([`aspirateur:${ROBOT}`]);
  });

  it('house vacuum cleaning shows only in its room', () => {
    const appareils = [vacuumAt('Kitchen')];
    expect(keys(screen('Kitchen', { [ROBOT]: 'cleaning' }, appareils))).toEqual([`aspirateur:${ROBOT}`]);
    expect(keys(screen('Office', { [ROBOT]: 'cleaning' }, appareils))).toEqual([]);
    expect(keys(screen('Office', { [ROBOT]: 'error' }, appareils))).toEqual([]);
    expect(keys(screen('Office', { [ROBOT]: 'cleaning' }, [vacuumAt('maison')]))).toEqual([]);
  });

  it('same vacuum from screen and house is one card', () => {
    const s = screen('Kitchen', { [ROBOT]: 'error' }, [vacuumAt('Kitchen'), vacuumAt('maison')],
      { aspirateur: ROBOT });
    expect(keys(s)).toEqual([`aspirateur:${ROBOT}`]);
  });

  it('no appliance, no card, no error', () => {
    expect(keys(screen('Kitchen', {}, []))).toEqual([]);
    // Declared but unreadable, or a type whose card comes in a later batch.
    const later: Appareil[] = [
      { type: 'imprimante', piece: 'maison', entites: { etat: 'sensor.p', progression: 'sensor.q' } },
      { type: 'plantes', piece: 'Kitchen', entites: { plantes: ['sensor.x'] } },
      { type: 'air', piece: 'Kitchen', entites: { co2: 'sensor.c' }, seuil: 1000 },
      vacuumAt('maison'),
    ];
    expect(keys(screen('Kitchen', { 'sensor.p': 'printing' }, later))).toEqual([]);
  });
});

describe('the vacuum map', () => {
  it('a declared map camera is the image background, read from its entity_picture', () => {
    const s = screen('Kitchen', { [ROBOT]: 'cleaning', [MAP]: ['idle', { entity_picture: '/api/camera_proxy/x?token=t' }] },
      [vacuumAt('Kitchen', { plan: MAP })]);
    const [card] = collectStack(frameWith(), s);
    const fr = frameCard(card, frameWith(), s);
    expect(fr.background).toEqual({ kind: 'image', url: '/api/camera_proxy/x?token=t' });
    // Not measured yet: the theme colours until `afterCardPaint` measured this very image.
    expect(fr.tones).toEqual({ status: 'pending' });
  });

  it('no map, or one without a picture: the neutral colour', () => {
    const none = screen('Kitchen', { [ROBOT]: 'cleaning' }, [vacuumAt('Kitchen')]);
    const blank = screen('Kitchen', { [ROBOT]: 'cleaning', [MAP]: 'unavailable' }, [vacuumAt('Kitchen', { plan: MAP })]);
    for (const s of [none, blank]) {
      const [card] = collectStack(frameWith(), s);
      expect(frameCard(card, frameWith(), s).background).toEqual({ kind: 'solid', token: 'neutral' });
    }
  });

  it('the screen keeps its robot and gains the map the appliance declares', () => {
    const s = screen('Office', { [ROBOT]: 'error', [MAP]: ['idle', { entity_picture: '/m.png' }] },
      [vacuumAt('maison', { plan: MAP })], { aspirateur: ROBOT });
    const cards = collectStack(frameWith(), s);
    expect(cards.map((c) => c.key)).toEqual([`aspirateur:${ROBOT}`]);
    expect(frameCard(cards[0], frameWith(), s).background).toEqual({ kind: 'image', url: '/m.png' });
  });
});

describe('the house car', () => {
  const car = (piece: string, extra: Record<string, string> = {}): Appareil =>
    ({ type: 'voiture', piece, entites: { batterie: 'sensor.b', branchee: 'binary_sensor.p', ...extra } });
  const toPlug = { 'sensor.b': '40', 'binary_sensor.p': 'off', 'number.l': '80' };

  it('to plug in shows everywhere when it belongs to the house; no climate or limit button', () => {
    const s = screen('Office', toPlug, [car('maison', { limite: 'number.l', demarrerCharge: 'button.go' })]);
    const cards = collectStack(frameWith(), s);
    expect(cards).toEqual([{ key: 'voiture:sensor.b', type: 'voiture', rank: 2 }]);
    const [left, centre, right] = frameCard(cards[0], frameWith(), s).buttons;
    expect(left).toBeUndefined();
    expect(centre?.icon).toBe('lecture');
    expect(right).toBeUndefined();
  });

  it('the screen fills the fields it declares, the appliance the others', () => {
    const own: Voiture = { batterie: 'sensor.b', autonomie: 'sensor.a', branchee: 'binary_sensor.p',
      enCharge: 'binary_sensor.c', clim: 'binary_sensor.k', demarrerClim: 'button.k_on', arreterClim: 'button.k_off' };
    const s = screen('Living', { ...toPlug, 'binary_sensor.c': 'off', 'binary_sensor.other': 'on', 'binary_sensor.k': 'off' },
      [car('Living', { limite: 'number.l', demarrerCharge: 'button.go', enCharge: 'binary_sensor.other' })],
      { voiture: own });
    const cards = collectStack(frameWith(), s);
    // The limit only the appliance declares makes it "to plug in"; the screen's own charging
    // sensor wins over the appliance's (which says charging); one card for both sources.
    expect(cards).toEqual([{ key: 'voiture:sensor.b', type: 'voiture', rank: 2 }]);
    const [, centre, right] = frameCard(cards[0], frameWith(), { ...s, climEnVol: null } as typeof s).buttons;
    expect(centre?.icon).toBe('lecture');
    expect(right?.icon).toBe('clim');
  });
});
