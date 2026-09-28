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
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const RACINE = path.resolve(import.meta.dirname, '..');
const CHEMIN_VERDICTS = path.join(RACINE, 'outils', 'verdicts-commentaires.tsv');
const CHEMIN_SCHEMA = path.resolve(RACINE, '..', 'contrat', 'ecran.schema.json');
// Recopie manuelle de `VERSION_CONFIG` dans `custom_components/home_desk/const.py:32`. Outil
// jetable : pas de lecture croisée pour une seule constante, mais le nom du fichier et de la
// constante ici rendent la dérive trouvable par `grep VERSION_CONFIG`.
const VERSION_CONFIG = 2;

/** Compile `src/ecran.ts` dans un fichier temporaire et l'importe. On passe par le disque plutôt
 *  que par un `data:` URL pour que les imports relatifs du module résolvent normalement. */
export async function chargerEcrans() {
  const repertoire = await fs.mkdtemp(path.join(os.tmpdir(), 'export-ecrans-'));
  const sortie = path.join(repertoire, 'ecran.mjs');
  try {
    await build({
      entryPoints: [path.join(RACINE, 'src', 'ecran.ts')],
      outfile: sortie, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
    });
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
  return { ...ecran, titre: ecran.nom, version: VERSION_CONFIG };
}

export function ecransPourImport(ECRANS) {
  return Object.values(ECRANS).map(pourImport);
}

// ---------------------------------------------------------------------------------------------
// La moitié COMMENTAIRES (tâche 3) : le registre des plages, un verdict par plage.
// ---------------------------------------------------------------------------------------------

/** Le séparateur de jointure des notes multilignes. `yaml_ecrans.rendre` APLATIT une note
 *  multiligne (limitation mesurée et documentée au plan 3a) : sans séparateur explicite, deux
 *  phrases se colleraient en une seule, illisible, et personne ne le verrait. La moitié qui
 *  SURVIT au retrait de cet outil — que la chaîne jointe traverse `rendre`/`lire` intacte — est
 *  gardée par `tests/composant/test_yaml_ecrans.py`, dans la suite du module concerné. */
export const SEPARATEUR_NOTE = ' — ';

/** Les trois verdicts, et trois seulement. `orpheline` exige une raison ; les deux autres non. */
export const VERDICTS = ['attachee', 'type', 'orpheline'];
const RAISON_MINIMALE = 10;

/** Les lignes de texte d'une plage, débarrassées de leur syntaxe. Les lignes vides tombent : une
 *  ligne `//` nue sépare deux paragraphes, elle ne porte rien à transporter. */
export function lignesDeNote(texte) {
  return texte
    .replace(/^\/\*\*?/, '').replace(/\*\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*(\/\/|\*)?\s?/, '').trimEnd())
    .filter((l) => l !== '');
}

/** Le texte d'une plage, débarrassé de sa syntaxe, prêt à devenir une `note`. */
export function enNote(texte) {
  return lignesDeNote(texte).join(SEPARATEUR_NOTE);
}

/** Les plages de commentaire du source, dans l'ordre. Le scanner de TypeScript rend UNE plage par
 *  ligne `//` : un bloc de neuf lignes `//` compte pour neuf plages, chacune à classer. Seuls les
 *  commentaires de bloc (ceux qu'ouvre une barre-étoile) comptent pour une plage multiligne. */
export function plagesDeCommentaire(source) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  const plages = [];
  let k;
  while ((k = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (k !== ts.SyntaxKind.SingleLineCommentTrivia
        && k !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const texte = scanner.getTokenText();
    const debut = source.slice(0, scanner.getTokenStart()).split('\n').length;
    const lignes = texte.split('\n');
    plages.push({
      debut,
      fin: debut + lignes.length - 1,
      texte,
      note: enNote(texte),
      // Dénombré ICI, à la jointure, jamais re-dérivé en recoupant la note sur `SEPARATEUR_NOTE` :
      // le tiret cadratin entouré d'espaces apparaît 46 fois dans le texte même des commentaires
      // d'`ecran.ts`, et un recoupage compterait ces tirets-là. Une mesure fausse dans la colonne
      // qui EXISTE pour mesurer serait pire que pas de colonne du tout.
      lignesNote: lignesDeNote(texte).length,
    });
  }
  return plages;
}

/** Les trois premiers mots d'une plage, pour la nommer dans un message d'erreur sans recopier
 *  la configuration de cette maison dans une sortie de terminal. */
export function troisPremiersMots(plage) {
  return plage.note.split(/\s+/).filter((m) => m !== '').slice(0, 3).join(' ');
}

/** Lit `verdicts-commentaires.tsv` : `ligne_debut<TAB>verdict[:raison]`, `#` en commentaire.
 *  Découpe sur le PREMIER deux-points seulement — une raison écrite en français en contient, et
 *  une raison tronquée en silence est exactement la perte que cette tâche existe pour empêcher. */
export function lireVerdicts(texte) {
  const verdicts = new Map();
  texte.split('\n').forEach((ligne, i) => {
    if (ligne.trim() === '' || ligne.startsWith('#')) return;
    const [cle, valeur] = ligne.split('\t');
    const debut = Number(cle);
    if (!Number.isInteger(debut) || valeur === undefined) {
      throw new Error(`verdicts-commentaires.tsv:${i + 1} : ligne illisible — ${ligne}`);
    }
    if (verdicts.has(debut)) {
      throw new Error(`verdicts-commentaires.tsv:${i + 1} : la ligne ${debut} a deux verdicts`);
    }
    const coupe = valeur.indexOf(':');
    verdicts.set(debut, coupe === -1
      ? { nom: valeur.trim(), reste: '' }
      : { nom: valeur.slice(0, coupe).trim(), reste: valeur.slice(coupe + 1).trim() });
  });
  return verdicts;
}

/** Lit `verdicts-commentaires.tsv` en `Map<ligne, verdict_brut>` — le verdict ENTIER
 *  (`attachee:cuisine.commandes[1].note`, `type`, `orpheline:<raison>`), pas décomposé : c'est
 *  ce que consomme `attacherNotes` (tâche 12), qui n'a besoin que de savoir si ça commence par
 *  `attachee` et, si oui, du chemin qui suit le premier deux-points — recomposer ce chemin ici
 *  évite de faire connaître à `attacherNotes` la syntaxe du fichier, que `lireVerdicts` connaît
 *  déjà. Synchrone : `migration-notes.test.ts` l'appelle sans `await`, comme `ECRANS` lui-même
 *  (import direct) — seul `chargerEcrans` a besoin d'async, pour compiler via esbuild. */
export function chargerVerdicts() {
  const verdicts = new Map();
  for (const [ligne, { nom, reste }] of lireVerdicts(readFileSync(CHEMIN_VERDICTS, 'utf8'))) {
    verdicts.set(ligne, reste === '' ? nom : `${nom}:${reste}`);
  }
  return verdicts;
}

/** Le registre, et tout ce qui l'empêche d'être complet. Une plage sans verdict, un verdict
 *  inconnu, une `orpheline` sans raison et un verdict qui vise une ligne n'ouvrant aucune plage
 *  sont QUATRE façons de perdre un raisonnement en silence : les quatre font échouer l'outil. */
export function registre(plages, verdicts) {
  const lignes = [];
  const fautes = [];
  const comptes = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  const vues = new Set();
  for (const p of plages) {
    const verdict = verdicts.get(p.debut);
    if (verdict === undefined) {
      fautes.push(`ligne ${p.debut} : aucun verdict — « ${troisPremiersMots(p)} … »`);
      continue;
    }
    vues.add(p.debut);
    const { nom, reste } = verdict;
    if (!VERDICTS.includes(nom)) {
      fautes.push(`ligne ${p.debut} : verdict inconnu « ${nom} » (attendu ${VERDICTS.join(', ')})`);
      continue;
    }
    if (nom === 'orpheline' && reste.length < RAISON_MINIMALE) {
      fautes.push(`ligne ${p.debut} : « orpheline » sans raison (${RAISON_MINIMALE} caractères `
        + `au moins) — « ${troisPremiersMots(p)} … »`);
      continue;
    }
    comptes[nom] += 1;
    lignes.push([p.debut, p.fin, nom, reste, p.lignesNote].join('\t'));
  }
  for (const debut of verdicts.keys()) {
    if (!vues.has(debut)) {
      fautes.push(`ligne ${debut} : verdict périmé, aucune plage de commentaire ne commence là`);
    }
  }
  return { lignes, fautes, comptes };
}

/** `178 plages = 143 attachees + 27 type + 8 orphelines` — la somme doit tomber juste. */
export function ligneDeControle(total, comptes) {
  return `${total} plages = ${comptes.attachee} attachees + ${comptes.type} type `
    + `+ ${comptes.orpheline} orphelines`;
}

// ---------------------------------------------------------------------------------------------
// L'ATTACHEMENT (tâche 12) : joindre chaque plage `attachee` à l'objet que son chemin désigne.
//
// Les verdicts `attachee` du registre (tâche 3) portent DÉJÀ leur chemin cible, vérifié contre
// `contrat/ecran.schema.json` et l'ordre réel des tableaux d'`ECRANS` — construire ici un second
// index (position AST → chemin) referait la même mesure par un autre chemin, et deux sources qui
// peuvent diverger valent moins qu'une. Ce que ce module ajoute, c'est la NAVIGATION du chemin
// jusqu'à l'objet réel (dans la donnée ÉVALUÉE, comme le reste de l'outil) et la garde que le
// contrat admet une `note` à cet endroit — dérivée du schéma, jamais recopiée dans une table.
// ---------------------------------------------------------------------------------------------

/** Découpe un chemin (`cuisine.commandes[1].note`) en jetons : les clés restent des chaînes, les
 *  indices de tableau deviennent des nombres. Le premier jeton est toujours le nom de la pièce. */
function segmenterChemin(chemin) {
  return [...chemin.matchAll(/[^.[\]]+/g)].map(([jeton]) => (/^\d+$/.test(jeton) ? Number(jeton) : jeton));
}

/** Résout un `$ref` du contrat vers son `$defs` — les schémas de ce contrat ne référencent que
 *  leurs propres `$defs` (`#/$defs/<nom>`), donc pas besoin d'un résolveur JSON Schema complet. */
function resoudreRef(schema, sousSchema) {
  return sousSchema?.$ref ? schema.$defs[sousSchema.$ref.replace('#/$defs/', '')] : sousSchema;
}

/** Suit les jetons d'un chemin dans le CONTRAT plutôt que dans la donnée : à chaque clé, entre
 *  dans `properties` ; à chaque indice, entre dans `items`. Si le dernier jeton (`note`) résout à
 *  un sous-schéma défini, le contrat admet une note ici — c'est la table mesurée à l'étape 1,
 *  DÉRIVÉE : une neuvième place au contrat serait trouvée ici, pas manquée par une table figée. */
export function accepteNote(schema, jetons) {
  let sousSchema = schema;
  // Le premier jeton nomme la pièce (`cuisine`) : une pièce EST un écran, donc le schéma racine
  // s'applique déjà et on continue directement avec le deuxième jeton.
  for (const jeton of jetons.slice(1)) {
    sousSchema = resoudreRef(schema, sousSchema);
    if (sousSchema === undefined) return false;
    sousSchema = typeof jeton === 'number' ? sousSchema.items : sousSchema.properties?.[jeton];
  }
  return sousSchema !== undefined;
}

/** L'objet réel que désignent tous les jetons d'un chemin sauf le dernier (`note` nomme le champ
 *  à écrire, pas un pas de navigation) — dans `ecrans`, la donnée ÉVALUÉE, jamais reconstruite. */
function objetVise(ecrans, jetons) {
  return jetons.slice(0, -1).reduce((objet, jeton) => objet?.[jeton], ecrans);
}

/** Attache chaque plage `attachee` à l'objet que son chemin désigne, en respectant les trois
 *  règles de l'étape 5 : un chemin qui ne mène nulle part, ou vers un endroit que le contrat
 *  refuse, fait ÉCHOUER l'outil en nommant la ligne plutôt que de deviner — c'est un défaut du
 *  verdict, à corriger dans `verdicts-commentaires.tsv`, jamais ici. Un objet qui porte déjà une
 *  `note` (les trois qu'`ECRANS` porte depuis le début) la garde en tête : les notes suivantes se
 *  JOIGNENT avec `SEPARATEUR_NOTE`, jamais ne l'écrasent. */
export function attacherNotes(ECRANS, plages, verdicts) {
  const schema = JSON.parse(readFileSync(CHEMIN_SCHEMA, 'utf8'));
  const ecrans = structuredClone(ECRANS);
  const attachements = [];
  for (const plage of plages) {
    const verdict = verdicts.get(plage.debut);
    if (verdict === undefined || !verdict.startsWith('attachee')) continue;
    const deuxPoints = verdict.indexOf(':');
    if (deuxPoints === -1) {
      throw new Error(`ligne ${plage.debut} : verdict "attachee" sans chemin — corrige le `
        + `verdict dans verdicts-commentaires.tsv (jamais l'outil), en lui donnant un chemin `
        + `cible ("attachee:<chemin>").`);
    }
    const chemin = verdict.slice(deuxPoints + 1);
    const jetons = segmenterChemin(chemin);
    if (jetons.at(-1) !== 'note') {
      throw new Error(`ligne ${plage.debut} : chemin "${chemin}" ne finit pas par ".note" — `
        + `corrige le verdict dans verdicts-commentaires.tsv, jamais l'outil.`);
    }
    if (!accepteNote(schema, jetons)) {
      throw new Error(`ligne ${plage.debut} : le contrat n'admet pas de "note" en "${chemin}" — `
        + `corrige le verdict dans verdicts-commentaires.tsv, jamais l'outil.`);
    }
    const objet = objetVise(ecrans, jetons);
    if (objet === undefined || typeof objet !== 'object') {
      throw new Error(`ligne ${plage.debut} : "${chemin}" ne désigne aucun objet dans ECRANS — `
        + `corrige le verdict dans verdicts-commentaires.tsv, jamais l'outil.`);
    }
    objet.note = objet.note === undefined
      ? plage.note : `${objet.note}${SEPARATEUR_NOTE}${plage.note}`;
    attachements.push({ ligne: plage.debut, chemin, lignesDeNote: plage.lignesNote });
  }
  return { ecrans, attachements };
}

/** LE CHEMIN RÉEL D'EXPORT, dans une seule fonction — attache les notes du registre à l'objet
 *  réel, PUIS met en forme pour l'import HA. `ecransPourImport(ECRANS)` seul, sans `attacherNotes`
 *  devant, ne reproduit PAS ce que l'export réel produit : il ne porte que les trois notes
 *  d'`agencement.note` déjà écrites dans `ecran.ts`, jamais les 143 que le registre attache
 *  (ronde de correction 1, tâche 4 — le brief avait fait cette confusion, corrigée ici). Extraite
 *  pour que le CLI (plus bas, `--json`) et les épreuves de fidélité (`app/tests/migration-*.test.ts`)
 *  partagent une SEULE composition : deux recopies de ce même chemin auraient fini par diverger.
 *  Synchrone : lit `ecran.ts` et `verdicts-commentaires.tsv` par leur chemin fixe, exactement
 *  comme `chargerVerdicts` le fait déjà — seul `chargerEcrans` (compilation esbuild de la DONNÉE)
 *  reste async, et reste hors de cette fonction : elle prend `ECRANS` déjà chargé en paramètre,
 *  que ce soit via `chargerEcrans()` (le CLI) ou un import TypeScript direct (les tests, qui
 *  tiennent la DONNÉE pour exacte par construction — cf. `migration-donnee.test.ts`). */
export function exporterTout(ECRANS) {
  const source = readFileSync(path.join(RACINE, 'src', 'ecran.ts'), 'utf8');
  const { ecrans } = attacherNotes(ECRANS, plagesDeCommentaire(source), chargerVerdicts());
  return ecransPourImport(ecrans);
}

const EN_TETE = ['ligne_debut', 'ligne_fin', 'verdict', 'chemin_ou_raison', 'lignes_de_la_note'];

async function ecrireRegistre(destination) {
  const source = await fs.readFile(path.join(RACINE, 'src', 'ecran.ts'), 'utf8');
  const plages = plagesDeCommentaire(source);
  const verdicts = lireVerdicts(
    await fs.readFile(path.join(RACINE, 'outils', 'verdicts-commentaires.tsv'), 'utf8'));
  const { lignes, fautes, comptes } = registre(plages, verdicts);

  console.log(ligneDeControle(plages.length, comptes));
  if (fautes.length > 0) {
    console.error(`\n${fautes.length} plage(s) non classée(s) — le registre n'est pas écrit :`);
    for (const faute of fautes) console.error(`  ${faute}`);
    return 1;
  }
  await fs.writeFile(destination, [EN_TETE.join('\t'), ...lignes].join('\n') + '\n', 'utf8');
  console.log(`${lignes.length} plages écrites dans ${destination}`);
  return 0;
}

const USAGE = 'usage : node outils/exporter-ecrans.mjs --json <chemin> | --registre <chemin>';

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  const destination = process.argv[3];
  if (!['--json', '--registre'].includes(mode) || !destination) {
    console.error(USAGE);
    process.exit(2);
  }
  if (mode === '--registre') {
    process.exit(await ecrireRegistre(destination));
  }
  const ecrans = exporterTout(await chargerEcrans());
  await fs.writeFile(destination, JSON.stringify(ecrans, null, 2) + '\n', 'utf8');
  console.log(`${ecrans.length} écrans écrits dans ${destination}`);
}
