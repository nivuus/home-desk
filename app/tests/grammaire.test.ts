import { describe, it, expect } from 'vitest';
import { SPATIAL, EFFET, EFFET_SORTIE, ENTREE_MS, SORTIE_MS, DETAIL_MS,
         estRole, retardCascade, CASCADE_MS, CASCADE_RANGS_MAX } from '../src/mouvement/grammaire';

/** Les quatre coefficients d'un `cubic-bezier(x1, y1, x2, y2)` CSS, dans l'ordre où ils sont
 *  écrits — jamais une lecture au jugé d'un seul point de contrôle. */
function coefficients(courbe: string): [number, number, number, number] {
  const [x1, y1, x2, y2] = courbe.match(/cubic-bezier\(([^)]+)\)/)![1].split(',').map(Number);
  return [x1, y1, x2, y2];
}

/** Le dépassement RÉEL d'une cubic-bezier CSS : `y` échantillonné sur toute la courbe.
 *  Une Bézier ne passe PAS par ses points de contrôle — elle est seulement tirée vers eux. Lire
 *  l'ordonnée d'un point de contrôle et la croire égale au dépassement, c'est l'erreur qui avait
 *  laissé passer une courbe à 0,06 % pour une promesse de 6 %. */
function depassementPourCent(courbe: string): number {
  const [, y1, , y2] = coefficients(courbe);
  const y = (t: number) => 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
  let max = 0;
  for (let i = 0; i <= 10000; i++) max = Math.max(max, y(i / 10000));
  return (max - 1) * 100;
}

describe('les deux familles de courbes MD3 Expressive', () => {
  it('le spatial dépasse sa cible de 5 à 9 %, les effets jamais', () => {
    const d = depassementPourCent(SPATIAL);
    expect(d).toBeGreaterThanOrEqual(5);
    expect(d).toBeLessThanOrEqual(9);
    expect(depassementPourCent(EFFET)).toBeLessThanOrEqual(0);
    expect(depassementPourCent(EFFET_SORTIE)).toBeLessThanOrEqual(0);
  });

  it('les abscisses des trois courbes restent dans [0, 1] — une ordonnée hors bornes est légale en CSS, une abscisse non', () => {
    for (const courbe of [SPATIAL, EFFET, EFFET_SORTIE]) {
      const [x1, , x2] = coefficients(courbe);
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(1);
      expect(x2).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
    }
  });

  it('une sortie est toujours plus courte qu’une entrée — un écran se remplit, il ne se vide pas', () => {
    expect(SORTIE_MS).toBeLessThan(ENTREE_MS);
  });

  it('un détail va plus vite qu’un bloc : c’est un effet, pas un déplacement', () => {
    expect(DETAIL_MS).toBeLessThan(ENTREE_MS);
  });
});

describe('estRole', () => {
  it('accepte les six rôles, « detail » compris', () => {
    for (const r of ['vue', 'bloc', 'tuile', 'ligne', 'chiffre', 'detail']) {
      expect(estRole(r), r).toBe(true);
    }
  });

  it('rejette un rôle inconnu sans lever', () => {
    expect(estRole('turbo')).toBe(false);
  });
});

describe('retardCascade', () => {
  it('plafonne pour qu’une longue liste ne devienne pas une attente', () => {
    expect(retardCascade(0)).toBe(0);
    expect(retardCascade(2)).toBe(2 * CASCADE_MS);
    expect(retardCascade(99)).toBe(CASCADE_RANGS_MAX * CASCADE_MS);
  });
});
