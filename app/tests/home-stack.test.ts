// @vitest-environment jsdom
//
// The card stack in the home view, mounted for real (`startScreen`) on fixture screens: which
// card the central block shows, the grid of controls under it, the swipe, the return to the head
// card, and what the per-second ticks may write into the displayed card.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { monterDemarrage, vider, restaurerReseau, type Montage } from './aides';
import type { Bouton, Ecran } from '../src/ecran';
import type { DeclarationSource } from '../src/media';
import { RETURN_MS } from '../src/stack/follow';
import { PAS_PROGRESSION_MS } from '../src/boot/constants';
import { formaterRestant } from '../src/minuteur';

const T0 = new Date(2026, 7, 1, 14, 0).getTime();
let now = T0;

const tile = (libelle: string, entite: string): Bouton =>
  ({ libelle, icone: 'lock', entite, service: ['homeassistant', 'toggle'] });
const decl = (nom: string, id: string, allumee?: string): DeclarationSource => ({
  nom, titre: [id], sousTitre: [], affiche: [], progression: [id], transport: [id], volume: [],
  ...(allumee !== undefined ? { allumee: { entite: allumee, etats: ['on'] } } : {}),
});
const MUSIC = decl('Music', 'media_player.music');
const TV = decl('TV', 'media_player.tv', 'switch.tv_power');
const CONTROLS = [tile('Lumières', 'light.a'), tile('Chauffage', 'climate.a'),
  tile('Ambilight', 'light.amb'), tile('Porte', 'lock.a')];
const USABLE: [string, string][] = CONTROLS.map((c) => [c.entite, 'off']);
const TIMERS = [1, 2, 3].map((i) => ({ timer: `timer.t${i}`, nom: `input_text.t${i}` }));

const base = (over: Partial<Ecran>): Ecran => ({
  nom: 'Room', temperature: 'sensor.room_t', ambiances: [], commandes: CONTROLS, synthese: [],
  extrasMaison: [], sources: [], ouvrants: [], ...over,
});
const KITCHEN = base({ ambiances: [tile('Scene', 'scene.k')], sources: [MUSIC], minuteurs: TIMERS });
const OFFICE = base({ ambiances: [tile('Scene', 'scene.o')] });
const LIVING = base({ sources: [TV], aspirateur: 'vacuum.robot' });

type Etats = [string, string, Record<string, unknown>?][];
const PLAYING: Etats = [['media_player.music', 'playing', { media_title: 'Song' }]];
const timerRunning = (id: string, leftS: number): Etats[number] =>
  [id, 'active', { finishes_at: new Date(now + leftS * 1000).toISOString(), duration: '0:10:00' }];

let m: Montage;
async function mount(piece: Ecran, etats: Etats = []): Promise<Montage> {
  m = await monterDemarrage(piece, { maintenant: () => new Date(now), etats: [...USABLE, ...etats] });
  return m;
}

afterEach(() => { now = T0; restaurerReseau(); vi.restoreAllMocks(); });

const card = () => m.racine.querySelector<HTMLElement>('.carte');
const displayedType = () => card()?.getAttribute('data-card')?.split(':')[0] ?? null;
const controls = () => Array.from(m.racine.querySelectorAll('.commandes .commande'));
const firstControl = () => controls()[0]?.textContent?.trim() ?? '';

const pe = (type: string, x: number) =>
  new PointerEvent(type, { clientX: x, clientY: 100, pointerId: 1, bubbles: true });
/** A finger on the stack, then a horizontal drag of `dx` (0: a plain touch). */
async function drag(dx: number) {
  const pile = m.racine.querySelector<HTMLElement>('.pile')!;
  pile.dispatchEvent(pe('pointerdown', 200));
  for (let i = 1; i <= 4; i++) pile.dispatchEvent(pe('pointermove', 200 + (dx * i) / 4));
  pile.dispatchEvent(pe('pointerup', 200 + dx));
  await vider();
}
/** Fires every return to the head armed so far, as `setTimeout` would after `RETURN_MS`. */
async function fireReturns() {
  for (const [fn, ms] of m.minuteurFn.mock.calls) if (ms === RETURN_MS) (fn as () => void)();
  await vider();
}

describe('the home view renders the stack', () => {
  it('kitchen, music playing: one card, two controls, timer tile kept', async () => {
    await mount(KITCHEN, PLAYING);
    expect(card()).not.toBeNull();
    expect(m.racine.querySelector('.groupe')).toBeNull();          // the Ambiance row dropped
    expect(controls()).toHaveLength(2);
    // The timer tile survives the dropped Ambiance row, at the first place of the grid.
    expect(m.racine.querySelector('.commandes .tuile-minuteur')).toBe(controls()[0]);
  });

  it('a timer started during the music takes the place, even after a touch', async () => {
    await mount(KITCHEN, PLAYING);
    await drag(0);
    await m.pousser(...timerRunning('timer.t1', 300));
    expect(displayedType()).toBe('minuteur');
  });

  it('empty stack: the default block and its budget come back', async () => {
    await mount(OFFICE);
    expect(card()).toBeNull();
    expect(controls()).toHaveLength(4);
    expect(m.racine.querySelector('.groupe')).not.toBeNull();
  });

  it('the alert stays outside the stack and takes the block, a timer included', async () => {
    await mount(KITCHEN, [timerRunning('timer.t1', 300),
      ['binary_sensor.distributeur_de_croquettes_probleme', 'on'], ['binary_sensor.capteur_humain', 'on']]);
    expect(m.racine.querySelector('.alerte')).not.toBeNull();
    expect(card()).toBeNull();
    expect(m.racine.querySelector('.pile')).toBeNull();
  });
});

describe('swiping and returning', () => {
  it('the controls follow the head card, not the displayed one', async () => {
    await mount(LIVING, [['switch.tv_power', 'on'], ['media_player.tv', 'playing', { media_title: 'Film' }],
      ['vacuum.robot', 'error', { friendly_name: 'Robot' }]]);
    expect(displayedType()).toBe('aspirateur');                     // stuck: rank 2, before the film
    const before = firstControl();
    expect(before).not.toContain('Ambilight');
    await drag(-120);
    expect(displayedType()).toBe('cinema');
    expect(firstControl()).toBe(before);
  });

  it('back to the head after a minute without a touch', async () => {
    await mount(KITCHEN, [...PLAYING, timerRunning('timer.t1', 300)]);
    expect(displayedType()).toBe('minuteur');
    await drag(-120);
    expect(displayedType()).toBe('media');
    now += RETURN_MS;
    await fireReturns();
    expect(displayedType()).toBe('minuteur');
  });

  it('a stack of one card is still swipe-locked: a drag snaps back and changes nothing', async () => {
    await mount(KITCHEN, PLAYING);
    const pile = m.racine.querySelector<HTMLElement>('.pile')!;
    // The swipe is attached even with one card: mid-drag the stack follows the finger, damped
    // to a quarter at the end of the stack (-120 px of finger, -30 px of card).
    pile.dispatchEvent(pe('pointerdown', 200));
    pile.dispatchEvent(pe('pointermove', 80));
    expect(pile.style.transform).toBe('translateX(-30px)');
    pile.dispatchEvent(pe('pointerup', 80));
    await vider();
    expect(displayedType()).toBe('media');
    expect(m.racine.querySelector<HTMLElement>('.pile')!.style.transform).toBe('');
  });

  it('a redraw in the middle of a drag keeps the finger offset', async () => {
    await mount(KITCHEN, [...PLAYING, timerRunning('timer.t1', 300)]);
    const pile = m.racine.querySelector<HTMLElement>('.pile')!;
    pile.dispatchEvent(pe('pointerdown', 200));
    pile.dispatchEvent(pe('pointermove', 140));
    expect(pile.style.transform).toBe('translateX(-60px)');
    // A redraw that rewrites the card's own style (its colour turns late): `lit` owns that
    // attribute on `.carte`, never on `.pile`.
    await m.pousser(...timerRunning('timer.t1', 30));
    expect(card()!.getAttribute('style')).toContain('--carte-timer-late-fond');
    expect(m.racine.querySelector('.pile')).toBe(pile);
    expect(pile.style.transform).toBe('translateX(-60px)');
    pile.dispatchEvent(pe('pointerup', 140));
  });

  it('the screen turning off flips cinema to media: no stale key, the old return is inert', async () => {
    await mount(LIVING, [['switch.tv_power', 'on'], ['media_player.tv', 'playing', { media_title: 'Film' }]]);
    expect(displayedType()).toBe('cinema');
    await drag(0);                                                   // arms a return
    const armed = m.minuteurFn.mock.calls.filter(([, ms]) => ms === RETURN_MS).length;
    expect(armed).toBe(1);
    await m.pousser('switch.tv_power', 'off');
    expect(displayedType()).toBe('media');
    expect(m.racine.querySelectorAll('.carte')).toHaveLength(1);
    // The flip was a new card taking the place: the touch it had no longer applies, and the
    // return it armed redraws nothing when it fires. The trace of a redraw is the clock: 60 s
    // later it reads 14:01, so a stale return that still painted would show it.
    const clock = () => m.racine.querySelector('.heure')!.textContent!.replace(/\s/g, '');
    expect(clock()).toBe('14:00');
    const html = m.racine.innerHTML;
    now += RETURN_MS;
    const stale = m.minuteurFn.mock.calls.find(([, ms]) => ms === RETURN_MS)![0] as () => void;
    const before = m.racine.querySelector('.carte');
    stale();
    await vider();
    expect(clock()).toBe('14:00');
    expect(m.racine.querySelector('.carte')).toBe(before);
    expect(m.racine.innerHTML).toBe(html);
    // The check can fail: any real redraw at this instant moves the clock.
    await m.pousser('light.a', 'on');
    expect(clock()).toBe('14:01');
  });
});

describe('what the ticks may write into the displayed card', () => {
  /** One second of the local tickers (progress rail and countdowns), as `setInterval` would. */
  const tick = () => m.intervalFn.mock.calls
    .filter(([, every]) => every === PAS_PROGRESSION_MS).forEach(([fn]) => (fn as () => void)());

  it('the timer card displayed: its countdown is anchored and goes down', async () => {
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(1_000);
    await mount(KITCHEN, [timerRunning('timer.t1', 300)]);
    expect(m.racine.querySelector('.carte .mn-temps')?.textContent).toBe(formaterRestant(300));
    clock.mockReturnValue(11_000);
    tick();
    expect(m.racine.querySelector('.carte .mn-temps')?.textContent).toBe(formaterRestant(290));
  });

  it('another card displayed: no timer anchor, nothing written', async () => {
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(1_000);
    await mount(KITCHEN, [...PLAYING, timerRunning('timer.t1', 300)]);
    await drag(-120);
    expect(displayedType()).toBe('media');
    clock.mockReturnValue(11_000);
    expect(() => tick()).not.toThrow();
    expect(m.racine.querySelector('.mn-temps')).toBeNull();
  });

  it('a running timer crossing a minute turns its card late between two redraws', async () => {
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(1_000);
    await mount(KITCHEN, [timerRunning('timer.t1', 90)]);
    expect(card()!.getAttribute('style')).toContain('--carte-timer-fond');
    clock.mockReturnValue(41_000);                                   // 50 s left
    tick();
    expect(card()!.getAttribute('style')).toContain('--carte-timer-late-fond');
  });

  it('a paused timer is never late, and a redraw puts the colour back', async () => {
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(1_000);
    await mount(KITCHEN, [timerRunning('timer.t1', 90)]);
    clock.mockReturnValue(41_000);
    tick();
    expect(card()!.getAttribute('style')).toContain('--carte-timer-late-fond');
    await m.pousser('timer.t1', 'paused', { remaining: '0:00:50' });
    expect(card()!.getAttribute('style')).not.toContain('timer-late');
    tick();
    expect(card()!.getAttribute('style')).not.toContain('timer-late');
  });
});
