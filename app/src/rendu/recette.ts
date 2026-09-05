/** Vue « Recette » (2026-08-17) : troisième sous-vue de l'application, au même titre que « Toute la
 *  maison » (`rendu/maison.ts`), « Tâches » (`rendu/taches.ts`) et le réglage de minuteur
 *  (`rendu/minuteur.ts`) — un seul niveau de profondeur, jamais l'une dans l'autre.
 *
 *  Atteinte de deux façons, qui visent la MÊME chose : le bloc central de l'accueil (le repas
 *  suivant, ou la recette réduite) et la tuile « Recette » de la grille.
 *
 *  AUCUN GESTE : l'ancienne page autonome de recettes tournait au swipe, interdit ici — deux
 *  flèches de 62 px les remplacent. Deux sorties distinctes : « Réduire » garde la recette en cours
 *  (mode `recette`, cf. `modes.ts`), « Terminer » la ferme. */
import { html, render, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { icone } from './icones';
import { assainir, MOTIF_TAG } from '../recette';
import { formaterRestant } from '../minuteur';
import { scinderSelonHauteur } from '../scinder';

/** Une ligne du plan de décrément (`home_stock/meal/preview`), telle que la tablette la LIT.
 *  Ni `product_id`, ni `batches`, ni `needed`/`available` : la tablette ne retire rien, elle
 *  montre ce qui sera décrémenté et ce qui manque. Ce qui n'est pas affiché n'entre pas ici. */
export type LigneIngredient = {
  /** `product_name`, ou le texte brut de la ligne quand aucun produit n'est apparié. */
  nom: string;
  /** `label` : la quantité telle qu'on la lit en cuisinant (« 200 g », « 1 cs »). */
  quantite: string;
  /** `status === 'short'` : le stock ne couvre pas cette ligne. */
  manque: boolean;
};

export type VueRecette = {
  etiquette: string;
  plat: string;
  /** Pages déjà découpées ET sous-découpées par l'appelant (`decouperPages`, `scinderSelonHauteur`). */
  pages: string[];
  page: number;
  ingredients?: LigneIngredient[];
  panneauOuvert: boolean;
  horsLigne: boolean;
  /** Les minuteurs de la pièce tels que HA les publie (`listerMinuteurs`, `minuteur.ts`). Le
   *  décompte affiché sur un bouton vient de LÀ, jamais d'un compte à rebours local : Android tue
   *  régulièrement l'app, et un décompte porté par la page mentirait après un rechargement. */
  minuteurs: { nom: string; restantS: number; actif: boolean }[];
  /** Au moins un des trois créneaux est au repos (`premierSlotLibre`). */
  slotLibre: boolean;
  /** État d'armement de la clé `terminer`, porté par `demarrage.ts` — même mécanisme à deux
   *  appuis que la vue « Tâches » (`creerArmement`, `cochage.ts`). Ce rendu ne fait qu'AFFICHER
   *  l'état qu'on lui donne, il n'arme jamais rien lui-même.
   *
   *  Une seule clé désormais : les clés `ing:<produit>` et `tout` sont mortes avec le geste de
   *  retrait (lot 6). `armee` garde sa signature à clé pour rester le même mécanisme que partout
   *  ailleurs, pas deux façons de dire « armé ». */
  armee: (cle: string) => boolean;
  /** Un refus du serveur, déjà traduit en français par le composant (`messages.py`). Affiché à la
   *  place de l'étiquette : une ligne qui existe déjà, donc ZÉRO pixel ajouté — et rien n'est
   *  effacé de l'écran, ni les étapes, ni les boutons. */
  message?: string;
  /** Page courante DU PANNEAU d'ingrédients (distincte de `page`, qui pagine les étapes). Porté
   *  par l'appelant comme `page` : ce rendu ne fait que lire l'index, jamais le muter. */
  pageIngredients: number;
};

/** Ce qu'il faut de `VueRecette` pour fabriquer un bouton de minuteur — `pageAvecMinuteurs`,
 *  `boutonMinuteur` et `mesurerHorsEcran` (plus bas, `reScinder`) n'ont besoin de rien d'autre.
 *  Nommé pour éviter un `as VueRecette` à l'appel depuis `reScinder`, qui ne dispose légitimement
 *  QUE de ces deux champs (l'appelant, `demarrage.ts`, les extrait de son propre état). */
export type ContexteMinuteurs = Pick<VueRecette, 'minuteurs' | 'slotLibre'>;

export type ActionsRecette = {
  page(n: number): void;
  reduire(): void;
  /** Deux appuis, arbitrés par `demarrage.ts` : le premier arme, le second valide le repas
   *  (`home_stock/meal/validate`, irréversible). Ce rendu appelle la même action aux deux. */
  terminer(): void;
  ouvrirPanneau(): void;
  fermerPanneau(): void;
  minuteur(nom: string, secondes: number): void;
  pageIngredients(n: number): void;
};

let actions: ActionsRecette = {
  page: () => {}, reduire: () => {}, terminer: () => {}, ouvrirPanneau: () => {},
  fermerPanneau: () => {}, minuteur: () => {}, pageIngredients: () => {},
};
export function brancherRecette(a: ActionsRecette) { actions = a; }

/** Un `<` n'ouvre une balise que suivi d'une lettre ASCII, `/`, `!` ou `?` — le « tag open state »
 *  de HTML5. Un `<` suivi d'autre chose (espace, chiffre, fin de chaîne) est du texte ordinaire :
 *  « attendre 3 < 5 » ne doit pas faire basculer le scan en mode balise jusqu'au PROCHAIN `>` réel,
 *  ce qui avalerait silencieusement tout tag `#nom:secondes` situé entre les deux (round 2, faux
 *  positif absent des recettes actuelles mais latent — ce HTML est écrit à la main). */
function estOuvertureBalise(s: string, i: number): boolean {
  const suivant = s[i + 1];
  return suivant !== undefined && /[a-zA-Z/!?]/.test(suivant);
}

/** Fin d'une balise ouverte en `debut` (un `<` déjà validé par `estOuvertureBalise`). Un `>` entre
 *  guillemets simples ou doubles ne la termine pas — sans quoi `<img alt="a > b">` couperait la
 *  balise au milieu de son attribut `alt` (round 2). Balise non refermée → fin de chaîne. */
function finBalise(s: string, debut: number): number {
  let guillemet: string | null = null;
  let j = debut + 1;
  while (j < s.length) {
    const c = s[j];
    if (guillemet) {
      if (c === guillemet) guillemet = null;
    } else if (c === '"' || c === "'") {
      guillemet = c;
    } else if (c === '>') {
      return j + 1;
    }
    j++;
  }
  return s.length;
}

/** Découpe le HTML d'une page sur les tags `#nom:secondes` et rend un tableau alterné
 *  texte/bouton. Le HTML entre deux tags est assaini puis injecté tel quel ; le tag lui-même
 *  DISPARAÎT du texte — il est devenu un bouton, le laisser en clair afficherait « #Pâtes:600 »
 *  au milieu d'une consigne de cuisine.
 *
 *  `MOTIF_TAG` ne cherche QUE dans les zones hors balise : un attribut comme
 *  `style="color:#888;font-size:14px"` produisait 4 FAUX POSITIFS (« 888;font-size » pris pour un
 *  nom de minuteur). Recompté le 2026-08-17, sur les 87 recettes du catalogue d'alors : un scan
 *  NAÏF (attributs compris) trouve 102 correspondances, le scan hors balise en trouve 98 — ces
 *  4 de différence sont exactement les faux positifs. 102 et 98 désignent donc DEUX ensembles
 *  différents (ce que le tag de minuteur `MOTIF_TAG` capturerait sans discernement, et les vrais
 *  tags), et non deux comptages du même. La frontière entre
 *  zone « dans balise » et zone « hors balise » suit `estOuvertureBalise`/`finBalise` ci-dessus,
 *  pas un simple indexOf de `<`/`>` — voir leurs commentaires pour les deux cas qu'un scan naïf
 *  casse (un `<` isolé dans le texte, un `>` dans un attribut entre guillemets). */
function pageAvecMinuteurs(brut: string, v: ContexteMinuteurs): unknown[] {
  const morceaux: unknown[] = [];
  let tampon = '';
  const vider = () => { if (tampon !== '') { morceaux.push(unsafeHTML(assainir(tampon))); tampon = ''; } };
  let i = 0;
  while (i < brut.length) {
    if (brut[i] === '<' && estOuvertureBalise(brut, i)) {
      // Zone « dans balise » (nom de balise + attributs) : recopiée telle quelle, jamais scannée —
      // c'est elle qui porte les faux positifs comme `color:#888;font-size:14px`.
      const j = finBalise(brut, i);
      tampon += brut.slice(i, j);
      i = j;
    } else {
      // Zone « hors balise » : seul endroit où un vrai tag `#nom:secondes` peut apparaître. Elle
      // s'arrête à la prochaine VRAIE ouverture de balise, pas au premier `<` littéral.
      let j = i;
      while (j < brut.length && !(brut[j] === '<' && estOuvertureBalise(brut, j))) j++;
      const texte = brut.slice(i, j);
      let curseur = 0;
      for (const m of texte.matchAll(MOTIF_TAG)) {
        tampon += texte.slice(curseur, m.index);
        vider();
        morceaux.push(boutonMinuteur(m[1].trim(), Number(m[2]), v));
        curseur = (m.index ?? 0) + m[0].length;
      }
      tampon += texte.slice(curseur);
      i = j;
    }
  }
  vider();
  return morceaux;
}

function boutonMinuteur(nom: string, secondes: number, v: ContexteMinuteurs): TemplateResult {
  const enCours = v.minuteurs.find((m) => m.nom === nom);
  // Sans créneau libre, un appui ne pourrait rien lancer : le bouton le DIT (grisé) plutôt que de
  // rester engageant et de ne rien faire — même règle que `tuileMinuteur(sature)`.
  const inactif = enCours === undefined && !v.slotLibre;
  // REVUE FINALE : la classe `encours` (fond `--md-primary`, la peinture d'un décompte VIVANT)
  // n'est posée que sur un minuteur RÉELLEMENT EN MARCHE. Un minuteur en PAUSE porte un restant
  // FIGÉ — le peindre comme s'il descendait est le mensonge à l'écran que ce projet refuse partout
  // ailleurs (cf. `VueMinuteur.actif`, `minuteur.ts`, et le même défaut sur le bloc réduit,
  // `demarrage.ts`). CONSÉQUENCE ASSUMÉE : un minuteur en pause reprend l'apparence d'un bouton non
  // lancé, tout en affichant son restant réel (4:12 au lieu des 10:00 du tag) — et un appui le
  // reprend, comme avant. Lui donner un TROISIÈME état visuel demanderait un jeton de couleur de
  // plus, à mesurer au contraste (≥ 5:1) : hors du périmètre de cette vague de correction.
  const classes = ['recette-minuteur', enCours?.actif ? 'encours' : '', inactif ? 'inactif' : '']
    .filter((c) => c !== '').join(' ');
  return html`<span class="${classes}"
    @pointerdown=${() => { if (!inactif) actions.minuteur(nom, secondes); }}>
    ${icone('minuteur')}${formaterRestant(enCours ? enCours.restantS : secondes)}</span>`;
}

/** 4 lignes par page. Le budget de `.ing-liste` n'est PAS les ~395 px entiers de la zone de
 *  contenu (round 1, erroné) : `.ing-panneau` doit AUSSI loger `.ing-actions` (~62 px) et son
 *  propre `gap: 8px` avant d'atteindre `.ing-liste` — soit ~395 − 62 − 8 ≈ 325 px réels.
 *  4 × 62 px (hauteur mini d'une ligne) + 3 × 8 px (le `gap` de `.ing-liste`) = 272 px, avec une
 *  marge réelle sous ces 325 px (5 lignes en aurait pris 342, au-dessus du budget). Recompté sur
 *  le catalogue (2026-08-17), 87 recettes — dont 73 portent au moins un ingrédient :
 *  3,7 ingrédients en moyenne (4,4 sur les seules recettes pourvues), jusqu'à 10 ; 34 des 73
 *  dépassent ces 4 lignes et se paginent donc, 9 dépassent 7. Un panneau qui défile
 *  (`overflow: auto`) reposerait sur le geste de scroll,
 *  interdit sur ces tablettes ; on pagine donc, comme les étapes. La mesure définitive reste
 *  `outils/verifier-rendu.mjs` en fin de lot, sur le panneau réellement ouvert. */
const MAX_LIGNES_ING = 4;

function pagesIngredients(v: VueRecette): number {
  return Math.max(1, Math.ceil((v.ingredients ?? []).length / MAX_LIGNES_ING));
}

/** Borne un index de page reçu de l'appelant à l'intervalle valide `[0, nbPages-1]` : un index
 *  hors bornes (ex. panneau rouvert sur une recette qui a depuis moins de pages) ne doit jamais
 *  produire une page blanche ni un indicateur du type « 4/1 ». Sert aux deux paginations (étapes
 *  ET ingrédients) — le même bug touchait déjà silencieusement `v.page`. */
function pageBornee(page: number, nbPages: number): number {
  return Math.min(Math.max(page, 0), nbPages - 1);
}

/** Le panneau RECOUVRE la zone de contenu, dans la MÊME vue : pas de troisième niveau de hash —
 *  l'app en tient deux (accueil → sous-vue), et une recette n'est pas une raison d'en ajouter un.
 *
 *  EN LECTURE SEULE depuis le lot 6 (2026-08-21). Le geste « retirer cet ingrédient » a disparu et
 *  n'est pas remplacé : retirer une quantité est un CHOIX (combien, sur quel lot), et tout geste
 *  qui demande un choix vit dans le panneau du composant, pas au mur. Ce que ce panneau montre est
 *  le plan de décrément que `home_stock/meal/preview` a calculé SANS RIEN ÉCRIRE — c'est-à-dire
 *  exactement ce que « Terminer » fera.
 *
 *  Aucun ingrédient n'est jamais tronqué (pas de « +N » à la « Tâches ») : on ne cuisine pas avec
 *  une liste amputée — la pagination existe pour ça, cf. `MAX_LIGNES_ING`. */
// Tâche 7 (mouvement) — la pastille « manquant » ci-dessous est marquée par INDEX DE PAGE, pas par
// nom d'ingrédient : LigneIngredient ne porte aucun identifiant stable (ni product_id ni uid, cf.
// son commentaire de type plus haut — « la tablette ne retire rien »).
//
// Round 1 (revue) — CORRECTIF DE COMMENTAIRE : la version précédente affirmait qu'un changement de
// page « remplace le bloc entier », ce qui est FAUX. `visibles.map(...)` ci-dessous n'a ni
// `repeat()` ni clé lit : lit réutilise donc les nœuds PAR POSITION et patche leur contenu en
// place — rien n'est détruit ni recréé quand seul le contenu change à un index donné (par exemple
// entre deux pages, où l'ingrédient à l'index 1 change mais le `<span>` DOM, lui, reste le même).
// Le même `data-mvt="detail:manque-<idx>"` peut donc se retrouver porté par le MÊME nœud DOM pour
// deux ingrédients différents à deux pages successives — ce qui est exactement l'index de tableau
// que la règle générale de cette tâche déconseille.
//
// Ce qui rend ça inoffensif n'est PAS l'absence de réutilisation (il y en a), mais l'absence de
// `data-mvt-etat` sur `.ing-stock.manque` : le moteur (`comparer()`, `src/mouvement/diff.ts`) ne
// produit un verdict `mutation` que lorsque `data-mvt-etat` change entre deux relevés d'une même
// clé — sans cet attribut, le patch de contenu que lit effectue en silence n'est jamais intercepté
// ni animé à tort. L'ordre des ingrédients dans une page reste par ailleurs figé (le plan de
// décrément de `home_stock/meal/preview`, jamais réordonné par un geste tactile), donc les seuls
// verdicts réels que ce moteur peut produire ici sont des entrées/sorties légitimes (la pastille
// apparaît/disparaît quand `i.manque` change de valeur à un index donné), jamais une mutation
// muette confondue avec autre chose.
function rendrePanneau(v: VueRecette): TemplateResult {
  const ingredients = v.ingredients ?? [];
  const page = pageBornee(v.pageIngredients, pagesIngredients(v));
  const debut = page * MAX_LIGNES_ING;
  const visibles = ingredients.slice(debut, debut + MAX_LIGNES_ING);
  return html`
    <div class="ing-panneau">
      <div class="ing-liste">
        ${ingredients.length === 0
          ? html`<div class="ing-vide" data-mvt="detail:ing-vide">Aucun ingrédient</div>` : ''}
        ${visibles.map((i, idx) => html`
            <div class="ing-ligne">
              <div>
                <div class="t">${i.nom}</div>
                <div class="s">${i.quantite}${i.manque
                  ? html` — <span class="ing-stock manque" data-mvt="detail:manque-${idx}"
                          >manquant</span>` : ''}</div>
              </div>
            </div>`)}
      </div>
      <div class="ing-actions">
        <div class="ing-fermer" @pointerdown=${() => actions.fermerPanneau()}>Fermer</div>
      </div>
    </div>`;
}

export function rendreVueRecette(v: VueRecette): TemplateResult {
  // La rangée de flèches est PARTAGÉE : elle pagine les étapes hors panneau, les ingrédients une
  // fois le panneau ouvert — zéro pixel de plus, zéro nouveau bouton, le même geste que le reste
  // de la vue. `nbPages`/`pageActuelle` et l'action appelée suivent donc `v.panneauOuvert`.
  const nbPages = v.panneauOuvert ? pagesIngredients(v) : Math.max(1, v.pages.length);
  const pageActuelle = pageBornee(v.panneauOuvert ? v.pageIngredients : v.page, nbPages);
  const premiere = pageActuelle <= 0;
  const derniere = pageActuelle >= nbPages - 1;
  const aller = (n: number) => (v.panneauOuvert ? actions.pageIngredients(n) : actions.page(n));
  // « Terminer » est IRRÉVERSIBLE (`home_stock/meal/validate` : « Cook, then eat. Not reversible
  // at lot 3, and the screen says so »). Le second appui doit donc dire ce qu'il fait — et le dire
  // en ENTIER. La phrase vit dans `.etiquette`, sur toute la largeur du cadre : la mettre dans le
  // bouton, une colonne de grille sur trois à 14 px, la ferait passer à quatre lignes et grandir
  // la rangée d'actions. Le lot n'ajoute pas un pixel.
  const arme = v.armee('terminer');
  const entete = arme ? 'Terminer — le stock sera décrémenté' : v.etiquette;
  return html`
    <div class="corps recette" data-mvt="vue:recette">
      <div class="etiquette ${v.horsLigne ? 'hl' : ''}">
        ${v.horsLigne ? 'Hors ligne' : v.message ?? entete}
        <span class="recette-pages">${pageActuelle + 1}/${nbPages}</span>
      </div>
      <div class="recette-titre">${v.plat}</div>
      ${v.panneauOuvert ? rendrePanneau(v)
        : html`<div class="recette-page">${pageAvecMinuteurs(v.pages[pageActuelle] ?? '', v)}</div>`}
      <div class="recette-nav">
        <div class="recette-prec ${premiere ? 'inactif' : ''}"
             @pointerdown=${() => { if (!premiere) aller(pageActuelle - 1); }}>
          ${icone('precedent')}</div>
        <div class="recette-suiv ${derniere ? 'inactif' : ''}"
             @pointerdown=${() => { if (!derniere) aller(pageActuelle + 1); }}>
          ${icone('suivant')}</div>
      </div>
      <div class="recette-actions">
        <div class="recette-ingredients" @pointerdown=${() => actions.ouvrirPanneau()}>
          ${icone('list')}Ingrédients</div>
        <div class="recette-reduire" @pointerdown=${() => actions.reduire()}>
          ${icone('home')}Réduire</div>
        <div class="recette-terminer ${v.horsLigne ? 'inactif' : ''} ${arme ? 'armee' : ''}"
             @pointerdown=${() => { if (!v.horsLigne) actions.terminer(); }}>
          ${icone('coche')}${arme ? 'Confirmer' : 'Terminer'}</div>
      </div>
    </div>`;
}

/** Découpe le HTML SOURCE (celui qui porte encore les tags `#nom:secondes`, AVANT
 *  `pageAvecMinuteurs`) en unités de premier niveau — un élément OU un nœud texte, jamais du HTML
 *  déjà peint. `DOMParser` (comme `decouperPages`/`assainir`, `src/recette.ts`) traite chaque
 *  enfant direct de `<body>` : un élément devient son `outerHTML` (le tag qu'il contient, s'il en a
 *  un, reste en clair dedans — `pageAvecMinuteurs` le retrouvera au prochain rendu) ; un nœud texte
 *  devient son `textContent` tel quel (c'est LUI qui porte un tag posé ENTRE deux balises, hors de
 *  tout élément). Les nœuds texte purement blancs (mise en forme du HTML source) sont écartés : ils
 *  ne contribuent aucune hauteur ni aucun contenu, seulement du bruit dans la liste d'unités. */
export function decouperEnUnites(html: string): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return Array.from(doc.body.childNodes)
    // Round 2 (revue) : un nœud qui n'est NI élément NI texte (un commentaire `<!-- -->`, écrit à la
    // main dans une description comme n'importe quel autre HTML de ce fichier) n'a pas
    // d'`outerHTML` — `(n as Element).outerHTML` y vaut `undefined`, et `.filter(s => s.trim())`
    // levait alors une `TypeError` sur `undefined.trim`. Reproduit dans un vrai Chromium sur
    // `<p>A</p><!-- note --><p>B</p>` : la peinture de l'écran LEVAIT, le pire mode de défaillance de
    // ce projet (un écran mural qui plante plutôt qu'un contenu simplement écrêté). Filtré ICI, avant
    // le `.map`, plutôt que rattrapé après : un nœud ignoré ne porte de toute façon aucune hauteur ni
    // aucun contenu affichable — il n'a jamais eu sa place dans la liste d'unités.
    .filter((n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.ELEMENT_NODE)
    .map((n) => (n.nodeType === Node.TEXT_NODE ? (n.textContent ?? '') : (n as Element).outerHTML))
    .filter((s) => s.trim() !== '');
}

/** Plafond de `.recette-img` (`max-height`, `base.css`) — À GARDER IDENTIQUE à cette règle CSS. */
const HAUTEUR_MAX_IMG_PX = 140;

/** Peint `source` HORS ÉCRAN, par le MÊME chemin que la peinture réelle (`pageAvecMinuteurs`, donc
 *  un tag `#nom:secondes` y devient un vrai bouton), dans un conteneur qui reprend la largeur et la
 *  classe `.recette-page` de la vraie zone (même typographie, mêmes paddings — cf. leurs règles
 *  dans `base.css`) mais AUCUNE contrainte de hauteur : c'est justement la hauteur qu'on mesure.
 *  `v` ne sert qu'à `boutonMinuteur` (état encours/inactif, décompte) — la hauteur d'un bouton ne
 *  dépend d'aucun des deux (min-height fixe), seule sa PRÉSENCE compte pour cette mesure. Détruit
 *  son conteneur avant de rendre : rien ne doit rester dans le document au-delà de cet appel. */
function mesurerHorsEcran(source: string, v: ContexteMinuteurs, largeurPx: number): number {
  const conteneur = document.createElement('div');
  conteneur.className = 'recette-page';
  conteneur.style.cssText =
    `position:absolute; visibility:hidden; pointer-events:none; left:-9999px; top:0; `
    + `width:${largeurPx}px; height:auto; overflow:visible;`;
  document.body.appendChild(conteneur);
  try {
    render(html`${pageAvecMinuteurs(source, v)}`, conteneur);
    // Round 2 (revue) : une `<img>` tout juste posée dans le DOM n'a encore AUCUNE hauteur avant que
    // le réseau ne l'ait chargée (0 px mesurés à la première passe, 140 après chargement, cf. le
    // rapport de revue) — la mesure devenait alors dépendante de l'état du cache navigateur, pas du
    // contenu. Ce n'est pas un cas de bord : la quasi-totalité des pages du catalogue porte une
    // image. On force donc chaque `.recette-img` à son PLAFOND CSS (`max-height`, jamais dépassé,
    // cf. `HAUTEUR_MAX_IMG_PX`) avant de mesurer : une borne CONSERVATRICE — au pire la coupe tombe
    // un peu tôt (une image réelle plus petite que 140 px laisserait un peu de marge), jamais trop
    // tard, et le résultat ne dépend plus jamais du réseau.
    conteneur.querySelectorAll('img').forEach((img) => {
      (img as HTMLElement).style.height = `${HAUTEUR_MAX_IMG_PX}px`;
    });
    return conteneur.offsetHeight;
  } finally {
    render(html``, conteneur);
    document.body.removeChild(conteneur);
  }
}

/** Sous-découpe la page RÉELLEMENT peinte si elle dépasse la place disponible.
 *
 *  M1 (revue tâche 12, round 1) — NE RECOMPOSE JAMAIS DEPUIS DU HTML PEINT. La première version
 *  mesurait `zone.children` (le DOM déjà rendu par `pageAvecMinuteurs`) et recollait leur
 *  `outerHTML` : un tag `#nom:secondes` y avait déjà disparu, remplacé par le `<span
 *  class="recette-minuteur">` peint — recoller CE span produisait un bouton mort (sans
 *  `@pointerdown`, décompte figé) dès qu'une page contenant un tag était sous-découpée, exactement
 *  le cas que cette tâche cible. Et `zone.children` ignore les nœuds texte : un tag posé ENTRE deux
 *  balises (donc porté par un nœud texte de premier niveau) disparaissait purement et simplement de
 *  `pagesRecette` à la prochaine peinture.
 *
 *  Cette version repart TOUJOURS de la SOURCE (`pages[page]`, qui porte encore les tags) :
 *  `decouperEnUnites` la découpe en unités de premier niveau (éléments ET nœuds texte),
 *  `mesurerHorsEcran` peint CHAQUE unité isolément pour connaître sa vraie hauteur (mesure DOM :
 *  jsdom rend 0 partout, ce contrôle n'est donc vérifiable que par `outils/verifier-rendu.mjs`),
 *  `scinderSelonHauteur` (tâche 4) décide où couper, et les GROUPES DE CHAÎNES SOURCE (jamais de
 *  HTML peint) sont recollés. Un tag survit donc à la coupe : la page recomposée est re-peinte par
 *  le chemin normal (`rendreVueRecette` → `pageAvecMinuteurs`) à la prochaine `dessiner()`, qui lui
 *  fabrique un bouton vivant, comme n'importe quelle autre page.
 *
 *  Rend les pages recalculées (à mémoriser par l'appelant) ou `null` si rien ne change : sans ce
 *  `null`, chaque peinture relancerait une peinture, en boucle.
 *
 *  `mesurer` est injectable (par défaut `mesurerHorsEcran`) : jsdom rend 0 partout (aucune vraie
 *  mise en page), donc les tests unitaires de cette fonction ne peuvent porter que sur sa LOGIQUE de
 *  regroupement — en substituant un `mesurer` de test qui rend des hauteurs contrôlées — jamais sur
 *  la mesure réelle, qui ne peut être jugée que par `outils/verifier-rendu.mjs` (cf. son en-tête).
 *
 *  Round 3 (revue) — UNE UNITÉ SEULE QUI DÉBORDE EST SUBDIVISÉE, JAMAIS LAISSÉE TELLE QUELLE.
 *  Mesuré sur les 14 recettes du catalogue sans bloc `.page-recipes` (round 2) : leur description
 *  brute forme alors une seule unité, structurellement incoupable pour ce fichier AVANT ce
 *  correctif — un texte assez long y était écrêté en silence, sans le moindre signal, le pire mode
 *  de défaillance de ce projet. Deux points d'entrée mènent à `subdiviserUnite` : `unites.length < 2`
 *  (toute la page est une seule unité) et un GROUPE d'une seule unité encore trop haute après
 *  `scinderSelonHauteur` (la règle « un élément seul reste seul plutôt qu'une page vide », inchangée
 *  — seul son SORT change désormais). Dans les deux cas, la garantie de terminaison déjà validée par
 *  la revue (le nombre de pages croît strictement à chaque appel réussi) reste vraie : la
 *  subdivision ne réussit qu'en produisant AU MOINS 2 morceaux pour l'unité concernée (sinon elle
 *  échoue et cette unité reste seule, comme avant), donc `morceaux.length` ne peut que croître ou
 *  rester égal à `groupes.length` — jamais descendre en dessous. */
export function reScinder(
  racine: ParentNode, pages: string[], page: number, v: ContexteMinuteurs,
  mesurer: MesureFn = mesurerHorsEcran,
): string[] | null {
  const zone = racine.querySelector('.recette-page') as HTMLElement | null;
  if (!zone) return null;
  if (zone.scrollHeight <= zone.clientHeight) return null;
  const unites = decouperEnUnites(pages[page] ?? '');
  const dispo = zone.clientHeight;
  const largeur = zone.clientWidth;

  if (unites.length < 2) {
    // Toute la page est une seule unité (le cas des 14 recettes sans `.page-recipes`, round 2) :
    // rien à REGROUPER, mais elle peut encore être SUBDIVISÉE en elle-même.
    const sousUnites = subdiviserUnite(unites[0] ?? '', dispo, mesurer, v, largeur);
    if (sousUnites.length < 2) return null;   // insubdivisible (par ex. un seul mot géant) : filet
    return [...pages.slice(0, page), ...sousUnites, ...pages.slice(page + 1)];
  }

  const hauteurs = unites.map((u) => mesurer(u, v, largeur));
  const groupes = scinderSelonHauteur(hauteurs, dispo);
  if (groupes.length < 2) return null;
  const morceaux = groupes.flatMap((g) => {
    // Une unité SEULE plus haute que `dispo` (`scinderSelonHauteur` la laisse alors seule sur son
    // groupe, cf. son commentaire) : on tente de la subdiviser avant de l'accepter telle quelle.
    if (g.length === 1 && hauteurs[g[0]] > dispo) {
      const sous = subdiviserUnite(unites[g[0]], dispo, mesurer, v, largeur);
      if (sous.length >= 2) return sous;
    }
    return [g.map((i) => unites[i]).join('')];
  });
  if (morceaux.length < 2) return null;
  return [...pages.slice(0, page), ...morceaux, ...pages.slice(page + 1)];
}

type MesureFn = (source: string, v: ContexteMinuteurs, largeurPx: number) => number;

/** Extrait la balise ENVELOPPANTE d'une unité (`<p>…</p>`, `<h3>…</h3>`…) et son texte intérieur —
 *  SANS son balisage interne (round 3, limite ASSUMÉE et consignée pour la revue finale : un
 *  `<strong>`/`<em>` imbriqué ne survit pas à une subdivision, exactement le même « round-trip non
 *  exact » déjà noté au round 2). Une unité SANS balise enveloppante simple (un nœud texte brut, ou
 *  une balise qui ne s'ouvre/ferme pas proprement autour de tout son contenu — `<img>` par exemple)
 *  rend `ouvre`/`ferme` vides : la subdivision travaille alors directement sur le texte brut. `null`
 *  quand l'unité n'a NI texte exploitable NI balise simple (ex. `<img>` seule) : rien de sûr à
 *  subdiviser, `subdiviserUnite` l'accepte alors telle quelle. */
function decomposerBalise(unite: string): { ouvre: string; ferme: string; texte: string } | null {
  const brut = unite.trim();
  if (!brut.startsWith('<')) return { ouvre: '', ferme: '', texte: unite };
  const m = /^(<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>)([\s\S]*)<\/\2>\s*$/.exec(brut);
  if (!m) return null;
  const [, ouvre, tag, interieur] = m;
  const doc = new DOMParser().parseFromString(`<body>${interieur}</body>`, 'text/html');
  return { ouvre, ferme: `</${tag}>`, texte: doc.body.textContent ?? '' };
}

/** Les plages `[début, fin)` occupées par chaque occurrence de `MOTIF_TAG` dans `texte`. Round 4
 *  (revue) — AUCUNE coupe (phrase ou mot) ne doit jamais tomber À L'INTÉRIEUR de l'une d'elles :
 *  `MOTIF_TAG` (`#([^#\n]+?):(\d+)`, `src/recette.ts`) autorise TOUT caractère dans le nom d'un tag
 *  sauf `#` et le saut de ligne — espaces ET ponctuation de fin de phrase comprises. Vérifié par le
 *  propriétaire, puis recompté le 2026-08-17 : 62 des 98 VRAIS tags du catalogue
 *  (ceux du scan hors balise, cf. `pageAvecMinuteurs` — et non les 102 correspondances du scan naïf,
 *  qui comptent en plus 4 faux positifs d'attribut) ont une espace dans leur nom
 *  (« Cabillaud face 1 », « Crêpe face 1 »…) — la norme, pas l'exception. Une coupe par mots naïve
 *  romprait un tel tag en plusieurs mots, dont AUCUN ne matcherait plus `MOTIF_TAG` au prochain
 *  rendu (`pageAvecMinuteurs`) : le tag redevient du texte nu, exactement la classe « bouton mort »
 *  que le round 1 avait déjà fermée pour la RECOMPOSITION de pages — rouverte ici par la
 *  SUBDIVISION du round 3, faute d'avoir vérifié le format réel des tags avant d'écrire la coupe. */
function plagesDeTags(texte: string): { debut: number; fin: number }[] {
  return Array.from(texte.matchAll(MOTIF_TAG))
    .map((m) => ({ debut: m.index ?? 0, fin: (m.index ?? 0) + m[0].length }));
}

/** Découpe `texte` à chaque occurrence de `separateur` (un `RegExp` global), sauf celles qui
 *  tomberaient ENTIÈREMENT à l'intérieur d'une plage de tag (`plagesDeTags`) — ces frontières-là sont
 *  ignorées, comme si elles n'existaient pas, laissant le texte de part et d'autre dans le MÊME
 *  segment (donc le tag, lui, intact). Une frontière pile au bord d'un tag (juste avant `#`, juste
 *  après les chiffres) reste autorisée : elle ne mord sur rien. */
function decouperAuxSeparateurs(texte: string, separateur: RegExp): string[] {
  const plages = plagesDeTags(texte);
  const segments: string[] = [];
  let debut = 0;
  for (const m of texte.matchAll(separateur)) {
    const debutSep = m.index ?? 0;
    const finSep = debutSep + m[0].length;
    if (plages.some((p) => debutSep >= p.debut && finSep <= p.fin)) continue;   // couperait un tag
    segments.push(texte.slice(debut, debutSep));
    debut = finSep;
  }
  segments.push(texte.slice(debut));
  return segments.filter((s) => s !== '');
}

/** Frontières de PHRASES : après un `.`, `!` ou `?` suivi d'une espace — la ponctuation reste
 *  attachée à la phrase qui précède (une consigne coupée entre deux phrases reste lisible), l'espace
 *  elle-même est consommée par la coupe et reconstituée au recollage (`grouperParHauteur`, séparateur
 *  `' '`). Jamais à l'intérieur d'un tag (`decouperAuxSeparateurs`) : `MOTIF_TAG` n'interdit `.`/`!`/
 *  `?` nulle part dans un nom, même si aucun des 98 tags réels observés n'en porte aujourd'hui —
 *  cette coupe-ci ne suppose rien, elle vérifie. */
function decouperEnPhrases(texte: string): string[] {
  return decouperAuxSeparateurs(texte, /(?<=[.!?])\s+/g);
}

/** Frontières de MOTS : dernier recours, quand une phrase unique est déjà trop haute à elle seule —
 *  jamais de coupe à l'intérieur d'un mot, et jamais à l'intérieur d'un tag (`decouperAuxSeparateurs`)
 *  — c'est ICI que la casse du round 3 se produisait : un tag à nom espacé, encore entier après la
 *  coupe par phrases (aucune ponctuation de fin de phrase dedans), se faisait rompre par la coupe
 *  par mots, qui ne connaissait pas `MOTIF_TAG`. */
function decouperEnMots(texte: string): string[] {
  return decouperAuxSeparateurs(texte, /\s+/g);
}

/** Regroupe des segments (phrases ou mots) dans `ouvre…ferme`, en mesurant la hauteur CUMULÉE au fil
 *  de l'eau (jamais la hauteur d'un segment isolé — le texte réel s'enchaîne dans le même bloc, sa
 *  hauteur ne se déduit pas d'une somme de hauteurs mesurées séparément, contrairement aux unités de
 *  premier niveau de `reScinder`). Un seul segment qui dépasse déjà `dispo` à lui seul reste seul sur
 *  son groupe (même filet que `scinderSelonHauteur`) : le groupe résultant compte alors 1, signalant
 *  à l'appelant qu'il faut retenter à un grain plus fin (ou abandonner). */
function grouperParHauteur(
  segments: string[], ouvre: string, ferme: string, dispo: number,
  mesurer: MesureFn, v: ContexteMinuteurs, largeur: number,
): string[] {
  if (segments.length === 0) return [`${ouvre}${ferme}`];
  const groupes: string[] = [];
  let courant = '';
  for (const segment of segments) {
    const essai = courant ? `${courant} ${segment}` : segment;
    if (courant !== '' && mesurer(`${ouvre}${essai}${ferme}`, v, largeur) > dispo) {
      groupes.push(`${ouvre}${courant}${ferme}`);
      courant = segment;
    } else {
      courant = essai;
    }
  }
  groupes.push(`${ouvre}${courant}${ferme}`);
  return groupes;
}

/** Subdivise une unité SOURCE trop haute pour tenir seule dans `dispo`, d'abord aux frontières de
 *  phrases, à défaut (une phrase unique interminable) aux frontières de mots — jamais au milieu d'un
 *  mot. Rend `[unite]` (échec, l'appelant l'accepte alors telle quelle, comme avant ce correctif)
 *  quand ni l'un ni l'autre ne produit plus d'un morceau — un seul mot géant, par exemple. Le
 *  balisage enveloppant de l'unité, s'il en avait un, est préservé sur CHAQUE morceau (`<p>` reste
 *  `<p>`, jamais du texte nu) — cf. `decomposerBalise`. */
function subdiviserUnite(
  unite: string, dispo: number, mesurer: MesureFn, v: ContexteMinuteurs, largeur: number,
): string[] {
  const decompose = decomposerBalise(unite);
  if (!decompose) return [unite];
  const { ouvre, ferme, texte } = decompose;
  const parPhrases = grouperParHauteur(decouperEnPhrases(texte), ouvre, ferme, dispo, mesurer, v, largeur);
  if (parPhrases.length >= 2) return parPhrases;
  const parMots = grouperParHauteur(decouperEnMots(texte), ouvre, ferme, dispo, mesurer, v, largeur);
  return parMots.length >= 2 ? parMots : [unite];
}

/** Étend une table `pageSourceIndex` (`demarrage.ts`) pour suivre une sous-découpe : `reScinder`
 *  vient de remplacer `pages[page]` par plusieurs sous-pages (`pages.length` valait `longueurAvant`,
 *  vaut maintenant `longueurApres`) — les nouvelles héritent TOUTES du MÊME index de page SOURCE que
 *  la page dont elles sont issues, jamais un nouvel index. C'est cette table que `memoriserRecette`
 *  (`demarrage.ts`) consulte pour PERSISTER un index qui survit à un redémarrage : au redémarrage,
 *  `pagesRecette` est reconstruite depuis les pages source grossières (`decouperPages`), jamais
 *  depuis une sous-découpe qui dépend d'une mesure DOM absente du stockage — persister l'index FIN
 *  ferait reprendre sur la mauvaise étape dès qu'une coupe a eu lieu avant l'écriture.
 *
 *  Pure, sans DOM : testable directement, contrairement à `reScinder` lui-même. */
export function etendreIndexSource(
  index: number[], page: number, longueurAvant: number, longueurApres: number,
): number[] {
  const ajoutees = longueurApres - longueurAvant + 1;
  return [...index.slice(0, page), ...Array(ajoutees).fill(index[page]), ...index.slice(page + 1)];
}

/** Le « Étape N/T » du bloc RÉDUIT (`rendreRecetteReduite`, `rendu/defaut.ts`), compté en pages
 *  SOURCE — celles que le propriétaire a écrites — et jamais en sous-pages.
 *
 *  REVUE FINALE (2026-08-17) : `demarrage.ts` annonçait `pagesRecette.length`, c'est-à-dire la
 *  version SOUS-DÉCOUPÉE, et affichait donc « Étape 2/4 » sur une recette de 3 étapes — un total qui
 *  change avec la hauteur du texte peint. Le spec (§4) est explicite : « une "étape" est une page de
 *  la recette, jamais un découpage propre à l'app ». `index` (`pageSourceIndex`, `demarrage.ts`) est
 *  la table qui porte la correspondance, et elle a TOUJOURS la même longueur que `pagesRecette`
 *  (posée par identité à l'ouverture, étendue par `etendreIndexSource` ci-dessus, qui rend
 *  exactement `longueurApres` entrées) : le bornage de la page lue se fait donc sur `index` lui-même.
 *
 *  Pure, sans DOM, pour la même raison qu'`etendreIndexSource` : `reScinder` ne peut être exercée
 *  que par `outils/verifier-rendu.mjs` (jsdom ne mesure aucune hauteur), mais le COMPTE, lui, se
 *  vérifie ici. `index` vide (description vide, aucune page) rend « 1/1 », jamais « 0/1 » ni
 *  « 1/0 ». */
export function etapeSource(index: number[], page: number): { etape: number; total: number } {
  const total = Math.max(1, new Set(index).size);
  const lue = Math.max(0, Math.min(page, index.length - 1));
  return { etape: Math.min((index[lue] ?? lue) + 1, total), total };
}
