import { describe, expect, it } from 'vitest';
import { scinderSelonHauteur } from '../src/scinder';

describe('scinderSelonHauteur', () => {
  it('laisse une page qui tient en une seule sous-page', () => {
    expect(scinderSelonHauteur([100, 100, 100], 400)).toEqual([[0, 1, 2]]);
  });

  it('coupe entre deux éléments quand ça déborde', () => {
    expect(scinderSelonHauteur([200, 200, 200], 400)).toEqual([[0, 1], [2]]);
  });

  it('ne laisse jamais une sous-page vide, même sur un élément plus haut que la place', () => {
    expect(scinderSelonHauteur([900, 100], 400)).toEqual([[0], [1]]);
  });

  it('rend une seule sous-page vide pour une page sans élément', () => {
    expect(scinderSelonHauteur([], 400)).toEqual([[]]);
  });

  it('accepte une place nulle sans boucler : un élément par sous-page', () => {
    expect(scinderSelonHauteur([10, 10], 0)).toEqual([[0], [1]]);
  });
});
