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
import BUDGET from '../../contrat/budget.json';

export { BUDGET };

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
  /** Tâche 14 (2026-08-03) : reprend tel quel `Agencement.blocDefaut` (`agencement.ts`) — UNE
   *  SEULE façon de déclarer quel bloc central occupe la pièce par défaut, remplace l'ancien
   *  `voitureDeclaree: boolean` (qui déduisait ce fait de la simple présence de `piece.voiture`,
   *  un mécanisme que le repas/l'agenda n'auraient pas pu réutiliser sans en écrire un second en
   *  parallèle). Seule la valeur `'voiture'` change le MODE ci-dessous (`voiture` a un gabarit
   *  plus haut, cf. `combien`) ; `'repas'`/`'agenda'`/`undefined` retombent tous sur `defaut` —
   *  c'est `demarrage.ts`, qui seul connaît `agencement.blocDefaut` en clair, qui choisit ENSUITE
   *  quel contenu (repas, agenda, rien) remplit ce bloc, cf. `rendu/defaut.ts`. */
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
  /** Modes actifs et leur priorité, repris de `Agencement` par `demarrage.ts` — ce module ne lit
   *  jamais un écran lui-même. Facultatif : absent, `AGENCEMENT_DEFAUT.modes` s'applique, ce qui
   *  reproduit la cascade de `if` d'avant le plan 2. Même patron que `blocDefaut` et
   *  `rangeeAmbiance` avant lui. */
  modes?: ModePrincipal[];
  /** Modulateurs actifs, même provenance et même défaut. Sans ordre significatif. */
  modulateurs?: Modulateur[];
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
  // 2026-08-03) — plus haut que la normale (cf. `combien`), il garde donc son propre mode.
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
  delorean: (c) => c.instantDelorean,
};

/** Les modulateurs actifs. Cumulatifs : ils ne prennent le bloc de personne. L'ordre de la liste
 *  déclarée n'a donc AUCUNE importance ici — on rend dans l'ordre de `CONDITIONS_MODULATEURS`
 *  pour que la sortie reste stable d'un appel à l'autre, ce dont les tests dépendent. */
export function modulateursActifs(c: ContexteModes): Modulateur[] {
  const declares = c.modulateurs ?? AGENCEMENT_DEFAUT.modulateurs;
  return (Object.keys(CONDITIONS_MODULATEURS) as Modulateur[])
    .filter((m) => declares.includes(m) && CONDITIONS_MODULATEURS[m](c));
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
 *  par défaut ci-dessous, comme `previsions` avant lui.
 *
 *  2026-09-12 : la règle et ses chiffres vivent désormais dans `contrat/budget.json`, lu aussi
 *  par l'intégration Home Assistant (plan 3) — elle doit pouvoir dire « cet écran déborde » au
 *  moment de la saisie, ce qu'elle ne peut pas faire en relisant des `if` TypeScript. Le
 *  RÉSULTAT est strictement inchangé : `tests/budget.test.ts` porte la table de vérité d'avant
 *  et la vérifie à chaque commit.
 *
 *  2026-09-12, second temps — CECI N'EST PLUS UNE TABLE, C'EST UN CALCUL. `Ecran.hauteurUtile`
 *  existe depuis la tâche 1, et une table calibrée pour 585 px ne sait pas l'honorer : elle rend
 *  le même 0/2/4 à 585 px comme à 900. Les hauteurs par zone n'avaient JAMAIS été mesurées — les
 *  commentaires ci-dessus ne donnent que des totaux d'écran (630 px, 648 px). Elles le sont
 *  maintenant, dans un vrai navigateur, au viewport de référence, par
 *  `app/outils/mesurer-hauteurs.mjs` (attribut `data-zone`, cf. `rendu/corps.ts`) : onze modes,
 *  trois écrans, et pour chaque zone le PIRE CAS retenu. Elles vivent sous `hauteurs` dans
 *  `contrat/budget.json`.
 *
 *  `combien` additionne donc la colonne `.corps` comme le moteur de rendu l'additionne — les
 *  enfants, la gouttière entre chacun, le padding, le bandeau au-dessus — et garde la plus grande
 *  composition qui tient. Le modèle a été confronté à la mesure avant d'être écrit : pour chacun
 *  des onze modes relevés, le reste qu'il prédit est EXACTEMENT le reste mesuré à l'écran (11,1 px
 *  en cuisine et au bureau, 108,1 px en mode ménage, 34,1 px en mode voiture...). Et il reproduit
 *  la table historique sans y toucher, ligne par ligne, avec 3,1 px de marge sur son cas le plus
 *  serré — c'était la condition d'acceptation de la tâche, pas un résultat espéré : un modèle qui
 *  ne l'aurait pas reproduite aurait été ANNULÉ plutôt qu'ajusté (on ne truque pas une mesure
 *  pour faire passer un test).
 *
 *  À NE PAS CONFONDRE avec la clé `mesures` du même fichier, qui reste le relevé de 2026-08-29 et
 *  compte le coût d'une zone GOUTTIÈRE COMPRISE (« rangeeCommandes : 74 px = 64 + 10 »). Les
 *  `hauteurs` lues ici sont des coûts NETS, les gouttières étant ajoutées par le calcul ci-dessous
 *  — sans quoi elles seraient comptées deux fois. Les deux relevés s'accordent, ce qui est déjà
 *  une vérification : 64 + 10 pour une rangée de commandes, 9 + 72 + 2 × 8 = 97 px pour la rangée
 *  « Ambiance » complète, contre les ~100 px estimés en août. */
/** Ce que l'écran mesure pour `rangees` rangées de commandes, à mode et rangée d'ambiance donnés.
 *  `.corps` est une COLONNE FLEX à gouttière fixe : son coût est la somme de ses enfants plus une
 *  gouttière entre chaque paire, plus son padding vertical, le bandeau venant au-dessus. Trois
 *  enfants sont toujours là (le bloc central, la ligne de synthèse, le bouton « Toute la
 *  maison ») ; la rangée « Ambiance » en ajoute DEUX (son étiquette est un enfant à part entière),
 *  la grille de commandes UN.
 *
 *  2026-09-12, plan 2 : extraite de la clôture `cout` qui vivait dans `combien` — `verifierBudget`
 *  la réutilise sans dupliquer l'addition. Deux additions du même budget finiraient par diverger,
 *  et c'est précisément ce que `contrat/budget.json` existe pour empêcher. Ne recapture pas `bloc`
 *  d'un appelant : elle le recalcule depuis `mode`, puisqu'elle n'a plus de fermeture commune avec
 *  `combien` pour le lui prêter. */
function coutEcran(mode: ModePrincipal, rangeeAmbiance: boolean, rangees: number): number {
  const h = BUDGET.hauteurs;
  const bloc = (BUDGET.modesABlocHaut as string[]).includes(mode) ? h.blocHaut : h.blocDefaut;
  let enfants = 3;
  let somme = bloc + h.synthese + h.touteLaMaison;
  if (rangeeAmbiance) {
    enfants += 2;
    somme += h.etiquetteAmbiance + h.rangeeAmbiance;
  }
  if (rangees > 0) {
    enfants += 1;
    // Les rangées vivent dans UNE grille : leur gouttière est celle de la grille (10 px), pas
    // celle de la colonne (8 px) — et il n'y en a pas après la dernière.
    somme += h.rangeeCommandes * rangees + h.gouttiereCommandes * (rangees - 1);
  }
  return h.bandeau + h.paddingCorps + somme + h.gouttiere * (enfants - 1);
}

/** Combien de commandes l'écran montre. NE LÈVE JAMAIS : un budget intenable rend 0, et l'écran
 *  affiche alors ses autres zones sans rangée de commandes — exactement ce que le mode `minuteur`
 *  fait déjà légitimement (630 px pour sa seule liste, aucune place pour une commande).
 *
 *  2026-09-12, plan 2 : cette fonction LEVAIT `BudgetIntenable` jusqu'ici. Or c'est le moteur de
 *  rendu qui l'appelle, via `ordreCommandes` — un écran mal configuré aurait fait un écran blanc,
 *  ce que ce projet s'interdit au même titre que le bouton mort. Le verdict déménage dans
 *  `verifierBudget`, que le rendu n'appelle jamais et que le formulaire de l'intégration (plan 3)
 *  appellera. Le rendu dégrade, la saisie refuse. */
export function combien(
  mode: ModePrincipal,
  rangeeAmbiance = true,
  hauteurUtile: number = BUDGET.hauteurUtileParDefaut,
): number {
  if ((BUDGET.modesSansCommande as string[]).includes(mode)) return 0;
  // Le plafond de DEUX rangées n'est pas un chiffre de plus : c'est ce que `commandesParDefaut`
  // (4 places) et `tuilesParRangee` (2 colonnes) disent déjà. Une troisième rangée n'existe dans
  // aucun écran de ce projet, et l'inventer ici sur un grand écran ferait rendre à `combien` un
  // nombre que la grille n'a jamais rendu.
  const rangeesMax = Math.floor(BUDGET.commandesParDefaut / BUDGET.tuilesParRangee);
  for (let rangees = rangeesMax; rangees >= 1; rangees--) {
    if (coutEcran(mode, rangeeAmbiance, rangees) <= hauteurUtile) {
      return rangees * BUDGET.tuilesParRangee;
    }
  }
  // Jamais de rangée coupée en deux (cf. plus haut) : sous une rangée, il ne reste que zéro — que
  // le budget tienne ou non. Ne lève plus depuis 2026-09-12 (plan 2) : cf. le docstring ci-dessus.
  return 0;
}

/** De combien cette composition déborde, en pixels. 0 si elle tient. Écrite pour le formulaire de
 *  l'intégration Home Assistant (plan 3), qui doit pouvoir dire « cet écran déborde de 45 px »
 *  AU MOMENT DE LA SAISIE — pas devant la tablette.
 *
 *  UN MODE N'EST PAS ENCORE FACTURÉ : `minuteur`. Il n'est pas dans `modesABlocHaut`, donc le
 *  calcul lui compte `blocDefaut` (84 px) au lieu de son vrai `blocMinuteur` (206 px), et
 *  `verifierBudget('minuteur', true, 585)` rend donc 0 pour un écran qui déborde réellement.
 *  C'est la dette que `contrat/budget.json` nomme sous `_blocMinuteur`, et elle est réelle pour
 *  l'appelant : le formulaire validerait un écran intenable. Ne PAS écrire dans une docstring un
 *  exemple chiffré en mode `minuteur` tant que ce n'est pas vrai — la version précédente de ce
 *  commentaire le faisait, et c'est ainsi qu'une promesse fausse voyage jusqu'à son appelant.
 *
 *  Le rendu ne l'appelle jamais : c'est toute la différence avec la version d'avant, où le verdict
 *  (l'ex-`BudgetIntenable`) et le calcul vivaient dans la même fonction, `combien`. */
export function verifierBudget(mode: ModePrincipal, rangeeAmbiance: boolean,
                               hauteurUtile: number): number {
  return Math.max(0, coutEcran(mode, rangeeAmbiance, 0) - hauteurUtile);
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
  return epingler(ordre, combien(mode, c.rangeeAmbiance, c.hauteurUtile));
}
