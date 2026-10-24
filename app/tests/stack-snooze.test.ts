// @vitest-environment jsdom
//
// "Plus tard" (spec 2026-10-24): a snoozed card leaves the stack on every tablet for two hours.
// The set lives in the integration (`home_desk/plus_tard/abonner`); the tablet only follows it.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { collectStack } from '../src/stack/collect';
import { snoozeCard, subscribeSnoozes } from '../src/stack/snooze';
import { laterButton } from '../src/cards/actions';
import { detect, frame } from '../src/cards/airing';
import { S } from '../src/cards/strings';
import { CHEMINS } from '../src/rendu/icones';
import type { ContexteModes } from '../src/modes';
import type { Ecran } from '../src/screen-types';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';
import { CALME } from './contextes';
import { monterDemarrage, restaurerReseau, vider, type Montage } from './aides';

const VACUUM = 'vacuum.x';
const KEY = `aspirateur:${VACUUM}`;
const SUBSCRIPTION = 'home_desk/plus_tard/abonner';
const T = Date.UTC(2026, 7, 1, 12, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const last = <T>(xs: T[]): T => xs[xs.length - 1];

/** A clock the test moves, and the timers armed on it, fired by hand. */
function testClock() {
  const c = { nowMs: T, timers: [] as { fn: () => void; ms: number }[] };
  const clock = {
    now: () => c.nowMs,
    minuteurFn: ((fn: () => void, ms: number) => { c.timers.push({ fn, ms }); return c.timers.length; }) as unknown as typeof setTimeout,
  };
  /** Moves the clock to `ms` and fires the last armed timer, as `setTimeout` would. */
  const fireAt = (ms: number) => { c.nowMs = ms; c.timers[c.timers.length - 1].fn(); };
  return { c, clock, fireAt };
}

afterEach(() => { restaurerReseau(); vi.restoreAllMocks(); });

describe('the stack leaves snoozed cards out', () => {
  it('a snoozed key leaves the stack', () => {
    const s = screenWith({ etat: etatWith({ [VACUUM]: 'error' }), piece: pieceWith({ aspirateur: VACUUM }),
      vacuum: { robots: [], chosen: [] }, snoozed: new Set<string>() });
    expect(collectStack(frameWith(), s).map((c) => c.key)).toEqual([KEY]);
    expect(collectStack(frameWith(), { ...s, snoozed: new Set([KEY]) } as typeof s)).toEqual([]);
  });
});

describe('the snooze transport', () => {
  it('snoozeCard sends the key to the integration', async () => {
    const envoyerCommande = vi.fn(async () => null);
    await snoozeCard({ envoyerCommande }, KEY);
    expect(envoyerCommande).toHaveBeenCalledWith({ type: 'home_desk/plus_tard', cle: KEY });
  });

  it('subscribeSnoozes hands over the keys of each pushed set', () => {
    let push: (e: Record<string, unknown>) => void = () => {};
    const abonner = vi.fn((_c: Record<string, unknown>, cb: (e: Record<string, unknown>) => void) => { push = cb; });
    const seen: Set<string>[] = [];
    subscribeSnoozes({ abonner }, (keys) => seen.push(keys), testClock().clock);
    expect(abonner).toHaveBeenCalledWith({ type: SUBSCRIPTION }, expect.any(Function));
    push({ [KEY]: iso(T + 7_200_000) });
    push({});
    expect(seen).toEqual([new Set([KEY]), new Set()]);
  });

  it('a malformed set is reported and changes nothing', () => {
    let push: (e: Record<string, unknown>) => void = () => {};
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onChange = vi.fn();
    subscribeSnoozes({ abonner: (_c, cb) => { push = cb; } }, onChange, testClock().clock);
    push({ [KEY]: 12 });
    push({ [KEY]: 'not a date' });
    expect(onChange).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(2);
  });

  // A refused or silent subscription must not hide a card for longer than its two hours.
  it('with no push from the server, a key is gone at its end, on the tablet clock', () => {
    const { c, clock, fireAt } = testClock();
    let push: (e: Record<string, unknown>) => void = () => {};
    const seen: Set<string>[] = [];
    subscribeSnoozes({ abonner: (_c, cb) => { push = cb; } }, (keys) => seen.push(keys), clock);
    const OTHER = 'aeration:binary_sensor.window';
    push({ [KEY]: iso(T + 7_200_000), [OTHER]: iso(T + 9_000_000) });
    expect(last(c.timers).ms).toBe(7_200_000);             // one timer, on the soonest end

    fireAt(T + 7_199_000);                                      // early: nothing ends yet
    expect(seen).toHaveLength(1);
    expect(last(c.timers).ms).toBe(1_000);

    fireAt(T + 7_200_000);
    expect(last(seen)).toEqual(new Set([OTHER]));
    expect(last(c.timers).ms).toBe(1_800_000);
    fireAt(T + 9_000_000);
    expect(last(seen)).toEqual(new Set());
  });

  it('a push replaces the whole set, and its timer with it', () => {
    const { c, clock, fireAt } = testClock();
    let push: (e: Record<string, unknown>) => void = () => {};
    const onChange = vi.fn();
    subscribeSnoozes({ abonner: (_c, cb) => { push = cb; } }, onChange, clock);
    push({ [KEY]: iso(T + 7_200_000) });
    const armed = c.timers.length;
    push({});
    expect(onChange).toHaveBeenLastCalledWith(new Set());
    expect(c.timers).toHaveLength(armed);                      // an empty set arms nothing
    // The replaced timer, had it fired, finds nothing to drop and says nothing.
    fireAt(T + 7_200_000);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('the later button', () => {
  const screen = (horsLigne: boolean) => {
    const envoyerCommande = vi.fn(async () => null);
    return [screenWith({ cx: { envoyerCommande }, horsLigne }), envoyerCommande] as const;
  };

  it('is an icon button, named by the card strings, that snoozes its card', () => {
    const [s, envoyerCommande] = screen(false);
    const b = laterButton(s, KEY);
    expect(b.icon).toBe('snooze');
    expect(CHEMINS.snooze).toBeDefined();
    expect(b.label).toBe(S.later);
    b.act();
    expect(envoyerCommande).toHaveBeenCalledWith({ type: 'home_desk/plus_tard', cle: KEY });
  });

  it('offline, it sends nothing: never an action that lies', () => {
    const [s, envoyerCommande] = screen(true);
    laterButton(s, KEY).act();
    expect(envoyerCommande).not.toHaveBeenCalled();
  });

  it('a refused snooze is reported, and the card stays', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = screenWith({ cx: { envoyerCommande: async () => { throw new Error('refused'); } }, horsLigne: false });
    laterButton(s, KEY).act();
    await vider();
    expect(error).toHaveBeenCalled();
  });

  it('is the primary centre button of the airing card, and its only one', () => {
    const A = 'binary_sensor.window_a';
    const ctx: ContexteModes = { ...CALME, ouvrantOuvertDepuisMs: 25 * 60_000, chauffageEnMarche: true };
    const f = frameWith({ ctx });
    const s = screenWith({ etat: etatWith({ [A]: 'on' }), piece: pieceWith({ ouvrants: [A] }),
      cx: { envoyerCommande: vi.fn(async () => null) }, horsLigne: false });
    const [left, centre, right] = frame(detect(f, s)[0], f, s).buttons;
    expect(left).toBeUndefined();
    expect(right).toBeUndefined();
    expect(centre).toMatchObject({ icon: 'snooze', label: S.later, primary: true });
  });
});

describe('a mounted screen follows the shared set', () => {
  const base = (over: Partial<Ecran>): Ecran => ({
    nom: 'Room', temperature: 'sensor.room_t', ambiances: [], commandes: [], synthese: [],
    extrasMaison: [], sources: [], ouvrants: [], ...over,
  });
  const TV = { nom: 'TV', titre: ['media_player.tv'], sousTitre: [], affiche: [],
    progression: ['media_player.tv'], transport: ['media_player.tv'], volume: [],
    allumee: { entite: 'switch.tv_power', etats: ['on'] } };
  const LIVING = base({ sources: [TV], aspirateur: 'vacuum.robot' });
  let m: Montage;
  let now = T;
  const displayedType = () =>
    m.racine.querySelector('.carte')?.getAttribute('data-card')?.split(':')[0] ?? null;

  it('subscribes once, and a snoozed displayed card gives way to the next one', async () => {
    m = await monterDemarrage(LIVING, { maintenant: () => new Date(now), etats: [['switch.tv_power', 'on'],
      ['media_player.tv', 'playing', { media_title: 'Film' }],
      ['vacuum.robot', 'error', { friendly_name: 'Robot' }]] });
    expect(m.abonnements.filter((a) => a.commande.type === SUBSCRIPTION)).toHaveLength(1);
    expect(displayedType()).toBe('aspirateur');

    await m.diffuser(SUBSCRIPTION, { 'aspirateur:vacuum.robot': iso(T + 7_200_000) });
    expect(displayedType()).toBe('cinema');

    // Expired: the card comes back, and as it reappears with a higher rank it takes the place.
    await m.diffuser(SUBSCRIPTION, {});
    expect(displayedType()).toBe('aspirateur');
  });

  it('a snoozed card comes back at its end even if the server says nothing', async () => {
    now = T;
    m = await monterDemarrage(LIVING, { maintenant: () => new Date(now), etats: [['switch.tv_power', 'on'],
      ['media_player.tv', 'playing', { media_title: 'Film' }],
      ['vacuum.robot', 'error', { friendly_name: 'Robot' }]] });
    await m.diffuser(SUBSCRIPTION, { 'aspirateur:vacuum.robot': iso(T + 7_200_000) });
    expect(displayedType()).toBe('cinema');
    now = T + 7_200_000;
    for (const [fn, ms] of m.minuteurFn.mock.calls) if (ms === 7_200_000) (fn as () => void)();
    await vider();
    expect(displayedType()).toBe('aspirateur');
  });
});
