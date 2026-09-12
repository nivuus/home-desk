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

  it('refuse blocDefaut: "entretien" a la racine', () => {
    refusePour({ ...ECRANS.salon, blocDefaut: 'entretien' },
      { instancePath: '/blocDefaut', keyword: 'enum', params: { allowedValues: ['voiture', 'repas', 'agenda'] } });
  });

  // Symétrique du test précédent : la restriction de `blocDefaut` à la racine ne doit pas
  // déteindre sur `agencement.blocDefaut`, qui reste prospectif (cinq valeurs, plan 2). Sans ce
  // test, quelqu'un restreignant `$defs/agencement` par erreur casserait exactement ce que la
  // correction ci-dessus visait à garantir, et rien ne le verrait.
  it('accepte blocDefaut: "entretien" dans agencement (prospectif, distinct de la racine)', () => {
    const annote = { ...ECRANS.salon, agencement: { blocDefaut: 'entretien' } };
    expect(valider(annote), JSON.stringify(valider.errors)).toBe(true);
  });
});
