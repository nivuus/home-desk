/** Ce qui alimente les pages de la vue « Recette », et comment on les prépare pour l'app.
 *
 *  DEUX ENTRÉES depuis le lot 6 (2026-08-21), une seule SORTIE — un tableau de pages HTML :
 *  1. `pagesDepuisEtapes` : les étapes STRUCTURÉES de `home_stock/recipe/get` (`recipe_step` +
 *     `recipe_instruction` déjà imbriquées). C'est la source d'aujourd'hui.
 *  2. `decouperPages` : un HTML déjà paginé en blocs `.page-recipes`. C'était la forme de
 *     l'ancienne source ; elle reste supportée parce que les fixtures de rendu, longues et
 *     précieuses, ne se réécrivent pas pour une bascule de source.
 *
 *  Une seule sortie, donc un seul rendu à mesurer : le budget de hauteur, le sous-découpage
 *  (`reScinder`) et les minuteurs `#nom:secondes` sont déjà testés sur cette forme-là. On n'en
 *  invente pas une seconde.
 *
 *  `assainir` prépare ensuite le tout : retrait des couleurs en dur (`color:#555` sur fond sombre
 *  échoue au contrôle de contraste 5:1), plafonnement des images, retrait de tout ce qui est
 *  exécutable. Pas de DOM persistant ici : `DOMParser` sert de parseur, on rend des chaînes —
 *  c'est ce qui garde ces fonctions testables sans navigateur. */

// REVUE FINALE (2026-08-17) : `extraireTags` a été SUPPRIMÉE de ce fichier. Elle n'avait aucun
// appelant en production — la tâche 8 a choisi un scan hors-balise interne à `rendu/recette.ts`
// (`pageAvecMinuteurs`) — et elle reconduisait exactement le défaut que ce scan a coûté deux rounds
// à fermer : appliquée à du HTML, elle matche `#888;font-size:14` À L'INTÉRIEUR d'un attribut
// `style` (4 faux positifs sur les recettes réelles, cf. `pageAvecMinuteurs`). Trois tests lui
// donnaient un vernis de validité en ne l'appelant que sur du texte nu. Un point d'entrée mort qui
// répond faux au premier appelant qui le trouverait n'est pas une commodité : c'est un piège.

/** `#nom:secondes` dans le texte d'une étape — le bouton de minuteur inline de la vue « Recette »,
 *  scanné par `pageAvecMinuteurs` (`rendu/recette.ts`). Le motif est celui des recettes déjà
 *  écrites : le changer les casserait, et `pagesDepuisEtapes` l'ÉCRIT plutôt que d'ouvrir un
 *  second canal pour dire la même chose. */
export const MOTIF_TAG = /#([^#\n]+?):(\d+)/g;

function analyser(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

export function decouperPages(html: string): string[] {
  if (html.trim() === '') return [];
  const doc = analyser(html);
  const blocs = Array.from(doc.querySelectorAll('.page-recipes'));
  // Une description sans bloc reste une page : recompté le 2026-08-17, c'était alors le cas
  // de 14 des 84 recettes DÉCRITES de cette installation (87 recettes `normal` au total, dont 3
  // sans aucune description). Jamais zéro page pour un contenu non vide — l'écran afficherait un
  // cadre creux.
  if (blocs.length === 0) return [html];
  // Retient uniquement les blocs de top-level : ignore les blocs imbriqués dans un autre
  // `.page-recipes` pour éviter le dédoublonnage du contenu enfant.
  return blocs
    .filter((b) => !b.parentElement?.closest('.page-recipes'))
    .map((b) => b.innerHTML);
}

/** Déclarations de style à retirer sur TOUS les éléments : celles qui décident d'une couleur
 *  (les jetons M3 doivent reprendre la main) ou d'un fond. */
const STYLES_INTERDITS_TOUS = /^(color|background|background-color)$/i;

/** Déclarations de style supplémentaires à retirer sur les images uniquement : hauteurs/largeurs
 *  plafonnées par `.recette-img` dans `base.css`. */
const STYLES_INTERDITS_IMG = /^(width|height|max-height)$/i;

export function assainir(html: string): string {
  const doc = analyser(html);
  doc.querySelectorAll('script, style').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      // Rien d'exécutable : ce HTML est local, mais il n'a aucune raison de porter du script.
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    }
    const style = el.getAttribute('style');
    if (style !== null) {
      const estImage = el.tagName.toLowerCase() === 'img';
      const garde = style.split(';')
        .map((d) => d.trim())
        .filter((d) => {
          if (d === '') return false;
          const prop = d.split(':')[0].trim().toLowerCase();
          // Styles interdits pour TOUS les éléments (contraste, jetons M3)
          if (STYLES_INTERDITS_TOUS.test(prop)) return false;
          // Styles interdits supplémentaires pour les images uniquement
          if (estImage && STYLES_INTERDITS_IMG.test(prop)) return false;
          return true;
        })
        .join(';');
      if (garde === '') el.removeAttribute('style');
      else el.setAttribute('style', garde);
    }
  });
  // Les images gardent leur place mais plus leur taille : `.recette-img` les plafonne à 140 px,
  // sans quoi une page d'étape de 454 caractères + une image de 200 px dépasse les 585 px.
  // Préserve les classes existantes via classList.add() au lieu de setAttribute().
  doc.querySelectorAll('img').forEach((img) => img.classList.add('recette-img'));
  return doc.body.innerHTML;
}


/** Une étape telle que `home_stock/recipe/get` la rend (`repo.list_steps`, `repositories.py`) :
 *  la ligne de `recipe_step` avec ses puces de `recipe_instruction` déjà imbriquées. */
export type EtapeRecette = {
  position: number;
  title: string | null;
  image_url: string | null;
  instructions: {
    text: string;
    /** Le libellé et la durée vont ensemble ou pas du tout — c'est une contrainte de SCHÉMA
     *  (`CHECK ((timer_label IS NULL) = (timer_seconds IS NULL))`), pas une convention. */
    timer_label: string | null;
    timer_seconds: number | null;
  }[];
};

/** Échappe ce qui vient du composant. Le texte d'une étape est saisi par le propriétaire : il peut
 *  contenir « a < b », un `&`, ou n'importe quoi d'autre qui casserait le HTML qu'on fabrique.
 *  `assainir` retire l'exécutable APRÈS coup, mais il ne rattrape pas une balise qu'on aurait
 *  soi-même ouverte au mauvais endroit. */
function echapper(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Les étapes structurées, une page par étape, dans le MÊME HTML que produisaient les pages
 *  `.page-recipes` de l'ancienne source : un titre `<h3>`, une liste `<ol>`, l'image de l'étape si
 *  elle en a une.
 *
 *  Les minuteurs sont écrits en clair (`#Cuisson:1500`) dans le texte de la puce : c'est là que
 *  `pageAvecMinuteurs` (`rendu/recette.ts`) les cherche, et ce mécanisme marche — le lot 6 ne le
 *  remplace pas, il l'alimente.
 *
 *  NE LÈVE JAMAIS : ce qui arrive ici a traversé un websocket (`envoyerCommande` rend `unknown`)
 *  et peut venir d'un composant plus ancien que ce bundle. Une forme inattendue produit une page
 *  pauvre, jamais un écran cassé.
 *
 *  Une recette SANS étape reste UNE page : zéro page afficherait « Étape 0/0 » au-dessus d'un
 *  cadre creux, et une recette sans étape a quand même ses ingrédients à montrer. */
export function pagesDepuisEtapes(etapes: EtapeRecette[]): string[] {
  const liste = Array.isArray(etapes) ? etapes : [];
  if (liste.length === 0) return [''];
  return liste.map((e, i) => {
    const numero = typeof e?.position === 'number' && Number.isFinite(e.position)
      ? e.position : i + 1;
    const titre = typeof e?.title === 'string' && e.title.trim() !== ''
      ? ` — ${echapper(e.title)}` : '';
    const puces = (Array.isArray(e?.instructions) ? e.instructions : []).map((p) => {
      const tag = typeof p?.timer_label === 'string' && p.timer_label.trim() !== ''
        && typeof p?.timer_seconds === 'number' && Number.isFinite(p.timer_seconds)
        ? ` #${echapper(p.timer_label)}:${Math.round(p.timer_seconds)}` : '';
      return `<li>${echapper(p?.text)}${tag}</li>`;
    }).join('');
    const image = typeof e?.image_url === 'string' && e.image_url !== ''
      ? `<img src="${echapper(e.image_url)}">` : '';
    return `${image}<h3>Étape ${echapper(numero)}${titre}</h3><ol>${puces}</ol>`;
  });
}
