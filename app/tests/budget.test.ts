import { describe, it, expect } from 'vitest';
import { combien, ordreCommandes, verifierBudget, BUDGET, type ContexteModes } from '../src/modes';
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

/** LA PORTE de la tache du 2026-09-12, gardee ici pour de bon. `combien()` n'applique plus une
 *  table calibree pour 585 px : il ADDITIONNE les hauteurs mesurees par
 *  `app/outils/mesurer-hauteurs.mjs` (cle `hauteurs` de `contrat/budget.json`) comme le moteur de
 *  rendu additionne la colonne `.corps`. La condition d'acceptation etait que ce calcul reproduise
 *  la table historique SANS qu'aucune mesure ne soit retouchee — d'ou le `describe` ci-dessus,
 *  laisse intact, et celui-ci qui atteste que les deux chemins (table d'hier, calcul d'aujourd'hui)
 *  rendent le meme ecran au budget de reference. */
describe('hauteurUtile', () => {
  it('rend exactement la table historique pour 585 px', () => {
    expect(combien('media', true, 585)).toBe(2);
    expect(combien('defaut', true, 585)).toBe(4);
    expect(combien('minuteur', true, 585)).toBe(0);
  });

  /** Les deux nombres de la regle d'hier (`commandesParDefaut`, `commandesSousBlocHaut`) ne sont
   *  plus LUS par `combien()`. Sans ce test ils deviendraient deux constantes mortes dans un
   *  fichier partage — qu'on pourrait modifier sans qu'il ne se passe rien, le pire sort pour une
   *  donnee de contrat. Ils restent donc la table de verite du budget de reference, et c'est le
   *  calcul qui doit s'y conformer. */
  it('retombe sur les deux nombres declares par le contrat, au budget de reference', () => {
    const H = BUDGET.hauteurUtileParDefaut;
    expect(combien('defaut', true, H)).toBe(BUDGET.commandesParDefaut);
    expect(combien('media', true, H)).toBe(BUDGET.commandesSousBlocHaut);
    expect(combien('media', false, H)).toBe(BUDGET.commandesParDefaut);
  });

  it('rend moins de commandes sur un ecran plus court', () => {
    const court = 585 - BUDGET.hauteurs.rangeeCommandes * 2;
    expect(combien('defaut', true, court)).toBeLessThan(combien('defaut', true, 585));
  });

  /** L'inverse, et il compte autant : un ecran PLUS HAUT ne doit pas inventer une troisieme
   *  rangee. La grille n'en a jamais rendu que deux (`tuilesParRangee` x 2), et `combien` promet
   *  un nombre de tuiles reellement affichables, pas une capacite theorique. */
  it('ne depasse jamais deux rangees, meme sur un grand ecran', () => {
    expect(combien('defaut', true, 2000)).toBe(4);
    expect(combien('media', true, 2000)).toBe(4);
  });

  /** 2026-09-12, plan 2 : `combien()` LEVAIT `BudgetIntenable` ici. Or c'est le moteur de rendu
   *  qui l'appelle (via `ordreCommandes`) : un ecran declarant `hauteurUtile: 480` aurait donc
   *  fait un ECRAN BLANC. Le verdict a demenage dans `verifierBudget`, que le rendu n'appelle
   *  jamais ; `combien` degrade desormais a zero, comme le mode `minuteur` le fait deja. */
  it('rend 0 plutot que de lever quand meme zero commande ne tient pas', () => {
    expect(combien('defaut', true, 100)).toBe(0);
  });

  /** Le mode sans commande n'est PAS un budget intenable : zero est son resultat normal, et il
   *  le reste quelle que soit la hauteur — y compris une hauteur ou son propre bloc deborde.
   *  C'est la frontiere entre les deux notions, et elle merite d'etre clouee. */
  it('rend zero sans lever pour un mode sans commande, meme sur un ecran minuscule', () => {
    expect(combien('minuteur', true, 100)).toBe(0);
  });

  /** `verifierBudget` porte le verdict que `combien` a perdu : elle n'est appelee que par le
   *  formulaire de l'integration (plan 3), jamais par le rendu. */
  it('verifierBudget rend 0 quand la composition tient', () => {
    expect(verifierBudget('defaut', true, 585)).toBe(0);
  });

  it('verifierBudget rend le debordement en pixels quand elle ne tient pas', () => {
    expect(verifierBudget('defaut', true, 100)).toBeGreaterThan(0);
  });

  /** Le cablage de bout en bout : `ordreCommandes` ne doit JAMAIS lever, meme sur un
   *  `hauteurUtile` absurde — c'est exactement le piege que cette tache referme. */
  it('ordreCommandes ne leve jamais, meme sur un ecran absurde', () => {
    expect(() => ordreCommandes(ECRANS.bureau.commandes,
      { ...CALME_VOITURE, hauteurUtile: 50 })).not.toThrow();
  });
});
