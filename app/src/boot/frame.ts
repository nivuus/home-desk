/** What one `dessiner()` knows before it renders anything: the time of day, the resolved media
 *  sources, the timers, and the `ContexteModes` from which `modePrincipal` decides the mode.
 *  PURE with respect to the screen state: reads `Etat`, the clock and the room, writes nothing. */
import { momentDuJour, alerteActive, type Moment } from '../contexte';
import { collecterAlertes, lastMotion } from '../alertes';
import { resoudreSource, type SourceResolue } from '../media';
import { modePrincipal, modulateursActifs, type ContexteModes } from '../modes';
import { estInstantDelorean } from '../rendu/delorean';
import { listerMinuteurs, premierSlotLibre } from '../minuteur';
import type { ScreenState } from './state';

export type Frame = {
  maintenant: Date;
  maintenantMs: number;
  moment: Moment;
  alerte: ReturnType<typeof alerteActive>;
  sources: SourceResolue[];
  vuesMinuteurs: ReturnType<typeof listerMinuteurs>;
  slotLibre: boolean;
  /** The most urgent timer that is actually RUNNING, or `undefined`. `listerMinuteurs` sorts the
   *  active ones first (`minuteur.ts`), so the first of the list is the right one as soon as one
   *  exists — but that is also why `vuesMinuteurs[0]` alone is not enough: without an active
   *  timer, it returns the first PAUSED timer, whose remaining time is frozen. See the `recette`
   *  block in `boot/home.ts`. */
  minuteurActif: ReturnType<typeof listerMinuteurs>[number] | undefined;
  ctx: ContexteModes;
  mode: ReturnType<typeof modePrincipal>;
  modulateurs: ReturnType<typeof modulateursActifs>;
};

export function computeFrame(s: ScreenState): Frame {
  const { etat, piece, agencement } = s;
  const maintenant = s.d.maintenant();
  const soleil = etat.lire('sun.sun')?.etat === 'above_horizon';
  const moment = momentDuJour(maintenant.getHours(), soleil);
  // Task 12 (2026-08-02): the priority is NO LONGER written here. `boot/` reduces the state of the
  // house to a context of plain values, `modePrincipal` (`modes.ts`) decides, and the drawing
  // merely renders the designated mode. That is what makes the priority testable without a
  // browser (`tests/modes.test.ts`), and what prevents a new rule from sneaking into a `?:` —
  // the drift that had ended up making the old `hero()` of `wallpanel.jinja` unreadable.
  // `alerteActive` (`contexte.ts`) is still called here, as since task 8 bis: it feeds the
  // context, it no longer decides the rank on its own.
  //
  // Task 12 review: this block is computed BEFORE the early returns (night, whole house, tasks),
  // and no longer after. Two things depend on it that are not specific to the normal screen: the
  // dark palette forced by the cinema mode (entering a sub-view during a film lit the screen up
  // again in the middle of the living room) and the DeLorean overlay — one of whose four
  // instants, 01:21, falls by definition in the middle of the night, hence behind the first of
  // those returns.
  const maintenantMs = maintenant.getTime();
  const alerte = alerteActive(collecterAlertes(etat, maintenantMs), lastMotion(etat), maintenantMs);

  // All the sources of the room resolved at once: "the screen is on" and "something is playing"
  // are two distinct notions (see `media.ts`) and live on different sources — music can play
  // while the TV is on. `resoudreSource` returns `null` for a source neither on nor playing: what
  // remains always has something to show.
  const sources = piece.sources
    .map((decl) => resoudreSource(etat, decl))
    .filter((x): x is SourceResolue => x !== null);
  const ecranAllume = sources.some((x) => x.allumee);

  const ouvertDepuis = piece.ouvrants
    .filter((id) => etat.estUtilisable(id) && etat.lire(id)!.etat === 'on')
    .map((id) => maintenantMs - etat.lire(id)!.changeLe);
  const meteoEtat = etat.estUtilisable('weather.maison') ? etat.lire('weather.maison')! : undefined;

  // Task 7: the timers of the room — empty (hence `slotLibre === false` and no view) for any room
  // that does not declare `piece.minuteurs` (living room, office). `piece.minuteurs ?? []`
  // everywhere, never a direct access: that is what keeps this optional field treatable as
  // absent without ever crashing.
  const vuesMinuteurs = listerMinuteurs(etat, piece.minuteurs ?? [], maintenantMs);
  const slotLibre = premierSlotLibre(etat, piece.minuteurs ?? []) !== null;
  const minuteurActif = vuesMinuteurs.find((v) => v.actif);
  // Task 10 bis: no more forced closing here if a voice timer takes the last slot while
  // `#minuteur` is open — `ouvrir()` already refuses to open without a free slot, and `start()`
  // already refuses to start without a free slot (`premierSlotLibre === null`, see
  // `brancherMinuteurs` in `boot/controls.ts`): nothing more to do here, the state of HA already
  // prevails over the screen through that double refusal.

  const ctx: ContexteModes = {
    alerte: alerte !== null,
    aspirateurEnMarche: piece.aspirateur !== undefined
      && etat.estUtilisable(piece.aspirateur)
      && ['cleaning', 'returning', 'error'].includes(etat.lire(piece.aspirateur)!.etat),
    ecranAllume,
    sourceJoue: sources.some((x) => x.joue),
    ouvrantOuvertDepuisMs: ouvertDepuis.length ? Math.max(...ouvertDepuis) : 0,
    chauffageEnMarche: etat.lire('climate.radiateur')?.etat === 'heat',
    ilPleut: ['rainy', 'pouring', 'lightning-rainy', 'snowy'].includes(meteoEtat?.etat ?? ''),
    serrureDeverrouillee: etat.lire('lock.aqara_smart_lock_u200_lite')?.etat === 'unlocked',
    temperatureExterieure: Number(meteoEtat?.attributs['temperature'] ?? 0),
    soleilLeve: soleil,
    modeInvites: etat.lire('input_boolean.mode_invites')?.etat === 'on',
    // LOCAL clock, never Home Assistant: the wink survives a connection cut, that is the whole
    // point of `rendu/delorean.ts`. `piece.delorean` first: without it, the kitchen and the office
    // would enter the modulator and hide their screen for eight seconds for a car parked in
    // another room.
    instantDelorean: piece.delorean === true && estInstantDelorean(maintenant),
    minuteurEnCours: vuesMinuteurs.length > 0,
    // Task 11 (2026-08-17): the recipe in progress, collapsed or open. `recetteUid` and not the
    // hash: a COLLAPSED recipe (empty hash) is precisely the state in which this mode must
    // prevail, so that the home view keeps the resume point of the cooking even while a timer
    // runs.
    recetteEnCours: s.recetteUid !== null,
    // Task 14: takes `agencement.blocDefaut` (agencement.ts) as is — A SINGLE way of declaring
    // which default block the room uses, replaces the former `piece.voiture !== undefined` (a
    // presence test that the meal/calendar could not have reused without a second parallel
    // mechanism, see the docstring of this field on `ContexteModes`, `modes.ts`).
    blocDefaut: agencement.blocDefaut,
    // 2026-08-29: deduced from the declaration, never from the name of the room — the living room
    // gave up its "Ambiance" row, and it is that fact, not its identity, that gives it back the
    // ~100 px of the second row of controls (see `combien`, `modes.ts`). A room that took up
    // ambiances again tomorrow would get its former budget back without anyone having to think
    // about it.
    //
    // 2026-09-12 (plan 2, task 5): `|| (piece.minuteurs?.length ?? 0) > 0` added. The template
    // (`rendu/corps.ts`, `piece.ambiances.length || tuileMinuteur`) keeps the row as soon as a
    // timer tile exists, even without a declared ambiance — this context had to say the same
    // thing, or the template would render a row that `combien` did not budget for. Same result on
    // the three screens: only the kitchen declares `minuteurs`, and it already has ambiances (see
    // `ecran.ts`) — the disjunction changes nothing there today, it only protects the day a room
    // has timers without ambiances.
    rangeeAmbiance: piece.ambiances.length > 0 || (piece.minuteurs?.length ?? 0) > 0,
    // Taken as is from the screen's layout (`agencement.ts`) — `modes.ts` never reads a screen
    // itself, exactly as for `blocDefaut` and `rangeeAmbiance`.
    modes: agencement.modes,
    modulateurs: agencement.modulateurs,
    // Final review of plan 2 (I4): `coutEcran` (`modes.ts`) charged for the four zones
    // unconditionally. A zone a screen does not display does not cost its height — same origin
    // and same pattern as `modes`/`modulateurs` above. Same result on the three screens, which all
    // declare the four zones of the default (see `tests/agencement.test.ts`).
    zones: agencement.zones,
    // Taken as is from `Ecran.hauteurUtile` — this module never reads a screen itself, same
    // pattern as `blocDefaut`, `rangeeAmbiance`, `modes` and `modulateurs` above. Absent for the
    // three screens declared today: `combien` then falls back on
    // `BUDGET.hauteurUtileParDefaut` (585, the Fire 7), so this wiring changes the render of no
    // existing room.
    hauteurUtile: piece.hauteurUtile,
  };
  return {
    maintenant, maintenantMs, moment, alerte, sources, vuesMinuteurs, slotLibre, minuteurActif,
    ctx, mode: modePrincipal(ctx), modulateurs: modulateursActifs(ctx),
  };
}
