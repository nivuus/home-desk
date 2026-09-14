/** JETABLE — supprimé à l'étape 8 de la mise en production (plan 3c, tâche 10), dans le même
 *  commit que les littéraux d'`ECRANS`, les trois épreuves de fidélité, les trois pages
 *  historiques et la branche de transition `data-piece`.
 *
 *  Cet outil lit `ECRANS` : privé de sa donnée, il ne compile plus. Il n'a aucune raison de
 *  survivre à la migration, et le garder laisserait un fichier mort qui a l'air vivant.
 *
 *  DEUX MOITIÉS, DEUX NATURES DE PREUVE :
 *
 *  - la DONNÉE (ici) est ÉVALUÉE, jamais relue : esbuild compile `src/ecran.ts` en mémoire et on
 *    importe `ECRANS`. Exact par construction. Reconstruire des valeurs depuis l'AST serait
 *    écrire un second interpréteur de TypeScript, et c'est là qu'un cas limite disparaît.
 *  - les COMMENTAIRES (`--registre`, tâche 3) passent par l'AST, parce qu'ils ne survivent pas à
 *    la compilation. Ils ne se comparent à rien : ils se DÉNOMBRENT.
 *
 *  Usage :
 *    node outils/exporter-ecrans.mjs --json ../ecrans-exportes.json
 *    node outils/exporter-ecrans.mjs --registre ../registre-commentaires.tsv
 */
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RACINE = path.resolve(import.meta.dirname, '..');
const VERSION_CONFIG = 1;   // `const.VERSION_CONFIG` côté Python, `schema._const` au contrat.

/** Compile `src/ecran.ts` dans un fichier temporaire et l'importe. On passe par le disque plutôt
 *  que par un `data:` URL pour que les imports relatifs du module résolvent normalement. */
export async function chargerEcrans() {
  const repertoire = await fs.mkdtemp(path.join(os.tmpdir(), 'export-ecrans-'));
  const sortie = path.join(repertoire, 'ecran.mjs');
  await build({
    entryPoints: [path.join(RACINE, 'src', 'ecran.ts')],
    outfile: sortie, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
  });
  try {
    const module = await import(pathToFileURL(sortie).href);
    return module.ECRANS;
  } finally {
    await fs.rm(repertoire, { recursive: true, force: true });
  }
}

/** Un écran du contrat tel que `home_desk.importer` l'attend : les champs du contrat, plus
 *  `version` (que `websocket._resoudre` vérifie EN PREMIER) et `titre` (`ConfigSubentry.title`,
 *  qu'`_async_exporter` place à côté des champs du contrat et qu'`_async_importer` re-extrait). */
function pourImport(ecran) {
  return { titre: ecran.nom, version: VERSION_CONFIG, ...ecran };
}

export function ecransPourImport(ECRANS) {
  return Object.values(ECRANS).map(pourImport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--json');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('usage : node outils/exporter-ecrans.mjs --json <chemin> | --registre <chemin>');
    process.exit(2);
  }
  const ecrans = ecransPourImport(await chargerEcrans());
  await fs.writeFile(process.argv[i + 1], JSON.stringify(ecrans, null, 2) + '\n', 'utf8');
  console.log(`${ecrans.length} écrans écrits dans ${process.argv[i + 1]}`);
}
