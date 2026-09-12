import { describe, it, expect } from 'vitest';
import { combien, ordreCommandes, verifierBudget, BUDGET, type ContexteModes } from '../src/modes';
import { ECRANS } from '../src/ecran';
import { resoudreAgencement, AGENCEMENT_DEFAUT, type Zone } from '../src/agencement';
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
 *  de tester autre chose que ce qu'on croit. `combien` est donc exporté par cette tâche.
 *
 *  2026-09-12 (plan 2, tâche 5) : UNE SEULE ligne bouge, `['minuteur', false, 0]` devient
 *  `['minuteur', false, 2]`. Ce n'était pas une mesure mais une EXCEPTION : `combien` rendait 0
 *  pour tout mode de `modesSansCommande` avant tout calcul de coût, jamais parce qu'un budget de
 *  585 px avait été confronté au coût réel du mode. Une fois `minuteur` soumis au même calcul que
 *  les huit autres (`coutEcran` lui compte désormais `blocMinuteur`, 206 px), sans rangée
 *  d'ambiance une rangée de commandes coûte 533 px au total : ça tient sous 585, donc 2. AVEC
 *  rangée d'ambiance, le bloc central coûte 558 px sans commande, et il ne reste que 27 px —
 *  moins qu'une rangée : ça ne tient pas, donc 0, cette ligne-là ne bouge pas. Aucun écran de
 *  `ECRANS` ne peut aujourd'hui atteindre `['minuteur', false, …]` : la seule
 *  pièce à porter le mode `minuteur` (la cuisine) a aussi des ambiances déclarées, donc
 *  `rangeeAmbiance` y vaut toujours `true` en pratique (cf. `demarrage.ts`, et le test
 *  d'inatteignabilité plus bas). Cette ligne reste néanmoins dans la table : `combien` est une
 *  fonction pure, testée sur tout son domaine, pas seulement sur ce que la maison déclare
 *  aujourd'hui. */
const ATTENDU: [string, boolean, number][] = [
  ['minuteur', true, 0], ['minuteur', false, 2],
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
    expect(combien('media', true, 2000)).toBe(4);
  });

  /** 2026-09-12, plan 2 : `combien()` LEVAIT `BudgetIntenable` ici. Or c'est le moteur de rendu
   *  qui l'appelle (via `ordreCommandes`) : un ecran declarant `hauteurUtile: 480` aurait donc
   *  fait un ECRAN BLANC. Le verdict a demenage dans `verifierBudget`, que le rendu n'appelle
   *  jamais ; `combien` degrade desormais a zero, comme le mode `minuteur` le fait deja. */
  it('rend 0 plutot que de lever quand meme zero commande ne tient pas', () => {
    expect(combien('defaut', true, 100)).toBe(0);
  });

  /** 2026-09-12 (plan 2, tache 5) : `minuteur` n'est plus un cas a part. Il degrade a zero par le
   *  MEME mecanisme generique que `defaut` ci-dessus (la boucle de `combien` ne trouve aucune
   *  rangee qui tienne), plus par une exception qui le visait nommement (l'ancien
   *  `modesSansCommande`, disparu du contrat avec le court-circuit qu'il servait). Ce test clone
   *  donc a dessein celui du dessus avec `minuteur` a la place de `defaut` : la meme assertion sur
   *  deux modes differents est la preuve qu'aucun des deux n'est plus un cas particulier. */
  it('degrade a zero sans lever pour minuteur aussi, par le meme mecanisme generique', () => {
    expect(combien('minuteur', true, 100)).toBe(0);
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
   *  `combien('voiture', undefined, 585)` rend 2 et ne leve pas davantage). La mutation l'a
   *  prouve : decabler la moitie (1) de cette tache laissait la suite entierement verte. C'est le
   *  RESULTAT qu'il faut affirmer — a 50 px, plus une seule commande ne tient. */
  it('ordreCommandes transmet hauteurUtile et ne leve jamais, meme sur un ecran absurde', () => {
    const absurde = { ...CALME_VOITURE, hauteurUtile: 50 };
    expect(() => ordreCommandes(ECRANS.bureau.commandes, absurde)).not.toThrow();
    expect(ordreCommandes(ECRANS.bureau.commandes, absurde)).toHaveLength(0);
  });
});

/** 2026-09-12, plan 2, tache 5 : `blocMinuteur` (206 px, `contrat/budget.json`) devient un bloc
 *  central comme les autres — `coutEcran` (`modes.ts`) le facture au mode `minuteur` via
 *  `modesABlocMinuteur`, et `combien` a perdu le court-circuit qui rendait 0 SANS jamais calculer
 *  ce cout. Les quatre valeurs ci-dessous sont calculees a la main contre `coutEcran`, pas
 *  copiees du brief de la tache — chacune est verifiee independamment par un test qui affirme un
 *  CHIFFRE EXACT, jamais une absence de levee ni une inegalite vague (cf. la relecture de la
 *  tache 4 : `not.toThrow()` et `toBeGreaterThan(0)` laissent passer un calcul faux). */
describe('le mode minuteur paie son cout comme les autres', () => {
  /** 585 px, rangee d'ambiance : 121 + 24 + 32 + 206 + 9 + 72 + 62 + 4x8 = 558, reste 27 px —
   *  moins que les 64 px d'une rangee de commandes. 0 commande, IDENTIQUE a avant cette tache :
   *  seule la ligne `['minuteur', false, …]` de la table de verite bougeait (cf. plus haut). */
  it('rend 0 commande a 585 px avec rangee d ambiance, par calcul et non par court-circuit', () => {
    expect(combien('minuteur', true, 585)).toBe(0);
  });

  /** Sans rangee d'ambiance, la ligne qui bouge : 121 + 24 + 32 + 206 + 62 + 2x8 = 461 (zero
   *  rangee, 3 enfants). Une rangee de commandes ajoute un 4e enfant et sa gouttiere : 461 + 64 +
   *  8 = 533 px — sous les 585, ca tient. Deux rangees : 533 + 64 + 10 (gouttiere de grille) =
   *  607 px — ca deborde. 2 commandes, donc : c'est ce que `combien('minuteur', false, 585)`
   *  rendait a tort a 0 avant cette tache, uniquement parce que le court-circuit ne calculait
   *  jamais rien. */
  it('rend 2 commandes a 585 px sans rangee d ambiance : rien ne l empechait, sauf l exception', () => {
    expect(combien('minuteur', false, 585)).toBe(2);
  });

  /** Un ecran assez haut pour financer une rangee sous le bloc minuteur EN RENDRAIT deux tuiles —
   *  la preuve que le 0 de 585 px est une CONSEQUENCE du budget, pas une regle fixee pour ce mode.
   *  630 px pour une rangee (121+24+32+206+9+72+62+5x8+64 = 630, la 5e gouttiere venant du 6e
   *  enfant qu'ajoute la rangee) : c'est EXACTEMENT la mesure
   *  historique `mesures.ecranModeMinuteur` de `contrat/budget.json` (« liste seule, 45 px au-dela
   *  du budget », relevee le 2026-08-03, TROIS SEMAINES avant que ce modele de calcul existe, et
   *  sur laquelle rien n'a ete calibre depuis). Le modele et la mesure se confirment mutuellement. */
  it('rend 2 commandes des que le budget finance une rangee (630 px, la mesure historique)', () => {
    expect(combien('minuteur', true, 630)).toBe(2);
    expect(BUDGET.mesures.ecranModeMinuteur.px).toBe(630);
  });

  /** verifierBudget chiffre desormais le debordement reel du mode minuteur — c'est le point de la
   *  tache : avant, `verifierBudget('minuteur', true, 585)` rendait 0 pour un ecran qui aurait pu
   *  deborder sans que la fonction ne puisse jamais le dire, faute de facturer le bon bloc. */
  it('verifierBudget rend 0 a 585 px (558 px consommes, l ecran tient)', () => {
    expect(verifierBudget('minuteur', true, 585)).toBe(0);
  });

  it('verifierBudget chiffre le debordement exact a 500 px (558 - 500)', () => {
    expect(verifierBudget('minuteur', true, 500)).toBe(58);
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
   *  C'est la zone la plus chère : sous `minuteur` (blocMinuteur, 206 px) l'écart monterait à
   *  214 px de débordement fantôme. */
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
    for (const [mode, rangeeAmbiance, places] of ATTENDU) {
      expect(combien(mode as any, rangeeAmbiance, 585, AGENCEMENT_DEFAUT.zones),
             `${mode} / ambiance=${rangeeAmbiance}`).toBe(places);
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

/** Test d'INATTEIGNABILITE, au niveau des DONNEES (`ecran.ts`), pas seulement du calcul. La ligne
 *  `['minuteur', false, 2]` de la table de verite ci-dessus est mathematiquement correcte, mais
 *  aucun ecran de la maison ne peut aujourd'hui l'atteindre : `demarrage.ts` derive
 *  `rangeeAmbiance` de `piece.ambiances.length > 0 || (piece.minuteurs?.length ?? 0) > 0`, et tout
 *  ecran qui porte le mode `minuteur` doit donc declarer l'un ou l'autre pour meme ENTRER dans ce
 *  mode avec une rangee d'ambiance vraie. Sans ce test, la table gele un chiffre qu'aucun ecran ne
 *  peut produire — un test qui ne protege rien. */
describe('minuteur et rangeeAmbiance : ce que la donnee garantit', () => {
  it('tout ecran portant le mode minuteur declare des ambiances ou des minuteurs', () => {
    for (const [nom, ecran] of Object.entries(ECRANS)) {
      // Relecture de la tache 5 : la garde passe par `resoudreAgencement`, PAS par
      // `ecran.agencement?.modes`. La production ne lit jamais le champ directement
      // (`demarrage.ts` appelle `resoudreAgencement(piece)`), et `AGENCEMENT_DEFAUT.modes`
      // contient `minuteur` : un ecran qui perdrait son agencement explicite porterait donc le
      // mode en pratique tout en etant SILENCIEUSEMENT saute ici. Le test resterait vert en
      // cessant d'asserter le cas meme pour lequel il existe.
      if (!resoudreAgencement(ecran).modes.includes('minuteur')) continue;
      const declare = ecran.ambiances.length > 0 || (ecran.minuteurs?.length ?? 0) > 0;
      expect(declare, `${nom} porte le mode minuteur sans ambiances ni minuteurs declares`)
        .toBe(true);
    }
  });

  /** Corroboration : au moins un ecran porte reellement le mode minuteur aujourd'hui, sans quoi
   *  le test ci-dessus serait vide et ne garantirait rien. */
  it('au moins un ecran porte effectivement le mode minuteur', () => {
    const porteurs = Object.values(ECRANS)
      .filter((e) => resoudreAgencement(e).modes.includes('minuteur'));
    expect(porteurs.length).toBeGreaterThan(0);
  });
});
