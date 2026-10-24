import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';
import ECRAN from '../../contrat/ecran.schema.json';
import SCHEMA from '../../contrat/maison.schema.json';
import CORPUS from '../../contrat/cas-maison.json';

// maison.schema.json refers to its sibling by the relative reference
// `ecran.schema.json#/...`: registering the screen schema under that key is
// what lets ajv resolve it.
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(ECRAN, 'ecran.schema.json');
const valider = ajv.compile(SCHEMA);

/** Same `path: keyword` format as cas-schema.test.ts. */
const motifs = (erreurs: ErrorObject[]): string[] =>
  erreurs.map((e) => `${e.instancePath}: ${e.keyword}`);

describe('contrat/cas-maison.json — le corpus que les deux suites partagent', () => {
  for (const cas of CORPUS.cas) {
    it(cas.nom, () => {
      const maison: Record<string, unknown> = { ...CORPUS.minimal, ...(cas.modifie ?? {}) };
      for (const cle of cas.retire ?? []) delete maison[cle];
      const ok = valider(maison);
      expect(ok, JSON.stringify(valider.errors)).toBe(cas.valide);
      if (!cas.valide) {
        expect(motifs(valider.errors ?? []),
               `motifs rendus : ${JSON.stringify(motifs(valider.errors ?? []))}`)
          .toContain(cas.motif);
      }
    });
  }

  it('le corpus porte des cas des DEUX signes', () => {
    expect(CORPUS.cas.filter((c) => c.valide).length).toBeGreaterThan(0);
    expect(CORPUS.cas.filter((c) => !c.valide).length).toBeGreaterThan(0);
  });
});
