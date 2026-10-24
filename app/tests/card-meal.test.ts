// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/meal';
import { wireCardActions } from '../src/cards/actions';
import { CAPTEUR_REPAS, AGENDA_REPAS, SCRIPT_VALIDER_REPAS, LISTE_COURSES } from '../src/garde-manger';
import type { ScreenState } from '../src/boot/state';
import { T0, etatWith, frameWith, pieceWith, screenWith } from './card-aides';

const MIN = 60_000;
const pad = (n: number) => String(n).padStart(2, '0');
/** The calendar's `start_time`, as Home Assistant writes it: local, `%Y-%m-%d %H:%M:%S`. */
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const CARD = { key: `repas:${CAPTEUR_REPAS}`, type: 'repas', rank: 5 } as const;

type Opts = { startMs?: number | null; recipe?: number | null; missing?: number; script?: string;
  picture?: string; commands?: boolean; shopping?: boolean; dish?: string };

function kitchen(o: Opts = {}): [ReturnType<typeof frameWith>, ScreenState] {
  const states: Record<string, string | [string, Record<string, unknown>]> = {
    [CAPTEUR_REPAS]: [o.dish ?? 'Gratin', { day: '2026-08-01', slot: 'dinner', meal_id: 7,
      recipe_id: o.recipe === undefined ? 12 : o.recipe, missing_ingredients: o.missing ?? 0,
      ...(o.picture !== undefined ? { entity_picture: o.picture } : {}) }],
    [SCRIPT_VALIDER_REPAS]: o.script ?? 'off',
  };
  if (o.startMs !== null) states[AGENDA_REPAS] = ['off', { start_time: stamp(o.startMs ?? T0 + 30 * MIN), message: 'Gratin' }];
  const piece = pieceWith({
    commandes: o.commands === false ? [] : [{ libelle: 'Recette', icone: 'book', entite: CAPTEUR_REPAS, vue: '#recette' }] as never,
    ...(o.shopping === false ? {} : { listesTachesExtra: [LISTE_COURSES] }),
  });
  return [frameWith(), screenWith({ etat: etatWith(states), piece, snoozed: new Set(), horsLigne: false,
    d: { maintenant: () => new Date(T0) } })];
}
let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); location.hash = ''; });

describe('meal card — window', () => {
  it('meal card only within the hour', () => {
    expect(detect(...kitchen({ startMs: T0 + 30 * MIN }))).toEqual([CARD]);
    expect(detect(...kitchen({ startMs: T0 + 3 * 60 * MIN }))).toEqual([]);
    expect(detect(...kitchen({ startMs: T0 - 10 * MIN }))).toEqual([]);
  });
  it('both edges: meal time minus 60 min is in, the meal time itself is out', () => {
    expect(detect(...kitchen({ startMs: T0 + 60 * MIN }))).toHaveLength(1);
    expect(detect(...kitchen({ startMs: T0 + 60 * MIN + 1000 }))).toEqual([]);
    expect(detect(...kitchen({ startMs: T0 + 1000 }))).toHaveLength(1);
    expect(detect(...kitchen({ startMs: T0 }))).toEqual([]);
  });
  it('no planned time, no card', () => {
    expect(detect(...kitchen({ startMs: null }))).toEqual([]);
  });
  it('a silent sensor or an unreadable time: no card', () => {
    const [f, s] = kitchen();
    s.etat.appliquer({ entity_id: CAPTEUR_REPAS, state: 'unavailable', attributes: {} });
    expect(detect(f, s)).toEqual([]);
    const [f2, s2] = kitchen();
    s2.etat.appliquer({ entity_id: AGENDA_REPAS, state: 'off', attributes: { start_time: 'soon' } });
    expect(detect(f2, s2)).toEqual([]);
  });
  it('a screen that declares no recipe view has no meal card', () => {
    expect(detect(...kitchen({ commands: false }))).toEqual([]);
  });
});

describe('meal card — frame', () => {
  const render0 = (fr: ReturnType<typeof frame>) => { const h = document.createElement('div'); render(fr.middle, h); return h; };
  it('shows the dish, the time and the missing count', () => {
    const [f, s] = kitchen({ missing: 3 });
    const fr = frame(CARD, f, s);
    expect(fr.title).toBe('Gratin');
    const h = render0(fr);
    expect(h.textContent).toContain(new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(T0 + 30 * MIN)));
    expect(h.textContent).toContain('3');
  });
  it('no missing ingredient: no missing line', () => {
    const [f, s] = kitchen({ missing: 0 });
    expect(render0(frame(CARD, f, s)).querySelector('.repas-manquants')).toBeNull();
  });
  it('open recipe is the primary and opens #recette; shown only with a recipe', () => {
    const [f, s] = kitchen();
    const b = frame(CARD, f, s).buttons[1]!;
    expect(b.primary).toBe(true);
    b.act();
    expect(location.hash).toBe('#recette');
    const [f2, s2] = kitchen({ recipe: null });
    expect(frame(CARD, f2, s2).buttons[1]).toBeUndefined();
  });
  it('validate calls script.turn_on on the declared script; unusable script: empty slot', () => {
    const [f, s] = kitchen();
    frame(CARD, f, s).buttons[2]!.act();
    expect(agir).toHaveBeenCalledWith('script', 'turn_on', SCRIPT_VALIDER_REPAS);
    const [f2, s2] = kitchen({ script: 'unavailable' });
    expect(frame(CARD, f2, s2).buttons[2]).toBeUndefined();
  });
  it('shopping opens the tasks view; a screen without the shopping list: empty slot', () => {
    const [f, s] = kitchen();
    frame(CARD, f, s).buttons[0]!.act();
    expect(location.hash).toBe('#taches');
    const [f2, s2] = kitchen({ shopping: false });
    expect(frame(CARD, f2, s2).buttons[0]).toBeUndefined();
  });
  it('photo through imageToPaint, else neutral', () => {
    const [f, s] = kitchen({ picture: '/local/gratin.jpg' });
    const fr = frame(CARD, f, s);
    expect(fr.background).toEqual({ kind: 'image', url: '/local/gratin.jpg' });
    const [f2, s2] = kitchen();
    expect(frame(CARD, f2, s2).background).toEqual({ kind: 'solid', token: 'neutral' });
  });
});
