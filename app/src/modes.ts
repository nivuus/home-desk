/** Ce qui décide de quoi occupe l'écran. Deux couches DISTINCTES, et c'est le cœur du dessin :
 *
 *  - le MODE PRINCIPAL est exclusif et occupe le bloc central ;
 *  - les MODULATEURS se cumulent et ne prennent le bloc de personne — ils réordonnent, masquent
 *    ou survolent.
 *
 *  `nuit` et `matin` ne sont PAS des modes ici : ce sont des ambiances d'écran (palette, socle
 *  masqué), gérées par `momentDuJour` (`contexte.ts`). C'est ce qui permet à « musique à 23 h »
 *  d'être sombre ET de garder son lecteur — combinaison que l'ancien `hero()` (wallpanel.jinja)
 *  ne savait pas exprimer, `nuit` et `media` y étant deux valeurs exclusives d'un même champ.
 *
 *  Fonctions pures : aucune lecture d'`Etat` ici, seulement le contexte déjà réduit à des valeurs
 *  simples par l'appelant (`demarrage.ts`). C'est ce qui les rend testables sans navigateur. */
import type { Bouton } from './ecran';

export type ModePrincipal =
  'alerte' | 'recette' | 'minuteur' | 'menage' | 'cinema' | 'media' | 'aeration' | 'voiture' | 'defaut';
export type Modulateur = 'invites' | 'chaleur' | 'delorean';

export type ContexteModes = {
  alerte: boolean;
  aspirateurEnMarche: boolean;
  /** L'écran de télévision est allumé — indépendant de « quelque chose joue ». */
  ecranAllume: boolean;
  sourceJoue: boolean;
  ouvrantOuvertDepuisMs: number;
  chauffageEnMarche: boolean;
  ilPleut: boolean;
  serrureDeverrouillee: boolean;
  temperatureExterieure: number;
  soleilLeve: boolean;
  modeInvites: boolean;
  instantDelorean: boolean;
  /** Au moins un minuteur de la pièce est en marche ou en pause. */
  minuteurEnCours: boolean;
  /** Une recette est ouverte et réduite (vue `#recette` quittée sans « Terminer »). Prime sur tout
   *  sauf l'alerte : le mode `minuteur` n'affiche AUCUNE commande (630 px mesurés), donc sans cette
   *  préséance, lancer un minuteur ferait disparaître le seul point de reprise de la recette. */
  recetteEnCours: boolean;
  /** Tâche 14 (2026-08-03) : reprend tel quel `Ecran.blocDefaut` (`ecran.ts`) — UNE SEULE façon
   *  de déclarer quel bloc central occupe la pièce par défaut, remplace l'ancien
   *  `voitureDeclaree: boolean` (qui déduisait ce fait de la simple présence de `piece.voiture`,
   *  un mécanisme que le repas/l'agenda n'auraient pas pu réutiliser sans en écrire un second en
   *  parallèle). Seule la valeur `'voiture'` change le MODE ci-dessous (`voiture` a un gabarit
   *  plus haut, cf. `combien`) ; `'repas'`/`'agenda'`/`undefined` retombent tous sur `defaut` —
   *  c'est `demarrage.ts`, qui seul connaît `piece.blocDefaut` en clair, qui choisit ENSUITE quel
   *  contenu (repas, agenda, rien) remplit ce bloc, cf. `rendu/defaut.ts`. */
  blocDefaut?: 'voiture' | 'repas' | 'agenda';
  /** 2026-08-29 : la pièce affiche-t-elle une rangée « Ambiance » ? Le nombre de commandes n'est
   *  plus une propriété du seul MODE — il dépend aussi de ce que la pièce dépense ailleurs sur les
   *  mêmes 585 px. Une pièce qui a renoncé à cette rangée (le salon depuis cette date) rend ~100 px
   *  au budget : 72 px de tuiles, l'étiquette et la gouttière de 8 px, soit très exactement la
   *  deuxième rangée de commandes (64 + 10 px). Les modes à bloc central haut y retrouvent donc
   *  leurs quatre places, cf. `combien`.
   *
   *  FACULTATIF, et « oui » quand il est absent : les deux autres pièces gardent leur rangée, et
   *  aucun appelant existant n'a une ligne à changer. Comme `blocDefaut`, il est repris tel quel
   *  d'une donnée de `ecran.ts` par `demarrage.ts` — ce module ne lit jamais une pièce lui-même. */
  rangeeAmbiance?: boolean;
};

/** Dix minutes : repris tel quel de `ouverture_problematique()`
 *  (`config/custom_templates/wallpanel.jinja`), qui garde ce seuil depuis l'ancien montage. */
const AERATION_MS = 10 * 60_000;

/** 28 °C : repris tel quel de `conseil_meteo()` (même fichier), qui dit déjà « ferme les rideaux
 *  avant de partir » au-delà. UN seul seuil, DEUX endroits — à répercuter des deux côtés s'il
 *  change. Strict (`>`), pas `>=` : 28 pile reste un jour chaud ordinaire. */
const CHALEUR_C = 28;

/** Une règle métier qui vit à deux endroits finit par diverger. Cette condition est appelée par
 *  `modulateursActifs()` (modulateur 'chaleur') et `ordreCommandes()` (réordonnance). */
function chaleurActive(c: ContexteModes): boolean {
  return c.temperatureExterieure > CHALEUR_C && c.soleilLeve;
}

export function modePrincipal(c: ContexteModes): ModePrincipal {
  if (c.alerte) return 'alerte';
  // Priorité 2, devant le minuteur : pendant une cuisson, l'écran doit pouvoir ramener à l'étape en
  // cours. Le décompte du minuteur le plus urgent est repris dans le bloc (`rendreRecetteReduite`),
  // donc rien n'est perdu ; la liste détaillée des trois minuteurs reste à un appui (tuile).
  if (c.recetteEnCours) return 'recette';
  // Priorité 3, devant le ménage et le média : une cuisson a une échéance, une playlist n'en a
  // pas. Le mode ne dure que le temps du minuteur et rend la main de lui-même dès que les trois
  // helpers sont au repos.
  if (c.minuteurEnCours) return 'minuteur';
  if (c.aspirateurEnMarche) return 'menage';
  if (c.ecranAllume) return 'cinema';
  if (c.sourceJoue) return 'media';
  // `aeration` n'est PAS une alerte et ne le redevient pas : `alertes.ts` a délibérément retiré
  // la fenêtre du rang d'alerte (un ouvrant ouvert à la main est un état voulu qui peut durer des
  // heures). Ce raisonnement n'est pas révisé ici — ce mode occupe le bloc d'information central,
  // en couleur neutre, jamais le rouge d'erreur, et ne confisque rien.
  if (c.ouvrantOuvertDepuisMs > AERATION_MS && (c.chauffageEnMarche || c.ilPleut)) return 'aeration';
  // Le bloc par défaut du salon, à la place des six prochaines heures (demande du propriétaire,
  // 2026-08-03) — plus haut que la normale (cf. `combien` ci-dessous), il garde donc son propre
  // mode. `'repas'`/`'agenda'`/absent partagent tous le même gabarit que l'ancien `previsions`
  // (`defaut`, tâche 14) : c'est `demarrage.ts` qui choisit ensuite leur contenu respectif.
  if (c.blocDefaut === 'voiture') return 'voiture';
  return 'defaut';
}

export function modulateursActifs(c: ContexteModes): Modulateur[] {
  const m: Modulateur[] = [];
  if (c.modeInvites) m.push('invites');
  if (chaleurActive(c)) m.push('chaleur');
  if (c.instantDelorean) m.push('delorean');
  return m;
}

/** Combien de commandes l'écran montre, selon le mode. La carte média est deux fois plus haute
 *  que le bloc `defaut` qu'elle remplace : la place vient de la 3e/4e commande, jamais de la rangée
 *  « Ambiance » (pendant un film, changer d'ambiance lumineuse reste le besoin courant). Jamais de
 *  rangée coupée en deux : c'est toute la rangée ou rien, sinon la grille se déséquilibre.
 *  Ces nombres n'ont PAS bougé avec l'épinglage de la porte (2026-08-04) : `epingler` réserve une
 *  des places comptées ici, il n'en ajoute jamais une — le budget de hauteur de chaque mode est
 *  strictement le même qu'avant.
 *
 *  Tâche 10 bis, chiffres MESURÉS (tâche 10) et non plus estimés : le réglage du minuteur est
 *  devenu une sous-vue plein écran (arbitrage du propriétaire, 2026-08-03), donc `minuteur` ne
 *  désigne plus ici que la LISTE des minuteurs en cours — mesurée à 630 px, 45 px au-delà du
 *  budget de 585 px. Trois lignes de 62 px ne laissent la place à AUCUNE commande : pendant une
 *  cuisson, l'écran sert au minuteur, et les commandes restent à un appui dans « Toute la
 *  maison ». `voiture`, mesuré à 648 px (−63 px), rejoint `media`/`cinema` à deux commandes,
 *  comme tout bloc central plus haut que le bloc `defaut` qu'il remplace. Tâche 14 : `repas`/
 *  `agenda` (mode `defaut` en cuisine/bureau) reprennent le même gabarit `.mode-bloc` que
 *  `menage`/`aeration` — déjà mesurés à quatre commandes — donc `defaut` reste dans la branche
 *  par défaut ci-dessous, comme `previsions` avant lui. */
function combien(mode: ModePrincipal, rangeeAmbiance = true): number {
  if (mode === 'minuteur') return 0;
  const blocHaut = mode === 'media' || mode === 'cinema' || mode === 'voiture';
  // Une pièce sans rangée « Ambiance » a les 100 px qu'il faut pour la seconde rangée, y compris
  // sous un bloc central haut (2026-08-29, cf. `rangeeAmbiance`). Le budget rendu paie UNE rangée
  // et une seule : un mode déjà à quatre n'en gagne pas une cinquième, et `minuteur` reste à zéro
  // — 630 px pour son seul bloc, il n'y a aucune place à financer.
  return blocHaut && rangeeAmbiance ? 2 : 4;
}

/** Remonte en tête les commandes dont le libellé est cité, dans l'ordre cité, en gardant les
 *  autres dans leur ordre déclaré. Une commande citée mais absente de la déclaration est
 *  simplement ignorée — jamais inventée. */
function remonter(commandes: Bouton[], libelles: string[]): Bouton[] {
  const tetes = libelles
    .map((l) => commandes.find((b) => b.libelle === l))
    .filter((b): b is Bouton => b !== undefined);
  return [...tetes, ...commandes.filter((b) => !tetes.includes(b))];
}

/** Coupe à `n`, mais sans jamais laisser tomber les commandes épinglées de la pièce
 *  (`Bouton.epingle`, déclaré dans `ecran.ts` — le salon y épingle « Porte » depuis le
 *  2026-08-04, et « Rideau » depuis le 2026-08-29). Elles prennent alors les DERNIÈRES places
 *  visibles : les remontées de mode ci-dessous gardent ainsi la main sur la première,
 *  celle qui répond au besoin du moment (l'Ambilight pendant un film, les Lumières pendant la
 *  musique), et l'épinglée coûte toujours la même chose — la dernière tuile, jamais une rangée de
 *  plus. La règle est donc une SOUSTRACTION, pas un ajout : le budget de hauteur de chaque mode
 *  (585 px, cf. `combien`) est strictement inchangé, y compris `minuteur` à zéro commande, où il
 *  n'y a aucune place à réserver et où rien n'apparaît.
 *
 *  Garde-fou, même que `remonter` : une commande absente du tableau reçu n'est jamais inventée
 *  (serrure muette → `estUtilisable` faux → filtrée en amont par `rendu/corps.ts`, et la coupe
 *  reste pleine avec les commandes suivantes). Les épingles, elles, sont bornées à `n` : sur un
 *  mode à deux places, deux épingles prennent les deux — c'est le cas limite que le salon ne
 *  rencontre plus (il a quatre places dans tous ses modes) mais qui reste défini plutôt que
 *  laissé au hasard d'un `slice` négatif. */
function epingler(ordre: Bouton[], n: number): Bouton[] {
  const coupe = ordre.slice(0, n);
  // Plus d'une épingle depuis le 2026-08-29 (le salon en porte deux : Porte et Rideau). Bornées à
  // `n` : deux épingles pour deux places les prennent toutes les deux, mais trois n'en inventent
  // pas une troisième.
  const manquantes = ordre.filter((b) => b.epingle && !coupe.includes(b)).slice(0, n);
  if (n === 0 || manquantes.length === 0) return coupe;
  // Ce sont les DERNIÈRES commandes NON épinglées de la coupe qui cèdent, jamais une épinglée déjà
  // dedans : une première version retirait la fin de la coupe sans regarder, et éjectait la Porte
  // pour faire entrer le Rideau — les deux épingles se seraient chassées l'une l'autre au lieu de
  // tenir ensemble. L'ordre d'affichage reste celui de la coupe, les entrantes à la suite : les
  // remontées de mode gardent ainsi la main sur la PREMIÈRE place (l'Ambilight pendant un film),
  // et l'épinglage ne coûte jamais qu'une place, jamais une rangée.
  const cedables = coupe.filter((b) => !b.epingle);
  const conservees = cedables.slice(0, Math.max(0, cedables.length - manquantes.length));
  return [...coupe.filter((b) => b.epingle || conservees.includes(b)), ...manquantes];
}

export function ordreCommandes(commandes: Bouton[], c: ContexteModes): Bouton[] {
  const mode = modePrincipal(c);
  const chaleur = chaleurActive(c);
  let ordre = commandes;
  // « Ambilight » AVANT « Lumières » depuis l'épinglage de la porte (2026-08-04) : les deux places
  // du mode cinéma reviennent désormais à l'Ambilight et à la porte. L'ordre cité décide laquelle
  // des deux cède — la dernière — et le propriétaire a tranché pour les Lumières, le réglage
  // qu'on cherche pendant un film étant l'Ambilight. « Lumières » reste cité : sans lui, une
  // serrure muette laisserait la seconde place au Chauffage plutôt qu'aux lumières du salon.
  if (mode === 'cinema') ordre = remonter(commandes, ['Ambilight', 'Lumières']);
  else if (mode === 'media') ordre = remonter(commandes, ['Lumières', 'Chauffage']);
  // La chaleur prime sur la serrure : une fournaise derrière la baie vitrée est plus urgente
  // qu'une porte déverrouillée pendant que quelqu'un est à la maison. La porte n'y perd rien —
  // depuis l'épinglage (2026-08-04), `epingler` la garde dans la coupe quel que soit l'ordre
  // choisi ici ; ces remontées ne décident plus QUE de la première place.
  else if (chaleur) {
    // Le libellé devient une consigne : sous ce modulateur, « Rideau » nomme un objet quand ce
    // qu'il faut lire est une action. Écart assumé par rapport au spec, qui écrivait
    // « Fermer · 35° dehors » : la tuile fait ~160 px de large et `.commande .t` est en 14 px,
    // dix-neuf caractères y débordent — et la température est DÉJÀ dans le bandeau, alors que le
    // projet interdit la même donnée deux fois sur une même tablette.
    ordre = remonter(commandes, ['Rideau'])
      .map((b) => (b.libelle === 'Rideau' ? { ...b, libelle: 'Fermer' } : b));
  }
  else if (c.serrureDeverrouillee) ordre = remonter(commandes, ['Porte']);
  // `Ambilight` n'a rien à faire sur l'accueil courant : déclaré au salon pour le mode cinéma
  // seulement, il ne remonte dans aucun autre ordre et se fait donc écarter par la coupe.
  return epingler(ordre, combien(mode, c.rangeeAmbiance));
}
