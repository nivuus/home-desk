import { describe, it, expect } from 'vitest';
import { CHEMINS } from '../src/rendu/icones';
import CONTRAT from '../../contrat/icones.json';

describe('contrat/icones.json', () => {
  it('liste exactement les icones que l\'application sait dessiner', () => {
    expect(CONTRAT.icones).toEqual(Object.keys(CHEMINS).sort());
  });

  it('contient les quatre ajoutees apres coup, qui existent pour eviter le repli sur cloudy', () => {
    for (const nom of ['scan', 'horsligne', 'case', 'coche']) {
      expect(CONTRAT.icones).toContain(nom);
    }
  });
});
