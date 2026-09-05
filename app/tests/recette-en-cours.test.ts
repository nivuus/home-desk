import { describe, expect, it, vi } from 'vitest';
import { effacerRecette, ecrireRecette, lireRecette } from '../src/recette-en-cours';

const T0 = new Date(2026, 7, 17, 20, 0).getTime();

function stockage(valeur: string | null) {
  return { getItem: () => valeur, setItem: vi.fn(), removeItem: vi.fn() };
}

describe('recette en cours', () => {
  it('relit une recette récente', () => {
    const s = stockage(JSON.stringify({ uid: '139', page: 2, majLe: T0 }));
    expect(lireRecette(s, T0 + 60_000)).toEqual({ uid: '139', page: 2, majLe: T0 });
  });

  it('ignore une recette de plus de 4 h : l_écran mural ne reste pas sur celle d_hier', () => {
    const s = stockage(JSON.stringify({ uid: '139', page: 2, majLe: T0 }));
    expect(lireRecette(s, T0 + 5 * 3_600_000)).toBeUndefined();
  });

  it('ignore un contenu illisible sans lever', () => {
    expect(lireRecette(stockage('{pas du json'), T0)).toBeUndefined();
    expect(lireRecette(stockage(null), T0)).toBeUndefined();
    expect(lireRecette(stockage(JSON.stringify({ page: 1 })), T0)).toBeUndefined();
  });

  it('écrit et efface sous la clé attendue', () => {
    const s = stockage(null);
    ecrireRecette(s, { uid: '139', page: 0, majLe: T0 });
    expect(s.setItem).toHaveBeenCalledWith('wallpanel_recette',
      JSON.stringify({ uid: '139', page: 0, majLe: T0 }));
    effacerRecette(s);
    expect(s.removeItem).toHaveBeenCalledWith('wallpanel_recette');
  });
});
