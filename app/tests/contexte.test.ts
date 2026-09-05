import { describe, it, expect } from 'vitest';
import { momentDuJour, alerteActive } from '../src/contexte';

describe('momentDuJour', () => {
  it('est nuit de 23 h à 5 h, quoi que fasse le soleil', () => {
    expect(momentDuJour(23, false)).toBe('nuit');
    expect(momentDuJour(2, false)).toBe('nuit');
    expect(momentDuJour(4, true)).toBe('nuit');   // soleil déjà levé en juin : reste nuit
  });

  it('est jour quand le soleil est levé, hors bornes de nuit', () => {
    expect(momentDuJour(5, true)).toBe('jour');
    expect(momentDuJour(14, true)).toBe('jour');
  });

  it('est soir quand le soleil est couché, hors bornes de nuit', () => {
    expect(momentDuJour(19, false)).toBe('soir');
    expect(momentDuJour(22, false)).toBe('soir');
  });

  it('bascule à 5 h et à 23 h précises', () => {
    expect(momentDuJour(4, false)).toBe('nuit');
    expect(momentDuJour(5, false)).toBe('soir');   // soleil pas encore levé en hiver
    expect(momentDuJour(22, false)).toBe('soir');
    expect(momentDuJour(23, false)).toBe('nuit');
  });
});

describe('alerteActive', () => {
  const MIN = 60_000;
  const a: any = { cle: 'fenetre', texte: 'Fenêtre ouverte sous la pluie', depuis: 0 };

  it('reste au premier plan tant que la maison bouge', () => {
    // dernier mouvement il y a 2 minutes → le compte à rebours n'a pas expiré
    expect(alerteActive([a], 100 * MIN, 102 * MIN)).toEqual(a);
  });

  it('se replie 15 minutes après le dernier mouvement', () => {
    expect(alerteActive([a], 100 * MIN, 115 * MIN)).toBeNull();
    expect(alerteActive([a], 100 * MIN, 114 * MIN)).toEqual(a);
  });

  it('revient au premier plan dès qu un mouvement réarme le compteur', () => {
    expect(alerteActive([a], 100 * MIN, 116 * MIN)).toBeNull();
    expect(alerteActive([a], 116 * MIN, 117 * MIN)).toEqual(a);
  });

  it('rend la plus récente quand plusieurs sont actives', () => {
    const b: any = { cle: 'croquettes', texte: 'Distributeur vide', depuis: 5 * MIN };
    expect(alerteActive([a, b], 100 * MIN, 101 * MIN)).toEqual(b);
  });

  it('ne rend rien sans alerte', () => {
    expect(alerteActive([], 0, 99 * MIN)).toBeNull();
  });
});
