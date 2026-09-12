// @vitest-environment jsdom
//
// Tâche 9 bis : la voiture prend le bloc central du salon, à la place des six prochaines heures
// (demande du propriétaire, 2026-08-03). Même patron que `tests/carte-minuteur.test.ts` : purs
// tests de rendu (jsdom), plus un verrou CSS lu directement dans `base.css` pour le retour au
// contact du bouton de clim.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'lit';
import { Etat } from '../src/etat';
import { rendreVoiture, brancherVoiture } from '../src/rendu/voiture';
import type { Voiture } from '../src/ecran';

const V: Voiture = {
  batterie: 'sensor.peugeot_e208_batterie_niveau',
  autonomie: 'sensor.peugeot_e208_batterie_autonomie',
  branchee: 'binary_sensor.peugeot_e208_batterie_branchee',
  enCharge: 'binary_sensor.peugeot_e208_batterie_en_charge',
  clim: 'binary_sensor.peugeot_e208_pre_conditionnement',
  demarrerClim: 'button.peugeot_e208_demarrer_pre_conditionnement',
  arreterClim: 'button.peugeot_e208_arreter_pre_conditionnement',
};

function etatAvec(entrees: [string, string][]): Etat {
  const etat = new Etat();
  for (const [id, valeur] of entrees) etat.appliquer({ entity_id: id, state: valeur, attributes: {} });
  return etat;
}

function complet(surcharges: Partial<Record<keyof Voiture, string>> = {}): Etat {
  return etatAvec([
    [V.batterie, surcharges.batterie ?? '21'],
    [V.autonomie, surcharges.autonomie ?? '52'],
    [V.branchee, surcharges.branchee ?? 'off'],
    [V.enCharge, surcharges.enCharge ?? 'off'],
    [V.clim, surcharges.clim ?? 'off'],
  ]);
}

function rendre(t: any): HTMLElement {
  const el = document.createElement('div');
  render(t, el);
  return el;
}

let clim: ReturnType<typeof vi.fn>;
beforeEach(() => { clim = vi.fn(); brancherVoiture({ clim }); });

describe('rendreVoiture — ce qu\'elle affiche', () => {
  it('montre le niveau et l\'autonomie', () => {
    const el = rendre(rendreVoiture(complet(), V, null));
    expect(el.querySelector('.vt-niveau')!.textContent).toContain('21');
    expect(el.querySelector('.vt-autonomie')!.textContent).toContain('52');
  });

  it('dit « Débranchée » quand rien n\'est branché', () => {
    expect(rendre(rendreVoiture(complet(), V, null)).querySelector('.vt-etat')!.textContent)
      .toContain('Débranchée');
  });

  it('dit « Branchée » quand elle l\'est sans charger', () => {
    const el = rendre(rendreVoiture(complet({ branchee: 'on' }), V, null));
    expect(el.querySelector('.vt-etat')!.textContent).toContain('Branchée');
  });

  it('dit « En charge » — la charge prime sur le simple branchement', () => {
    const el = rendre(rendreVoiture(complet({ branchee: 'on', enCharge: 'on' }), V, null));
    expect(el.querySelector('.vt-etat')!.textContent).toContain('En charge');
  });

  it('dit « Clim en marche » — la clim prime sur tout le reste', () => {
    const el = rendre(rendreVoiture(complet({ branchee: 'on', enCharge: 'on', clim: 'on' }), V, null));
    expect(el.querySelector('.vt-etat')!.textContent).toContain('Clim en marche');
  });

  it('n\'invente jamais un chiffre absent', () => {
    const el = rendre(rendreVoiture(etatAvec([[V.clim, 'off']]), V, null));
    expect(el.querySelector('.vt-niveau')).toBeNull();
    expect(el.querySelector('.vt-autonomie')).toBeNull();
    // Le bloc reste utilisable : le bouton de clim, lui, ne dépend pas de la batterie.
    expect(el.querySelector('.vt-bouton')).not.toBeNull();
  });

  it('reste utilisable même quand TOUTE la voiture est injoignable (aucune entité utilisable)', () => {
    // Aucune entité poussée du tout : `estUtilisable` renvoie faux partout, exactement le cas
    // d'une voiture hors ligne / jamais encore vue par cet écran.
    const el = rendre(rendreVoiture(new Etat(), V, null));
    expect(el.querySelector('.vt-niveau')).toBeNull();
    expect(el.querySelector('.vt-autonomie')).toBeNull();
    expect(el.querySelector('.vt-etat')!.textContent).toContain('Débranchée');
    expect(el.querySelector('.vt-bouton')).not.toBeNull();
    expect(el.querySelector('.vt-bouton')!.textContent).toContain('Lancer la clim');
  });
});

// Tâche 7 (mouvement, 2026-08-22) : couverture — le bloc entier ET ses deux chiffres portent
// chacun leur marque, pour que le moteur (`src/mouvement/moteur.ts`) anime leur apparition/
// disparition plutôt que de les faire sauter sec.
describe('rendreVoiture — marques de mouvement', () => {
  it('le bloc voiture porte une marque de mouvement', () => {
    const el = rendre(rendreVoiture(complet(), V, null));
    expect(el.querySelector('.voiture')?.getAttribute('data-mvt')).toBe('bloc:voiture');
  });

  it('le niveau et l\'autonomie portent chacun la leur', () => {
    const el = rendre(rendreVoiture(complet(), V, null));
    expect(el.querySelector('.vt-niveau')?.getAttribute('data-mvt')).toBe('detail:vt-niveau');
    expect(el.querySelector('.vt-autonomie')?.getAttribute('data-mvt')).toBe('detail:vt-autonomie');
  });
});

describe('rendreVoiture — le bouton de clim', () => {
  it('propose de lancer quand la clim est à l\'arrêt', () => {
    const el = rendre(rendreVoiture(complet(), V, null));
    expect(el.querySelector('.vt-bouton')!.textContent).toContain('Lancer la clim');
    el.querySelector<HTMLElement>('.vt-bouton')!.dispatchEvent(new Event('pointerdown'));
    expect(clim).toHaveBeenCalledWith(true);
  });

  it('propose d\'arrêter quand elle tourne', () => {
    const el = rendre(rendreVoiture(complet({ clim: 'on' }), V, null));
    expect(el.querySelector('.vt-bouton')!.textContent).toContain('Arrêter la clim');
    el.querySelector<HTMLElement>('.vt-bouton')!.dispatchEvent(new Event('pointerdown'));
    expect(clim).toHaveBeenCalledWith(false);
  });

  it('affiche un retour immédiat pendant que la voiture ne répond pas encore', () => {
    const el = rendre(rendreVoiture(complet(), V, 'demarrage'));
    expect(el.querySelector('.vt-bouton')!.textContent).toContain('Démarrage…');
    expect(rendre(rendreVoiture(complet({ clim: 'on' }), V, 'arret'))
      .querySelector('.vt-bouton')!.textContent).toContain('Arrêt…');
  });

  it('n\'accepte pas un second appui pendant que le premier est en vol', () => {
    const el = rendre(rendreVoiture(complet(), V, 'demarrage'));
    el.querySelector<HTMLElement>('.vt-bouton')!.dispatchEvent(new Event('pointerdown'));
    expect(clim).not.toHaveBeenCalled();
  });
});

// Arbitrage du propriétaire (cf. CLAUDE.md wallpanel) : la cible tactile de 62px n'a aucune
// exception, et un élément qui ne déclenche rien ne doit donner AUCUN retour au doigt. `.vt-bouton`
// pendant `.vt-attente` est exactement ce cas : même patron que `.ambiance.inactif`
// (`tests/carte-minuteur.test.ts`), vérifié en lisant directement `base.css` puisque jsdom ne
// déclenche jamais réellement `:active`.
describe('.vt-bouton — pas de retour au contact pendant l\'attente (.vt-attente désarme, comme .ambiance.inactif)', () => {
  function regleCss(selecteurEchappe: string): string {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    const m = css.match(new RegExp(`${selecteurEchappe}\\s*\\{([^}]*)\\}`));
    if (!m) throw new Error(`règle ${selecteurEchappe} introuvable dans base.css`);
    return m[1];
  }

  it('rejoint la couche `position: relative` du groupe .mn-bouton/.mn-nouveau/.mn-etiquette', () => {
    // `.vt-bouton` en TÊTE de liste, jamais en queue : c'est aussi ce que vérifie la contre-épreuve
    // ci-dessous (le verrou préexistant sur `.mn-bouton, .mn-nouveau, .mn-etiquette` continue de
    // matcher tel quel, cf. `tests/carte-minuteur.test.ts`).
    expect(() => regleCss('\\.vt-bouton,\\s*\\.mn-bouton,\\s*\\.mn-nouveau,\\s*\\.mn-etiquette'))
      .not.toThrow();
  });

  it('rejoint la couche `::after` (overlay masqué au repos) du groupe', () => {
    const regle = regleCss(
      '\\.vt-bouton::after,\\s*\\.mn-bouton::after,\\s*\\.mn-nouveau::after,\\s*\\.mn-etiquette::after');
    expect(regle.match(/opacity:\s*([^;]+);/)?.[1]?.trim()).toBe('0');
  });

  it('rejoint la couche `:active::after` (opacité au contact) du groupe', () => {
    const regle = regleCss(
      '\\.vt-bouton:active::after,\\s*\\.mn-bouton:active::after,\\s*\\.mn-nouveau:active::after,'
      + '\\s*\\.mn-etiquette:active::after');
    expect(regle.match(/opacity:\s*([^;]+);/)?.[1]?.trim()).toBe('.1');
  });

  it('ne casse pas le verrou préexistant sur .mn-bouton/.mn-nouveau/.mn-etiquette (contre-épreuve)', () => {
    // Ce test n'appartient normalement qu'à `tests/carte-minuteur.test.ts`, mais le rejouer ici
    // rend explicite la contrainte d'ordre : `.vt-bouton` devait rejoindre le groupe SANS déplacer
    // la séquence déjà verrouillée ailleurs.
    expect(() => regleCss('\\.mn-bouton,\\s*\\.mn-nouveau,\\s*\\.mn-etiquette')).not.toThrow();
  });

  it('.vt-attente supprime la génération de la couche ::after, pas seulement son opacité', () => {
    const regle = regleCss('\\.vt-bouton\\.vt-attente::after');
    expect(regle.match(/content:\s*([^;]+);/)?.[1]?.trim()).toBe('none');
  });
});
