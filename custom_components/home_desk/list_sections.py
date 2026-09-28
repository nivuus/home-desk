"""The common skeleton of the "list" sections of a screen's menu: command
tiles, ambiance row, "house extras" tiles, watched openings, summary line,
media sources, timers and the extra to-do lists. ONE SINGLE shape — choose/add,
edit, move up, move down, delete — written here once and reused by
`EcranSubentryFlow` (config_flow.py) for all of them. What each section has
that is SPECIFIC (its fields, its selectors, the building/displaying of an
item) lives in `list_fields.py` — split from here to keep each under 500
lines, never at an arbitrary line count: it is the seam that task 6 itself
describes ("they differ by their fields, not by their shape").

**Checked against the real Home Assistant 2026.9.1 sources** (same approach
as config_flow.py, see its task report):

- `ConfigSubentryFlowManager.async_create_flow` sets
  `subentry_flow.init_step = context["source"]`: the ENTRY step of a
  subentry flow carries the NAME of the source. For a creation, the source is
  `SOURCE_USER` ("user"), hence `async_step_user` (task 5). To EDIT an
  EXISTING subentry, the source is `SOURCE_RECONFIGURE` ("reconfigure"): the
  entry point is therefore `async_step_reconfigure`, and the context must
  carry `subentry_id` — `ConfigSubentryFlow._get_reconfigure_subentry()`
  reads it from `self.context["subentry_id"]` and raises if it is missing.
- `FlowManager._async_configure` (data_entry_flow.py): when the current
  step is a MENU and the user picks an option, HA directly calls
  `async_step_<option>(None)` — never with the `user_input` of the menu
  itself (the `data_schema(user_input)` block described in the next point
  applies anyway, even on a MENU: HA builds
  `vol.Schema({"next_step_id": vol.In(...)})` itself to validate it). An
  `async_show_menu(menu_options=[...])` therefore routes TO a step named
  after each option: the section names (`commandes`, `ambiances`,
  `extrasMaison`, `ouvrants`, `synthese`) are both the data keys AND the
  names of the steps they trigger.
- The SAME method ALSO applies `data_schema(user_input)` before calling the
  current step, as soon as `data_schema` is present on the step, WHATEVER
  the type of that step (checked by reading `data_entry_flow.py`, the
  `_async_configure` loop, lines 355-377: the block runs unconditionally —
  a MENU builds its own `vol.Schema({"next_step_id": vol.In(...)})`, which
  goes through the same block). A `data_schema` violation (wrong type,
  option outside the enum) therefore surfaces as an `InvalidData`
  EXCEPTION, never as a form redisplayed with errors: the only way to get
  an ergonomic refusal (`errors={...}`) is to keep `data_schema` loose
  (`str` types, selectors that only enforce an entity's DOMAIN or
  membership of an already-correct ENUM) and to perform the business
  refusal OURSELVES, exactly as `EcranSubentryFlow.async_step_user` already
  does for the budget and the height bounds. `section.valider`
  (schema.BOUTON / schema.SYNTHESE / schema.ENTITE) is therefore replayed BY
  HAND on the BUILT result (`section.build_data`), never entrusted to
  `data_schema`.

**Immediate persistence, never a creation at the end of the journey.** A
"screen" subentry already exists (created by `async_step_user`, task 5)
before any list section is opened: there is therefore nothing to "create"
here, only to UPDATE. Every gesture (add, save, move up, move down, delete)
calls `ConfigSubentryFlow._async_update` (immediate write, without ending
the flow) then redisplays a step — never `async_create_entry`: that one
requires `self.source == SOURCE_USER`
(`ConfigSubentryFlow.async_create_entry`) and raises under
`SOURCE_RECONFIGURE`, the source of THIS flow.

**Review round 1, three structural fixes:**

1. **Critical — a save silently overwrote the fields outside the form.**
   `elements[index] = valide` replaced the WHOLE item with the form's
   validated result alone; a tile carrying `service`, `vue`, `epingle`,
   `absenceNommee` or `lien`, edited for its `libelle` alone, silently lost
   the other five — a tile that acted only through `service` literally
   became the dead button this repository forbids itself. Two cumulative
   fixes, in `list_fields.py`: (a) the five fields now join the form —
   there is no longer any contract field this form ignores; (b)
   `_fusionner()` keeps from the existing item ONLY the fields this form
   DOES NOT MANAGE (`CHAMPS_BOUTON`/`CHAMPS_SYNTHESE`), as a defence for a
   future contract field the form would not have caught up with yet —
   never triggered in practice today, since (a) already covers everything.
2. **Important — a refusal on input lost what the user had just typed.**
   `existant` (the STORED values) served as suggested values EVEN after a
   refusal: a refused addition (hence `existant = None`) redisplayed an
   EMPTY form, not the faulty input. `displayed_values` now distinguishes
   the initial display (the stored values, via `section.display`) from the
   redisplay after an error (the user's raw input, `user_input`).
3. **Important — the "add" sentinel shared the `choix` field with real item
   indexes**, which prevented translating its option cleanly (a
   `SelectSelector` cannot mix translated options and DATA options under
   the same `translation_key`). The section menu now carries TWO fields:
   `nouveau` (a `BooleanSelector`, translated like any field through its  (policy: allow-fr, field key)
   LABEL, never an option) and `element` (a dynamic `SelectSelector`,
   present only if items already exist, its options being the REAL
   labels). `geste`, for its part, only has FIXED values (the four
   gestures): `translation_key` applies to it cleanly
   (`list_common._selecteur_geste`).
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigSubentry
from homeassistant.helpers import selector

from .const import (
    ACTION_MOVE_DOWN,
    ACTION_SAVE,
    ACTION_MOVE_UP,
    ACTION_DELETE,
    ERROR_POWERED_ON_INCOMPLETE,
    ERROR_FIELD_INVALID,
    ERROR_FIELD_EMPTY,
    ERROR_RECIPE_WITHOUT_MODE,
    ERROR_SELECTION_MISSING,
    ERROR_SERVICE_INCOMPLETE,
)
from .formulaire import reafficher
# Review round 1 (Critical): checks the COMPLETE screen before any
# persist — see garde_ecran.py for the three paths its absence let
# through silently. Round 2: `garde_ecran.persister_si_valide` also
# became THE single write site of the package — imported as a MODULE (not
# just a function) so that this module never again has to name
# `_async_update` itself.
from . import garde_ecran
# `SECTIONS`/`Section` stay imported HERE for this module's INTERNAL use
# (`_async_step_section*` below), but are no longer re-exported since
# review round 2: two valid addresses for the same object
# (`from .list_sections import SECTIONS` AND `from .list_fields import SECTIONS`)
# are a divergence waiting to happen — the day one of the two copies moves
# without the other (an `__all__` that forgets to follow a rename, for
# example), nothing reports it. `list_fields.py` IS their definition: it is
# therefore the ONLY canonical address, including for config_flow.py.
from .list_fields import SECTIONS, Section, ChampVide, ServiceIncomplet
# Task 7: `AllumeeIncomplete` (the allumee_entite/allumee_etats pair of
# $defs/source, half filled) imported directly from
# `list_fields_sources` rather than re-exported by `list_fields.py` — the
# latter re-exports ONLY what `config_flow.py` also consumes
# (`SECTIONS`, `Section`, `ChampVide`, `ServiceIncomplet`, already common to
# BOTH modules); `AllumeeIncomplete` is only needed HERE.
from .list_fields_sources import AllumeeIncomplete
# Decision 7 of the spec, held in task 7: an entity unknown to the
# registry WARNS, never refuses (see registre.py). Final branch review
# (C1): `avertissement_entites_inconnues` replaces the former direct call
# to `entites_inconnues` -- it is now the one that carries the (translated)
# SENTENCE, this module only supplying the LIST as input.
from .registre import avertissement_entites_inconnues, entities_in
# Fix round 1 (defect B): what NAMES a fault (the _ERROR_BY_KEYWORD table
# and _localiser_champ) was EXTRACTED to list_errors.py -- the same seam as
# schema.py/fautes.py, a byte-for-byte move, never rewritten (see
# list_errors.py). objets.py now imports both names from THE SAME address.
from .list_errors import _ERROR_BY_KEYWORD, _localiser_champ

__all__ = ["ListSectionsMixin"]


def _schema_choix(elements: list, section: Section) -> vol.Schema:
    """The brief's "add | choose" menu, on TWO fields rather than a shared
    sentinel (round 1, point 3 of the module docstring): `nouveau` (a  (policy: allow-fr, field key)
    boolean, translated through its LABEL — never an option) triggers a
    blank item; `choix` (dynamic, absent while the section is still empty)
    picks an existing item by its real label. Field name aligned with
    `translations/fr.json`/`en.json`
    (`config_subentries.ecran.step.<section>.data.choix`)."""
    champs: dict[Any, Any] = {vol.Optional("nouveau", default=False): selector.BooleanSelector()}
    if elements:
        options = [
            selector.SelectOptionDict(value=str(i), label=f"{i + 1}. {section.libelle(el)}")
            for i, el in enumerate(elements)
        ]
        champs[vol.Optional("choix")] = selector.SelectSelector(
            selector.SelectSelectorConfig(options=options, mode=selector.SelectSelectorMode.LIST)
        )
    return vol.Schema(champs)


class ListSectionsMixin:
    """The skeleton. `EcranSubentryFlow` (config_flow.py) uses it as a mixin;
    the `async_step_<section>` / `async_step_<section>_element` methods that
    HA requires by their NAME (`FlowManager._async_handle_step` does
    `getattr(flow, f"async_step_{step_id}")`, never a generic resolution)
    remain thin relays defined in config_flow.py — each one to ONE of the
    two methods below, never diverging from each other."""

    _current_index: int | None = None

    def _elements(self, subentry: ConfigSubentry, cle: str) -> list:
        return list(subentry.data.get(cle, []))

    def _persister_si_valide(
        self,
        entry: ConfigEntry,
        subentry: ConfigSubentry,
        cle: str,
        elements: list,
        errors: dict[str, str],
        description_placeholders: dict[str, str],
    ) -> bool:
        """Review round 1 (Critical): persisting ELEMENTS WITHOUT first
        checking that the COMPLETE screen that would result stays valid let
        through three paths measured by the reviewer (removing the last
        timer slot while the "minuteur" mode stays active, among others).
        Every gesture that persists (move up, move down, delete, save) now
        goes through HERE: persists and returns True if `schema.valider()`
        accepts the complete candidate screen; otherwise populates ERRORS/
        DESCRIPTION_PLACEHOLDERS (the faulty section) and returns False,
        WRITING NOTHING.

        Review round 2: this method no longer PERSISTS by itself — it
        delegates entirely to `garde_ecran.persister_si_valide`, THE single
        write site of the package. Before this round, `_persister` (a second
        call to `_async_update`, right next to it) remained a one-line
        bypass: a mutant that made `ACTION_DELETE` (or all FOUR gestures)
        write directly through `_persister`, skipping the guard, let
        `_persister_si_valide` become DEAD code — and the test of the time
        (which COUNTED the calls to `_async_update` against those to
        `check_complete_screen`, PER FILE) stayed green, since the count on
        BOTH sides dropped to zero together. A second site can no longer
        exist: `_persister` is gone, and this module no longer contains ANY
        `_async_update`."""
        return garde_ecran.persister_si_valide(
            self, entry, subentry, {**subentry.data, cle: elements},
            errors, description_placeholders,
            section_courante=cle, data_updates={cle: elements},
        )

    async def _async_step_section(
        self,
        cle: str,
        user_input: dict[str, Any] | None = None,
        description_placeholders: dict[str, str] | None = None,
    ):
        section = SECTIONS[cle]
        subentry = self._get_reconfigure_subentry()
        elements = self._elements(subentry, cle)
        errors: dict[str, str] = {}

        if user_input is not None:
            if user_input.get("nouveau"):
                self._current_index = None
                return await getattr(self, f"async_step_{cle}_element")()
            choisi = user_input.get("choix")
            if choisi is not None:
                self._current_index = int(choisi)
                return await getattr(self, f"async_step_{cle}_element")()
            # Review round 2: neither the "new item" box ticked nor an item chosen —
            # it used to redisplay SILENTLY, without saying why nothing had
            # happened. EXPLICIT refusal now, same regime as the business
            # refusals of EcranSubentryFlow.async_step_user (config_flow.py).
            errors["nouveau"] = ERROR_SELECTION_MISSING

        # C1 (final review): `cle` is always one of the `SECTIONS`, and each
        # of their nine descriptions now carries `{entites_inconnues}`
        # (translations/*.json) -- a placeholder that Home Assistant must
        # ALWAYS receive, never only when this particular caller computes it
        # (`_async_step_section_element`, after a successful persist).
        # Default "" HERE, at the ONLY site that redisplays this step, rather
        # than in `formulaire.reafficher` (also shared by the "*_element"
        # steps, NONE of which carries this placeholder).
        return reafficher(
            self, cle, _schema_choix(elements, section), user_input, errors,
            {"entites_inconnues": "", **(description_placeholders or {})},
        )

    async def _async_step_section_element(
        self, cle: str, user_input: dict[str, Any] | None = None
    ):
        """The form of one item, plus its four gestures (`geste`, a field
        present only when EDITING — adding a blank item has nothing to move
        up, move down or delete). Move up/move down are GUARDED at both
        ends: an out-of-bounds index does nothing and does not raise (see
        report, mutation of step 5 of the brief). A refusal on save
        REDISPLAYS THE INPUT (`displayed_values`), never the previously
        stored values (round 1, Important 2)."""
        section = SECTIONS[cle]
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        elements = self._elements(subentry, cle)
        index = self._current_index
        existant = elements[index] if index is not None else None
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        displayed_values = section.display(existant)

        if user_input is not None:
            geste = user_input.get("geste", ACTION_SAVE)

            if geste == ACTION_MOVE_UP:
                if index is not None and index > 0:
                    nouveaux = list(elements)
                    nouveaux[index - 1], nouveaux[index] = nouveaux[index], nouveaux[index - 1]
                    if self._persister_si_valide(
                        entry, subentry, cle, nouveaux, errors, description_placeholders
                    ):
                        self._current_index = index - 1
                        return await self._async_step_section_element(cle, None)
                    # Review round 1 (Critical): a change of rank NEVER
                    # makes a screen invalid (order is part of no contract
                    # invariant) — this branch therefore remains a
                    # theoretical defence, never exercised in practice, but
                    # written for the SAME reason as the rest of this fix:
                    # a rule that protects EVERY gesture, never only those
                    # where it has already been seen to fail.
                else:
                    return await self._async_step_section_element(cle, None)

            elif geste == ACTION_MOVE_DOWN:
                if index is not None and index < len(elements) - 1:
                    nouveaux = list(elements)
                    nouveaux[index], nouveaux[index + 1] = nouveaux[index + 1], nouveaux[index]
                    if self._persister_si_valide(
                        entry, subentry, cle, nouveaux, errors, description_placeholders
                    ):
                        self._current_index = index + 1
                        return await self._async_step_section_element(cle, None)
                else:
                    return await self._async_step_section_element(cle, None)

            elif geste == ACTION_DELETE:
                if index is not None:
                    nouveaux = list(elements)
                    del nouveaux[index]
                    # Review round 1 (Critical): THE case measured by the
                    # reviewer — removing the last `minuteurs` slot while
                    # `agencement.modes` still contains "minuteur" silently
                    # persisted a screen that had become invalid. Now
                    # refused BEFORE writing, on the item that was about to
                    # be deleted.
                    if self._persister_si_valide(
                        entry, subentry, cle, nouveaux, errors, description_placeholders
                    ):
                        self._current_index = None
                        return await self._async_step_section(cle, None)
                else:
                    return await self._async_step_section(cle, None)

            else:
                # ACTION_SAVE: replays schema.BOUTON/schema.SYNTHESE/
                # schema.ENTITE, THE SAME validation as schema.valider() on
                # the complete screen — two validators for one rule would be
                # the divergence that schema.py exists to prevent.
                #
                # Review round 2: `build_data` can now raise by itself
                # (`_build_button_data`, a half-filled service_* pair) —
                # INSIDE this same `try` block, never before: otherwise that
                # refusal would surface as an uncaught exception rather than
                # as a form redisplayed with errors.
                displayed_values = user_input
                try:
                    candidat = section.build_data(user_input, existant)
                    valide = section.valider(candidat)
                except ServiceIncomplet as err:
                    # Review round 3 (Important 2): a readable BUSINESS
                    # refusal, set on the field that is ACTUALLY empty —
                    # never the JSON Schema vocabulary of `schema.motif()`
                    # (see list_fields.ServiceIncomplet for the message that
                    # round 2 displayed).
                    errors[err.champ_vide] = ERROR_SERVICE_INCOMPLETE
                except AllumeeIncomplete as err:
                    # Task 7: the same refusal as ServiceIncomplet, for the
                    # allumee_entite/allumee_etats pair of $defs/source —
                    # see list_fields_sources.AllumeeIncomplete for why it
                    # is NOT ServiceIncomplet that carries it (its message
                    # names "the service", a lie here).
                    errors[err.champ_vide] = ERROR_POWERED_ON_INCOMPLETE
                except ChampVide as err:
                    # Review round 4 (minor): `libelle`/`texte` made up of
                    # spaces only — see list_fields.ChampVide.
                    errors[err.champ] = ERROR_FIELD_EMPTY
                except vol.Invalid as err:
                    # Review round 4 (the reviewer's Important 1): the
                    # generic ERROR_FIELD_INVALID + raw `schema.motif()` was
                    # EXACTLY the gibberish that round 3 thought it had shut
                    # for `service` alone — measured on four other paths
                    # ("Ce champ n'est pas valide : : required.", on a field
                    # FILLED with an empty string, among others). Each
                    # keyword now becomes a DEDICATED error code
                    # (`_ERROR_BY_KEYWORD`).
                    #
                    # Review round 2 (fix of a WRONG COMMENT left by round
                    # 4: this one claimed here "the faulty field is ALWAYS
                    # the one fautes.localiser() designates — no more "base"
                    # when the path is known". Wrong for "required":
                    # `localiser()` deliberately truncates the LAST segment
                    # (ajv parity, see its docstring), and a REQUIRED field
                    # omitted from a tile (`entite`), from a summary line
                    # (its value field) or from a source (`nom`) therefore
                    # fell back to "base" — a message written for ONE
                    # FIELD, displayed over the whole form.
                    # `_localiser_champ` (defined higher up in this module,
                    # reused by `objets.py`) reads `err.path` directly,
                    # never truncated.
                    champ, mot_cle = _localiser_champ(err)
                    errors[champ] = _ERROR_BY_KEYWORD.get(mot_cle, ERROR_FIELD_INVALID)
                else:
                    # Task 7, the THIRD cross invariant (bequeathed by plan
                    # 2, deliberately never put in the contract — see
                    # const.ERROR_RECIPE_WITHOUT_MODE). Applied to the THREE
                    # sections that share $defs/bouton (commandes,
                    # ambiances, extrasMaison): `vue` is the SAME field
                    # there, and the actual real screen that sets
                    # `vue: '#recette'` does so from `commandes`
                    # (app/src/ecran.ts, kitchen room) — nothing guarantees
                    # that a future screen will not set it elsewhere.
                    # Checked against `agencement.modes` AS ALREADY
                    # PERSISTED (this section never edits the layout
                    # itself); a screen with no layout at all (`agencement`
                    # absent) has NO mode, so it refuses any
                    # `vue: '#recette'` — exactly the case where the tile
                    # would be the most inert.
                    if isinstance(valide, dict) and valide.get("vue") == "#recette":
                        modes_actuels = (subentry.data.get("agencement") or {}).get("modes", [])
                        if "recette" not in modes_actuels:
                            errors["base"] = ERROR_RECIPE_WITHOUT_MODE
                    if not errors:
                        # Decision 7: WARNS, never refuses -- generic to
                        # every section via `registre.entities_in`
                        # (recursive). C1 (final review): the placeholder is
                        # ALWAYS set (never only `if inconnues`) -- empty
                        # when there is nothing to report, never a missing
                        # key (see `avertissement_entites_inconnues` and
                        # `_async_step_section` below, which guarantees the
                        # SAME default key for any display that does not go
                        # through here).
                        description_placeholders["entites_inconnues"] = (
                            avertissement_entites_inconnues(self.hass, entities_in(valide, cle))
                        )
                        nouveaux = list(elements)
                        if index is not None:
                            nouveaux[index] = valide
                        else:
                            nouveaux.append(valide)
                        if self._persister_si_valide(
                            entry, subentry, cle, nouveaux, errors, description_placeholders
                        ):
                            self._current_index = None
                            return await self._async_step_section(
                                cle, None, description_placeholders
                            )

        return reafficher(
            self,
            f"{cle}_element",
            section.construire_schema(index is not None),
            displayed_values,
            errors,
            description_placeholders,
        )
