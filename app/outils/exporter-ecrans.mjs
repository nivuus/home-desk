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
import ts from 'typescript';

const RACINE = path.resolve(import.meta.dirname, '..');
// Recopie manuelle de `VERSION_CONFIG` dans `custom_components/home_desk/const.py:30`. Outil
// jetable : pas de lecture croisée pour une seule constante, mais le nom du fichier et de la
// constante ici rendent la dérive trouvable par `grep VERSION_CONFIG`.
const VERSION_CONFIG = 1;

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
  const ecrans = ecransPourImport(await chargerEcrans());
  await fs.writeFile(destination, JSON.stringify(ecrans, null, 2) + '\n', 'utf8');
  console.log(`${ecrans.length} écrans écrits dans ${destination}`);
}
