import type { DeclarationSource } from './media';
import type { SlotMinuteur } from './minuteur';
import type { Agencement } from './agencement';

export type Bouton = {
  libelle: string; icone: string; entite: string;
  service?: [string, string];
  /** Page externe ouverte par ce bouton — le panneau `home_stock` est une application à part
   *  entière, non refaite aux jetons Material de ce projet. Traité par `interaction.ts` avant tout
   *  `service` : un bouton avec `lien` n'appelle jamais HA. */
  lien?: string;
  /** Sous-vue de l'app ouverte par ce bouton (`location.hash`), par opposition à `lien` qui sort
   *  vers une page autonome. Traité par `interaction.ts` AVANT `lien` et avant tout `service` : une
   *  navigation interne n'appelle jamais HA et n'a rien à rendre optimiste. */
  vue?: string;
  /** Entité réellement visée par `service`, quand elle diffère de `entite`. Porte et rideau du
   *  salon affichent l'état de `lock.*`/`cover.*` mais appellent les scripts existants
   *  (`script.serrure_tap_ouvrir_ou_verrouiller`, `script.toggle_rideau_salon`) : la logique de
   *  bascule reste à un seul endroit, celui qui la porte déjà pour toute l'installation. Absent
   *  partout ailleurs — `entite` est alors la cible, comme avant. */
  cible?: string;
  /** Cette commande ne doit JAMAIS tomber hors de la coupe de `ordreCommandes` (`modes.ts`), quel
   *  que soit le mode : si elle n'y figure pas, elle prend la dernière place visible. Déclarée ici
   *  et nulle part ailleurs — `modes.ts` reste générique, il ne connaît aucun libellé épinglé.
   *  Une seule par pièce en pratique ; au-delà, seule la première déclarée est garantie (voir
   *  `epingler`), un mode à deux places ne pouvant pas en réserver trois.
   *  Coût réel : la commande épinglée coûte la DERNIÈRE place de chaque mode — au salon, le
   *  Chauffage en média/voiture et les Lumières en cinéma. Ne pas épingler à la légère, et jamais
   *  pour du confort : réservé à ce qu'on doit pouvoir faire sans réfléchir depuis la porte
   *  d'entrée. Un épinglage ne crée JAMAIS de rangée : un mode à zéro commande (minuteur) reste à
   *  zéro, son budget de hauteur ne le permet pas. */
  /** Ce que la tuile AFFICHE quand son entité est absente ou `unavailable`,
   *  au lieu de disparaître.
   *
   *  Le masquage générique de `rendu/corps.ts` est le bon défaut : une serrure
   *  muette ou un lecteur éteint n'ont rien à dire. Il ne l'est PAS quand
   *  l'entité vient d'un autre package : `home-desk` ne déclare pas
   *  `home-stock` dans `requires.packages` (décision 8 de la spec) parce que
   *  la dépendance passe par le bus, jamais par un import — mais installé sans
   *  lui, l'écran de la cuisine voyait deux tuiles s'évaporer sans un mot.
   *  Une fonction absente doit se nommer.
   *
   *  Une commande qui porte ce champ n'est jamais filtrée, elle est rendue
   *  INERTE : `interaction.ts` ignore l'appui tant que l'entité est muette. */
  absenceNommee?: string;
  epingle?: true;
  /** Cf. la docstring du même champ sur `Ecran`. */
  note?: string;
};

/** La voiture, telle que la tablette la montre : six entités à lire, deux boutons à presser.
 *  Écrites ici et nulle part ailleurs, comme les slots de minuteur — un renommage d'entité doit
 *  casser à UN seul endroit, visiblement. */
export type Voiture = {
  batterie: string;
  autonomie: string;
  branchee: string;
  enCharge: string;
  clim: string;
  demarrerClim: string;
  arreterClim: string;
  /** Cf. la docstring du même champ sur `Ecran`. */
  note?: string;
};

export type Operateur = '!=' | '==' | '<' | '>';

/** Une entrée de synthèse déclare elle-même sa condition d'écart (`operateur`/`valeur`) et son
 *  texte — `ligneSynthese` (dans `rendu/corps.ts`) se contente de l'évaluer, sans jamais deviner
 *  quoi que ce soit à partir du domaine de l'`entite` (`lock.`, `binary_sensor.`...). C'est ce
 *  qui rend une déclaration « muette » (reconnue par personne) structurellement impossible :
 *  toute entrée porte sa propre règle, il n'y a plus de branche à oublier par domaine.
 *  `{etat}` dans `texte` est un espace réservé, remplacé par l'état brut au moment de l'écart
 *  (utile pour un compteur, ex. `todo.maintenance` → « 4 tâches d'entretien »). `{s}` est un
 *  second espace réservé, résolu par `formaterTexte` (`rendu/corps.ts`) : la marque du pluriel
 *  français (`''` si le nombre vaut 1, `'s'` sinon) — un mécanisme général, pas propre aux
 *  tâches, réutilisable par toute future entrée à compteur. Deux entrées de compteur qui
 *  partagent le même mot (« tâches ») doivent aussi nommer leur sujet dans `texte` : le compteur
 *  seul ne dit pas de quelle liste il s'agit sur un écran qui n'affiche que le texte final (cf.
 *  `todo.maintenance` vs `todo.travail` ci-dessous, indiscernables avant ce correctif).
 *
 *  Union discriminée sur `operateur` (ronde de correction 2) : `<`/`>` n'ont de sens que pour un
 *  ordre, donc n'acceptent qu'un `valeur: number` ; `==`/`!=` acceptent une chaîne ou un nombre.
 *  `{ operateur: '<', valeur: '35' }` (le seuil entre guillemets) est désormais une erreur de
 *  *type*, refusée avant même l'exécution — pas une entrée qui compile puis se dégrade
 *  silencieusement en égalité stricte au premier `estUtilisable` venu. */
/** Lot 6 : `horsTaches` retire cette entrée de la vue « Tâches » de SA pièce, sans toucher à sa
 *  ligne de synthèse. `listesTachesPiece` (`cochage.ts`) collecte automatiquement toute entrée de
 *  `synthese` dont l'entité commence par `todo.` — un mécanisme qui rend le cas courant gratuit,
 *  mais qui ne laissait aucun moyen de dire « affiche le compte, ne propose pas de cocher ». C'est
 *  exactement ce dont le SALON a besoin pour sa ligne DLC : « 3 produits à consommer » est utile à
 *  l'entrée, au moment où l'on part faire les courses, mais sa vue « Tâches » n'a pas à porter une
 *  liste qu'on ne coche pas d'un canapé — cocher une DLC veut dire « mangé », et ça se fait devant
 *  le frigo. Posé UNIQUEMENT là ; partout ailleurs, l'automatisme reste le bon comportement. */
/** `absenceNommee` : cf. la docstring du même champ sur `Bouton`. Sur une entrée de
 *  synthèse, il remplace le SAUT silencieux de `ligneSynthese` par la phrase donnée —
 *  la ligne « repas suivant » de la cuisine venait de `home_stock`, et disparaissait
 *  sans un mot quand il n'était pas installé. */
type Commun = { entite: string; texte: string; perso?: true; horsTaches?: true;
                absenceNommee?: string;
                /** Cf. la docstring du même champ sur `Ecran`. */
                note?: string };

export type EntreeSynthese =
  | (Commun & { operateur: '<' | '>'; valeur: number })
  | (Commun & { operateur: '==' | '!='; valeur: string | number });

export type Ecran = {
  nom: string;
  temperature: string;
  ambiances: Bouton[];
  commandes: Bouton[];
  /** Entités dont l'écart alimente la ligne de synthèse. */
  synthese: EntreeSynthese[];
  /** Tâche 8 bis : boutons visibles UNIQUEMENT dans la vue « Toute la maison » (`rendu/maison.ts`),
   *  à la suite de la liste commune `TOUTE_LA_MAISON` — jamais sur l'écran d'accueil de la pièce,
   *  où la hauteur ne laisse plus de marge (accueil déjà à budget serré, cf. rapport tâche 8).
   *  La vue « Toute la maison », elle, a de la place : 9 entrées communes sur les 10 que le
   *  budget de 585 px autorise. Vide pour la plupart des pièces ; la cuisine y place son accès au
   *  scanner, qui n'a de sens que là — jamais dans `commandes` de la pièce elle-même. */
  extrasMaison: Bouton[];
  /** Tâche 14 : listes `todo.*` supplémentaires affichées sur la vue « Tâches » de cette pièce
   *  (`rendu/taches.ts`), à la suite de celles déjà déduites de `synthese` (toute entrée dont
   *  `entite` commence par `todo.` — `todo.maintenance` partout, `todo.travail` au bureau, cf.
   *  `listesTachesPiece` dans `cochage.ts`). Vide partout sauf en cuisine : la liste de COURSES
   *  n'apparaît pas dans `synthese` — ce n'est pas un écart à signaler, elle est là en permanence —
   *  donc elle ne serait jamais déduite automatiquement. Restreint à elle : une liste de courses se
   *  coche naturellement (on achète, on coche), tandis que le planning reste consultable par la
   *  commande « Recette » (pas une liste d'actions discrètes) et que les piles sont un inventaire
   *  permanent, que cocher n'aurait pas de sens. */
  /** Facultatif : une pièce sans liste supplémentaire n'a rien à déclarer, et les doubles de
   *  test n'ont pas à connaître un champ dont ils ne se servent pas. */
  listesTachesExtra?: string[];
  /** Sources média de la pièce, par ordre d'exclusivité : la première qui joue gagne le bloc.
   *  Une source n'est jamais une entité — voir `media.ts` pour pourquoi. */
  sources: DeclarationSource[];
  /** Ouvrants surveillés pour le mode `aeration`. */
  ouvrants: string[];
  /** Aspirateur surveillé pour le mode `menage`. Absent si la pièce n'en a pas. */
  aspirateur?: string;
  /** Emplacements de minuteur de la pièce, dans l'ordre d'attribution. Vide (absent) partout sauf
   *  en cuisine : c'est la seule pièce où l'on fait cuire quelque chose. Les `entity_id` sont
   *  écrits ici et nulle part ailleurs — les deviner à partir d'un motif rendrait un renommage
   *  d'entité silencieusement destructeur. */
  minuteurs?: SlotMinuteur[];
  /** Étiquettes proposées en un appui au lancement. Données, jamais de code : en ajouter une ne
   *  doit toucher aucune fonction. */
  etiquettesMinuteur?: string[];
  /** Tâche 12, arbitrage du propriétaire (2026-08-03) : quand déclaré, REMPLACE (au lieu d'ajouter)
   *  l'entrée de `TOUTE_LA_MAISON` dont l'entité vaut `vacuum.aspirateur_cuisine` — la tuile
   *  générique « Aspirateur » lance le nettoyage complet du RDC (`vacuum.start`), pertinent au
   *  salon et au bureau mais pas en cuisine, où le propriétaire veut nettoyer LA CUISINE SEULE
   *  (segment 19, via le script HA existant `script.aspirateur_cuisine` — relevé dans
   *  `config/scripts.yaml`, jamais un numéro de segment écrit ici, même patron que Porte/Rideau
   *  au salon). Une tuile de plus aurait fait passer la cuisine de 10 à 11 entrées sur la grille à
   *  2 colonnes de `rendreMaison`, donc de 5 à 6 rangées : 618px contre un budget dur de 585px
   *  (cf. rapport de tâche 12) — d'où une SUBSTITUTION plutôt qu'un ajout. Absent partout ailleurs
   *  : `TOUTE_LA_MAISON` y garde alors son entrée par défaut, comme avant cette tâche. */
  aspirateurMaison?: Bouton;
  /** Données de la voiture — présentes au salon seulement. `blocDefaut` ci-dessous décide QUAND
   *  cette donnée occupe le bloc central ; ce champ ne porte plus cette décision lui-même (tâche
   *  14, cf. son docstring) — un renommage/retrait de `voiture` sans toucher `blocDefaut`
   *  laisserait `rendreVoiture` appelée sur `undefined`, donc l'appelant (`demarrage.ts`) garde
   *  malgré tout la garde `piece.voiture &&`, défensive plutôt que redondante. */
  voiture?: Voiture;
  /** Tâche 14 (2026-08-03, blocs par défaut) : UNE SEULE façon de déclarer quel bloc occupe le centre de l'écran
   *  quand rien de plus prioritaire ne se passe (mode `defaut`/`voiture`, cf. `modes.ts`) — avant
   *  cette tâche, la voiture du salon était détectée par la simple PRÉSENCE du champ `voiture`
   *  ci-dessus (`piece.voiture !== undefined`), un mécanisme implicite que le repas/l'agenda
   *  n'auraient pas pu réutiliser sans en inventer un second en parallèle. `blocDefaut` remplace
   *  ce test de présence : le salon le porte maintenant explicitement (`'voiture'`), à côté de son
   *  objet `voiture` toujours nécessaire comme DONNÉE (les six entités à lire).
   *  - `'voiture'` (salon) : `rendreVoiture` (`rendu/voiture.ts`), bloc plus haut que la normale
   *    (2 commandes au lieu de 4, cf. `combien`, `modes.ts`).
   *  - `'repas'` (cuisine) : `rendreRepasSuivant` (`rendu/defaut.ts`), le repas suivant lu dans les
   *    attributs de `sensor.home_stock_next_meal` (cf. `src/garde-manger.ts`).
   *  - `'agenda'` (bureau) : `rendreProchainRdv` (`rendu/defaut.ts`), le prochain rendez-vous du
   *    jour.
   *  Absent → aucun bloc par défaut (n'arrive à aucune des trois pièces déclarées aujourd'hui). */
  blocDefaut?: 'voiture' | 'repas' | 'agenda';
  /** La scène DeLorean joue-t-elle sur cet écran ? Salon seulement (décision du propriétaire,
   *  2026-08-21) : le modèle réduit est posé là, la voiture s'anime et l'écran juste à côté
   *  bascule au même instant. Déclaré ici plutôt que testé sur `nom` dans `demarrage.ts` — un
   *  test sur le nom obligerait à rouvrir le rendu pour déplacer la voiture de pièce, et les
   *  doubles de test devraient connaître un nom de pièce réel pour rien. Absent ailleurs : la
   *  cuisine et le bureau ne jouent rien et restent utilisables pendant les quatre rendez-vous. */
  delorean?: true;
  /** Pourquoi cet écran est réglé comme il l'est. Jamais rendu ; présent dans le formulaire
   *  qui l'édite (plan 3) et dans l'export YAML, où il redevient un commentaire. Ce champ est
   *  la seule chose qui empêchera les ~300 lignes de raisonnement daté de ce fichier de
   *  disparaître le jour où la donnée partira chez Home Assistant. */
  note?: string;
  /** Hauteur utile de l'écran, en pixels CSS. Absent = 585, la valeur des Fire 7 de cette
   *  maison (viewport de référence 343×585, cf. `outils/mesurer-rendus.mjs`). Déclaré ici
   *  plutôt qu'en constante de `modes.ts` parce qu'une autre maison n'aura pas ces tablettes —
   *  c'est la conséquence directe de la portabilité (décision 4 de la spec du 2026-09-12). */
  hauteurUtile?: number;
  /** La COMPOSITION de cet écran : ordre des zones, modes actifs et leur priorité, modulateurs,
   *  bloc central par défaut. Cf. `agencement.ts` pour ce qui s'y règle et ce qui n'y est
   *  délibérément pas.
   *
   *  Facultatif : absent, `resoudreAgencement` rend `AGENCEMENT_DEFAUT`, qui reproduit
   *  exactement le comportement d'avant ce plan. Une maison neuve n'a donc rien à déclarer pour
   *  avoir un écran qui marche. */
  agencement?: Agencement;
};

export const ECRANS: Record<'salon' | 'bureau' | 'cuisine', Ecran> = {
  salon: {
    nom: 'Salon',
    temperature: 'sensor.capteur_humain_temperature',
    // VIDE depuis le 2026-08-29, demande du propriétaire : les trois scènes (Clair/Chill/Cinéma)
    // quittent la tablette. Ce n'est pas un retrait sec, c'est un ARBITRAGE DE BUDGET — la rangée
    // rendait ~100 px (72 px de tuiles + l'étiquette + la gouttière de 8 px), soit très exactement
    // la deuxième rangée de commandes (64 + 10 px) que le salon n'avait plus les moyens de payer.
    // C'est ce qui permet d'afficher Lumières, Porte, Rideau et Chauffage EN MÊME TEMPS, dans tous
    // les modes du jour, et donc de tenir « rideau et ouverture/fermeture porte tout le temps
    // affichés » sans agrandir quoi que ce soit. Le mécanisme est dans `modes.ts`
    // (`rangeeAmbiance`), le retrait complet de la rangée — étiquette comprise — dans
    // `rendu/corps.ts`. Les trois scènes restent dans Home Assistant : elles ne sont plus ici.
    ambiances: [],
    // Cinq déclarées, jamais cinq affichées : `ordreCommandes` (`modes.ts`) en prend deux ou
    // quatre selon le mode. Ambilight n'existe ici que pour le mode cinéma — il ne remonte dans
    // aucun autre ordre, donc n'encombre jamais l'accueil courant.
    commandes: [
      { libelle: 'Lumières', icone: 'bulb', entite: 'light.lumiere_salon', service: ['light', 'toggle'] },
      { libelle: 'Chauffage', icone: 'flame', entite: 'climate.radiateur' },
      // Épinglée (demande du propriétaire, 2026-08-04) : la porte reste affichée dans tous les
      // modes du jour — la tablette du salon est à l'entrée, ouvrir ou verrouiller ne doit jamais
      // demander de passer par « Toute la maison ». La nuit ne la montre pas non plus : l'écran de
      // nuit ne rend AUCUNE commande (`rendu/nuit.ts`), c'est l'exception voulue.
      // Ce qu'elle coûte, mesuré sur les modes à deux places : le Chauffage en média et en
      // voiture, les Lumières en cinéma (arbitrage explicite — pendant un film, c'est l'Ambilight
      // qu'on règle ; les lumières restent à un appui dans « Toute la maison »).
      { libelle: 'Porte', icone: 'porte', entite: 'lock.aqara_smart_lock_u200_lite',
        service: ['script', 'turn_on'], cible: 'script.serrure_tap_ouvrir_ou_verrouiller',
        epingle: true },
      // Épinglé depuis le 2026-08-29, à la demande du propriétaire (« il faudrait que rideau, et
      // ouverture/fermeture porte soient tout le temps affichés »). Avant cette date, la tuile
      // était DÉCLARÉE mais jamais rendue : le salon vivait en mode `voiture`, à deux places, et
      // les deux revenaient aux Lumières et à la Porte épinglée — le rideau ne réapparaissait
      // qu'au-delà de 28 °C, par le modulateur `chaleur`. Le bouton n'était donc pas cassé : il
      // n'était plus à l'écran. Deux épingles pour quatre places ne coûtent plus rien à personne
      // en mode courant (l'ordre déclaré les contient déjà) ; en cinéma, c'est le Chauffage qui
      // cède, jamais l'Ambilight qu'on cherche pendant un film.
      { libelle: 'Rideau', icone: 'rideau', entite: 'cover.rideau_salon',
        service: ['script', 'turn_on'], cible: 'script.toggle_rideau_salon',
        epingle: true },
      { libelle: 'Ambilight', icone: 'bulb', entite: 'light.televiseur_ambilight',
        service: ['light', 'toggle'] },
    ],
    // Ordre d'exclusivité : la musique passe devant la télé (relevé de l'ancien montage,
    // `_lecteur_media` dans `tools/wallpanel/rooms.py`). Une seule carte à l'écran, toujours.
    sources: [
      {
        nom: 'Musique',
        titre: ['media_player.musique_salon'],
        sousTitre: ['media_player.musique_salon'],
        affiche: ['media_player.musique_salon'],
        progression: ['media_player.musique_salon'],
        transport: ['media_player.musique_salon'],
        volume: ['media_player.musique_salon'],
      },
      {
        nom: 'Multiroom',
        titre: ['media_player.musique_maison'],
        sousTitre: ['media_player.musique_maison'],
        affiche: ['media_player.musique_maison'],
        progression: ['media_player.musique_maison'],
        transport: ['media_player.musique_maison'],
        volume: ['media_player.musique_maison'],
      },
      {
        // Quatre entités pour un seul téléviseur. Relevé sur l'installation le 2026-08-02 :
        // aucune ne sait tout faire, et la répartition change selon l'application lancée.
        nom: 'Télévision',
        allumee: { entite: 'media_player.televiseur_salon_3', etats: ['on', 'playing', 'paused'] },
        titre: ['media_player.plex_plex_for_android_tv_uhd_google_tv_stick',
                'media_player.televiseur_salon_2', 'media_player.televiseur_salon_3'],
        sousTitre: ['media_player.plex_plex_for_android_tv_uhd_google_tv_stick',
                    'media_player.televiseur_salon_2', 'media_player.televiseur_salon_3'],
        affiche: ['media_player.plex_plex_for_android_tv_uhd_google_tv_stick',
                  'media_player.televiseur_salon_2'],
        progression: ['media_player.plex_plex_for_android_tv_uhd_google_tv_stick',
                      'media_player.televiseur_salon_2'],
        transport: ['media_player.televiseur_salon_3', 'media_player.televiseur_salon_2'],
        // Le Philips en premier : SEULE entité de la TV à déclarer VOLUME_SET et à porter un
        // `volume_level`. Le stick ne sait que monter/descendre.
        volume: ['media_player.televiseur_salon', 'media_player.televiseur_salon_3'],
      },
    ],
    ouvrants: ['binary_sensor.porte_entree_s_ouverture', 'binary_sensor.porte_balcon_s_ouverture'],
    aspirateur: 'vacuum.aspirateur_cuisine',
    // `perso: true` = masqué sous le modulateur `invites`. Une porte déverrouillée reste
    // affichée (c'est une information de sécurité qui concerne tout le monde dans la pièce) ;
    // la voiture et les tâches d'entretien ne regardent que Maxime.
    synthese: [
      { entite: 'lock.aqara_smart_lock_u200_lite', operateur: '!=', valeur: 'locked', texte: 'porte déverrouillée' },
      { entite: 'cover.rideau_salon', operateur: '==', valeur: 'open', texte: 'rideau ouvert' },
      { entite: 'sensor.peugeot_e208_batterie_niveau', operateur: '<', valeur: 30, texte: 'voiture à brancher', perso: true },
      { entite: 'todo.maintenance', operateur: '>', valeur: 0, texte: '{etat} tâche{s} d\'entretien', perso: true },
      // Lot 6 : LA SEULE chose que le garde-manger apporte au salon. Cette tablette est à l'entrée
      // (c'est pour ça que « Porte » y est épinglée) : « 3 produits à consommer » y est utile au
      // moment précis où l'on part faire les courses. La répétition ENTRE tablettes est permise —
      // la règle « pas de donnée en double » s'applique PAR tablette.
      // `horsTaches` : la vue « Tâches » du salon n'en hérite PAS (cf. le docstring du champ).
      { entite: 'todo.home_stock_expirations', operateur: '>', valeur: 0,
        texte: '{etat} produit{s} à consommer', perso: true, horsTaches: true },
    ],
    extrasMaison: [],
    listesTachesExtra: [],
    blocDefaut: 'voiture',
    delorean: true,
    voiture: {
      batterie: 'sensor.peugeot_e208_batterie_niveau',
      autonomie: 'sensor.peugeot_e208_batterie_autonomie',
      branchee: 'binary_sensor.peugeot_e208_batterie_branchee',
      enCharge: 'binary_sensor.peugeot_e208_batterie_en_charge',
      clim: 'binary_sensor.peugeot_e208_pre_conditionnement',
      demarrerClim: 'button.peugeot_e208_demarrer_pre_conditionnement',
      arreterClim: 'button.peugeot_e208_arreter_pre_conditionnement',
    },
    agencement: {
      zones: ['ambiances', 'commandes', 'blocCentral', 'synthese'],
      // Le salon n'a pas de minuteur (aucun `minuteurs` déclaré) ni de recette : les deux modes
      // sont retirés de la liste plutôt que laissés à une condition qui ne peut pas se déclencher.
      // Déclarer ce que l'écran fait est plus lisible que déduire ce qu'il ne fait pas.
      modes: ['alerte', 'menage', 'cinema', 'media', 'aeration', 'voiture', 'defaut'],
      modulateurs: ['invites', 'chaleur', 'delorean'],
      blocDefaut: 'voiture',
      note: 'Écran d\'entrée. La voiture occupe le bloc central, et la scène DeLorean joue ici '
          + 'seulement : le modèle réduit est posé à côté.',
    },
  },
  bureau: {
    nom: 'Bureau',
    temperature: 'sensor.capteur_temperature_2',
    ambiances: [
      { libelle: 'Travail', icone: 'sofa', entite: 'light.bureau', service: ['light', 'turn_on'] },
      { libelle: 'Bandeau', icone: 'moon', entite: 'light.bandeau_led_bureau', service: ['light', 'toggle'] },
      { libelle: 'Éteindre', icone: 'film', entite: 'light.bureau', service: ['light', 'turn_off'] },
    ],
    // Tâche 19 (2026-08-03, choix du propriétaire) : QUATRE commandes, contre deux jusqu'ici.
    // `combien()` (`modes.ts`) en affiche quatre en mode `defaut` : avec deux déclarées, le bureau
    // ne rendait qu'une seule rangée là où le salon en rend deux, d'où ~93 px de vide au milieu de
    // l'écran (mesuré tâche 18 — 74 px de rangée plus la gouttière de 10 px, moins ce que la
    // colonne se resserre). La rangée manquante est le remède retenu ; ni `combien()` ni le clamp
    // à 2 lignes de la synthèse n'ont été touchés. Budget mesuré après : 574 px sur 585, la valeur
    // que le projet sert déjà à `voiture` et `menage`.
    // Ordre : les deux d'origine restent en tête, les deux ajoutées suivent. `ordreCommandes` ne
    // remonte ici que « Chauffage » (mode `media`), déjà premier — aucune commande utile ne tombe
    // donc hors de la coupe à deux, vérifié dans `tests/modes.test.ts`.
    commandes: [
      { libelle: 'Chauffage', icone: 'flame', entite: 'climate.radiateur' },
      { libelle: 'Chambre', icone: 'bulb', entite: 'light.lumiere_chambre', service: ['light', 'toggle'] },
      // Dreo DR-HTF009S de la chambre. `fan.toggle` en direct : contrairement à Porte/Rideau du
      // salon, aucun script HA ne porte de logique de bascule pour cet appareil — il n'y a rien à
      // centraliser ailleurs, donc pas de `cible`.
      { libelle: 'Ventilateur', icone: 'ventilateur', entite: 'fan.chambre_ventilateur_tour',
        service: ['fan', 'toggle'] },
      // Fenêtre de toit MANUELLE : il n'existe aucun actionneur, donc AUCUN `service` — une tuile
      // d'état pure, la première de l'application. `Bouton.service` étant facultatif, rien n'a eu
      // à changer dans le modèle ; ce qui a changé est le rendu (`rendu/corps.ts` marque une tuile
      // qui ne déclenche rien de la classe `inerte`, et `base.css` lui retire tout accusé de
      // réception au contact — règle du propriétaire : une tuile qui n'agit pas ne répond pas au
      // doigt). Aucun doublon : le bureau ne déclare aucun ouvrant (`ouvrants: []` ci-dessous,
      // donc pas de mode `aeration` ici) et sa synthèse ne parle pas du Velux.
      { libelle: 'Velux', icone: 'fenetre', entite: 'binary_sensor.velux_ch_ouverture' },
    ],
    sources: [
      {
        nom: 'Musique',
        titre: ['media_player.musique_salon'],
        sousTitre: ['media_player.musique_salon'],
        affiche: ['media_player.musique_salon'],
        progression: ['media_player.musique_salon'],
        transport: ['media_player.musique_salon'],
        volume: ['media_player.musique_salon'],
      },
      {
        nom: 'Multiroom',
        titre: ['media_player.musique_maison'],
        sousTitre: ['media_player.musique_maison'],
        affiche: ['media_player.musique_maison'],
        progression: ['media_player.musique_maison'],
        transport: ['media_player.musique_maison'],
        volume: ['media_player.musique_maison'],
      },
    ],
    ouvrants: [],
    aspirateur: 'vacuum.aspirateur_chambre',
    synthese: [
      { entite: 'todo.travail', operateur: '>', valeur: 0, texte: '{etat} tâche{s} de travail', perso: true },
      { entite: 'sensor.purificateur_air_pm2_5', operateur: '>', valeur: 35,
        texte: 'air à surveiller au-delà de 35 µg/m³ de particules fines' },
      { entite: 'todo.maintenance', operateur: '>', valeur: 0, texte: '{etat} tâche{s} d\'entretien', perso: true },
    ],
    extrasMaison: [],
    listesTachesExtra: [],
    // Tâche 14 (2026-08-03, blocs par défaut) : le prochain rendez-vous du jour (rendreProchainRdv, rendu/defaut.ts), à la
    // place des six prochaines heures — c'est au bureau qu'on regarde son agenda.
    blocDefaut: 'agenda',
    agencement: {
      zones: ['ambiances', 'commandes', 'blocCentral', 'synthese'],
      // Ni minuteur, ni recette, ni voiture, ni DeLorean. `aeration` retiré aussi : `ouvrants`
      // est vide, la condition ne peut pas se déclencher.
      modes: ['alerte', 'menage', 'cinema', 'media', 'defaut'],
      modulateurs: ['invites', 'chaleur'],
      blocDefaut: 'agenda',
      note: 'C\'est au bureau qu\'on regarde son agenda.',
    },
  },
  cuisine: {
    nom: 'Cuisine',
    temperature: 'sensor.capteur_temperature',
    // Remaniée le 2026-08-29 (« on ne voit pas l'état de la lumière hotte sur tablette cuisine ») :
    // la Hotte et le Rideau descendent dans `commandes`, seules tuiles qui appellent `etiquette()`
    // et portent le fond `actif` — cette rangée-ci ne rend QU'une icône et un libellé, par
    // conception (c'est une rangée de scènes, cf. `rendu/corps.ts`). Elle garde exactement trois
    // tuiles : l'échange se fait à hauteur constante, 574 px mesurés, jamais un pixel de plus.
    //
    // Le Purificateur et « Aspirer ici » montent en échange, et c'est le seul choix qui tenait :
    // la vue « Toute la maison » de la cuisine est DÉJÀ pleine à 10/10 tuiles (les 9 communes plus
    // le scanner, budget 585 px, cf. tâche 12) — y descendre le purificateur aurait coûté une
    // rangée entière là-bas. Ce qu'il perd ici est son étiquette « Arrêté » ; c'est le prix,
    // assumé. « Aspirer ici » ne perd rien : lanceur d'action, il n'a jamais affiché d'état
    // (cf. `etiquette`, `rendu/corps.ts`).
    ambiances: [
      { libelle: 'Cuisine', icone: 'sofa', entite: 'light.lumiere_cuisine', service: ['light', 'toggle'] },
      { libelle: 'Purificateur', icone: 'purificateur', entite: 'fan.purificateur_air',
        service: ['fan', 'toggle'] },
      { libelle: 'Aspirer ici', icone: 'aspirateur', entite: 'vacuum.aspirateur_cuisine',
        service: ['script', 'turn_on'], cible: 'script.aspirateur_cuisine' },
    ],
    // Tâche 19 (2026-08-03, choix du propriétaire) : QUATRE commandes, contre deux jusqu'ici —
    // même raison qu'au bureau ci-dessus (une seule rangée rendue sur les deux que `combien()`
    // autorise en mode `defaut`, d'où ~93 px de vide au milieu de l'écran). 500 → 574 px mesurés.
    // Aucun réordonnancement d'`ordreCommandes` ne cite un libellé déclaré ici : dans les modes à
    // deux commandes (`media`), la coupe rend « Courses » et « Recette », exactement comme avant.
    commandes: [
      // Lot 6 : `vue: '#taches'` est le seul enrichissement FONCTIONNEL de cette tâche. Jusqu'ici
      // la tuile affichait un compte sur lequel on ne pouvait rien faire, et la vue « Tâches » ne
      // s'atteignait qu'en touchant la ligne de synthèse. Une navigation interne ne coûte aucun
      // appel HA et supprime un cul-de-sac.
      // Hotte et Rideau EN TÊTE depuis le 2026-08-29 : les quatre places de `combien('defaut')`
      // (`modes.ts`) sont prises dans l'ordre déclaré, ce qui garantit les deux tuiles demandées
      // par le propriétaire sans toucher au budget ni à `modes.ts`. Ce sont aussi les deux seules
      // de cette pièce dont l'état se lit de loin et change souvent — leur place est là où une
      // tuile écrit ce qu'elle est.
      // `bulb` et non l'ancien `moon` : `light.hotte` EST une lumière, et « moon » ne lui venait
      // que de son ancien rang dans la rangée de scènes (Clair/Chill/Cinéma prêtaient leurs trois
      // icônes génériques aux trois tuiles de la cuisine, quel qu'en soit l'appareil).
      { libelle: 'Hotte', icone: 'bulb', entite: 'light.hotte', service: ['light', 'toggle'] },
      // `cible` plutôt que `cover.toggle` (la déclaration d'avant cette date) : `cover.toggle`
      // se résout en `open_cover`/`close_cover`, que ces moteurs Zigbee n'exécutent PAS jusqu'au
      // bout — mesuré sur l'installation le 2026-08-29, `open_cover` s'arrête à mi-course et y
      // reste. Toute l'installation les contourne par `set_cover_position` (les automatisations
      // portent la note « workaround bug ZHA open_cover » depuis des mois), et c'est ce que fait
      // `script.toggle_rideau_cuisine`. Même patron que Porte/Rideau du salon : la logique de
      // bascule vit à UN seul endroit, celui qui la porte déjà pour toute la maison.
      // Le GLISSEMENT n'avait pas ce défaut et n'a pas changé : `descripteurRideau` (`jauge.ts`)
      // appelle déjà `cover.set_cover_position`. Seul l'appui simple était câblé de travers.
      // `rideau` et non l'ancien `film` : même héritage que la hotte ci-dessus, et c'est déjà
      // l'icône que le salon donne à la sienne — le même objet ne se dessine pas de deux façons
      // d'une tablette à l'autre.
      { libelle: 'Rideau', icone: 'rideau', entite: 'cover.rideau_cuisine',
        service: ['script', 'turn_on'], cible: 'script.toggle_rideau_cuisine' },
      // Lot 6 : `vue: '#taches'` est le seul enrichissement FONCTIONNEL de cette tâche. Jusqu'ici
      // la tuile affichait un compte sur lequel on ne pouvait rien faire, et la vue « Tâches » ne
      // s'atteignait qu'en touchant la ligne de synthèse. Une navigation interne ne coûte aucun
      // appel HA et supprime un cul-de-sac.
      { libelle: 'Courses', icone: 'list', entite: 'todo.home_stock_shopping', vue: '#taches',
        absenceNommee: 'Garde-manger non installé' },
      // Tâche 8 bis : demande explicite du propriétaire, jamais rendue accessible jusqu'ici.
      // Ouvre la vue `#recette` de l'app. `entite` est l'indicateur de disponibilité déjà exploité
      // par le masquage générique de `rendu/corps.ts` : `home_stock` non chargé (entrée absente,
      // base verrouillée) ⇒ le capteur passe `unavailable` ⇒ la tuile disparaît, comme toute autre
      // commande dont l'entité est muette.
      { libelle: 'Recette', icone: 'book', entite: 'sensor.home_stock_next_meal', vue: '#recette',
        absenceNommee: 'Garde-manger non installé' },
    ],
    sources: [
      {
        nom: 'Musique',
        titre: ['media_player.musique_cuisine'],
        sousTitre: ['media_player.musique_cuisine'],
        affiche: ['media_player.musique_cuisine'],
        progression: ['media_player.musique_cuisine'],
        transport: ['media_player.musique_cuisine'],
        volume: ['media_player.musique_cuisine'],
      },
      {
        nom: 'Multiroom',
        titre: ['media_player.musique_maison'],
        sousTitre: ['media_player.musique_maison'],
        affiche: ['media_player.musique_maison'],
        progression: ['media_player.musique_maison'],
        transport: ['media_player.musique_maison'],
        volume: ['media_player.musique_maison'],
      },
    ],
    ouvrants: ['binary_sensor.fenetre_c_ouverture'],
    aspirateur: 'vacuum.aspirateur_cuisine',
    synthese: [
      { entite: 'binary_sensor.fenetre_c_ouverture', operateur: '==', valeur: 'on', texte: 'fenêtre ouverte' },
      { entite: 'binary_sensor.distributeur_de_croquettes_alimentation', operateur: '==', valeur: 'on',
        texte: 'distributeur en défaut' },
      { entite: 'binary_sensor.eversweet_3_pro_uvc_niveau_d_eau', operateur: '==', valeur: 'on',
        texte: 'fontaine à remplir' },
      { entite: 'todo.maintenance', operateur: '>', valeur: 0, texte: '{etat} tâche{s} d\'entretien', perso: true },
      // Lot 6 : la CINQUIÈME entrée, et une seule — la ligne n'affiche qu'un nombre borné d'écarts,
      // une sixième ferait tomber l'une des existantes selon l'ordre de déclaration, une
      // information qui disparaîtrait en silence.
      //
      // `todo.` et pas `binary_sensor.` : l'état d'une entité `todo` est le NOMBRE d'éléments non
      // cochés, et le compte est ce qu'on lit de loin. Bonus mécanique décisif : `listesTachesPiece`
      // (`cochage.ts`) collecte automatiquement toute entrée de `synthese` en `todo.` — déclarer
      // cette ligne suffit à faire apparaître les lots qui périment dans la vue « Tâches »,
      // cochables en deux appuis, sans une ligne de plus. Et cocher y veut dire MANGÉ, ce qui est le
      // geste juste devant un frigo.
      //
      // Déclarée APRÈS `todo.maintenance` : c'est ce qui range la DLC entre l'entretien et les
      // courses dans la vue « Tâches ». Une DLC passe avant une course — l'une a une échéance.
      //
      // Jamais une ALERTE : `alertes.ts` exige un écart *anormal* ET *traitable en quelques minutes
      // depuis la maison*. Une DLC échoue aux deux, elle dure des jours.
      { entite: 'todo.home_stock_expirations', operateur: '>', valeur: 0,
        texte: '{etat} produit{s} à consommer', perso: true },
    ],
    // Arbitrage du coordinateur (tâche 8 bis) : le scanner n'a de sens qu'en cuisine, donc
    // ni dans `TOUTE_LA_MAISON` (partagée par les 3 tablettes — le salon n'a rien à scanner) ni
    // dans `commandes` ci-dessus (grille 2 colonnes : un 3e bouton ajoute une rangée entière,
    // ~74px, que l'accueil cuisine n'a plus dans son budget de 585px). La vue « Toute la maison »
    // a la place. Lot 6 : le lien vise le PANNEAU `home_stock` (`/home-stock`), qui porte le
    // scanner de codes-barres ET tout le reste du garde-manger ; `entite` réutilise le même
    // indicateur de disponibilité que « Recette ».
    extrasMaison: [
      { libelle: 'Scanner', icone: 'scan', entite: 'sensor.home_stock_next_meal',
        lien: '/home-stock', absenceNommee: 'Garde-manger non installé' },
    ],
    // Seule pièce avec un extra : la liste de courses (cf. docstring du champ sur `Ecran`
    // ci-dessus). La liste des DLC, elle, arrive automatiquement par `synthese`.
    listesTachesExtra: ['todo.home_stock_shopping'],
    minuteurs: [
      { timer: 'timer.cuisine', nom: 'input_text.minuteur_cuisine_nom' },
      { timer: 'timer.cuisine_2', nom: 'input_text.minuteur_cuisine_2_nom' },
      { timer: 'timer.cuisine_3', nom: 'input_text.minuteur_cuisine_3_nom' },
    ],
    etiquettesMinuteur: ['Pâtes', 'Four', 'Riz', 'Œufs', 'Thé'],
    // Tâche 12 : « Aspirer ici » (74 px mesurés sur 150,5 px utiles par tuile, police de repli du
    // navigateur — Roboto, la police réelle des tablettes, est plus compacte, cf. rapport de
    // tâche 12) pour ne jamais se confondre avec « Aspirateur » (nettoyage complet, salon/bureau)
    // ni avec la tuile « Cuisine » (lumière) déjà présente dans cette même grille.
    aspirateurMaison: { libelle: 'Aspirer ici', icone: 'aspirateur', entite: 'vacuum.aspirateur_cuisine',
      service: ['script', 'turn_on'], cible: 'script.aspirateur_cuisine' },
    // Tâche 14 (2026-08-03, blocs par défaut) : ce qui est prévu à manger (rendreRepasSuivant,
    // rendu/defaut.ts), à la place des six prochaines heures — c'est en cuisine qu'on cuisine.
    blocDefaut: 'repas',
    agencement: {
      zones: ['ambiances', 'commandes', 'blocCentral', 'synthese'],
      // La seule pièce où l'on fait cuire quelque chose : seule à porter `minuteur` et `recette`.
      modes: ['alerte', 'recette', 'minuteur', 'menage', 'cinema', 'media', 'aeration', 'defaut'],
      modulateurs: ['invites', 'chaleur'],
      blocDefaut: 'repas',
      note: 'C\'est en cuisine qu\'on cuisine.',
    },
  },
};
