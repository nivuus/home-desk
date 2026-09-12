/** Une source média est ce que Maxime appelle « la télé » ou « la musique » — jamais une entité
 *  Home Assistant. C'est la découverte qui justifie ce module (relevée le 2026-08-02) : le
 *  téléviseur du salon est UNE chose pour qui la regarde et QUATRE entités pour HA, et la
 *  répartition des champs entre ces entités CHANGE selon l'application lancée.
 *
 *    Plex joue    → titre + affiche + progression sur l'entité Plex
 *    YouTube joue → titre + progression sur l'entité Cast, AUCUNE affiche nulle part
 *    dans les deux cas → transport sur le stick Google TV, volume sur le Philips
 *
 *  Une liste d'entités « par ordre de préférence » ne suffit donc pas : chaque CHAMP se résout
 *  indépendamment, sur la première entité qui l'expose À CET INSTANT. Une entité qui ne sait rien
 *  dire d'un champ est sautée pour ce champ seul, sans faire perdre les autres.
 *
 *  Fonctions pures : rien du DOM, rien de HA, aucune horloge implicite. */
import type { Etat, Entite } from './etat';
import type { Progression } from './progression';

/** Bits de `MediaPlayerEntityFeature` (Home Assistant). Seuls ceux dont ce module se sert sont
 *  nommés — en ajouter un sans l'utiliser serait du bruit. Valeurs vérifiées contre les
 *  `supported_features` réels du salon : le stick Google TV vaut 153529 (PAUSE+PREV+NEXT+
 *  VOLUME_STEP…), l'entité Plex 131584 (PLAY_MEDIA+BROWSE uniquement, donc AUCUNE commande). */
export const CAP = {
  PAUSE: 1,
  VOLUME_SET: 4,
  PRECEDENT: 16,
  SUIVANT: 32,
  VOLUME_PAS: 1024,
  // Correctif important (revue tâche 6) : bit distinct de PAUSE — un lecteur peut déclarer l'un
  // sans l'autre (typiquement : capable de mettre en pause mais pas de reprendre via l'API). Sans
  // ce bit, le rendu affichait un bouton « lecture » dès que PAUSE était présent, quel que soit
  // le support réel de la reprise — exactement le bouton mort que ce module existe pour éviter.
  PLAY: 16384,
} as const;

/** Les états qui valent « quelque chose joue ». `on` en est délibérément ABSENT : un téléviseur
 *  simplement allumé sur un menu n'est pas une lecture en cours. C'est `allumee` (ci-dessous),
 *  et lui seul, qui décide si l'écran est allumé — les deux notions sont distinctes et le mode
 *  cinéma dépend de la première, le contenu de la carte de la seconde. */
export const ETATS_ACTIFS = ['playing', 'paused', 'buffering'];

export type DeclarationSource = {
  nom: string;
  /** Ce qui prouve que l'écran/l'enceinte est allumé, indépendamment d'une lecture en cours. */
  allumee?: { entite: string; etats: string[] };
  titre: string[];
  sousTitre: string[];
  affiche: string[];
  progression: string[];
  transport: string[];
  volume: string[];
  /** Cf. la docstring du même champ sur `Ecran`. */
  note?: string;
};

export type SourceResolue = {
  nom: string;
  /** Vrai si une des entités de `titre`/`progression`/`transport` est dans `ETATS_ACTIFS`. */
  joue: boolean;
  /** Vrai si `decl.allumee` est satisfaite : l'écran est allumé, indépendamment de `joue`.
   *  Exposé (revue tâche 12) parce que `demarrage.ts` en a besoin pour le mode `cinema` et le
   *  recalculait à l'identique depuis la déclaration — une règle métier à deux endroits finit
   *  toujours par diverger, ce projet l'a déjà payé une fois (cf. `chaleurActive`, `modes.ts`). */
  allumee: boolean;
  titre: string;
  sousTitre: string;
  affiche?: string;
  /** Revue tâche 15 : porte désormais `majLe` (`media_position_updated_at`) et `avance`, sans
   *  quoi le rail ne pouvait pas être décompté côté navigateur — cf. `progression.ts`. */
  progression?: Progression;
  transport?: {
    entite: string; peutPause: boolean; peutPrecedent: boolean; peutSuivant: boolean;
    // Correctif important (revue tâche 6) : bit PLAY distinct de peutPause (cf. CAP.PLAY
    // ci-dessus) — le rendu ne montre le bouton « lecture » (reprise) que si ce champ est vrai.
    peutLecture: boolean;
    enLecture: boolean;
  };
  /** `parPas` : le lecteur ne sait pas dire où en est le volume, seulement le faire monter ou
   *  descendre. Le rendu affiche alors deux boutons − / + au lieu d'un rail — jamais une jauge
   *  remplie à une valeur inventée. */
  volume?: { entite: string; niveau?: number; parPas: boolean };
};

function capacites(e: Entite): number {
  return Number(e.attributs['supported_features'] ?? 0);
}

/** Parcourt les entités déclarées dans l'ordre et rend le premier résultat non vide.
 *  `estUtilisable` écarte au passage les entités absentes, `unavailable` ou `unknown` : c'est
 *  ce qui rend une entité manquante inoffensive pour les autres champs. */
function premier<T>(
  etat: Etat, entites: string[], extraire: (e: Entite, id: string) => T | undefined,
): T | undefined {
  for (const id of entites) {
    if (!etat.estUtilisable(id)) continue;
    const v = extraire(etat.lire(id)!, id);
    if (v !== undefined) return v;
  }
  return undefined;
}

function texte(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? undefined : s;
}

function nombre(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Largeur demandée à `/api/vignette`. 400 px couvre très largement la boîte de 311x153 px de
 *  `.media-affiche` (`background-size: cover`), y compris la marge de manœuvre d'un écran plus
 *  dense — sans jamais approcher le seuil qui tue la tablette. */
export const LARGEUR_AFFICHE = 400;

/** Fait passer l'affiche par le redimensionneur de Home Assistant (`custom_components/vignette`).
 *
 *  ⚠️ CE N'EST PAS UNE OPTIMISATION, C'EST UN CORRECTIF DE PLANTAGE. Plex publie une
 *  `entity_picture` de 2000x3000 px : ~23 Mo une fois décodée en bitmap. Posée telle quelle en
 *  `background-image` sur `.media-affiche`, elle **tue le process de la WebView** des Fire 7 —
 *  Fully redémarrait en boucle (~5 s de vie par instance) pendant toute la durée d'un film.
 *  Mesuré sur la tablette du salon le 2026-08-25, une seule variable changeant : 2000x3000 =
 *  4 morts en 48 s ; 800x1200 = 1 mort ; 400x600 = 0 mort ; sans image = 0 mort.
 *
 *  Le passage se fait ICI, à la source, et non dans `rendu/media.ts` : le moteur de mouvement
 *  précharge l'affiche en relisant le `background-image` déjà posé (`urlAffiche`,
 *  `mouvement/moteur.ts`) puis appelle `img.decode()` dessus. Un plafond posé au rendu seul
 *  laisserait donc le DÉCODAGE géant intact sur l'autre chemin — les deux doivent voir la
 *  vignette, ce qu'un point d'entrée unique garantit.
 *
 *  Seules les URL servies par HA sont réécrites : une affiche déjà externe (`http…`) ou une URL
 *  de données est rendue telle quelle plutôt que confiée à un relais qui la refuserait. */
export function vignetter(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  if (!url.startsWith('/api/media_player_proxy/') && !url.startsWith('/api/image_proxy/')) return url;
  return `/api/vignette?w=${LARGEUR_AFFICHE}&url=${encodeURIComponent(url)}`;
}

export function resoudreSource(etat: Etat, decl: DeclarationSource): SourceResolue | null {
  const toutes = [...new Set([...decl.titre, ...decl.progression, ...decl.transport])];
  const joue = toutes.some((id) => etat.estUtilisable(id) && ETATS_ACTIFS.includes(etat.lire(id)!.etat));
  const allumee = decl.allumee !== undefined
    && etat.estUtilisable(decl.allumee.entite)
    && decl.allumee.etats.includes(etat.lire(decl.allumee.entite)!.etat);
  // Ni allumée ni en train de jouer : cette source n'a rien à montrer. `null` plutôt qu'un objet
  // vide, pour que l'appelant n'ait jamais à distinguer « pas de titre » de « pas de source ».
  if (!joue && !allumee) return null;

  // Repli du titre sur `app_name` (« Disney+ ») : mieux qu'un bloc muet quand une application ne
  // publie aucune métadonnée — cas explicitement prévu par le spec, pas un accident.
  const titre = premier(etat, decl.titre, (e) => texte(e.attributs['media_title']))
    ?? premier(etat, decl.titre, (e) => texte(e.attributs['app_name']))
    ?? '';
  const sousTitre = premier(etat, decl.sousTitre, (e) =>
    texte(e.attributs['media_series_title']) ?? texte(e.attributs['media_artist'])) ?? '';
  const affiche = vignetter(premier(etat, decl.affiche, (e) => texte(e.attributs['entity_picture'])));
  const progression = premier(etat, decl.progression, (e) => {
    const position = nombre(e.attributs['media_position']);
    const duree = nombre(e.attributs['media_duration']);
    // Une durée nulle ou absente rendrait une fraction infinie : pas de progression du tout
    // plutôt qu'un rail à une valeur absurde.
    if (position === undefined || duree === undefined || duree <= 0) return undefined;
    // Revue tâche 15 : l'INSTANT auquel Home Assistant a relevé cette position. HA ne republie
    // pas `media_position` en continu — il publie la position et sa date, à charge du client de
    // décompter le reste (cf. `progression.ts`). Absent chez un lecteur qui ne l'expose pas :
    // le rail se pose alors sans jamais avancer, exactement comme avant, plutôt que d'inventer
    // une origine.
    const brut = texte(e.attributs['media_position_updated_at']);
    const majLe = brut !== undefined ? Date.parse(brut) : NaN;
    return {
      position, duree,
      majLe: Number.isFinite(majLe) ? majLe : undefined,
      // L'état du lecteur QUI PORTE la progression, jamais celui du transport (qui vit souvent
      // sur une autre entité, cf. le tableau en tête de ce fichier). En pause, le rail se fige.
      avance: e.etat === 'playing',
    };
  });
  // Correctif tâche 16 (défaut constaté à l'écran le 2026-08-03 20:44, film en cours) : `enLecture`
  // se lisait sur l'entité qui PORTE le transport (`e.etat === 'playing'`) — exactement la faute
  // que ce module existe pour éviter (cf. l'en-tête du fichier). Au salon, le transport vit sur le
  // stick Google TV, qui ne connaît que « allumé » (`on`), jamais « en lecture » : le bouton
  // restait bloqué sur ▶ (lecture) pendant tout un film qui jouait déjà sur Plex. La bonne
  // question n'est pas « l'entité de transport joue-t-elle ? » mais « CE QUE J'AFFICHE (titre/
  // progression) joue-t-il ? » — les mêmes entités qui alimentent déjà `titre`/`sousTitre`/
  // `progression` ci-dessus. `paused`/`buffering` sont délibérément exclus (contrairement à
  // `ETATS_ACTIFS`/`joue`, qui décide juste si la source a quelque chose à montrer) : à la pause,
  // le bouton doit revenir à ▶, pas rester sur ⏸.
  const enLecture = [...decl.titre, ...decl.progression]
    .some((id) => etat.estUtilisable(id) && etat.lire(id)!.etat === 'playing');
  const transport = premier(etat, decl.transport, (e, id) => {
    const f = capacites(e);
    if (!(f & CAP.PAUSE)) return undefined;
    return {
      entite: id,
      peutPause: true,
      peutLecture: (f & CAP.PLAY) !== 0,
      peutPrecedent: (f & CAP.PRECEDENT) !== 0,
      peutSuivant: (f & CAP.SUIVANT) !== 0,
      enLecture,
    };
  });
  // Deux passes, jamais une seule : on préfère TOUJOURS une entité à réglage absolu (rail) à une
  // entité à pas (boutons − / +), même si celle-ci vient plus tôt dans la déclaration. Sans cette
  // séparation, le stick Google TV (VOLUME_PAS, déclaré avant le Philips au salon) confisquerait
  // le volume et on perdrait le seul rail réellement disponible.
  const volume = premier(etat, decl.volume, (e, id) => {
    if (!(capacites(e) & CAP.VOLUME_SET)) return undefined;
    return { entite: id, niveau: nombre(e.attributs['volume_level']), parPas: false };
  }) ?? premier(etat, decl.volume, (e, id) => {
    if (!(capacites(e) & CAP.VOLUME_PAS)) return undefined;
    return { entite: id, niveau: undefined, parPas: true };
  });

  return { nom: decl.nom, joue, allumee, titre, sousTitre, affiche, progression, transport, volume };
}
