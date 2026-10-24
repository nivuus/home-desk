/** The printer appliances of `pile-fixture.js`: one printer per print state of ha-bambulab
 *  (`cards/printer.ts`), split over the two variants so every state is drawn in every script —
 *  `a`: running, prepare, paused on an error (a filament run out); `b`: slicing, paused, finish,
 *  failed. With and without a cover image, with and without an AMS, one without a stop role.
 *  Invented entity ids only. */

const MIN = 60_000;

const JOBS = {
  latin: {
    job: 'Support de casque articulé avec passe-câble, version renforcée en PETG, plateau 2 sur 3',
    error: "L'emplacement 2 de l'AMS est à court de filament ; chargez une nouvelle bobine pour reprendre",
    trays: ['PLA Basic Orange', 'PETG HF Bleu', 'Vide', 'PLA Mat Blanc ivoire'],
  },
  cjk: {
    job: '関節式ヘッドホンスタンドとケーブルガイド、PETGの補強版、プレート3枚中2枚目',
    error: 'AMSスロット2のフィラメントが切れました。新しいフィラメントを装填して再開してください',
    trays: ['PLA ベーシック オレンジ', 'PETG HF ブルー', '空', 'PLA マット アイボリー'],
  },
  arabe: {
    job: 'حامل سماعات مفصلي مع ممر للكابلات، نسخة معززة من PETG، اللوح الثاني من ثلاثة',
    error: 'نفد الخيط في الفتحة 2 من AMS؛ حمّل بكرة جديدة لاستئناف الطباعة',
    trays: ['PLA أساسي برتقالي', 'PETG HF أزرق', 'فارغ', 'PLA مطفي عاجي'],
  },
};

/** Per variant: [print_status, options]. `cover`/`camera` name a test poster. */
const PRINTERS = {
  a: [
    ['running', { cover: 'sombre', camera: 'claire', ams: true }],
    ['prepare', { ams: true, active: -1 }],
    ['pause', { cover: 'claire', error: true, ams: true }],
  ],
  b: [
    ['slicing', { cover: 'rayures', ams: true }],
    ['pause', { noStop: true }],
    ['finish', { cover: 'pastel', camera: 'sombre', ams: true }],
    ['failed', {}],
  ],
};

const COLOURS = ['#FF6A13FF', '#0A2CA5FF', '#00000000', '#F4EEDCFF'];

/** Declares the printers of `variant` in `ev` (an `Etat` writer); returns their appliances, in
 *  the room `room`. */
export function printers(script, variant, room, ev, now) {
  const t = JOBS[script];
  return PRINTERS[variant].map(([status, o], n) => {
    const id = (what) => `${what}.pile_printer_${n}_${status}`;
    const entites = { etat: id('sensor'), progression: `${id('sensor')}_progress`,
      finTache: `${id('sensor')}_end`, couche: `${id('sensor')}_layer`, couchesTotal: `${id('sensor')}_layers`,
      tache: `${id('sensor')}_task`, pause: `${id('button')}_pause`, reprise: `${id('button')}_resume`,
      erreur: id('binary_sensor') };
    if (!o.noStop) entites.arret = `${id('button')}_stop`;
    ev(entites.etat, status);
    ev(entites.progression, status === 'finish' ? '100' : '64');
    ev(entites.finTache, new Date(now + 135 * MIN).toISOString());
    ev(entites.couche, '187'); ev(entites.couchesTotal, '1240');
    ev(entites.tache, t.job);
    const running = status === 'running';
    const paused = status === 'pause';
    // ha-bambulab: each button is available only in the print states it acts in (`button.py`).
    ev(entites.pause, running ? 'unknown' : 'unavailable');
    ev(entites.reprise, paused ? 'unknown' : 'unavailable');
    if (entites.arret) ev(entites.arret, running || paused ? 'unknown' : 'unavailable');
    ev(entites.erreur, o.error ? 'on' : 'off', o.error ? { code: '0700_8011', error: t.error } : {});
    if (o.cover) {
      entites.couverture = id('image');
      ev(entites.couverture, new Date(now).toISOString(), { entity_picture: `/affiche-${o.cover}.png` });
    }
    if (o.camera) {
      entites.camera = id('camera');
      ev(entites.camera, 'idle', { entity_picture: `/affiche-${o.camera}.png` });
    }
    if (o.ams) {
      entites.ams = COLOURS.map((_, i) => `${id('sensor')}_tray_${i + 1}`);
      entites.ams.forEach((tray, i) => ev(tray, t.trays[i], {
        color: COLOURS[i], empty: i === 2, active: i === (o.active ?? 1),
      }));
    }
    return { type: 'imprimante', piece: room, entites };
  });
}
