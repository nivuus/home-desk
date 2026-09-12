/** Publie sous `contrat/` ce que l'intégration Home Assistant doit connaître de l'application.
 *
 *  Deux choses : la liste des icônes (`icones.json`), et l'injection de cette même liste comme
 *  `enum` dans `ecran.schema.json` (`$defs.bouton.properties.icone`). Sans elle, le schéma
 *  acceptait n'importe quelle chaîne — `icone: "frigo"` passait la validation, et l'application
 *  retombait alors EN SILENCE sur `cloudy`, son repli par défaut. La liste elle-même est DÉRIVÉE
 *  de `src/rendu/icones.ts`, jamais recopiée — ce fichier a déjà reçu quatre icônes après coup
 *  (`scan`, `horsligne`, `case`, `coche`), chaque fois pour éviter ce même repli. Une liste tenue
 *  à la main aurait raté les quatre, et l'`enum` du schéma les aurait ratées à son tour.
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
const SCHEMA = join(SORTIE, 'ecran.schema.json');

const source = readFileSync(SOURCE, 'utf8');
const debut = source.indexOf('export const CHEMINS');
if (debut < 0) throw new Error('CHEMINS introuvable dans src/rendu/icones.ts');

// Une icone par ligne, sous la forme `  nom: svg`...`,` — les lignes de commentaire n'en ont pas.
const icones = [...source.slice(debut).matchAll(/^ {2}([a-z][a-z0-9]*): svg`/gm)]
  .map((m) => m[1])
  .sort();

if (icones.length === 0) throw new Error('aucune icone reconnue — le motif a-t-il change ?');

mkdirSync(SORTIE, { recursive: true });
writeFileSync(join(SORTIE, 'icones.json'), JSON.stringify({
  version: 1,
  _source: 'Derivee de src/rendu/icones.ts (export CHEMINS) par ce script, jamais recopiee a la '
    + 'main : quatre icones (scan, horsligne, case, coche) ont deja ete ajoutees a l\'application '
    + 'sans que cette liste bouge, chacune retombant en silence sur le repli "cloudy" de icone() '
    + 'jusqu\'a ce qu\'on s\'en apercoive. La derivation rend cet oubli impossible.',
  icones,
}, null, 2) + '\n');
console.log(`contrats : ${icones.length} icones -> ${SORTIE}/icones.json`);

// `ecran.schema.json` est par ailleurs ECRIT A LA MAIN — seul ce champ est genere. On ne le
// reanalyse donc jamais en JSON.parse + JSON.stringify (qui reformaterait tout le fichier, y
// compris les tableaux alignes a la main comme `required`) : on repere le bloc
// `"icone": { ... }` par texte et on ne remplace QUE lui, en conservant l'indentation locale.
const schemaTexte = readFileSync(SCHEMA, 'utf8');

// Garde-fou : si le chemin $defs.bouton.properties.icone n'existe plus dans le JSON structure,
// c'est que le schema a ete restructure — mieux vaut echouer bruyamment que d'injecter un enum
// dans le vide (ou, pire, au mauvais endroit par un remplacement textuel aveugle).
const schemaJson = JSON.parse(schemaTexte);
if (schemaJson?.$defs?.bouton?.properties?.icone === undefined) {
  throw new Error(
    '$defs.bouton.properties.icone introuvable dans contrat/ecran.schema.json — '
    + 'le schema a-t-il ete restructure ? L\'injection de l\'enum d\'icones viserait le vide.');
}

// Le motif tolere aussi bien la forme d'origine, sur une ligne (`{ "type": "string", ... }`),
// que la forme regeneree par ce script (multi-lignes, avec l'`enum`) — idempotent d'un run a
// l'autre. `[^{}]` traverse les sauts de ligne (ce n'est PAS un `.`) sans jamais franchir une
// accolade : il n'y a pas d'objet imbrique sous `icone`, seulement des tableaux (`[...]`).
const motifIcone = /"icone":\s*\{[^{}]*\}/g;
const correspondances = [...schemaTexte.matchAll(motifIcone)];
if (correspondances.length !== 1) {
  throw new Error(
    `attendu exactement une occurrence de "icone": { ... } dans ecran.schema.json, `
    + `trouve ${correspondances.length} — le schema a-t-il ete restructure ?`);
}

const IND_PROP = ' '.repeat(10); // "type"/"minLength"/"enum" — un cran sous "icone": {
const IND_ITEM = ' '.repeat(12); // chaque nom d'icone dans l'enum
const IND_FERMETURE = ' '.repeat(8); // la ligne de fermeture, alignee sur "icone":

const blocIcone = '"icone": {\n'
  + `${IND_PROP}"type": "string",\n`
  + `${IND_PROP}"minLength": 1,\n`
  + `${IND_PROP}"enum": [\n`
  + icones.map((n) => `${IND_ITEM}"${n}"`).join(',\n') + '\n'
  + `${IND_PROP}]\n`
  + `${IND_FERMETURE}}`;

const schemaMaj = schemaTexte.replace(motifIcone, blocIcone);
writeFileSync(SCHEMA, schemaMaj);
console.log(`contrats : enum de ${icones.length} icones injecte dans ${SCHEMA}`);
