/** JETABLE — part à la tâche 10, avec l'outil et les littéraux.
 *
 *  Le registre de la tâche 3 dit où chaque commentaire doit aller. Ce test vérifie qu'il Y VA.
 *  Sans lui, la régression n°3 du README (« le raisonnement quitte le dépôt ») serait fausse :
 *  le raisonnement ne partirait pas, il serait supprimé — et personne ne le remarquerait. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ECRANS } from '../src/ecran';
import { accepteNote, attacherNotes, chargerVerdicts, plagesDeCommentaire } from '../outils/exporter-ecrans.mjs';

const source = readFileSync(new URL('../src/ecran.ts', import.meta.url), 'utf8');
const verdicts = chargerVerdicts();
const { ecrans, attachements } = attacherNotes(ECRANS, plagesDeCommentaire(source), verdicts);

/** Toutes les valeurs de clé `note`, à toute profondeur. */
function notesDe(n: unknown): string[] {
  if (Array.isArray(n)) return n.flatMap(notesDe);
  if (n && typeof n === 'object') {
    const o = n as Record<string, unknown>;
    return Object.entries(o).flatMap(([k, v]) => (k === 'note' ? [String(v)] : notesDe(v)));
  }
  return [];
}

/** Résout un chemin (`cuisine.commandes[1].note`) jusqu'à l'OBJET qui porte le champ `note` visé
 *  — tous les segments sauf le dernier. Délibérément réécrit ici plutôt qu'importé de l'outil :
 *  un test qui partage l'algorithme qu'il vérifie ne peut pas voir une régression de cet
 *  algorithme. */
function objetAuChemin(ecrans: unknown, chemin: string): Record<string, unknown> | undefined {
  const segments = [...chemin.matchAll(/[^.[\]]+/g)]
    .map(([jeton]) => (/^\d+$/.test(jeton) ? Number(jeton) : jeton));
  // `any` : navigation générique dans une donnée arbitrairement imbriquée, propre à ce test.
  let objet: any = ecrans;
  for (const segment of segments.slice(0, -1)) objet = objet?.[segment];
  return objet;
}

describe('les notes arrivent où le registre le dit', () => {
  it('attache EXACTEMENT une fois chaque verdict « attachee »', () => {
    const attendus = [...verdicts.values()].filter((v) => v.startsWith('attachee')).length;
    expect(attachements).toHaveLength(attendus);
    expect(new Set(attachements.map((a) => a.ligne)).size).toBe(attendus);
  });

  it('n’attache jamais une note à un endroit que le contrat refuse', () => {
    // `source.allumee` est le seul objet du contrat SANS `note` — mesuré le 2026-09-14.
    for (const { chemin } of attachements) expect(chemin).not.toMatch(/\.allumee$/);
  });

  it('ne DÉTRUIT aucune des trois notes que la donnée portait déjà', () => {
    const avant = notesDe(ECRANS);
    expect(avant).toHaveLength(3);
    const apres = notesDe(ecrans).join('\n');
    for (const note of avant) expect(apres).toContain(note);
  });

  it('porte le nombre de lignes de chaque note', () => {
    // Mesuré le 2026-09-14 : les 21 commentaires de BLOC (multi-lignes physiques,
    // `p.debut !== p.fin`) d'`ecran.ts` sont TOUS classés `type` (décision 1 de la spec), aucun
    // n'est `attachee` -- donc AUCUNE plage attachée n'a `lignesDeNote > 1` prise seule.
    // L'assertion d'origine du brief (« il y en a des multilignes ») ne peut donc pas porter sur
    // `lignesDeNote` : elle est vérifiée sous sa forme réelle par le test suivant.
    expect(attachements.every((a) => a.lignesDeNote >= 1)).toBe(true);
  });

  it('joint le texte de CHAQUE plage sur un chemin qui en reçoit plusieurs', () => {
    // Correction ronde 1 : compter les occurrences de `SEPARATEUR_NOTE` dans les notes finales
    // est un piège -- mesuré, 23 des 143 plages contiennent déjà " — " dans leur texte brut
    // (ponctuation d'auteur, pas jointure), donc cette forme peut être satisfaite par accident
    // même si la jointure est cassée. La propriété qui compte n'est pas « il y a un tiret
    // quelque part » mais « aucun raisonnement n'est perdu » : pour chaque chemin visé par
    // PLUSIEURS plages, la note finale doit contenir le texte de CHACUNE d'elles.
    const plages = plagesDeCommentaire(source);
    const texteParLigne = new Map(plages.map((p) => [p.debut, p.note]));
    const textesParChemin = new Map<string, string[]>();
    for (const { ligne, chemin } of attachements) {
      const texte = texteParLigne.get(ligne);
      if (texte === undefined) throw new Error(`ligne ${ligne} : aucune plage à cette position`);
      textesParChemin.set(chemin, [...(textesParChemin.get(chemin) ?? []), texte]);
    }
    const cheminsMultiPlages = [...textesParChemin.entries()].filter(([, textes]) => textes.length > 1);
    // Sans ceci, un `attacherNotes` qui ne joindrait plus jamais rien passerait cette assertion
    // vide : aucun chemin multi-plages ne serait trouvé, et la boucle plus bas ne vérifierait rien.
    expect(cheminsMultiPlages.length).toBeGreaterThan(0);
    for (const [chemin, textes] of cheminsMultiPlages) {
      const noteFinale = String(objetAuChemin(ecrans, chemin)?.note ?? '');
      for (const texte of textes) {
        expect(noteFinale, `chemin "${chemin}" : la note finale ne contient pas le texte d'une `
          + `plage qui le vise -- du raisonnement a été perdu à la jointure`).toContain(texte);
      }
    }
  });
});

// -------------------------------------------------------------------------------------------
// RONDE DE CORRECTION 2 : la tâche 4 avait délibérément écarté un second calcul indépendant du
// chemin de chaque note attachée -- les chemins du TSV existaient déjà, et une seconde source qui
// PEUT diverger d'une ENTRÉE vaut moins qu'une. Mais en VÉRIFICATION, un second calcul indépendant
// est exactement ce que ce dépôt fait déjà pour les plages elles-mêmes (les deux scanners de
// `test_registre_commentaires.py`/`plagesDeCommentaire`, tombés d'accord sur les mêmes 178
// lignes) : le désaccord est l'information. Ce qui suit reconstruit, depuis l'AST de `ecran.ts`
// -- jamais depuis une VALEUR, seulement des positions --, le chemin que chaque verdict `attachee`
// AURAIT dû porter, et le compare au chemin écrit à la main dans `verdicts-commentaires.tsv`.
// C'est le dernier moment où ce contrôle est possible : après le retrait des littéraux, les
// commentaires source n'existeront plus que dans `git log`.
// -------------------------------------------------------------------------------------------

/** Descend `ECRANS` par l'AST : à chaque `PropertyAssignment`, empile le nom de la clé ; à chaque
 *  élément d'un `ArrayLiteralExpression`, empile son indice ; enregistre le CHEMIN de chaque
 *  littéral d'objet rencontré, indexé par le NŒUD lui-même. Aucune valeur n'en est jamais tirée --
 *  seulement des positions et des chemins, exactement la frontière que le reste de l'outil respecte. */
function tableDesChemins(sourceFile: ts.SourceFile): Map<ts.ObjectLiteralExpression, (string | number)[]> {
  let ecransInit: ts.Expression | undefined;
  ts.forEachChild(sourceFile, (n) => {
    if (!ts.isVariableStatement(n)) return;
    for (const decl of n.declarationList.declarations) {
      if (decl.name.getText(sourceFile) === 'ECRANS' && decl.initializer) ecransInit = decl.initializer;
    }
  });
  if (!ecransInit || !ts.isObjectLiteralExpression(ecransInit)) {
    throw new Error('déclaration ECRANS introuvable dans ecran.ts -- vérifie que le fichier existe encore');
  }
  const table = new Map<ts.ObjectLiteralExpression, (string | number)[]>();
  const visiter = (node: ts.Node, chemin: (string | number)[]): void => {
    if (ts.isObjectLiteralExpression(node)) {
      table.set(node, chemin);
      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop)) visiter(prop.initializer, [...chemin, prop.name.getText(sourceFile)]);
      }
    } else if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((el, i) => visiter(el, [...chemin, i]));
    }
  };
  for (const prop of ecransInit.properties) {
    if (ts.isPropertyAssignment(prop)) visiter(prop.initializer, [prop.name.getText(sourceFile)]);
  }
  return table;
}

/** Pour chaque ligne de DÉBUT d'une plage de commentaire, la position (offset de caractère) du
 *  premier token RÉEL qui suit -- au-delà de toute trivia ET de tout autre commentaire, pour
 *  qu'un bloc de plusieurs lignes `//` consécutives résolve TOUTES vers le même token suivant,
 *  comme `plagesDeCommentaire` (même fichier) le fait déjà pour délimiter les plages elles-mêmes. */
function positionsSuivantes(texte: string): Map<number, number> {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, texte);
  const suivante = new Map<number, number>();
  let enAttente: number[] = [];
  let k: ts.SyntaxKind;
  while ((k = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (k === ts.SyntaxKind.SingleLineCommentTrivia || k === ts.SyntaxKind.MultiLineCommentTrivia) {
      enAttente.push(texte.slice(0, scanner.getTokenStart()).split('\n').length);
      continue;
    }
    if (k === ts.SyntaxKind.WhitespaceTrivia || k === ts.SyntaxKind.NewLineTrivia) continue;
    if (enAttente.length > 0) {
      const pos = scanner.getTokenStart();
      for (const debut of enAttente) suivante.set(debut, pos);
      enAttente = [];
    }
  }
  return suivante;
}

/** Le nœud le plus profond dont l'intervalle [début, fin) contient `pos`. */
function noeudLePlusProfondA(sourceFile: ts.SourceFile, pos: number): ts.Node {
  let trouve: ts.Node = sourceFile;
  const descendre = (node: ts.Node): void => {
    for (const enfant of node.getChildren(sourceFile)) {
      if (enfant.getStart(sourceFile) <= pos && pos < enfant.getEnd()) {
        trouve = enfant;
        descendre(enfant);
        return;
      }
    }
  };
  descendre(sourceFile);
  return trouve;
}

/** Le jeton `[N]`/`.cle`, mis bout à bout dans le même format que `verdicts-commentaires.tsv`. */
function formaterChemin(jetons: (string | number)[]): string {
  return jetons.reduce((s: string, j) => (
    typeof j === 'number' ? `${s}[${j}]` : s === '' ? String(j) : `${s}.${j}`
  ), '');
}

/** Le chemin ATTENDU d'une plage : l'objet qui la suit immédiatement, avec la même règle de
 *  remontée qu'`attacherNotes` -- si le plus proche n'accepte pas de `note`, on remonte au premier
 *  englobant qui l'accepte (`accepteNote`, importé de l'outil : même règle, jamais réécrite ici).
 *  « Le plus proche » privilégie la VALEUR d'une propriété directement suivante quand elle est
 *  elle-même un littéral d'objet (`aspirateurMaison: {...}`) avant de remonter à la pièce -- mais
 *  ne descend JAMAIS dans un tableau (`commandes: [...]`, `sources: [...]`) : rien dans l'AST ne
 *  dit si un tel commentaire vise le tableau entier ou son premier élément, et c'est exactement le
 *  genre de choix qu'un humain tranche et qu'une règle mécanique ne peut qu'approcher. */
function cheminAttendu(
  sourceFile: ts.SourceFile, table: Map<ts.ObjectLiteralExpression, (string | number)[]>,
  schema: unknown, pos: number,
): (string | number)[] | undefined {
  let n: ts.Node | undefined = noeudLePlusProfondA(sourceFile, pos);
  while (n) {
    if (ts.isPropertyAssignment(n) && ts.isObjectLiteralExpression(n.initializer)) {
      const cheminValeur = table.get(n.initializer);
      if (cheminValeur && accepteNote(schema, [...cheminValeur, 'note'])) return cheminValeur;
    }
    if (ts.isObjectLiteralExpression(n)) {
      const chemin = table.get(n);
      if (chemin && accepteNote(schema, [...chemin, 'note'])) return chemin;
    }
    n = n.parent;
  }
  return undefined;
}

describe('le chemin dérivé de l’AST retrouve le chemin écrit', () => {
  const sourceFile = ts.createSourceFile('ecran.ts', source, ts.ScriptTarget.Latest, true);
  const table = tableDesChemins(sourceFile);
  const suivantes = positionsSuivantes(source);
  const schema = JSON.parse(readFileSync(new URL('../../contrat/ecran.schema.json', import.meta.url), 'utf8'));

  const derive = (ligne: number): string | undefined => {
    const pos = suivantes.get(ligne);
    const chemin = pos === undefined ? undefined : cheminAttendu(sourceFile, table, schema, pos);
    return chemin && formaterChemin([...chemin, 'note']);
  };

  // Rapportées au coordinateur (ronde de correction 2), PAS corrigées ici -- ni le TSV, ni la
  // dérivation : deux plages (9 lignes) où le commentaire vise le PREMIER ÉLÉMENT d'un tableau
  // (`salon.sources[0]`, `cuisine.extrasMaison[0]`) plutôt que la pièce englobante. La docstring
  // de `cheminAttendu` explique pourquoi une règle mécanique qui ne descend jamais dans un
  // tableau ne peut PAS deviner ce choix -- c'est exactement le cas que le coordinateur a nommé :
  // un classement humain peut être plus juste que la règle mécanique.
  const EXCEPTIONS_CONNUES = [230, 231, 505, 506, 507, 508, 509, 510, 511];

  it('coïncide plage par plage avec verdicts-commentaires.tsv, sauf les exceptions documentées', () => {
    const ecarts: string[] = [];
    for (const [ligne, verdict] of verdicts) {
      if (!verdict.startsWith('attachee:') || EXCEPTIONS_CONNUES.includes(ligne)) continue;
      const ecrit = verdict.slice('attachee:'.length);
      const deriveFmt = derive(ligne);
      if (deriveFmt !== ecrit) {
        ecarts.push(`ligne ${ligne} : écrit "${ecrit}", dérivé "${deriveFmt ?? '<aucun objet englobant n’accepte de note>'}"`);
      }
    }
    expect(ecarts, ecarts.join('\n')).toEqual([]);
  });

  // Garde-fou contre une liste d'exceptions qui s'effrite en silence : si le TSV ou la dérivation
  // change un jour au point qu'une de ces neuf lignes cesse RÉELLEMENT de diverger, ce test le dit
  // -- l'exception devient alors trompeuse (elle cacherait un accord retrouvé au lieu d'un écart
  // encore réel) plutôt que d'être retirée en silence.
  it('les exceptions documentées divergent TOUJOURS réellement -- neuf lignes, pas une de plus ni de moins', () => {
    const reellementDivergentes = EXCEPTIONS_CONNUES.filter((ligne) => {
      const verdict = verdicts.get(ligne);
      if (!verdict?.startsWith('attachee:')) return false;
      return derive(ligne) !== verdict.slice('attachee:'.length);
    });
    expect(reellementDivergentes).toEqual(EXCEPTIONS_CONNUES);
  });
});
