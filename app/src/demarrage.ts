/** Orchestration du démarrage d'un écran mural : lit la session, ouvre la connexion HA, dessine
 *  le bandeau, et rattrape *tout* échec pour ne jamais laisser `#app` vide (ronde de correction
 *  1 — un mur blanc, sans message, n'aide personne). Isolé d'`index.ts` pour être testable sans
 *  dépendre d'un vrai WebSocket : voir `ConnexionLike` et `DependancesDemarrage`. */
import { html, render, type TemplateResult } from 'lit';
import { Connexion, lireJetons, delaiReconnexion, type Jetons, type EvenementEtat } from './connexion';
import { intervalFnParDefaut, minuteurFnParDefaut } from './minuteurs';
import { Etat } from './etat';
import { momentDuJour, alerteActive, type Moment } from './contexte';
import type { Ecran } from './ecran';
import { resoudreAgencement } from './agencement';
import { rendreBandeau } from './rendu/bandeau';
import { rendreCorps, brancherAppui, brancherGeste, rendreAlerte, rendreHorsLigne } from './rendu/corps';
import { rendreNuit } from './rendu/nuit';
import { rendreMaison, brancherAppuiMaison, brancherGesteMaison } from './rendu/maison';
import { rendreTaches, brancherCochageTaches } from './rendu/taches';
import { creerAppui, type ConnexionAppelable } from './interaction';
import { creerGeste } from './geste';
import { listesTachesPiece, aplatirTaches, repartirTaches, creerCochage, creerArmement } from './cochage';
import { collecterAlertes, dernierMouvement } from './alertes';
import type { Prevision } from './meteo';
// Tâche 12 : tout ce qui suit a été construit par les tâches 1 à 11 et n'était appelé par
// personne. C'est ici, et nulle part ailleurs, que le câblage se fait — les fonctions de rendu
// restent des fonctions de présentation, et les modules de décision restent purs.
import { modePrincipal, modulateursActifs, type ContexteModes } from './modes';
import { resoudreSource, type SourceResolue } from './media';
import { pastilleBandeau, estCeJour, type Evenement } from './agenda';
import { rendreCarteMedia, brancherMedia } from './rendu/media';
import { rendreMenage, rendreAeration, brancherModes } from './rendu/modes';
import { estInstantDelorean, varianteDelorean, rendreDelorean, vitesseDelorean,
         DUREES_DELOREAN, type VarianteDelorean } from './rendu/delorean';
import { niveauDemande, type Niveau } from './mouvement';
import { creerMoteur } from './mouvement/moteur';
import { ancrerProgression, fractionAncree, type Ancre } from './progression';
// Tâche 8 : `formaterRestant`/`restantAncre` (logique pure, `minuteur.ts`) et `ecrireTemps`
// (seule écriture DOM en dehors d'un rendu `lit`, `rendu/minuteur.ts`) alimentent le tic d'une
// seconde `tictacMinuteurs`, ci-dessous, sur le même patron que `tictacProgression`.
import {
  listerMinuteurs, premierSlotLibre, bornerDuree, dureeHms, hms, ancrerMinuteur,
  restantAncre, formaterRestant, type AncreMinuteur,
} from './minuteur';
import { rendreMinuteurs, rendreReglageMinuteur, tuileMinuteur, brancherMinuteur, ecrireTemps } from './rendu/minuteur';
// Tâche 9 bis : la voiture prend le bloc central du salon, à la place des six prochaines heures
// (demande du propriétaire, 2026-08-03). Même patron que le réglage de minuteur ci-dessus : état
// local de retour optimiste + jeton, câblé sous la garde `initialise`.
import { rendreVoiture, brancherVoiture, type EnVolClim } from './rendu/voiture';
// Tâche 14 : les deux blocs qui remplacent les six prochaines heures en cuisine et au bureau —
// fonctions de présentation pures, comme `rendreVoiture` ci-dessus. `demarrage.ts` leur fournit
// leurs données (`repas`/`evenements`, ci-dessous) selon `agencement.blocDefaut` (`agencement.ts`).
// Tâche 17 : `rendreEntretien` est le REPLI des deux précédents (l'un comme l'autre rendent
// `undefined` le plus clair du temps sur cette installation) — même contrat, mêmes données déjà
// chargées (`taches[ENTITE_ENTRETIEN]`, cf. `chargerTaches`).
// Lot 6 (2026-08-21) : le bloc affiche le repas SUIVANT lu dans les ATTRIBUTS de
// `sensor.home_stock_next_meal` (`repasSuivant`, `src/garde-manger.ts`), ou l'étape en cours quand
// une recette est réduite (`rendreRecetteReduite`). Plus aucune lecture périodique : la donnée
// arrive par `subscribe_events`, déjà coalescée par `Etat.notifier`.
import { rendreRepasSuivant, rendreRecetteReduite, rendreProchainRdv, rendreEntretien,
         ENTITE_ENTRETIEN } from './rendu/defaut';
import { repasSuivant, CAPTEUR_REPAS, type RepasSuivant } from './garde-manger';
import { decouperPages, pagesDepuisEtapes, type EtapeRecette } from './recette';
import {
  brancherRecette, rendreVueRecette, reScinder, etendreIndexSource, etapeSource,
  type LigneIngredient, type VueRecette,
} from './rendu/recette';
import { ecrireRecette, effacerRecette, lireRecette } from './recette-en-cours';

/** Tâche 9 : au-delà de ce silence (aucun message websocket, `Connexion.dernierMessage` figé),
 *  l'écran est considéré périmé. L'ancien montage Lovelace se vidait après un redémarrage de
 *  HA, laissant un écran troué pendant que les entités restaient muettes environ une minute ;
 *  30 s garde une marge sous ce délai typique tout en évitant de griser sur un simple aller-
 *  retour réseau (le silence entre deux `state_changed` normaux est bien inférieur à ça). */
const SEUIL_MUET_MS = 30_000;

/** Tâche 12 : les quatre calendriers personnels de l'installation (relevés dans
 *  `ha_sync/entities/calendar.json`). `calendar.radarr*`, les calendriers d'inventaire,
 *  `calendar.workday_sensor_calendrier` et les jours fériés en sont volontairement absents : ce
 *  ne sont pas des rendez-vous, et un mur n'a rien à dire d'une sortie Blu-ray.
 *  `calendar.anniversaires` est marqué à part — il a sa propre priorité dans `pastilleBandeau`. */
const CALENDRIERS = ['calendar.anniversaires', 'calendar.famille',
                     'calendar.personnel', 'calendar.professionnel'];

/** Cadence de rafraîchissement du compteur de vitesse pendant la scène `voyage`. 120 ms : plus
 *  fin, l'œil ne distingue plus les paliers d'un afficheur à segments, et chaque tic est un
 *  `dessiner()` complet. Les DURÉES des scènes, elles, viennent de `DUREES_DELOREAN`
 *  (`rendu/delorean.ts`) — écrites à un seul endroit, partagées avec les animations CSS. */
const CADENCE_COMPTEUR_MS = 120;

/** Revue tâche 15 (I1) : cadence du rail de progression média. Une seconde — la plus petite
 *  granularité que l'œil distingue sur un rail de 279 px pour un morceau de 4 minutes (un pixel
 *  toutes les ~0,9 s), et 20 fois moins de travail que `dessiner()` n'en ferait en redessinant.
 *  Ce tic n'écrit QU'UNE propriété personnalisée CSS sur un élément déjà rendu (`--progression`,
 *  qui pilote un `background-image`) : aucun rendu `lit`, aucun recalcul de mise en page. Même
 *  mécanisme que le retour optimiste de `--niveau` sur `.media-rail` (`rendu/media.ts`). */
const PAS_PROGRESSION_MS = 1_000;

/** Retour automatique à l'accueil après une inactivité tactile — 45 s, la même constante pour
 *  les trois sous-vues (« Toute la maison », « Tâches », et depuis la tâche 10 bis le réglage de
 *  minuteur `#minuteur`, cf. `armerRetour`) : un seul chiffre à changer si la règle évolue un
 *  jour. */
const RETOUR_MS = 45_000;

/** `#recette` est la SEULE sous-vue exemptée de `RETOUR_MS` : on y lit une recette pendant qu'on
 *  cuisine, et 45 s d'inactivité tactile sont la normale devant une casserole. Son repli à 30 min
 *  ne FERME pas la recette, il la RÉDUIT (hash remis à vide, `recetteUid` intact) : l'écran mural
 *  revient à l'accueil sans faire perdre l'étape. C'est la péremption de 4 h de
 *  `src/recette-en-cours.ts` qui finit par oublier, jamais ce repli. */
const RETOUR_RECETTE_MS = 30 * 60_000;

/** L'horloge MONOTONE du rail. `performance.now` et non `Date.now` : le rail doit survivre à un
 *  saut d'horloge (et rester mesurable par `outils/verifier-rendu.mjs`, qui fige `Date`).
 *  Repli sur `Date.now` pour un environnement sans `performance` — jamais une erreur. */
const horlogeMonotone = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Date.now();

/** Ce que `demarrer` attend d'une connexion : juste assez pour ne pas dépendre de la classe
 *  concrète `Connexion`, afin de pouvoir la remplacer par un double dans les tests (jeton de
 *  rafraîchissement révoqué, coupure réseau...) sans construire un vrai WebSocket.
 *  `ConnexionAppelable` (donc `appelerService`) est nécessaire depuis la tâche 7 : c'est par
 *  cette interface, pas par la classe concrète `Connexion`, que `creerAppui` (`interaction.ts`)
 *  reçoit de quoi appeler un service — ses champs privés interdiraient tout double de test. */
export type ConnexionLike = {
  connecter(): Promise<void>;
  surChangement(cb: (e: EvenementEtat) => void): void;
  // Tâche 9 : `surSilence` existe sur `Connexion` depuis la tâche 3 (armé une seule fois par
  // `connecter()`) mais n'était consommé nulle part — le minuteur tournait dans le vide. C'est
  // le seul signal qui continue de fonctionner même quand la reconnexion interne de `Connexion`
  // est cassée pour de bon (jeton de rafraîchissement révoqué après une connexion déjà établie :
  // sa boucle de reprise contourne `tenter()` et n'affiche donc jamais `erreurDemarrage()`, voir
  // le commentaire de `Connexion.reconnecter` dans `connexion.ts`) : c'est lui qui garantit
  // qu'une panne durable finit toujours par se voir.
  surSilence(cb: (ms: number) => void): void;
  // Tâche 18 : nécessaire à `chargerTaches` ci-dessous (vue « Tâches »), qui liste le contenu de
  // chaque `todo.*` de la pièce via `Connexion.listerTaches` (`connexion.ts`) — même raison que
  // `surSilence` à la tâche 9 : un membre de plus sur cette interface restreinte, jamais la classe
  // concrète `Connexion` (dont les champs privés interdiraient tout double de test léger).
  listerTaches(entite: string): Promise<{ uid: string; texte: string }[]>;
  /** Lot 6 : les trois commandes `home_stock/*` de la vue « Recette » (`recipe/get`,
   *  `meal/preview`, `meal/validate`). `Connexion.envoyerCommande` accepte déjà n'importe quel
   *  `type` websocket et apparie la réponse par `id` — le canal n'a pas eu besoin d'évoluer, seule
   *  cette interface restreinte devait le déclarer. Elle rend une PROMESSE, donc un refus du
   *  serveur (`InsufficientStock`, déjà traduit en français par le composant) est AFFICHABLE —
   *  ce qu'un `appelerService`, envoi sans réponse, ne permet pas. */
  envoyerCommande(payload: Record<string, unknown>): Promise<unknown>;
} & ConnexionAppelable;

export type DependancesDemarrage = {
  stockage: Storage;
  creerConnexion: (jetons: Jetons) => ConnexionLike;
  intervalFn: typeof setInterval;
  minuteurFn: typeof setTimeout;
  maintenant: () => Date;
};

/** Sans session HA ouverte sur la tablette, on explique plutôt que d'afficher du blanc. */
function sessionAbsente(): TemplateResult {
  return html`<div class="cap"><div class="heure">Session</div>
    <div class="phrase">Ouvre Home Assistant sur cette tablette et connecte-toi,
    puis recharge cette page.</div></div>`;
}

/** `connecter()` peut échouer bien après « pas de jeton du tout » : `rafraichir()` lève si HA
 *  refuse le jeton de rafraîchissement (révoqué) ou si le réseau coupe au mauvais moment — ce
 *  qui arrive d'autant plus que le serveur HA est aussi le point d'accès Wi-Fi de la maison.
 *  Sans écran dédié, `render()` n'a jamais lieu et `#app` reste vide : un mur blanc, sans
 *  indice, pour qui passe devant. */
function erreurDemarrage(): TemplateResult {
  return html`<div class="cap"><div class="heure">Connexion impossible</div>
    <div class="phrase">L'écran n'arrive pas à joindre la maison. Ça peut venir du réseau ou
    de la session : une nouvelle tentative va avoir lieu automatiquement. Si ça persiste,
    réouvre Home Assistant sur cette tablette et reconnecte-toi.</div></div>`;
}

/** Démarre l'écran de la pièce donnée dans `racine`. Ne lève jamais : la promesse couvre tout
 *  ce que fait `tenter()`, y compris son initialisation (`creerConnexion`, `surChangement`,
 *  `surMaj`) — ronde de correction 3, où ces trois lignes avaient échappé au `try/catch`. Un
 *  échec de connexion affiche `erreurDemarrage()` puis reprogramme une tentative avec le même
 *  repli exponentiel que la reconnexion websocket (`delaiReconnexion`, 1 s → 30 s plafonné). On
 *  ne sait pas distinguer à l'exécution un jeton révoqué (définitif, il faudra rouvrir une session) d'une
 *  coupure réseau (temporaire, se résout seule) : réessayer indéfiniment couvre les deux sans
 *  intervention humaine sur un écran mural, et le message affiché reste vrai dans les deux cas
 *  (« si ça persiste, reconnecte-toi »). Le compteur d'essais est remis à zéro dès qu'une
 *  tentative réussit, pour qu'une coupure ultérieure reparte d'un délai court. */
export async function demarrer(
  racine: HTMLElement, piece: Ecran, deps: Partial<DependancesDemarrage> = {},
): Promise<void> {
  // Tâche 20 : les jetons de couleur (`--md-*`, `jetons.css`) et le mode jour/nuit (classe
  // `.sombre`) sont scopés à `.m3`, posée statiquement sur `racine` (`#app`) par le HTML de
  // chaque tablette. `html`/`body`, ANCÊTRES de `racine`, n'y ont donc jamais accès par héritage
  // CSS — une propriété personnalisée hérite seulement vers les descendants, jamais vers un
  // ancêtre — ce qui laissait le fond de secours de `base.css` (`html, body`) figé sur son repli
  // fixe, visible en dessous de `#app` sur la bande que la dalle laisserait dépasser sous la
  // hauteur du cadre (`height: 100%` depuis la tâche 18, cf. `base.css`).
  // Poser `.m3` ici aussi, JAMAIS en la retirant de `racine` (purement additif, donc sans risque
  // pour tout sélecteur qui la cible déjà sur `racine`), rend les mêmes jetons visibles depuis la
  // racine du document ; `.sombre` est reflétée ici en même temps que sur `racine`, plus bas dans
  // `dessiner()`, à chaque redessin. Posé avant tout retour anticipé (session absente, erreur de
  // connexion) : ces écrans de repli aussi profitent du bon fond, pas seulement l'écran normal.
  document.documentElement.classList.add('m3');

  const d: DependancesDemarrage = {
    stockage: deps.stockage ?? localStorage,
    creerConnexion: deps.creerConnexion ?? ((jetons) => new Connexion(jetons)),
    // Source unique de ce `.bind(globalThis)` : `./minuteurs.ts` (ronde de correction 2, voir son
    // docstring). Même piège que `connexion.ts` — `d.intervalFn`/`d.minuteurFn` sont toujours
    // appelés via accès propriété (`d.intervalFn(...)`), jamais nus.
    intervalFn: deps.intervalFn ?? intervalFnParDefaut,
    minuteurFn: deps.minuteurFn ?? minuteurFnParDefaut,
    maintenant: deps.maintenant ?? (() => new Date()),
  };

  const jetonsLus = lireJetons(d.stockage);
  if (!jetonsLus) {
    render(sessionAbsente(), racine);
    return;
  }
  // TypeScript ne propage pas le rétrécissement de type de la garde ci-dessus jusque dans la
  // fermeture `tenter()` définie plus bas (limitation connue de l'analyse de flux à travers les
  // frontières de fonction) : `jetons` capture la valeur déjà garantie non nulle dans une
  // constante à part, pour que `tenter()` n'ait pas besoin d'une assertion `!`.
  const jetons: Jetons = jetonsLus;

  // Ronde de correction 2 : une seule instance de `Connexion` (et d'`Etat`) pour toute la durée
  // de vie de la page — pas une par tentative. `connecter()` arme un `setInterval` de
  // surveillance du silence (`armerSurveillanceSilence()`) *avant* la ligne qui peut lever
  // (`rafraichir()`) ; la garde `silenceArme` posée à la tâche 3 empêche bien un double
  // armement sur une même instance, mais ne protège rien contre des instances neuves. Recréer
  // `cx` à chaque échec (jeton révoqué, coupure Wi-Fi persistante — le serveur HA est aussi le
  // point d'accès de la maison) laissait donc derrière chaque tentative un minuteur définitif,
  // fermé sur une instance abandonnée jamais collectée. Réutiliser la même instance fait jouer
  // la garde comme prévu : un seul minuteur, quel que soit le nombre d'échecs. Même raisonnement
  // pour `surChangement`/`surMaj` : enregistrés une seule fois, pas à chaque tentative, pour ne
  // pas faire grossir indéfiniment les tableaux de rappels internes de `Connexion` et `Etat`.
  //
  // Ronde de correction 3 : `creerConnexion`/`surChangement`/`surMaj` s'exécutaient hors de tout
  // `try/catch` — s'ils lèvent (ils ne devraient pas avec la fabrique par défaut, qui ne touche
  // que des globales toujours présentes dans un navigateur, mais rien ne l'interdit à un
  // `creerConnexion` injecté), `demarrer()` rejette sans qu'aucun `render()` n'ait lieu : le
  // mur blanc de la ronde 1, revenu trois lignes plus haut. `initialise` déplace cette
  // initialisation *dans* `tenter()`, sous garde pour qu'elle ne s'exécute qu'une seule fois
  // même en cas de succès tardif après plusieurs échecs — sans quoi on recréerait `cx` à
  // chaque tentative et on réintroduirait la fuite de la ronde 2. Si c'est l'initialisation
  // elle-même qui échoue, elle est retentée à la prochaine relance (elle n'a pas pu passer
  // `initialise` à `true`) ; comme `connecter()` n'est jamais atteint dans ce cas, aucun
  // minuteur n'est armé, donc aucune fuite non plus dans cette branche.
  let etat!: Etat;
  let cx!: ConnexionLike;
  // Tâche 18 : `cochage` doit être visible de `dessiner()` (plus bas, hors de `tenter()`) — même
  // raison que `etat`/`cx` juste au-dessus : déclaré ici en `let`, assigné dans `tenter()` sous la
  // garde `initialise`, jamais un `const` local à `tenter()` qui resterait invisible ailleurs.
  let cochage!: ReturnType<typeof creerCochage>;
  // Lot 6 : l'armement à deux appuis de « Terminer » (`creerArmement`, `cochage.ts`). Valider un
  // repas décrémente le stock et N'EST PAS RÉVERSIBLE depuis le mur — même mécanisme que cocher
  // une tâche, jamais un appui long. Même invariant « une seule instance pour toute la page » que
  // `cochage`/`appui`/`geste`, donc même patron : déclaré ici en `let`, assigné dans `tenter()`
  // sous la garde `initialise` (il dépend de `d.minuteurFn`).
  let armementRepas!: ReturnType<typeof creerArmement>;
  let initialise = false;
  let essai = 0;

  // Tâche 3 du plan 2 : résolu UNE SEULE fois, même raison exactement que `listesPiece`
  // ci-dessous — `piece` ne change jamais pour la durée de vie de la page, et `resoudreAgencement`
  // est pure. Calculé ici, avant `tenter()`, pour que les lecteurs qui vivent hors de `dessiner()`
  // (le filet de rechargement de l'entretien, l'intervalle de repli des tâches, plus bas) y aient
  // accès sans le résoudre une seconde fois — un second point de résolution serait un second
  // défaut susceptible de diverger, exactement le défaut que `resoudreAgencement` existe pour
  // proscrire (cf. son docstring, `agencement.ts`).
  const agencement = resoudreAgencement(piece);
  // Tâche 18 : listes `todo.*` de cette pièce (synthèse + `extrasMaison`, cf. `cochage.ts`) —
  // calculées une seule fois : `piece` ne change jamais pour la durée de vie de la page.
  const listesPiece = listesTachesPiece(piece);
  // Cache brut des tâches actives par liste, alimenté par `chargerTaches` ci-dessous (requête
  // websocket à part, `todo/item/list` n'a pas d'équivalent poussé par `subscribe_events` —
  // aucune tâche cochée ailleurs, par exemple depuis l'appli Home Assistant, ne serait autrement
  // reflétée ici avant la prochaine visite de la vue). Vide au tout premier rendu, avant que la
  // première requête n'ait eu le temps de répondre — la vue affiche alors « Aucune tâche »
  // brièvement plutôt qu'un écran cassé, même discipline que `jours` ci-dessous.
  let taches: Record<string, { uid: string; texte: string }[]> = {};

  /** Ce qui est prévu à manger. Lot 6 : plus une variable ALIMENTÉE par une requête, mais une
   *  valeur DÉRIVÉE d'`Etat` — `repasCourant()` la recalcule à chaque redessin, gratuitement, à
   *  partir des attributs de `sensor.home_stock_next_meal`. Plus aucun `setInterval`, plus aucune
   *  lecture HTTP : le bloc suit `subscribe_events`, déjà coalescé (`Etat.notifier`).
   *
   *  `repasInjecte` est le point d'entrée du vérificateur de rendu (`__injecterRepas`, garde
   *  `?essai=1` seulement) : `undefined` = aucune injection, `null` = pas de repas, un objet =
   *  ce repas-là. Trois états et non deux — sans le troisième, le contrôle ne pourrait pas
   *  distinguer « je n'injecte rien » de « j'injecte l'absence ». */
  let repasInjecte: RepasSuivant | null | undefined;

  /** Le repas suivant tel que l'écran doit le montrer MAINTENANT. PUR (`repasSuivant` reçoit
   *  `Etat` et l'horloge), donc rappelable à volonté sans rien coûter. */
  function repasCourant(): RepasSuivant | undefined {
    if (repasInjecte !== undefined) return repasInjecte ?? undefined;
    return repasSuivant(etat, d.maintenant());
  }

  // La recette en cours — réduite (bloc `rendreRecetteReduite` sur l'accueil) ou ouverte (sous-vue
  // `#recette`). `recetteUid` est l'id de l'entrée `meal_plan`, la même clé que la persistance
  // (`src/recette-en-cours.ts`) : `null` = aucune recette en cours, et c'est LUI qui décide du mode
  // `recette` (cf. `ctx` dans `dessiner()`), jamais le hash — une recette réduite reste « en cours »
  // sur l'accueil. `pagesRecette` est déjà découpée (`decouperPages`), `pageRecette` l'étape lue.
  let recetteUid: string | null = null;
  let pagesRecette: string[] = [];
  let pageRecette = 0;
  /** `pageSourceIndex[i]` = l'index, dans les pages SOURCE (`decouperPages`, avant tout
   *  sous-découpage), dont `pagesRecette[i]` est issue — identité tant que `reScinder` n'a rien
   *  coupé, plusieurs entrées consécutives pointant le MÊME index source après une coupe (round 1,
   *  revue tâche 12) : `pagesRecette` peut être plus fine que les pages source, mais l'étape
   *  PERSISTÉE (`memoriserRecette`) doit rester un index SOURCE — stable après un redémarrage, qui
   *  reconstruit toujours les pages source grossières, jamais la sous-découpe fine d'avant (elle
   *  dépend d'une mesure DOM qu'aucun stockage ne porte). Sans cette table, persister l'index fin
   *  ferait tomber la reprise sur une autre étape que celle réellement quittée. */
  let pageSourceIndex: number[] = [];
  /** L'id du repas (`meal_id`) et celui de la recette (`recipe_id`) réellement ouverts, plus le
   *  nom du plat et l'étiquette relevés À L'OUVERTURE. Relire `repasCourant()` pour les afficher
   *  serait un mensonge en puissance : pendant une cuisson, le capteur peut basculer sur le repas
   *  d'après, et écrire « Demain, petit-déjeuner » au-dessus des étapes du dîner en cours. */
  let mealEnCours: number | null = null;
  let recetteEnCours: number | null = null;
  let platRecette = '';
  let etiquetteRecette = '';
  // Ingrédients du panneau : `undefined` = pas encore chargés (le panneau affiche alors « Aucun
  // ingrédient » une fraction de seconde plutôt qu'un écran cassé, même discipline que `taches`).
  // `pageIngredients` est DISTINCTE de `pageRecette` : la rangée de flèches de la vue est partagée
  // (`rendu/recette.ts`) et pagine l'un ou l'autre selon que le panneau est ouvert — un seul index
  // pour les deux ferait sauter l'étape en tournant les pages d'ingrédients.
  let ingredients: LigneIngredient[] | undefined;
  let panneauIngredients = false;
  let pageIngredients = 0;
  /** Jeton de course pour l'ouverture d'une recette, même patron que `jetonClim` plus bas : un
   *  jeton par ouverture, un seul gagnant. Sans lui, « Terminer » puis rouvrir une AUTRE recette
   *  pendant que les deux lectures de la précédente pendent ferait afficher les étapes d'une
   *  recette étrangère à celle annoncée. */
  let jetonRecette = 0;
  /** Un refus du serveur, déjà traduit en français par le composant (`messages.py`), affiché à la
   *  place de l'étiquette de la vue. `null` = rien à dire. */
  let messageRecette: string | null = null;
  /** La restauration depuis le stockage n'a lieu qu'UNE FOIS : ensuite, `recetteUid` est la vérité
   *  de l'écran, et relire le stockage à chaque changement d'état ressusciterait une recette que
   *  « Terminer » vient de fermer. */
  let recetteRestauree = false;

  // Prévisions météo : chargées à part du websocket (`weather.maison` n'est pas poussé par
  // `subscribe_events` avec ses prévisions), via une requête REST classique. `jours` vit dans
  // cette fermeture pour être lu par `dessiner()` plus bas.
  // Tâche 9, correction 1 (coordinateur, 2026-08-02) : `demain` avait été retiré d'ici, devenu
  // mort une fois `rendreCorps` privé de son paramètre `demain`. Tâche 12 : RÉTABLI, avec la
  // requête `type: 'daily'` qui l'alimente — c'est le repli PERMANENT de la pastille du bandeau
  // (`pastilleBandeau`, `agenda.ts`), la seule chose qui garantit que la colonne droite du
  // bandeau n'est jamais vide sans raison. Sans lui, le vide dont tout ce plan est parti revient.
  // Tâche 13 : `demain` (un seul `Prevision`) devient `jours`, la fenêtre `daily` COMPLÈTE — le
  // repli n'est plus systématiquement « Demain », c'est `pastilleBandeau` qui choisit désormais
  // entre le prochain changement de condition et l'ancien comportement (`prochainChangement`,
  // `agenda.ts`), et il lui faut toute la fenêtre pour ça, pas la seule entrée du lendemain.
  // Tâche 14 : la prévision `hourly` (`horaire`) a disparu d'ici avec le mode `previsions` qui
  // en était le seul lecteur (`rendreCorps`) — plus aucun appelant, cf. `chargerMeteo` ci-dessous.
  let jours: Prevision[] = [];

  // Agenda : chargé à part du websocket comme la météo (`/api/calendars` n'a pas d'équivalent
  // poussé par `subscribe_events`). Vide tant que la première requête n'a pas répondu — la
  // pastille retombe alors sur « Demain », jamais un écran cassé, même discipline que `taches`.
  // Tâche 14 : aussi la source du prochain rendez-vous du bureau (`rendreProchainRdv`,
  // `rendu/defaut.ts`) — mêmes données que la pastille, jamais une seconde requête.
  let evenements: Evenement[] = [];

  // Mouvement (tâche 10, puis tâche 1 du chantier grammaire) : niveau demandé au démarrage —
  // `prefers-reduced-motion` ou `?mouvement=` dans l'URL, FIXE pour toute la durée de la page
  // (le régulateur de cadence qui le dégradait en cours de route a été retiré, cf.
  // `src/mouvement.ts`). `niveauInitial` reste local à `demarrage.ts` (calculé une seule fois, ici,
  // jamais recalculé) parce que DEUX choses hors du moteur — `tictacProgression` et le survol
  // DeLorean, plus bas — en ont encore besoin, elles aussi, comme repli d'urgence sans
  // redéploiement (Fully Kiosk, tâche 9) ; passé TEL QUEL au moteur (`niveauInitial`, option de
  // `creerMoteur`) pour que les deux calculs partagent la même lecture de
  // `location.href`/`matchMedia`, jamais deux appels séparés.
  const niveauInitial: Niveau = niveauDemande(
    location.href,
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  // Créé une seule fois : c'est lui qui porte la mémoire de la peinture précédente d'un
  // `dessiner()` à l'autre (cf. `src/mouvement/moteur.ts`, le piège du relevé).
  const moteur = creerMoteur(racine, { niveauInitial });

  // Clin d'œil DeLorean (tâche 11) : rendu à l'entrée dans l'instant, retiré six secondes plus
  // tard. `arme` empêche d'armer deux minuteurs pour le même instant — `dessiner()` est rappelée
  // par l'horloge, par chaque changement d'entité et par la météo, et `estInstantDelorean` reste
  // vrai toute la minute. Il retombe à `false` dès que l'instant est passé, pour que le prochain
  // (22 h 04, 01 h 21, 21 octobre, 5 novembre) soit à nouveau armable.
  let sceneDelorean: VarianteDelorean | null = null;
  let deloreanArme = false;
  let vitesseAffichee = 0;

  /** Coupe la scène en cours. Appelée par le minuteur de fin, et par le PREMIER CONTACT sur
   *  l'écran (décision du propriétaire, 2026-08-21) : le voile masque la dalle quatre à huit
   *  secondes, et on ne doit jamais avoir à viser à l'aveugle. Ne coupe QUE le survol —
   *  l'événement n'est ni arrêté ni annulé, il poursuit sa route vers la commande qui se trouve
   *  dessous, qui s'exécute normalement. `deloreanArme` n'est PAS remis à faux : sans lui, la
   *  scène se rearmerait au redessin suivant, et l'instant dure une minute entière. */
  const couperDelorean = () => {
    if (sceneDelorean === null) return;
    sceneDelorean = null;
    dessiner();
  };

  // Tâche 9 : bascule sur transition seulement (pas à chaque rappel de `surSilence`, toutes les
  // 5 s) — `dessiner()` n'a besoin d'être rappelée que quand la valeur affichée doit réellement
  // changer, cohérence avec le reste du fichier qui évite d'empiler du travail inutile.
  let horsLigne = false;

  // Tâche 9 (réveil de l'écran de nuit) : l'écran de nuit a été réveillé par un appui — on rend
  // l'écran complet, en palette soir, jusqu'au retour automatique. Local à la page et à dessein,
  // exactement comme `dureeMinuteur`/`etiquetteMinuteur` plus bas : rien de tout cela n'a sa
  // place dans Home Assistant. `jetonReveil` suit le même patron qu'un jeton par geste (cf.
  // `jetonClim` plus bas) : un jeton par appel à `reveiller()`, un seul gagnant, cf. son
  // docstring.
  let reveilNuit = false;
  let jetonReveil = 0;

  // Revue tâche 15 (I1) : le point de départ du rail de progression média, refait à chaque
  // `dessiner()` et consommé par le tic d'une seconde armé dans `tenter()`. `null` = rien à
  // montrer (aucune source, pas de progression publiée, durée nulle) : le rail reste à zéro.
  let ancreProgression: Ancre | null = null;

  // Tâche 7 : ce que le réglage de minuteur propose — ouvert ou non n'est plus tracké ici depuis
  // la tâche 10 bis (l'ouverture/fermeture est portée par `location.hash === '#minuteur'`, comme
  // les deux autres sous-vues). Local à la page et à dessein, c'est un état de quelques secondes,
  // pas une donnée de la maison. La durée initiale, elle, vient de HA
  // (`input_number.duree_minuteur_cuisine`) pour être partagée avec le vocal.
  let dureeMinuteur = 7;
  let etiquetteMinuteur: string | null = null;
  /** Ancre par slot, posée par `dessiner()` et consommée par le tic d'une seconde (tâche 8). */
  let ancresMinuteurs = new Map<number, AncreMinuteur>();

  /** Tâche 9 bis : retour optimiste de la clim de la voiture — ce que l'écran affiche pendant
   *  qu'elle ne répond pas encore. Local à la page et à dessein, exactement comme `dureeMinuteur`
   *  ci-dessus : rien de tout cela n'a sa place dans Home Assistant. `jetonClim` suit le même
   *  patron qu'un jeton par appui (cf. `reveiller`, plus bas) : un jeton par appui, un seul gagnant
   *  — un second appui pendant l'attente ne peut de toute façon rien poser (`brancherVoiture`
   *  ci-dessous refuse tout appui tant que `climEnVol` n'est pas `null`), donc au plus un jeton
   *  vivant à la fois en pratique ; il suit malgré tout le même mécanisme pour rester cohérent
   *  avec le reste du fichier si ce refus venait à changer un jour. */
  let climEnVol: EnVolClim = null;
  let jetonClim = 0;

  /** Tâche 18 : recharge les tâches actives de chaque liste `todo.*` de la pièce. Ne lève jamais
   *  (`Promise.allSettled`, pas un simple `try/catch` autour d'une boucle séquentielle) : une
   *  seule liste indisponible (websocket pas encore ouvert, commande refusée) ne doit ni bloquer
   *  ni périmer les autres — chacune garde son dernier cache connu si sa propre requête échoue,
   *  même discipline que `chargerMeteo` (« une donnée indisponible fait disparaître son bloc,
   *  jamais tout l'écran »). Appelée au démarrage (cache prêt avant le premier appui) et à chaque
   *  entrée sur la vue « Tâches » (fraîcheur), jamais en tâche de fond en continu — cf. réserve du
   *  rapport de tâche 18. */
  async function chargerTaches(): Promise<void> {
    const resultats = await Promise.allSettled(listesPiece.map((e) => cx.listerTaches(e)));
    resultats.forEach((r, i) => { if (r.status === 'fulfilled') taches[listesPiece[i]] = r.value; });
    dessiner();
  }

  /** Ne lève jamais : une météo indisponible (réseau, `weather.maison` non configurée, jeton
   *  pas encore rafraîchi) ne doit pas casser l'écran — ses blocs disparaissent simplement
   *  (règle 4 du brief). Le jeton est relu depuis `d.stockage` à chaque appel plutôt que capturé
   *  une fois : `Connexion.connecter()` peut l'avoir rafraîchi et réécrit dans le stockage entre
   *  temps, et cette fonction est aussi rappelée toutes les 15 minutes par `d.intervalFn`. */
  async function chargerMeteo(): Promise<void> {
    try {
      const j = lireJetons(d.stockage);
      if (j) {
        const entete = { 'Authorization': `Bearer ${j.access_token}`, 'Content-Type': 'application/json' };
        // Tâche 14 : un seul type de prévision depuis que `hourly` (le bloc `previsions`, seul
        // lecteur de `horaire`) a disparu — `daily` reste nécessaire, c'est le repli PERMANENT de
        // la pastille du bandeau (`pastilleBandeau`, `agenda.ts`), cf. `jours` ci-dessus.
        const r = await fetch('/api/services/weather/get_forecasts?return_response=true', {
          method: 'POST', headers: entete,
          body: JSON.stringify({ entity_id: 'weather.maison', type: 'daily' }),
        });
        if (r.ok) {
          const donnees = await r.json();
          // Revue tâche 12, RESTE VRAI À LA TÂCHE 13 : rien ne garantit que l'intégration renvoie
          // le jour courant en tête (Open-Meteo peut le laisser tomber en fin de journée) — mais
          // ce n'est plus ce fichier qui doit s'en méfier. Toute la fenêtre est transmise telle
          // quelle ; c'est `agenda.ts` (`prochainChangement`, `pastilleBandeau`) qui retrouve
          // aujourd'hui et demain par leur DATE, jamais par leur position dans le tableau — un
          // tableau qui ne commencerait pas par aujourd'hui n'y invente donc plus de mensonge.
          jours = donnees.service_response?.['weather.maison']?.forecast ?? [];
        }   // sinon : météo indisponible, le repli disparaît, l'écran vit (règle 4 du brief)
      }
    } catch {
      // fetch indisponible/rejeté (réseau, environnement de test sans réseau...) : mêmes blocs
      // masqués, jamais d'écran cassé — cf. commentaire ci-dessus.
    }
    dessiner();
  }

  /** Le message d'un refus serveur, tel que le composant l'a écrit (`messages.py` traduit déjà en
   *  français). Repli générique si la réponse ne porte rien de lisible : jamais un message vide,
   *  qui laisserait l'écran muet sur un geste qui n'a pas eu lieu. */
  function messageDeRefus(e: unknown): string {
    const m = (e as { message?: unknown })?.message;
    return typeof m === 'string' && m.trim() !== '' ? m : 'La validation a été refusée.';
  }

  /** Les deux lectures de l'ouverture d'une recette, PONCTUELLES — jamais périodiques, c'est la
   *  leçon que l'ancienne source a coûté trois mois. Ne lèvent jamais : `envoyerCommande` rejette
   *  sur une connexion morte, et un `#recette` qui ne peut pas s'ouvrir doit rendre l'accueil, pas
   *  casser l'écran. */
  async function commande(payload: Record<string, unknown>): Promise<unknown | undefined> {
    try {
      return await cx.envoyerCommande(payload);
    } catch {
      return undefined;
    }
  }

  /** Les lignes du plan de décrément, telles que le panneau les LIT. `lines` (ce qui sera
   *  décrémenté) puis `by_hand` (ce que le composant ne sait pas quantifier — à sortir du placard
   *  soi-même) : les deux se cuisinent, les deux s'affichent, dans cet ordre.
   *
   *  `status === 'short'` et non `preview.blocking` : `blocking` est une liste de MOTIFS
   *  (`["short"]`), pas d'ingrédients — elle dit qu'il manque quelque chose, jamais quoi. La
   *  mention « manquant » se pose donc sur la ligne qui la porte. */
  function lignesDuPlan(preview: unknown): LigneIngredient[] {
    const p = (preview ?? {}) as { lines?: unknown; by_hand?: unknown };
    const brutes = [...(Array.isArray(p.lines) ? p.lines : []),
                    ...(Array.isArray(p.by_hand) ? p.by_hand : [])];
    return brutes.map((l) => {
      const o = (l ?? {}) as Record<string, unknown>;
      return {
        nom: String(o.product_name ?? o.raw_text ?? 'Ingrédient'),
        quantite: String(o.label ?? ''),
        manque: o.status === 'short',
      };
    });
  }

  /** Charge une recette et son plan de décrément, puis peuple la vue. DEUX commandes, une seule
   *  fois par ouverture — `home_stock/meal/preview` N'ÉCRIT ABSOLUMENT RIEN (il tourne sur une
   *  connexion en lecture), c'est ce qui autorise à l'appeler à l'ouverture plutôt qu'à
   *  l'armement.
   *
   *  `meal/preview` n'est demandé que si le repas porte un `meal_id` : un composant plus ancien que
   *  ce bundle n'en publie pas, et la recette reste alors consultable — simplement pas validable. */
  async function chargerRecette(recetteId: number, mealId: number | null): Promise<void> {
    const mien = ++jetonRecette;
    const vue = await commande({ type: 'home_stock/recipe/get', recipe_id: recetteId });
    if (mien !== jetonRecette) return;
    const v = (vue ?? {}) as { recipe?: { name?: unknown }; steps?: EtapeRecette[] };
    if (typeof v.recipe?.name === 'string') platRecette = v.recipe.name;
    pagesRecette = pagesDepuisEtapes(v.steps as EtapeRecette[]);
    pageSourceIndex = pagesRecette.map((_, i) => i);   // identité : rien n'a encore été sous-découpé
    const memoire = lireRecette(d.stockage, d.maintenant().getTime());
    pageRecette = memoire?.uid === recetteUid ? bornerEtape(memoire.page) : 0;
    dessiner();
    if (mealId === null) return;
    const preview = await commande({ type: 'home_stock/meal/preview', meal_id: mealId });
    if (mien !== jetonRecette) return;
    ingredients = lignesDuPlan(preview);
    dessiner();
  }

  /** Borne un index d'étape aux pages réellement découpées. Une description vide rend ZÉRO page
   *  (`decouperPages`) : sans ce plancher à 0, `pagesRecette.length - 1` vaudrait −1 et l'écran
   *  afficherait « Étape 0/1 ». */
  function bornerEtape(n: number): number {
    return Math.max(0, Math.min(n, pagesRecette.length - 1));
  }

  /** Ouvre la recette du repas suivant. Appelée par l'écouteur `hashchange` (le bloc de l'accueil
   *  et la tuile « Recette » ne font que poser `#recette`, cf. `rendu/defaut.ts`/`interaction.ts`)
   *  — jamais depuis un rendu.
   *
   *  IDEMPOTENTE tant qu'une recette est en cours : rouvrir une recette RÉDUITE doit retrouver son
   *  étape, c'est toute la différence entre « Réduire » et « Terminer ». Sans ce refus, chaque
   *  retour sur la vue repartirait de la première page.
   *
   *  Une NOTE (« Reste quinoa + légumes ») ou un simple produit n'a pas de recette : rien à ouvrir,
   *  on n'entre pas — le bloc est de toute façon inerte et la tuile masquée dans ce cas. */
  function ouvrirRecette(): void {
    if (recetteUid !== null) return;
    const r = repasCourant();
    if (!r || r.recetteId === null) return;
    // La clé de PERSISTANCE est le `meal_id` quand il y en a un : c'est lui qui identifie CE
    // repas-là, pas la recette (la même recette peut être planifiée deux fois la même semaine).
    // Sans `meal_id` (composant plus ancien que ce bundle), on se rabat sur la recette : la reprise
    // reste possible, la validation non — et l'écran le dit en n'ouvrant pas `meal/preview`.
    recetteUid = r.mealId !== null ? String(r.mealId) : `recette:${r.recetteId}`;
    mealEnCours = r.mealId;
    recetteEnCours = r.recetteId;
    platRecette = r.plat;
    etiquetteRecette = r.etiquette;
    pagesRecette = [];
    pageSourceIndex = [];
    pageRecette = 0;
    ingredients = undefined;
    panneauIngredients = false;
    pageIngredients = 0;
    messageRecette = null;
    void chargerRecette(r.recetteId, r.mealId);
  }

  /** Écrit l'étape courante hors de la page. Android tue régulièrement Fully sur ces Fire 7 : sans
   *  ça, perdre l'app au milieu d'une cuisson coûterait l'étape.
   *
   *  Persiste l'index SOURCE (`pageSourceIndex[pageRecette]`), jamais `pageRecette` brut :
   *  `pageRecette` indexe `pagesRecette`, qui peut être plus fine que les pages source depuis que
   *  `reScinder` sous-découpe — au redémarrage, `ouvrirRecette`/`restaurerRecette` reconstruisent
   *  TOUJOURS les pages source grossières (jamais une sous-découpe qui dépend d'une mesure DOM
   *  absente du stockage). Persister l'index fin ferait reprendre sur la mauvaise étape dès qu'une
   *  sous-découpe a eu lieu avant l'écriture. */
  function memoriserRecette(): void {
    if (recetteUid === null) return;
    const pageSource = pageSourceIndex[pageRecette] ?? pageRecette;
    ecrireRecette(d.stockage, { uid: recetteUid, page: pageSource, majLe: d.maintenant().getTime() });
  }

  /** Oublie la recette en cours — « Terminer », ou un repas qui a disparu du planning. Ne touche
   *  PAS au hash : c'est l'appelant qui décide où l'écran va ensuite. */
  function fermerRecette(): void {
    recetteUid = null;
    mealEnCours = null;
    recetteEnCours = null;
    platRecette = '';
    etiquetteRecette = '';
    pagesRecette = [];
    pageRecette = 0;
    pageSourceIndex = [];
    ingredients = undefined;
    panneauIngredients = false;
    pageIngredients = 0;
    messageRecette = null;
    jetonRecette++;   // toute lecture encore en vol perd la main : elle parle d'une recette fermée
    effacerRecette(d.stockage);
  }

  /** Reprend la recette laissée en cours par l'instance précédente de l'app (redémarrage de la
   *  tablette, ou Fully tué par Android). UNE SEULE FOIS, et seulement si le repas mémorisé est
   *  bien celui que le capteur annonce aujourd'hui : un état périmé (plus de 4 h) est déjà écarté
   *  par `lireRecette` lui-même.
   *
   *  Un capteur encore muet ne CONSOMME PAS la tentative : au démarrage, les entités mettent
   *  environ 70 s à revenir après un redémarrage de Home Assistant, et perdre la reprise pour ça
   *  serait perdre une cuisson en cours. */
  function restaurerRecette(): void {
    if (recetteRestauree || recetteUid !== null) return;
    const r = repasCourant();
    if (!r) return;                       // capteur muet : on retentera au prochain état
    recetteRestauree = true;
    if (r.recetteId === null) return;
    const memoire = lireRecette(d.stockage, d.maintenant().getTime());
    const cle = r.mealId !== null ? String(r.mealId) : `recette:${r.recetteId}`;
    if (memoire?.uid !== cle) return;     // le repas mémorisé n'est plus celui d'aujourd'hui
    ouvrirRecette();                      // `chargerRecette` relit l'étape depuis le stockage
  }

  /** Ne lève jamais, même discipline que `chargerMeteo` : un calendrier indisponible fait
   *  disparaître la pastille personnelle (repli météo — tâche 13, plus systématiquement
   *  « Demain »), jamais l'écran. Les quatre
   *  calendriers sont interrogés en parallèle et leurs résultats fusionnés.
   *
   *  La fenêtre interrogée fait 24 h, alors que `pastilleBandeau` fait confiance à son appelant
   *  pour ne lui transmettre que l'anniversaire DU JOUR : un anniversaire de demain, renvoyé par
   *  la même requête, s'afficherait « Aujourd'hui ». Il est donc écarté ICI, à la source — un
   *  anniversaire n'a pas d'heure, il n'a qu'une date, et rien en aval ne pourrait le rattraper. */
  async function chargerAgenda(): Promise<void> {
    try {
      const j = lireJetons(d.stockage);
      if (j) {
        // `d.maintenant()` et non `new Date()`, comme partout ailleurs dans ce fichier : une seule
        // horloge, injectable, sinon la fenêtre demandée et le filtre du jour peuvent diverger.
        const maintenant = d.maintenant();
        const fin = new Date(maintenant.getTime() + 24 * 3_600_000);
        const entete = { 'Authorization': `Bearer ${j.access_token}`, 'Content-Type': 'application/json' };
        const reponses = await Promise.allSettled(CALENDRIERS.map(async (entite) => {
          const url = `/api/calendars/${entite}`
            + `?start=${maintenant.toISOString()}&end=${fin.toISOString()}`;
          const r = await fetch(url, { headers: entete });
          if (!r.ok) return [];
          const brut = await r.json();
          return (brut as { summary?: string; start?: { dateTime?: string; date?: string } }[]).map((e) => ({
            resume: String(e.summary ?? ''),
            debut: String(e.start?.dateTime ?? e.start?.date ?? ''),
            estAnniversaire: entite === 'calendar.anniversaires',
          }));
        }));
        evenements = reponses
          .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
          .filter((e) => e.resume !== '' && e.debut !== '')
          .filter((e) => !e.estAnniversaire || estCeJour(e.debut, maintenant));
      }
    } catch {
      // même règle que chargerMeteo : la pastille retombe sur son repli météo, l'écran vit
    }
    dessiner();
  }

  async function tenter(): Promise<void> {
    try {
      if (!initialise) {
        etat = new Etat();
        cx = d.creerConnexion(jetons);
        // Tâche 17 bis (relecture indépendante, défaut D1) : l'état de `todo.maintenance` EST
        // poussé, et c'est lui qui déclenche le rechargement des libellés — jamais le seul
        // sondage de 15 min. La liste est réconciliée par une automation HORAIRE
        // (`Maintenance - Synchronisation liste de tâches`) qui ferme et rouvre des tâches en
        // bloc : le compteur de l'entité change dans la seconde, le cache de `chargerTaches`
        // restait périmé jusqu'à un quart d'heure. Le bloc central annonçait alors « Entretien —
        // 3 tâches » avec deux résumés fantômes, et `masquerEntretien` avait justement retiré de
        // la synthèse la SEULE valeur fraîche de l'écran.
        //
        // Trois précautions, chacune payée par un défaut réel :
        //  - sur le CHANGEMENT de valeur, jamais sur la réception : `Etat.appliquer` est rappelé
        //    pour chaque état poussé, y compris le rafraîchissement massif qui suit une
        //    reconnexion (`get_states`, cf. son commentaire) — recharger à chaque réception
        //    ferait une commande websocket par republication, sans qu'aucun libellé n'ait bougé ;
        //  - l'état d'AVANT est lu avant `appliquer`, sinon la comparaison se ferait contre la
        //    valeur qu'on vient d'écrire, ne serait JAMAIS vraie, et plus rien ne rechargerait ;
        //  - `chargerTaches` ne pousse aucun état (elle ne fait qu'écrire le cache puis
        //    `dessiner()`), donc ce rappel ne peut pas se rappeler lui-même : pas de boucle.
        // Gardé aux deux pièces qui rendent réellement ce bloc, même règle exactement que le
        // rappel périodique plus bas : le salon (bloc voiture en toutes circonstances) ne rend
        // jamais ces libellés, et sa vue « Tâches » se recharge déjà à chaque entrée.
        const rechargerSurEtatEntretien = agencement.blocDefaut === 'repas' || agencement.blocDefaut === 'agenda';
        cx.surChangement((e) => {
          const avant = etat.lire(e.entity_id)?.etat;
          etat.appliquer(e);
          if (rechargerSurEtatEntretien && e.entity_id === ENTITE_ENTRETIEN && e.state !== avant) {
            void chargerTaches();
          }
          // Lot 6 : la reprise d'une cuisson interrompue attend le premier état EXPLOITABLE du
          // capteur de repas, jamais le montage — au démarrage d'une tablette, les entités mettent
          // ~70 s à revenir (cf. `SEUIL_MUET_MS`), et tenter la reprise sur un capteur muet la
          // perdrait pour de bon. `restaurerRecette` est idempotente et ne consomme sa tentative
          // que sur une lecture réussie.
          if (e.entity_id === CAPTEUR_REPAS) {
            restaurerRecette();
            // Page rechargée alors que la vue était ouverte (Fully tué par Android, tablette
            // rebootée) : AUCUN `hashchange` n'a lieu dans ce cas, c'est donc ici — au premier
            // repas connu — que la vue reprend la main. Sans ça, l'écran resterait sur l'accueil
            // avec un `#recette` collé au hash, et le bloc ne pourrait même plus rouvrir la
            // recette : reposer le même hash n'émet aucun événement, le contact serait mort.
            if (location.hash === '#recette' && recetteUid === null) {
              ouvrirRecette();
              if (recetteUid === null) location.hash = '';   // rien à ouvrir : jamais un hash mort
            }
          }
        });
        etat.surMaj(dessiner);

        // Tâche 9 : l'écran ne se vide jamais après une coupure — il garde le dernier état connu
        // et le grise, plutôt que de rester figé sans le dire. `cx.surSilence` est rappelé toutes
        // les 5 s par `Connexion` (armé une seule fois, cf. `armerSurveillanceSilence`) tant que
        // l'objet existe — y compris quand sa reconnexion interne est cassée pour de bon (cf.
        // `Connexion.reconnecter` dans `connexion.ts`), puisque ce minuteur ne dépend d'aucune
        // reconnexion réussie. Deux effets distincts, l'un immédiat, l'autre au prochain
        // redessin : `racine.classList.toggle` grise TOUT l'écran (nuit, « Toute la maison »,
        // écran normal) sans attendre `dessiner()` ; `horsLigne` + l'appel à `dessiner()` sur
        // transition seulement affiche en plus le bandeau explicite `.hors-ligne` (écran normal
        // uniquement, cf. priorité dans `dessiner()` ci-dessous) — pas à chaque tic pour ne pas
        // empiler de rendu inutile toutes les 5 s.
        cx.surSilence((ms) => {
          racine.classList.toggle('muet', ms > SEUIL_MUET_MS);
          const nouveau = ms > SEUIL_MUET_MS;
          if (nouveau !== horsLigne) { horsLigne = nouveau; dessiner(); }
        });

        // Tâche 7 : point d'attache du retour tactile optimiste (cf. `interaction.ts`). Le
        // brief illustrait ce branchement dans `index.ts`, mais `etat`/`cx` n'existent que
        // dans cette fermeture — `index.ts` se contente d'appeler `demarrer()` et n'a jamais
        // accès ni à l'un ni à l'autre (cf. docstring de ce fichier : isolé pour être testable
        // sans dépendre d'un vrai WebSocket). `d.minuteurFn` plutôt que `setTimeout` global,
        // par cohérence avec le reste du fichier et pour rester testable sans minuteur réel.
        // Tâche 8 : une seule instance de `creerAppui` partagée entre l'écran de pièce et la
        // vue « Toute la maison » — même invariant « un seul minuteur de retour arrière par
        // entité » (cf. `interaction.ts`) plutôt que deux tables indépendantes qui pourraient
        // désynchroniser une même entité visible sur les deux écrans (ex. `light.lumiere_salon`,
        // présente à la fois dans `piece.commandes` et dans `TOUTE_LA_MAISON`).
        // Tâche 9, ronde de correction 1 : `() => horsLigne` lit la même variable que le
        // callback `cx.surSilence` ci-dessus met à jour — un getter vivant, pas une valeur figée
        // au moment de cet appel (qui a lieu une seule fois, sous la garde `initialise`, bien
        // avant qu'une panne n'ait pu survenir).
        const appui = creerAppui(etat, cx, d.minuteurFn, () => horsLigne);
        brancherAppui(appui);
        brancherAppuiMaison(appui);
        // Tâche 13 : même instance partagée entre les deux écrans que `appui` ci-dessus, même
        // raison (cf. docstring `rendu/maison.ts`) — un seul throttle d'appels de service par
        // entité, jamais deux tables indépendantes qui pourraient se marcher dessus pour une
        // même entité visible sur les deux écrans (ex. `light.lumiere_salon`). `() => horsLigne`
        // : même getter vivant que celui donné à `creerAppui`.
        // Ronde de correction 4 : `d.minuteurFn` en 5e argument (`maintenant` explicitement
        // `undefined` pour garder son défaut `Date.now` — seuls les tests l'écrasent) — même
        // minuteur injectable que `creerAppui`/`armerRetour` ci-dessous, pour que le filet de
        // sécurité du verrou par tuile (`geste.ts`, `DELAI_SECOURS_MS`) reste testable sans
        // minuteur réel, comme tout le reste de ce fichier.
        const geste = creerGeste(etat, cx, () => horsLigne, undefined, d.minuteurFn);
        brancherGeste(geste);
        brancherGesteMaison(geste);

        // Tâche 12 : la carte média (`rendu/media.ts`) et les blocs de mode (`rendu/modes.ts`)
        // appellent des services directement — pas via `creerAppui`, qui est fait pour des tuiles
        // à ÉTAT et à retour optimiste. Un `media_pause` n'a pas d'état à anticiper, et un
        // optimisme sur le volume mentirait sur ce que le lecteur a réellement appliqué (le rail
        // fait son propre retour immédiat, localement, cf. `rendu/media.ts`). Posé sous la garde
        // `initialise` comme tout le reste : `brancherMedia`/`brancherModes` écrasent une variable
        // de module, les rappeler à chaque redessin ne fuirait pas mais installerait une fermeture
        // neuve toutes les 20 s, pour rien.
        const agir = (domaine: string, service: string, entite: string,
                      donnees: Record<string, unknown> = {}) => {
          if (horsLigne) return;   // même refus que `creerAppui` : jamais une action qui ment
          cx.appelerService(domaine, service, { entity_id: entite, ...donnees });
        };
        brancherMedia(agir);
        brancherModes(agir);

        // Tâche 7 : les minuteurs appellent les services `timer.*` DIRECTEMENT, jamais les
        // scripts `script.toggle_minuteur_cuisine`/`…_plus_5` : ceux-ci restent pour le vocal et
        // l'ancien dashboard, mais ils font transiter la durée par `input_number`, ce qui
        // ajouterait un aller-retour réseau à chaque geste sur une dalle déjà lente.
        //
        // Tâche 10 bis : `ouvrir`/`fermer`/`demarrer` pilotent désormais `location.hash` plutôt
        // qu'un état local — le réglage est devenu la sous-vue `#minuteur`, au même titre que
        // « Toute la maison »/« Tâches ». Chacune redessine explicitement (`dessiner()`) au lieu
        // de compter sur l'écouteur `hashchange` (posé plus bas, à côté d'`armerRetour`) : ce
        // dernier ne fait qu'ARMER le retour automatique en plus, il reste le seul responsable de
        // ça — même geste synchrone que toutes les autres actions de ce fichier (retour immédiat
        // au doigt, jamais une attente d'événement asynchrone).
        const slots = () => piece.minuteurs ?? [];
        brancherMinuteur({
          ouvrir: () => {
            if (premierSlotLibre(etat, slots()) === null) return;   // rien à ouvrir
            const memoire = Number(etat.lire('input_number.duree_minuteur_cuisine')?.etat);
            dureeMinuteur = bornerDuree(Number.isFinite(memoire) ? memoire : 7);
            etiquetteMinuteur = null;
            location.hash = '#minuteur';
            dessiner();
          },
          fermer: () => { location.hash = ''; dessiner(); },
          changerDuree: (delta) => {
            dureeMinuteur = bornerDuree(dureeMinuteur + delta);
            dessiner();
          },
          choisirEtiquette: (nom) => {
            etiquetteMinuteur = etiquetteMinuteur === nom ? null : nom;
            dessiner();
          },
          demarrer: () => {
            const slot = premierSlotLibre(etat, slots());
            if (slot === null) return;   // les trois emplacements se sont remplis entre-temps
            const s = slots()[slot];
            agir('timer', 'start', s.timer, { duration: dureeHms(dureeMinuteur) });
            agir('input_text', 'set_value', s.nom, { value: etiquetteMinuteur ?? '' });
            agir('input_number', 'set_value', 'input_number.duree_minuteur_cuisine',
                 { value: dureeMinuteur });
            location.hash = '';
            dessiner();
          },
          pause: (slot) => agir('timer', 'pause', slots()[slot].timer),
          reprendre: (slot) => agir('timer', 'start', slots()[slot].timer),
          annuler: (slot) => agir('timer', 'cancel', slots()[slot].timer),
          // PAS `timer.change` : relevé sur la vraie installation en tâche 1, Home Assistant
          // refuse (`HomeAssistantError: beyond duration`, HTTP 500) tout `change` qui porterait
          // le restant au-delà de la durée du dernier `start` — donc « + 5 » échouerait
          // précisément dans le cas le plus courant, un minuteur qui vient d'être lancé.
          // `timer.start` avec une durée recalculée réussit toujours et redéfinit la référence.
          // Ne concerne qu'un minuteur EN MARCHE : le rendu ne propose pas ± 5 en pause, un
          // `start` l'y relancerait.
          ajuster: (slot, deltaS) => {
            const vue = listerMinuteurs(etat, slots(), d.maintenant().getTime())
              .find((v) => v.slot === slot);
            if (!vue || !vue.actif) return;
            const secondes = Math.max(1, Math.round(vue.restantS) + deltaS);
            agir('timer', 'start', slots()[slot].timer, { duration: hms(secondes) });
          },
        });

        // Tâche 9 bis : la voiture. `piece.voiture` n'existe qu'au salon — `clim` ne fait rien sur
        // toute autre pièce (`if (!v) return;`), même garde que `tuile` un peu plus bas pour les
        // minuteurs.
        brancherVoiture({
          clim: (demarrer: boolean) => {
            const v = piece.voiture;
            if (!v) return;
            agir('button', 'press', demarrer ? v.demarrerClim : v.arreterClim);
            climEnVol = demarrer ? 'demarrage' : 'arret';
            const mien = ++jetonClim;
            // Trois minutes : la latence haute relevée sur cette voiture (cloud Stellantis).
            // Au-delà, on cesse de prétendre qu'il se passe quelque chose plutôt que de laisser
            // un « Démarrage… » perpétuel — l'automation de reprise, elle, continue son travail.
            d.minuteurFn(() => {
              if (mien !== jetonClim) return;
              climEnVol = null;
              dessiner();
            }, 180_000);
            dessiner();
          },
        });

        // Tâche 18 : dispatcher de cochage de la vue « Tâches », même invariant « une seule
        // instance pour toute la page » que `appui`/`geste` ci-dessus (cf. docstring
        // `creerCochage`, `cochage.ts`) — posé une seule fois sous la même garde `initialise`.
        // `() => horsLigne` : même getter vivant que celui donné à `creerAppui`/`creerGeste`.
        cochage = creerCochage({
          cx, estHorsLigne: () => horsLigne, minuteurFn: d.minuteurFn, surChangement: dessiner,
        });
        brancherCochageTaches((entiteTache, uid) => cochage.cocher(entiteTache, uid));

        // Lot « recette » (2026-08-17) : les actions de la vue `#recette`. Posées ICI, une seule
        // fois, sous la même garde `initialise` que `brancherMinuteur`/`brancherVoiture`/
        // `brancherCochageTaches` — `brancherRecette` écrase une variable de module, les rappeler à
        // chaque redessin installerait une fermeture neuve toutes les 20 s, pour rien.
        //
        // `armementRepas` est créé ici et pas au niveau du module : il dépend de `d.minuteurFn`, et
        // une seule instance doit servir toute la page (cf. sa déclaration plus haut).
        armementRepas = creerArmement(d.minuteurFn);
        /** « Terminer » : deux appuis, puis `home_stock/meal/validate`.
         *
         *  IRRÉVERSIBLE depuis le mur — le composant l'écrit lui-même (« Cook, then eat. Not
         *  reversible at lot 3, and the screen says so ») ; `meal/correct` existe depuis le lot 4,
         *  mais dans le journal du PANNEAU, pas ici. D'où l'armement, et d'où le libellé qui dit
         *  ce qu'il fait plutôt qu'un « Toucher pour confirmer » générique (`rendu/recette.ts`).
         *
         *  TROIS DÉFENSES, toutes déjà écrites ailleurs : `meal/preview` a rendu le plan à
         *  l'ouverture SANS RIEN ÉCRIRE (le panneau l'affiche) ; `envoyerCommande` rend une
         *  promesse, donc un refus (`InsufficientStock`) est traduit en français par le composant
         *  et AFFICHABLE ; et le garde `horsLigne` s'applique comme à toute autre écriture.
         *
         *  HORS LIGNE : refusé VISIBLEMENT (le bouton est grisé, cf. `rendu/recette.ts`), jamais
         *  mis en file. Le panneau a une file parce qu'on scanne dans un magasin sans réseau ; une
         *  tablette murale est à trois mètres du routeur, QUI EST le serveur HA. Rejouer une
         *  validation de repas une heure plus tard, sans témoin, décrémenterait un stock à
         *  l'aveugle.
         *
         *  `portions_eaten: 1` : la valeur par défaut du panneau (`validation.ts`). Le mur n'a
         *  aucun sélecteur de parts — et il n'en aura pas : un geste qui demande un choix vit dans
         *  le panneau, et seulement là.
         *
         *  Sans `meal_id` (composant plus ancien que ce bundle), il n'y a rien à valider : on ferme
         *  la vue comme le faisait « Terminer » avant ce lot, plutôt que d'envoyer une commande
         *  qui serait refusée. */
        async function validerRepas(): Promise<void> {
          if (horsLigne) return;
          if (mealEnCours === null) { fermerRecette(); location.hash = ''; dessiner(); return; }
          if (!armementRepas.estArmee('terminer')) {
            armementRepas.armer('terminer', dessiner);
            dessiner();
            return;
          }
          armementRepas.desarmer();
          const mealId = mealEnCours;
          try {
            await cx.envoyerCommande({
              type: 'home_stock/meal/validate', meal_id: mealId, portions_eaten: 1,
              // Toutes les commandes d'écriture de `home_stock` acceptent une clé
              // d'idempotence — non pas parce que la tablette a une file (elle n'en a pas), mais
              // parce qu'une reconnexion websocket peut faire douter d'un envoi.
              idempotency_key: `mur-${mealId}-${d.maintenant().getTime()}`,
            });
          } catch (e) {
            // Un refus n'efface RIEN de l'écran : les étapes restent, la recette reste ouverte,
            // et le message français du composant s'affiche à la place de l'étiquette.
            messageRecette = messageDeRefus(e);
            dessiner();
            return;
          }
          fermerRecette();
          location.hash = '';
          dessiner();
        }
        brancherRecette({
          // Tourner une page n'est pas une navigation : on reste dans la même vue, et on mémorise
          // à chaque pas plutôt qu'à la sortie (Android peut tuer l'app entre les deux).
          page: (n) => { pageRecette = n; memoriserRecette(); dessiner(); },
          pageIngredients: (n) => { pageIngredients = n; dessiner(); },
          // « Réduire » GARDE la recette (mode `recette`, cf. `modes.ts`) ; « Terminer » la
          // VALIDE puis l'oublie. Ce sont les deux seules sorties de cette vue.
          reduire: () => { memoriserRecette(); location.hash = ''; dessiner(); },
          terminer: () => { void validerRepas(); },
          ouvrirPanneau: () => {
            // Aucune lecture ici : le plan de décrément a été demandé UNE FOIS à l'ouverture de la
            // vue (`chargerRecette`), et il ne bouge pas pendant qu'on cuisine. Rappeler
            // `meal/preview` à chaque ouverture du panneau reproduirait la lecture périodique que
            // ce lot vient précisément de supprimer.
            panneauIngredients = true;
            pageIngredients = 0;
            dessiner();
          },
          fermerPanneau: () => {
            panneauIngredients = false;
            dessiner();
          },
          // Le rendu appelle toujours avec la durée du TAG (il ne connaît pas les créneaux) : c'est
          // ici qu'on arbitre. Un minuteur qui porte déjà ce nom se met en pause / se reprend, jamais
          // un second créneau pour la même étape — sinon un appui sur une cuisson en cours perdrait
          // sa progression. Reprise par `timer.start` RECALCULÉ : `timer.change` échoue (HTTP 500,
          // « beyond duration ») dès que le restant dépasserait la durée du dernier `start`, piège
          // déjà payé par « + 5 » (cf. `ajuster`, `brancherMinuteur` ci-dessus).
          minuteur: (nom, secondes) => {
            if (horsLigne) return;
            const enCours = listerMinuteurs(etat, slots(), d.maintenant().getTime())
              .find((v) => v.nom === nom);
            if (enCours) {
              if (enCours.actif) agir('timer', 'pause', enCours.timer);
              else agir('timer', 'start', enCours.timer, { duration: hms(enCours.restantS) });
              return;
            }
            const libre = premierSlotLibre(etat, slots());
            if (libre === null) return;   // les trois créneaux sont pris : le bouton était déjà grisé
            agir('timer', 'start', slots()[libre].timer, { duration: hms(secondes) });
            agir('input_text', 'set_value', slots()[libre].nom, { value: nom });
          },
        });

        // Revue tâche 15 (I1) : le rail de progression média avance seconde par seconde, décompté
        // ici et non par Home Assistant (qui ne republie pas `media_position` en continu). Armé
        // UNE SEULE FOIS, sous la garde `initialise` — contrairement aux intervalles de
        // `dessiner`/`chargerMeteo` plus bas, réarmés à chaque tentative réussie. Il ne rend rien
        // et ne lit aucun état : il écrit une propriété personnalisée CSS sur un élément déjà
        // rendu, à partir d'une ancre que `dessiner()` a déjà calculée.
        d.intervalFn(tictacProgression, PAS_PROGRESSION_MS);
        // Tâche 8 : le même pas d'une seconde, et délibérément un intervalle SÉPARÉ du
        // précédent — mélanger les deux ferait qu'un rail média absent (donc `tictacProgression`
        // qui rend tôt) empêcherait le décompte d'avancer, ou inversement. Armé une seule fois,
        // sous la même garde `initialise`, pour la même raison que `tictacProgression`.
        d.intervalFn(tictacMinuteurs, PAS_PROGRESSION_MS);

        // Tâche 8 : retour automatique à l'accueil après 45 s d'inactivité sur « Toute la
        // maison » — l'écran mural revient toujours à l'accueil, personne ne doit avoir à le
        // ranger. Tâche 18 : la vue « Tâches » suit exactement la même règle, `estSousVue`
        // regroupe les deux (un seul niveau de profondeur chacune, jamais l'une dans l'autre).
        // Tâche 10 bis : le réglage de minuteur (`#minuteur`) rejoint ce même groupe — c'est ce
        // qui lui donne GRATUITEMENT le retour automatique, sans aucun mécanisme propre (l'ancien
        // jeton `jetonReglage`/`armerFermetureReglage`, qui faisait doublon avec celui-ci, a été
        // supprimé). L'animation d'entrée, elle, ne dépend plus d'`estSousVue` depuis la tâche 3 —
        // le moteur de mouvement la déclenche pour TOUTE traversée de vue marquée `data-mvt`,
        // `#minuteur` compris, indépendamment de ce groupe. Écouteurs posés UNE SEULE FOIS ici, sous la
        // garde `initialise` : les poser dans `dessiner()` (rappelée par `etat.surMaj`, l'horloge
        // des 20 s, la météo des 15 min...) en empilerait un de plus à chaque repaint,
        // silencieusement — exactement le piège déjà payé dans ce projet (cf. commentaires
        // `interaction.ts`). `armerRetour` annule systématiquement le minuteur précédent avant
        // d'en reposer un nouveau : au plus un seul minuteur de retour vivant à la fois, quel que
        // soit le nombre de contacts.
        // Lot « recette » : `#recette` rejoint ce groupe (donc le dédoublonnage et le réarmement au
        // contact), mais avec SON délai — cf. `RETOUR_RECETTE_MS` en tête de fichier.
        const estSousVue = (h: string) =>
          h === '#maison' || h === '#taches' || h === '#minuteur' || h === '#recette';
        let retour: ReturnType<typeof setTimeout> | undefined;
        const armerRetour = () => {
          clearTimeout(retour);
          const delai = location.hash === '#recette' ? RETOUR_RECETTE_MS : RETOUR_MS;
          // `#recette` : le hash revient à vide SANS fermer la recette (`recetteUid` intact), et
          // l'étape est écrite avant de partir. L'écran mural rejoint l'accueil, la cuisson garde son
          // point de reprise.
          retour = d.minuteurFn(() => { memoriserRecette(); location.hash = ''; }, delai);
        };

        window.addEventListener('hashchange', () => {
          // Tâche 18 : le glissement latéral entre l'accueil et une sous-vue vivait ici, en
          // `.entree-droite`/`.entree-gauche` posées à la main sur `racine`. Tâche 3 (moteur de
          // mouvement) : remplacé par le verdict `traversee` du moteur, qui déduit lui-même le
          // sens depuis la clé `data-mvt="vue:…"` de la vue entrante (`comparer()`, `diff.ts`) —
          // rien à poser ici, ni avant ni après `dessiner()`. Le retour au contact reste
          // strictement instantané, hors moteur, cf. rapport de tâche 18.
          if (location.hash === '#taches') void chargerTaches();
          // Lot « recette » : c'est le SEUL endroit qui ouvre la recette. Le bloc de l'accueil et la
          // tuile « Recette » ne font que poser le hash (`rendu/defaut.ts`, `interaction.ts`) — comme
          // les trois autres sous-vues, la porte d'entrée est le hash, jamais un état posé en douce
          // par un rendu. `ouvrirRecette` refuse de se réinitialiser si une recette est déjà en cours
          // (cf. son docstring) : revenir sur une recette réduite retrouve son étape.
          if (location.hash === '#recette') ouvrirRecette();
          dessiner();
          if (estSousVue(location.hash)) armerRetour();
          else { clearTimeout(retour); retour = undefined; }
        });
        document.addEventListener('pointerdown', () => {
          if (!estSousVue(location.hash)) return;
          armerRetour();
        }, true);

        // Tâche 9 (réveil de l'écran de nuit) : réarme le retour à CHAQUE contact tant que
        // l'écran est réveillé — posé UNE SEULE FOIS ici, sous la même garde `initialise` que le
        // reste de ce bloc (même raison que documentée au-dessus pour `armerRetour` : le poser
        // dans `dessiner()`, rappelée par l'horloge/l'état/la météo, en empilerait un de plus à
        // chaque repaint). Sur `racine` (`#app`, jamais réécrit par `render()` — seuls ses
        // enfants le sont) et non `document` : ce geste n'a de sens que sur CET écran, pas sur
        // toute la page. Capture (`true`), comme `armerRetour` ci-dessus : le réarmement doit
        // avoir lieu AVANT que la commande éventuellement touchée n'agisse, jamais après — sans
        // quoi un geste sur le premier appui qui réveille l'écran pourrait se voir avaler par un
        // redessin déclenché entre-temps. `reveiller()` lui-même distingue premier réveil et
        // simple réarmement (cf. son docstring) : cet appel ne redessine donc PAS à chaque
        // contact, seulement au tout premier.
        racine.addEventListener('pointerdown', () => { if (reveilNuit) reveiller(); }, true);

        // Même patron, même élément, même capture : le premier contact coupe la scène DeLorean.
        // Posé ici, une seule fois, jamais dans `dessiner()` (qui en empilerait un par repaint).
        racine.addEventListener('pointerdown', couperDelorean, true);

        // Tâche 13 — point d'injection du vérificateur de rendu (`outils/verifier-rendu.mjs`),
        // qui doit pouvoir mettre l'écran dans chacun des six modes principaux sans jamais
        // toucher à la vraie maison (aucun appel de service, aucune écriture chez Home
        // Assistant : l'état est poussé DANS la page, par le même chemin que le websocket).
        //
        // Posé UNIQUEMENT si la page a été ouverte avec `?essai=1` — sur les trois tablettes
        // réelles, dont l'URL de démarrage Fully Kiosk ne porte pas ce paramètre, la propriété
        // n'existe pas du tout : aucune surface d'écriture n'est offerte à quoi que ce soit.
        // Posé sous la garde `initialise` comme tout le reste de ce bloc, donc une seule fois.
        //
        // `ilYaMs` (4e argument) antidate l'horodatage que `Etat.appliquer` pose lui-même
        // (`changeLe`, cf. `etat.ts`). C'est indispensable au mode `aeration`, qui n'existe
        // qu'au-delà de dix minutes d'ouvrant ouvert (`AERATION_MS`, `modes.ts`) : sans lui, un
        // vérificateur devrait attendre dix minutes pour mesurer ce mode, ou fausser l'horloge
        // du document entier — ce qui déclencherait au passage la surveillance du silence
        // websocket (`SEUIL_MUET_MS`) et afficherait l'écran hors ligne à la place du mode
        // mesuré. L'échange de `Date.now` est strictement synchrone et rendu dans un `finally`,
        // donc invisible à tout le reste de l'application.
        if (new URL(location.href).searchParams.get('essai') === '1') {
          (window as unknown as Record<string, unknown>).__injecter = (
            id: string, valeur: string, attributs: Record<string, unknown> = {}, ilYaMs = 0,
          ) => {
            const vrai = Date.now;
            if (ilYaMs > 0) Date.now = () => vrai.call(Date) - ilYaMs;
            try {
              etat.appliquer({ entity_id: id, state: valeur, attributes: attributs });
            } finally {
              Date.now = vrai;
            }
          };
          // `evenements` n'arrive PAS par un état HA (`Etat.appliquer`, ci-dessus) : l'agenda
          // passe par une requête REST (`chargerAgenda`), hors de portée de `__injecter`. Ces
          // points d'injection, sous la MÊME garde `?essai=1` (même surface d'écriture que
          // `__injecter`, absente sur les trois tablettes réelles), donnent au vérificateur
          // (`outils/verifier-rendu.mjs`) un moyen déterministe de mesurer le PIRE CAS sans
          // dépendre de l'état réel de l'installation au moment de la mesure.
          //
          // Lot 6 : `__injecterRepas` reste, et c'est essentiel. Le repas vient désormais d'un
          // attribut d'entité, donc `__injecter` pourrait techniquement le poser — mais le
          // planning de la maison est VIDE la plupart du temps, et un contrôle qui mesurerait
          // alors un écran sans bloc passerait à vide. Un contrôle qui ne contrôle rien est pire
          // que pas de contrôle. `null` VIDE le bloc, `undefined` rend la main à `Etat`.
          (window as unknown as Record<string, unknown>).__injecterRepas = (
            suivant: RepasSuivant | null,
          ) => { repasInjecte = suivant; dessiner(); };
          // Lot 6 : REMPLACE `__injecterPlan`, qui portait un plan de repas d'une source tierce.
          // Le vérificateur ouvre `#recette` au chargement (`page.goto(...#recette)`, sans aucun
          // contact) : sans ce point, `ouvrirRecette` enverrait `home_stock/recipe/get` à
          // l'instance réelle et mesurerait la recette du jour — un budget de hauteur qui change
          // d'une exécution à l'autre sans qu'aucun code n'ait changé.
          //
          // Ceci REMPLACE la réponse des deux lectures d'ouverture, sans passer par le websocket :
          // les `pages` sont posées telles quelles (le vérificateur porte ses propres fixtures de
          // HTML, mesurées et précieuses) et les `ingredients` aussi. `jetonRecette++` invalide
          // toute lecture réelle encore en vol — sans quoi elle résoudrait APRÈS l'injection et
          // écraserait les données injectées par les vraies.
          (window as unknown as Record<string, unknown>).__injecterRecette = (
            r: { etiquette?: string; plat?: string; description?: string;
                 ingredients?: LigneIngredient[] } | null,
          ) => {
            jetonRecette++;
            if (!r) { fermerRecette(); dessiner(); return; }
            recetteUid = recetteUid ?? 'essai';
            mealEnCours = mealEnCours ?? 0;
            recetteEnCours = recetteEnCours ?? 0;
            etiquetteRecette = r.etiquette ?? etiquetteRecette;
            platRecette = r.plat ?? platRecette;
            if (r.description !== undefined) {
              // `decouperPages` et non `pagesDepuisEtapes` : les fixtures du vérificateur sont des
              // descriptions HTML, mesurées et précieuses — le pire cas de hauteur qu'elles portent
              // (454 caractères + une image) ne se réécrit pas pour une bascule de source, et cette
              // entrée reste supportée précisément pour ça.
              pagesRecette = decouperPages(r.description);
              pageSourceIndex = pagesRecette.map((_, i) => i);
              pageRecette = 0;
            }
            if (r.ingredients) ingredients = r.ingredients;
            dessiner();
          };
          (window as unknown as Record<string, unknown>).__injecterEvenements = (evs: Evenement[]) => {
            evenements = evs; dessiner();
          };
          // Tâche 17 : même raison exactement pour les tâches d'entretien — `todo/item/list` est
          // une commande websocket, pas un état, donc hors de portée de `__injecter`. Sans ce
          // troisième point, le vérificateur mesurerait le bloc de repli sur la VRAIE liste
          // d'entretien de la maison au moment du contrôle (3 tâches aujourd'hui, 0 demain) : un
          // budget de hauteur qui change d'une exécution à l'autre sans qu'aucun code n'ait
          // changé, exactement le défaut corrigé à la ronde 1 de la tâche 10 bis pour `.synthese`.
          (window as unknown as Record<string, unknown>).__injecterTaches = (
            entite: string, items: { uid: string; texte: string }[],
          ) => { taches[entite] = items; dessiner(); };
        }

        initialise = true;
      }
      await cx.connecter();
      essai = 0;
      d.intervalFn(dessiner, 20_000);   // l'horloge avance même sans changement d'entité
      void chargerMeteo();
      d.intervalFn(chargerMeteo, 15 * 60_000);
      // Tâche 12 : même cadence que la météo. Un quart d'heure suffit pour une pastille qui
      // annonce un rendez-vous jusqu'à trois heures à l'avance (`FENETRE_MS`, `agenda.ts`), et
      // c'est autant de requêtes en moins sur une tablette à 130 Mo de libre.
      void chargerAgenda();
      d.intervalFn(chargerAgenda, 15 * 60_000);
      // Lot 6 : PLUS AUCUN intervalle pour le repas. Il vient d'un attribut d'entité, donc il
      // arrive par `subscribe_events` — déjà souscrit, déjà coalescé (`Etat.notifier`), et à jour
      // à la seconde plutôt qu'au quart d'heure. Le rappel de 15 min qui vivait ici coûtait
      // 3,8 Mo de trafic HTTP par jour sur une Fire 7 à 130 Mo de libre ; il ne coûte plus rien
      // parce qu'il n'existe plus. C'est le gain principal de ce lot, et il se mesure.
      // Tâche 18 : un seul chargement au démarrage (cache prêt avant le premier appui sur la
      // ligne de synthèse), pas de rafraîchissement périodique — la vue se recharge déjà à chaque
      // entrée (cf. l'écouteur `hashchange` ci-dessus), suffisant pour une vue qu'on ne laisse de
      // toute façon jamais ouverte plus de 45 s (retour automatique) ; cf. réserve du rapport.
      void chargerTaches();
      // Tâche 17 : ce raisonnement ne tient plus pour les deux pièces dont le bloc central peut
      // afficher ces mêmes tâches en PERMANENCE (`replEntretien`, plus bas) — sans rien pour
      // rafraîchir le cache, l'accueil montrerait indéfiniment la liste de l'instant du démarrage,
      // et une tablette murale reste allumée des semaines.
      //
      // Tâche 17 bis (relecture, défaut D1) : LE CHEMIN PRINCIPAL DE FRAÎCHEUR N'EST PLUS CELUI-CI,
      // c'est le rechargement déclenché par l'état poussé de `todo.maintenance` (`cx.surChangement`,
      // plus haut). La version précédente de ce commentaire affirmait qu'une tâche cochée ailleurs
      // « n'arrive par AUCUN chemin poussé » : c'était FAUX. `todo/item/list` n'a effectivement pas
      // d'équivalent dans `subscribe_events`, et l'état poussé ne porte qu'un compteur, jamais les
      // libellés — mais ce compteur est bien poussé (il est consommé trois lignes plus bas par la
      // ligne de synthèse, `{etat}`, cf. `ecran.ts`), et il suffit comme SIGNAL pour aller
      // rechercher les libellés.
      //
      // Ce rappel de 15 min RESTE, en filet, pour le seul cas que le signal ne couvre pas :
      // Home Assistant n'émet pas de `state_changed` quand l'état et les attributs sont
      // identiques — une synchronisation qui ferme une tâche et en ouvre une autre dans le même
      // passage laisse le compteur inchangé et ne pousse rien, alors que les libellés, eux, ont
      // changé. Même cadence que la météo/l'agenda/le repas et `chargerTaches` telle quelle,
      // jamais un second chargeur dédié à `todo.maintenance` : ce serait un deuxième chemin de
      // lecture pour la même donnée, et la vue « Tâches » y gagne au passage. Le salon, dont le
      // bloc central est la voiture en toutes circonstances, n'y a rien à gagner : une commande
      // websocket de plus toutes les 15 min sur une Fire 7 à 130 Mo de libre, pour un résultat
      // qu'il ne rend jamais.
      if (agencement.blocDefaut === 'repas' || agencement.blocDefaut === 'agenda') {
        d.intervalFn(chargerTaches, 15 * 60_000);
      }
      dessiner();
    } catch {
      render(erreurDemarrage(), racine);
      // M7 (revue finale) — CE `render()` COURT-CIRCUITE LE MOTEUR : il remplace tout le contenu de
      // `racine` sans que `peindre()` n'en sache rien. Le relevé mémorisé pointe alors sur des
      // nœuds DÉTACHÉS, et à la reconnexion la peinture suivante comparerait ce relevé mort à un
      // relevé neuf — des sorties fantômes sur du contenu déjà remplacé. `oublier()` fait repartir
      // la peinture suivante comme une première : elle mémorise et se tait.
      //
      // L'AUTRE `render()` DIRECT DE CE FICHIER (`sessionAbsente`, dans `demarrer()`) N'EN A PAS
      // BESOIN, et c'est vérifiable : il s'exécute AVANT `creerMoteur` (la garde `lireJetons` sort
      // de `demarrer()` par un `return` bien plus haut que la ligne qui construit le moteur) — il
      // n'y a donc aucun relevé à jeter, ni même de moteur sur lequel appeler `oublier`.
      moteur.oublier();
      // Pas de `void` ici : le rappel renvoie la promesse de `tenter()` (autorisé, une fonction
      // qui rend `Promise<void>` est assignable à `() => void`). En production, `setTimeout`
      // l'ignore de toute façon ; dans les tests, `minuteurFn` est un double qui capture le
      // rappel — pouvoir l'attendre permet de vérifier qu'une tentative réussie efface bien
      // l'écran d'erreur, sans dépendre d'un vrai délai.
      d.minuteurFn(() => tenter(), delaiReconnexion(essai++));
    }
  }

  /** Fait avancer le rail de progression média entre deux redessins. Trois refus, chacun repris
   *  d'une leçon déjà payée par ce projet :
   *   - `niveauInitial === 'aucun'` : le propriétaire (ou `prefers-reduced-motion`) a demandé
   *     qu'aucune animation ne joue. Un rail qui court EST une animation — et un rail figé ne dit
   *     rien de faux : la chanson avance quand même, le prochain `dessiner()` le remettra en
   *     place. ⚠️ Ce refus-ci ne vaut QUE pour le rail : `tictacMinuteurs` ne le partage plus
   *     depuis l'arbitrage du 2026-08-03 (un décompte figé, lui, MENT). Asymétrie voulue,
   *     expliquée en détail sur `tictacMinuteurs` juste en dessous ;
   *   - `document.hidden` : l'écran de la tablette est éteint la nuit. Écrire une variable CSS
   *     toutes les secondes jusqu'au matin sur une machine à 130 Mo de libre ne peint rien —
   *     même leçon que `mesurer` (`mouvement.ts`) et, depuis cette revue, que `deplacer` ;
   *   - pas de `.media` à l'écran, pas d'ancre, ou lecture en pause : rien à faire avancer.
   *  N'écrit QUE `--progression`, jamais de rendu `lit` : le prochain `dessiner()` réécrira de
   *  toute façon l'attribut `style` complet, avec la valeur juste — même mécanisme, et même
   *  cohabitation assumée, que le retour optimiste de `--niveau` (`rendu/media.ts`). */
  function tictacProgression() {
    if (niveauInitial === 'aucun') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (ancreProgression === null || !ancreProgression.avance) return;
    const carte = racine.querySelector<HTMLElement>('.media');
    if (!carte) return;
    carte.style.setProperty('--progression', String(fractionAncree(ancreProgression, horlogeMonotone())));
  }

  /** Fait DESCENDRE les décomptes entre deux redessins — Home Assistant ne republie pas un timer
   *  seconde par seconde, il publie une échéance. Deux refus seulement, et non trois :
   *  `document.hidden` (l'écran de la tablette est éteint la nuit, écrire dans un nœud que
   *  personne ne peut voir coûte de la RAM et rien d'autre) et aucune ancre (rien à l'écran).
   *  Une ancre figée (minuteur en pause) est ignorée par `restantAncre` lui-même.
   *
   *  ⚠️ ASYMÉTRIE VOULUE AVEC `tictacProgression`, ARBITRÉE PAR LE PROPRIÉTAIRE LE 2026-08-03 —
   *  NE PAS « RÉTABLIR LA COHÉRENCE » EN REMETTANT `if (niveauInitial === 'aucun') return;` ICI.
   *  Le rail média garde ce refus ; le décompte, non. La raison n'est pas technique, elle est
   *  éditoriale : **un compte à rebours n'est pas une décoration, c'est l'information même**. Un
   *  rail de progression figé ne dit rien de faux à personne — la chanson avance quand même, et
   *  le prochain `dessiner()` remettra le rail où il doit être. Un minuteur de cuisine figé, lui,
   *  MENT : il fait croire qu'il reste du temps. C'est exactement l'inverse de ce qu'on demande à
   *  un minuteur.
   *
   *  Ce que coûtait le refus, mesuré (diagnostic d'intermittence, 2026-08-03) : sous
   *  `?mouvement=aucun`/`prefers-reduced-motion`, le décompte n'était plus réécrit que par
   *  `dessiner()`, donc par sauts de 2 à 4 s quand la maison pousse des états, et jusqu'à 20 s
   *  (l'intervalle d'horloge) dans une maison calme la nuit — précisément quand un minuteur de
   *  cuisine tourne. Tâche 8 (moteur de mouvement) : `niveauInitial` ne tombe plus tout seul en
   *  cours de route (c'était vrai avant cette tâche, via l'ancien `niveau`/`degrader` global de
   *  `demarrage.ts`). Depuis la tâche 1 du chantier grammaire, le régulateur qui dégradait encore
   *  PAR RÔLE dans le moteur a lui aussi été retiré : le niveau est FIXE, décidé une seule fois au
   *  montage par `niveauDemande` (`src/mouvement.ts`), plus rien ne le fait tomber en cours de
   *  route. Le refus qui reste ici est donc seulement `prefers-reduced-motion`/`?mouvement=` posé
   *  dès le démarrage — mais le décompte, lui, continue de descendre quand même sous ce refus
   *  (asymétrie ci-dessus).
   *
   *  Le coût de ce tic quand tout le reste est coupé reste borné : une écriture de nœud texte par
   *  seconde et par minuteur affiché (trois au maximum), sans rendu `lit`, sans recalcul de mise en
   *  page — l'ordre de grandeur de ce que fait déjà l'horloge du bandeau.
   *
   *  N'écrit QUE dans le nœud texte du temps (`ecrireTemps`), jamais un rendu `lit` : le prochain
   *  `dessiner()` réécrira la valeur exacte de toute façon. Intervalle SÉPARÉ de
   *  `tictacProgression`, à dessein (cf. commentaire d'armement plus haut) : leurs refus diffèrent
   *  — c'est même désormais leur seule différence de fond — et un rail média absent ne doit pas
   *  empêcher un décompte d'avancer. */
  function tictacMinuteurs() {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (ancresMinuteurs.size === 0) return;
    const horloge = horlogeMonotone();
    for (const [slot, ancre] of ancresMinuteurs) {
      const el = racine.querySelector<HTMLElement>(`.mn-temps[data-minuteur="${slot}"]`);
      if (!el) continue;                     // le bloc a changé entre deux tics : rien à écrire
      ecrireTemps(el, formaterRestant(restantAncre(ancre, horloge)));
    }
  }

  /** Réveille l'écran de nuit et arme (ou réarme) son retour à `RETOUR_MS`, même patron qu'un
   *  jeton par appel, un seul minuteur fait foi (cf. `jetonClim`, plus haut dans `tenter()`).
   *  Sans lui, le tout premier contact rendormirait l'écran 45 s plus tard même si d'autres
   *  contacts ont eu lieu depuis — au milieu de ce que quelqu'un est en train de faire.
   *
   *  Déclarée ici, au même niveau que `dessiner`/`tictacMinuteurs` — PAS à l'intérieur de
   *  `tenter()` comme `armerRetour` — parce qu'elle est appelée par DEUX consommateurs qui ne
   *  partagent pas la même portée : `dessiner()` (elle-même hors de `tenter()`, qui la passe à
   *  `rendreNuit`) et l'écouteur de réarmement posé plus haut sous la garde `initialise`, à
   *  l'intérieur de `tenter()`. Une `const` locale à `tenter()` serait invisible du premier ;
   *  une fonction déclarée à ce niveau (hissée, comme `dessiner`) est visible des deux.
   *
   *  N'appelle `dessiner()` qu'au tout premier réveil (`!etait`) : les contacts suivants, tant que
   *  l'écran est déjà éveillé, ne font que réarmer le délai — repeindre à chaque contact serait un
   *  travail de rendu sans aucun changement visible à produire. */
  function reveiller() {
    const etait = reveilNuit;
    reveilNuit = true;
    const mien = ++jetonReveil;
    d.minuteurFn(() => {
      if (mien !== jetonReveil) return;   // un contact plus récent a déjà réarmé un autre jeton
      reveilNuit = false;
      dessiner();
    }, RETOUR_MS);
    if (!etait) dessiner();
  }

  function dessiner() {
    const maintenant = d.maintenant();
    const soleil = etat.lire('sun.sun')?.etat === 'above_horizon';
    const moment = momentDuJour(maintenant.getHours(), soleil);
    // Tâche 12 (2026-08-02) : la priorité n'est PLUS écrite ici. `demarrage.ts` réduit l'état de
    // la maison à un contexte de valeurs simples, `modePrincipal` (`modes.ts`) tranche, et ce bloc
    // se contente de rendre le mode désigné. C'est ce qui rend la priorité testable sans
    // navigateur (`tests/modes.test.ts`), et ce qui empêche une nouvelle règle de s'ajouter en
    // douce dans un `?:` — la dérive qui avait fini par rendre l'ancien `hero()` de
    // `wallpanel.jinja` illisible. `alerteActive` (`contexte.ts`) reste appelée ici, comme depuis
    // la tâche 8 bis : elle alimente le contexte, elle ne décide plus du rang toute seule.
    //
    // Revue tâche 12 : ce bloc est calculé AVANT les retours anticipés (nuit, « Toute la maison »,
    // « Tâches »), et non plus après. Deux choses en dépendent qui ne sont pas propres à l'écran
    // normal : la palette sombre forcée par le mode cinéma (entrer dans une sous-vue pendant un
    // film rallumait l'écran en plein salon) et le survol DeLorean — dont un des quatre instants,
    // 01 h 21, tombe par définition en pleine nuit, donc derrière le premier de ces retours.
    const maintenantMs = maintenant.getTime();
    const alerte = alerteActive(collecterAlertes(etat, maintenantMs), dernierMouvement(etat), maintenantMs);

    // Toutes les sources de la pièce résolues d'un coup : « l'écran est allumé » et « quelque
    // chose joue » sont deux notions distinctes (cf. `media.ts`) et vivent sur des sources
    // différentes — la musique peut jouer pendant que la télé est allumée. `resoudreSource` rend
    // `null` pour une source ni allumée ni en lecture : ce qui reste a toujours quelque chose à
    // montrer.
    const sources = piece.sources
      .map((decl) => resoudreSource(etat, decl))
      .filter((s): s is SourceResolue => s !== null);
    const ecranAllume = sources.some((s) => s.allumee);

    const ouvertDepuis = piece.ouvrants
      .filter((id) => etat.estUtilisable(id) && etat.lire(id)!.etat === 'on')
      .map((id) => maintenantMs - etat.lire(id)!.changeLe);
    const meteoEtat = etat.estUtilisable('weather.maison') ? etat.lire('weather.maison')! : undefined;

    // Tâche 7 : les minuteurs de la pièce — vide (donc `slotLibre === false` et aucune vue) pour
    // toute pièce qui ne déclare pas `piece.minuteurs` (salon, bureau). `piece.minuteurs ?? []`
    // partout, jamais un accès direct : c'est ce qui garde ce champ facultatif traitable comme
    // absent sans jamais planter.
    const vuesMinuteurs = listerMinuteurs(etat, piece.minuteurs ?? [], maintenantMs);
    const slotLibre = premierSlotLibre(etat, piece.minuteurs ?? []) !== null;
    /** Le minuteur le plus urgent qui TOURNE réellement, ou `undefined`. `listerMinuteurs` trie les
     *  actifs d'abord (`minuteur.ts`), donc le premier de la liste est le bon dès qu'il en existe
     *  un — mais c'est aussi pourquoi `vuesMinuteurs[0]` seul ne suffit pas : sans minuteur actif,
     *  il rend le premier minuteur EN PAUSE, dont le restant est figé. Cf. le bloc `recette`. */
    const minuteurActif = vuesMinuteurs.find((v) => v.actif);
    // Tâche 10 bis : plus de fermeture forcée ici si un minuteur vocal prend le dernier
    // emplacement pendant que `#minuteur` est ouvert — `ouvrir()` refuse déjà de s'ouvrir sans
    // emplacement libre, et `demarrer()` refuse déjà de démarrer sans emplacement libre
    // (`premierSlotLibre === null`, cf. `brancherMinuteur` plus haut) : rien de plus à faire ici,
    // l'état de HA prime déjà sur l'écran par ce double refus.

    const ctx: ContexteModes = {
      alerte: alerte !== null,
      aspirateurEnMarche: piece.aspirateur !== undefined
        && etat.estUtilisable(piece.aspirateur)
        && ['cleaning', 'returning', 'error'].includes(etat.lire(piece.aspirateur)!.etat),
      ecranAllume,
      sourceJoue: sources.some((s) => s.joue),
      ouvrantOuvertDepuisMs: ouvertDepuis.length ? Math.max(...ouvertDepuis) : 0,
      chauffageEnMarche: etat.lire('climate.radiateur')?.etat === 'heat',
      ilPleut: ['rainy', 'pouring', 'lightning-rainy', 'snowy'].includes(meteoEtat?.etat ?? ''),
      serrureDeverrouillee: etat.lire('lock.aqara_smart_lock_u200_lite')?.etat === 'unlocked',
      temperatureExterieure: Number(meteoEtat?.attributs['temperature'] ?? 0),
      soleilLeve: soleil,
      modeInvites: etat.lire('input_boolean.mode_invites')?.etat === 'on',
      // Horloge LOCALE, jamais Home Assistant : le clin d'œil survit à une coupure de connexion,
      // c'est tout l'intérêt de `rendu/delorean.ts`. `piece.delorean` d'abord : sans lui, la
      // cuisine et le bureau entreraient dans le modulateur et masqueraient leur écran huit
      // secondes pour une voiture posée dans une autre pièce.
      instantDelorean: piece.delorean === true && estInstantDelorean(maintenant),
      minuteurEnCours: vuesMinuteurs.length > 0,
      // Tâche 11 (2026-08-17) : la recette en cours, réduite ou ouverte. `recetteUid` et non le hash :
      // une recette RÉDUITE (hash vide) est justement l'état où ce mode doit primer, pour que
      // l'accueil garde le point de reprise de la cuisson même quand un minuteur tourne.
      recetteEnCours: recetteUid !== null,
      // Tâche 14 : reprend tel quel `agencement.blocDefaut` (agencement.ts) — UNE SEULE façon de déclarer
      // quel bloc par défaut la pièce utilise, remplace l'ancien `piece.voiture !== undefined`
      // (un test de présence que le repas/l'agenda n'auraient pas pu réutiliser sans un second
      // mécanisme parallèle, cf. le docstring de ce champ sur `ContexteModes`, `modes.ts`).
      blocDefaut: agencement.blocDefaut,
      // 2026-08-29 : déduit de la déclaration, jamais du nom de la pièce — le salon a renoncé à sa
      // rangée « Ambiance », et c'est ce fait-là, pas son identité, qui lui rend les ~100 px de la
      // deuxième rangée de commandes (cf. `combien`, `modes.ts`). Une pièce qui reprendrait des
      // ambiances demain retrouverait son ancien budget sans qu'on ait à y penser.
      //
      // 2026-09-12 (plan 2, tâche 5) : `|| (piece.minuteurs?.length ?? 0) > 0` ajouté. Le gabarit
      // (`rendu/corps.ts`, `piece.ambiances.length || tuileMinuteur`) garde la rangée dès qu'une
      // tuile minuteur existe, même sans ambiance déclarée — ce contexte devait dire la même
      // chose, sous peine de faire rendre au gabarit une rangée que `combien` n'a pas budgétée.
      // À résultat constant sur les trois écrans : seule la cuisine déclare des `minuteurs`, et
      // elle a déjà des ambiances (cf. `ecran.ts`) — la disjonction n'y change rien aujourd'hui,
      // elle protège seulement le jour où une pièce aura des minuteurs sans ambiance.
      rangeeAmbiance: piece.ambiances.length > 0 || (piece.minuteurs?.length ?? 0) > 0,
      // Repris tels quels de l'agencement de l'écran (`agencement.ts`) — `modes.ts` ne lit jamais
      // un écran lui-même, exactement comme pour `blocDefaut` et `rangeeAmbiance`.
      modes: agencement.modes,
      modulateurs: agencement.modulateurs,
      // Relecture finale du plan 2 (I4) : `coutEcran` (`modes.ts`) facturait les quatre zones en
      // dur. Une zone qu'un écran n'affiche pas ne coûte pas sa hauteur — même provenance et même
      // patron que `modes`/`modulateurs` ci-dessus. À résultat constant sur les trois écrans, qui
      // déclarent tous les quatre zones du défaut (cf. `tests/agencement.test.ts`).
      zones: agencement.zones,
      // Repris tel quel d'`Ecran.hauteurUtile` — ce module ne lit jamais un écran lui-même, même
      // patron que `blocDefaut`, `rangeeAmbiance`, `modes` et `modulateurs` ci-dessus. Absent pour
      // les trois écrans déclarés aujourd'hui : `combien` retombe alors sur `BUDGET.hauteurUtileParDefaut`
      // (585, les Fire 7), donc ce câblage ne change le rendu d'aucune pièce existante.
      hauteurUtile: piece.hauteurUtile,
    };
    const mode = modePrincipal(ctx);
    const modulateurs = modulateursActifs(ctx);

    // Ronde de correction 1 (revue du coordinateur) : posée ICI, avant les retours anticipés
    // (nuit, « Toute la maison », « Tâches », et depuis la tâche 10 bis « #minuteur » — cf. plus
    // bas), PAS après `blocCentral`. Une affectation placée après ces `return` ne s'exécuterait
    // jamais sur ces chemins : le bloc des minuteurs disparaîtrait du DOM (nuit, sous-vue) mais
    // `ancresMinuteurs` garderait indéfiniment la carte de son dernier rendu « normal ». Le rail
    // média (`ancreProgression`, plus bas) a le même défaut de position mais s'en tire seulement
    // parce que son tic vérifie `querySelector('.media')` avant d'écrire ; rien ne garantit que le
    // tic de la tâche 8 fera la même vérification défensive pour les minuteurs — c'est justement
    // la garantie que cette tâche doit livrer, pas un hasard à espérer plus tard.
    //
    // `mode === 'minuteur'` NE SUFFIT PAS à lui seul : il ne dépend que de `ctx` (donc de l'état de
    // HA), pas de la VUE réellement affichée — un minuteur peut très bien continuer de tourner
    // pendant qu'on est sur « Toute la maison », sur « Tâches », sur le réglage plein écran
    // (`#minuteur`), ou en pleine nuit (`moment`, `location.hash` sont indépendants de `mode`).
    // Sans le répéter ici, ce booléen resterait vrai sur ces routes alors que le bloc des
    // minuteurs n'y est jamais rendu (cf. les `if (...) { render(...); return; }` plus bas) :
    // exactement la même classe d'erreur que celle corrigée par ce déplacement, juste inversée
    // (une carte vivante mais FAUSSE plutôt que FIGÉE). `horsLigne`/`mode`/`moment` sont déjà
    // définitifs à ce point (l'éventuelle reprise en main de HA a eu lieu avant `ctx`, au-dessus) :
    // aucune dépendance vers `blocCentral`, qui n'a pas encore besoin d'exister.
    //
    // Tâche 9 (réveil) : `moment !== 'nuit'` ne suffit plus seul. Un écran de nuit RÉVEILLÉ
    // (`reveilNuit`) rend le bloc central normal (cf. le retour anticipé de la nuit plus bas,
    // conditionné à `!reveilNuit`) alors que `moment` reste encore littéralement `'nuit'` tant
    // que l'heure ne sort pas d'elle-même de la plage 23 h → 5 h. Sans le `|| reveilNuit` ici, un
    // minuteur en cours sur un écran réveillé se retrouverait avec une carte affichée mais des
    // ancres vides : le bloc `.minuteurs` existe dans le DOM, mais `tictacMinuteurs` ne trouve
    // plus rien à décompter (`ancresMinuteurs.size === 0` coupe court, cf. son commentaire) — un
    // décompte figé, silencieusement, exactement la classe d'erreur que ce commentaire décrit
    // juste au-dessus pour la version d'origine du bug.
    //
    // Tâche 10 bis : `!reglageMinuteur` (supprimé avec l'état local) est remplacé par
    // `location.hash !== '#minuteur'` — même rôle exact, porté par le hash comme les deux autres
    // sous-vues. C'est aussi la réponse à « le décompte continue-t-il de descendre quand on quitte
    // la sous-vue ? » : en sortant de `#minuteur` (hash remis à `''`), cette condition redevient
    // vraie et `ancresMinuteurs` est recalculée au prochain `dessiner()`, exactement comme au
    // retour de `#maison`/`#taches`.
    const minuteursAffiches = !horsLigne && mode === 'minuteur'
      && (moment !== 'nuit' || reveilNuit) && location.hash !== '#maison'
      && location.hash !== '#taches' && location.hash !== '#minuteur';
    ancresMinuteurs = new Map(minuteursAffiches
      ? vuesMinuteurs.map((v) => [v.slot, ancrerMinuteur(v, horlogeMonotone())])
      : []);

    // LA source affichée, choisie par le MODE et non par sa position dans la liste (revue
    // tâche 12). `paused` compte comme « ça joue » (`ETATS_ACTIFS`, `media.ts`) et « Musique » est
    // déclarée avant « Télévision » : une session YouTube Music laissée en pause la veille
    // confisquait donc la carte pendant un film — écran sombre, commandes de cinéma, et le dernier
    // morceau écouté en titre. En mode cinéma, c'est la source dont l'ÉCRAN est allumé qui a
    // raison ; partout ailleurs, la première qui joue réellement, dans l'ordre d'exclusivité
    // déclaré (au salon : la musique devant la télé, relevé de l'ancien montage).
    const source = (mode === 'cinema' ? sources.find((s) => s.allumee) : sources.find((s) => s.joue))
      ?? null;

    // Tâche 7 (fondu de palette) : `basculerPalette` remplace les deux `classList.toggle('sombre',
    // …)` d'origine (sur `racine` ET sur `<html>`, cf. la tâche 20 plus bas) — c'est elle qui pose
    // `.fondu-palette` le temps du croisement puis la retire, et qui garde une garde interne pour
    // ne rien refaire quand la palette ne change pas (cette fonction tourne à chaque rafale de
    // `state_changed` et toutes les 20 s par l'horloge). Le mode cinéma force la palette sombre
    // même en plein jour : l'écran cesse d'éclairer le salon pendant un film.
    //
    // I4 (revue finale) — UN SEUL APPEL, ICI. Il y en avait DEUX, à 129 lignes d'écart et sans
    // `return` entre eux : `basculerPalette(moment !== 'jour')` tout en haut de `dessiner()`, puis
    // `basculerPalette(true)` en mode cinéma. En journée pendant un film, la garde interne
    // `sombreCourant` ne tenait donc JAMAIS : chaque redessin retirait `.sombre` puis la remettait,
    // reposait `.fondu-palette` sur `<html>` et `#app` et armait deux minuteurs de 600 ms. Aucun
    // flash visible (les deux bascules tombent dans la même tâche JS), mais deux recalculs de style
    // de tout l'arbre par peinture — et surtout `.fondu-palette *` restait armée la plus grande
    // partie du temps, c'est-à-dire l'état PERMANENT que son propre commentaire dans `base.css`
    // interdit (« elle croiserait aussi chaque changement d'état de tuile »).
    //
    // Placé APRÈS le calcul de `mode` (rien entre les deux points d'origine n'en dépendait) et
    // AVANT les retours anticipés ci-dessous : entrer dans « Toute la maison » ou « Tâches »
    // pendant un film ne doit pas rallumer l'écran en pleine séance.
    moteur.basculerPalette(moment !== 'jour' || mode === 'cinema');

    // Le survol DeLorean s'arme ici, jamais sous la garde `initialise` : son instant n'existe pas
    // encore au démarrage. Le minuteur est donc posé depuis `dessiner()`, ce que le reste du
    // fichier s'interdit — d'où le verrou `deloreanArme`, qui garantit au plus UN minuteur vivant
    // par instant, quel que soit le nombre de redessins pendant la minute qu'il dure.
    const delorean = modulateurs.includes('delorean');
    if (delorean && !deloreanArme) {
      deloreanArme = true;
      sceneDelorean = varianteDelorean(maintenant);
      vitesseAffichee = 0;
      const duree = sceneDelorean ? DUREES_DELOREAN[sceneDelorean] : 0;
      d.minuteurFn(() => { couperDelorean(); }, duree);
      // Le compteur de vitesse ne monte que dans la scène `voyage` : ailleurs, ce tic n'aurait
      // rien à faire avancer et ferait redessiner l'écran pour rien.
      if (sceneDelorean === 'voyage') {
        const depart = Date.now();
        const tic = d.intervalFn(() => {
          if (sceneDelorean !== 'voyage') { clearInterval(tic); return; }
          const v = vitesseDelorean(Date.now() - depart);
          if (v === vitesseAffichee) return;   // 88 atteint : plus rien à repeindre
          vitesseAffichee = v;
          dessiner();
        }, CADENCE_COMPTEUR_MS);
      }
    } else if (!delorean) {
      deloreanArme = false;
    }
    // Le survol passe PAR-DESSUS n'importe quelle vue, écran de nuit compris : 01 h 21 est par
    // définition en pleine nuit (comme le 21 octobre et le 5 novembre entre 23 h et 5 h), et la
    // maison, elle, joue déjà ses vrais effets lumineux à cette heure-là. Toujours descendant de
    // `#app`, jamais `document.body` : c'est de là que descendent les jetons de couleur Material 3
    // (`.m3`, `jetons.css`) — un `<div class="delorean">` posé ailleurs perdrait `--md-*` par
    // héritage CSS et retomberait sur un repli sans rapport avec la palette de l'écran.
    // `niveauInitial !== 'aucun'` (tâche 8) : ce clin d'œil n'a pas de rôle `data-mvt` (ce n'est
    // pas une tuile/un bloc/une vue — un survol PAR-DESSUS tout, cf. ci-dessus), donc rien dans le
    // moteur ne peut le couper pour lui ; c'était `.mvt-aucun .delorean { animation: none; opacity:
    // 0 }` en CSS (retiré de `base.css` avec le reste des classes `mvt-*`, cette même tâche) — on
    // ne le RESTITUE même plus (juste `''`), ce qui est strictement mieux : rien à peindre du tout
    // plutôt qu'un aplat invisible.
    const survol = () => (sceneDelorean !== null && niveauInitial !== 'aucun'
      ? rendreDelorean(sceneDelorean, vitesseAffichee) : '');

    // Tâche 8, ronde de correction 1 : la nuit (23 h → 5 h, cf. `momentDuJour`) prime sur TOUT,
    // y compris sur un contact déjà en cours sur « Toute la maison ». Première version : le hash
    // primait, sur l'idée qu'un contact explicite prouvait que quelqu'un agissait déjà devant
    // l'écran. Mais rien ne reprenait la main si l'heure basculait *pendant* que cette vue était
    // ouverte (`dessiner()` est aussi rappelée toutes les 20 s par l'horloge, sans qu'aucun
    // contact n'ait eu lieu) : jusqu'à 45 s de grille à 9 tuiles sur fond clair dans une pièce
    // qui vient de passer en pleine nuit — exactement ce que l'écran de nuit existe pour éviter.
    // Le cas d'usage central de cet écran (quelqu'un qui traverse le salon en pleine nuit) prime
    // donc sur celui, plus rare, de quelqu'un déjà en train d'agir sur « Toute la maison » au
    // moment précis où l'heure bascule. En pratique la vue « Toute la maison » ne redevient
    // atteignable qu'au petit matin (`moment !== 'nuit'`) : son bouton d'accès ne vit que sur
    // l'écran normal (`rendu/corps.ts`), jamais sur l'écran de nuit, donc aucun contact ne peut
    // de toute façon la rouvrir tant que la nuit dure.
    // Tâche 9, retour du coordinateur : l'écran de nuit reçoit `horsLigne` lui aussi — le
    // grisage `.muet` seul (posé plus haut sur `racine`, universel) n'y suffit pas, cf. le
    // docstring de `rendreNuit`.
    //
    // Tâche 9 (réveil) : `!reveilNuit` en plus de `moment === 'nuit'` — un écran réveillé saute ce
    // retour anticipé et tombe dans le rendu normal plus bas (bandeau + corps), en palette soir
    // (`momentRendu`, juste après ce bloc). `reveiller` n'est passé QUE dans cette branche
    // (l'écran de nuit est le seul qui l'utilise) : quand l'écran est réveillé, on ne rend plus
    // `rendreNuit` du tout, donc rien n'a besoin de lui repasser ce rappel.
    if (moment === 'nuit' && !reveilNuit) {
      moteur.peindre(html`${rendreNuit(etat, maintenant, piece, horsLigne, reveiller)}${survol()}`);
      return;
    }
    // Tâche 9 (réveil) : l'écran réveillé se présente comme un écran du SOIR, jamais de la NUIT,
    // au sens de ce que `demarrage.ts` transmet en aval — `momentDuJour` (`contexte.ts`) reste
    // pure et ignore tout de ce réveil : c'est ici, dans ce que le RENDU reçoit, que la nuit
    // devient un soir, jamais dans la règle horaire elle-même. Si l'heure sort d'elle-même de la
    // plage nuit pendant que l'écran est réveillé, ce `momentRendu` redevient égal à `moment` tout
    // seul (la condition est fausse) : rien de spécial à faire, le prochain rendu est déjà celui
    // du jour ou du soir réel.
    //
    // Ronde de correction 1 (revue du coordinateur) : sans effet OBSERVABLE aujourd'hui — corrigé
    // ici pour ne plus l'affirmer à tort. `rendreBandeau` (`rendu/bandeau.ts`) déclare un
    // paramètre `moment` qu'il ne lit jamais dans son corps (préexistant, hors périmètre de cette
    // tâche, signalé au rapport) : lui passer `'soir'` plutôt que `'nuit'` ne change donc rien à
    // ce qu'affiche le bandeau. Le résultat visuel voulu (palette sombre) est déjà atteint par un
    // autre chemin, `.sombre` (`moment !== 'jour'`, vrai identiquement pour `'nuit'` et `'soir'`).
    // `momentRendu` reste posé et transmis : c'est la valeur sémantiquement juste à donner à
    // `rendreBandeau`, et le jour où son paramètre `moment` sera effectivement lu, ce câblage n'aura
    // pas besoin d'être repris.
    const momentRendu: Moment = moment === 'nuit' && reveilNuit ? 'soir' : moment;
    // Tâche 9, ronde de correction 1 : la vue « Toute la maison » reçoit `horsLigne` elle aussi
    // (signal, cf. `rendu/maison.ts`) ; le refus des actions elles-mêmes est indépendant de ce
    // rendu, posé une seule fois dans `creerAppui` plus haut (`estHorsLigne`).
    if (location.hash === '#maison') {
      moteur.peindre(html`${rendreMaison(etat, piece, horsLigne)}${survol()}`);
      return;
    }
    // Tâche 18 : vue « Tâches » — `aplatirTaches`/`repartirTaches` (`cochage.ts`) transforment le
    // cache brut (`taches`, alimenté par `chargerTaches`) en lignes prêtes à rendre, en excluant
    // celles déjà cochées localement (`cochage.estMasquee`, retrait optimiste) et en réservant la
    // dernière ligne à un compte-rendu si tout ne tient pas dans le budget de la vue.
    if (location.hash === '#taches') {
      const plates = aplatirTaches(taches, listesPiece, cochage.estMasquee);
      const { visibles, reste } = repartirTaches(plates);
      moteur.peindre(html`${rendreTaches(visibles, reste, cochage.estArmee, horsLigne)}${survol()}`);
      return;
    }
    // Tâche 10 bis : troisième et dernière sous-vue plein écran, exactement au même niveau que
    // « Toute la maison »/« Tâches » ci-dessus — ni bandeau, ni rangée de commandes, ni ligne de
    // synthèse. `dureeMinuteur`/`etiquetteMinuteur` restent les mêmes variables locales qu'avant
    // cette tâche ; seule leur PORTE D'ENTRÉE (`location.hash` plutôt qu'un booléen local) a
    // changé, cf. `brancherMinuteur` plus haut.
    if (location.hash === '#minuteur') {
      moteur.peindre(html`${rendreReglageMinuteur(dureeMinuteur, etiquetteMinuteur,
                                          piece.etiquettesMinuteur ?? [])}${survol()}`);
      return;
    }
    // Lot « recette » (2026-08-17) : quatrième et dernière sous-vue, au même niveau que les trois
    // ci-dessus. `recetteUid !== null` en plus du hash : un `#recette` résiduel (navigation
    // antérieure, repas disparu du plan) ne doit pas rendre un cadre vide — l'écran retombe alors sur
    // l'accueil, exactement comme si le hash n'avait pas été posé.
    //
    // L'étiquette et le plat ne sont repris du repas suivant que s'il s'agit BIEN de la recette en
    // cours : pendant une cuisson, le plan a pu basculer sur le repas d'après (marge de grâce
    // dépassée), et écrire « Petit-déjeuner · 7 h 30 » au-dessus des étapes du dîner serait un
    // mensonge. Les décomptes des boutons viennent de HA (`vuesMinuteurs`), jamais d'un compte à
    // rebours local — cf. `VueRecette.minuteurs` (`rendu/recette.ts`).
    if (location.hash === '#recette' && recetteUid !== null) {
      // Construite UNE FOIS : `reScinder` a besoin des mêmes `minuteurs`/`slotLibre` que le rendu
      // qu'il vient de peindre (`ContexteMinuteurs`, `rendu/recette.ts`) — jamais une seconde copie
      // qui pourrait diverger de ce qui est réellement affiché.
      //
      // L'étiquette et le plat sont ceux relevés À L'OUVERTURE, jamais relus du capteur : pendant
      // une cuisson, `sensor.home_stock_next_meal` peut basculer sur le repas d'après, et écrire
      // « Demain, petit-déjeuner » au-dessus des étapes du dîner en cours serait un mensonge.
      const vueRecette: VueRecette = {
        etiquette: etiquetteRecette || 'Recette',
        plat: platRecette,
        pages: pagesRecette,
        page: pageRecette,
        minuteurs: vuesMinuteurs.map((v) => ({ nom: v.nom, restantS: v.restantS, actif: v.actif })),
        slotLibre,
        ingredients,
        panneauOuvert: panneauIngredients,
        pageIngredients,
        horsLigne,
        armee: (cle: string) => armementRepas.estArmee(cle),
        ...(messageRecette ? { message: messageRecette } : {}),
      };
      moteur.peindre(html`${rendreVueRecette(vueRecette)}${survol()}`);
      // Sous-découpage : mesuré sur le DOM peint, jamais estimé. `reScinder` rend `null` quand la
      // page tient — sans quoi chaque peinture en déclencherait une autre. Repart TOUJOURS de la
      // SOURCE (cf. son docstring) : les pages recomposées portent encore leurs tags de minuteur,
      // vivants au prochain rendu.
      const recalculees = reScinder(racine, pagesRecette, pageRecette, vueRecette);
      if (recalculees) {
        // `pageSourceIndex` suit la même recomposition que `pagesRecette` (`etendreIndexSource`,
        // `rendu/recette.ts`) : `memoriserRecette` en dépend, cf. son docstring.
        pageSourceIndex = etendreIndexSource(
          pageSourceIndex, pageRecette, pagesRecette.length, recalculees.length);
        pagesRecette = recalculees;
        dessiner();
      }
      return;
    }

    // `horsLigne` prime sur TOUT, y compris sur une alerte : afficher une alerte comme si elle
    // était à jour alors que la connexion est morte depuis 30 s serait exactement le mensonge que
    // la tâche 9 a éliminé. Ce n'est pas un mode — c'est la question « ce que je montre est-il
    // encore vrai ? », qui se pose avant celle du rang. Tous ces blocs partagent le même gabarit
    // (`.t`/`.v`) et se REMPLACENT l'un l'autre, jamais en plus : la hauteur de l'écran ne bouge
    // pas d'un mode à l'autre.
    // Tâche 9 bis : la confirmation de la voiture prime sur l'optimisme — dès que le capteur dit
    // ce que le geste demandait, on cesse d'afficher un mouvement en cours. Même discipline que
    // `Etat.confirme`. Posée ici, juste avant `blocCentral`, donc APRÈS les retours anticipés
    // (nuit, `#maison`, `#taches`) : sur ces vues, `climEnVol` reste tel quel tant qu'on ne revient
    // pas à l'écran normal — sans conséquence visible (aucune d'elles ne rend `.vt-bouton`), et le
    // minuteur de 3 minutes posé par `brancherVoiture` ci-dessus reste de toute façon le filet qui
    // finit par effacer l'optimisme si personne ne revient jamais sur l'écran normal.
    if (climEnVol !== null && piece.voiture) {
      const marche = etat.estUtilisable(piece.voiture.clim)
        && etat.lire(piece.voiture.clim)!.etat === 'on';
      if ((climEnVol === 'demarrage') === marche) { climEnVol = null; jetonClim++; }
    }

    // Tâche 17 : le repli du bloc par défaut. Calculé À PART et gardé dans une variable pour deux
    // raisons, pas une seule :
    //   - il sert de repli aux DEUX blocs (repas en cuisine, rendez-vous au bureau) sans être
    //     recalculé deux fois ;
    //   - c'est cette RÉFÉRENCE qui répond ensuite à « l'entretien est-il réellement affiché ? »
    //     (`blocCentral === replEntretien`, plus bas). Un `TemplateResult` est un objet neuf à
    //     chaque appel de `html` : la comparaison d'identité est donc vraie pour cette branche et
    //     pour elle seule — jamais pour l'alerte, le minuteur, le ménage ni aucun autre mode, qui
    //     produisent chacun leur propre objet. C'est la seule façon de faire dépendre la garde
    //     anti-doublon de ce qui est RÉELLEMENT rendu plutôt que de la pièce (cf. `masquerEntretien`).
    // Calculé uniquement pour les deux pièces qui peuvent l'afficher : le salon (`'voiture'`) garde
    // son bloc en toutes circonstances, lui fabriquer un repli qu'il n'atteint jamais serait du
    // travail mort à chaque redessin.
    //
    // Tâche 17 bis (relecture, défaut D4) : le bloc obéit au modulateur `invites` comme la ligne
    // de synthèse qu'il remplace. `todo.maintenance` est déclaré `perso: true` dans les trois
    // pièces (`ecran.ts`) et son écart disparaît donc sous `input_boolean.mode_invites`
    // (`rendu/corps.ts`) — le bloc central, lui, l'affichait EN GRAND et EN DÉTAIL au milieu de
    // l'écran : exactement la donnée que ce modulateur existe pour cacher, et plus bavarde
    // qu'avant la tâche 17. Régression, corrigée ici.
    // La condition se lit sur la DÉCLARATION de la pièce (`perso` sur l'entrée de synthèse qui
    // porte cette même entité), jamais sur un « l'entretien est personnel » réécrit ici : une
    // seule déclaration pour les deux emplacements, donc rien à resynchroniser le jour où le
    // propriétaire change d'avis sur ce qu'il montre à ses invités.
    // CONSÉQUENCE ASSUMÉE : sous mode invités, sans repas planifié ni rendez-vous restant, le trou
    // de ~170 px que la tâche 17 comblait revient. C'est le comportement d'avant cette tâche, et
    // le propriétaire n'a pas arbitré autre chose — mieux vaut un fond nu qu'une liste de piles à
    // changer étalée devant des invités.
    const entretienPerso = piece.synthese.some((e) => e.entite === ENTITE_ENTRETIEN && e.perso);
    const replEntretien = (agencement.blocDefaut === 'repas' || agencement.blocDefaut === 'agenda')
      && !(ctx.modeInvites && entretienPerso)
      // Tâche 17 bis (relecture, défaut D2) : le MÊME chemin que la vue « Tâches »
      // (`aplatirTaches`, `cochage.ts`), donc le même retrait optimiste — jamais le cache brut.
      // Sans lui : double appui pour cocher « Purificateur — filtre à remplacer », la ligne
      // disparaît de la vue, retour automatique à l'accueil 45 s plus tard, et le bloc central
      // annonçait toujours trois tâches en citant celle qui venait d'être cochée, pendant que la
      // synthèse (à 2) était masquée. Même liste, deux comptes, sur la même tablette.
      // `aplatirTaches` rend des `TacheAffichee` (un `{ uid, texte }` enrichi d'`entite`/`liste`),
      // que `rendreEntretien` accepte tel quel sans rien connaître de ces champs en plus.
      ? rendreEntretien(aplatirTaches(taches, [ENTITE_ENTRETIEN], cochage.estMasquee)) : undefined;

    // Tâche 10 bis : le réglage n'est plus un état de ce bloc — il a son propre retour anticipé
    // plus haut (`location.hash === '#minuteur'`), jamais atteint depuis ici.
    const blocCentral =
      horsLigne ? rendreHorsLigne()
      : mode === 'alerte' && alerte ? rendreAlerte(alerte)
      // Lot « recette » : la recette réduite passe DEVANT le minuteur (cf. `modePrincipal`,
      // `modes.ts`) — le mode `minuteur` n'affiche aucune commande, donc sans cette préséance,
      // lancer une cuisson ferait disparaître le seul point de reprise de la recette. Le décompte
      // du minuteur le plus urgent est repris dans le bloc : rien n'est perdu.
      // REVUE FINALE — LE NUMÉRO D'ÉTAPE COMPTE LES PAGES SOURCE, JAMAIS LA SOUS-DÉCOUPE.
      // `pagesRecette.length` (l'ancienne valeur) est la version SOUS-DÉCOUPÉE : elle affichait
      // « Étape 2/4 » sur une recette de 3 étapes. `etapeSource` (`rendu/recette.ts`) lit la table
      // `pageSourceIndex` à la place ; cf. son docstring pour le passage du spec qui l'impose.
      // Le décompte affiché n'est repris que d'un minuteur RÉELLEMENT EN MARCHE (`.actif`) :
      // `listerMinuteurs` trie les actifs d'abord, donc `vuesMinuteurs[0]` est un minuteur EN PAUSE
      // dès qu'aucun ne tourne — et son restant, figé, s'affichait comme s'il descendait. Le spec
      // (§4) ne promet ce décompte que « quand un minuteur tourne : le plus urgent ».
      : mode === 'recette' ? rendreRecetteReduite({
          ...etapeSource(pageSourceIndex, pageRecette),
          plat: platRecette || 'Recette',
          ...(minuteurActif ? { restantS: minuteurActif.restantS } : {}),
        })
      : mode === 'minuteur' ? rendreMinuteurs(vuesMinuteurs, slotLibre)
      : mode === 'menage' && piece.aspirateur ? rendreMenage(etat, piece.aspirateur)
      : (mode === 'cinema' || mode === 'media') && source ? rendreCarteMedia(source, maintenantMs)
      : mode === 'aeration' ? rendreAeration(etat, piece.ouvrants)
      : mode === 'voiture' && piece.voiture ? rendreVoiture(etat, piece.voiture, climEnVol)
      // Tâche 14 : le mode `defaut` (ex-`previsions`) n'a plus rien à calculer lui-même —
      // `agencement.blocDefaut` dit QUEL contenu (repas, agenda, rien) lui revient ; `rendreRepasSuivant`/
      // `rendreProchainRdv` (`rendu/defaut.ts`) rendent `undefined` si rien à montrer (plan de
      // repas vide, plus de rendez-vous aujourd'hui), et `blocCentral` reste alors `undefined` —
      // exactement le même contrat que tous les autres modes ci-dessus.
      // Tâche 17 : le repas et le rendez-vous GARDENT la priorité — l'entretien (`replEntretien`
      // ci-dessus) ne prend que la place qu'ils laissent vide, ce qui, sur cette installation, est
      // le cas le plus courant : planning de repas vide en permanence, agenda vide dès le soir.
      : agencement.blocDefaut === 'repas' ? rendreRepasSuivant(repasCourant()) ?? replEntretien
      : agencement.blocDefaut === 'agenda' ? rendreProchainRdv(evenements, maintenant) ?? replEntretien
      : undefined;

    // Revue tâche 15 (I1) : l'ancre du rail est posée UNIQUEMENT quand la carte média est
    // réellement à l'écran. Sous `horsLigne` (ou sous une alerte, ou pendant le ménage) elle ne
    // l'est pas : laisser une ancre vivante ferait écrire `--progression` par le tic sur un
    // `.media` qui n'existe pas — ou pire, sur celui d'un rendu précédent encore dans l'arbre.
    // Relecture finale du plan 2 (I4) : `agencement.zones.includes('blocCentral')` en tête. Depuis
    // que la tâche 3 a fait de la composition une DONNÉE, « le bloc central est calculé » ne veut
    // plus dire « le bloc central est rendu » : un agencement qui omet la zone `blocCentral` ne
    // rend rien du tout, et `rendreCorps` ne place même pas le `TemplateResult` reçu. Poser l'ancre
    // du rail dans ce cas, c'est exactement le risque que ce commentaire nomme depuis la tâche 15 —
    // faire écrire `--progression` par le tic « sur un `.media` qui n'existe pas ».
    const carteMediaAffichee = agencement.zones.includes('blocCentral')
      && blocCentral !== undefined && !horsLigne
      && (mode === 'cinema' || mode === 'media') && source !== null;
    ancreProgression = carteMediaAffichee
      ? ancrerProgression(source!.progression, maintenantMs, horlogeMonotone())
      : null;

    // Tâche 14, ronde de correction 1 : `agencement.blocDefaut === 'agenda'` (bureau) affiche déjà le
    // prochain rendez-vous EN GRAND dans le bloc central (`rendreProchainRdv`) — la pastille cède
    // sa place sur cette seule donnée (`masquerRdv`), jamais l'anniversaire du jour, que le bloc
    // ne montre pas. Vrai qu'un mode plus prioritaire (alerte, minuteur...) occupe le bloc central
    // à sa place à ce moment précis : la pastille reste alors muette sur les rendez-vous quand
    // même, cohérent avec « cette pièce montre ses rendez-vous ailleurs qu'au coin du bandeau »,
    // pas avec « ce mode précis est affiché maintenant ».
    const pastille = pastilleBandeau(evenements, jours, maintenant, modulateurs.includes('invites'),
                                     agencement.blocDefaut === 'agenda');

    // Revue tâche 15, mineur M4 : le contexte donné au CORPS décrit l'écran RÉELLEMENT rendu, pas
    // celui que le mode aurait produit. Sous `horsLigne`, le bloc central n'est plus la carte
    // média (deux fois plus haute) mais `rendreHorsLigne()` (une ligne, comme une alerte) — or
    // `ordreCommandes` continuait d'amputer la grille à 2 commandes au motif du mode `media`.
    // L'écran perdait Porte et Rideau pour rendre ~90 px de blanc, précisément au moment où la
    // maison ne répond plus et où le peu qui reste tapable compte le plus. Conséquence bénigne,
    // invariant faux : la place libérée par la carte média n'existe que si la carte est là.
    const ctxCorps: ContexteModes = horsLigne
      ? { ...ctx, ecranAllume: false, sourceJoue: false }
      : ctx;

    // Tâche 17 — garde anti-doublon, même esprit que `carteMediaAffichee` juste au-dessus : ce
    // n'est pas « cette pièce peut afficher l'entretien », c'est « le bloc central rendu à cet
    // instant EST celui de l'entretien ». Un mode plus prioritaire (alerte, minuteur, ménage,
    // média, aération) ou le mode hors ligne a pu confisquer la place, et un soir où un plat est
    // planifié, la cuisine montre le repas : dans tous ces cas l'entretien n'est écrit nulle part,
    // donc la ligne de synthèse doit garder sa mention. `replEntretien !== undefined` exclut au
    // passage le cas « aucune tâche » (la comparaison serait alors `undefined === undefined`,
    // vraie sur un écran sans aucun bloc central — et couperait la synthèse pour rien).
    //
    // Relecture finale du plan 2 (I4) : `agencement.zones.includes('blocCentral')` en plus, même
    // raison que pour `carteMediaAffichee` ci-dessus. Sans lui, un écran dont l'agencement omet la
    // zone `blocCentral` taisait « 3 tâches d'entretien » dans sa ligne de synthèse au motif que le
    // bloc central les affichait — alors que RIEN ne les affichait. C'est l'invariant « le bloc
    // central calculé EST le bloc central rendu » que la tâche 3 a transformé en donnée réglable.
    const entretienAffiche = agencement.zones.includes('blocCentral')
      && replEntretien !== undefined && blocCentral === replEntretien;

    // Tâche 7 : la 4e tuile de la rangée « Ambiance », uniquement pour une pièce qui déclare des
    // minuteurs (la cuisine) — absente pour le salon/bureau (`undefined`, jamais rendue),
    // exactement le contrat que `rendreCorps` documente pour son paramètre `tuileMinuteur`.
    //
    // Ronde de correction 1 (revue du coordinateur) : `!slotLibre` seul confondait deux états très
    // différents sous la même apparence grisée — « les trois minuteurs tournent » (vraiment
    // saturé) et « aucun état `timer.*` n'est encore arrivé » (chargement de la page, ou les ~70 s
    // de silence après un redémarrage de HA, cf. `SEUIL_MUET_MS`) : dans les deux cas,
    // `premierSlotLibre` ne trouve aucun slot `idle` puisqu'aucun n'est même `estUtilisable`. Tant
    // qu'aucun état n'est connu, la tuile doit rester dans son apparence NORMALE — un bouton qui a
    // l'air désactivé pour une raison qu'on ne peut pas expliquer est le bouton mort que ce projet
    // traque partout. `ouvrir()` refuse déjà tout seul si aucun emplacement n'est libre (y compris
    // dans ce cas), donc rien ne s'ouvre à tort le temps que le premier état arrive.
    const auMoinsUnConnu = (piece.minuteurs ?? []).some((s) => etat.estUtilisable(s.timer));
    const tuile = (piece.minuteurs?.length ?? 0) > 0
      ? tuileMinuteur(auMoinsUnConnu && !slotLibre) : undefined;

    // Tâche 8 (moteur de mouvement) : la mesure de cadence et la dégradation qui vivaient ici
    // (un seul nom, `commandes`, et un seul `niveau` pour tout l'écran — une seule mauvaise mesure
    // faisait tomber tout le mur) ont été portées dans `creerMoteur`, PAR RÔLE, puis retirées
    // entièrement à la tâche 1 du chantier grammaire (même défaut, à une échelle différente : une
    // trame longue faisait tomber tous les rôles mesurés ensemble, sans retour avant rechargement).
    // Le niveau est désormais FIXE, décidé une seule fois au montage — cf. `src/mouvement.ts`.
    // `.ecran` (2026-08-28) — LA RACINE DE VUE DE L'ACCUEIL, bandeau compris. Les quatre
    // sous-vues ci-dessus se déclarent au moteur par un élément unique qui couvre tout le cadre ;
    // l'accueil, lui, en rendait DEUX (bandeau + corps) et ne marquait que le second. Une
    // traversée ne fait glisser que l'élément marqué et ne garde en fond que son clone
    // (`mouvement/moteur.ts`) : le bandeau, resté hors de la marque, était donc retiré sec par
    // `lit` au premier rendu de la sous-vue — l'heure disparaissait NET et sa bande de 121 px
    // restait vide pendant les 320 ms du geste (mesuré dans un vrai Chromium sur `#minuteur`,
    // capture à 40 ms). Ce conteneur ne change rien à la mise en page : `.ecran` reprend le
    // `display: flex` en colonne de `#app` (cf. `base.css`), le bandeau y garde son `flex: none`
    // et le corps son `flex: 1`.
    moteur.peindre(html`<div class="ecran" data-mvt="vue:accueil">
                          ${rendreBandeau(etat, momentRendu, maintenant, piece.temperature, pastille)}
                          ${rendreCorps(etat, piece, blocCentral, ctxCorps, tuile, entretienAffiche,
                                        (repasCourant()?.recetteId ?? null) !== null
                                          || recetteUid !== null, agencement)}
                        </div>
                        ${survol()}`);
  }

  await tenter();
}
