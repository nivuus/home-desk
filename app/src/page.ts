/** Quel écran cette page doit-elle montrer ?
 *
 *  Séparé d'`index.ts` parce qu'`index.ts` s'exécute À L'IMPORT : l'importer, c'est le lancer.
 *  Une décision à trois branches dont l'une est TEMPORAIRE mérite mieux qu'un espoir. */
import { ECRANS } from './ecran';
import { demarrer as demarrerHA, demarrerAvecEcran as demarrerLitteral } from './demarrage';

export type DependancesPage = {
  demarrer: (racine: HTMLElement, nomEcran: string) => Promise<void>;
  demarrerAvecEcran: (racine: HTMLElement, piece: (typeof ECRANS)[keyof typeof ECRANS]) => Promise<void>;
};

/** Résout l'écran et démarre, dans cet ordre de priorité :
 *
 *  1. **`?ecran=<nom>`** → le transport websocket. C'est le chemin définitif. Le paramètre porte
 *     le `nom` de l'écran (« Cuisine »), que le composant apparie EXACTEMENT — jamais la clé de
 *     `ECRANS` (« cuisine »). Il gagne sur `data-piece` : pendant la migration, une page
 *     historique repointée porte les deux, et si le littéral gagnait, repointer une tablette ne
 *     changerait rien.
 *
 *  2. **`data-piece=<clé>` → `ECRANS[clé]`** — ⚠️ **BRANCHE DE TRANSITION, posée le 2026-09-13,
 *     à RETIRER à l'étape 8 de la mise en production (plan 3c), dans le même commit que les
 *     littéraux, l'outil d'export et les trois pages historiques.**
 *
 *     Elle existe pour une raison précise et mesurée : `hooks/install.py:107` remplace
 *     `www/wallpanel/` EN ENTIER et atomiquement (`replace_tree`), et les trois pages historiques
 *     chargent le MÊME `wallpanel.js`. Déposer le nouveau bundle bascule donc les trois tablettes
 *     d'un coup, quelle que soit leur URL — la granularité du retour arrière est le BUNDLE, pas
 *     la tablette. Sans cette branche, les étapes 5, 6 et 7 de la mise en production n'ont AUCUN
 *     retour arrière et la bascule devient unique.
 *
 *     Avec elle, remettre l'ancienne `startURL` fait charger la page historique, qui prend ce
 *     chemin-ci, qui lit le littéral : le comportement d'avant, octet pour octet, puisque c'est
 *     littéralement le même code.
 *
 *  3. **Rien** → la première dégradation : la liste des écrans configurés, tapable.
 */
export function demarrerPage(
  racine: HTMLElement, href: string, deps: Partial<DependancesPage> = {},
): Promise<void> {
  const demarrer = deps.demarrer ?? demarrerHA;
  const demarrerAvecEcran = deps.demarrerAvecEcran ?? demarrerLitteral;

  const nom = new URL(href).searchParams.get('ecran');
  if (nom) return demarrer(racine, nom);

  // --- BRANCHE DE TRANSITION, à retirer à l'étape 8 du plan 3c ---
  const cle = racine.dataset.piece as keyof typeof ECRANS | undefined;
  if (cle && cle in ECRANS) return demarrerAvecEcran(racine, ECRANS[cle]);
  // --- fin de la branche de transition ---

  return demarrer(racine, '');
}
