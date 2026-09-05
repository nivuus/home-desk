/** Répartit les éléments d'une page de recette en sous-pages qui tiennent dans la hauteur
 *  disponible. La pire page du catalogue (454 caractères + image) fait environ 700 px pour 585 px
 *  d'écran : sans ce découpage, soit elle déborde (interdit), soit elle défile (un geste, interdit
 *  aussi sur ces dalles).
 *
 *  PURE et sans DOM : reçoit des hauteurs déjà mesurées, rend des indices. C'est ce qui permet de
 *  tester la règle de coupe sans navigateur — jsdom ne calcule aucune hauteur, la MESURE elle-même
 *  n'est donc vérifiable que par `outils/verifier-rendu.mjs`.
 *
 *  La coupe tombe TOUJOURS entre deux éléments : jamais au milieu d'un `<li>` ou d'un paragraphe,
 *  ce qui couperait une consigne de cuisine en deux. */
export function scinderSelonHauteur(hauteurs: number[], dispo: number): number[][] {
  if (hauteurs.length === 0) return [[]];
  const pages: number[][] = [];
  let courante: number[] = [];
  let cumul = 0;
  hauteurs.forEach((h, i) => {
    // Un élément seul plus haut que la place disponible reste seul sur sa sous-page : mieux vaut
    // une sous-page un peu trop haute qu'une sous-page vide, ou une boucle infinie.
    if (courante.length > 0 && cumul + h > dispo) {
      pages.push(courante);
      courante = [];
      cumul = 0;
    }
    courante.push(i);
    cumul += h;
  });
  pages.push(courante);
  return pages;
}
