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
import { AGENCEMENT_DEFAUT } from './agencement';
import type { Zone } from './agencement';
import { arrangement, BUDGET, type Arrangement } from './screen-budget';

export type ModePrincipal =
  'alerte' | 'recette' | 'minuteur' | 'menage' | 'cinema' | 'media' | 'aeration' | 'voiture' | 'defaut';
export type Modulateur = 'invites' | 'chaleur';

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
  /** Au moins un minuteur de la pièce est en marche ou en pause. */
  minuteurEnCours: boolean;
  /** Une recette est ouverte et réduite (vue `#recette` quittée sans « Terminer »). Prime sur tout
   *  sauf l'alerte : le mode `minuteur` n'affiche AUCUNE commande (630 px mesurés), donc sans cette
   *  préséance, lancer un minuteur ferait disparaître le seul point de reprise de la recette. */
  recetteEnCours: boolean;
  /** Tâche 14 (2026-08-03) : reprend tel quel `Agencement.blocDefaut` (`agencement.ts`) — UNE
   *  SEULE façon de déclarer quel bloc central occupe la pièce par défaut, remplace l'ancien
   *  `voitureDeclaree: boolean` (qui déduisait ce fait de la simple présence de `piece.voiture`,
   *  un mécanisme que le repas/l'agenda n'auraient pas pu réutiliser sans en écrire un second en
   *  parallèle). Seule la valeur `'voiture'` change le MODE ci-dessous (`voiture` a un gabarit
   *  plus haut, cf. `combien`, `screen-budget.ts`) ; `'repas'`/`'agenda'`/`undefined` retombent
   *  tous sur `defaut` —
   *  c'est `demarrage.ts`, qui seul connaît `agencement.blocDefaut` en clair, qui choisit ENSUITE
   *  quel contenu (repas, agenda, rien) remplit ce bloc, cf. `rendu/defaut.ts`. */
  blocDefaut?: 'voiture' | 'repas' | 'agenda';
  /** 2026-08-29 : la pièce affiche-t-elle une rangée « Ambiance » ? Le nombre de commandes n'est
   *  plus une propriété du seul MODE — il dépend aussi de ce que la pièce dépense ailleurs sur les
   *  mêmes 585 px. Une pièce qui a renoncé à cette rangée (le salon depuis cette date) rend ~100 px
   *  au budget : 72 px de tuiles, l'étiquette et la gouttière de 8 px, soit très exactement la
   *  deuxième rangée de commandes (64 + 10 px). Les modes à bloc central haut y retrouvent donc
   *  leurs quatre places, cf. `combien`. Sauf la carte média depuis le 2026-10-24 (264 px, cf.
   *  `arrangementEcran` plus bas) : sans rangée « Ambiance », le salon y réduit sa synthèse et
   *  garde deux commandes.
   *
   *  FACULTATIF, et « oui » quand il est absent : les deux autres pièces gardent leur rangée, et
   *  aucun appelant existant n'a une ligne à changer. Comme `blocDefaut`, il est repris tel quel
   *  d'une donnée de `ecran.ts` par `demarrage.ts` — ce module ne lit jamais une pièce lui-même. */
  rangeeAmbiance?: boolean;
  /** Modes actifs et leur priorité, repris de `Agencement` par `demarrage.ts` — ce module ne lit
   *  jamais un écran lui-même. Facultatif : absent, `AGENCEMENT_DEFAUT.modes` s'applique, ce qui
   *  reproduit la cascade de `if` d'avant le plan 2. Même patron que `blocDefaut` et
   *  `rangeeAmbiance` avant lui. */
  modes?: ModePrincipal[];
  /** Modulateurs actifs, même provenance et même défaut. Sans ordre significatif. */
  modulateurs?: Modulateur[];
  /** Zones affichées par l'écran, reprises de l'agencement par `demarrage.ts` — ce module ne lit
   *  jamais un écran lui-même. Facultatif : absent, `AGENCEMENT_DEFAUT.zones` s'applique, ce qui
   *  reproduit le gabarit d'avant le plan 2 (les quatre zones). Même patron que `modes` et
   *  `modulateurs` avant lui.
   *
   *  Ce que ce champ CHANGE, et pourquoi il n'est pas cosmétique : une zone qu'un écran n'affiche
   *  pas ne coûte pas sa hauteur. Sans lui, `coutEcran` facturait une synthèse absente (40 px), une
   *  rangée d'ambiance absente (97 px) ou un bloc central absent (jusqu'à 214 px) — toujours en
   *  SURFACTURANT, donc jamais un débordement à l'écran, mais `verifierBudget` aurait refusé une
   *  saisie parfaitement tenable dans le formulaire du plan 3. */
  zones?: Zone[];
  /** Hauteur utile de l'écran en pixels CSS, reprise d'`Ecran.hauteurUtile` par `demarrage.ts` —
   *  ce module ne lit jamais un écran lui-même. Facultatif : absent,
   *  `BUDGET.hauteurUtileParDefaut` (585, les Fire 7) s'applique. Même patron que `modes`,
   *  `modulateurs`, `blocDefaut` et `rangeeAmbiance` avant lui. */
  hauteurUtile?: number;
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

/** La CONDITION de chaque mode — ce qui reste en TypeScript quand l'ORDRE part dans la donnée.
 *
 *  Cette frontière est délibérée (spec du 2026-09-12, « Ce qu'on ne construit pas ») : rendre les
 *  conditions configurables, ce serait écrire un langage de règles, et la génération 1 de ces
 *  tablettes était exactement ça — un générateur de dashboards Lovelace, mort le 2026-08-02.
 *
 *  `defaut` rend `true` : c'est le repli, et c'est pour ça que l'agencement exige sa présence. */
export const CONDITIONS: Record<ModePrincipal, (c: ContexteModes) => boolean> = {
  alerte: (c) => c.alerte,
  // Priorité 2 par défaut, devant le minuteur : pendant une cuisson, l'écran doit pouvoir ramener
  // à l'étape en cours. Le décompte du minuteur le plus urgent est repris dans le bloc
  // (`rendreRecetteReduite`), donc rien n'est perdu ; la liste détaillée des trois minuteurs reste
  // à un appui (tuile).
  recette: (c) => c.recetteEnCours,
  // Priorité 3 par défaut, devant le ménage et le média : une cuisson a une échéance, une playlist
  // n'en a pas. Le mode ne dure que le temps du minuteur et rend la main de lui-même dès que les
  // trois helpers sont au repos.
  minuteur: (c) => c.minuteurEnCours,
  menage: (c) => c.aspirateurEnMarche,
  cinema: (c) => c.ecranAllume,
  media: (c) => c.sourceJoue,
  // `aeration` n'est PAS une alerte et ne le redevient pas : `alertes.ts` a délibérément retiré la
  // fenêtre du rang d'alerte (un ouvrant ouvert à la main est un état voulu qui peut durer des
  // heures). Ce raisonnement n'est pas révisé ici — ce mode occupe le bloc d'information central,
  // en couleur neutre, jamais le rouge d'erreur, et ne confisque rien.
  aeration: (c) => c.ouvrantOuvertDepuisMs > AERATION_MS && (c.chauffageEnMarche || c.ilPleut),
  // Le bloc par défaut du salon, à la place des six prochaines heures (demande du propriétaire,
  // 2026-08-03) — plus haut que la normale (cf. `combien`, `screen-budget.ts`), il garde donc son
  // propre mode.
  // `'repas'`/`'agenda'`/absent partagent tous le même gabarit que l'ancien `previsions`
  // (`defaut`, tâche 14) : c'est `demarrage.ts` qui choisit ensuite leur contenu respectif.
  voiture: (c) => c.blocDefaut === 'voiture',
  defaut: () => true,
};

/** Le premier mode ACTIF dont la condition est vraie. L'ordre vient de l'agencement de l'écran
 *  (`agencement.ts`), plus d'une cascade de `if` — mais le défaut reproduit cette cascade à
 *  l'identique, et `tests/modes.test.ts` en garde la table de vérité. */
export function modePrincipal(c: ContexteModes): ModePrincipal {
  const actifs = c.modes ?? AGENCEMENT_DEFAUT.modes;
  return actifs.find((m) => CONDITIONS[m](c)) ?? 'defaut';
}

export const CONDITIONS_MODULATEURS: Record<Modulateur, (c: ContexteModes) => boolean> = {
  invites: (c) => c.modeInvites,
  chaleur: (c) => chaleurActive(c),
};

/** Les modulateurs actifs. Cumulatifs : ils ne prennent le bloc de personne. L'ordre de la liste
 *  déclarée n'a donc AUCUNE importance ici — on rend dans l'ordre de `CONDITIONS_MODULATEURS`
 *  pour que la sortie reste stable d'un appel à l'autre, ce dont les tests dépendent. */
export function modulateursActifs(c: ContexteModes): Modulateur[] {
  const declares = c.modulateurs ?? AGENCEMENT_DEFAUT.modulateurs;
  return (Object.keys(CONDITIONS_MODULATEURS) as Modulateur[])
    .filter((m) => declares.includes(m) && CONDITIONS_MODULATEURS[m](c));
}

/** The arrangement of the screen this context describes: `arrangement` (`screen-budget.ts`)
 *  applied to the main mode and to the screen data `boot/frame.ts` copied into the context. ONE
 *  derivation, read by `ordreCommandes` below (how many controls) AND by `rendreCorps`
 *  (`rendu/corps.ts`: Ambiance row drawn or not, synthèse reduced or not) — the grid and the
 *  column it sits in can never be budgeted from two different answers.
 *
 *  CORRECTED ON 2026-10-24. This file said, since August, that the room a tall media card needs
 *  "comes from the 3rd/4th control, never from the Ambiance row (changing the light scene during
 *  a film remains the common need)". The owner reversed it with the redesigned media card
 *  (spec 2026-10-23, "Place à l'écran"): measured at 264 px against 153, it leaves no row of
 *  controls on any of the three 585 px screens. His order: the synthèse is reduced first; if that
 *  is not enough, the Ambiance row goes while the media card is shown, and the controls stay. The
 *  BUDGET decides (`combien`), never a list of rooms: a screen with the room keeps its row. Still
 *  true: never a row of controls cut in half — the whole row or nothing. */
export function arrangementEcran(c: ContexteModes): Arrangement {
  return arrangement(modePrincipal(c), c.rangeeAmbiance, c.hauteurUtile, c.zones);
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
 *  (585 px, cf. `combien`, `screen-budget.ts`) est strictement inchangé, y compris `minuteur` à
 *  zéro commande, où il
 *  n'y a aucune place à réserver et où rien n'apparaît.
 *
 *  Garde-fou, même que `remonter` : une commande absente du tableau reçu n'est jamais inventée
 *  (serrure muette → `estUtilisable` faux → filtrée en amont par `rendu/corps.ts`, et la coupe
 *  reste pleine avec les commandes suivantes). Les épingles, elles, sont bornées à `n` : sur un
 *  mode à deux places, deux épingles prennent les deux. Le salon y est depuis le 2026-10-24 : la
 *  carte média ne lui laisse que deux places en `media`/`cinema`, et Porte et Rideau les prennent
 *  toutes les deux (jamais un `slice` négatif). */
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

/** The places a cut takes. A tall tile (`Bouton.haute`) spans the two rows of its column, so it
 *  takes two places: its own and the one below it. */
function places(coupe: Bouton[]): number {
  return coupe.reduce((n, b) => n + (b.haute ? 2 : 1), 0);
}

/** `epingler`, with tall tiles paid for. On a grid of at least two rows, the cut is the longest
 *  one `epingler` gives whose places still fit in `n` — the pins keep their guarantee, and it is
 *  the last unpinned tiles that give way to a tall one. On a single row there is nothing to span:
 *  the tile loses its `haute` and renders at normal height, one place like any other — a tall tile
 *  never creates a row, the height budget of every mode (`combien`, `screen-budget.ts`) is
 *  unchanged. */
function couper(ordre: Bouton[], n: number): Bouton[] {
  if (n < 2 * BUDGET.tuilesParRangee) {
    return epingler(ordre, n).map((b) => {
      if (!b.haute) return b;
      const { haute: _haute, ...normale } = b;
      return normale;
    });
  }
  for (let k = n; k > 0; k--) {
    const coupe = epingler(ordre, k);
    if (places(coupe) <= n) return coupe;
  }
  return [];
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
  return couper(ordre, arrangementEcran(c).commandes);
}
