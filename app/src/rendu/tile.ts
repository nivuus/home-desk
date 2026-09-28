/** One command tile of the room screen: its colour, its gauge, whether it acts at all, the label
 *  under its name, and the press/gesture wiring it shares with the ambience row.
 *
 *  Moved out of `rendu/corps.ts` on 2026-09-28, which had grown past the 500-line limit: that
 *  file ASSEMBLES the body (zones, their order, the summary line), this one draws a single
 *  command. Nothing but the language of the comments changed in the move. */
import { html } from 'lit';
import type { Etat } from '../etat';
import type { Bouton } from '../ecran';
import { icone } from './icones';
import { descripteurJauge, fractionJauge } from '../jauge';

/** A command is coloured only when the device is active: the colour carries the information,
 *  never a code to remember. `climate.radiateur` (VersatileThermostat) NEVER has the state `on`
 *  — its only possible states are `heat`/`off` (checked in `ha_sync/entities/climate.json`). A
 *  plain `=== 'on'` would therefore leave the "Chauffage" tile grey forever, even while it is
 *  heating: it is not a switch, its on/off notion reads as `!== 'off'`. Domains without an
 *  on/off notion (`todo.*`, counters...) are never coloured — consistent with the wall-tablet
 *  rule: no possible active/inactive state → inactive colour.
 *
 *  Task 19 (2026-08-03): `fan.` and `binary_sensor.` join the rule. Without them, the two added
 *  fans stayed grey while RUNNING and the Velux grey while WIDE OPEN — on a wall screen the colour
 *  is the only information readable from afar, and it would have lied all the time. Both go
 *  through the same `=== 'on'` as the lights, because those really are their HA states
 *  (FanEntity and BinarySensorEntity only know `on`/`off`).
 *  `vacuum.` stays deliberately OUT: "Aspirer ici" is an action launcher, and the wall-tablet rule
 *  (CLAUDE.md of the HA repository) explicitly files vacuum launchers with the scenes, in the
 *  inactive colour — the robot's state is carried by the central block of the `menage` mode, the
 *  sole owner of that information. */
export function commandeActive(id: string, etatBrut: string): boolean {
  if (id.startsWith('climate.')) return etatBrut !== 'off';
  if (id.startsWith('light.') || id.startsWith('switch.')
      || id.startsWith('fan.') || id.startsWith('binary_sensor.')) return etatBrut === 'on';
  return false;
}

export const bouton = (etat: Etat, b: Bouton, actif: boolean, classe: string) => {
  // Task 13: decided PER DOMAIN (`descripteurJauge`), never by the `Bouton` itself — a
  // "Chauffage" command (`climate.radiateur`, without `service`) gets its gauge exactly the same
  // way as a lights command (`light.*`, with `service: ['light','toggle']`): no data to add
  // to `ecran.ts` for that, see the docstring of `jauge.ts`.
  const d = descripteurJauge(b.entite, etat);
  // Task 16 review — CONSISTENCY SETTLED: `jauge.ts` already documents, for the lights, that a
  // gauge that is OFF shows EMPTY rather than lie about a level it no longer has. The heating did
  // not follow that rule — real capture of the living room/office: the heating tile, switched off,
  // carried a half-full olive bar, exactly the visual inconsistency the lights rule exists to
  // avoid. ALIGNED here, but deliberately NOT in the heating descriptor of `jauge.ts`: the gauge
  // value stays the REAL setpoint there, even when off (unlike a brightness, a thermostat setpoint
  // exists and stays adjustable outside heating — see the comment of `descripteurChauffage`) —
  // it is that real value, never a value disguised as 0/16°, that `geste.ts` reads again on every
  // `pointerdown` (`descripteurJauge` is called afresh there) to anchor a slide, including on a
  // tile that is off. Only the displayed FILL is hidden here, exactly as `commandeActive` just
  // above decides the "active" colour per domain at render level rather than in `jauge.ts` —
  // same discipline, same file.
  const jaugeMasquee = b.entite.startsWith('climate.') && !actif;
  const fraction = d && !jaugeMasquee ? fractionJauge(d) : 0;
  // Task 19 — THE OWNER'S RULE: a tile that triggers nothing gives no feedback under the finger;
  // a tile that acts does. What a press really does is already decided elsewhere, and this line
  // only OBSERVES it, without adding anything to `ecran.ts`: `interaction.ts` calls no service
  // and sets no optimism without `service` (and navigates with `lien`), and `geste.ts` only
  // enters its state machine if there is a gauge to slide. A button with none of the three is
  // therefore inert, and `base.css` then removes its `:active` layer and the corner tightening —
  // otherwise it acknowledges an action that does not happen, the "dead button" this project
  // forbids (same treatment as `.ambiance.inactif` and `.vt-bouton.vt-attente`). Today: the
  // office's Velux, and it alone. The HEATING is the counter-test, and it is for it that the
  // condition looks at `d` rather than at `service` alone: without a service either, but
  // adjustable by sliding, so it acts and keeps its feedback.
  // Task 6 (2026-08-17): `vue` (internal navigation, e.g. "Recette") acts just as much as `lien`
  // — `interaction.ts` handles it BEFORE `lien`, it sets a hash — so `!b.vue` joins `!b.lien`
  // here, otherwise the "Recette" tile would falsely deny an action that does happen.
  // Decision 8 (2026-09-05): a command that NAMES its absence gets through the filter with a
  // silent entity. It is inert by construction — no press is wired, `interaction.ts` returns
  // before `vue`/`lien`/`service` — and `base.css` then removes its touch feedback:
  // acknowledging an action that does not happen is the "dead button" this project forbids.
  // Absent means missing or `unavailable`, never `unknown` (see `Etat.isPresent`): a present
  // entity without a value keeps its navigation live.
  const absente = !etat.isPresent(b.entite);
  const inerte = absente || (!b.service && !b.lien && !b.vue && !d);
  return html`
  <div class="${classe} ${actif ? 'actif' : ''} ${d ? 'jauge' : ''} ${inerte ? 'inerte' : ''} ${absente ? 'absent' : ''}"
       data-mvt="tuile:${b.entite}"
       style="--jauge:${fraction}"
       @pointerdown=${(ev: PointerEvent) => geste(ev, b.entite, () => appuyer(etat, b))}>
    ${icone(b.icone)}
    <div><div class="t">${b.libelle}</div>
      <!-- Minor (final review) — the detail:etiq-<entity> mark was removed: it was a DEAD mark.
           .s is rendered unconditionally (never absent/present from one painting to the next),
           its offsetParent is the inner box of the tile (never the root), and it never sets
           data-mvt-etat — none of its possible verdicts (entry/exit, mutation) can therefore
           happen. It was not free for all that: two layout reads (offsetLeft/offsetWidth) per
           tile and per painting, for a verdict that never comes. -->
      <div class="s">${etiquette(etat, b)}</div></div>
  </div>`;
};

// Task 16 review — DEFECT VISIBLE ON SCREEN: `lock.`/`cover.` fell back on `return e.etat`, hence
// Home Assistant's raw state, IN ENGLISH ("locked", "closed"…), captured on the real living-room
// tablet. The rule of the comment below ("never a raw English token, French everywhere including
// on screen") had been written ONLY for `climate.` at task 8/9; the two domains added much later
// by task 5 (`lock.aqara_smart_lock_u200_lite`, `cover.rideau_salon`) had never joined it. Width
// checked in a real browser (Chromium, real font/weight/size of `.commande .s`, 150.5 px tile —
// see the task 16 report): the labels below all fit with at least 17 px of margin on the
// narrowest tile of the fleet; none of them therefore needs a more aggressive shortening.
//
// Never a guessed unknown state: the HA states of `lock.`/`cover.` form a closed enumeration
// (`LockState`/`CoverState`) — anything outside it on an otherwise usable entity
// (`Etat.estUtilisable` has already ruled out `unavailable`/`unknown`/empty) is a real
// integration anomaly, never a value to translate at random. `ETAT_INCONNU` below is neither an
// English word nor an empty string that would leave an unexplained blank on a wall: it is an
// explicit admission, as readable from afar as a translated state.
const ETAT_INCONNU = 'État inconnu';

/** `lock.aqara_smart_lock_u200_lite` (Matter, built-in door sensor — hence `open`/`opening`,
 *  which describe the door leaf, not only the bolt): seven possible HA states, see the brief. */
function libelleSerrure(etatBrut: string): string {
  switch (etatBrut) {
    case 'locked': return 'Verrouillée';
    case 'unlocked': return 'Déverrouillée';
    case 'locking': return 'Verrouille…';
    case 'unlocking': return 'Déverrouille…';
    case 'jammed': return 'Bloquée';
    case 'open': return 'Ouverte';
    case 'opening': return 'Ouverture…';
    default: return ETAT_INCONNU;
  }
}

/** `cover.rideau_salon`/`cover.rideau_cuisine`: four possible HA states. "The curtain has a
 *  position" (task 16 brief) — `current_position` (0-100, the same attribute as
 *  `descripteurRideau`, `jauge.ts`, never computed any other way so as to stay consistent with
 *  what the finger sets there) is shown as long as it is not 100: a half-open curtain says
 *  "Ouvert 42 %", not just "Ouvert", which would lie by omission about a blind that is only half
 *  open. At 100 (or with the attribute missing/unusable — a player without `SET_POSITION`), the
 *  percentage adds nothing: plain "Ouvert". */
function libelleRideau(e: { etat: string; attributs: Record<string, unknown> }): string {
  switch (e.etat) {
    case 'closed': return 'Fermé';
    case 'opening': return 'Ouverture…';
    case 'closing': return 'Fermeture…';
    case 'open': {
      const position = Number(e.attributs['current_position']);
      return Number.isFinite(position) && position < 100 ? `Ouvert ${Math.round(position)} %` : 'Ouvert';
    }
    default: return ETAT_INCONNU;
  }
}

/** Task 19: the openings declared as a COMMAND (the office's Velux today). Decided on
 *  `device_class`, the only thing Home Assistant says about the MEANING of a binary sensor —
 *  never on the entity name, and never on the domain alone: `binary_sensor.` covers a door leaf
 *  as well as a motion detector or a faulty power supply, for which "Ouvert"/"Fermé" would be
 *  nonsense. A sensor of another class (none is declared as a command today) therefore falls
 *  back on the generic fallback further down, unchanged. */
const CLASSES_OUVRANT = new Set(['door', 'window', 'opening', 'garage_door']);

function libelleOuvrant(e: { etat: string; attributs: Record<string, unknown> }): string | null {
  if (!CLASSES_OUVRANT.has(String(e.attributs['device_class'] ?? ''))) return null;
  return e.etat === 'on' ? 'Ouvert' : 'Fermé';
}

export function etiquette(etat: Etat, b: Bouton): string {
  // Called UNCONDITIONALLY from the tile since 2026-09-05: as long as the render only called
  // `etiquette` when `estUtilisable`, an absence label could never have been rendered. This is
  // therefore where the fallback lives, before any state read — `etat.lire` returns `undefined`
  // on a silent entity, and the next line dereferences it.
  // The absence label names a REAL absence only (see `Etat.isPresent`); a present entity without
  // a value (`unknown`) has nothing to say, and its raw English state must never reach the screen.
  if (!etat.isPresent(b.entite)) return b.absenceNommee ?? '';
  if (!etat.estUtilisable(b.entite)) return '';
  const e = etat.lire(b.entite)!;
  // Task 19 — THREE domains that had never reached a command row before that task, and all fell
  // back on the generic fallback at the end of the function, written for the lights. Same
  // defect, and same fix, as `lock.`/`cover.` at task 16: French everywhere on screen is not a
  // preference, it is a constraint of the project.
  //
  // `fan.`: a fan or a purifier is not "switched on", it runs. No percentage shown although
  // `percentage` exists on both devices: these tiles have no gauge (nothing to set by finger, see
  // `jauge.ts`), a number one cannot touch would only make a longer line on a 150.5 px tile.
  if (b.entite.startsWith('fan.')) return e.etat === 'on' ? 'En marche' : 'Arrêté';
  // `binary_sensor.`: a door leaf, when HA declares it as such (see `libelleOuvrant`).
  const ouvrant = b.entite.startsWith('binary_sensor.') ? libelleOuvrant(e) : null;
  if (ouvrant !== null) return ouvrant;
  // `vacuum.`: NOTHING, deliberately — and it is the only empty label of the application.
  // "Aspirer ici" is an action launcher, exactly like the same tile in "Toute la maison", which
  // has only ever shown its name. Two reasons to write nothing here: a vacuum's HA states
  // (`docked`, `cleaning`, `returning`…) are English tokens that would leak as is through the
  // generic fallback; and during a cleaning, the central block of the `menage` mode ALREADY
  // carries that state ("En cours · 100 %") — writing it under the tile as well would put the
  // same data twice on the same tablet, which the project forbids.
  if (b.entite.startsWith('vacuum.')) return '';
  // `climate.radiateur`: `heat`/`off` are internal English tokens of VersatileThermostat, never a
  // label to show as is (project constraint: French everywhere, on screen included). Only these
  // two states exist for this thermostat.
  if (b.entite.startsWith('climate.')) return e.etat === 'off' ? 'Éteint' : 'Chauffe';
  if (b.entite.startsWith('lock.')) return libelleSerrure(e.etat);
  if (b.entite.startsWith('cover.')) return libelleRideau(e);
  if (e.etat === 'on') {
    const l = e.attributs['brightness'];
    return l ? `Allumées ${Math.round((Number(l) / 255) * 100)} %` : 'Allumé';
  }
  return e.etat === 'off' ? 'Éteint' : e.etat;
}

/** Filled in by task 7: the optimistic feedback. */
let appuyer: (etat: Etat, b: Bouton) => void = () => {};
export function brancherAppui(fn: (etat: Etat, b: Bouton) => void) { appuyer = fn; }
/** The wired press, for the other tiles of the body (the ambience row) that share it. */
export function pressTile(etat: Etat, b: Bouton): void { appuyer(etat, b); }

// Task 13: the press/slide dispatcher (the gesture factory of `geste.ts`), wired by `boot/wiring.ts` like
// `appuyer` above (same reason: `etat`/`cx` only exist in its closure). By default (not wired —
// e.g. a test that renders `rendreCorps` without going through the start-up): calls
// `surBascule` immediately, exactly the behaviour from before that task — a test that does not
// exercise the gauge therefore has nothing to change to stay green.
let geste: (ev: PointerEvent, entite: string, surBascule: () => void) => void =
  (_ev, _entite, surBascule) => surBascule();
export function brancherGeste(fn: typeof geste) { geste = fn; }
