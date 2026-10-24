/** The meal, pantry and alarm cards of `pile-fixture.js`, one state each per variant so every
 *  state is drawn in every script — meal `a`: a recipe, missing ingredients, a picture, the
 *  validate script and the shopping list; `b`: a note with no recipe, nothing missing, no picture,
 *  no readable script, no shopping list — pantry `a`: five products (two hidden), the shopping
 *  list; `b`: one shortage alone — alarm `a`: two zones armed, no code (the disarm button); `b`:
 *  one zone armed with a code (the middle says so, the slot is empty). Names from Home Assistant
 *  are too long on purpose, in the three scripts. Invented entity ids only, except the home-stock
 *  ones the app itself declares (`garde-manger.ts`). */
import { AGENDA_REPAS, CAPTEUR_EXPIRATIONS, CAPTEUR_MANQUES, CAPTEUR_REPAS, LISTE_COURSES,
  SCRIPT_VALIDER_REPAS } from '../src/garde-manger';

const MIN = 60_000;
const pad = (n) => String(n).padStart(2, '0');
const stamp = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const NAMES = {
  latin: { products: ['Lait entier demi-écrémé de la ferme du village voisin, bouteille de un litre', 'Œufs frais de poules élevées en plein air',
    'Beurre doux de baratte à la fleur de sel de Guérande', 'Farine de blé T55 pour la pâtisserie', 'Sel fin'],
  zones: ['Rez-de-chaussée : salon, cuisine et couloir d’entrée', 'Garage et atelier du fond du jardin', 'Étage'] },
  cjk: { products: ['近所の農場で作られた低脂肪の牛乳、一リットル入りのボトル', '放し飼いの鶏の新鮮な卵', 'ゲランドの塩を使った伝統的な手作りバター',
    '製菓用の小麦粉T55', '食塩'],
  zones: ['一階：リビング、キッチン、玄関ホール', '庭の奥にあるガレージと作業小屋', '二階'] },
  arabe: { products: ['حليب كامل الدسم من مزرعة القرية المجاورة في زجاجة سعة لتر واحد', 'بيض طازج من دجاج يربى في الهواء الطلق',
    'زبدة طبيعية مملحة بملح غيراند', 'دقيق قمح للحلويات', 'ملح ناعم'],
  zones: ['الطابق الأرضي: غرفة الجلوس والمطبخ وممر المدخل', 'المرآب وورشة نهاية الحديقة', 'الطابق العلوي'] },
};

/** Declares the three cards in `ev` (an `Etat` writer) and returns what `fixture()` needs: the
 *  screen's own commands (the views it declares), its shopping list, and the alarm appliance. */
export function kitchen(script, variant, room, ev, at, dish) {
  const a = variant === 'a';
  const t = NAMES[script];
  ev(CAPTEUR_REPAS, dish, { day: '2026-08-01', slot: 'dinner', meal_id: 7, recipe_id: a ? 12 : null,
    missing_ingredients: a ? 2 : 0, ...(a ? { entity_picture: '/affiche-rayures.png' } : {}) });
  ev(AGENDA_REPAS, 'off', { start_time: stamp(at + 30 * MIN), message: dish });
  ev(SCRIPT_VALIDER_REPAS, a ? 'off' : 'unavailable');
  const expiring = a ? t.products.slice(0, 3) : [];
  const short = a ? t.products.slice(3) : [t.products[3]];
  ev(CAPTEUR_EXPIRATIONS, expiring.length ? 'on' : 'off',
    { batches: expiring.map((product_name, i) => ({ batch_id: i, product_name, best_before: '2026-08-02', display: '1' })) });
  ev(CAPTEUR_MANQUES, 'on', { products: short });
  const zones = t.zones.map((name, i) => {
    const id = `alarm_control_panel.pile_zone_${i}`;
    const armed = a ? i < 2 : i === 0;
    ev(id, armed ? 'armed_away' : 'disarmed', { friendly_name: name, code_format: a ? null : 'number' });
    return id;
  });
  return {
    commands: [{ libelle: 'Recette', icone: 'book', entite: CAPTEUR_REPAS, vue: '#recette' },
      { libelle: 'Garde-manger', icone: 'jar', entite: CAPTEUR_EXPIRATIONS, vue: '#garde-manger' }],
    shopping: a ? [LISTE_COURSES] : [],
    appliances: [{ type: 'alarme', piece: room, entites: { zones } }],
  };
}
