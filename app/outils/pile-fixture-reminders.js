/** The pets and plants appliances of `pile-fixture.js`, split over the two variants so every
 *  state is drawn in every script — pets `a`: the four problems at once, the feeder in reach,
 *  and the filter alone with its days; `b`: the fountain alone, and a feeder fault whose feed
 *  entity has no `min` — plants `a`: four dry probes (the count past the gauges' room), then one
 *  dry among two fine, `b`: a single dry probe, one declaring its own `soil_warning`. Names
 *  from Home Assistant are too long on purpose, in the three scripts. Invented entity ids only. */

const NAMES = {
  latin: {
    pets: ['Fontaine à eau du salon, côté fenêtre, pour les deux chats', 'Distributeur de croquettes du couloir'],
    plants: ['Ficus lyrata du séjour près de la grande baie vitrée', 'Fougère de Boston de la salle de bains',
      'Cactus de Noël de la chambre d’amis', 'Basilic de la cuisine, pot de gauche sur le rebord', 'Pothos du bureau'],
  },
  cjk: {
    pets: ['リビングの窓際にある二匹の猫のための給水器', '廊下にあるキャットフードの自動給餌器'],
    plants: ['大きな掃き出し窓の近くにあるリビングのゴムの木', '浴室のボストンファーン',
      '客用寝室のクリスマスカクタス', 'キッチンの窓辺の左のポットのバジル', '書斎のポトス'],
  },
  arabe: {
    pets: ['نافورة المياه في غرفة الجلوس بجانب النافذة للقطتين', 'موزع الطعام الجاف في الممر'],
    plants: ['شجرة التين الكمانية في غرفة المعيشة قرب النافذة الكبيرة', 'سرخس بوسطن في الحمام',
      'صبار عيد الميلاد في غرفة الضيوف', 'ريحان المطبخ في الأصيص الأيسر على الحافة', 'نبات الجير في المكتب'],
  },
};

/** Per variant: which problems are raised, whether the feeder is declared (and with a `min`). */
const PETS = {
  a: [
    { on: ['fontaineVide', 'filtre', 'panneFontaine', 'panneDistributeur'], feed: 20, days: 4 },
    { on: ['filtre'], feed: 35, days: 0 },
  ],
  b: [
    { on: ['fontaineVide'] },
    { on: ['panneDistributeur'], feed: null },
  ],
};

/** [reading, own soil_warning]; the appliance's `seuil` is 30. */
const PLANTS = {
  a: [
    { probes: [[8], [14], [22], [27]], habit: true },
    { probes: [[12], [55], [48]], habit: true },
  ],
  b: [
    { probes: [[5]], habit: false },
    { probes: [[44, 50], [60]], habit: true },
  ],
};

const ROLES = ['fontaineVide', 'filtre', 'panneFontaine', 'panneDistributeur'];

/** Declares both appliances of `variant` in `ev` (an `Etat` writer); returns them, in the room `room`. */
export function reminders(script, variant, room, ev) {
  const t = NAMES[script];
  const pets = PETS[variant].map((o, n) => {
    const id = (what) => `${what}.pile_pets_${n}`;
    const entites = {};
    for (const r of ROLES) {
      entites[r] = `${id('binary_sensor')}_${r}`;
      ev(entites[r], o.on.includes(r) ? 'on' : 'off', { friendly_name: t.pets[n % 2] });
    }
    if (o.days !== undefined) {
      entites.joursFiltre = `${id('sensor')}_days`;
      ev(entites.joursFiltre, String(o.days));
    }
    if (o.feed !== undefined) {
      entites.nourrir = `${id('number')}_feed`;
      ev(entites.nourrir, '0', o.feed === null ? {} : { min: o.feed });
    }
    return { type: 'animaux', piece: room, entites };
  });
  const plants = PLANTS[variant].map((o, n) => {
    const sondes = o.probes.map(([value, warning], i) => {
      const id = `sensor.pile_plant_${n}_${i}`;
      ev(id, String(value), { friendly_name: t.plants[(n * 2 + i) % t.plants.length],
        ...(warning !== undefined ? { soil_warning: warning } : {}) });
      return id;
    });
    const entites = { sondes };
    if (o.habit) {
      entites.habitude = `input_boolean.pile_plants_${n}_done`;
      ev(entites.habitude, 'off');
    }
    return { type: 'plantes', piece: room, entites, seuil: 30 };
  });
  return [...pets, ...plants];
}
