/** Le garde-manger, lu dans les ATTRIBUTS des entités `home_stock`.
 *
 *  Remplace le client HTTP qui interrogeait la source précédente (8,3 ko, deux bases d'URL selon
 *  le protocole, trois issues de panne) en beaucoup plus petit — et sans une seule requête.
 *
 *  POURQUOI UNE LECTURE D'ATTRIBUT ET PAS UNE COMMANDE WEBSOCKET. Ce n'est pas de l'élégance,
 *  c'est de l'économie. `Etat.notifier` coalesce déjà les redessins et la souscription
 *  `state_changed` existe depuis le premier jour : la donnée arrive donc gratuitement, au rythme
 *  de la maison. Ajouter une lecture périodique reproduirait EXACTEMENT le défaut que l'ancien
 *  client a mis trois mois à corriger — 3,8 Mo × 96 par jour sur une Fire 7 à 130 Mo de libre.
 *  **La donnée qui tient dans un attribut se lit dans l'attribut.**
 *
 *  Le gain, chiffré : −3,8 Mo/jour de trafic HTTP, −1 client HTTP, et −1 chemin de panne —
 *  « source muette » et sa règle « surtout ne pas passer au repas suivant » disparaissent, remplacés
 *  par `Etat.estUtilisable`, le masquage générique déjà en place pour toute entité indisponible.
 *
 *  PUR : `Etat` et l'horloge sont reçus en argument, jamais importés globalement. Même discipline
 *  que `contexte.ts`, `jauge.ts` et `modes.ts` — donc testable sans navigateur.
 *
 *  NE LÈVE JAMAIS. Un composant plus ancien que ce bundle ne publie pas encore `meal_id` ; un
 *  attribut peut arriver dans n'importe quelle forme. L'écran doit vivre dans tous les cas. */
import type { Etat } from './etat';
import { etiquetteRepas } from './repas';

/** L'entité qui porte le repas suivant. Son ÉTAT est le nom du plat
 *  (`recipe_name or product_name or note`), tout le reste est en attributs. */
export const CAPTEUR_REPAS = 'sensor.home_stock_next_meal';

/** La liste des lots qui périment. L'état d'une entité `todo` est le NOMBRE d'éléments non
 *  cochés — et le compte est ce qu'on lit de loin, ce qu'un `binary_sensor` ne saurait dire. */
export const LISTE_DLC = 'todo.home_stock_expirations';

export type RepasSuivant = {
  /** « Dîner », « Demain, déjeuner », « Lundi, dîner ». */
  etiquette: string;
  /** Nom de la recette, du produit ou texte de la note — l'état du capteur, tel quel. */
  plat: string;
  /** La clé de validation du repas (`meal/validate`). `null` quand le composant est plus ancien
   *  que ce bundle : le bloc s'affiche alors, il n'est simplement pas validable. */
  mealId: number | null;
  /** Non nul ⇒ il y a une recette à ouvrir en vue `#recette`. `null` pour une note, un produit,
   *  ou un composant qui ne publie pas encore l'attribut. */
  recetteId: number | null;
  /** Le nombre d'ingrédients absents du stock. 0 quand l'attribut manque : on n'invente pas un
   *  avertissement à partir d'une ignorance. */
  manquants: number;
};

function texte(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

/** Un attribut peut arriver dans n'importe quelle forme (`meal_id: 'douze'`, `day: []`) : tout ce
 *  qui n'est pas un nombre fini devient `null`, jamais `NaN` ni une exception. */
function entier(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Le repas suivant, ou `undefined` quand il n'y en a pas à montrer.
 *
 *  `undefined` couvre DEUX situations que rien ne distingue à l'écran : le composant est muet
 *  (`unavailable`) et le planning est vide (état vide). Les deux sont ordinaires sur cette
 *  installation, et les deux appellent le même repli — `rendreEntretien` prend la place. */
export function repasSuivant(etat: Etat, maintenant: Date): RepasSuivant | undefined {
  if (!etat.estUtilisable(CAPTEUR_REPAS)) return undefined;
  const e = etat.lire(CAPTEUR_REPAS)!;
  const a = e.attributs ?? {};
  return {
    etiquette: etiquetteRepas(texte(a.day), texte(a.slot), maintenant),
    plat: e.etat,
    mealId: entier(a.meal_id),
    recetteId: entier(a.recipe_id),
    manquants: entier(a.missing_ingredients) ?? 0,
  };
}

/** Le nombre de lots qui périment, ou `undefined` quand la liste ne dit rien d'exploitable.
 *
 *  `undefined` n'est PAS `0` : zéro est un fait (rien ne périme), `undefined` une ignorance. Les
 *  deux masquent la ligne aujourd'hui — le jour où elle dira « aucun produit à consommer », la
 *  différence deviendra visible d'un coup. */
export function nombreDlc(etat: Etat): number | undefined {
  if (!etat.estUtilisable(LISTE_DLC)) return undefined;
  const n = Number(etat.lire(LISTE_DLC)!.etat);
  return Number.isFinite(n) ? n : undefined;
}
