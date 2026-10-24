// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { detect, frame } from '../src/cards/pantry';
import { wireCardActions } from '../src/cards/actions';
import { CAPTEUR_EXPIRATIONS, CAPTEUR_MANQUES, LISTE_COURSES } from '../src/garde-manger';
import type { ScreenState } from '../src/boot/state';
import { etatWith, frameWith, pieceWith, screenWith } from './card-aides';

const CARD = { key: `garde-manger:${CAPTEUR_EXPIRATIONS}`, type: 'garde-manger', rank: 5 } as const;
const batch = (n: string) => ({ batch_id: 1, product_name: n, best_before: '2026-08-02', display: '1' });

function pantry(o: { expiring?: string[]; expState?: string; short?: string[]; shortState?: string;
  view?: boolean; shopping?: boolean } = {}): [ReturnType<typeof frameWith>, ScreenState] {
  const etat = etatWith({
    [CAPTEUR_EXPIRATIONS]: [o.expState ?? ((o.expiring ?? []).length > 0 ? 'on' : 'off'), { batches: (o.expiring ?? []).map(batch) }],
    [CAPTEUR_MANQUES]: [o.shortState ?? ((o.short ?? []).length > 0 ? 'on' : 'off'), { products: o.short ?? [] }],
  });
  const piece = pieceWith({
    commandes: o.view === false ? [] : [{ libelle: 'Garde-manger', icone: 'jar', entite: 'todo.x', vue: '#garde-manger' }] as never,
    ...(o.shopping === false ? {} : { listesTachesExtra: [LISTE_COURSES] }),
  });
  return [frameWith(), screenWith({ etat, piece, snoozed: new Set(), horsLigne: false, cx: { envoyerCommande: vi.fn(async () => null) } })];
}
let agir: ReturnType<typeof vi.fn>;
beforeEach(() => { agir = vi.fn(); wireCardActions(agir); location.hash = ''; });
const middle = (fr: ReturnType<typeof frame>) => { const h = document.createElement('div'); render(fr.middle, h); return h; };

describe('pantry card', () => {
  it('rank 5 when expirations or shortages are on', () => {
    expect(detect(...pantry({ expiring: ['Milk'] }))).toEqual([CARD]);
    expect(detect(...pantry({ short: ['Salt'] }))).toEqual([CARD]);
    expect(detect(...pantry())).toEqual([]);
  });
  it('unavailable sensors are absent', () => {
    expect(detect(...pantry({ expState: 'unavailable', shortState: 'unknown' }))).toEqual([]);
  });
  it('a screen without the pantry view has no card', () => {
    expect(detect(...pantry({ expiring: ['Milk'], view: false }))).toEqual([]);
  });
  it('pantry lists three products', () => {
    const [f, s] = pantry({ expiring: ['Milk', 'Eggs'], short: ['Salt', 'Rice'] });
    const fr = frame(CARD, f, s);
    const rows = middle(fr).querySelectorAll('[dir="auto"]');
    expect(Array.from(rows).map((r) => r.textContent)).toEqual(['Milk', 'Eggs', 'Salt']);
    expect(fr.subtitle).toContain('1');
  });
  it('no hidden count when three or fewer', () => {
    const [f, s] = pantry({ expiring: ['Milk', 'Eggs'], short: ['Eggs'] });
    expect(frame(CARD, f, s).subtitle).toBeUndefined();
    expect(middle(frame(CARD, f, s)).querySelectorAll('[dir="auto"]')).toHaveLength(2);
  });
  it('later, open the pantry (primary), shopping', () => {
    const [f, s] = pantry({ expiring: ['Milk'] });
    const b = frame(CARD, f, s).buttons;
    expect(b[0]!.icon).toBe('snooze');
    expect(b[1]!.primary).toBe(true);
    b[1]!.act();
    expect(location.hash).toBe('#garde-manger');
    b[2]!.act();
    expect(location.hash).toBe('#taches');
  });
  it('a screen without the shopping list leaves the slot empty; background neutral', () => {
    const [f, s] = pantry({ expiring: ['Milk'], shopping: false });
    const fr = frame(CARD, f, s);
    expect(fr.buttons[2]).toBeUndefined();
    expect(fr.background).toEqual({ kind: 'solid', token: 'neutral' });
  });
});
