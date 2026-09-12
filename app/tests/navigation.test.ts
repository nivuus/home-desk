// @vitest-environment jsdom
//
// Câblage de navigation posé par la tâche 8 dans `demarrage.ts` (pas `index.ts` : `dessiner()`
// vit dans la fermeture de `demarrer()`, cf. commentaire de tête de `demarrage.ts` — le brief
// l'illustrait dans `index.ts`, qui n'a jamais accès à `etat`/`piece`/`cx`). Quatre choses à
// prouver, qu'un test au niveau de `rendreNuit`/`rendreMaison` seuls ne peut pas voir :
//   1. l'écran de nuit remplace bandeau+corps entre 23 h et 5 h, et prime sur TOUT le reste, y
//      compris un hash `#maison` déjà posé (ronde de correction 1 : la première version faisait
//      l'inverse — voir ci-dessous et le commentaire dans `demarrage.ts`) ;
//   1bis. si l'heure bascule en nuit *pendant* que la vue « Toute la maison » est ouverte (par
//      exemple via le rappel de l'horloge des 20 s, sans aucun contact), l'écran de nuit reprend
//      la main immédiatement, sans attendre les 45 s du retour automatique ;
//   2. le retour automatique à 45 s n'arme jamais plus d'un minuteur à la fois, quel que soit
//      le nombre de contacts rapprochés (piège payé 3 fois dans ce projet, cf. `interaction.ts`) ;
//   3. les écouteurs `hashchange`/`pointerdown` sont posés une seule fois par la durée de vie de
//      la page, jamais une fois par redessin (deuxième piège déjà payé dans ce projet).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { demarrer, type ConnexionLike } from '../src/demarrage';
import { ECRANS, type Ecran } from '../src/ecran';
import type { EvenementEtat } from '../src/connexion';
import { CLE_RECETTE } from '../src/recette-en-cours';
import { ENTREE_MS, GARDE_MS, PALETTE_MS } from '../src/mouvement/grammaire';
import { monterDemarrage, vider, type OptionsMontage } from './aides';

/** Délai « ceinture et bretelles » du moteur de mouvement (`moteur.ts`) : chaque traversée de vue
 *  pose un minuteur de retrait inconditionnel du fantôme sortant, EN PLUS de son retrait normal
 *  sur `finished` (une micro-tâche, déjà passée par `advanceTimersByTimeAsync(0)` ci-dessous). Ce
 *  second minuteur, lui, reste dans le registre des minuteurs factices jusqu'à échéance — sans
 *  effet visible (`calque.relacher` est idempotent) mais compté par `vi.getTimerCount()`. Les
 *  tests qui suivent avancent l'horloge de ce délai après CHAQUE traversée, avant de lire le
 *  compte : sans ça, ce filet de sécurité, sans rapport avec ce que ces tests vérifient (le
 *  dédoublonnage du retour automatique), s'ajouterait au compte et le fausserait. */
const GARDE_TRAVERSEE_MS = ENTREE_MS + GARDE_MS;

/** Revue finale (2026-08-06) — POURQUOI CES TESTS COMPTENT UN ÉCART ET NON UN NOMBRE ABSOLU.
 *
 *  Le compte de minuteurs factices n'appartient pas qu'à notre code : la mesure de cadence du
 *  moteur (`mesurer`, `src/mouvement.ts`) ouvre, à chaque verdict joué, une boucle
 *  `requestAnimationFrame` qui se referme quand `performance.now()` a avancé de la durée du
 *  verdict. Or `vi.useFakeTimers()` remplace `requestAnimationFrame` mais PAS `performance.now()` :
 *  la boucle est cadencée par l'horloge FACTICE et bornée par l'horloge RÉELLE. Combien de temps
 *  réel s'écoule pendant un `advanceTimersByTimeAsync(820)` dépend uniquement de la charge de la
 *  machine — la boucle est donc, ou n'est pas, encore vivante au moment où l'on compte.
 *
 *  Mesuré : la suite complète, exécutée dix fois d'affilée, faisait tomber ce compte de 1 à 2 sur
 *  environ la moitié des exécutions dès que la peinture s'alourdissait un peu (la revue finale y a
 *  ajouté un `getComputedStyle` par clone, cf. `figerTypographie`). En production, rien de tout
 *  cela n'existe : `requestAnimationFrame` et `performance.now()` y viennent de la même horloge.
 *
 *  Ce que ces tests doivent prouver — un retour armé à l'entrée, et JAMAIS un de plus quel que
 *  soit le nombre de contacts — se vérifie donc sur l'ÉCART : dix contacts rapprochés ne doivent
 *  rien ajouter au compte. Un empilement (le défaut réel, déjà payé trois fois par ce projet) le
 *  ferait bondir de dix. Que le retour ait bien été armé est prouvé séparément, plus bas, par le
 *  retour effectif à l'accueil au bout de 45 s. */
const CONTACTS_RAPPROCHES = 10;

const piece: Ecran = {
  nom: 'Salon', temperature: 'sensor.capteur_humain_temperature',
  ambiances: [], commandes: [], synthese: [], extrasMaison: [],
  sources: [], ouvrants: [],
};

const jetons = { access_token: 'a', refresh_token: 'r', expires: 0, clientId: 'c' };
const stockageAvecSession = { getItem: () => JSON.stringify(jetons), setItem: vi.fn() } as any;

function connexionFactice(): ConnexionLike {
  return {
    connecter: () => Promise.resolve(),
    surChangement: (_cb: (e: EvenementEtat) => void) => {},
    appelerService: vi.fn(),
    // Depuis la tâche 9, `ConnexionLike` porte aussi `surSilence` : aucun des tests de ce
    // fichier ne teste le grisage, donc pas besoin de faire autre chose que satisfaire le type.
    surSilence: (_cb: (ms: number) => void) => {},
    listerTaches: async () => [],
      envoyerCommande: async () => { throw new Error('websocket indisponible'); },
  };
}

// Un hash laissé à '#maison' par un test contaminerait le premier `dessiner()` du suivant (dans
// ce même fichier, donc le même `window`/`location` jsdom) : `demarrer()` regarderait
// `location.hash` avant même que ce test n'ait rien posé lui-même.
afterEach(() => { location.hash = ''; });

describe('navigation (nuit / toute la maison)', () => {
  it('entre 23h et 5h, l ecran de nuit remplace le bandeau et le corps', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => connexionFactice(),
      intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 23, 30),
    });

    expect(racine.querySelector('.nuit')).not.toBeNull();
    expect(racine.querySelector('.corps')).toBeNull();
    expect(racine.querySelector('.hn')?.textContent).toBe('23:30');
  });

  it('en journee, l ecran normal (bandeau + corps) reste affiche', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => connexionFactice(),
      intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 14, 0),
    });

    expect(racine.querySelector('.nuit')).toBeNull();
    expect(racine.querySelector('.corps')).not.toBeNull();
  });

  // 2026-08-28 — DÉFAUT MESURÉ SUR LA TABLETTE CUISINE. Une traversée de vue ne fait glisser que
  // l'élément marqué `data-mvt="vue:…"`, et ne garde en fond que le clone de celui qu'on quitte
  // (`moteur.ts`, verdict `traversee`). Tant que cette marque vivait sur `.corps` SEUL, le bandeau
  // — son frère, hors de la marque — était simplement retiré par `lit` au premier rendu de la
  // sous-vue : l'heure disparaissait NET au début du geste, et la bande de 121 px qu'elle occupe
  // restait vide pendant les 320 ms de l'ouverture de `#minuteur` (reproduit dans un vrai
  // Chromium, capture à 40 ms). L'accueil se déclare donc au moteur par une racine unique qui
  // contient les DEUX, `.ecran` : ce que le clone de fond montre est alors l'écran entier, tel
  // qu'il était.
  it('l accueil se declare au moteur par UNE racine de vue qui contient le bandeau ET le corps',
     async () => {
    const racine = document.createElement('div');
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => connexionFactice(),
      intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 14, 0),
    });

    const vue = racine.querySelector('[data-mvt="vue:accueil"]');
    expect(vue, 'aucune racine de vue « accueil »').not.toBeNull();
    expect(vue!.querySelector('.cap'), 'le bandeau est hors de la vue : il sautera')
      .not.toBeNull();
    expect(vue!.querySelector('.corps')).not.toBeNull();
    // Et rien d'autre en enfant direct de la racine : un frère non marqué sauterait pareil.
    // `Array.from`, jamais un spread : `HTMLCollection` n'est itérable qu'avec `lib: DOM.Iterable`,
    // que la compilation du build (`rollup-plugin-typescript`) n'active pas — vitest passe par
    // esbuild, qui ne type-vérifie rien, donc l'avertissement ne se voit qu'au `npm run build`.
    expect(Array.from(racine.children).filter((e) => e.classList.contains('cap')))
      .toHaveLength(0);
  });

  // Ronde de correction 1 (IMPORTANT, relecteur) : inversé par rapport à la première version de
  // cette tâche, qui faisait primer un hash `#maison` déjà posé sur l'écran de nuit. En pratique
  // ce hash résiduel ne peut venir que d'une navigation antérieure (l'écran de nuit lui-même n'a
  // aucun bouton pour l'atteindre, cf. `rendu/nuit.ts`) : le cas d'usage central de l'écran de
  // nuit — ne réveiller personne en traversant le salon — prime sur ce résidu.
  it('l ecran de nuit prime sur un hash « #maison » deja pose (residu d une navigation anterieure)', async () => {
    const racine = document.createElement('div');
    location.hash = '#maison';   // état résiduel, posé AVANT le démarrage de cette instance
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => connexionFactice(),
      intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 23, 30),
    });

    expect(racine.querySelector('.nuit')).not.toBeNull();
    expect(racine.querySelector('.grille')).toBeNull();
  });

  // Ronde de correction 1 (IMPORTANT, relecteur) : c'est LE scénario que la première version ne
  // couvrait pas. `dessiner()` est aussi rappelée toutes les 20 s par l'horloge (`d.intervalFn`),
  // sans qu'aucun contact n'ait eu lieu — c'est ce rappel qui doit faire reprendre la main à
  // l'écran de nuit dès que le moment bascule, pas seulement le retour automatique à 45 s (qui
  // aurait laissé jusqu'à 45 s de grille à 9 tuiles sur fond clair dans une pièce déjà passée en
  // pleine nuit).
  it('si l heure bascule en nuit pendant que « Toute la maison » est ouverte, l ecran de nuit reprend la main sans attendre le retour automatique', async () => {
    const racine = document.createElement('div');
    let maintenant = new Date(2026, 7, 1, 22, 58);
    const intervalFn = vi.fn();
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => connexionFactice(),
      intervalFn: intervalFn as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => maintenant,
    });

    location.hash = '#maison';
    window.dispatchEvent(new Event('hashchange'));
    expect(racine.querySelector('.grille')).not.toBeNull();
    expect(racine.querySelector('.nuit')).toBeNull();

    // Le rappel de l'horloge des 20 s (`d.intervalFn(dessiner, 20_000)`), déclenché à la main
    // sans dépendre d'un vrai minuteur : c'est lui qui fait avancer l'horloge affichée même sans
    // aucun changement d'entité ni aucun contact.
    const rappelHorloge = intervalFn.mock.calls.find(([, delai]) => delai === 20_000)?.[0] as
      (() => void) | undefined;
    expect(rappelHorloge, 'd.intervalFn(dessiner, 20_000) doit avoir été armé par demarrer()').toBeDefined();

    maintenant = new Date(2026, 7, 1, 23, 0);   // l'heure bascule, aucun contact entre-temps
    rappelHorloge!();

    expect(racine.querySelector('.nuit')).not.toBeNull();
    expect(racine.querySelector('.grille')).toBeNull();
  });

  // Piège critique (déjà payé 3 fois dans ce projet, cf. `interaction.ts`) : c'est le NOMBRE de
  // minuteurs vivants qui prouve le dédoublonnage, pas la valeur finale — deux minuteurs
  // identiques (toujours 45 s ici) peuvent très bien retomber sur le même résultat par
  // coïncidence sans que l'un n'ait jamais annulé l'autre.
  it('des contacts rapproches sur « Toute la maison » n arment jamais plus d un retour a la fois, et il ramene bien a l accueil apres 45s', async () => {
    vi.useFakeTimers();
    // `chargerMeteo()` (déclenché par `demarrer()`) appelle le `fetch` global réel (undici) :
    // sous timers factices, son mécanisme interne de délai pose lui-même un minuteur, ce qui
    // fausserait `vi.getTimerCount()` sans rapport avec ce que ce test vérifie. Un rejet
    // immédiat suffit : `chargerMeteo` avale toute erreur (règle 4 du brief, cf. `demarrage.ts`).
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('réseau indisponible dans ce test')) as any;
    try {
      const racine = document.createElement('div');
      await demarrer(racine, piece, {
        stockage: stockageAvecSession,
        creerConnexion: () => connexionFactice(),
        intervalFn: vi.fn() as any,
        minuteurFn: setTimeout,
        maintenant: () => new Date(2026, 7, 1, 14, 0),
      });

      // jsdom déclenche ici son propre `hashchange` de façon asynchrone (mais réelle) quand
      // `location.hash` change dans le corps du test : `advanceTimersByTimeAsync(0)` le laisse
      // s'exécuter avant d'inspecter quoi que ce soit.
      location.hash = '#maison';
      await vi.advanceTimersByTimeAsync(0);
      expect(racine.querySelector('.grille')).not.toBeNull();
      // Traversée accueil → « Toute la maison » : laisse le filet de sécurité du fantôme sortant
      // (cf. `GARDE_TRAVERSEE_MS` en tête de fichier) s'éteindre avant de compter, sans quoi il
      // s'ajouterait au minuteur de retour que ce test veut isoler.
      await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
      // Le hashchange a armé le retour (cf. `CONTACTS_RAPPROCHES` en tête de fichier pour la
      // raison de l'écart plutôt que d'un compte absolu).
      const enVol = vi.getTimerCount();
      expect(enVol).toBeGreaterThanOrEqual(1);

      // Dix contacts rapprochés (l'utilisateur qui parcourt les tuiles) : chacun doit annuler
      // le minuteur du précédent, jamais en empiler un de plus.
      for (let i = 0; i < CONTACTS_RAPPROCHES; i++) document.dispatchEvent(new Event('pointerdown'));
      expect(vi.getTimerCount()).toBe(enVol);

      await vi.advanceTimersByTimeAsync(45_000);
      // Vérifié isolément : jsdom ne déclenche pas son `hashchange` automatique quand
      // `location.hash` est modifié depuis l'intérieur d'un callback de minuteur factice
      // (limitation de l'interaction jsdom/`vi.useFakeTimers`, pas de notre code — un vrai
      // navigateur le fait toujours, en dehors de tout timer factice). On le déclenche donc
      // nous-mêmes ici, une seule fois, pour vérifier ce qu'un vrai navigateur ferait : que
      // notre propre écouteur (posé par `demarrage.ts`) redessine bien l'accueil quand le
      // minuteur ramène le hash à ''.
      window.dispatchEvent(new Event('hashchange'));
      // Traversée retour « Toute la maison » → accueil : encore une garde à laisser s'éteindre
      // avant de vérifier que la vue sortante ne laisse plus rien derrière elle.
      await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
      expect(location.hash).toBe('');
      expect(racine.querySelector('.grille')).toBeNull();
      expect(racine.querySelector('.corps')).not.toBeNull();   // revenu à l'accueil (jour ici)
      // Pas d'assertion `getTimerCount() === 0` ici : la même limitation jsdom/fake-timers
      // laisse un minuteur interne « fantôme » posé par jsdom lui-même (pas par notre code, cf.
      // ci-dessus) après un changement de hash déclenché depuis un callback factice — vérifié
      // isolément avec un simple `setTimeout(() => { location.hash = ''; }, ...)` sans aucun
      // code applicatif : le compte ne redescend jamais à 0 dans ce cas précis, y compris quand
      // AUCUN écouteur n'est branché dessus. L'invariant « jamais plus d'un minuteur vivant » —
      // celui que ce test existe pour prouver — est déjà démontré ci-dessus (compte à 1, pas 11,
      // après les dix contacts rapprochés) ; il n'a pas besoin d'être re-démontré après un
      // retour dont l'artefact fausserait justement la mesure.
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.useRealTimers();
    }
  });

  it('un contact hors de « Toute la maison » n arme jamais de retour (rien a annuler)', async () => {
    vi.useFakeTimers();
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('réseau indisponible dans ce test')) as any;
    try {
      const racine = document.createElement('div');
      await demarrer(racine, piece, {
        stockage: stockageAvecSession,
        creerConnexion: () => connexionFactice(),
        intervalFn: vi.fn() as any,
        minuteurFn: setTimeout,
        maintenant: () => new Date(2026, 7, 1, 14, 0),
      });
      // 14 h sans `sun.sun` poussé : `soleilLeve` vaut faux, donc le tout premier `dessiner()`
      // voit un moment `soir` (`momentDuJour`) et bascule la palette sombre — un minuteur de
      // fondu (`PALETTE_MS`, tâche 7) est donc déjà en vol au montage, sans aucun rapport avec le
      // retour automatique que ce test vérifie. On le laisse s'éteindre avant de compter.
      await vi.advanceTimersByTimeAsync(PALETTE_MS);

      // Écart, jamais compte absolu (cf. `CONTACTS_RAPPROCHES` en tête de fichier) : une boucle de
      // mesure de cadence peut très bien être encore en vol ici, et elle n'a rien à voir avec le
      // retour automatique. Ce que ce test prouve, c'est que cinq contacts hors sous-vue
      // n'ajoutent AUCUN minuteur — un retour armé à tort en ferait apparaître un.
      const enVol = vi.getTimerCount();
      for (let i = 0; i < 5; i++) document.dispatchEvent(new Event('pointerdown'));
      expect(vi.getTimerCount()).toBe(enVol);
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.useRealTimers();
    }
  });

  // Tâche 18 : la vue « Tâches » est une deuxième « sous-vue » (au même titre que « Toute la
  // maison »), avec exactement les mêmes règles de retour automatique — même minuteur partagé,
  // jamais un empilement, jamais deux minuteurs concurrents en passant de l'une à l'autre.
  describe('vue Taches : memes regles de retour automatique et de glissement lateral que Toute la maison', () => {
    it('entrer sur #taches arme le retour a 45s (un seul minuteur), des contacts rapproches ne l empilent jamais', async () => {
      vi.useFakeTimers();
      const fetchOriginal = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('réseau indisponible dans ce test')) as any;
      try {
        const racine = document.createElement('div');
        await demarrer(racine, piece, {
          stockage: stockageAvecSession,
          creerConnexion: () => connexionFactice(),
          intervalFn: vi.fn() as any,
          minuteurFn: setTimeout,
          maintenant: () => new Date(2026, 7, 1, 14, 0),
        });

        location.hash = '#taches';
        await vi.advanceTimersByTimeAsync(0);
        expect(racine.querySelector('.taches-liste')).not.toBeNull();
        // Traversée accueil → « Tâches » : cf. `GARDE_TRAVERSEE_MS` en tête de fichier.
        await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
        // Écart, jamais compte absolu : cf. `CONTACTS_RAPPROCHES` en tête de fichier.
        const enVol = vi.getTimerCount();
        expect(enVol).toBeGreaterThanOrEqual(1);   // le hashchange a armé le retour

        for (let i = 0; i < CONTACTS_RAPPROCHES; i++) document.dispatchEvent(new Event('pointerdown'));
        expect(vi.getTimerCount()).toBe(enVol);   // dédoublonné, jamais empilé

        await vi.advanceTimersByTimeAsync(45_000);
        window.dispatchEvent(new Event('hashchange'));   // même limitation jsdom/fake-timers que le test « Toute la maison » ci-dessus
        // Traversée retour « Tâches » → accueil : cf. `GARDE_TRAVERSEE_MS` en tête de fichier.
        await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
        expect(location.hash).toBe('');
        expect(racine.querySelector('.taches-liste')).toBeNull();
        expect(racine.querySelector('.corps')).not.toBeNull();
      } finally {
        globalThis.fetch = fetchOriginal;
        vi.useRealTimers();
      }
    });

    // Tâche 10 bis : le réglage du minuteur (`#minuteur`) devient une troisième sous-vue plein
    // écran, exactement au même titre que « Toute la maison »/« Tâches » — même patron EXACT que
    // le test « #taches » ci-dessus, seul le hash et le marqueur DOM changent.
    it('entrer sur #minuteur arme le retour a 45s (un seul minuteur), des contacts rapproches ne l empilent jamais', async () => {
      vi.useFakeTimers();
      const fetchOriginal = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('réseau indisponible dans ce test')) as any;
      try {
        const racine = document.createElement('div');
        await demarrer(racine, piece, {
          stockage: stockageAvecSession,
          creerConnexion: () => connexionFactice(),
          intervalFn: vi.fn() as any,
          minuteurFn: setTimeout,
          maintenant: () => new Date(2026, 7, 1, 14, 0),
        });

        location.hash = '#minuteur';
        await vi.advanceTimersByTimeAsync(0);
        expect(racine.querySelector('.mn-reglage')).not.toBeNull();
        // Traversée accueil → réglage minuteur : cf. `GARDE_TRAVERSEE_MS` en tête de fichier.
        await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
        // Écart, jamais compte absolu : cf. `CONTACTS_RAPPROCHES` en tête de fichier.
        const enVol = vi.getTimerCount();
        expect(enVol).toBeGreaterThanOrEqual(1);   // le hashchange a armé le retour

        for (let i = 0; i < CONTACTS_RAPPROCHES; i++) document.dispatchEvent(new Event('pointerdown'));
        expect(vi.getTimerCount()).toBe(enVol);   // dédoublonné, jamais empilé

        await vi.advanceTimersByTimeAsync(45_000);
        window.dispatchEvent(new Event('hashchange'));   // même limitation jsdom/fake-timers que le test « Toute la maison » ci-dessus
        // Traversée retour réglage minuteur → accueil : cf. `GARDE_TRAVERSEE_MS` en tête de fichier.
        await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
        expect(location.hash).toBe('');
        expect(racine.querySelector('.mn-reglage')).toBeNull();
        expect(racine.querySelector('.corps')).not.toBeNull();
      } finally {
        globalThis.fetch = fetchOriginal;
        vi.useRealTimers();
      }
    });

    // Piège déjà payé trois fois dans ce projet, par trois portes différentes (cf.
    // `interaction.ts`) : passer d'une sous-vue à l'autre SANS repasser par l'accueil ne doit
    // jamais laisser deux minuteurs de retour vivants en même temps.
    //
    // Re-revue — SEUL SITE DU FICHIER OÙ L'ÉCART NE SUFFIT PAS. Partout ailleurs, les deux lectures
    // du compte encadrent des `dispatchEvent` synchrones : aucune horloge ne tourne entre elles,
    // donc aucune boucle de mesure de cadence ne peut naître ni mourir dans l'intervalle. Ici, il y
    // a une navigation ENTIÈRE entre les deux — deux `advanceTimersByTimeAsync`, et une seconde
    // traversée qui ouvre sa propre fenêtre de mesure. L'écart restait donc racé DANS LES DEUX
    // SENS (cf. `CONTACTS_RAPPROCHES` en tête de fichier pour la cause).
    //
    // On ne compte donc plus « les minuteurs » mais LES RETOURS : `demarrer` reçoit déjà son
    // `minuteurFn` du test, et `armerRetour` (`demarrage.ts`) annule le précédent par
    // `clearTimeout` global avant d'en reposer un. Enregistrer les deux bouts donne le nombre exact
    // de retours vivants, sans rien devoir à l'horloge réelle — et c'est une assertion PLUS
    // proche du sujet que le compte global qu'elle remplace.
    const armerDesRetours = () => {
      const poses: { id: unknown; ms: number }[] = [];
      const annules = new Set<unknown>();
      let clearOriginal: typeof clearTimeout | undefined;
      return {
        poser: ((cb: () => void, ms: number) => {
          const id = setTimeout(cb, ms);
          poses.push({ id, ms });
          return id;
        }) as unknown as typeof setTimeout,
        brancherAnnulations() {
          clearOriginal = globalThis.clearTimeout;
          globalThis.clearTimeout = ((id: never) => {
            annules.add(id);
            return clearOriginal!(id);
          }) as typeof clearTimeout;
        },
        debrancher() { if (clearOriginal) globalThis.clearTimeout = clearOriginal; },
        /** Les retours automatiques ARMÉS et pas encore annulés. `RETOUR_MS` est le seul délai de
         *  45 s posé par `demarrage.ts` : aucun autre minuteur ne peut être confondu avec lui. */
        retoursVivants: () => poses.filter((m) => m.ms === 45_000 && !annules.has(m.id)).length,
      };
    };

    it('passer de #maison a #taches sans repasser par l accueil ne double jamais le minuteur de retour', async () => {
      vi.useFakeTimers();
      const armes = armerDesRetours();
      const fetchOriginal = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('réseau indisponible dans ce test')) as any;
      try {
        const racine = document.createElement('div');
        await demarrer(racine, piece, {
          stockage: stockageAvecSession,
          creerConnexion: () => connexionFactice(),
          intervalFn: vi.fn() as any,
          minuteurFn: armes.poser,
          maintenant: () => new Date(2026, 7, 1, 14, 0),
        });
        armes.brancherAnnulations();

        location.hash = '#maison';
        await vi.advanceTimersByTimeAsync(0);
        // Traversée accueil → « Toute la maison » : cf. `GARDE_TRAVERSEE_MS` en tête de fichier.
        await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
        expect(armes.retoursVivants()).toBe(1);

        location.hash = '#taches';
        await vi.advanceTimersByTimeAsync(0);
        // Deuxième traversée, « Toute la maison » → « Tâches », même garde à laisser s'éteindre.
        await vi.advanceTimersByTimeAsync(GARDE_TRAVERSEE_MS);
        // Le second retour a REMPLACÉ le premier : toujours UN SEUL vivant, jamais deux.
        expect(armes.retoursVivants()).toBe(1);
      } finally {
        armes.debrancher();
        globalThis.fetch = fetchOriginal;
        vi.useRealTimers();
      }
    });

    // Tâche 18 : glissement latéral entre l'accueil et une sous-vue (contrainte du propriétaire —
    // « le passage était brutal »). Tâche 3 (moteur de mouvement) : le sens n'est plus posé à la
    // main par `demarrage.ts` (`.entree-droite`/`.entree-gauche`, périmées) — c'est le moteur qui
    // le déduit lui-même de la clé `data-mvt="vue:…"` de la vue entrante (`comparer()`,
    // `diff.ts`). Ce test ne prouve donc plus qu'une classe est posée, mais que la vue rendue se
    // déclare bien au moteur — le jugement du SENS de la poussée revient à
    // `tests/moteur.test.ts` (`creerMoteur — traversée de vue`) et, à l'œil, à
    // `outils/verifier-rendu.mjs` sur la tablette réelle.
    it('la vue « Toute la maison » se déclare comme telle au moteur', async () => {
      const racine = document.createElement('div');
      await demarrer(racine, piece, {
        stockage: stockageAvecSession,
        creerConnexion: () => connexionFactice(),
        intervalFn: vi.fn() as any,
        minuteurFn: vi.fn() as any,
        maintenant: () => new Date(2026, 7, 1, 14, 0),
      });

      location.hash = '#maison';
      window.dispatchEvent(new Event('hashchange'));
      expect(racine.querySelector('[data-mvt="vue:maison"]')).not.toBeNull();
    });
  });

  // Deuxième piège déjà payé dans ce projet (cf. commentaire `interaction.ts`) : un écouteur
  // posé à CHAQUE rendu, plutôt qu'une fois pour toute la durée de vie de la page, s'accumule
  // silencieusement — invisible sur l'état final, visible seulement en comptant les poses.
  it('les ecouteurs hashchange et pointerdown ne sont poses qu une seule fois, meme apres plusieurs redessins', async () => {
    const racine = document.createElement('div');
    const posesWindow = vi.spyOn(window, 'addEventListener');
    const posesDocument = vi.spyOn(document, 'addEventListener');
    let emettre: ((e: EvenementEtat) => void) | undefined;

    try {
      await demarrer(racine, piece, {
        stockage: stockageAvecSession,
        creerConnexion: () => ({
          connecter: () => Promise.resolve(),
          surChangement: (cb) => { emettre = cb; },
          appelerService: vi.fn(),
          surSilence: (_cb: (ms: number) => void) => {},
          listerTaches: async () => [],
      envoyerCommande: async () => { throw new Error('websocket indisponible'); },
        }),
        intervalFn: vi.fn() as any,
        minuteurFn: vi.fn() as any,
        maintenant: () => new Date(2026, 7, 1, 14, 0),
      });

      const nbHashchange = () => posesWindow.mock.calls.filter(([type]) => type === 'hashchange').length;
      const nbPointerdown = () => posesDocument.mock.calls.filter(([type]) => type === 'pointerdown').length;
      expect(nbHashchange()).toBe(1);
      expect(nbPointerdown()).toBe(1);

      // Plusieurs redessins supplémentaires, déclenchés par de vrais changements d'état (comme
      // le ferait le websocket HA en continu) : aucun ne doit reposer un écouteur.
      emettre!({ entity_id: 'light.lumiere_salon', state: 'on', attributes: {} });
      emettre!({ entity_id: 'light.lumiere_salon', state: 'off', attributes: {} });
      emettre!({ entity_id: 'light.lumiere_salon', state: 'on', attributes: {} });

      expect(nbHashchange()).toBe(1);
      expect(nbPointerdown()).toBe(1);
    } finally {
      posesWindow.mockRestore();
      posesDocument.mockRestore();
    }
  });
});

// Lot 6 (2026-08-21) : la QUATRIÈME sous-vue, `#recette`, et tout le câblage qui la relie à
// `home_stock` — le bloc de l'accueil, l'ouverture au contact, la réduction qui garde l'étape, les
// minuteurs inline, la validation du repas. Rangée ici plutôt que dans `tests/demarrage.test.ts`
// parce que c'est d'abord une histoire de NAVIGATION : `#recette` est la seule sous-vue exemptée
// du retour de 45 s, et la seule dont la sortie principale (« Réduire ») laisse un état derrière
// elle.
describe('vue recette (#recette)', () => {
  const MIDI = () => new Date(2026, 7, 17, 14, 0);

  /** L'état du capteur, tel que `home_stock` le publie : le plat dans l'ÉTAT, tout le reste dans
   *  les attributs. `day` tombe le même jour que l'horloge des tests, sinon l'étiquette devient
   *  « Demain, dîner » — ce que ces tests ne cherchent pas à prouver (c'est `tests/repas.test.ts`). */
  const REPAS: [string, string, Record<string, unknown>][] = [[
    'sensor.home_stock_next_meal', 'Bol lentilles',
    { day: '2026-08-17', slot: 'dinner', recipe_id: 76, meal_id: 139, missing_ingredients: 0 },
  ]];

  /** Ce que `home_stock/recipe/get` rend : la recette et ses étapes déjà imbriquées. Deux étapes
   *  ⇒ deux pages, comme les deux blocs `.page-recipes` de l'ancienne fixture. */
  const DEUX_ETAPES = (puce = 'Mélanger') => ({
    recipe: { id: 76, name: 'Bol lentilles', servings: 2 },
    steps: [
      { position: 1, title: 'Préparer', image_url: null,
        instructions: [{ text: puce, timer_label: null, timer_seconds: null }] },
      { position: 2, title: 'Servir', image_url: null,
        instructions: [{ text: 'Dresser', timer_label: null, timer_seconds: null }] },
    ],
    ingredients: [],
  });

  /** Ce que `home_stock/meal/preview` rend : le plan de décrément, calculé SANS RIEN ÉCRIRE. */
  const APERCU = (lignes: unknown[] = []) => ({
    meal_id: 139, day: '2026-08-17', slot_key: 'dinner',
    recipe: { id: 76, name: 'Bol lentilles', servings: 2 },
    servings: 2, factor: 1, lines: lignes, by_hand: [], dish: null, blocking: [],
  });

  const ligne = (nom: string, label = '200 g', status = 'ok') => (
    { ingredient_id: 1, label, product_id: 9, product_name: nom, status,
      needed: 200, available: 500, raw_text: `${label} de ${nom}`, batches: [] });

  const commandes = (recette: unknown = DEUX_ETAPES(), apercu: unknown = APERCU()) => ({
    'home_stock/recipe/get': () => recette,
    'home_stock/meal/preview': () => apercu,
    'home_stock/meal/validate': () => ({ meal_id: 139 }),
  });

  /** Un montage de cuisine avec un repas planifié et les trois commandes doublées — le cas
   *  nominal de toute cette suite. */
  const monterCuisine = (options: Partial<OptionsMontage> = {}) =>
    monterDemarrage(ECRANS.cuisine, {
      maintenant: MIDI, etats: REPAS, commandes: commandes(), ...options,
    });

  /** MESURÉ : jsdom ne déclenche son propre `hashchange` qu'à la MACROtâche suivante — `vider()`
   *  (micro-tâches seules, cf. `tests/aides.ts`) ne suffit donc pas quand c'est le RENDU qui écrit
   *  `location.hash` (le bloc de l'accueil, `rendu/defaut.ts`). Les tests qui posent le hash
   *  eux-mêmes dispatchent l'événement à la main, comme partout ailleurs dans ce fichier. */
  const viderApresHash = async (): Promise<void> => {
    await new Promise((r) => setTimeout(r, 0));
    await vider();
  };
  const ouvrir = async (): Promise<void> => {
    location.hash = '#recette';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vider();
  };
  const appuyer = (racine: HTMLElement, selecteur: string): void => {
    const el = racine.querySelector(selecteur);
    expect(el, `${selecteur} doit être rendu`).not.toBeNull();
    el!.dispatchEvent(new Event('pointerdown'));
  };
  /** Les commandes `home_stock/*` réellement parties, dans l'ordre. */
  const envoyees = (m: { envoyerCommande: { mock: { calls: unknown[][] } } }) =>
    m.envoyerCommande.mock.calls.map((c) => c[0] as Record<string, unknown>);

  it('affiche le repas suivant sur l accueil et l ouvre au contact', async () => {
    const m = await monterCuisine();
    expect(m.racine.textContent).toContain('Dîner');
    expect(m.racine.textContent).toContain('Bol lentilles');

    appuyer(m.racine, '.mode-bloc');
    await viderApresHash();
    expect(location.hash).toBe('#recette');
    expect(m.racine.querySelector('[data-mvt="vue:recette"]')).not.toBeNull();
    expect(m.racine.querySelector('.recette-pages')?.textContent).toBe('1/2');
  });

  it('ouvre la vue en envoyant recipe/get puis meal/preview, une fois chacun', async () => {
    const m = await monterCuisine();
    await ouvrir();
    expect(envoyees(m)).toEqual([
      { type: 'home_stock/recipe/get', recipe_id: 76 },
      { type: 'home_stock/meal/preview', meal_id: 139 },
    ]);
  });

  it('ne relit JAMAIS périodiquement', async () => {
    // La leçon de l'ancienne source (3,8 Mo/jour), tenue par un test plutôt que par un
    // commentaire. Aucun `setInterval` ne doit toucher au repas ni à la recette.
    const m = await monterCuisine();
    await ouvrir();
    for (const [fn] of m.intervalFn.mock.calls) (fn as () => void)();
    await vider();
    expect(envoyees(m)).toHaveLength(2);
  });

  it("n'appelle plus aucun service grocy", async () => {
    const m = await monterCuisine();
    await ouvrir();
    appuyer(m.racine, '.recette-ingredients');
    await vider();
    const domaines = m.appelerService.mock.calls.map((c: unknown[]) => c[0]);
    expect(domaines).not.toContain('grocy');
  });

  it('n arme PAS le retour de 45 s sur #recette, mais un repli de 30 min', async () => {
    const m = await monterCuisine();
    await ouvrir();
    const delais = m.minuteurFn.mock.calls.map((c: unknown[]) => c[1]);
    expect(delais).toContain(1_800_000);
    expect(delais).not.toContain(45_000);
  });

  // Le repli de 30 min RÉDUIT (il remet le hash à vide), il ne ferme pas : l'étape survit, et c'est
  // la péremption de 4 h (`src/recette-en-cours.ts`) qui finit par oublier — jamais ce minuteur.
  it('le repli de 30 min réduit sans oublier l étape', async () => {
    const m = await monterCuisine();
    await ouvrir();
    appuyer(m.racine, '.recette-suiv');
    await vider();
    const repli = m.minuteurFn.mock.calls.find((c: unknown[]) => c[1] === 1_800_000)?.[0] as
      (() => void) | undefined;
    expect(repli, 'le repli de 30 min doit avoir été armé').toBeDefined();
    repli!();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vider();
    expect(location.hash).toBe('');
    expect(m.racine.textContent).toContain('Étape 2/2');
  });

  it('réduit vers l accueil en gardant l étape, et le bloc la rouvre', async () => {
    const m = await monterCuisine();
    await ouvrir();
    appuyer(m.racine, '.recette-suiv');
    await vider();
    appuyer(m.racine, '.recette-reduire');
    await vider();
    expect(location.hash).toBe('');
    expect(m.racine.textContent).toContain('Étape 2/2');

    // Le bloc réduit rouvre la vue LÀ OÙ ON L'AVAIT LAISSÉE : c'est tout l'intérêt de « Réduire »
    // plutôt que « Terminer » — sans ça, revenir à sa recette coûterait de retrouver son étape.
    appuyer(m.racine, '.mode-bloc');
    await viderApresHash();
    expect(m.racine.querySelector('[data-mvt="vue:recette"]')).not.toBeNull();
    expect(m.racine.querySelector('.recette-pages')?.textContent).toBe('2/2');
  });

  // --- « Terminer » : deux appuis, puis meal/validate ---

  it('« Terminer » ne valide RIEN au premier appui', async () => {
    const m = await monterCuisine();
    await ouvrir();
    appuyer(m.racine, '.recette-terminer');
    await vider();
    expect(envoyees(m).map((c) => c.type)).not.toContain('home_stock/meal/validate');
    // Et l'écran DIT ce que le second appui fera.
    expect(m.racine.textContent).toContain('le stock sera décrémenté');
  });

  it('« Terminer » confirmé envoie meal/validate avec une idempotency_key', async () => {
    const m = await monterCuisine();
    await ouvrir();
    appuyer(m.racine, '.recette-terminer');
    await vider();
    appuyer(m.racine, '.recette-terminer');
    await vider();
    const validation = envoyees(m).find((c) => c.type === 'home_stock/meal/validate')!;
    expect(validation).toMatchObject({ meal_id: 139, portions_eaten: 1 });
    expect(typeof validation.idempotency_key).toBe('string');
    expect(location.hash).toBe('');
    expect(m.racine.textContent).not.toContain('Étape');
  });

  it("un refus serveur n'efface RIEN de l'écran et affiche le message français", async () => {
    // C'est tout l'intérêt d'écrire par websocket plutôt que par `appelerService`, qui est un
    // envoi sans réponse : sur un écran où l'on retire la ligne de façon optimiste, savoir que
    // l'écriture a échoué n'est pas un luxe.
    const m = await monterCuisine({ commandes: {
      ...commandes(),
      'home_stock/meal/validate': () => { throw new Error('Stock insuffisant.'); },
    } });
    await ouvrir();
    appuyer(m.racine, '.recette-terminer');
    await vider();
    appuyer(m.racine, '.recette-terminer');
    await vider();
    expect(m.racine.querySelector('[data-mvt="vue:recette"]')).not.toBeNull();
    expect(m.racine.textContent).toContain('Stock insuffisant.');
    expect(m.racine.querySelector('.recette-page')).not.toBeNull();
  });

  it("hors ligne, « Terminer » est refusé VISIBLEMENT et rien n'est mis en file", async () => {
    // Le panneau a une file parce qu'on scanne dans un magasin sans réseau ; une tablette murale
    // est à trois mètres du routeur, QUI EST le serveur HA. Rejouer une validation de repas une
    // heure plus tard, sans témoin, décrémenterait un stock à l'aveugle.
    const m = await monterCuisine();
    await ouvrir();
    m.silence(60_000);
    await vider();
    const avant = envoyees(m).length;
    appuyer(m.racine, '.recette-terminer');
    await vider();
    appuyer(m.racine, '.recette-terminer');
    await vider();
    expect(envoyees(m)).toHaveLength(avant);
    expect(m.racine.querySelector('.recette-terminer')!.className).toContain('inactif');
  });

  // REVUE FINALE (2026-08-17) : `listerMinuteurs` (`minuteur.ts`) trie les ACTIFS D'ABORD — donc
  // dès qu'aucun minuteur ne tourne, `vuesMinuteurs[0]` est un minuteur EN PAUSE, dont le restant
  // est FIGÉ. Le bloc l'affichait quand même, comme un décompte qui descend. Cas courant en
  // cuisine : une cuisson mise en pause le temps de goûter.
  it('n affiche AUCUN décompte quand le seul minuteur est en pause', async () => {
    const m = await monterCuisine();
    await ouvrir();
    appuyer(m.racine, '.recette-reduire');
    await m.pousser('timer.cuisine', 'paused', { remaining: '0:07:32', duration: '0:10:00' });
    await vider();
    expect(m.racine.textContent).toContain('Étape 1/2');
    expect(m.racine.textContent).not.toContain('07:32');
  });

  // Contre-épreuve : un minuteur en pause NE MASQUE PAS celui qui tourne réellement.
  it('reprend le décompte du minuteur qui tourne même quand un autre est en pause', async () => {
    const m = await monterCuisine();
    await ouvrir();
    appuyer(m.racine, '.recette-reduire');
    await m.pousser('timer.cuisine', 'paused', { remaining: '0:01:00', duration: '0:10:00' });
    await m.pousser('timer.cuisine_2', 'active',
      { finishes_at: new Date(2026, 7, 17, 14, 7, 32).toISOString(), duration: '0:10:00' });
    await vider();
    expect(m.racine.textContent).toContain('Étape 1/2 · 07:32');
  });

  it('la recette réduite prime sur le mode minuteur', async () => {
    const m = await monterCuisine();
    await ouvrir();
    appuyer(m.racine, '.recette-reduire');
    // Une commande connue de HA : sans elle, la grille serait vide quel que soit le mode
    // (`estUtilisable`, `rendu/corps.ts`) et l'assertion ci-dessous ne prouverait rien.
    await m.pousser('fan.purificateur_air', 'off', {});
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(2026, 7, 17, 14, 7, 32).toISOString(), duration: '0:10:00' });
    await vider();
    expect(m.racine.textContent).toContain('Étape 1/2 · 07:32');
    // Le mode `minuteur` n'affiche AUCUNE commande (630 px mesurés) : si la préséance de la recette
    // n'était pas câblée, lancer une cuisson viderait la grille en même temps qu'il ferait
    // disparaître le point de reprise.
    expect(m.racine.querySelectorAll('.commande').length).toBeGreaterThan(0);
  });

  describe('minuteurs inline', () => {
    /** Une étape qui porte un minuteur, écrit par `pagesDepuisEtapes` sous la forme
     *  `#Pâtes:600` — le motif que `pageAvecMinuteurs` scanne. */
    const AVEC_TAG = {
      recipe: { id: 76, name: 'Bol', servings: 2 },
      steps: [{ position: 1, title: null, image_url: null,
                instructions: [{ text: 'Cuire', timer_label: 'Pâtes', timer_seconds: 600 }] }],
      ingredients: [],
    };
    const monterAvecTag = () => monterCuisine({ commandes: commandes(AVEC_TAG) });

    it('démarre un minuteur inline sur le premier créneau libre', async () => {
      const m = await monterAvecTag();
      await m.pousser('timer.cuisine', 'idle', {});
      await ouvrir();
      appuyer(m.racine, '.recette-minuteur');
      expect(m.appelerService).toHaveBeenCalledWith('timer', 'start',
        { entity_id: 'timer.cuisine', duration: '00:10:00' });
      expect(m.appelerService).toHaveBeenCalledWith('input_text', 'set_value',
        { entity_id: 'input_text.minuteur_cuisine_nom', value: 'Pâtes' });
    });

    // `rendreVueRecette` appelle `actions.minuteur(nom, secondes)` avec la durée du TAG même quand
    // un minuteur de ce nom tourne déjà (il ne connaît pas les créneaux) — c'est CE câblage qui
    // arbitre. Sans lui, un appui sur une cuisson en cours ouvrirait un second créneau à 10 min.
    it('un appui sur un minuteur EN MARCHE le met en pause, jamais un second créneau', async () => {
      const m = await monterAvecTag();
      await m.pousser('input_text.minuteur_cuisine_nom', 'Pâtes', {});
      await m.pousser('timer.cuisine', 'active',
        { finishes_at: new Date(2026, 7, 17, 14, 3, 20).toISOString(), duration: '0:10:00' });
      await m.pousser('timer.cuisine_2', 'idle', {});
      await ouvrir();
      appuyer(m.racine, '.recette-minuteur');
      expect(m.appelerService).toHaveBeenCalledWith('timer', 'pause',
        { entity_id: 'timer.cuisine' });
      expect(m.appelerService).not.toHaveBeenCalledWith('timer', 'start',
        expect.objectContaining({ entity_id: 'timer.cuisine_2' }));
    });

    // JAMAIS `timer.change` : Home Assistant refuse (`beyond duration`, HTTP 500) tout `change` qui
    // porterait le restant au-delà de la durée du dernier `start` — piège déjà payé dans ce projet.
    it('un appui sur un minuteur EN PAUSE le reprend par timer.start recalculé', async () => {
      const m = await monterAvecTag();
      await m.pousser('input_text.minuteur_cuisine_nom', 'Pâtes', {});
      await m.pousser('timer.cuisine', 'paused', { remaining: '0:03:20', duration: '0:10:00' });
      await ouvrir();
      appuyer(m.racine, '.recette-minuteur');
      expect(m.appelerService).toHaveBeenCalledWith('timer', 'start',
        { entity_id: 'timer.cuisine', duration: '00:03:20' });
      expect(m.appelerService).not.toHaveBeenCalledWith('timer', 'change', expect.anything());
    });
  });

  describe('panneau ingrédients', () => {
    it('affiche le plan de décrément, en lecture', async () => {
      const m = await monterCuisine({ commandes: commandes(
        DEUX_ETAPES(), APERCU([ligne('Lentilles', '200 g')])) });
      await ouvrir();
      appuyer(m.racine, '.recette-ingredients');
      await vider();
      expect(m.racine.textContent).toContain('Lentilles');
      expect(m.racine.textContent).toContain('200 g');
      expect(m.racine.querySelectorAll('.ing-retirer')).toHaveLength(0);
    });

    it('signale un ingrédient manquant à partir du statut de sa ligne', async () => {
      // `blocking` est une liste de MOTIFS (`["short"]`), jamais d'ingrédients : la mention se
      // pose sur la ligne qui porte `status: 'short'`, la seule qui sait de qui on parle.
      const m = await monterCuisine({ commandes: commandes(
        DEUX_ETAPES(),
        { ...APERCU([ligne('Feta', '100 g', 'short')]), blocking: ['short'] }) });
      await ouvrir();
      appuyer(m.racine, '.recette-ingredients');
      await vider();
      expect(m.racine.querySelector('.ing-stock.manque')?.textContent).toContain('manquant');
    });

    it("n'envoie AUCUNE commande à l'ouverture du panneau", async () => {
      // Le plan de décrément a été demandé UNE FOIS à l'ouverture de la vue, et il ne bouge pas
      // pendant qu'on cuisine.
      const m = await monterCuisine();
      await ouvrir();
      const avant = envoyees(m).length;
      appuyer(m.racine, '.recette-ingredients');
      await vider();
      expect(envoyees(m)).toHaveLength(avant);
    });

    // La rangée de flèches est PARTAGÉE (`rendu/recette.ts`) : panneau ouvert, elle pagine les
    // ingrédients, pas les étapes. Deux index distincts à porter ici — un seul les mélangerait.
    it('les flèches paginent les ingrédients quand le panneau est ouvert, jamais les étapes', async () => {
      const cinq = [1, 2, 3, 4, 5].map((n) => ligne(`Produit ${n}`, '1 g'));
      const m = await monterCuisine({ commandes: commandes(DEUX_ETAPES(), APERCU(cinq)) });
      await ouvrir();
      appuyer(m.racine, '.recette-ingredients');
      await vider();
      expect(m.racine.querySelector('.recette-pages')?.textContent).toBe('1/2');
      appuyer(m.racine, '.recette-suiv');
      await vider();
      expect(m.racine.querySelector('.recette-pages')?.textContent).toBe('2/2');
      expect(m.racine.textContent).toContain('Produit 5');

      // L'étape, elle, n'a pas bougé : on retrouve la page 1 en refermant le panneau.
      appuyer(m.racine, '.ing-fermer');
      await vider();
      expect(m.racine.querySelector('.recette-pages')?.textContent).toBe('1/2');
    });

    // Jeton de course : deux ouvertures peuvent se croiser (« Terminer » puis réouverture pendant
    // que les lectures de la précédente pendent). Sans jeton, la réponse la plus ANCIENNE, arrivée
    // en dernier, écraserait la vue avec les données d'une recette qui n'est plus affichée.
    it('ignore la réponse d une lecture périmée, même arrivée après la plus récente', async () => {
      const resolveurs: ((v: unknown) => void)[] = [];
      const m = await monterCuisine({ commandes: {
        ...commandes(),
        'home_stock/meal/preview': () => new Promise((r) => { resolveurs.push(r); }),
      } });
      await ouvrir();
      expect(resolveurs).toHaveLength(1);
      // On termine (deux appuis) puis on rouvre : la première lecture reste en vol.
      appuyer(m.racine, '.recette-terminer');
      await vider();
      appuyer(m.racine, '.recette-terminer');
      await vider();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await vider();
      await ouvrir();
      expect(resolveurs).toHaveLength(2);

      resolveurs[1]!(APERCU([ligne('Nouvel ingrédient')]));
      await vider();
      resolveurs[0]!(APERCU([ligne('Ancien ingrédient')]));
      await vider();
      appuyer(m.racine, '.recette-ingredients');
      await vider();
      expect(m.racine.textContent).toContain('Nouvel ingrédient');
      expect(m.racine.textContent).not.toContain('Ancien ingrédient');
    });
  });

  // --- Persistance et reprise ---
  //
  // Android tue régulièrement Fully sur ces Fire 7 — au redémarrage, une recette en cours non
  // périmée doit revenir avec SON étape, sinon perdre l'app au milieu d'une cuisson coûte l'étape,
  // exactement ce que ce lot existe pour éviter.

  const stockageAvecEtape = (majLe: number) => ({
    getItem: (cle: string) => (cle === CLE_RECETTE
      ? JSON.stringify({ uid: '139', page: 1, majLe })
      : JSON.stringify(jetons)),
    setItem: vi.fn(), removeItem: vi.fn(),
  }) as any;

  it('restaure l étape en cours au premier état du capteur', async () => {
    const m = await monterCuisine({ stockage: stockageAvecEtape(MIDI().getTime() - 60_000) });
    // Sur l'accueil : le bloc RÉDUIT, pas le repas suivant — la recette est toujours « en cours ».
    expect(m.racine.textContent).toContain('Étape 2/2');
    expect(m.racine.textContent).not.toContain('Dîner');
  });

  // Un capteur muet AU MONTAGE ne doit pas consommer la reprise : au démarrage d'une tablette, les
  // entités mettent ~70 s à revenir, et perdre l'étape pour ça serait perdre une cuisson.
  it('reprend l étape au premier état reçu, même si le capteur était muet au démarrage', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, {
      maintenant: MIDI, commandes: commandes(),
      stockage: stockageAvecEtape(MIDI().getTime() - 60_000),
      etats: [['sensor.home_stock_next_meal', 'unavailable', {}]],
    });
    expect(m.racine.textContent).not.toContain('Étape');

    await m.pousser(...REPAS[0]);
    await vider();
    expect(m.racine.textContent).toContain('Étape 2/2');
  });

  // Symétrique du précédent : un état périmé (plus de 4 h, `PEREMPTION_MS`) n'est pas une recette
  // en cours, c'est un écran resté allumé sur le dîner de la veille.
  it('ignore une étape périmée et repart du repas suivant', async () => {
    const m = await monterCuisine({ stockage: stockageAvecEtape(MIDI().getTime() - 5 * 3_600_000) });
    expect(m.racine.textContent).toContain('Dîner');
    expect(m.racine.textContent).not.toContain('Étape');
  });

  // Redémarrage PENDANT que la vue était ouverte : aucun `hashchange` n'a lieu au chargement d'une
  // page dont le hash est déjà posé. Sans reprise ici, l'écran resterait sur l'accueil avec un
  // `#recette` collé au hash — et le bloc ne pourrait même plus rouvrir la recette (reposer le
  // même hash n'émet aucun événement) : un contact mort, ce que ce projet traque partout.
  it('reprend la vue au chargement quand le hash est déjà #recette, et ne laisse jamais un hash mort', async () => {
    location.hash = '#recette';
    const avec = await monterCuisine();
    expect(avec.racine.querySelector('[data-mvt="vue:recette"]')).not.toBeNull();

    // Rien à ouvrir (aucun repas planifié) : le hash est nettoyé plutôt que laissé sur une vue
    // impossible.
    location.hash = '#recette';
    const sans = await monterDemarrage(ECRANS.cuisine, {
      maintenant: MIDI,
      etats: [['sensor.home_stock_next_meal', '', { day: null, slot: null }]],
    });
    await vider();
    expect(sans.racine.querySelector('[data-mvt="vue:recette"]')).toBeNull();
    expect(location.hash).toBe('');
  });

  // Un composant plus ancien que ce bundle ne publie pas `meal_id` : la recette reste consultable,
  // elle n'est simplement pas validable — et on ne demande pas un aperçu qu'on ne pourrait pas
  // obtenir.
  it('sans meal_id : la recette s ouvre, aucun meal/preview, « Terminer » ferme sans valider', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, {
      maintenant: MIDI, commandes: commandes(),
      etats: [['sensor.home_stock_next_meal', 'Bol lentilles',
               { day: '2026-08-17', slot: 'dinner', recipe_id: 76 }]],
    });
    await ouvrir();
    expect(m.racine.querySelector('[data-mvt="vue:recette"]')).not.toBeNull();
    expect(envoyees(m).map((c) => c.type)).toEqual(['home_stock/recipe/get']);
    appuyer(m.racine, '.recette-terminer');
    await vider();
    expect(envoyees(m).map((c) => c.type)).not.toContain('home_stock/meal/validate');
    expect(location.hash).toBe('');
  });
});
