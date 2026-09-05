// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, type TemplateResult } from 'lit';
import { lireMarques, positionReelle } from '../src/mouvement/marques';
import { comparer } from '../src/mouvement/diff';
import { Etat } from '../src/etat';
import { rendreRepasSuivant, rendreEntretien, rendreProchainRdv } from '../src/rendu/defaut';
import { rendreMenage, rendreAeration } from '../src/rendu/modes';
import { rendreBandeau } from '../src/rendu/bandeau';
import { rendreCarteMedia } from '../src/rendu/media';
import type { SourceResolue } from '../src/media';

// `moteurDeTest` (plus bas) attache sa `racine` à `document.body` — nécessaire pour que le double
// de rendu se comporte comme un vrai `#app`. Sans ce nettoyage, les `racine` de tous les tests
// précédents s'empilent dans `document.body` pour la durée du FICHIER (jsdom garde le même
// document entre les `it()`) : plusieurs `#mvt-fantomes` dupliqués finissent par coexister, et le
// sélecteur d'ID scoped de jsdom (`racine.querySelector('#mvt-fantomes')`) peut alors renvoyer
// `null` pour la bonne racine parce qu'un ID dupliqué d'un test antérieur le fait échouer — un
// faux négatif observé en pratique dès le troisième test utilisant `moteurDeTest` dans ce fichier.
afterEach(() => { document.body.innerHTML = ''; });

/** Fabrique un DOM marqué. `positions` donne la position de chaque clé — jsdom ne calcule aucune
 *  mise en page, `offsetLeft`/`offsetTop` y valent 0 partout : la position est donc INJECTÉE,
 *  comme `raf` et `horloge` le sont déjà dans `src/mouvement.ts`. */
function monter(marques: string[], positions: Record<string, [number, number]> = {}) {
  const racine = document.createElement('div');
  for (const m of marques) {
    const [decl, etat] = m.split('=');
    const el = document.createElement('div');
    el.dataset.mvt = decl;
    if (etat !== undefined) el.dataset.mvtEtat = etat;
    racine.appendChild(el);
  }
  const positionDe = (el: HTMLElement) =>
    (positions[el.dataset.mvt!] ?? [0, 0]) as readonly [number, number];
  return { racine, positionDe };
}

describe('lireMarques', () => {
  it('indexe par la déclaration complète, et retient rôle, clé, état et rang', () => {
    const { racine, positionDe } = monter(
      ['tuile:light.salon=actif', 'tuile:cover.rideau'], { 'tuile:light.salon': [0, 100] });
    const m = lireMarques(racine, positionDe);
    expect([...m.keys()]).toEqual(['tuile:light.salon', 'tuile:cover.rideau']);
    expect(m.get('tuile:light.salon')).toMatchObject({
      role: 'tuile', cle: 'light.salon', etat: 'actif', position: [0, 100], rang: 0 });
    expect(m.get('tuile:cover.rideau')).toMatchObject({ etat: null, rang: 1 });
  });

  it('ignore un rôle inconnu au lieu de lever — une faute de frappe ne tue pas l\'écran', () => {
    const { racine, positionDe } = monter(['turbo:x', 'tuile:ok']);
    expect([...lireMarques(racine, positionDe).keys()]).toEqual(['tuile:ok']);
  });

  it('ignore une déclaration sans clé', () => {
    const { racine, positionDe } = monter(['tuile:', 'tuile']);
    expect(lireMarques(racine, positionDe).size).toBe(0);
  });

});

// C1 (revue finale) — jsdom ne calcule aucune mise en page : `offsetLeft`/`offsetTop`/
// `offsetParent` y valent respectivement 0/0/`null` sur tout élément, donc la chaîne de
// `positionReelle` ne peut être exercée qu'en la simulant à la main (`Object.defineProperty`, les
// trois propriétés étant des accesseurs en lecture seule sur `HTMLElement.prototype`). Ce test
// reproduit la hiérarchie fautive de la revue : des marques posées SOUS des conteneurs
// positionnés (`.media-texte`/`.media-rangee`, `position: relative`) plutôt qu'en enfant direct de
// `racine`, avec un `offsetParent` DISTINCT à chaque étage.
describe('positionReelle (C1 — repère de racine, pas d\'offsetParent)', () => {
  it('remonte la chaîne des offsetParent en accumulant offsetLeft/offsetTop jusqu\'à racine', () => {
    const racine = document.createElement('div');
    const boiteA = document.createElement('div');       // ex. `.media`, position: relative
    const boiteB = document.createElement('div');       // ex. `.media-rangee`, position: relative
    const cible = document.createElement('div');
    cible.dataset.mvt = 'detail:media-sous';
    racine.appendChild(boiteA);
    boiteA.appendChild(boiteB);
    boiteB.appendChild(cible);

    const definir = (el: HTMLElement, left: number, top: number, parent: HTMLElement | null) => {
      Object.defineProperty(el, 'offsetLeft', { value: left, configurable: true });
      Object.defineProperty(el, 'offsetTop', { value: top, configurable: true });
      Object.defineProperty(el, 'offsetParent', { value: parent, configurable: true });
    };
    // Chaîne à TROIS offsetParent distincts, aucun d'eux n'étant `racine` sauf le dernier —
    // exactement la forme qui faisait échouer une simple lecture de `el.offsetLeft` : elle
    // n'aurait rendu que (2, 3), la position de `cible` dans SON SEUL offsetParent (`boiteB`).
    definir(boiteA, 10, 20, racine);
    definir(boiteB, 5, 6, boiteA);
    definir(cible, 2, 3, boiteB);

    const m = lireMarques(racine, positionReelle);
    expect(m.get('detail:media-sous')!.position).toEqual([17, 29]);
  });

  it('un relevé "avant" et un relevé "après" dans le même repère gardent un delta de déplacement juste', () => {
    // Le FLIP d'un déplacement (`comparer`, `diff.ts`) est un delta entre deux positions : il est
    // insensible à un décalage CONSTANT entre les deux relevés, mais seulement si les deux
    // relevés partagent le même repère. Ici la marque bouge de conteneur (boiteA → boiteB, deux
    // offsetParent distincts) entre les deux relevés : sans conversion au repère de `racine`, le
    // delta observé mélangerait un vrai déplacement et un simple changement d'origine.
    const racine = document.createElement('div');
    const boiteA = document.createElement('div');
    const boiteB = document.createElement('div');
    const cible = document.createElement('div');
    cible.dataset.mvt = 'tuile:x';
    racine.appendChild(boiteA);
    racine.appendChild(boiteB);
    boiteA.appendChild(cible);

    const definir = (el: HTMLElement, left: number, top: number, parent: HTMLElement | null) => {
      Object.defineProperty(el, 'offsetLeft', { value: left, configurable: true });
      Object.defineProperty(el, 'offsetTop', { value: top, configurable: true });
      Object.defineProperty(el, 'offsetParent', { value: parent, configurable: true });
    };
    definir(boiteA, 100, 0, racine);
    definir(boiteB, 100, 200, racine);
    definir(cible, 0, 0, boiteA);
    const avant = lireMarques(racine, positionReelle);
    expect(avant.get('tuile:x')!.position).toEqual([100, 0]);

    boiteA.removeChild(cible);
    boiteB.appendChild(cible);
    definir(cible, 0, 0, boiteB);
    const apres = lireMarques(racine, positionReelle);
    expect(apres.get('tuile:x')!.position).toEqual([100, 200]);

    // Le vrai déplacement (dans le repère de `racine`) est de 200 px verticaux — pas la
    // différence entre deux origines locales incohérentes entre elles.
    const dy = apres.get('tuile:x')!.position[1] - avant.get('tuile:x')!.position[1];
    expect(dy).toBe(200);
  });
});

describe('comparer', () => {
  const marque = (decl: string, position: [number, number] = [0, 0], etat: string | null = null) => {
    const [role, cle] = decl.split(':');
    return { role, cle, etat, el: document.createElement('div'), position, rang: 0 } as any;
  };
  const carte = (...m: any[]) => new Map(m.map((x) => [`${x.role}:${x.cle}`, x]));

  it('rend un déplacement quand la position a changé', () => {
    const v = comparer(carte(marque('tuile:a', [0, 0])), carte(marque('tuile:a', [0, 64])));
    expect(v).toEqual([{ type: 'deplacement', marque: expect.anything(), depuis: [0, 0] }]);
  });

  it('ne rend rien quand rien n\'a bougé', () => {
    expect(comparer(carte(marque('tuile:a')), carte(marque('tuile:a')))).toEqual([]);
  });

  it('rend une entrée pour une clé nouvelle et une sortie pour une clé disparue', () => {
    const v = comparer(carte(marque('tuile:a')), carte(marque('tuile:b')));
    expect(v.map((x) => x.type).sort()).toEqual(['entree', 'sortie']);
  });

  it('rend une mutation quand l\'état change à position égale', () => {
    const v = comparer(carte(marque('tuile:a', [0, 0], null)),
                       carte(marque('tuile:a', [0, 0], 'actif')));
    expect(v).toEqual([{ type: 'mutation', marque: expect.anything(), avant: null }]);
  });

  it('rend déplacement ET mutation quand les deux changent', () => {
    const v = comparer(carte(marque('tuile:a', [0, 0], null)),
                       carte(marque('tuile:a', [0, 64], 'actif')));
    expect(v.map((x) => x.type).sort()).toEqual(['deplacement', 'mutation']);
  });

  // La règle qui évite le feu d'artifice : un écran qui arrive est UN objet, pas quinze.
  it('une traversée de vue CONFISQUE la peinture — aucun verdict interne', () => {
    const v = comparer(
      carte(marque('vue:accueil'), marque('tuile:a', [0, 0])),
      carte(marque('vue:maison'), marque('tuile:b', [0, 99])));
    expect(v).toEqual([{ type: 'traversee', sortante: expect.anything(),
                         entrante: expect.anything(), sens: 'droite' }]);
  });

  it('revenir à l\'accueil pousse dans l\'autre sens', () => {
    const v = comparer(carte(marque('vue:maison')), carte(marque('vue:accueil')));
    expect((v[0] as any).sens).toBe('gauche');
  });

  // L'écran de nuit est hors traversée : à 23 h c'est le fondu de palette qui porte le changement
  // (tâche 7). Deux mouvements simultanés sur le plus gros changement de la journée feraient
  // désordre — et « rien ne bouge dans le noir » s'applique d'abord ici.
  it('n\'anime aucune traversée vers ou depuis l\'écran de nuit', () => {
    expect(comparer(carte(marque('vue:accueil')), carte(marque('vue:nuit')))).toEqual([]);
    expect(comparer(carte(marque('vue:nuit')), carte(marque('vue:accueil')))).toEqual([]);
  });

  it('un enfant marqué ne sort pas quand son parent marqué sort — un geste, un clone', () => {
    const racine = document.createElement('div');
    const bloc = document.createElement('div');
    bloc.dataset.mvt = 'bloc:media';
    const sous = document.createElement('div');
    sous.dataset.mvt = 'detail:media-sous';
    bloc.appendChild(sous);
    racine.appendChild(bloc);
    const avant = lireMarques(racine, () => [0, 0], () => [10, 10]);

    const apres = lireMarques(document.createElement('div'), () => [0, 0], () => [10, 10]);
    const v = comparer(avant, apres);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ type: 'sortie', marque: { cle: 'media' } });
  });

  it('la même règle vaut à l’entrée', () => {
    const vide = lireMarques(document.createElement('div'), () => [0, 0], () => [10, 10]);
    const racine = document.createElement('div');
    const bloc = document.createElement('div');
    bloc.dataset.mvt = 'bloc:media';
    const sous = document.createElement('div');
    sous.dataset.mvt = 'detail:media-sous';
    bloc.appendChild(sous);
    racine.appendChild(bloc);
    const apres = lireMarques(racine, () => [0, 0], () => [10, 10]);
    expect(comparer(vide, apres)).toHaveLength(1);
  });

  // Round de correction 1 (revue task 5) : ce test s'appelait « mais un déplacement d'enfant reste
  // joué sous un parent qui ne fait que bouger », mais n'exerçait aucun déplacement (positions à
  // [0, 0] aux deux relevés) — seule la mutation y était réellement vérifiée. Renommé pour dire ce
  // qu'il fait ; le vrai cas de déplacement est le test suivant.
  it('mais une mutation d’enfant reste jouée sous un ancêtre marqué stable', () => {
    const racine = document.createElement('div');
    const bloc = document.createElement('div');
    bloc.dataset.mvt = 'bloc:media';
    const ch = document.createElement('div');
    ch.dataset.mvt = 'chiffre:h';
    ch.dataset.mvtEtat = '9';
    bloc.appendChild(ch);
    racine.appendChild(bloc);
    const avant = lireMarques(racine, () => [0, 0], () => [10, 10]);
    ch.dataset.mvtEtat = '10';
    const apres = lireMarques(racine, () => [0, 0], () => [10, 10]);
    expect(comparer(avant, apres)).toEqual([
      expect.objectContaining({ type: 'mutation', avant: '9' }),
    ]);
  });

  // Le vrai pendant « déplacement » du test précédent : ici l'enfant marqué bouge RÉELLEMENT
  // (positions distinctes entre les deux relevés) sous un ancêtre marqué qui reste présent aux
  // deux relevés (ni entrée ni sortie pour lui). C'est le scénario que le commentaire de
  // `sousUnAncetre` illustre — « un chiffre qui roule dans un bloc qui se déplace, ce sont bien
  // deux gestes distincts » —, jusqu'ici jamais réellement exercé.
  it('et un déplacement d’enfant reste joué sous un ancêtre marqué qui reste présent', () => {
    const racine = document.createElement('div');
    const bloc = document.createElement('div');
    bloc.dataset.mvt = 'bloc:media';
    const ch = document.createElement('div');
    ch.dataset.mvt = 'chiffre:h';
    bloc.appendChild(ch);
    racine.appendChild(bloc);
    const avant = lireMarques(racine, () => [0, 0], () => [10, 10]);
    const apres = lireMarques(racine, (el) => (el === ch ? [40, 0] : [0, 0]), () => [10, 10]);
    expect(comparer(avant, apres)).toEqual([
      expect.objectContaining({ type: 'deplacement', depuis: [0, 0] }),
    ]);
  });

  it('une sortie et une entrée de bloc au même rang deviennent UN croisement', () => {
    const racine = document.createElement('div');
    const a = document.createElement('div');
    a.dataset.mvt = 'bloc:repas';
    racine.appendChild(a);
    const avant = lireMarques(racine, () => [0, 40], () => [300, 90]);

    const racine2 = document.createElement('div');
    const b = document.createElement('div');
    b.dataset.mvt = 'bloc:voiture';
    racine2.appendChild(b);
    const apres = lireMarques(racine2, () => [0, 40], () => [300, 90]);

    const v = comparer(avant, apres);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      type: 'croisement',
      sortante: { cle: 'repas' },
      entrante: { cle: 'voiture' },
    });
  });

  it('deux blocs à des places différentes restent une sortie et une entrée', () => {
    const racine = document.createElement('div');
    const a = document.createElement('div');
    a.dataset.mvt = 'bloc:alerte';
    racine.appendChild(a);
    const avant = lireMarques(racine, () => [0, 0], () => [300, 90]);

    const racine2 = document.createElement('div');
    const b = document.createElement('div');
    b.dataset.mvt = 'bloc:voiture';
    racine2.appendChild(b);
    const apres = lireMarques(racine2, () => [0, 300], () => [300, 90]);

    const types = comparer(avant, apres).map((x) => x.type).sort();
    expect(types).toEqual(['entree', 'sortie']);
  });

  // Piège d'appariement (revue tâche 6) : le code retire des éléments de `verdicts` avec
  // `splice(verdicts.indexOf(...), 1)` PENDANT qu'il itère sur `sorties`, une copie filtrée de ce
  // même tableau — les indices bougent donc à chaque retrait. Deux blocs qui se croisent DANS LA
  // MÊME PASSE, à deux places distinctes, doivent produire deux croisements bien appariés
  // (le repas AVEC la voiture, l'agenda AVEC l'alerte) et jamais un mélange (le repas avec
  // l'alerte) ni un verdict perdu en route.
  it('deux croisements de bloc dans la même passe restent appariés chacun à sa place', () => {
    const racine = document.createElement('div');
    const repas = document.createElement('div');
    repas.dataset.mvt = 'bloc:repas';
    const agenda = document.createElement('div');
    agenda.dataset.mvt = 'bloc:agenda';
    racine.appendChild(repas);
    racine.appendChild(agenda);
    const avant = lireMarques(racine,
      (el) => (el === repas ? [0, 40] : [0, 200]), () => [300, 90]);

    const racine2 = document.createElement('div');
    const voiture = document.createElement('div');
    voiture.dataset.mvt = 'bloc:voiture';
    const alerte = document.createElement('div');
    alerte.dataset.mvt = 'bloc:alerte';
    racine2.appendChild(voiture);
    racine2.appendChild(alerte);
    const apres = lireMarques(racine2,
      (el) => (el === voiture ? [0, 40] : [0, 200]), () => [300, 90]);

    const v = comparer(avant, apres);
    expect(v).toHaveLength(2);
    const parCle = (cle: string) => v.find((x) => x.type === 'croisement'
      && (x as any).entrante.cle === cle) as any;
    expect(parCle('voiture')).toMatchObject({ type: 'croisement', sortante: { cle: 'repas' } });
    expect(parCle('alerte')).toMatchObject({ type: 'croisement', sortante: { cle: 'agenda' } });
  });

  // Piège d'appariement, second volet : deux sorties qui partagent la MÊME position (un bloc qui
  // se replie exactement là où un autre vient de disparaître, avant que l'entrée ne s'y pose) ne
  // doivent jamais être appariées à la même entrée. `verdicts.find` s'arrête au premier candidat
  // ET le retire aussitôt (`splice`) : la seconde sortie ne retrouve donc plus rien à sa place et
  // retombe sur un couple sortie + entrée ordinaire — jamais un croisement fantôme partagé.
  it('deux sorties à la même place ne se disputent jamais la même entrée', () => {
    const racine = document.createElement('div');
    const repas = document.createElement('div');
    repas.dataset.mvt = 'bloc:repas';
    const agenda = document.createElement('div');
    agenda.dataset.mvt = 'bloc:agenda';
    racine.appendChild(repas);
    racine.appendChild(agenda);
    // Les deux sortent depuis la MÊME position relevée.
    const avant = lireMarques(racine, () => [0, 40], () => [300, 90]);

    const racine2 = document.createElement('div');
    const voiture = document.createElement('div');
    voiture.dataset.mvt = 'bloc:voiture';
    racine2.appendChild(voiture);
    const apres = lireMarques(racine2, () => [0, 40], () => [300, 90]);

    const v = comparer(avant, apres);
    const croisements = v.filter((x) => x.type === 'croisement');
    expect(croisements).toHaveLength(1);
    // La sortie non appariée reste une sortie sèche, jamais absorbée ni dupliquée.
    expect(v.filter((x) => x.type === 'sortie')).toHaveLength(1);
  });
});

import { creerMoteur, type OptionsMoteur } from '../src/mouvement/moteur';
import { creerCalque } from '../src/mouvement/fantomes';
import { FANTOMES_MAX } from '../src/mouvement/grammaire';

describe('calque de fantômes', () => {
  const marqueAvec = (
    texte: string, position: [number, number] = [12, 40], taille: [number, number] = [160, 64],
  ) => {
    const el = document.createElement('div');
    el.className = 'commande';
    el.textContent = texte;
    return { role: 'tuile', cle: 'a', etat: null, el, position, taille, rang: 0 } as any;
  };

  it('clone le nœud disparu, le pose à sa place d\'avant, et garde ses classes', () => {
    const hote = document.createElement('div');
    const calque = creerCalque(hote);
    const f = calque.fantomer(marqueAvec('Plafonnier'))!;
    expect(f.className).toBe('commande');
    expect(f.textContent).toBe('Plafonnier');
    expect(f.style.left).toBe('12px');
    expect(f.style.top).toBe('40px');
    expect(f.style.width).toBe('160px');
    expect(f.style.height).toBe('64px');
    expect(calque.nombre()).toBe(1);
  });

  // Ronde de correction 1 (CRITIQUE) : au moment où une sortie est jouée, `m.el` est le nœud du
  // relevé « avant », déjà détaché du DOM par `rendre()` — dans un vrai navigateur,
  // `offsetWidth`/`offsetHeight` d'un nœud détaché valent 0. Un `fantomer` qui relirait la taille
  // SUR `m.el` à cet instant poserait donc chaque fantôme à 0×0, invisible : la sortie ratée
  // qu'un œil humain ne verrait jamais dans jsdom (qui ne calcule aucune mise en page de toute
  // façon), mais qui se produirait réellement sur une tablette. Ce test détache réellement le
  // nœud AVANT d'appeler `fantomer` et exige que la taille du clone reste correcte : elle doit
  // venir de `m.taille`, capturée pendant que le nœud était encore vivant (le rôle de
  // `lireMarques`), jamais d'une relecture de `m.el`.
  it('pose la bonne taille même quand le nœud source est déjà détaché du DOM', () => {
    const hote = document.createElement('div');
    const calque = creerCalque(hote);
    const el = document.createElement('div');
    document.body.appendChild(el);
    // La taille est réputée CAPTURÉE pendant que `el` était encore attaché — c'est le rôle de
    // `lireMarques`/`tailleDe`, hors du périmètre de ce test unitaire sur le seul calque.
    const taille: [number, number] = [160, 64];
    el.remove();
    // jsdom ne calcule de toute façon aucune mise en page (`offsetWidth` y vaut déjà 0 tout le
    // temps), mais on le force explicitement pour que ce test reste probant même si jsdom changeait
    // un jour de comportement, exactement comme un vrai navigateur le ferait sur un nœud détaché.
    Object.defineProperty(el, 'offsetWidth', { value: 0 });
    Object.defineProperty(el, 'offsetHeight', { value: 0 });
    const marque = { role: 'tuile', cle: 'a', etat: null, el, position: [0, 0], taille, rang: 0 } as any;
    const f = calque.fantomer(marque)!;
    expect(f.style.width).toBe('160px');
    expect(f.style.height).toBe('64px');
  });

  // Une rafale de `state_changed` ne doit pas pouvoir remplir le calque de clones : au-delà du
  // plafond, les sorties redeviennent SÈCHES, ce qui est un désagrément, jamais une panne.
  it('refuse au-delà du plafond, sans lever', () => {
    const calque = creerCalque(document.createElement('div'));
    for (let i = 0; i < FANTOMES_MAX; i++) expect(calque.fantomer(marqueAvec('x'))).not.toBeNull();
    expect(calque.fantomer(marqueAvec('de trop'))).toBeNull();
    expect(calque.nombre()).toBe(FANTOMES_MAX);
  });

  it('retire le fantôme quand on le relâche', () => {
    const hote = document.createElement('div');
    const calque = creerCalque(hote);
    const f = calque.fantomer(marqueAvec('x'))!;
    calque.relacher(f);
    expect(calque.nombre()).toBe(0);
    expect(calque.vide()).toBe(true);
    calque.relacher(f);                       // deux relâchements ne cassent rien
    expect(calque.nombre()).toBe(0);
  });
});

/** Monte un moteur entièrement instrumenté. `surcharges` est fusionné dans les options de
 *  `creerMoteur` : c'est par là que chaque suite injecte `animer`, `minuteurFn`, `nuit` ou
 *  `decoder` selon ce qu'elle teste. */
function moteurDeTest(
  positions: () => Record<string, [number, number]>,
  surcharges: Partial<OptionsMoteur> = {},
) {
  const racine = document.createElement('div');
  document.body.appendChild(racine);
  const appels: { el: HTMLElement; trames: any; options: any }[] = [];
  const moteur = creerMoteur(racine, {
    rendre: (gabarit) => {
      // `lit` réécrit le contenu de `racine` sans emporter les calques de mouvement, rattachés une
      // fois au montage : ce double doit se comporter pareil, sinon les tests de fantômes
      // mesureraient un calque que le rendu vient d'effacer. LES DEUX calques, depuis la traversée
      // en pile de cartes — n'en préserver qu'un ferait disparaître le fond des vues au premier
      // rendu, et le test de traversée verrait un fantôme absent plutôt que non animé.
      const calques = Array.from(racine.querySelectorAll('#mvt-fantomes, #mvt-fond'));
      racine.innerHTML = String(gabarit);
      for (const c of calques) racine.appendChild(c);
    },
    positionDe: (el) => (positions()[el.dataset.mvt!] ?? [0, 0]) as any,
    animer: (el, trames, options) => {
      appels.push({ el, trames, options });
      return { finished: Promise.resolve(), cancel: () => {} } as any;
    },
    estMasquee: () => false,
    ...surcharges,
  });
  /** Le nombre de fantômes vivants, lu dans le DOM : `creerMoteur` n'expose pas son calque, et
   *  n'a aucune raison de l'exposer pour les besoins d'un test. */
  const fantomes = () => racine.querySelectorAll('#mvt-fantomes > *').length;
  /** Les fantômes du calque de FOND — la vue sortante d'une traversée, et elle seule. */
  const fantomesFond = () => racine.querySelectorAll('#mvt-fond > *').length;
  return { racine, moteur, appels, fantomes, fantomesFond };
}

// M7 (revue finale) — `demarrage.ts` peint son écran d'erreur de démarrage par un `render()`
// DIRECT, hors du moteur : le relevé mémorisé pointe alors sur des nœuds détachés, et la peinture
// suivante y verrait des sorties fantômes sur du contenu déjà remplacé. `oublier()` est le seul
// moyen de le lui dire ; il était livré sans test.
describe('creerMoteur — oublier()', () => {
  it('fait repartir la peinture suivante comme une première : elle mémorise et se tait', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="tuile:a"></div><div data-mvt="tuile:b"></div>');
    moteur.peindre('<div data-mvt="tuile:a"></div>');          // sortie de `b` : ça bouge
    expect(appels.length).toBeGreaterThan(0);

    appels.length = 0;
    moteur.oublier();
    // Le relevé mémorisé a été jeté : rien à comparer, donc aucun verdict — exactement le
    // comportement du tout premier `peindre()`.
    moteur.peindre('<div data-mvt="tuile:a"></div><div data-mvt="tuile:b"></div>');
    expect(appels).toEqual([]);
    // Et le moteur n'est pas mort pour autant : la peinture d'après rejoue normalement.
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    expect(appels.length).toBeGreaterThan(0);
  });
});

describe('creerMoteur — verdict déplacement', () => {
  it('applique la transformation inverse puis la relâche', () => {
    let pos: Record<string, [number, number]> = { 'tuile:a': [0, 0] };
    const { moteur, appels } = moteurDeTest(() => pos);
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    pos = { 'tuile:a': [0, 64] };
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    expect(appels).toHaveLength(1);
    expect(appels[0].trames[0].transform).toBe('translate(0px, -64px)');
    expect(appels[0].trames[1].transform).toBe('none');
    expect(appels[0].options.duration).toBe(350);
  });

  it('n\'anime rien à la toute première peinture', () => {
    const { moteur, appels } = moteurDeTest(() => ({ 'tuile:a': [0, 0] }));
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    expect(appels).toEqual([]);
  });

  // Même leçon que `mesurer` et `deplacer` avant lui (`src/mouvement.ts`) : `dessiner()` continue
  // de tourner sur son intervalle de 20 s toute la nuit, écran éteint, et `requestAnimationFrame`
  // y est suspendu. On peint, on n'anime pas, et on ne relève AUCUNE position — chaque relevé est
  // un recalcul de mise en page complet sur une Fire 7 à 130 Mo de libre.
  it('peint sans animer ni relever quand l\'écran est éteint', () => {
    let releves = 0;
    const racine = document.createElement('div');
    const appels: any[] = [];
    const moteur = creerMoteur(racine, {
      rendre: (g) => { racine.innerHTML = String(g); },
      positionDe: (el) => { releves++; return [0, 0]; },
      animer: (...a: any[]) => { appels.push(a); return { finished: Promise.resolve(),
                                                          cancel: () => {} } as any; },
      estMasquee: () => true,
    });
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    expect(racine.querySelector('[data-mvt]')).not.toBeNull();   // l'écran est bien peint
    expect(releves).toBe(0);
    expect(appels).toEqual([]);
  });

  // I2 (revue finale) — MÊME GARDE, POUR LE MÊME MOTIF, mais sur `?mouvement=aucun` plutôt que sur
  // l'écran éteint : la tâche 1 avait retiré le régulateur de cadence (`actif`/`actifRole`) sans
  // remarquer que son effet — ne pas payer un relevé de mise en page par marque et par peinture —
  // était une exigence indépendante du régulateur lui-même. Sans ce test, ce garde peut redisparaître
  // en silence une seconde fois : `niveauInitial === 'aucun'` reste le SEUL repli manuel qu'un
  // propriétaire peut activer depuis Fully Kiosk quand une dalle peine, sans redéployer.
  it('peint sans animer ni relever quand niveauInitial vaut "aucun" (repli manuel)', () => {
    let releves = 0;
    const racine = document.createElement('div');
    const appels: any[] = [];
    const moteur = creerMoteur(racine, {
      rendre: (g) => { racine.innerHTML = String(g); },
      positionDe: (el) => { releves++; return [0, 0]; },
      animer: (...a: any[]) => { appels.push(a); return { finished: Promise.resolve(),
                                                          cancel: () => {} } as any; },
      niveauInitial: 'aucun',
    });
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    expect(racine.querySelector('[data-mvt]')).not.toBeNull();   // l'écran est bien peint
    expect(releves).toBe(0);
    expect(appels).toEqual([]);
  });

  // L'asymétrie qui commande l'architecture : un mur qui ne s'anime plus est un désagrément, un
  // mur FIGÉ est une demi-journée d'écran mort (le précédent `textContent`/`lit`, documenté dans
  // `src/mouvement.ts`). Une exception dans la réconciliation ne doit jamais remonter jusqu'au
  // `ws.onmessage` de `Connexion`, qui n'a aucun `try/catch` sur ce chemin.
  it('survit à une exception de la réconciliation, peint quand même, puis se désactive', () => {
    const racine = document.createElement('div');
    let peintures = 0;
    const moteur = creerMoteur(racine, {
      rendre: (g) => { peintures++; racine.innerHTML = String(g); },
      positionDe: () => { throw new Error('boum'); },
      animer: () => ({ finished: Promise.resolve(), cancel: () => {} }) as any,
      estMasquee: () => false,
    });
    expect(() => moteur.peindre('<div data-mvt="tuile:a"></div>')).not.toThrow();
    expect(() => moteur.peindre('<div data-mvt="tuile:a"></div>')).not.toThrow();
    expect(peintures).toBe(2);          // l'écran continue de se peindre, toujours
    expect(moteur.actif()).toBe(false); // mais le moteur s'est tu jusqu'au rechargement
  });
});

describe('creerMoteur — entrées et sorties', () => {
  it('anime l\'entrée d\'une clé nouvelle, en cascade selon le rang', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    moteur.peindre('<div data-mvt="tuile:a"></div><div data-mvt="tuile:b"></div>'
                 + '<div data-mvt="tuile:c"></div>');
    expect(appels).toHaveLength(2);
    expect(appels[0].trames[0]).toMatchObject({ transform: 'translateY(10px)', opacity: 0 });
    expect(appels[0].options.duration).toBe(350);
    // `b` est au rang 1, `c` au rang 2 : la cascade se compte sur le rang, pas sur l'ordre
    // d'apparition dans la liste des verdicts.
    expect(appels[0].options.delay).toBe(30);
    expect(appels[1].options.delay).toBe(60);
  });

  it('anime la sortie sur un CLONE, jamais sur le nœud réel — lit l\'a déjà retiré', () => {
    const { racine, moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="tuile:a" class="commande">A</div>');
    const reel = racine.querySelector('.commande');
    moteur.peindre('<div data-mvt="tuile:b" class="commande">B</div>');
    const sortie = appels.find((x) => x.options.duration === 120)!;
    expect(sortie).toBeDefined();
    expect(sortie.el).not.toBe(reel);
    expect(sortie.el.textContent).toBe('A');
    expect(sortie.el.parentElement!.id).toBe('mvt-fantomes');
    // Tâche 4 — la sortie est un fondu SEUL depuis le 2026-08-22 : plus de `transform` ici, cf.
    // la suite dédiée plus bas (« sortie en fondu seul, rôle detail »).
    expect(sortie.trames[1]).toMatchObject({ opacity: 0 });
  });

  // Tâche 4 (2026-08-22) — MD3 n'accompagne pas ce qui part : la sortie perd son `translateY`,
  // elle ne porte plus qu'un fondu.
  it('une sortie est un fondu seul — on n\'accompagne pas ce qui part', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="bloc:repas">R</div>');
    moteur.peindre('');
    expect(appels).toHaveLength(1);
    const [sortie] = appels;
    expect(JSON.stringify(sortie.trames)).not.toContain('translate');
    expect(sortie.trames[0]).toMatchObject({ opacity: 1 });
    expect(sortie.trames[1]).toMatchObject({ opacity: 0 });
  });

  // Tâche 4 — un `detail` (bouton de transport média, « ± 5 min », étiquette, pastille du
  // bandeau) est trop petit pour qu'un déplacement se lise comme un geste : il entre en opacité
  // seule, plus vite qu'une tuile, et SANS cascade — même à un rang non nul, où une cascade
  // laissée active se verrait (rang 2 : `retardCascade(2)` vaudrait 60 ms si la garde `!estDetail`
  // disparaissait). Peint à la suite de deux autres marques pour que ce rang ne soit pas 0 — sinon
  // `retardCascade(0)` vaut 0 QUE LA GARDE EXISTE OU NON, et le test ne prouverait rien (round de
  // correction 1, revue).
  it('un détail entre en opacité seule, sans déplacement, sans cascade à rang non nul', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="tuile:a"></div><div data-mvt="tuile:b"></div>');
    moteur.peindre('<div data-mvt="tuile:a"></div><div data-mvt="tuile:b"></div>'
                 + '<div data-mvt="detail:pastille">•</div>');
    expect(appels).toHaveLength(1);
    const [entree] = appels;
    expect(JSON.stringify(entree.trames)).not.toContain('translate');
    expect(entree.options.duration).toBe(140);
    expect(entree.options.delay).toBe(0);
  });

  it('retire le fantôme à la fin de son animation', async () => {
    const { moteur, fantomes } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="tuile:a">A</div>');
    moteur.peindre('<div data-mvt="tuile:b">B</div>');
    expect(fantomes()).toBe(1);
    await Promise.resolve(); await Promise.resolve();
    expect(fantomes()).toBe(0);
  });

  // Aucun clone ne survit à un `requestAnimationFrame` suspendu : `finished` ne se résout jamais
  // quand l'écran s'éteint en pleine animation, et un fantôme resté à l'écran est un artefact
  // visible que personne ne peut faire disparaître sans recharger la page.
  it('retire le fantôme sur le délai de garde même si l\'animation ne finit jamais', () => {
    const differes: (() => void)[] = [];
    const { moteur, fantomes } = moteurDeTest(() => ({}), {
      animer: () => ({ finished: new Promise(() => {}), cancel: () => {} }) as any,
      minuteurFn: ((cb: () => void) => { differes.push(cb); return 0; }) as any,
    });
    moteur.peindre('<div data-mvt="tuile:a">A</div>');
    moteur.peindre('<div data-mvt="tuile:b">B</div>');
    expect(fantomes()).toBe(1);
    differes.forEach((cb) => cb());
    expect(fantomes()).toBe(0);
  });
});

describe('creerMoteur — traversée de vue', () => {
  it('fait glisser la SEULE vue entrante, par-dessus une sortante restée immobile', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="vue:accueil"><div data-mvt="tuile:a"></div></div>');
    moteur.peindre('<div data-mvt="vue:maison"><div data-mvt="tuile:b"></div></div>');
    // UNE animation, et UNE SEULE. La traversée confisque la peinture (la tuile `b` qui arrive
    // n'a pas d'entrée propre), et depuis que le geste a été allégé la vue sortante ne bouge
    // plus : elle reste affichée pendant que l'entrante glisse par-dessus, comme une pile de
    // cartes. Deux écrans qui bougent ensemble, c'était le « trop chargé » du propriétaire.
    expect(appels).toHaveLength(1);
    const [entrante] = appels;
    expect(entrante.trames[0].transform).toBe('translateX(343px)');
    expect(entrante.trames[1].transform).toBe('none');
    expect(entrante.options.duration).toBe(320);
    // « Juste un glissé » : aucun fondu, ni sur l'entrante ni ailleurs. Un `opacity` qui
    // reviendrait ici rendrait le geste flou sans rien ajouter au sens.
    expect(entrante.trames.some((t: any) => 'opacity' in t)).toBe(false);
  });

  it('laisse la vue sortante en place, SOUS l\'entrante et NON animée — sans quoi l\'écran se vide', () => {
    const { moteur, appels, fantomes, fantomesFond } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="vue:accueil"></div>');
    moteur.peindre('<div data-mvt="vue:maison"></div>');
    // `lit` a déjà retiré la vue sortante du DOM réel quand l'animation démarre : sans ce clone
    // immobile, l'entrante glisserait au-dessus du vide pendant 320 ms. Le clone reste donc
    // indispensable — c'est son ANIMATION qui a disparu, pas lui.
    //
    // Et il va dans le calque de FOND (`#mvt-fond`, `z-index: -1`), jamais dans `#mvt-fantomes`
    // (`z-index: 5`) : là-haut il masquerait intégralement l'écran qui arrive, et la traversée
    // serait invisible. C'est le seul fantôme du projet à passer sous le contenu.
    expect(fantomesFond()).toBe(1);
    expect(fantomes()).toBe(0);
    expect(appels.every((x) => x.el.parentElement?.id !== 'mvt-fond')).toBe(true);
  });

  it('revenir à l\'accueil glisse dans l\'autre sens', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="vue:maison"></div>');
    moteur.peindre('<div data-mvt="vue:accueil"></div>');
    expect(appels).toHaveLength(1);
    expect(appels[0].trames[0].transform).toBe('translateX(-343px)');
  });

  it('ne pousse rien vers l\'écran de nuit', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="vue:accueil"></div>');
    moteur.peindre('<div data-mvt="vue:nuit"></div>');
    expect(appels).toEqual([]);
  });

});

// Tâche 3 (2026-08-22) — LE BALAYAGE A DISPARU. `.commande` porte déjà `transition: background
// .3s` en CSS : quand `lit` ajoute la classe `actif`, le fond fond tout seul. Les deux couches
// opaques que le moteur posait par-dessus pour rejouer le même effet en JS (`.mvt-balayage`/
// `.mvt-balayage-disque`, jusqu'à 280×280 px composés — 39 % de l'écran — à chaque bascule)
// remplaçaient donc un fondu déjà gratuit, mesuré identique au pixel près (ancien commentaire de
// `jouer()`, avant cette tâche). Une mutation de rôle `tuile` ne pose donc plus AUCUNE couche et
// n'appelle plus `animer()` du tout : le fondu CSS, seul, porte le geste.
describe('creerMoteur — mutation de tuile (balayage retiré, tâche 3)', () => {
  it('ne pose plus aucune couche de balayage quand une tuile change d\'état', () => {
    const { racine, moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="tuile:a" data-mvt-etat="inactif" class="commande"></div>');
    moteur.peindre('<div data-mvt="tuile:a" data-mvt-etat="actif" class="commande"></div>');
    expect(racine.querySelectorAll('.mvt-balayage')).toHaveLength(0);
    expect(appels).toEqual([]);
  });

  // Conservé de l'ancienne suite balayage : la garde sur le rôle n'a plus lieu d'être dans
  // `jouer()` (toute mutation hors `chiffre`/`bloc` ne joue déjà plus rien, quel que soit le
  // rôle), mais le comportement observable qu'elle protégeait — une ligne de tâche dont l'armement
  // reste instantané — doit rester vrai en non-régression.
  it('une ligne de tâche garde son armement instantané', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="ligne:t1" data-mvt-etat="repos"></div>');
    moteur.peindre('<div data-mvt="ligne:t1" data-mvt-etat="armee"></div>');
    expect(appels).toEqual([]);
  });
});

// Ronde de correction 1 (tâche 3) : les anciennes `@keyframes glisser-entree-*` (retirées de
// `base.css` par cette tâche) vivaient DANS `@media (prefers-reduced-motion: no-preference)` —
// quelqu'un ayant demandé moins de mouvement n'avait donc, jusqu'ici, AUCUNE animation de vue.
// La traversée, plus grande et plus perturbante animation de l'appli (un écran ENTIER qui
// glisse), s'est ainsi retrouvée seule à avoir perdu la protection qu'elle avait — un trou, pas
// un simple oubli de test : `creerMoteur(racine)` (`demarrage.ts`, sans option) n'a jamais eu de
// chemin vers `matchMedia`, contrairement à l'ancien système `niveau`/`Compteur`
// (`src/mouvement.ts`), qui le calcule déjà mais reste entièrement disjoint du moteur.
//
// Ce test exerce le DÉFAUT réel de `estMasquee` (jamais l'`estMasquee: () => false` que
// `moteurDeTest` fige pour isoler les autres suites de tout `matchMedia`) : `creerMoteur` est
// construit ici sans option `estMasquee`, avec seulement `rendre`/`positionDe`/`animer` injectés
// pour rester synchrone et sans DOM réel — même patron que « peint sans animer ni relever quand
// l'écran est éteint » plus haut dans ce fichier, qui prouve la même famille de garde pour
// `document.hidden`.
describe('creerMoteur — prefers-reduced-motion (ronde de correction 1)', () => {
  it('n\'anime aucune traversée de vue sous prefers-reduced-motion: reduce, mais peint quand même', () => {
    const original = (globalThis as any).matchMedia;
    // jsdom ne définit PAS `matchMedia` par défaut (`typeof matchMedia === 'function'` y vaut
    // `false`, cf. `demarrage.ts:272`) : ce test le pose lui-même, comme un vrai navigateur avec
    // la préférence système activée le ferait.
    (globalThis as any).matchMedia = (requete: string) =>
      ({ matches: requete.includes('reduce') }) as MediaQueryList;
    try {
      const racine = document.createElement('div');
      const appels: unknown[] = [];
      const moteur = creerMoteur(racine, {
        rendre: (g) => {
          const calque = racine.querySelector('#mvt-fantomes');
          racine.innerHTML = String(g);
          if (calque) racine.appendChild(calque);
        },
        positionDe: () => [0, 0] as any,
        animer: (...a: any[]) => { appels.push(a); return { finished: Promise.resolve(),
                                                             cancel: () => {} } as any; },
      });
      moteur.peindre('<div data-mvt="vue:accueil"></div>');
      moteur.peindre('<div data-mvt="vue:maison"></div>');
      expect(appels).toEqual([]);
      // Peint quand même : seule l'animation est sautée, jamais le contenu.
      expect(racine.querySelector('[data-mvt="vue:maison"]')).not.toBeNull();
      expect(racine.querySelector('[data-mvt="vue:accueil"]')).toBeNull();
    } finally {
      (globalThis as any).matchMedia = original;
    }
  });
});

// Ronde de correction 2 (tâche 3) : `estMasquee()` (en tête de `peindre()`, avant même le `try`
// du relevé « avant ») n'était protégée par AUCUN garde-fou tant qu'elle se réduisait à
// `document.hidden` — une lecture de booléen qui ne peut pas lever. La ronde de correction 1 y a
// introduit `matchMedia(...).matches`, une expression qui, elle, PEUT lever (prouvé en relecture
// avec un `matchMedia` présent renvoyant `undefined`) — et rien ne garantit qu'une future
// injection d'`estMasquee` (elle est déjà surchargée par TOUTE la suite ci-dessus) ne lève pas
// non plus. Même famille de piège, même remède, que « rendre() qui lève » juste en dessous :
// cette exception ne doit RIEN laisser passer hors de `peindre` — le chemin est distinct (le
// refus en tête de fonction, pas le rendu lui-même), donc un describe séparé plutôt qu'un cas de
// plus dans celui de `rendre()`.
describe('creerMoteur — estMasquee() qui lève ne doit jamais s\'échapper (ronde de correction 2)',
  () => {
    it('une injection d\'estMasquee qui lève ne propage rien, désactive le moteur, et peint quand même', () => {
      const racine = document.createElement('div');
      let rendus = 0;
      const moteur = creerMoteur(racine, {
        rendre: (g) => { rendus++; racine.innerHTML = String(g); },
        positionDe: () => [0, 0],
        animer: () => ({ finished: Promise.resolve(), cancel: () => {} }) as any,
        estMasquee: () => { throw new Error('boum'); },
      });
      expect(() => moteur.peindre('<div data-mvt="tuile:a"></div>')).not.toThrow();
      expect(moteur.actif()).toBe(false);
      // Peint quand même : une panne du GARDE n'est pas une raison de figer l'écran, exactement
      // la même discipline que pour un `rendre()` ou un relevé qui lève.
      expect(rendus).toBe(1);
      expect(racine.querySelector('[data-mvt="tuile:a"]')).not.toBeNull();
    });
  });

// Ronde de correction 1 (CRITIQUE) : les cinq blocs de mode (repas, entretien, agenda, ménage,
// aération) partageaient tous le littéral `data-mvt="bloc:mode"` — la même clé pour cinq genres
// distincts, rendus dans le MÊME emplacement (`blocCentral`, `demarrage.ts`). `comparer()` indexe
// par la déclaration complète : une clé qui persiste d'un relevé à l'autre, c'est LA MÊME marque
// qui persiste, jamais une entrée + une sortie. Or c'est précisément le contraire de la règle que
// ce marquage existe pour servir (cf. brief tâche 2) : « La clé d'un bloc est son genre, pas son
// contenu — c'est ce qui fait qu'un mode remplacé par un autre produit une sortie ET une entrée ».
// Test d'intégration sur les VRAIES fonctions de rendu (pas des littéraux copiés dans le test) :
// il aurait détecté la clé partagée d'origine.
describe('data-mvt des blocs de mode — une clé par genre (ronde de correction 1)', () => {
  it('les cinq genres de blocs de mode portent chacun une clé data-mvt distincte', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'vacuum.rdc', state: 'cleaning', attributes: {} });
    etat.appliquer({ entity_id: 'binary_sensor.a', state: 'on',
                      attributes: { friendly_name: 'Fenêtre' } });

    const cles = new Set<string>();
    const releve = (gabarit: TemplateResult) => {
      const div = document.createElement('div');
      render(gabarit, div);
      const [decl] = lireMarques(div).keys();
      cles.add(decl);
    };
    // Lot 6 : `rendreRepasSuivant` a changé de SOURCE (`sensor.home_stock_next_meal`) — même bloc,
    // même clé `bloc:repas`, ce que ce test vérifie justement. Rien d'autre ne change ici.
    releve(rendreRepasSuivant({ etiquette: 'Dîner', plat: 'Riz', mealId: 1, recetteId: null,
                                manquants: 0 })!);
    releve(rendreEntretien([{ uid: '1', texte: 'Filtre à changer' }])!);
    releve(rendreProchainRdv(
      [{ resume: 'Réunion', debut: '2026-08-03T16:30:00+02:00', estAnniversaire: false }],
      new Date('2026-08-03T14:00:00+02:00'))!);
    releve(rendreMenage(etat, 'vacuum.rdc'));
    releve(rendreAeration(etat, ['binary_sensor.a']));

    expect(cles.size).toBe(5);
  });

  // La conséquence concrète de la clé partagée : sans elle, remplacer le bloc ménage par le bloc
  // aération (la cuisine passe de « robot en train d'aspirer » à « fenêtre ouverte depuis 10 min
  // et chauffage en marche », deux genres réels qui se succèdent au même emplacement) ne produisait
  // NI sortie NI entrée — le vieux bloc restait affiché tel quel, son contenu simplement réécrit
  // en place par `lit`, sans aucune animation. Avec une clé par genre, c'est un changement de
  // déclaration complète : `comparer()` doit y voir deux marques distinctes.
  //
  // Mise à jour tâche 6 — les deux marques sont à la MÊME place (`lireMarques` sans `positionDe`
  // injecté relève `offsetLeft`/`offsetTop`, qui valent 0 partout sous jsdom, donc trivialement
  // égaux ici — exactement le cas réel : le bloc central occupe toujours la même fente fixe).
  // `comparer()` les apparie donc en UN croisement plutôt qu'en la sortie + entrée d'avant cette
  // tâche : c'est la scène que ce test documentait déjà, rejouée avec le nouveau verdict.
  it('remplacer un genre de bloc par un autre produit un croisement', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'vacuum.rdc', state: 'cleaning', attributes: {} });
    etat.appliquer({ entity_id: 'binary_sensor.a', state: 'on',
                      attributes: { friendly_name: 'Fenêtre' } });

    const avantEl = document.createElement('div');
    render(rendreMenage(etat, 'vacuum.rdc'), avantEl);
    const apresEl = document.createElement('div');
    render(rendreAeration(etat, ['binary_sensor.a']), apresEl);

    const verdicts = comparer(lireMarques(avantEl), lireMarques(apresEl));
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({
      type: 'croisement',
      sortante: { cle: 'menage' },
      entrante: { cle: 'aeration' },
    });
  });
});

// Ronde de correction 1 : le test ci-dessus ne couvre qu'un seul axe de panne — le RELEVÉ
// (`positionDe`) qui lève APRÈS un `rendre()` déjà réussi. Le `rendre()` lui-même peut aussi
// lever (un commit `lit` sur une donnée d'entité malformée) : ni la tentative nominale, ni la
// branche de secours (`!actif || estMasquee()`) ne doivent laisser cette exception s'échapper de
// `peindre` — sans quoi elle remonte jusqu'au `ws.onmessage` de `Connexion`, qui n'a aucun
// `try/catch` sur ce chemin, et un `rendre()` qui échoue une fois échouerait alors INDÉFINIMENT,
// à chaque futur `peindre()`, puisque `actif === false` fait retomber tous les appels suivants
// sur cette même branche de secours.
describe('creerMoteur — rendre() qui lève ne doit jamais s\'échapper', () => {
  it('rendre() qui lève au tout premier appel ne propage rien, et désactive le moteur', () => {
    const racine = document.createElement('div');
    const moteur = creerMoteur(racine, {
      rendre: () => { throw new Error('paf'); },
      positionDe: () => [0, 0],
      animer: () => ({ finished: Promise.resolve(), cancel: () => {} }) as any,
      estMasquee: () => false,
    });
    expect(() => moteur.peindre('<div data-mvt="tuile:a"></div>')).not.toThrow();
    expect(moteur.actif()).toBe(false);
  });

  it('rendre() qui continue de lever ne propage jamais, même après plusieurs peindre() (branche de secours)', () => {
    const racine = document.createElement('div');
    const moteur = creerMoteur(racine, {
      rendre: () => { throw new Error('paf'); },
      positionDe: () => [0, 0],
      animer: () => ({ finished: Promise.resolve(), cancel: () => {} }) as any,
      estMasquee: () => false,
    });
    expect(() => moteur.peindre('<div data-mvt="tuile:a"></div>')).not.toThrow();
    // Le moteur est déjà inactif ici : ces appels retombent tous sur la branche de secours en
    // tête de `peindre` — c'est ELLE, précisément, qu'un `rendre()` qui continue d'échouer (une
    // donnée durablement invalide) mettrait en boucle d'exceptions si elle n'était pas gardée.
    expect(() => moteur.peindre('<div data-mvt="tuile:a"></div>')).not.toThrow();
    expect(() => moteur.peindre('<div data-mvt="tuile:a"></div>')).not.toThrow();
    expect(moteur.actif()).toBe(false);
  });

  // Contre-épreuve : la garantie apportée par `dejaRendu` (round 1) doit survivre à ce correctif —
  // un `rendre()` qui RÉUSSIT n'est jamais rejoué une seconde fois pour la même peinture, y
  // compris quand c'est le relevé « après » (pas le rendu) qui échoue ensuite.
  it('un rendre() qui réussit n\'est jamais rejoué deux fois pour la même peinture', () => {
    const racine = document.createElement('div');
    let rendus = 0;
    const moteur = creerMoteur(racine, {
      rendre: (g) => { rendus++; racine.innerHTML = String(g); },
      positionDe: () => { throw new Error('boum'); },   // le relevé « après » échoue, pas le rendu
      animer: () => ({ finished: Promise.resolve(), cancel: () => {} }) as any,
      estMasquee: () => false,
    });
    moteur.peindre('<div data-mvt="tuile:a"></div>');
    expect(rendus).toBe(1);
  });
});

describe('creerMoteur — roulement de chiffres', () => {
  it('fantôme l\'ancien glyphe et fait entrer le nouveau par le bas', () => {
    const { racine, moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<span data-mvt="chiffre:h2" data-mvt-etat="2">2</span>');
    moteur.peindre('<span data-mvt="chiffre:h2" data-mvt-etat="3">3</span>');
    expect(appels).toHaveLength(2);
    const sortant = appels.find((x) => x.el.parentElement?.id === 'mvt-fantomes')!;
    expect(sortant.el.textContent).toBe('2');
    expect(sortant.trames[1]).toMatchObject({ transform: 'translateY(-100%)', opacity: 0 });
    const entrant = appels.find((x) => x !== sortant)!;
    expect(entrant.el).toBe(racine.querySelector('[data-mvt="chiffre:h2"]'));
    expect(entrant.trames[0]).toMatchObject({ transform: 'translateY(100%)', opacity: 0 });
    expect(entrant.options.duration).toBe(140);
  });

  // LA garantie que l'ancien `animerNombres` ne pouvait pas donner : le DOM réel n'est jamais
  // écrit par le moteur, donc il porte toujours la valeur exacte rendue par `lit`.
  it('ne touche jamais au texte rendu par lit', () => {
    const { racine, moteur } = moteurDeTest(() => ({}));
    moteur.peindre('<span data-mvt="chiffre:h2" data-mvt-etat="2">2</span>');
    moteur.peindre('<span data-mvt="chiffre:h2" data-mvt-etat="3">3</span>');
    expect(racine.querySelector('[data-mvt="chiffre:h2"]')!.textContent).toBe('3');
  });

  it('ne roule que les chiffres réellement changés', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    const heure = (a: string, b: string) =>
      `<span data-mvt="chiffre:h1" data-mvt-etat="${a}">${a}</span>`
    + `<span data-mvt="chiffre:h2" data-mvt-etat="${b}">${b}</span>`;
    moteur.peindre(heure('1', '9'));
    moteur.peindre(heure('2', '0'));
    expect(appels).toHaveLength(4);      // deux chiffres × (sortant + entrant)
    appels.length = 0;
    moteur.peindre(heure('2', '0'));
    expect(appels).toEqual([]);          // rien n'a changé : rien ne bouge
  });
});

// Ronde de correction 1 (tâche 5) — LA PROPRIÉTÉ QUE `copie` PROTÈGE N'ÉTAIT VÉRIFIÉE PAR AUCUN
// TEST. Les trois tests ci-dessus passent tous par `moteurDeTest`, dont le `rendre` fait
// `racine.innerHTML = String(g)` : cette technique RECRÉE systématiquement des nœuds neufs à
// chaque peinture — `avant.el` y diffère donc déjà de `apres.el` que `copie` existe ou non, et ces
// trois tests resteraient verts si `copie` disparaissait demain. Exactement le défaut qui a coûté
// une demi-journée d'écran mort à `animerNombres` : une propriété jugée sûre « par lecture »
// plutôt que verrouillée par un test qui échoue si elle casse.
//
// Ce describe rend donc par `lit` RÉEL — `creerMoteur` sans option `rendre`, donc son défaut :
// `render()` de `lit` — seul chemin qui RÉUTILISE le même nœud DOM d'un rendu à l'autre. Le
// gabarit est celui, réel, de `rendreBandeau` : un tableau `.map()` sans `repeat()` ni fonction de
// clé, donc une liaison PAR POSITION — exactement le cas que le commentaire de `Marque.copie`
// (`marques.ts`) désigne comme le risque, et que le vérificateur a demandé de reproduire plutôt
// que de le supposer.
describe('creerMoteur — roulement de chiffres, avec lit RÉEL (ronde de correction 1)', () => {
  it('fantôme l\'ancien glyphe même quand lit réutilise le même nœud DOM d\'un rendu à l\'autre',
    () => {
      const racine = document.createElement('div');
      document.body.appendChild(racine);
      const appels: { el: HTMLElement; trames: any }[] = [];
      const moteur = creerMoteur(racine, {
        // `rendre` NON injecté : le vrai `render()` de `lit`, pas le double `innerHTML`.
        positionDe: () => [0, 0],
        tailleDe: () => [0, 0],
        animer: (el, trames) => {
          appels.push({ el, trames });
          return { finished: Promise.resolve(), cancel: () => {} } as any;
        },
        estMasquee: () => false,
      });
      // `Etat()` vide : ni météo ni capteur intérieur utilisables, donc ni `.dehors` ni `.phrase`
      // ni pastille — seule l'horloge (les 5 `chiffre:0..4`) est marquée dans ce rendu, ce qui
      // isole ce test du reste du bandeau.
      const etat = new Etat();
      const peindre = (h: number, m: number) =>
        moteur.peindre(rendreBandeau(etat, 'jour', new Date(2026, 7, 6, h, m), 'sensor.absent'));

      peindre(19, 42);
      const avant = racine.querySelector('[data-mvt="chiffre:4"]');
      peindre(19, 43);
      const apres = racine.querySelector('[data-mvt="chiffre:4"]');
      // La preuve de contexte, sans laquelle ce describe ne testerait rien de plus que les trois
      // précédents : `lit` a bien réutilisé le MÊME nœud (liaison par position dans le tableau de
      // `rendreBandeau`), donc `apres.el` (comme `avant.el`, le MÊME objet) porte déjà le texte
      // NEUF au moment où `jouer()` s'exécute — sans `copie`, le fantôme ci-dessous cloné à cet
      // instant porterait donc « 3 », jamais « 2 ».
      expect(apres).toBe(avant);
      expect(apres!.textContent).toBe('3');

      const sortant = appels.find((x) => x.el.parentElement?.id === 'mvt-fantomes')!;
      expect(sortant, 'aucun fantôme trouvé dans #mvt-fantomes').toBeDefined();
      expect(sortant.el.textContent).toBe('2');   // l'ANCIEN glyphe, jamais '3' : c'est `copie`
    });
});

describe('creerMoteur — fondu de palette', () => {
  it('pose la classe de fondu, bascule, puis RETIRE la classe', () => {
    const differes: { cb: () => void; ms: number }[] = [];
    const { racine, moteur } = moteurDeTest(() => ({}), {
      minuteurFn: ((cb: () => void, ms: number) => { differes.push({ cb, ms }); return 0; }) as any,
    });
    moteur.basculerPalette(true);
    expect(racine.classList.contains('fondu-palette')).toBe(true);
    expect(racine.classList.contains('sombre')).toBe(true);
    const fin = differes.find((d) => d.ms === 600)!;
    expect(fin).toBeDefined();
    fin.cb();
    // L'entorse dure 600 ms, deux fois par jour, et disparaît ensuite.
    expect(racine.classList.contains('fondu-palette')).toBe(false);
    expect(racine.classList.contains('sombre')).toBe(true);
  });

  it('ne refond rien quand la palette ne change pas', () => {
    const differes: any[] = [];
    const { racine, moteur } = moteurDeTest(() => ({}), {
      minuteurFn: ((cb: any, ms: any) => { differes.push({ cb, ms }); return 0; }) as any,
    });
    moteur.basculerPalette(false);
    differes.length = 0;
    moteur.basculerPalette(false);
    expect(differes).toEqual([]);
    expect(racine.classList.contains('fondu-palette')).toBe(false);
  });

  // Ronde de correction 1 — le cas ci-dessus part d'un état déjà `false` : les deux appels sont
  // des no-op dès le départ, la garde `sombreCourant === sombre` n'est jamais réellement exercée
  // APRÈS un vrai changement. Celui-ci part d'un fondu RÉEL (posé puis retiré), puis rappelle la
  // MÊME valeur — le cas qui compte vraiment pour la garde.
  it('ne refond pas de nouveau quand on rappelle la même valeur après un vrai changement', () => {
    const differes: { cb: () => void; ms: number }[] = [];
    const { racine, moteur } = moteurDeTest(() => ({}), {
      minuteurFn: ((cb: () => void, ms: number) => { differes.push({ cb, ms }); return 0; }) as any,
    });
    moteur.basculerPalette(true);
    differes.find((d) => d.ms === 600)!.cb();   // le fondu se retire normalement
    differes.length = 0;
    moteur.basculerPalette(true);               // même valeur : ne doit rien reposer
    expect(differes).toEqual([]);
    expect(racine.classList.contains('fondu-palette')).toBe(false);
    expect(racine.classList.contains('sombre')).toBe(true);
  });

  // Ronde de correction 1 — Important : `basculerPalette` est appelée depuis `dessiner()`, HORS du
  // chemin `peindre()` — le seul endroit où `estMasquee()` (donc `prefers-reduced-motion` ET
  // `document.hidden`) était jusqu'ici consultée. Avant cette tâche, le toggle `.sombre` était
  // instantané et la question ne se posait pas ; cette tâche introduit la SEULE transition de
  // couleur du projet, et c'est aussi la seule qui échappait au filet que le reste du fichier
  // documente comme systématique (ronde de correction 1, tâche 3).
  it('bascule sec sous prefers-reduced-motion (ou écran masqué), sans fondu, mais reste juste', () => {
    const differes: any[] = [];
    const { racine, moteur } = moteurDeTest(() => ({}), {
      estMasquee: () => true,
      minuteurFn: ((cb: any, ms: any) => { differes.push({ cb, ms }); return 0; }) as any,
    });
    moteur.basculerPalette(true);
    // Le résultat reste JUSTE : la bonne palette, jamais une transition ni un minuteur à retirer.
    expect(racine.classList.contains('sombre')).toBe(true);
    expect(racine.classList.contains('fondu-palette')).toBe(false);
    expect(differes).toEqual([]);
  });

  // Ronde de correction 1 — même discipline que `peindre()` : `estMasquee` est une injection
  // (surchargée par toute cette suite, et par autre chose demain) — rien ne garantit qu'elle ne
  // lève pas. Appelée ici HORS de `peindre()`, `basculerPalette` n'a aucun filet automatique :
  // c'est elle-même qui doit se protéger.
  it('une injection d\'estMasquee qui lève ne propage rien depuis basculerPalette', () => {
    const { racine, moteur } = moteurDeTest(() => ({}), {
      estMasquee: () => { throw new Error('boum'); },
    });
    expect(() => moteur.basculerPalette(true)).not.toThrow();
    expect(racine.classList.contains('sombre')).toBe(true);
  });
});

describe('creerMoteur — croisement d\'affiche média', () => {
  it('croise le bloc entier quand le média change', () => {
    const { moteur, appels } = moteurDeTest(() => ({}));
    moteur.peindre('<div data-mvt="bloc:media" data-mvt-etat="piste-1">Weird Fishes</div>');
    moteur.peindre('<div data-mvt="bloc:media" data-mvt-etat="piste-2">Nude</div>');
    const sortant = appels.find((x) => x.el.parentElement?.id === 'mvt-fantomes')!;
    expect(sortant.el.textContent).toBe('Weird Fishes');
    expect(sortant.trames[1].opacity).toBe(0);
    const entrant = appels.find((x) => x !== sortant)!;
    expect(entrant.trames[0].opacity).toBe(0);
    expect(entrant.options.duration).toBe(320);
  });
});

// Ronde de correction (même piège qu'à la tâche 5, cf. son rapport) : le test ci-dessus passe par
// `moteurDeTest`, dont le `rendre` fait `racine.innerHTML = String(g)` — cette technique RECRÉE
// systématiquement des nœuds neufs à chaque peinture, donc `avant.el` y diffère déjà de `apres.el`
// que `copie` existe ou non pour le rôle `bloc`. Vérifié empiriquement : ce describe reste VERT
// même après avoir retiré `'bloc'` de `ROLES_AVEC_COPIE` (`marques.ts`) — exactement le point
// aveugle que l'invariant 5 du brief demande de verrouiller. Les describes qui suivent rendent
// donc par `lit` RÉEL (`creerMoteur` sans option `rendre`) avec le gabarit réel de
// `rendreCarteMedia`, qui NE change pas de structure entre deux peintures (une seule interpolation
// dynamique, pas un tableau `.map()`) : `lit` réutilise le MÊME nœud DOM pour `.media` d'un rendu
// à l'autre, exactement le cas que `Marque.copie` existe pour couvrir — et le cas réel qu'une
// affiche en fond CSS (jamais un `<img>` fabriqué à la main, cf. ronde de correction 1) doit
// pouvoir précharger sans jamais confondre deux morceaux qui se succèdent vite.

/** Un `SourceResolue` minimal pour ces tests : un seul champ varie d'un appel à l'autre (`titre`),
 *  `affiche` optionnel — c'est la présence ou l'absence de ce champ qui décide si `rendu/media.ts`
 *  pose un `.media-affiche` (fond CSS `background-image`) dans le gabarit. */
function sourceMedia(titre: string, affiche?: string): SourceResolue {
  return { nom: 'Musique', joue: true, allumee: true, titre, sousTitre: '', affiche };
}

/** Monte un moteur qui rend par `lit` RÉEL (aucune option `rendre` injectée) — voir le commentaire
 *  ci-dessus pour la raison : c'est la seule façon d'exercer le VRAI risque (réutilisation de nœud
 *  par `lit`) plutôt que l'artefact du double `innerHTML` de `moteurDeTest`. */
function moteurReel(surcharges: Partial<OptionsMoteur> = {}) {
  const racine = document.createElement('div');
  document.body.appendChild(racine);
  const appels: { el: HTMLElement; trames: any; options: any }[] = [];
  const moteur = creerMoteur(racine, {
    positionDe: () => [0, 0] as any,
    tailleDe: () => [0, 0] as any,
    animer: (el, trames, options) => {
      appels.push({ el, trames, options });
      return { finished: Promise.resolve(), cancel: () => {} } as any;
    },
    estMasquee: () => false,
    ...surcharges,
  });
  return { racine, moteur, appels };
}

describe('creerMoteur — croisement d\'affiche média, avec lit RÉEL (verrouille la copie du rôle bloc)',
  () => {
    it('fantôme l\'ancien titre même quand lit réutilise le même nœud DOM d\'un rendu à l\'autre',
      () => {
        const { racine, moteur, appels } = moteurReel();

        moteur.peindre(rendreCarteMedia(sourceMedia('Weird Fishes')));
        const avant = racine.querySelector('.media');
        moteur.peindre(rendreCarteMedia(sourceMedia('Nude')));
        const apres = racine.querySelector('.media');
        // La preuve de contexte, sans laquelle ce describe ne testerait rien de plus que le test
        // au double `innerHTML` ci-dessus : `lit` a bien réutilisé le MÊME nœud, donc `apres.el`
        // (comme `avant.el`, le MÊME objet) porte déjà le titre NEUF au moment où `jouer()`
        // s'exécute — sans `copie`, le fantôme ci-dessous cloné à cet instant porterait donc
        // « Nude », jamais « Weird Fishes ».
        expect(apres).toBe(avant);
        expect(apres!.querySelector('.v')?.textContent).toBe('Nude');

        const sortant = appels.find((x) => x.el.parentElement?.id === 'mvt-fantomes')!;
        expect(sortant, 'aucun fantôme trouvé dans #mvt-fantomes').toBeDefined();
        // L'ANCIEN titre, jamais « Nude » : c'est `copie` qui le garantit.
        expect(sortant.el.querySelector('.v')?.textContent).toBe('Weird Fishes');
      });
  });

// Ronde de correction 1 — `rendu/media.ts` ne pose JAMAIS de `<img>` (l'affiche est un fond CSS
// sur `.media-affiche`, cf. son commentaire « un élément remplacé participerait à la mise en
// page ») : `querySelector('img')` renvoie donc TOUJOURS `null` en production, et l'attente
// écrite avec un `<img>` fabriqué à la main ne protégeait rien de réel — seulement la fixture du
// test. Ces tests exercent désormais le VRAI gabarit de `rendreCarteMedia`, affiche comprise.
describe('creerMoteur — l\'affiche est attendue, mais pas indéfiniment', () => {
  it('diffère le croisement jusqu\'à ce que le fond CSS de la nouvelle affiche soit décodé',
    async () => {
      let decoder!: () => void;
      const { racine, moteur, appels } = moteurReel({
        decoder: () => new Promise<void>((r) => { decoder = r; }),
      });
      moteur.peindre(rendreCarteMedia(sourceMedia('a', '/aff-a.jpg')));
      moteur.peindre(rendreCarteMedia(sourceMedia('b', '/aff-b.jpg')));
      // I5 (revue finale) — LE CONTRAT A CHANGÉ ICI, et le nouveau est plus exigeant que
      // l'ancien. `expect(appels).toEqual([])` disait « rien ne bouge » ; c'était vrai du moteur,
      // et faux de l'écran : `lit` avait DÉJÀ peint le nouveau morceau au moment où la mutation
      // est jouée, si bien que la tablette montrait le morceau neuf, puis le voyait retomber à
      // `opacity: 0` et refondre jusqu'à 800 ms plus tard, quand l'affiche finissait par se
      // décoder. Le moteur pose donc désormais un MASQUE dès la peinture — une tenue à
      // `opacity: 0` sur le bloc — et c'est la SEULE chose qui doit exister tant que l'affiche
      // n'est pas prête : surtout aucun fantôme, aucun fondu.
      expect(appels).toHaveLength(1);
      expect(appels[0].trames).toEqual([{ opacity: 0 }, { opacity: 0 }]);
      expect(appels[0].options.duration).toBe(800);
      expect(racine.querySelectorAll('#mvt-fantomes > *')).toHaveLength(0);
      decoder();
      await Promise.resolve(); await Promise.resolve();
      expect(appels.length).toBeGreaterThan(1);
    });

  // Un mur ne reste pas bloqué sur une image qui ne vient pas.
  it('croise quand même au bout de 800 ms si l\'affiche ne vient jamais', () => {
    const differes: { cb: () => void; ms: number }[] = [];
    const { moteur, appels } = moteurReel({
      decoder: () => new Promise<void>(() => {}),
      minuteurFn: ((cb: () => void, ms: number) => { differes.push({ cb, ms }); return 0; }) as any,
    });
    moteur.peindre(rendreCarteMedia(sourceMedia('a', '/aff-a.jpg')));
    moteur.peindre(rendreCarteMedia(sourceMedia('b', '/aff-b.jpg')));
    // Le masque (I5) compte pour une animation dès la peinture : c'est bien un croisement DE PLUS
    // qu'on attend ici, jamais « au moins une animation », qui serait vrai sans rien croiser.
    expect(appels).toHaveLength(1);
    differes.find((d) => d.ms === 800)!.cb();
    expect(appels.length).toBeGreaterThan(1);
  });

  // Piège signalé en relecture : un décodage qui ÉCHOUE (image cassée, 404…) doit croiser tout de
  // suite — pas rester bloqué jusqu'au plafond alors que l'échec est déjà connu.
  it('croise dès que le décodage échoue, sans attendre le plafond de 800 ms', async () => {
    const { moteur, appels } = moteurReel({
      decoder: () => Promise.reject(new Error('échec de décodage')),
    });
    moteur.peindre(rendreCarteMedia(sourceMedia('a', '/aff-a.jpg')));
    moteur.peindre(rendreCarteMedia(sourceMedia('b', '/aff-b.jpg')));
    await Promise.resolve(); await Promise.resolve();
    // Idem : au-delà du masque posé dès la peinture (I5), donc un croisement réellement joué.
    expect(appels.length).toBeGreaterThan(1);
  });

  it('précharge l\'URL extraite du fond CSS, jamais un <img> qui n\'existe pas', () => {
    let src: string | undefined;
    const { moteur } = moteurReel({
      decoder: (img) => { src = img.src; return new Promise<void>(() => {}); },
    });
    moteur.peindre(rendreCarteMedia(sourceMedia('a')));  // pas d'affiche au départ
    moteur.peindre(rendreCarteMedia(sourceMedia('b', '/local/wallpanel/essai-affiche-claire.png')));
    expect(src).toContain('/local/wallpanel/essai-affiche-claire.png');
  });
});

// Ronde de correction 1 — deux morceaux enchaînés plus vite que l'attente de l'affiche (ou que son
// décodage) partageaient jusqu'ici le MÊME nœud `.media` (`lit` le réutilise, prouvé plus haut)
// sans qu'aucun mécanisme n'empêche le premier croisement, retardé, de partir APRÈS que le second
// a déjà pris sa place — un clignotement visible sur le mur, jamais un défaut seulement théorique.
describe('creerMoteur — deux croisements de bloc média rapprochés', () => {
  it('un croisement périmé, résolu tardivement, ne rejoue rien par-dessus le morceau déjà affiché',
    async () => {
      const decodeurs: (() => void)[] = [];
      const { moteur, appels } = moteurReel({
        decoder: () => new Promise<void>((r) => { decodeurs.push(r); }),
      });
      moteur.peindre(rendreCarteMedia(sourceMedia('a', '/aff-a.jpg')));
      moteur.peindre(rendreCarteMedia(sourceMedia('b', '/aff-b.jpg')));   // 1re mutation
      moteur.peindre(rendreCarteMedia(sourceMedia('c', '/aff-c.jpg')));   // 2e, avant que la 1re ait croisé
      // I5 (revue finale) : chaque mutation pose son masque dès la peinture — deux masques, et
      // RIEN d'autre. Le décompte remplace l'ancien `toEqual([])`, qui ne pouvait plus tenir sans
      // renoncer au masque ; ce qu'il vérifiait — aucun croisement joué — est ci-dessous.
      expect(appels).toHaveLength(2);
      expect(appels.every((x) => x.options.duration === 800)).toBe(true);
      const croisements = () => appels.filter((x) => x.options.duration !== 800);

      decodeurs[0]();                          // le décodage PÉRIMÉ (a → b) résout enfin, tard
      await Promise.resolve(); await Promise.resolve();
      // Rien ne doit avoir bougé : la génération courante du bloc est déjà celle de b → c.
      expect(croisements()).toEqual([]);

      decodeurs[1]();                          // le décodage COURANT (b → c) résout
      await Promise.resolve(); await Promise.resolve();
      expect(croisements().length).toBeGreaterThan(0);
    });

  // Ronde de correction (reprise de la vague I5) — le masque périmé survivait au croisement
  // courant. `generationsBloc` protégeait le CROISEMENT du morceau dépassé, jamais son MASQUE :
  // celui-ci n'était annulé que par son propre `croiser`, donc jusqu'à 800 ms plus tard. Sur le
  // mur : le nouveau morceau finissait son fondu d'entrée puis redevenait invisible, et le bloc
  // média restait un trou jusqu'à ce que le décodage périmé daigne aboutir.
  it('le masque du morceau dépassé est annulé dès qu\'un morceau plus récent en pose un autre',
    () => {
      const posees: number[] = [];
      const annules: number[] = [];
      const { moteur } = moteurReel({
        decoder: () => new Promise<void>(() => {}),
        // Double d'animation qui ne finit JAMAIS : c'est la seule façon d'observer un `cancel()`,
        // le double par défaut de `moteurReel` résolvant tout de suite.
        animer: () => {
          const mien = posees.length;
          posees.push(mien);
          return { finished: new Promise(() => {}), cancel: () => annules.push(mien) } as any;
        },
      });
      moteur.peindre(rendreCarteMedia(sourceMedia('a', '/aff-a.jpg')));
      moteur.peindre(rendreCarteMedia(sourceMedia('b', '/aff-b.jpg')));   // masque n° 0
      moteur.peindre(rendreCarteMedia(sourceMedia('c', '/aff-c.jpg')));   // masque n° 1
      expect(posees).toHaveLength(2);
      // Le premier masque, et lui seul : le second tient toujours le bloc invisible en attendant
      // l'affiche de « c ».
      expect(annules).toEqual([0]);
    });

  // Re-revue — LE MÊME DÉFAUT PAR LA PORTE D'À CÔTÉ, et il n'existait pas avant cette vague
  // (il n'y avait aucun masque). L'annulation du masque précédent vivait DANS `masquerBloc`, qui
  // n'est appelée que lorsqu'il y a une affiche à attendre. Enchaînement réel : un morceau de
  // musique avec sa jaquette, puis une source qui n'en fournit aucune (YouTube, la télé) — même
  // nœud `bloc:media`. Le masque du premier n'était alors annulé ni par `masquerBloc` (jamais
  // rappelée) ni par le `croiser` du second (dont la fermeture porte `masque = null`) : il tenait
  // `.media` à `opacity: 0` jusqu'à 800 ms APRÈS que le fondu d'entrée du second avait fini de
  // jouer. Un trou noir à la place du lecteur, exactement le symptôme fermé sur le chemin voisin.
  it('le masque tombe aussi quand le morceau suivant n\'a PAS d\'affiche à attendre', () => {
    const posees: number[] = [];
    const annules: number[] = [];
    const { moteur } = moteurReel({
      decoder: () => new Promise<void>(() => {}),   // l'affiche de « b » ne viendra jamais
      animer: () => {
        const mien = posees.length;
        posees.push(mien);
        return { finished: new Promise(() => {}), cancel: () => annules.push(mien) } as any;
      },
    });
    moteur.peindre(rendreCarteMedia(sourceMedia('a', '/aff-a.jpg')));
    moteur.peindre(rendreCarteMedia(sourceMedia('b', '/aff-b.jpg')));   // masque n° 0, en attente
    moteur.peindre(rendreCarteMedia(sourceMedia('c')));                 // SANS affiche : croise net

    // Le croisement de « c » est parti tout de suite (fantôme + fondu d'entrée), donc le masque
    // de « b » n'a plus rien à masquer : il doit être tombé.
    expect(posees.length).toBeGreaterThan(1);
    expect(annules).toContain(0);
  });
});
