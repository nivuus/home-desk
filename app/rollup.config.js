import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import css from 'rollup-plugin-import-css';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RACINE, 'dist');

export default {
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
  },
  plugins: [
    resolve(), typescript(), json(),
    css({ output: 'wallpanel.css' }),
    terser({ format: { comments: false } }),
  ],
};
