// @vitest-environment jsdom
import { render } from 'lit';
import { describe, expect, it, vi } from 'vitest';
import {
  brancherRecette, decouperEnUnites, etapeSource, etendreIndexSource, reScinder, rendreVueRecette,
  type ContexteMinuteurs, type VueRecette,
} from '../src/rendu/recette';

const BASE: VueRecette = {
  etiquette: 'Dîner · 20 h', plat: 'Bol lentilles',
  pages: ['<p>garde</p>', '<h3>Étape 1</h3><ol><li>Mélanger</li></ol>', '<p>fin</p>'],
  page: 1, panneauOuvert: false, horsLigne: false, minuteurs: [], slotLibre: true,
  armee: () => false, pageIngredients: 0,
};

/** Le jeu d'actions complet, en espions. Une seule fabrique : ajouter une action au type ne doit
 *  demander qu'UNE correction dans ce fichier. */
function actionsFactices() {
  return { page: vi.fn(), reduire: vi.fn(), terminer: vi.fn(), ouvrirPanneau: vi.fn(),
           fermerPanneau: vi.fn(), minuteur: vi.fn(), pageIngredients: vi.fn() };
}

function peindre(v: VueRecette = BASE): HTMLElement {
  const hote = document.createElement('div');
  render(rendreVueRecette(v), hote);
  return hote;
}

describe('rendreVueRecette', () => {
  it('marque la vue pour le moteur de mouvement', () => {
    expect(peindre().querySelector('[data-mvt="vue:recette"]')).not.toBeNull();
  });

  it('affiche l_étiquette du repas, le plat et le numéro de page', () => {
    const hote = peindre();
    expect(hote.textContent).toContain('Dîner · 20 h');
    expect(hote.textContent).toContain('Bol lentilles');
    expect(hote.querySelector('.recette-pages')?.textContent?.trim()).toBe('2/3');
  });

  it('rend le contenu de la page courante, assaini', () => {
    const hote = peindre({ ...BASE, pages: ['<p style="color:#555">gris</p>'], page: 0 });
    expect(hote.querySelector('.recette-page')?.innerHTML).not.toContain('color');
    expect(hote.textContent).toContain('gris');
  });

  it('appelle page() sur les flèches, jamais un swipe', () => {
    const actions = actionsFactices();
    brancherRecette(actions);
    const hote = peindre();
    hote.querySelector('.recette-prec')!.dispatchEvent(new Event('pointerdown'));
    hote.querySelector('.recette-suiv')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.page).toHaveBeenNthCalledWith(1, 0);
    expect(actions.page).toHaveBeenNthCalledWith(2, 2);
  });

  it('désactive la flèche précédente sur la première page et la suivante sur la dernière', () => {
    expect(peindre({ ...BASE, page: 0 }).querySelector('.recette-prec')!.className)
      .toContain('inactif');
    expect(peindre({ ...BASE, page: 2 }).querySelector('.recette-suiv')!.className)
      .toContain('inactif');
  });

  it('propose Réduire et Terminer, deux sorties distinctes', () => {
    const actions = actionsFactices();
    brancherRecette(actions);
    const hote = peindre();
    hote.querySelector('.recette-reduire')!.dispatchEvent(new Event('pointerdown'));
    hote.querySelector('.recette-terminer')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.reduire).toHaveBeenCalledOnce();
    expect(actions.terminer).toHaveBeenCalledOnce();
  });

  const AVEC_TAG = {
    ...BASE,
    pages: ['<ol><li>Cuire #Pâtes:600 puis égoutter</li></ol>'],
    page: 0, minuteurs: [], slotLibre: true,
  };

  it('remplace un tag par un bouton de minuteur et retire le texte du tag', () => {
    const hote = peindre(AVEC_TAG);
    const bouton = hote.querySelector('.recette-minuteur');
    expect(bouton?.textContent).toContain('10:00');
    expect(hote.textContent).not.toContain('#Pâtes:600');
    expect(hote.textContent).toContain('Cuire');
  });

  it('démarre le minuteur avec le nom du tag', () => {
    const actions = actionsFactices();
    brancherRecette(actions);
    peindre(AVEC_TAG).querySelector('.recette-minuteur')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.minuteur).toHaveBeenCalledWith('Pâtes', 600);
  });

  it('affiche le décompte publié par HA quand ce minuteur tourne', () => {
    const hote = peindre({ ...AVEC_TAG, minuteurs: [{ nom: 'Pâtes', restantS: 452, actif: true }] });
    const bouton = hote.querySelector('.recette-minuteur');
    expect(bouton?.textContent).toContain('07:32');
    expect(bouton?.className).toContain('encours');
  });

  // REVUE FINALE (2026-08-17) : `encours` peint le bouton comme un décompte VIVANT (fond
  // `--md-primary`, `base.css`). Un minuteur EN PAUSE porte un restant FIGÉ : le peindre ainsi
  // affiche un mensonge — même défaut, même correctif que le décompte du bloc réduit.
  it('n_affiche PAS un minuteur en pause comme un décompte vivant', () => {
    const hote = peindre({ ...AVEC_TAG, minuteurs: [{ nom: 'Pâtes', restantS: 452, actif: false }] });
    const bouton = hote.querySelector('.recette-minuteur');
    // Le restant reste vrai — c'est bien ce qu'il reste à cette cuisson, et un appui la reprend.
    expect(bouton?.textContent).toContain('07:32');
    expect(bouton?.className).not.toContain('encours');
    // Toujours pas grisé : il reste touchable (reprise), contrairement au cas « aucun créneau ».
    expect(bouton?.className).not.toContain('inactif');
  });

  it('grise le bouton quand les trois créneaux sont pris', () => {
    const hote = peindre({ ...AVEC_TAG, slotLibre: false });
    expect(hote.querySelector('.recette-minuteur')!.className).toContain('inactif');
  });

  it('ignore un tag tombé dans un attribut (cas réel : #888;font-size dans un style) et garde le texte', () => {
    const hote = peindre({
      ...BASE, page: 0,
      pages: ['<p style="color:#888;font-size:14px">Cuire</p>'],
    });
    expect(hote.querySelector('.recette-minuteur')).toBeNull();
    expect(hote.textContent).toContain('Cuire');
  });

  it('ne transforme que le vrai tag quand un faux positif d_attribut et un tag de texte coexistent', () => {
    const hote = peindre({
      ...BASE, page: 0,
      pages: ['<p style="color:#888;font-size:14px">Cuire #Pâtes:600</p>'],
    });
    const boutons = hote.querySelectorAll('.recette-minuteur');
    expect(boutons.length).toBe(1);
    expect(boutons[0].textContent).toContain('10:00');
  });

  it('un < isolé dans le texte (« 3 < 5 ») ne bascule pas en mode balise et n_avale pas le tag suivant', () => {
    const hote = peindre({
      ...BASE, page: 0,
      pages: ['<p>Cuire #Pates:600 puis attendre 3 < 5 puis #Riz:300</p>'],
    });
    const boutons = hote.querySelectorAll('.recette-minuteur');
    expect(boutons.length).toBe(2);
    expect(hote.textContent).toContain('3 < 5');
  });

  it('un > entre guillemets dans un attribut ne termine pas la balise prématurément', () => {
    const hote = peindre({
      ...BASE, page: 0,
      pages: ['<img alt="a > b">Cuire #Pâtes:600'],
    });
    const boutons = hote.querySelectorAll('.recette-minuteur');
    expect(boutons.length).toBe(1);
    expect(hote.querySelector('img')?.getAttribute('alt')).toBe('a > b');
  });

  // --- Le panneau d'ingrédients, en LECTURE (lot 6, 2026-08-21) ---
  //
  // Le geste « retirer cet ingrédient » a DISPARU et n'est pas remplacé. La spec ne laisse que
  // trois gestes à la tablette, et celui-là n'en fait pas partie : retirer une quantité est un
  // CHOIX (combien, sur quel lot), et tout geste qui demande un choix vit dans le panneau et
  // seulement là. Un bouton en moins, c'est de la hauteur en moins — jamais un problème de budget.
  const AVEC_PANNEAU: VueRecette = {
    ...BASE, page: 0, minuteurs: [], slotLibre: true, panneauOuvert: true,
    armee: () => false,
    ingredients: [
      { nom: 'Lentilles', quantite: '200 g', manque: false },
      { nom: 'Feta', quantite: '100 g', manque: true },
    ],
  };

  it('affiche les ingrédients en LECTURE, sans bouton de retrait', () => {
    const hote = peindre(AVEC_PANNEAU);
    expect(hote.querySelectorAll('.ing-ligne')).toHaveLength(2);
    expect(hote.querySelectorAll('.ing-retirer')).toHaveLength(0);
    expect(hote.querySelectorAll('.ing-tout')).toHaveLength(0);
    expect(hote.textContent).not.toContain('Retirer');
  });

  it('liste chaque ingrédient avec sa quantité lisible', () => {
    const lignes = peindre(AVEC_PANNEAU).querySelectorAll('.ing-ligne');
    expect(lignes[0].textContent).toContain('Lentilles');
    expect(lignes[0].textContent).toContain('200 g');
  });

  it('signale un ingrédient manquant, et seulement lui', () => {
    const lignes = peindre(AVEC_PANNEAU).querySelectorAll('.ing-ligne');
    expect(lignes[0].querySelector('.ing-stock')).toBeNull();
    expect(lignes[1].querySelector('.ing-stock')!.textContent).toContain('manquant');
  });

  it('dit « Aucun ingrédient » plutôt que de rendre un panneau vide', () => {
    const hote = peindre({ ...AVEC_PANNEAU, ingredients: [] });
    expect(hote.textContent).toContain('Aucun ingrédient');
  });

  // Tâche 7 (mouvement, 2026-08-22) : couverture — le message « Aucun ingrédient » et la pastille
  // « manquant » portent chacun leur marque, pour que le moteur (`src/mouvement/moteur.ts`) anime
  // leur apparition/disparition plutôt que de les faire sauter sec.
  it('« Aucun ingrédient » porte une marque de mouvement', () => {
    const hote = peindre({ ...AVEC_PANNEAU, ingredients: [] });
    expect(hote.querySelector('.ing-vide')?.getAttribute('data-mvt')).toBe('detail:ing-vide');
  });

  it('la pastille « manquant » est marquée par sa position DANS LA PAGE, pas par un identifiant '
    + 'produit — LigneIngredient n\'en porte aucun', () => {
    const lignes = peindre(AVEC_PANNEAU).querySelectorAll('.ing-ligne');
    // Lentilles (index 0) n'est pas en manque, donc pas de .ing-stock du tout ; Feta (index 1)
    // l'est, et porte l'index de SA position dans `visibles` — ici 1, la même que son rang.
    expect(lignes[1].querySelector('.ing-stock.manque')?.getAttribute('data-mvt'))
      .toBe('detail:manque-1');
  });

  // Cas réel du planning (mesuré 2026-08-17) : 7 ingrédients — le budget réel de `.ing-liste`
  // (~325 px, la zone de contenu MOINS `.ing-actions` et son gap) ne tient que 4 lignes de 62 px
  // avec leurs écarts (4×62 + 3×8 = 272 px), le panneau doit donc paginer à 4, pas à 5.
  const SEPT_INGREDIENTS = Array.from({ length: 7 }, (_, n) => (
    { nom: `Ingrédient ${n}`, quantite: '1 g', manque: false }
  ));

  it('pagine à 4 ingrédients par page (7 ingrédients → 4 puis 3, indicateur 1/2)', () => {
    const page0 = peindre({ ...AVEC_PANNEAU, ingredients: SEPT_INGREDIENTS, pageIngredients: 0 });
    expect(page0.querySelectorAll('.ing-ligne')).toHaveLength(4);
    expect(page0.querySelector('.recette-pages')?.textContent?.trim()).toBe('1/2');

    const page1 = peindre({ ...AVEC_PANNEAU, ingredients: SEPT_INGREDIENTS, pageIngredients: 1 });
    expect(page1.querySelectorAll('.ing-ligne')).toHaveLength(3);
    expect(page1.querySelector('.recette-pages')?.textContent?.trim()).toBe('2/2');
  });

  it('bascule à 2 pages dès 5 ingrédients (4 puis 1)', () => {
    const CINQ = Array.from({ length: 5 }, (_, n) => (
      { nom: `Ingrédient ${n}`, quantite: '1 g', manque: false }
    ));
    const page0 = peindre({ ...AVEC_PANNEAU, ingredients: CINQ, pageIngredients: 0 });
    expect(page0.querySelectorAll('.ing-ligne')).toHaveLength(4);
    const page1 = peindre({ ...AVEC_PANNEAU, ingredients: CINQ, pageIngredients: 1 });
    expect(page1.querySelectorAll('.ing-ligne')).toHaveLength(1);
  });

  it('borne un pageIngredients hors bornes à la dernière page valide, sans panneau blanc', () => {
    const hote = peindre({ ...AVEC_PANNEAU, pageIngredients: 3 });
    expect(hote.querySelectorAll('.ing-ligne')).toHaveLength(2);
    expect(hote.textContent).not.toContain('Aucun ingrédient');
    expect(hote.querySelector('.recette-pages')?.textContent?.trim()).toBe('1/1');
  });

  it('les flèches paginent les ingrédients (pageIngredients, pas page) quand le panneau est ouvert', () => {
    const actions = actionsFactices();
    brancherRecette(actions);
    const hote = peindre({ ...AVEC_PANNEAU, ingredients: SEPT_INGREDIENTS, pageIngredients: 1 });
    hote.querySelector('.recette-prec')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.pageIngredients).toHaveBeenCalledWith(0);
    expect(actions.page).not.toHaveBeenCalled();
  });

  it('les flèches paginent les étapes (page) quand le panneau est fermé', () => {
    const actions = actionsFactices();
    brancherRecette(actions);
    peindre().querySelector('.recette-suiv')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.page).toHaveBeenCalled();
    expect(actions.pageIngredients).not.toHaveBeenCalled();
  });

  // --- « Terminer » : irréversible, donc deux appuis et un libellé qui dit la vérité ---

  it('le second appui de « Terminer » porte « le stock sera décrémenté »', () => {
    // Un libellé générique sur un geste irréversible est un piège. Ce test est la seule chose qui
    // empêche qu'il redevienne générique. La phrase vit dans `.etiquette`, sur toute la largeur :
    // la coller dans une colonne de grille sur trois la ferait passer à quatre lignes, donc
    // grandir le cadre — et le lot n'ajoute pas un pixel.
    const arme = peindre({ ...BASE, armee: (c: string) => c === 'terminer' });
    expect(arme.querySelector('.etiquette')!.textContent)
      .toContain('le stock sera décrémenté');
    expect(arme.querySelector('.recette-terminer')!.textContent).toContain('Confirmer');
  });

  it('au repos, « Terminer » ne parle pas de stock', () => {
    const hote = peindre();
    expect(hote.textContent).not.toContain('décrémenté');
    expect(hote.querySelector('.recette-terminer')!.textContent).toContain('Terminer');
  });

  it("un seul emplacement armé à la fois : le rendu n'arme rien lui-même", () => {
    // C'est `demarrage.ts` qui porte l'armement (`creerArmement`, une instance par page) : ce
    // rendu ne fait que demander l'action et afficher l'état qu'on lui donne.
    const actions = actionsFactices();
    brancherRecette(actions);
    const hote = peindre();
    hote.querySelector('.recette-terminer')!.dispatchEvent(new Event('pointerdown'));
    hote.querySelector('.recette-terminer')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.terminer).toHaveBeenCalledTimes(2);
  });

  it('hors ligne, « Terminer » est refusé VISIBLEMENT', () => {
    const actions = actionsFactices();
    brancherRecette(actions);
    const hote = peindre({ ...BASE, horsLigne: true });
    const bouton = hote.querySelector('.recette-terminer')!;
    expect(bouton.className).toContain('inactif');
    bouton.dispatchEvent(new Event('pointerdown'));
    expect(actions.terminer).not.toHaveBeenCalled();
  });

  it("affiche un refus serveur sans rien effacer de l'écran", () => {
    // Tout l'intérêt d'écrire par websocket plutôt que par `appelerService`, qui est un envoi
    // sans réponse : savoir que l'écriture a échoué n'est pas un luxe.
    const hote = peindre({ ...BASE, message: 'Stock insuffisant.' });
    expect(hote.querySelector('.etiquette')!.textContent).toContain('Stock insuffisant.');
    expect(hote.querySelector('.recette-page')).not.toBeNull();
    expect(hote.querySelector('.recette-actions')).not.toBeNull();
  });

  it('aucun geste : ni swipe, ni appui long, rien que des pointerdown sur des boutons', () => {
    const hote = peindre();
    const source = rendreVueRecette(BASE).strings.join('');
    for (const interdit of ['touchstart', 'touchmove', 'pointermove', 'contextmenu', 'dblclick']) {
      expect(source).not.toContain(interdit);
    }
    expect(hote.querySelectorAll('[data-mvt="vue:recette"]')).toHaveLength(1);
  });
});

describe('decouperEnUnites', () => {
  it('rend un élément par balise de premier niveau, en outerHTML', () => {
    expect(decouperEnUnites('<p>A</p><h3>B</h3>')).toEqual(['<p>A</p>', '<h3>B</h3>']);
  });

  it('rend un nœud texte de premier niveau tel quel — c est lui qui porte un tag posé ENTRE deux balises', () => {
    expect(decouperEnUnites('<p>Avant</p>#Tag:30<p>Après</p>'))
      .toEqual(['<p>Avant</p>', '#Tag:30', '<p>Après</p>']);
  });

  it('écarte les nœuds texte purement blancs (mise en forme du HTML source)', () => {
    expect(decouperEnUnites('<p>A</p>\n  \n<p>B</p>')).toEqual(['<p>A</p>', '<p>B</p>']);
  });

  it('rend un tableau vide pour une chaîne vide', () => {
    expect(decouperEnUnites('')).toEqual([]);
  });

  // Round 2 (revue) : un commentaire HTML n'a pas d'`outerHTML` (`undefined` sur un nœud
  // commentaire) — `.filter(s => s.trim())` levait alors une `TypeError` sur `undefined.trim`,
  // reproduit dans un vrai Chromium par le relecteur. Un écran mural qui LÈVE à la peinture (au lieu
  // d'écrêter) est le pire mode de défaillance de ce projet, et ce HTML est écrit à la main.
  it('ignore un commentaire HTML de premier niveau sans lever', () => {
    expect(() => decouperEnUnites('<p>A</p><!-- note du cuisinier --><p>B</p>')).not.toThrow();
    expect(decouperEnUnites('<p>A</p><!-- note du cuisinier --><p>B</p>'))
      .toEqual(['<p>A</p>', '<p>B</p>']);
  });
});

describe('etendreIndexSource', () => {
  it('ne change rien quand rien n a été ajouté (longueurApres === longueurAvant)', () => {
    expect(etendreIndexSource([0, 1, 2], 1, 3, 3)).toEqual([0, 1, 2]);
  });

  it('duplique l index source de la page coupée sur toutes les sous-pages qui la remplacent', () => {
    // pagesRecette = [A, B, C] (index source [0,1,2]), B (page 1) coupée en 3 sous-pages :
    // longueurApres = 3 - 1 + 3 = 5.
    expect(etendreIndexSource([0, 1, 2], 1, 3, 5)).toEqual([0, 1, 1, 1, 2]);
  });

  it('fonctionne à la première comme à la dernière page', () => {
    expect(etendreIndexSource([0, 1], 0, 2, 3)).toEqual([0, 0, 1]);
    expect(etendreIndexSource([0, 1], 1, 2, 3)).toEqual([0, 1, 1]);
  });
});

/** REVUE FINALE (2026-08-17) — le « Étape N/T » du bloc réduit. Avant ce correctif, `demarrage.ts`
 *  annonçait `pagesRecette.length` (la version SOUS-DÉCOUPÉE) : le total et le numéro changeaient
 *  avec la hauteur du texte peint, contre le spec (§4). Seul endroit où ce compte est vérifiable —
 *  `reScinder` lui-même dépend d'une mesure DOM que jsdom ne fait pas. */
describe('etapeSource', () => {
  it('compte les pages SOURCE, pas les sous-pages : 3 étapes restent 3 après une coupe', () => {
    // Une recette de 3 pages source dont la 2e a été coupée en 3 sous-pages (5 sous-pages en tout).
    const index = [0, 1, 1, 1, 2];
    expect(etapeSource(index, 0)).toEqual({ etape: 1, total: 3 });
    expect(etapeSource(index, 1)).toEqual({ etape: 2, total: 3 });
    // Le milieu de l'étape 2 reste l'étape 2 — jamais « Étape 3/5 » sous les doigts du cuisinier.
    expect(etapeSource(index, 2)).toEqual({ etape: 2, total: 3 });
    expect(etapeSource(index, 3)).toEqual({ etape: 2, total: 3 });
    expect(etapeSource(index, 4)).toEqual({ etape: 3, total: 3 });
  });

  it('reste l identité tant que rien n a été sous-découpé', () => {
    expect(etapeSource([0, 1, 2], 1)).toEqual({ etape: 2, total: 3 });
  });

  it('borne une page hors intervalle plutôt que d afficher « Étape 4/3 »', () => {
    expect(etapeSource([0, 1, 2], 9)).toEqual({ etape: 3, total: 3 });
    expect(etapeSource([0, 1, 2], -4)).toEqual({ etape: 1, total: 3 });
  });

  it('rend 1/1 sur une recette sans page, jamais « 0/1 » ni « 1/0 »', () => {
    expect(etapeSource([], 0)).toEqual({ etape: 1, total: 1 });
  });
});

/** jsdom rend 0 partout pour `offsetHeight`/`scrollHeight`/`clientHeight`/`clientWidth` (aucun
 *  calcul de mise en page) : ces tests forcent `scrollHeight`/`clientHeight` sur `.recette-page` à
 *  la main, et substituent à `mesurerHorsEcran` un `mesurer` de test qui rend des hauteurs
 *  CONTRÔLÉES (5e paramètre injectable de `reScinder`) — jamais la vraie mesure, qui ne peut être
 *  jugée que par `outils/verifier-rendu.mjs` (cf. l'en-tête de `reScinder`). Ce qui EST vérifiable
 *  ici, et qui ne l'était pas avant la revue de la tâche 12 : que la page recomposée reste de la
 *  SOURCE (un tag survit tel quel) et qu'un bouton de minuteur reste VIVANT (répond au doigt) une
 *  fois cette source repeinte par le chemin normal. */
describe('reScinder', () => {
  const V: ContexteMinuteurs = { minuteurs: [], slotLibre: true };

  /** Construit un hôte contenant `.recette-page`, avec `scrollHeight`/`clientHeight` forcés. */
  function fabriquerZone(scrollHeight: number, clientHeight: number): HTMLElement {
    const hote = document.createElement('div');
    const zone = document.createElement('div');
    zone.className = 'recette-page';
    Object.defineProperty(zone, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(zone, 'clientHeight', { value: clientHeight, configurable: true });
    hote.appendChild(zone);
    return hote;
  }

  const PAGES = ['<p>garde avant</p>', '<p>A</p><p>B</p>', '<p>garde après</p>'];

  it('rend null quand la zone .recette-page est absente', () => {
    expect(reScinder(document.createElement('div'), PAGES, 1, V, () => 100)).toBeNull();
  });

  it('rend null quand la page tient (scrollHeight <= clientHeight)', () => {
    const hote = fabriquerZone(300, 400);
    expect(reScinder(hote, PAGES, 1, V, () => 100)).toBeNull();
  });

  it('rend null quand une seule unité source déborde : rien à couper, elle reste seule', () => {
    const hote = fabriquerZone(900, 400);
    expect(reScinder(hote, ['<p>seule</p>'], 0, V, () => 900)).toBeNull();
  });

  it('rend null quand scinderSelonHauteur ne trouve qu un seul groupe malgré le débordement mesuré', () => {
    // scrollHeight/clientHeight disent que ça déborde, mais les hauteurs MESURÉES (hors écran)
    // tiennent largement dans les 400 px disponibles : la coupe n'aurait aucun effet.
    const hote = fabriquerZone(500, 400);
    expect(reScinder(hote, PAGES, 1, V, () => 50)).toBeNull();
  });

  it('recolle des CHAÎNES SOURCE, jamais du HTML peint : un tag mi-paragraphe survit intact à la coupe', () => {
    const hote = fabriquerZone(600, 300);
    // Le tag est AU MILIEU d'un <p> (cf. revue tâche 12, point 3 : c'est le cas de production, pas
    // le contournement du round précédent).
    const longue = '<p>Verser #Tag:30 puis attendre</p><p>Fin</p>';
    const source = ['<p>garde avant</p>', longue, '<p>garde après</p>'];
    // 2 unités (2 <p>) à 200 px chacune : cumul 200 (tient), +200 = 400 > 300 (déborde) → coupe.
    const resultat = reScinder(hote, source, 1, V, () => 200)!;
    expect(resultat).toHaveLength(4);   // page 0 + 2 sous-pages + page 2
    expect(resultat[0]).toBe(source[0]);
    expect(resultat[1]).toBe('<p>Verser #Tag:30 puis attendre</p>');
    expect(resultat[1]).toContain('#Tag:30');   // le tag SURVIT — ce n'est pas du HTML déjà peint
    expect(resultat[2]).toBe('<p>Fin</p>');
    expect(resultat[3]).toBe(source[2]);
  });

  it('un tag posé ENTRE deux balises (nœud texte de premier niveau) survit aussi à la coupe', () => {
    const hote = fabriquerZone(600, 400);
    const longue = '<p>Avant</p>#Tag:45<p>Après</p>';
    const source = ['<p>garde avant</p>', longue, '<p>garde après</p>'];
    // 3 unités : <p>Avant</p>, le nœud texte "#Tag:45", <p>Après</p>.
    const resultat = reScinder(hote, source, 1, V, (u) => (u.includes('#Tag') ? 500 : 50))!;
    expect(resultat.join('')).toContain('#Tag:45');
  });

  // LE test qui manquait à la revue de la tâche 12 (round 1) : la première version de `reScinder`
  // recollait le DOM déjà peint (`zone.children[i].outerHTML`), où le tag `#Tag:30` avait déjà été
  // remplacé par un `<span class="recette-minuteur">` sans `@pointerdown` — un bouton mort, identique
  // à l'œil, qui ne relance plus rien au doigt. Ce test peint la page RECOMPOSÉE par le chemin réel
  // (`rendreVueRecette` → `pageAvecMinuteurs`) et vérifie qu'un appui déclenche bien `actions.minuteur`.
  it('un appui sur le bouton de minuteur reste vivant après la coupe (appelle actions.minuteur)', () => {
    const hote = fabriquerZone(600, 300);
    const longue = '<p>Verser #Tag:30 puis attendre longuement que ça cuise</p><p>Fin de l étape</p>';
    const source = ['<p>garde avant</p>', longue, '<p>garde après</p>'];
    const resultat = reScinder(hote, source, 1, V, () => 200)!;

    const actions = actionsFactices();
    brancherRecette(actions);
    // La page 1 de `resultat` (celle qui remplace l'ancienne page 1 en premier) porte le tag.
    const vueRendue = peindre({ ...BASE, pages: resultat, page: 1 });
    const bouton = vueRendue.querySelector('.recette-minuteur');
    expect(bouton, 'le bouton de minuteur doit être rendu, vivant, après la coupe').not.toBeNull();
    bouton!.dispatchEvent(new Event('pointerdown'));
    expect(actions.minuteur).toHaveBeenCalledWith('Tag', 30);
  });

  // Round 3 (revue) : les 14 recettes du catalogue sans bloc `.page-recipes` forment une seule
  // unité de premier niveau — `unites.length < 2` rendait `null` avant ce correctif, et un texte
  // assez long restait donc écrêté en silence (round 2, mesuré : 51 px perdus sur une fixture
  // réaliste). `mesurer` ici rend la longueur de la CHAÎNE SOURCE — un budget en « caractères »,
  // pas en pixels, mais qui exerce exactement la même logique de regroupement cumulatif que la
  // vraie mesure (`grouperParHauteur`), de façon entièrement déterministe sous jsdom.
  describe('subdivision d une unité seule trop haute (round 3)', () => {
    it('découpe aux frontières de phrases quand elles suffisent', () => {
      const hote = fabriquerZone(900, 20);
      const page = '<p>Un. Deux. Trois.</p>';
      const resultat = reScinder(hote, [page], 0, V, (s) => s.length)!;
      expect(resultat.length).toBeGreaterThanOrEqual(2);
      // Chaque morceau reste un <p> (le balisage enveloppant survit à la subdivision).
      resultat.forEach((m) => { expect(m.startsWith('<p>')).toBe(true); expect(m.endsWith('</p>')).toBe(true); });
      // Coupe À UNE FRONTIÈRE DE PHRASE : chaque morceau, débarrassé de ses balises, se termine par
      // un point (jamais au milieu d'une phrase).
      resultat.forEach((m) => { expect(m.replace(/<\/?p>/g, '').trim()).toMatch(/\.$/); });
      // Contenu intégralement présent, dans l'ordre, rien perdu ni dupliqué.
      const recolle = resultat.map((m) => m.replace(/<\/?p>/g, '')).join(' ').replace(/\s+/g, ' ').trim();
      expect(recolle).toBe('Un. Deux. Trois.');
    });

    it('retombe sur la coupe par mots quand une seule phrase est déjà trop haute, sans jamais couper un mot', () => {
      const hote = fabriquerZone(900, 30);
      // Une seule phrase (un seul point, à la toute fin) : `decouperEnPhrases` n'y trouve qu'UNE
      // unité, donc `grouperParHauteur` ne peut pas la scinder — le repli par mots doit prendre le
      // relais.
      const page = '<p>Ceci est une seule phrase interminable qui ne tient pas.</p>';
      const motsSource = 'Ceci est une seule phrase interminable qui ne tient pas.'.split(' ');
      const resultat = reScinder(hote, [page], 0, V, (s) => s.length)!;
      expect(resultat.length).toBeGreaterThanOrEqual(2);
      resultat.forEach((m) => { expect(m.startsWith('<p>')).toBe(true); expect(m.endsWith('</p>')).toBe(true); });
      // Aucun mot coupé : chaque mot de la source apparaît ENTIER dans exactement un morceau, dans
      // l'ordre — reconstitué, la liste de mots est identique à la source.
      const motsRecolles = resultat
        .map((m) => m.replace(/<\/?p>/g, '').trim())
        .join(' ')
        .split(/\s+/);
      expect(motsRecolles).toEqual(motsSource);
    });

    it('abandonne (rend la page telle quelle) quand même un seul mot dépasse la place disponible', () => {
      const hote = fabriquerZone(900, 3);   // budget minuscule
      // UN SEUL mot (aucune espace du tout, un seul point final sans rien après) : `decouperEnPhrases`
      // ET `decouperEnMots` y trouvent chacun un unique segment — ni l'un ni l'autre ne peut produire
      // plus d'un morceau, quel que soit `dispo`.
      const page = '<p>Ununseulmotgeantsansaucuneespacequinepassepas.</p>';
      // `reScinder` rend `null` : la page reste inchangée par l'appelant (`demarrage.ts`) plutôt que
      // de casser ce mot en deux.
      expect(reScinder(hote, [page], 0, V, (s) => s.length)).toBeNull();
    });
  });

  // Round 4 (revue) : `MOTIF_TAG` (`src/recette.ts`) autorise l'espace ET la ponctuation de fin de
  // phrase dans le nom d'un tag — la coupe par phrases/mots du round 3 l'ignorait, et pouvait donc
  // rompre un tag à nom espacé (62 des 98 tags réels du catalogue en portent une, ex.
  // « Cabillaud face 1 ») en le répartissant sur deux pages : le fragment ne matche plus `MOTIF_TAG`
  // au rendu suivant, le tag redevient du texte nu — un bouton mort, la même classe que le round 1.
  describe('un tag à nom espacé n est jamais coupé par la subdivision (round 4)', () => {
    it('un tag réel (#Cabillaud face 1:300) survit intact à une coupe par mots, et redonne un bouton vivant', () => {
      // 24 px : calibré pour que le découpage NAÏF (sans protection des tags) coupe PILE entre
      // « face » et « 1:300 » — vérifié par simulation avant d'écrire ce test, cf. le rapport.
      const hote = fabriquerZone(900, 24);
      // Une seule phrase (un seul point, à la toute fin) : la coupe par phrases ne peut rien, le
      // repli par mots — celui qui ignorait `MOTIF_TAG` avant ce correctif — prend le relais.
      const page = '<p>Cuire le poisson #Cabillaud face 1:300 puis retourner et attendre.</p>';
      const resultat = reScinder(hote, [page], 0, V, (s) => s.length)!;
      expect(resultat.length).toBeGreaterThanOrEqual(2);

      // Le tag reste ENTIER, dans un seul morceau — jamais réparti en fragments qui ne matchent plus
      // `MOTIF_TAG` individuellement (« #Cabillaud » seul, ou « face 1:300 » sans le `#`).
      const indexAvecTag = resultat.findIndex((m) => m.includes('#Cabillaud face 1:300'));
      expect(indexAvecTag, 'le tag doit survivre INTACT dans un morceau').toBeGreaterThanOrEqual(0);
      resultat.forEach((m, i) => {
        if (i === indexAvecTag) return;
        expect(m).not.toContain('#Cabillaud');
        expect(m).not.toContain('1:300');
      });

      // Le morceau qui porte le tag, repeint par le chemin réel, produit un bouton VIVANT — pas la
      // classe de bug que le round 1 avait fermée pour la recomposition, rouverte ici par la
      // subdivision.
      const actions = actionsFactices();
      brancherRecette(actions);
      const vueRendue = peindre({ ...BASE, pages: resultat, page: indexAvecTag });
      const bouton = vueRendue.querySelector('.recette-minuteur');
      expect(bouton, 'le bouton de minuteur doit être rendu, vivant, après la coupe').not.toBeNull();
      bouton!.dispatchEvent(new Event('pointerdown'));
      expect(actions.minuteur).toHaveBeenCalledWith('Cabillaud face 1', 300);
    });

    it('deux tags à noms espacés séparés par du texte long restent chacun entiers, chacun sur sa page', () => {
      // 24 px : calibré pour que le découpage naïf casse LES DEUX tags (« face » séparé de son
      // numéro, sur chacun des deux) — vérifié par simulation avant d'écrire ce test.
      const hote = fabriquerZone(900, 24);
      const page = '<p>#Cabillaud face 1:300 puis attendre un long moment avant de retourner #Cabillaud face 2:180 et servir.</p>';
      const resultat = reScinder(hote, [page], 0, V, (s) => s.length)!;
      expect(resultat.length).toBeGreaterThanOrEqual(2);

      const morceauAvec1 = resultat.find((m) => m.includes('#Cabillaud face 1:300'));
      const morceauAvec2 = resultat.find((m) => m.includes('#Cabillaud face 2:180'));
      expect(morceauAvec1, 'le premier tag doit survivre intact').toBeDefined();
      expect(morceauAvec2, 'le second tag doit survivre intact').toBeDefined();
      // Aucun fragment brisé d'un tag ailleurs que dans son propre morceau.
      resultat.forEach((m) => {
        if (m !== morceauAvec1) { expect(m).not.toContain('#Cabillaud face 1'); }
        if (m !== morceauAvec2) { expect(m).not.toContain('#Cabillaud face 2'); }
      });
    });

    it('le contenu reste intégralement conservé (concaténation identique à la source) malgré les tags', () => {
      const hote = fabriquerZone(900, 24);
      const texteSource = 'Cuire le poisson #Cabillaud face 1:300 puis retourner et attendre.';
      const resultat = reScinder(hote, [`<p>${texteSource}</p>`], 0, V, (s) => s.length)!;
      const recolle = resultat.map((m) => m.replace(/<\/?p>/g, '')).join(' ').replace(/\s+/g, ' ').trim();
      expect(recolle).toBe(texteSource);
    });
  });
});
