// @vitest-environment jsdom
//
// `rendreMaison` / `brancherAppuiMaison` (tâche 8) : la vue « Toute la maison » récupère ce que
// la refonte Lovelace précédente avait fait perdre — lumières des autres pièces, rideaux,
// serrure, aspirateur. Testé comme `rendreCorps`/`brancherAppui` (cf. `tests/corps.test.ts` et
// le test d'intégration d'appui dans `tests/demarrage.test.ts`) : rendu réel via `lit` + DOM.
//
// Tâche 8 bis : `rendreMaison` prend désormais la pièce en paramètre (arbitrage du coordinateur —
// le brief parlait d'une « vue Toute la maison de la cuisine » qui n'existait pas, une seule vue
// partagée par les 3 tablettes) et affiche `TOUTE_LA_MAISON` SUIVIE de `piece.extrasMaison`
// (vide partout sauf en cuisine, qui y place son accès au scanner). Les tests déjà présents utilisent
// `ECRANS.salon` (`extrasMaison: []`) pour rester inchangés en substance ; deux nouveautés :
// un test qui prouve que l'extra cuisine n'apparaît QUE pour la cuisine, et le budget de hauteur
// recalculé sur la pièce la plus chargée plutôt que sur `TOUTE_LA_MAISON` seule.
import { describe, it, expect, vi } from 'vitest';
import { render } from 'lit';
import { Etat } from '../src/etat';
import { ECRANS } from '../src/ecran';
import { rendreMaison, brancherAppuiMaison, TOUTE_LA_MAISON } from '../src/rendu/maison';

const ev = (id: string, etat: string, attributes: Record<string, unknown> = {}) =>
  ({ entity_id: id, state: etat, attributes });

describe('rendreMaison', () => {
  it('recupere les 4 familles perdues par la refonte : lumieres, rideaux, serrure, aspirateur', () => {
    // Preuve directe que TOUTE_LA_MAISON couvre bien les 4 familles citées par le brief, sans
    // dépendre d'une lecture manuelle de la liste à chaque revue.
    const domaines = new Set(TOUTE_LA_MAISON.map((b) => b.entite.split('.')[0]));
    expect(domaines).toEqual(new Set(['light', 'cover', 'climate', 'lock', 'vacuum']));
  });

  // 2026-08-29 : les deux tuiles de rideau appelaient `cover.toggle`, donc `open_cover`/
  // `close_cover` — que ces moteurs Zigbee n'exécutent pas jusqu'au bout (mesuré sur
  // l'installation : arrêt à mi-course). Elles passent aux mêmes scripts que l'accueil du salon,
  // seuls à utiliser `set_cover_position`. Le GLISSEMENT, lui, n'a jamais eu ce défaut : il
  // appelle déjà `cover.set_cover_position` (cf. `descripteurRideau`, `src/jauge.ts`) — c'est
  // uniquement l'appui simple qui était câblé sur la mauvaise voie.
  it('les deux rideaux basculent par leur script, jamais par cover.toggle', () => {
    const rideaux = TOUTE_LA_MAISON.filter((b) => b.entite.startsWith('cover.'));
    expect(rideaux.map((b) => b.libelle)).toEqual(['Rideau salon', 'Rideau cuisine']);
    for (const r of rideaux) expect(r.service).toEqual(['script', 'turn_on']);
    expect(rideaux[0].cible).toBe('script.toggle_rideau_salon');
    expect(rideaux[1].cible).toBe('script.toggle_rideau_cuisine');
    // L'entité AFFICHÉE reste le volet : c'est son état et sa position qu'on lit et qu'on règle
    // au doigt, jamais celui d'un script qui n'en a pas.
    expect(rideaux.map((b) => b.entite))
      .toEqual(['cover.rideau_salon', 'cover.rideau_cuisine']);
  });

  it('masque une entite indisponible, sans lever, et n affiche que les utilisables', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'on'));
    etat.appliquer(ev('cover.rideau_salon', 'closed'));
    // Le reste de TOUTE_LA_MAISON (cuisine, chambre, bureau, rideau cuisine, chauffage,
    // serrure, aspirateur) n'a reçu aucun état : `estUtilisable` doit les masquer.
    const div = document.createElement('div');
    expect(() => render(rendreMaison(etat, ECRANS.salon), div)).not.toThrow();
    const tuiles = Array.from(div.querySelectorAll('.tuile'));
    expect(tuiles).toHaveLength(2);
    expect(tuiles.map((t) => t.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Salon'), expect.stringContaining('Rideau salon')]),
    );
  });

  it('colore en actif seulement les entites dont l etat brut est on', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'on'));
    etat.appliquer(ev('light.lumiere_cuisine', 'off'));
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'locked'));   // jamais 'on', jamais actif
    const div = document.createElement('div');
    render(rendreMaison(etat, ECRANS.salon), div);
    const tuiles = Array.from(div.querySelectorAll('.tuile'));
    const salon = tuiles.find((t) => t.textContent?.includes('Salon'))!;
    const cuisine = tuiles.find((t) => t.textContent?.includes('Cuisine'))!;
    const serrure = tuiles.find((t) => t.textContent?.includes('Serrure'))!;
    expect(salon.className).toContain('actif');
    expect(cuisine.className).not.toContain('actif');
    expect(serrure.className).not.toContain('actif');
  });

  it('un appui sur une tuile appelle la fonction branchee par brancherAppuiMaison avec le bon bouton', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off'));
    const appui = vi.fn();
    brancherAppuiMaison(appui);
    const div = document.createElement('div');
    render(rendreMaison(etat, ECRANS.salon), div);

    div.querySelector('.tuile')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(appui).toHaveBeenCalledTimes(1);
    const [etatRecu, boutonRecu] = appui.mock.calls[0];
    expect(etatRecu).toBe(etat);
    expect(boutonRecu.entite).toBe('light.lumiere_salon');
  });

  it('le bouton Retour vide le hash (seul chemin de retour, aucun geste)', () => {
    const etat = new Etat();
    location.hash = '#maison';
    const div = document.createElement('div');
    render(rendreMaison(etat, ECRANS.salon), div);

    div.querySelector('.xl')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(location.hash).toBe('');
  });

  it('etiquette "Toute la maison" presente, sans donnee dupliquee avec la piece (pas de "Ambiance")', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreMaison(etat, ECRANS.salon), div);
    expect(div.querySelector('.etiquette')?.textContent).toBe('Toute la maison');
  });

  // Tâche 9, ronde de correction 1 (retour du coordinateur, IMPORTANT) : cette vue propose neuf
  // actions (lumières, rideaux, chauffage, serrure, aspirateur) — le pire des trois écrans pour
  // une panne silencieuse. Le refus des actions lui-même est prouvé dans `tests/interaction.test.ts`
  // (`estHorsLigne`) ; ce test-ci couvre le complément « signaler » propre à cette vue. Remplace le
  // texte plutôt que d'ajouter un bloc : le budget de hauteur de cette vue est déjà serré (marge de
  // 53 px pour la pièce la plus chargée, cf. le test de budget plus bas) — voir le commentaire de
  // tête de `rendu/maison.ts` pour le détail de cet arbitrage.
  it('horsLigne remplace l etiquette par "Hors ligne", coloree, sans ajouter de bloc', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreMaison(etat, ECRANS.salon, true), div);
    const etiquette = div.querySelector('.etiquette')!;
    expect(etiquette.textContent).toBe('Hors ligne');
    expect(etiquette.className).toContain('hl');
    // Un seul élément `.etiquette` : le signal remplace, n'ajoute jamais un bloc distinct qui
    // ferait grossir la vue.
    expect(div.querySelectorAll('.etiquette')).toHaveLength(1);
  });

  it('sans horsLigne (parametre omis), le comportement d origine est inchange : parametre retro-compatible', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreMaison(etat, ECRANS.salon), div);
    const etiquette = div.querySelector('.etiquette')!;
    expect(etiquette.textContent).toBe('Toute la maison');
    expect(etiquette.className).not.toContain('hl');
  });

  // Tâche 8 bis : preuve directe de l'arbitrage du coordinateur — le scanner est propre à la
  // cuisine, jamais visible sur les deux autres tablettes, alors que la même entité
  // (`sensor.home_stock_next_meal`) est utilisable partout dans ce test (rien ne le masquerait par
  // indisponibilité). Seule la pièce passée en paramètre décide.
  it('un extra propre a une piece (scanner cuisine) n apparait QUE pour cette piece', () => {
    const etat = new Etat();
    etat.appliquer(ev('sensor.home_stock_next_meal', 'Riz'));   // utilisable pour toutes les pièces

    const divCuisine = document.createElement('div');
    render(rendreMaison(etat, ECRANS.cuisine), divCuisine);
    const tuilesCuisine = Array.from(divCuisine.querySelectorAll('.tuile'));
    expect(tuilesCuisine.some((t) => t.textContent?.includes('Scanner'))).toBe(true);
    // La liste commune (9 entrées, toutes sans état ici) reste masquée : seul l'extra cuisine
    // a reçu un état utilisable.
    expect(tuilesCuisine).toHaveLength(1);

    const divSalon = document.createElement('div');
    render(rendreMaison(etat, ECRANS.salon), divSalon);
    expect(Array.from(divSalon.querySelectorAll('.tuile')).some((t) => t.textContent?.includes('Scanner')))
      .toBe(false);

    const divBureau = document.createElement('div');
    render(rendreMaison(etat, ECRANS.bureau), divBureau);
    expect(Array.from(divBureau.querySelectorAll('.tuile')).some((t) => t.textContent?.includes('Scanner')))
      .toBe(false);
  });

  // Ronde de correction 1 (MINEUR mais piégeux, relecteur, tâche 8) : jsdom ne calcule aucune
  // vraie mise en page (`getBoundingClientRect` y est toujours nul), donc ce budget ne peut être
  // vérifié qu'arithmétiquement, avec les mêmes constantes que `src/styles/base.css` — pas
  // mesuré. Les 4 constantes ci-dessous reprennent : `.tuile { height: 76px }`, `.grille { gap:
  // 10px }` (2 colonnes), `.xl { height: 62px }` (bouton Retour). `HORS_GRILLE_PX` est la somme
  // du reste de `.corps` sur cette vue (pas de bandeau ici) : padding vertical 24 (`.corps {
  // padding: 12px 16px }`) + 2 inter-blocs à 8px (`.corps { gap: 8px }`, 3 enfants :
  // étiquette/grille/retour) + l'étiquette elle-même (~10px net, `.etiquette` a `margin-bottom:
  // -4px`) + le bouton Retour (62px) = 112px — cf. rapport de tâche 8 pour le détail. #app est en
  // `overflow: hidden` sans défilement (règle de layout des tablettes) : un dépassement de ce
  // budget est SILENCIEUX, la dernière rangée de tuiles est simplement coupée, sans rien pour
  // l'annoncer sur la tablette.
  //
  // Tâche 8 bis : chaque pièce peut désormais ajouter ses propres entrées (`extrasMaison`), donc
  // le total affiché n'est plus le même pour toutes les tablettes — c'est la pièce la PLUS
  // chargée (actuellement la cuisine, 9 + 1) qui doit tenir dans le budget, pas `TOUTE_LA_MAISON`
  // seule (qui resterait toujours à 9, silencieusement à côté de la plaque si un extra futur y
  // était ajouté sans mettre ce test à jour).
  const ECRAN_PX = 585;
  const TUILE_PX = 76;
  const GAP_PX = 10;
  const HORS_GRILLE_PX = 112;
  const COLONNES = 2;

  it('la piece la plus chargee (TOUTE_LA_MAISON + extrasMaison) tient dans les 585 px, sans depassement silencieux', () => {
    const parPiece = Object.entries(ECRANS).map(
      ([id, piece]) => [id, TOUTE_LA_MAISON.length + piece.extrasMaison.length] as const,
    );
    const [piecePlusChargee, total] = parPiece.reduce((a, b) => (b[1] > a[1] ? b : a));
    const rangees = Math.ceil(total / COLONNES);
    const hauteurGrille = rangees * TUILE_PX + (rangees - 1) * GAP_PX;
    const hauteurTotale = HORS_GRILLE_PX + hauteurGrille;

    expect(
      hauteurTotale,
      `${piecePlusChargee} compte ${total} entrées (TOUTE_LA_MAISON: ${TOUTE_LA_MAISON.length} + ` +
      `extrasMaison: ${total - TOUTE_LA_MAISON.length}) sur ${rangees} rangées de ${TUILE_PX}px + ` +
      `${rangees - 1} intervalles de ${GAP_PX}px = ${hauteurGrille}px de grille, + ${HORS_GRILLE_PX}px ` +
      `de reste d'écran = ${hauteurTotale}px) : dépasse l'écran de ${ECRAN_PX}px. #app est en ` +
      `overflow: hidden SANS défilement — ce dépassement serait silencieux sur la tablette ` +
      `(dernière rangée de tuiles coupée, sans avertissement). Retire une entrée de TOUTE_LA_MAISON ` +
      `ou d'un extrasMaison, ou revois le budget de hauteur (rapport de tâche 8) avant d'en ajouter une.`,
    ).toBeLessThanOrEqual(ECRAN_PX);
  });
});

// Tâche 13 : jauges à glissement sur la vue « Toute la maison ». Rendu seulement (aucun événement
// pointeur ici, cf. `tests/geste.test.ts`) : la classe `jauge` apparaît sur les tuiles qui la
// supportent (lumières, rideau à position lisible) et jamais sur celles qui ne la supportent pas
// (serrure, aspirateur), même toutes deux `estUtilisable`.
describe('jauges a glissement — rendu vue Toute la maison (tache 13)', () => {
  it('les tuiles lumiere et rideau portent la classe jauge ; serrure et aspirateur jamais', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'on', { brightness: 51, supported_color_modes: ['hs'] }));
    etat.appliquer(ev('cover.rideau_salon', 'open', { current_position: 87, supported_features: 15 }));
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'locked'));
    etat.appliquer(ev('vacuum.aspirateur_cuisine', 'docked'));
    const div = document.createElement('div');
    render(rendreMaison(etat, ECRANS.salon), div);
    const tuiles = Array.from(div.querySelectorAll('.tuile'));

    const salon = tuiles.find((t) => t.textContent?.includes('Salon'))!;
    expect(salon.className).toContain('jauge');
    // 51/255 = 20 % ; rapporté à la plage réglable 1–100 → (20−1)/99
    expect(salon.getAttribute('style')).toContain(`--jauge:${(20 - 1) / 99}`);

    const rideau = tuiles.find((t) => t.textContent?.includes('Rideau salon'))!;
    expect(rideau.className).toContain('jauge');
    expect(rideau.getAttribute('style')).toContain('--jauge:0.87');

    const serrure = tuiles.find((t) => t.textContent?.includes('Serrure'))!;
    expect(serrure.className).not.toContain('jauge');

    const aspirateur = tuiles.find((t) => t.textContent?.includes('Aspirateur'))!;
    expect(aspirateur.className).not.toContain('jauge');
  });
});

// Tâche 12, arbitrage du propriétaire (2026-08-03) : la tuile commune « Aspirateur » (nettoyage
// complet du RDC, `vacuum.start`) devient LOCALE à la pièce — en cuisine elle appelle le script du
// segment cuisine (`script.aspirateur_cuisine`, segment 19) au lieu du nettoyage complet, jamais
// une tuile de plus (le budget de 585px de cette vue était déjà plein à 10/10, cf. rapport de
// tâche 12). Salon et bureau ne déclarent pas `aspirateurMaison` (`ecran.ts`) : ils gardent
// l'entrée commune inchangée.
describe('substitution de la tuile aspirateur par pièce (tâche 12)', () => {
  it('en cuisine, la tuile aspirateur appelle le script du segment cuisine, jamais vacuum.start', () => {
    const etat = new Etat();
    etat.appliquer(ev('vacuum.aspirateur_cuisine', 'docked'));
    const appui = vi.fn();
    brancherAppuiMaison(appui);
    const div = document.createElement('div');
    render(rendreMaison(etat, ECRANS.cuisine), div);

    const aspirateur = Array.from(div.querySelectorAll('.tuile'))
      .find((t) => t.textContent?.includes('Aspirer'))!;
    expect(aspirateur).toBeTruthy();
    aspirateur.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(appui).toHaveBeenCalledTimes(1);
    const [, bouton] = appui.mock.calls[0];
    expect(bouton.entite).toBe('vacuum.aspirateur_cuisine');
    expect(bouton.service).toEqual(['script', 'turn_on']);
    expect(bouton.cible).toBe('script.aspirateur_cuisine');
  });

  it('au salon et au bureau, la tuile aspirateur reste vacuum.start, jamais le script cuisine', () => {
    for (const piece of [ECRANS.salon, ECRANS.bureau]) {
      const etat = new Etat();
      etat.appliquer(ev('vacuum.aspirateur_cuisine', 'docked'));
      const appui = vi.fn();
      brancherAppuiMaison(appui);
      const div = document.createElement('div');
      render(rendreMaison(etat, piece), div);

      const aspirateur = Array.from(div.querySelectorAll('.tuile'))
        .find((t) => t.textContent?.includes('Aspirateur'))!;
      expect(aspirateur).toBeTruthy();
      aspirateur.dispatchEvent(new Event('pointerdown', { bubbles: true }));

      const [, bouton] = appui.mock.calls[0];
      expect(bouton.service).toEqual(['vacuum', 'start']);
      expect(bouton.cible).toBeUndefined();
    }
  });
});
