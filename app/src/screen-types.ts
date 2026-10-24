/** The shape of a screen's configuration, as `contrat/ecran.schema.json` describes it. This
 *  house's own screens, the literal, live in `ecran.ts`. */
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
  /** The tile spans the two rows of its column in the commands grid, for a command that must be
   *  hit without aiming (the living-room door, by the entrance). It costs two places in the cut
   *  of `ordreCommandes` (`modes.ts`), never a row: on a mode with a single row it renders at
   *  normal height. Honoured by the commands grid only — an ambiance or "whole house" tile
   *  ignores it, exactly like `epingle`. */
  haute?: true;
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
  limite?: string;
  finCharge?: string;
  demarrerCharge?: string;
  arreterCharge?: string;
  boutonLimite?: string;
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
  /** Données de la voiture — présentes au salon seulement. `agencement.blocDefaut` décide QUAND
   *  cette donnée occupe le bloc central ; ce champ ne porte plus cette décision lui-même (tâche
   *  14, cf. son docstring) — un renommage/retrait de `voiture` sans toucher `agencement.blocDefaut`
   *  laisserait `rendreVoiture` appelée sur `undefined`, donc l'appelant (`demarrage.ts`) garde
   *  malgré tout la garde `piece.voiture &&`, défensive plutôt que redondante. */
  voiture?: Voiture;
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
