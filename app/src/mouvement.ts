/** Le niveau de mouvement demandé au montage, et rien d'autre.
 *
 *  Ce fichier portait aussi, jusqu'au 2026-08-22, un régulateur de cadence : il mesurait les images
 *  réellement peintes pendant chaque transition et faisait tomber d'un cran les rôles passés sous
 *  30 im/s. Il a été retiré sur décision du propriétaire, parce qu'il éteignait l'écran entier au
 *  lieu du rôle fautif — `consommerSaccadees()` rendait TOUS les noms tombés pendant la même trame,
 *  et une trame longue (rafale de `state_changed`, ramassage mémoire, réveil d'écran) les faisait
 *  donc tous tomber ensemble. Deux épisodes suffisaient à mettre le mur à `aucun`, sans retour
 *  avant rechargement de la page — et la tablette du bureau n'a ni `tabReloadTimer` ni
 *  `clearCacheOnReload`.
 *
 *  Le repli manuel demeure et suffit : `?mouvement=sobre` se pose depuis Fully Kiosk en quelques
 *  secondes, sans reconstruire ni redéployer quoi que ce soit. */

export type Niveau = 'complet' | 'sobre' | 'aucun';

const NIVEAUX: Niveau[] = ['complet', 'sobre', 'aucun'];

/** `prefers-reduced-motion` prime sur tout — c'est une préférence système, pas une option de
 *  l'application. Une valeur inconnue est ignorée, jamais une erreur : un écran mural ne doit pas
 *  mourir d'une faute de frappe dans une URL. */
export function niveauDemande(url: string, mouvementReduit: boolean): Niveau {
  if (mouvementReduit) return 'aucun';
  const brut = new URL(url).searchParams.get('mouvement');
  return NIVEAUX.includes(brut as Niveau) ? (brut as Niveau) : 'complet';
}
