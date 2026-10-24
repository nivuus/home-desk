/** Fixtures of the stack card tests: just the parts of `Frame` and `ScreenState` a card reads,
 *  built by hand — a card is tested against data, never against a real screen. No test lives
 *  here (the file is not named `*.test.ts`). */
import type { Frame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import type { VueMinuteur } from '../src/minuteur';
import type { SourceResolue } from '../src/media';
import type { Ecran } from '../src/ecran';
import { Etat } from '../src/etat';
import { EMPTY_HOUSE } from '../src/configuration';

/** 2026-08-01 14:00 local, the instant every fixture frame is painted at. */
export const T0 = new Date(2026, 7, 1, 14, 0).getTime();

export function frameWith(over: Partial<Frame> & { timers?: VueMinuteur[] } = {}): Frame {
  const { timers, ...rest } = over;
  const vuesMinuteurs = timers ?? [];
  return {
    maintenant: new Date(T0), maintenantMs: T0, sources: [], media: { remote: false },
    vuesMinuteurs, minuteurActif: vuesMinuteurs.find((v) => v.actif),
    ctx: { recetteEnCours: false }, ...rest,
  } as unknown as Frame;
}

export const screenWith = (over: Record<string, unknown> = {}): ScreenState =>
  ({ recetteUid: null, platRecette: '', pageRecette: 0, pageSourceIndex: [], measuredCard: null, house: EMPTY_HOUSE,
     ...over }) as unknown as ScreenState;

export const running = (timer: string, restantS: number, slot = 0, nom = ''): VueMinuteur =>
  ({ slot, timer, nomEntite: `${timer}_name`, nom, actif: true, restantS });
export const paused = (timer: string, restantS: number, slot = 0, nom = ''): VueMinuteur =>
  ({ slot, timer, nomEntite: `${timer}_name`, nom, actif: false, restantS });

export const source = (over: Partial<SourceResolue> = {}): SourceResolue => ({
  nom: 'Player', piece: 'Room', active: true, joue: true, allumee: false,
  titre: 'Title', sousTitre: '', ...over,
});

/** A state store holding exactly `states`: `id → state` or `id → [state, attributes]`. */
export function etatWith(states: Record<string, string | [string, Record<string, unknown>]>): Etat {
  const etat = new Etat();
  for (const [entity_id, v] of Object.entries(states)) {
    const [state, attributes] = typeof v === 'string' ? [v, {}] : v;
    etat.appliquer({ entity_id, state, attributes });
  }
  return etat;
}

/** A screen fixture: the parts of `Ecran` the cards read, nothing of a real room. */
export const pieceWith = (over: Partial<Ecran> = {}): Ecran => ({
  nom: 'Room', temperature: 'sensor.room_t', ambiances: [], commandes: [], synthese: [],
  extrasMaison: [], sources: [], ouvrants: [], ...over,
});
