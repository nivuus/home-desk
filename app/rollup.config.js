import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import css from 'rollup-plugin-import-css';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RACINE, 'dist');

// The bundle carries the household's French interface text, and minified multi-line template
// literals are not recognised as strings by the org's English check (nivuus/.github,
// `check-english.sh`), which would flag every rebuilt line of `dist/wallpanel.js`. That check
// honours a whole-file marker meant precisely for multi-line user-facing text; the banner below
// writes it at the top of the bundle and terser is told to keep that one comment. The marker is
// assembled from two halves so that THIS file, whose own comments must stay checked, does not
// contain it verbatim (the check greps the raw file for it).
const MARQUEUR_TEXTE_UI = ['policy:', 'allow-fr-file'].join(' ');
// Same reason for the org's 500-line rule (`check-file-size.sh`): it is written for hand-written
// source, and the bundle's length is the build's. It crossed 500 lines on 2026-09-28 (pantry view).
const LENGTH_MARKER = ['policy:', 'allow-long-file'].join(' ');
// terser keeps ONLY this exact banner: matching the bare marker would also keep any source comment
// that happens to carry it (`rendu/repli.ts` does), and ship that prose inside the bundle.
const BANNIERE = `${MARQUEUR_TEXTE_UI} ${LENGTH_MARKER} -- generated bundle carrying French UI text`;

// The Lottie player's bundle needs neither marker: it carries no French text, and its minified
// output is two lines (measured on 2026-09-28, dotlottie-web 0.80.0). Its banner only names it.
const BANNIERE_LOTTIE = 'generated bundle: @lottiefiles/dotlottie-web';

const app = {
  input: 'src/index.ts',
  output: {
    // La sortie est RELATIVE au depot (decision 2 de la spec) : `dist/` est suivi
    // par git, donc `git archive HEAD` l'emporte et l'installateur n'a jamais
    // besoin de Node. Avant le 2026-09-04 ce chemin etait absolu et pointait vers
    // un repertoire de production — un build ne pouvait donc pas se faire ailleurs
    // que sur la machine de son auteur, et le contrat nivuus.dev/v1 ne pouvait pas
    // livrer le bundle. (Il avait deja ete corrige le 2026-08-28 d'un premier
    // emplacement disparu vers celui du socle ; le rendre relatif clot l'affaire.)
    dir: DIST,
    entryFileNames: 'wallpanel.js',
    format: 'iife', name: 'Wallpanel', sourcemap: false,
    banner: `/* ${BANNIERE} */`,
  },
  plugins: [
    resolve(), typescript(), json(),
    css({ output: 'wallpanel.css' }),
    terser({ format: { comments: new RegExp(`^ ${BANNIERE} $`) } }),
  ],
};

// The Lottie player, a SECOND IIFE loaded on demand by `src/lottie.ts` (`<script>` on the first
// Lottie). Kept out of `wallpanel.js` on purpose: rollup would inline a dynamic `import()` into an
// IIFE, and the three tablets would download the player on every release. Its WASM is copied next
// to it by `scripts/copier-assets.mjs`.
const lottie = {
  input: 'src/lottie-bundle.ts',
  output: {
    dir: DIST,
    entryFileNames: 'dotlottie.js',
    format: 'iife', name: 'WallpanelLottie', sourcemap: false,
    banner: `/* ${BANNIERE_LOTTIE} */`,
  },
  plugins: [
    resolve(), typescript(),
    terser({ format: { comments: new RegExp(`^ ${BANNIERE_LOTTIE} $`) } }),
  ],
};

export default [app, lottie];
