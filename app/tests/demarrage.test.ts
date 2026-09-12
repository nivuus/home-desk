// @vitest-environment jsdom
//
// Seul fichier de test qui a besoin d'un vrai DOM : `demarrer()` appelle `render()` (lit) sur
// un élément et bascule des classes CSS dessus. Le reste de la suite tourne en environnement
// `node` (par défaut), plus rapide — ce docblock ne change l'environnement que pour ce fichier.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { demarrer } from '../src/demarrage';
import { niveauDemande } from '../src/mouvement';
import { Connexion } from '../src/connexion';
import type { Ecran } from '../src/ecran';
import type { EvenementEtat } from '../src/connexion';
// Tâche 12 : le double de connexion, les stockages et la pièce vide vivent désormais dans
// `tests/aides.ts`, partagés avec `tests/orchestration.test.ts` — déplacés sans une ligne de
// changement, cette suite doit rester verte à l'identique.
import {
  connexionFactice, ecranVide as piece, stockageAvecSession, stockageSansSession,
  monterDemarrage, restaurerReseau, vider,
} from './aides';
import { ECRANS } from '../src/ecran';

describe('demarrer', () => {
  it('sans session ouverte sur la tablette, affiche le message de session plutôt qu une page vide', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, piece, { stockage: stockageSansSession });
    expect(racine.textContent).toContain('Session');
    expect(racine.textContent).toContain('connecte-toi');
  });

  // Ronde de correction 1 (CRITIQUE) : avant ce correctif, un `connecter()` qui rejette (jeton
  // de rafraîchissement révoqué, ou simple coupure Wi-Fi — le serveur HA est aussi le point
  // d'accès de la maison) ne déclenchait aucun `render()` : `#app` restait vide, sans le
  // moindre message. `void demarrer()` en tête de fichier avalait le rejet silencieusement.
  it('si la connexion échoue au démarrage, affiche un écran d erreur — jamais une page vide', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => connexionFactice('echec'),
      minuteurFn: vi.fn() as any,   // on ne veut pas qu une vraie nouvelle tentative parte ici
    });

    expect(racine.innerHTML.trim()).not.toBe('');
    expect(racine.textContent).toContain('Connexion impossible');
    expect(racine.textContent).not.toContain('Session');   // pas confondu avec l écran « pas de jeton »
  });

  it('programme une nouvelle tentative après échec, avec le repli exponentiel de delaiReconnexion', async () => {
    const racine = document.createElement('div');
    const minuteurFn = vi.fn();
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => connexionFactice('echec'),
      minuteurFn: minuteurFn as any,
    });

    expect(minuteurFn).toHaveBeenCalledTimes(1);
    const [rappel, delai] = minuteurFn.mock.calls[0];
    expect(delai).toBe(1000);   // delaiReconnexion(0)
    expect(typeof rappel).toBe('function');
  });

  it('une nouvelle tentative qui réussit efface l écran d erreur et dessine le bandeau', async () => {
    const racine = document.createElement('div');
    const minuteurFn = vi.fn();
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => connexionFactice('echec', 'succes'),
      intervalFn: vi.fn() as any,
      minuteurFn: minuteurFn as any,
      maintenant: () => new Date(2026, 7, 1, 10, 30),
    });
    expect(racine.textContent).toContain('Connexion impossible');

    // On déclenche nous-mêmes la tentative programmée, sans attendre le vrai délai.
    const rappelProgramme = minuteurFn.mock.calls[0][0] as () => void;
    await rappelProgramme();

    expect(racine.textContent).not.toContain('Connexion impossible');
    expect(racine.querySelector('.heure')?.textContent).toBe('10:30');
  });

  // Tâche 20 : correctif de la bande sombre visible sous la page sur les trois tablettes —
  // `html`/`body` (fond de secours de `base.css`) ne pouvaient jusqu'ici jamais suivre l'ambiance
  // (jour/soir/nuit) de `#app`, `.m3`/`.sombre` étant scopées à `racine`, un DESCENDANT dont les
  // propriétés personnalisées CSS n'héritent jamais vers ses ancêtres. Vérifié ici plutôt que
  // supposé (cf. règle 6 du contexte) : sans le miroir posé dans `demarrer()`, ce test rougirait,
  // `document.documentElement` ne portant alors ni `.m3` ni `.sombre`.
  it('pose .m3 sur <html> et y reflète .sombre en pleine nuit, en plus de racine', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => connexionFactice('succes'),
      intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 2, 0),   // 2 h du matin : nuit, cf. momentDuJour
    });

    expect(document.documentElement.classList.contains('m3')).toBe(true);
    expect(racine.classList.contains('sombre')).toBe(true);
    expect(document.documentElement.classList.contains('sombre')).toBe(true);
  });

  // Complément du test ci-dessus : le miroir doit aussi RETIRER `.sombre` de `<html>` en plein
  // jour, exactement comme sur `racine` — sans quoi une tablette qui bascule de la nuit au jour
  // garderait un fond sombre figé sous la page. Écrit après le test « nuit » ci-dessus, dans le
  // même fichier (un seul `document` jsdom partagé par tout le fichier, cf. l'en-tête) : il prouve
  // aussi qu'aucune classe ne fuit d'un test au suivant, pas seulement que `.sombre` peut être
  // posée.
  it('retire .sombre de <html> en plein jour, sans fuite depuis le test précédent', async () => {
    const racine = document.createElement('div');
    let emettre: ((e: EvenementEtat) => void) | undefined;
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
      maintenant: () => new Date(2026, 7, 1, 14, 0),   // 14 h, soleil levé plus bas -> jour
    });
    emettre!({ entity_id: 'sun.sun', state: 'above_horizon', attributes: {} });
    await vider();

    expect(racine.classList.contains('sombre')).toBe(false);
    expect(document.documentElement.classList.contains('sombre')).toBe(false);
    expect(document.documentElement.classList.contains('m3')).toBe(true);
  });

  // I4 (revue finale) — LA PALETTE NE SE BASCULE QU'UNE FOIS PAR ÉTAT, PAS DEUX FOIS PAR PEINTURE.
  // `dessiner()` appelait `basculerPalette(moment !== 'jour')` en tête, puis
  // `basculerPalette(true)` en mode cinéma, 129 lignes plus bas et sans `return` entre les deux.
  // En journée pendant un film, la garde interne `sombreCourant` ne tenait donc JAMAIS : chaque
  // redessin retirait `.sombre` puis la remettait, reposait `.fondu-palette` sur `<html>` et
  // `#app`, et armait DEUX minuteurs de 600 ms. Aucun flash visible (les deux bascules tombent
  // dans la même tâche JS), mais deux recalculs de style de tout l'arbre par peinture — et
  // surtout `.fondu-palette *` armée en quasi-permanence, c'est-à-dire la transition de couleur
  // PERMANENTE que `base.css` s'interdit explicitement. Ce test compte les fondus armés : sans la
  // fusion des deux appels, il en verrait deux de plus à chaque état poussé.
  it('en plein jour pendant un film, la palette ne se rebascule pas à chaque peinture', async () => {
    const { racine, pousser } = await monterDemarrage(ECRANS.salon);
    await pousser('sun.sun', 'above_horizon');                       // plein jour
    await pousser('media_player.televiseur_salon_3', 'on');           // écran allumé → mode cinéma
    expect(racine.classList.contains('sombre')).toBe(true);     // le film gagne sur le jour

    // Compté APRÈS que l'état « jour + film » est atteint : ce qui doit être nul, ce sont les
    // bascules SUIVANTES. `basculerPalette` est le seul écrivain de `.sombre` sur `racine`.
    const bascules = vi.spyOn(racine.classList, 'toggle');
    // Trois rafales de plus, telles qu'une soirée entière en produit par minute.
    await pousser('media_player.televiseur_salon_3', 'on');
    await pousser('sensor.capteur_humain_temperature', '21');
    await pousser('media_player.televiseur_salon_3', 'on');

    expect(bascules.mock.calls.filter(([classe]) => classe === 'sombre')).toEqual([]);
    expect(racine.classList.contains('sombre')).toBe(true);
    bascules.mockRestore();
  });

  // Ronde de correction 2 (CRITIQUE, récidive) : `creerConnexion` était appelé à chaque
  // tentative, donc une nouvelle instance de `Connexion` à chaque échec. `connecter()` arme un
  // `setInterval` de surveillance du silence *avant* la ligne qui peut lever (`rafraichir()`) ;
  // la garde `silenceArme` de la tâche 3 protège une instance contre un double armement, mais
  // rien ne protégeait contre des instances neuves — chaque tentative échouée laissait un
  // minuteur tourner pour toujours sur une instance abandonnée. Lors d'une coupure Wi-Fi
  // prolongée (repli plafonné à 30 s), ça fait près de 2 900 minuteurs par jour sur une
  // tablette à 130 Mo de libre. Ce test utilise la vraie classe `Connexion` (pas le double
  // `ConnexionLike` des autres tests, qui ne pose aucun minuteur et ne peut donc pas prouver la
  // fuite) avec un `fetchFn` qui refuse systématiquement le rafraîchissement, pour forcer
  // plusieurs tentatives échouées de suite.
  it('plusieurs tentatives échouées de suite ne posent qu un seul minuteur de silence (pas de fuite)', async () => {
    const racine = document.createElement('div');
    const intervalFn = vi.fn();
    const minuteurFn = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }),
    }) as any;
    // `expires: 0` : toujours considéré périmé, donc `rafraichir()` — et son échec — se
    // déclenchent à chaque tentative, sans dépendre de l'horloge réelle.
    const jetonsPerimes = { access_token: 'a', refresh_token: 'r', expires: 0, clientId: 'c' };
    const stockage = { getItem: () => JSON.stringify(jetonsPerimes), setItem: vi.fn() } as any;

    class FauxWebSocket {
      onmessage: ((ev: any) => void) | null = null;
      onclose: (() => void) | null = null;
      send() {}
      constructor(public url: string) {}
    }

    await demarrer(racine, piece, {
      stockage,
      creerConnexion: (j) => new Connexion(j, {
        fetchFn, intervalFn: intervalFn as any, stockage,
        origineWs: 'ws://test', WebSocketImpl: FauxWebSocket as any,
      }),
      minuteurFn: minuteurFn as any,
    });

    // Six tentatives programmées de plus, déclenchées à la main sans attendre les délais réels
    // (6 plutôt que 5 : la dernière valeur de `delaiReconnexion` atteint déjà le plafond de
    // 30 s à l'essai précédent — il en faut une de plus pour observer le plafond *répété*,
    // pas seulement atteint une fois).
    for (let i = 0; i < 6; i++) {
      const dernierRappel = minuteurFn.mock.calls[minuteurFn.mock.calls.length - 1][0] as () => Promise<void>;
      await dernierRappel();
    }

    expect(minuteurFn).toHaveBeenCalledTimes(7);   // 1 tentative initiale + 6 relances, toutes en échec
    expect(fetchFn).toHaveBeenCalledTimes(7);      // une tentative de rafraîchissement par essai
    expect(intervalFn).toHaveBeenCalledTimes(1);   // un seul minuteur de silence, jamais réarmé
    expect(racine.textContent).toContain('Connexion impossible');   // toujours pas de page vide

    // Ronde de correction 3 (point mineur) : la progression des délais n'était affirmée que
    // pour le tout premier essai ailleurs dans ce fichier. Ici, sur une vraie série d'échecs :
    // ça croît (1 s → 2 s → 4 s → 8 s → 16 s → 30 s) puis ça plafonne (30 s de nouveau au
    // septième essai, pas 60 s) — exactement `delaiReconnexion(0..6)`, déjà couvert
    // isolément dans `connexion.test.ts` mais jamais exercé ici en conditions réelles de retry.
    const delais = minuteurFn.mock.calls.map(([, delai]) => delai);
    expect(delais).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  // Ronde de correction 3 (IMPORTANT) : `creerConnexion`, `cx.surChangement(...)` et
  // `etat.surMaj(...)` s'exécutaient hors de tout `try/catch` dans `demarrer()`. Si l'un des
  // trois lève — la fabrique par défaut ne le fait jamais en pratique, mais rien ne l'interdit
  // à un `creerConnexion` injecté, et le docblock de `demarrer()` promettait à tort qu'il ne
  // lève jamais — le rejet n'était rattrapé nulle part : `index.ts` appelle `demarrer()` en
  // oublie-et-continue, donc `#app` restait vide. Exactement la classe de bug de la ronde 1,
  // revenue trois lignes plus haut. Ce test force `creerConnexion` à lever pour le prouver.
  it('si l initialisation (creerConnexion) lève, affiche un écran d erreur — jamais une page vide', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, piece, {
      stockage: stockageAvecSession,
      creerConnexion: () => { throw new Error('globale absente ou fabrique cassée'); },
      minuteurFn: vi.fn() as any,
    });

    expect(racine.innerHTML.trim()).not.toBe('');
    expect(racine.textContent).toContain('Connexion impossible');
    expect(racine.textContent).not.toContain('Session');
  });

  // Tâche 7 (câblage) : `tests/interaction.test.ts` prouve que `creerAppui` est correct pris
  // isolément, mais rien n'y prouve qu'il est réellement branché sur les tuiles rendues par
  // l'application — c'est exactement la classe de défaut qu'un test unitaire de la seule
  // fonction ne peut pas voir (le brief l'illustrait dans `index.ts`, où `etat`/`cx` n'existent
  // pas ; voir le commentaire dans `demarrage.ts`). Ce test simule un vrai appui sur la tuile DOM
  // rendue par `demarrer()` et vérifie de bout en bout : le service HA est appelé avec les bons
  // arguments, et la tuile prend la classe `actif`, sans attendre aucune réponse de HA (rien ici
  // ne fait avancer de promesse entre le geste et l'assertion).
  //
  // Tâche 13 (mise à jour) : `light.lumiere_salon` porte désormais une jauge de luminosité
  // (`descripteurJauge`, `jauge.ts`) — sur une tuile à jauge, la bascule ne part plus au contact
  // mais au relâchement, SI le doigt n'a pas dépassé le seuil de glissement entre-temps (cf.
  // `geste.ts`). Un `pointerdown` suivi d'un `pointerup` SANS aucun `pointermove` reproduit
  // exactement ce cas (un vrai tap, doigt immobile) : `enReglage` reste `false`, la bascule part
  // donc bien au `pointerup`, encore sans attendre HA — seul le moment exact du test a changé,
  // pas ce qu'il prouve.
  it('un appui sur une commande rendue appelle le service et repeint la tuile en actif, immédiatement', async () => {
    const racine = document.createElement('div');
    const pieceLumiere: Ecran = {
      nom: 'Salon', temperature: 'sensor.capteur_humain_temperature',
      ambiances: [],
      commandes: [{ libelle: 'Lumières', icone: 'bulb', entite: 'light.lumiere_salon',
                    service: ['light', 'toggle'] }],
      synthese: [],
      extrasMaison: [],
      sources: [], ouvrants: [],
    };
    const appelerService = vi.fn();
    let emettre: ((e: EvenementEtat) => void) | undefined;

    await demarrer(racine, pieceLumiere, {
      stockage: stockageAvecSession,
      creerConnexion: () => ({
        connecter: () => Promise.resolve(),
        surChangement: (cb) => { emettre = cb; },
        appelerService,
        surSilence: (_cb: (ms: number) => void) => {},
        listerTaches: async () => [],
      envoyerCommande: async () => { throw new Error('websocket indisponible'); },
      }),
      intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 10, 30),
    });
    // Simule l'arrivée de l'état initial (comme le ferait le `get_states` du vrai websocket).
    emettre!({ entity_id: 'light.lumiere_salon', state: 'off', attributes: {} });
    await vider();

    const tuileAvant = racine.querySelector('.commande')!;
    expect(tuileAvant.className).not.toContain('actif');

    tuileAvant.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    // Tâche 13 : la bascule (tuile à jauge) part au relâchement, pas au contact — cf. commentaire
    // ci-dessus. Aucun `pointermove` entre les deux : le doigt n'a jamais bougé, c'est un appui.
    tuileAvant.dispatchEvent(new Event('pointerup', { bubbles: true }));

    expect(appelerService).toHaveBeenCalledWith('light', 'toggle', { entity_id: 'light.lumiere_salon' });
    // `await vider()` depuis la coalescence des redessins (`Etat.notifier`) : l'état optimiste est
    // écrit sur-le-champ, son rendu part à la microtâche suivante — donc toujours AVANT que le
    // navigateur ne peigne la frame, ce qui laisse le retour tactile perceptiblement immédiat.
    await vider();
    const tuileApres = racine.querySelector('.commande')!;
    expect(tuileApres.className).toContain('actif');
  });

  // Tâche 8 bis : `alerteActive` (`contexte.ts`) existait et était testée depuis la tâche 2 sans
  // jamais être appelée par `dessiner()` — exactement la classe de défaut qu'un test unitaire de
  // `rendreCorps` seul (cf. tests/corps.test.ts) ne peut pas voir, comme pour l'appui ci-dessus.
  // `vi.setSystemTime` fige `Date.now()` (utilisé À LA FOIS par
  // `Etat.appliquer` pour `changeLe` et par `dernierMouvement` pour « bouge à l'instant ») sur la
  // même valeur que `maintenant()` injecté, pour que les deux horloges ne divergent jamais —
  // sans ça, un `Date.now()` réel très éloigné de la date fixe utilisée ailleurs dans ce fichier
  // ferait paraître la maison calme depuis « des jours », et l'alerte se replierait aussitôt.
  it('une alerte transitoire prend le premier plan (branchement réel dans dessiner, pas seulement rendreCorps isolé)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 14, 0));
    const fetchOriginal = globalThis.fetch;
    // `chargerMeteo()` avale toute erreur (règle 4 du brief) : un rejet suffit, `demain` reste
    // `undefined`, sans quoi il faudrait aussi mocker `fetch` pour qu'il réponde une prévision.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('réseau indisponible dans ce test')) as any;
    try {
      const racine = document.createElement('div');
      let emettre: ((e: EvenementEtat) => void) | undefined;
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
        maintenant: () => new Date(),   // même horloge (figée) que Date.now() ci-dessus
      });

      // Porte déverrouillée (règle transitoire de `alertes.ts` — ronde de correction 1 : la
      // fenêtre a été retirée des règles, cf. `alertes.ts`, elle est ouverte par une automation
      // de la maison elle-même et n'est donc plus une alerte valide) + un capteur de mouvement à
      // `on` : la maison bouge encore, l'alerte reste au premier plan (cf. `alerteActive`).
      emettre!({ entity_id: 'lock.aqara_smart_lock_u200_lite', state: 'unlocked', attributes: {} });
      emettre!({ entity_id: 'binary_sensor.capteur_humain', state: 'on', attributes: {} });
      await vider();

      expect(racine.querySelector('.alerte')?.textContent).toContain('Porte déverrouillée');
      expect(racine.querySelector('.demain')).toBeNull();
      expect(racine.querySelector('.media')).toBeNull();
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.useRealTimers();
    }
  });

  // Tâche 6 (2026-08-02) : deux tests vivaient ici, « sans alerte, un média en cours prend la
  // place du bloc Demain » et « une alerte prend le pas sur un média en cours quand les deux sont
  // actifs à la fois » — ils prouvaient la priorité alerte > `mediaEnCours` dans `dessiner()`.
  // `mediaEnCours` a disparu (cf. `contexte.ts`) : `dessiner()` ne calcule plus jamais de bloc
  // média pour la tête d'écran, la carte média (`rendu/media.ts`) sera rebranchée proprement à la
  // tâche 12 avec le moteur de modes. Les deux tests, qui n'auraient plus rien à distinguer,
  // disparaissent avec elle.

  // Tâche 18 : consultation et cochage d'une tâche, de bout en bout — la ligne de synthèse ouvre
  // la vue, un premier appui l'arme (protection contre un appui accidentel, jamais un appui
  // long), un second la confirme réellement. Comme le test d'appui ci-dessus, ceci vérifie le
  // câblage réel dans `demarrage.ts` : ni `tests/cochage.test.ts` (logique pure) ni
  // `tests/taches.test.ts` (rendu isolé) ne peuvent prouver que les deux sont bien reliés.
  it('la ligne de synthese ouvre la vue Taches ; un appui arme, le second confirme et coche', async () => {
    const racine = document.createElement('div');
    const pieceAvecTaches: Ecran = {
      nom: 'Salon', temperature: 'sensor.capteur_humain_temperature',
      ambiances: [], commandes: [], extrasMaison: [],
      synthese: [
        { entite: 'todo.maintenance', operateur: '>', valeur: 0, texte: '{etat} tâche{s} d\'entretien' },
      ],
      sources: [], ouvrants: [],
    };
    const appelerService = vi.fn();
    await demarrer(racine, pieceAvecTaches, {
      stockage: stockageAvecSession,
      creerConnexion: () => ({
        connecter: () => Promise.resolve(),
        surChangement: () => {},
        appelerService,
        surSilence: (_cb: (ms: number) => void) => {},
        listerTaches: async () => [{ uid: 'u1', texte: 'Changer une pile' }],
        envoyerCommande: async () => { throw new Error('websocket indisponible'); },
      }),
      intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 10, 30),
    });

    racine.querySelector('.synthese')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(location.hash).toBe('#taches');
    // jsdom déclenche son propre `hashchange` de façon asynchrone (une vraie macro-tâche) quand
    // `location.hash` change — trop tard pour de simples micro-tâches (`await Promise.resolve()`)
    // sous timers réels : on le déclenche nous-mêmes, comme le fait déjà `tests/navigation.test.ts`
    // et `tests/pannes.test.ts` (vue Taches hors ligne) pour la même raison.
    window.dispatchEvent(new Event('hashchange'));
    // `chargerTaches()` (déclenché par ce hashchange dans demarrage.ts) résout sur une promesse
    // déjà tenue par le double `listerTaches` ci-dessus : quelques micro-tâches suffisent.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    const ligne = racine.querySelector('.ligne-tache')!;
    expect(ligne.querySelector('.t')?.textContent).toBe('Changer une pile');
    expect(ligne.className).not.toContain('armee');

    ligne.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(appelerService).not.toHaveBeenCalled();   // premier appui : armé, rien envoyé encore
    expect(racine.querySelector('.ligne-tache')!.className).toContain('armee');
    expect(racine.querySelector('.ligne-tache .s')?.textContent).toBe('Toucher pour confirmer');

    racine.querySelector('.ligne-tache')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(appelerService).toHaveBeenCalledWith(
      'todo', 'update_item', { entity_id: 'todo.maintenance', item: 'u1', status: 'completed' },
    );
    // Retrait optimiste immédiat : la tâche cochée disparaît sans attendre un rechargement complet.
    // Tâche 3 (moteur de mouvement) : la vue « Tâches » passe désormais par `moteur.peindre()`, qui
    // clone la ligne sortante dans `#mvt-fantomes` le temps de sa sortie animée — un
    // `racine.querySelector('.ligne-tache')` NU trouverait ce clone (seul survivant de cette
    // classe une fois le vrai contenu réécrit). Scopé à `.taches-liste` (le conteneur RÉEL,
    // jamais cloné lui-même — seule la ligne l'est), la question reste EXACTEMENT celle d'origine :
    // le contenu réellement rendu ne porte plus la ligne, immédiatement, sans attendre l'animation.
    expect(racine.querySelector('.taches-liste .ligne-tache')).toBeNull();
    expect(racine.querySelector('.taches-vide')?.textContent).toBe('Aucune tâche');

    location.hash = '';   // ne contamine pas le prochain test de ce fichier
  });
});

// Revue tâche 16, constat parqué (c) — les trois refus de `tictacProgression` (le tic d'une
// seconde qui fait avancer le rail de progression média, `demarrage.ts`) n'étaient couverts par
// aucun test : ni `mvt-aucun`, ni `document.hidden`, ni « aucune carte média à l'écran ». Chacun
// répète une leçon déjà payée ailleurs dans ce fichier (`mesurer`/`deplacer`, `src/mouvement.ts`)
// pour la même classe de piège — un tic qui continue d'écrire une propriété CSS toutes les
// secondes sur une Fire 7 à 130 Mo de libre, ou sur un élément qui n'existe plus. `intervalFn` est
// déjà injectable (`DependancesDemarrage`) : le tic est le rappel enregistré avec un délai de
// 1000 ms (`PAS_PROGRESSION_MS`, non exporté — 1000 est sans ambiguïté parmi les autres délais
// posés par `tenter()`, cf. `demarrage.ts` : 20 000 pour l'horloge, 900 000 pour météo/agenda).
describe('tictacProgression — les trois refus', () => {
  afterEach(() => { restaurerReseau(); });

  /** Pousse le lecteur musical du salon en lecture, avec une progression exploitable
   *  (`media_position`/`media_duration`/`media_position_updated_at`) : c'est ce qui fait exister
   *  `ancreProgression` avec `avance: true` (cf. `media.ts`), donc une carte `.media` à l'écran ET
   *  un rail que le tic a une vraie raison de faire avancer. */
  const pousserLectureEnCours = async (pousser: (id: string, etat: string, attrs?: Record<string, unknown>) => Promise<void>) => {
    await pousser('media_player.musique_salon', 'playing', {
      media_title: 'Blinding Lights', media_position: 30, media_duration: 200,
      media_position_updated_at: new Date(2026, 7, 1, 13, 59, 50).toISOString(),
      supported_features: 1,
    });
  };

  /** Extrait le rappel du tic parmi tous les `intervalFn` posés par `tenter()` — 1000 ms est le
   *  seul délai de ce fichier qui vaille exactement une seconde. */
  const trouverTic = (intervalFn: ReturnType<typeof vi.fn>): () => void => {
    const appel = intervalFn.mock.calls.find(([, delai]) => delai === 1_000);
    expect(appel, 'tic de progression (delai 1000 ms) introuvable parmi les intervalFn posés').toBeDefined();
    return appel![0] as () => void;
  };

  it('aucune carte média à l\'écran : le tic ne lève pas (pas d\'ancre, rien à faire avancer)', async () => {
    // `ecranVide` (aucune source déclarée) : le mode ne peut jamais être `media`/`cinema`, donc
    // `.media` n'existe jamais dans `racine`. Sans le garde, `carte.style.setProperty` lèverait
    // sur `carte === null` — c'est CE refus que ce test prouve, pas seulement l'absence d'erreur.
    const { racine, intervalFn } = await monterDemarrage(piece);
    expect(racine.querySelector('.media')).toBeNull();
    const tic = trouverTic(intervalFn);
    expect(tic).not.toThrow();
  });

  it('écran éteint (document.hidden) : le tic n\'écrit pas --progression', async () => {
    const { racine, pousser, intervalFn } = await monterDemarrage(ECRANS.salon);
    await pousserLectureEnCours(pousser);
    const carte = racine.querySelector<HTMLElement>('.media');
    expect(carte, 'carte média introuvable — la source doit être en lecture').not.toBeNull();
    const tic = trouverTic(intervalFn);
    const ecrit = vi.spyOn(carte!.style, 'setProperty');

    // Correction (ronde de correction 1, tâche 9) : ce nettoyage restaurait un descripteur sur
    // `Document.prototype` — jamais modifié par la ligne juste en dessous, qui pose `hidden` en
    // propriété PROPRE sur l'instance `document` (seule façon de neutraliser l'accesseur non-
    // configurable de jsdom). `document` est un seul objet jsdom partagé par tout ce fichier de
    // test : la branche `if (original)` restaurait donc un descripteur que personne n'avait
    // touché (code mort — vérifié : `Document.prototype.hidden` a bien un descripteur
    // configurable dans ce jsdom, donc `original` est toujours défini et le `else delete (...)`
    // n'est jamais atteint), en laissant la propriété propre survivre indéfiniment aux tests
    // suivants du fichier. Resté dormant ici par pure coïncidence — la dernière valeur posée par
    // la « contre-épreuve » ci-dessous est `false`, qui se trouve être la valeur par défaut
    // attendue — mais c'est exactement le bug qui a fait rougir la suite « réveil de l'écran de
    // nuit » (tâche 9) une fois `document.hidden` réellement bloqué à `true` par le test jumeau
    // de ce fichier (« ne fait rien quand la page est masquée », `minuteurs de cuisine »). Même
    // correctif : supprimer la propriété propre, jamais tenter de restaurer un descripteur qui
    // n'a jamais bougé.
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      tic();
      expect(ecrit).not.toHaveBeenCalled();

      // Contre-épreuve : écran rallumé, le même tic écrit bien — sans elle, un garde qui ne garde
      // plus rien (ex. une faute de frappe qui l'empêcherait toujours de s'exécuter) passerait
      // aussi silencieusement l'assertion ci-dessus.
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      tic();
      expect(ecrit).toHaveBeenCalledWith('--progression', expect.any(String));
    } finally {
      delete (document as unknown as Record<string, unknown>).hidden;
    }
  });

  // ⚠️ Tâche 15 : ce refus-ci est le SEUL des trois que `tictacMinuteurs` ne partage plus
  // (arbitrage du propriétaire, 2026-08-03). Son pendant contraire est « mouvement=aucun (URL) :
  // le décompte descend QUAND MÊME » (describe `minuteurs de cuisine`, plus bas). Un rail figé ne
  // ment à personne ; un décompte figé, si. Modifier l'un sans l'autre casse un arbitrage, pas
  // une symétrie.
  it('mouvement=aucun (URL) : le tic n\'écrit pas --progression, même carte média affichée', async () => {
    // `niveauDemande` (`src/mouvement.ts`) lit `location.href` une seule fois, à la construction
    // de `demarrer()` — le paramètre doit donc être posé AVANT de monter.
    const avant = location.href;
    window.history.pushState({}, '', '/?mouvement=aucun');
    try {
      const { racine, pousser, intervalFn } = await monterDemarrage(ECRANS.salon);
      await pousserLectureEnCours(pousser);
      const carte = racine.querySelector<HTMLElement>('.media');
      // Le niveau de mouvement ne change JAMAIS quel mode est affiché, seulement s'il s'anime :
      // la carte média reste bien là — c'est justement ce qui rend ce refus nécessaire à tester
      // séparément du précédent (« aucune carte »).
      expect(carte, 'carte média introuvable — la source doit être en lecture').not.toBeNull();
      const tic = trouverTic(intervalFn);
      const ecrit = vi.spyOn(carte!.style, 'setProperty');

      tic();

      expect(ecrit).not.toHaveBeenCalled();
    } finally {
      window.history.pushState({}, '', avant);
    }
  });
});

// Ronde de correction 1 (tâche 8) — CRITIQUE : avant cette ronde, aucun test ne prouvait que
// `niveauInitial` (`demarrage.ts:283`) atteint réellement `creerMoteur` — seul son AUTRE
// consommateur, `tictacProgression` (describe ci-dessus, rail de progression média — un autre
// point de lecture de `niveauDemande`, DISJOINT du moteur), était exercé. `niveauInitial` est le
// SEUL point de câblage entre l'URL/`prefers-reduced-motion` et le moteur : c'est le repli
// d'urgence de la mise en production (Fully Kiosk, tâche 9, réglable en quelques secondes sans
// redéployer). S'il ne marchait pas, rien d'autre dans cette suite ne l'aurait détecté — vérifié
// en retirant `{ niveauInitial }` de l'appel `creerMoteur(racine, ...)` (`demarrage.ts:283`) :
// ce test rougit alors (`animate` appelé), cf. rapport de tâche 8, ronde de correction 1.
//
// Round 2 (tâche 3, 2026-08-22) — CRITIQUE, RÉOUVERT PUIS REFERMÉ : ce test routait par
// `light.lumiere_salon` (rôle `tuile`), qui ne produit plus AUCUN verdict `mutation` depuis le
// retrait du balayage (`data-mvt-etat` n'est plus posé sur la tuile, cf. `rendu/corps.ts`) —
// `anime` restait donc à `not.toHaveBeenCalled()` que `niveauInitial` vaille `aucun` ou pas, sans
// plus rien prouver du câblage. Reroutage sur `weather.maison` (rôle `chiffre:dehors`,
// `rendu/bandeau.ts`), seul rôle de cette page qui produit encore un verdict `mutation` animé
// (`chiffre`/`bloc` restent les deux survivants après la tâche 3, cf. `moteur.ts`).
//
// Revérifié, mais PAS par le même geste que la ronde 1 : retirer `{ niveauInitial }` de l'appel
// (`demarrage.ts:283`) ne suffit plus à faire rougir ce test — `creerMoteur` calcule alors son
// propre repli (`options.niveauInitial ?? …`), qui relit `location.href` exactement comme
// `demarrage.ts` vient de le faire, et retombe donc sur le MÊME `'aucun'` par une voie détournée
// (deux calculs redondants, un seul résultat). Le vrai sabotage — celui qui reproduit une
// régression de câblage sans dépendre de ce repli — est une valeur FIGÉE :
// `creerMoteur(racine, { niveauInitial: 'complet' })`. Avec elle, ce test rougit bien (3 appels à
// `animate` observés — déplacement, sortie et entrée du chiffre), cf. rapport de tâche 3, fix
// round 1.
describe('mouvement=aucun (URL) — câblage du moteur (ronde de correction 1, tâche 8 ; round 2, tâche 3)', () => {
  it('un chiffre qui change de valeur ne produit plus aucune animation', async () => {
    const avantUrl = location.href;
    window.history.pushState({}, '', '/?mouvement=aucun');
    const anime = vi.spyOn(Element.prototype, 'animate');
    try {
      const { pousser } = await monterDemarrage(ECRANS.salon);
      // Un premier `pousser` pose la MARQUE de départ (10°) — sans elle, le second serait la
      // toute première peinture de ce chiffre : une entrée, jamais une mutation (cf. `peindre()`,
      // qui ne compare rien tant que `precedentes` est encore `null`).
      await pousser('weather.maison', 'sunny', { temperature: 10 });
      // Le second change la VALEUR à position et clé égales (`chiffre:dehors`, cf.
      // `rendu/bandeau.ts`) : exactement le verdict `mutation` que `jouer()` anime encore.
      await pousser('weather.maison', 'sunny', { temperature: 15 });
      expect(anime).not.toHaveBeenCalled();
    } finally {
      anime.mockRestore();
      window.history.pushState({}, '', avantUrl);
    }
  });
});

// Tâche 7 (câblage) : les tâches 1 à 6 ont construit la logique pure (`minuteur.ts`), le rendu
// (`rendu/minuteur.ts`), la déclaration des slots (`ecran.ts`) et la priorité du mode
// (`modes.ts`) — mais rien ne les reliait encore. Comme pour l'appui sur une commande ou le
// cochage d'une tâche plus haut dans ce fichier, c'est le seul niveau où l'on peut prouver que
// le geste réel sur le DOM aboutit au bon appel de service `timer.*`.
describe('minuteurs de cuisine', () => {
  const cuisine = ECRANS.cuisine;

  // `monterCuisine()` ne surcharge pas `maintenant` : l'horloge interne de l'écran reste donc
  // celle par défaut de `monterDemarrage` (1er août 2026, 14 h, cf. `tests/aides.ts`), PAS
  // `Date.now()` réel. Un `finishes_at` construit à partir de `Date.now()` (l'horloge MURALE, la
  // seule que `restantPublie`, `src/minuteur.ts`, sait lire) diverge donc de cette horloge interne
  // d'autant de temps que le calendrier réel a avancé depuis cette date fixe — déjà plus de 45 h
  // au moment d'écrire ce test. Même piège, déjà documenté et corrigé plus haut dans ce fichier
  // pour l'alerte transitoire (`vi.setSystemTime`) : ici, plus simple, `finishes_at` est calculé
  // depuis cette même horloge fixe plutôt que depuis l'horloge réelle, ce qui rend le test stable
  // quel que soit le jour où la suite est exécutée.
  const MAINTENANT_FIXE = new Date(2026, 7, 1, 14, 0).getTime();

  async function monterCuisine() {
    const m = await monterDemarrage(cuisine);
    await m.pousser('timer.cuisine', 'idle', {});
    await m.pousser('timer.cuisine_2', 'idle', {});
    await m.pousser('timer.cuisine_3', 'idle', {});
    return m;
  }

  it('rend la tuile d\'entrée sur une pièce qui déclare des minuteurs', async () => {
    const m = await monterCuisine();
    expect(m.racine.querySelector('[data-minuteur-entree]')).not.toBeNull();
  });

  it('n\'en rend aucune sur une pièce qui n\'en déclare pas', async () => {
    const m = await monterDemarrage(ECRANS.salon);
    expect(m.racine.querySelector('[data-minuteur-entree]')).toBeNull();
  });

  // Tâche 10 bis (arbitrage du propriétaire, 2026-08-03) : le réglage mesurait 718 px dans le
  // bloc central (−133 px) — il devient donc une sous-vue plein écran, exactement comme
  // « Toute la maison »/« Tâches » (`#minuteur`, `estSousVue`). Conséquence directe : plus de
  // bandeau, plus de rangée de commandes, plus de ligne de synthèse pendant qu'il est ouvert.
  it('ouvre le réglage en plein écran, pas dans le bloc central', async () => {
    const m = await monterCuisine();
    m.racine.querySelector<HTMLElement>('[data-minuteur-entree]')!
      .dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('#minuteur');
    expect(m.racine.querySelector('.mn-reglage')).not.toBeNull();
    // Tâche 3 (moteur de mouvement) : cette entrée est désormais une TRAVERSÉE de vue — l'accueil
    // sortant est poussé, cloné le temps de son animation dans `#mvt-fantomes` (cf. `moteur.ts`).
    // `vider()` laisse cette animation se conclure (le clone d'`Element.animate` du double de test
    // résout `finished` en une micro-tâche) AVANT de vérifier que le contenu RÉEL ne porte plus
    // rien de l'accueil — sans quoi le clone, seul survivant de ces classes, ferait échouer les
    // trois assertions suivantes alors que la vue réellement rendue est déjà correcte.
    await vider();
    // Plein écran : ni bandeau (`.cap`), ni rangée de commandes, ni ligne de synthèse.
    expect(m.racine.querySelector('.commandes')).toBeNull();
    expect(m.racine.querySelector('.cap')).toBeNull();
    expect(m.racine.querySelector('.synthese')).toBeNull();
    location.hash = '';
  });

  it('règle la durée et l\'étiquette, puis démarre le premier slot libre', async () => {
    const m = await monterCuisine();
    m.racine.querySelector<HTMLElement>('[data-minuteur-entree]')!
      .dispatchEvent(new Event('pointerdown'));

    m.racine.querySelector<HTMLElement>('[data-action="plus"]')!
      .dispatchEvent(new Event('pointerdown'));
    m.racine.querySelectorAll<HTMLElement>('.mn-etiquette')[0]
      .dispatchEvent(new Event('pointerdown'));
    m.racine.querySelector<HTMLElement>('[data-action="demarrer"]')!
      .dispatchEvent(new Event('pointerdown'));

    expect(m.appelerService).toHaveBeenCalledWith('timer', 'start',
      { entity_id: 'timer.cuisine', duration: '00:12:00' });
    expect(m.appelerService).toHaveBeenCalledWith('input_text', 'set_value',
      { entity_id: 'input_text.minuteur_cuisine_nom', value: 'Pâtes' });
    expect(m.appelerService).toHaveBeenCalledWith('input_number', 'set_value',
      { entity_id: 'input_number.duree_minuteur_cuisine', value: 12 });
  });

  it('revient à l\'accueil après avoir démarré', async () => {
    const m = await monterCuisine();
    m.racine.querySelector<HTMLElement>('[data-minuteur-entree]')!
      .dispatchEvent(new Event('pointerdown'));
    m.racine.querySelector<HTMLElement>('[data-action="demarrer"]')!
      .dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).toHaveBeenCalledWith('timer', 'start',
      { entity_id: 'timer.cuisine', duration: '00:07:00' });
    expect(location.hash).toBe('');
  });

  // Le bouton « Nouveau » (liste, au moins deux minuteurs déjà actifs) ouvre le MÊME écran plein
  // que la tuile d'entrée de la rangée « Ambiance » — les deux appellent `actions.ouvrir()`.
  it('« Nouveau » ouvre le même écran plein', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 60_000).toISOString() });
    await m.pousser('timer.cuisine_2', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 60_000).toISOString() });
    m.racine.querySelector<HTMLElement>('[data-action="nouveau"]')!
      .dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('#minuteur');
    location.hash = '';
  });

  // Tâche 10 bis, remplaçant du garde-fou `if (reglageMinuteur && !slotLibre) reglageMinuteur =
  // false` (supprimé avec l'état local) : si le dernier emplacement se remplit PENDANT que la
  // sous-vue reste ouverte (minuteur vocal), `ouvrir()` n'aurait de toute façon pas pu s'ouvrir à
  // cet instant, et `demarrer()` refuse déjà tout seul (`premierSlotLibre === null`). Aucun appel
  // de service ne doit en sortir.
  it('« Démarrer » ne fait rien si le dernier emplacement se remplit pendant que le réglage est ouvert', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 60_000).toISOString() });
    await m.pousser('timer.cuisine_2', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 60_000).toISOString() });
    m.racine.querySelector<HTMLElement>('[data-action="nouveau"]')!
      .dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('#minuteur');

    await m.pousser('timer.cuisine_3', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 60_000).toISOString() });
    m.racine.querySelector<HTMLElement>('[data-action="demarrer"]')!
      .dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).not.toHaveBeenCalledWith('timer', 'start', expect.anything());
    location.hash = '';
  });

  it('ne rend aucune commande pendant qu\'un minuteur tourne', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 60_000).toISOString() });
    expect(m.racine.querySelectorAll('.commande')).toHaveLength(0);
    expect(m.racine.querySelector('.minuteurs')).not.toBeNull();
  });

  it('affiche le décompte dès qu\'un minuteur tourne, et le retire à la fin', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 300_000).toISOString() });
    expect(m.racine.querySelector('.minuteurs')).not.toBeNull();
    await m.pousser('timer.cuisine', 'idle', {});
    expect(m.racine.querySelector('.minuteurs')).toBeNull();
    expect(m.racine.querySelector('.prevision, .corps')).not.toBeNull();
  });

  it('rallonge par timer.start avec une durée recalculée, jamais timer.change', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 300_000).toISOString() });
    m.racine.querySelector<HTMLElement>('[data-action="plus"]')!
      .dispatchEvent(new Event('pointerdown'));
    // 300 s restantes + 300 s = 10 min. `timer.change` échouerait ici côté HA (relevé en tâche 1).
    expect(m.appelerService).toHaveBeenCalledWith('timer', 'start',
      { entity_id: 'timer.cuisine', duration: '00:10:00' });
    expect(m.appelerService).not.toHaveBeenCalledWith('timer', 'change', expect.anything());
  });

  // Tâche 10 bis : la fermeture après 45 s d'inactivité n'est plus un mécanisme propre au
  // réglage (`armerFermetureReglage`, supprimé) — c'est désormais le retour automatique GÉNÉRIQUE
  // des sous-vues (`estSousVue`/`armerRetour`), déjà prouvé pour `#maison`/`#taches` et étendu à
  // `#minuteur` par `tests/navigation.test.ts`. Un test qui le re-prouverait ici ne ferait que
  // rejouer le même mécanisme sous un autre nom.

  // Ronde de correction 1 (revue du coordinateur) : `ancresMinuteurs` était posée APRÈS les trois
  // retours anticipés de `dessiner()` (nuit, « Toute la maison », « Tâches ») — jamais recalculée
  // sur ces trois chemins, donc figée sur la dernière carte d'un rendu « normal » alors que le bloc
  // des minuteurs a disparu du DOM.
  //
  // Tâche 8 : le pont `__ancresMinuteurs` qui servait à observer cette carte de l'extérieur (avant
  // que quoi que ce soit ne la consulte) est retiré — son propre lecteur, le tic d'une seconde,
  // rend la preuve observable directement dans le DOM, la vraie preuve : `.minuteurs` disparaît, et
  // le tic appelé APRÈS ce changement de vue ne lève pas et ne réintroduit aucun temps (branche
  // défensive de `tictacMinuteurs` — le bloc a changé entre deux tics, cf. son commentaire).
  it('vide la carte des ancres de minuteur en sortant vers une sous-vue', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 300_000).toISOString() });
    expect(m.racine.querySelector('.minuteurs')).not.toBeNull();

    location.hash = '#maison';
    window.dispatchEvent(new Event('hashchange'));
    // Tâche 3 : traversée de vue accueil → « Toute la maison » — même raison qu'au test « ouvre le
    // réglage en plein écran » ci-dessus, l'accueil sortant (minuteur compris) survit le temps
    // d'une micro-tâche dans `#mvt-fantomes`.
    await vider();
    expect(m.racine.querySelector('.minuteurs')).toBeNull();

    const tic = m.intervalFn.mock.calls.filter((c: any[]) => c[1] === 1000).map((c: any[]) => c[0]);
    expect(() => { for (const t of tic) t(); }).not.toThrow();
    expect(m.racine.querySelector('.mn-temps')).toBeNull();

    location.hash = '';   // ne contamine pas le prochain test de ce fichier
  });

  // Ronde de correction 1 (revue du coordinateur) : `!slotLibre` seul confondait « saturé » (trois
  // minuteurs en cours) et « aucun état `timer.*` encore connu » (chargement de la page, silence
  // après un redémarrage HA) sous la même apparence grisée/inerte — un bouton dont l'inertie ne
  // s'explique pas est le bouton mort que ce projet traque partout. `monterCuisine()` pousse
  // volontairement les trois `idle` d'emblée (aucun des autres tests ne voit donc ce troisième
  // état) : celui-ci monte la pièce SANS pousser aucun état de `timer.*`.
  it('la tuile reste normale tant qu\'aucun état de minuteur n\'est encore connu (pas encore saturée)', async () => {
    const m = await monterDemarrage(cuisine);
    const tuile = m.racine.querySelector<HTMLElement>('[data-minuteur-entree]')!;
    expect(tuile).not.toBeNull();
    expect(tuile.className).not.toContain('inactif');
  });

  it('pause un minuteur en marche', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 300_000).toISOString() });
    m.racine.querySelector<HTMLElement>('[data-action="marche"]')!
      .dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).toHaveBeenCalledWith('timer', 'pause', { entity_id: 'timer.cuisine' });
  });

  // `reprendre` est le seul appel de ce fichier dont la justesse tient à l'ABSENCE d'un argument :
  // `timer.start` SANS `duration` reprend un minuteur en pause là où il s'était arrêté ; avec une
  // `duration`, HA le relancerait de zéro. Une régression qui ajouterait `{ duration: … }` par
  // symétrie avec `demarrer`/`ajuster` (qui, eux, EN passent une) romprait ce comportement sans
  // qu'aucun autre test ne le voie.
  it('reprend un minuteur en pause SANS repartir de zéro (aucune duration)', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'paused', { remaining: '00:02:00' });
    m.racine.querySelector<HTMLElement>('[data-action="marche"]')!
      .dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).toHaveBeenCalledWith('timer', 'start', { entity_id: 'timer.cuisine' });
  });

  it('annule un minuteur', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 300_000).toISOString() });
    m.racine.querySelector<HTMLElement>('[data-action="annuler"]')!
      .dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).toHaveBeenCalledWith('timer', 'cancel', { entity_id: 'timer.cuisine' });
  });

  // `fermer` n'a AUCUN point d'entrée DOM aujourd'hui : `rendreReglageMinuteur` (`rendu/minuteur.ts`,
  // gelé à 149 lignes/6 fonctions depuis la revue de tâche 6, cf. brief) ne l'appelle nulle part —
  // seule la fermeture temporisée des 45 s (déjà testée plus haut) referme réellement le réglage
  // dans ce fichier. Un test qui « couvrirait » `fermer` ici ne ferait donc que rejouer ce même
  // mécanisme sous un autre nom, sans jamais passer par `actions.fermer()` : ça resterait vert même
  // si son corps était vidé. Signalé tel quel au rapport plutôt que fabriquer un test complaisant.

  // Tâche 8 : le tic d'une seconde qui fait DESCENDRE le décompte entre deux redessins — Home
  // Assistant ne republie `timer.cuisine` qu'à ses changements d'état, jamais seconde par
  // seconde. `finishes_at` est calculé depuis `MAINTENANT_FIXE` (l'horloge injectée à
  // `monterDemarrage`, cf. plus haut), jamais `Date.now()` réel — même piège déjà documenté pour
  // les autres tests de ce describe : un `finishes_at` calé sur l'horloge murale réelle
  // diverge de l'horloge fixe de plusieurs dizaines d'heures, et `restantS` initial serait alors
  // n'importe quoi plutôt que les 300 s attendues.
  it('fait descendre le temps sans redessiner', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 300_000).toISOString() });
    const avant = m.racine.querySelector('.mn-temps')!.textContent;

    const tic = m.intervalFn.mock.calls.filter((c: any[]) => c[1] === 1000).map((c: any[]) => c[0]);
    expect(tic.length).toBeGreaterThan(0);
    const depart = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(depart + 10_000);
    for (const t of tic) t();

    expect(m.racine.querySelector('.mn-temps')!.textContent).not.toBe(avant);
    expect(m.racine.querySelector('.mn-temps')!.textContent).toBe('04:50');
    vi.mocked(performance.now).mockRestore();
  });

  it('ne touche à rien quand le minuteur est en pause', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'paused', { remaining: '0:05:00' });
    const tic = m.intervalFn.mock.calls.filter((c: any[]) => c[1] === 1000).map((c: any[]) => c[0]);
    const depart = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(depart + 30_000);
    for (const t of tic) t();
    expect(m.racine.querySelector('.mn-temps')!.textContent).toBe('05:00');
    vi.mocked(performance.now).mockRestore();
  });

  // Tâche 15 (arbitrage du propriétaire, 2026-08-03) — LE PENDANT EXACT, ET VOLONTAIREMENT
  // CONTRAIRE, DE « mouvement=aucun (URL) : le tic n'écrit pas --progression » (describe
  // `tictacProgression — les trois refus`, plus haut dans ce fichier). Les deux tics partageaient
  // ce refus ; le décompte ne le partage plus. La parité que ce projet a voulue entre les deux
  // tics est rompue ICI, délibérément, et les deux tests doivent rester lisibles côte à côte pour
  // que personne ne « rétablisse la cohérence » en six mois sans savoir ce qu'il défait :
  //   · rail média figé sous `mouvement=aucun`     → ne ment à personne (la chanson avance quand même) ;
  //   · décompte figé sous `mouvement=aucun`       → ment (il fait croire qu'il reste du temps).
  // Tâche 8 (moteur de mouvement) : `niveauInitial` (`demarrage.ts`) ne descend plus tout seul en
  // cours de route — c'était vrai avant cette tâche (l'ancien `niveau`/`degrader` global). Ce
  // qu'il reste à prouver ici est donc plus modeste qu'avant : que l'URL demandée par ce test
  // parse bien en `aucun` (`niveauDemande`, `src/mouvement.ts`) — sans quoi ce test resterait vert
  // même si `?mouvement=aucun` n'était jamais lu, et ne prouverait alors plus rien du tout. La
  // preuve plus FORTE, que `demarrage.ts` CONSOMME bien cette valeur, est déjà apportée par le
  // test jumeau du rail (describe `tictacProgression`, plus haut) : les deux tics partagent la
  // MÊME lecture de `niveauInitial`, il n'y a pas besoin de la reprouver deux fois.
  it('mouvement=aucun (URL) : le décompte descend QUAND MÊME, contrairement au rail média', async () => {
    // `niveauDemande` lit `location.href` une seule fois, à la construction de `demarrer()` : le
    // paramètre doit être posé AVANT de monter (même précaution que le test jumeau du rail).
    const avantUrl = location.href;
    window.history.pushState({}, '', '/?mouvement=aucun');
    try {
      expect(niveauDemande(location.href, false),
        'l\'URL doit parser en aucun : sinon ce test ne mesure pas ce qu\'il croit').toBe('aucun');
      const m = await monterCuisine();
      await m.pousser('timer.cuisine', 'active',
        { finishes_at: new Date(MAINTENANT_FIXE + 300_000).toISOString() });
      const avant = m.racine.querySelector('.mn-temps')!.textContent;

      const tic = m.intervalFn.mock.calls.filter((c: any[]) => c[1] === 1000).map((c: any[]) => c[0]);
      expect(tic.length).toBeGreaterThan(0);
      const depart = performance.now();
      vi.spyOn(performance, 'now').mockReturnValue(depart + 10_000);
      for (const t of tic) t();

      expect(m.racine.querySelector('.mn-temps')!.textContent).not.toBe(avant);
      expect(m.racine.querySelector('.mn-temps')!.textContent).toBe('04:50');
      vi.mocked(performance.now).mockRestore();
    } finally {
      window.history.pushState({}, '', avantUrl);
    }
  });

  it('ne fait rien quand la page est masquée', async () => {
    const m = await monterCuisine();
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(MAINTENANT_FIXE + 300_000).toISOString() });
    const avant = m.racine.querySelector('.mn-temps')!.textContent;
    // Correction (relecture tâche 9) : la ligne posait `hidden` en propriété PROPRE sur
    // `document` (l'instance, seule façon de neutraliser un accesseur non-configurable côté
    // jsdom), mais le nettoyage restaurait un descripteur sur `Document.prototype` — jamais
    // touché — au lieu de retirer cette propriété propre. `document` est un SEUL objet jsdom
    // partagé par tous les tests de ce fichier (pas un par test) : la propriété posée ici
    // survivait donc à ce test, `document.hidden` restant bloqué à `true` pour tout le reste
    // du fichier — silencieusement, jusqu'à ce que la suite « réveil de l'écran de nuit » (tâche
    // 9), qui appelle elle aussi `document.hidden` via un vrai tic, en hérite et rougisse pour une
    // raison qui n'a rien à voir avec son propre code.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try {
      const depart = performance.now();
      vi.spyOn(performance, 'now').mockReturnValue(depart + 30_000);
      const tic = m.intervalFn.mock.calls.filter((c: any[]) => c[1] === 1000).map((c: any[]) => c[0]);
      for (const t of tic) t();
      expect(m.racine.querySelector('.mn-temps')!.textContent).toBe(avant);
      vi.mocked(performance.now).mockRestore();
    } finally {
      delete (document as unknown as Record<string, unknown>).hidden;
    }
  });
});

// Tâche 9 : le réveil de l'écran de nuit — un état local à `demarrage.ts`, câblé sur le geste
// que `rendreNuit` (tâche 9) vient d'accepter (`surReveil`, posé sur le conteneur `.nuit`
// entier). Câblage réel, même niveau de preuve que les suites « minuteurs de cuisine » et
// « appui sur une commande » plus haut dans ce fichier : ni un test unitaire de `rendreNuit`
// seul, ni un test isolé d'un futur `armerReveil`, ne peuvent prouver que les deux sont reliés.
describe('réveil de l\'écran de nuit', () => {
  const nuit = () => new Date(2026, 7, 3, 3, 14);

  it('rend l\'écran complet après un appui, puis la nuit après 45 s', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { maintenant: nuit });
    expect(m.racine.querySelector('.nuit')).not.toBeNull();

    m.racine.querySelector<HTMLElement>('.nuit')!.dispatchEvent(new Event('pointerdown'));
    expect(m.racine.querySelector('.nuit')).toBeNull();
    expect(m.racine.querySelector('.corps')).not.toBeNull();

    const pose = m.minuteurFn.mock.calls.filter((c: any[]) => c[1] === 45_000).pop();
    expect(pose).toBeDefined();
    pose![0]();
    expect(m.racine.querySelector('.nuit')).not.toBeNull();
  });

  it('n\'appelle aucun service au premier appui', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { maintenant: nuit });
    m.racine.querySelector<HTMLElement>('.nuit')!.dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).not.toHaveBeenCalled();
  });

  it('réarme le délai à chaque contact', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { maintenant: nuit });
    m.racine.querySelector<HTMLElement>('.nuit')!.dispatchEvent(new Event('pointerdown'));
    const premier = m.minuteurFn.mock.calls.filter((c: any[]) => c[1] === 45_000).pop()!;
    m.racine.querySelector<HTMLElement>('.corps')!.dispatchEvent(new Event('pointerdown'));
    const second = m.minuteurFn.mock.calls.filter((c: any[]) => c[1] === 45_000).pop()!;
    expect(second).not.toBe(premier);
    // Le minuteur périmé ne doit PAS rendormir l'écran : son jeton n'est plus le bon.
    premier[0]();
    expect(m.racine.querySelector('.nuit')).toBeNull();
    second[0]();
    expect(m.racine.querySelector('.nuit')).not.toBeNull();
  });

  // Couplage avec les ancres de minuteur (ronde de correction 1 de la tâche 8, `dessiner()`) :
  // `minuteursAffiches` excluait tout bloc minuteur tant que `moment === 'nuit'`, pour que le tic
  // d'une seconde ne s'accroche pas à une carte qui n'existe plus dans le DOM une fois l'écran de
  // nuit affiché. Le réveil réintroduit un cas où le bloc minuteur redevient visible PENDANT que
  // `moment` reste encore `'nuit'` : sans corriger cette condition, le décompte resterait figé sur
  // un écran réveillé qui montre pourtant un minuteur en cours.
  it('un minuteur en cours continue de décompter sur l\'écran réveillé (les ancres ne restent pas vides)', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { maintenant: nuit });
    await m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(nuit().getTime() + 300_000).toISOString() });
    await m.pousser('timer.cuisine_2', 'idle', {});
    await m.pousser('timer.cuisine_3', 'idle', {});

    m.racine.querySelector<HTMLElement>('.nuit')!.dispatchEvent(new Event('pointerdown'));
    expect(m.racine.querySelector('.minuteurs')).not.toBeNull();
    const avant = m.racine.querySelector('.mn-temps')!.textContent;

    const tic = m.intervalFn.mock.calls.filter((c: any[]) => c[1] === 1000).map((c: any[]) => c[0]);
    expect(tic.length).toBeGreaterThan(0);
    const depart = performance.now();
    vi.spyOn(performance, 'now').mockReturnValue(depart + 10_000);
    for (const t of tic) t();

    expect(m.racine.querySelector('.mn-temps')!.textContent).not.toBe(avant);
    expect(m.racine.querySelector('.mn-temps')!.textContent).toBe('04:50');
    vi.mocked(performance.now).mockRestore();
  });
});

// Tâche 9 bis : la voiture prend le bloc central du salon, à la place des six prochaines heures
// (demande du propriétaire, 2026-08-03).
// Tâche 14 (2026-08-03) : les prévisions ont disparu partout, pas seulement au salon — les deux
// tests qui les citaient encore (cuisine « qui garde ses prévisions ») sont repris plus bas dans
// `describe('bloc par défaut : repas et agenda')`, qui prouve désormais ce qui les a remplacées.
describe('voiture au salon', () => {
  it('occupe le bloc central du salon, jamais de bloc .prevision (disparu à la tâche 14)', async () => {
    const m = await monterDemarrage(ECRANS.salon);
    await m.pousser('sensor.peugeot_e208_batterie_niveau', '21', {});
    expect(m.racine.querySelector('.voiture')).not.toBeNull();
    expect(m.racine.querySelector('.prevision')).toBeNull();
  });

  it('presse le bouton de la voiture et affiche un retour immédiat', async () => {
    const m = await monterDemarrage(ECRANS.salon);
    await m.pousser('binary_sensor.peugeot_e208_pre_conditionnement', 'off', {});
    m.racine.querySelector<HTMLElement>('.vt-bouton')!.dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).toHaveBeenCalledWith('button', 'press',
      { entity_id: 'button.peugeot_e208_demarrer_pre_conditionnement' });
    expect(m.racine.querySelector('.vt-bouton')!.textContent).toContain('Démarrage…');
  });

  it('efface le retour immédiat dès que la voiture confirme', async () => {
    const m = await monterDemarrage(ECRANS.salon);
    await m.pousser('binary_sensor.peugeot_e208_pre_conditionnement', 'off', {});
    m.racine.querySelector<HTMLElement>('.vt-bouton')!.dispatchEvent(new Event('pointerdown'));
    await m.pousser('binary_sensor.peugeot_e208_pre_conditionnement', 'on', {});
    expect(m.racine.querySelector('.vt-bouton')!.textContent).toContain('Arrêter la clim');
  });

  it('abandonne le retour immédiat si la voiture ne répond pas', async () => {
    const m = await monterDemarrage(ECRANS.salon);
    await m.pousser('binary_sensor.peugeot_e208_pre_conditionnement', 'off', {});
    m.racine.querySelector<HTMLElement>('.vt-bouton')!.dispatchEvent(new Event('pointerdown'));
    const pose = m.minuteurFn.mock.calls.filter((c: any[]) => c[1] === 180_000).pop();
    expect(pose).toBeDefined();
    pose![0]();
    expect(m.racine.querySelector('.vt-bouton')!.textContent).toContain('Lancer la clim');
  });

  // Relecture (yeux neufs, tâche 9 bis) : la voiture au salon peut être injoignable — coupure
  // cloud Stellantis, ou simplement le temps que le premier `state_changed` arrive après un
  // rechargement de tablette. Le bloc doit rester utilisable (bouton de clim visible et actif)
  // même quand AUCUNE des six entités n'a encore été poussée.
  it('reste utilisable quand la voiture est entièrement injoignable (aucune entité connue)', async () => {
    const m = await monterDemarrage(ECRANS.salon);
    expect(m.racine.querySelector('.voiture')).not.toBeNull();
    expect(m.racine.querySelector('.vt-niveau')).toBeNull();
    expect(m.racine.querySelector('.vt-autonomie')).toBeNull();
    const bouton = m.racine.querySelector<HTMLElement>('.vt-bouton')!;
    expect(bouton.textContent).toContain('Lancer la clim');
    bouton.dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).toHaveBeenCalledWith('button', 'press',
      { entity_id: 'button.peugeot_e208_demarrer_pre_conditionnement' });
  });
});

// Tâche 14 (2026-08-03) : les six prochaines heures disparaissent partout, remplacées par ce qui
// est prévu à manger (cuisine) et le prochain rendez-vous du jour (bureau) — cf. `ecran.ts`
// (`blocDefaut`), `rendu/defaut.ts`. Preuve de bout en bout à travers `demarrer()`, comme
// `describe('voiture au salon')` ci-dessus le fait pour la voiture ; le rendu pur des deux
// fonctions est couvert par `tests/defaut.test.ts`.
//
/** Lot 6 (2026-08-21) : le repas vient des ATTRIBUTS de `sensor.home_stock_next_meal`. Un dîner le
 *  jour de l'horloge par défaut de `monterDemarrage` (1er août 2026, 14 h), donc étiqueté « Dîner »
 *  et non « Demain, dîner ». `recipe_id: null` : ces tests-ci parlent du BLOC, pas de la recette
 *  (`tests/navigation.test.ts` couvre la vue). */
const POULET: [string, string, Record<string, unknown>][] = [[
  'sensor.home_stock_next_meal', 'Poulet rôti',
  { day: '2026-08-01', slot: 'dinner', recipe_id: null, meal_id: 7, missing_ingredients: 0 },
]];
describe('bloc par défaut : repas et agenda', () => {
  it('cuisine : affiche le repas suivant, lu dans les attributs du capteur', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { etats: POULET });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Dîner');
    expect(m.racine.querySelector('.mode-bloc .v')?.textContent).toBe('Poulet rôti');
    expect(m.racine.querySelector('.voiture')).toBeNull();
    expect(m.racine.querySelector('.prevision')).toBeNull();
  });

  // Relevé de terrain : le planning de repas est VIDE sur l'installation réelle
  // au moment de cette tâche — ce n'est donc pas un cas limite théorique. Jamais un plat inventé :
  // l'écran se resserre, aucun conteneur vide (`.mode-bloc` absent, pas seulement son contenu).
  it('cuisine : sans plan de repas, aucun bloc central (l\'écran se resserre)', async () => {
    const m = await monterDemarrage(ECRANS.cuisine);
    expect(m.racine.querySelector('.mode-bloc')).toBeNull();
    expect(m.racine.querySelector('.voiture')).toBeNull();
    expect(m.racine.querySelector('.prevision')).toBeNull();
  });

  // Ronde de correction 1 (coordinateur, tâche 14) : ce rendez-vous à 16 h 30, deux heures et
  // demie après l'horloge par défaut de `monterDemarrage` (14 h), tombe DÉLIBÉRÉMENT dans la
  // fenêtre de 3 h de la pastille (`FENETRE_MS`, `agenda.ts`) — c'est le cas le plus courant,
  // celui qui a exactement révélé la duplication au premier passage de cette tâche (le bloc ET la
  // pastille montraient « Réunion client » en même temps). `.pastille` doit donc rester ABSENTE de
  // cette donnée : `masquerRdv` (posé dans `demarrage.ts` sur `piece.blocDefaut === 'agenda'`)
  // fait céder la pastille sur les rendez-vous, jamais le bloc central, qui reste seul propriétaire
  // de cette information sur cet écran.
  it('bureau : affiche le rendez-vous dans le bloc central, jamais aussi dans la pastille', async () => {
    const m = await monterDemarrage(ECRANS.bureau, {
      reseau: { calendriers: { 'calendar.famille': [
        { resume: 'Réunion client', debut: '2026-08-01T16:30:00' },
      ] } },
    });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Rendez-vous');
    expect(m.racine.querySelector('.mode-bloc .v')?.textContent).toBe('16:30 — Réunion client');
    // La pastille ne répète ni l'heure ni le résumé — dans cet état (pas d'anniversaire, aucune
    // prévision quotidienne fournie par ce test), elle n'a d'ailleurs plus rien à montrer du tout.
    expect(m.racine.querySelector('.pastille')).toBeNull();
    expect(m.racine.querySelector('.pastille .pv')?.textContent).not.toBe('Réunion client');
  });

  it('bureau : sans rendez-vous restant aujourd\'hui, aucun bloc central', async () => {
    const m = await monterDemarrage(ECRANS.bureau);
    expect(m.racine.querySelector('.mode-bloc')).toBeNull();
  });

  // Contre-épreuve : `masquerRdv` ne coupe pas plus large que nécessaire — un anniversaire du
  // jour reste annoncé par la pastille au bureau, puisque `rendreProchainRdv` ne le montre jamais
  // (pas d'heure, cf. son docstring, `rendu/defaut.ts`) : rien à dédoublonner de ce côté.
  it('bureau : un anniversaire du jour reste annoncé par la pastille, jamais coupé', async () => {
    const m = await monterDemarrage(ECRANS.bureau, {
      reseau: { calendriers: { 'calendar.anniversaires': [
        { resume: 'Anniversaire de Soraya', debut: '2026-08-01' },
      ] } },
    });
    expect(m.racine.querySelector('.pastille .pt')?.textContent).toBe('Aujourd\'hui');
    expect(m.racine.querySelector('.pastille .pv')?.textContent).toBe('Anniversaire de Soraya');
  });

  it("n'arme plus AUCUN intervalle de 15 minutes pour le repas", async () => {
    // La preuve du gain : le repas vient d'un attribut d'entité, donc il arrive par
    // `subscribe_events` — déjà souscrit, déjà coalescé. Le rappel de 15 min qui vivait ici
    // coûtait 3,8 Mo de trafic HTTP par jour sur une Fire 7 à 130 Mo de libre. Si l'intervalle
    // revient un jour, ce test le dit.
    //
    // La cuisine et le bureau en gardent trois (météo, agenda, tâches), le salon deux : c'est
    // exactement UN de moins qu'avant ce lot pour la cuisine, et rien de changé ailleurs.
    const quartsDHeure = (m: { intervalFn: ReturnType<typeof vi.fn> }) =>
      m.intervalFn.mock.calls.filter((c: any[]) => c[1] === 15 * 60_000).length;
    const cuisine = await monterDemarrage(ECRANS.cuisine, { etats: POULET });
    const bureau = await monterDemarrage(ECRANS.bureau);
    expect(quartsDHeure(cuisine)).toBe(3);
    expect(quartsDHeure(bureau)).toBe(3);
  });

  it("redessine le bloc quand le capteur change d'état", async () => {
    // Le bloc suit la maison à la seconde, sans qu'aucun minuteur ne s'en mêle.
    const m = await monterDemarrage(ECRANS.cuisine);
    expect(m.racine.querySelector('.mode-bloc')).toBeNull();
    await m.pousser(...POULET[0]);
    expect(m.racine.querySelector('.mode-bloc .v')?.textContent).toBe('Poulet rôti');
    await m.pousser('sensor.home_stock_next_meal', 'unavailable', {});
    expect(m.racine.querySelector('.mode-bloc')).toBeNull();
  });

  it("n'envoie AUCUNE commande websocket pour afficher le repas", async () => {
    // Garde-fou : afficher le bloc ne coûte RIEN sur le réseau. `listerTaches` (vue « Tâches »)
    // reste une commande à part, comptée ailleurs.
    const m = await monterDemarrage(ECRANS.cuisine, { etats: POULET });
    expect(m.racine.querySelector('.mode-bloc .v')?.textContent).toBe('Poulet rôti');
    expect(m.envoyerCommande).not.toHaveBeenCalled();
  });
});

// Tâche 17 (2026-08-03) : le repli des deux blocs ci-dessus vers les tâches d'entretien. Constat
// de terrain : la cuisine (aucun plat planifié) et le bureau (agenda vide le soir)
// laissaient ~185 px et ~175 px de fond nu — les deux cas les plus COURANTS, pas des cas limites.
// Preuve de bout en bout à travers `demarrer()`, comme `describe('bloc par défaut …')` ci-dessus ;
// le rendu pur du bloc est couvert par `tests/defaut.test.ts`.
describe('repli du bloc par défaut vers l\'entretien', () => {
  /** Les tâches d'entretien telles que `chargerTaches` les charge : `todo.maintenance` est
   *  déclaré dans la `synthese` des trois pièces (`ecran.ts`), donc présent dans
   *  `listesTachesPiece` (`cochage.ts`) — aucune requête de plus à câbler, le cache est déjà là. */
  const ENTRETIEN = {
    'todo.maintenance': [
      { uid: 'a', texte: 'Purificateur — filtre à remplacer' },
      { uid: 'b', texte: 'Arroser Plante Télévision' },
    ],
  };

  it('cuisine : sans plan de repas, l\'entretien prend le bloc central', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { taches: ENTRETIEN });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 2 tâches');
    expect(m.racine.querySelector('.mode-bloc .v')?.textContent)
      .toContain('Purificateur — filtre à remplacer');
  });

  it('bureau : sans rendez-vous restant aujourd\'hui, l\'entretien prend le bloc central', async () => {
    const m = await monterDemarrage(ECRANS.bureau, { taches: ENTRETIEN });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 2 tâches');
  });

  // Le repas et le rendez-vous gardent la priorité : le repli ne les remplace jamais, il occupe la
  // place qu'ils laissent vide.
  it('cuisine : un plat planifié prime sur l\'entretien', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { taches: ENTRETIEN, etats: POULET });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Dîner');
  });

  it('bureau : un rendez-vous du jour prime sur l\'entretien', async () => {
    const m = await monterDemarrage(ECRANS.bureau, {
      taches: ENTRETIEN,
      reseau: { calendriers: { 'calendar.famille': [
        { resume: 'Réunion client', debut: '2026-08-01T16:30:00' },
      ] } },
    });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Rendez-vous');
  });

  // Le trou résiduel, assumé et documenté (rapport de tâche 17) : ni repas, ni rendez-vous, ni
  // tâche d'entretien → aucun bloc central, l'écran se resserre comme avant cette tâche.
  it('cuisine : rien à montrer nulle part, aucun bloc central (l\'écran se resserre)', async () => {
    const m = await monterDemarrage(ECRANS.cuisine);
    expect(m.racine.querySelector('.mode-bloc')).toBeNull();
  });

  it('salon : la voiture garde son bloc, jamais remplacée par l\'entretien', async () => {
    const m = await monterDemarrage(ECRANS.salon, { taches: ENTRETIEN });
    expect(m.racine.querySelector('.voiture')).not.toBeNull();
    expect(m.racine.querySelector('.mode-bloc')).toBeNull();
  });

  // --- Garde anti-doublon (règle du projet : jamais la même donnée deux fois sur un écran) ---
  //
  // La décision suit ce qui est RÉELLEMENT affiché à cet instant, jamais la pièce : trois cas, le
  // même écran, trois verdicts différents.
  it('la synthèse cesse d\'annoncer l\'entretien quand le bloc central l\'affiche', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { taches: ENTRETIEN });
    await m.pousser('todo.maintenance', '2', {});
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 2 tâches');
    expect(m.racine.querySelector('.synthese .ecart')?.textContent).not.toContain('entretien');
  });

  it('la synthèse garde sa mention quand le repas occupe le bloc central', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { taches: ENTRETIEN, etats: POULET });
    await m.pousser('todo.maintenance', '2', {});
    expect(m.racine.querySelector('.synthese .ecart')?.textContent).toContain('2 tâches d\'entretien');
  });

  // Un mode plus prioritaire (ici le ménage) confisque le bloc central : l'entretien n'est PLUS
  // affiché nulle part, donc la synthèse doit le reprendre. C'est exactement ce qu'un masquage posé
  // sur la pièce (et non sur le rendu réel) ferait disparaître à tort.
  it('la synthèse reprend sa mention dès qu\'un mode prioritaire confisque le bloc', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { taches: ENTRETIEN });
    await m.pousser('todo.maintenance', '2', {});
    await m.pousser('vacuum.aspirateur_cuisine', 'cleaning', { battery_level: 80 });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Ménage');
    expect(m.racine.querySelector('.synthese .ecart')?.textContent).toContain('2 tâches d\'entretien');
  });

  // --- Fraîcheur ---
  //
  // `chargerTaches` n'était rappelée qu'à l'entrée sur la vue « Tâches » (tâche 18) : suffisant
  // pour une vue qu'on ouvre à la demande, plus du tout pour une donnée affichée en PERMANENCE sur
  // l'accueil. Même cadence que la météo, l'agenda et le repas (15 min), et uniquement pour les
  // deux pièces qui peuvent réellement afficher ce bloc — le salon (voiture) n'y gagnerait qu'une
  // commande websocket de plus sur une Fire 7 à 130 Mo de libre.
  const rafraichissements = (m: { intervalFn: ReturnType<typeof vi.fn> }) =>
    m.intervalFn.mock.calls.filter((c: any[]) => c[1] === 15 * 60_000).length;

  it('rafraîchit les tâches toutes les 15 min en cuisine et au bureau, jamais au salon', async () => {
    const salon = await monterDemarrage(ECRANS.salon);
    const bureau = await monterDemarrage(ECRANS.bureau);
    // Salon : météo + agenda. Bureau et cuisine : + tâches. Lot 6 : la cuisine en avait un
    // QUATRIÈME (le plan de repas) — il a disparu avec la source, le repas arrivant désormais par
    // `subscribe_events`.
    expect(rafraichissements(salon)).toBe(2);
    expect(rafraichissements(bureau)).toBe(3);
    const cuisine = await monterDemarrage(ECRANS.cuisine);
    expect(rafraichissements(cuisine)).toBe(3);
  });

  it('le rappel de 15 min recharge réellement les tâches affichées', async () => {
    const taches: Record<string, { uid: string; texte: string }[]> = { 'todo.maintenance': [] };
    const m = await monterDemarrage(ECRANS.bureau, { taches });
    expect(m.racine.querySelector('.mode-bloc')).toBeNull();
    // La liste change dans Home Assistant pendant que l'écran est allumé, sans qu'aucun contact
    // n'ait lieu : seul ce rappel périodique peut le voir.
    taches['todo.maintenance'] = [{ uid: 'a', texte: 'Purificateur — filtre à remplacer' }];
    const rappels = m.intervalFn.mock.calls.filter((c: any[]) => c[1] === 15 * 60_000);
    for (const [fn] of rappels) fn();
    await vider();
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 1 tâche');
  });

  // --- Ronde de correction (relecture indépendante de la tâche 17) : D1, la fraîcheur du COMPTE ---
  //
  // Le titre du bloc annonce un nombre de tâches tiré du CACHE (`taches['todo.maintenance']`),
  // alors que la ligne de synthèse qu'il fait taire (`masquerEntretien`) comptait l'`{etat}` de
  // l'entité, poussé en direct par le websocket. Un quart d'heure d'écart entre les deux : la
  // synchronisation horaire de `todo.maintenance` ferme deux tâches sur trois à 14 h 02, l'état
  // passe à 1 immédiatement, et l'écran continue d'afficher « Entretien — 3 tâches » avec deux
  // résumés fantômes jusqu'à 14 h 15 — pendant que la seule valeur juste (l'écart de synthèse) a
  // justement été masquée. Le remède : l'état poussé DÉCLENCHE le rechargement des libellés.
  it('un changement d\'état de todo.maintenance recharge les libellés sans attendre le quart d\'heure', async () => {
    const taches: Record<string, { uid: string; texte: string }[]> = {
      'todo.maintenance': [
        { uid: 'a', texte: 'Purificateur — filtre à remplacer' },
        { uid: 'b', texte: 'Arroser Plante Télévision' },
        { uid: 'c', texte: 'Mises à jour manuelles à installer' },
      ],
    };
    const m = await monterDemarrage(ECRANS.cuisine, { taches });
    await m.pousser('todo.maintenance', '3', {});
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 3 tâches');

    // 14 h 02 : la synchronisation horaire ferme deux tâches. HA pousse l'état AVANT que quoi que
    // ce soit ne redemande la liste — c'est exactement l'instant du défaut.
    taches['todo.maintenance'] = [{ uid: 'a', texte: 'Purificateur — filtre à remplacer' }];
    await m.pousser('todo.maintenance', '1', {});
    await vider();
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 1 tâche');
    expect(m.racine.querySelector('.mode-bloc .v')?.textContent)
      .not.toContain('Arroser Plante Télévision');
  });

  it('un état identique republié ne relance aucune requête (jamais de boucle de rechargement)', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, {
      taches: { 'todo.maintenance': [{ uid: 'a', texte: 'Purificateur — filtre à remplacer' }] },
    });
    const appels = () => m.listerTaches.mock.calls.filter((c: any[]) => c[0] === 'todo.maintenance').length;
    await m.pousser('todo.maintenance', '1', {});
    await vider();
    const apresPremier = appels();
    // Rafraîchissement massif après reconnexion (`get_states`) : la MÊME valeur est republiée. Un
    // rechargement à chaque état reçu, plutôt qu'à chaque état CHANGÉ, ferait ici une requête de
    // plus par état poussé par la maison entière.
    await m.pousser('todo.maintenance', '1', {});
    await m.pousser('todo.maintenance', '1', {});
    await vider();
    expect(appels()).toBe(apresPremier);
  });

  it('salon : un changement de todo.maintenance ne relance rien (le bloc n\'y est jamais rendu)', async () => {
    const m = await monterDemarrage(ECRANS.salon, {
      taches: { 'todo.maintenance': [{ uid: 'a', texte: 'Purificateur — filtre à remplacer' }] },
    });
    const avant = m.listerTaches.mock.calls.length;
    await m.pousser('todo.maintenance', '4', {});
    await vider();
    // La voiture occupe son bloc central en toutes circonstances : la liste n'y est affichée
    // nulle part, et la vue « Tâches » se recharge déjà à chaque entrée. Une commande websocket
    // de plus à chaque synchronisation horaire, pour rien, sur une Fire 7 à 130 Mo de libre.
    expect(m.listerTaches.mock.calls.length).toBe(avant);
    expect(m.racine.querySelector('.synthese .ecart')?.textContent).toContain('4 tâches d\'entretien');
  });

  // --- D2 : le cochage optimiste doit valoir pour le bloc autant que pour la vue ---
  //
  // La vue « Tâches » retire immédiatement une tâche cochée (`cochage.estMasquee`, retrait
  // optimiste) ; le bloc central recevait le cache BRUT. Après un cochage en cuisine et le retour
  // automatique à l'accueil 45 s plus tard, l'écran annonçait donc toujours trois tâches et citait
  // celle qui venait d'être cochée — pendant que la synthèse, elle, était masquée. Même liste,
  // deux comptes, sur la même tablette.
  it('une tâche cochée dans la vue Tâches disparaît aussi du bloc central', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, {
      taches: {
        'todo.maintenance': [
          { uid: 'a', texte: 'Purificateur — filtre à remplacer' },
          { uid: 'b', texte: 'Arroser Plante Télévision' },
          { uid: 'c', texte: 'Mises à jour manuelles à installer' },
        ],
      },
    });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 3 tâches');

    location.hash = '#taches';
    // jsdom déclenche son propre `hashchange` de façon asynchrone : on le déclenche nous-mêmes,
    // comme le fait déjà le test de cochage de bout en bout plus haut dans ce fichier.
    window.dispatchEvent(new Event('hashchange'));
    await vider();
    const lignes = Array.from(m.racine.querySelectorAll('.ligne-tache'));
    const ligne = lignes.find((l) => l.querySelector('.t')?.textContent === 'Purificateur — filtre à remplacer')!;
    ligne.dispatchEvent(new Event('pointerdown', { bubbles: true }));   // arme
    m.racine.querySelectorAll('.ligne-tache')[lignes.indexOf(ligne)]
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));      // confirme et coche
    await vider();

    // Retour automatique à l'accueil (45 s) : le bloc central redevient visible.
    location.hash = '';
    window.dispatchEvent(new Event('hashchange'));
    await vider();
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 2 tâches');
    expect(m.racine.querySelector('.mode-bloc .v')?.textContent)
      .not.toContain('Purificateur — filtre à remplacer');
  });

  // --- D4 : le bloc doit obéir au mode invités, comme la ligne de synthèse qu'il remplace ---
  //
  // `todo.maintenance` est déclaré `perso: true` dans les trois pièces (`ecran.ts`) : sous
  // `input_boolean.mode_invites`, son écart disparaît de la synthèse (`rendu/corps.ts`). Le bloc
  // central l'affichait pourtant EN GRAND et EN DÉTAIL au milieu de l'écran — exactement la donnée
  // que ce modulateur existe pour cacher, et davantage qu'avant la tâche 17. Conséquence assumée :
  // sous mode invités, sans repas ni rendez-vous, le trou de ~170 px revient. C'est le
  // comportement d'avant la tâche 17 ; le propriétaire n'a pas arbitré autre chose.
  it('mode invités : le bloc d\'entretien s\'efface en cuisine (donnée perso), le trou revient', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { taches: ENTRETIEN });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 2 tâches');
    await m.pousser('input_boolean.mode_invites', 'on', {});
    // Le bloc d'entretien disparaît réellement de la mise en page (aucun repli), mais le moteur de
    // mouvement (`src/mouvement/moteur.ts`) anime sa sortie sur un CLONE dans `#mvt-fantomes` — un
    // artefact visuel voulu, qui survit au-delà du redessin déclenché par `pousser()`.
    // `vider()` laisse ce clone se relâcher avant de vérifier son absence.
    await vider();
    expect(m.racine.querySelector('.mode-bloc')).toBeNull();
    expect(m.racine.querySelector('.synthese .ecart')?.textContent ?? '').not.toContain('entretien');
  });

  it('mode invités : le bloc d\'entretien s\'efface au bureau aussi', async () => {
    const m = await monterDemarrage(ECRANS.bureau, { taches: ENTRETIEN });
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Entretien — 2 tâches');
    await m.pousser('input_boolean.mode_invites', 'on', {});
    // Cf. commentaire du test jumeau (cuisine, juste au-dessus) : le clone de sortie du moteur de
    // mouvement met une microtâche à se relâcher.
    await vider();
    expect(m.racine.querySelector('.mode-bloc')).toBeNull();
  });

  // Le repas, lui, n'est pas `perso` : il reste affiché devant des invités — le modulateur ne
  // vide pas le bloc central, il n'en retire que ce qui ne regarde que Maxime.
  it('mode invités : le repas du jour garde sa place', async () => {
    const m = await monterDemarrage(ECRANS.cuisine, { taches: ENTRETIEN, etats: POULET });
    await m.pousser('input_boolean.mode_invites', 'on', {});
    expect(m.racine.querySelector('.mode-bloc .t')?.textContent).toBe('Dîner');
  });
});
