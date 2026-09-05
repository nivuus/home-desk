/** Règles d'affichage. Fonctions pures : rien du DOM, rien de Home Assistant, aucune horloge
 *  implicite. C'est ce qui les rend testables sans navigateur. */

export type Moment = 'jour' | 'soir' | 'nuit';

/** Les bornes horaires priment sur le soleil pour la nuit ; le soleil ne départage que le
 *  jour et le soir. Sans cette règle, « matin » devenait inatteignable en hiver. */
export function momentDuJour(heure: number, soleilLeve: boolean): Moment {
  if (heure >= 23 || heure < 5) return 'nuit';
  return soleilLeve ? 'jour' : 'soir';
}

/** `sujet` (ronde de correction 2) : le mot court affiché en première ligne de `rendreAlerte`
 *  (`rendu/corps.ts`) — « Croquettes », « Fontaine », « Porte »... Porté par la règle elle-même
 *  (`alertes.ts`), jamais déduit ailleurs (ex. depuis `cle` ou le domaine de l'entité) : la même
 *  discipline que `EntreeSynthese` dans `pieces.ts`, où c'est aussi la donnée qui porte son sens,
 *  pas une fonction qui devine à partir d'un identifiant. */
export type Alerte = { cle: string; sujet: string; texte: string; depuis: number };

const REPLI_MS = 15 * 60_000;

/** Une alerte occupe le premier plan tant que quelqu'un bouge — quelqu'un peut agir. Dès que
 *  la maison est calme depuis un quart d'heure, elle se replie sur la ligne de synthèse. */
export function alerteActive(
  alertes: Alerte[], dernierMouvement: number, maintenant: number,
): Alerte | null {
  if (alertes.length === 0) return null;
  if (maintenant - dernierMouvement >= REPLI_MS) return null;
  return alertes.reduce((a, b) => (b.depuis > a.depuis ? b : a));
}

