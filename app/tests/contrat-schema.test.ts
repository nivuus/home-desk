import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { ECRANS } from '../src/ecran';
import SCHEMA from '../../contrat/ecran.schema.json';

const valider = new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA);

describe('contrat/ecran.schema.json', () => {
  it('accepte les trois ecrans reels', () => {
    for (const [nom, ecran] of Object.entries(ECRANS)) {
      const ok = valider(ecran);
      expect(ok, `${nom} : ${JSON.stringify(valider.errors)}`).toBe(true);
    }
  });

  it('refuse un seuil chaine sous un operateur d\'ordre', () => {
    const casse = {
      ...ECRANS.bureau,
      synthese: [{ entite: 'sensor.x', operateur: '<', valeur: '35', texte: 'x' }],
    };
    expect(valider(casse)).toBe(false);
  });

  it('refuse une hauteur utile absurde', () => {
    expect(valider({ ...ECRANS.salon, hauteurUtile: 12 })).toBe(false);
  });

  it('accepte une note sur l\'ecran et sur un bouton', () => {
    const annote = {
      ...ECRANS.salon,
      note: 'ecran d\'entree',
      commandes: ECRANS.salon.commandes.map((b, i) =>
        i === 0 ? { ...b, note: 'pourquoi celle-ci' } : b),
    };
    expect(valider(annote), JSON.stringify(valider.errors)).toBe(true);
  });

  it('refuse une entite qui n\'a pas la forme domaine.objet', () => {
    expect(valider({ ...ECRANS.salon, temperature: 'pas_un_entity_id' })).toBe(false);
  });

  it('accepte absenceNommee sur une entree de synthese', () => {
    const annote = {
      ...ECRANS.salon,
      synthese: [
        { entite: 'sensor.x', texte: 'y', operateur: '>', valeur: 0,
          absenceNommee: 'Non installé' },
      ],
    };
    expect(valider(annote), JSON.stringify(valider.errors)).toBe(true);
  });

  it('refuse un champ inconnu sur un bouton', () => {
    const casse = {
      ...ECRANS.salon,
      commandes: [{ ...ECRANS.salon.commandes[0], couleur: 'rouge' }],
    };
    expect(valider(casse)).toBe(false);
  });

  it('refuse blocDefaut: "entretien" a la racine', () => {
    expect(valider({ ...ECRANS.salon, blocDefaut: 'entretien' })).toBe(false);
  });
});
