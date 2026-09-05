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

/** Vrai si un ANCÊTRE de `m` figure parmi `ensemble`. C'est ce qui empêche l'exhaustivité de
 *  coûter deux fois : quand le bloc média sort, il emporte son sous-titre, ses trois boutons de
 *  transport et son rail de volume — neuf verdicts et neuf clones pour un seul geste, plus des
 *  animations imbriquées qui se composent sur un élément déjà en train de disparaître. C'est aussi
 *  ce qui permet de garder `FANTOMES_MAX` à 12 malgré la couverture exhaustive : les sorties en
 *  rafale viennent presque toujours d'un conteneur commun.
 *
 *  Ne vaut QUE pour les entrées et les sorties. Un déplacement ou une mutation sous un parent qui
 *  ne fait que bouger reste joué : un chiffre qui roule dans un bloc qui se déplace, ce sont bien
 *  deux gestes distincts. */
function sousUnAncetre(m: Marque, ensemble: Iterable<Marque>): boolean {
  for (const autre of ensemble) {
    if (autre !== m && autre.el !== m.el && autre.el.contains(m.el)) return true;
  }
  return false;
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
  const entrantes = [...apres.values()]
    .filter((m) => m.role !== 'vue' && !avant.has(`${m.role}:${m.cle}`));

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
  const sortantes = [...avant.values()]
    .filter((m) => m.role !== 'vue' && !apres.has(`${m.role}:${m.cle}`));
  for (const m of sortantes) {
    if (!sousUnAncetre(m, sortantes)) verdicts.push({ type: 'sortie', marque: m });
  }

  // Un bloc central qui en remplace un autre (repas → voiture, agenda → alerte) est UN geste, pas
  // une sortie plus une entrée : la fente ne doit ni se refermer ni se rouvrir. C'est le
  // *container transform* de MD3 — le bloc média le faisait déjà seul, on l'étend au rôle entier.
  //
  // « Même place » se lit sur la POSITION relevée, pas sur le rang : deux blocs de rangs différents
  // peuvent occuper la même fente quand des éléments les précèdent apparaissent ou disparaissent
  // dans la même passe. Si l'appariement échoue, on retombe sur le couple sortie + entrée —
  // dégradation lisible, jamais une erreur.
  const sorties = verdicts.filter((v) => v.type === 'sortie' && v.marque.role === 'bloc');
  for (const s of sorties) {
    if (s.type !== 'sortie') continue;                       // affine le type pour TypeScript
    const e = verdicts.find((v) => v.type === 'entree' && v.marque.role === 'bloc'
      && v.marque.position[0] === s.marque.position[0]
      && v.marque.position[1] === s.marque.position[1]);
    if (e === undefined || e.type !== 'entree') continue;
    verdicts.splice(verdicts.indexOf(s), 1);
    verdicts.splice(verdicts.indexOf(e), 1);
    verdicts.push({ type: 'croisement', sortante: s.marque, entrante: e.marque });
  }
  return verdicts;
}
