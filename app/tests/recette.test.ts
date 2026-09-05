// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { assainir, decouperPages, pagesDepuisEtapes, MOTIF_TAG, type EtapeRecette } from '../src/recette';

describe('decouperPages', () => {
  it('rend un élément par bloc .page-recipes', () => {
    const pages = decouperPages(
      '<div class="page-recipes"><p>garde</p></div><div class="page-recipes"><p>étape</p></div>');
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('garde');
    expect(pages[1]).toContain('étape');
  });

  it('rend une page unique quand la description n_a aucun bloc', () => {
    expect(decouperPages('<p>tout en vrac</p>')).toEqual(['<p>tout en vrac</p>']);
  });

  it('rend un tableau vide sur une description vide', () => {
    expect(decouperPages('')).toEqual([]);
  });

  it('ignore les blocs imbriqués : une seule page de top-level', () => {
    const pages = decouperPages(
      '<div class="page-recipes"><p>A</p><div class="page-recipes"><p>B</p></div></div>');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('A');
    expect(pages[0]).toContain('B');
    // Pas de dédoublonnage : B ne s'affiche qu'une fois
  });
});

describe('assainir', () => {
  it('retire les couleurs en dur, illisibles sur fond sombre', () => {
    const s = assainir('<p style="color:#555;font-size:14px;">gris</p>');
    expect(s).not.toContain('color');
    expect(s).toContain('font-size:14px');
  });

  it('retire background et background-color', () => {
    expect(assainir('<p style="background:#fff;">x</p>')).not.toContain('background');
  });

  it('retire les hauteurs d_image en dur et pose la classe de plafonnement', () => {
    const s = assainir('<img src="u" style="width:100%;height:250px;">');
    expect(s).not.toContain('250px');
    expect(s).toContain('class="recette-img"');
  });

  it('retire tout script, style et attribut on*', () => {
    const s = assainir('<script>alert(1)</script><style>p{}</style><p onclick="x()">t</p>');
    expect(s).not.toContain('script');
    expect(s).not.toContain('onclick');
    expect(s).toContain('<p>t</p>');
  });

  it('conserve la structure et le gras des étapes', () => {
    const s = assainir('<h3>Étape 1</h3><ol><li>Ajouter <strong>100g</strong></li></ol>');
    expect(s).toContain('<h3>Étape 1</h3>');
    expect(s).toContain('<strong>100g</strong>');
  });

  it('conserve width et height sur les éléments non-image', () => {
    const s = assainir('<table><tr><td style="width:120px;">Farine</td></tr></table>');
    expect(s).toContain('width:120px');
  });

  it('retire width et height sur img, en préservant ses classes existantes', () => {
    const s = assainir('<img class="photo" src="u" style="width:100%;height:250px;">');
    expect(s).not.toContain('250px');
    expect(s).not.toContain('width:100%');
    expect(s).toContain('class="photo recette-img"');
  });
});

// REVUE FINALE (2026-08-17) : les trois tests d'`extraireTags` ont été retirés avec la fonction.
// Ils ne l'appelaient que sur du TEXTE NU, jamais sur du HTML — le seul contexte où elle serait
// réellement utilisée — et validaient donc un comportement correct sur des entrées qui ne se
// produisent pas. La couverture réelle du scan de tags vit dans `tests/rendu-recette.test.ts`
// (`pageAvecMinuteurs` via `rendreVueRecette`), sur du HTML avec attributs.

// Lot 6 (2026-08-21) : la SECONDE entrée de la découpe. `home_stock/recipe/get` rend des étapes
// STRUCTURÉES (`recipe_step` + `recipe_instruction` imbriquées), là où l'ancienne source rendait
// un HTML déjà paginé. Le rendu, lui, ne change pas : `pagesDepuisEtapes` fabrique le même HTML
// de page que `decouperPages` produisait, tags de minuteur compris — le budget de hauteur est
// déjà mesuré et testé sur cette forme-là, on n'en invente pas une seconde.
describe('pagesDepuisEtapes', () => {
  const etape = (p: Partial<EtapeRecette> = {}): EtapeRecette => ({
    position: 1, title: 'Préparer', image_url: null,
    instructions: [{ text: 'Éplucher les pommes de terre', timer_label: null, timer_seconds: null }],
    ...p,
  });

  it('découpe des étapes structurées en pages', () => {
    const pages = pagesDepuisEtapes([
      etape({ position: 1, title: 'Préparer' }),
      etape({ position: 2, title: 'Cuire',
              instructions: [{ text: 'Enfourner', timer_label: null, timer_seconds: null }] }),
    ]);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('Étape 1');
    expect(pages[0]).toContain('Préparer');
    expect(pages[0]).toContain('Éplucher les pommes de terre');
    expect(pages[1]).toContain('Enfourner');
    expect(pages[1]).not.toContain('Éplucher');
  });

  it('reconnaît toujours les minuteurs #Nom:secondes dans une étape structurée', () => {
    // Le mécanisme des minuteurs vit dans le TEXTE de l'étape (`MOTIF_TAG`, scanné par
    // `pageAvecMinuteurs`) : la nouvelle source doit l'y écrire, pas inventer un second canal.
    const [page] = pagesDepuisEtapes([etape({
      instructions: [{ text: 'Enfourner', timer_label: 'Cuisson', timer_seconds: 1500 }],
    })]);
    expect(page).toContain('#Cuisson:1500');
    expect(MOTIF_TAG.test(page)).toBe(true);
    MOTIF_TAG.lastIndex = 0;
  });

  it("porte l'image de l'étape quand elle en a une", () => {
    const [page] = pagesDepuisEtapes([etape({ image_url: 'https://x/1.png' })]);
    expect(page).toContain('https://x/1.png');
  });

  it("se passe de titre sans laisser d'en-tête vide", () => {
    const [page] = pagesDepuisEtapes([etape({ title: null })]);
    expect(page).toContain('Étape 1');
    expect(page).not.toContain('—');
  });

  it('une recette sans étape reste une page', () => {
    // Jamais zéro page pour une recette qui existe : l'écran afficherait « Étape 0/0 ». Le
    // panneau d'ingrédients, lui, a toujours quelque chose à dire.
    expect(pagesDepuisEtapes([])).toHaveLength(1);
  });

  it("échappe le texte : une étape n'injecte jamais de balise", () => {
    const [page] = pagesDepuisEtapes([etape({
      title: '<script>x</script>',
      instructions: [{ text: 'a < b & c', timer_label: null, timer_seconds: null }],
    })]);
    expect(page).not.toContain('<script>');
    expect(page).toContain('&lt;script&gt;');
    expect(page).toContain('a &lt; b &amp; c');
  });

  it('ne lève sur aucune forme reçue du composant', () => {
    // `envoyerCommande` rend `unknown` : ce qui arrive ici a traversé un websocket, et un
    // composant plus ancien que ce bundle peut omettre `instructions`.
    for (const brut of [[{}], [{ instructions: null }], [{ position: 'deux' }], null, 'texte']) {
      expect(() => pagesDepuisEtapes(brut as never)).not.toThrow();
    }
  });
});
