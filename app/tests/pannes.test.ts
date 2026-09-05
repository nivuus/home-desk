// @vitest-environment jsdom
//
// Tâche 9 : robustesse aux pannes. Trois angles, dans l'ordre des tests ci-dessous :
//   1. `ligneSynthese` ne fait jamais échouer la synthèse sur une entité disparue ou muette
//      (déjà en place depuis la tâche 6, via `Etat.estUtilisable` — ces trois tests documentent
//      le comportement plutôt que de le réparer, cf. rapport de tâche).
//   2. Le grisage `.muet` + le bandeau `.hors-ligne` après 30 s de silence websocket
//      (`Connexion.surSilence`), câblés ici pour la première fois dans `demarrage.ts`.
//   3. Le chemin de panne non couvert par la tâche 5 (cf. son rapport, réserve « `surSilence`
//      toujours non câblé ») : la reconnexion interne de `Connexion` (son propre `ws.onclose`)
//      contourne l'orchestration de `demarrage.ts` et, avant cette tâche, mourait pour de bon au
//      premier échec après une connexion déjà établie (jeton de rafraîchissement révoqué) sans
//      jamais rien afficher. Prouvé de bout en bout avec la vraie classe `Connexion`, pas un
//      double — un double ne peut pas reproduire ce bug, qui vit entièrement dans son
//      implémentation interne (`ws.onclose`, `armerSurveillanceSilence`).
import { describe, it, expect, vi } from 'vitest';
import { Etat } from '../src/etat';
import { ligneSynthese } from '../src/rendu/corps';
import { demarrer, type ConnexionLike } from '../src/demarrage';
import { Connexion } from '../src/connexion';
import type { Piece } from '../src/pieces';
import type { EvenementEtat } from '../src/connexion';
import { vider } from './aides';

// Le brief illustre `ligneSynthese` avec une seconde liste de simples chaînes
// (`['todo.maintenance', 'lock.inexistante', ...]`) : c'était le bon type à la tâche 6, avant sa
// ronde de correction 2, qui a introduit l'union discriminée `EntreeSynthese`
// (`entite`/`operateur`/`valeur`/`texte`, cf. `pieces.ts` et le docstring de `ligneSynthese`
// dans `rendu/corps.ts`) pour distinguer les comparaisons numériques des textuelles. Le brief
// n'a pas suivi cette évolution ; ces trois tests gardent son intention (entité disparue, entité
// muette, rien à signaler) mais avec la forme réelle du type, sans quoi ils ne compileraient
// même pas — et un `as any` aurait fait passer les trois tests pour la mauvaise raison
// (`entree.entite` vaudrait `undefined` sur une chaîne brute, silencieusement filtré par
// `estUtilisable`, sans jamais exercer `estEcart`).
describe('robustesse de la synthese', () => {
  it('ignore une entité disparue au lieu de faire échouer la synthèse', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'todo.maintenance', state: '4', attributes: {} });
    const s = ligneSynthese(e, [
      { entite: 'todo.maintenance', operateur: '>', valeur: 0, texte: '{etat} tâche{s} d\'entretien' },
      { entite: 'lock.inexistante', operateur: '!=', valeur: 'locked', texte: 'porte déverrouillée' },
      { entite: 'cover.jamais_vue', operateur: '==', valeur: 'open', texte: 'rideau ouvert' },
    ]);
    expect(s.ecarts).toEqual(['4 tâches d\'entretien']);
  });

  it('ignore une entité muette plutôt que de la compter comme un écart', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'lock.porte', state: 'unavailable', attributes: {} });
    const s = ligneSynthese(e, [
      { entite: 'lock.porte', operateur: '!=', valeur: 'locked', texte: 'porte déverrouillée' },
    ]);
    expect(s.ecarts).toEqual([]);
  });

  it('ne signale rien quand tout est normal', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'lock.porte', state: 'locked', attributes: {} });
    e.appliquer({ entity_id: 'todo.maintenance', state: '0', attributes: {} });
    const s = ligneSynthese(e, [
      { entite: 'lock.porte', operateur: '!=', valeur: 'locked', texte: 'porte déverrouillée' },
      { entite: 'todo.maintenance', operateur: '>', valeur: 0, texte: '{etat} tâche{s} d\'entretien' },
    ]);
    expect(s.ecarts).toEqual([]);
    expect(s.texte).toContain('rien à signaler');
  });
});

const piece: Piece = {
  nom: 'Salon', temperature: 'sensor.capteur_humain_temperature',
  ambiances: [], commandes: [], synthese: [], extrasMaison: [],
  sources: [], ouvrants: [],
};
const jetonsTest = { access_token: 'a', refresh_token: 'r', expires: 0, clientId: 'c' };
const stockageAvecSession = { getItem: () => JSON.stringify(jetonsTest), setItem: vi.fn() } as any;

/** Double minimal qui capture le rappel de `surSilence` pour pouvoir le déclencher à la main,
 *  sans dépendre d'un vrai minuteur — exactement ce que `demarrage.ts` reçoit d'un objet
 *  `Connexion` réel, réduit à ce dont ce fichier a besoin. */
function connexionAvecSilence() {
  let cbSilence: (ms: number) => void = () => {};
  let cbEtat: (e: EvenementEtat) => void = () => {};
  const cx: ConnexionLike = {
    connecter: () => Promise.resolve(),
    surChangement: (cb) => { cbEtat = cb; },
    appelerService: vi.fn(),
    surSilence: (cb) => { cbSilence = cb; },
    listerTaches: async () => [],
      envoyerCommande: async () => { throw new Error('websocket indisponible'); },
  };
  return { cx, declencherSilence: (ms: number) => cbSilence(ms), emettre: (e: EvenementEtat) => cbEtat(e) };
}

describe('grisage apres silence (brief tache 9, etape 3)', () => {
  it('grise #app et affiche un bandeau hors-ligne apres 30 s de silence, jamais avant, sans jamais vider l ecran', async () => {
    const racine = document.createElement('div');
    const { cx, declencherSilence } = connexionAvecSilence();
    await demarrer(racine, piece, {
      stockage: stockageAvecSession, creerConnexion: () => cx,
      intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 10, 30),
    });

    expect(racine.classList.contains('muet')).toBe(false);
    expect(racine.querySelector('.hors-ligne')).toBeNull();

    declencherSilence(29_999);
    expect(racine.classList.contains('muet')).toBe(false);
    expect(racine.querySelector('.hors-ligne')).toBeNull();

    declencherSilence(30_001);
    expect(racine.classList.contains('muet')).toBe(true);
    expect(racine.querySelector('.hors-ligne')?.textContent).toContain('Hors ligne');
    expect(racine.innerHTML.trim()).not.toBe('');   // jamais un mur blanc

    // Ronde de correction visée par cette tâche : l'ancien montage Lovelace se vidait après un
    // redémarrage de HA et ne revenait qu'au rechargement manuel de la page. Ici, le retour est
    // automatique dès que le silence retombe sous le seuil — sans le moindre rechargement.
    declencherSilence(0);
    // `.hors-ligne` sort réellement (remplacé par le contenu normal), mais le moteur de mouvement
    // (`src/mouvement/moteur.ts`) anime cette sortie sur un CLONE dans `#mvt-fantomes`, qui porte
    // encore la classe `.hors-ligne` — une microtâche après ce `declencherSilence()` synchrone, le
    // temps qu'il se relâche.
    await vider();
    expect(racine.classList.contains('muet')).toBe(false);
    expect(racine.querySelector('.hors-ligne')).toBeNull();
  });

  // Un test qui ne déclencherait le silence qu'à l'écran par défaut ne pourrait pas distinguer
  // « hors-ligne prend la priorité » de « hors-ligne est simplement ajouté à côté » — les deux
  // produiraient un `.hors-ligne` non nul. Seul un scénario où une alerte est déjà affichée
  // AVANT le silence peut départager : si la priorité était inversée (ou absente), `.alerte`
  // resterait visible après le déclenchement du silence.
  it('le bandeau hors-ligne prend le pas sur une alerte deja affichee (une alerte perimee depuis 30 s ne vaut plus rien)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 14, 0));
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('réseau indisponible dans ce test')) as any;
    try {
      const racine = document.createElement('div');
      const { cx, declencherSilence, emettre } = connexionAvecSilence();
      await demarrer(racine, piece, {
        stockage: stockageAvecSession, creerConnexion: () => cx,
        intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any,
        maintenant: () => new Date(),
      });

      emettre({ entity_id: 'lock.aqara_smart_lock_u200_lite', state: 'unlocked', attributes: {} });
      emettre({ entity_id: 'binary_sensor.capteur_humain', state: 'on', attributes: {} });
      await vider();
      expect(racine.querySelector('.alerte')?.textContent).toContain('Porte déverrouillée');

      declencherSilence(30_001);
      // Cf. commentaire du test au-dessus : le clone de sortie de `.alerte` (moteur de mouvement)
      // met une microtâche à se relâcher.
      await vider();
      expect(racine.querySelector('.hors-ligne')?.textContent).toContain('Hors ligne');
      expect(racine.querySelector('.alerte')).toBeNull();
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.useRealTimers();
    }
  });

  // Retour du coordinateur : `rendreNuit` seul (testé dans `tests/nuit.test.ts`) ne peut pas
  // prouver que `demarrage.ts` lui transmet réellement `horsLigne` — exactement la classe de
  // défaut déjà payée dans ce projet pour `alerteActive`/`mediaEnCours` (cf. commentaire tâche
  // 8 bis) : une fonction de rendu correcte, jamais branchée. Ici, bout en bout via `demarrer()`,
  // à une heure de nuit (23h30).
  it('sur l ecran de nuit, le silence remplace aussi la temperature par la note hors-ligne (bout en bout, pas juste rendreNuit isole)', async () => {
    const racine = document.createElement('div');
    const { cx, declencherSilence, emettre } = connexionAvecSilence();
    await demarrer(racine, piece, {
      stockage: stockageAvecSession, creerConnexion: () => cx,
      intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 23, 30),
    });

    emettre({ entity_id: 'sensor.capteur_humain_temperature', state: '19.6', attributes: {} });
    await vider();
    expect(racine.querySelector('.tn')?.textContent).toContain('19,6°');

    declencherSilence(30_001);
    expect(racine.classList.contains('muet')).toBe(true);
    // Tâche 7 (mouvement) : `.tn` porte désormais `data-mvt="detail:nuit-temp"` (cf.
    // `rendu/nuit.ts`) — sa sortie n'est plus sèche, le moteur de mouvement l'anime sur un CLONE
    // dans `#mvt-fantomes` (même mécanisme que `.hors-ligne`/`.alerte` ci-dessus) ; une microtâche
    // le temps qu'il se relâche avant que `.tn` disparaisse réellement de `racine`.
    await vider();
    expect(racine.querySelector('.tn')).toBeNull();
    expect(racine.querySelector('.hn')?.textContent).toBe('23:30');   // l horloge reste fiable
    expect(racine.textContent).toContain('Dernières données');
  });
});

// Retour du coordinateur, ronde de correction 1 (IMPORTANT, le plus sérieux des trois points) :
// « Toute la maison » est le pire des trois écrans pour une panne silencieuse — elle ne montre
// pas de l'information, elle propose neuf boutons d'action (lumières, rideaux, chauffage,
// SERRURE, aspirateur). Sans garde, un appui pendant une panne posait quand même l'état
// optimiste (tâche 7) : la tuile changeait d'aspect comme si l'ordre était parti, avant de
// revenir en arrière trois secondes plus tard sur un écran déjà quitté — le retour visuel conçu
// pour rassurer jouait alors contre nous. Choix retenu : EMPÊCHER (aucun optimisme, aucun appel
// de service, cf. `estHorsLigne` dans `interaction.ts`) ET SIGNALER (étiquette « Hors ligne »,
// cf. `rendu/maison.ts`) plutôt que l'un seul des deux — empêcher élimine le danger même si
// personne ne lit le signal (écran mural, peu regardé) ; signaler évite qu'un écran qui refuse
// tout sans un mot passe pour un écran cassé. Prouvé ici bout en bout via `demarrer()`, comme les
// autres branchements de cette tâche : `tests/interaction.test.ts` et `tests/maison.test.ts`
// prouvent chaque brique isolément, mais aucun des deux ne peut prouver qu'elles sont réellement
// reliées entre elles dans l'application réelle.
describe('vue Toute la maison hors ligne (retour du coordinateur, IMPORTANT)', () => {
  it('le silence empeche l optimisme sur une commande ET affiche le signal, sur la vue reelle', async () => {
    const racine = document.createElement('div');
    const { cx, declencherSilence, emettre } = connexionAvecSilence();
    try {
      await demarrer(racine, piece, {
        stockage: stockageAvecSession, creerConnexion: () => cx,
        intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any,
        maintenant: () => new Date(2026, 7, 1, 14, 0),
      });

      emettre({ entity_id: 'light.lumiere_salon', state: 'off', attributes: {} });
      await vider();
      location.hash = '#maison';
      window.dispatchEvent(new Event('hashchange'));
      expect(racine.querySelector('.etiquette')?.textContent).toBe('Toute la maison');

      declencherSilence(30_001);
      expect(racine.querySelector('.etiquette')?.textContent).toBe('Hors ligne');

      const tuile = Array.from(racine.querySelectorAll('.tuile'))
        .find((t) => t.textContent?.includes('Salon'))!;
      expect(tuile.className).not.toContain('actif');

      tuile.dispatchEvent(new Event('pointerdown', { bubbles: true }));

      // Empêché : ni optimisme (la tuile ne bascule jamais en actif), ni appel de service vers
      // une connexion qu'on sait morte.
      expect(tuile.className).not.toContain('actif');
      expect(cx.appelerService).not.toHaveBeenCalled();
    } finally {
      location.hash = '';   // ne contamine pas le prochain test de ce fichier
    }
  });
});

// Tâche 18 : la vue « Tâches » doit exactement la même garantie que « Toute la maison » ci-dessus
// — cocher une tâche est une commande (`todo.update_item`), donc soumise à la même règle « le
// mode hors ligne bloque les commandes ». Prouvé de bout en bout, comme ci-dessus : ni un test
// unitaire de `creerCochage` seul (`tests/cochage.test.ts`) ni un test de rendu isolé de
// `rendreTaches` (`tests/taches.test.ts`) ne peuvent prouver que les deux sont bien reliés dans
// l'application réelle, câblée par `demarrage.ts`.
describe('vue Taches hors ligne (tache 18, meme regle que Toute la maison)', () => {
  it('le silence empeche l armement/la confirmation d un cochage, sur la vue reelle', async () => {
    const racine = document.createElement('div');
    let cbSilence: (ms: number) => void = () => {};
    const appelerService = vi.fn();
    const pieceAvecTaches: Piece = {
      nom: 'Salon', temperature: 'sensor.capteur_humain_temperature',
      ambiances: [], commandes: [], extrasMaison: [],
      synthese: [
        { entite: 'todo.maintenance', operateur: '>', valeur: 0, texte: '{etat} tâche{s} d\'entretien' },
      ],
      sources: [], ouvrants: [],
    };
    const cx: ConnexionLike = {
      connecter: () => Promise.resolve(),
      surChangement: () => {},
      appelerService,
      surSilence: (cb) => { cbSilence = cb; },
      listerTaches: async () => [{ uid: 'u1', texte: 'Changer une pile' }],
      envoyerCommande: async () => { throw new Error('websocket indisponible'); },
    };
    try {
      await demarrer(racine, pieceAvecTaches, {
        stockage: stockageAvecSession, creerConnexion: () => cx,
        intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any,
        maintenant: () => new Date(2026, 7, 1, 14, 0),
      });

      location.hash = '#taches';
      window.dispatchEvent(new Event('hashchange'));
      // Laisse `chargerTaches()` (déclenché par le hashchange) résoudre — même mécanique que
      // `chargerMeteo` ailleurs dans ce fichier, une micro-tâche suffit (double `listerTaches`
      // résolu synchronement dans une promesse déjà tenue).
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

      expect(racine.querySelector('.etiquette')?.textContent).toBe('Tâches');
      const ligne = racine.querySelector('.ligne-tache')!;
      expect(ligne, 'la tâche du double listerTaches devrait être rendue').not.toBeNull();

      cbSilence(30_001);
      expect(racine.querySelector('.etiquette')?.textContent).toBe('Hors ligne');

      ligne.dispatchEvent(new Event('pointerdown', { bubbles: true }));

      // Empêché : ni armement (la ligne ne devient jamais « armee »), ni a fortiori confirmation
      // ou appel de service vers une connexion qu'on sait morte.
      expect(ligne.className).not.toContain('armee');
      expect(appelerService).not.toHaveBeenCalled();
    } finally {
      location.hash = '';
    }
  });
});

describe('reconnexion interne cassee (jeton de rafraichissement revoque apres une connexion deja etablie)', () => {
  // Faux websocket qui se capture lui-même dans `derniereWs`, pour pouvoir déclencher ses
  // évènements (`onmessage`, `onclose`) à la main depuis le test — exactement le double utilisé
  // dans `connexion.test.ts`, avec cette capture en plus.
  let derniereWs: { onmessage: ((ev: any) => void) | null; onclose: (() => void) | null } | undefined;
  class FauxWebSocketCapture {
    onmessage: ((ev: any) => void) | null = null;
    onclose: (() => void) | null = null;
    send() {}
    constructor(public url: string) { derniereWs = this; }
  }

  // C'est le cœur de la tâche : la reconnexion interne de `Connexion` (`ws.onclose`, cf.
  // `connexion.ts`) repart sur son propre minuteur, indépendamment de `demarrage.ts` — signalé
  // dans le rapport de la tâche 5 comme réserve non traitée. Avant le correctif de cette tâche
  // (`Connexion.reconnecter`), un jeton de rafraîchissement révoqué APRÈS une connexion établie
  // faisait mourir cette boucle au tout premier échec (rejet non intercepté, aucune nouvelle
  // tentative), sans jamais afficher `erreurDemarrage()` puisque cette boucle ne passe jamais
  // par `tenter()`. Ce test utilise la vraie classe `Connexion` : un double ne peut pas
  // reproduire ce chemin, qui vit entièrement dans son implémentation interne.
  it('une panne durable finit toujours par se voir, meme quand la reconnexion interne echoue indefiniment en silence', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 10, 0, 0));
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('réseau indisponible dans ce test')) as any;
    // Rafraîchissement toujours refusé par HA : jeton de rafraîchissement révoqué.
    const fetchFnHA = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }),
    }) as any;

    try {
      // Jeton valide encore 6 min : le tout premier `connecter()` n'a pas besoin de rafraîchir
      // (marge de 5 min, cf. `doitRafraichir`) — la connexion s'établit d'abord normalement,
      // exactement le scénario visé : « la connexion casse APRÈS avoir été établie ».
      const debut = Date.now();
      const jetons = { access_token: 'a', refresh_token: 'r', clientId: 'c', expires: debut + 6 * 60_000 };
      const stockage = { getItem: () => JSON.stringify(jetons), setItem: vi.fn() } as any;
      const cxReel = new Connexion(jetons, {
        fetchFn: fetchFnHA, origineWs: 'ws://test', WebSocketImpl: FauxWebSocketCapture as any,
      });

      const racine = document.createElement('div');
      await demarrer(racine, piece, {
        stockage, creerConnexion: () => cxReel,
        intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any,
        maintenant: () => new Date(),
      });

      // Connexion établie : un message arrive, marque `dernierMessage`.
      derniereWs!.onmessage!({ data: JSON.stringify({ type: 'auth_ok' }) });
      expect(racine.classList.contains('muet')).toBe(false);

      // 70 s plus tard (au-delà de la marge de rafraîchissement de 5 min avant les 6 min
      // d'expiration : la prochaine reconnexion tombera sur le rafraîchissement révoqué), la
      // connexion casse. La reconnexion interne de `Connexion` (`ws.onclose`) repart seule.
      await vi.advanceTimersByTimeAsync(70_000);
      derniereWs!.onclose!();

      // Elle échoue indéfiniment (jeton révoqué) : on avance largement le temps et on vérifie
      // qu'elle continue de RETENTER (pas une seule fois qui meurt en silence, cf.
      // `Connexion.reconnecter`), sans jamais faire planter le test (aucun rejet non
      // intercepté) ni jamais repasser par `demarrage.ts` (`minuteurFn` n'est jamais sollicité
      // pour une nouvelle tentative : cette boucle est entièrement interne à `Connexion`).
      await vi.advanceTimersByTimeAsync(2 * 60_000);

      expect(fetchFnHA.mock.calls.length).toBeGreaterThan(3);

      // Et pourtant, la panne s'est vue : le minuteur de silence armé une seule fois au tout
      // premier `connecter()` continue de tourner, indépendamment de cette reconnexion cassée —
      // c'est lui, pas elle, qui rend une panne durable visible.
      expect(racine.classList.contains('muet')).toBe(true);
      expect(racine.querySelector('.hors-ligne')?.textContent).toContain('Hors ligne');
      expect(racine.innerHTML.trim()).not.toBe('');

      // Jamais l'écran d'erreur dédié : cette boucle ne passe jamais par `tenter()`, donc
      // `erreurDemarrage()` n'apparaît jamais pour cette panne-là — seul `.hors-ligne`/`.muet`
      // la porte, ce qui est exactement le point de ce test.
      expect(racine.textContent).not.toContain('Connexion impossible');
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.useRealTimers();
      derniereWs = undefined;
    }
  });
});

// Revue tâche 15, mineur M4 : le mode média ampute la grille de commandes (2 au lieu de 4,
// `ordreCommandes`/`combien`, `modes.ts`) parce que la carte média est deux fois plus haute que
// les prévisions qu'elle remplace. Mais sous `horsLigne`, ce n'est PAS la carte média qui occupe
// le bloc central — c'est `rendreHorsLigne()`, du gabarit d'une alerte, moitié moins haut. La
// grille restait pourtant amputée : l'écran perdait Porte et Rideau et gagnait ~90 px de blanc,
// au moment précis où la maison ne répond plus et où le peu qui reste tapable compte le plus.
describe('revue tâche 15 (M4) — la grille de commandes ne reste pas amputée sous hors-ligne', () => {
  const pieceAvecMedia: Piece = {
    nom: 'Salon', temperature: 'sensor.capteur_humain_temperature',
    // Trois ambiances DÉLIBÉRÉES depuis le 2026-08-29 : c'est ce qui fait de cette pièce de
    // laboratoire une pièce à deux commandes en mode média, donc la seule où l'amputation que ce
    // test surveille existe encore. Une pièce sans rangée « Ambiance » (le vrai salon, désormais)
    // garde ses quatre places dans tous les modes — elle ne peut plus rien prouver ici
    // (cf. `rangeeAmbiance`, `modes.ts`). Aucun état à poser pour elles : la rangée du haut n'est
    // pas filtrée par `estUtilisable`, contrairement aux commandes.
    ambiances: [
      { entite: 'scene.a', libelle: 'A', icone: 'sofa', service: ['scene', 'turn_on'] },
      { entite: 'scene.b', libelle: 'B', icone: 'moon', service: ['scene', 'turn_on'] },
      { entite: 'scene.c', libelle: 'C', icone: 'film', service: ['scene', 'turn_on'] },
    ],
    commandes: [
      { entite: 'light.lumiere_salon', libelle: 'Lumières', icone: 'bulb', service: ['light', 'toggle'] },
      { entite: 'climate.radiateur', libelle: 'Chauffage', icone: 'flame' },
      { entite: 'script.porte', libelle: 'Porte', icone: 'porte', service: ['script', 'turn_on'] },
      { entite: 'script.rideau', libelle: 'Rideau', icone: 'rideau', service: ['script', 'turn_on'] },
    ],
    synthese: [], extrasMaison: [], ouvrants: [],
    sources: [{
      nom: 'Musique', titre: ['media_player.ytm'], sousTitre: ['media_player.ytm'],
      affiche: [], progression: ['media_player.ytm'], transport: ['media_player.ytm'],
      volume: ['media_player.ytm'],
    }],
  };

  /** Toutes les entités utilisables, et la musique qui joue : le mode `media` est actif. */
  async function poser(emettre: (e: EvenementEtat) => void) {
    // Salve d'états poussés d'un bloc, comme le `get_states` d'une connexion : une seule vidange
    // à la fin, puisque le redessin est coalescé (`Etat.notifier`).
    for (const [id, etat] of [['light.lumiere_salon', 'off'], ['climate.radiateur', 'off'],
                              ['script.porte', 'off'], ['script.rideau', 'off']] as const) {
      emettre({ entity_id: id, state: etat, attributes: {} });
    }
    emettre({ entity_id: 'media_player.ytm', state: 'playing', attributes: {
      media_title: 'Un morceau', media_position: 10, media_duration: 200, supported_features: 1,
    } });
    await vider();
  }

  it('rend 2 commandes quand la carte média est là, 4 quand hors-ligne la remplace', async () => {
    const racine = document.createElement('div');
    const { cx, declencherSilence, emettre } = connexionAvecSilence();
    await demarrer(racine, pieceAvecMedia, {
      stockage: stockageAvecSession, creerConnexion: () => cx,
      intervalFn: vi.fn() as any, minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 14, 0),
    });
    await poser(emettre);

    // Mode média : la carte est rendue, la grille est légitimement amputée.
    expect(racine.querySelector('.media')).not.toBeNull();
    expect(racine.querySelectorAll('.commandes .commande').length).toBe(2);

    // Trente secondes de silence : la carte média disparaît au profit du bandeau hors-ligne.
    declencherSilence(30_001);
    // Le bloc média est marqué `data-mvt` (tâche 7) : le quitter produit une vraie sortie animée,
    // donc un fantôme temporaire dans `#mvt-fantomes` avant que son `finished` (stub de
    // `setup-animate.ts`, résolu au microtask suivant) ne le relâche.
    await Promise.resolve(); await Promise.resolve();
    expect(racine.querySelector('.media')).toBeNull();
    expect(racine.querySelector('.hors-ligne')).not.toBeNull();
    // …donc la place qu'elle prenait est rendue : les quatre commandes reviennent.
    expect(racine.querySelectorAll('.commandes .commande').length).toBe(4);
    const libelles = Array.from(racine.querySelectorAll(".commandes .commande .t")).map((e) => e.textContent);
    expect(libelles).toContain('Porte');
    expect(libelles).toContain('Rideau');

    // Et au retour de la connexion, l'amputation revient avec la carte : pas d'effet de bord.
    declencherSilence(0);
    expect(racine.querySelector('.media')).not.toBeNull();
    expect(racine.querySelectorAll('.commandes .commande').length).toBe(2);
  });
});
