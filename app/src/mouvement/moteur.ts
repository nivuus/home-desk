import { render } from 'lit';
import { AMPLITUDE_PX, DEPLACEMENT_MS, DETAIL_MS, EFFET, EFFET_SORTIE, EFFET_VUE, ENTREE_MS,
         GARDE_MS, GLISSE_VUE_PX, ROULEMENT_MS, SORTIE_MS, SPATIAL, TRAVERSEE_MS,
         retardCascade, type Role } from './grammaire';
import { lireMarques, positionReelle, tailleReelle,
         type Marque, type Position, type Taille } from './marques';
import { comparer, type Verdict } from './diff';
import { creerCalque } from './fantomes';
import { creerCroiseur, type AnimationLike } from './croisement';
import { creerPalette } from './palette';
import { niveauDemande, type Niveau } from '../mouvement';

export type { AnimationLike } from './croisement';

export type OptionsMoteur = {
  rendre?: (gabarit: unknown, hote: HTMLElement) => void;
  /** C1 (revue finale) — `racine` en second paramètre : cf. le commentaire de `positionReelle`
   *  (`marques.ts`), qui en a besoin pour arrêter d'accumuler `offsetLeft`/`offsetTop` au bon
   *  endroit. */
  positionDe?: (el: HTMLElement, racine: HTMLElement) => Position;
  /** Injecté sur le même patron que `positionDe` : jsdom ne calcule aucune mise en page
   *  (`offsetWidth`/`offsetHeight` y valent 0 partout). */
  tailleDe?: (el: HTMLElement) => Taille;
  animer?: (el: HTMLElement, trames: Keyframe[], options: KeyframeAnimationOptions) => AnimationLike;
  estMasquee?: () => boolean;
  /** Injecté pour le délai de garde d'un fantôme (défaut `setTimeout`) : jsdom l'implémente, mais
   *  les tests veulent en reprendre la main pour prouver le retrait SANS attendre 660 ms réels. */
  minuteurFn?: (cb: () => void, ms: number) => number;
  /** Attente avant de croiser le bloc média sur une NOUVELLE affiche (défaut `img.decode()`) :
   *  injecté sur le même patron que le reste de ce module, parce que jsdom ne décode aucune image
   *  réelle et que les tests veulent contrôler quand (et si) la promesse se résout. */
  decoder?: (img: HTMLImageElement) => Promise<void>;
  /** Tâche 8 — le niveau demandé AU MONTAGE (`prefers-reduced-motion` ou `?mouvement=` dans
   *  l'URL), calculé une seule fois. Injectable pour les tests, qui ne veulent pas dépendre de
   *  `location.href`/`matchMedia` réels ; par défaut, calculé par le moteur lui-même. */
  niveauInitial?: Niveau;
};

export type Moteur = {
  /** Le SEUL point d'entrée de l'application. Remplace tout appel direct à `render()`. */
  peindre: (gabarit: unknown) => void;
  /** Faux dès qu'une exception a été rattrapée : le moteur ne s'anime plus jusqu'au rechargement. */
  actif: () => boolean;
  /** L'UNIQUE entorse à la règle transform/opacity — cf. son commentaire dans `creerMoteur`. */
  basculerPalette: (sombre: boolean) => void;
  /** M7 (revue finale) — JETTE LE RELEVÉ MÉMORISÉ. À appeler par quiconque peint `racine` SANS
   *  passer par `peindre()` : l'écran d'erreur de démarrage (`demarrage.ts`) le fait, par un
   *  `render()` direct. Sans ça, la peinture suivante compare un relevé de nœuds DÉTACHÉS à un
   *  relevé neuf et peut jouer des sorties fantômes sur du contenu déjà remplacé. La prochaine
   *  peinture repart alors comme une première : elle mémorise et se tait, exactement comme au
   *  montage. */
  oublier: () => void;
  /** Takes `el` off the screen in the direction of a swipe (`sens`: -1 left, 1 right), from where
   *  the finger left it, and keeps the NEXT painting from animating anything inside `el` — the
   *  swipe carries that change, its new content slides in from the other side. Without it, the
   *  card the finger had pushed aside reappeared at once in the middle, opaque, as the ghost of a
   *  block crossing (the engine reads layout positions, which ignore the finger's transform). */
  emporter: (el: HTMLElement, sens: -1 | 1, dureeMs: number) => void;
};

const animationReelle = (
  el: HTMLElement, trames: Keyframe[], options: KeyframeAnimationOptions,
): AnimationLike => el.animate(trames, options);

export function creerMoteur(racine: HTMLElement, options: OptionsMoteur = {}): Moteur {
  const rendre = options.rendre ?? ((g, hote) => render(g as any, hote));
  const positionDe = options.positionDe ?? positionReelle;
  const tailleDe = options.tailleDe ?? tailleReelle;
  const animer = options.animer ?? animationReelle;
  // Ronde de correction 1 (tâche 3) : `document.hidden` seul ne couvrait pas
  // `prefers-reduced-motion` — un trou réel, pas seulement documentaire (les anciennes
  // `@keyframes glisser-entree-*`, retirées de `base.css` par la traversée de vue, vivaient DANS
  // un `@media (prefers-reduced-motion: no-preference)` ; leur suppression avait donc fait
  // perdre, sans équivalent, la SEULE protection que la plus grande animation de l'appli avait).
  // `typeof matchMedia === 'function'` : jsdom ne définit PAS `matchMedia` par défaut (vérifié —
  // ni l'identifiant ni la propriété sur `window` n'existent), donc cette garde ne lève jamais en
  // test, exactement comme le même patron déjà en place pour `niveauDemande` (`demarrage.ts`,
  // l'ancien système `niveau`/`Compteur`, disjoint de ce moteur).
  // Ronde de correction 2 — `?.matches` (pas `.matches` nu) : ceinture ET bretelles, comme
  // partout ailleurs dans ce moteur. Le point qui compte n'est plus ici mais dans `peindre()`,
  // qui enveloppe maintenant CET APPEL d'un `try/catch` — un `estMasquee` qui lève est une
  // injection comme une autre (déjà surchargée par les tests, et par autre chose demain), et rien
  // ne garantissait qu'elle ne le ferait jamais avant ce `try`. `?.` réduit juste la probabilité
  // d'y arriver, il ne remplace pas le filet.
  const estMasquee = options.estMasquee
    ?? (() => (typeof document !== 'undefined' && document.hidden)
      || (typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)')?.matches === true));
  const minuteurFn = options.minuteurFn ?? ((cb, ms) => setTimeout(cb, ms) as unknown as number);

  // Tâche 8 — niveau demandé au montage, calculé UNE SEULE FOIS (jamais relu à chaque peinture) :
  // c'est ici qu'arrivent les deux refus hérités de l'ancien système (`demarrage.ts`, avant cette
  // tâche) — `prefers-reduced-motion` (préférence système, jamais dégradable dans l'autre sens) et
  // `?mouvement=sobre|aucun` dans l'URL (réglable depuis Fully Kiosk sans redéployer, le repli
  // d'urgence de la tâche 9). Calculé hors de tout `peindre()` — donc hors de SON filet — cet
  // appel se protège lui-même : `matchMedia` peut ne pas exister (jsdom) ou, sur une future
  // injection de test, renvoyer autre chose qu'un `MediaQueryList` — même famille de piège que
  // celui déjà fortifié pour `estMasquee`, ci-dessus, mais SANS le `try/catch` de `peindre()` pour
  // le rattraper ici.
  const niveauInitial: Niveau = options.niveauInitial ?? (() => {
    let reduit = false;
    try {
      reduit = typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)')?.matches === true;
    } catch { reduit = false; }
    return niveauDemande(location.href, reduit);
  })();

  // Un niveau FIXE, décidé au montage : plus aucune dégradation en cours de route (cf.
  // `src/mouvement.ts`). La fonction est gardée plutôt qu'inlinée parce que `jouer()` la consulte
  // à trois endroits, et qu'elle documente que le niveau ne dépend PAS du rôle.
  const niveauDe = (_r: Role): Niveau => niveauInitial;

  let precedentes: Map<string, Marque> | null = null;
  let actif = true;

  // Le calque des sorties, enfant de `racine` (pas frère) : c'est ce qui lui laisse la classe
  // `.m3` de `racine`, d'où descendent tous les jetons de couleur — un clone posé dehors la
  // perdrait. Créé ici, mais repositionné en DERNIER enfant à chaque rendu réussi
  // (`rendreSansExploser`, ci-dessous) plutôt qu'une seule fois ici — pour deux raisons :
  //
  // 1. Ronde de correction 1 (CRITIQUE) — l'ORDRE compte, pas seulement la présence. Ce premier
  //    `appendChild`, exécuté avant le tout premier `rendre()`, pose `hoteFantomes` comme PREMIER
  //    enfant de `racine` (elle est encore vide). Le premier rendu de `lit` insère ensuite son
  //    contenu APRÈS ce premier enfant, jamais avant : sans repositionnement, `#mvt-fantomes`
  //    resterait donc AVANT le vrai contenu dans l'ordre du DOM pour la vie entière de la page. Un
  //    `querySelector` sur une classe portée à la fois par le contenu réel et par un fantôme en
  //    sortie (`.mode-bloc`, `.alerte`, `.hors-ligne`, `.media` depuis la tâche 7, partagent leur
  //    classe avec leur clone, exactement pour garder l'apparence visuelle) matcherait alors le
  //    fantôme AVANT le vrai contenu — trouvé en le rejouant réellement (`tests/orchestration.test.ts`,
  //    `tests/demarrage.test.ts`, `tests/pannes.test.ts`, une fois `Element.prototype.animate`
  //    disponible en test, ronde de correction 1 — le moteur se désactivait avant d'exposer ce défaut).
  // 2. Un rendu qui reconstruirait tout le sous-arbre de `racine` (ce que `lit` ne fait
  //    normalement PAS — `render()` ne touche qu'à sa propre `ChildPart`, jamais aux frères en
  //    dehors — mais qu'un double de test simpliste, ou un futur changement de `rendre`, pourrait
  //    faire) emporterait le calque avec lui.
  const hoteFantomes = document.createElement('div');
  hoteFantomes.id = 'mvt-fantomes';
  racine.appendChild(hoteFantomes);
  const calque = creerCalque(hoteFantomes);
  // Le calque de FOND (`z-index: -1`, cf. `base.css`) : il n'accueille que la vue sortante d'une
  // traversée, qui sert de fond à l'écran qui arrive. Un second calque, et non un `z-index` posé
  // sur le fantôme lui-même : `#mvt-fantomes` porte `z-index: 5`, c'est donc un contexte
  // d'empilement dont aucun enfant ne peut sortir. Son plafond de clones est le sien, ce qui est
  // recherché — une traversée ne doit jamais être privée de son fond parce qu'une rafale de
  // `state_changed` vient de remplir le calque des tuiles.
  const hoteFond = document.createElement('div');
  hoteFond.id = 'mvt-fond';
  racine.appendChild(hoteFond);
  const calqueFond = creerCalque(hoteFond);
  const decoder = options.decoder ?? ((img: HTMLImageElement) => img.decode());
  const basculerPalette = creerPalette(racine, estMasquee, minuteurFn);
  const croiseur = creerCroiseur({ calque, animer, minuteurFn, decoder });
  /** The element whose content the next painting must not animate (`emporter`). */
  let silence: HTMLElement | null = null;

  // Tâche 8 — la traversée de vue n'a pas de `marque` au sens des autres verdicts (elle porte
  // `sortante`/`entrante`, jamais `marque`) : on la fonde sur le rôle `vue`, seul rôle qu'aucune
  // déclaration `data-mvt` ne porte jamais SUR LA TUILE elle-même, mais qui gouverne quand même
  // l'écran entier qui glisse (brief tâche 8, point d'attention 1).
  const roleDuVerdict = (v: Verdict): Role =>
    v.type === 'traversee' ? 'vue' : v.type === 'croisement' ? 'bloc' : v.marque.role;

  // `avant` : le relevé D'AVANT de CETTE peinture, nécessaire aux rôles `chiffre` ET `bloc`
  // (mutation, ci-dessous, tâche 7) — `v.marque` (fourni par `comparer()`) est TOUJOURS le relevé
  // D'APRÈS, donc déjà réécrit par `lit` au moment où `jouer()` s'exécute. Un paramètre plutôt
  // qu'une variable de fermeture partagée : `jouer` reste une fonction pure de ses arguments,
  // comme le reste de ce fichier.
  //
  // Tâche 8 — le garde en tête (`niveauDe(role) === 'aucun'`) est le SEUL endroit qui décide si
  // un verdict s'anime — `deplacement` s'y ajoute aussi (l'ancien `deplacer()`,
  // `src/mouvement.ts`, ne jouait déjà qu'au niveau `complet`).
  function jouer(v: Verdict, avant: Map<string, Marque>): void {
    const role = roleDuVerdict(v);
    if (niveauDe(role) === 'aucun') return;

    if (v.type === 'deplacement') {
      // Première chose sacrifiée si la dalle peine, avant même l'entrée/sortie (héritage direct
      // de l'ancien `deplacer()`, qui ne jouait déjà qu'au niveau `complet`).
      if (niveauDe(role) !== 'complet') return;
      const dx = v.depuis[0] - v.marque.position[0];
      const dy = v.depuis[1] - v.marque.position[1];
      animer(v.marque.el,
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: DEPLACEMENT_MS, easing: SPATIAL });
      return;
    }
    if (v.type === 'entree') {
      // Un détail est un EFFET, pas un déplacement : à cette taille, un objet qui bouge lit comme
      // du bruit. Il entre en opacité seule, et plus vite.
      const estDetail = role === 'detail';
      animer(v.marque.el,
        estDetail
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ transform: `translateY(${AMPLITUDE_PX}px)`, opacity: 0 },
             { transform: 'none', opacity: 1 }],
        // La cascade est la seconde chose sacrifiée, juste après le déplacement : à `sobre`, une
        // entrée reste jouée mais toutes les tuiles arrivent DE FRONT plutôt qu'en rang.
        { duration: estDetail ? DETAIL_MS : ENTREE_MS,
          delay: !estDetail && niveauDe(role) === 'complet'
            ? retardCascade(v.marque.rang) : 0,
          easing: estDetail ? EFFET : SPATIAL, fill: 'backwards' });
      return;
    }
    if (v.type === 'sortie') {
      // `lit` a déjà retiré le nœud réel : il n'existe plus rien à animer sur place. On anime un
      // CLONE, pendant que la mise en page, elle, s'est refermée instantanément.
      const f = calque.fantomer(v.marque);
      if (f === null) return;                      // plafond atteint : sortie sèche, jamais d'erreur
      // Opacité SEULE (2026-08-22) : MD3 n'accompagne pas ce qui part. Une propriété animée au
      // lieu de deux — `SORTIE_MS` (120 ms, déjà en place depuis la tâche 2) ne change pas ici.
      const a = animer(f, [{ opacity: 1 }, { opacity: 0 }],
        { duration: SORTIE_MS, easing: EFFET_SORTIE, fill: 'forwards' });
      a.finished.finally(() => calque.relacher(f)).catch(() => {});
      // Ceinture ET bretelles : `finished` ne se résout jamais si l'écran s'éteint en plein vol.
      minuteurFn(() => calque.relacher(f), SORTIE_MS + GARDE_MS);
      return;
    }
    if (v.type === 'traversee') {
      // Le geste de la navigation en profondeur : la vue sortante et la vue entrante se poussent
      // dans le MÊME sens (`signe`), comme deux pages d'un même carrousel — jamais l'une qui glisse
      // pendant que l'autre reste, ce qui lirait comme deux animations sans rapport. `comparer()`
      // a déjà confisqué la peinture pour ce seul verdict (cf. `diff.ts`) : aucun verdict interne
      // (entrée/sortie/déplacement de tuile) ne se joue à côté de celui-ci.
      //
      // M12 (revue finale) — UNE EXCEPTION, ET ELLE EST RÉELLE : si le calque est plein
      // (`FANTOMES_MAX`, 12 clones vivants), `fantomer` rend `null` et la vue entrante glisse
      // SEULE, ce que le paragraphe ci-dessus décrit précisément comme à ne jamais faire. Rare —
      // il faut une rafale de `state_changed` qui remplisse le calque dans les 500 ms qui précèdent
      // une navigation — et délibérément non corrigé : la seule alternative serait de renoncer à
      // l'entrée aussi, c'est-à-dire de rendre la navigation muette au moment précis où l'écran est
      // le plus chargé. Le commentaire dit donc la vérité plutôt que de promettre l'inverse.
      const signe = v.sens === 'droite' ? 1 : -1;
      // Même traitement qu'une sortie ordinaire, et pour la même raison : `lit` a déjà retiré la
      // vue sortante du DOM réel au moment où `jouer()` s'exécute (le `rendre()` a déjà eu lieu
      // dans `peindre()`) — seul un clone dans le calque fantôme peut encore la montrer.
      //
      // LE CLONE N'EST PLUS ANIMÉ, et c'est tout le changement de geste : il reste posé, immobile,
      // le temps que l'entrante glisse par-dessus, comme une pile de cartes. Il ne porte plus le
      // mouvement, il sert de FOND — sans lui, l'entrante glisserait au-dessus du vide pendant
      // 320 ms, puisque `lit` a déjà retiré la sortante du DOM réel.
      //
      // `calqueFond`, jamais `calque` : ce clone doit passer SOUS l'écran qui arrive (cf. son
      // commentaire au montage, et `#mvt-fond` dans `base.css`). C'est le seul fantôme du projet
      // dans ce cas — tous les autres couvrent ce qu'ils quittent.
      const f = calqueFond.fantomer(v.sortante);
      // `transform` seul, sans `opacity` : un fondu par-dessus un glissement plein cadre ne fait
      // que rendre le geste flou. Un seul objet bouge, et il vient d'un bord.
      const a = animer(v.entrante.el,
        [{ transform: `translateX(${signe * GLISSE_VUE_PX}px)` }, { transform: 'none' }],
        { duration: TRAVERSEE_MS, easing: EFFET_VUE });
      // Relâché sur la fin de l'animation de L'ENTRANTE — c'est elle qui porte le geste
      // maintenant, et le fond n'a plus de raison d'être une fois qu'elle est en place. Sans ce
      // `finished`, le clone survivrait jusqu'au minuteur de garde : il porte encore les `class` et
      // les `data-*` de l'écran quitté, qu'un `querySelector` sur `racine` retrouverait alors comme
      // s'ils étaient à l'écran (défaut attrapé par `demarrage.test.ts`, 39 tests d'un coup).
      // Le minuteur reste, ceinture ET bretelles : `finished` ne se résout jamais si l'écran
      // s'éteint en plein vol.
      if (f !== null) {
        a.finished.finally(() => calqueFond.relacher(f)).catch(() => {});
        minuteurFn(() => calqueFond.relacher(f), TRAVERSEE_MS + GARDE_MS);
      }
      return;
    }
    if (v.type === 'croisement') {
      croiseur.changer(v.sortante, v.entrante);
      return;
    }
    // v.type === 'mutation'. `v.marque` is the survey AFTER the painting: `lit` has already
    // rewritten the node. The old content only lives in `avant`, frozen before this `render()`.
    const ancienne = avant.get(`${v.marque.role}:${v.marque.cle}`);
    if (v.marque.role === 'bloc') { croiseur.changerApresAffiche(ancienne, v.marque); return; }
    // A command tile that changes state (colour, label, gauge, height): the whole tile swaps, so
    // its text, its icon, its background and its gauge always belong to one same state. The CSS
    // transitions it replaces faded the background alone, switched the text colour at the END of
    // that fade (`color 0s .3s`) and changed the label and the gauge at once: switching a light
    // off left white text on a nearly white tile for 150 ms, then snapped it to black.
    if (v.marque.role === 'tuile') { croiseur.changer(ancienne, v.marque); return; }
    if (v.marque.role !== 'chiffre') return;
    // Never touch `lit`'s text node (what froze the screen half a day in the time of
    // `animerNombres`, see `src/mouvement.ts`). The old glyph leaves as a clone, the new one —
    // already rendered — comes in from below. Both are CLIPPED to the glyph's box (`clip-path`,
    // animated with the translation): unclipped, the old minute rose over the header while the
    // new one climbed through it.
    const f = ancienne ? calque.fantomer(ancienne) : null;
    if (f !== null) {
      const a = animer(f,
        [{ transform: 'none', opacity: 1, clipPath: 'inset(0 0 0 0)' },
         { transform: 'translateY(-100%)', opacity: 0, clipPath: 'inset(100% 0 0 0)' }],
        { duration: ROULEMENT_MS, easing: EFFET_SORTIE, fill: 'forwards' });
      a.finished.finally(() => calque.relacher(f)).catch(() => {});
      minuteurFn(() => calque.relacher(f), ROULEMENT_MS + GARDE_MS);
    }
    animer(v.marque.el,
      [{ transform: 'translateY(100%)', opacity: 0, clipPath: 'inset(0 0 100% 0)' },
       { transform: 'none', opacity: 1, clipPath: 'inset(0 0 0 0)' }],
      { duration: ROULEMENT_MS, easing: EFFET });
  }

  /** Un mur qui ne s'anime plus est un désagrément ; un mur figé est une demi-journée. Toute
   *  panne — relevé ou rendu — se solde ici, jamais par une exception qui remonte : `peindre` est
   *  appelée depuis `ws.onmessage` (`Connexion`), qui n'a aucun `try/catch` sur ce chemin. */
  function desactiver(e: unknown): void {
    actif = false;
    console.error('moteur de mouvement désactivé', e);
  }

  /** Ronde de correction 1 — le SEUL point d'appel de `rendre`, pour que la garantie qu'il ne
   *  lève jamais hors de `peindre` vaille sur les trois chemins (nominal, secours, relevé « avant »
   *  en échec) et pas seulement sur celui, déjà couvert, où c'est le relevé « après » qui casse.
   *  Sans ce garde-fou unique, un `rendre()` qui échoue une fois désactive le moteur (`actif =
   *  false`) — et TOUS les appels futurs retombent alors sur la branche de secours en tête de
   *  `peindre`, qui rejouerait le même `rendre()` fautif sans protection : une donnée durablement
   *  invalide ferait lever CHAQUE peinture, indéfiniment, jusqu'au rechargement de la page. */
  function rendreSansExploser(gabarit: unknown): boolean {
    try {
      rendre(gabarit, racine);
      // `Node.appendChild` sur un nœud DÉJÀ dans l'arbre le DÉPLACE plutôt que de lever ou de le
      // dupliquer (comportement standard du DOM) : cette ligne repositionne donc `hoteFantomes`
      // en dernier enfant de `racine`, APRÈS tout ce que `rendre()` vient de poser — qu'il l'ait
      // ou non emporté au passage (§ le commentaire au montage, ci-dessus, sur les deux raisons).
      // Coûte une opération DOM par peinture, gratuite dans le cas nominal où l'ordre n'a pas
      // changé (le navigateur n'a rien à redessiner pour un nœud qui ne bouge pas réellement).
      //
      // LES DEUX CALQUES, et ce n'est pas cosmétique : un calque resté AVANT le contenu de `lit`
      // met ses clones en tête de l'ordre du document, et tout `racine.querySelector('.machin')`
      // trouve alors le FANTÔME au lieu de l'élément vivant. Le fond d'une traversée étant un clone
      // de l'écran entier, il masquerait à peu près n'importe quelle recherche pendant 320 ms.
      // Attrapé par `pannes.test.ts` (« expected 'Ambiance' to be 'Toute la maison' »), qui lisait
      // l'étiquette de la vue quittée. L'ordre entre les deux calques, lui, n'a aucune importance :
      // ils se superposent par `z-index` (−1 et 5), jamais par l'ordre du document.
      racine.appendChild(hoteFond);
      racine.appendChild(hoteFantomes);
      return true;
    } catch (e) {
      desactiver(e);
      return false;
    }
  }

  function peindre(gabarit: unknown): void {
    // Écran éteint, moteur désactivé après incident, `prefers-reduced-motion: reduce`
    // (`estMasquee`, défini plus haut — ronde de correction 1, tâche 3), ou `?mouvement=aucun`
    // (`niveauInitial`, ci-dessus, tâche 8) : on PEINT, on n'anime pas et on ne relève rien. Le
    // contenu de l'écran est identique — seule l'animation est sautée. Refuser dès le RELEVÉ (pas
    // seulement dans `jouer()`) : `comparer()` ne calcule même pas de verdict, la traversée de vue
    // comprise — jamais un simple retour anticipé au milieu de l'animation la plus visible de
    // l'appli.
    //
    // I2 (revue finale) — `niveauInitial === 'aucun'` REBRANCHÉ ICI : la tâche 1 avait retiré le
    // paramètre `actif`/`actifRole` (le régulateur de cadence) sans remarquer que son EFFET —
    // ne pas payer les recalculs de mise en page (`offsetLeft`/`offsetWidth`, un par marque et par
    // peinture) ni les `cloneNode(true)` des rôles `chiffre`/`bloc` — était une exigence
    // indépendante du régulateur lui-même. Cette branche a triplé le nombre de marques (12 → ~36,
    // tâche 7) sans rétablir ce garde : `?mouvement=aucun`, devenu le SEUL repli manuel quand une
    // dalle peine (réglable depuis Fully Kiosk sans redéployer), ne supprimait donc plus que les
    // animations, en continuant de payer leur coût de mesure. Un simple ajout au `||` suffit —
    // aucune carte de niveaux ni régulateur à réintroduire, seulement le court-circuit qui manquait.
    //
    // Ronde de correction 2 (tâche 3) — `estMasquee()` est une injection (surchargée par les
    // tests, et potentiellement par autre chose demain) : rien ne GARANTIT qu'elle ne lève pas,
    // même une fois son défaut fortifié (`?.matches`, plus haut) — le `?.` réduit le risque, il
    // ne le supprime pas pour une future injection. Avant ce `try`, une telle exception
    // s'échappait ENTIÈREMENT de `peindre()` — prouvé en relecture avec un `matchMedia` présent
    // mais renvoyant `undefined` (`TypeError` sur `.matches` nu, avant le `?.`) : ni
    // `desactiver()`, ni `console.error`, ni écran peint — pire que le « mur figé » que ce
    // fichier existe pour éviter, puisque même silencieux. `!actif` et `niveauInitial === 'aucun'`
    // ne peuvent pas lever (lecture d'un booléen / comparaison d'une constante déjà calculée au
    // montage) : seul `estMasquee()` le peut, et seulement quand les deux autres membres du `||`
    // sont faux (court-circuit) — donc un moteur déjà désactivé, ou monté en niveau `aucun`,
    // continue de peindre sans jamais retenter cet appel.
    try {
      if (!actif || niveauInitial === 'aucun' || estMasquee()) {
        rendreSansExploser(gabarit); precedentes = null; return;
      }
    } catch (e) {
      desactiver(e);
      rendreSansExploser(gabarit);
      precedentes = null;
      return;
    }

    // Le relevé « avant » peut lever, lui aussi (`positionDe` est injecté) : dans ce cas rien
    // n'est comparable, mais l'écran doit quand même être peint — un relevé cassé n'est pas une
    // raison de le figer.
    let avant: Map<string, Marque>;
    try {
      avant = precedentes ?? lireMarques(racine, positionDe, tailleDe);
    } catch (e) {
      desactiver(e);
      rendreSansExploser(gabarit);
      precedentes = null;
      return;
    }

    // Le rendu lui-même : jamais rejoué s'il vient d'échouer (`rendreSansExploser` l'a déjà
    // consigné et désactivé le moteur) — un seul appel à `rendre` par peinture, réussi ou non.
    // The content a swipe already carries (`emporter`): one painting, then the engine is back.
    const tu = silence;
    silence = null;
    let tues: Set<string>;
    try {
      tues = preparerAvant(avant, tu);
    } catch (e) {
      desactiver(e);
      rendreSansExploser(gabarit);
      precedentes = null;
      return;
    }

    if (!rendreSansExploser(gabarit)) { precedentes = null; return; }

    try {
      const apres = lireMarques(racine, positionDe, tailleDe);
      // Première peinture : rien à comparer, on mémorise et on se tait.
      if (precedentes !== null) {
        for (const v of comparer(avant, apres)) {
          if (tu === null || !touche(v, tu, tues)) jouer(v, avant);
        }
      }
      precedentes = apres;
    } catch (e) {
      desactiver(e);
      precedentes = null;
    }
  }

  /** Run on the survey BEFORE a painting, while its nodes still show the old content:
   *  - a TILE is rewritten in place by `lit`, so its old look is cloned now, just before the
   *    painting — never at the previous survey, which a gauge slid by the finger since then
   *    (`geste.ts` writes `--jauge` directly) would contradict;
   *  - the declarations inside the silenced element are listed while they are still inside it:
   *    after the painting, the nodes that left are detached and inside nothing. */
  function preparerAvant(avant: Map<string, Marque>, tu: HTMLElement | null): Set<string> {
    const tues = new Set<string>();
    for (const [decl, m] of avant) {
      if (m.role === 'tuile' && m.el.isConnected) m.copie = m.el.cloneNode(true) as HTMLElement;
      if (tu !== null && tu.contains(m.el)) tues.add(decl);
    }
    return tues;
  }

  /** True when the verdict concerns content inside the silenced element. */
  function touche(v: Verdict, tu: HTMLElement, tues: Set<string>): boolean {
    const dedans = (m: Marque) => tues.has(`${m.role}:${m.cle}`) || tu.contains(m.el);
    if (v.type === 'traversee') return false;
    if (v.type === 'croisement') return dedans(v.sortante) || dedans(v.entrante);
    return dedans(v.marque);
  }

  function emporter(el: HTMLElement, sens: -1 | 1, dureeMs: number): void {
    silence = el;
    let masquee = false;
    try { masquee = !actif || niveauInitial === 'aucun' || estMasquee(); } catch { masquee = true; }
    if (masquee) return;
    try {
      // Where the finger left it: the bounding rect includes the swipe's transform, which the
      // layout positions of the survey ignore. The clone drops that transform, its box carries it.
      const r = el.getBoundingClientRect();
      const o = racine.getBoundingClientRect();
      const copie = el.cloneNode(true) as HTMLElement;
      copie.style.transform = '';
      const f = calque.fantomer({
        role: 'bloc', cle: 'emporte', etat: null, el, copie, rang: 0, ancetres: [],
        position: [r.left - o.left, r.top - o.top], taille: [r.width, r.height],
      });
      if (f === null) return;
      // To fully past the edge of the screen on the side it was pushed towards.
      const distance = sens < 0 ? -(r.right - o.left) : o.right - r.left;
      const a = animer(f, [{ transform: 'none' }, { transform: `translateX(${distance}px)` }],
        { duration: dureeMs, easing: 'ease-out', fill: 'forwards' });
      a.finished.finally(() => calque.relacher(f)).catch(() => {});
      minuteurFn(() => calque.relacher(f), dureeMs + GARDE_MS);
    } catch (e) {
      desactiver(e);
    }
  }

  return { peindre, actif: () => actif, basculerPalette, emporter,
           oublier: () => { precedentes = null; } };
}
