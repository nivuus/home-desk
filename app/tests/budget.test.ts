import { describe, it, expect } from 'vitest';
import { combien, ordreCommandes, BUDGET, type ContexteModes } from '../src/modes';
import { ECRANS } from '../src/ecran';
import { CALME } from './contextes';

/** `CALME_VOITURE` : un `ContexteModes` valant `blocDefaut: 'voiture'` et rien d'autre d'actif.
 *  Dérivée de la base `CALME` (`tests/contextes.ts`, partagée avec `tests/modes.test.ts`), jamais
 *  refabriquée champ à champ ici — un contexte inventé testerait autre chose que ce que l'écran
 *  fait vraiment, et une copie indépendante se déferait silencieusement d'un futur champ ajouté à
 *  `ContexteModes` (c'est déjà arrivé avec `rangeeAmbiance`) sans qu'aucun typage ne le signale. */
const CALME_VOITURE: ContexteModes = { ...CALME, blocDefaut: 'voiture' };

/** La table de vérité de `combien()` AVANT cette tâche, relevée dans `modes.ts` l. 129-140.
 *  Elle ne doit pas bouger d'un chiffre : c'est tout l'objet de ce test.
 *
 *  Testée sur `combien` DIRECTEMENT, et non à travers `ordreCommandes` : celui-ci prend
 *  `(commandes, contexte)` et dérive le mode du contexte lui-même (`modes.ts` l. 210), donc
 *  atteindre les neuf modes par lui demanderait de fabriquer neuf contextes — neuf occasions
 *  de tester autre chose que ce qu'on croit. `combien` est donc exporté par cette tâche. */
const ATTENDU: [string, boolean, number][] = [
  ['minuteur', true, 0], ['minuteur', false, 0],
  ['media', true, 2], ['cinema', true, 2], ['voiture', true, 2],
  ['media', false, 4], ['cinema', false, 4], ['voiture', false, 4],
  ['defaut', true, 4], ['defaut', false, 4],
  ['alerte', true, 4], ['recette', true, 4], ['menage', true, 4], ['aeration', true, 4],
];

describe('contrat/budget.json', () => {
  it('porte le budget des Fire 7 et le viewport de reference', () => {
    expect(BUDGET.hauteurUtileParDefaut).toBe(585);
    expect(BUDGET.viewportReference).toEqual({ largeur: 343, hauteur: 585 });
  });

  it('reproduit exactement la table de verite de combien()', () => {
    for (const [mode, rangeeAmbiance, places] of ATTENDU) {
      expect(combien(mode as any, rangeeAmbiance), `${mode} / ambiance=${rangeeAmbiance}`)
        .toBe(places);
    }
  });

  it('laisse ordreCommandes rendre ce qu\'il rendait', () => {
    // Deux verifications de bout en bout, reprises telles quelles de `tests/modes.test.ts`
    // (l. 159 et 177) : la table ci-dessus dit ce que `combien` promet, celles-ci disent que
    // la promesse arrive bien jusqu'a l'ecran.
    const quatre = ECRANS.bureau.commandes;
    expect(ordreCommandes(quatre, CALME_VOITURE)).toHaveLength(2);
    expect(ordreCommandes(quatre, { ...CALME_VOITURE, rangeeAmbiance: false })).toHaveLength(4);
  });
});
