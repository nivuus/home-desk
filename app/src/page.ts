/** Which screen should this page show?
 *
 *  Separate from `index.ts` because `index.ts` runs ON IMPORT: importing it means launching it.
 *  A three-branch decision, one of which is TEMPORARY, deserves better than a hope. */
import { ECRANS } from './ecran';
import { startScreen as startScreenHA, startWithScreen as startWithLiteral } from './demarrage';

export type DependancesPage = {
  startScreen: (racine: HTMLElement, nomEcran: string) => Promise<void>;
  startWithScreen: (racine: HTMLElement, piece: (typeof ECRANS)[keyof typeof ECRANS]) => Promise<void>;
};

/** Resolves the screen and starts, in this order of priority:
 *
 *  1. **`?ecran=<nom>`** → the websocket transport. This is the final path. The parameter carries
 *     the screen's `nom` ("Cuisine"), which the component matches EXACTLY — never the `ECRANS`
 *     key ("cuisine"). It wins over `data-piece`: during the migration, a repointed legacy page
 *     carries both, and if the literal won, repointing a tablet would change nothing.
 *
 *  2. **`data-piece=<key>` → `ECRANS[key]`** — ⚠️ **TRANSITION BRANCH, added on 2026-09-13,
 *     to be REMOVED at step 8 of the production rollout (plan 3c), in the same commit as the
 *     literals, the export tool and the three legacy pages.**
 *
 *     It exists for a precise and measured reason: `hooks/install.py:107` replaces
 *     `www/wallpanel/` ENTIRELY and atomically (`replace_tree`), and the three legacy pages load
 *     the SAME `wallpanel.js`. Dropping in the new bundle therefore switches all three tablets
 *     at once, whatever their URL — the rollback granularity is the BUNDLE, not the tablet.
 *     Without this branch, steps 5, 6 and 7 of the production rollout have NO rollback and the
 *     switch becomes one-shot.
 *
 *     With it, restoring the old `startURL` loads the legacy page, which takes this path, which
 *     reads the literal: the previous behaviour, byte for byte, since it is literally the same
 *     code.
 *
 *  3. **Nothing** → the first degradation: the list of configured screens, tappable.
 */
export function startPage(
  racine: HTMLElement, href: string, deps: Partial<DependancesPage> = {},
): Promise<void> {
  const startScreen = deps.startScreen ?? startScreenHA;
  const startWithScreen = deps.startWithScreen ?? startWithLiteral;

  const nom = new URL(href).searchParams.get('ecran');
  if (nom) return startScreen(racine, nom);

  // --- TRANSITION BRANCH, to be removed at step 8 of plan 3c ---
  const cle = racine.dataset.piece as keyof typeof ECRANS | undefined;
  if (cle && cle in ECRANS) return startWithScreen(racine, ECRANS[cle]);
  // --- end of the transition branch ---

  return startScreen(racine, '');
}
