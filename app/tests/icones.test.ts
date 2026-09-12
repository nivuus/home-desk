// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from 'lit';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHEMINS, icone } from '../src/rendu/icones';

// Revue tâche 15, mineur M2 : `soleil` et `gateau` en sont sorties — déclarées, testées, rendues
// par personne (cf. le commentaire de `rendu/icones.ts` et le test d'orphelines plus bas).
const NOUVELLES = ['pause', 'lecture', 'precedent', 'suivant', 'porte', 'rideau',
                   'aspirateur', 'fenetre'];

/** Les noms d'icône qu'aucun balayage de littéraux ne peut voir, parce qu'ils arrivent à
 *  `icone()` par une VALEUR d'exécution et non par une chaîne écrite dans le code. Ici : les
 *  conditions météo de Home Assistant, passées telles quelles (`icone(String(meteo.etat))` dans
 *  `rendu/bandeau.ts`, `icone(h.condition)` dans `rendu/corps.ts`). Toute condition non déclarée
 *  retombe volontairement sur `cloudy` (repli d'`icone()`), qui est donc à la fois une icône
 *  légitime et le filet des autres. Cette liste est une EXEMPTION NOMMÉE : y ajouter une entrée
 *  doit rester un geste délibéré, jamais le moyen de faire taire le test. */
const APPELANTS_DYNAMIQUES = ['sunny', 'partlycloudy', 'cloudy', 'rainy'];

const SRC = join(process.cwd(), 'src');

function fichiersTs(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return fichiersTs(chemin);
    return e.name.endsWith('.ts') ? [chemin] : [];
  });
}

/** Toutes les chaînes littérales de `src/`, SAUF celles du fichier de déclaration lui-même — une
 *  icône ne se référence pas elle-même. Volontairement grossier plutôt que syntaxique : les noms
 *  d'icône n'arrivent pas tous par un `icone('…')` direct (`ecran.ts` les porte en `icone: '…'`,
 *  `rendu/media.ts` les passe à `boutonTransport('pause', …)`, `rendu/taches.ts` par un
 *  ternaire). Un balayage de littéraux voit ces trois formes et toutes celles à venir, là où une
 *  liste d'appels connus serait à maintenir — et donc, un jour, fausse. Le biais assumé est du
 *  côté PERMISSIF (un nom d'icône qui serait par ailleurs un littéral quelconque passerait) :
 *  ce test attrape le code mort, il ne prouve pas l'usage. */
function litterauxDeSrc(): Set<string> {
  const trouves = new Set<string>();
  for (const f of fichiersTs(SRC)) {
    if (f.endsWith(join('rendu', 'icones.ts'))) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/'([^'\\\n]*)'/g)) trouves.add(m[1]);
  }
  return trouves;
}

describe('icônes', () => {
  it('les huit icônes nouvelles existent', () => {
    for (const nom of NOUVELLES) expect(CHEMINS[nom], nom).toBeDefined();
  });

  // Tâche 19 (2026-08-03) : deux icônes de plus pour les tuiles « Ventilateur » et
  // « Purificateur ». Le Velux, lui, n'en a PAS reçu — il réutilise `fenetre` (rectangle +
  // croisillon), déjà dessinée pour le bloc d'aération : un Velux EST une fenêtre, dessiner une
  // seconde fenêtre aurait ajouté un tracé sans ajouter d'information.
  it('les deux icônes de la tâche 19 existent et ne retombent pas sur cloudy', () => {
    for (const nom of ['ventilateur', 'purificateur']) {
      expect(CHEMINS[nom], nom).toBeDefined();
      expect(CHEMINS[nom], nom).not.toBe(CHEMINS.cloudy);
    }
  });

  it('aucune ne retombe sur le repli cloudy', () => {
    // `icone()` retombe silencieusement sur `cloudy` pour un nom inconnu : sans ce contrôle, une
    // icône oubliée s'afficherait en nuage sans qu'aucun test ne rougisse.
    for (const nom of NOUVELLES) {
      expect(CHEMINS[nom], nom).not.toBe(CHEMINS.cloudy);
    }
  });

  // Revue tâche 15, mineur M2 : les trois tests ci-dessus étaient verts sur `soleil` et `gateau`,
  // dessinées à la tâche 4 et rendues par PERSONNE — ils vérifient qu'une icône existe et qu'elle
  // est bien dessinée, jamais que quelqu'un l'affiche. Une icône orpheline ne casse rien : elle
  // pèse dans le bundle d'une tablette à 130 Mo de libre, et surtout elle donne une couverture de
  // test rassurante à du code mort.
  it('toute icône déclarée est référencée par au moins un appelant', () => {
    const litteraux = litterauxDeSrc();
    const orphelines = Object.keys(CHEMINS)
      .filter((nom) => !litteraux.has(nom) && !APPELANTS_DYNAMIQUES.includes(nom));
    expect(orphelines,
      `déclarée(s) dans CHEMINS et rendue(s) par personne : ${orphelines.join(', ')} — `
      + 'la brancher à un appelant, ou la retirer').toEqual([]);
  });

  it('les exemptions dynamiques sont réellement déclarées, pas des noms morts', () => {
    // Contre-épreuve de la liste ci-dessus : une exemption qui ne correspond à aucune icône
    // déclarée serait un moyen silencieux de désarmer le test.
    for (const nom of APPELANTS_DYNAMIQUES) expect(CHEMINS[nom], nom).toBeDefined();
  });

  it('toutes les icônes respectent la grille et le trait (pas de fill local, pas de stroke-width local, coordonnées dans [0,24])', () => {
    // Règle 3 de cohérence du spec : 24×24, trait 1.9 porté par l'enveloppe seule, aucun
    // remplissage, bouts ronds. Une icône pleine au milieu d'icônes en trait se verrait immédiatement.
    // Ce test descend jusqu'au contenu des tracés pour détecter des violations structurelles.
    for (const nom of Object.keys(CHEMINS)) {
      const div = document.createElement('div');
      render(icone(nom), div);
      const svg = div.querySelector('svg')!;

      // Vérifier que l'enveloppe elle-même a les attributs corrects (littéraux, indépendants des tracés)
      expect(svg.getAttribute('viewBox'), `${nom}: viewBox`).toBe('0 0 24 24');
      expect(svg.getAttribute('stroke-width'), `${nom}: stroke-width`).toBe('1.9');
      expect(svg.getAttribute('stroke-linecap'), `${nom}: stroke-linecap`).toBe('round');
      expect(svg.getAttribute('fill'), `${nom}: fill`).toBe('none');

      // Vérifier que les tracés eux-mêmes ne posent pas d'attributs qui violent la grille
      const elements = Array.from(svg.querySelectorAll('path, circle, rect, line, polyline, polygon'));
      for (const el of elements) {
        // Pas de `fill` local (ni sur un tracé ni sur ses éléments)
        const fill = el.getAttribute('fill');
        expect(fill, `${nom} ${el.tagName}: pas de fill local`).toBeNull();

        // Pas de `stroke-width` local (la grille impose 1.9 sur l'enveloppe)
        const strokeWidth = el.getAttribute('stroke-width');
        expect(strokeWidth, `${nom} ${el.tagName}: pas de stroke-width local`).toBeNull();

        // Coordonnées absolues dans [0, 24] : tester seulement les attributs positionnels, pas les chemins
        // (les chemins SVG utilisent des coordonnées relatives qui peuvent être négatives et ont un sens différent).
        const absoluteCoordAttrs = ['x', 'y', 'cx', 'cy', 'r', 'width', 'height'];
        for (const attr of absoluteCoordAttrs) {
          const val = el.getAttribute(attr);
          if (val) {
            // Extraire tous les nombres (décimaux, positifs uniquement dans les attributs absolus)
            const numbers = (val.match(/\d+\.?\d*|\.\d+/g) || []).map(Number);
            for (const num of numbers) {
              expect(num, `${nom} ${el.tagName} ${attr}="${val}": coordonnée ${num} hors [0,24]`).toBeGreaterThanOrEqual(0);
              expect(num, `${nom} ${el.tagName} ${attr}="${val}": coordonnée ${num} hors [0,24]`).toBeLessThanOrEqual(24);
            }
          }
        }
      }
    }
  });
});
