// @vitest-environment jsdom
//
// The vacuum tiles (2026-10-16): a short press does what the screen configuration says (clean the
// room the tile names), a long press opens `#aspirer` — the rooms each robot maps, in Home
// Assistant's words, and the number of passes the robot accepts. Mounted through the REAL start-up
// (`monterDemarrage`), so the composition of `boot/wiring.ts` is what is under test.
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Ecran } from '../src/ecran';
import { RefusHA } from '../src/connexion';
import { LONG_PRESS_MS, createLongPress } from '../src/long-press';
import { ecranVide, monterDemarrage, vider, type Montage } from './aides';

afterEach(() => { location.hash = ''; });

const piece: Ecran = {
  ...ecranVide,
  ambiances: [{ libelle: 'Aspirer ici', icone: 'aspirateur', entite: 'vacuum.robot_rdc',
                service: ['script', 'turn_on'], cible: 'script.aspirer_ici' }],
};
const ROBOTS = [
  { entite: 'vacuum.robot_etage', nom: 'Aspirateur étage',
    pieces: [{ zone: 'chambre', nom: 'Chambre' }], passages: { min: 1, max: 2 } },
  { entite: 'vacuum.robot_rdc', nom: 'Aspirateur RDC',
    pieces: [{ zone: 'salon', nom: 'Salon' }, { zone: 'cuisine', nom: 'Cuisine' }],
    passages: { min: 1, max: 3 } },
];

function pointer(el: Element, type: string): void {
  el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { clientX: 0, clientY: 0 }));
}

/** `minuteurFn` is a recording double in `monterDemarrage`: the long press fires when the test
 *  runs the callback armed with `LONG_PRESS_MS`, never on a real clock. */
async function tenir(m: Montage, el: Element): Promise<void> {
  pointer(el, 'pointerdown');
  const arme = m.minuteurFn.mock.calls.filter((c) => c[1] === LONG_PRESS_MS).at(-1)!;
  arme[0]();
  window.dispatchEvent(new Event('hashchange'));
  await vider();
}

async function monter(commandes: Record<string, (c: Record<string, unknown>) => unknown> = {}) {
  return monterDemarrage(piece, {
    etats: [['vacuum.robot_rdc', 'docked']],
    commandes: { 'home_desk/aspirateurs': () => ROBOTS, ...commandes },
  });
}

const tuile = (m: Montage) => m.racine.querySelector('[data-mvt="tuile:amb-vacuum.robot_rdc"]')!;
const puce = (m: Montage, texte: string) => [...m.racine.querySelectorAll('.mn-etiquette')]
  .find((e) => e.textContent!.trim().startsWith(texte))!;

describe('vacuum tile', () => {
  it('short press: the configured script, and only on release', async () => {
    const m = await monter();

    pointer(tuile(m), 'pointerdown');
    expect(m.appelerService).not.toHaveBeenCalled();
    pointer(tuile(m), 'pointerup');

    expect(m.appelerService).toHaveBeenCalledWith('script', 'turn_on', { entity_id: 'script.aspirer_ici' });
    expect(location.hash).toBe('');
  });

  it('long press: opens the choice, the held robot first, and launches nothing by itself', async () => {
    const m = await monter();

    const tenue = tuile(m);
    await tenir(m, tenue);
    pointer(tenue, 'pointerup');

    expect(location.hash).toBe('#aspirer');
    expect(m.appelerService).not.toHaveBeenCalled();
    expect([...m.racine.querySelectorAll('[data-robot]')].map((e) => e.getAttribute('data-robot')))
      .toEqual(['vacuum.robot_rdc', 'vacuum.robot_etage']);
    // Robots often share a name in Home Assistant: the rooms alone tell them apart.
    expect(m.racine.textContent).not.toContain('Aspirateur RDC');
    expect([...m.racine.querySelectorAll('[data-zone-ha]')].map((e) => e.textContent!.trim()))
      .toEqual(['Salon', 'Cuisine', 'Chambre']);
    expect(m.racine.querySelector('[data-action="lancer"]')!.classList.contains('inactif')).toBe(true);
  });

  it('rooms of two robots: one launch per robot, in the order tapped, passes bounded by both', async () => {
    const m = await monter({ 'home_desk/aspirer': () => null });
    await tenir(m, tuile(m));

    pointer(puce(m, 'Cuisine'), 'pointerdown'); await vider();
    pointer(puce(m, 'Salon'), 'pointerdown'); await vider();
    expect([...m.racine.querySelectorAll('[data-passages]')].map((e) => e.textContent)).toEqual(['1', '2', '3']);
    pointer(puce(m, 'Chambre'), 'pointerdown'); await vider();
    // The upstairs robot accepts two passes: three is no longer offered.
    expect([...m.racine.querySelectorAll('[data-passages]')].map((e) => e.textContent)).toEqual(['1', '2']);
    pointer(m.racine.querySelector('[data-passages="2"]')!, 'pointerdown'); await vider();
    pointer(m.racine.querySelector('[data-action="lancer"]')!, 'pointerdown'); await vider();

    const lancements = m.envoyerCommande.mock.calls.map((c) => c[0]).filter((c) => c.type === 'home_desk/aspirer');
    expect(lancements).toEqual([
      { type: 'home_desk/aspirer', entite: 'vacuum.robot_rdc', zones: ['cuisine', 'salon'], passages: 2 },
      { type: 'home_desk/aspirer', entite: 'vacuum.robot_etage', zones: ['chambre'], passages: 2 },
    ]);
    expect(location.hash).toBe('');
  });

  it('a refusal is said in words, and the view stays open', async () => {
    const m = await monter({
      'home_desk/aspirer': () => { throw new RefusHA('robot_injoignable', 'no IPv4 address'); },
    });
    await tenir(m, tuile(m));
    pointer(puce(m, 'Salon'), 'pointerdown'); await vider();
    pointer(m.racine.querySelector('[data-action="lancer"]')!, 'pointerdown'); await vider();

    expect(location.hash).toBe('#aspirer');
    expect(m.racine.querySelector('.asp-erreur')!.textContent)
      .toBe('Le ménage n’a pas démarré : le robot ne répond pas.');
  });

  it('a robot held to one pass for a reason says so instead of hiding the passes', async () => {
    const m = await monter({
      'home_desk/aspirateurs': () => [{ ...ROBOTS[1], passages: { min: 1, max: 1, raison: 'timeout' } }],
    });
    await tenir(m, tuile(m));

    expect(m.racine.querySelector('[data-passages]')).toBeNull();
    expect(m.racine.querySelector('.asp-info')!.textContent)
      .toBe('Un seul passage : le robot n’a pas donné ses limites.');
  });

  it('no mapped room: names the Home Assistant setting that is missing', async () => {
    const m = await monter({ 'home_desk/aspirateurs': () => [] });
    await tenir(m, tuile(m));

    expect(m.racine.querySelector('.asp-info')!.textContent).toContain('associer les segments aux pièces');
  });
});

describe('createLongPress', () => {
  function cadre() {
    const minuteur = vi.fn((cb: () => void) => { armes.push(cb); return armes.length as any; });
    const armes: (() => void)[] = [];
    const el = document.createElement('div');
    const court = vi.fn();
    const long = vi.fn();
    el.addEventListener('pointerdown', (ev) => createLongPress(minuteur as any)(ev as PointerEvent, court, long));
    return { el, armes, court, long, minuteur };
  }

  it('a release after the long press does not also fire the short one', () => {
    const c = cadre();
    pointer(c.el, 'pointerdown');
    c.armes[0]();
    pointer(c.el, 'pointerup');
    expect([c.long.mock.calls.length, c.court.mock.calls.length]).toEqual([1, 0]);
    expect(c.minuteur).toHaveBeenCalledWith(expect.any(Function), LONG_PRESS_MS);
  });

  it('a finger that slides is neither', () => {
    const c = cadre();
    pointer(c.el, 'pointerdown');
    const move = new Event('pointermove') as any;
    move.clientX = 500; move.clientY = 0;
    c.el.dispatchEvent(move);
    pointer(c.el, 'pointerup');
    expect([c.long.mock.calls.length, c.court.mock.calls.length]).toEqual([0, 0]);
  });
});
