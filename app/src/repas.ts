/** L'étiquette du repas suivant : « Dîner », « Demain, déjeuner », « Lundi, dîner ».
 *
 *  C'est TOUT ce qui survit du parcours de plan de repas d'avant le lot 6. `candidatsRepas`,
 *  `resoudreRepasSuivant` et ses trois issues `repas`/`aucun`/`muet` sont morts avec l'ancienne
 *  source : la
 *  tablette ne parcourt plus aucun plan, `home_stock` a déjà fait ce travail et l'a publié dans
 *  les attributs de `sensor.home_stock_next_meal` (cf. `src/garde-manger.ts`).
 *
 *  Le choix de l'étiquette, lui, reste une décision d'AFFICHAGE — elle dépend de la place
 *  disponible sur `.mode-bloc .t` et de l'usage français, pas de la source de données. D'où ce
 *  fichier, séparé, PUR : l'horloge est reçue en paramètre, aucune lecture d'`Etat`, aucun
 *  réseau. Même discipline que `contexte.ts`, `jauge.ts` et `modes.ts`. */

/** Les quatre créneaux de `home_stock` (`MEAL_SLOT_KEYS`, `const.py`), en français. */
const ETIQUETTES_CRENEAU: Record<string, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
};

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Fuseau LOCAL, comme partout ailleurs dans ce projet (`estCeJour`, `agenda.ts`) : `day` est une
 *  date CIVILE sans zone, la comparer en UTC décalerait le basculement du soir. `null` si elle est
 *  illisible — l'étiquette se contente alors du créneau. */
function dateCivile(jour: string): Date | null {
  const [a, m, j] = jour.split('-').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(m) || !Number.isFinite(j)) return null;
  const d = new Date(a, m - 1, j);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Le nombre de jours civils qui séparent `cible` de `maintenant`. */
function ecartEnJours(cible: Date, maintenant: Date): number {
  const base = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  return Math.round((cible.getTime() - base.getTime()) / 86_400_000);
}

/** « Dîner » aujourd'hui, « Demain, déjeuner » demain, « Lundi, dîner » au-delà.
 *
 *  Le jour de la semaine plutôt qu'un « Demain » générique passé J+1 : un repas de lundi annoncé
 *  « Demain » est un mensonge affiché en grand dans la cuisine, exactement ce que ce projet traque
 *  (cf. l'« Unknown recipe » que l'ancien chemin de lecture pouvait écrire).
 *
 *  Repli « Repas » quand le créneau est illisible ou absent : un composant plus ancien que ce
 *  bundle, ou un attribut d'une forme inattendue, ne doit jamais produire une étiquette vide —
 *  `.mode-bloc .t` resterait alors une ligne blanche au milieu de l'écran. */
export function etiquetteRepas(
  jour: string | null, creneau: string | null, maintenant: Date,
): string {
  const nom = (creneau && ETIQUETTES_CRENEAU[creneau]) ?? null;
  if (!nom) return 'Repas';
  const cible = jour ? dateCivile(jour) : null;
  if (!cible) return nom;
  const ecart = ecartEnJours(cible, maintenant);
  if (ecart <= 0) return nom;
  const prefixe = ecart === 1 ? 'Demain' : JOURS[cible.getDay()];
  return `${prefixe}, ${nom.toLowerCase()}`;
}
