/** The home view: header + body, with the central block chosen by the mode. Reached by
 *  `dessiner()` (`boot/draw.ts`) when neither the night screen nor a sub-view applies. */
import { html, type TemplateResult } from 'lit';
import type { Moment } from '../contexte';
import type { ContexteModes } from '../modes';
import type { SourceResolue } from '../media';
import { pastilleBandeau } from '../agenda';
import { ancrerProgression } from '../progression';
import { rendreBandeau } from '../rendu/bandeau';
import { rendreCorps, rendreAlerte, rendreHorsLigne } from '../rendu/corps';
import { rendreCarteMedia } from '../rendu/media';
import { rendreMenage, rendreAeration } from '../rendu/modes';
import { rendreMinuteurs, tuileMinuteur } from '../rendu/minuteur';
import { rendreVoiture } from '../rendu/voiture';
import { renderNextMeal, rendreRecetteReduite, rendreProchainRdv, rendreEntretien,
         ENTITE_ENTRETIEN } from '../rendu/defaut';
import { etapeSource } from '../rendu/recette';
import { aplatirTaches } from '../cochage';
import { horlogeMonotone } from './constants';
import { currentMeal } from './recipe';
import type { Frame } from './frame';
import type { ScreenState } from './state';

export function paintHome(
  s: ScreenState, f: Frame, source: SourceResolue | null, momentRendu: Moment,
  survol: () => TemplateResult | string,
): void {
  const { etat, piece, agencement } = s;
  const { maintenant, maintenantMs, alerte, ctx, mode, modulateurs, vuesMinuteurs, slotLibre,
          minuteurActif } = f;

  // `horsLigne` prevails over EVERYTHING, including an alert: displaying an alert as if it were up
  // to date while the connection has been dead for 30 s would be exactly the lie task 9
  // eliminated. It is not a mode — it is the question "is what I show still true?", which comes
  // before that of the rank. All these blocks share the same template (`.t`/`.v`) and REPLACE one
  // another, never in addition: the height of the screen does not move from one mode to another.
  // Task 9 bis: the car's confirmation prevails over optimism — as soon as the sensor says what
  // the gesture asked for, we stop displaying a movement in progress. Same discipline as
  // `Etat.confirme`. Placed here, just before `blocCentral`, hence AFTER the early returns (night,
  // `#maison`, `#taches`): on those views, `climEnVol` stays as it is as long as one does not come
  // back to the normal screen — without visible consequence (none of them renders
  // `.vt-bouton`), and the 3-minute timer set by `brancherClim` (`boot/controls.ts`) remains in
  // any case the safety net that ends up erasing the optimism if nobody ever comes back to the
  // normal screen.
  if (s.climEnVol !== null && piece.voiture) {
    const marche = etat.estUtilisable(piece.voiture.clim)
      && etat.lire(piece.voiture.clim)!.etat === 'on';
    if ((s.climEnVol === 'demarrage') === marche) { s.climEnVol = null; s.jetonClim++; }
  }

  // Task 17: the fallback of the default block. Computed SEPARATELY and kept in a variable for two
  // reasons, not one:
  //   - it serves as the fallback of BOTH blocks (meal in the kitchen, appointment in the office)
  //     without being computed twice;
  //   - it is this REFERENCE that then answers "is the maintenance actually displayed?"
  //     (`blocCentral === replEntretien`, below). A `TemplateResult` is a new object on every
  //     call of `html`: the identity comparison is therefore true for this branch and for it
  //     alone — never for the alert, the timer, the cleaning or any other mode, which each
  //     produce their own object. It is the only way to make the anti-duplicate guard depend on
  //     what is ACTUALLY rendered rather than on the room (see `masquerEntretien`).
  // Computed only for the two rooms that can display it: the living room (`'voiture'`) keeps its
  // block in all circumstances, building it a fallback it never reaches would be dead work on
  // every redraw.
  //
  // Task 17 bis (review, defect D4): the block obeys the `invites` modulator like the summary line
  // it replaces. `todo.maintenance` is declared `perso: true` in the three rooms (`ecran.ts`) and
  // its difference therefore disappears under `input_boolean.mode_invites` (`rendu/corps.ts`) —
  // the central block, for its part, displayed it LARGE and IN DETAIL in the middle of the
  // screen: exactly the data this modulator exists to hide, and more talkative than before task
  // 17. A regression, fixed here.
  // The condition is read on the DECLARATION of the room (`perso` on the summary entry that
  // carries this same entity), never on a "the maintenance is personal" rewritten here: a single
  // declaration for both locations, hence nothing to resynchronise the day the owner changes their
  // mind about what they show their guests.
  // ASSUMED CONSEQUENCE: under guest mode, without a planned meal or a remaining appointment, the
  // ~170 px gap that task 17 filled comes back. That is the behaviour from before that task, and
  // the owner has not ruled otherwise — better a bare background than a list of batteries to
  // change spread out in front of guests.
  const entretienPerso = piece.synthese.some((e) => e.entite === ENTITE_ENTRETIEN && e.perso);
  const replEntretien = (agencement.blocDefaut === 'repas' || agencement.blocDefaut === 'agenda')
    && !(ctx.modeInvites && entretienPerso)
    // Task 17 bis (review, defect D2): the SAME path as the tasks view (`aplatirTaches`,
    // `cochage.ts`), hence the same optimistic removal — never the raw cache. Without it: double
    // press to check off "Purifier — filter to replace", the line disappears from the view,
    // automatic return home 45 s later, and the central block still announced three tasks,
    // quoting the one that had just been checked off, while the summary (at 2) was hidden. The
    // same list, two counts, on the same tablet.
    // `aplatirTaches` returns `TacheAffichee`s (a `{ uid, texte }` enriched with
    // the entity and its list label), which `rendreEntretien` accepts as is without knowing anything of those
    // extra fields.
    ? rendreEntretien(aplatirTaches(s.taches, [ENTITE_ENTRETIEN], s.cochage.estMasquee)) : undefined;

  // Task 10 bis: the setting is no longer a state of this block — it has its own early return
  // (`location.hash === '#minuteur'`, `boot/subviews.ts`), never reached from here.
  const blocCentral =
    s.horsLigne ? rendreHorsLigne()
    : mode === 'alerte' && alerte ? rendreAlerte(alerte)
    // "Recipe" batch: the collapsed recipe comes BEFORE the timer (see `modePrincipal`,
    // `modes.ts`) — the `minuteur` mode displays no control, so without this precedence,
    // starting a cooking would make the only resume point of the recipe disappear. The countdown
    // of the most urgent timer is taken into the block: nothing is lost.
    // FINAL REVIEW — THE STEP NUMBER COUNTS THE SOURCE PAGES, NEVER THE SUB-SPLIT.
    // `pagesRecette.length` (the former value) is the SUB-SPLIT version: it displayed "Step 2/4"
    // on a 3-step recipe. `etapeSource` (`rendu/recette.ts`) reads the `pageSourceIndex` table
    // instead; see its docstring for the passage of the spec that imposes it.
    // The displayed countdown is only taken from a timer ACTUALLY RUNNING (`.actif`):
    // `listerMinuteurs` sorts the active ones first, so `vuesMinuteurs[0]` is a PAUSED timer as
    // soon as none runs — and its remaining time, frozen, was displayed as if it went down. The
    // spec (§4) only promises this countdown "when a timer runs: the most urgent one".
    : mode === 'recette' ? rendreRecetteReduite({
        ...etapeSource(s.pageSourceIndex, s.pageRecette),
        plat: s.platRecette || 'Recette',
        ...(minuteurActif ? { restantS: minuteurActif.restantS } : {}),
      })
    : mode === 'minuteur' ? rendreMinuteurs(vuesMinuteurs, slotLibre)
    : mode === 'menage' && piece.aspirateur ? rendreMenage(etat, piece.aspirateur)
    : (mode === 'cinema' || mode === 'media') && source ? rendreCarteMedia(source, maintenantMs)
    : mode === 'aeration' ? rendreAeration(etat, piece.ouvrants)
    : mode === 'voiture' && piece.voiture ? rendreVoiture(etat, piece.voiture, s.climEnVol)
    // Task 14: the `defaut` mode (formerly `previsions`) no longer has anything to compute itself
    // — `agencement.blocDefaut` says WHICH content (meal, calendar, nothing) belongs to it;
    // `renderNextMeal`/`rendreProchainRdv` (`rendu/defaut.ts`) return `undefined` if there is
    // nothing to show (empty meal plan, no more appointment today), and `blocCentral` then stays
    // `undefined` — exactly the same contract as all the other modes above.
    // Task 17: the meal and the appointment KEEP the priority — the maintenance (`replEntretien`
    // above) only takes the place they leave empty, which, on this installation, is the most
    // common case: meal plan permanently empty, calendar empty from the evening on.
    : agencement.blocDefaut === 'repas' ? renderNextMeal(currentMeal(s)) ?? replEntretien
    : agencement.blocDefaut === 'agenda' ? rendreProchainRdv(s.evenements, maintenant) ?? replEntretien
    : undefined;

  // Task 15 review (I1): the anchor of the rail is set ONLY when the media card is actually on
  // screen. Under `horsLigne` (or under an alert, or during cleaning) it is not: leaving a live
  // anchor would make the tick write `--progression` on a `.media` that does not exist — or
  // worse, on that of a previous render still in the tree.
  // Final review of plan 2 (I4): `agencement.zones.includes('blocCentral')` first. Since task 3
  // made the composition a piece of DATA, "the central block is computed" no longer means "the
  // central block is rendered": a layout that omits the `blocCentral` zone renders nothing at
  // all, and `rendreCorps` does not even place the `TemplateResult` it receives.
  //
  // Second final review, HONESTY ABOUT THIS GUARD: it is UNOBSERVABLE today, and no test holds it.
  // `ancreProgression` is read in only one place, in `tictacProgression`, which already returns
  // on `if (!carte) return;`; and `agencement` is resolved once for the lifetime of the page, so
  // a screen that omits `blocCentral` has a `.media` at NO instant — including in the case "that
  // of a previous render still in the tree" named above, which only arises from a change of
  // MODE, already covered by the `cinema`/`media` term. We keep it anyway: it makes the invariant
  // LOCAL instead of making it depend on a distant `return`, and it costs a comparison. But it
  // protects from nothing we know how to provoke, and saying so is better than lending it a danger
  // that does not exist — it is the third time in this code that a comment promises more than the
  // code does.
  const carteMediaAffichee = agencement.zones.includes('blocCentral')
    && blocCentral !== undefined && !s.horsLigne
    && (mode === 'cinema' || mode === 'media') && source !== null;
  s.ancreProgression = carteMediaAffichee
    ? ancrerProgression(source!.progression, maintenantMs, horlogeMonotone())
    : null;

  // Task 14, correction round 1: `agencement.blocDefaut === 'agenda'` (office) already displays
  // the next appointment LARGE in the central block (`rendreProchainRdv`) — the badge gives up its
  // place on this one piece of data only (`masquerRdv`), never today's birthday, which the block
  // does not show. True that a higher-priority mode (alert, timer...) occupies the central block
  // instead at that precise moment: the badge then stays silent about appointments anyway,
  // consistent with "this room shows its appointments somewhere other than the corner of the
  // header", not with "this precise mode is displayed now".
  const pastille = pastilleBandeau(s.evenements, s.jours, maintenant, modulateurs.includes('invites'),
                                   agencement.blocDefaut === 'agenda');

  // Task 15 review, minor M4: the context given to the BODY describes the screen ACTUALLY
  // rendered, not the one the mode would have produced. Under `horsLigne`, the central block is
  // no longer the media card (twice as tall) but `rendreHorsLigne()` (one line, like an alert) —
  // yet `ordreCommandes` kept cutting the grid down to 2 controls on account of the `media` mode.
  // The screen lost Door and Curtain to render ~90 px of white, precisely when the house no
  // longer answers and the little that remains tappable matters most. A benign consequence, a
  // false invariant: the room freed by the media card only exists if the card is there.
  const ctxCorps: ContexteModes = s.horsLigne
    ? { ...ctx, ecranAllume: false, sourceJoue: false }
    : ctx;

  // Task 17 — anti-duplicate guard, same spirit as `carteMediaAffichee` just above: it is not
  // "this room can display the maintenance", it is "the central block rendered at this instant IS
  // that of the maintenance". A higher-priority mode (alert, timer, cleaning, media, airing) or
  // the offline mode may have confiscated the place, and on an evening when a dish is planned,
  // the kitchen shows the meal: in all those cases the maintenance is written nowhere, so the
  // summary line must keep its mention. `replEntretien !== undefined` excludes along the way the
  // "no task" case (the comparison would then be `undefined === undefined`, true on a screen
  // without any central block — and would cut the summary for nothing).
  //
  // Final review of plan 2 (I4): `agencement.zones.includes('blocCentral')` on top, same reason as
  // for `carteMediaAffichee` above. Without it, a screen whose layout omits the `blocCentral` zone
  // kept "3 maintenance tasks" out of its summary line on the grounds that the central block
  // displayed them — whereas NOTHING displayed them. It is the invariant "the computed central
  // block IS the rendered central block" that task 3 turned into adjustable data.
  const maintenanceShown = agencement.zones.includes('blocCentral')
    && replEntretien !== undefined && blocCentral === replEntretien;

  // Task 7: the 4th tile of the "Ambiance" row, only for a room that declares timers (the
  // kitchen) — absent for the living room/office (`undefined`, never rendered), exactly the
  // contract `rendreCorps` documents for its `tuileMinuteur` parameter.
  //
  // Correction round 1 (coordinator's review): `!slotLibre` alone confused two very different
  // states under the same greyed-out look — "the three timers are running" (truly saturated) and
  // "no `timer.*` state has arrived yet" (page loading, or the ~70 s of silence after an HA
  // restart, see `SEUIL_MUET_MS`): in both cases, `premierSlotLibre` finds no `idle` slot since
  // none is even `estUtilisable`. As long as no state is known, the tile must keep its NORMAL look
  // — a button that looks disabled for a reason nobody can explain is the dead button this
  // project hunts everywhere. `ouvrir()` already refuses on its own if no slot is free (including
  // in that case), so nothing opens wrongly while the first state arrives.
  const auMoinsUnConnu = (piece.minuteurs ?? []).some((t) => etat.estUtilisable(t.timer));
  const tuile = (piece.minuteurs?.length ?? 0) > 0
    ? tuileMinuteur(auMoinsUnConnu && !slotLibre) : undefined;

  // Task 8 (motion engine): the cadence measurement and the degradation that lived here (a single
  // name, `commandes`, and a single `niveau` for the whole screen — a single bad measurement
  // brought the whole wall down) were moved into the engine factory (`mouvement/moteur.ts`), PER ROLE, then removed
  // entirely at task 1 of the grammar project (the same defect, at a different scale: a long
  // frame brought down all the roles measured together, with no way back before a reload). The
  // level is now FIXED, decided once only at mount time — see `src/mouvement.ts`.
  // `.ecran` (2026-08-28) — THE VIEW ROOT OF THE HOME VIEW, header included. The four sub-views
  // declare themselves to the engine through a single element covering the whole frame; the home
  // view, for its part, rendered TWO (header + body) and only marked the second. A crossing only
  // slides the marked element and only keeps its clone in the background
  // (`mouvement/moteur.ts`): the header, left outside the mark, was therefore removed abruptly by
  // `lit` at the first render of the sub-view — the time disappeared SHARPLY and its 121 px band
  // stayed empty during the 320 ms of the gesture (measured in a real Chromium on `#minuteur`,
  // capture at 40 ms). This container changes nothing in the layout: `.ecran` takes over the
  // column `display: flex` of `#app` (see `base.css`), the header keeps its `flex: none` there
  // and the body its `flex: 1`.
  s.moteur.peindre(html`<div class="ecran" data-mvt="vue:accueil">
                          ${rendreBandeau(etat, momentRendu, maintenant, piece.temperature, pastille)}
                          ${rendreCorps(etat, piece, blocCentral, ctxCorps, tuile, maintenanceShown,
                                        (currentMeal(s)?.recetteId ?? null) !== null
                                          || s.recetteUid !== null, agencement)}
                        </div>
                        ${survol()}`);
}
