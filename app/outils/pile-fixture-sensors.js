/** The treadmill, air and ink appliances of `pile-fixture.js`, one state each per variant so every
 *  state is drawn in every script — treadmill `a`: mid-range target with both steps, steps and
 *  distance; `b`: at its top speed (the faster slot empty), no steps, no stop button — air `a`:
 *  the purifier on with its favourite mode and motor speed; `b`: off, no favourite preset, no
 *  motor speed — ink `a`: five levels (more than the card has bars for); `b`: two, one unreadable.
 *  Names from Home Assistant are too long on purpose, in the three scripts. Invented ids only. */

const NAMES = {
  latin: ['Cartouche noire grande capacité de l’imprimante du bureau', 'Cartouche cyan', 'Cartouche magenta du tiroir',
    'Cartouche jaune', 'Cartouche photo gris'],
  cjk: ['事務室のプリンターの大容量ブラックインクカートリッジ', 'シアン', 'マゼンタのインク', 'イエロー', 'フォトグレー'],
  arabe: ['خرطوشة الحبر الأسود كبيرة السعة لطابعة المكتب', 'سماوي', 'أرجواني', 'أصفر', 'رمادي للصور'],
};

export function sensors(script, variant, room, ev) {
  const a = variant === 'a';
  const names = NAMES[script];

  const treadmill = { vitesse: 'sensor.pile_tm_speed', reglageVitesse: 'number.pile_tm_target' };
  ev(treadmill.vitesse, '3.5', { unit_of_measurement: 'km/h' });
  ev(treadmill.reglageVitesse, a ? '3.5' : '6', { step: 0.5, min: 1, max: 6 });
  if (a) {
    Object.assign(treadmill, { pas: 'sensor.pile_tm_steps', distance: 'sensor.pile_tm_distance', arret: 'button.pile_tm_stop' });
    ev(treadmill.pas, '4210', { unit_of_measurement: 'steps' });
    ev(treadmill.distance, '1.8', { unit_of_measurement: 'km' });
    ev(treadmill.arret, 'unknown');
  }

  const air = { pm25: 'sensor.pile_air_pm25', purificateur: 'fan.pile_air_fan' };
  ev(air.pm25, '48', { unit_of_measurement: 'µg/m³' });
  ev(air.purificateur, a ? 'on' : 'off', a ? { preset_modes: ['Auto', 'Silent', 'Favorite'], percentage: 60 }
    : { preset_modes: ['Auto', 'Silent'] });

  const levels = a ? ['85', '12', '60', '40', '9'] : ['70', 'unavailable'];
  const niveaux = levels.map((v, i) => {
    const id = `sensor.pile_ink_${i}`;
    ev(id, v, { friendly_name: names[i], unit_of_measurement: '%' });
    return id;
  });
  if (!a) niveaux.push('sensor.pile_ink_low'), ev('sensor.pile_ink_low', '4', { friendly_name: names[2], unit_of_measurement: '%' });

  return [
    { type: 'tapis', piece: room, entites: treadmill },
    { type: 'air', piece: room, entites: air, seuil: 25 },
    { type: 'encre', piece: room, entites: { niveaux }, seuil: 15 },
  ];
}
