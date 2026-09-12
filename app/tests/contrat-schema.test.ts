import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';
import { ECRANS } from '../src/ecran';
import SCHEMA from '../../contrat/ecran.schema.json';

const valider = new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA);

/** Un `toBe(false)` seul ne prouve rien : le schéma peut refuser une donnée pour n'importe quel
 *  motif sans rapport avec celui qu'un test veut exercer (ex. un champ inconnu ailleurs dans le
 *  même objet). Cette aide exige, en plus du refus, la présence d'une erreur `ajv` précise —
 *  `instancePath` et `keyword`, et au besoin certaines clés de `params` — parmi `valider.errors`.
 *  Le message d'échec porte les deux : ce qu'on attendait, ce qu'ajv a répondu. */
function refusePour(
  valeur: unknown,
  attendu: { instancePath: string; keyword: string; params?: Record<string, unknown> },
): void {
  const ok = valider(valeur);
  const motif = (valider.errors ?? []).find((e: ErrorObject) =>
    e.instancePath === attendu.instancePath
    && e.keyword === attendu.keyword
    && (attendu.params === undefined || Object.entries(attendu.params).every(
      ([cle, val]) => JSON.stringify((e.params as Record<string, unknown>)[cle]) === JSON.stringify(val),
    )));
  expect(ok, `attendu un refus, valider() a accepté : ${JSON.stringify(valeur)}`).toBe(false);
  expect(motif,
    `attendu une erreur ${JSON.stringify(attendu)} parmi ${JSON.stringify(valider.errors, null, 2)}`,
  ).toBeDefined();
}

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
    refusePour(casse, { instancePath: '/synthese/0/valeur', keyword: 'type', params: { type: 'number' } });
  });

  it('refuse une hauteur utile absurde', () => {
    refusePour({ ...ECRANS.salon, hauteurUtile: 12 },
      { instancePath: '/hauteurUtile', keyword: 'minimum', params: { limit: 320 } });
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
    refusePour({ ...ECRANS.salon, temperature: 'pas_un_entity_id' },
      { instancePath: '/temperature', keyword: 'pattern' });
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
    refusePour(casse,
      { instancePath: '/commandes/0', keyword: 'additionalProperties', params: { additionalProperty: 'couleur' } });
  });

  it('refuse une icone hors vocabulaire (correction A : icone: "frigo" ne retombe plus en silence sur cloudy)', () => {
    const casse = {
      ...ECRANS.salon,
      commandes: [{ ...ECRANS.salon.commandes[0], icone: 'frigo' }],
    };
    refusePour(casse, { instancePath: '/commandes/0/icone', keyword: 'enum' });
  });

  // Tâche 3 du plan 2 (2026-09-12) : `blocDefaut` n'existe plus DU TOUT à la racine — la tâche 1
  // avait prouvé l'équivalence avec `agencement.blocDefaut`, ce qui a permis à cette tâche de
  // retirer la copie racine (schéma compris). Un `blocDefaut` posé à la racine est donc désormais
  // un champ INCONNU, refusé par `additionalProperties: false` au même titre que n'importe quel
  // autre — plus par son `enum`, qui a disparu avec la propriété elle-même.
  it('refuse blocDefaut a la racine — le champ n\'existe plus que dans agencement', () => {
    refusePour({ ...ECRANS.salon, blocDefaut: 'voiture' },
      { instancePath: '', keyword: 'additionalProperties', params: { additionalProperty: 'blocDefaut' } });
  });

  // Symétrique du test précédent : l'absence de `blocDefaut` à la racine ne doit pas déteindre sur
  // `agencement.blocDefaut`, qui reste prospectif (cinq valeurs, plan 2) et bien réel. Sans ce
  // test, quelqu'un retirant `blocDefaut` de `$defs/agencement` par erreur en même temps que la
  // racine casserait exactement ce que la correction ci-dessus visait à garantir, et rien ne le
  // verrait.
  it('accepte blocDefaut: "entretien" dans agencement (prospectif, distinct de la racine)', () => {
    const annote = { ...ECRANS.salon, agencement: { blocDefaut: 'entretien' } };
    expect(valider(annote), JSON.stringify(valider.errors)).toBe(true);
  });

  describe('les invariants croises', () => {
    it('refuse blocDefaut voiture sans l objet voiture', () => {
      const { voiture, ...sansVoiture } = ECRANS.salon;
      refusePour({ ...sansVoiture,
                   agencement: { ...ECRANS.salon.agencement!, blocDefaut: 'voiture' } },
                 { instancePath: '', keyword: 'required', params: { missingProperty: 'voiture' } });
    });

    it('accepte blocDefaut voiture quand l objet voiture est la', () => {
      expect(valider(ECRANS.salon), JSON.stringify(valider.errors)).toBe(true);
    });

    it('refuse le mode minuteur sans slots de minuteur', () => {
      const { minuteurs, ...sansSlots } = ECRANS.cuisine;
      refusePour(sansSlots,
        { instancePath: '', keyword: 'required', params: { missingProperty: 'minuteurs' } });
    });

    it('refuse le mode minuteur avec des slots vides', () => {
      refusePour({ ...ECRANS.cuisine, minuteurs: [] },
        { instancePath: '/minuteurs', keyword: 'minItems' });
    });

    it('accepte le mode minuteur quand les slots sont la', () => {
      expect(valider(ECRANS.cuisine), JSON.stringify(valider.errors)).toBe(true);
    });

    it('accepte un ecran sans agencement du tout, et sans voiture', () => {
      const { agencement, voiture, ...reste } = ECRANS.salon;
      expect(valider(reste), JSON.stringify(valider.errors)).toBe(true);
    });
  });
});
