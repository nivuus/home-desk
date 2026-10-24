/** The page side of `verifier-pile.mjs`, bundled with `src/` by esbuild: the cards of the
 *  stack built from fixture states (no real entity), through the app's own `collectStack`
 *  and `frameCard`, drawn by `renderStack`, swiped by `attachSwipe`. Nothing here decides a
 *  verdict: the Node side measures what this page paints.
 *
 *  Every text that comes from Home Assistant (titles, room names, the robot, the opening) is too
 *  long on purpose, in three scripts: Latin, CJK and Arabic. */
import { html, render } from 'lit';
import { Etat } from '../src/etat';
import { resoudreSource, CAP } from '../src/media';
import { collectStack, frameCard } from '../src/stack/collect';
import { renderStack } from '../src/rendu/stack';
import { attachSwipe } from '../src/stack/swipe';
import { SOLID_TOKENS } from '../src/rendu/card-frame';
import { measureCard } from '../src/boot/card-tones';
import { computeTones, browserSampler } from '../src/rendu/poster-sampler';
import { wireCardActions } from '../src/cards/actions';
import { brancherMedia } from '../src/rendu/media';
import { brancherMinuteur } from '../src/rendu/minuteur';
import { brancherVoiture } from '../src/rendu/voiture';
import { newVacuumState } from '../src/boot/vacuum';
import { frameWith, pieceWith, running, screenWith } from '../tests/card-aides';
import { CALME } from '../tests/contextes';
import { printers } from './pile-fixture-printer.js';
import { reminders } from './pile-fixture-reminders.js';

const MIN = 60_000;
const MUSIC = 'media_player.pile_music';
const TV = 'media_player.pile_tv';
const ROBOT = 'vacuum.pile_robot';
const OPENING = 'binary_sensor.pile_opening';
const CAR = {
  batterie: 'sensor.pile_battery', autonomie: 'sensor.pile_range', branchee: 'binary_sensor.pile_plugged',
  enCharge: 'binary_sensor.pile_charging', clim: 'binary_sensor.pile_clim',
  demarrerClim: 'button.pile_clim_on', arreterClim: 'button.pile_clim_off', limite: 'number.pile_limit',
  finCharge: 'sensor.pile_charge_end', demarrerCharge: 'button.pile_charge_on',
  arreterCharge: 'button.pile_charge_off', boutonLimite: 'button.pile_limit',
};

const TEXTS = {
  latin: {
    room: "Chambre d'amis du deuxième étage, côté jardin, au fond du couloir",
    title: 'Un titre de chanson bien trop long pour tenir sur les deux lignes de la carte de la pile',
    artist: 'Un artiste au nom lui aussi passablement long, avec son orchestre',
    film: 'Un film au titre interminable, version longue restaurée, director’s cut',
    timer: 'Pâtes fraîches du dîner de dimanche soir avec les cousins et les voisins du dessus',
    dish: 'Gratin dauphinois de la grand-mère aux cèpes, à la crème épaisse et au comté affiné',
    robot: 'Robot aspirateur de la cuisine, du séjour et de tout le rez-de-chaussée',
    opening: "Porte-fenêtre du balcon de la chambre d'amis côté jardin (S) Ouverture",
    rooms: ['Cuisine ouverte sur le séjour', "Salle de bains de l'étage", 'Bureau du fond'],
  },
  cjk: {
    room: '二階の奥にある日当たりの良い客用寝室と書斎とその隣の小部屋',
    title: '夜に駆ける — 二行に収まらないほど長い曲名をここに書いて、カードの高さを確かめるための文章',
    artist: '坂本龍一と東京フィルハーモニー交響楽団',
    film: '千と千尋の神隠し — 特別編集版、未公開シーンを含む完全版の長い題名',
    timer: '日曜日の夕食のための手打ちパスタとトマトソースの煮込み',
    dish: 'おばあちゃんのきのこと濃厚クリームのドフィノワ風グラタン、熟成チーズ添え',
    robot: '一階のキッチンとリビングとダイニングを掃除するロボット掃除機',
    opening: '客用寝室のバルコニーに面した大きな掃き出し窓とその横の小窓',
    rooms: ['キッチンとリビング', '二階の浴室と洗面所', '奥の書斎'],
  },
  arabe: {
    room: 'غرفة الضيوف في الطابق الثاني المطلة على الحديقة في آخر الممر',
    title: 'أغنية بعنوان طويل جدا لا يتسع لسطرين كاملين في بطاقة الوسائط على الجهاز اللوحي',
    artist: 'فيروز والأخوان رحباني مع الفرقة الموسيقية الكاملة',
    film: 'فيلم بعنوان طويل جدا في نسخته الكاملة المرممة مع المشاهد المحذوفة',
    timer: 'معكرونة طازجة لعشاء يوم الأحد مع أبناء العم والجيران',
    dish: 'غراتان البطاطس على طريقة الجدة بالفطر والقشدة الكثيفة والجبن المعتق',
    robot: 'مكنسة آلية للمطبخ وغرفة الجلوس والطابق الأرضي بأكمله',
    opening: 'باب الشرفة الزجاجي في غرفة الضيوف المطلة على الحديقة',
    rooms: ['المطبخ المفتوح على الصالة', 'حمام الطابق العلوي', 'المكتب في آخر الممر'],
  },
};
/** Variant `a` and `b` swap every card to its other state (and the posters), so each solid token
 *  a batch-1 card can take is drawn: `timer`/`timer-late`, `charging`/`plug-in`. */
const VARIANTS = {
  a: { posters: ['claire', 'sombre'], late: false },
  b: { posters: ['rayures', 'pastel'], late: true },
};

function fixture(script, variant) {
  const t = TEXTS[script];
  const { posters, late } = VARIANTS[variant];
  const now = Date.now();
  const etat = new Etat();
  const ev = (entity_id, state, attributes = {}) => etat.appliquer({ entity_id, state, attributes });
  const player = (id, title, poster) => ev(id, late ? 'paused' : 'playing', {
    media_title: title, media_artist: t.artist, entity_picture: `/affiche-${poster}.png`,
    media_position: 61, media_duration: 245, volume_level: 0.5,
    supported_features: CAP.PAUSE | CAP.PLAY | CAP.PRECEDENT | CAP.SUIVANT | CAP.VOLUME_SET,
  });
  player(MUSIC, t.title, posters[0]);
  player(TV, t.film, posters[1]);
  const decl = (id, nom) => ({ nom, piece: t.room, titre: [id], sousTitre: [id], affiche: [id],
    progression: [id], transport: [id], volume: [id] });
  const music = resoudreSource(etat, decl(MUSIC, 'Musique'));
  const tv = { ...resoudreSource(etat, decl(TV, 'Télé')), allumee: true };
  ev(ROBOT, late ? 'error' : 'cleaning', { friendly_name: t.robot, battery_level: 62 });
  ev(CAR.batterie, '42'); ev(CAR.autonomie, '210'); ev(CAR.clim, 'off'); ev(CAR.limite, '80');
  ev(CAR.branchee, late ? 'off' : 'on'); ev(CAR.enCharge, late ? 'off' : 'on');
  ev(CAR.finCharge, new Date(now + 120 * MIN).toISOString());
  ev(OPENING, 'on', { friendly_name: t.opening });
  const at = now + 25 * MIN;
  const f = frameWith({
    maintenant: new Date(at), maintenantMs: at, sources: [tv], media: { source: music, remote: true },
    timers: late ? [running('timer.pile_a', 30, 0, t.timer)]
      : [running('timer.pile_a', 600, 0, t.timer), running('timer.pile_b', 1500, 1, t.timer)],
    ctx: { ...CALME, recetteEnCours: true, ouvrantOuvertDepuisMs: 25 * MIN, chauffageEnMarche: true },
  });
  const vacuum = { ...newVacuumState(),
    robots: [{ entite: ROBOT, nom: t.robot, passages: { min: 1, max: 1 },
      pieces: t.rooms.map((nom, i) => ({ zone: `z${i}`, nom })) }],
    chosen: t.rooms.map((_, i) => ({ entite: ROBOT, zone: `z${i}` })) };
  const house = { sources: [], appareils: [...printers(script, variant, t.room, ev, now), ...reminders(script, variant, t.room, ev)] };
  // Offline: the "later" button sends nothing (`laterButton`), there is no connection here.
  const s = screenWith({ etat, piece: pieceWith({ nom: t.room, aspirateur: ROBOT, voiture: CAR,
    ouvrants: [OPENING],
    // Variant `a` declares a plants view: its plants cards carry the details button, `b`'s do not.
    commandes: variant === 'a' ? [{ libelle: 'Plantes', icone: 'list', entite: 'sensor.pile_plant_view', vue: '#plantes' }] : [] }), vacuum, climEnVol: null, snoozed: new Set(), recetteUid: 'pile',
    platRecette: t.dish, pageSourceIndex: [0, 1, 2], pageRecette: 1, horsLigne: true, house });
  const cards = collectStack(f, s);
  // A card that repaints itself (the printer's camera, held) rebuilds its frame, as `dessiner`
  // does on the tablet; the tones already read are kept.
  s.dessiner = () => {
    const before = new Map(current.frames.map((fr) => [fr.key, fr]));
    current.frames = cards.map((c) => {
      const fr = frameCard(c, f, s);
      const old = before.get(fr.key);
      const same = fr.background.kind === 'image' && old?.background.url === fr.background.url;
      return same && old.tones !== undefined ? { ...fr, tones: old.tones } : fr;
    });
    render(renderStack(current.frames, current.index), host());
  };
  return { cards, frames: cards.map((c) => frameCard(c, f, s)), index: 0 };
}

/** One plain card per solid token: every colour a card may take carries the dots once. */
function tokenFixture(script) {
  const t = TEXTS[script];
  const b = (icon, primary) => ({ icon, label: icon, act: () => {}, ...(primary ? { primary: true } : {}) });
  const frames = SOLID_TOKENS.map((token) => ({
    key: `token:${token}`, label: token, title: t.title, subtitle: t.room,
    middle: html`<div class="carte-ligne" dir="auto">${t.rooms[0]}</div>`,
    buttons: [b('home'), b('pause', true), b('list')], background: { kind: 'solid', token },
  }));
  return { cards: SOLID_TOKENS.map((token) => ({ type: token })), frames };
}

let current = null;
const host = () => document.getElementById('pile-host');

window.__setup = (script, variant) => {
  current = variant === 'tokens' ? tokenFixture(script) : fixture(script, variant);
  return current.cards.map((c) => c.type);
};

window.__css = (css) => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
};

/** Places the stack on the frame's bottom edge: the spacer takes what `.corps` has above a
 *  `bloc`-tall block, so a card taller than its budget crosses the 585 px frame. Returns the
 *  bottom the card must reach. */
window.__layout = (bloc) => {
  const corps = document.querySelector('.corps');
  const s = getComputedStyle(corps);
  const px = (v) => Number.parseFloat(v) || 0;
  const free = corps.clientHeight - px(s.paddingTop) - px(s.paddingBottom) - px(s.rowGap);
  document.getElementById('spacer').style.height = `${free - bloc}px`;
  return corps.getBoundingClientRect().bottom - px(s.paddingBottom);
};

/** Shows card `i` in the stack. A picture card is drawn once on the theme, measured, its tones
 *  computed by the app's own sampler, then drawn with them: the sequence `boot/card-tones.ts`
 *  runs on the tablet. */
window.__show = async (i) => {
  const fr = current.frames[i];
  if (fr.background.kind === 'image' && fr.tones?.status !== 'ready') {
    render(renderStack(current.frames, i), host());
    const spec = measureCard(host().querySelector('.carte'));
    const state = await computeTones(fr.background.url, spec, browserSampler, location.origin);
    if (state.status !== 'ready') throw new Error(`poster tones: ${state.status}`);
    current.frames[i] = { ...fr, tones: state };
  }
  current.index = i;
  render(renderStack(current.frames, i), host());
};

/** The touch page: the first card of the Latin stack of `type` (the media card by default) that
 *  carries a button `icon` when one is named, swipeable, every action logged. Every
 *  `pointerdown`/`pointerup` the page receives is logged too, so a scenario can prove that the
 *  contacts it meant to make really reached the card; and every appearance of the printer's
 *  camera picture (`check.camera-seen`), so a scenario can prove it never showed. */
window.__touchSetup = async (type = 'media', icon = undefined) => {
  window.__log = [];
  window.__pointers = [];
  const log = (...a) => window.__log.push(a.slice(0, 2).join('.'));
  wireCardActions(log);
  brancherMedia(log, () => {}, () => {});
  brancherMinuteur({ pause: log, reprendre: log, annuler: log, ajuster: log });
  brancherVoiture({ clim: log });
  for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
    window.addEventListener(type, (e) => window.__pointers.push(`${type}:${e.pointerId}@${Math.round(e.clientX)}`), { capture: true });
  }
  const types = window.__setup('latin', 'a');
  const index = types.findIndex((t, i) => t === type
    && (icon === undefined || current.frames[i].buttons.some((b) => b?.icon === icon)));
  await window.__show(index);
  new MutationObserver(() => {
    if (host().querySelector('.carte-camera') !== null && !window.__log.includes('check.camera-seen')) {
      window.__log.push('check.camera-seen');
    }
  }).observe(host(), { childList: true, subtree: true });
  const h = { count: types.length, index, onTouch: () => {},
    onChange: (n) => { window.__log.push(`swipe.${n}`); h.index = n; window.__show(n); } };
  attachSwipe(host().querySelector('.pile'), h);
  return index;
};
