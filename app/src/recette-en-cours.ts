/** L'étape en cours de lecture, hors de la page : Android tue régulièrement Fully sur ces Fire 7
 *  (cf. `minuteur.ts`, même raison pour l'état des minuteurs), et perdre l'étape au milieu d'une
 *  cuisson est exactement ce que cette fonctionnalité doit empêcher. Même mécanisme que le
 *  `<app>_recipe_state` de l'ancienne page autonome, avec en plus une péremption.
 *
 *  Ne lève jamais : un stockage illisible, plein ou refusé (mode privé) rend simplement
 *  `undefined`, l'écran repart du repas suivant. */
export const CLE_RECETTE = 'wallpanel_recette';

/** 4 h : au-delà, la recette n'est plus « en cours », c'est un écran mural resté allumé sur le
 *  dîner de la veille. Le repli de 30 min de la vue RÉDUIT (il ne ferme pas) ; c'est cette
 *  péremption-là qui finit par oublier. */
export const PEREMPTION_MS = 4 * 3_600_000;

export type EtatRecette = { uid: string; page: number; majLe: number };

export function lireRecette(
  stockage: Pick<Storage, 'getItem'>, maintenantMs: number,
): EtatRecette | undefined {
  try {
    const brut = stockage.getItem(CLE_RECETTE);
    if (brut === null) return undefined;
    const e = JSON.parse(brut) as Partial<EtatRecette>;
    if (typeof e.uid !== 'string' || typeof e.page !== 'number' || typeof e.majLe !== 'number') {
      return undefined;
    }
    if (maintenantMs - e.majLe > PEREMPTION_MS) return undefined;
    return { uid: e.uid, page: e.page, majLe: e.majLe };
  } catch {
    return undefined;
  }
}

export function ecrireRecette(stockage: Pick<Storage, 'setItem'>, e: EtatRecette): void {
  try { stockage.setItem(CLE_RECETTE, JSON.stringify(e)); } catch { /* stockage plein/refusé */ }
}

export function effacerRecette(stockage: Pick<Storage, 'removeItem'>): void {
  try { stockage.removeItem(CLE_RECETTE); } catch { /* idem */ }
}
