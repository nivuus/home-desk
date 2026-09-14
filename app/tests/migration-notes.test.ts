/** JETABLE — part à la tâche 10, avec l'outil et les littéraux.
 *
 *  Le registre de la tâche 3 dit où chaque commentaire doit aller. Ce test vérifie qu'il Y VA.
 *  Sans lui, la régression n°3 du README (« le raisonnement quitte le dépôt ») serait fausse :
 *  le raisonnement ne partirait pas, il serait supprimé — et personne ne le remarquerait. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ECRANS } from '../src/ecran';
import { attacherNotes, chargerVerdicts, plagesDeCommentaire } from '../outils/exporter-ecrans.mjs';

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
