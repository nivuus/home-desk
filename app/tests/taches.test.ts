// @vitest-environment jsdom
//
// `rendreTaches`/`brancherCochageTaches` (tâche 18) : rendu de la vue « Tâches », même patron que
// `tests/maison.test.ts` pour « Toute la maison » — rendu réel via `lit` + DOM, budget de hauteur
// vérifié arithmétiquement (jsdom ne calcule aucune vraie mise en page).
import { describe, it, expect, vi } from 'vitest';
import { render } from 'lit';
import { rendreTaches, brancherCochageTaches } from '../src/rendu/taches';
import { MAX_LIGNES_TACHES, type TacheAffichee } from '../src/cochage';

const tache = (uid: string, texte = `Tâche ${uid}`, liste = 'Entretien'): TacheAffichee =>
  ({ entite: 'todo.maintenance', uid, texte, liste });

describe('rendreTaches', () => {
  it('liste vide et aucun reste : affiche "Aucune tache", aucune ligne', () => {
    const div = document.createElement('div');
    render(rendreTaches([], 0, () => false), div);
    expect(div.querySelector('.taches-vide')?.textContent).toBe('Aucune tâche');
    expect(div.querySelectorAll('.ligne-tache')).toHaveLength(0);
  });

  it('rend une ligne par tache, avec son texte et le libelle de sa liste en sous-titre', () => {
    const div = document.createElement('div');
    render(rendreTaches([tache('a', 'Changer une pile', 'Entretien')], 0, () => false), div);
    const ligne = div.querySelector('.ligne-tache')!;
    expect(ligne.querySelector('.t')?.textContent).toBe('Changer une pile');
    expect(ligne.querySelector('.s')?.textContent).toBe('Entretien');
    expect(ligne.className).not.toContain('armee');
  });

  it('une ligne armee porte la classe armee et un sous-titre de confirmation, jamais son libelle de liste', () => {
    const div = document.createElement('div');
    render(rendreTaches([tache('a')], 0, (_e, uid) => uid === 'a'), div);
    const ligne = div.querySelector('.ligne-tache')!;
    expect(ligne.className).toContain('armee');
    expect(ligne.querySelector('.s')?.textContent).toBe('Toucher pour confirmer');
  });

  it('un appui sur une ligne appelle la fonction branchee par brancherCochageTaches, avec entite et uid', () => {
    const cocher = vi.fn();
    brancherCochageTaches(cocher);
    const div = document.createElement('div');
    render(rendreTaches([tache('a')], 0, () => false), div);

    div.querySelector('.ligne-tache')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(cocher).toHaveBeenCalledWith('todo.maintenance', 'a');
  });

  it('reste > 0 : une derniere ligne de compte-rendu, sans pointerdown fonctionnel ni classe armee', () => {
    const cocher = vi.fn();
    brancherCochageTaches(cocher);
    const div = document.createElement('div');
    render(rendreTaches([tache('a')], 3, () => false), div);

    const lignes = Array.from(div.querySelectorAll('.ligne-tache'));
    expect(lignes).toHaveLength(2);   // 1 vraie tâche + 1 ligne de reste
    const ligneReste = lignes[1];
    expect(ligneReste.className).toContain('reste');
    expect(ligneReste.textContent).toContain('+3 tâches');
    expect(ligneReste.className).not.toContain('armee');

    // Un appui dessus n'appelle JAMAIS le cochage : aucun `@pointerdown` n'est posé sur cette
    // ligne (cf. rendu/taches.ts), contrairement aux vraies lignes de tâches ci-dessus.
    ligneReste.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(cocher).not.toHaveBeenCalled();
  });

  it('un seul reste (singulier), pas de s', () => {
    const div = document.createElement('div');
    render(rendreTaches([], 1, () => false), div);
    expect(div.querySelector('.ligne-tache.reste .t')?.textContent).toBe('+1 tâche');
  });

  it('hors ligne : etiquette remplacee par "Hors ligne", coloree, sans bloc supplementaire', () => {
    const div = document.createElement('div');
    render(rendreTaches([tache('a')], 0, () => false, true), div);
    const etiquette = div.querySelector('.etiquette')!;
    expect(etiquette.textContent).toBe('Hors ligne');
    expect(etiquette.className).toContain('hl');
    expect(div.querySelectorAll('.etiquette')).toHaveLength(1);
  });

  // Tâche 7 (mouvement, 2026-08-22) : couverture — le bloc « Aucune tâche » et la ligne de reste
  // portent chacun leur marque, pour que le moteur (`src/mouvement/moteur.ts`) anime leur
  // apparition/disparition plutôt que de les faire sauter sec.
  it('« Aucune tâche » porte une marque de mouvement', () => {
    const div = document.createElement('div');
    render(rendreTaches([], 0, () => false), div);
    expect(div.querySelector('.taches-vide')?.getAttribute('data-mvt')).toBe('detail:taches-vide');
  });

  it('la ligne « +N tâches » porte une marque de mouvement', () => {
    const div = document.createElement('div');
    render(rendreTaches([tache('a')], 3, () => false), div);
    expect(div.querySelector('.ligne-tache.reste')?.getAttribute('data-mvt')).toBe('detail:taches-reste');
  });

  it('le bouton Retour vide le hash', () => {
    location.hash = '#taches';
    const div = document.createElement('div');
    render(rendreTaches([], 0, () => false), div);
    div.querySelector('.xl')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(location.hash).toBe('');
  });
});

// Budget de hauteur (585 px, marge nulle, écran en overflow: hidden SANS défilement) — même
// discipline que le test de budget de tests/maison.test.ts, adaptée : contrairement à
// TOUTE_LA_MAISON (tableau FIXE), une liste todo.* n'est pas bornée à la compilation. Ce test
// prouve donc deux choses : (1) le nombre maximal de lignes tient dans le budget, et (2) au-delà,
// `MAX_LIGNES_TACHES` lignes (la dernière étant le compte-rendu) restent le plafond, quel que soit
// le nombre RÉEL de tâches renvoyées par Home Assistant — jamais de dépassement silencieux.
describe('budget de hauteur de la vue Taches', () => {
  const ECRAN_PX = 585;
  const LIGNE_PX = 64;
  const GAP_PX = 8;
  // padding vertical .corps (24) + 2 intervalles de .corps.gap (16) + étiquette nette (~10) +
  // bouton Retour (62) — même composition que HORS_GRILLE_PX de tests/maison.test.ts (112).
  const HORS_LISTE_PX = 112;

  it(`MAX_LIGNES_TACHES (${MAX_LIGNES_TACHES}) lignes tiennent dans les 585 px, sans depassement silencieux`, () => {
    const rangees = MAX_LIGNES_TACHES;
    const hauteurListe = rangees * LIGNE_PX + (rangees - 1) * GAP_PX;
    const hauteurTotale = HORS_LISTE_PX + hauteurListe;
    expect(
      hauteurTotale,
      `${rangees} lignes de ${LIGNE_PX}px + ${rangees - 1} intervalles de ${GAP_PX}px = ` +
      `${hauteurListe}px, + ${HORS_LISTE_PX}px de reste d'écran = ${hauteurTotale}px : dépasse ` +
      `l'écran de ${ECRAN_PX}px. #app est en overflow: hidden SANS défilement — revois ` +
      `MAX_LIGNES_TACHES (cochage.ts) et .ligne-tache (base.css) ensemble avant d'en ajouter une.`,
    ).toBeLessThanOrEqual(ECRAN_PX);
  });

  it('une ligne de plus que MAX_LIGNES_TACHES ferait deborder : la preuve que le plafond n est pas arbitraire', () => {
    const rangees = MAX_LIGNES_TACHES + 1;
    const hauteurListe = rangees * LIGNE_PX + (rangees - 1) * GAP_PX;
    expect(HORS_LISTE_PX + hauteurListe).toBeGreaterThan(ECRAN_PX);
  });

  // Preuve de bout en bout (pas seulement arithmétique) : une liste RÉELLE de 50 tâches — bien
  // plus que ce qu'aucun tableau fixe de ce projet n'a jamais compté — ne rend jamais plus de
  // MAX_LIGNES_TACHES lignes au total (tâches + compte-rendu), quel que soit le total réel.
  it('une vraie liste de 50 taches ne rend jamais plus de lignes que le plafond calcule ci-dessus', () => {
    const cinquanteTaches = Array.from({ length: 50 }, (_, i) => tache(String(i)));
    // Reproduit exactement ce que fait `demarrage.ts` : `repartirTaches` puis `rendreTaches`.
    const { visibles, reste } = { visibles: cinquanteTaches.slice(0, MAX_LIGNES_TACHES - 1), reste: 50 - (MAX_LIGNES_TACHES - 1) };
    const div = document.createElement('div');
    render(rendreTaches(visibles, reste, () => false), div);
    expect(div.querySelectorAll('.ligne-tache')).toHaveLength(MAX_LIGNES_TACHES);
    expect(div.querySelector('.ligne-tache.reste')?.textContent).toContain(`+${reste} tâches`);
  });
});
