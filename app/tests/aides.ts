/** Fabriques partagées par les suites qui montent RÉELLEMENT `demarrer()` (`tests/demarrage.test.ts`,
 *  `tests/orchestration.test.ts`, `tests/navigation.test.ts`, `tests/pannes.test.ts`).
 *
 *  Ce fichier ne contient AUCUN test : nommé `aides.ts` et non `aides.test.ts` pour que vitest ne
 *  le ramasse pas comme une suite vide. */
import { vi } from 'vitest';
import { demarrer, type ConnexionLike } from '../src/demarrage';
import type { Ecran } from '../src/ecran';
import type { EvenementEtat } from '../src/connexion';
import type { Prevision } from '../src/meteo';

/** Pièce sans rien à afficher : les suites qui testent l'orchestration elle-même (session
 *  absente, reconnexion, grisage) n'ont besoin d'aucune commande ni d'aucune source. */
export const ecranVide: Ecran = {
  nom: 'Salon', temperature: 'sensor.capteur_humain_temperature',
  ambiances: [], commandes: [], synthese: [], extrasMaison: [],
  sources: [], ouvrants: [],
};

export const jetons = { access_token: 'a', refresh_token: 'r', expires: 0, clientId: 'c' };
export const stockageAvecSession = { getItem: () => JSON.stringify(jetons), setItem: vi.fn() } as any;
export const stockageSansSession = { getItem: () => null, setItem: vi.fn() } as any;

/** Double minimal de `Connexion` : ne construit aucun WebSocket, se contente de résoudre ou de
 *  rejeter `connecter()` sur commande selon une séquence — exactement ce dont `demarrer()` a
 *  besoin pour être testé sans réseau ni navigateur réel. Depuis la ronde de correction 2,
 *  `creerConnexion` n'est appelé qu'une seule fois par `demarrer()` (plus une fois par
 *  tentative) : c'est `connecter()` lui-même qui doit varier d'un appel à l'autre pour simuler
 *  un échec suivi d'une réussite.
 */
export function connexionFactice(...sequence: ('succes' | 'echec')[]): ConnexionLike {
  let i = 0;
  return {
    connecter: () => {
      const resultat = sequence[Math.min(i, sequence.length - 1)];
      i++;
      return resultat === 'succes'
        ? Promise.resolve()
        : Promise.reject(new Error('Rafraîchissement refusé : 400'));
    },
    surChangement: (_cb: (e: EvenementEtat) => void) => {},
    // Depuis la tâche 7, `ConnexionLike` porte aussi `appelerService` (retour optimiste,
    // cf. `interaction.ts`) : aucun des tests existants n'appuie sur une tuile, donc ce double
    // n'a jamais besoin de faire autre chose que satisfaire le type.
    appelerService: (_domaine: string, _service: string, _donnees: Record<string, unknown>) => {},
    // Depuis la tâche 9, `ConnexionLike` porte aussi `surSilence` : aucun des tests qui utilisent
    // ce double ne teste le grisage, donc pas besoin de faire autre chose que satisfaire le type.
    surSilence: (_cb: (ms: number) => void) => {},
    listerTaches: async () => [],
    // Lot 6 : `ConnexionLike` porte aussi `envoyerCommande` (les trois commandes `home_stock/*` de
    // la vue « Recette »). Aucun des tests qui utilisent ce double n'ouvre cette vue : rejeter est
    // la réponse la plus honnête — c'est ce que fait `Connexion` sur une socket fermée.
    envoyerCommande: async () => { throw new Error('websocket indisponible'); },
  };
}

/** Ce que le double de `fetch` doit répondre. Tout ce qui n'est pas déclaré ici répond 404 :
 *  `chargerMeteo`/`chargerAgenda` doivent traverser une absence de donnée sans casser l'écran,
 *  et c'est le cas par défaut d'un test qui ne s'intéresse pas à la météo. */
export type ReponsesReseau = {
  /** Prévisions `daily`, TELLES QUELLES. Revue tâche 12 : ce double rendait auparavant un
   *  `[aujourd'hui, demain]` fabriqué à partir d'un seul `demain`, ce qui encodait l'hypothèse
   *  « la 2e entrée est le lendemain » — le double ne pouvait donc pas contredire le code. Il
   *  rend maintenant la liste que le test lui donne, y compris une liste sans le jour courant. */
  quotidien?: Prevision[];
  /** Par entité de calendrier, les événements bruts renvoyés par `/api/calendars/...`. */
  calendriers?: Record<string, { resume: string; debut: string }[]>;
};

let restaurerFetch: (() => void) | undefined;

function reponse(corps: unknown) {
  return { ok: true, status: 200, json: async () => corps } as unknown as Response;
}

/** Remplace `globalThis.fetch` par un double hors ligne. Jamais de vraie requête depuis un test :
 *  `chargerMeteo` vise une URL relative, qui lèverait dans jsdom (rattrapé silencieusement) — on
 *  ne saurait alors pas distinguer « la météo n'a rien répondu » de « le double n'a pas été
 *  posé ». */
export function installerReseau(r: ReponsesReseau = {}): void {
  restaurerReseau();
  const original = globalThis.fetch;
  restaurerFetch = () => { globalThis.fetch = original; };
  globalThis.fetch = (async (url: RequestInfo | URL, _init?: RequestInit) => {
    const u = String(url);
    // Tâche 14 : plus qu'un seul type de prévision demandé (`daily`) depuis que le mode
    // `previsions` (`hourly`) a disparu — `chargerMeteo` (`demarrage.ts`) ne demande plus jamais
    // `hourly`, ce double n'a donc plus besoin de le distinguer.
    if (u.includes('/api/services/weather/get_forecasts')) {
      return reponse({ service_response: { 'weather.maison': { forecast: r.quotidien ?? [] } } });
    }
    const cal = /\/api\/calendars\/([^?]+)/.exec(u);
    if (cal) {
      const evts = r.calendriers?.[decodeURIComponent(cal[1])] ?? [];
      return reponse(evts.map((e) => ({ summary: e.resume, start: { dateTime: e.debut } })));
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
}

export function restaurerReseau(): void {
  restaurerFetch?.();
  restaurerFetch = undefined;
}

/** Laisse les chargements en vol (météo, agenda) se terminer. Des micro-tâches seulement, jamais
 *  un `setTimeout` : ces suites figent parfois l'horloge (`vi.useFakeTimers`) pour aligner
 *  `Date.now()` sur le `maintenant` injecté, et un minuteur réel ne partirait alors jamais. */
export async function vider(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

export type OptionsMontage = {
  /** Par défaut le 1er août 2026 à 14 h : jamais la nuit (`momentDuJour`), donc l'écran normal —
   *  celui dont l'orchestration des modes décide le contenu. */
  maintenant?: () => Date;
  reseau?: ReponsesReseau;
  /** Tâche 14 : réponses de `Connexion.listerTaches` (commande websocket `todo/item/list`), par
   *  entité — les listes de la vue « Tâches » et le bloc d'entretien. Une entité absente d'ici répond `[]`, jamais une exception (même défaut par
   *  entité qu'avant cette option : tous les tests existants qui ne s'en servent pas restent
   *  inchangés). */
  taches?: Record<string, { uid: string; texte: string }[]>;
  /** Lot 6 : les réponses de `Connexion.envoyerCommande`, par `type` de commande websocket —
   *  `home_stock/recipe/get`, `home_stock/meal/preview`, `home_stock/meal/validate`. Un `type`
   *  absent d'ici REJETTE (comme une socket fermée), jamais ne résout dans le vide : un test qui
   *  ouvrirait la vue « Recette » sans déclarer ses réponses doit le voir, pas obtenir un écran
   *  vide silencieux. */
  commandes?: Record<string, (charge: Record<string, unknown>) => unknown>;
  /** Lot 6 : états poussés JUSTE APRÈS le montage, avant que le test ne reprenne la main. Le repas
   *  suivant vient d'un attribut d'entité : sans un état posé, la cuisine n'a rien à montrer — ce
   *  qui est l'état ORDINAIRE de cette installation, donc le défaut de cette aide. */
  etats?: [string, string, Record<string, unknown>?][];
  /** Stockage du navigateur. Par défaut, une session ouverte et rien d'autre ; un test de reprise
   *  y pose en plus l'étape mémorisée (`CLE_RECETTE`, `src/recette-en-cours.ts`). */
  stockage?: Storage;
};

export type Montage = {
  racine: HTMLElement;
  /** Pousse un état comme le ferait le websocket (rappel `surChangement` du double). */
  pousser: (id: string, etat: string, attributs?: Record<string, unknown>) => Promise<void>;
  /** Déclenche le rappel `surSilence` du double, comme `tests/pannes.test.ts` le fait en ligne. */
  silence: (ms: number) => void;
  appelerService: ReturnType<typeof vi.fn>;
  minuteurFn: ReturnType<typeof vi.fn>;
  intervalFn: ReturnType<typeof vi.fn>;
  /** Lot 6 : le double de `Connexion.envoyerCommande`, exposé en ESPION — c'est lui qui prouve
   *  « deux lectures à l'ouverture, jamais une de plus », et « rien n'est envoyé hors ligne ». */
  envoyerCommande: ReturnType<typeof vi.fn>;
  /** Tâche 17 bis : le double de `Connexion.listerTaches`, exposé en ESPION. Sans lui, un test ne
   *  peut prouver que ce qui est VISIBLE — et la question posée par le rechargement sur état
   *  poussé est justement « combien de requêtes cet écran envoie-t-il ? », pas seulement « que
   *  montre-t-il ? ». C'est ce qui permet d'exiger qu'un état identique republié (rafraîchissement
   *  massif après reconnexion) ne relance RIEN : une boucle de rechargement ne se voit pas à
   *  l'écran, elle ne se voit qu'au compteur d'appels. */
  listerTaches: ReturnType<typeof vi.fn>;
};

/** Monte `demarrer()` sur un `#app` neuf, avec toutes ses dépendances injectées et aucun minuteur
 *  réel. Rend de quoi pousser un état, simuler un silence et inspecter les appels de service. */
export async function monterDemarrage(piece: Ecran, options: OptionsMontage = {}): Promise<Montage> {
  installerReseau(options.reseau ?? {});
  const racine = document.createElement('div');
  let emettre: (e: EvenementEtat) => void = () => {};
  let silencer: (ms: number) => void = () => {};
  const appelerService = vi.fn();
  const minuteurFn = vi.fn();
  const intervalFn = vi.fn();
  // Lit `options.taches` À CHAQUE APPEL (jamais une copie figée au montage) : c'est ce qui permet
  // à un test de changer la liste « côté Home Assistant » pendant que l'écran est allumé, puis de
  // prouver que tel ou tel déclencheur la voit — cf. les tests de fraîcheur du bloc d'entretien.
  const listerTaches = vi.fn(async (entite: string) => options.taches?.[entite] ?? []);
  // Lit `options.commandes` À CHAQUE APPEL, même raison que `listerTaches` : un test peut changer
  // ce que « répond Home Assistant » pendant que l'écran est allumé.
  const envoyerCommande = vi.fn(async (charge: Record<string, unknown>) => {
    const reponse = options.commandes?.[String(charge.type)];
    if (!reponse) throw new Error(`commande non doublée : ${String(charge.type)}`);
    return reponse(charge);
  });

  await demarrer(racine, piece, {
    stockage: options.stockage ?? stockageAvecSession,
    creerConnexion: () => ({
      connecter: () => Promise.resolve(),
      surChangement: (cb) => { emettre = cb; },
      appelerService,
      surSilence: (cb) => { silencer = cb; },
      listerTaches,
      envoyerCommande,
    }),
    intervalFn: intervalFn as any,
    minuteurFn: minuteurFn as any,
    maintenant: options.maintenant ?? (() => new Date(2026, 7, 1, 14, 0)),
  });
  await vider();

  for (const [id, valeur, attributs] of options.etats ?? []) {
    emettre({ entity_id: id, state: valeur, attributes: attributs ?? {} });
    await vider();
  }

  return {
    racine,
    // Depuis la coalescence des redessins (`Etat.notifier`, cf. `src/etat.ts`), pousser un état
    // n'écrit plus le DOM dans la foulée : le rendu a lieu à la microtâche suivante. L'aide
    // absorbe ce détail pour les tests (`await m.pousser(...)`), plutôt que de le faire répéter
    // à chaque site d'appel — un `await vider()` oublié rendrait un test faussement vert.
    pousser: async (id, etat, attributs = {}) => {
      emettre({ entity_id: id, state: etat, attributes: attributs });
      await vider();
    },
    silence: (ms) => silencer(ms),
    appelerService, minuteurFn, intervalFn, listerTaches, envoyerCommande,
  };
}
