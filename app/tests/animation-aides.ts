/** Shared by the three suites of the animations pushed by Home Assistant
 *  (`animation-geste.test.ts`, `animation-fondu.test.ts`, `animation-lottie.test.ts`): the wire
 *  payloads, the double of the Lottie player, the doubles of `play()` and of `console.error`
 *  (live bindings, reset by the hooks below for whichever suite imports this module), and the
 *  mounted kitchen. */
import { vi, expect, beforeEach, afterEach } from 'vitest';
import { ECRANS } from '../src/ecran';
import {
  monterDemarrage, restaurerReseau, SocketFactice, type Montage,
} from './aides';

export const COMMANDE = 'home_desk/animations';
export const VIDEO = { url: '/media/local/animations/foudre.webm', type: 'video', duree: null, fond: 'noir' };
export const IMAGE = { url: '/media/local/animations/eclair.webp', type: 'image', duree: 4000, fond: 'noir' };
export const LOTTIE = { url: '/media/local/animations/orage.lottie', type: 'lottie', duree: null, fond: 'transparent' };

/** The double of `DotLottie` (the second bundle's player): records every player built, with its
 *  config, its listeners and its `destroy`. `emettre` plays the part of the WASM core. */
export class FauxLottie {
  static crees: FauxLottie[] = [];
  static setWasmUrl = vi.fn();
  readonly ecouteurs = new Map<string, ((ev: Record<string, unknown>) => void)[]>();
  readonly destroy = vi.fn();
  constructor(readonly config: Record<string, unknown>) { FauxLottie.crees.push(this); }
  addEventListener(type: string, f: (ev: Record<string, unknown>) => void): void {
    this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]);
  }
  emettre(type: string, ev: Record<string, unknown> = {}): void {
    for (const f of this.ecouteurs.get(type) ?? []) f({ type, ...ev });
  }
}

export let play: ReturnType<typeof vi.spyOn>;
export let erreur: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // jsdom does not implement media playback: `play()` is the browser's, doubled here so that a
  // test decides whether autoplay is granted or refused.
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  FauxLottie.crees = [];
  SocketFactice.ouvertes = [];
  location.hash = '';
  play.mockRestore();
  erreur.mockRestore();
  restaurerReseau();
});

/** The kitchen, with its first control (`light.hotte`) known to Home Assistant: a control whose
 *  entity was never pushed is refused by the press itself, which would make "nothing actuated"
 *  true for the wrong reason. */
export const monter = () => monterDemarrage(ECRANS.cuisine, { etats: [['light.hotte', 'off']] });

export const calque = (m: Montage) => m.racine.querySelector<HTMLElement>('.animation');

/** Pushes one animation and returns the timers armed by that push only. */
export async function pousserAnimation(m: Montage, evenement: Record<string, unknown>) {
  const avant = m.minuteurFn.mock.calls.length;
  await m.diffuser(COMMANDE, evenement);
  return m.minuteurFn.mock.calls.slice(avant) as [() => void, number][];
}

/** A real tap on the first control of the kitchen: tiles act on `pointerdown`/`pointerup`
 *  (`geste.ts`), never on `click` — no control of this app listens to `click`. */
export function taper(m: Montage): void {
  const tuile = m.racine.querySelector('.commande')!;
  expect(tuile, 'no control rendered on the kitchen screen').not.toBeNull();
  tuile.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
  tuile.dispatchEvent(new Event('pointerup', { bubbles: true, cancelable: true }));
}
