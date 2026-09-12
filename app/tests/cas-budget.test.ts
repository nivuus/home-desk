import { describe, it, expect } from 'vitest';
import { combien, verifierBudget } from '../src/modes';
import type { Zone } from '../src/agencement';
import CORPUS from '../../contrat/cas-budget.json';

/** Le miroir vitest de `tests/composant/test_budget.py` : les DEUX suites rejouent le MEME
 *  `contrat/cas-budget.json`, l'une contre `combien()`/`verifierBudget()` (TypeScript,
 *  `app/src/modes.ts`), l'autre contre `combien()`/`verifier_budget()` (Python,
 *  `custom_components/home_desk/budget.py`). Un terme retire d'un seul cote doit casser UNE des
 *  deux suites, jamais les deux — c'est tout ce que cette table garantit, cf. `contrat/README.md`. */

type Cas = {
  mode: string;
  rangeeAmbiance: boolean;
  zones: Zone[] | null;
  hauteurUtile: number;
  commandes: number;
  debordement: number;
};

const CAS = CORPUS.cas as Cas[];

describe('contrat/cas-budget.json — le corpus que les deux suites partagent', () => {
  /** Sans cette garde, une table videe (ou un mauvais champ dans le JSON) laisserait la suite
   *  verte en n'exercant rien — exactement le piege que `test_le_corpus_porte_des_cas_des_deux_signes`
   *  referme deja pour `cas-schema.json`. */
  it('n est pas vide', () => {
    expect(CAS.length).toBeGreaterThan(15);
  });

  for (const cas of CAS) {
    const zones = cas.zones ?? undefined;
    const nom = `${cas.mode}/ambiance=${cas.rangeeAmbiance}/zones=${cas.zones ? cas.zones.join(',') : 'defaut'}/${cas.hauteurUtile}px`;

    it(`${nom} — combien()`, () => {
      const rendu = zones === undefined
        ? combien(cas.mode as any, cas.rangeeAmbiance, cas.hauteurUtile)
        : combien(cas.mode as any, cas.rangeeAmbiance, cas.hauteurUtile, zones);
      expect(rendu, nom).toBe(cas.commandes);
    });

    it(`${nom} — verifierBudget()`, () => {
      const rendu = zones === undefined
        ? verifierBudget(cas.mode as any, cas.rangeeAmbiance, cas.hauteurUtile)
        : verifierBudget(cas.mode as any, cas.rangeeAmbiance, cas.hauteurUtile, zones);
      expect(rendu, nom).toBe(cas.debordement);
    });
  }
});
