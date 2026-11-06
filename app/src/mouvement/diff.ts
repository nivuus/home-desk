import type { Marque } from './marques';

export type Verdict =
  | { type: 'entree'; marque: Marque }
  | { type: 'sortie'; marque: Marque }
  | { type: 'deplacement'; marque: Marque; depuis: readonly [number, number] }
  | { type: 'mutation'; marque: Marque; avant: string | null }
  | { type: 'traversee'; sortante: Marque; entrante: Marque; sens: 'droite' | 'gauche' }
  | { type: 'croisement'; sortante: Marque; entrante: Marque };

const vueDe = (m: Map<string, Marque>): Marque | undefined =>
  [...m.values()].find((x) => x.role === 'vue');

/** On entre dans une sous-vue PAR LA DROITE, on revient à l'accueil PAR LA GAUCHE — la convention
 *  déjà en place dans `base.css` avant ce moteur (`entree-droite`/`entree-gauche`). */
const sensVers = (cle: string): 'droite' | 'gauche' => (cle === 'accueil' ? 'gauche' : 'droite');

/** True when a marked ANCESTOR of `m` is part of `ensemble` (declarations). This keeps
 *  exhaustiveness from paying twice: when the media block leaves, it takes its subtitle, its three
 *  transport buttons and its volume rail with it — one gesture, one ghost, not nine ghosts and
 *  nested animations composing on an element already disappearing. It is also what keeps
 *  `FANTOMES_MAX` at 12: exits in bursts nearly always come from a common container.
 *
 *  Decided on the ancestry RECORDED at the survey (`Marque.ancetres`), never on the live DOM:
 *  `lit` may reuse the container node for the new content and drop the child, which is then
 *  inside nothing any more and would leave as a ghost of its own.
 *
 *  Only for entries and exits. A move or a mutation under a parent that only moves is still
 *  played: a digit that rolls inside a block that moves are two distinct gestures. */
function sousUnAncetre(m: Marque, ensemble: ReadonlySet<string>): boolean {
  return m.ancetres.some((d) => ensemble.has(d));
}

export function comparer(avant: Map<string, Marque>, apres: Map<string, Marque>): Verdict[] {
  const vAvant = vueDe(avant);
  const vApres = vueDe(apres);
  if (vAvant && vApres && vAvant.cle !== vApres.cle) {
    // L'écran de nuit ne traverse jamais : cf. le test, et la tâche 7.
    if (vAvant.cle === 'nuit' || vApres.cle === 'nuit') return [];
    return [{ type: 'traversee', sortante: vAvant, entrante: vApres, sens: sensVers(vApres.cle) }];
  }

  // M13 (revue finale) — UNE MÊME MARQUE PEUT RENDRE DEUX VERDICTS DANS LA MÊME PASSE :
  // `deplacement` PUIS `mutation` (les deux `if` ci-dessous ne s'excluent pas). Pour un `chiffre`
  // qui bouge ET change de glyphe — l'heure qui passe de « 9:59 » à « 10:00 », donc un caractère de
  // plus, donc tous les chiffres décalés —, `jouer()` lance le FLIP du déplacement, puis le
  // roulement, dont la seconde animation `transform` sur le MÊME nœud écrase silencieusement la
  // première (deux `Animation` concurrentes sur la même propriété : la dernière déclarée gagne).
  // Bénin, et laissé tel quel : le roulement est le geste qui porte le sens (le glyphe change), le
  // déplacement de quelques pixels n'en est que la conséquence typographique. Documenté parce que
  // « le FLIP ne joue pas » est autrement une énigme dont la cause est dans CE fichier, pas dans
  // celui où l'animation est écrite.
  // Calculée UNE SEULE FOIS, hors de la boucle : `sousUnAncetre` est en O(n) par appel, et
  // recalculer les entrantes à chaque itération transformerait ce O(n) en O(n²) — un coût que la
  // tâche 7, qui fait grimper `n` d'un facteur important, rendrait sensible.
  const entrantes = new Set([...apres.keys()]
    .filter((d) => apres.get(d)!.role !== 'vue' && !avant.has(d)));

  const verdicts: Verdict[] = [];
  for (const [decl, m] of apres) {
    if (m.role === 'vue') continue;               // la vue elle-même n'a ni entrée ni sortie propre
    const a = avant.get(decl);
    if (!a) {
      if (!sousUnAncetre(m, entrantes)) verdicts.push({ type: 'entree', marque: m });
      continue;
    }
    if (a.position[0] !== m.position[0] || a.position[1] !== m.position[1]) {
      verdicts.push({ type: 'deplacement', marque: m, depuis: a.position });
    }
    if (a.etat !== m.etat) verdicts.push({ type: 'mutation', marque: m, avant: a.etat });
  }
  const sortantes = new Set([...avant.keys()]
    .filter((d) => avant.get(d)!.role !== 'vue' && !apres.has(d)));
  for (const d of sortantes) {
    const m = avant.get(d)!;
    if (!sousUnAncetre(m, sortantes)) verdicts.push({ type: 'sortie', marque: m });
  }

  // A block that replaces another one (meal → car, car → door alert, one card of the stack →
  // the next) is ONE gesture, not an exit plus an entry: MD3's fade through. Leaving blocks and
  // entering blocks are paired IN DOCUMENT ORDER — never on their measured position, which moves
  // as soon as anything above them changes in the same pass (the door tile that shrinks when the
  // media card arrives): the pairing then failed, and the block left, a hole stayed open for the
  // entry's cascade delay, and the new one appeared on its own. A surplus on either side keeps
  // its plain exit or entry.
  const sorties = verdicts.filter((v) => v.type === 'sortie' && v.marque.role === 'bloc');
  const entrees = verdicts.filter((v) => v.type === 'entree' && v.marque.role === 'bloc');
  const paires = Math.min(sorties.length, entrees.length);
  for (let i = 0; i < paires; i++) {
    const s = sorties[i], e = entrees[i];
    if (s.type !== 'sortie' || e.type !== 'entree') continue;   // narrows the type for TypeScript
    verdicts.splice(verdicts.indexOf(s), 1);
    verdicts.splice(verdicts.indexOf(e), 1);
    verdicts.push({ type: 'croisement', sortante: s.marque, entrante: e.marque });
  }
  return verdicts;
}
