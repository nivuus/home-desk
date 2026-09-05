import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { niveauDemande } from '../src/mouvement';

describe('niveauDemande', () => {
  it('rend « complet » quand rien ne le contredit', () => {
    expect(niveauDemande('http://x/salon.html', false)).toBe('complet');
  });

  it('lit le niveau dans le paramètre d’URL — réglable depuis Fully sans reconstruire', () => {
    expect(niveauDemande('http://x/salon.html?mouvement=sobre', false)).toBe('sobre');
    expect(niveauDemande('http://x/salon.html?mouvement=aucun', false)).toBe('aucun');
  });

  it('ignore une valeur inconnue au lieu de lever — un mur ne meurt pas d’une faute de frappe', () => {
    expect(niveauDemande('http://x/salon.html?mouvement=turbo', false)).toBe('complet');
  });

  it('donne la priorité à prefers-reduced-motion sur tout le reste', () => {
    expect(niveauDemande('http://x/salon.html?mouvement=complet', true)).toBe('aucun');
  });

  it('n’exporte plus rien du régulateur retiré', async () => {
    const m = await import('../src/mouvement');
    for (const nom of ['Compteur', 'mesurer', 'PLANCHER_FPS', 'degrader']) {
      expect(m, `${nom} devrait avoir disparu avec le régulateur`).not.toHaveProperty(nom);
    }
  });
});

// Revue tâche 10, correctif 1 (CRITIQUE) : `.mvt-complet .commande` et `.mvt-aucun .commande`
// avaient un jour donné une durée non nulle à `.commande` sur `transform`, avec EXACTEMENT la
// même spécificité que `.commande:active` défini plus haut dans `base.css` (deux classes des deux
// côtés, 0-2-0) — un appui qui glissait sur 0,2 à 0,3 s au lieu de sauter. jsdom ne calcule jamais
// de cascade CSS, donc aucun test qui rend et lit des styles ne peut voir ce défaut — seule une
// lecture directe du fichier peut le verrouiller, comme le fait déjà `tests/carte-media.test.ts`
// pour la couche d'état tactile.
//
// Tâche 8 (moteur de mouvement) : `.mvt-complet .commande`/`.mvt-aucun .commande` et leur remise à
// zéro `:active` ont été retirées de `base.css` — le niveau ne s'exprime plus en CSS, et
// `transform`/`opacity` sont désormais TOUJOURS animés par le moteur via la Web Animations API
// (`el.animate()`), jamais par une transition CSS. Le test d'ORDRE ci-dessus (« la remise à zéro
// est déclarée APRÈS ») n'a donc plus d'objet : il n'y a plus deux règles concurrentes à départager
// par leur position dans le fichier. La garantie qui comptait reste néanmoins réelle et vérifiable
// sans navigateur : `.commande` (au repos ET au contact) ne doit JAMAIS déclarer de transition CSS
// sur `transform` — si une future règle en ajoutait une (le même geste que la tâche 10 avait fait
// par erreur), c'est CETTE assertion qui doit rougir, avant même qu'un vrai Chromium soit lancé.
describe('CSS — le retour au contact reste instantané (tâche 8 : plus de niveaux mvt-* en CSS)', () => {
  it('.commande ne déclare de transition CSS sur transform ni au repos ni au contact', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    // La règle de base de `.commande` (`height: 64px`, tout en haut du fichier, jamais scopée par
    // un niveau de mouvement depuis cette tâche) : c'est elle qui porte la seule transition CSS
    // que ce sélecteur ait jamais eu besoin (`background`/`border-radius`).
    const regleRepos = css.match(/\.commande \{[^}]*\}/);
    expect(regleRepos, '.commande introuvable dans base.css').not.toBeNull();
    expect(regleRepos![0]).not.toMatch(/transition:[^;]*transform/);

    // `.commande:active` (le retour au contact) : jamais de mention de `transform` non plus — s'il
    // en apparaissait une un jour (au repos comme au contact), ce serait le signe qu'une règle a
    // recommencé à faire glisser `transform` en CSS, exactement le défaut que ce describe existe
    // pour attraper avant un vrai navigateur.
    const regleContact = css.match(/\.commande:active,[^{]*\{[^}]*\}/);
    expect(regleContact, '.commande:active introuvable dans base.css').not.toBeNull();
    expect(regleContact![0]).not.toMatch(/transition:[^;]*transform/);
  });
});

// 2026-08-28 — DÉFAUT MESURÉ SUR LA TABLETTE CUISINE (ouverture/fermeture de `#minuteur`) : la
// vue entrante d'une traversée glisse PAR-DESSUS la sortante, restée en place en clone dans
// `#mvt-fond` (`moteur.ts`, verdict `traversee`). Une racine de vue transparente laisse donc voir
// les deux écrans superposés pendant les 320 ms du geste — reproduit dans un vrai Chromium :
// `.mn-reglage` déclarait `background: none` (posé quand cette vue était encore NICHÉE dans
// `.corps`, où le fond de `#app` suffisait), et l'écran du minuteur s'ouvrait par-dessus les
// commandes de l'accueil, lisibles au travers.
// `.corps` porte déjà ce fond, et son commentaire dans `base.css` énonce précisément cette règle :
// ce test la vérifie pour TOUTES les racines de vue qui traversent, jamais pour la seule qui a
// échoué. `.nuit` en est absente à dessein — `comparer()` (`diff.ts`) refuse de traverser vers ou
// depuis l'écran de nuit.
describe('CSS — toute racine de vue qui traverse est OPAQUE', () => {
  const css = () => readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');

  // `.ecran` : l'accueil (bandeau + corps), `.corps` : « Toute la maison », « Tâches », recette,
  // `.mn-reglage` : le réglage de minuteur.
  for (const selecteur of ['\\.ecran', '\\.corps', '\\.mn-reglage']) {
    it(`${selecteur.replace(/\\/g, '')} déclare un fond opaque`, () => {
      const m = css().match(new RegExp(`\\n${selecteur} \\{([^}]*)\\}`));
      expect(m, `règle ${selecteur} introuvable dans base.css`).not.toBeNull();
      const fond = m![1].match(/background:\s*([^;]+);/)?.[1]?.trim();
      expect(fond, `${selecteur} ne déclare aucun background`).toBeDefined();
      expect(fond, `${selecteur} est transparente : les deux écrans se superposeraient`)
        .not.toBe('none');
      expect(fond).toMatch(/var\(--md-surface\)/);
    });
  }
});
