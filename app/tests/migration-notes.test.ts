/** JETABLE — part à la tâche 10, avec l'outil et les littéraux.
 *
 *  Le registre de la tâche 3 dit où chaque commentaire doit aller. Ce test vérifie qu'il Y VA.
 *  Sans lui, la régression n°3 du README (« le raisonnement quitte le dépôt ») serait fausse :
 *  le raisonnement ne partirait pas, il serait supprimé — et personne ne le remarquerait. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ECRANS } from '../src/ecran';
import {
  attacherNotes, chargerVerdicts, plagesDeCommentaire, SEPARATEUR_NOTE,
} from '../outils/exporter-ecrans.mjs';

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

  it('porte le nombre de lignes de chaque note, et plusieurs se joignent en notes multi-parties', () => {
    expect(attachements.every((a) => a.lignesDeNote >= 1)).toBe(true);
    // Mesuré le 2026-09-14 : les 21 commentaires de BLOC (multi-lignes physiques,
    // `p.debut !== p.fin`) d'`ecran.ts` sont TOUS classés `type` (décision 1 de la spec), aucun
    // n'est `attachee` -- donc AUCUNE plage attachée n'a `lignesDeNote > 1` prise seule. Ce que
    // l'assertion d'origine du brief cherchait à vérifier (« il y en a des multilignes ») existe
    // bien, mais sous une autre forme : plusieurs plages `//` d'une seule ligne chacune se
    // JOIGNENT, via `SEPARATEUR_NOTE`, en une seule note à plusieurs parties sur le même objet
    // (20 chemins distincts pour 143 attachements). C'est ce que cette assertion vérifie.
    function notesJointes(n: unknown): string[] {
      if (Array.isArray(n)) return n.flatMap(notesJointes);
      if (n && typeof n === 'object') {
        const o = n as Record<string, unknown>;
        return Object.entries(o).flatMap(([k, v]) => (k === 'note' ? [String(v)] : notesJointes(v)));
      }
      return [];
    }
    expect(notesJointes(ecrans).some((n) => n.includes(SEPARATEUR_NOTE))).toBe(true);
  });
});
