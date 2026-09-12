import { describe, it, expect } from 'vitest';
import { CHEMINS } from '../src/rendu/icones';
import CONTRAT from '../../contrat/icones.json';
import SCHEMA from '../../contrat/ecran.schema.json';

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

describe('contrat/ecran.schema.json — enum d\'icones', () => {
  // C'est ce test qui rend la liaison durable : sans lui, rien n'empeche icones.json et
  // l'enum du schema de diverger de nouveau — exactement l'accident que la correction A corrige
  // (un `icone: "frigo"` accepte par le schema, puis un repli silencieux sur `cloudy`).
  it('porte exactement Object.keys(CHEMINS).sort() sur $defs.bouton.properties.icone', () => {
    const enumIcone = (SCHEMA as { $defs: { bouton: { properties: { icone: { enum: string[] } } } } })
      .$defs.bouton.properties.icone.enum;
    expect(enumIcone).toEqual(Object.keys(CHEMINS).sort());
  });
});
