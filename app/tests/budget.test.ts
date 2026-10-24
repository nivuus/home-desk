import { describe, it, expect } from 'vitest';
import { ordreCommandes, type ContexteModes } from '../src/modes';
import { arrangement, combien, verifierBudget, BUDGET, type BudgetBlock } from '../src/screen-budget';
import { ECRANS } from '../src/ecran';
import { AGENCEMENT_DEFAUT, type Zone } from '../src/agencement';
import { CALME } from './contextes';

/** `CALME_VOITURE` : un `ContexteModes` valant `blocDefaut: 'voiture'` et rien d'autre d'actif.
 *  Dérivée de la base `CALME` (`tests/contextes.ts`, partagée avec `tests/modes.test.ts`), jamais
 *  refabriquée champ à champ ici — un contexte inventé testerait autre chose que ce que l'écran
 *  fait vraiment, et une copie indépendante se déferait silencieusement d'un futur champ ajouté à
 *  `ContexteModes` (c'est déjà arrivé avec `rangeeAmbiance`) sans qu'aucun typage ne le signale. */
const CALME_VOITURE: ContexteModes = { ...CALME, blocDefaut: 'voiture' };

/** The truth table of `combien()` by block kind, in the FULL composition (all `combien` prices).
 *
 *  Testé sur `combien` DIRECTEMENT, et non à travers `ordreCommandes` : celui-ci dérive le bloc du
 *  contexte, donc atteindre chaque genre par lui demanderait de fabriquer un contexte par ligne.
 *
 *  Card-stack plan, task 1: the budget bills a BLOCK KIND (`carte` 264 px, `haut` 153 px,
 *  `defaut` 84 px), no longer a mode. Hand-checked at 585 px: a `carte` costs 616 px with the
 *  Ambiance row (688 for one row of controls), 519 px without (591): in the full composition not
 *  one row fits under it, hence 0 twice. What the screen actually shows under a card is
 *  `arrangement`'s answer, the owner's ladder, pinned in `l'echelle de la carte`. `haut` keeps
 *  its 2/4, `defaut` its 4/4. */
const ATTENDU: [BudgetBlock, boolean, number][] = [
  ['carte', true, 0], ['carte', false, 0],
  ['haut', true, 2], ['haut', false, 4],
  ['defaut', true, 4], ['defaut', false, 4],
];

describe('contrat/budget.json', () => {
  it('porte le budget des Fire 7 et le viewport de reference', () => {
    expect(BUDGET.hauteurUtileParDefaut).toBe(585);
    expect(BUDGET.viewportReference).toEqual({ largeur: 343, hauteur: 585 });
  });

  it('reproduit exactement la table de verite de combien()', () => {
    for (const [bloc, rangeeAmbiance, places] of ATTENDU) {
      expect(combien(bloc, rangeeAmbiance), `${bloc} / ambiance=${rangeeAmbiance}`)
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
    // The card's 2 comes from the ladder, not from the full composition.
    expect(arrangement('carte', true, 585).commandes).toBe(2);
    expect(combien('defaut', true, 585)).toBe(4);
    expect(combien('carte', true, 585)).toBe(0);
  });

  /** Les deux nombres de la regle d'hier (`commandesParDefaut`, `commandesSousBlocHaut`) ne sont
   *  plus LUS par `combien()`. Sans ce test ils deviendraient deux constantes mortes dans un
   *  fichier partage — qu'on pourrait modifier sans qu'il ne se passe rien, le pire sort pour une
   *  donnee de contrat. Ils restent donc la table de verite du budget de reference, et c'est le
   *  calcul qui doit s'y conformer. */
  it('retombe sur les deux nombres declares par le contrat, au budget de reference', () => {
    const H = BUDGET.hauteurUtileParDefaut;
    expect(combien('defaut', true, H)).toBe(BUDGET.commandesParDefaut);
    expect(combien('haut', true, H)).toBe(BUDGET.commandesSousBlocHaut);
    expect(combien('haut', false, H)).toBe(BUDGET.commandesParDefaut);
    // 2026-10-24: `commandesSousBlocHaut` is also the ladder's target (`arrangement`).
    expect(arrangement('carte', true, H).commandes).toBe(BUDGET.commandesSousBlocHaut);
  });

  /** Relecture de la tache 4 : ce test etait DEGENERE. Il posait `court = 585 - 64 * 2` = 457, ou
   *  `combien` rend 0 — c'est-a-dire exactement le cas du test « rend 0 » plus bas, pas le palier
   *  intermediaire que son nom annonce. Une rangee de moins, c'est 521 px, et le palier vaut 2. */
  it('rend une rangee de moins sur un ecran plus court d une rangee', () => {
    const court = 585 - BUDGET.hauteurs.rangeeCommandes;
    expect(combien('defaut', true, court)).toBe(2);
    expect(combien('defaut', true, 585)).toBe(4);
  });

  /** L'inverse, et il compte autant : un ecran PLUS HAUT ne doit pas inventer une troisieme
   *  rangee. La grille n'en a jamais rendu que deux (`tuilesParRangee` x 2), et `combien` promet
   *  un nombre de tuiles reellement affichables, pas une capacite theorique. */
  it('ne depasse jamais deux rangees, meme sur un grand ecran', () => {
    expect(combien('defaut', true, 2000)).toBe(4);
    expect(combien('carte', true, 2000)).toBe(4);
  });

  /** 2026-09-12, plan 2 : `combien()` LEVAIT `BudgetIntenable` ici. Or c'est le moteur de rendu
   *  qui l'appelle (via `ordreCommandes`) : un ecran declarant `hauteurUtile: 480` aurait donc
   *  fait un ECRAN BLANC. Le verdict a demenage dans `verifierBudget`, que le rendu n'appelle
   *  jamais ; `combien` degrade desormais a zero, comme la carte le fait a 585 px. */
  it('rend 0 plutot que de lever quand meme zero commande ne tient pas', () => {
    expect(combien('defaut', true, 100)).toBe(0);
  });

  /** `carte` degrade a zero par le MEME mecanisme generique que `defaut` ci-dessus (la boucle de
   *  `combien` ne trouve aucune rangee qui tienne), sans exception qui la vise : la meme assertion
   *  sur deux genres de bloc prouve qu'aucun n'est un cas particulier. */
  it('degrade a zero sans lever pour une carte aussi, par le meme mecanisme generique', () => {
    expect(combien('carte', true, 100)).toBe(0);
  });

  /** `verifierBudget` porte le verdict que `combien` a perdu : elle n'est appelee que par le
   *  formulaire de l'integration (plan 3), jamais par le rendu. */
  it('verifierBudget rend 0 quand la composition tient', () => {
    expect(verifierBudget('defaut', true, 585)).toBe(0);
  });

  /** Relecture de la tache 4 : `toBeGreaterThan(0)` n'affirmait RIEN du calcul — n'importe quelle
   *  addition fausse le passe, y compris celle qui oubliait trois termes et que le brief de cette
   *  tache proposait. Le chiffre est donc cloue : 121 + 24 + (84 + 32 + 62 + 9 + 72) + 8 x 4 = 436
   *  px pour le mode `defaut` avec rangee d'ambiance et zero commande, moins les 100 px demandes.
   *  Chaque terme du modele MESURE (plan 1, tache 3) est ainsi garde par une valeur exacte : en
   *  retirer un seul fait tomber ce test. */
  it('verifierBudget rend le debordement EXACT en pixels quand elle ne tient pas', () => {
    expect(verifierBudget('defaut', true, 100)).toBe(336);
  });

  /** Le terme que le test ci-dessus ne peut pas garder : `gouttiereCommandes` (10 px) ne compte
   *  qu'a partir de DEUX rangees, et `verifierBudget` en demande zero. A 577 px, il fait toute la
   *  difference — deux rangees coutent 582 px avec lui, 572 px sans. Avec, l'ecran retombe a une
   *  rangee (2 tuiles) ; sans, il en garderait deux (4 tuiles). Verifie par mutation : retirer le
   *  terme de `coutEcran` fait tomber CE test et lui seul. */
  it('facture la gouttiere entre deux rangees de commandes', () => {
    expect(combien('defaut', true, 577)).toBe(2);
  });

  /** Le cablage de bout en bout : `ordreCommandes` ne doit JAMAIS lever, meme sur un
   *  `hauteurUtile` absurde — c'est exactement le piege que cette tache referme.
   *
   *  Relecture de la tache 4 : ce test n'assertait QUE `not.toThrow()`, et passait donc aussi bien
   *  quand `ordreCommandes` ne transmettait pas `hauteurUtile` du tout (sans le cablage,
   *  `combien('haut', undefined, 585)` rend 2 et ne leve pas davantage). La mutation l'a
   *  prouve : decabler la moitie (1) de cette tache laissait la suite entierement verte. C'est le
   *  RESULTAT qu'il faut affirmer — a 50 px, plus une seule commande ne tient. */
  it('ordreCommandes transmet hauteurUtile et ne leve jamais, meme sur un ecran absurde', () => {
    const absurde = { ...CALME_VOITURE, hauteurUtile: 50 };
    expect(() => ordreCommandes(ECRANS.bureau.commandes, absurde)).not.toThrow();
    expect(ordreCommandes(ECRANS.bureau.commandes, absurde)).toHaveLength(0);
  });
});

/** A `carte` pays its cost like any other block (`coutEcran`, `screen-budget.ts`), with no
 *  short-circuit: its 0 controls in the full composition are a CONSEQUENCE of the budget. Every
 *  value is computed by hand against `coutEcran` and asserted to the pixel, never as an
 *  inequality (cf. the task 4 review: `not.toThrow()` and `toBeGreaterThan(0)` let a wrong sum
 *  through). Card-stack plan, task 1: the old `minuteur` block (215 px) is gone, the timer is a
 *  card like the others. */
describe('une carte paie son cout comme les autres blocs', () => {
  /** 585 px, Ambiance row, 0 rows: 121 + 24 + 32 + 264 + 9 + 72 + 62 + 4 x 8 = 616. One row of
   *  controls adds 64 + 8 = 688: it does not fit. 0 controls in the full composition. */
  it('rend 0 commande a 585 px avec rangee d ambiance', () => {
    expect(combien('carte', true, 585)).toBe(0);
  });

  /** Without the Ambiance row: 121 + 24 + 32 + 264 + 62 + 2 x 8 = 519 at 0 rows (3 children), 591
   *  with one row (+ 64 + 8). Still above 585: 0, where the OLD timer block (215 px) gave 2. */
  it('rend 0 commande a 585 px sans rangee d ambiance en composition complete', () => {
    expect(combien('carte', false, 585)).toBe(0);
  });

  /** The budget funds a row as soon as it is there: 688 px with the Ambiance row (616 + 64 + 8),
   *  591 px without. Two rows would cost 762 / 665 px. */
  it('rend 2 commandes des que le budget finance une rangee', () => {
    expect(combien('carte', true, 687)).toBe(0);
    expect(combien('carte', true, 688)).toBe(2);
    expect(combien('carte', false, 590)).toBe(0);
    expect(combien('carte', false, 591)).toBe(2);
  });

  /** The last rung of the ladder (reduced synthese, no Ambiance row) is what the form prices:
   *  121 + 24 + 24 + 264 + 62 + 2 x 8 = 511 px at zero rows. */
  it('verifierBudget rend 0 a 585 px (511 px consommes, l ecran tient)', () => {
    expect(verifierBudget('carte', true, 585)).toBe(0);
  });

  it('verifierBudget chiffre le debordement exact a 500 px (511 - 500)', () => {
    expect(verifierBudget('carte', true, 500)).toBe(11);
  });
});

/** Relecture finale du plan 2 (I4) — `coutEcran` SAIT COMPTER UN ÉCRAN QUI OMET UNE ZONE.
 *
 *  Il partait de `enfants = 3` et `somme = bloc + synthese + touteLaMaison` EN DUR et ne recevait
 *  jamais `zones` : une zone omise était facturée quand même. L'erreur était toujours
 *  CONSERVATRICE (surfacturation, donc moins de commandes, jamais un débordement à l'écran) —
 *  mais `verifierBudget`, écrite exactement pour que le formulaire du plan 3 REFUSE une saisie,
 *  aurait refusé un agencement parfaitement tenable en annonçant un débordement fantôme.
 *
 *  Chaque valeur ci-dessous est calculée à la main depuis `contrat/budget.json` et affirmée AU
 *  PIXEL, jamais par une inégalité : bandeau 121, paddingCorps 24, gouttiere 8, touteLaMaison 62,
 *  synthese 32, blocDefaut 84, etiquetteAmbiance 9, rangeeAmbiance 72. La référence commune est
 *  l'écran COMPLET à zéro rangée, déjà cloué plus haut à 436 px :
 *      121 + 24 + (62 + 84 + 32 + 9 + 72) + 8 x 4 = 436       (5 enfants, 4 gouttières)
 *  « Toute la maison » n'est PAS dans `zones` (elle vit hors de l'ordre réglable, cf.
 *  `rendu/corps.ts`) : elle reste facturée dans les quatre cas. */
describe('coutEcran compte les zones que l agencement demande, et elles seules', () => {
  /** SANS `synthese` : 4 enfants, somme 62 + 84 + 9 + 72 = 227.
   *      121 + 24 + 227 + 8 x 3 = 396   (40 px de moins que 436 : 32 de synthèse + 8 de gouttière)
   *  À 100 px de hauteur utile, le débordement est donc 396 - 100 = 296, contre 336 pour l'écran
   *  complet. L'écart de 40 px EST la correction. */
  it('ne facture ni la synthese ni sa gouttiere quand la zone est absente', () => {
    const sansSynthese: Zone[] = ['ambiances', 'commandes', 'blocCentral'];
    expect(verifierBudget('defaut', true, 100, sansSynthese)).toBe(296);
    expect(verifierBudget('defaut', true, 100)).toBe(336);
    expect(verifierBudget('defaut', true, 396, sansSynthese)).toBe(0);
  });

  /** SANS `ambiances` : 3 enfants, somme 62 + 84 + 32 = 178.
   *      121 + 24 + 178 + 8 x 2 = 339   (97 px de moins : 9 + 72 + DEUX gouttières de 8)
   *  97 px est exactement le coût complet de la rangée « Ambiance » que `contrat/budget.json`
   *  documente sous `_source` (« 9 + 72 + 2 x 8 = 97 px »). Noter que `rangeeAmbiance` reste VRAI
   *  ici : c'est bien la ZONE absente de l'agencement qui décide, pas la pièce. */
  it('ne facture pas la rangee Ambiance quand la zone est absente, meme rangeeAmbiance vrai', () => {
    const sansAmbiances: Zone[] = ['commandes', 'blocCentral', 'synthese'];
    expect(verifierBudget('defaut', true, 100, sansAmbiances)).toBe(239);
    expect(verifierBudget('defaut', true, 339, sansAmbiances)).toBe(0);
  });

  /** SANS `blocCentral` : 4 enfants, somme 62 + 32 + 9 + 72 = 175.
   *      121 + 24 + 175 + 8 x 3 = 344   (92 px de moins : 84 de blocDefaut + 8 de gouttière)
   *  C'est la zone la plus chère : sous une `carte` (blocCarte, 264 px) l'écart monterait à
   *  272 px de débordement fantôme. */
  it('ne facture pas le bloc central quand la zone est absente', () => {
    const sansBloc: Zone[] = ['ambiances', 'commandes', 'synthese'];
    expect(verifierBudget('defaut', true, 100, sansBloc)).toBe(244);
    expect(verifierBudget('defaut', true, 344, sansBloc)).toBe(0);
  });

  /** SANS `commandes`, aucun calcul n'a lieu : un écran qui n'affiche pas la zone des commandes
   *  n'en affiche AUCUNE. 2000 px est choisi parce que l'écran complet y rend 4 (test « ne dépasse
   *  jamais deux rangées ») : la garde mord sur un budget que rien d'autre ne limite. */
  it('rend 0 commande quand la zone commandes est absente, quel que soit le budget', () => {
    const sansCommandes: Zone[] = ['ambiances', 'blocCentral', 'synthese'];
    expect(combien('defaut', true, 2000, sansCommandes)).toBe(0);
    expect(combien('defaut', true, 2000)).toBe(4);
  });

  /** Le filet de la correction : avec les quatre zones du défaut, l'addition est TERME POUR TERME
   *  celle d'avant. La table de vérité gelée (`ATTENDU`) l'atteste déjà en n'appelant jamais avec
   *  `zones` ; ce test l'atteste par l'autre bout, en le passant EXPLICITEMENT. */
  it('le defaut explicite rend exactement ce que l omission rend', () => {
    for (const [bloc, rangeeAmbiance, places] of ATTENDU) {
      expect(combien(bloc, rangeeAmbiance, 585, AGENCEMENT_DEFAUT.zones),
             `${bloc} / ambiance=${rangeeAmbiance}`).toBe(places);
    }
  });

  /** Le CÂBLAGE, sans lequel les quatre tests ci-dessus garderaient une fonction que personne
   *  n'appelle avec le bon argument : `ordreCommandes` transmet `c.zones`. Même leçon que la
   *  relecture de la tâche 4, où décâbler `c.hauteurUtile` laissait la suite entièrement verte. */
  it('ordreCommandes transmet zones : un ecran sans zone commandes n en rend aucune', () => {
    const sansCommandes: ContexteModes = {
      ...CALME_VOITURE, zones: ['ambiances', 'blocCentral', 'synthese'],
    };
    expect(ordreCommandes(ECRANS.bureau.commandes, sansCommandes)).toHaveLength(0);
    expect(ordreCommandes(ECRANS.bureau.commandes, CALME_VOITURE)).toHaveLength(2);
  });
});

/** 2026-10-24, spec 2026-10-23 "Place à l'écran": the owner's order, on the measured heights
 *  (`blocCarte` 264 px, `syntheseReduite` 24 px, `outils/mesurer-carte-media.mjs`). The BUDGET
 *  decides through `combien`, never a list of rooms: these tests name screen SHAPES (with or
 *  without an Ambiance row), and the last one walks the three declared screens end to end. */
describe('l echelle de la carte', () => {
  it('forme du salon (sans rangee Ambiance) : la synthese reduite suffit, deux commandes', () => {
    expect(arrangement('carte', false, 585))
      .toEqual({ rangeeAmbiance: false, syntheseReduite: true, commandes: 2 });
  });

  it('forme du bureau et de la cuisine : synthese reduite ET plus de rangee Ambiance', () => {
    expect(arrangement('carte', true, 585))
      .toEqual({ rangeeAmbiance: false, syntheseReduite: true, commandes: 2 });
    expect(arrangement('carte', false, 585))
      .toEqual({ rangeeAmbiance: false, syntheseReduite: true, commandes: 2 });
  });

  it('un ecran qui a la place garde sa rangee Ambiance', () => {
    expect(arrangement('carte', true, 680))
      .toEqual({ rangeeAmbiance: true, syntheseReduite: true, commandes: 2 });
    expect(arrangement('carte', true, 688))
      .toEqual({ rangeeAmbiance: true, syntheseReduite: false, commandes: 2 });
  });

  it('haut et defaut ne passent jamais par l echelle', () => {
    expect(arrangement('haut', true, 500))
      .toEqual({ rangeeAmbiance: true, syntheseReduite: false, commandes: 0 });
    expect(arrangement('defaut', true, 585))
      .toEqual({ rangeeAmbiance: true, syntheseReduite: false, commandes: 4 });
  });

  it('verifierBudget chiffre le dernier echelon pour une carte', () => {
    // 121 + 24 + (62 + 264 + 24) + 8 x 2 = 511 px at zero rows, Ambiance row dropped.
    expect(verifierBudget('carte', true, 500)).toBe(11);
    expect(verifierBudget('carte', true, 511)).toBe(0);
  });

  it('ordreCommandes coupe selon l echelle, sur les trois ecrans declares', () => {
    for (const [nom, ecran] of Object.entries(ECRANS)) {
      const ctx: ContexteModes = {
        ...CALME, sourceJoue: true,
        rangeeAmbiance: ecran.ambiances.length > 0 || (ecran.minuteurs?.length ?? 0) > 0,
      };
      expect(ordreCommandes(ecran.commandes, ctx), nom).toHaveLength(2);
    }
  });
});

/** Card-stack plan, task 1: the budget bills a block kind. Hand-checked at 585 px. */
describe('le budget par genre de bloc', () => {
  it('a card costs 264 px whatever it shows, and only a card climbs the ladder', () => {
    expect(verifierBudget('carte', true, 585)).toBe(0);
    expect(combien('carte', true, 585)).toBe(0);
    expect(arrangement('carte', true, 585))
      .toEqual({ rangeeAmbiance: false, syntheseReduite: true, commandes: 2 });
    expect(arrangement('carte', false, 585))
      .toEqual({ rangeeAmbiance: false, syntheseReduite: true, commandes: 2 });
  });

  it('the empty-stack blocks keep their budget', () => {
    expect(combien('defaut', true, 585)).toBe(4);
    expect(combien('haut', true, 585)).toBe(2);
    expect(arrangement('haut', true, 585).rangeeAmbiance).toBe(true);
  });

  it('prices the tall block at 577 px for two controls', () => {
    // 121 + 24 + (62 + 153 + 32 + 9 + 72) + 64 + 5 x 8 = 577.
    expect(combien('haut', true, 577)).toBe(2);
    expect(combien('haut', true, 576)).toBe(0);
  });
});
