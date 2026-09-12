/** Publie sous `contrat/` ce que l'intégration Home Assistant doit connaître de l'application.
 *
 *  Pour l'instant : la liste des icônes. Elle est DÉRIVÉE de `src/rendu/icones.ts`, jamais
 *  recopiée — ce fichier a déjà reçu quatre icônes après coup (`scan`, `horsligne`, `case`,
 *  `coche`), chaque fois pour éviter qu'une tuile ne retombe sur `cloudy`, le repli par défaut
 *  de `icone()`. Une liste tenue à la main aurait raté les quatre.
 *
 *  Ce script tourne sous node AVANT toute compilation TypeScript, comme `generer-pages.mjs` :
 *  il lit donc le SOURCE, par expression régulière, et n'importe rien.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, '..', 'src', 'rendu', 'icones.ts');
const SORTIE = join(ICI, '..', '..', 'contrat');

const source = readFileSync(SOURCE, 'utf8');
const debut = source.indexOf('export const CHEMINS');
if (debut < 0) throw new Error('CHEMINS introuvable dans src/rendu/icones.ts');

// Une icone par ligne, sous la forme `  nom: svg`...`,` — les lignes de commentaire n'en ont pas.
const icones = [...source.slice(debut).matchAll(/^ {2}([a-z][a-z0-9]*): svg`/gm)]
  .map((m) => m[1])
  .sort();

if (icones.length === 0) throw new Error('aucune icone reconnue — le motif a-t-il change ?');

mkdirSync(SORTIE, { recursive: true });
writeFileSync(join(SORTIE, 'icones.json'),
  JSON.stringify({ version: 1, icones }, null, 2) + '\n');
console.log(`contrats : ${icones.length} icones -> ${SORTIE}/icones.json`);
