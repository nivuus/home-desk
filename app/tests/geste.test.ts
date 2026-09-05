// @vitest-environment jsdom
//
// Tâche 13 : distinction appui/glissement (`creerGeste`). Ce fichier prouve, sur `geste()` isolé
// (comme `tests/interaction.test.ts` prouve `creerAppui` isolé) :
//   1. une tuile sans jauge garde le comportement d'origine (bascule immédiate) ;
//   2. le mode hors ligne bloque le geste de la même façon que `creerAppui` bloque l'appui ;
//   3. sous le seuil de déplacement, un geste reste un appui, déclenché au RELÂCHEMENT ;
//   4. au-delà du seuil, la bascule est annulée et un réglage part, avec un envoi final garanti ;
//   5. le débit d'appels de service est limité pendant le glissement, sans jamais poser de
//      minuteur (donc sans jamais pouvoir en accumuler) ;
//   6. la capture de pointeur est utilisée ;
//   7. `pointercancel` ne conclut ni la bascule ni le réglage.
import { describe, it, expect, vi } from 'vitest';
import { Etat } from '../src/etat';
import { creerGeste, SEUIL_PX, DELAI_SECOURS_MS } from '../src/geste';

const ev = (id: string, etat: string, attributes: Record<string, unknown> = {}) =>
  ({ entity_id: id, state: etat, attributes });

/** Élément DOM réel (pour que `addEventListener`/`dispatchEvent` fonctionnent normalement),
 *  avec une géométrie contrôlée — jsdom ne calcule aucune vraie mise en page (`getBoundingClientRect`
 *  y est toujours nul), donc la surcharger est la seule façon de tester la conversion position →
 *  valeur sans un vrai navigateur (cf. `outils/verifier-rendu.mjs`, qui teste ça séparément dans
 *  un vrai Chromium). Largeur 160px, cohérente avec une tuile `.commande`/`.tuile` réelle.
 *  `setPointerCapture`/`releasePointerCapture` : absentes de jsdom (vérifié directement) —
 *  ajoutées ici comme espions pour prouver leur usage (règle du brief : « utilise la capture de
 *  pointeur »), sans quoi `creerGeste` s'appuierait silencieusement sur son repli `?.()`. */
function tuile(): HTMLElement & { setPointerCapture: ReturnType<typeof vi.fn>; releasePointerCapture: ReturnType<typeof vi.fn> } {
  const el = document.createElement('div') as any;
  el.getBoundingClientRect = () => ({ left: 0, right: 160, width: 160, top: 0, bottom: 64, height: 64, x: 0, y: 0, toJSON() {} });
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  document.body.appendChild(el);
  return el;
}

const descendre = (el: HTMLElement, x: number, y = 0) =>
  ({ currentTarget: el, clientX: x, clientY: y, pointerId: 7 }) as unknown as PointerEvent;
const lacher = () => new PointerEvent('pointerup', { pointerId: 7, bubbles: true });

describe('creerGeste — tuile sans jauge : comportement d origine, inchangé', () => {
  it('bascule immédiatement, avant même un pointerup — aucun risque pour les tuiles sans jauge', () => {
    const etat = new Etat();
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'locked'));
    const cx = { appelerService: vi.fn() };
    const surBascule = vi.fn();
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 10), 'lock.aqara_smart_lock_u200_lite', surBascule);

    expect(surBascule).toHaveBeenCalledTimes(1);
    expect(cx.appelerService).not.toHaveBeenCalled();
  });
});

describe('creerGeste — hors ligne : bloqué comme creerAppui, pas seulement l appui', () => {
  it('une entité à jauge, hors ligne : ni bascule ni réglage, aucun listener armé', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    const surBascule = vi.fn();
    const geste = creerGeste(etat, cx, () => true);   // hors ligne
    const el = tuile();

    geste(descendre(el, 10), 'light.lumiere_salon', surBascule);
    expect(surBascule).not.toHaveBeenCalled();
    expect(cx.appelerService).not.toHaveBeenCalled();

    // Preuve qu'aucun écouteur n'a été armé (pas seulement que rien ne s'est passé tout de
    // suite) : un pointerup ultérieur ne déclenche rien non plus.
    el.dispatchEvent(lacher());
    expect(surBascule).not.toHaveBeenCalled();
    expect(cx.appelerService).not.toHaveBeenCalled();
  });
});

describe('creerGeste — sous le seuil : un appui, déclenché au relâchement', () => {
  it('pointerdown puis pointerup sans mouvement : bascule au relâchement, pas au contact', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    const surBascule = vi.fn();
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 10), 'light.lumiere_salon', surBascule);
    expect(surBascule).not.toHaveBeenCalled();   // PAS au contact — c'est tout le sens de la tâche

    el.dispatchEvent(lacher());
    expect(surBascule).toHaveBeenCalledTimes(1);
    expect(cx.appelerService).not.toHaveBeenCalled();   // c'était un appui, pas un réglage
  });

  it('un mouvement franc mais SOUS le seuil reste un appui (un doigt qui tremble ne règle rien)', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    const surBascule = vi.fn();
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 10), 'light.lumiere_salon', surBascule);
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 10 + SEUIL_PX - 2, clientY: 0, pointerId: 7, bubbles: true }));
    el.dispatchEvent(lacher());

    expect(surBascule).toHaveBeenCalledTimes(1);
    expect(cx.appelerService).not.toHaveBeenCalled();
  });
});

describe('creerGeste — au-delà du seuil : réglage, bascule annulée', () => {
  it('un déplacement au-delà du seuil annule la bascule et envoie la valeur finale au relâchement', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    const surBascule = vi.fn();
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 0), 'light.lumiere_salon', surBascule);
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 0, pointerId: 7, bubbles: true }));
    el.dispatchEvent(lacher());

    expect(surBascule).not.toHaveBeenCalled();   // la bascule ne part JAMAIS pour ce geste
    // x=80 sur une tuile de 160px -> 50% -> brightness_pct 50 (voir jauge.test.ts pour la
    // conversion elle-même, déjà prouvée isolément — ici on prouve seulement le CÂBLAGE).
    expect(cx.appelerService).toHaveBeenCalledWith(
      'light', 'turn_on', { entity_id: 'light.lumiere_salon', brightness_pct: 50 },
    );
  });

  it('une fois le seuil dépassé, revenir près du point de départ reste un réglage (pas de retour en arrière)', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    const surBascule = vi.fn();
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 0), 'light.lumiere_salon', surBascule);
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 0, pointerId: 7, bubbles: true }));   // dépasse le seuil
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 1, clientY: 0, pointerId: 7, bubbles: true }));    // revient près du départ
    el.dispatchEvent(lacher());

    expect(surBascule).not.toHaveBeenCalled();   // toujours pas de bascule, même de retour près du départ
    expect(cx.appelerService).toHaveBeenCalled();
  });

  it('climate.radiateur (sans bascule possible) : le glissement règle quand même la consigne', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat', { temperature: 19 }));
    const cx = { appelerService: vi.fn() };
    const surBascule = vi.fn();   // jamais appelé pour climate (pas de service de bascule)
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 0), 'climate.radiateur', surBascule);
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 0, pointerId: 7, bubbles: true }));
    el.dispatchEvent(lacher());

    expect(surBascule).not.toHaveBeenCalled();
    // Relatif : consigne de départ 19 °C, doigt déplacé de +80 px sur 160 de large, soit la
    // moitié de la plage 16–24 → +4 °C. (En absolu, ce même geste aurait donné 20 °C, quelle
    // qu'ait été la consigne de départ — c'est justement ce saut qu'on a supprimé.)
    expect(cx.appelerService).toHaveBeenCalledWith(
      'climate', 'set_temperature', { entity_id: 'climate.radiateur', temperature: 23 },
    );
  });

  it('rideau : le glissement règle set_cover_position', () => {
    const etat = new Etat();
    etat.appliquer(ev('cover.rideau_salon', 'open', { current_position: 87, supported_features: 15 }));
    const cx = { appelerService: vi.fn() };
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 80), 'cover.rideau_salon', vi.fn());
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, pointerId: 7, bubbles: true }));
    el.dispatchEvent(lacher());

    // Relatif : position de départ 87 %, doigt déplacé de −80 px sur 160 de large, soit la
    // moitié de la plage 0–100 → −50 points.
    expect(cx.appelerService).toHaveBeenCalledWith(
      'cover', 'set_cover_position', { entity_id: 'cover.rideau_salon', position: 37 },
    );
  });
  // Tâche 6 (2026-08-02) : « média : le glissement règle volume_set », testée ici à l'origine,
  // est retirée — `descripteurJauge('media_player.*', …)` ne rend plus jamais de descripteur
  // (cf. `descripteurMedia`, supprimée de `jauge.ts`) depuis que la carte média porte son propre
  // contrôle de volume (rail ou boutons − / +, cf. `rendu/media.ts`). Un glissement sur
  // `media_player.*` retombe donc désormais dans le cas « tuile sans jauge » ci-dessus.
});

describe('creerGeste — capture de pointeur', () => {
  it('capture le pointeur au contact, le relâche à la fin du geste', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const geste = creerGeste(etat, { appelerService: vi.fn() }, () => false);
    const el = tuile();

    geste(descendre(el, 0), 'light.lumiere_salon', vi.fn());
    expect(el.setPointerCapture).toHaveBeenCalledWith(7);

    el.dispatchEvent(lacher());
    expect(el.releasePointerCapture).toHaveBeenCalledWith(7);
  });
});

describe('creerGeste — pointercancel : ni bascule ni réglage', () => {
  it('un pointercancel après avoir dépassé le seuil n envoie rien', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    const surBascule = vi.fn();
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 0), 'light.lumiere_salon', surBascule);
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 0, pointerId: 7, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, bubbles: true }));

    expect(surBascule).not.toHaveBeenCalled();
    expect(cx.appelerService).not.toHaveBeenCalled();
  });

  it('un pointercancel avant le seuil n envoie pas non plus la bascule (contrairement à un pointerup)', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const surBascule = vi.fn();
    const geste = creerGeste(etat, { appelerService: vi.fn() }, () => false);
    const el = tuile();

    geste(descendre(el, 0), 'light.lumiere_salon', surBascule);
    el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, bubbles: true }));

    expect(surBascule).not.toHaveBeenCalled();
  });
});

// Contrainte 2 du brief : « limite la fréquence des appels de service, et assure-toi qu'aucun
// minuteur ne s'accumule. Écris le test qui compte les minuteurs vivants après un glissement
// long. » Horloge injectée (`maintenant`) plutôt qu'un vrai minuteur : le débit est limité par
// COMPARAISON D'HORODATAGES dans `geste.ts`, jamais par un `setTimeout` — ce test le prouve des
// deux côtés (peu d'appels malgré beaucoup de mouvements, ET zéro minuteur créé).
describe('creerGeste — débit d appels de service pendant un glissement long', () => {
  it('throttle les appels intermédiaires, mais garantit toujours l envoi final au relâchement', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    let horloge = 0;
    const geste = creerGeste(etat, cx, () => false, () => horloge);
    const el = tuile();

    geste(descendre(el, 0), 'light.lumiere_salon', vi.fn());
    // 50 mouvements, horodatage figé (pas d'écoulement de temps) : sans throttle, ce serait 50
    // appels de service — Zigbee/Matter n'encaisserait jamais ce débit sur un vrai réglage.
    for (let i = 1; i <= 50; i++) {
      el.dispatchEvent(new PointerEvent('pointermove', { clientX: i, clientY: 0, pointerId: 7, bubbles: true }));
    }
    expect(cx.appelerService.mock.calls.length).toBeLessThan(5);

    el.dispatchEvent(lacher());
    // L'envoi final est TOUJOURS présent, throttle ou pas : la dernière position choisie par le
    // doigt ne doit jamais être perdue au relâchement.
    const appels = cx.appelerService.mock.calls;
    const dernierAppel = appels[appels.length - 1];
    expect(dernierAppel[2]).toMatchObject({ brightness_pct: Math.round((50 / 160) * 100) });
  });

  it('le temps qui avance débloque de nouveaux envois (le throttle limite le débit, pas le nombre total)', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    let horloge = 0;
    const geste = creerGeste(etat, cx, () => false, () => horloge);
    const el = tuile();

    geste(descendre(el, 0), 'light.lumiere_salon', vi.fn());
    // Franchit le seuil (SEUIL_PX ≈ 30) dès ce premier mouvement — l'horloge injectée est figée à
    // 0 au moment du contact, donc ce tout premier envoi post-seuil est lui-même throttlé (cf.
    // commentaire de `dernierEnvoi` dans `geste.ts`) : `apres1` doit valoir 0.
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 0, pointerId: 7, bubbles: true }));
    const apres1 = cx.appelerService.mock.calls.length;
    expect(apres1).toBe(0);
    horloge += 200;   // au-delà d'INTERVALLE_MIN_MS
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 0, pointerId: 7, bubbles: true }));
    expect(cx.appelerService.mock.calls.length).toBeGreaterThan(apres1);
  });

  it('aucun minuteur ne s accumule après un glissement long (contrainte explicite du brief)', () => {
    vi.useFakeTimers();
    try {
      const avant = vi.getTimerCount();

      const etat = new Etat();
      etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
      const cx = { appelerService: vi.fn() };
      const geste = creerGeste(etat, cx, () => false);   // horloge par défaut (Date.now, hors fake timers)
      const el = tuile();

      geste(descendre(el, 0), 'light.lumiere_salon', vi.fn());
      for (let i = 1; i <= 200; i++) {
        el.dispatchEvent(new PointerEvent('pointermove', { clientX: i % 160, clientY: 0, pointerId: 7, bubbles: true }));
      }
      el.dispatchEvent(lacher());

      expect(vi.getTimerCount()).toBe(avant);   // pas un minuteur de plus qu'avant le geste
    } finally {
      vi.useRealTimers();
    }
  });
});

// Ronde de correction 4 (relecture de rattrapage, 2026-08-02) : le relecteur a montré qu'un
// booléen `gesteEnCours` unique, partagé par toute l'application (`creerGeste` n'est instancié
// qu'une fois, `demarrage.ts`), fige TOUTES les jauges dès qu'UNE SEULE tuile ne reçoit jamais son
// relâchement (doigt sorti par le bord, évènement perdu, page redessinée pendant le mouvement).
// Ces tests prouvent le remède : verrou par tuile ET par pointeur (une tuile bloquée n'en bloque
// pas d'autres), plus un minuteur de secours qui libère même la tuile bloquée toute seule, sans
// jamais accumuler de minuteur.
describe('creerGeste — verrou par tuile, plus un booléen global (ronde de correction 4)', () => {
  it('un geste jamais relâché sur une tuile ne bloque pas le pointerdown d une AUTRE tuile', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    etat.appliquer(ev('light.lumiere_cuisine', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    const geste = creerGeste(etat, cx, () => false);
    const elSalon = tuile();
    const elCuisine = tuile();

    // Geste sur la tuile Salon qui dépasse le seuil (entre en mode réglage) puis ne reçoit
    // JAMAIS son relâchement — exactement le scénario prouvé par le relecteur.
    geste(descendre(elSalon, 0), 'light.lumiere_salon', vi.fn());
    elSalon.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 0, pointerId: 7, bubbles: true }));
    // (ni pointerup ni pointercancel : le relâchement est perdu, la tuile Salon reste « coincée »)

    // Un pointerdown sur une AUTRE tuile doit fonctionner exactement comme si de rien n'était :
    // avec l'ancien verrou global, ce second appel aurait été ignoré silencieusement (aucun
    // écouteur posé), et ni le pointermove ni le pointerup suivants n'auraient rien déclenché.
    geste(descendre(elCuisine, 0), 'light.lumiere_cuisine', vi.fn());
    elCuisine.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 0, pointerId: 7, bubbles: true }));
    elCuisine.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));

    expect(cx.appelerService).toHaveBeenCalledWith(
      'light', 'turn_on', { entity_id: 'light.lumiere_cuisine', brightness_pct: 50 },
    );
  });

  it('un second pointerdown sur la MÊME tuile, geste déjà en cours, reste ignoré (comportement d origine)', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    const surBascule = vi.fn();
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 10), 'light.lumiere_salon', surBascule);
    // Le WebView de ces tablettes émet parfois plusieurs `pointerdown` pour un même contact
    // physique : un second appel sur la même tuile, même pointeur, ne doit pas réarmer le point
    // de référence — cf. commentaire de `geste.ts`.
    geste(descendre(el, 10), 'light.lumiere_salon', surBascule);
    el.dispatchEvent(lacher());

    expect(surBascule).toHaveBeenCalledTimes(1);   // pas deux, malgré les deux `pointerdown`
  });

  it('un minuteur de secours est posé au contact et nettoyé sans fuite à un relâchement normal', () => {
    vi.useFakeTimers();
    try {
      const etat = new Etat();
      etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
      const cx = { appelerService: vi.fn() };
      const geste = creerGeste(etat, cx, () => false);
      const el = tuile();
      const avant = vi.getTimerCount();

      geste(descendre(el, 0), 'light.lumiere_salon', vi.fn());
      expect(vi.getTimerCount()).toBe(avant + 1);   // le minuteur de secours est bien vivant

      el.dispatchEvent(lacher());
      expect(vi.getTimerCount()).toBe(avant);   // nettoyé au relâchement, aucune fuite
    } finally {
      vi.useRealTimers();
    }
  });

  it('un geste jamais relâché se libère tout seul après le délai de secours, sans fuite de minuteur, et la tuile redevient utilisable', () => {
    vi.useFakeTimers();
    try {
      const etat = new Etat();
      etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
      const cx = { appelerService: vi.fn() };
      const surBascule = vi.fn();
      const geste = creerGeste(etat, cx, () => false);
      const el = tuile();
      const avant = vi.getTimerCount();

      geste(descendre(el, 0), 'light.lumiere_salon', surBascule);
      el.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 0, pointerId: 7, bubbles: true }));
      // relâchement jamais reçu — le doigt est réputé sorti par le bord de l'écran

      vi.advanceTimersByTime(DELAI_SECOURS_MS);
      expect(vi.getTimerCount()).toBe(avant);   // le minuteur de secours s'est nettoyé lui-même
      expect(cx.appelerService).not.toHaveBeenCalled();   // aucune commande envoyée à l'expiration

      // Le verrou est levé : un nouveau geste sur la MÊME tuile fonctionne à nouveau, normalement.
      geste(descendre(el, 0), 'light.lumiere_salon', surBascule);
      el.dispatchEvent(lacher());
      expect(surBascule).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Ronde de correction 5 (2026-08-02) : la ronde de correction 4 avait remplacé le verrou global
// par un verrou composé élément+pointerId — un progrès (une tuile bloquée n'en gèle plus
// d'autres), mais qui rouvrait le défaut d'origine sans qu'aucun test ne le voie : le WebView de
// ces tablettes émet, au cours d'un même glissement physique, un contact FANTÔME parasite qui
// porte son PROPRE identifiant de pointeur, distinct de celui du doigt réel (prouvé par
// `outils/verifier-rendu.mjs --auto-test`, cas « glissement à droite/gauche », contact fantôme
// injecté via CDP dans `glisserAvecFantome`). Un verrou composé avec le pointerId ne bloque pas ce
// fantôme : il ouvrait son propre geste concurrent, avec son propre point de référence, qui
// écrasait ensuite la valeur envoyée par le geste réel. Ce test reproduit ce scénario précis au
// niveau unitaire (`creerGeste` isolé), pour que la régression ne dépende plus seulement du
// garde-fou tactile (Chromium/CDP, plus lent, pas lancé par `npm test`).
describe('creerGeste — contact fantôme à identifiant de pointeur différent, ronde de correction 5', () => {
  it('un pointerdown supplémentaire à IDENTIFIANT DE POINTEUR DIFFÉRENT sur la même tuile, geste déjà en cours, est ignoré (ne réarme pas le point de référence, n appelle pas surBascule)', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    // Horloge figée (jamais un minuteur) : rend l'assertion sur le NOMBRE d'appels déterministe,
    // même patron que les tests de débit ci-dessus (`let horloge = 0`).
    let horloge = 0;
    const geste = creerGeste(etat, cx, () => false, () => horloge);
    const el = tuile();

    // Contact réel : pointerId 7, comme partout ailleurs dans ce fichier.
    geste(descendre(el, 0), 'light.lumiere_salon', vi.fn());
    // Dépasse le seuil (SEUIL_PX ≈ 11) : bascule en mode réglage, point de référence ancré à x=0.
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 0, pointerId: 7, bubbles: true }));

    // Contact FANTÔME : même tuile (même `el`), identifiant de pointeur DIFFÉRENT (8), survenant
    // au milieu du glissement réel. Avec le verrou composé élément+pointerId d'origine, ce second
    // `pointerdown` n'était PAS bloqué (clé différente) : il aurait démarré un second geste,
    // réarmant un point de référence concurrent sur la même tuile.
    const fantome = { currentTarget: el, clientX: 42, clientY: 1, pointerId: 8 } as unknown as PointerEvent;
    const surBasculeFantome = vi.fn();
    geste(fantome, 'light.lumiere_salon', surBasculeFantome);

    // Le geste réel (pointerId 7) continue son glissement, jusqu'à x=80, puis se relâche.
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 0, pointerId: 7, bubbles: true }));
    el.dispatchEvent(lacher());   // pointerup, pointerId 7 (contact réel)

    // Le fantôme n'a ouvert AUCUN geste concurrent : ni bascule, ni second appel de service.
    expect(surBasculeFantome).not.toHaveBeenCalled();
    // x=80 sur une tuile de 160px, départ ancré à x=0 (PAS réarmé par le fantôme à x=42) -> +50
    // points sur la plage 1-100 depuis 0% -> 50%. Un seul appel : la preuve que le point de
    // référence n'a pas été réinitialisé par le contact fantôme en cours de route.
    expect(cx.appelerService).toHaveBeenCalledTimes(1);
    expect(cx.appelerService).toHaveBeenCalledWith(
      'light', 'turn_on', { entity_id: 'light.lumiere_salon', brightness_pct: 50 },
    );
  });
});

// Défaut 2 de la revue de rattrapage : au franchissement du seuil, le point de référence doit
// être RELU depuis l'état réel, pas depuis l'instantané figé au contact initial (`desc`, jamais
// rafraîchi) — sans quoi la réaffectation `valeurDepart = desc.valeur` était un no-op qui donnait
// l'illusion d'un réancrage. Ce test reproduit l'exemple mesuré par le relecteur : une
// automatisation (l'éclairage adaptatif de cette maison) change la lampe ENTRE le contact et le
// franchissement du seuil.
describe('creerGeste — réancrage sur l état RÉEL au franchissement du seuil (pas l état du contact)', () => {
  it('une automatisation qui change la lampe avant le franchissement du seuil : le glissement part de la valeur ACTUELLE', () => {
    const etat = new Etat();
    // Contact initial : lampe à 20 % (51/255).
    etat.appliquer(ev('light.lumiere_salon', 'on', { brightness: 51, supported_color_modes: ['hs'] }));
    const cx = { appelerService: vi.fn() };
    const geste = creerGeste(etat, cx, () => false);
    const el = tuile();

    geste(descendre(el, 0), 'light.lumiere_salon', vi.fn());

    // Une automatisation touche la lampe pendant que le doigt est encore posé, avant tout
    // mouvement suffisant pour franchir le seuil — l'éclairage adaptatif fait exactement ça dans
    // cette maison (cf. CLAUDE.md du dépôt HA). Lampe désormais à 90 % (230/255).
    etat.appliquer(ev('light.lumiere_salon', 'on', { brightness: 230, supported_color_modes: ['hs'] }));

    // Un seul mouvement qui franchit directement le seuil ET fixe la valeur de ce même geste :
    // +81 px sur une tuile de 160, plage 1-100 -> +50 points.
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 81, clientY: 0, pointerId: 7, bubbles: true }));
    el.dispatchEvent(lacher());

    // 90 (valeur ACTUELLE au franchissement) + 50 = 140, borné à 100 — PAS 70 (20 + 50), la
    // valeur qu'aurait produite le no-op d'origine en partant de l'instantané du contact.
    expect(cx.appelerService).toHaveBeenCalledWith(
      'light', 'turn_on', { entity_id: 'light.lumiere_salon', brightness_pct: 100 },
    );
  });
});
