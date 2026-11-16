// @vitest-environment jsdom
//
// No text reaches the wall that the catalog did not write or Home Assistant did not send.
//
// Pseudo-localisation, executed: the English catalog is replaced by itself with every string
// wrapped in ⟦…⟧ (a function's result too), every name Home Assistant sends is wrapped in ⁅…⁆, and
// the language is Egyptian Arabic, which has no catalog: the screens fall back to the (wrapped)
// English strings while `Intl` writes dates, numbers and units in Arabic script and digits. The
// screens are then really rendered, and each text node and accessible label is checked: once the
// wrapped parts are taken out, no Latin letter may remain. A literal written in the code — in
// French, in English or in any other Latin-script language — survives the removal and fails the
// test with the text it left, wherever it hides. Nothing here reads source files.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { TemplateResult } from 'lit';
import type { Bouton, Ecran } from '../src/screen-types';
import type { VacuumState } from '../src/boot/vacuum';
import type { VueRecette } from '../src/rendu/recette';

// The suite's setup file has already loaded the real catalogs (`setup-language.ts`): the screens
// are loaded again below, in a fresh module graph where `src/i18n/en` is the wrapped catalog.
vi.doMock('../src/i18n/en', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/i18n/en')>();
  const wrap = (v: unknown): unknown => {
    if (typeof v === 'string') return `⟦${v}⟧`;
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? `⟦${x}⟧` : x));
    return v;
  };
  const pseudo = (node: unknown): unknown => {
    if (typeof node === 'string') return wrap(node);
    if (typeof node === 'function') return (...args: unknown[]) => wrap((node as (...a: unknown[]) => unknown)(...args));
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, pseudo(v)]));
    }
    return node;
  };
  return { ...real, en: pseudo(real.en) };
});

/** The modules under test, from the fresh graph. */
async function load() {
  vi.resetModules();
  return {
    lit: await import('lit'),
    i18n: await import('../src/i18n'),
    Etat: (await import('../src/etat')).Etat,
    repli: await import('../src/rendu/repli'),
    bandeau: await import('../src/rendu/bandeau'),
    agenda: await import('../src/agenda'),
    nuit: await import('../src/rendu/nuit'),
    corps: await import('../src/rendu/corps'),
    taches: await import('../src/rendu/taches'),
    minuteur: await import('../src/rendu/minuteur'),
    vacuum: await import('../src/rendu/vacuum-choice'),
    recette: await import('../src/rendu/recette'),
    pages: await import('../src/recette'),
    recipe: await import('../src/boot/recipe'),
    voiture: await import('../src/rendu/voiture'),
    defaut: await import('../src/rendu/defaut'),
    maison: await import('../src/rendu/maison'),
    tile: await import('../src/rendu/tile'),
    alertes: await import('../src/alertes'),
    stack: await import('../src/rendu/stack'),
    collect: await import('../src/stack/collect'),
    ecran: await import('../src/ecran'),
    aides: await import('./card-aides'),
    boot: await import('./aides'),
  };
}
let M: Awaited<ReturnType<typeof load>>;
beforeAll(async () => { M = await load(); });

/** A name as Home Assistant would send it: marked, so the check can tell it from a literal. */
const ha = (s: string): string => `⁅${s}⁆`;

/** Removes the innermost marked parts first, so that a catalog sentence holding a name or another
 *  catalog sentence is removed whole. */
function unmarked(text: string): string {
  let rest = text;
  for (;;) {
    const next = rest.replace(/⟦[^⟦⟧]*⟧/gu, '').replace(/⁅[^⁅⁆]*⁆/gu, '');
    if (next === rest) return rest;
    rest = next;
  }
}

/** What a person reads, as the texts left once the marked parts are taken out: the text of the
 *  whole tree (a catalog sentence may span several nodes — the band colours the temperature inside
 *  its sentence), and each accessible name (a card button shows an icon and is named by its
 *  `aria-label`). SVG icons carry no text. */
function leftovers(root: Element): string[] {
  const parts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest('svg, style, script')) continue;
    parts.push(n.textContent ?? '');
  }
  const out = [unmarked(parts.join(''))];
  for (const el of root.querySelectorAll('[aria-label], [title], [alt], [placeholder]')) {
    for (const a of ['aria-label', 'title', 'alt', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v !== null) out.push(unmarked(v));
    }
  }
  return out;
}

/** The texts of `root` holding a Latin letter that no catalog and no Home Assistant name explains,
 *  cut into words around them. */
function leaks(root: Element): string[] {
  return leftovers(root).flatMap((s) => s.split(/\s{2,}|\n/u)).map((s) => s.trim())
    .filter((s) => /\p{Script=Latin}/u.test(s));
}

function rendered(t: TemplateResult | string | undefined): HTMLElement {
  const host = document.createElement('div');
  M.lit.render(t === undefined ? M.lit.html`` : t, host);
  return host;
}

const NOW = new Date(2026, 7, 1, 14, 0);

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  M.i18n.setLanguage('ar-EG');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('the check itself', () => {
  it('runs on the wrapped English catalog with Arabic formats', () => {
    expect(leaks(rendered(M.corps.rendreHorsLigne()))).toEqual([]);
    expect(rendered(M.corps.rendreHorsLigne()).textContent).toContain('⟦');
  });

  it('sees a literal left in a template, and a name not marked as coming from Home Assistant', () => {
    expect(leaks(rendered(M.lit.html`<div>Hors ligne</div>`))).toEqual(['Hors ligne']);
    expect(leaks(rendered(M.lit.html`<div aria-label="Back">١</div>`))).toEqual(['Back']);
    expect(leaks(rendered(M.lit.html`<b>${ha('Salon')}</b><i>١٢:٣٠</i>`))).toEqual([]);
  });
});

describe('no hard-coded text on the screens', () => {
  it('the fallback screens', () => {
    for (const screen of [
      M.repli.sessionAbsente(), M.repli.startupError(), M.repli.ecranEnAttente(ha('Salon')),
      M.repli.aucunEcranConfigure(), M.repli.choisirEcran([{ nom: 'salon', titre: ha('Salon') }]),
      M.repli.versionRefusee(ha('Salon')), M.repli.configIllisible(ha('Salon')), M.repli.integrationAbsente(),
      M.repli.ecranDeLaPanne('introuvable', ha('Salon')),
    ]) {
      // The integration's name is a product name, the same in every language (its manifest).
      expect(leaks(rendered(screen)).map((s) => s.replace(/Tablettes murales/g, '').trim())
        .filter((s) => /\p{Script=Latin}/u.test(s))).toEqual([]);
    }
  });

  it('the band: clock, date, temperatures and the pill in every branch', () => {
    const etat = M.aides.etatWith({ 'sensor.room_t': '19.6', 'weather.maison': ['sunny', { temperature: 21.4 }] });
    const days = [
      { datetime: '2026-08-01T00:00:00', condition: 'sunny', temperature: 25 },
      { datetime: '2026-08-02T00:00:00', condition: 'sunny', temperature: 26 },
      { datetime: '2026-08-04T00:00:00', condition: 'lightning-rainy', temperature: 18 },
    ];
    const pills = [
      M.agenda.pastilleBandeau([], days, NOW, false),
      M.agenda.pastilleBandeau([], days.slice(0, 2), NOW, false),
      M.agenda.pastilleBandeau([{ resume: ha('Dentist'), debut: '2026-08-01T15:30:00', estAnniversaire: false }], days, NOW, false),
      M.agenda.pastilleBandeau([{ resume: ha('Anna'), debut: '2026-08-01', estAnniversaire: true }], days, NOW, false),
      M.agenda.pastilleBandeau([], [days[0], { ...days[1], condition: 'exceptional', precipitation: 3 }], NOW, false),
    ];
    for (const pill of pills) {
      expect(pill).not.toBeNull();
      expect(leaks(rendered(M.bandeau.rendreBandeau(etat, 'jour', NOW, 'sensor.room_t', pill)))).toEqual([]);
    }
  });

  it('the night screen', () => {
    const etat = M.aides.etatWith({ 'sensor.capteur_humain_temperature': '19.6', 'lock.aqara_smart_lock_u200_lite': 'locked' });
    expect(leaks(rendered(M.nuit.rendreNuit(etat, new Date(2026, 7, 1, 23, 42), { ...M.ecran.ECRANS.salon, nom: ha('Salon') })))).toEqual([]);
    expect(leaks(rendered(M.nuit.rendreNuit(etat, new Date(2026, 7, 1, 23, 42), { ...M.ecran.ECRANS.salon, nom: ha('Salon') }, true)))).toEqual([]);
  });

  it('the central blocks and the synthesis line', () => {
    expect(leaks(rendered(M.corps.rendreHorsLigne()))).toEqual([]);
    expect(leaks(rendered(M.defaut.renderNextMeal({ etiquette: ha('Dinner'), plat: ha('Soup'), recetteId: 1 } as never)))).toEqual([]);
    expect(leaks(rendered(M.defaut.rendreEntretien([{ uid: 'a', texte: ha('Descale') }, { uid: 'b', texte: ha('Filter') }])))).toEqual([]);
    expect(leaks(rendered(M.defaut.rendreEntretien([{ uid: 'a', texte: ha('Descale') }])))).toEqual([]);
    expect(leaks(rendered(M.defaut.rendreProchainRdv([{ resume: ha('Call'), debut: '2026-08-01T16:30:00', estAnniversaire: false }], NOW)))).toEqual([]);
    expect(leaks(rendered(M.defaut.ligneEtape({ etape: 2, total: 5, restantS: 125 })))).toEqual([]);
    const etat = M.aides.etatWith({ 'binary_sensor.w': 'on' });
    for (const entries of [[], [{ entite: 'binary_sensor.w', operateur: '==', valeur: 'on', texte: ha('window open') }]]) {
      const s = M.corps.ligneSynthese(etat, entries as never);
      expect(leaks(rendered(M.lit.html`${s.texte} ${s.ecarts.join(' ')}`))).toEqual([]);
    }
  });

  it('the alerts', () => {
    const etat = M.aides.etatWith({
      'binary_sensor.distributeur_de_croquettes_probleme': 'on', 'binary_sensor.eversweet_3_pro_uvc_niveau_d_eau': 'on',
      'lock.aqara_smart_lock_u200_lite': 'unlocked',
    });
    const alerts = M.alertes.collecterAlertes(etat, 0);
    expect(alerts).toHaveLength(3);
    // The cat's name is a fact of this house, not a word: it is the one name here not marked.
    for (const a of alerts) expect(unmarked(`${a.sujet} ${a.texte}`).replace('Soraya', '')).not.toMatch(/\p{Script=Latin}/u);
  });

  it('the control tiles, every state they word', () => {
    const tile = (entite: string): Bouton => ({ libelle: ha('X'), icone: 'bulb', entite });
    const cases: [string, string, Record<string, unknown>?][] = [
      ['lock.l', 'locked'], ['lock.l', 'unlocked'], ['lock.l', 'jammed'], ['lock.l', 'opening'], ['lock.l', 'weird'],
      ['cover.c', 'closed'], ['cover.c', 'open', { current_position: 42 }], ['cover.c', 'open'], ['cover.c', 'closing'],
      ['binary_sensor.v', 'on', { device_class: 'window' }], ['binary_sensor.v', 'off', { device_class: 'door' }],
      ['fan.f', 'on'], ['fan.f', 'off'], ['climate.r', 'heat'], ['climate.r', 'off'],
      ['light.a', 'on', { brightness: 128 }], ['light.a', 'on'], ['light.a', 'off'],
    ];
    for (const [id, state, attributes] of cases) {
      const etat = M.aides.etatWith({ [id]: [state, attributes ?? {}] });
      expect(leaks(rendered(M.tile.etiquette(etat, tile(id)))), `${id} ${state}`).toEqual([]);
    }
  });

  it('the car block, idle, charging and while an order is in flight', () => {
    const v = M.ecran.ECRANS.salon.voiture!;
    for (const [states, enVol] of [
      [{ [v.batterie]: '64', [v.autonomie]: '230', [v.branchee]: 'on', [v.enCharge]: 'on' }, null],
      [{ [v.batterie]: '64', [v.clim]: 'on' }, 'arret'],
      [{}, 'demarrage'],
      [{ [v.branchee]: 'on' }, null],
    ] as const) {
      expect(leaks(rendered(M.voiture.rendreVoiture(M.aides.etatWith(states as never), v, enVol as never)))).toEqual([]);
    }
  });

  it('the sub-views: whole house, tasks, timer setting, vacuum choice, recipe', () => {
    const piece: Ecran = { ...M.aides.pieceWith(), nom: ha('Kitchen') };
    const etat = new M.Etat();
    expect(leaks(rendered(M.maison.rendreMaison(etat, piece)))).toEqual([]);
    expect(leaks(rendered(M.maison.rendreMaison(etat, piece, true)))).toEqual([]);
    const tasks = [{ entite: 'todo.a', uid: '1', texte: ha('Bins'), list: ha('Home') }] as never;
    expect(leaks(rendered(M.taches.rendreTaches(tasks, 3, () => true)))).toEqual([]);
    expect(leaks(rendered(M.taches.rendreTaches([], 0, () => false, true)))).toEqual([]);
    expect(leaks(rendered(M.minuteur.rendreReglageMinuteur(7, ha('Pasta'), [ha('Pasta'), ha('Rice')])))).toEqual([]);
    expect(leaks(rendered(M.minuteur.tuileMinuteur(false)))).toEqual([]);
    expect(leaks(rendered(M.minuteur.tuileMinuteur(true, true)))).toEqual([]);

    const robot = { entite: 'vacuum.r', nom: ha('Robot'), pieces: [{ zone: '1', nom: ha('Hall') }], passages: { min: 1, max: 3 } };
    const vacuums: VacuumState[] = [
      { status: 'loading', robots: [], chosen: [], passes: 1, message: null },
      { status: 'failed', robots: [], chosen: [], passes: 1, message: { kind: 'load' } },
      { status: 'ready', robots: [], chosen: [], passes: 1, message: null },
      { status: 'ready', robots: [robot], chosen: [{ entite: 'vacuum.r', zone: '1' }], passes: 2, message: null },
      { status: 'failed', robots: [robot], chosen: [], passes: 1, message: { kind: 'launch', code: 'robot_injoignable' } },
      { status: 'failed', robots: [robot], chosen: [], passes: 1, message: { kind: 'launch', code: null } },
      { status: 'sending', robots: [{ ...robot, passages: { min: 1, max: 1, raison: 'x' } }], chosen: [], passes: 1, message: null },
    ];
    for (const v of vacuums) expect(leaks(rendered(M.vacuum.renderVacuumChoice(v, false)))).toEqual([]);
    expect(leaks(rendered(M.vacuum.renderVacuumChoice(vacuums[3], true)))).toEqual([]);

    const pages = M.pages.pagesDepuisEtapes([
      { position: 1, title: ha('Prep'), instructions: [{ text: ha('Chop') }] },
      { position: 2, instructions: [{ text: ha('Cook') }] },
    ] as never);
    const vue = (over: Partial<VueRecette>): VueRecette => ({
      etiquette: ha('Dinner'), plat: ha('Soup'), pages, page: 0, panneauOuvert: false, horsLigne: false,
      minuteurs: [], slotLibre: true, armee: () => false, pageIngredients: 0, ...over,
    });
    for (const v of [
      vue({}), vue({ page: 1 }), vue({ armee: () => true }), vue({ horsLigne: true }),
      vue({ message: M.recipe.recipeMessage({ kind: 'notPlanned' }) }), vue({ message: M.recipe.recipeMessage({ kind: 'refused', text: null }) }),
      vue({ panneauOuvert: true, ingredients: [] }),
      vue({ panneauOuvert: true, ingredients: [{ nom: ha('Leek'), quantite: ha('2'), manque: true }] }),
    ]) expect(leaks(rendered(M.recette.rendreVueRecette(v)))).toEqual([]);
  });

  it('the stack cards of every appliance type', () => {
    const states: Record<string, string | [string, Record<string, unknown>]> = {
      'vacuum.robot': ['error', { friendly_name: ha('Robot'), battery_level: 40 }],
      'sensor.car_battery': '20', 'binary_sensor.car_plugged': 'on', 'binary_sensor.car_charging': 'on',
      'sensor.car_range': '120', 'number.car_limit': '80', 'sensor.car_end': '2026-08-01T16:10:00',
      'sensor.printer_status': 'running', 'sensor.printer_progress': '42', 'sensor.printer_end': '2026-08-02T09:00:00',
      'sensor.printer_layer': '12', 'sensor.printer_layers': '200', 'sensor.printer_task': ha('Benchy'),
      'binary_sensor.fountain_empty': ['on', { friendly_name: ha('Fountain') }],
      'binary_sensor.fountain_filter': ['on', { friendly_name: ha('Filter') }], 'sensor.filter_days': '3',
      'sensor.plant_a': ['10', { friendly_name: ha('Fern'), unit_of_measurement: '%' }],
      'sensor.plant_b': ['12', { friendly_name: ha('Palm'), unit_of_measurement: '%' }],
      'sensor.treadmill_speed': ['3.5', { unit_of_measurement: ha('km/h') }],
      'sensor.treadmill_steps': ['4210', { unit_of_measurement: ha('steps') }],
      'sensor.air_pm25': ['80', { unit_of_measurement: ha('µg/m³') }],
      'fan.purifier': ['on', { percentage: 60 }],
      'alarm_control_panel.zone_a': ['armed_away', { friendly_name: ha('House'), code_format: 'number' }],
      'alarm_control_panel.zone_b': ['armed_home', { friendly_name: ha('Garage') }],
      'sensor.ink_black': ['5', { friendly_name: ha('Black') }], 'sensor.ink_cyan': ['8', { friendly_name: ha('Cyan') }],
    };
    const room = ha('Office');
    const appareils = [
      { type: 'aspirateur', piece: room, entites: { aspirateur: 'vacuum.robot' } },
      { type: 'voiture', piece: room, entites: { batterie: 'sensor.car_battery', branchee: 'binary_sensor.car_plugged',
        enCharge: 'binary_sensor.car_charging', autonomie: 'sensor.car_range', limite: 'number.car_limit', finCharge: 'sensor.car_end' } },
      { type: 'imprimante', piece: room, entites: { etat: 'sensor.printer_status', progression: 'sensor.printer_progress',
        finTache: 'sensor.printer_end', couche: 'sensor.printer_layer', couchesTotal: 'sensor.printer_layers', tache: 'sensor.printer_task' } },
      { type: 'animaux', piece: room, entites: { fontaineVide: 'binary_sensor.fountain_empty',
        filtre: 'binary_sensor.fountain_filter', joursFiltre: 'sensor.filter_days' } },
      { type: 'plantes', piece: room, seuil: 30, entites: { sondes: ['sensor.plant_a', 'sensor.plant_b'] } },
      { type: 'tapis', piece: room, entites: { vitesse: 'sensor.treadmill_speed', pas: 'sensor.treadmill_steps' } },
      { type: 'air', piece: room, seuil: 35, entites: { pm25: 'sensor.air_pm25', purificateur: 'fan.purifier' } },
      { type: 'alarme', piece: room, entites: { zones: ['alarm_control_panel.zone_a', 'alarm_control_panel.zone_b'] } },
      { type: 'encre', piece: room, seuil: 15, entites: { niveaux: ['sensor.ink_black', 'sensor.ink_cyan'] } },
    ];
    const s = M.aides.screenWith({ etat: M.aides.etatWith(states), piece: M.aides.pieceWith({ nom: room }), snoozed: new Set(), horsLigne: false,
      house: { sources: [], appareils }, vacuum: { status: 'idle', robots: [], chosen: [], passes: 1, message: null },
      recetteUid: 'r', platRecette: ha('Soup'),
      pageSourceIndex: [0, 1], pageRecette: 0 });
    const f = M.aides.frameWith({ timers: [M.aides.running('timer.a', 125, 0, ha('Pasta')), M.aides.running('timer.b', 600, 1)] });
    const cards = M.collect.collectStack(f, s);
    const types = new Set(cards.map((c) => c.type));
    for (const type of ['aspirateur', 'voiture', 'imprimante', 'animaux', 'plantes', 'tapis', 'air', 'alarme', 'encre', 'minuteur']) {
      expect(types, type).toContain(type);
    }
    for (const card of cards) {
      expect(leaks(rendered(M.stack.renderStack([M.collect.frameCard(card, f, s)], 0))), card.type).toEqual([]);
    }
  });

  it('the whole screen of each room, mounted: home, whole house, tasks, timer, and night', async () => {
    // A room's own labels come from its configuration, written in Home Assistant: marked as such.
    const marked = (e: Ecran): Ecran => JSON.parse(JSON.stringify(e), (k, v) =>
      (typeof v === 'string' && ['libelle', 'texte', 'absenceNommee', 'nom', 'note'].includes(k) ? ha(v)
        : k === 'etiquettesMinuteur' && Array.isArray(v) ? v.map(ha) : v));
    // The whole-house list (`TOUTE_LA_MAISON`) is this house's own data written in the code, like
    // `ecran.ts`: its labels name rooms and devices of one house, not words of the interface.
    // Marked as data here; where they should come from instead is a decision left to the owner.
    for (const b of [...M.maison.TOUTE_LA_MAISON, M.maison.ASPIRATEUR_GENERIQUE]) b.libelle = ha(b.libelle);
    for (const room of Object.values(M.ecran.ECRANS)) {
      const piece = marked(room as Ecran);
      const ids = [...piece.commandes, ...piece.ambiances].map((b) => b.entite);
      // A plausible state per domain: a count for a list or a sensor, never a token they cannot have.
      const STATE: Record<string, string> = { todo: '3', sensor: '12', cover: 'open', lock: 'locked', climate: 'heat',
        vacuum: 'docked', binary_sensor: 'off', media_player: 'idle' };
      const etats = ids.map((id): [string, string, Record<string, unknown>] =>
        [id, STATE[id.split('.')[0]] ?? 'on', { friendly_name: ha(id) }]);
      for (const at of [new Date(2026, 7, 1, 14, 0), new Date(2026, 7, 1, 23, 30)]) {
        location.hash = '';
        const m = await M.boot.monterDemarrage(piece, {
          language: 'ar-EG', maintenant: () => at, etats: [
            ...etats, ['weather.maison', 'rainy', { temperature: 12.5 }], [piece.temperature, '19.6', {}],
            ['todo.maintenance', '1', { friendly_name: ha('Maintenance') }],
          ],
          taches: { 'todo.maintenance': [{ uid: '1', texte: ha('Descale') }] },
        });
        expect(leaks(m.racine), `${piece.nom} ${at.getHours()}h`).toEqual([]);
        for (const view of ['#maison', '#taches', '#minuteur']) {
          location.hash = view;
          window.dispatchEvent(new Event('hashchange'));
          await M.boot.vider();
          expect(leaks(m.racine), `${piece.nom} ${view}`).toEqual([]);
        }
        m.silence(60_000);
        await M.boot.vider();
        expect(leaks(m.racine), `${piece.nom} offline`).toEqual([]);
      }
    }
    location.hash = '';
  });
});
