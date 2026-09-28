/** "Toute la maison" view: the application's only level of depth (the owner's touch
 *  constraint — never a gesture, everything through a button). Brings back what the previous
 *  Lovelace redesign had lost: the lights of the other rooms, the curtains, the lock, the
 *  vacuum. Reuses `createPress` (optimistic feedback, `interaction.ts`) via
 *  `brancherAppuiMaison`, wired by `demarrage.ts` — same reason as `brancherAppui` in
 *  `rendu/corps.ts`: `etat`/`cx` only exist inside the closure of `startScreen()`.
 *
 *  Task 8 bis (coordinator's ruling): the brief spoke of a "Toute la maison view of the
 *  kitchen", which did not exist — a single view, shared by the 3 tablets. To give the kitchen
 *  its access to the scanner without forcing it on the living room/office (a food barcode
 *  scanner makes no sense anywhere but in the kitchen) nor making the home screen overflow
 *  (already on a tight budget), the view now receives the room as a parameter and displays the
 *  common `TOUTE_LA_MAISON` list FOLLOWED BY the entries specific to that room
 *  (`piece.extrasMaison`, empty everywhere except in the kitchen). `brancherAppuiMaison` remains
 *  the ONLY press function of this view, shared with `demarrage.ts` (a single instance of
 *  `createPress` for the whole page, see the task 8 report): this parameter only changes the
 *  rendered list, never the press mechanism — a second instance would duplicate the rollback
 *  timers for the same entity visible on both screens, a trap already paid for in this
 *  project. */
import { html, type TemplateResult } from 'lit';
import type { Etat } from '../etat';
import type { Bouton, Ecran } from '../ecran';
import { icone } from './icones';
import { descripteurJauge, fractionJauge } from '../jauge';

/** The generic `TOUTE_LA_MAISON` entry that `piece.aspirateurMaison` REPLACES when it is
 *  declared (never one more tile — the owner's ruling, 2026-08-03).
 *
 *  Exported and compared BY IDENTITY, not by its entity value: since `aspirateurMaison` is
 *  entered from Home Assistant (plan 3c, task 1), a `b.entite === 'vacuum.…'` comparison copied
 *  the same fact fifteen lines away from its source, and the entered tile stopped replacing
 *  anything — silently — the day the table changed vacuums. */
export const ASPIRATEUR_GENERIQUE: Bouton = {
  libelle: 'Aspirateur', icone: 'home', entite: 'vacuum.aspirateur_cuisine',
  service: ['vacuum', 'start'],
};

export const TOUTE_LA_MAISON: Bouton[] = [
  { libelle: 'Salon', icone: 'bulb', entite: 'light.lumiere_salon', service: ['light', 'toggle'] },
  { libelle: 'Cuisine', icone: 'bulb', entite: 'light.lumiere_cuisine', service: ['light', 'toggle'] },
  { libelle: 'Chambre', icone: 'bulb', entite: 'light.lumiere_chambre', service: ['light', 'toggle'] },
  { libelle: 'Bureau', icone: 'bulb', entite: 'light.bureau', service: ['light', 'toggle'] },
  // 2026-08-29: `cover.toggle` replaced by the scripts, as on the home screen of both rooms.
  // `cover.toggle` resolves to `open_cover`/`close_cover`, which these Zigbee motors do NOT carry
  // out to the end — measured on the installation: `open_cover` stops halfway and stays there,
  // so that the next press goes back the other way from an intermediate position. The whole
  // installation works around them with `set_cover_position` (the automations carry the note
  // "workaround bug ZHA open_cover"), and that is what `script.toggle_rideau_*` do.
  // `entite` remains the cover: it is its state and position that we read and adjust by finger.
  // SLIDING never had this defect — `descripteurRideau` (`src/jauge.ts`) already calls
  // `cover.set_cover_position` — only the simple press was wired the wrong way.
  { libelle: 'Rideau salon', icone: 'rideau', entite: 'cover.rideau_salon',
    service: ['script', 'turn_on'], cible: 'script.toggle_rideau_salon' },
  { libelle: 'Rideau cuisine', icone: 'rideau', entite: 'cover.rideau_cuisine',
    service: ['script', 'turn_on'], cible: 'script.toggle_rideau_cuisine' },
  { libelle: 'Chauffage', icone: 'flame', entite: 'climate.radiateur' },
  { libelle: 'Serrure', icone: 'lock', entite: 'lock.aqara_smart_lock_u200_lite', service: ['lock', 'unlock'] },
  // A REPLACED entry, never copied: see the doc of `ASPIRATEUR_GENERIQUE` above.
  ASPIRATEUR_GENERIQUE,
];

let appuyer: (etat: Etat, b: Bouton) => void = () => {};
export function brancherAppuiMaison(fn: (etat: Etat, b: Bouton) => void) { appuyer = fn; }

// Task 13: press/slide dispatcher, same "a single instance shared with the room screen"
// invariant as `brancherAppuiMaison` above (see the header docstring: a second instance would
// duplicate the service-call throttle for the same entity visible on both screens, e.g.
// `light.lumiere_salon`). Unwired default = calls `surBascule` immediately, the behaviour before
// this task (see `rendu/corps.ts`, same choice).
let geste: (ev: PointerEvent, entite: string, surBascule: () => void) => void =
  (_ev, _entite, surBascule) => surBascule();
export function brancherGesteMaison(fn: typeof geste) { geste = fn; }

// Task 9, correction round 1 (coordinator's feedback, IMPORTANT): this view is the worst of the
// three screens for a silent outage — it does not show information, it offers nine actions
// (lights, curtains, heating, LOCK, vacuum). The main remedy is `createPress`/`estHorsLigne`
// (`interaction.ts`), which prevents misleading optimism whatever the room or the view; this
// one is its "signal" complement. No new banner (`.hors-ligne`, `rendu/corps.ts`): this view's
// height budget is already tight (53 px of margin for the most loaded room, see
// `tests/maison.test.ts`), one more block the size of `.alerte`/`.media` (~50-60 px) would risk
// overflowing silently (`#app` in `overflow: hidden`, without scrolling). The label already
// exists on this view and already takes one line whatever its text: replacing it with "Hors
// ligne" (shorter than "Toute la maison", so never an unexpected line wrap) costs zero extra
// height. The `.muet` greying (universal, set on `#app` by `demarrage.ts`) remains the ambient
// reinforcement on this view as on the two others.
export function rendreMaison(etat: Etat, piece: Ecran, horsLigne = false): TemplateResult {
  // Task 12, the owner's ruling (2026-08-03): `piece.aspirateurMaison`, when declared, REPLACES
  // the common entry whose entity is `vacuum.aspirateur_cuisine` (the generic "Aspirateur" tile,
  // full clean of the ground floor) — never one more tile (the 585px budget is already full in
  // the kitchen, see the task 12 report). Absent everywhere else: no change.
  const boutons = [
    ...TOUTE_LA_MAISON.map((b) => (b === ASPIRATEUR_GENERIQUE && piece.aspirateurMaison)
      ? piece.aspirateurMaison : b),
    ...piece.extrasMaison,
  ];
  return html`
    <div class="corps" data-mvt="vue:maison">
      <div class="etiquette ${horsLigne ? 'hl' : ''}">${horsLigne ? 'Hors ligne' : 'Toute la maison'}</div>
      <div class="grille">
        ${boutons
          // Same rule as in `rendu/corps.ts`: what names its absence is never
          // filtered out. The kitchen's "Scanner" tile lives ONLY here.
          .filter((b) => etat.estUtilisable(b.entite) || b.absenceNommee !== undefined)
          .map((b) => {
            // Task 13, same per-domain decision as in `rendu/corps.ts`: "Chauffage" (without
            // `service`), "Serrure"/"Aspirateur" (never a gauge) and the 6 lights/curtains
            // (gauge) are all handled by the same rule, without adding anything to `TOUTE_LA_MAISON`.
            const d = descripteurJauge(b.entite, etat);
            const fraction = d ? fractionJauge(d) : 0;
            // A tile that NAMES its absence gets through the filter above with a
            // silent entity: `etat.lire` then returns `undefined`, and the `!` from before
            // 2026-09-05 would have thrown on the first render. It is inert (no press
            // is wired) and carries its absence label under its name.
            // Absent means missing or `unavailable`: an `unknown` indicator (no meal planned)
            // leaves the pantry panel reachable (see `Etat.isPresent`).
            const absente = !etat.isPresent(b.entite);
            return html`
            <div class="tuile ${!absente && etat.lire(b.entite)!.etat === 'on' ? 'actif' : ''} ${d ? 'jauge' : ''} ${absente ? 'absent' : ''}"
                 style="--jauge:${fraction}"
                 @pointerdown=${(ev: PointerEvent) => (absente ? undefined
                    : geste(ev, b.entite, () => appuyer(etat, b)))}>
              ${icone(b.icone)}<span>${b.libelle}</span>${
                absente ? html`<span class="abs">${b.absenceNommee}</span>` : ''}</div>`;
          })}
      </div>
      <div class="xl" @pointerdown=${() => (location.hash = '')}>${icone('home')}Retour</div>
    </div>`;
}
