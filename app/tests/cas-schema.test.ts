import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';
import SCHEMA from '../../contrat/ecran.schema.json';
import CORPUS from '../../contrat/cas-schema.json';

const valider = new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA);

/** Le motif au format du corpus : `chemin: mot-cle`. C'est la forme que les DEUX
 *  validateurs doivent produire — sans elle, un test negatif passe pour la
 *  mauvaise raison, ce qu'une relecture du plan 1 avait deja trouve une fois. */
const motifs = (erreurs: ErrorObject[]): string[] =>
  erreurs.map((e) => `${e.instancePath}: ${e.keyword}`);

describe('contrat/cas-schema.json — le corpus que les deux suites partagent', () => {
  for (const cas of CORPUS.cas) {
    it(cas.nom, () => {
      const ecran = { ...CORPUS.minimal, ...(cas.modifie ?? {}) };
      const ok = valider(ecran);
      expect(ok, JSON.stringify(valider.errors)).toBe(cas.valide);
      if (!cas.valide) {
        expect(motifs(valider.errors ?? []),
               `motifs rendus : ${JSON.stringify(motifs(valider.errors ?? []))}`)
          .toContain(cas.motif);
      }
    });
  }

  it('le corpus n est pas vide et porte des cas des DEUX signes', () => {
    expect(CORPUS.cas.filter((c) => c.valide).length).toBeGreaterThan(0);
    expect(CORPUS.cas.filter((c) => !c.valide).length).toBeGreaterThan(0);
  });
});
