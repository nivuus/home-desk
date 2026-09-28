import { html, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Etat } from '../etat';
import type { Ecran, EntreeSynthese } from '../ecran';
import type { Alerte } from '../contexte';
import { icone } from './icones';
import { ENTITE_ENTRETIEN } from './defaut';
import { bouton, commandeActive, pressTile } from './tile';
import { ordreCommandes, type ContexteModes } from '../modes';
import { AGENCEMENT_DEFAUT, type Agencement, type Zone } from '../agencement';

/** Tâche 8 bis : `alerteActive` (`contexte.ts`) existe et est testée depuis la tâche 2, mais rien
 *  ne l'appelait — cette fonction rend ce que `demarrage.ts` calcule dans le même gabarit `.t`/`.v`
 *  que `.demain` (`base.css` — la RÉFÉRENCE structurelle documentée ci-dessous, plus le contenu
 *  effectif de `rendreCorps` depuis la correction de tâche 9 qui suit) : elle REMPLACE la zone
 *  météo (prévisions) dans `rendreCorps`, jamais en plus, pour que la hauteur totale de l'écran
 *  (585px, marge nulle) ne bouge pas selon qu'une alerte est active ou non.
 *  (Tâche 6, 2026-08-02 : `mediaEnCours`/`rendreMedia`, mentionnés à l'origine ici, ont disparu —
 *  la résolution par source, `media.ts`, et la carte média, `rendu/media.ts`, les remplacent.)
 *
 *  Tâche 9, correction 1 (coordinateur, 2026-08-02) : « Demain » a disparu de `rendreCorps` —
 *  `.demain` n'y est plus jamais rendu, seul `base.css` garde encore la règle CSS comme gabarit de
 *  référence (`.t`/`.v`) pour `.alerte`/`.hors-ligne`, cf. le test de gabarit dans
 *  `tests/corps.test.ts`. La pastille du bandeau (`agenda.ts` → `pastilleBandeau`, tâche 8) est
 *  désormais seule propriétaire du texte « Demain » (même `phraseDemain`, même donnée) : sans ce
 *  retrait, une fois la tâche 12 câblée, « Demain — 35° et de la pluie » se serait affiché deux
 *  fois sur la même tablette (bandeau ET corps) dès que rien de particulier ne se passe — c'est-
 *  à-dire dans le cas le plus courant — ce que le projet interdit.
 *
 *  Ronde de correction 1 : « même gabarit » veut dire même STRUCTURE, pas seulement même
 *  conteneur (padding/`border-radius`) — la version initiale rendait `a.texte` dans un `<span>`
 *  unique (une ligne), alors que `.demain`/`.media` portent tous les deux une étiquette
 *  (`.t`) suivie d'une valeur (`.v`), deux lignes. Le conteneur seul matchait, la hauteur réelle
 *  non : ça ne se voyait pas dans les tests (jsdom ne calcule aucune vraie mise en page) ni à
 *  l'écran (`.xl`, le bouton du bas, absorbe l'écart via `margin-top: auto` sur `.corps` en
 *  `flex`), mais la hauteur cessait de dépendre uniquement des tailles de police déclarées.
 *  `rendreAlerte` reprend maintenant la même structure `.t`/`.v` que la carte média
 *  (`rendreCarteMedia`, `rendu/media.ts`).
 *
 *  Ronde de correction 2 : la première ligne portait le mot générique « Alerte », qui ne dit
 *  rien — le fond rouge (`--md-error-container`) porte déjà cette information, et l'icône est la
 *  même quelle que soit l'alerte. Contrairement à « Demain »/« En cours » (qui lèvent une
 *  ambiguïté réelle : sans eux, `.v` serait un texte nu sans contexte), « Alerte » répétait
 *  l'évidence sur un bloc déjà signalé par sa couleur — au mépris de la propre règle de ce
 *  fichier pour les commandes (`commandeActive` : « c'est la couleur qui porte l'information,
 *  jamais un code à retenir »). La première ligne porte maintenant `a.sujet` (« Croquettes »,
 *  « Fontaine », « Porte »... — porté par la règle elle-même dans `alertes.ts`, jamais déduit
 *  ici), lisible d'un coup d'œil depuis l'autre bout de la pièce ; la seconde garde la phrase
 *  complète (`a.texte`). */
export function rendreAlerte(a: Alerte): TemplateResult {
  return html`<div class="alerte" data-zone="blocCentral" data-mvt="bloc:alerte">${icone('lock')}
    <div><div class="t">${a.sujet}</div><div class="v">${a.texte}</div></div></div>`;
}

/** Tâche 9 : rendu quand `demarrage.ts` détecte plus de 30 s de silence websocket
 *  (`Connexion.surSilence`). Même gabarit `.t`/`.v` que `rendreAlerte`/la carte média
 *  (`rendreCarteMedia`, `rendu/media.ts`), dans le même emplacement — il les remplace, jamais en
 *  plus, pour que la hauteur de l'écran ne bouge pas (cf. `demarrage.ts`, où il prime sur les
 *  deux). Le reste de l'écran (bandeau, commandes,
 *  synthèse) continue d'afficher le dernier état connu, grisé par `.muet` sur `#app` : un écran
 *  qui se vide ou qui ment vaudrait pire qu'un écran éteint (cf. brief tâche 9). */
export function rendreHorsLigne(): TemplateResult {
  return html`<div class="hors-ligne" data-zone="blocCentral" data-mvt="bloc:hors-ligne">${icone('horsligne')}
    <div><div class="t">Hors ligne</div><div class="v">Dernières données connues</div></div></div>`;
}

/** Évalue une seule entrée déclarée, sans jamais regarder le domaine de l'entité (ronde de
 *  correction 1 : l'ancienne version dispatchait sur `id.startsWith('lock.'/'binary_sensor.'/…)`,
 *  ce qui laissait `cover.rideau_salon` et `sensor.purificateur_air_pm2_5` — déclarés mais
 *  reconnus par aucune branche — ne produire aucun écart, silencieusement, quel que soit leur
 *  état).
 *
 *  `<`/`>` sont traités en premier : l'union discriminée de `EntreeSynthese` (ronde de
 *  correction 2) garantit à la compilation que `entree.valeur` y est un `number`, donc pas
 *  besoin de `typeof` ici — un `<`/`>` sur une chaîne n'est plus une valeur représentable. Pour
 *  `==`/`!=`, comparaison numérique si `valeur` est un nombre (égalité numérique, ex. un futur
 *  compteur exact), textuelle sinon (les verrous/capteurs binaires actuels). */
function estEcart(etatBrut: string, entree: EntreeSynthese): boolean {
  if (entree.operateur === '<') return Number(etatBrut) < entree.valeur;
  if (entree.operateur === '>') return Number(etatBrut) > entree.valeur;
  if (typeof entree.valeur === 'number') {
    const n = Number(etatBrut);
    return entree.operateur === '!=' ? n !== entree.valeur : n === entree.valeur;
  }
  return entree.operateur === '!=' ? etatBrut !== entree.valeur : etatBrut === entree.valeur;
}

/** Résout les deux marqueurs génériques d'une entrée de synthèse : `{etat}` (déjà documenté sur
 *  `EntreeSynthese.texte`) puis `{s}`, la marque du pluriel français. `{s}` s'efface si le
 *  nombre extrait de l'état vaut 1 (ou -1), devient `s` sinon — le cas le plus courant du
 *  français (« tâche »/« tâches »), qui couvre tout compteur sans qu'aucun texte n'ait besoin
 *  d'écrire sa propre condition d'accord. Général et non un cas particulier de « tâches » :
 *  n'importe quelle future entrée à compteur peut réutiliser `{s}` sans toucher à cette fonction.
 *  Si l'état n'est pas numérique, `{s}` n'est jamais rencontré aujourd'hui (seules les entrées à
 *  compteur le portent) ; au cas où, on le retire sans rien pluraliser plutôt que de laisser le
 *  marqueur brut à l'écran. */
function formaterTexte(texte: string, etatBrut: string): string {
  const t = texte.replace('{etat}', etatBrut);
  const n = Number(etatBrut);
  return t.replace(/\{s\}/g, Number.isFinite(n) && Math.abs(n) === 1 ? '' : 's');
}

/** N'affiche que ce qui sort de l'ordinaire, mais reste PERMANENTE : un bloc qui disparaît
 *  laisserait un vide les jours où rien ne cloche. Se contente d'évaluer les entrées déclarées
 *  dans `piece.synthese` (voir `ecran.ts`) — aucune inférence ici. */
export function ligneSynthese(etat: Etat, entites: EntreeSynthese[]): { texte: string; ecarts: string[] } {
  const ecarts: string[] = [];
  for (const entree of entites) {
    if (!etat.estUtilisable(entree.entite)) {
      // Décision 8 : une entrée qui NOMME son absence la dit, au lieu d'être
      // sautée en silence. Cf. `absenceNommee` (`ecran.ts`).
      if (entree.absenceNommee) ecarts.push(entree.absenceNommee);
      continue;
    }
    const e = etat.lire(entree.entite)!;
    if (estEcart(e.etat, entree)) ecarts.push(formaterTexte(entree.texte, e.etat));
  }
  return { texte: ecarts.length ? 'Tout est fermé —' : 'Tout est fermé, rien à signaler', ecarts };
}

/** `data-zone` — INERTE POUR LE RENDU, et lu par une seule machine : `outils/mesurer-hauteurs.mjs`,
 *  qui relève dans un vrai navigateur ce que chaque zone de l'écran coûte en pixels. Ces hauteurs
 *  vivent ensuite dans `contrat/budget.json` (clé `hauteurs`), d'où `combien()` (`src/modes.ts`)
 *  les relit pour CALCULER le nombre de commandes au lieu d'appliquer une table calibrée sur les
 *  585 px des Fire 7 — c'est ce qui permet à l'intégration Home Assistant de répondre « cet écran
 *  déborde de tant » pour une tablette quelconque.
 *
 *  Attribut SÉPARÉ de `data-mvt`, délibérément : `data-mvt` appartient au moteur de mouvement
 *  (`mouvement.ts`), qui nomme des RÔLES d'animation (`bloc:`, `ligne:`, `detail:`). Deux
 *  consommateurs sur un même attribut, c'est un couplage payé au premier changement d'animation.
 *
 *  Les zones nommées, et où elles sont posées :
 *    `bandeau`           — `.cap`, la racine du bandeau (`rendu/bandeau.ts`) ;
 *    `etiquetteAmbiance` — le titre « Ambiance », un enfant de `.corps` à part entière ;
 *    `rangeeAmbiance`    — le `.groupe` des tuiles d'ambiance ;
 *    `commandes`         — la grille `.commandes` ENTIÈRE (plusieurs rangées) — l'outil en
 *                          déduit le coût d'UNE rangée avec le `row-gap` réel de la grille ;
 *    `blocCentral`       — le bloc du mode, quel qu'il soit : `.mode-bloc` (repas/agenda/
 *                          entretien/ménage/aération/recette réduite), `.alerte`, `.hors-ligne`,
 *                          `.media`, `.voiture`, `.minuteurs`. Un seul NOM pour tous : c'est
 *                          l'outil qui sait quel mode il a posé, et ce fichier n'a pas à
 *                          connaître le vocabulaire du budget ;
 *    `synthese`          — la ligne de synthèse, permanente, plus bas dans ce fichier ;
 *    `touteLaMaison`     — le grand bouton `.xl` du pied, présent dans tous les modes. */
/** Une zone mobile, rendue. `undefined` = la zone n'a rien à montrer sur cet écran (le salon sans
 *  rangée d'ambiance, un mode sans bloc central) et disparaît COMPLÈTEMENT — pas un `.groupe`
 *  vide, qui resterait un enfant de la colonne flex et coûterait une gouttière de 8 px que le
 *  budget n'a pas. C'est la règle posée le 2026-08-29 pour la rangée d'ambiance, ici généralisée. */
type RenduZone = TemplateResult | undefined;

export function rendreCorps(
  etat: Etat, piece: Ecran,
  // Renommé depuis `enTete` (tâche 9, 2026-08-02) : ce bloc n'a jamais été un en-tête, c'est le
  // bloc CENTRAL de l'écran, celui que le mode principal occupe. Fourni par `demarrage.ts`, qui
  // seul connaît le mode — `rendreCorps` reste une fonction de présentation.
  //
  // Tâche 14 (2026-08-03) : `prev`/`maintenant` ont disparu de cette signature avec le mode
  // `previsions` — `rendreCorps` ne calcule plus jamais son propre bloc central par défaut,
  // `blocCentral` le porte désormais dans TOUS les cas (repas/agenda compris, cf.
  // `rendu/defaut.ts`, câblés par `demarrage.ts`), exactement comme il le fait déjà pour
  // alerte/média/ménage/aération/voiture depuis la tâche 8 bis. Un mode sans rien à montrer
  // (plan de repas vide, plus de rendez-vous aujourd'hui) transmet `undefined` — même contrat
  // qu'avant, seulement plus jamais de calcul interne à ce fichier pour le remplir tout seul.
  blocCentral?: TemplateResult,
  // Optionnel et en dernière position : sans lui, on garde exactement le comportement d'avant
  // (toutes les commandes utilisables, dans leur ordre déclaré) — c'est ce qui laisse les tests
  // existants verts sans les réécrire.
  ctx?: ContexteModes,
  // Tâche 3 : tuile d'entrée du minuteur, fournie par `demarrage.ts` (seul à connaître l'état du
  // réglage — cf. tâche 7). Rendue À LA SUITE des ambiances : la rangée du haut est la seule qui
  // puisse l'accueillir sans coûter une rangée de plus, et le budget de hauteur de l'accueil
  // cuisine est déjà saturé (585px, marge nulle). Optionnel et en dernière position, comme `ctx` :
  // le salon et le bureau ne le passent jamais et continuent de rendre exactement trois tuiles.
  tuileMinuteur?: TemplateResult,
  // Tâche 17 : le bloc central affiche À CET INSTANT le détail des tâches d'entretien
  // (`rendreEntretien`, `rendu/defaut.ts`) — la ligne de synthèse doit alors taire son
  // « 3 tâches d'entretien », sinon le même compte s'écrit deux fois sur la même tablette, ce que
  // le projet interdit. Même patron EXACT que `masquerRdv` (`pastilleBandeau`, `agenda.ts`,
  // tâche 14), et pour la même raison de préséance : c'est le petit emplacement qui cède, jamais
  // le bloc central — plus grand, plus lisible, et seul à porter le détail.
  //
  // Décidé par `demarrage.ts` sur ce qui est RÉELLEMENT rendu, jamais sur la pièce (contrairement
  // à `masquerRdv`, posé lui sur `agencement.blocDefaut === 'agenda'`) : un soir où un plat est planifié, ou
  // pendant qu'un mode prioritaire confisque le bloc, l'entretien n'est affiché nulle part et la
  // synthèse doit le reprendre.
  // Relecture finale du plan 2 (I4) : « réellement rendu » veut dire DEUX choses depuis que la
  // tâche 3 a fait de la composition une donnée — que le bloc central calculé soit bien celui de
  // l'entretien, ET que `agencement.zones` contienne la zone `blocCentral`, faute de quoi ce
  // gabarit ne place rien. `demarrage.ts` vérifie désormais les deux ; il ne vérifiait que la
  // première, et la synthèse pouvait taire une mention que rien n'affichait.
  // Optionnel et en dernière position comme `ctx`/`tuileMinuteur` : sans lui, comportement d'avant
  // cette tâche, à l'identique.
  masquerEntretien = false,
  // Tâche 6 (2026-08-17) : la tuile qui ouvre `#recette` n'a de sens que s'il y a une recette à
  // ouvrir. Décidé par `demarrage.ts` sur ce qui est RÉELLEMENT disponible (une note du plan de
  // repas n'a pas de recette), jamais sur la pièce — même patron que `masquerEntretien`.
  recetteOuvrable = false,
  // Tâche 3 du plan 2 : l'ORDRE des zones mobiles vient de l'agencement de l'écran. Facultatif et
  // en dernière position, comme `ctx`/`tuileMinuteur`/`masquerEntretien`/`recetteOuvrable` avant
  // lui : sans lui, l'ordre est celui d'`AGENCEMENT_DEFAUT`, c'est-à-dire exactement celui que ce
  // gabarit écrivait en dur. Les tests de rendu existants restent donc verts sans être réécrits.
  agencement?: Agencement,
): TemplateResult {
  // Modulateur `invites` : les écarts marqués `perso` (voiture, entretien) disparaissent — ils ne
  // regardent que Maxime. La porte déverrouillée, elle, reste : c'est une information de sécurité
  // qui concerne tout le monde dans la pièce, invités compris.
  const visibles = ctx?.modeInvites ? piece.synthese.filter((e) => !e.perso) : piece.synthese;
  const entrees = masquerEntretien
    ? visibles.filter((e) => e.entite !== ENTITE_ENTRETIEN) : visibles;
  const s = ligneSynthese(etat, entrees);
  // Une commande qui NOMME son absence n'est jamais filtrée : c'est tout
  // l'intérêt du champ (cf. `absenceNommee`, `ecran.ts`).
  const utilisables = piece.commandes.filter(
    (c) => etat.estUtilisable(c.entite) || c.absenceNommee !== undefined);
  // Le second filtre : la tuile `#recette` n'a de sens que s'il y a une recette
  // à ouvrir. `recetteOuvrable` vaut faux dans DEUX cas que rien ne distinguait
  // ici — le garde-manger répond mais n'a rien de planifié (la tuile doit bien
  // disparaître), et le garde-manger n'est pas installé du tout (elle doit
  // rester, pour nommer son absence). Sans cette seconde condition, ce filtre
  // reprenait exactement ce que le premier venait de laisser passer.
  const affichables = recetteOuvrable
    ? utilisables
    : utilisables.filter((c) => c.vue !== '#recette' || !etat.estUtilisable(c.entite));
  const commandes = ctx ? ordreCommandes(affichables, ctx) : affichables;

  // Les quatre zones mobiles, extraites du gabarit unique qu'elles formaient avant cette tâche —
  // chacune rend EXACTEMENT ce que ce gabarit rendait pour elle, commentaires HTML compris (ils
  // voyagent avec leur zone et disparaissent donc avec elle, cf. `RenduZone` ci-dessus). Le seul
  // déplacé qui ne l'est pas verbatim est `blocCentral` : voir son commentaire dans la table
  // `ZONES` plus bas — il n'a jamais eu de gabarit propre ici, seulement une place.
  const RENDU_AMBIANCES = html`
        <!-- 2026-08-29 : la rangée entière — étiquette comprise — disparaît quand la pièce n'a rien
             à y mettre (le salon, qui a rendu ses trois scènes pour financer ses quatre commandes
             permanentes, cf. ecran.ts). Le retrait doit être COMPLET, exactement pour la même
             raison que la rangée de commandes du mode minuteur juste en dessous : .corps est une
             colonne flex à gouttière de 8 px, donc un .groupe vide n'aurait aucune hauteur propre
             mais resterait un enfant à part entière — une gouttière de plus que rien ne comble,
             dans un budget qui n'a pas 8 px à perdre. Et une étiquette Ambiance seule au-dessus du
             vide serait un titre orphelin.
             La condition regarde AUSSI tuileMinuteur : une pièce sans ambiance déclarée à qui
             demarrage.ts passe quand même la tuile d'entrée du minuteur garde bien sa rangée.
             Aucune pièce n'est dans ce cas aujourd'hui — la condition le prévoit plutôt que de le
             laisser se découvrir un jour à l'écran.
             (Pas de guillemet oblique dans ce commentaire : il vit DANS un template literal.) -->
        <div class="etiquette" data-zone="etiquetteAmbiance">Ambiance</div>
        <!-- Tâche 3 : --ambiances porte le compte RÉEL de tuiles, la tuile minuteur comprise —
             c'est cette variable que .groupe (base.css) lit pour son nombre de colonnes
             (repeat(var(--ambiances, 3), …)). Le repli à 3 dans le CSS garde intact tout rendu
             qui ne publierait pas la variable (le bureau, qui ne passe jamais tuileMinuteur,
             et les anciens tests/pages en cache). -->
        <div class="groupe" data-zone="rangeeAmbiance" style="--ambiances: ${piece.ambiances.length + (tuileMinuteur ? 1 : 0)}">
          <!-- Tâche 13, décision délibérée : la rangée Ambiance ne passe JAMAIS par le
               dispatcher de geste, même quand une de ses entrées enveloppe un appareil réglable.
               Cette rangée est visuellement/sémantiquement une rangée de SCÈNES (tuiles étroites,
               ~100 px, coins arrondis en paire première/dernière) ; un appareil qui mérite une
               jauge est de toute façon réglable comme tuile normale sur la vue Toute la maison
               (TOUTE_LA_MAISON, rendu/maison.ts) — cf. rapport de tâche 13, réserves.
               2026-08-29 : c'est aussi ce qui a motivé la descente de la Hotte et du Rideau de
               cuisine vers les commandes — cette rangée ne rend NI état NI fond actif, elle ne
               pouvait donc pas répondre à « on ne voit pas l'état de la lumière hotte ».
               (Pas de guillemet oblique dans ce commentaire : il vit DANS un template literal.) -->
          ${piece.ambiances.map((a) => html`
            <div class="ambiance" data-mvt="tuile:amb-${a.entite}"
                 @pointerdown=${() => pressTile(etat, a)}>
              ${icone(a.icone)}<span>${a.libelle}</span></div>`)}
          ${tuileMinuteur ?? ''}
        </div>`;
  const RENDU_COMMANDES = html`
        <!-- repeat CLÉ PAR ENTITÉ, jamais un simple .map : sans clé, lit réutilise les nœuds DOM DANS
             L'ORDRE et se contente de réécrire leur contenu. Une tuile qui change de rang
             deviendrait alors un nœud qui change de texte — et le FLIP de mouvement.ts animerait
             un déplacement qui n'a pas eu lieu, en laissant le vrai changement se faire par un saut
             de contenu. Avec la clé, lit DÉPLACE le nœud, et FLIP a quelque chose de réel à animer.

             Tâche 10 bis : la rangée de commandes n'est rendue QUE si combien(mode) en laisse au
             moins une (mode minuteur, cf. modes.ts) — un conteneur vide n'aurait aucune hauteur
             propre, mais resterait un enfant à part entière de .corps en flex/gap 8px, ce qui
             ajouterait un intervalle de plus (8px) que rien ne viendrait combler : une rangée vide
             qui laisse un trou, exactement ce que ce budget de hauteur ne peut pas se permettre de
             gaspiller. -->
        <!-- C2 (revue finale) — role ligne:commandes, PAS bloc:commandes : le rôle bloc entre dans
             l'appariement du croisement de diff.ts (« un bloc central qui en remplace un autre »),
             à la seule condition de MÊME POSITION entre une sortie et une entrée. .corps est une
             colonne flex et .commandes précède immédiatement le bloc central : retirer un enfant
             d'une colonne flex donne à son successeur exactement son offsetTop — arithmétique, pas
             un cas rare. Résultat mesuré : bloc:commandes à [16, 202] avant un minuteur lancé en
             cuisine, bloc:minuteur-solo au MÊME [16, 202] après — comparer() les appariait donc en
             un seul croisement, fondant le clone de la rangée de commandes par-dessus le minuteur
             entrant pendant que le vrai bloc remplacé partait en sortie sèche à côté. Le rôle ligne
             a exactement le comportement voulu ici (entrée/sortie/déplacement, cf. jouer() dans
             moteur.ts) sans jamais entrer dans cet appariement, réservé au seul rôle bloc.
             (Note tâche 3 du plan 2 : cette mesure suppose l'agencement PAR DÉFAUT, où commandes
             précède effectivement blocCentral. Un agencement personnalisé qui inverserait les deux
             n'est pas revisité ici — hors périmètre de cette tâche.) -->
        <div class="commandes" data-zone="commandes" data-mvt="ligne:commandes">
          ${repeat(commandes, (c) => c.entite,
                   (c) => bouton(etat, c, etat.estUtilisable(c.entite)
                     && commandeActive(c.entite, etat.lire(c.entite)!.etat), 'commande'))}
        </div>`;
  const RENDU_SYNTHESE = html`
        <!-- Tâche 18 : la ligne de synthèse ouvre la vue Tâches (rendu/taches.ts) — demande
             explicite du propriétaire (« appuyer dessus pour voir la liste »). Toujours active,
             même quand aucun écart n'est affiché ou que l'écart montré n'est pas une tâche (porte
             déverrouillée, rideau ouvert...) : ce que ce tap ouvre, ce sont TOUJOURS les listes
             todo.* de la pièce (cf. listesTachesPiece, cochage.ts), jamais l'écart affiché au
             moment précis du contact — les trois pièces ont chacune au moins une liste, l'accès
             reste donc toujours pertinent.

             Ronde de correction 1 (tâche 10 bis) : le texte est maintenant enveloppé dans
             synthese-texte, borné à 2 lignes (-webkit-line-clamp, base.css) — sans lui, cette
             ligne grandit SANS PLAFOND avec le nombre d'écarts réellement actifs en même temps
             (porte déverrouillée, rideau ouvert, voiture à brancher, tâches d'entretien : jusqu'à
             quatre, un jour ordinaire de rideau ouvert et de liste d'entretien non vide) — mesuré à
             +16 px par ligne supplémentaire, largement responsable du dépassement du mode voiture
             découvert en relecture (574 → 590 px). .synthese elle-même reste la ligne tapable en
             flex (icône + bloc de texte), inchangée.

             Marques (2026-08-25) : ces deux éléments ne changent jamais de forme, mais ils
             CHANGENT DE PLACE — le bloc central au-dessus d'eux apparaît, disparaît et change de
             hauteur d'un mode à l'autre, ce qui les décale tous les deux. Sans marque, ce
             glissement était un saut sec, et verifier-rendu.mjs le signalait (8 éléments sur la
             page cuisine, en comptant les enfants de .synthese). Marquer .synthese couvre
             .synthese-texte et .ecart, qui sont ses descendants : la règle d'imbrication veut
             un ancêtre STRICT qui bouge dans la même différence, pas une marque sur chaque nœud. -->
        <div class="synthese" data-zone="synthese" data-mvt="ligne:synthese"
             @pointerdown=${() => (location.hash = '#taches')}>${icone('lock')}
          <div class="synthese-texte">${s.texte} <span class="ecart">${s.ecarts.join(', ')}</span></div>
        </div>`;

  // Table zone -> rendu, construite ICI pour capturer les variables locales ci-dessus (piece,
  // tuileMinuteur, commandes, blocCentral, RENDU_*). L'ORDRE d'itération vient de l'agencement,
  // jamais de l'ordre des clés de cet objet.
  const ZONES: Record<Zone, () => RenduZone> = {
    ambiances: () => (piece.ambiances.length || tuileMinuteur ? RENDU_AMBIANCES : undefined),
    // blocCentral n'a jamais eu de gabarit à LUI dans ce fichier : ce paramètre porte déjà son
    // propre data-zone="blocCentral" (media.ts, modes.ts, defaut.ts, minuteur.ts, voiture.ts, ce
    // fichier pour alerte/hors-ligne) depuis la tâche 14. Placé TEL QUEL, jamais enveloppé ni
    // remarqué — envelopper casserait le couplage data-zone/data-mvt que porte déjà chaque
    // gabarit de mode, et briserait l'appariement de mouvement.ts qui s'attend à ce marqueur en
    // position de racine du bloc. Absent (undefined) → rien ne s'affiche ici et l'écran se
    // resserre d'autant, exactement comme un mode sans rien à montrer ; fourni → il remplace,
    // jamais en plus, sinon le budget de hauteur saute.
    //
    // Tâche 9, correction 1 (coordinateur, 2026-08-02) : « Demain » n'a JAMAIS sa place ici — la
    // pastille du bandeau (agenda.ts, pastilleBandeau, tâche 8) retombe déjà sur « Demain » +
    // phraseDemain(demain) en permanence dès qu'il n'y a ni anniversaire ni rendez-vous proche.
    // Le corps ne connaît donc plus demain du tout : le bandeau en est seul propriétaire, jamais
    // deux fois la même donnée sur la même tablette.
    blocCentral: () => blocCentral,
    commandes: () => (commandes.length ? RENDU_COMMANDES : undefined),
    synthese: () => RENDU_SYNTHESE,
  };
  // Relecture finale du plan 2 (I2) : repli PAR CHAMP, jamais par objet. `(agencement ??
  // AGENCEMENT_DEFAUT).zones` lisait le `??` au niveau de l'OBJET — un agencement PARTIEL n'est
  // pas `undefined`, donc `zones` l'était, et le `.map` ci-dessous levait
  // `TypeError: Cannot read properties of undefined (reading 'map')`. C'est la règle que la
  // tâche 4 vient de poser sur `combien` (« le moteur de rendu l'appelle : un écran mal configuré
  // aurait fait un ÉCRAN BLANC, ce que ce projet s'interdit au même titre que le bouton mort »)
  // rentrée par une autre porte, dans la même branche. `modePrincipal` et `modulateursActifs`
  // (`modes.ts`) retombent déjà par champ (`c.modes ?? AGENCEMENT_DEFAUT.modes`) : ce fichier
  // était le seul des trois consommateurs de cette donnée facultative à lever.
  // Le rendu DÉGRADE, la saisie REFUSE : `$defs/agencement` exige désormais les trois champs
  // (`contrat/ecran.schema.json`), ce que le type `Agencement` disait déjà.
  const zones = agencement?.zones ?? AGENCEMENT_DEFAUT.zones;
  return html`
    <!-- La marque data-mvt="vue:accueil" N'EST PLUS ICI (2026-08-28) : elle vit sur .ecran
         (demarrage.ts), la racine qui contient le bandeau ET ce corps. Une traversée ne fait
         glisser que l'élément marqué et ne garde en fond que son clone — tant que la marque était
         posée sur .corps seul, le bandeau, son frère, était retiré sec par lit et l'heure
         disparaissait au premier quart de seconde de chaque ouverture de sous-vue.
         (Pas de guillemet oblique dans ce commentaire : il vit DANS un template literal.) -->
    <div class="corps">
      <!-- Tâche 3 du plan 2 : l'ORDRE de ces zones vient de agencement.zones, jamais plus écrit en
           dur ici. Le filter est INDISPENSABLE, pas cosmétique : lit rendrait un undefined comme
           un nœud vide, mais chaque enfant de cette colonne flex coûte une gouttière de 8 px
           (base.css), et le budget de hauteur n'a que 3 px de marge — cf. le commentaire du type
           RenduZone plus haut.
           CLÉ PAR NOM DE ZONE, pour la même raison que la rangée de commandes plus haut est clée
           par entité : lit apparie les entrées d'un tableau NON clé par leur index, donc la
           disparition d'une zone amont ferait glisser toutes les suivantes d'un cran et lit
           détruirait puis recréerait leur DOM. Avant cette tâche chaque zone occupait sa propre
           expression, donc un emplacement fixe, et le bloc central SURVIVAIT au retrait de la
           rangée de commandes. La clé rend cette propriété au tableau. Le rendu est le même ;
           c'est l'identité des nœuds qui était en jeu, et elle se perdait en silence.
           (Pas de guillemet oblique dans ce commentaire : il vit DANS un template literal.) -->
      ${repeat(
        zones.map((z) => [z, ZONES[z]()] as const).filter(([, t]) => t !== undefined),
        ([z]) => z,
        ([, t]) => t)}
      <div class="xl" data-zone="touteLaMaison" data-mvt="tuile:toute-la-maison"
           @pointerdown=${() => (location.href = '#maison')}>
        ${icone('home')}Toute la maison</div>
    </div>`;
}
