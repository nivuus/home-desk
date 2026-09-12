/** L'agencement d'un écran : ce que la configuration décide de la COMPOSITION, par opposition
 *  aux liaisons (quelles entités) que porte `ecran.ts`.
 *
 *  Quatre réglages, et seulement eux (décision 3 de la spec du 2026-09-12) :
 *  l'ordre des zones mobiles, le contenu du bloc central par défaut, quels modes vivent sur cet
 *  écran, et leur priorité d'exclusivité.
 *
 *  CE QUI N'EST PAS ICI, et n'y sera pas : les CONDITIONS de chaque mode. Elles lisent
 *  `ContexteModes` et restent en TypeScript (`modes.ts`). Les rendre configurables serait écrire
 *  un langage de règles — et la génération 1 de ces tablettes était exactement ça, un générateur
 *  de dashboards Lovelace, morte le 2026-08-02.
 *
 *  Module PUR : aucun import de rendu, aucune lecture d'état. Même règle que `modes.ts`, et c'est
 *  ce qui le rend testable sans navigateur. */
import type { ModePrincipal, Modulateur } from './modes';
import type { Ecran } from './ecran';

/** Les zones MOBILES. Le bandeau n'y est pas : c'est la barre d'état de l'écran, la déplacer n'a
 *  pas de sens et coûterait un cas de plus au moteur. « Toute la maison » non plus : elle est
 *  collée en bas par `margin-top: auto` (`base.css`), c'est ce qui absorbe l'espace résiduel.
 *  L'étiquette « Ambiance » n'est pas une zone à part : elle est le titre de `ambiances` et
 *  voyage avec elle.
 *
 *  À ne pas confondre avec les sept `data-zone` du DOM, qui servent à MESURER les hauteurs
 *  (`outils/mesurer-hauteurs.mjs`) et non à les ordonner. */
export type Zone = 'synthese' | 'blocCentral' | 'ambiances' | 'commandes';

/** Trois valeurs, et le schéma en accepte exactement trois depuis la relecture de la tâche 6.
 *
 *  Il en acceptait CINQ. Les deux de trop étaient présentées comme « prospectives » ; elles ne
 *  l'étaient pas. `previsions` est un mode SUPPRIMÉ (cf. `meteo.ts`, `demarrage.ts` : « ex-
 *  `previsions` »), donc un fossile, et `entretien` n'a jamais été câblé comme bloc par défaut —
 *  `rendreEntretien` (`rendu/defaut.ts`) n'existe que comme REPLI de `repas`/`agenda` quand leur
 *  contenu est vide. Une valeur hors de ces trois retombe sur `undefined` dans le ternaire de
 *  `demarrage.ts`, c'est-à-dire sur le même résultat qu'un `blocDefaut` absent : bloc central
 *  silencieusement vide.
 *
 *  Le schéma est le contrat que le formulaire de l'intégration (plan 3) fera respecter. Un `enum`
 *  plus large que ce type y ouvrait un menu déroulant sur deux choix qui ne produisent rien — le
 *  « bouton mort » que ce projet s'interdit partout ailleurs. Le même écart avait déjà été trouvé
 *  et corrigé au plan 1 sur le `blocDefaut` de la RACINE ; cette copie y avait survécu.
 *
 *  Si un bloc par défaut s'ajoute un jour, il s'ajoute ICI ET DANS LE SCHÉMA en même temps. */
export type BlocDefaut = 'voiture' | 'repas' | 'agenda';

export type Agencement = {
  /** Ordre de haut en bas des zones mobiles. Chaque valeur au plus une fois ; `commandes` est
   *  obligatoire — un écran sans commande n'est plus une tablette de commande. */
  zones: Zone[];
  /** Modes actifs, dans leur ORDRE D'EXCLUSIVITÉ : le premier dont la condition est vraie occupe
   *  le bloc central. `defaut` est le repli et doit y figurer. */
  modes: ModePrincipal[];
  /** Modulateurs actifs. Cumulatifs, donc SANS ordre significatif — ils ne prennent le bloc de
   *  personne, ils réordonnent, masquent ou survolent. */
  modulateurs: Modulateur[];
  /** Tâche 14 du plan 1 (2026-08-03) : UNE SEULE façon de déclarer quel bloc occupe le centre de
   *  l'écran quand rien de plus prioritaire ne se passe (mode `defaut`/`voiture`, cf. `modes.ts`)
   *  — avant cette tâche, la voiture du salon était détectée par la simple PRÉSENCE du champ
   *  `Ecran.voiture` (`piece.voiture !== undefined`), un mécanisme implicite que le repas/l'agenda
   *  n'auraient pas pu réutiliser sans en inventer un second en parallèle. `blocDefaut` remplace
   *  ce test de présence : le salon le porte maintenant explicitement (`'voiture'`), à côté de son
   *  objet `voiture` (`ecran.ts`) toujours nécessaire comme DONNÉE (les six entités à lire).
   *  - `'voiture'` (salon) : `rendreVoiture` (`rendu/voiture.ts`), bloc plus haut que la normale
   *    (2 commandes au lieu de 4, cf. `combien`, `modes.ts`).
   *  - `'repas'` (cuisine) : `rendreRepasSuivant` (`rendu/defaut.ts`), le repas suivant lu dans les
   *    attributs de `sensor.home_stock_next_meal` (cf. `src/garde-manger.ts`).
   *  - `'agenda'` (bureau) : `rendreProchainRdv` (`rendu/defaut.ts`), le prochain rendez-vous du
   *    jour.
   *  Absent → aucun bloc par défaut (n'arrive à aucune des trois pièces déclarées aujourd'hui).
   *
   *  Tâche 3 du plan 2 (2026-09-12) : ce champ vivait aussi sur la racine d'`Ecran`, en double —
   *  la tâche 1 a prouvé l'équivalence des deux copies, ce qui a permis à cette tâche de retirer
   *  la copie racine. Il n'existe plus qu'ici. */
  blocDefaut?: BlocDefaut;
  note?: string;
};

/** Ce que rend un écran qui ne déclare rien — c'est-à-dire une maison neuve.
 *
 *  Reproduit EXACTEMENT le comportement d'avant ce plan : l'ordre des zones est celui que le
 *  gabarit de `rendreCorps` écrivait en dur, et l'ordre des modes celui de la cascade de `if` de
 *  `modePrincipal`. C'est ce qui permet à un écran de ne rien déclarer sans rien perdre.
 *
 *  Ordre des zones vérifié dans `rendu/corps.ts` (2026-09-12) : la rangée Ambiance (avec son
 *  étiquette) vient en premier, puis les commandes, puis le bloc central, puis la synthèse —
 *  DANS CET ORDRE, pas celui annoncé par une première lecture du brief. `.corps` est une colonne
 *  flex simple (`base.css`), sans `order` CSS : l'ordre du DOM est l'ordre visuel. */
export const AGENCEMENT_DEFAUT: Agencement = {
  zones: ['ambiances', 'commandes', 'blocCentral', 'synthese'],
  modes: ['alerte', 'recette', 'minuteur', 'menage', 'cinema', 'media', 'aeration',
          'voiture', 'defaut'],
  modulateurs: ['invites', 'chaleur', 'delorean'],
};

/** L'agencement d'un écran, COMPLÉTÉ. Une SEULE façon d'y accéder : aucun appelant ne doit
 *  écrire `ecran.agencement ?? QUELQUE_CHOSE` de son côté, sans quoi deux défauts finiraient par
 *  diverger — c'est exactement ce qui était arrivé à `blocDefaut`, détecté par la présence du
 *  champ `voiture` avant la tâche 14.
 *
 *  Le repli est PAR CHAMP, pas par objet. Il l'a été par objet jusqu'à la re-relecture finale du
 *  plan 2, et c'était un piège : un agencement PARTIEL n'est pas `undefined`, donc `?? DEFAUT` ne
 *  se déclenchait pas et `agencement.zones` valait `undefined`. Les deux gardes de `demarrage.ts`
 *  qui lisent `zones.includes('blocCentral')` levaient alors un `TypeError` — un ÉCRAN BLANC, ce
 *  que ce projet s'interdit au même titre que le bouton mort, et la règle même que la tâche 4
 *  venait de poser en sortant la levée de `combien()`. Le rendu dégrade, la saisie refuse.
 *
 *  Le type dit ces trois champs obligatoires, et le schéma les exige depuis la ronde finale
 *  (`contrat/ecran.schema.json`, `$defs/agencement.required`) — mais la donnée vient de Home
 *  Assistant au plan 3, pas du compilateur. C'est ici, au SEUIL, qu'on cesse de lui faire
 *  confiance : au-delà, tout le monde peut lire `agencement.zones` sans se demander s'il existe.
 *  D'où le repli ici ET dans `rendreCorps`, qui reçoit son `agencement` en paramètre et garde donc
 *  sa propre frontière. */
export function resoudreAgencement(ecran: Ecran): Agencement {
  const declare = ecran.agencement;
  if (declare === undefined) return AGENCEMENT_DEFAUT;
  return {
    ...declare,
    zones: declare.zones ?? AGENCEMENT_DEFAUT.zones,
    modes: declare.modes ?? AGENCEMENT_DEFAUT.modes,
    modulateurs: declare.modulateurs ?? AGENCEMENT_DEFAUT.modulateurs,
  };
}
