#!/usr/bin/env node
/** Vérifie ce qu'un œil humain rate : débordement du cadre 343×585, cibles tactiles sous 62 px,
 *  paires de couleurs texte/fond sous 5:1 de contraste, texte tronqué, et — depuis la tâche 18 —
 *  un cadre qui ne réclame pas la hauteur de l'écran dans le moteur des tablettes cuisine et salon
 *  (Chrome 100, qui ignore `dvh` : ce script tourne sur un Chromium moderne, il ne peut voir ce
 *  défaut-là qu'en simulant l'ancien moteur, cf. `simulerMoteurSansDvh`). jsdom (utilisé par les
 *  129 tests unitaires du projet) ne calcule aucune vraie mise en page — ces défauts ont chacun
 *  déjà coûté un cycle de correction lors de la refonte Lovelace qui a précédé ce projet,
 *  découverts à l'œil sur la tablette plutôt qu'attrapés par une machine. Ce script ouvre les
 *  pages construites dans un vrai navigateur, au format exact de la dalle, et échoue si l'un de
 *  ces défauts est présent.
 *
 *  Usage :
 *    node outils/verifier-rendu.mjs             — vérifie les pages réelles + les modes principaux
 *    node outils/verifier-rendu.mjs --deploye   — idem, mais sur le bundle RÉELLEMENT déployé
 *                                                  dans config/www/wallpanel (l'état des trois
 *                                                  tablettes à cet instant, pas celui de `src/`)
 *    node outils/verifier-rendu.mjs --auto-test — preuve que le vérificateur sait détecter
 *                                                  chaque classe de défaut (fixtures en mémoire,
 *                                                  aucun réseau ni fichier touché)
 *
 *  Tâche 13 — QUEL CODE EST MESURÉ. Par défaut, ce script sert aux pages `salon/bureau/cuisine`
 *  un bundle construit À L'INSTANT depuis `src/` (esbuild, en mémoire, `write: false`), servi par
 *  interception de requête (`context.route`) à la place de `/local/wallpanel/wallpanel.js|css`.
 *  Les pages HTML, l'origine, la session et le websocket restent ceux de Home Assistant : seul le
 *  bundle est substitué. C'est délibéré et non négociable ici — `npm run build` écrit dans
 *  `config/www/wallpanel/`, le dossier réellement servi aux trois tablettes murales : le lancer
 *  DÉPLOIE en production. Un vérificateur ne déploie pas. `--deploye` désactive l'interception
 *  pour aller voir ce que les tablettes affichent vraiment aujourd'hui.
 *
 *  Nécessite une session Home Assistant : la page ne montre autre chose que l'écran « Session »
 *  que si `localStorage.hassTokens` contient un jeton valable, à la même origine que HA (les
 *  appels de `connexion.ts`/`demarrage.ts` sont tous relatifs). Le jeton est lu dans
 *  `data/.mcp.json` (jamais écrit dans `config/www/`, servi sans authentification) et injecté
 *  via `context.addInitScript`, avant tout script de la page. */
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import esbuild from 'esbuild';

/* `NIVUUS_HA_DATA` : le repertoire de donnees de l'instance Home Assistant a
 * mesurer — celui qui porte `.mcp.json`, d'ou ce script tire l'URL et le jeton.
 * Il etait CODE EN DUR jusqu'au 2026-09-05, ce qui figeait cet outil sur une
 * seule machine et laissait un chemin de production dans du code suivi par git.
 * Exemple : NIVUUS_HA_DATA=<repertoire de donnees HA> node outils/verifier-rendu.mjs
 */
function racineDonnees() {
  const d = process.env.NIVUUS_HA_DATA;
  if (!d) {
    console.error('NIVUUS_HA_DATA n\'est pas defini : indiquez le repertoire '
      + 'de donnees de Home Assistant (celui qui contient .mcp.json).');
    process.exit(2);
  }
  return d.replace(/\/$/, '');
}
const DATA = racineDonnees();

// Le bundle REELLEMENT DEPLOYE, celui que servent les tablettes (option
// --deploye). Surchargeable, avec pour defaut le chemin du socle home-manager :
// c'est la seule installation existante, et l'outil doit rester utilisable sans
// ceremonie. Il ne cite plus l'emplacement disparu le 2026-08-28.
const WWW_WALLPANEL = process.env.NIVUUS_WWW_WALLPANEL
  ?? '/opt/nivuus/home-manager/config/www/wallpanel';
// Racine `src/` résolue par rapport à CE FICHIER, jamais un chemin absolu figé sur l'installation
// de production (contrairement à `DATA`/`WWW_WALLPANEL` ci-dessus, délibérément fixes : eux
// vérifient LA tablette réelle). Le contrôle tactile plus bas (tâche 15) doit au contraire rester
// vrai si tout le projet est copié ailleurs pour un essai — sinon la preuve « le vérificateur
// rougit sur une copie où le défaut est réintroduit » bundlerait par erreur le `geste.ts` de
// l'original resté intact, jamais celui de la copie modifiée.
const SRC_APP = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const LARGEUR = 343;
const HAUTEUR = 585;
const CIBLE_MIN_PX = 62;
const CONTRASTE_MIN = 5;

/** Les SEULS endroits où une troncature par `-webkit-line-clamp` est voulue, documentée, et donc
 *  non fautive. Une liste NOMMÉE, jamais un désarmement de la classe entière (ronde de correction
 *  1 de la tâche 13, relecteur) : le premier jet exemptait tout élément clampé, ce qui rendait
 *  muet le cas réellement dangereux — `.pastille .pv` reçoit `anniversaire.resume` et
 *  `proches[0].e.resume` (`agenda.ts`), c'est-à-dire des titres d'événements de calendrier de
 *  LONGUEUR LIBRE, dont les deux tiers peuvent disparaître sans que rien ne le signale.
 *
 *  - `.v.deux-lignes` : le titre de la carte média. Borne assumée et documentée dans `base.css`
 *    (« deux lignes maximum, jamais une : les titres YouTube sont longs — 71 caractères
 *    relevés »). Le cas nominal DÉPASSE ces deux lignes ; le compter comme faute condamnerait le
 *    vérificateur à rougir en permanence, donc à ne plus être lu.
 *  - `.pastille .pv` : Y A REJOINT `.v.deux-lignes` À LA REVUE DE LA TÂCHE 15, SUR MESURE ET NON
 *    SUR PRINCIPE. La tâche 13 l'en avait délibérément exclu (« un rendez-vous coupé au milieu
 *    est une information perdue »), et ce raisonnement se défendait tant que personne n'avait
 *    regardé ni la géométrie ni les vraies données. Les deux ont été mesurées :
 *
 *      · GÉOMÉTRIE. `.pastille .pv` dispose de 133 px (piste `minmax(0, 44%)` de `.cap`) sur
 *        deux lignes de 16,25 px, soit ~35 caractères. Passer le clamp à trois lignes porterait
 *        la colonne droite à ~127 px contre 121 px pour la colonne gauche : c'est ALORS elle qui
 *        fixerait la hauteur du bandeau, et l'invariance obtenue à la tâche 8 tomberait — pour
 *        6 px, sur un écran dont le mode le plus serré (`menage`) n'a que 3 px de reste. La
 *        troncature au-delà de ~35 caractères n'est donc pas un défaut réparable : c'est le
 *        plafond de place de cet emplacement.
 *      · DONNÉES RÉELLES. Les quatre calendriers de l'installation, relevés sur ±120 jours :
 *        109 résumés distincts, médiane 29 caractères, 9e décile 43, maximum 57 (« Meet-up Golf
 *        Innovation Auvergne 2026 | French Tech x CIC »). 22 sur 109 dépassent la capacité — un
 *        taux de RÉSUMÉS LONGS, pas un taux de rougissement : la pastille n'affiche un résumé de
 *        rendez-vous que dans les 3 h qui le précèdent (`FENETRE_MS`, `agenda.ts`), jamais en
 *        continu. Revue tâche 16 : les 44 anniversaires font en réalité 21 à 34 caractères
 *        (« Prénom Nom - Anniversaire »), donc AUCUN ne dépasse jamais la borne de ~35 caractères
 *        — ils ne sont jamais tronqués (les chiffres « 33 à 34 » et « frôlent la borne » d'une
 *        version antérieure de ce commentaire étaient faux, jamais mesurés).
 *
 *    Conséquence : maintenu en faute dure, ce contrôle exposait un risque de rougir estimé à ~1 %
 *    des exécutions (22/109 résumés longs, chacun visible seulement 3 h avant son rendez-vous, sur
 *    un calendrier qui n'en produit pas tous les jours — pas « un jour sur cinq » comme l'affirmait
 *    une version antérieure de ce commentaire, jamais mesurée), au hasard du calendrier de Maxime
 *    et au milieu d'une release sans rapport — la définition même du garde-fou qu'on finit par ne
 *    plus lire. Il est donc devenu une borne ÉDITORIALE nommée,
 *    comme le titre de la carte média, et le clamp Chromium l'annonce à l'écran par une ellipse
 *    (il ne « disparaît » pas en silence). Ce qui est vérifié à la place — et qui, lui, ne dépend
 *    plus du calendrier — est la GÉOMÉTRIE sous un pire cas INJECTÉ (`RESUME_LONG` ci-dessous,
 *    exactement comme le titre YouTube de 71 caractères l'est pour la carte média) :
 *    `verifierPastilleLongue` impose que le bandeau ne regonfle pas et qu'aucune troncature dure
 *    n'apparaisse ailleurs. Le fait que la pastille SOIT bornée reste imprimé à chaque exécution,
 *    jamais tu. */
// Ronde de correction 1 (tâche 10 bis, relecture) : `.synthese-texte` rejoint la liste — bornée à
// 2 lignes (`base.css`) depuis que le mode `voiture` a été mesuré à 590 px (63 px de plus que ce
// que cette même exécution rapportait) avec `cover.rideau_salon` ouvert en plus de l'état déjà
// injecté ci-dessous (batterie < 30 %) : un jour de rideau ouvert (automation quotidienne) et de
// liste d'entretien non vide suffit à porter cette ligne à 3 écarts, donc 3 lignes.
// Ronde de correction (2026-08-25) : `.commande .s` rejoint la liste. Le sous-titre de tuile était
// `white-space: nowrap` sans contrainte de largeur — la boîte interne de `.commande`, enfant de
// flex donc `min-width: auto`, s'élargissait à la min-content du texte (266 px pour une tuile de
// 150,5 px) et poussait la page cuisine 125 px hors du cadre, le texte étant au passage coupé NET.
// Borné à 2 lignes (`base.css`), il tient dans les 64 px de la tuile sans en changer la hauteur.
// Le pire cas réel est « Petit-déjeuner chèvre-tomates-pain complet » (42 caractères), sous la
// tuile « Recette » de la cuisine : deux lignes en montrent l'essentiel, l'ellipse dit le reste.
const CLAMPS_VOULUS = ['.v.deux-lignes', '.pastille .pv', '.synthese-texte', '.commande .s'];

/** Tâche 12 (round 1, point 4) — même patron que `CLAMPS_VOULUS` ci-dessus, pour le contrôle
 *  générique `overflow: hidden` (`analyserRendu`) : une exemption se NOMME, elle ne se déduit pas
 *  d'un mécanisme CSS. `.heure` est la SEULE trouvée à l'exécution — son `overflow: hidden` est
 *  documenté et VOULU (`base.css`, tâche 13) : il masque le chiffre sortant du roulement animé
 *  (`.chiffre`, `transform`), pas une troncature de contenu. Les quelques pixels mesurés en trop
 *  (glyphe vs `line-height: 1`) n'ont jamais rien caché de lisible. */
const OVERFLOW_VOULUS = ['.heure'];

/** Le pire résumé d'événement RÉELLEMENT présent dans les calendriers de l'installation (relevé
 *  ±120 jours autour du 2026-08-03 : 109 résumés distincts, celui-ci est le plus long à 57
 *  caractères). Injecté par `verifierPastilleLongue`, exactement comme le titre YouTube de 71
 *  caractères l'est pour la carte média : un pire cas MESURÉ, jamais un pire cas imaginé. */
const RESUME_LONG = 'Meet-up Golf Innovation Auvergne 2026 | French Tech x CIC';

/** Revue tâche 15, constat I2 — LE CONTRÔLE DE CIBLE NE MESURAIT QUE LA HAUTEUR, alors que le
 *  défaut historique pour lequel il a été construit agissait EN LARGEUR. Les boutons de transport
 *  de la carte média (revue de la tâche 6) étaient tombés à ~57 px sous le `flex-shrink` par
 *  défaut : `flex-shrink` rétrécit un enfant flex sur l'axe PRINCIPAL, ici horizontal. Un
 *  `.media-bouton` à 57 × 62 ressortait donc vert. L'auto-test le montrait involontairement — il
 *  « attrape » `.media-pas` à 44 px en HAUTEUR, alors que `.media-pas` fait réellement 44 px de
 *  LARGE en production et passe très bien.
 *
 *  Le plancher de largeur ne peut PAS être uniforme à 62 px : la plupart de ces cibles n'ont
 *  aucune largeur déclarée (elles la tiennent d'une grille ou d'un `flex: 1`), et `.media-pas`
 *  fait 44 px par conception. On le pose donc UNIQUEMENT là où la largeur est fixée par une
 *  déclaration de `base.css`, avec la valeur de cette déclaration — un plancher qui vérifie ce
 *  que le CSS PROMET, jamais un chiffre inventé.
 *
 *  COUVERT (largeur déclarée dans `base.css`) :
 *    `.media-bouton` 62 px — `width: 62px; height: 62px`, carré, `flex: none` ;
 *    `.media-pas`    44 px — `width: 44px`, `flex: none` ;
 *    `.media-rail`   56 px — `min-width: 56px` (plancher déclaré, largeur réelle variable).
 *  NON COUVERT (aucune largeur déclarée, donc aucun plancher honnête à poser) :
 *    `.ambiance`/`.commande`/`.tuile` (pistes de grille `1fr`), `.xl` (pleine largeur),
 *    `.mode-action` (largeur dictée par son libellé et son `padding`). Pour celles-là, le seul
 *    garde-fou reste le débordement du cadre, déjà en place. */
const PLANCHERS_LARGEUR = {
  '.media-bouton': CIBLE_MIN_PX,
  '.media-pas': 44,
  '.media-rail': 56,
  // Tâche 10 — minuteurs et voiture. `.mn-bouton` (pause/lecture/annuler) et `.mn-etiquette`
  // (choix rapide d'un aliment) déclarent chacun `min-width: 62px` dans `base.css` : le CSS
  // PROMET 62, donc le plancher vaut 62, exactement le même principe que `.media-bouton`
  // ci-dessus. `.mn-etiquette` n'a JAMAIS été exemptée (arbitrage du propriétaire, 2026-08-03,
  // cf. `base.css` : « 62 px comme tout le reste ») — l'omettre ici aurait rendu cette
  // exigence invérifiable, un désarmement silencieux déguisé en oubli.
  //
  // NON COUVERTS, et volontairement : `.mn-nouveau`, `.mn-ligne` et `.vt-bouton` (mesurés en
  // HAUTEUR seulement, cf. `cibles` plus bas) n'ont aucune largeur déclarée dans `base.css` —
  // ils tiennent leur largeur de leur conteneur (`.minuteurs`/`.voiture`, tous deux en
  // `flex-direction: column`, donc `stretch` par défaut). Même situation que `.ambiance`/
  // `.commande`/`.tuile`/`.xl` juste au-dessus : leur poser un plancher inventé rougirait sur
  // une largeur qui n'a jamais été promise par quoi que ce soit.
  '.mn-bouton': CIBLE_MIN_PX,
  '.mn-etiquette': CIBLE_MIN_PX,
};

const PARAMS_ANALYSE = {
  cibleMin: CIBLE_MIN_PX, contrasteMin: CONTRASTE_MIN, clampsVoulus: CLAMPS_VOULUS,
  planchersLargeur: PLANCHERS_LARGEUR, overflowVoulus: OVERFLOW_VOULUS,
};

// Les trois tablettes visées à terme (tâches 11 et 12) — seul `salon` existe pour l'instant.
const PIECES = ['salon', 'bureau', 'cuisine'];

/** Tâche 13 — LES MODES PRINCIPAUX (`modePrincipal`, `src/modes.ts`), chacun avec l'état à
 *  pousser dans l'application pour l'atteindre. Le budget de hauteur ne se compte PAS une fois
 *  pour toutes : la carte média fait 153 px de plancher là où le bloc de prévisions qu'elle
 *  remplace en fait moitié moins. Chaque mode doit tomber sous 585 px pour son propre compte —
 *  c'est CETTE vérification-ci qui le prouve, jamais le tableau du spec (qui estimait le mode
 *  média à 572 px sans l'avoir jamais mesuré).
 *
 *  Les états ne sont jamais poussés par Home Assistant : le vérificateur ne change rien dans la
 *  vraie maison. Ils sont injectés DANS la page, par le même chemin que le websocket
 *  (`Etat.appliquer`), via `window.__injecter` — posé par `demarrage.ts` sous la garde `?essai=1`.
 *
 *  `marqueur` : ce qui PROUVE que le mode visé est bien celui qui est rendu. Sans lui, une
 *  télévision réellement allumée dans le salon (le websocket est vivant, la maison continue de
 *  pousser ses états pendant la mesure) ferait rapporter la hauteur du mode cinéma sous le nom
 *  d'un autre — une mesure fausse présentée comme vraie, le pire résultat possible ici.
 *  `ilYaMs` (4e élément d'un état) antidate `changeLe` : cf. `__injecter` dans `demarrage.ts`.
 *
 *  `pages` (tâche 10, DÉCISION D'ARCHITECTURE non prévue par le brief — signalée dans le rapport
 *  de tâche) : absent = testé au SALON, comme les six modes d'origine (`pageDuMode`, plus bas).
 *  Jusqu'à la tâche 9 bis, mesurer les six modes au salon suffisait : `ecran.ts` n'y déclare rien
 *  que le salon ne possède pas. Deux faits changent la donne :
 *    - `minuteur` n'existe QU'en cuisine (seule pièce à déclarer `piece.minuteurs`) — le salon ne
 *      peut structurellement jamais rendre `.minuteurs`, quel que soit l'état injecté ;
 *    - `voiture` a pris la place PAR DÉFAUT du salon (`piece.blocDefaut` est un fait STATIQUE de
 *      `ecran.ts`, jamais dérivé d'un état HA) : `.prevision` n'y apparaîtra donc plus JAMAIS,
 *      quoi qu'on injecte — d'ailleurs `.prevision` n'existe plus DU TOUT depuis la tâche 14
 *      (les six prochaines heures ont disparu partout). Mesurer `repas`/`agenda` (son successeur,
 *      cf. `MODES`) au salon serait un « mode non atteint » permanent, pas une régression
 *      détectée — exactement le faux échec que ce contrôle doit éviter.
 *  Le vérificateur navigue donc réellement vers `${pages[0]}.html` quand un mode le demande (cf.
 *  `allerSurPage`), et neutralise/réattend un écran vivant après coup — même discipline que le
 *  `page.goto` initial. `pages` reste un TABLEAU (fidèle au brief), mais seul son premier élément
 *  sert : une seule pièce suffit à mesurer un mode, HA n'ayant que trois pages au total. */
const AERATION_ANCIENNETE_MS = 11 * 60_000;   // > AERATION_MS (10 min, `modes.ts`)

// Horloge figée pour toute la mesure des modes : 2026-05-07 14 h, un jeudi ordinaire (cf. son
// usage détaillé dans `verifierModes`). Hissée au niveau du module (et non plus locale à
// `verifierModes`, où elle vivait avant la tâche 10) : les états `minuteur` ci-dessous ancrent
// leur `finishes_at` SUR cette même horloge, jamais sur `Date.now()` réel du process Node — une
// horloge murale que rien ne fige côté Node, à des mois de la date figée côté navigateur. Un
// `finishes_at` calculé sur `Date.now() + 754_000` (l'écriture initiale envisagée) aurait donc
// affiché un décompte de plusieurs MOIS au lieu de 754 s : exactement l'erreur que la tâche 8 a
// déjà commise puis corrigée (« le brief se trompait — Date.now() réel contre l'horloge figée »,
// cf. `progress.md`) — et qui recommençait ici si elle n'était pas corrigée avant même d'écrire
// le premier test.
export const JOUR_COURT = new Date(2026, 4, 7, 14, 0, 0);   // jeudi 7 mai — une date courte ordinaire

/** Tâche 14 : ISO LOCAL (sans « Z »/décalage), comme `start.dateTime` d'un événement de
 *  calendrier HA avec heure. `toISOString()` ne convient PAS ici : il convertit en UTC, ce
 *  qu'`estCeJour` (`src/agenda.ts`) compare ensuite TEXTUELLEMENT à la date locale de l'horloge
 *  figée (`JOUR_COURT`) — sur un hôte dont le fuseau recule assez (ex. UTC-8), 16 h 45 locales
 *  franchirait minuit en UTC et `estCeJour` verrait le mauvais jour, quelle que soit l'heure
 *  wall-clock réellement visée. Utilisée pour `evenementsInjecte` (mode `agenda`) uniquement :
 *  `finishes_at` (mode `minuteur`, plus bas) reste en `toISOString()` — une simple différence de
 *  millisecondes, jamais comparée textuellement par date, n'a pas ce piège. */
function isoLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// --- Recettes synthétiques pour `#recette` -------------------------------------------------
//
// `__injecterRecette` (posé dans `demarrage.ts` sous la même garde `?essai=1` qu'`__injecterRepas`)
// donne à ce vérificateur le CONTENU d'une recette (plat + description HTML + plan de décrément),
// c'est-à-dire ce que `home_stock/recipe/get` et `home_stock/meal/preview` rendraient — sans
// envoyer la moindre commande à l'instance.
//
// LOT 6 — POURQUOI CE POINT D'INJECTION EST INDISPENSABLE, ET NON UN CONFORT. Le planning de repas
// de cette maison est VIDE la plupart du temps. Sans injection, ce contrôle mesurerait un écran
// sans bloc et sans recette : il passerait à vide, en vert, sans rien contrôler. Un contrôle qui
// ne contrôle rien est pire que pas de contrôle. Le mécanisme est donc conservé de bout en bout
// (il l'était déjà pour l'ancienne source), et seuls ses NOMS et sa charge ont changé.
//
// Le texte ci-dessous est RECONSTITUÉ, pas copié depuis une base réelle : il reprend les deux caractéristiques mesurées et citées
// par le brief de la tâche — 454 caractères de texte visible + une image, la pire page du catalogue
// (« Œufs brouillés + tartines comté ») — et y ajoute un tag de
// minuteur AU MILIEU d'une phrase, comme les vraies recettes en portent (`MOTIF_TAG`,
// `src/recette.ts`). Une page courte ne prouverait ni le sous-découpage ni ce bouton inline.
//
// Le catalogue de recettes de la maison avait été RECOMPTÉ le 2026-08-17 : 87 recettes
// `normal`, dont 84 portent une description. Les commentaires de ce fichier qui disaient « 79 »
// (repris d'un brief) ont été corrigés ; ce nombre-là n'a jamais été mesuré.
//
// Nommés (round 1, point 5) : les mesures ci-dessous ASSERTENT que `.recette-titre` (ou `.mode-bloc
// .v` sur le bloc réduit) porte bien CE plat — sans ça, rien ne distingue une mesure de la fixture
// d'une mesure du VRAI planning du foyer (le faux positif d'origine, round 0 de cette tâche).
const PLAT_ESSAI_LONGUE = 'Œufs brouillés + tartines comté';
const PLAT_ESSAI_GASPACHO = 'Gaspacho + tartine chèvre';

/** Round 2 (revue, point c) : l'URL d'origine (une image servie par la source d'alors) répond 404 — la
 *  caractéristique « + une image » du pire cas, celle qui motive tout le sous-découpage, n'était
 *  donc JAMAIS exercée par ce contrôle. Un `data:` URI charge de façon synchrone et déterministe
 *  (aucun aller-retour réseau, jamais de cache à côté) — un PNG minimal valide (1×1 px, 68 octets),
 *  peu importe son contenu visuel : `.recette-img` (`width: 100%; max-height: 140px;
 *  object-fit: cover;`, `base.css`) l'étire à la largeur du conteneur puis le plafonne à 140 px,
 *  exactement le cas qui doit être mesuré. */
const IMAGE_ESSAI_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** `.recette-img { max-height: 140px }` (`base.css`) — À GARDER IDENTIQUE à cette règle CSS et à
 *  `HAUTEUR_MAX_IMG_PX` (`src/rendu/recette.ts`, qui force la même valeur pendant la mesure hors
 *  écran de `reScinder`) : c'est le plafond que ce contrôle vérifie sur l'écran RÉEL. */
const HAUTEUR_MAX_IMG_PX = 140;

function recetteEssaiLongue() {
  // Le tag de minuteur est posé AU MILIEU du premier `<p>`, le cas de PRODUCTION (round 1 de cette
  // tâche le plaçait ENTRE deux `<p>` pour contourner un défaut alors présent dans `reScinder`, qui
  // recomposait du HTML déjà peint — corrigé depuis : `reScinder` repart désormais toujours de la
  // SOURCE (`decouperEnUnites`, `rendu/recette.ts`), un tag survit à la coupe quelle que soit sa
  // position. Contourner le cas de production ne mesurait plus le cas réel ni l'interlignage autour
  // du bouton — exactement ce que cette mesure doit prouver.
  const page =
    '<h3>Œufs brouillés, tartines de comté</h3>'
    + '<p>Faire chauffer une noisette de beurre dans une poêle antiadhésive à feu doux. Casser '
    + 'les œufs dans un bol, saler, poivrer, battre à la fourchette. Verser dans la poêle '
    + '#Œufs:180 et remuer sans arrêt à la spatule, en raclant le fond, retirer du feu dès que '
    + 'le mélange reste encore légèrement coulant.</p>'
    + `<img src="${IMAGE_ESSAI_PNG}">`
    + '<p>Griller les tranches de pain, les tartiner de beurre puis de comté. Servir aussitôt '
    + 'les œufs à côté des tartines chaudes, avec un peu de ciboulette ciselée.</p>';
  return { plat: PLAT_ESSAI_LONGUE, description: page };
}

/** Recette RÉELLE du planning citée par le propriétaire pour la mesure du panneau d'ingrédients
 *  (7 lignes, cf. `INGREDIENTS_ESSAI_7` ci-dessous). Page courte et sans tag : cette fixture sert
 *  UNIQUEMENT à nommer la recette pour ce contrôle, pas à mesurer les étapes. */
function recetteEssaiGaspacho() {
  return { plat: PLAT_ESSAI_GASPACHO, description: '<p>Mixer, filtrer, servir frais.</p>',
           ingredients: INGREDIENTS_ESSAI_7 };
}

const PLAT_ESSAI_BRUTE = 'Velouté de légumes racines';
const PLAT_ESSAI_BRUTE_REELLE = 'Crevettes poêlées à l\'ail et au citron';

/** ⚠️ CE CAS N'EXISTE PLUS EN PRODUCTION (2026-08-18) — il reste mesuré exprès.
 *  Une passe de mise en page (2026-08-18) avait doté
 *  les 87 recettes `normal` de blocs `.page-recipes` : le compte est passé de 14
 *  sur 84 décrites à ZÉRO, et `verifier_recettes.py` le maintient à zéro. Mais
 *  RIEN n'empêche d'écrire demain une description à la main, et c'est
 *  précisément ce que fait le propriétaire depuis toujours ; le jour où il le
 *  refera, ce chemin doit encore tenir. On garde donc la fixture comme contrôle
 *  de ROBUSTESSE, sans plus prétendre décrire le catalogue.
 *
 *  Ce que le chemin fait : `decouperPages` (`src/recette.ts`) rend alors TOUTE la
 *  description comme une seule page, et si
 *  cette description est elle-même une seule unité de premier niveau (pas de `<p>`/`<h3>` séparés,
 *  juste un bloc de texte continu — un mode d'écriture plausible pour qui n'a jamais utilisé les
 *  blocs `.page-recipes`), `reScinder` ne pouvait STRUCTURELLEMENT pas la couper
 *  (`unites.length < 2`, `rendu/recette.ts`) — un texte assez long restait écrêté en silence.
 *  Reconstitué (768 caractères, plus long que la pire page À BLOCS du catalogue) : un seul `<p>`,
 *  sans balise de séparation, pour reproduire fidèlement ce motif.
 *
 *  Round 3 (revue) : le propriétaire a vérifié les 14 descriptions sans bloc d'alors — 41 à
 *  208 caractères, sans aucune balise enfant, largement sous cette fixture (3,7× la pire réelle).
 *  Le défaut était donc LATENT, pas atteint aujourd'hui — mais corrigé quand même (une longue peut
 *  arriver demain, l'échec était silencieux, et ce vérificateur ne protège jamais la production sur
 *  ce point puisqu'il ne mesure que des fixtures). `reScinder` subdivise désormais une unité seule
 *  trop haute (`subdiviserUnite`, phrases puis mots) : cette fixture doit maintenant PASSER, sans
 *  écrêtage — c'est elle qui prouve le correctif. */
function recetteEssaiBrute() {
  // Round 4 (revue) : `#Cuisson courgettes:1500` — un NOM DE TAG ESPACÉ, un des noms réels cités
  // par le propriétaire (62 des 98 tags du catalogue en portent un, la norme, pas l'exception). Posé
  // ICI, dans la fixture qui passe par `subdiviserUnite` (celle qui n'a AUCUN bloc `.page-recipes`,
  // donc une seule unité de premier niveau, forcément subdivisée en phrases/mots) : c'est le seul
  // des trois fixtures `#recette` dont le tag traverse RÉELLEMENT `decouperEnPhrases`/
  // `decouperEnMots` — `recetteEssaiLongue` (« longue ») a plusieurs unités de premier niveau et ne
  // passe jamais par cette subdivision-là, même avec un tag dedans.
  const description =
    '<p>Éplucher et couper en dés 2 pommes de terre, 1 carotte et 1 poireau. '
    + 'Faire revenir le poireau émincé dans une noix de beurre à feu doux pendant 5 minutes, '
    + 'sans le laisser colorer. Ajouter les pommes de terre et la carotte, couvrir d\'eau à hauteur, '
    + 'saler et laisser #Cuisson courgettes:1500 mijoter à couvert, jusqu\'à ce que les légumes '
    + 's\'écrasent facilement à la fourchette. Mixer le tout avec un mixeur plongeant jusqu\'à obtenir '
    + 'une texture bien lisse, ajouter un trait de crème fraîche et rectifier l\'assaisonnement selon '
    + 'le goût. Servir bien chaud avec des croûtons dorés à la poêle et un peu de ciboulette ciselée '
    + 'par-dessus, ou laisser refroidir puis réserver au réfrigérateur pour le lendemain — cette soupe '
    + 'se garde sans problème deux à trois jours dans une boîte hermétique.</p>';
  return { plat: PLAT_ESSAI_BRUTE, description };
}

/** Round 3 (revue) : la PIRE des 14 descriptions sans bloc `.page-recipes` d'alors faisait 208
 *  caractères, sans aucune balise enfant (texte pur — reproduit ici SANS wrapper `<p>`, exactement
 *  telle quelle). Documente que le cas COURANT (le seul atteint en production aujourd'hui)
 *  n'est pas perturbé par le nouveau découpage : une seule page, aucun écrêtage. Texte reconstitué
 *  (209 caractères, longueur réelle), pas copié d'une base réelle. */
function recetteEssaiBruteReelle() {
  const description =
    'Faire chauffer l\'huile dans une poêle. Ajouter l\'ail émincé et le persil haché, '
    + 'puis les crevettes décortiquées. Cuire 3 minutes à feu vif, saler, poivrer, arroser d\'un '
    + 'filet de citron et servir immédiatement.';
  return { plat: PLAT_ESSAI_BRUTE_REELLE, description };
}

/** Le PIRE CAS du bloc RÉDUIT (mode `recette` de `MODES`, plus bas) : la même page longue que
 *  `recetteEssaiLongue` — la recette ouverte puis réduite doit être ouvrable, donc porter une vraie
 *  description — mais sous le nom de plat LE PLUS LONG, celui déjà retenu pour le mode `repas`
 *  (`.mode-bloc .v` est clampé à 2 lignes, `base.css`). Mesurer le bloc réduit sous un nom court
 *  laisserait croire à un budget que le contenu réel peut faire sauter. */
const PLAT_ESSAI_REDUITE =
  'Poulet rôti aux herbes de Provence et salade de quinoa aux légumes grillés';

function recetteEssaiReduite() {
  return { ...recetteEssaiLongue(), plat: PLAT_ESSAI_REDUITE };
}

/** 7 lignes — le cas RÉEL de « Gaspacho + tartine chèvre » relevé sur le planning (2026-08-17).
 *  Recompté le 2026-08-17 : sur les 73 recettes du catalogue qui portaient au
 *  moins un ingrédient, 34 dépassent `MAX_LIGNES_ING` (4, `rendu/recette.ts`) et se paginent donc,
 *  et 9 dépassent 7 — c'est ce dernier chiffre que la version précédente de ce commentaire
 *  attribuait par erreur au seuil de 4. Injecté via `__injecterRecette`. Noms/quantités
 *  reconstitués, pas copiés.
 *
 *  LOT 6 : la forme est celle d'une ligne de `home_stock/meal/preview` telle que le panneau la LIT
 *  (`LigneIngredient`, `rendu/recette.ts`) — `label` déjà mis en forme par le composant
 *  (`display_amount`), et `manque` pour `status === 'short'`. Deux lignes manquantes sur sept :
 *  le rendu bascule de l'une à l'autre, et une fixture uniforme n'exercerait qu'une moitié de la
 *  règle. */
const INGREDIENTS_ESSAI_7 = [
  { nom: 'Tomates', quantite: '800 g', manque: false },
  { nom: 'Concombre', quantite: '½ concombre', manque: false },
  { nom: 'Poivron rouge', quantite: '1 pièce', manque: true },
  { nom: 'Oignon nouveau', quantite: '1 pièce', manque: false },
  { nom: 'Ail', quantite: '1 gousse', manque: false },
  { nom: 'Pain de campagne', quantite: '4 tranches', manque: false },
  { nom: 'Fromage de chèvre frais', quantite: '120 g', manque: true },
];

/** Les deux échéances du pire cas « trois minuteurs » (12:34 et 25:00 restantes), en millisecondes
 *  DEPUIS l'instant d'ancrage — jamais des dates figées. Deux consommateurs les lisent, et ils
 *  n'ancrent PAS sur la même horloge : le mode `minuteur` de `MODES` les pose sur `JOUR_COURT`
 *  (l'horloge figée de la mesure de budget), `verifierDecompteMinuteur` les pose sur l'horloge
 *  RÉELLE du navigateur (cf. son commentaire, tâche 15). Écrire les échéances deux fois à la main
 *  ferait diverger silencieusement le pire cas mesuré de celui décompté. */
const ECHEANCES_MINUTEURS_MS = [754_000, 1_500_000];

export const MODES = [
  {
    // Le bloc par défaut du SALON depuis la tâche 9 bis (demande du propriétaire) : niveau,
    // autonomie, état le plus « parlant » (clim > charge > branchée), bouton de clim. Pas de
    // `pages` : le salon est déjà le défaut de `pageDuMode`, comme les cinq modes qui suivent.
    nom: 'voiture',
    etats: [
      ['sensor.peugeot_e208_batterie_niveau', '21', {}],
      ['sensor.peugeot_e208_batterie_autonomie', '52', {}],
      ['binary_sensor.peugeot_e208_batterie_branchee', 'on', {}],
      ['binary_sensor.peugeot_e208_batterie_en_charge', 'on', {}],
      // Pire cas de libellé (le plus long, « Clim en marche » — cf. `libelleEtat`, `rendu/voiture.ts`).
      ['binary_sensor.peugeot_e208_pre_conditionnement', 'on', {}],
      // Ronde de correction 1 (tâche 10 bis, relecture) : le pire cas ATTEIGNABLE de `.synthese`
      // pour ce mode, pas l'état du moment. `cover.rideau_salon` ouvert toute la journée par
      // automation et `todo.maintenance` rarement vide sont deux réalités ORDINAIRES du salon,
      // pas des extrêmes — cumulées à la batterie < 30 % déjà injectée ci-dessus (« voiture à
      // brancher »), elles portent la ligne de synthèse à trois écarts actifs simultanément.
      // Bornée à 2 lignes par `.synthese-texte` (`base.css`) : ce qui est mesuré ici prouve que le
      // budget tient MÊME quand le clamp est réellement engagé, pas seulement en théorie.
      ['cover.rideau_salon', 'open', {}],
      ['todo.maintenance', '3', {}],
    ],
    marqueur: '.voiture', attendu: 'le bloc voiture (batterie, autonomie, clim)',
  },
  {
    nom: 'media',
    etats: [
      ['media_player.ytube_music_player', 'playing', {
        // 71 caractères : la longueur réellement relevée sur un titre YouTube Music (cf.
        // `.media .v.deux-lignes`, borné à 2 lignes). Le pire cas, pas un cas moyen.
        media_title: 'Un titre de chanson assez long pour tenir sur deux lignes entières',
        media_artist: 'Un artiste au nom lui aussi passablement long',
        entity_picture: '/local/wallpanel/essai-affiche-claire.png',
        media_position: 61, media_duration: 245,
        // Revue tâche 15 (I1) : l'instant du relevé, sans lequel le rail ne peut pas être
        // décompté côté navigateur (`progression.ts`). Injecté ici pour que le chemin de
        // résolution soit réellement exercé — c'est `verifierRailProgression` qui vérifie
        // ensuite que le rail AVANCE.
        media_position_updated_at: '2026-05-07T13:59:00+02:00',
        // PAUSE(1) + VOLUME_SET(4) + PRECEDENT(16) + SUIVANT(32) + PLAY(16384) : la carte la plus
        // chargée que ce lecteur puisse produire — 3 boutons de transport ET un rail de volume.
        supported_features: 450495, volume_level: 0.5,
      }],
    ],
    marqueur: '.media', attendu: 'la carte média',
  },
  {
    nom: 'cinema',
    etats: [
      // `allumee` du salon (`ecran.ts`) : c'est CETTE entité, et elle seule, qui allume le mode.
      ['media_player.televiseur_salon_3', 'on', { app_name: 'Plex', supported_features: 153529 }],
      ['media_player.plex_plex_for_android_tv_uhd_google_tv_stick', 'playing', {
        media_title: 'Les trois Mousquetaires : Milady', media_series_title: 'Ash vs Evil Dead',
        entity_picture: '/local/wallpanel/essai-affiche-claire.png',
        media_position: 8, media_duration: 1545, supported_features: 131584,
      }],
      ['media_player.televiseur_salon', 'on', { volume_level: 0.4, supported_features: 152461 }],
    ],
    marqueur: '.media', attendu: 'la carte média en palette sombre forcée',
  },
  {
    nom: 'menage',
    // Ronde de correction 2 : 100 et NON 62. `.mode-bloc .v` est en `overflow: hidden;
    // text-overflow: ellipsis`, et le pire libellé atteignable est « En cours · 100 % » — le
    // pourcentage à trois chiffres est le cas où le texte est le plus large, donc celui où le
    // niveau de batterie disparaît le premier. À 62, le contrôle quotidien mesurait 129,6 px sur
    // ~144 disponibles et CONTOURNAIT le pire cas, qui n'existait plus que dans un commentaire.
    // Un vérificateur qui n'exerce pas le cas limite qu'il a lui-même documenté ne le garde pas.
    etats: [['vacuum.aspirateur_cuisine', 'cleaning', { battery_level: 100 }]],
    marqueur: '.mode-bloc', attendu: 'le bloc ménage et son bouton « Retour base »',
  },
  {
    nom: 'aeration',
    etats: [
      ['binary_sensor.porte_balcon_s_ouverture', 'on',
       { friendly_name: 'Porte balcon (S) Ouverture' }, AERATION_ANCIENNETE_MS],
      ['climate.radiateur', 'heat', { temperature: 21 }],
    ],
    marqueur: '.mode-bloc', attendu: 'le bloc aération',
  },
  {
    nom: 'alerte',
    etats: [
      ['lock.aqara_smart_lock_u200_lite', 'unlocked', {}],
      // `dernierMouvement` (`alertes.ts`) : sans mouvement récent, une alerte se replie sur la
      // ligne de synthèse au lieu d'occuper le bloc central (`alerteActive`, `contexte.ts`).
      ['binary_sensor.tablette_salon_mouvement', 'on', {}],
    ],
    marqueur: '.alerte', attendu: 'le bloc alerte',
  },
  {
    // Tâche 14 (2026-08-03) : les six prochaines heures ont disparu — la cuisine reçoit
    // désormais « ce qui est prévu à manger » (`rendreRepasSuivant`, `rendu/defaut.ts`), à la place de
    // l'ancien mode `previsions` que ce tableau mesurait ici (même page, même position, cf. le
    // commentaire au-dessus de `MODES` : la cuisine est aussi la seule pièce déjà visitée pour
    // `minuteur` juste après — les deux restent volontairement ADJACENTS, un seul changement de
    // page pour les deux).
    //
    // `etats` engage le pire cas RÉEL de `.synthese` : 3 des 4 écarts de la cuisine (fenêtre
    // ouverte, distributeur en défaut, entretien), même méthode que le mode `voiture` plus haut
    // (3 sur 4, pas les 4 — cf. ronde de correction 1, tâche 10 bis) pour engager le plafond à
    // 2 lignes de `.synthese-texte` sans dépendre de l'état réel de la maison au moment du
    // contrôle.
    //
    // `repasInjecte` : le repas vient d'un attribut d'entité (`sensor.home_stock_next_meal`)
    // depuis le lot 6 — donc `__injecter` pourrait techniquement le poser. Il reste injecté ICI, et
    // c'est délibéré : le planning de cette maison est VIDE la plupart du temps, et un contrôle qui
    // mesurerait alors un écran SANS bloc passerait à vide. Le pire cas de hauteur est le PLAT LE
    // PLUS LONG (`.mode-bloc .v` est clampé à 2 lignes, `base.css`) sous l'étiquette la plus longue
    // (« Demain, petit-déjeuner ») : mesurer avec ça prouve que ce budget ne peut PAS gonfler avec
    // le contenu, jamais un hasard optimiste. `recetteId` non nul : c'est ce qui rend le bloc
    // touchable ET fait apparaître la tuile « Recette » de la grille (`recetteOuvrable`), donc le
    // pire cas de la grille en même temps que celui du bloc.
    // Lot 6 : la cuisine passe de QUATRE à CINQ entrées de synthèse. `etats` en engage QUATRE (le
    // pire cas atteignable — la fontaine reste au repos, c'est aussi une règle d'`alertes.ts` et
    // l'allumer ferait basculer l'écran en mode `alerte` au hasard de qui passe devant). C'est le
    // point de vigilance chiffré du lot : `.synthese-texte` est borné à 2 lignes
    // (`-webkit-line-clamp`) et chaque écart supplémentaire coûtait +16 px avant ce plafond — c'est
    // ce qui avait fait déborder le mode voiture (574 → 590 px).
    nom: 'repas', pages: ['cuisine'],
    etats: [
      ['binary_sensor.fenetre_c_ouverture', 'on', {}],
      ['binary_sensor.distributeur_de_croquettes_alimentation', 'on', {}],
      ['todo.maintenance', '3', {}],
      ['todo.home_stock_expirations', '3', {}],
    ],
    repasInjecte: {
      etiquette: 'Demain, petit-déjeuner',
      plat: 'Poulet rôti aux herbes de Provence et salade de quinoa aux légumes grillés',
      mealId: 88801, recetteId: 88901, manquants: 0,
    },
    marqueur: '.mode-bloc', attendu: 'le bloc du repas suivant',
  },
  {
    // Tâche 14 : le bureau reçoit le prochain rendez-vous du jour (`rendreProchainRdv`,
    // `rendu/defaut.ts`) — PREMIÈRE fois que ce tableau visite le bureau (les six modes d'origine
    // se mesurent au salon, `previsions`/`minuteur` en cuisine). `etats` engage les TROIS écarts
    // de `.synthese` du bureau (todo.travail, qualité de l'air, entretien) — son plafond réel,
    // pas 3 sur 4 comme cuisine/salon : le bureau n'en déclare que trois au total (`ecran.ts`).
    //
    // `evenementsInjecte` : même raison que `repasInjecte` ci-dessus — un rendez-vous n'arrive
    // jamais par un état HA (`chargerAgenda` fait une requête REST `/api/calendars/...`), posé via
    // `__injecterEvenements`. Un résumé long (le pire cas atteignable, `.mode-bloc .v` en
    // `nowrap`/ellipsis comme `repasInjecte`) sur `JOUR_COURT` + 2 h 45, avant le
    // `AERATION_ANCIENNETE_MS` du mode `aeration` mais après `neutraliser` (aucun ouvrant ouvert
    // ici, donc sans effet sur le mode atteint).
    nom: 'agenda', pages: ['bureau'],
    etats: [
      ['todo.travail', '4', {}],
      ['sensor.purificateur_air_pm2_5', '42', {}],
      ['todo.maintenance', '3', {}],
    ],
    evenementsInjecte: [{
      resume: 'Réunion de suivi de projet avec le client, en visioconférence',
      debut: isoLocal(new Date(JOUR_COURT.getTime() + 2 * 3_600_000 + 45 * 60_000)),
      estAnniversaire: false,
    }],
    marqueur: '.mode-bloc', attendu: 'le bloc « Rendez-vous »',
  },
  {
    // Tâche 17 (2026-08-03) : LE REPLI des deux blocs ci-dessus, mesuré pour son propre compte —
    // et ce n'est pas un cas limite. Les deux modes `repas`/`agenda` ne sont atteignables ici que
    // parce qu'on leur INJECTE de quoi s'afficher ; sur les vraies tablettes, le planning de repas
    // est vide en permanence et l'agenda l'est dès la fin de l'après-midi. C'est donc ce mode-ci
    // que les écrans de la cuisine et du bureau rendent la plupart du temps, celui dont le budget
    // de hauteur méritait le moins d'être laissé à l'estime.
    //
    // `repasInjecte: null` : le repas est VIDÉ délibérément (et non « laissé au hasard du
    // planning ») — c'est cette absence qui fait tomber `rendreRepasSuivant` sur `undefined` et
    // donne la main au repli. Même méthode que `NEUTRE` pour les états : on ne mesure pas un mode en
    // espérant que la maison veuille bien être dans le bon état.
    //
    // `tachesInjectees` : les TROIS PIRES résumés réellement produits par `maintenance_plan()`
    // (`config/custom_templates/maintenance.jinja`) — 46, 34 et 33 caractères. Le pire cas MESURÉ
    // dans la source, jamais un libellé court supposé ; c'est lui qui engage réellement le clamp
    // à 2 lignes de `.v.deux-lignes` et prouve que la hauteur du bloc ne peut PAS gonfler avec le
    // nombre de tâches.
    //
    // `etats` : le pire cas de `.synthese` ATTEIGNABLE DANS CET ÉTAT, qui n'est plus celui du mode
    // `repas`. Deux des trois autres écarts de la cuisine sont engagés ; le quatrième
    // (`binary_sensor.eversweet_3_pro_uvc_niveau_d_eau`) reste volontairement au repos, exactement
    // comme dans le mode `repas` plus haut : c'est aussi une RÈGLE D'ALERTE (« Fontaine »,
    // `alertes.ts`), et l'allumer ferait basculer l'écran en mode `alerte` dès que la tablette de
    // la cuisine détecte un mouvement — le bloc mesuré ne serait plus celui qu'on croit, au hasard
    // de qui passe devant l'écran pendant le contrôle.
    //
    // Ronde de correction (relecture, défaut D3) : `todo.maintenance` VAUT DÉSORMAIS `3` ICI. La
    // version précédente le laissait à `0` (cf. `NEUTRE`) en le justifiant par « son écart est de
    // toute façon masqué » — un raisonnement qui se mordait la queue et qui MESURAIT UN ÉTAT
    // IMPOSSIBLE : cet écran affiche trois tâches d'entretien, donc l'entité vaut trois, pas zéro.
    // Conséquence directe : `verifierSyntheseSansEntretien` était TAUTOLOGIQUE — avec l'entité à
    // `0` et un seuil `> 0` (`ecran.ts`), l'écart ne pouvait structurellement pas apparaître, et
    // le contrôle ressortait vert que `masquerEntretien` (`rendu/corps.ts`) fonctionne, soit
    // retiré, ou soit câblé à l'envers. Il ne peut réellement échouer qu'à partir d'ici.
    // La hauteur mesurée ne bouge pas pour autant (le masquage retire cet écart du rendu) : c'est
    // précisément ce que ce mode doit prouver.
    nom: 'entretien', pages: ['cuisine'],
    etats: [
      ['binary_sensor.fenetre_c_ouverture', 'on', {}],
      ['binary_sensor.distributeur_de_croquettes_alimentation', 'on', {}],
      ['todo.maintenance', '3', {}],
    ],
    repasInjecte: null,
    tachesInjectees: { 'todo.maintenance': [
      { uid: '1', texte: 'Aspirateur RDC — brosse principale à remplacer' },
      { uid: '2', texte: 'Mises à jour manuelles à installer' },
      { uid: '3', texte: 'Purificateur — filtre à remplacer' },
    ] },
    marqueur: '.mode-bloc', attendu: 'le bloc « Entretien »',
  },
  {
    // Le même repli au BUREAU : même bloc, mais atteint par l'autre porte (`blocDefaut: 'agenda'`
    // et un agenda vide) et sur une ligne de synthèse différente (`todo.travail` + qualité de
    // l'air, l'entretien étant masqué). Les deux pièces sont mesurées, et non une seule extrapolée
    // à l'autre : c'est le budget de `.synthese` qui diffère entre elles, pas le bloc.
    // `todo.maintenance` à `3` pour la même raison qu'en cuisine (cf. défaut D3 ci-dessus) : sans
    // lui, le contrôle anti-doublon de ce mode ne peut pas échouer, donc ne prouve rien.
    nom: 'entretien-bureau', pages: ['bureau'],
    etats: [
      ['todo.travail', '4', {}],
      ['sensor.purificateur_air_pm2_5', '42', {}],
      ['todo.maintenance', '3', {}],
    ],
    evenementsInjecte: [],
    tachesInjectees: { 'todo.maintenance': [
      { uid: '1', texte: 'Aspirateur étage — brosse principale à remplacer' },
      { uid: '2', texte: 'Mises à jour manuelles à installer' },
      { uid: '3', texte: 'Purificateur — filtre à remplacer' },
    ] },
    marqueur: '.mode-bloc', attendu: 'le bloc « Entretien »',
  },
  {
    nom: 'minuteur', pages: ['cuisine'],
    etats: [
      // Trois minuteurs : le pire cas de hauteur, et le seul où « Nouveau » disparaît.
      // `finishes_at` ancré sur `JOUR_COURT` (l'horloge FIGÉE du navigateur pendant cette mesure),
      // jamais sur `Date.now()` réel de Node — cf. le commentaire de `JOUR_COURT` ci-dessus.
      ['timer.cuisine', 'active',
       { finishes_at: new Date(JOUR_COURT.getTime() + ECHEANCES_MINUTEURS_MS[0]).toISOString() }],
      ['input_text.minuteur_cuisine_nom', 'Pâtes', {}],
      ['timer.cuisine_2', 'active',
       { finishes_at: new Date(JOUR_COURT.getTime() + ECHEANCES_MINUTEURS_MS[1]).toISOString() }],
      ['input_text.minuteur_cuisine_2_nom', 'Four', {}],
      ['timer.cuisine_3', 'paused', { remaining: '0:03:20' }],
      ['input_text.minuteur_cuisine_3_nom', '', {}],
    ],
    marqueur: '.minuteurs', attendu: 'la liste des trois minuteurs',
  },
  {
    // REVUE FINALE (2026-08-17) : le mode `recette` était le SEUL `ModePrincipal` (`src/modes.ts`)
    // absent de ce tableau — donc le seul dont la hauteur n'était pas mesurée pour son propre
    // compte, alors que l'en-tête de ce fichier l'exige de « chaque mode ». La sous-vue `#recette`
    // et le bloc réduit étaient bien peints par `VUES` (plus haut), mais aucun budget n'en sortait :
    // pas de ligne dans `budgets`, pas de contrôle de cible tactile PAR MODE, rien.
    //
    // Placé EN DERNIER, et c'est structurel : `recetteReduite` laisse une recette EN COURS derrière
    // elle (c'est tout l'objet de « Réduire », cf. `fermerRecette`/`reduire`, `demarrage.ts`), et
    // `neutraliser` ne peut pas la défaire — elle ne vit dans aucune entité Home Assistant. Un mode
    // placé après verrait donc `modePrincipal` rendre `recette` à sa place. La boucle
    // « images/seconde » plus bas ignore explicitement la paire qui y mène, pour la même raison.
    //
    // `etats` : le même pire cas de `.synthese` que les modes `repas`/`entretien` de la cuisine
    // (3 des 4 écarts), plus UN MINUTEUR ACTIF — le mode `recette` prime sur `minuteur`
    // (`modePrincipal`), et le décompte du plus urgent est repris DANS le bloc (`· 12:34`), donc
    // c'est bien la forme la plus large de `.t` qu'on mesure ici. `finishes_at` ancré sur
    // `JOUR_COURT`, l'horloge FIGÉE de cette mesure, comme le mode `minuteur` ci-dessus.
    nom: 'recette', pages: ['cuisine'],
    etats: [
      ['binary_sensor.fenetre_c_ouverture', 'on', {}],
      ['binary_sensor.distributeur_de_croquettes_alimentation', 'on', {}],
      ['todo.maintenance', '3', {}],
      ['timer.cuisine', 'active',
       { finishes_at: new Date(JOUR_COURT.getTime() + ECHEANCES_MINUTEURS_MS[0]).toISOString() }],
      ['input_text.minuteur_cuisine_nom', 'Œufs', {}],
    ],
    recetteReduite: true,
    marqueur: '[data-mvt="bloc:recette"]', attendu: 'le bloc de la recette réduite',
  },
];

/** La page HA sur laquelle un mode doit être posé pour être atteignable — cf. le commentaire de
 *  `pages` au-dessus de `MODES`. Absent = salon, inchangé depuis la tâche 13. */
export function pageDuMode(mode) {
  return mode.pages ? mode.pages[0] : 'salon';
}

/** Remise à zéro AVANT chaque mode. Sans elle, `menage` resterait vrai pendant `aeration` (il le
 *  précède dans l'ordre de priorité de `modePrincipal`) et le mode mesuré ne serait pas celui
 *  qu'on croit. Couvre aussi les entités que la VRAIE maison peut avoir laissées actives au
 *  moment du contrôle (une télévision réellement allumée, une porte réellement déverrouillée) :
 *  sans ça, `repas` serait inatteignable un soir de film.
 *
 *  Tâche 10 — trois entrées CUISINE ajoutées, indispensables depuis que `previsions` (devenu
 *  `repas` à la tâche 14) et `minuteur` s'y mesurent réellement (`pages: ['cuisine']`, cf.
 *  `MODES`) :
 *    - `binary_sensor.fenetre_c_ouverture` : l'ouvrant de la cuisine (`ecran.ts`). Sans lui,
 *      une fenêtre RÉELLEMENT ouverte plus de 10 min ferait basculer `repas` sur `aeration`
 *      à la mesure — même raison que les deux portes du salon juste au-dessus.
 *    - `timer.cuisine`/`_2`/`_3` à `idle` : sans eux, un minuteur RÉELLEMENT actif dans la vraie
 *      cuisine (quelqu'un fait cuire quelque chose pendant que ce script tourne) ferait basculer
 *      `repas` sur `minuteur` — et à l'inverse, un minuteur resté actif d'une exécution
 *      précédente fausserait le pire cas du mode `minuteur` lui-même (trois helpers déjà occupés
 *      au moment où l'état voulu est injecté). `idle` et non `unavailable`/absent : c'est l'état
 *      RÉEL d'un minuteur au repos (`listerMinuteurs`, `src/minuteur.ts`), celui qu'un vérificateur
 *      doit reproduire plutôt qu'un état qui n'existe jamais en pratique.
 *
 *  Ronde de correction 1 (tâche 10 bis, relecture) : deux entrées de plus, `cover.rideau_salon` et
 *  `todo.maintenance` — NI L'UNE NI L'AUTRE ne décide d'un MODE (`modePrincipal`, `modes.ts` n'en
 *  lit aucune des deux), donc rien ici ne les neutralisait avant cette ronde : elles alimentent
 *  UNIQUEMENT `.synthese` (`ligneSynthese`, `rendu/corps.ts`), lue en direct sur la vraie maison
 *  pour TOUS les modes mesurés au salon/bureau/cuisine (« partout », cf. `ecran.ts`). Sans elles,
 *  chaque exécution mesurait un `.synthese` de hauteur différente selon l'état réel du rideau et
 *  de la liste d'entretien AU MOMENT PRÉCIS du contrôle — un budget qui change d'une exécution à
 *  l'autre sans qu'aucun code n'ait changé, exactement le défaut qui a laissé passer `voiture` à
 *  574 px alors que 590 px étaient atteignables le jour même. Le pire cas RÉEL de `.synthese`
 *  n'est plus laissé au hasard de la maison : il est injecté À LA MAIN, nommément, dans `MODES`
 *  (modes `voiture`/`repas`/`agenda`, tâche 14 — les seuls qui en ont besoin, `menage`/`aeration`/
 *  `media`/`cinema`/`alerte`/`minuteur` remplaçant de toute façon le bloc central par autre chose).
 *
 *  Tâche 14 : `vacuum.aspirateur_chambre` ajouté — PREMIÈRE entité neutralisée pour le BUREAU,
 *  visité pour la première fois par ce tableau (mode `agenda`). Sans elle, un aspirateur
 *  RÉELLEMENT en train de nettoyer l'étage ferait basculer le bureau sur `menage` au lieu de
 *  `defaut`, même défaut de principe que `vacuum.aspirateur_cuisine` ci-dessous pour la cuisine.
 *
 *  Tâche 17 bis (relecture, défaut D4) : `input_boolean.mode_invites` rejoint la liste. Il ne
 *  décide d'aucun MODE non plus, mais il RETIRE désormais du contenu — les écarts `perso` de
 *  `.synthese` (déjà) et, depuis le correctif D4, le bloc de repli « Entretien » lui-même. Une
 *  soirée où le propriétaire l'a laissé sur `on` aurait fait ressortir les deux modes `entretien`
 *  en « mode non atteint », sans qu'aucune ligne de code n'ait changé — exactement le hasard de la
 *  maison que ce tableau existe pour éliminer. `off` est aussi son état de repos réel. */
const NEUTRE = [
  ['media_player.ytube_music_player', 'off'],
  ['media_player.maison', 'off'],
  ['media_player.televiseur_salon', 'off'],
  ['media_player.televiseur_salon_2', 'off'],
  ['media_player.televiseur_salon_3', 'off'],
  ['media_player.plex_plex_for_android_tv_uhd_google_tv_stick', 'off'],
  ['vacuum.aspirateur_cuisine', 'docked'],
  ['vacuum.aspirateur_chambre', 'docked'],
  ['binary_sensor.porte_balcon_s_ouverture', 'off'],
  ['binary_sensor.porte_entree_s_ouverture', 'off'],
  ['binary_sensor.fenetre_c_ouverture', 'off'],
  ['climate.radiateur', 'off'],
  ['lock.aqara_smart_lock_u200_lite', 'locked'],
  ['binary_sensor.tablette_salon_mouvement', 'off'],
  ['binary_sensor.distributeur_de_croquettes_probleme', 'off'],
  ['binary_sensor.distributeur_de_croquettes_alimentation', 'off'],
  ['binary_sensor.eversweet_3_pro_uvc_niveau_d_eau', 'off'],
  ['timer.cuisine', 'idle'],
  ['timer.cuisine_2', 'idle'],
  ['timer.cuisine_3', 'idle'],
  ['cover.rideau_salon', 'closed'],
  ['todo.maintenance', '0'],
  ['todo.travail', '0'],
  ['input_boolean.mode_invites', 'off'],
  ['sensor.purificateur_air_pm2_5', '10'],
  // Tâche 19 (2026-08-03) : les trois entités des quatre tuiles ajoutées à la cuisine et au bureau
  // (la quatrième, `vacuum.aspirateur_cuisine`, est déjà neutralisée plus haut). Aucune ne décide
  // d'un MODE — le bureau ne déclare aucun ouvrant, donc le Velux ne peut pas déclencher
  // `aeration`, et aucune règle d'`alertes.ts` ne les cite. Elles sont neutralisées pour la même
  // raison que `cover.rideau_salon`/`todo.maintenance` l'ont été à la tâche 10 bis : elles
  // CHANGENT LE RENDU MESURÉ (libellé de la tuile, et surtout sa couleur — `.commande.actif` porte
  // un fond `tertiary-container`, donc un contraste différent de la tuile au repos), et sans elles
  // chaque exécution mesurerait un écran différent selon que le propriétaire a laissé son
  // purificateur en marche ou son Velux ouvert au moment du contrôle. `on` partout, jamais `off` :
  // c'est l'état où les libellés sont les plus LONGS (« En marche » contre « Arrêté », « Ouvert »
  // contre « Fermé ») et où la tuile est colorée — le pire cas des deux contrôles, pas un cas
  // moyen. Contre-épreuve du rendu à l'arrêt : `tests/corps.test.ts`, tâche 19.
  ['fan.purificateur_air', 'on'],
  ['fan.chambre_ventilateur_tour', 'on'],
  ['binary_sensor.velux_ch_ouverture', 'on'],
  // LOT 6 — LES TROIS ENTITÉS `home_stock` DE LA CUISINE, ET POURQUOI ELLES SONT ICI.
  //
  // Ce contrôle ouvre les pages contre l'instance RÉELLE : les entités qu'il ne neutralise pas
  // arrivent telles que la maison les publie à l'instant du contrôle. Les entités de l'ancienne
  // source existaient sur cette instance, donc les tuiles « Courses » et « Recette » étaient
  // rendues — par accident, jamais par construction. Celles-ci n'existent que si `home_stock` est
  // chargé : sans neutralisation, le premier contrôle après cette bascule a mesuré 500 px au lieu
  // de 574 px pour le mode `repas` — le filtre générique de `rendu/corps.ts` avait simplement
  // masqué deux tuiles, et le contrôle est passé au vert en mesurant un écran plus petit que le
  // vrai. UN CONTRÔLE QUI NE CONTRÔLE RIEN EST PIRE QUE PAS DE CONTRÔLE.
  //
  // Aucune ne décide d'un MODE : `alertes.ts` ne cite aucune d'elles (une DLC échoue à ses deux
  // critères d'admission, cf. la spec du lot 6). `todo.home_stock_expirations` vaut `0` ICI — pas
  // d'écart par défaut — et les modes qui veulent le pire cas de `.synthese` le poussent à `3`.
  // `sensor.home_stock_next_meal` porte un état SANS `recipe_id` : rien à ouvrir, donc aucune
  // commande `home_stock/*` envoyée à l'instance par la simple neutralisation.
  ['todo.home_stock_shopping', '5'],
  ['todo.home_stock_expirations', '0'],
  ['sensor.home_stock_next_meal', 'Repas neutre'],
];

/** Les trois affiches d'essai, servies par interception de requête (`context.route`) plutôt que
 *  déposées dans `config/www/wallpanel/` : ce dossier est celui des trois tablettes réelles, un
 *  vérificateur n'y écrit rien. Trois luminosités, dont une TRÈS claire — le seul cas où le
 *  contraste peut réellement tomber, puisque le mode cinéma force la palette sombre (texte blanc)
 *  et que l'affiche est peinte par-dessus le fond sombre à `opacity: .34`. Chacune est bandée
 *  plutôt qu'unie : une affiche unie ne produirait qu'une seule luminance et masquerait tout
 *  l'intérêt de l'échantillonnage min/max. */
const AFFICHES = [
  { nom: 'claire', base: 232, amplitude: 23 },
  { nom: 'moyenne', base: 112, amplitude: 40 },
  { nom: 'sombre', base: 10, amplitude: 22 },
];

export function lireIdentifiants() {
  const mcp = JSON.parse(readFileSync(`${DATA}/.mcp.json`, 'utf8'));
  const env = mcp.mcpServers.homeassistant.env;
  return { url: (process.env.HA_URL ?? env.HA_URL).replace(/\/$/, ''), token: env.HA_TOKEN };
}

export function fabriquerJetons(url, token) {
  // `expires` est un epoch ms, pas un délai — cf. `connexion.ts`. Le jeton lu dans .mcp.json est
  // un jeton d'accès longue durée (HA), donc une expiration lointaine évite tout rafraîchissement
  // (qui échouerait : on n'a pas de vrai `refresh_token` à donner à `/auth/token`).
  return {
    access_token: token,
    refresh_token: 'verifier-rendu-jeton-longue-duree-sans-rafraichissement',
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365,
    clientId: `${url}/`,
  };
}

/** Quelle police ce navigateur résout-il RÉELLEMENT pour la pile `Roboto, system-ui, sans-serif`
 *  de l'application ? Ronde de correction 1 : la réponse sur cette machine est « DejaVu Sans »
 *  (Roboto n'y est pas installée ; sur les Fire 7 c'est la police système). Ça n'invalide rien —
 *  DejaVu est PLUS LARGE, donc tout verdict de largeur rendu ici est conservateur, ce qui est le
 *  bon sens pour un garde-fou. Mais les hauteurs de texte sans `line-height` explicite en
 *  dépendent, et le mode `menage` n'a que quelques pixels de marge : le lecteur doit le savoir en
 *  tête de sortie, pas le découvrir par accident. */
function policeResolue() {
  try {
    const brut = execFileSync('fc-match', ['Roboto'], { encoding: 'utf8' }).trim();
    const nom = /"([^"]+)"/.exec(brut)?.[1] ?? brut;
    return nom.toLowerCase().includes('roboto')
      ? `Police : « Roboto » est installée sur cette machine — les largeurs mesurées sont celles des tablettes.`
      : `Police : « Roboto » N'EST PAS installée ici, ce navigateur retombe sur « ${nom} » (plus large que `
        + `Roboto). Les verdicts de largeur sont donc CONSERVATEURS ; les hauteurs de texte sans `
        + `line-height explicite sont approximatives à quelques pixels près.`;
  } catch {
    return 'Police : `fc-match` indisponible — impossible de dire quelle police remplace Roboto ici.';
  }
}

// --- Tâche 13 : ce que le navigateur reçoit réellement ------------------------------------

/** Construit l'application depuis `src/` EN MÉMOIRE (`write: false`), jamais sur disque, et
 *  surtout jamais via `npm run build` — qui écrit dans `config/www/wallpanel/`, donc DÉPLOIE sur
 *  les trois tablettes murales. Même outil et même esprit que `bundlerGeste` plus bas, qui bundle
 *  déjà `geste.ts` pour l'auto-test tactile. Le graphe d'imports réel décide de ce qui entre :
 *  `index.ts` importe `jetons.css` et `base.css`, esbuild en tire la feuille de style compagnon. */
let bundleApplicationCache;
async function bundlerApplication() {
  if (bundleApplicationCache) return bundleApplicationCache;
  const resultat = await esbuild.build({
    entryPoints: [join(SRC_APP, 'index.ts')],
    bundle: true, write: false, format: 'iife', target: 'es2020',
    outdir: '/verificateur-rendu-en-memoire',
    // Les médias et polices de la scène DeLorean sont référencés par URL absolue servie par Home
    // Assistant (`/local/wallpanel/assets/…`), jamais importés : sans cette exclusion, esbuild
    // essaie de les résoudre depuis le disque et échoue. Le vrai build les copie à part
    // (`scripts/copier-assets.mjs`) ; ici, `poserInterceptions` répond à leur place.
    external: ['/local/*'],
  });
  const js = resultat.outputFiles.find((f) => f.path.endsWith('.js'));
  const css = resultat.outputFiles.find((f) => f.path.endsWith('.css'));
  if (!js || !css) throw new Error('bundle incomplet : js ou css manquant');
  bundleApplicationCache = { js: js.text, css: css.text };
  return bundleApplicationCache;
}

// --- Affiches d'essai : un PNG minimal écrit à la main -------------------------------------
//
// Aucune dépendance d'encodage d'image dans ce projet, et pas question d'en ajouter une pour
// trois aplats bandés. Un PNG est une signature, trois morceaux et un CRC32 : c'est court.

const TABLE_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const octet of buf) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function morceau(type, donnees) {
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const taille = Buffer.alloc(4);
  taille.writeUInt32BE(donnees.length);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(corps));
  return Buffer.concat([taille, corps, somme]);
}

/** Un PNG RVB 8 bits, `couleur(x, y) → [r, v, b]`. */
function encoderPng(largeur, hauteur, couleur) {
  const brut = Buffer.alloc((largeur * 3 + 1) * hauteur);
  let i = 0;
  for (let y = 0; y < hauteur; y++) {
    brut[i++] = 0;   // filtre « aucun »
    for (let x = 0; x < largeur; x++) {
      const [r, v, b] = couleur(x, y);
      brut[i++] = r; brut[i++] = v; brut[i++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;    // profondeur
  ihdr[9] = 2;    // type couleur : RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut)),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

/** Bandes horizontales autour d'une luminosité de base : deux extrêmes réels à échantillonner,
 *  au lieu de l'unique valeur d'un aplat. */
function affiche(base, amplitude) {
  return encoderPng(96, 96, (x, y) => {
    const v = Math.max(0, Math.min(255, base + (Math.floor(y / 12) % 2 ? amplitude : -amplitude)));
    return [v, v, v];
  });
}

export const AFFICHES_PNG = new Map(AFFICHES.map((a) => [a.nom, affiche(a.base, a.amplitude)]));

/** Tâche 18 — REJOUE UNE FEUILLE DE STYLE COMME LA LIRAIT LE MOTEUR DES TABLETTES CUISINE ET
 *  SALON. Relevé en lecture seule sur l'API d'administration Fully (`?cmd=deviceInfo`) le
 *  2026-08-03 : cuisine (192.168.0.159) et salon (192.168.0.218) rendent en **Chrome
 *  100.0.4896.127**, bureau (192.168.0.138) en **Chrome 119.0.6045.194**. Les unités de viewport
 *  dynamique (`dvh`, `svh`, `lvh`…) n'existent qu'à partir de Chrome 108 : sur DEUX écrans sur
 *  trois, une déclaration qui en contient une est invalide, donc JETÉE AU PARSING — la propriété
 *  retombe sur sa valeur héritée ou initiale, en silence.
 *
 *  La simulation consiste à remplacer le token d'unité par une unité qui n'existe nulle part
 *  (`zvh`). Ce n'est pas une approximation : un moteur qui ne connaît PAS `dvh` et un moteur qui
 *  rencontre `zvh` prennent exactement le même chemin de code — valeur non reconnue, déclaration
 *  écartée, et `@supports (height: 100zvh)` faux comme `@supports (height: 100dvh)` l'était en
 *  Chrome 100. C'est ce qui rend un éventuel repli en `@supports` mesurable ici, alors qu'un
 *  Chromium moderne répondrait « oui » à toute question sur `dvh`.
 *
 *  Le vérificateur tourne sur un Chromium récent : sans cette réécriture, il ne peut structurellement
 *  RIEN voir de ce qui casse sur deux des trois écrans. */
const simulerMoteurSansDvh = (css) => css.replace(/(\d)(dvh|dvw|dvmin|dvmax|svh|lvh)\b/g, '$1zvh');

/** Pose sur un contexte tout ce qui doit être servi par le vérificateur plutôt que par Home
 *  Assistant : le bundle construit depuis `src/` (sauf en `--deploye`) et les trois affiches
 *  d'essai. Les pages HTML, l'origine, la session et le websocket restent ceux de HA.
 *
 *  `sansDvh` (tâche 18) : la feuille de style servie est celle du bundle — ou celle que HA sert
 *  réellement en `--deploye`, récupérée puis réécrite — passée par `simulerMoteurSansDvh`. Le
 *  JavaScript, lui, n'est jamais touché : seul le CSS distingue les deux moteurs. */
async function poserInterceptions(ctx, bundle, { sansDvh = false } = {}) {
  for (const [nom, png] of AFFICHES_PNG) {
    await ctx.route(`**/local/wallpanel/essai-affiche-${nom}.png`, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  }
  const servirCss = (route, texte) => route.fulfill({
    status: 200, contentType: 'text/css; charset=utf-8',
    body: sansDvh ? simulerMoteurSansDvh(texte) : texte,
  });
  if (!bundle) {
    // `--deploye` : rien n'est substitué d'habitude. Sous `sansDvh`, il faut quand même passer par
    // la feuille RÉELLEMENT déployée pour la réécrire — `route.fetch()` va la chercher chez HA.
    if (sansDvh) {
      await ctx.route('**/local/wallpanel/wallpanel.css*', async (route) => {
        const reponse = await route.fetch();
        await servirCss(route, await reponse.text());
      });
    }
    return;
  }
  await ctx.route('**/local/wallpanel/wallpanel.js*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: bundle.js }));
  await ctx.route('**/local/wallpanel/wallpanel.css*', (route) => servirCss(route, bundle.css));
}

/** Exécutée CÔTÉ NAVIGATEUR par `page.evaluate` — aucune fermeture sur des variables Node,
 *  seuls `params` passe la frontière. Sert à la fois au vrai contrôle des pages déployées et à
 *  l'auto-test (mêmes règles, sur des fixtures en mémoire) : un seul endroit qui sait ce qu'est
 *  un défaut. */
export function analyserRendu(params) {
  const { cibleMin, contrasteMin, clampsVoulus = [], planchersLargeur = {}, overflowVoulus = [] } = params;
  const app = document.getElementById('app');
  if (!app) return { erreur: 'aucun #app dans le DOM' };
  const cadre = app.getBoundingClientRect();

  let bas = 0;
  let droite = 0;
  const debords = [];
  const tronques = [];
  const clampes = [];

  app.querySelectorAll('*').forEach((el) => {
    if (el.closest('svg')) return;
    const style = getComputedStyle(el);
    if (style.position === 'absolute' || style.position === 'fixed') return;
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) return;   // ex. <script>, commentaires lit

    if (b.bottom > cadre.bottom + 0.5 || b.right > cadre.right + 0.5) {
      debords.push(el.className || el.tagName);
    }
    if (b.bottom > bas) bas = b.bottom;
    if (b.right > droite) droite = b.right;

    // Texte tronqué : une ligne qui refuse de passer à la ligne (`white-space: nowrap`) et dont
    // le contenu réel dépasse la boîte visible, ou un bloc à hauteur clampée dont le contenu
    // déborde verticalement (`-webkit-line-clamp`, non utilisé aujourd'hui mais couvert au cas
    // où). Invisible à jsdom, qui ne calcule aucune largeur/hauteur réelle.
    if (style.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 1) {
      tronques.push({ element: el.className || el.tagName, texte: (el.textContent || '').trim().slice(0, 40) });
    }
    // Tâche 13, ronde de correction 1 : une troncature par `-webkit-line-clamp` reste FAUTIVE par
    // défaut, comme avant cette tâche. Seuls les sélecteurs NOMMÉMENT exemptés (`clampsVoulus`,
    // cf. `CLAMPS_VOULUS` en tête de ce fichier) en sortent, et vont dans `clampes` — rapporté,
    // non fautif. Le premier jet exemptait toute la classe : n'importe quel élément clampé
    // avalant du texte redevenait silencieux, alors que le même DOM était une faute dure la
    // veille. Une exemption se nomme, elle ne se déduit pas d'un mécanisme CSS.
    if (style.webkitLineClamp && style.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1) {
      const entree = { element: el.className || el.tagName, texte: (el.textContent || '').trim().slice(0, 40) };
      if (clampsVoulus.some((s) => el.matches(s))) clampes.push(entree);
      else tronques.push(entree);
    }
    // Tâche 12 (round 1, point 4) : `min-height: 0` (`.corps`, `base.css`) a rendu ce vérificateur
    // AVEUGLE au défaut qu'il garde — les deux fautes CSS réelles trouvées à la première mesure de
    // `#recette` (`.corps` sans `min-height: 0`, marges invisibles à `offsetHeight`) ne produisaient
    // PLUS de débordement mesurable une fois corrigées séparément : elles produisaient du texte
    // ÉCRÊTÉ (silencieusement masqué par `overflow: hidden`), que ni `debords` (géométrie du CADRE
    // uniquement) ni `tronques` (`nowrap`/`-webkit-line-clamp` seuls) ne couvraient. Tout élément
    // `overflow: hidden` (les deux axes valent, `overflow: hidden` les couvre tous deux) dont le
    // contenu dépasse sa propre boîte (`scrollHeight > clientHeight`) est donc une faute — le même
    // principe que `tronques` ci-dessus, étendu au cas générique plutôt qu'aux deux mécanismes CSS
    // déjà nommés.
    //
    // DEUX GARDES, trouvées à l'exécution (round 1) — sans elles, ce contrôle noyait le signal sous
    // 21 « fautes » qui n'en étaient pas :
    //   1. `!(webkitLineClamp actif)` : un élément clampé (`.v.deux-lignes`, `.synthese-texte`…) est
    //      LUI AUSSI `overflow: hidden` — sans cette garde, ce contrôle le redétectait en double,
    //      en contournant purement et simplement l'exemption `clampsVoulus` du bloc juste au-dessus
    //      (qui, elle, sait distinguer un clamp VOULU d'un clamp fautif). Le clamp a déjà son
    //      contrôle, dédié, avec sa propre liste nommée — celui-ci n'a pas à le rejuger.
    //   2. `overflowVoulus` (`OVERFLOW_VOULUS`, même patron que `clampsVoulus`) : `.heure` est
    //      `overflow: hidden` par CONCEPTION (`base.css`, tâche 13 — masque le chiffre sortant du
    //      roulement animé), pas par troncature de contenu. Une exemption se NOMME.
    if (!(style.webkitLineClamp && style.webkitLineClamp !== 'none')
        && (style.overflowY === 'hidden' || style.overflow === 'hidden')
        && el.scrollHeight > el.clientHeight + 1) {
      const entree = {
        element: el.className || el.tagName,
        texte: (el.textContent || '').trim().slice(0, 40),
        ecrete: `${el.scrollHeight - el.clientHeight} px masqués (scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight})`,
      };
      if (overflowVoulus.some((s) => el.matches(s))) clampes.push(entree);
      else tronques.push(entree);
    }
  });

  // Tâche 13 — la liste s'arrêtait à `.ambiance, .commande, .tuile, .xl`. Les quatre cibles
  // tactiles nées avec la carte média et les blocs de mode (`rendu/media.ts`, `rendu/modes.ts`)
  // n'y étaient PAS, et c'est très exactement pour ça que le défaut des boutons de transport
  // tombés à ~57 px sous le `flex-shrink` par défaut (revue de la tâche 6, cf. le long commentaire
  // de `.media-rangee` dans `base.css`) n'a été trouvé qu'à la lecture du CSS, à la main : la
  // seule machine capable de le voir ne regardait pas ces éléments-là.
  //   `.media-bouton` — précédent / pause / lecture / suivant
  //   `.media-pas`    — volume − / + quand le lecteur ne sait pas dire son niveau
  //   `.media-rail`   — rail de volume (sa zone de contact fait 62 px, son trait 6)
  //   `.mode-action`  — « Retour base » du mode ménage
  // Revue tâche 15 (I2) : la LARGEUR est relevée en même temps que la hauteur, et comparée au
  // plancher DÉCLARÉ de l'élément quand il en a un (`planchersLargeur`, cf. son commentaire en
  // tête de ce fichier). `plancherLargeur === null` = aucune largeur déclarée, donc rien à
  // exiger : mieux vaut un contrôle qui dit franchement ce qu'il ne couvre pas qu'un plancher
  // uniforme qui rougirait sur toutes les tuiles de grille.
  // Tâche 10 : `.mn-bouton`/`.mn-nouveau`/`.mn-ligne`/`.mn-etiquette` (minuteurs) et `.vt-bouton`
  // (voiture) rejoignent la liste, même raisonnement qu'au-dessus pour les cibles média — un
  // vérificateur qui ne regarde pas ces éléments ne peut jamais les voir rétrécir. `.mn-ligne`
  // n'est PAS elle-même une cible (aucun `@pointerdown` dessus, seuls ses enfants `.mn-bouton`
  // répondent au doigt) : elle est mesurée quand même pour son invariant de hauteur (62 px,
  // `base.css`), qui doit rester cohérent avec les deux `.mn-bouton` qu'elle porte.
  // Tâche 12 : la vue `#recette` (nav, actions, panneau d'ingrédients, bouton de minuteur inline)
  // en était totalement absente — exactement le même angle mort que celui documenté ci-dessus pour
  // la carte média avant la tâche 13, et pour la même raison : sans ces sélecteurs, la mesure
  // « aucune cible < 62 px » de cette tâche passerait toujours au vert, qu'un `min-height` ait
  // régressé ou non.
  //   `.recette-nav > *`     — flèches précédent/suivant (étapes ET pagination des ingrédients)
  //   `.recette-actions > *` — Ingrédients / Réduire / Terminer
  //   `.recette-minuteur`    — bouton de minuteur inline, posé au milieu du texte d'une étape
  //   `.ing-retirer`         — croix de retrait d'un ingrédient (icône seule, 62×62)
  //   `.ing-actions > *`     — Retirer tout / Fermer, dans le panneau
  const cibles = [...app.querySelectorAll(
    '.ambiance,.commande,.tuile,.xl,.media-bouton,.media-pas,.media-rail,.mode-action,'
    + '.mn-bouton,.mn-nouveau,.mn-ligne,.mn-etiquette,.vt-bouton,'
    + '.recette-nav > *,.recette-actions > *,.recette-minuteur,.ing-retirer,.ing-actions > *')]
    .map((e) => {
      const b = e.getBoundingClientRect();
      const declare = Object.entries(planchersLargeur).find(([sel]) => e.matches(sel));
      return {
        classe: e.className,
        h: Math.round(b.height),
        l: Math.round(b.width),
        plancherLargeur: declare ? declare[1] : null,
      };
    });

  // Ronde de correction 2 (relecteur, LE PLUS IMPORTANT) : jusqu'ici, ce vérificateur ne juge que
  // la géométrie — jamais si l'écran mesuré est le vrai tableau de bord ou un message d'erreur. Un
  // écran bloqué en permanence sur « Connexion impossible » (`erreurDemarrage()`, `demarrage.ts`)
  // ou « Session » (`sessionAbsente()`, même fichier) passait donc `jugerResultat` haut la main :
  // ces deux gabarits ne débordent pas, n'ont aucune cible tactile trop petite (ils n'en ont
  // AUCUNE), aucun contraste insuffisant. Un vérificateur qui ne peut jamais voir l'application
  // réellement en panne ne vaut rien pour son usage principal (valider les prochaines bascules de
  // tablettes, cf. brief).
  //
  // Détection sans nouveau mécanisme : ces deux gabarits partagent une classe déjà présente et
  // déjà porteuse de sens dans l'app réelle — `.cap`, la classe du bandeau (`rendreBandeau`,
  // `rendu/bandeau.ts`) — réutilisée telle quelle comme conteneur unique de ces deux écrans de
  // repli (`demarrage.ts`). Sur l'écran normal (jour), `.cap` est TOUJOURS accompagné d'un frère
  // `.corps` (`dessiner()` rend bandeau + corps ensemble, sous la racine `.ecran`) ; sur les
  // écrans de repli, `.cap` est seul, sans `.corps`. Cette différence structurelle est fiable —
  // et respecte l'écran de nuit (`rendreNuit`, `.nuit`, légitimement très dépouillé : « aucune
  // commande » par conception, cf. son docstring) autant que la vue « Toute la maison »
  // (`rendreMaison`, `.corps` seul, sans `.cap`) : aucun des deux n'utilise `.cap`, donc aucun des
  // deux n'est jamais signalé par ce contrôle, quelle que soit sa sobriété.
  // 2026-08-28 : recherche EN PROFONDEUR (`querySelector`), plus en enfant direct de `#app`.
  // L'accueil enveloppe désormais bandeau et corps dans sa racine de vue `.ecran`
  // (`demarrage.ts`) — un relevé sur `app.children` n'y voyait plus ni `.cap` ni `.corps` et ne
  // pouvait plus rien conclure, alors que la question posée ici (« l'écran mesuré est-il un
  // gabarit de repli ? ») ne dépend pas de la profondeur : les deux replis rendent `.cap` SEUL,
  // sans aucun `.corps`, où qu'ils vivent dans l'arbre.
  const aBandeau = app.querySelector('.cap') !== null;
  const aCorps = app.querySelector('.corps') !== null;
  const ecranIndisponible = aBandeau && !aCorps;

  // --- Contraste texte/fond : compose les fonds de la racine vers la feuille (alpha over),
  // puis compare au texte composé sur ce fond, en ratio WCAG. ---
  function couleur(rgba) {
    const m = /rgba?\(([^)]+)\)/.exec(rgba || '');
    if (!m) return null;
    const p = m[1].split(',').map((s) => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  }
  function composer(dessus, dessous) {
    const a = dessus.a;
    return { r: dessus.r * a + dessous.r * (1 - a), g: dessus.g * a + dessous.g * (1 - a),
             b: dessus.b * a + dessous.b * (1 - a) };
  }
  function fondEffectif(el) {
    const chaine = [];
    for (let n = el; n; n = n.parentElement) chaine.unshift(n);
    let fond = { r: 255, g: 255, b: 255 };   // repli : ne devrait jamais servir (html a un fond)
    for (const n of chaine) {
      const c = couleur(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) fond = composer(c, fond);
    }
    return fond;
  }
  function luminance(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratioContraste(c1, c2) {
    const l1 = luminance(c1);
    const l2 = luminance(c2);
    const [haut, bas2] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (haut + 0.05) / (bas2 + 0.05);
  }

  const contrastes = [];
  app.querySelectorAll('*').forEach((el) => {
    if (el.closest('svg')) return;
    const aDuTexte = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
    if (!aDuTexte) return;
    const brutTexte = couleur(getComputedStyle(el).color);
    if (!brutTexte) return;
    const fond = fondEffectif(el);
    const texte = composer(brutTexte, fond);
    contrastes.push({
      ratio: Math.round(ratioContraste(texte, fond) * 100) / 100,
      element: el.className || el.tagName,
      texte: (el.textContent || '').trim().slice(0, 30),
    });
  });

  // Tâche 13 — LE JEU RÉELLEMENT DEMANDÉ PAR LE CONTENU. `marge` seule ne peut pas répondre à
  // « ce mode tient-il dans 585 px, et avec combien de reste ? » : `.corps` est en `flex: 1` et
  // `.xl` (le bouton « Toute la maison ») porte `margin-top: auto`, donc TOUT l'espace libre est
  // absorbé par cette marge et le dernier élément touche toujours le bas du cadre. `marge` vaut
  // donc 0 pour n'importe quel mode qui ne déborde pas, quel que soit son contenu réel — un
  // chiffre qui ne dit rien de ce qu'il reste. On mesure ici le blanc que cette marge automatique
  // a avalé (l'écart entre `.xl` et son frère précédent, moins la gouttière normale de `.corps`) :
  // c'est exactement le budget encore disponible.
  // `null` et NON `0` quand l'ancre manque (ronde de correction 1) : sans `.corps > .xl`, ce
  // blanc n'est pas nul, il est INCONNU. Le rendre `0` faisait rapporter « 585 px, reste 0 px »
  // — un mode au ras du plafond — et le faisait juger conforme dans la foulée : la valeur la plus
  // alarmante possible produite par l'absence de mesure, jamais par une mesure. L'appelant doit
  // pouvoir distinguer « il ne reste rien » de « je n'ai pas pu mesurer », et refuser la seconde.
  // Tâche 10 bis : `.mn-reglage > .xl` rejoint le sélecteur — la sous-vue `#minuteur` est
  // maintenant, elle aussi, un enfant DIRECT de `#app` avec son propre bouton « Retour » en
  // `margin-top: auto` (même gabarit que `.corps`), mais sa racine ne porte pas la classe
  // `.corps` (cf. `rendu/minuteur.ts`/`base.css`). Sans cet ajout, cette sous-vue retomberait
  // silencieusement sur « jeu non mesurable » alors que son contenu est parfaitement mesurable.
  let jeu = null;
  const xl = app.querySelector('.corps > .xl, .mn-reglage > .xl');
  const precedent = xl ? xl.previousElementSibling : null;
  if (xl && precedent) {
    const gouttiere = parseFloat(getComputedStyle(xl.parentElement).rowGap) || 0;
    jeu = Math.max(0, Math.round(
      xl.getBoundingClientRect().top - precedent.getBoundingClientRect().bottom - gouttiere));
  }

  return {
    marge: Math.round(cadre.bottom - bas),
    margeDroite: Math.round(cadre.right - droite),
    jeu,
    debords: [...new Set(debords)],
    cibles: cibles.length,
    minCible: cibles.length ? Math.min(...cibles.map((c) => c.h)) : null,
    ciblesFautives: cibles.filter((c) => c.h < cibleMin),
    // Revue tâche 15 (I2). Seules les cibles à largeur DÉCLARÉE participent : les autres n'ont
    // pas de promesse à tenir.
    ciblesLargeur: cibles.filter((c) => c.plancherLargeur !== null).length,
    largeursFautives: cibles
      .filter((c) => c.plancherLargeur !== null && c.l < c.plancherLargeur)
      .map((c) => ({ classe: c.classe, l: c.l, h: c.h, plancher: c.plancherLargeur })),
    tronques,
    clampes,
    contrastesFautifs: contrastes.filter((c) => c.ratio < contrasteMin),
    pireContraste: contrastes.length ? contrastes.reduce((a, b) => (a.ratio < b.ratio ? a : b)) : null,
    ecranIndisponible,
  };
}

/** Tâche 15 — NE JAMAIS MESURER UNE COULEUR PENDANT QU'ELLE BOUGE.
 *
 *  `.ambiance` et `.commande` (`base.css`) animent leur FOND sur 300 ms (`transition: background
 *  .3s`) alors que leur `color`, elle, n'a aucune transition et saute instantanément. À chaque
 *  bascule de palette (`.sombre` posée ou retirée : passage jour/soir, mode cinéma qui force la
 *  palette sombre, arrivée tardive de `sun.sun` dans `get_states`), il existe donc une fenêtre
 *  RÉELLE d'environ 200 ms où du texte blanc est peint sur un fond encore clair. Mesuré sur la
 *  page du salon, avec l'algorithme exact d'`analyserRendu` : 1,64:1 à +88 ms, 2,56:1 à +127 ms,
 *  4,24:1 à +166 ms, puis 6,60:1 à +203 ms, transition terminée.
 *
 *  CETTE FENÊTRE EXISTE VRAIMENT — on choisit de ne pas la mesurer, on ne prétend pas qu'elle
 *  n'existe pas. Pendant ~150 ms, les libellés d'ambiance (« Clair », « Cinéma », « Minuteur »)
 *  sont réellement illisibles sur la tablette. C'est un défaut visuel connu, antérieur à ce
 *  chantier, noté comme dette dans `rapports/tache-15-intermittence-rapport.md` : le corriger
 *  demande d'ajouter `color` à la transition de `base.css`, ce qui n'est pas du ressort d'un
 *  vérificateur. Ce qui EST de son ressort : ne pas transformer cette dette en verdict aléatoire.
 *  Avant ce garde, les fautes tombaient au hasard de l'instant où la bascule arrivait par rapport
 *  aux attentes fixes (450 ms après un mode, 3500 ms après un chargement) — des attentes qui
 *  parient sur la charge de Home Assistant (arrivée de `get_states` mesurée entre 1,2 s et 1,8 s,
 *  sans borne garantie). On attend donc l'ÉVÉNEMENT (la fin des animations) plutôt qu'un délai.
 *
 *  Rend `false` sur dépassement, jamais une exception : l'appelant le SIGNALE (une animation qui
 *  ne se termine pas en 1,5 s est une information, pas un détail à avaler).
 *
 *  M9 (revue finale) — LES MOTIFS ONT CHANGÉ, PAS LA VALEUR. Cette limite se justifiait par les
 *  `@keyframes glisser-entree-*` (0,22 s) et `bloc-entre` (0,32 s), toutes deux SUPPRIMÉES par la
 *  branche `moteur-mouvement` : le mouvement est passé en Web Animations API, ses durées vivent
 *  dans `src/mouvement/grammaire.ts`. La plus longue y est désormais le fondu de palette (0,6 s),
 *  suivi du croisement d'affiche (0,32 s, plafonné à 0,8 s d'attente de décodage) — le balayage
 *  (0,38 s) cité ici a été retiré tâche 3 du chantier grammaire (2026-08-22), sans que rien ne
 *  raccourcisse cette limite : elle restait déjà large avant lui. 1,5 s reste donc large pour
 *  tout, et le survol DeLorean (6 s) reste la seule animation capable d'atteindre cette limite —
 *  à 22 h 04 et 01 h 21 seulement. */
const LIMITE_ANIMATIONS_MS = 1_500;

async function attendreAnimationsFinies(page, limiteMs = LIMITE_ANIMATIONS_MS) {
  try {
    await page.waitForFunction(
      // Tâche 7 (fondu de palette) : `getAnimations()` ne suffit pas seul. Vérifié en pratique
      // (diagnostic ponctuel, retiré) — une transition CSS déclenchée par `.fondu-palette` peut
      // encore jouer alors que la classe qui l'a déclenchée a DÉJÀ été retirée par son minuteur
      // (une transition, une fois démarrée, continue jusqu'à son terme même si la déclaration qui
      // l'a lancée disparaît en cours de route) — et inversement, `.fondu-palette` peut encore
      // être présente sur `<html>` alors que `getAnimations()` ne rapporte plus rien de "running"
      // pour autant (fenêtre entre la fin logique de la transition et le retrait de la classe par
      // le minuteur réel à 600 ms). Dans les deux cas, une mesure de contraste prise pendant cette
      // fenêtre peut tomber sur une couleur intermédiaire — l'ENTORSE que `basculerPalette`
      // (`moteur.ts`) introduit délibérément, mais qu'aucun contrôle de rendu ne doit jamais
      // capturer en plein vol. On attend donc EXPLICITEMENT l'absence de la classe, en plus de
      // l'absence d'animation en cours — le même choix que le brief de la tâche demande de
      // vérifier (« le minuteur », pas les couleurs) plutôt que d'affaiblir le contrôle lui-même.
      () => document.getAnimations().every((a) => a.playState !== 'running')
        && !document.documentElement.classList.contains('fondu-palette'),
      null, { timeout: limiteMs });
    return true;
  } catch {
    return false;
  }
}

// --- Tâche 8 (garde-fou du chantier grammaire du mouvement, 2026-08-22) --------------------
//
// La tâche 7 a posé 24 marques `data-mvt` dans huit fichiers de rendu. Rien n'empêchait jusqu'ici
// un futur bloc de repartir SANS marque — et le trou se serait refermé en silence : un élément non
// marqué ne produit ni erreur ni verdict, seulement une apparition ou une disparition sèche que
// personne ne surveille. Ce contrôle compare deux relevés du DOM et signale tout élément qui entre
// ou sort sans porter, lui ou un de ses ancêtres, `data-mvt`.

/** Éléments volontairement hors du relevé — liste COURTE et NOMMÉE, jamais élargie pour faire
 *  taire une faute réelle (la bonne réponse à un élément signalé est de lui poser sa marque) :
 *   - `#mvt-fantomes`/`#mvt-fond` : les CALQUES DE CLONES du moteur de mouvement lui-même
 *     (`mouvement/moteur.ts`). Leurs enfants sont des doublons temporaires d'éléments déjà marqués
 *     ailleurs dans `#app` — les compter créerait un doublon de faute, jamais un vrai trou.
 *   - `.delorean` : le survol cinématique plein écran (22 h 04, 01 h 21, le 21 octobre et le
 *     5 novembre) — PAS une tuile/un bloc/une vue, un survol PAR-DESSUS TOUT le reste de l'écran,
 *     DÉLIBÉRÉMENT hors de la grammaire `data-mvt`, avec ses propres animations CSS. C'est la
 *     déclaration de `survol` elle-même qui le dit (`src/demarrage.ts:1543-1548`, tâche 8 de ce
 *     même chantier), jamais une supposition faite ici.
 *   - `video`, `img` : aucun de ces deux tags n'est un rôle de la grammaire `data-mvt`
 *     (vue/bloc/tuile/ligne/chiffre/detail, cf. `src/mouvement/marques.ts`) — ce sont des éléments
 *     MÉDIA terminaux, jamais un nœud que `lit` réconcilie lui-même. L'exclusion porte sur le
 *     conteneur ENTIER (le tag lui-même, donc toute sa descendance avec : `el.matches(s)` coupe la
 *     récursion avant même le test sur les classes) — pas seulement sur un contenu interne
 *     hypothétique. Dans ce projet, les seuls `<video>`/`<img>` à classe vivent aujourd'hui sous
 *     `.delorean` (`rendu/delorean.ts`), déjà exclu ci-dessus : cette entrée reste une garde
 *     défensive pour un futur média posé ailleurs, pas la couverture d'un cas réel actuel. */
const EXCLUS_MOUVEMENT = ['#mvt-fantomes', '#mvt-fond', '.delorean', 'video', 'img'];

/** Relève, sous `#app`, la liste des éléments porteurs de classes — chacun avec sa SIGNATURE (le
 *  chemin d'indices depuis `#app` plus ses classes triées, REPRIS séparément dans `chemin` pour
 *  les comparaisons d'ancêtre de `comparerSignatures`), et `marque` (l'élément porte-t-il LUI-MÊME
 *  `data-mvt`, sans remonter aux ancêtres — cf. I1 ci-dessous, où remonter était précisément le
 *  défaut). Deux nœuds distincts au même endroit avec les mêmes classes sont, pour ce contrôle, LE
 *  MÊME élément — c'est le comportement voulu, puisque `lit` réutilise ses nœuds en place plutôt
 *  que d'en recréer un à chaque redessin. */
async function releverSignatures(page) {
  return page.evaluate((exclus) => {
    const app = document.getElementById('app');
    if (app === null) return [];
    const out = [];
    const marche = (el, chemin) => {
      if (exclus.some((s) => el.matches(s))) return;
      if (el.classList.length > 0) {
        out.push({
          sig: `${chemin}|${[...el.classList].sort().join('.')}`,
          chemin,
          marque: el.hasAttribute('data-mvt'),
          classes: [...el.classList].join('.'),
        });
      }
      [...el.children].forEach((e, i) => marche(e, `${chemin}/${i}`));
    };
    [...app.children].forEach((e, i) => marche(e, `${i}`));
    return out;
  }, EXCLUS_MOUVEMENT);
}

/** Fonction PURE (aucun effet de bord, aucun accès page) : c'est elle que l'auto-test exerce
 *  directement, pour prouver la détection sans le bruit du formatage de rapport.
 *
 *  I1 (revue finale) — RÉÉCRITE. L'ancienne version confiait `couvert` à `el.closest('[data-mvt]')`
 *  dans `releverSignatures`, qui S'INCLUT et remonte TOUS les ancêtres — or chaque racine de vue
 *  porte une marque (`vue:accueil`, `vue:nuit`…), donc TOUT descendant d'une vue était « couvert »
 *  inconditionnellement, marque immobile ou pas. Seul le bandeau (sans racine marquée au-dessus de
 *  lui) était réellement surveillé ; l'auto-test passait quand même parce que sa fixture posait
 *  l'élément fautif en enfant DIRECT de `#app`, une forme que l'application ne produit jamais.
 *
 *  Alignée maintenant sur la vraie règle d'imbrication de `sousUnAncetre` (`src/mouvement/diff.ts`) :
 *  un élément qui apparaît ou disparaît est innocent SEULEMENT si un ANCÊTRE STRICT figure LUI
 *  AUSSI parmi les éléments qui apparaissent ou disparaissent DANS LA MÊME DIFFÉRENCE et porte sa
 *  propre marque — jamais parce qu'un ancêtre quelconque, immobile, porte une marque quelque part
 *  au-dessus. C'est cet ancêtre-là, en train de bouger LUI-MÊME, dont le verdict (entrée/sortie)
 *  anime tout son sous-arbre d'un coup ; un ancêtre marqué mais stable dans cette différence ne
 *  produit aucun verdict et ne couvre donc rien. `entrantes`/`sortantes` sont calculées à part
 *  (jamais mélangées) : leurs `chemin` viennent de DEUX documents différents à deux instants
 *  différents, un chemin positionnel ne veut rien dire d'un relevé à l'autre. */
function comparerSignatures(avant, apres) {
  const cle = (x) => x.sig;
  const setA = new Set(avant.map(cle));
  const setB = new Set(apres.map(cle));
  const sortantes = avant.filter((x) => !setB.has(cle(x)));
  const entrantes = apres.filter((x) => !setA.has(cle(x)));
  const estAncetreStrict = (a, b) => a.chemin !== b.chemin && b.chemin.startsWith(`${a.chemin}/`);
  const couvert = (x, ensemble) =>
    x.marque || ensemble.some((a) => a.marque && estAncetreStrict(a, x));
  return [...sortantes.filter((x) => !couvert(x, sortantes)),
          ...entrantes.filter((x) => !couvert(x, entrantes))].map((x) => x.classes);
}

/** Le contrôle INTÉGRÉ AU RAPPORT (formatage + impression), au-dessus de la fonction pure
 *  ci-dessus. `page` sert uniquement à nommer la page en faute dans le message — pratique quand la
 *  boucle des modes navigue entre salon/cuisine/bureau. */
async function verifierMarquesMouvement(page, etatA, etatB) {
  const fautifs = comparerSignatures(etatA, etatB);
  if (fautifs.length > 0) {
    let chemin = 'page inconnue';
    try { chemin = new URL(page.url()).pathname; } catch { /* page fermée entre-temps : on garde le repli */ }
    console.error(`  ✗ MOUVEMENT (${chemin}) — ${fautifs.length} élément(s) apparaissent ou `
      + `disparaissent sans marque : ${fautifs.join(', ')}`);
    console.error('    Poser data-mvt="<rôle>:<clé>" dans le gabarit correspondant '
      + '(rôles : vue, bloc, tuile, ligne, chiffre, detail).');
  }
  return fautifs;
}

// Compteur GLOBAL, séparé de tout `fautes` local à un contrôle : c'est lui, et lui seul, qui décide
// du code de sortie propre à CE garde-fou (cf. `main()`). Le dernier relevé de signatures est gardé
// PAR PAGE (clé faible : une page fermée libère son entrée) ET PAR CHEMIN — `poserMode` navigue
// réellement d'une pièce à l'autre (`allerSurPage`, `page.goto`) pour la moitié des modes ; un tel
// rechargement remplace le document ENTIER, où tout élément est « nouveau » sans qu'aucun `data-mvt`
// ne soit en cause — ce n'est pas une réconciliation `lit`, c'est un tout autre document. On ne
// compare donc JAMAIS deux relevés pris de part et d'autre d'un `page.goto` : le premier relevé
// après une navigation ne fait que poser la référence, rien n'est signalé avant le second.
let totalFautifsMouvement = 0;
const dernieresSignaturesMouvement = new WeakMap();

// `analyserRendu` est sérialisée telle quelle par Playwright (fonction transmise à
// `page.evaluate`) : aucune fermeture sur ce module Node, tout lui arrive par `params`.
// Tâche 15 : l'attente des animations est posée ICI, dans le seul point de passage de toutes les
// mesures de rendu, plutôt que recopiée sur chacun de ses cinq appelants — un appelant qui
// l'oublierait rouvrirait exactement la fenêtre que ce garde ferme.
// Tâche 8 : le garde-fou de marques de mouvement est branché ICI, au même point de passage unique,
// pour la même raison — tout scénario qui appelle `evaluerPage` deux fois de suite sur la MÊME page
// hérite automatiquement de la surveillance, présent et futur, sans avoir à y penser à chaque appel.
//
// LIMITE DE COUVERTURE ASSUMÉE, conséquence directe de ce branchement unique : un scénario qui
// n'appelle `evaluerPage` qu'UNE SEULE FOIS par page — c'est le cas de la boucle `VUES` plus bas
// (`verifierPagesReelles`, une page NEUVE par vue, un seul appel en fin de vue) — n'a structurellement
// rien à comparer au premier appel (aucun `precedent` dans la `WeakMap`). Toute transition interne à
// CETTE vue survenue AVANT cet unique appel (ouvrir le panneau ingrédients, réduire la recette,
// cf. les `page.click(...)` de la boucle `VUES`) n'est donc jamais diffée par ce garde-fou : un
// bloc mal marqué qui n'apparaîtrait QUE dans ce genre de transition resterait un angle mort. Ce
// n'est pas un oubli, c'est le prix du point de passage unique (aucun appel dédié à ajouter à
// chaque scénario) — mais si un lecteur futur se demande pourquoi un bloc mal marqué n'a pas été
// détecté ici, la réponse est celle-ci, pas un bug de `releverSignatures`/`comparerSignatures`.
async function evaluerPage(page, params) {
  const posee = await attendreAnimationsFinies(page);
  const r = await page.evaluate(analyserRendu, params);
  let chemin = null;
  try { chemin = new URL(page.url()).pathname; } catch { /* page fermée entre-temps */ }
  const signatures = await releverSignatures(page);
  const precedent = dernieresSignaturesMouvement.get(page);
  if (precedent && precedent.chemin === chemin) {
    // Le retour n'est PAS lu par les appelants : la détection passe par la console
    // (`verifierMarquesMouvement`), le comptage par `totalFautifsMouvement` — jamais par une
    // propriété du résultat d'`evaluerPage`, qu'aucun des cinq appelants n'inspecte pour ça.
    const fautifsMouvement = await verifierMarquesMouvement(page, precedent.signatures, signatures);
    totalFautifsMouvement += fautifsMouvement.length;
  }
  dernieresSignaturesMouvement.set(page, { chemin, signatures });
  return { ...r, animationsEnCours: !posee };
}

// --- Tâche 13 : les pixels RÉELLEMENT peints ---------------------------------------------
//
// `analyserRendu` lit `getComputedStyle(el).backgroundColor` et compose les fonds de la racine
// vers la feuille. C'est exact tant que le fond est une COULEUR — et totalement aveugle à une
// `background-image`. La carte média en a une : l'affiche du film ou de l'album (`.media-affiche`,
// `rendu/media.ts`), posée en couche de fond sous un voile d'opacité `.34` dont le commentaire de
// `base.css` dit noir sur blanc qu'il s'agit d'« une valeur de DÉPART, pas encore calibrée ».
// Sans échantillonnage des pixels peints, un titre blanc sur une affiche très claire passerait le
// contrôle de contraste sans qu'aucun test ni ce vérificateur ne rougisse.

/** ÉCART ASSUMÉ par rapport au brief de la tâche, qui capturait la boîte du texte telle quelle :
 *  cette capture contient les GLYPHES eux-mêmes, peints exactement à la couleur du texte. Le
 *  maximum (ou le minimum) de luminance échantillonné est alors la couleur du texte, le ratio
 *  calculé vaut 1,00:1 sur n'importe quelle affiche, et le contrôle échoue toujours — un
 *  vérificateur qui rougit tout le temps ne vaut pas mieux qu'un qui ne rougit jamais. On mesure
 *  donc les rectangles du texte APRÈS l'avoir rendu transparent (`color: transparent`, qui ne
 *  déplace rien : la mise en page, les fonds propres des éléments — le `rgba(0,0,0,.18)` de
 *  `.media-pas` par exemple — et l'affiche restent exactement où ils sont). Le style est retiré
 *  aussitôt après. */
const SELECTEURS_PEINTS = '.media .t, .media .v, .media-sous, .media-pas';

async function echantillonnerContrastePeint(page) {
  // Tâche 15 : ce chemin-ci échantillonne des PIXELS, pas des couleurs calculées — il est donc
  // encore plus exposé qu'`evaluerPage` à une transition en cours (le fond de la carte média
  // change avec l'affiche). Même garde, même raison, cf. `attendreAnimationsFinies`.
  await attendreAnimationsFinies(page);
  const zones = await page.evaluate((sel) => {
    const carte = document.querySelector('.media');
    if (!carte) return null;
    return [...carte.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left), y: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height),
        couleurTexte: getComputedStyle(el).color,
        classe: el.className || el.tagName,
        texte: (el.textContent || '').trim().slice(0, 30),
      };
    }).filter((z) => z.w > 0 && z.h > 0);
  }, SELECTEURS_PEINTS);
  if (!zones || zones.length === 0) return null;

  await page.evaluate((sel) => {
    const style = document.createElement('style');
    style.id = '__masque-texte';
    style.textContent = `${sel} { color: transparent !important; }`;
    document.head.appendChild(style);
  }, SELECTEURS_PEINTS);

  const mesures = [];
  try {
    for (const z of zones) {
      // Une capture par zone : on ne décode pas tout l'écran en mémoire sur une machine qui fait
      // déjà tourner un navigateur. Transmise en base64 (et non en tableau d'octets comme le
      // proposait le brief) — 100 000 nombres sérialisés un par un à travers la frontière
      // Node/navigateur coûtent plusieurs secondes par zone, une chaîne coûte quelques
      // millisecondes.
      const tampon = await page.screenshot({ clip: { x: z.x, y: z.y, width: z.w, height: z.h } });
      const stats = await page.evaluate(async (b64) => {
        const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const toile = new OffscreenCanvas(image.width, image.height);
        const ctx = toile.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const px = ctx.getImageData(0, 0, image.width, image.height).data;
        const lum = (r, g, b) => {
          const c = [r, g, b].map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        // Les DEUX extrêmes, jamais la moyenne : une affiche claire par endroits suffit à rendre
        // un titre blanc illisible sur ces endroits-là, même si sa moyenne est sombre.
        let min = 1;
        let max = 0;
        for (let i = 0; i < px.length; i += 4) {
          const l = lum(px[i], px[i + 1], px[i + 2]);
          if (l < min) min = l;
          if (l > max) max = l;
        }
        return { min, max };
      }, tampon.toString('base64'));

      const m = (z.couleurTexte.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
      const lumTexte = (() => {
        const c = m.slice(0, 3).map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      })();
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const pire = Math.min(ratio(lumTexte, stats.min), ratio(lumTexte, stats.max));
      mesures.push({ classe: z.classe, texte: z.texte, ratio: Math.round(pire * 100) / 100 });
    }
  } finally {
    await page.evaluate(() => document.getElementById('__masque-texte')?.remove());
  }
  return {
    pire: mesures.reduce((a, b) => (a.ratio < b.ratio ? a : b)),
    toutes: mesures,
  };
}

// --- Tâche 13 : les images par seconde ----------------------------------------------------

/** Compte les images RÉELLEMENT peintes pendant une transition, côté navigateur. Le système de
 *  mouvement (`src/mouvement.ts`) a été construit contre l'avis du spec initial, avec obligation
 *  de mesurer plutôt que de supposer : cette fonction est ce qui remplace la supposition.
 *
 *  Ce qu'elle mesure honnêtement : la cadence du Chromium de LA MACHINE QUI VÉRIFIE, pas celle
 *  d'une Fire 7. C'est un plafond, jamais une garantie de terrain — ce qui reste utile : une
 *  transition qui saccade déjà ici saccadera à coup sûr là-bas. Depuis la tâche 1 du chantier
 *  grammaire, il n'existe plus de mesure de terrain sur les tablettes elles-mêmes : le régulateur
 *  qui dégradait le niveau tout seul sous 30 im/s a été retiré (cf. `src/mouvement.ts`) — cette
 *  fonction-ci, ponctuelle et hors production, est désormais la SEULE mesure de cadence du
 *  projet. */
async function mesurerImagesParSeconde(page, declencher, dureeMs = 600) {
  await page.evaluate(() => {
    window.__mvt = { images: 0, debut: performance.now(), actif: true };
    const compter = () => {
      if (!window.__mvt.actif) return;
      window.__mvt.images += 1;
      requestAnimationFrame(compter);
    };
    requestAnimationFrame(compter);
  });
  await declencher();
  await page.waitForTimeout(dureeMs);
  return page.evaluate(() => {
    window.__mvt.actif = false;
    const ecoule = performance.now() - window.__mvt.debut;
    return { fps: (window.__mvt.images / ecoule) * 1000, images: window.__mvt.images, ecoule };
  });
}

export function jugerResultat(r) {
  if (r.erreur) return { ok: false, raison: r.erreur };
  const problemes = [];
  // En premier, avant la géométrie : un écran d'erreur/session bien formé (sans débordement, aux
  // bons contrastes) resterait sinon jugé conforme pour la mauvaise raison — cf. commentaire de
  // `ecranIndisponible` dans `analyserRendu`.
  if (r.ecranIndisponible) {
    problemes.push('écran de repli affiché à la place du contenu attendu (« Connexion impossible » ou « Session »)');
  }
  if (r.debords.length) problemes.push(`déborde : ${r.debords.join(', ')}`);
  if (r.minCible !== null && r.minCible < CIBLE_MIN_PX) {
    problemes.push(`cible trop petite (${r.minCible} px < ${CIBLE_MIN_PX} px : ${r.ciblesFautives.map((c) => c.classe).join(', ')})`);
  }
  // Revue tâche 15 (I2) : le défaut historique agissait en LARGEUR (`flex-shrink` sur l'axe
  // principal), et rien ne la mesurait. Message distinct de « trop petite » : les deux ne se
  // corrigent pas au même endroit du CSS.
  if (r.largeursFautives && r.largeursFautives.length) {
    problemes.push('cible trop étroite ('
      + r.largeursFautives.map((c) => `${c.classe} ${c.l}×${c.h} px, largeur déclarée ${c.plancher} px`).join(' ; ')
      + ')');
  }
  if (r.contrastesFautifs.length) {
    // Tâche 15 : le seul cas où un contraste fautif peut ne PAS être un défaut de couleur est
    // celui d'une mesure prise pendant une transition de fond encore en cours (cf.
    // `attendreAnimationsFinies`). Le garde le rend très improbable, mais quand il a lui-même
    // renoncé (dépassement de sa limite), le lecteur doit le savoir AVANT de partir corriger une
    // couleur qui n'a rien fait de mal.
    problemes.push(`contraste insuffisant (pire ${r.pireContraste.ratio}:1 sur « ${r.pireContraste.texte} », ${r.contrastesFautifs.length} paire(s) < ${CONTRASTE_MIN}:1)`
      + (r.animationsEnCours ? ' — ⚠ MESURÉ PENDANT UNE ANIMATION ENCORE EN COURS : à confirmer avant de conclure à un défaut de couleur' : ''));
  }
  if (r.tronques.length) {
    // `ecrete` (tâche 12, round 1, point 4) : présent seulement sur le contrôle générique
    // `overflow: hidden` — précise combien de pixels sont masqués, l'information qui aurait
    // manqué pour diagnostiquer directement les deux fautes CSS trouvées à la première mesure.
    problemes.push(`texte tronqué (${r.tronques.map((t) => `« ${t.texte} »${t.ecrete ? ` [${t.ecrete}]` : ''}`).join(', ')})`);
  }
  return { ok: problemes.length === 0, raison: problemes.join(' ; ') };
}

function ligne(nomVue, r, jugement) {
  const marque = jugement.ok ? '✓' : '✗';
  const base = r.erreur
    ? `erreur — ${r.erreur}`
    : `marge ${r.marge} px (droite ${r.margeDroite} px), ${r.cibles} cible(s), plus petite ${r.minCible ?? 'aucune'} px, pire contraste ${r.pireContraste ? r.pireContraste.ratio + ':1' : 'n/a'}`;
  // Ronde de correction 1 : les troncatures VOULUES sont imprimées ici aussi, pas seulement dans
  // la boucle des modes. Sans cette ligne, les douze vues de pages réelles (trois pièces × quatre
  // vues) étaient totalement muettes sur un texte clampé et coupé : ni fautif, ni rapporté. Une
  // exemption doit rester visible, sinon elle devient un angle mort silencieux.
  const bornes = r.clampes && r.clampes.length
    ? `, borné à 2 lignes (voulu) : ${r.clampes.map((c) => `« ${c.texte} »`).join(', ')}`
    : '';
  // Tâche 15 : imprimé même quand tout est vert — une animation qui tourne encore après
  // `LIMITE_ANIMATIONS_MS` rend TOUTES les couleurs de cette mesure suspectes, pas seulement
  // celles qui rougissent.
  const bouge = r.animationsEnCours ? ', ⚠ une animation tournait encore à la mesure' : '';
  const detail = jugement.ok ? '' : ` — ${jugement.raison}`;
  return `  ${marque} ${nomVue} — ${base}${bornes}${bouge}${detail}`;
}

// --- Contrôle réel des pages déployées ---------------------------------------------------

async function verifierPagesReelles(nav, { deploye = false } = {}) {
  const { url: HA_URL, token } = lireIdentifiants();
  const jetons = fabriquerJetons(HA_URL, token);

  // Tâche 13 : cf. le docstring de tête. Le bundle est construit ici, une seule fois, et servi
  // aux trois contextes par interception — jamais écrit dans `config/www/wallpanel/`.
  const bundle = deploye ? null : await bundlerApplication();
  console.log(policeResolue());
  console.log(deploye
    ? `Bundle mesuré : celui RÉELLEMENT DÉPLOYÉ dans ${WWW_WALLPANEL} (--deploye).`
    : `Bundle mesuré : construit à l'instant depuis ${SRC_APP} (esbuild, en mémoire), servi par `
      + 'interception — le déploiement de `config/www/wallpanel/` n\'est ni lu ni touché. '
      + '`--deploye` pour mesurer l\'inverse.');

  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  await ctx.addInitScript((j) => { localStorage.setItem('hassTokens', JSON.stringify(j)); }, jetons);
  await poserInterceptions(ctx, bundle);

  // Ronde de correction 1 : contexte SÉPARÉ pour la vue « temps réel », jamais partagé avec
  // `ctx`. Constaté à l'exécution (pas supposé) : `page.clock.install()` s'est révélé fuiter
  // au-delà de la page qui l'installe — une page « temps réel » ouverte APRÈS une page à horloge
  // figée dans le même `BrowserContext` héritait de l'heure truquée de cette dernière (rendu
  // identique à la vue « jour », 6 cibles, alors qu'il était réellement 0 h 39 du matin — piégé
  // en écrivant cette correction elle-même). Réordonner les vues n'aurait déplacé le problème
  // qu'à la deuxième pièce vérifiée (`bureau` après les vues figées de `salon`) ; seul un
  // contexte dont AUCUNE page n'installe jamais d'horloge truquée garantit qu'aucune fuite n'est
  // possible, quel que soit l'ordre.
  const ctxReel = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  await ctxReel.addInitScript((j) => { localStorage.setItem('hassTokens', JSON.stringify(j)); }, jetons);
  await poserInterceptions(ctxReel, bundle);

  const presentes = PIECES.filter((p) => existsSync(`${WWW_WALLPANEL}/${p}.html`));
  const absentes = PIECES.filter((p) => !presentes.includes(p));

  console.log(`Pages présentes vérifiées : ${presentes.join(', ') || '(aucune)'}`);
  if (absentes.length) {
    console.log(`Pages absentes, non vérifiées (créées aux tâches 11/12) : ${absentes.join(', ')}`);
  }
  if (!presentes.length) {
    console.error('Aucune page à vérifier.');
    return 1;
  }

  // Quatre vues par page : l'écran normal (« jour », commandes + ambiances), l'écran de nuit
  // (23 h → 5 h, cf. `contexte.ts`), « Toute la maison » (grille de tuiles, tâche 8) et une vue
  // « temps réel ». Sans forcer l'horloge du navigateur sur les trois premières, seule la vue
  // correspondant à l'heure réelle serait observable — hors service la nuit, où l'écran normal
  // ne serait jamais couvert. `sun.sun` reste réel (poussé par HA), seule l'heure affichée est
  // truquée pour la durée du contrôle.
  //
  // Tâche 11, ronde de correction 1 (CRITIQUE, relecteur) : `page.clock.install()` remplace
  // `setInterval`/`setTimeout` par des équivalents qui tolèrent n'importe quel récepteur — un
  // bug réel (`Illegal invocation`, cf. rapport tâche 11) où `connexion.ts`/`demarrage.ts`
  // appellent ces globales en accès propriété (`this.deps.intervalFn(...)`) était donc invisible
  // sur les trois vues à horloge figée ci-dessus, ET invisible à jsdom (qui n'implémente pas la
  // vérification de récepteur des méthodes natives — vérifié explicitement, pas supposé). La vue
  // « temps réel » ne fige RIEN : les vrais minuteurs tournent, avec les vraies valeurs par
  // défaut de `Connexion`/`demarrage.ts` (aucune injection, exactement le chemin qu'emprunte une
  // vraie tablette) — seul endroit de ce vérificateur où cette classe de défaut a une chance de
  // se manifester.
  const maintenant = new Date();
  const heureJour = new Date(maintenant); heureJour.setHours(14, 0, 0, 0);
  const heureNuit = new Date(maintenant); heureNuit.setHours(2, 0, 0, 0);
  // Tâche 10 bis : cinquième vue — le réglage du minuteur (`#minuteur`) est devenu une sous-vue
  // plein écran (arbitrage du propriétaire, 2026-08-03), au même titre que « Toute la maison »
  // et « Tâches » juste au-dessus : mesuré ici, avec les mêmes contrôles génériques (débordement,
  // cibles tactiles, contraste), plutôt que par le geste CDP dédié que la tâche 10 avait dû
  // écrire (`verifierReglageMinuteur`, supprimé) quand ce n'était encore qu'un état local
  // atteignable seulement au doigt. Naviguer directement vers l'URL suffit désormais, exactement
  // comme pour les deux autres sous-vues : `location.hash` seul décide de ce que `dessiner()`
  // rend, quelle que soit la pièce (`piece.minuteurs` n'intervient pas dans ce retour anticipé,
  // cf. `demarrage.ts`).
  const VUES = [
    { nom: 'jour (14 h, horloge forcée)', heure: heureJour, hash: '', figerHorloge: true },
    { nom: 'nuit (2 h, horloge forcée)', heure: heureNuit, hash: '', figerHorloge: true },
    { nom: 'toute la maison (14 h, #maison)', heure: heureJour, hash: '#maison', figerHorloge: true },
    { nom: 'réglage minuteur (14 h, #minuteur)', heure: heureJour, hash: '#minuteur', figerHorloge: true },
    { nom: 'temps réel (horloge NON figée, dépendances par défaut)', heure: null, hash: '', figerHorloge: false },
    // Cinq vues de la sous-vue `#recette`. Toutes injectent une recette synthétique
    // (`recetteEssai`, cf. la boucle ci-dessous) plutôt que d'envoyer `home_stock/recipe/get` à
    // l'instance : le planning de cette maison est vide la plupart du temps, et un contrôle qui
    // mesurerait alors un écran sans recette passerait à vide — voir le commentaire des fixtures
    // plus haut.
    //   'longue'   — la pire page du catalogue (454 caractères + image, celle qui DOIT déclencher
    //                `reScinder`) et son tag de minuteur inline, mesurées en une seule vue : ouvrir
    //                la recette suffit, la page longue est déjà celle affichée (page 0).
    //   'gaspacho' + `panneauIngredients` — le panneau ouvert sur 7 ingrédients
    //                (`INGREDIENTS_ESSAI_7`), en LECTURE depuis le lot 6 : plus aucun bouton de
    //                retrait par ligne, donc moins de cibles tactiles et moins de hauteur.
    //   'longue'   + `recetteReduite` — le bloc réduit de l'accueil, atteint en ouvrant PUIS en
    //                réduisant (même geste qu'un vrai appui, cf. la boucle ci-dessous), pour que
    //                `etape`/`total` soient bornés sur un état réellement peint.
    //   'brute'    — une description SANS bloc `.page-recipes` (plus aucune en production depuis
    //                le 2026-08-18 ; gardé comme contrôle de robustesse), donc une seule
    //                page ET une seule unité de premier niveau. Round 2 : structurellement
    //                INCOUPABLE par `reScinder` (`unites.length < 2`), mesure seule, aucun correctif.
    //                Round 3 : la subdivision (`subdiviserUnite`) corrige le cas — cette vue DOIT
    //                désormais passer, sans écrêtage (cf. `recetteEssaiBrute`).
    //   'brute-reelle' — la PIRE des 14 vraies descriptions sans bloc (208 caractères, texte pur,
    //                round 3) : documente que le cas COURANT, réellement atteint aujourd'hui, tient
    //                sur une seule page et n'est pas perturbé par la subdivision.
    { nom: 'recette (14 h, #recette)', heure: heureJour, hash: '#recette', figerHorloge: true,
      recetteEssai: 'longue' },
    { nom: 'recette — panneau ingrédients (7, #recette)', heure: heureJour, hash: '#recette',
      figerHorloge: true, recetteEssai: 'gaspacho', panneauIngredients: true },
    { nom: 'recette réduite (14 h, accueil)', heure: heureJour, hash: '', figerHorloge: true,
      recetteEssai: 'longue', recetteReduite: true },
    { nom: 'recette — description brute sans .page-recipes (#recette)', heure: heureJour,
      hash: '#recette', figerHorloge: true, recetteEssai: 'brute' },
    { nom: 'recette — pire description brute RÉELLE, 208 car. (#recette)', heure: heureJour,
      hash: '#recette', figerHorloge: true, recetteEssai: 'brute-reelle' },
  ];

  let fautes = 0;
  for (const piece of presentes) {
    console.log(`${piece} :`);
    for (const vue of VUES) {
      const page = await (vue.figerHorloge ? ctx : ctxReel).newPage();
      // Ronde de correction 1 : écoutée sur TOUTES les vues, pas seulement la vue « temps réel »
      // — une régression future pourrait très bien se manifester ailleurs. Avant ce correctif,
      // rien n'écoutait `pageerror` du tout : même l'exception réelle de la tâche 11 (qui SE
      // PRODUISAIT bel et bien, silencieusement, à chaque connexion réelle) n'aurait fait
      // échouer aucune vue.
      const erreursPage = [];
      page.on('pageerror', (err) => erreursPage.push(err.message));
      /** La pagination affichée par la VUE juste avant « Réduire » (sous-pages mesurées), relevée
       *  pour la seule vue `recetteReduite` — cf. son assertion plus bas. */
      let paginationVue = null;
      if (vue.figerHorloge) await page.clock.install({ time: vue.heure });
      try {
        // Les vues `recetteEssai` ont besoin de `?essai=1` — SANS lui, `__injecterRecette`
        // (`demarrage.ts`) n'existe tout simplement pas sur la page (posé sous cette garde), et
        // l'injection plus bas ne serait qu'un `?.()` muet sur `undefined`. Piégé À L'EXÉCUTION
        // (round 1 de la tâche 12) : la cuisine « réussissait » quand même, mais en mesurant le
        // planning RÉEL du foyer plutôt que le pire cas déterministe voulu — un faux positif
        // silencieux. Absent des AUTRES vues : `?essai=1` ne change que la
        // présence de ces points d'injection, jamais le rendu, mais autant rester au plus près de ce
        // qu'une vraie tablette charge (jamais ce paramètre) pour tout ce qui n'en a pas besoin.
        const essai = vue.recetteEssai ? '?essai=1' : '';
        await page.goto(`${HA_URL}/local/wallpanel/${piece}.html${essai}${vue.hash}`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3500);   // laisse le websocket s'authentifier et pousser get_states
        if (vue.recetteEssai) {
          // Tâche 12 (round 1, point 9) : sans neutralisation, ces trois vues restent exposées à
          // l'état RÉEL de la maison — `modePrincipal` (`modes.ts`) fait primer une alerte sur le
          // mode `recette`, et un run peut donc rougir sur « recette réduite » simplement parce
          // qu'une porte est déverrouillée au moment du contrôle (constaté à l'exécution). Même
          // liste `NEUTRE` que `verifierModes`, pour la même raison : un vérificateur qui est le
          // SEUL juge de ce lot ne doit pas pouvoir rougir au hasard d'un événement réel du foyer.
          await neutraliser(page);
          const recette = vue.recetteEssai === 'gaspacho' ? recetteEssaiGaspacho()
            : vue.recetteEssai === 'brute' ? recetteEssaiBrute()
            : vue.recetteEssai === 'brute-reelle' ? recetteEssaiBruteReelle()
            : recetteEssaiLongue();
          await page.evaluate((r) => window.__injecterRecette?.(r), recette);
          // Laisse `reScinder` (mesure DOM réelle, `rendu/recette.ts`) rejouer sa propre peinture
          // avant de mesurer — c'est exactement ce que cette vue existe pour prouver.
          await page.waitForTimeout(300);
          // Le vrai capteur de repas a pu conclure, avant que cette injection n'arrive, qu'il n'y
          // avait rien à ouvrir (planning vide, ou `home_stock` pas encore chargé) et avoir déjà
          // remis le hash à vide (`demarrage.ts`) : on rouvre alors explicitement, exactement comme
          // le ferait un appui sur le bloc de l'accueil — jamais une lecture directe de l'état
          // interne.
          if (!(await page.evaluate(() => document.querySelector('[data-mvt="vue:recette"]') !== null))) {
            await page.evaluate(() => { location.hash = '#recette'; });
            await page.waitForTimeout(300);
          }
          if (vue.panneauIngredients) {
            // Lot 6 : `ouvrirPanneau()` ne lit PLUS rien (le plan de décrément a été demandé une
            // fois à l'ouverture de la vue) — l'ordre injection/appui n'est donc plus critique, et
            // les ingrédients arrivent avec la recette elle-même, en une seule injection.
            await page.click('.recette-ingredients');
            await page.waitForTimeout(300);
          }
          if (vue.recetteReduite) {
            // REVUE FINALE (2026-08-17) : relevé AVANT de réduire — la pagination que la VUE
            // affiche est celle des sous-pages (`pagesRecette`, mesurées), et c'est elle qui prouve
            // qu'une sous-découpe a réellement eu lieu sur cette fixture. Sans ce relevé,
            // l'assertion sur « Étape 1/1 » plus bas serait creuse : elle passerait aussi bien sur
            // une page jamais coupée, c'est-à-dire sans exercer le correctif du tout.
            paginationVue = await page.evaluate(
              () => document.querySelector('.recette-pages')?.textContent?.trim() ?? null);
            // Le même chemin qu'un vrai appui, jamais un raccourci qui contournerait `reduire()`
            // (`demarrage.ts`) : c'est CE bloc, peint par CE geste, que la tâche 12 doit prouver
            // borné (`bornerEtape`), pas un état construit à la main.
            await page.click('.recette-reduire');
            await page.waitForTimeout(300);
          }
        }
        const r = await evaluerPage(page, PARAMS_ANALYSE);
        const jugement = jugerResultat(r);
        if (erreursPage.length) {
          jugement.ok = false;
          const detail = `erreur(s) de page : ${erreursPage.join(' | ')}`;
          jugement.raison = jugement.raison ? `${jugement.raison} ; ${detail}` : detail;
        }
        // Tâche 10 bis : preuve que la sous-vue atteinte est bien la bonne (même discipline que
        // le `marqueur` des MODES, cf. `MODES` plus haut) — sans elle, un défaut de câblage qui
        // laisserait `#minuteur` retomber sur l'écran normal passerait inaperçu (aucun débordement
        // à signaler sur un écran... normal).
        if (vue.hash === '#minuteur') {
          const atteint = await page.evaluate(() => document.querySelector('.mn-reglage') !== null);
          if (!atteint) {
            jugement.ok = false;
            const detail = "sous-vue non atteinte : .mn-reglage n'est pas rendu sur #minuteur";
            jugement.raison = jugement.raison ? `${jugement.raison} ; ${detail}` : detail;
          } else if (r.jeu !== null || r.marge < 0) {
            // Hauteur RÉELLEMENT demandée par le contenu, même calcul que le tableau « Budget de
            // hauteur par mode » ci-dessous (`reste`/`hauteur`) — imprimée ici, à part, puisque
            // cette sous-vue n'est plus un mode de `MODES` et ne rejoint donc plus ce tableau.
            const reste = r.marge < 0 ? r.marge : r.jeu;
            console.log(`      · budget de hauteur (comme les modes) : ${HAUTEUR - reste} px / `
              + `${HAUTEUR} px (reste ${reste} px)`);
          }
        }
        // Tâche 12 (round 1, point 5) : les trois mesures étaient IMPRIMÉES mais jamais ASSERTÉES —
        // avec, en plus, un repli qui passait au vert quand le bouton de minuteur était absent. Ce
        // bloc lève désormais une VRAIE faute (`jugement.ok = false`) dès qu'une valeur mesurée
        // s'écarte de ce que la fixture DOIT produire, plat affiché INCLUS : sans cette assertion,
        // rien ne distingue une mesure de `PLAN_ESSAI_RECETTE`/`PLAN_ESSAI_GASPACHO` d'une mesure du
        // VRAI planning du foyer — c'était précisément le faux positif d'origine (round 0), et il
        // restait ouvert sur la cuisine (seule pièce où le vrai `chargerPlan()` tourne).
        const fauteRecette = (detail) => {
          jugement.ok = false;
          jugement.raison = jugement.raison ? `${jugement.raison} ; ${detail}` : detail;
        };
        if (vue.recetteEssai) {
          if (vue.recetteReduite) {
            const bloc = await page.evaluate(() => ({
              etape: document.querySelector('[data-mvt="bloc:recette"] .t')?.textContent?.trim() ?? null,
              plat: document.querySelector('[data-mvt="bloc:recette"] .v')?.textContent?.trim() ?? null,
            }));
            if (bloc.etape === null) {
              fauteRecette("sous-vue non atteinte : le bloc réduit ([data-mvt=\"bloc:recette\"]) n'est pas rendu");
            } else {
              // REVUE FINALE (2026-08-17) — DEUX ASSERTIONS QUI NE VALENT QUE L'UNE AVEC L'AUTRE.
              // La fixture `recetteEssaiLongue` n'a AUCUN bloc `.page-recipes` : `decouperPages`
              // (`src/recette.ts`) en fait donc UNE SEULE page source, que `reScinder` sous-découpe
              // ensuite en deux d'après la mesure réelle. La vue, elle, pagine ces sous-pages
              // (« 1/2 ») — c'est bien ce que ses flèches parcourent. Le bloc RÉDUIT, lui, annonce
              // une ÉTAPE, et le spec (§4) tranche : « une "étape" est une page de la recette,
              // jamais un découpage propre à l'app ». Il doit donc dire « Étape 1/1 ».
              // La version précédente de ce contrôle attendait « Étape 1/2 » : elle ASSERTAIT le
              // défaut. Les deux mesures sont vérifiées ensemble — sans la première, « 1/1 » passerait
              // aussi sur une page jamais coupée, donc sans jamais exercer le correctif.
              if (paginationVue === null || !/\/[2-9]\d*$/.test(paginationVue)) {
                fauteRecette('bloc réduit : la vue n\'a PAS sous-découpé cette fixture (pagination '
                  + `« ${paginationVue ?? 'absente'} ») — l'assertion sur l'étape ne prouverait rien`);
              }
              if (!/^Étape 1\/1\b/.test(bloc.etape)) {
                fauteRecette(`bloc réduit : étape attendue « Étape 1/1… » (pages SOURCE, pas les `
                  + `sous-pages « ${paginationVue} » de la vue), mesurée « ${bloc.etape} »`);
              }
              if (bloc.plat !== PLAT_ESSAI_LONGUE) {
                fauteRecette(`bloc réduit : plat attendu « ${PLAT_ESSAI_LONGUE} », mesuré « ${bloc.plat} »`
                  + ' — ce n\'est peut-être pas la fixture qui a été mesurée');
              }
              console.log(`      · bloc réduit (étape en pages SOURCE) : « ${bloc.etape} » — la vue `
                + `paginait « ${paginationVue} » — plat « ${bloc.plat} »`);
            }
          } else {
            const atteint = await page.evaluate(() => document.querySelector('[data-mvt="vue:recette"]') !== null);
            if (!atteint) {
              fauteRecette("sous-vue non atteinte : [data-mvt=\"vue:recette\"] n'est pas rendu sur #recette");
            } else if (vue.recetteEssai === 'brute') {
              // Round 3 (revue) : cette fixture DOIT désormais passer, sans écrêtage — c'est elle
              // qui prouve `subdiviserUnite` (`rendu/recette.ts`). Assertion DURE et DIRECTE sur le
              // débordement, cette fois (pas seulement le contrôle générique d'`analyserRendu`,
              // laissé décider en plus, sans jamais être court-circuité) : la leçon du round 1
              // (« assertions manquantes ») vaut aussi pour cette vue. Seule la pagination reste
              // observée, pas assertée à un nombre précis — elle dépend de la mesure réelle.
              const brute = await page.evaluate(() => {
                const zone = document.querySelector('.recette-page');
                return {
                  pages: document.querySelector('.recette-pages')?.textContent?.trim() ?? null,
                  plat: document.querySelector('.recette-titre')?.textContent?.trim() ?? null,
                  scrollHeight: zone ? zone.scrollHeight : null,
                  clientHeight: zone ? zone.clientHeight : null,
                };
              });
              const ecart = brute.scrollHeight !== null && brute.clientHeight !== null
                ? brute.scrollHeight - brute.clientHeight : null;
              if (ecart === null || ecart > 1) {
                fauteRecette(`description brute : ENCORE écrêtée (${ecart ?? '?'} px), la `
                  + 'subdivision (subdiviserUnite) n\'a pas suffi à faire tenir cette fixture');
              }
              if (brute.plat !== PLAT_ESSAI_BRUTE) {
                fauteRecette(`description brute : plat attendu « ${PLAT_ESSAI_BRUTE} », mesuré « ${brute.plat} »`
                  + ' — ce n\'est peut-être pas la fixture qui a été mesurée');
              }
              // Round 4 (revue) : cette fixture porte désormais un tag à NOM ESPACÉ
              // (`#Cuisson courgettes:1500`) — c'est la SEULE des trois fixtures `#recette` dont le
              // tag traverse réellement `subdiviserUnite` (`decouperEnPhrases`/`decouperEnMots`,
              // `rendu/recette.ts`). On le cherche sur CHAQUE sous-page (sa position dépend de la
              // coupe réelle) et on vérifie qu'il est resté un bouton VIVANT — jamais redevenu du
              // texte nu (« Cuisson courgettes » ou « courgettes:1500 » esseulés).
              let boutonTag = null;
              for (let essai = 0; essai < 8 && !boutonTag; essai++) {
                boutonTag = await page.evaluate(() => {
                  const bouton = [...document.querySelectorAll('.recette-minuteur')]
                    .find((b) => (b.textContent || '').includes('25:00') || (b.textContent || '').includes('Cuisson'));
                  return bouton ? bouton.textContent.trim() : null;
                });
                if (boutonTag) break;
                const texteBrise = await page.evaluate(() =>
                  (document.querySelector('.recette-page')?.textContent ?? '').match(/Cuisson courgettes|courgettes:1500/)?.[0] ?? null);
                if (texteBrise) {
                  fauteRecette(`description brute : le tag « #Cuisson courgettes:1500 » est redevenu `
                    + `du texte nu (« ${texteBrise} » trouvé hors bouton) — rompu par la subdivision`);
                  break;
                }
                const suiv = await page.$('.recette-suiv:not(.inactif)');
                if (!suiv) break;
                await suiv.click();
                await page.waitForTimeout(150);
              }
              if (!boutonTag) {
                fauteRecette('description brute : le bouton du tag « #Cuisson courgettes:1500 » est '
                  + 'introuvable sur aucune sous-page (ni vivant, ni texte nu détecté)');
              }
              console.log(`      · description brute (aucun bloc .page-recipes ; cas de robustesse, plus aucune en production), `
                + `768 caractères, tag à nom espacé — SUBDIVISÉE : pagination ${brute.pages}, `
                + `plat « ${brute.plat} », .recette-page ${brute.scrollHeight} px de contenu / `
                + `${brute.clientHeight} px disponibles `
                + `(${ecart !== null && ecart > 0 ? `${ecart} px écrêtés` : 'tient, aucun écart'}), `
                + `bouton du tag : ${boutonTag ? `vivant (« ${boutonTag} »)` : 'INTROUVABLE'}`);
            } else if (vue.recetteEssai === 'brute-reelle') {
              // Round 3 (revue) : documente que le cas COURANT (la pire des 14 descriptions d'alors
              // sans bloc, 208 caractères) tient sur UNE SEULE page — la subdivision ne le perturbe
              // pas. Pagination assertée à « 1/1 » ICI (contrairement à la fixture 'brute'
              // ci-dessus) : c'est justement le point à démontrer pour ce cas-là.
              const reelle = await page.evaluate(() => {
                const zone = document.querySelector('.recette-page');
                return {
                  pages: document.querySelector('.recette-pages')?.textContent?.trim() ?? null,
                  plat: document.querySelector('.recette-titre')?.textContent?.trim() ?? null,
                  scrollHeight: zone ? zone.scrollHeight : null,
                  clientHeight: zone ? zone.clientHeight : null,
                };
              });
              if (reelle.pages !== '1/1') {
                fauteRecette(`pire description brute réelle : pagination attendue « 1/1 » (le cas `
                  + `courant ne devrait pas être subdivisé), mesurée « ${reelle.pages} »`);
              }
              const ecart = reelle.scrollHeight !== null && reelle.clientHeight !== null
                ? reelle.scrollHeight - reelle.clientHeight : null;
              if (ecart === null || ecart > 1) {
                fauteRecette(`pire description brute réelle : écrêtée (${ecart ?? '?'} px) — le cas `
                  + 'courant, réellement atteint aujourd\'hui, ne devrait jamais déborder');
              }
              if (reelle.plat !== PLAT_ESSAI_BRUTE_REELLE) {
                fauteRecette(`pire description brute réelle : plat attendu « ${PLAT_ESSAI_BRUTE_REELLE} », `
                  + `mesuré « ${reelle.plat} » — ce n'est peut-être pas la fixture qui a été mesurée`);
              }
              console.log(`      · pire description brute RÉELLE (208 car., texte pur, sans balise) : `
                + `pagination ${reelle.pages}, plat « ${reelle.plat} », .recette-page ${reelle.scrollHeight} px `
                + `de contenu / ${reelle.clientHeight} px disponibles`);
            } else if (vue.panneauIngredients) {
              const panneau = await page.evaluate(() => ({
                lignes: document.querySelectorAll('.ing-ligne').length,
                pages: document.querySelector('.recette-pages')?.textContent?.trim() ?? null,
                ouvert: document.querySelector('.ing-panneau') !== null,
                plat: document.querySelector('.recette-titre')?.textContent?.trim() ?? null,
              }));
              if (!panneau.ouvert) {
                fauteRecette("panneau non atteint : .ing-panneau n'est pas rendu après l'appui « Ingrédients »");
              } else {
                if (panneau.lignes !== 4) {
                  fauteRecette(`panneau ingrédients : 4 lignes attendues (1re page de 7), ${panneau.lignes} mesurée(s)`);
                }
                if (panneau.pages !== '1/2') {
                  fauteRecette(`panneau ingrédients : pagination attendue « 1/2 », mesurée « ${panneau.pages} »`);
                }
                if (panneau.plat !== PLAT_ESSAI_GASPACHO) {
                  fauteRecette(`panneau ingrédients : plat attendu « ${PLAT_ESSAI_GASPACHO} », mesuré « ${panneau.plat} »`
                    + ' — ce n\'est peut-être pas la fixture qui a été mesurée');
                }
                console.log(`      · panneau ingrédients (7) : ${panneau.lignes} ligne(s) affichée(s), `
                  + `pagination ${panneau.pages}, plat « ${panneau.plat} »`);
              }
            } else {
              const mesure = await page.evaluate(() => {
                const pages = document.querySelector('.recette-pages')?.textContent?.trim() ?? null;
                const plat = document.querySelector('.recette-titre')?.textContent?.trim() ?? null;
                const bouton = document.querySelector('.recette-minuteur');
                if (!bouton) return { pages, plat, minuteur: null };
                const b = bouton.getBoundingClientRect();
                return { pages, plat, minuteur: { h: Math.round(b.height), l: Math.round(b.width) } };
              });
              if (mesure.pages !== '1/2') {
                fauteRecette(`sous-découpage : pagination attendue « 1/2 » (la pire page DOIT être coupée en 2), mesurée « ${mesure.pages} »`);
              }
              if (!mesure.minuteur) {
                fauteRecette('sous-découpage : le bouton de minuteur inline (.recette-minuteur) est absent — '
                  + 'soit il n\'a pas survécu à la coupe, soit il est tombé sur une autre sous-page');
              } else if (mesure.minuteur.h < CIBLE_MIN_PX) {
                fauteRecette(`bouton de minuteur inline : ${mesure.minuteur.h} px < ${CIBLE_MIN_PX} px`);
              }
              if (mesure.plat !== PLAT_ESSAI_LONGUE) {
                fauteRecette(`sous-découpage : plat attendu « ${PLAT_ESSAI_LONGUE} », mesuré « ${mesure.plat} »`
                  + ' — ce n\'est peut-être pas la fixture qui a été mesurée');
              }
              // Round 2 (revue, point b/c) : preuve DIRECTE que l'image (désormais un `data:` URI qui
              // charge réellement, cf. `IMAGE_ESSAI_PNG`) est bien plafonnée à 140 px sur l'écran
              // RÉEL — pas seulement inférée de la pagination. `.recette-img` peut être sur l'une ou
              // l'autre sous-page selon la coupe ; on regarde l'autre si elle n'est pas sur la première.
              const lireImg = () => page.evaluate(() => {
                const img = document.querySelector('.recette-img');
                if (!img) return null;
                const r = img.getBoundingClientRect();
                return { h: Math.round(r.height), complete: img.complete, naturalHeight: img.naturalHeight };
              });
              let img = await lireImg();
              if (!img) {
                const suiv = await page.$('.recette-suiv');
                if (suiv) { await suiv.click(); await page.waitForTimeout(150); img = await lireImg(); }
              }
              if (!img) {
                fauteRecette('image de la fixture : .recette-img introuvable sur aucune des deux sous-pages');
              } else {
                if (!img.complete || img.naturalHeight === 0) {
                  fauteRecette(`image de la fixture : pas chargée (complete=${img.complete}, `
                    + `naturalHeight=${img.naturalHeight}) — le data: URI n'a pas fonctionné`);
                }
                if (img.h !== HAUTEUR_MAX_IMG_PX) {
                  fauteRecette(`image de la fixture : hauteur attendue ${HAUTEUR_MAX_IMG_PX} px (le plafond `
                    + `CSS), mesurée ${img.h} px`);
                }
                console.log(`      · image de la fixture (data: URI, chargée=${img.complete}) : `
                  + `${img.h} px (plafond ${HAUTEUR_MAX_IMG_PX} px)`);
              }
              console.log(`      · sous-découpage : pagination ${mesure.pages}, plat « ${mesure.plat} »`
                + (mesure.minuteur
                  ? ` — bouton de minuteur inline ${mesure.minuteur.l}×${mesure.minuteur.h} px`
                  : ' — bouton de minuteur inline ABSENT'));
            }
          }
        }
        console.log(ligne(vue.nom, r, jugement));
        if (!jugement.ok) fautes++;
      } catch (e) {
        console.log(`  ✗ ${vue.nom} — exception : ${e.message}`);
        fautes++;
      } finally {
        await page.close();
      }
    }
  }
  await ctx.close();
  await ctxReel.close();

  // Tâche 13 : les modes principaux, mesurés sur le salon — la pièce qui déclare tout ce qu'il
  // faut pour les six modes d'origine (sources, ouvrants, aspirateur). Tâche 10 : deux modes
  // (`previsions`, devenu `repas` à la tâche 14, et `minuteur`) se mesurent désormais en CUISINE
  // — le salon ne peut structurellement plus rendre son ancien `.prevision` (la voiture a pris sa
  // place par défaut) et ne déclare aucun minuteur. Tâche 14 : `agenda` s'y ajoute, seul mode
  // mesuré au BUREAU. `verifierModes` navigue réellement vers la bonne page pour chaque mode
  // (`pageDuMode`).
  // Tâche 18 : les mêmes pages, dans le moteur des tablettes cuisine et salon (Chrome 100, sans
  // `dvh`). Passe à part et non comme une sixième « vue » : ce n'est pas un état de l'application
  // qui est mesuré ici, c'est le MOTEUR — et la substitution de feuille de style vaut pour le
  // contexte entier, jamais pour une page au milieu des autres.
  console.log('');
  fautes += await verifierCadreSansDvh(nav, HA_URL, jetons, bundle, presentes, heureJour);
  console.log('');

  const modes = await verifierModes(nav, HA_URL, jetons, bundle);
  fautes += modes.fautes;

  console.log('');
  console.log('Budget de hauteur par mode (585 px, mesuré et non estimé) :');
  for (const b of budgetsTries(modes.budgets)) {
    console.log(`  ${String(b.mode).padEnd(11)} ${String(b.hauteur ?? '  ?').padStart(3)} px `
      + `— reste ${String(b.reste ?? '  ?').padStart(3)} px${b.atteint ? '' : '  (MODE NON ATTEINT)'}`);
  }

  console.log('');
  if (fautes) {
    console.error(`${fautes} vue(s)/mesure(s) en faute sur ${presentes.length} page(s) vérifiée(s).`);
    return 1;
  }
  console.log(`Rendu conforme sur les ${presentes.length} page(s) (${VUES.length} vues chacune) et sur les `
    + `${MODES.length} modes principaux.`);
  if (absentes.length) console.log(`Couverture partielle assumée : ${absentes.join(', ')} restent à vérifier une fois créées.`);
  return 0;
}

/** Du plus serré au plus large : le mode le plus proche du plafond est celui qu'il faut lire en
 *  premier, pas celui qui vient en premier dans la liste. */
function budgetsTries(budgets) {
  // Un budget non mesuré (`reste === null`) part en tête : c'est le plus alarmant des cas, pas le
  // plus large. Le trier comme un 0 le noierait au milieu des modes conformes.
  return [...budgets].sort((a, b) => (a.reste ?? -Infinity) - (b.reste ?? -Infinity));
}

// --- Tâche 13 : budget par mode, contraste peint, images par seconde ----------------------

// M9 (revue finale) : le motif d'origine était « le morphing (`bloc-entre`, .32s) doit s'être posé
// avant la mesure ». Cette `@keyframes` a disparu avec la branche `moteur-mouvement` — l'entrée
// d'un bloc est désormais jouée en Web Animations API (`ENTREE_MS`, 320 ms, plus jusqu'à 120 ms de
// cascade). La valeur reste donc juste, sa justification devait être réécrite.
const ATTENTE_MODE_MS = 450;   // 320 ms d'entrée + la cascade, arrondis à la trame supérieure

async function injecter(page, etats) {
  for (const [id, valeur, attributs = {}, ilYaMs = 0] of etats) {
    await page.evaluate(([i, v, a, age]) => window.__injecter(i, v, a, age),
      [id, valeur, attributs, ilYaMs]);
  }
}

const neutraliser = (page) => injecter(page, NEUTRE);

/** Redessine sans rien changer d'observable : une entité que ni `ecran.ts` ni aucune règle ne
 *  consulte. `Etat.appliquer` notifie ses abonnés, donc `dessiner()` repasse — c'est tout ce
 *  qu'on veut quand seule l'horloge a bougé. */
const forcerRedessin = (page) =>
  page.evaluate(() => window.__injecter('sensor.verificateur_de_rendu', 'ok', {}));

/** Attend que l'écran soit RÉELLEMENT vivant — ni bandeau « Hors ligne », ni voile `.muet`.
 *
 *  Ronde de correction 1, défaut trouvé à l'exécution et non supposé : changer l'heure figée
 *  (`clock.setFixedTime`) pour rendre une autre date fait bondir `Date.now()` de plusieurs mois.
 *  `Connexion` calcule son silence en `Date.now() - dernierMessage` : le bond franchit d'un coup
 *  `SEUIL_MUET_MS` (30 s), `horsLigne` passe à vrai et `dessiner()` remplace ALORS le bloc central
 *  de TOUS les modes par `rendreHorsLigne()` — il prime sur tout, c'est sa raison d'être. La
 *  surveillance ne se rétracte qu'au tic suivant de son intervalle de 5 s : entre les deux, la
 *  boucle des modes mesure un écran de panne en croyant mesurer six modes.
 *
 *  C'est une course, pas une erreur systématique — le premier jet l'avait gagnée, celui-ci l'a
 *  perdue, et les six modes sont ressortis « non atteint ». Le `marqueur` a fait son travail (une
 *  faute, jamais un chiffre faux), mais un vérificateur ne doit pas créer lui-même la condition
 *  qu'il dénonce. On attend donc explicitement que l'écran soit revenu, plutôt que d'espérer que
 *  les temporisations suffisent.
 *
 *  À noter : le bandeau (`.cap`, `.date`) est rendu dans les deux cas — les mesures de date de
 *  `pireDateRendue`/`lireBandeau` restent donc valides même pendant cette fenêtre. */
async function attendreEcranVivant(page, limiteMs = 15_000) {
  const debut = Date.now();
  while (Date.now() - debut < limiteMs) {
    const vivant = await page.evaluate(() =>
      document.querySelector('.hors-ligne') === null
      && !document.getElementById('app').classList.contains('muet')
      // `#app .corps`, jamais `#app > .corps` (2026-08-28) : l'accueil rend son corps sous
      // `.ecran`, sa racine de vue. L'écran de nuit, lui, ne rend toujours aucun `.corps` — la
      // garantie que ce sélecteur porte est intacte.
      && document.querySelector('#app .corps') !== null);
    if (vivant) return true;
    await page.waitForTimeout(500);
    await forcerRedessin(page);
  }
  return false;
}

/** Tâche 10 — change de page RÉELLEMENT (`page.goto`) quand un mode le demande (`pages`, cf.
 *  `MODES`), et seulement alors : un `goto` vers la page déjà chargée redéclencherait tout le
 *  cycle de démarrage pour rien (nouvelle connexion websocket, nouvelle attente). Après une
 *  navigation, on refait exactement ce que fait le premier `page.goto` de `verifierModes` :
 *  attendre que la page se charge et s'authentifie, refixer l'horloge (l'API Clock de Playwright
 *  n'est PAS documentée comme survivant à une navigation — la refixer ici est bon marché et évite
 *  d'en dépendre), puis attendre un écran réellement vivant (`attendreEcranVivant`) — une page qui
 *  vient de charger traverse elle aussi la fenêtre où le websocket n'a pas encore poussé son
 *  premier `get_states`, exactement comme au tout premier chargement. */
async function allerSurPage(page, HA_URL, nomPage) {
  let actuelle;
  try { actuelle = new URL(page.url()); } catch { actuelle = null; }
  if (actuelle && actuelle.pathname === `/local/wallpanel/${nomPage}.html`) return;
  await page.goto(`${HA_URL}/local/wallpanel/${nomPage}.html?essai=1`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(3500);
  await page.clock.setFixedTime(JOUR_COURT);
  await attendreEcranVivant(page);
}

export async function poserMode(page, HA_URL, mode) {
  await allerSurPage(page, HA_URL, pageDuMode(mode));
  await neutraliser(page);
  await injecter(page, mode.etats);
  // Le repas est INJECTÉ plutôt que lu dans le capteur, et l'agenda ne peut pas l'être autrement
  // (`/api/calendars/...` est une requête REST, hors de portée de `__injecter`). `demarrage.ts`
  // pose donc, sous la même garde `?essai=1`, deux points d'injection dédiés
  // (`__injecterRepas`/`__injecterEvenements`) — jamais un appel aux vrais calendriers.
  //
  // Lot 6 : le repas POURRAIT venir de `__injecter` (c'est un attribut d'entité maintenant). Il
  // reste injecté ici parce que le planning de cette maison est vide la plupart du temps : sans
  // injection, ce mode se mesurerait sur un écran sans bloc, en vert, sans rien contrôler.
  // `!== undefined` et non un simple test de vérité : `null` est une valeur SIGNIFIANTE ici (« aucun
  // repas suivant »), c'est elle qui donne la main au bloc de repli. Un `if (mode.repasInjecte)`
  // laisserait ce mode mesurer le vrai planning de l'instant du contrôle.
  if (mode.repasInjecte !== undefined) {
    await page.evaluate((suivant) => window.__injecterRepas(suivant), mode.repasInjecte);
  }
  if (mode.evenementsInjecte) {
    await page.evaluate((evs) => window.__injecterEvenements(evs), mode.evenementsInjecte);
  }
  // Tâche 17 : même raison que les deux précédents — `todo/item/list` est une commande websocket,
  // pas un état, donc hors de portée de `__injecter`. Sans ce troisième point, le bloc de repli se
  // mesurerait sur la VRAIE liste d'entretien de la maison à l'instant du contrôle (3 tâches
  // aujourd'hui, 0 demain) : un budget qui change sans qu'aucun code n'ait changé.
  for (const [entite, items] of Object.entries(mode.tachesInjectees ?? {})) {
    await page.evaluate(([e, it]) => window.__injecterTaches(e, it), [entite, items]);
  }
  // REVUE FINALE (2026-08-17) : le mode `recette` (le bloc RÉDUIT de l'accueil). Il ne s'atteint
  // par AUCUNE entité Home Assistant — il faut une recette réellement en cours, donc le MÊME chemin
  // qu'un doigt : injecter un plan, ouvrir la vue, appuyer sur « Réduire ». Jamais un raccourci vers
  // l'état interne : c'est ce parcours-là qui doit tenir dans le budget, pas un état fabriqué.
  if (mode.recetteReduite) {
    await page.evaluate((r) => window.__injecterRecette?.(r), recetteEssaiReduite());
    await page.evaluate(() => { location.hash = '#recette'; });
    await page.waitForTimeout(400);
    await page.click('.recette-reduire');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(ATTENTE_MODE_MS);
}

/** LA PIRE DATE, DÉRIVÉE — jamais affirmée. Ronde de correction 1 : le premier jet retenait
 *  « mercredi 30 septembre » sur un littéral commenté « la plus longue de l'année ». C'était faux
 *  (153,6 px), et le vrai pire cas — trouvé par balayage — est plus large de près de 5 px. Une
 *  affirmation non vérifiée déguisée en constante est exactement ce que ce projet a déjà payé
 *  plusieurs fois : le vérificateur la calcule donc lui-même, à chaque exécution.
 *
 *  Balayage de VINGT-HUIT ans de dates réelles : c'est le cycle complet du calendrier grégorien
 *  hors règles séculaires, donc toute combinaison (jour de semaine, quantième, mois) atteignable
 *  y figure au moins une fois. Les chaînes sont dédupliquées (~2 500 distinctes) et mesurées avec
 *  le style RÉEL de `.date`, dans la police RÉELLEMENT résolue par ce navigateur.
 *
 *  `Intl` plutôt qu'une copie des tables `JOURS`/`MOIS` de `rendu/bandeau.ts` : deux tables qui
 *  disent la même chose finissent par diverger. Le format est vérifié identique à celui rendu par
 *  l'application (`accord`, plus bas) — si un jour il cessait de l'être, on le saurait au lieu de
 *  mesurer des chaînes qui n'existent pas. */
async function pireDateRendue(page) {
  return page.evaluate(() => {
    const ref = document.querySelector('.date');
    if (!ref) return null;
    const style = getComputedStyle(ref);
    const sonde = document.createElement('span');
    sonde.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;`
      + `font:${style.font};letter-spacing:${style.letterSpacing};`;
    document.body.appendChild(sonde);

    const format = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const distinctes = new Map();   // chaîne → date qui la produit
    const depart = new Date(2026, 0, 1);
    for (let i = 0; i < 28 * 366; i++) {
      const d = new Date(depart.getFullYear(), depart.getMonth(), depart.getDate() + i);
      const texte = format.format(d);
      if (!distinctes.has(texte)) distinctes.set(texte, [d.getFullYear(), d.getMonth(), d.getDate()]);
    }

    let pire = null;
    for (const [texte, quand] of distinctes) {
      sonde.textContent = texte;
      const largeur = sonde.getBoundingClientRect().width;
      if (!pire || largeur > pire.largeur) pire = { texte, quand, largeur };
    }
    sonde.remove();
    return {
      texte: pire.texte, quand: pire.quand,
      largeur: Math.round(pire.largeur * 10) / 10,
      boite: ref.clientWidth,
      combinaisons: distinctes.size,
      police: style.fontFamily,
    };
  });
}

function lireBandeau(page) {
  return page.evaluate(() => {
    const cap = document.querySelector('.cap');
    if (!cap) return null;
    const h = (s) => {
      const e = document.querySelector(s);
      return e ? Math.round(e.getBoundingClientRect().height) : null;
    };
    const date = document.querySelector('.date');
    return {
      cap: Math.round(cap.getBoundingClientRect().height),
      gauche: h('.cap .gauche'), droite: h('.cap .droite'),
      phrase: h('.phrase'), pastille: h('.pastille'), date: h('.date'),
      largeurGauche: document.querySelector('.cap .gauche')
        ? Math.round(document.querySelector('.cap .gauche').getBoundingClientRect().width) : null,
      texteDate: date ? date.textContent.trim() : null,
      contenuDate: date ? Math.round(date.scrollWidth) : null,
      boiteDate: date ? Math.round(date.clientWidth) : null,
    };
  });
}

/** Mesure la hauteur du bandeau avec un texte de pastille imposé. La pastille vient de
 *  `pastilleBandeau` (`agenda.ts`), nourrie par des calendriers et une prévision météo réels :
 *  aucune injection d'entité ne peut la piloter. On substitue donc le TEXTE dans le DOM rendu et
 *  on relit la mise en page — c'est une mesure de la vraie CSS sur le vrai gabarit, pas une
 *  estimation, mais elle est bien obtenue par substitution et pas par le chemin nominal. */
async function hauteurAvecPastille(page, texte) {
  return page.evaluate((t) => {
    const pv = document.querySelector('.pastille .pv');
    if (!pv) return null;
    // Revue tâche 16, constat parqué (a) — JAMAIS `pv.textContent = …` : `.pastille .pv` est émis
    // par `lit` (`agenda.ts`), qui place DANS ce nœud le commentaire-marqueur de son `ChildPart`.
    // `textContent` l'efface, exactement le défaut critique que `animerNombres`
    // (`src/mouvement.ts`) a appris à ne plus commettre — mais ici, dans l'INSTRUMENT qui certifie
    // ce correctif : si la pastille survit à la boucle des six modes après cet appel, la mesure
    // suivante lève sur un `ChildPart` sans parent, et fait passer un écran mort pour un défaut de
    // mise en page. On mute donc les NŒUDS TEXTE existants (`.data`), qui laissent les marqueurs
    // intacts.
    //
    // Tâche 5 bis — un seul nœud texte direct ne suffit plus depuis le commit 5b15870
    // (`valeurPastille`, `rendu/bandeau.ts`) : quand la pastille est une prévision météo,
    // `.pv` contient désormais `<span class="val">28°</span>" et du soleil"` — DEUX nœuds texte
    // porteurs chacun d'un marqueur `lit` (un dans le span, un frère juste après), et le premier
    // au sens de `childNodes` est la QUEUE de la phrase, pas le tout. Un `[...pv.childNodes].find`
    // s'arrêtait sur ce premier nœud et laissait « 28° » intact devant le pire cas injecté, qui
    // se retrouvait mesuré avec un préfixe qu'il n'est pas censé porter (plus long que ce que le
    // contrôle prétend vérifier — un contrôle trop sévère, jamais trop laxiste : « 28° » + pire
    // cas ne peut que faire lever une hauteur qui aurait été acceptée pour le pire cas seul).
    // Un `TreeWalker` descend AUSSI dans le span, là où `childNodes` s'arrête à sa frontière.
    const marcheur = document.createTreeWalker(pv, NodeFilter.SHOW_TEXT);
    const noeuds = [];
    let n;
    while ((n = marcheur.nextNode())) noeuds.push(n);
    if (noeuds.length === 0) return null;   // rien de rendu par lit ici : rien à substituer

    // Le pire cas est placé dans un nœud EN DEHORS de `<span class="val">` (le préfixe
    // température coloré) — pas pour une raison de couleur (ce contrôle-ci ne lit qu'une
    // `getBoundingClientRect().height`, la couleur peinte lui est indifférente), mais pour rester
    // COHÉRENT avec `verifierPastilleLongue` ci-dessous, qui mute le même DOM par le même chemin
    // et, elle, en a réellement besoin : son scan de contraste tourne sur le DOM muté, et un pire
    // cas injecté dans le span y serait mesuré dans la couleur accent au lieu du texte normal.
    // Deux fonctions, un seul choix de nœud, pour ne pas avoir à justifier deux fois pourquoi la
    // mutation diffère d'un contrôle à l'autre. Repli sur le premier nœud si jamais tout `.pv`
    // finissait un jour dans le span (n'arrive pas aujourd'hui, cf. `valeurPastille` : la queue de
    // phrase reste toujours hors du span).
    const cible = noeuds.find((nd) => !nd.parentElement?.closest('.val')) ?? noeuds[0];

    const valeursAvant = noeuds.map((nd) => nd.data);
    noeuds.forEach((nd) => { nd.data = ''; });   // vide tout : `28°` ne doit pas coller au pire cas
    cible.data = t;
    const h = Math.round(document.querySelector('.cap').getBoundingClientRect().height);
    noeuds.forEach((nd, i) => { nd.data = valeursAvant[i]; });
    return h;
  }, texte);
}

/** Revue tâche 15, constat CRITIQUE, PUIS TÂCHE 5 (roulement de chiffres) — TROIS TEMPÉRATURES
 *  EXTÉRIEURES SUCCESSIVES, AVEC UN REDESSIN ENTRE CHACUNE.
 *
 *  Historiquement, `animerNombres` (`src/mouvement.ts`, supprimée à la tâche 5) écrivait dans le
 *  `<span data-nombre>` du bandeau — et emportait au passage le commentaire-marqueur que `lit`
 *  place à l'intérieur de ce nœud, ce qui faisait lever le rendu SUIVANT et figeait l'écran
 *  jusqu'au prochain changement de gabarit. Le moteur de mouvement (`src/mouvement/moteur.ts`,
 *  rôle `chiffre`) élimine ce risque PAR CONSTRUCTION : il ne touche jamais au texte que `lit`
 *  rend dans `<span data-mvt="chiffre:dehors">`, seulement à des clones posés à côté (le calque de
 *  fantômes). Ce contrôle reste utile pour une raison différente : la RÉCONCILIATION
 *  (`comparer()`/`jouer()`, appelée à chaque peinture) peut, elle, encore lever sur un défaut
 *  futur — c'est ce qu'il continue de traquer, avec trois valeurs distinctes et un redessin entre
 *  chacune pour garantir qu'au moins une mutation de chiffre est réellement jouée.
 *
 *  Le roulement de chiffres est gouverné par le seul garde `estMasquee()` du MOTEUR (page masquée,
 *  `prefers-reduced-motion`) — depuis la tâche 1 du chantier grammaire, il n'existe plus de niveau
 *  par rôle qui pourrait, lui, dégrader ce roulement séparément (le régulateur de cadence a été
 *  retiré, cf. `src/mouvement.ts`) — contrairement à l'ancienne `animerNombres`, qui, elle,
 *  n'était appelée qu'hors de `niveau === 'aucun'`. */
/** Assez pour laisser l'aller-retour websocket de l'injection atteindre `dessiner()`/`peindre()`
 *  et le redessin qui en découle — le roulement lui-même (`ROULEMENT_MS`, 220 ms) n'a plus besoin
 *  d'être attendu : le moteur ne fait jamais dépendre le texte affiché d'une trame d'animation. */
const ATTENTE_NOMBRE_MS = 400;

/** Ce qui est vérifié à la fin n'est pas la TRAJECTOIRE d'une animation (le moteur n'anime plus le
 *  texte, seulement `transform`/`opacity` sur des calques séparés) mais le fait que le DOM
 *  CONVERGE vers ce que `lit` a rendu — la seule chose qu'un défaut de réconciliation pourrait
 *  encore casser. On attend donc une convergence, jamais un délai fixe : le Chromium sans tête de
 *  cette machine peut rester lent ou interrompu un moment pendant ce contrôle (allers-retours
 *  `page.evaluate`, `analyserRendu` qui parcourt tout le DOM), et une attente trop courte
 *  rendrait ce contrôle intermittent pour une raison sans rapport avec le défaut surveillé. */
const LIMITE_NOMBRE_MS = 6_000;

async function attendreNombre(page, attendu, limiteMs = LIMITE_NOMBRE_MS) {
  const debut = Date.now();
  let vu = null;
  while (Date.now() - debut < limiteMs) {
    vu = await page.evaluate(() => {
      const el = document.querySelector('.dehors [data-mvt="chiffre:dehors"]');
      return el ? (el.textContent || '').trim() : null;
    });
    if (vu === attendu) return vu;
    await page.waitForTimeout(200);
    // Un redessin de plus, exactement comme l'horloge de 20 s en produit un dans la maison. Sur
    // le code SAIN, la réconciliation le digère sans lever ; sur un code fautif, c'est lui qui
    // lève. Dans les deux cas il interroge la seule chose qui compte : l'écran est-il encore
    // capable de se redessiner ?
    await forcerRedessin(page);
  }
  return vu;
}

/** Revue tâche 15, constat I3 — LA PASTILLE, AVEC SON PROPRE PIRE CAS PLUTÔT QUE LE CALENDRIER DU
 *  JOUR. Le contrôle de troncature sur `.pastille .pv` était décoratif : son texte vient des
 *  calendriers de Maxime, et la vérification passait simplement parce qu'il n'y avait aucun
 *  événement cette nuit-là. On injecte donc le pire résumé RÉELLEMENT relevé (`RESUME_LONG`),
 *  par substitution dans le DOM rendu — même technique, déjà documentée, que
 *  `hauteurAvecPastille` : `pastilleBandeau` (`agenda.ts`) est nourrie par des calendriers et une
 *  prévision météo réels, qu'aucune injection d'entité ne peut piloter.
 *
 *  Ce qui est EXIGÉ ici ne dépend plus du calendrier :
 *   1. la hauteur du bandeau ne bouge pas — l'invariance de la tâche 8, sous le pire texte ;
 *   2. aucune troncature DURE n'apparaît (le clamp de la pastille est une borne nommée, cf.
 *      `CLAMPS_VOULUS` ; si un autre élément se met à couper du texte, il reste fautif).
 *  Ce qui est RAPPORTÉ sans être exigé : le fait que la pastille soit effectivement bornée à deux
 *  lignes sur ce texte — l'exemption reste visible à chaque exécution, jamais silencieuse. */
async function verifierPastilleLongue(page) {
  const mesure = await page.evaluate((texte) => {
    const pv = document.querySelector('.pastille .pv');
    const cap = document.querySelector('.cap');
    if (!pv || !cap) return null;
    // Même correctif que `hauteurAvecPastille` ci-dessus (revue tâche 16, constat parqué (a), puis
    // tâche 5 bis) : tous les nœuds texte descendants de `.pv` (pas seulement ses enfants directs
    // — depuis le commit 5b15870, une prévision météo met `28°` dans un `<span class="val">` et
    // la queue de phrase dans un nœud frère, cf. le commentaire détaillé dans `hauteurAvecPastille`)
    // sont mutés en `.data`, jamais remplacés via `pv.textContent`, pour ne pas éjecter les
    // marqueurs de `lit`. `avant` porte maintenant un TABLEAU (un par nœud), plus une seule
    // chaîne, pour que la restauration plus bas puisse rendre exactement ce qu'elle a trouvé.
    const marcheur = document.createTreeWalker(pv, NodeFilter.SHOW_TEXT);
    const noeuds = [];
    let n;
    while ((n = marcheur.nextNode())) noeuds.push(n);
    if (noeuds.length === 0) return null;

    // Hors du span accent, comme `hauteurAvecPastille` : le pire cas doit s'afficher en couleur
    // de texte normale, pas en couleur accent.
    const cible = noeuds.find((nd) => !nd.parentElement?.closest('.val')) ?? noeuds[0];

    const avant = noeuds.map((nd) => nd.data);
    const hauteurCourte = Math.round(cap.getBoundingClientRect().height);
    noeuds.forEach((nd) => { nd.data = ''; });   // vide tout : `28°` ne doit pas coller au pire cas
    cible.data = texte;
    return { avant, hauteurCourte, hauteurLongue: Math.round(cap.getBoundingClientRect().height) };
  }, RESUME_LONG);

  if (mesure === null) {
    // `pastilleBandeau` rend `null` quand ni anniversaire, ni rendez-vous proche, ni prévision du
    // lendemain — c'est-à-dire quand `weather.maison` est indisponible, un état NORMAL sur cette
    // installation (cf. `rendu/bandeau.ts`). En faire une faute recréerait très exactement le
    // rouge aléatoire que ce constat existe pour supprimer. On le dit, on ne le sanctionne pas.
    console.log('  · pastille, pire résumé injecté — aucune pastille à l\'écran '
      + '(weather.maison indisponible et aucun événement) : contrôle non exercé cette fois-ci.');
    return 0;
  }

  const r = await evaluerPage(page, PARAMS_ANALYSE);
  // Le texte substitué est rendu à la place de celui de `lit` : on le remet avant de rendre la
  // main, comme `hauteurAvecPastille`. Le prochain `dessiner()` le réécrirait de toute façon.
  // Même correctif (a) : mutation des nœuds texte, jamais `pv.textContent`. `mesure.avant` est
  // désormais un tableau (un par nœud texte descendant, cf. plus haut) — on le réapplique dans le
  // même ordre de parcours que celui qui l'a produit (même `TreeWalker`, même DOM entre les deux
  // appels : rien n'a redessiné `.pastille` entre-temps).
  await page.evaluate((valeurs) => {
    const pv = document.querySelector('.pastille .pv');
    if (!pv) return;
    const marcheur = document.createTreeWalker(pv, NodeFilter.SHOW_TEXT);
    const noeuds = [];
    let n;
    while ((n = marcheur.nextNode())) noeuds.push(n);
    noeuds.forEach((nd, i) => { nd.data = valeurs[i] ?? nd.data; });
  }, mesure.avant);

  const bornee = (r.clampes ?? []).some((c) => String(c.element).includes('pv'));
  const problemes = [];
  if (mesure.hauteurLongue > mesure.hauteurCourte) {
    problemes.push(`le bandeau regonfle de ${mesure.hauteurCourte} px à ${mesure.hauteurLongue} px `
      + '— l\'invariance de hauteur de la tâche 8 tombe sur un résumé de calendrier ordinaire');
  }
  if (r.tronques.length) {
    problemes.push(`troncature DURE ailleurs : ${r.tronques.map((t) => `« ${t.texte} »`).join(', ')}`);
  }
  const ok = problemes.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} pastille, pire résumé RÉEL injecté (${RESUME_LONG.length} car., `
    + `« ${RESUME_LONG} ») — bandeau ${mesure.hauteurCourte} px → ${mesure.hauteurLongue} px, `
    + `${bornee ? 'borné à 2 lignes (voulu, ellipse visible à l\'écran)' : 'tient sans être borné'}`
    + `${ok ? '' : ` — ${problemes.join(' ; ')}`}`);
  return ok ? 0 : 1;
}

/** Ronde de correction 1 (coordinateur, tâche 14) : preuve, dans un vrai navigateur, que le
 *  rendez-vous affiché EN GRAND dans le bloc central du mode `agenda` (bureau) n'apparaît PAS
 *  une seconde fois dans la pastille du bandeau. `masquerRdv` (`pastilleBandeau`, `agenda.ts`,
 *  câblé par `demarrage.ts` sur `piece.blocDefaut === 'agenda'`) doit avoir fait céder la
 *  pastille sur cette seule donnée — jamais l'anniversaire du jour, que ce contrôle ne touche pas
 *  (`rendreProchainRdv` ne le montre jamais, rien à dédoublonner de ce côté, cf. son docstring).
 *
 *  Ce défaut a été trouvé DANS CETTE MÊME TÂCHE : le premier jet plaçait `evenementsInjecte`
 *  (mode `agenda`, `MODES`) à l'intérieur de la fenêtre de 3 h de la pastille (`FENETRE_MS`) sans
 *  qu'aucune assertion ne regarde `.pastille` — la fonctionnalité était donc « prouvée » exactement
 *  dans l'état qui contient le défaut. Ce contrôle ferme cet angle mort : le résumé injecté est
 *  cherché littéralement dans `.pastille .pv`, pas seulement dans le budget de hauteur. */
/** Tâche 17 — LE MÊME ANGLE MORT, DE L'AUTRE CÔTÉ DE L'ÉCRAN. `verifierPastilleSansRdv`
 *  ci-dessous existe parce qu'un budget de hauteur vert ne dit rien d'une donnée écrite deux fois.
 *  Le bloc « Entretien » pose exactement le même risque, et sur un voisin plus proche encore : la
 *  ligne de synthèse, à trois pixels sous lui, annonce « 3 tâches d'entretien » tant que
 *  `masquerEntretien` (`rendu/corps.ts`) n'est pas posé. Un `masquerEntretien` câblé à l'envers
 *  (ou plus posé du tout) ne changerait NI la hauteur, NI le contraste, NI aucune cible tactile :
 *  ce contrôle est le seul qui puisse le voir.
 *
 *  Vérifie TROIS choses, jamais deux : sa propre prémisse (ci-dessous), le bloc EST bien celui de
 *  l'entretien (sinon on validerait le masquage sur un écran qui n'affiche pas ce bloc — le cas où
 *  il est fautif), et l'écart correspondant a bien disparu de `.synthese`.
 *
 *  Ronde de correction (relecture, défaut D3) : CE CONTRÔLE ÉTAIT TAUTOLOGIQUE. Les deux seuls
 *  modes qui l'appellent laissaient `todo.maintenance` à `'0'` (`NEUTRE`) ; l'entrée de synthèse
 *  déclarant `operateur: '>' valeur: 0` (`ecran.ts`), l'écart ne pouvait STRUCTURELLEMENT pas
 *  apparaître, et l'assertion « la synthèse ne parle pas d'entretien » ressortait verte que
 *  `masquerEntretien` marche, soit retiré, ou soit câblé à l'envers — précisément l'angle mort que
 *  la docstring ci-dessus revendiquait d'être seule à voir. Corrigé en injectant `'3'` dans les
 *  deux modes ; et pour qu'un futur nettoyage de `MODES` ne puisse pas rendre ce contrôle
 *  tautologique À NOUVEAU en silence, sa prémisse est désormais VÉRIFIÉE ICI, à partir du mode
 *  lui-même : sans compteur d'entretien strictement positif à l'écran, il n'y a rien à masquer,
 *  donc rien à prouver — et c'est une faute, pas un succès. */
async function verifierSyntheseSansEntretien(page, mode) {
  const injecte = (mode.etats ?? []).find(([id]) => id === 'todo.maintenance');
  if (!(Number(injecte?.[1] ?? 0) > 0)) {
    return { ok: false, detail: 'contrôle sans objet : `todo.maintenance` n\'est pas injecté > 0 par '
      + `le mode « ${mode.nom} », l'écart de synthèse ne peut pas apparaître et le masquage ne prouve rien` };
  }
  const vu = await page.evaluate(() => ({
    titre: document.querySelector('.mode-bloc .t')?.textContent?.trim() ?? null,
    ecart: document.querySelector('.synthese .ecart')?.textContent ?? '',
  }));
  if (!vu.titre?.startsWith('Entretien')) {
    return { ok: false, detail: `le bloc central n'est pas celui de l'entretien (« ${vu.titre} »)` };
  }
  const ok = !vu.ecart.includes('entretien');
  return {
    ok,
    detail: ok ? '' : `la synthèse répète les tâches déjà détaillées par le bloc central (« ${vu.ecart} »)`,
  };
}

async function verifierPastilleSansRdv(page, resume) {
  if (!resume) return { ok: true, detail: '' };
  const pv = await page.evaluate(() => document.querySelector('.pastille .pv')?.textContent ?? null);
  const ok = pv === null || !pv.includes(resume);
  return {
    ok,
    detail: ok ? '' : `la pastille répète le rendez-vous déjà affiché dans le bloc central (« ${pv} »)`,
  };
}

/** Revue tâche 15, constat I1 — LE RAIL AVANCE-T-IL VRAIMENT ? Le spec l'exige deux fois (« un
 *  rail fin qui AVANCE RÉELLEMENT, décompté côté navigateur entre deux mises à jour de
 *  `media_position` », puis « avance en continu ») et l'implémentation calculait `position /
 *  duree` au moment du rendu, sans jamais lire `media_position_updated_at` : le rail ne bougeait
 *  qu'au redessin, à partir d'une position que Home Assistant ne republie pas. Sans affiche — le
 *  cas YouTube, le plus fréquent ici — c'est pourtant lui, et lui seul, qui donne sa vie au bloc.
 *
 *  Deux mesures, et la seconde compte autant que la première :
 *   1. en lecture, `--progression` DOIT augmenter sans qu'aucun état ne soit poussé ;
 *   2. en pause, il DOIT se figer — un rail qui continue de courir pendant une pause ment.
 *  Aucune injection pendant l'échantillonnage : la position ne peut changer que si le navigateur
 *  la décompte.
 *
 *  ON ÉCHANTILLONNE, ON NE COMPARE PAS DEUX BORNES — défaut trouvé à l'exécution, pas supposé.
 *  Une simple différence début/fin est RACÉE : un redessin (l'horloge de 20 s, ou un état poussé
 *  par la vraie maison, qui continue de vivre pendant la mesure) recalcule l'ancre à partir de
 *  l'horloge MURALE, que ce contrôle fige par `setFixedTime` — le rail repart alors de sa
 *  position de base, et une lecture finale tombée juste après ressort LÉGÈREMENT INFÉRIEURE à la
 *  lecture initiale (observé : 0,49516 → 0,49436). Ce qu'on exige est donc « il monte quelque
 *  part dans la fenêtre » (au moins un couple consécutif croissant), et son inverse strict en
 *  pause (aucun). La VITESSE, elle, est déjà verrouillée à la seconde près, et sans course
 *  possible, par `tests/progression.test.ts`. */
const FENETRE_RAIL_MS = 4_500;   // ~4 tics du rail (PAS_PROGRESSION_MS = 1 s) : de la marge si un redessin en avale un
const ECHANTILLONS_RAIL = 12;

async function echantillonnerRail(page) {
  const valeurs = [];
  for (let i = 0; i < ECHANTILLONS_RAIL; i++) {
    valeurs.push(await page.evaluate(() => {
      const el = document.querySelector('.media');
      return el ? Number.parseFloat(el.style.getPropertyValue('--progression')) : NaN;
    }));
    if (i < ECHANTILLONS_RAIL - 1) await page.waitForTimeout(FENETRE_RAIL_MS / ECHANTILLONS_RAIL);
  }
  return valeurs;
}

const croissances = (v) => v.filter((x, i) => i > 0 && x > v[i - 1]).length;

async function verifierRailProgression(page, HA_URL, modeMedia) {
  await poserMode(page, HA_URL, modeMedia);
  const enLecture = await echantillonnerRail(page);
  if (!enLecture.every(Number.isFinite)) {
    console.log('  ✗ rail de progression — aucune carte média à l\'écran, ou `--progression` absente');
    return 1;
  }

  // Mise en pause : le lecteur QUI PORTE la progression passe à `paused`, mêmes attributs.
  await injecter(page, [['media_player.ytube_music_player', 'paused', modeMedia.etats[0][2]]]);
  await page.waitForTimeout(ATTENTE_MODE_MS);
  const enPause = await echantillonnerRail(page);

  const monte = croissances(enLecture);
  const monteEnPause = croissances(enPause);
  const problemes = [];
  if (monte === 0) {
    problemes.push(`en lecture, le rail N'AVANCE JAMAIS sur ${ECHANTILLONS_RAIL} relevés en `
      + `${FENETRE_RAIL_MS} ms, sans aucune injection : ${enLecture.join(' → ')}`);
  }
  if (monteEnPause > 0) {
    problemes.push(`en PAUSE, le rail continue d'avancer (${monteEnPause} fois) : ${enPause.join(' → ')}`);
  }
  const ok = problemes.length === 0;
  const arrondi = (v) => Math.round(v * 1e5) / 1e5;
  console.log(`  ${ok ? '✓' : '✗'} rail de progression — en lecture ${monte}/${ECHANTILLONS_RAIL - 1} `
    + `relevés consécutifs en hausse (${arrondi(Math.min(...enLecture))} → `
    + `${arrondi(Math.max(...enLecture))} sur ${FENETRE_RAIL_MS} ms, sans aucune injection) ; `
    + `en pause ${monteEnPause}/${ECHANTILLONS_RAIL - 1} (figé à ${arrondi(enPause[0])})`
    + `${ok ? '' : ` — ${problemes.join(' ; ')}`}`);
  return ok ? 0 : 1;
}

const FENETRE_DECOMPTE_MS = 4_500;   // même fenêtre que `verifierRailProgression`, même raison
const ECHANTILLONS_DECOMPTE = 12;

/** `mm:ss` ou `h:mm:ss` (`formaterRestant`, `src/minuteur.ts`) → secondes, pour comparer
 *  numériquement plutôt que lexicographiquement (une comparaison de chaînes ne trahirait un
 *  passage d'heure — ex. `59:58` vs `1:00:02` — que par accident). `NaN` sur toute valeur
 *  inattendue, jamais une exception : un relevé illisible doit rater EXPLICITEMENT la preuve de
 *  décroissance, pas planter le contrôle. */
function parseMmSs(txt) {
  const m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(String(txt ?? '').trim());
  if (!m) return NaN;
  return m[3] !== undefined
    ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    : Number(m[1]) * 60 + Number(m[2]);
}

const decroissances = (v) => v.filter((x, i) => i > 0 && x < v[i - 1]).length;

/** Nombre de baisses EXIGÉES sur la fenêtre. Sur horloge réelle, le tic descend une fois par
 *  seconde (`PAS_PROGRESSION_MS`, `demarrage.ts`) : une fenêtre de 4,5 s traverse quatre frontières
 *  de seconde, et les 12 relevés (un toutes les 375 ms) ne peuvent en manquer aucune. Exiger 3
 *  laisse donc une frontière entière de marge — assez pour absorber un ordonnancement malchanceux,
 *  trop peu pour laisser passer un tic mort (qui en produit zéro). */
const BAISSES_MIN_DECOMPTE = 3;

/** Tâche 15 — CE CONTRÔLE A SA PROPRE PAGE, À HORLOGE RÉELLE, ET IL EXIGE LA MONOTONIE.
 *
 *  Ce qu'il mesurait avant, et pourquoi c'était un tirage au sort (diagnostic d'intermittence du
 *  2026-08-03, `rapports/diagnostic-intermittence.md`). Il partageait la page des MODES, dont
 *  l'horloge est FIGÉE (`page.clock.setFixedTime`, indispensable au budget de hauteur : il faut la
 *  vue « jour » quelle que soit l'heure de lancement). Or le websocket, lui, reste RÉEL : chaque
 *  état poussé par la vraie maison — température, présence, n'importe quoi — rappelle `dessiner()`,
 *  qui RÉ-ANCRE `ancresMinuteurs` sur `restantPublie(e, Date.now())`. Sur une horloge figée, ce
 *  ré-ancrage recalcule exactement la valeur de DÉPART et efface d'un coup ce que le tic monotone
 *  (`performance.now`, jamais figé) avait fait descendre. Mesuré au `MutationObserver` : le tic
 *  écrivait bien 15 fois en 15 s, à la seconde près, mais les VALEURS faisaient des dents de scie
 *  (12:33, 12:32, 12:34, 12:34, 12:33, 12:34…) — 4 baisses en 15 s au lieu de 15. Sur une fenêtre
 *  de 4,5 s, l'espérance tombe à ~1,2 baisse : cinq exécutions réelles ont rendu 2, 2, 1, 1 et 1
 *  baisse sur 11 couples. Le contrôle passait donc en permanence à UN ÉVÉNEMENT de l'échec, et
 *  échouait pour de bon dès que le trafic de la maison se densifiait — « décompte figé, 0/11 »,
 *  sur un produit parfaitement sain. Un seuil dans le bruit ne mesure rien : il tire à pile ou
 *  face.
 *
 *  Le remède n'est pas une tolérance plus large, c'est de SUPPRIMER LA CAUSE. Une page dédiée,
 *  sans aucun trucage d'horloge (même patron que `ctxReel` dans `verifierPagesReelles`, et pour
 *  la même raison : une horloge truquée contamine ce qu'on croit mesurer) : le ré-ancrage y
 *  recalcule une valeur À JOUR, donc jamais supérieure à la précédente, exactement comme sur une
 *  tablette. Mesuré dans ces conditions : 10 baisses en 12 s, aucune remontée, monotone. On peut
 *  alors exiger ce que le produit doit vraiment tenir — **aucune remontée, et au moins
 *  `BAISSES_MIN_DECOMPTE` baisses** — au lieu de mendier « au moins une, quelque part ».
 *
 *  Prix payé, assumé : les échéances doivent être ancrées sur l'horloge du NAVIGATEUR
 *  (`ECHEANCES_MINUTEURS_MS`, calculées dans la page), et la vue de nuit devient atteignable — un
 *  contrôle lancé entre 23 h et 5 h tombe sur `rendreNuit`, qui n'affiche aucun minuteur. On
 *  réveille alors l'écran comme un doigt le ferait (`reveiller`, `demarrage.ts`), ce qui exerce au
 *  passage le chemin « minuteur en cours sur écran réveillé » (tâche 9). Le tic d'un décompte ne
 *  dépend d'aucune des mesures figées des MODES : rien ne l'obligeait à vivre sur leur page.
 *
 *  Le minuteur EN PAUSE (`data-minuteur="2"`) reste à un contrôle STRICT (zéro variation) :
 *  `restantAncre` ignore l'horloge pour une ancre figée (`a.fige`), donc un ré-ancrage relit la
 *  MÊME `remaining` HA à chaque fois — rien ne peut légitimement le faire bouger. */
async function verifierDecompteMinuteur(nav, HA_URL, jetons, bundle) {
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  await ctx.addInitScript((j) => { localStorage.setItem('hassTokens', JSON.stringify(j)); }, jetons);
  await poserInterceptions(ctx, bundle);
  const page = await ctx.newPage();
  const erreursPage = [];
  page.on('pageerror', (err) => erreursPage.push(err.message));

  try {
    await page.goto(`${HA_URL}/local/wallpanel/cuisine.html?essai=1`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(3500);

    // LE RÉVEIL D'ABORD, `attendreEcranVivant` ENSUITE — l'ordre inverse est un faux échec
    // nocturne garanti, et c'est l'ordre qui avait été écrit en premier : `attendreEcranVivant`
    // exige `#app .corps`, que l'écran de nuit ne rend PAS (il rend `.nuit`, cf. `rendreNuit`).
    // Entre 23 h et 5 h, il aurait donc bouclé quinze secondes puis déclaré l'écran mort, sur une
    // cuisine parfaitement vivante. Trouvé en vérifiant ce chemin dans un vrai navigateur plutôt
    // qu'en le supposant.
    //
    // Entre 23 h et 5 h, l'écran de nuit est le rendu NORMAL (`momentDuJour` ne lit que l'heure,
    // jamais `sun.sun`, dans cette plage) et ne porte aucun minuteur : on le réveille exactement
    // comme un doigt (`@pointerdown` sur `.nuit`, cf. `reveiller` dans `demarrage.ts`), puis on
    // mesure sur l'écran réveillé — les 45 s de `RETOUR_MS` couvrent largement les ~6 s de relevé,
    // et le chemin « minuteur en cours sur écran réveillé » (tâche 9) est exercé au passage.
    const reveille = await page.evaluate(() => {
      const nuit = document.querySelector('.nuit');
      if (!nuit) return false;
      nuit.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      return true;
    });
    if (reveille) await page.waitForTimeout(ATTENTE_MODE_MS);

    if (!await attendreEcranVivant(page)) {
      console.log('  ✗ décompte minuteur — l\'écran de la cuisine ne devient pas vivant : rien à mesurer');
      return 1;
    }

    await neutraliser(page);
    // Échéances ancrées DANS LA PAGE, sur son propre `Date.now()` : c'est la seule horloge que
    // `restantPublie` (`src/minuteur.ts`) sait lire, et elle n'est pas truquée ici.
    await page.evaluate((decalages) => {
      const maintenant = Date.now();
      window.__injecter('timer.cuisine', 'active',
        { finishes_at: new Date(maintenant + decalages[0]).toISOString() });
      window.__injecter('input_text.minuteur_cuisine_nom', 'Pâtes', {});
      window.__injecter('timer.cuisine_2', 'active',
        { finishes_at: new Date(maintenant + decalages[1]).toISOString() });
      window.__injecter('input_text.minuteur_cuisine_2_nom', 'Four', {});
      window.__injecter('timer.cuisine_3', 'paused', { remaining: '0:03:20' });
      window.__injecter('input_text.minuteur_cuisine_3_nom', '', {});
    }, ECHEANCES_MINUTEURS_MS);
    await page.waitForTimeout(ATTENTE_MODE_MS);

    // Même discipline que le `marqueur` des MODES : on prouve qu'on mesure la bonne chose avant de
    // publier un chiffre sous son nom. Sans ça, un écran resté sur un autre mode rendrait
    // `$eval` en exception, donc « exception pendant la mesure » plutôt que le vrai diagnostic.
    if (!await page.evaluate(() => document.querySelector('.mn-temps[data-minuteur="0"]') !== null)) {
      console.log('  ✗ décompte minuteur — la liste des minuteurs n\'est pas rendue en cuisine '
        + '(mode non atteint) : aucun décompte à mesurer');
      return 1;
    }

    const brutMarche = [];
    const brutPause = [];
    for (let i = 0; i < ECHANTILLONS_DECOMPTE; i++) {
      brutMarche.push(await page.$eval('.mn-temps[data-minuteur="0"]', (n) => n.textContent));
      brutPause.push(await page.$eval('.mn-temps[data-minuteur="2"]', (n) => n.textContent));
      if (i < ECHANTILLONS_DECOMPTE - 1) await page.waitForTimeout(FENETRE_DECOMPTE_MS / ECHANTILLONS_DECOMPTE);
    }
    const marche = brutMarche.map(parseMmSs);

    const baisse = decroissances(marche);
    const remontees = marche.filter((x, i) => i > 0 && x > marche[i - 1]).length;
    const pauseBouge = brutPause.some((t) => t !== brutPause[0]);

    const problemes = [];
    if (marche.some((x) => Number.isNaN(x))) {
      problemes.push(`relevé illisible (format inattendu) parmi : ${brutMarche.join(' → ')}`);
    } else {
      // La monotonie d'abord : une remontée sur une horloge réelle n'est plus du bruit
      // d'échantillonnage, c'est un décompte qui REVIENT EN ARRIÈRE — un défaut à part entière.
      if (remontees > 0) {
        problemes.push(`décompte qui REMONTE ${remontees} fois sur une horloge réelle : `
          + `${brutMarche.join(' → ')}`);
      }
      if (baisse < BAISSES_MIN_DECOMPTE) {
        problemes.push(`décompte trop lent ou arrêté : ${baisse} baisse(s) sur `
          + `${ECHANTILLONS_DECOMPTE - 1} couples en ${FENETRE_DECOMPTE_MS} ms, `
          + `${BAISSES_MIN_DECOMPTE} exigées (le tic vaut 1 s) : ${brutMarche.join(' → ')}`);
      }
    }
    if (pauseBouge) {
      problemes.push(`minuteur en pause qui bouge : ${brutPause.join(' → ')}`);
    }
    if (erreursPage.length) {
      problemes.push(`erreur(s) de page : ${erreursPage.join(' | ')}`);
    }
    const ok = problemes.length === 0;
    console.log(`  ${ok ? '✓' : '✗'} décompte minuteur (page dédiée, horloge RÉELLE`
      + `${reveille ? ', écran de nuit réveillé' : ''}) — ${baisse} baisse(s) et ${remontees} `
      + `remontée(s) sur ${ECHANTILLONS_DECOMPTE - 1} couples `
      + `(${brutMarche[0]} → ${brutMarche[brutMarche.length - 1]} sur ${FENETRE_DECOMPTE_MS} ms, `
      + `sans aucune injection ; exigé : 0 remontée et ≥ ${BAISSES_MIN_DECOMPTE} baisses) ; `
      + `en pause figé à « ${brutPause[0]} »${ok ? '' : ` — ${problemes.join(' ; ')}`}`);
    return ok ? 0 : 1;
  } catch (e) {
    console.log(`  ✗ décompte minuteur — exception : ${e.message}`);
    return 1;
  } finally {
    await ctx.close();
  }
}

async function verifierNombresAnimes(page) {
  let leve = null;
  for (const t of [18, 19, 20]) {
    try {
      await injecter(page, [['weather.maison', 'cloudy', { temperature: t }]]);
    } catch (e) {
      leve = `${t}° : ${String(e.message).split('\n')[0]}`;
      break;
    }
    await page.waitForTimeout(ATTENTE_NOMBRE_MS);
  }
  let affiche = null;
  if (!leve) {
    try {
      affiche = await attendreNombre(page, '20°');
    } catch (e) {
      // Un `forcerRedessin` qui lève pendant l'attente est le MÊME défaut, une trame plus tard :
      // le rendu est cassé pour de bon.
      leve = `redessin forcé : ${String(e.message).split('\n')[0]}`;
    }
  }

  const problemes = [];
  if (leve) problemes.push(`le redessin a LEVÉ — ${leve}`);
  else if (affiche !== '20°') problemes.push(`le bandeau affiche « ${affiche} » au lieu de « 20° »`);
  // Tâche 15 : ce que ce contrôle protège vraiment — le redessin qui lève et fige l'écran pour de
  // bon — reste exercé quel que soit le niveau de mouvement : les trois injections et leurs
  // redessins ont bien lieu, et le rôle `chiffre` du moteur (tâche 5) est gouverné par SON SEUL
  // garde (`estMasquee()`, page masquée/`prefers-reduced-motion`) — contrairement à l'ancienne
  // `animerNombres`, qu'un niveau `aucun` coupait. Depuis la tâche 1 du chantier grammaire, il
  // n'existe plus de dégradation par mesure de cadence du tout : le niveau est fixé une fois pour
  // toutes au montage (`niveauDemande`, `src/mouvement.ts`) — rien à rapporter ici, il n'y a plus
  // rien qui bouge en cours de route.
  const ok = problemes.length === 0;
  console.log(`  ${ok ? '✓' : '✗'} chiffres animés — 3 températures extérieures successives, un `
    + `redessin entre chaque`
    + `${ok ? ` : le bandeau suit jusqu'à « ${affiche} », aucun rendu en échec` : ` — ${problemes.join(' ; ')}`}`);
  return ok ? 0 : 1;
}

async function verifierModes(nav, HA_URL, jetons, bundle) {
  console.log('');
  console.log(`${MODES.length} modes principaux — budget de hauteur, cibles tactiles, contraste `
    + 'peint (salon, sauf `repas`/`entretien`/`minuteur` : cuisine, `agenda`/`entretien-bureau` : '
    + 'bureau, cf. `pageDuMode`) :');

  // Contexte SÉPARÉ, jamais partagé avec les vues précédentes : même raison que `ctxReel`
  // (ronde de correction 1 plus haut) — l'horloge d'une page se révèle capable de fuir sur les
  // suivantes du même contexte.
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  await ctx.addInitScript((j) => { localStorage.setItem('hassTokens', JSON.stringify(j)); }, jetons);
  await poserInterceptions(ctx, bundle);

  const page = await ctx.newPage();
  const erreursPage = [];
  page.on('pageerror', (err) => erreursPage.push(err.message));

  // `setFixedTime` et NON `clock.install()` : `install` remplace aussi `requestAnimationFrame` et
  // `performance.now`, les deux instruments avec lesquels on mesure ici les images par seconde —
  // et les deux que `mouvement.ts` utilise en production. `setFixedTime` ne fige que `Date`, ce
  // qui suffit à obtenir la vue « jour » à n'importe quelle heure de lancement du contrôle
  // (`momentDuJour`, `contexte.ts`, bascule sur l'écran de nuit de 23 h à 5 h).
  //
  // ⚠️ AVERTISSEMENT À QUI AJOUTERA UN `setFixedTime` ICI (ronde de correction 2). Une version
  // antérieure de ce commentaire affirmait que figer l'heure « neutralise au passage la
  // surveillance du silence websocket ». C'est vrai du PREMIER figement seulement — l'heure ne
  // bouge plus, donc `Date.now() - dernierMessage` reste nul. Ce n'est PAS vrai d'un CHANGEMENT
  // d'heure figée : passer du 7 mai au 13 septembre fait bondir `Date.now()` de quatre mois,
  // `Connexion` y lit un silence de quatre mois, franchit `SEUIL_MUET_MS` (30 s) et `dessiner()`
  // remplace le bloc central de TOUS les modes par `rendreHorsLigne()`, qui prime sur tout.
  // La surveillance ne se rétracte qu'au tic suivant de son intervalle de 5 s.
  //
  // C'est exactement cette croyance fausse qui a fait mesurer six modes sur un écran de panne
  // (cf. `attendreEcranVivant` plus bas, qu'il faut appeler après TOUT changement d'heure figée).
  // Le garde-fou qui a sauvé la mesure est le `marqueur` par mode : sous `horsLigne`, aucun des
  // quatre marqueurs n'existe, donc la mesure ressort en faute « mode non atteint » — jamais en
  // vert, jamais en chiffre faux publié sous le nom d'un mode.
  // `JOUR_COURT` est désormais au niveau du MODULE (tâche 10, pas seulement local à cette
  // fonction) : les `finishes_at` des minuteurs de `MODES` s'y ancrent, cf. son commentaire.
  await page.clock.setFixedTime(JOUR_COURT);

  let fautes = 0;
  const budgets = [];
  let echantillons = [];
  const cadences = [];
  let bandeau = null;

  try {
    await page.goto(`${HA_URL}/local/wallpanel/salon.html?essai=1`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(3500);

    const injecteurPresent = await page.evaluate(() => typeof window.__injecter === 'function');
    if (!injecteurPresent) {
      console.error('  ✗ `window.__injecter` absent : le bundle servi ne contient pas le point '
        + "d'injection de la tâche 13 (`?essai=1`, `demarrage.ts`). Aucun mode n'est mesurable.");
      await ctx.close();
      return { fautes: 1, budgets, echantillons, cadences, bandeau };
    }

    // --- Point de mesure 2 : `.date` peut-elle faire regonfler le bandeau ? ---
    // Si elle passe à la ligne, l'invariance de hauteur du bandeau — obtenue à la tâche 8 en
    // donnant la phrase à la colonne gauche — tombe. On la mesure, on ne l'estime pas : la date
    // la plus large est DÉRIVÉE par balayage (`pireDateRendue`) puis rendue par le chemin
    // nominal, via l'horloge, exactement comme un vrai jour de l'année.
    await neutraliser(page);
    await forcerRedessin(page);
    await page.waitForTimeout(ATTENTE_MODE_MS);
    const court = await lireBandeau(page);

    const pireDate = await pireDateRendue(page);
    const [an, mois, quantieme] = pireDate.quand;
    await page.clock.setFixedTime(new Date(an, mois, quantieme, 14, 0, 0));
    await forcerRedessin(page);
    await page.waitForTimeout(ATTENTE_MODE_MS);
    const long = await lireBandeau(page);
    // Le balayage passe par `Intl`, l'application par ses propres tables `JOURS`/`MOIS`
    // (`rendu/bandeau.ts`). Si les deux cessaient de s'accorder, on mesurerait des chaînes qui
    // n'existent pas — donc on le vérifie plutôt que de l'espérer.
    const accord = long?.texteDate === pireDate.texte;
    console.log(`  ${accord ? '·' : '✗'} pire date DÉRIVÉE sur ${pireDate.combinaisons} combinaisons `
      + `(28 ans de dates réelles) : « ${pireDate.texte} », ${pireDate.largeur} px dans `
      + `${pireDate.boite} px — marge ${Math.round((pireDate.boite - pireDate.largeur) * 10) / 10} px`
      + `${accord ? '' : ` — DÉSACCORD : l'application rend « ${long?.texteDate} », pas la chaîne mesurée`}`);
    if (!accord) fautes++;

    // --- Point de mesure 3 : le bandeau quand `.phrase` est absente ---
    // `sensor.capteur_humain_temperature` (le capteur intérieur du salon, `ecran.ts`) tombe
    // régulièrement en `unavailable` sur cette installation : `.phrase` disparaît alors et la
    // colonne gauche cesse de dominer la hauteur du bandeau, qui redevient dépendante du nombre
    // de lignes de la pastille en face. Dette ancienne, pas une régression de cette tâche : on la
    // mesure et on la rapporte, on ne la corrige pas ici.
    await injecter(page, [['sensor.capteur_humain_temperature', 'unavailable', {}]]);
    await page.waitForTimeout(ATTENTE_MODE_MS);
    const sansPhrase = await lireBandeau(page);
    const sansPhraseCourte = await hauteurAvecPastille(page, 'Demain');
    const sansPhraseLongue = await hauteurAvecPastille(page, '29° et des passages nuageux en fin de journée');
    await injecter(page, [['sensor.capteur_humain_temperature', '21.4', {}]]);
    await page.clock.setFixedTime(JOUR_COURT);   // on repart de la date courte pour les six modes
    await forcerRedessin(page);
    await page.waitForTimeout(ATTENTE_MODE_MS);
    const avecPhraseCourte = await hauteurAvecPastille(page, 'Demain');

    const avecPhraseLongue = await hauteurAvecPastille(page, '29° et des passages nuageux en fin de journée');

    bandeau = { pireDate, court, long, sansPhrase, sansPhraseCourte, sansPhraseLongue,
                avecPhraseCourte, avecPhraseLongue };

    const dateDeborde = long && court && (long.cap > court.cap || long.date > court.date + 4);
    // Ronde de correction 2 : la version précédente imprimait « X px de contenu dans Y px de
    // boîte » à partir de `scrollWidth`. Ça ne prouvait RIEN — `scrollWidth` d'un bloc ne peut
    // par construction jamais être inférieur à `clientWidth`, donc les deux chiffres étaient
    // toujours égaux et l'un d'eux se faisait passer pour une largeur de texte qu'il n'était pas.
    // La seule largeur de contenu réelle est celle que `pireDateRendue` mesure (ligne précédente
    // de la sortie). Ce qui se lit ici est donc ce que `scrollWidth` sait dire, et rien de plus :
    // y a-t-il, oui ou non, dépassement de la boîte.
    const deborde = long && long.contenuDate > long.boiteDate;
    console.log(`  ${dateDeborde ? '✗' : '✓'} bandeau, date longue — « ${long?.texteDate} » : `
      + `${deborde ? `DÉPASSE sa boîte (${long.contenuDate} px pour ${long.boiteDate} px)`
                   : `tient dans ses ${long?.boiteDate} px`}, `
      + `.date sur ${long?.date} px de haut (courte « ${court?.texteDate} » : ${court?.date} px) — `
      + `hauteur du bandeau ${court?.cap} px → ${long?.cap} px`);
    if (dateDeborde) {
      fautes++;
      console.log('      la date longue fait regonfler le bandeau : l\'invariance de hauteur de la tâche 8 tombe');
    }
    console.log(`  · bandeau sans .phrase (capteur intérieur unavailable) : ${sansPhrase?.cap} px `
      + `(avec phrase : ${court?.cap} px) — pastille 1 ligne ${sansPhraseCourte} px / 2 lignes `
      + `${sansPhraseLongue} px, soit ${sansPhraseLongue !== null && sansPhraseCourte !== null
        ? sansPhraseLongue - sansPhraseCourte : '?'} px de variation ; `
      + `avec phrase : ${avecPhraseCourte} px / ${avecPhraseLongue} px `
      + `(${avecPhraseLongue !== null && avecPhraseCourte !== null
        ? avecPhraseLongue - avecPhraseCourte : '?'} px). Dette connue, rapportée, non corrigée.`);

    // Toutes les manipulations d'horloge sont finies : on attend que la surveillance du silence
    // websocket se soit rétractée avant de mesurer quoi que ce soit du CORPS de l'écran (cf.
    // `attendreEcranVivant`). Sans ça, les six modes se mesurent sur un écran « Hors ligne ».
    const vivant = await attendreEcranVivant(page);
    if (!vivant) {
      console.log('  ✗ l\'écran ne revient pas d\'un état hors ligne après les changements '
        + "d'horloge : aucun mode n'est mesurable dans des conditions honnêtes.");
      fautes++;
    }

    // Revue tâche 15 (CRITIQUE) : posé AVANT la boucle des modes, délibérément. Sur le code
    // fautif, le premier redessin qui suit une animation lève, et TOUS les rendus suivants
    // lèvent à leur tour (`_$committedValue` reste bloqué) : les six modes ressortent alors en
    // faute eux aussi. C'est exactement ce que voit la tablette, et c'est le bon ordre de lecture
    // — un écran figé n'a plus de budget de hauteur à discuter.
    fautes += await verifierNombresAnimes(page);
    // Revue tâche 15 (I3) : posé ici, écran vivant et bandeau rendu, avant que la boucle des
    // modes ne remplace le bloc central — le bandeau, lui, est rendu dans tous les modes.
    fautes += await verifierPastilleLongue(page);

    // --- Points de mesure 1 et 4 : budget, cibles tactiles, contraste peint, par mode ---
    for (const mode of MODES) {
      await poserMode(page, HA_URL, mode);
      const r = await evaluerPage(page, PARAMS_ANALYSE);
      const jugement = jugerResultat(r);
      // Tâche 8 (moteur de mouvement) — aucun fantôme survivant : un clone resté dans
      // `#mvt-fantomes` est un artefact que personne ne peut faire disparaître sans recharger la
      // page (`GARDE_MS`, 500 ms, est censé le retirer inconditionnellement même si `finished` ne
      // se résout jamais — un survivant ICI, une seconde après le changement de mode, est donc un
      // vrai défaut, jamais une animation simplement en cours). Une seule `page` continue pour
      // toute la boucle des modes (contrairement à `VUES`, plus haut, qui recharge une page neuve
      // par vue) : c'est le seul endroit de ce vérificateur où un fantôme aurait le temps de
      // s'accumuler d'un mode au suivant.
      // LES DEUX CALQUES : un fantôme oublié dans `#mvt-fond` est le plus sournois des deux, parce
      // qu'il est INVISIBLE — `.corps` est opaque et le recouvre entièrement. Il n'en reste pas
      // moins un écran entier de nœuds morts que `racine.querySelector` retrouverait.
      await page.waitForTimeout(1000);
      const fantomes = await page.evaluate(
        () => document.querySelectorAll('#mvt-fantomes > *, #mvt-fond > *').length);
      if (fantomes > 0) {
        fautes++;
        console.log(`  ✗ mode ${mode.nom} : ${fantomes} fantôme(s) survivant(s) dans les calques de mouvement`);
      }
      const marqueurPresent = await page.evaluate((s) => document.querySelector(s) !== null, mode.marqueur);
      if (!marqueurPresent) {
        jugement.ok = false;
        const detail = `mode non atteint : ${mode.attendu} (${mode.marqueur}) n'est pas rendu`;
        jugement.raison = jugement.raison ? `${jugement.raison} ; ${detail}` : detail;
      }
      // Tâche 14, ronde de correction 1 : la même donnée ne doit jamais s'afficher deux fois sur
      // la tablette du bureau (bloc central ET pastille) — cf. `verifierPastilleSansRdv`.
      let sansDoublon = { ok: true, detail: '' };
      if (mode.nom === 'agenda' || mode.nom.startsWith('entretien')) {
        // Tâche 17 : le bloc de repli affiche le DÉTAIL de ce que la ligne de synthèse compte —
        // même règle, même contrôle, cf. `verifierSyntheseSansEntretien`.
        sansDoublon = mode.nom.startsWith('entretien')
          ? await verifierSyntheseSansEntretien(page, mode)
          : await verifierPastilleSansRdv(page, mode.evenementsInjecte?.[0]?.resume);
        if (!sansDoublon.ok) {
          jugement.ok = false;
          jugement.raison = jugement.raison ? `${jugement.raison} ; ${sansDoublon.detail}` : sansDoublon.detail;
        }
      }
      // Ce que le contenu DEMANDE : le cadre moins ce qu'il reste (le jeu avalé par `margin-top:
      // auto` sur `.xl`), plus ce qui dépasse quand il dépasse. Ronde de correction 1 : `jeu`
      // vaut `null` quand l'ancre `.corps > .xl` manque — la hauteur demandée est alors
      // INCONNUE, et un mode dont le budget n'a pas pu être mesuré est une faute, jamais un
      // « 585 px, reste 0 px » présenté comme conforme.
      const reste = r.marge < 0 ? r.marge : r.jeu;
      if (reste === null) {
        jugement.ok = false;
        const detail = 'budget non mesurable : `.corps > .xl` absent, le jeu restant est inconnu';
        jugement.raison = jugement.raison ? `${jugement.raison} ; ${detail}` : detail;
      }
      const hauteur = reste === null ? null : HAUTEUR - reste;
      budgets.push({ mode: mode.nom, hauteur, reste, cibles: r.cibles,
                     minCible: r.minCible, atteint: marqueurPresent,
                     clampes: r.clampes.map((c) => c.texte) });
      console.log(`  ${jugement.ok ? '✓' : '✗'} mode ${mode.nom} — hauteur demandée `
        + `${hauteur === null ? 'NON MESURABLE' : `${hauteur} px`} / `
        + `${HAUTEUR} px (reste ${reste === null ? '?' : `${reste} px`}), ${r.cibles} cible(s), plus petite `
        + `${r.minCible ?? 'aucune'} px, pire contraste calculé `
        + `${r.pireContraste ? `${r.pireContraste.ratio}:1` : 'n/a'}`
        + `${r.animationsEnCours ? ', ⚠ une animation tournait encore à la mesure' : ''}`
        + `${r.clampes.length ? `, borné à 2 lignes (voulu) : ${r.clampes.map((c) => `« ${c.texte} »`).join(', ')}` : ''}`
        + `${mode.nom === 'agenda' && sansDoublon.ok ? ', pastille sans doublon du rendez-vous' : ''}`
        + `${mode.nom.startsWith('entretien') && sansDoublon.ok ? ', synthèse sans doublon de l\'entretien' : ''}`
        + `${jugement.ok ? '' : ` — ${jugement.raison}`}`);
      if (!jugement.ok) fautes++;
    }

    // Revue tâche 15 (I1) : le rail de progression, mesuré APRÈS la boucle des modes — il lui
    // faut la carte média à l'écran et plusieurs secondes d'horloge, deux choses qui n'ont rien à
    // faire au milieu d'un budget de hauteur.
    fautes += await verifierRailProgression(page, HA_URL, MODES.find((m) => m.nom === 'media'));

    // Tâche 10, step 3 du brief : le décompte des minuteurs doit DESCENDRE réellement, sans
    // injection — le tic d'une seconde câblé en tâche 8. Tâche 15 : il ne se mesure PLUS sur
    // `page` (dont l'horloge est figée, ce qui rendait le contrôle probabiliste — cf. son
    // docstring) mais sur une page dédiée à horloge réelle, qu'il ouvre et referme lui-même.
    fautes += await verifierDecompteMinuteur(nav, HA_URL, jetons, bundle);

    // Tâche 10 bis (arbitrage du propriétaire, 2026-08-03) : le réglage n'est plus un ÉTAT du
    // mode `minuteur` mais une VUE plein écran (`#minuteur`), au même titre que « Toute la
    // maison »/« Tâches » — il n'a donc plus sa place ici, dans la boucle des MODES. Il est
    // désormais mesuré comme telle, dans la boucle des VUES (cf. `VUES` dans
    // `verifierPagesReelles`, plus haut), avec les mêmes contrôles génériques (débordement,
    // cibles tactiles, contraste) que les deux autres sous-vues.

    // Contraste peint : le mode cinéma, sur les TROIS affiches. C'est le seul endroit du projet
    // où un texte est peint sur une `background-image` — et la palette y est forcée en sombre
    // (texte blanc), donc c'est l'affiche CLAIRE qui décide.
    const cinema = MODES.find((m) => m.nom === 'cinema');
    for (const a of AFFICHES) {
      await poserMode(page, HA_URL, cinema);
      await injecter(page, [['media_player.plex_plex_for_android_tv_uhd_google_tv_stick', 'playing', {
        ...cinema.etats[1][2], entity_picture: `/local/wallpanel/essai-affiche-${a.nom}.png`,
      }]]);
      await page.waitForTimeout(ATTENTE_MODE_MS);
      const peint = await echantillonnerContrastePeint(page);
      if (!peint) {
        console.log(`  ✗ contraste peint, affiche ${a.nom} — aucune carte média à l'écran`);
        fautes++;
        continue;
      }
      echantillons.push({ affiche: a.nom, ...peint });
      const ok = peint.pire.ratio >= CONTRASTE_MIN;
      if (!ok) fautes++;
      console.log(`  ${ok ? '✓' : '✗'} contraste peint, affiche ${a.nom} — pire `
        + `${peint.pire.ratio}:1 sur « ${peint.pire.texte} » (${peint.pire.classe}) ; `
        + `toutes : ${peint.toutes.map((m) => `${m.classe}=${m.ratio}`).join(', ')}`);
    }

    // --- Point de mesure 5 : images par seconde, transition par transition ---
    // Chaque paire de modes CONSÉCUTIFS de `MODES` : on installe le premier, on laisse l'écran se
    // poser, puis on mesure pendant que le second prend sa place. La remise à zéro du premier
    // fait partie de la fenêtre mesurée — c'est bien ce qui se passe dans la maison : la
    // condition du mode A disparaît et celle du mode B apparaît.
    //
    // Tâche 10 : `repas` (ex-`previsions`)/`minuteur` se mesurent en cuisine, tâche 14 : `agenda`
    // au bureau, les six autres au salon (cf. `pageDuMode`) — l'ORDRE de `MODES` place les deux
    // modes cuisine adjacents en fin de tableau pour qu'un seul couple cuisine→cuisine (`repas` →
    // `minuteur`) soit un vrai morphing en place. `agenda`, seul mode bureau, encadré par des
    // modes salon/cuisine, ajoute nécessairement deux frontières de page de plus (`alerte` →
    // `agenda`, `agenda` → `repas`) — une paire qui change de page n'est PAS un vrai morphing en
    // place (aucune tablette ne passe du salon au bureau ou du bureau à la cuisine d'un geste) :
    // l'ignorer honnêtement vaut mieux qu'une mesure sans rapport avec un vrai écran.
    for (let i = 0; i + 1 < MODES.length; i++) {
      const depuis = MODES[i];
      const vers = MODES[i + 1];
      if (pageDuMode(depuis) !== pageDuMode(vers)) {
        console.log(`  · images/seconde ${depuis.nom} → ${vers.nom} : transition ignorée `
          + `(${pageDuMode(depuis)} → ${pageDuMode(vers)}, pages différentes — jamais un vrai `
          + 'morphing en place sur une tablette)');
        continue;
      }
      // REVUE FINALE : cette boucle ne pose QUE des états (`neutraliser` + `injecter`) — c'est ce
      // qui garde la fenêtre mesurée propre. Le mode `recette` ne s'atteint pas ainsi (il lui faut
      // une recette en cours, cf. `poserMode`) : mesurer cette paire chronométrerait une transition
      // qui n'a pas lieu, et le mode « depuis » serait lui-même faussé par la recette laissée en
      // cours. Ignorée en le DISANT, comme les paires qui changent de page.
      if (depuis.recetteReduite || vers.recetteReduite) {
        console.log(`  · images/seconde ${depuis.nom} → ${vers.nom} : transition ignorée `
          + '(le mode `recette` ne s\'atteint pas par une simple injection d\'états)');
        continue;
      }
      await poserMode(page, HA_URL, depuis);
      const m = await mesurerImagesParSeconde(page, async () => {
        await neutraliser(page);
        await injecter(page, vers.etats);
      });
      const fps = Math.round(m.fps * 10) / 10;
      cadences.push({ transition: `${depuis.nom} → ${vers.nom}`, fps, images: m.images,
                      ecoule: Math.round(m.ecoule) });
      const ok = fps >= 30;
      if (!ok) fautes++;
      console.log(`  ${ok ? '✓' : '✗'} images/seconde ${depuis.nom} → ${vers.nom} : ${fps} im/s `
        + `(${m.images} images en ${Math.round(m.ecoule)} ms, plancher 30)`);
    }

    if (erreursPage.length) {
      console.log(`  ✗ erreur(s) de page pendant la mesure des modes : ${erreursPage.join(' | ')}`);
      fautes++;
    }
  } catch (e) {
    console.log(`  ✗ exception pendant la mesure des modes : ${e.message}`);
    fautes++;
  } finally {
    await page.close();
    await ctx.close();
  }
  return { fautes, budgets, echantillons, cadences, bandeau };
}

// --- Auto-test : preuve que le vérificateur sait détecter chaque défaut ------------------
//
// Sans ça, un vérificateur qui ne peut jamais rougir ne vaut rien — cf. le brief de la tâche.
// Fixtures autonomes (aucun réseau, aucun fichier du projet touché) : un gabarit minimal qui
// reprend les mêmes classes que l'app réelle (`.commande`, `.xl`) avec des couleurs et tailles
// réelles des jetons M3, puis une variante par défaut à détecter.

const FOND = '#f5fafc';        // --md-surface
const TEXTE = '#0c1214';       // --md-on-surface
const CONTENEUR = '#d8dee0';   // --md-surface-container-high
const PRIMAIRE = '#003c48';    // --md-primary
const SUR_PRIMAIRE = '#ffffff'; // --md-on-primary

// `gabaritFixture`, pas `page` : ce nom-là est déjà pris par l'objet Playwright partout ailleurs
// dans ce fichier (`ctx.newPage()`), les confondre serait une source de bug silencieux.
function gabaritFixture(corps) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${FOND};}
    #app{width:${LARGEUR}px;height:${HAUTEUR}px;overflow:hidden;background:${FOND};color:${TEXTE};
         display:flex;flex-direction:column;box-sizing:border-box;}
  </style></head><body><div id="app">${corps}</div></body></html>`;
}

const FIXTURES = [
  {
    nom: 'propre (référence)',
    html: gabaritFixture(`
      <div class="commande" style="height:64px;background:${CONTENEUR};color:${TEXTE};
           display:flex;align-items:center;padding:0 15px;">Lumières salon</div>
      <div class="xl" style="height:62px;background:${PRIMAIRE};color:${SUR_PRIMAIRE};
           display:flex;align-items:center;justify-content:center;">Retour</div>
    `),
    attendu: (j) => j.ok,
    description: 'aucun défaut : doit passer',
  },
  {
    nom: 'débordement volontaire',
    // `flex-shrink:0` est nécessaire : dans un `#app` en `display:flex;flex-direction:column`,
    // Chromium recalcule sinon `min-height:auto` sur ce bloc et le COMPRESSE à la taille de son
    // texte au lieu de le laisser déborder — trouvé par cet auto-test lui-même en premier jet
    // (la fixture ne débordait pas du tout). La vraie app y échappe parce que ses rangées
    // répétées (`.groupe`, tuiles) sont posées en CSS Grid, pas flex : une piste de grille
    // dimensionnée `auto` ne se compresse pas comme un enfant flex, donc peut réellement
    // déborder — exactement ce que ce vérificateur doit attraper.
    html: gabaritFixture(`
      <div style="height:700px;flex-shrink:0;background:${CONTENEUR};color:${TEXTE};">Bloc bien trop haut</div>
    `),
    attendu: (j) => !j.ok && /déborde/.test(j.raison),
    description: 'un bloc de 700 px dans un cadre de 585 px doit être signalé « déborde »',
  },
  {
    nom: 'cible trop petite',
    html: gabaritFixture(`
      <div class="commande" style="height:40px;background:${CONTENEUR};color:${TEXTE};">Trop bas</div>
    `),
    attendu: (j) => !j.ok && /cible trop petite/.test(j.raison),
    description: `une .commande de 40 px (< ${CIBLE_MIN_PX} px) doit être signalée`,
  },
  {
    nom: 'contraste insuffisant',
    html: gabaritFixture(`
      <div style="background:${FOND};color:${CONTENEUR};">Texte presque invisible sur son fond</div>
    `),
    attendu: (j) => !j.ok && /contraste insuffisant/.test(j.raison),
    description: `${CONTENEUR} sur ${FOND} doit tomber sous ${CONTRASTE_MIN}:1`,
  },
  {
    nom: 'texte tronqué',
    html: gabaritFixture(`
      <div style="width:50px;white-space:nowrap;overflow:hidden;background:${FOND};color:${TEXTE};">
        Ce texte est bien plus long que les cinquante pixels qui lui sont laissés
      </div>
    `),
    attendu: (j) => !j.ok && /texte tronqué/.test(j.raison),
    description: 'un texte en `white-space: nowrap` plus large que sa boîte doit être signalé',
  },
  {
    // Ronde de correction 2 : reproduit fidèlement `erreurDemarrage()`/`sessionAbsente()`
    // (`demarrage.ts`) — un unique `.cap`, sans `.corps`, exactement leur gabarit réel.
    nom: 'écran de repli (Connexion impossible / Session) affiché à la place du contenu',
    html: gabaritFixture(`
      <div class="cap" style="background:${PRIMAIRE};color:${SUR_PRIMAIRE};padding:16px;">
        <div>Connexion impossible</div>
        <div>L'écran n'arrive pas à joindre la maison.</div>
      </div>
    `),
    attendu: (j) => !j.ok && /écran de repli/.test(j.raison),
    description: 'un `.cap` sans `.corps` doit être signalé, même sans aucun autre défaut géométrique',
  },
  {
    // Tâche 13 : LE défaut qui a échappé à ce vérificateur pendant six tâches — les boutons de
    // transport de la carte média sous la cible tactile (revue de la tâche 6), invisibles parce
    // que `.media-bouton` n'était dans aucune liste mesurée.
    // Ronde de correction 1 : l'intitulé promettait « .media-bouton à 57 px » alors que la
    // fixture n'écrasait QUE le rail — la sortie le disait, pas le titre. Un intitulé qui promet
    // une preuve non faite est précisément le défaut que ce plan a rencontré le plus souvent.
    // Les trois boutons sont maintenant réellement à 57 px, et le rail est laissé à 62.
    nom: 'boutons de transport sous la cible tactile (.media-bouton à 57 px)',
    html: gabaritFixture(`
      <div style="width:279px;display:flex;align-items:center;gap:10px;background:${CONTENEUR};">
        <div class="media-bouton" style="width:62px;height:57px;background:${PRIMAIRE};"></div>
        <div class="media-bouton" style="width:62px;height:57px;background:${PRIMAIRE};"></div>
        <div class="media-bouton" style="width:62px;height:57px;background:${PRIMAIRE};"></div>
        <div class="media-rail" style="width:90px;height:62px;background:${PRIMAIRE};"></div>
      </div>
    `),
    attendu: (j) => !j.ok && /cible trop petite \(57 px[^)]*media-bouton/.test(j.raison),
    description: 'trois `.media-bouton` de 57 px doivent être signalés — ils ne l\'étaient pas avant la tâche 13',
  },
  {
    // Revue tâche 15, constat I2 — LE CAS EXACT DU DÉFAUT HISTORIQUE, resté invisible jusqu'ici.
    // À la revue de la tâche 6, les boutons de transport étaient tombés à ~57 px sous le
    // `flex-shrink` par défaut : ce dernier rétrécit sur l'axe PRINCIPAL du conteneur flex, ici
    // HORIZONTAL. Les boutons perdaient donc de la largeur, pas de la hauteur — et le contrôle de
    // cible, qui ne relevait que `height`, les déclarait conformes. Cette fixture est verte sur
    // le vérificateur d'avant cette revue, rouge après.
    nom: 'boutons de transport écrasés EN LARGEUR (.media-bouton à 57 × 62) — le défaut de la tâche 6',
    html: gabaritFixture(`
      <div style="width:279px;display:flex;align-items:center;gap:10px;background:${CONTENEUR};">
        <div class="media-bouton" style="width:57px;height:62px;background:${PRIMAIRE};"></div>
        <div class="media-bouton" style="width:57px;height:62px;background:${PRIMAIRE};"></div>
        <div class="media-bouton" style="width:57px;height:62px;background:${PRIMAIRE};"></div>
      </div>
    `),
    attendu: (j) => !j.ok && /cible trop étroite[^)]*media-bouton 57×62/.test(j.raison),
    description: 'un `.media-bouton` de 57 px de LARGE (62 px de haut) doit être signalé — il ne l\'était pas',
  },
  {
    // Contre-épreuve indispensable : `.media-pas` fait 44 px de large PAR CONCEPTION
    // (`base.css`). Un plancher de largeur uniforme à 62 px le déclarerait fautif à tort, tous
    // les jours — c'est exactement pour ça que `PLANCHERS_LARGEUR` est une table par sélecteur et
    // pas une constante. Ici, seule sa HAUTEUR est en faute.
    nom: 'volume − / + à 44 px de large (conception) mais 44 px de haut — seule la hauteur est fautive',
    html: gabaritFixture(`
      <div class="media-pas" style="width:44px;height:44px;background:${PRIMAIRE};color:${SUR_PRIMAIRE};">−</div>
    `),
    attendu: (j) => !j.ok && /cible trop petite/.test(j.raison) && !/trop étroite/.test(j.raison),
    description: '44 px de large est la largeur déclarée de `.media-pas` : jamais signalée comme trop étroite',
  },
  {
    // Le rail, lui, tient sa largeur d'un `min-width: 56px` déclaré : le retirer (ou le réduire)
    // désynchroniserait son dégradé du calcul au doigt, le défaut jumeau de celui des boutons.
    nom: 'rail de volume plus étroit que son min-width déclaré (.media-rail à 40 px)',
    html: gabaritFixture(`
      <div class="media-rail" style="width:40px;height:62px;background:${PRIMAIRE};"></div>
    `),
    attendu: (j) => !j.ok && /cible trop étroite[^)]*media-rail/.test(j.raison),
    description: 'un `.media-rail` de 40 px de large (min-width déclaré : 56 px) doit être signalé',
  },
  {
    nom: 'rail de volume sous la cible tactile (.media-rail à 57 px)',
    html: gabaritFixture(`
      <div class="media-rail" style="width:90px;height:57px;background:${PRIMAIRE};"></div>
    `),
    attendu: (j) => !j.ok && /cible trop petite \(57 px[^)]*media-rail/.test(j.raison),
    description: 'un `.media-rail` de 57 px doit être signalé',
  },
  {
    // Ronde de correction 1 de la tâche 13, LE cas que son premier jet avait rendu muet :
    // `-webkit-line-clamp` avait été traité en désarmant la classe ENTIÈRE au lieu d'exempter des
    // sélecteurs nommés — tout élément clampé avalant du texte rendait `{ok: true}`. Cette
    // garantie-là ne bouge pas ; seul le SÉLECTEUR de la fixture change à la revue de la tâche 15,
    // `.pastille .pv` étant devenu une borne éditoriale nommée et mesurée (cf. `CLAMPS_VOULUS`).
    // Il fallait donc la reporter sur un clamp NON exempté, sinon la garantie disparaissait avec
    // elle — exactement l'erreur que la tâche 13 avait corrigée.
    nom: 'texte clampé HORS liste d\'exemption (.demain .v, clamp non déclaré)',
    html: gabaritFixture(`
      <div class="demain" style="width:133px;background:${CONTENEUR};color:${TEXTE};">
        <div class="v" style="font-size:13px;line-height:1.25;display:-webkit-box;
             -webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
          29 et des passages nuageux en fin de journée avec un peu de vent
        </div>
      </div>
    `),
    attendu: (j) => !j.ok && /texte tronqué/.test(j.raison),
    description: 'un clamp NON exempté qui avale du texte reste une faute dure',
  },
  {
    // Revue tâche 15 (I3) : la contre-épreuve de l'exemption qu'on vient d'accorder. La pastille
    // doit être RAPPORTÉE comme bornée (`clampes`), jamais silencieusement acceptée — c'est cette
    // ligne d'impression qui remplace la faute dure, et sans elle l'exemption deviendrait
    // l'angle mort que la tâche 13 dénonçait à juste titre.
    nom: 'pastille du bandeau bornée à 2 lignes (.pastille .pv) — exemption nommée : acceptée MAIS rapportée',
    html: gabaritFixture(`
      <div class="pastille" style="width:133px;background:${CONTENEUR};color:${TEXTE};">
        <div class="pv" style="font-size:13px;line-height:1.25;display:-webkit-box;
             -webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
          Meet-up Golf Innovation Auvergne 2026 | French Tech x CIC
        </div>
      </div>
    `),
    attendu: (j, r) => j.ok && r.clampes.some((c) => String(c.element).includes('pv')),
    description: 'le pire résumé réel des calendriers passe, et ressort dans `clampes` (imprimé à chaque exécution)',
  },
  {
    // Contre-épreuve de la précédente : la SEULE exemption nommée doit, elle, rester acceptée.
    nom: 'titre de carte média clampé à 2 lignes (.v.deux-lignes) — exemption nommée, doit passer',
    html: gabaritFixture(`
      <div class="media" style="width:279px;background:${CONTENEUR};color:${TEXTE};">
        <div class="v deux-lignes" style="font-size:15px;line-height:1.26;display:-webkit-box;
             -webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
          Un titre de chanson beaucoup trop long pour tenir sur deux lignes, comme YouTube Music en produit tous les jours
        </div>
      </div>
    `),
    attendu: (j) => j.ok,
    description: 'la borne éditoriale documentée de la carte média reste acceptée',
  },
  {
    nom: 'bouton « Retour base » du mode ménage trop bas (.mode-action à 48 px)',
    html: gabaritFixture(`
      <div class="mode-bloc" style="display:flex;align-items:center;background:${CONTENEUR};color:${TEXTE};">
        <div style="flex:1;">Ménage</div>
        <div class="mode-action" style="height:48px;padding:0 16px;display:flex;align-items:center;
             background:${PRIMAIRE};color:${SUR_PRIMAIRE};">Retour base</div>
      </div>
    `),
    attendu: (j) => !j.ok && /cible trop petite/.test(j.raison),
    description: 'un `.mode-action` de 48 px doit être signalé',
  },
  {
    // Contre-épreuve indispensable (cf. brief) : l'écran de nuit (`rendreNuit`) est légitimement
    // très dépouillé — aucune cible tactile, un texte, parfois deux. Il ne doit JAMAIS être
    // confondu avec un écran de repli : il n'utilise jamais la classe `.cap`.
    nom: 'écran de nuit légitimement dépouillé (sans .cap) — ne doit pas être confondu avec une panne',
    html: gabaritFixture(`
      <div class="nuit" style="flex:1;display:flex;flex-direction:column;align-items:center;
           justify-content:center;background:${FOND};color:${TEXTE};">
        <div style="font-size:92px;">02:00</div>
      </div>
    `),
    attendu: (j) => j.ok,
    description: 'un écran sobre sans `.cap` (nuit) doit rester accepté',
  },
  {
    // Tâche 10, arbitrage du propriétaire (2026-08-03) : « 62 px comme tout le reste, AUCUNE
    // exemption » pour les étiquettes de réglage — le vérificateur doit rougir si elles reviennent
    // un jour à 40 px pour gagner de la hauteur. Cette fixture prouve que l'arbitrage est vraiment
    // OUTILLÉ, pas seulement écrit en commentaire dans `base.css`.
    nom: 'étiquette de réglage minuteur sous la cible tactile (.mn-etiquette à 40 px) — AUCUNE exemption',
    html: gabaritFixture(`
      <div class="mn-etiquette" style="height:40px;min-width:62px;background:${CONTENEUR};color:${TEXTE};">Pâtes</div>
    `),
    attendu: (j) => !j.ok && /cible trop petite \(40 px[^)]*mn-etiquette/.test(j.raison),
    description: `une .mn-etiquette de 40 px (< ${CIBLE_MIN_PX} px) doit être signalée, sans exception`,
  },
  {
    // Le jumeau du défaut historique des boutons média (largeur écrasée par `flex-shrink`,
    // invisible à un contrôle qui ne relève que la hauteur) — mais cette fois sur `.mn-bouton`
    // (pause/lecture/annuler d'un minuteur), qui déclare aussi un `min-width: 62px` dans `base.css`.
    nom: 'bouton de minuteur écrasé EN LARGEUR (.mn-bouton à 40 × 62)',
    html: gabaritFixture(`
      <div class="mn-bouton" style="width:40px;height:62px;background:${PRIMAIRE};color:${SUR_PRIMAIRE};"></div>
    `),
    attendu: (j) => !j.ok && /cible trop étroite[^)]*mn-bouton 40×62/.test(j.raison),
    description: 'un `.mn-bouton` de 40 px de LARGE (62 px de haut, min-width déclaré 62) doit être signalé',
  },
  {
    // Le bouton de clim de la voiture (tâche 9 bis) rejoint la liste des cibles mesurées en tâche
    // 10 : sans cette fixture, l'ajout de `.vt-bouton` au sélecteur ne serait qu'affirmé.
    nom: 'bouton de clim voiture sous la cible tactile (.vt-bouton à 50 px)',
    html: gabaritFixture(`
      <div class="vt-bouton" style="height:50px;background:${CONTENEUR};color:${TEXTE};">Lancer la clim</div>
    `),
    attendu: (j) => !j.ok && /cible trop petite \(50 px[^)]*vt-bouton/.test(j.raison),
    description: `un .vt-bouton de 50 px (< ${CIBLE_MIN_PX} px) doit être signalé`,
  },
];

async function autoTest(nav) {
  console.log('Auto-test — preuve que le vérificateur détecte bien chaque classe de défaut :');
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  let echecs = 0;
  for (const f of FIXTURES) {
    const p = await ctx.newPage();
    await p.setContent(f.html);
    const r = await evaluerPage(p, PARAMS_ANALYSE);
    const jugement = jugerResultat(r);
    // Revue tâche 15 : le résultat BRUT est passé en second, pour qu'une fixture puisse exiger
    // plus qu'un verdict — typiquement « accepté ET rapporté dans `clampes` », la contre-épreuve
    // d'une exemption nommée. Sans ça, une exemption ne pourrait être vérifiée que par son
    // silence, ce qui est précisément ce qu'on lui reproche.
    const reussi = f.attendu(jugement, r);
    console.log(`  ${reussi ? '✓' : '✗'} ${f.nom} — ${f.description}`);
    console.log(`      résultat : ${jugement.ok ? 'accepté' : jugement.raison}`
      + `${r.clampes && r.clampes.length ? ` ; borné à 2 lignes (voulu) : ${r.clampes.map((c) => `« ${c.texte} »`).join(', ')}` : ''}`);
    if (!reussi) echecs++;
    await p.close();
  }
  await ctx.close();
  console.log('');
  if (echecs) {
    console.error(`${echecs} cas d'auto-test non détecté(s) comme attendu : le vérificateur a un angle mort.`);
    return 1;
  }
  console.log('Auto-test réussi : le vérificateur rougit sur chacune des six classes de défaut couvertes '
    + '(débordement, cible trop petite EN HAUTEUR, cible trop étroite EN LARGEUR — ajoutée à la revue de la '
    + 'tâche 15, c\'est l\'axe sur lequel agissait le défaut historique de `flex-shrink` —, contraste '
    + 'insuffisant, texte tronqué, écran de repli), et seulement sur elles : les fixtures « propre », '
    + '« nuit » (légitimement sobre) et « .media-pas à 44 px de large » (largeur déclarée) restent acceptées '
    + 'sur ce qu\'elles doivent l\'être.');
  return 0;
}

// --- Tâche 13 : preuve que l'échantillonnage des pixels peints rougit vraiment -------------
//
// Le contrôle de contraste de `analyserRendu` compose des `backgroundColor`. Une affiche est une
// `background-image` : il ne la voit pas, et il ne PEUT pas la voir. Ces deux fixtures le
// démontrent — la même carte, le même texte blanc, la même affiche très claire, à deux opacités
// de voile : l'analyse de style rend le MÊME verdict « aucun contraste fautif » dans les deux cas,
// alors que les pixels réellement peints séparent nettement le voile calibré du voile relâché.

function fixtureAffiche(opacite) {
  const b64 = AFFICHES_PNG.get('claire').toString('base64');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#191e20;}
    #app{width:${LARGEUR}px;height:${HAUTEUR}px;overflow:hidden;background:#191e20;color:#ffffff;
         display:flex;flex-direction:column;box-sizing:border-box;padding:12px 16px;}
    .media{position:relative;overflow:hidden;padding:8px 16px;min-height:153px;border-radius:28px;
           background:#191e20;color:#ffffff;display:flex;flex-direction:column;gap:6px;}
    .media-affiche{position:absolute;inset:0;z-index:0;background-size:cover;
      background-position:center;opacity:${opacite};
      background-image:url('data:image/png;base64,${b64}');}
    .media-texte{position:relative;z-index:1;}
    .media .t{font-size:11px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;}
    .media .v{font-size:15px;font-weight:600;line-height:1.26;}
  </style></head><body><div id="app">
    <div class="media"><div class="media-affiche"></div>
      <div class="media-texte"><div class="t">EN COURS</div>
        <div class="v">Les trois Mousquetaires : Milady</div></div></div>
  </div></body></html>`;
}

async function autoTestPeint(nav) {
  console.log('Auto-test des pixels peints — l\'analyse de style est aveugle à une affiche, '
    + "l'échantillonnage ne l'est pas :");
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  let echecs = 0;
  const cas = [
    { nom: 'voile calibré (.34, la valeur réelle de base.css) sur affiche très claire',
      opacite: '.34', attendu: (ratio) => ratio >= CONTRASTE_MIN,
      description: `le texte blanc doit rester au-dessus de ${CONTRASTE_MIN}:1` },
    { nom: 'voile relâché (.60) sur la MÊME affiche très claire',
      opacite: '.60', attendu: (ratio) => ratio < CONTRASTE_MIN,
      description: 'le contraste peint doit tomber, et être signalé' },
  ];
  for (const c of cas) {
    const p = await ctx.newPage();
    await p.setContent(fixtureAffiche(c.opacite));
    const parStyle = jugerResultat(await evaluerPage(p, PARAMS_ANALYSE));
    const peint = await echantillonnerContrastePeint(p);
    await p.close();
    // Les deux conditions comptent : le verdict peint attendu, ET la preuve que l'analyse de
    // style n'y voit rien — c'est ce couple qui justifie l'existence de la fonction.
    const reussi = peint !== null && c.attendu(peint.pire.ratio) && !/contraste insuffisant/.test(parStyle.raison);
    console.log(`  ${reussi ? '✓' : '✗'} ${c.nom} — ${c.description}`);
    console.log(`      peint : ${peint ? `${peint.pire.ratio}:1 sur « ${peint.pire.texte} »` : 'aucune carte'} ; `
      + `par analyse de style : ${parStyle.ok ? 'aucun défaut' : parStyle.raison}`);
    if (!reussi) echecs++;
  }
  await ctx.close();
  console.log('');
  if (echecs) {
    console.error(`${echecs} cas d'auto-test des pixels peints non détecté(s) comme attendu.`);
    return 1;
  }
  console.log("Auto-test des pixels peints réussi : le voile calibré passe, le voile relâché est "
    + "signalé, et l'analyse de style ne voit ni l'un ni l'autre.");
  return 0;
}

// --- Contrôle tactile (tâche 15) : la jauge suit-elle vraiment le doigt ? ------------------
//
// POURQUOI ce contrôle existe, distinct de tout le reste du fichier : un après-midi entier
// passé par le propriétaire à essayer de régler la luminosité au doigt, en échec sur quatre
// essais, pendant que les 185 tests unitaires ET ce vérificateur (dans son état d'avant cette
// tâche) déclaraient tout conforme. Trois causes cumulées, dont la plus profonde : le WebView de
// la tablette émet PLUSIEURS `pointerdown` au cours d'un même glissement physique (un seul doigt,
// posé une seule fois — vérifié sur les relevés d'appels de service du 2026-08-02, pas supposé).
// `creerGeste` (`geste.ts`) s'en protège par une garde : un `pointerdown` supplémentaire pendant
// un geste déjà en cours est ignoré, pour ne jamais réinitialiser le point de référence
// (`xDepart`/`valeurDepart`) en cours de route.
//
// Aucun filet existant ne pouvait voir ça : jsdom (129 tests unitaires du projet) ne simule
// aucun geste tactile réel, et ce vérificateur, jusqu'ici, ne pilotait qu'une souris (`page.click`
// implicite des tests Playwright classiques — jamais utilisé ici non plus, en fait : ce fichier
// n'avait *jamais* posé le doigt sur une tuile avant cette tâche). Un contrôle qui se contenterait
// de compter les appels de service serait lui aussi passé à côté du défaut du jour : le geste
// cassé envoyait bien des commandes, juste toutes à la même valeur (ou une valeur incohérente
// avec l'amplitude parcourue) — c'est la VALEUR réglée, pas le nombre d'appels, qui doit être
// vérifiée.
//
// Choix d'architecture : un vrai Chromium (`hasTouch: true`, gestes tactiles envoyés via
// `Input.dispatchTouchEvent` du protocole CDP — la même API qui pilote un vrai doigt, pas des
// `PointerEvent` fabriqués à la main dans `page.evaluate`), mais sur des FIXTURES en mémoire
// (même esprit que `autoTest` ci-dessus : « aucun réseau ni fichier touché »), pas sur les pages
// déployées de `verifierPagesReelles`. Un glissement réel sur une VRAIE tuile de la maison
// appellerait un VRAI service Home Assistant (`light.turn_on`, `cover.set_cover_position`...) à
// chaque exécution de routine de ce script — inacceptable sur une maison habitée. Les fixtures
// bundlent en revanche `geste.ts`/`jauge.ts`/`etat.ts` TELS QUELS depuis `SRC_APP` (via esbuild,
// déjà une dépendance de dev du projet) : c'est le vrai code défendu qui est exercé, jamais une
// réécriture séparée qui pourrait dériver de lui sans qu'on s'en aperçoive.
const TUILE_LARGEUR = 160;   // même convention que `tests/geste.test.ts` (fonction `tuile()`)
const TUILE_HAUTEUR = 64;
const TUILE_GAUCHE = 20;
const TUILE_HAUT = 20;
const TUILE_Y = TUILE_HAUT + TUILE_HAUTEUR / 2;
const SERRURE_HAUT = TUILE_HAUT + TUILE_HAUTEUR + 20;
const SERRURE_Y = SERRURE_HAUT + TUILE_HAUTEUR / 2;

/** Bundle `creerGeste` (`geste.ts`) et `Etat` (`etat.ts`) EN MÉMOIRE depuis `SRC_APP` — jamais
 *  écrit sur disque (`write: false`), jamais un import direct de ces `.ts` par ce script `.mjs`
 *  (Node ne saurait pas les charger sans transpilation). `jauge.ts` est entraîné dans le bundle
 *  par l'import réel de `geste.ts` (pas listé ici séparément) : c'est le graphe d'imports RÉEL du
 *  projet qui décide, pas une liste maintenue à la main qui pourrait oublier un fichier. */
async function bundlerGeste() {
  const resultat = await esbuild.build({
    stdin: {
      contents: `export { creerGeste } from './geste.ts'; export { Etat } from './etat.ts';`,
      resolveDir: SRC_APP,
      loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', globalName: 'GesteModule', target: 'es2020',
  });
  return resultat.outputFiles[0].text;
}

/** Gabarit de fixture : une tuile À jauge (`#tuile`, ex. « Lumières ») et une tuile SANS jauge
 *  (`#serrure`, même dispatcher `creerGeste`, mais `descripteurJauge` y rend `null` puisque
 *  `lock.*` n'est reconnu par aucun des quatre domaines de `jauge.ts`) — les deux branches réelles
 *  du `if (!d)` dans `geste.ts`, sur la même page. */
function fixtureGeste(codeBundle) {
  return `<!doctype html><html><body>
    <div id="tuile" class="commande jauge"
         style="position:absolute;left:${TUILE_GAUCHE}px;top:${TUILE_HAUT}px;
                width:${TUILE_LARGEUR}px;height:${TUILE_HAUTEUR}px;touch-action:none;"></div>
    <div id="serrure" class="commande"
         style="position:absolute;left:${TUILE_GAUCHE}px;top:${SERRURE_HAUT}px;
                width:${TUILE_LARGEUR}px;height:${TUILE_HAUTEUR}px;touch-action:none;"></div>
    <script>${codeBundle}</script>
  </body></html>`;
}

/** Câble le bundle réel sur la fixture : `light.lumiere_salon` (à jauge) et
 *  `lock.aqara_smart_lock_u200_lite` (sans jauge, entité réelle de la maison, cf. CLAUDE.md) —
 *  deux identifiants réels du projet, pas des noms inventés. `window.__appels` recueille les VRAIS
 *  appels de service (la valeur envoyée, pas seulement leur nombre) ; `window.__bascules` compte
 *  les appels à `surBascule`, le callback d'appui simple. */
async function pageGeste(ctx, codeBundle, etatTuile) {
  const page = await ctx.newPage();
  await page.setContent(fixtureGeste(codeBundle));
  await page.evaluate((etatTuile) => {
    window.__appels = [];
    window.__bascules = 0;
    const cx = { appelerService: (d, s, donnees) => window.__appels.push([d, s, donnees]) };
    const etat = {
      estUtilisable: () => true,
      lire: (id) => (id === 'light.lumiere_salon' ? etatTuile : { etat: 'locked', attributs: {} }),
    };
    const geste = window.GesteModule.creerGeste(etat, cx, () => false);
    document.getElementById('tuile').addEventListener('pointerdown', (ev) =>
      geste(ev, 'light.lumiere_salon', () => { window.__bascules++; }));
    document.getElementById('serrure').addEventListener('pointerdown', (ev) =>
      geste(ev, 'lock.aqara_smart_lock_u200_lite', () => { window.__bascules++; }));
  }, etatTuile);
  return page;
}

/** Glissement RÉEL, protocole CDP (`Input.dispatchTouchEvent`, la même API que pour un vrai
 *  doigt) — AVEC un contact fantôme injecté à mi-course, à quelques pixels du contact réel : la
 *  reproduction fidèle de « le WebView émet plusieurs pointerdown au cours d'un même glissement »
 *  (docstring de tête), pas un cas d'école ajouté à part. C'est ce fantôme qui fait la différence
 *  entre un contrôle qui aurait pu rester vert sur le défaut du jour et un qui rougit vraiment :
 *  sans lui, un seul contact continu ne réexerce jamais la garde anti-redémarrage. */
async function glisserAvecFantome(cdp, y, xDepart, xIntermediaire, xFinal) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: xDepart, y, id: 0 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: xIntermediaire, y, id: 0 }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: xIntermediaire, y, id: 0 }, { x: xIntermediaire + 3, y: y + 1, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: xFinal, y, id: 0 }, { x: xIntermediaire + 3, y: y + 1, id: 1 }],
  });
  // Les deux contacts se terminent ENSEMBLE (relevé du doigt) : la libération d'un seul des deux
  // points d'une paire active s'est révélée ambiguë à l'usage (constaté à l'exécution en
  // construisant ce contrôle) — terminer les deux d'un coup evite toute hypothèse non vérifiée
  // sur cette sémantique-là du protocole.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Un appui simple : contact puis relâchement immédiat, sans mouvement — sous le seuil de
 *  glissement par construction (aucun déplacement du tout). */
async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function autoTestTactile(nav) {
  console.log("Auto-test tactile — la jauge suit-elle vraiment le doigt (pas seulement « une commande est-elle partie ») :");
  const codeBundle = await bundlerGeste();
  const ctx = await nav.newContext({ viewport: { width: 343, height: 585 }, hasTouch: true });
  let echecs = 0;

  const cas = async (nom, verifier) => {
    const { ok, detail } = await verifier();
    console.log(`  ${ok ? '✓' : '✗'} ${nom}${detail ? ` — ${detail}` : ''}`);
    if (!ok) echecs++;
  };

  // A. Glissement vers la DROITE sur une lumière éteinte (0 %) : la valeur doit monter, d'une
  // amplitude cohérente avec les ~90 px parcourus sur une tuile de 160 px (dx/largeur × plage).
  await cas('glissement à droite augmente la valeur, amplitude cohérente', async () => {
    const page = await pageGeste(ctx, codeBundle,
      { etat: 'off', attributs: { supported_color_modes: ['hs'], brightness: 0 } });
    const cdp = await ctx.newCDPSession(page);
    await glisserAvecFantome(cdp, TUILE_Y, TUILE_GAUCHE + 15, TUILE_GAUCHE + 35, TUILE_GAUCHE + 105);
    const appels = await page.evaluate(() => window.__appels);
    await page.close();
    const v = appels.at(-1)?.[2]?.brightness_pct;
    const attendu = Math.round((90 / TUILE_LARGEUR) * 99);   // 0 % de départ, plage 1–100
    const ok = typeof v === 'number' && v > 0 && Math.abs(v - attendu) <= 5;
    return { ok, detail: `valeur finale ${v}%, attendue ~${attendu}% (${JSON.stringify(appels)})` };
  });

  // B. Glissement vers la GAUCHE sur une lumière à 90 % : la valeur doit descendre, même
  // exigence d'amplitude cohérente, symétrique du cas A.
  await cas('glissement à gauche diminue la valeur, amplitude cohérente', async () => {
    const page = await pageGeste(ctx, codeBundle,
      { etat: 'on', attributs: { supported_color_modes: ['hs'], brightness: Math.round(0.9 * 255) } });
    const cdp = await ctx.newCDPSession(page);
    await glisserAvecFantome(cdp, TUILE_Y, TUILE_GAUCHE + 145, TUILE_GAUCHE + 125, TUILE_GAUCHE + 55);
    const appels = await page.evaluate(() => window.__appels);
    await page.close();
    const v = appels.at(-1)?.[2]?.brightness_pct;
    const depart = 90;
    const attendu = Math.round(depart - (90 / TUILE_LARGEUR) * 99);
    const ok = typeof v === 'number' && v < depart && Math.abs(v - attendu) <= 5;
    return { ok, detail: `valeur finale ${v}%, attendue ~${attendu}% (départ ${depart}%)` };
  });

  // C. Glissement sur une tuile SANS jauge (serrure) : aucun réglage, un seul basculement —
  // immédiat, comme avant la tâche 13 (cf. `geste.ts`, branche `if (!d)`).
  await cas("glissement sur une tuile sans jauge ne règle rien, seul l'appui bascule", async () => {
    const page = await pageGeste(ctx, codeBundle,
      { etat: 'off', attributs: { supported_color_modes: ['hs'], brightness: 0 } });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: TUILE_GAUCHE + 15, y: SERRURE_Y, id: 0 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: TUILE_GAUCHE + 140, y: SERRURE_Y, id: 0 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const appels = await page.evaluate(() => window.__appels);
    const bascules = await page.evaluate(() => window.__bascules);
    await page.close();
    const ok = appels.length === 0 && bascules === 1;
    return { ok, detail: `${appels.length} appel(s) de réglage, ${bascules} basculement(s) (attendu 0 / 1)` };
  });

  // D. Appui simple (sans déplacement) sur une tuile À jauge : bascule toujours, aucun réglage —
  // condition non négociable du brief (« un simple appui continue de basculer »).
  await cas('appui simple sur une tuile à jauge bascule, sans déclencher de réglage', async () => {
    const page = await pageGeste(ctx, codeBundle,
      { etat: 'off', attributs: { supported_color_modes: ['hs'], brightness: 0 } });
    const cdp = await ctx.newCDPSession(page);
    await tap(cdp, TUILE_GAUCHE + 15, TUILE_Y);
    const appels = await page.evaluate(() => window.__appels);
    const bascules = await page.evaluate(() => window.__bascules);
    await page.close();
    const ok = appels.length === 0 && bascules === 1;
    return { ok, detail: `${appels.length} appel(s) de réglage, ${bascules} basculement(s) (attendu 0 / 1)` };
  });

  await ctx.close();
  console.log('');
  if (echecs) {
    console.error(`${echecs} cas d'auto-test tactile non détecté(s) comme attendu : la jauge ne suit pas fidèlement le doigt.`);
    return 1;
  }
  console.log('Auto-test tactile réussi : direction, amplitude, absence de réglage sans jauge et appui simple sont '
    + 'tous vérifiés par un vrai geste tactile (CDP), contact fantôme compris — pas seulement un décompte d\'appels.');
  return 0;
}

// --- Revue tâche 15 (I4) : le retour au contact est-il RÉELLEMENT instantané ? --------------
//
// C'est LA contrainte fondatrice du projet : ce projet existe parce que le propriétaire croyait
// ses appuis ignorés. Elle a déjà été cassée une fois en silence — à la tâche 10, un bloc CSS de
// mouvement (`.mvt-complet .commande`, spécificité 0-2-0) déclaré TROIS LIGNES trop bas
// l'emportait sur `.commande:active` (0-2-0 aussi) pour la propriété `transition` : un appui
// glissait sur 0,2 à 0,3 s au lieu de sauter, en `complet` (le défaut) ET en `aucun` (censé être
// le plus prudent des trois).
//
// Elle n'était protégée que par un test qui LIT L'ORDRE DES RÈGLES dans `base.css`
// (`tests/mouvement.test.ts`). Ce test garde son intérêt (il rougit vite, sans navigateur), mais
// jsdom ne calcule aucune cascade : ici, on demande au moteur de rendu la `transition-duration`
// EFFECTIVE, l'élément réellement enfoncé — un défaut de spécificité qu'un test qui lit du texte
// ne peut par construction pas voir.
//
// Tâche 8 (moteur de mouvement) : il n'y a plus « les trois niveaux » à boucler. `transform` et
// `opacity` sont désormais animés par le moteur via la Web Animations API, jamais par une
// transition CSS — la cascade de `.commande`/`.commande:active` ne dépend donc plus du tout d'une
// classe `mvt-*` posée sur `#app` (retirées de `base.css` cette même tâche) : il n'existe plus
// qu'UNE cascade à mesurer, pas trois variantes. `NIVEAUX_MOUVEMENT`/la boucle par niveau ont
// disparu avec elle — garder une boucle qui pose des classes que plus aucune règle ne lit aurait
// fait passer ce contrôle sans plus rien exercer de réel.
//
// Sur une FIXTURE et jamais sur une page réelle : appuyer sur une vraie tuile de la maison
// appellerait un vrai service Home Assistant (`light.turn_on`, `cover.set_cover_position`…) à
// chaque exécution de routine — inacceptable sur une maison habitée, et rédhibitoire à 2 h du
// matin. La fixture porte en revanche la VRAIE feuille de style, bundlée depuis `src/` par le
// même esbuild que l'application (`bundlerApplication`) : c'est bien la cascade défendue qui est
// mesurée, pas une réécriture. Aucun écouteur JS n'y est posé, donc l'appui ne déclenche rien.

function fixtureContact(css) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
    <body><div id="app" class="m3" style="width:${LARGEUR}px;height:${HAUTEUR}px;">
      <div class="corps">
        <div class="commandes">
          <div class="commande" id="tuile"><div><div class="t">Lumières</div></div></div>
        </div>
      </div>
    </div></body></html>`;
}

/** Toutes les durées déclarées valent-elles zéro ? `transition-duration` rend une liste
 *  (« 0s, 0s, 0s ») : une seule valeur non nulle suffit à faire glisser le retour. */
const toutesNulles = (duree) =>
  String(duree).split(',').every((d) => parseFloat(d) === 0);

async function autoTestContactInstantane(nav) {
  console.log('Auto-test du retour au contact — `transition-duration` EFFECTIVE lue dans le moteur '
    + 'de rendu (jamais un ordre de règles dans un fichier) :');
  const { css } = await bundlerApplication();
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  const page = await ctx.newPage();
  await page.setContent(fixtureContact(css));
  const cdp = await ctx.newCDPSession(page);
  const boite = await page.evaluate(() => {
    const r = document.getElementById('tuile').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });

  let echecs = 0;
  try {
    // AU REPOS d'abord — la contre-épreuve sans laquelle tout ce contrôle serait creux : si la
    // feuille de style ne s'appliquait pas (mauvais sélecteur, CSS non chargé), les durées
    // seraient nulles PARTOUT et le contrôle passerait en ne mesurant rien. La tuile garde au
    // repos ses transitions de `background`/`border-radius` (`.commande`, `base.css`) : c'est
    // seulement le CONTACT qui doit être instantané.
    const repos = await page.evaluate(() => {
      const el = document.getElementById('tuile');
      return { duree: getComputedStyle(el).transitionDuration };
    });

    // Doigt posé, et MAINTENU pendant la lecture : `:active` ne se simule pas depuis le JS.
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: boite.x, y: boite.y, button: 'left', clickCount: 1,
    });
    const actif = await page.evaluate(() => {
      const el = document.getElementById('tuile');
      return {
        matche: el.matches(':active'),
        duree: getComputedStyle(el).transitionDuration,
        proprietes: getComputedStyle(el).transitionProperty,
        // La couche d'état (`::after`, l'accusé de réception peint au contact) doit sauter
        // elle aussi : c'est ELLE que l'œil voit en premier.
        dureeCouche: getComputedStyle(el, '::after').transitionDuration,
      };
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: boite.x, y: boite.y, button: 'left', clickCount: 1,
    });

    const problemes = [];
    if (!actif.matche) problemes.push('la tuile n\'est pas passée en :active — mesure sans valeur');
    if (toutesNulles(repos.duree)) {
      problemes.push(`AU REPOS la durée est déjà nulle (${repos.duree}) : la feuille de style ne `
        + 's\'applique pas, ce contrôle ne mesure rien');
    }
    if (!toutesNulles(actif.duree)) {
      problemes.push(`transition-duration AU CONTACT = ${actif.duree} (sur ${actif.proprietes}) `
        + '— le retour glisse au lieu de sauter');
    }
    if (!toutesNulles(actif.dureeCouche)) {
      problemes.push(`couche d'état ::after au contact = ${actif.dureeCouche}`);
    }
    const ok = problemes.length === 0;
    if (!ok) echecs++;
    console.log(`  ${ok ? '✓' : '✗'} .commande:active — durée ${actif.duree} `
      + `(couche ::after ${actif.dureeCouche} ; au repos ${repos.duree}, non nulle comme attendu)`
      + `${ok ? '' : ` — ${problemes.join(' ; ')}`}`);
  } finally {
    await page.close();
    await ctx.close();
  }

  console.log('');
  if (echecs) {
    console.error('le retour au contact n\'est PAS instantané : la contrainte fondatrice du '
      + 'projet est cassée.');
    return 1;
  }
  console.log('Auto-test du retour au contact réussi : la tuile enfoncée a une `transition-duration` '
    + 'effective nulle — couche d\'état comprise — alors qu\'elle est non nulle au repos (preuve que '
    + 'la feuille de style est bien appliquée et que la mesure a un sens).');
  return 0;
}

// --- Tâche 18 : le cadre remplit-il l'écran DANS UN MOTEUR SANS `dvh` ? ---------------------
//
// LE DÉFAUT RÉEL, resté invisible dix-sept tâches durant. `#app { height: 100dvh }` était déclaré
// sans repli. En Chrome 100 (cuisine et salon, cf. `simulerMoteurSansDvh`) la déclaration est
// jetée, `height` retombe à `auto`, `#app` prend la hauteur de son CONTENU, et `.xl
// { margin-top: auto }` n'a plus aucun espace à absorber : le bouton « Toute la maison » flotte
// au milieu au lieu d'être ancré en bas. Mesuré sur les pages déployées, cadre 343×585 : le haut
// de `.xl` tombait à 417,7 px en cuisine et 502,9 px au salon, contre 510,9 px au bureau (Chrome
// 119, seul écran où `dvh` existe). Rien ne le signalait : `html, body { overflow: hidden }` ne
// produit aucune barre de défilement, aucun débordement, aucun texte tronqué — les quatre familles
// de défauts que ce fichier savait voir. Il n'y avait que du vide, et le vide ne rougit pas.
//
// CE QUE CE CONTRÔLE EXIGE, en permanence et dans les DEUX moteurs : `#app` occupe exactement la
// hauteur du viewport de mise en page (`document.documentElement.clientHeight`), le document ne
// déborde pas sous la zone visible, et `.xl` est ancré à son pied. Trois conditions, parce que la
// correction naïve (`height: 100vh` en repli) réparerait la première en cassant la deuxième si le
// WebView devait mesurer `vh` plus grand que sa zone visible — remplacer un bouton qui flotte par
// un bas d'écran rogné EN SILENCE (`overflow: hidden`) serait pire que le défaut d'origine.
//
// LA CONTRE-ÉPREUVE FAIT PARTIE DU CONTRÔLE. Le même contrôle tourne sur une feuille de style où
// la correction est neutralisée et la règle historique remise (`html, body { height: auto }` +
// `#app { height: 100dvh }`) : elle DOIT passer avec `dvh` et ÉCHOUER sans. Sans elle, ce contrôle
// pourrait très bien ne rien mesurer du tout (feuille non appliquée, sélecteur manqué, simulation
// sans effet) en restant vert — l'angle mort qu'il est précisément censé fermer.

/** Fixture volontairement SANS hauteur en ligne sur `#app` — tout l'objet du contrôle est la
 *  hauteur que la feuille de style lui donne (ou ne lui donne pas). Le squelette reprend celui des
 *  pages réellement servies (`config/www/wallpanel/*.html` : `<div id="app" data-piece class="m3">`,
 *  même `<meta name="viewport">`), et le contenu reste volontairement court : c'est un contenu qui
 *  NE REMPLIT PAS l'écran qui révèle un cadre sans hauteur, jamais un contenu qui déborde. */
function fixtureCadre(css) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
    <style>${css}</style></head>
    <body><div id="app" data-piece="cuisine" class="m3">
      <div class="cap"><div class="gauche"><div class="heure">14:00</div></div></div>
      <div class="corps">
        <div class="commandes"><div class="commande"><div><div class="t">Lumières</div></div></div></div>
        <div class="xl">Toute la maison</div>
      </div>
    </div></body></html>`;
}

/** Neutralise la correction et remet la règle d'avant la tâche 18, pour la contre-épreuve. Ajoutée
 *  EN FIN de feuille : même spécificité, dernière déclarée, donc c'est elle qui l'emporte — y
 *  compris en cassant la chaîne `html, body { height: 100% }` dont dépend un `#app { height: 100% }`
 *  (sans hauteur définie sur l'ancêtre, un pourcentage retombe sur `auto`). */
const CSS_HISTORIQUE = '\nhtml, body { height: auto; }\n#app { height: 100dvh; }\n';

/** Exécutée CÔTÉ NAVIGATEUR. `clientHeight` de `documentElement` est le viewport de MISE EN PAGE
 *  (le bloc conteneur initial), c'est-à-dire la boîte dans laquelle le moteur compose et peint —
 *  la référence exacte de la question posée, et la seule qui ne dépende ni de la version du moteur
 *  ni du support de `dvh`. */
function mesurerCadre() {
  const app = document.getElementById('app');
  if (!app) return { erreur: 'aucun #app dans le DOM' };
  const cadre = app.getBoundingClientRect();
  const corps = app.querySelector('.corps');
  const xl = app.querySelector('.xl');
  const rxl = xl ? xl.getBoundingClientRect() : null;
  return {
    hauteurApp: +cadre.height.toFixed(1),
    viewport: document.documentElement.clientHeight,
    hauteurCalculee: getComputedStyle(app).height,
    // Ce que le document réclame en plus de la zone visible : > 0 = du contenu est rogné en
    // silence par `html, body { overflow: hidden }`.
    debord: +(document.documentElement.scrollHeight - document.documentElement.clientHeight).toFixed(1),
    xlHaut: rxl ? +rxl.top.toFixed(1) : null,
    xlBas: rxl ? +rxl.bottom.toFixed(1) : null,
    // Le pied attendu de `.xl` : le bas du viewport moins le rembourrage bas de `.corps`, lu dans
    // le moteur plutôt que recopié en dur (il a déjà changé une fois).
    piedAttendu: corps
      ? +(document.documentElement.clientHeight - parseFloat(getComputedStyle(corps).paddingBottom)).toFixed(1)
      : null,
  };
}

/** Verdict commun à la fixture et aux pages réelles : une liste de reproches, vide si tout va bien.
 *  `.xl` n'est exigé ancré que s'il est présent — l'écran de nuit n'en a pas, et ce n'est pas un
 *  défaut. La hauteur, elle, est exigée dans tous les cas. */
function jugerCadre(m, { exigerXl = true } = {}) {
  if (m.erreur) return [m.erreur];
  const problemes = [];
  if (Math.abs(m.hauteurApp - m.viewport) > 1) {
    problemes.push(`#app fait ${m.hauteurApp} px pour un viewport de ${m.viewport} px `
      + `(height calculée : ${m.hauteurCalculee}) — le cadre ne réclame pas l'écran`);
  }
  if (m.debord > 1) {
    problemes.push(`le document déborde de ${m.debord} px sous la zone visible — rogné en silence `
      + 'par `html, body { overflow: hidden }`');
  }
  if (exigerXl) {
    if (m.xlBas === null) problemes.push('aucun `.xl` dans le rendu — mesure sans valeur');
    else if (Math.abs(m.xlBas - m.piedAttendu) > 1) {
      problemes.push(`.xl s'arrête à ${m.xlBas} px au lieu de ${m.piedAttendu} px `
        + `(haut à ${m.xlHaut} px) — le bouton flotte au lieu d'être ancré en bas`);
    }
  }
  return problemes;
}

const MOTEURS = [
  { nom: 'Chrome 119 (bureau) — `dvh` reconnu', sansDvh: false },
  { nom: 'Chrome 100 (cuisine, salon) — `dvh` inconnu', sansDvh: true },
];

async function autoTestCadre(nav) {
  console.log('Auto-test du cadre — `#app` occupe-t-il la hauteur du viewport dans les DEUX moteurs '
    + 'des tablettes (la vraie feuille de style, et la règle historique en contre-épreuve) :');
  const { css } = await bundlerApplication();
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  let echecs = 0;
  const feuilles = [
    { nom: 'feuille actuelle', css, doitPasser: () => true },
    // Doit passer AVEC `dvh` (c'est pourquoi le bureau n'a jamais rien montré) et échouer SANS.
    { nom: 'règle d\'avant la tâche 18 (`height: 100dvh` seule)', css: css + CSS_HISTORIQUE,
      doitPasser: (moteur) => !moteur.sansDvh },
  ];
  for (const f of feuilles) {
    for (const moteur of MOTEURS) {
      const page = await ctx.newPage();
      await page.setContent(fixtureCadre(moteur.sansDvh ? simulerMoteurSansDvh(f.css) : f.css));
      const m = await page.evaluate(mesurerCadre);
      await page.close();
      const problemes = jugerCadre(m);
      const attendu = f.doitPasser(moteur);
      const reussi = (problemes.length === 0) === attendu;
      if (!reussi) echecs++;
      console.log(`  ${reussi ? '✓' : '✗'} ${f.nom} / ${moteur.nom} — attendu : ${attendu ? 'conforme' : 'DÉTECTÉ EN FAUTE'}`);
      console.log(`      #app ${m.hauteurApp} px (calculée ${m.hauteurCalculee}) pour ${m.viewport} px de `
        + `viewport ; .xl ${m.xlHaut} → ${m.xlBas} (pied attendu ${m.piedAttendu}) ; débord ${m.debord} px`
        + `${problemes.length ? ` ; reproches : ${problemes.join(' ; ')}` : ''}`);
    }
  }
  await ctx.close();
  console.log('');
  if (echecs) {
    console.error(`${echecs} cas de cadre non jugé(s) comme attendu : le contrôle de hauteur a un angle mort.`);
    return 1;
  }
  console.log('Auto-test du cadre réussi : la feuille actuelle remplit l\'écran dans les deux moteurs, '
    + 'et la règle historique — verte avec `dvh`, donc invisible au bureau — est bien attrapée sans lui.');
  return 0;
}

/** Le même contrôle sur les VRAIES pages, servies par HA avec le vrai contenu, dans le moteur des
 *  deux tablettes en Chrome 100. La fixture ci-dessus prouve la règle CSS ; ceci prouve qu'aucun
 *  autre morceau du rendu réel (bandeau, blocs de mode, sous-vues) ne la contredit. */
async function verifierCadreSansDvh(nav, HA_URL, jetons, bundle, pieces, heure) {
  console.log('Cadre en moteur SANS `dvh` (Chrome 100 — cuisine et salon), sur les pages réelles :');
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  await ctx.addInitScript((j) => { localStorage.setItem('hassTokens', JSON.stringify(j)); }, jetons);
  await poserInterceptions(ctx, bundle, { sansDvh: true });
  let fautes = 0;
  for (const piece of pieces) {
    const page = await ctx.newPage();
    await page.clock.install({ time: heure });
    try {
      await page.goto(`${HA_URL}/local/wallpanel/${piece}.html`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(3500);
      const m = await page.evaluate(mesurerCadre);
      const problemes = jugerCadre(m);
      if (problemes.length) fautes++;
      console.log(`  ${problemes.length ? '✗' : '✓'} ${piece} — #app ${m.hauteurApp} px / viewport `
        + `${m.viewport} px ; .xl ${m.xlHaut} → ${m.xlBas} (pied attendu ${m.piedAttendu})`
        + `${problemes.length ? ` — ${problemes.join(' ; ')}` : ''}`);
    } catch (e) {
      console.log(`  ✗ ${piece} — exception : ${e.message}`);
      fautes++;
    } finally {
      await page.close();
    }
  }
  await ctx.close();
  return fautes;
}

// --- Revue finale (2026-08-06) : le moteur de mouvement, mesuré EN PIXELS ------------------
//
// LES TROIS DÉFAUTS QUE 676 TESTS UNITAIRES N'ONT PAS PU VOIR. Ils tiennent tous à la même
// cause : jsdom ne calcule ni cascade, ni mise en page, ni pixels. Un fantôme y mesure 0×0, une
// couleur héritée y vaut la valeur initiale, et deux aplats de couleurs différentes y sont
// indiscernables. Les trois contrôles ci-dessous ouvrent un vrai Chromium au format exact de la
// dalle, font tourner le VRAI moteur (`src/mouvement/moteur.ts`, bundlé à l'instant) sur la VRAIE
// feuille de style, et mesurent :
//
//   C1 — MODÈLE DE BOÎTE DES FANTÔMES. `fantomes.ts` écrivait une mesure `offsetWidth`/
//        `offsetHeight` (une BORDER-box) dans `width`/`height`, qui sont en CONTENT-box dans ce
//        projet (aucune remise à zéro globale de `box-sizing`, cf. `base.css`). Tout fantôme d'un
//        élément padé sortait donc trop grand de la somme de ses paddings. Relevé ICI, avant
//        correction : une tuile de 151×64 fantômée en 181×64, une vue d'accueil de 343×492 en
//        375×516 (en page réelle, une vue sans bandeau fait 343×585 et sortait en 375×609).
//        Contrôle : `fantôme.offsetWidth/offsetHeight === original.offsetWidth/offsetHeight`,
//        sur les deux chemins qui fabriquent des fantômes.
//
//   C2 — TYPOGRAPHIE HÉRITÉE DU FANTÔME DE CHIFFRE. `.chiffre` ne déclare que
//        `display: inline-block` : sa taille vient de `.heure` (42 px) et sa couleur de `.cap`
//        (`--md-on-primary`). Reparenté dans `#mvt-fantomes`, enfant direct de `#app`, le clone
//        perdait les deux — 16 px et une couleur quasi invisible sur le fond du bandeau (1,6:1).
//        Contrôle : mêmes `font-size`/`color`/`letter-spacing`/`line-height`/`font-family` que
//        l'original, ET contraste du fantôme sur le fond réel du bandeau au-dessus de 5:1.
//
//   C3 — LE TEXTE D'UNE TUILE BASCULE-T-IL SEULEMENT APRÈS LE FONDU DE FOND ? Le balayage (deux
//        couches JS rejouant en pixels un fondu déjà gratuit en CSS) a été retiré tâche 3 du
//        chantier grammaire (2026-08-22) : `.commande` fond son fond tout seul en 300 ms
//        (`transition: background .3s`). Sans garde, `lit` peint le texte dans sa couleur
//        d'ARRIVÉE dès la première image, pendant que le fond porte encore celle du DÉPART — du
//        blanc sur `#d8dee0`, ~1,6:1 contre un plancher projet de 5:1, mesuré avant correction.
//        La garde est `color 0s .3s` sur `.commande` : le texte ne bascule qu'à la FIN du fondu de
//        fond. jsdom ne calcule aucune cascade `transition` : un remaniement CSS qui perdrait ce
//        délai ne ferait rougir aucun test unitaire. Contrôle : `.commande` déclare une transition
//        sur `color` de durée nulle, dont le DÉLAI est égal à la durée de la transition de
//        `background` — un contrôle de cascade, pas une mesure de pixels : il n'y a plus de couche
//        à observer.

/** Le moteur de mouvement seul, bundlé depuis `src/` — même outil et même esprit que
 *  `bundlerGeste`/`bundlerApplication`. `lit` entre dans le bundle par le graphe d'imports réel de
 *  `moteur.ts`, jamais par une liste tenue à la main. */
async function bundlerMoteur() {
  const resultat = await esbuild.build({
    stdin: {
      contents: `export { creerMoteur } from './mouvement/moteur.ts';`,
      resolveDir: SRC_APP,
      loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', globalName: 'MoteurModule', target: 'es2020',
  });
  return resultat.outputFiles[0].text;
}

/** L'application réduite à son squelette réel : `#app.m3` vide, que le moteur remplit lui-même.
 *  `rendre` est remplacé par une écriture d'`innerHTML` — c'est l'injection prévue par
 *  `OptionsMoteur`, et elle laisse écrire les deux états à comparer en HTML littéral, donc
 *  exactement les marques (`data-mvt`) et les classes des gabarits réels, sans monter tout
 *  `demarrage.ts` ni une session Home Assistant. Le moteur, lui, est le VRAI : c'est lui qui
 *  relève, compare, fantôme et anime. */
function fixtureMouvement(css, codeBundle) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
    <style>${css}</style></head>
    <body><div id="app" data-piece="salon" class="m3"></div>
    <script>${codeBundle}</script>
    <script>
      window.__moteur = MoteurModule.creerMoteur(document.getElementById('app'), {
        rendre: (gabarit, hote) => { hote.innerHTML = gabarit; },
      });
      window.__peindre = (h) => window.__moteur.peindre(h);
    </script>
  </body></html>`;
}

/** Une tuile de commande, au format exact du gabarit réel (`rendu/corps.ts`, fonction `bouton`) :
 *  l'icône 24×24 en premier enfant, puis le bloc libellé/état. `--jauge` est posé dans l'attribut
 *  `style`, comme le fait `lit`. Ne porte plus `data-mvt-etat` depuis la tâche 3 (2026-08-22,
 *  retrait du balayage) — `rendu/corps.ts` ne le pose plus non plus sur la vraie tuile. */
const tuileFixture = (cle, actif, jauge) => `
  <div class="commande ${actif ? 'actif' : ''} ${jauge === null ? '' : 'jauge'}"
       data-mvt="tuile:${cle}"
       style="--jauge:${jauge ?? 0}">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
         stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 18h5.6"/></svg>
    <div><div class="t">Lumières</div><div class="s">${actif ? 'Allumé' : 'Éteint'}</div></div>
  </div>`;

/** Le bandeau réel, réduit à ce dont le rôle `chiffre` dépend : `.cap > .gauche > .heure >
 *  span.chiffre`. C'est cette chaîne d'ancêtres — et elle seule — qui donne au glyphe ses 42 px et
 *  sa couleur ; la reproduire est tout l'objet du contrôle C2. */
const bandeauFixture = (heure) => `
  <div class="cap"><div class="gauche">
    <div class="heure">${[...heure].map((c, i) =>
      `<span class="chiffre" data-mvt="chiffre:${i}" data-mvt-etat="${c}">${c}</span>`).join('')}</div>
    <div class="date">jeudi 6 août</div>
  </div><div class="droite"></div></div>`;

/** L'écran d'accueil. `rideau` est optionnel : c'est sa disparition qui produit le verdict
 *  `sortie` du contrôle C1 — le cas le plus fréquent de ces écrans (une commande qui devient
 *  indisponible, une rangée qui se réordonne). */
const vueAccueilFixture = ({ heure = '17:04', actif = false, rideau = true } = {}) =>
  `${bandeauFixture(heure)}
  <div class="corps" data-mvt="vue:accueil">
    <div class="etiquette">Ambiance</div>
    <div class="commandes">
      ${tuileFixture('lumiere', actif, actif ? 0.6 : 0)}
      ${rideau ? tuileFixture('rideau', false, null) : ''}
    </div>
  </div>`;

/** La vue « Tâches » telle que `demarrage.ts` la peint : elle sert de CIBLE à la traversée, jamais
 *  de sujet — le fantôme mesuré est celui de la vue SORTANTE, donc l'accueil (`343 × 492` px sous
 *  son bandeau, ce que le contrôle imprime lui-même). Elle est là pour qu'il y ait une vue où
 *  aller, et pour que le verdict rendu soit bien `traversee` (deux clés `vue:` différentes) plutôt
 *  qu'une pluie d'entrées et de sorties par enfant.
 *
 *  Re-revue — le commentaire d'origine annonçait mesurer ici « un `.corps` de 343×585, donc le
 *  pire cas exact du défaut C1 (375×609 mesurés) » : ces deux chiffres ne sont pas ceux que ce
 *  contrôle relève, et le sujet n'était pas le bon. Le contrôle, lui, était juste. */
const vueTachesFixture = `<div class="corps" data-mvt="vue:taches">
    <div class="etiquette">Tâches</div>
    <div class="ligne-tache" data-mvt="ligne:t1"><div class="lt-texte">Changer une pile</div></div>
  </div>`;

/** Le sRGB d'une couleur, qu'elle vienne d'un `getComputedStyle` (`rgb(...)`) ou d'un jeton lu
 *  brut dans la feuille de style (`#rrggbb`). */
function versRvb(v) {
  const brut = String(v).trim();
  if (brut.startsWith('#')) {
    const h = brut.slice(1);
    const paires = h.length === 3 ? h.split('').map((c) => c + c) : (h.match(/../g) ?? []);
    return paires.slice(0, 3).map((c) => parseInt(c, 16));
  }
  return (brut.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
}

const luminanceRvb = ([r, v, b]) => {
  const c = [r, v, b].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const contrasteRvb = (a, b) => {
  const [x, y] = [luminanceRvb(a), luminanceRvb(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

async function autoTestMouvement(nav) {
  console.log('Auto-test du moteur de mouvement — fantômes mesurés EN PIXELS, cascade CSS vérifiée (jsdom '
    + 'ne calcule ni cascade, ni mise en page, ni couleur) :');
  const { css } = await bundlerApplication();
  const codeBundle = await bundlerMoteur();
  const ctx = await nav.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR },
    reducedMotion: 'no-preference',
  });
  let echecs = 0;
  const cas = async (nom, verifier) => {
    let ok = false;
    let detail = '';
    try {
      ({ ok, detail } = await verifier());
    } catch (e) {
      ok = false;
      detail = `exception : ${e.message}`;
    }
    console.log(`  ${ok ? '✓' : '✗'} ${nom}${detail ? `\n      ${detail}` : ''}`);
    if (!ok) echecs++;
  };

  const nouvellePage = async (cssSup = '') => {
    const page = await ctx.newPage();
    await page.setContent(fixtureMouvement(css + cssSup, codeBundle));
    return page;
  };

  // C1 — la taille des fantômes, sur les DEUX chemins qui en fabriquent : la sortie d'une tuile
  // (le cas le plus fréquent de l'écran) et la traversée de vue (le plus grand, 343×585).
  await cas('C1 — un fantôme fait la taille de son original (sortie de tuile, traversée de vue)',
    async () => {
      const page = await nouvellePage();
      try {
        const m = await page.evaluate(([avecRideau, sansRideau, taches]) => {
          const taille = (sel) => {
            const el = document.querySelector(sel);
            return el ? [el.offsetWidth, el.offsetHeight] : null;
          };
          window.__peindre(avecRideau);
          const avantTuile = taille('.commande[data-mvt="tuile:rideau"]');
          const avantVue = taille('.corps[data-mvt="vue:accueil"]');
          window.__peindre(sansRideau);            // → verdict `sortie`
          const fantomeTuile = taille('#mvt-fantomes .commande');
          window.__peindre(taches);                // → verdict `traversee`
          // `#mvt-fond`, et non `#mvt-fantomes` : depuis la traversée en pile de cartes, la vue
          // sortante est le SEUL fantôme du projet à passer sous le contenu (`z-index: -1`), pour
          // servir de fond à l'écran qui glisse par-dessus. Chercher son clone dans le calque du
          // dessus le déclarerait « ABSENT » alors qu'il est bien là — ce que ce contrôle a
          // effectivement fait au premier passage après le changement.
          const fantomeVue = taille('#mvt-fond .corps');
          const boites = [...document.querySelectorAll('#mvt-fantomes > *, #mvt-fond > *')]
            .map((e) => getComputedStyle(e).boxSizing);
          return { avantTuile, avantVue, fantomeTuile, fantomeVue, boites };
        }, [vueAccueilFixture(), vueAccueilFixture({ rideau: false }), vueTachesFixture]);
        const dit = (t) => (t ? `${t[0]}×${t[1]}` : 'ABSENT');
        const memeTaille = (a, b) => Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
        const okTuile = memeTaille(m.avantTuile, m.fantomeTuile);
        const okVue = memeTaille(m.avantVue, m.fantomeVue);
        return {
          ok: okTuile && okVue,
          detail: `tuile ${dit(m.avantTuile)} → fantôme ${dit(m.fantomeTuile)}${okTuile ? '' : '  ✗'} ; `
            + `vue ${dit(m.avantVue)} → fantôme ${dit(m.fantomeVue)}${okVue ? '' : '  ✗'} ; `
            + `box-sizing des fantômes : ${m.boites.join(', ') || 'aucun'}`,
        };
      } finally { await page.close(); }
    });

  // C2 — la typographie du fantôme de chiffre. Le roulement de l'heure est l'élément le plus
  // regardé de ces écrans : 1440 fois par jour, sur trois murs.
  await cas('C2 — le fantôme d\'un chiffre garde la typographie et la couleur de son original',
    async () => {
      const page = await nouvellePage();
      try {
        const m = await page.evaluate(([a, b]) => {
          const lu = (el) => {
            const s = getComputedStyle(el);
            return { taille: s.fontSize, couleur: s.color, chasse: s.letterSpacing,
                     interligne: s.lineHeight, famille: s.fontFamily };
          };
          window.__peindre(a);
          const original = lu(document.querySelector('.heure .chiffre'));
          const fondCap = getComputedStyle(document.querySelector('.cap')).backgroundColor;
          window.__peindre(b);
          const f = document.querySelector('#mvt-fantomes .chiffre');
          return { original, fondCap, fantome: f ? lu(f) : null };
        }, [vueAccueilFixture({ heure: '17:04' }), vueAccueilFixture({ heure: '17:05' })]);
        if (!m.fantome) return { ok: false, detail: 'aucun fantôme de chiffre — mesure sans valeur' };
        const reproches = [];
        for (const cle of ['taille', 'couleur', 'chasse', 'interligne', 'famille']) {
          if (m.original[cle] !== m.fantome[cle]) {
            reproches.push(`${cle} : ${m.original[cle]} → ${m.fantome[cle]}`);
          }
        }
        const ratio = contrasteRvb(versRvb(m.fantome.couleur), versRvb(m.fondCap));
        if (ratio < CONTRASTE_MIN) {
          reproches.push(`contraste du fantôme sur le fond du bandeau : ${ratio.toFixed(2)}:1 `
            + `(plancher ${CONTRASTE_MIN}:1)`);
        }
        return {
          ok: reproches.length === 0,
          detail: `original ${m.original.taille} / ${m.original.couleur} ; fantôme `
            + `${m.fantome.taille} / ${m.fantome.couleur} sur ${m.fondCap} — ${ratio.toFixed(2)}:1`
            + `${reproches.length ? `\n      reproches : ${reproches.join(' ; ')}` : ''}`,
        };
      } finally { await page.close(); }
    });

  // C3 — `.commande` bascule-t-elle le texte SEULEMENT après la fin du fondu de fond ? Le
  // balayage (deux couches JS mesurées en pixels) a été retiré tâche 3 : plus rien à observer sur
  // l'écran, la garde entière tient dans une seule déclaration CSS (`color 0s .3s`) — un contrôle
  // de CASCADE suffit, jamais une capture d'écran.
  const mesurerTransitionCommande = async (cssSup) => {
    const page = await nouvellePage(cssSup);
    try {
      return await page.evaluate(([html]) => {
        window.__peindre(html);
        const s = getComputedStyle(document.querySelector('.commande'));
        return {
          props: s.transitionProperty.split(',').map((x) => x.trim()),
          durees: s.transitionDuration.split(',').map((x) => x.trim()),
          delais: s.transitionDelay.split(',').map((x) => x.trim()),
        };
      }, [vueAccueilFixture()]);
    } finally { await page.close(); }
  };

  // `background`/`color`, jamais `background-color` : c'est le nom du raccourci littéralement
  // déclaré dans `base.css` (`transition: background .3s, …`) que Chromium rend dans
  // `transitionProperty` — jamais la propriété longue qu'il développe en interne.
  const jugerTransitionCouleur = (m) => {
    const iFond = m.props.indexOf('background');
    const iCouleur = m.props.indexOf('color');
    const reproches = [];
    if (iFond === -1) reproches.push('aucune transition déclarée sur `background`');
    if (iCouleur === -1) reproches.push('aucune transition déclarée sur `color`');
    if (iFond !== -1 && iCouleur !== -1) {
      if (m.durees[iCouleur] !== '0s') {
        reproches.push(`transition \`color\` n'est pas instantanée (durée ${m.durees[iCouleur]})`);
      }
      if (m.delais[iCouleur] !== m.durees[iFond]) {
        reproches.push(`délai de \`color\` (${m.delais[iCouleur]}) ≠ durée de \`background\` `
          + `(${m.durees[iFond]})`);
      }
    }
    return reproches;
  };

  const detailTransition = (m) => `transition-property : ${m.props.join(', ')} ; durées `
    + `${m.durees.join(', ')} ; délais ${m.delais.join(', ')}`;

  await cas('C3 — `.commande` bascule le texte SEULEMENT à la fin du fondu de fond '
    + '(`color 0s`, délai = durée de `background`)', async () => {
      const m = await mesurerTransitionCommande('');
      const reproches = jugerTransitionCouleur(m);
      return {
        ok: reproches.length === 0,
        detail: detailTransition(m)
          + `${reproches.length ? `\n      reproches : ${reproches.join(' ; ')}` : ''}`,
      };
    });

  // Contre-épreuve (même discipline que le cadre, tâche 18, et que l'ancien contrôle C3 en
  // pixels) : remet EXACTEMENT le défaut essayé et écarté (cf. `base.css`, commentaire de
  // `color 0s .3s`) — les deux couleurs fondent ENSEMBLE, sans délai. Sans cette contre-épreuve,
  // le contrôle ci-dessus pourrait ne rien vérifier du tout (mauvais nom de propriété, mauvais
  // indice) et rester vert quand même.
  const CSS_COULEUR_SANS_DELAI = `
.commande { transition: background .3s, color .3s, border-radius .2s var(--ressort); }
`;

  await cas('C3 (contre-épreuve) — une transition `color` SANS délai EST attrapée', async () => {
    const m = await mesurerTransitionCommande(CSS_COULEUR_SANS_DELAI);
    const attrape = jugerTransitionCouleur(m).length > 0;
    return {
      ok: attrape,
      detail: detailTransition(m)
        + (attrape ? ' — bien attrapée' : ' — PAS attrapée : le contrôle ci-dessus ne prouve rien'),
    };
  });

  await ctx.close();
  console.log('');
  if (echecs) {
    console.error(`${echecs} contrôle(s) du moteur de mouvement en échec : ce qui s'anime sur les `
      + 'trois murs ne correspond pas à ce que le code croit animer.');
    return 1;
  }
  console.log('Auto-test du moteur de mouvement réussi : les fantômes ont la taille et la '
    + 'typographie de leur original, et le texte d\'une tuile ne bascule bien qu\'à la fin de son '
    + 'fondu de fond — contre-épreuve comprise.');
  return 0;
}

// --- Tâche 8 (garde-fou) : preuve que `comparerSignatures` sait vraiment échouer -----------
//
// I1 (revue finale) — FIXTURE CORRIGÉE : `.piege` vit maintenant SOUS une racine de vue marquée
// (`.ecran`, `vue:accueil`) plutôt qu'en enfant direct de `#app`. L'ancienne fixture posait
// `.piege` directement sous `#app`, une forme que l'application ne produit JAMAIS (chaque écran a
// sa propre racine `vue:*`) — elle ne prouvait donc rien sur le vrai défaut (I1) : avec l'ancien
// `couvert: el.closest('[data-mvt]') !== null`, `.piege` aurait été TROUVÉ « couvert » par
// `.ecran` dès qu'il en descend, alors même que `.ecran` ne bouge pas dans cette différence (elle
// existe, identique, avant ET après) — exactement le défaut que ce contrôle doit attraper. `.ecran`
// reste donc voulue STABLE entre `AVANT_MVT`/`APRES_MVT` (même chemin, mêmes classes) pour que la
// contre-épreuve porte sur la bonne question : un ancêtre marqué mais IMMOBILE ne couvre rien.
//
// Quatre éléments apparaissent sous `.ecran` ; un seul est fautif. `.enfant` est couvert par
// `.marque`, qui porte la sienne ET bouge dans la même différence (règle d'imbrication, tâche 5) ;
// `.marque` est couverte par elle-même. Seul `.piege` doit être signalé. Sans cette contre-épreuve,
// un contrôle toujours vert passerait pour un contrôle qui marche — exactement la discipline déjà
// appliquée à chaque autre auto-test de ce fichier.
const AVANT_MVT = `<div id="app"><div class="ecran" data-mvt="vue:accueil">
  <div class="socle"></div>
</div></div>`;
const APRES_MVT = `<div id="app"><div class="ecran" data-mvt="vue:accueil">
  <div class="socle"></div>
  <div class="piege">apparu sans marque, sous une racine de vue qui ne bouge pas</div>
  <div class="marque" data-mvt="bloc:x"><div class="enfant">couvert par son parent, qui bouge lui</div></div>
</div></div>`;

async function autoTestGardeFouMarques(nav) {
  console.log('Auto-test du garde-fou de marques de mouvement — un élément non marqué doit être vu, '
    + "un enfant couvert par la marque de son parent et un élément marqué ne le doivent pas, même "
    + 'sous une racine de vue marquée mais IMMOBILE :');
  const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR } });
  const page = await ctx.newPage();
  let ok = false;
  let detail = '';
  try {
    await page.setContent(AVANT_MVT);
    const avant = await releverSignatures(page);
    await page.setContent(APRES_MVT);
    const apres = await releverSignatures(page);
    const fautifs = comparerSignatures(avant, apres);
    const attendu = ['piege'];
    ok = JSON.stringify(fautifs) === JSON.stringify(attendu);
    detail = `attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(fautifs)}`;
  } catch (e) {
    detail = `exception : ${e.message}`;
  } finally {
    await ctx.close();
  }
  console.log(`  ${ok ? '✓' : '✗'} le piège est vu, l'enfant couvert et l'élément marqué sont épargnés `
    + `— ${detail}`);
  console.log('');
  if (!ok) {
    console.error('Auto-test du garde-fou de marques en échec : le contrôle ne détecte pas (ou '
      + 'détecte à tort) une apparition sans marque — il n\'a alors aucune valeur de preuve.');
    return 1;
  }
  console.log('Auto-test du garde-fou de marques réussi.');
  return 0;
}

// --- Point d'entrée -----------------------------------------------------------------------

async function main() {
  let nav;
  try {
    nav = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('Impossible de lancer Chromium via playwright-core.');
    console.error(`Détail : ${e.message}`);
    console.error('Un navigateur est peut-être manquant : `npx playwright install chromium` (télécharge');
    console.error('plusieurs centaines de Mo — à valider avant de lancer).');
    process.exitCode = 1;
    return;
  }
  try {
    if (process.argv.includes('--auto-test')) {
      // Deux classes de défauts distinctes, deux fonctions distinctes ; combinées ici pour que
      // `--auto-test` reste le point d'entrée unique « preuve que le vérificateur sait détecter
      // chaque défaut » (géométrie ET, depuis la tâche 15, fidélité du geste tactile).
      const codeGeometrie = await autoTest(nav);
      const codePeint = await autoTestPeint(nav);
      const codeTactile = await autoTestTactile(nav);
      // Revue tâche 15 (I4) : la contrainte fondatrice du projet, vérifiée dans le moteur de
      // rendu plutôt que par l'ordre des règles dans un fichier texte.
      const codeContact = await autoTestContactInstantane(nav);
      // Tâche 18 : la hauteur du cadre, dans le moteur des tablettes cuisine/salon — le seul
      // contrôle de ce fichier qui mesure quelque chose que le Chromium local ne peut PAS voir
      // spontanément, puisqu'il connaît `dvh` et que les deux tiers du parc ne le connaissent pas.
      const codeCadre = await autoTestCadre(nav);
      // Revue finale (2026-08-06) : les trois défauts du moteur de mouvement qu'aucun des 676
      // tests unitaires ne pouvait voir, faute de cascade, de mise en page et de pixels sous
      // jsdom. Même rôle ici que le contrôle de cadre juste au-dessus : mesurer ce que le
      // navigateur fait RÉELLEMENT, jamais ce que le code croit lui demander.
      const codeMouvement = await autoTestMouvement(nav);
      // Tâche 8 : la preuve que le GARDE-FOU lui-même (posé dans `evaluerPage`, jamais mesuré par
      // `autoTestMouvement` ci-dessus — lui teste le MOTEUR, pas la surveillance de ses marques)
      // sait détecter une apparition sans marque. Nom distinct volontaire, RENOMMÉ à la revue
      // finale (I1) en `autoTestGardeFouMarques` : l'ancien `autoTestMarquesMouvement` se
      // confondait au premier coup d'œil avec `autoTestMouvement` ci-dessus, qui teste tout autre
      // chose (le moteur, pas la surveillance de ses marques).
      const codeGardeFouMarques = await autoTestGardeFouMarques(nav);
      process.exitCode = codeGeometrie || codePeint || codeTactile || codeContact || codeCadre
        || codeMouvement || codeGardeFouMarques;
    } else {
      process.exitCode = await verifierPagesReelles(nav, { deploye: process.argv.includes('--deploye') });
      // Tâche 8 (garde-fou) — MOTIF DE SORTIE INDÉPENDANT et ADDITIF, jamais un remplacement. Le
      // débordement cuisine de 125 px (`déborde : DIV, t, s`, pages `jour`/`temps réel`) est une
      // dette ANTÉRIEURE à tout ce chantier — établi aux tâches 3 et 7 (`git stash` jusqu'au commit
      // d'avant la tâche 1, même échec, cf. `progress.md`) — et reste hors périmètre : le corriger
      // n'est pas ce que cette tâche demande, et le rendre bloquant ferait échouer le script en
      // permanence pour une raison qui n'est pas la nôtre. Le motif qu'on INTRODUIT (un élément qui
      // apparaît ou disparaît sans `data-mvt`), lui, doit faire sortir le script en code non nul
      // PAR LUI-MÊME, sans dépendre de ce que `verifierPagesReelles` a décidé pour ses propres
      // raisons — qu'il rende 0 ou 1, un manque de marque force le code de sortie à 1.
      // Incohérence ASSUMÉE entre ces deux familles de contrôles du même script, à lever le jour où
      // le débordement cuisine sera traité.
      if (totalFautifsMouvement > 0) process.exitCode = 1;
    }
  } finally {
    await nav.close();
  }
}

// Garde d'entrée standard Node/ESM : `analyserRendu`/`jugerResultat` sont exportées (utile pour
// les prouver depuis un autre script sans jamais les recopier) — sans cette garde, le simple
// fait d'IMPORTER ce fichier lancerait un vrai navigateur et une vraie session HA en effet de
// bord, découvert en écrivant la preuve de détection de la tâche 10 elle-même.
//
// 2026-09-12 : `MODES`, `NEUTRE` (par `poserMode`), `JOUR_COURT`, `pageDuMode`, `AFFICHES_PNG`,
// `lireIdentifiants` et `fabriquerJetons` sont exportés à leur tour, pour `mesurer-hauteurs.mjs`.
// Ce ne sont pas des commodités : `MODES` porte le PIRE CAS RÉEL de chaque mode (les états à
// injecter, la page où le mode est atteignable, le marqueur qui prouve qu'il est bien rendu),
// établi mesure après mesure depuis la tâche 13. Le recopier dans le second outil aurait donné
// deux tables qui disent la même chose — donc deux tables qui divergent, et un budget mesuré sur
// un pire cas qui n'est plus celui que ce vérificateur contrôle. Aucun comportement n'est changé
// ici : un `export` de plus ne s'exécute pas.
if (import.meta.url === `file://${process.argv[1]}`) await main();
