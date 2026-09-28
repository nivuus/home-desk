"""The "object" sections of a screen: `agencement` ("Blocks and modes") and
`voiture` — a SINGLE OBJECT per screen, never a collection of items chosen/
added one by one like the "list" sections of `list_sections.py`. What sets
them apart from `ListSectionsMixin`: no choose/add, no move up/move down/
delete, no index — just a form that replays
`schema.AGENCEMENT`/`schema.VOITURE` on the WHOLE object on every
submission.

Extracted from `config_flow.py` in task 7 to stay under 500 lines (same
seam as `list_sections.py`/`list_fields.py` in task 6, decided BEFORE
writing rather than after the fact, as the brief asked): `EcranSubentryFlow`
reuses `SectionsObjetMixin` exactly like `ListSectionsMixin`.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import SubentryFlowResult
from homeassistant.helpers import selector

from . import libelles, schema
from .budget import BUDGET, check_budget
from .const import (
    ERROR_ALERT_NOT_FIRST,
    ERROR_BUDGET_UNTENABLE_MODE,
    ERROR_FIELD_INVALID,
    ERROR_FIELD_EMPTY,
    ERROR_SERVICE_INCOMPLETE,
)
from .fautes import _FauteAlertePremiere
from .formulaire import reafficher
from .list_fields import (
    ChampVide,
    ServiceIncomplet,
    _display_button,
    _build_button_data,
    _schema_bouton,
)
# Review round 1 (Critical): checks the COMPLETE screen before any
# persist — see garde_ecran.py. `async_step_agencement` and
# `async_step_voiture` needed it JUST AS MUCH as list_sections.py
# (`blocDefaut: voiture` without a car object, or removing the car while
# blocDefaut still asks for it, were persisted silently before this fix).
# Round 2: imported as a MODULE — `garde_ecran.persister_si_valide` is THE
# single write site of the package, this module no longer names
# `_async_update` itself.
from . import garde_ecran
# Same mechanism as `list_sections.py` (schema.* -> vol.Invalid ->
# fautes.localiser -> dedicated error code), replayed here on a SINGLE
# object rather than on an item of a "list" section: reuse THIS table (and
# `_localiser_champ`, same reason) rather than write a second copy of it,
# the same rule this work applies everywhere else (schema.py, budget.py).
#
# Review round 2: `_localiser_champ` lived HERE alone until that round —
# round 1 had fixed the truncation of `fautes.localiser()` for
# agencement/voiture believing it limited to those two shapes, whereas
# `list_sections.py` carried EXACTLY the same defect for the "list"
# sections (see its own docstring for the measurement). A single shared
# implementation since then -- extracted into `list_errors.py` in fix
# round 1 (defect B), this module already importing BOTH names TOGETHER
# being the proof that the seam was already separable.
from .list_errors import _ERROR_BY_KEYWORD, _localiser_champ
# Fix round 3: decision 7, wired HERE for "voiture" -- the seven fields
# of $defs/voiture (inline, without its own $defs) are entities just like
# those of a "list" section (see registre.py). Final branch review (C1):
# `avertissement_entites_inconnues` replaces the direct call to
# `entites_inconnues` -- see its docstring.
from .registre import avertissement_entites_inconnues, entities_in

# Task 7: "Blocks and modes" (agencement) is NOT a "list" section
# (list_sections.py) — a single OBJECT per screen, never a collection of
# independent items chosen/added one by one. `zones`/`modes`/`modulateurs`
# remain ORDERED LISTS of the contract (schema.ZONES/MODES/MODULATEURS,
# already lists since task 6 precisely for this use): a
# `SelectSelector(multiple=True)` submits them in the order chosen by the
# user — HA neither sorts nor reorders them itself — which carries the
# SAME ordering guarantee as a move up/move down, without the dedicated
# gesture (see the task report for this deliberate fallback). `default=list`
# on all three: a field never touched must still submit an EMPTY LIST,
# never a missing key — `schema.AGENCEMENT` requires all three of them
# (`vol.Required`).
SCHEMA_AGENCEMENT = vol.Schema(
    {
        # Review round 1 (Minor): the four `SelectSelector`s below now
        # carry a `translation_key` — same mechanics as "geste"
        # (`list_common._selecteur_geste`). Before that round, none had
        # one: the user read the RAW contract identifiers ("blocCentral",
        # "aeration", "delorean", "extrasMaison" via zones/modes/
        # modulateurs), never a label.
        vol.Optional("blocDefaut"): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.BLOC_DEFAUT),
                mode=selector.SelectSelectorMode.DROPDOWN,
                translation_key="bloc_defaut",
            )
        ),
        vol.Optional("zones", default=list): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.ZONES),
                multiple=True,
                mode=selector.SelectSelectorMode.LIST,
                translation_key="zone",
            )
        ),
        vol.Optional("modes", default=list): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.MODES),
                multiple=True,
                mode=selector.SelectSelectorMode.LIST,
                translation_key="mode",
            )
        ),
        vol.Optional("modulateurs", default=list): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.MODULATEURS),
                multiple=True,
                mode=selector.SelectSelectorMode.LIST,
                translation_key="modulateur",
            )
        ),
        vol.Optional("note"): str,
    }
)

# The seven entities of $defs/voiture, never hardcoded again elsewhere — the
# "sans_voiture" checkbox (brief, step 2) is NOT a contract field: it never
# leaves this form, cf. SectionsObjetMixin.async_step_voiture.
CHAMPS_VOITURE = (
    "batterie", "autonomie", "branchee", "enCharge", "clim", "demarrerClim", "arreterClim",
)

SCHEMA_VOITURE = vol.Schema(
    {
        vol.Optional("sans_voiture", default=False): selector.BooleanSelector(),
        **{
            vol.Optional(champ): selector.EntitySelector(selector.EntitySelectorConfig())
            for champ in CHAMPS_VOITURE
        },
        vol.Optional("note"): str,
    }
)

# The last of the contract's four root fields to receive its input door
# (plan 3c, task 1): a SINGLE `Bouton` ($ref: #/$defs/bouton), which
# REPLACES the generic "Vacuum" tile of the "Whole house" view
# (`rendu/maison.ts`, ASPIRATEUR_GENERIQUE) when it is declared. The ten
# fields of the button are not retyped here: `_schema_bouton`,
# `_build_button_data` and `_display_button` (list_fields.py) are the ONLY
# canonical address of $defs/bouton, the same rule this repository applies
# everywhere else (schema.py, budget.py, list_errors.py).
#
# The checkbox that REMOVES the section, never a contract field: it does
# not leave this form (same doctrine as `sans_voiture`, cf.
# async_step_voiture).
SCHEMA_ASPIRATEUR_MAISON = _schema_bouton(editable=False).extend(
    {vol.Optional("sans_aspirateur_maison", default=False): selector.BooleanSelector()}
)


class SectionsObjetMixin:
    """The counterpart of `list_sections.ListSectionsMixin` for the TWO
    "object" sections. `EcranSubentryFlow` (config_flow.py) reuses it as a
    mixin, alongside `ListSectionsMixin` — the two share no method name, so
    the order of the bases has no observable effect here."""

    async def async_step_agencement(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """The "Blocks and modes" step (agencement): a single OBJECT, never a "list"
        section (see SCHEMA_AGENCEMENT above for the order of the
        multi-selections).

        Replays `schema.AGENCEMENT` (the complete mirror, including its two
        `Contains` — zones must contain "commandes", modes must contain
        "defaut") then, only if the object is structurally valid, the
        SECOND out-of-schema rule of this task: the budget checked MODE BY
        MODE, with the zones ENTERED HERE and the height/ambiance ACTUALLY
        persisted. The refusal names the MOST COSTLY mode, not just a
        number — "the timer mode overflows by X px", never "this screen
        overflows by X px"."""
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        displayed_values = dict(subentry.data.get("agencement") or {})

        if user_input is not None:
            displayed_values = user_input
            candidat: dict[str, Any] = {
                "zones": list(user_input.get("zones") or []),
                "modes": list(user_input.get("modes") or []),
                "modulateurs": list(user_input.get("modulateurs") or []),
            }
            if user_input.get("blocDefaut"):
                candidat["blocDefaut"] = user_input["blocDefaut"]
            if user_input.get("note"):
                candidat["note"] = user_input["note"]
            try:
                valide = schema.AGENCEMENT(candidat)
            except vol.Invalid as err:
                # Final branch review (second round): `err` may be a
                # `vol.MultipleInvalid` -- same unwrapping that
                # `_localiser_champ` (list_errors.py) does to read the
                # keyword, needed HERE too for the isinstance below.
                premiere = err.errors[0] if isinstance(err, vol.MultipleInvalid) else err
                if isinstance(premiere, _FauteAlertePremiere):
                    # Special case, NOT via `_ERROR_BY_KEYWORD`: this
                    # fault inherits the "const" keyword from `_FauteConst`
                    # (so that `contrat/cas-schema.json` shares the SAME
                    # pattern as ajv, see schema._alerte_en_tete()) -- but
                    # "const" is already taken there by a completely
                    # different message (ERROR_FIELD_VALUE_FIXED, a field
                    # frozen to a single value, never a matter of ORDER).
                    # Told apart by TYPE, never by keyword: two identical
                    # keywords cannot carry two different messages in a
                    # flat dict.
                    errors["modes"] = ERROR_ALERT_NOT_FIRST
                else:
                    champ, mot_cle = _localiser_champ(err)
                    errors[champ] = _ERROR_BY_KEYWORD.get(mot_cle, ERROR_FIELD_INVALID)
            else:
                # rangee_ambiance: SAME formula as app/src/demarrage.ts
                # (`piece.ambiances.length > 0 || (piece.minuteurs?.length
                # ?? 0) > 0`) — task 5 could only ASSUME it true (no section
                # existed yet); here, both lists are already persisted and
                # tell the truth.
                rangee_ambiance = (
                    len(subentry.data.get("ambiances", [])) > 0
                    or len(subentry.data.get("minuteurs", [])) > 0
                )
                hauteur_utile = subentry.data.get(
                    "hauteurUtile", BUDGET["hauteurUtileParDefaut"]
                )
                pire_mode: str | None = None
                pire_debordement = 0
                for mode in valide["modes"]:
                    debordement = check_budget(
                        mode, rangee_ambiance, hauteur_utile, valide["zones"]
                    )
                    if debordement > pire_debordement:
                        pire_debordement = debordement
                        pire_mode = mode
                if pire_mode is not None:
                    errors["base"] = ERROR_BUDGET_UNTENABLE_MODE
                    # Review round 2 (point 3): {mode} interpolated the RAW
                    # contract identifier ("minuteur"), never translated —
                    # whereas the matching SelectSelector
                    # (translation_key="mode", round 1) already publishes
                    # "Minuteur" / "Timer". `libelles.mode` reads the SAME
                    # table.
                    description_placeholders["mode"] = libelles.mode(self.hass, pire_mode)
                    description_placeholders["debordement"] = str(pire_debordement)
                else:
                    # Review round 1 (Critical): schema.AGENCEMENT replayed
                    # above only sees THE LAYOUT itself, never the CROSS
                    # invariants with the rest of the screen
                    # (`blocDefaut: voiture` without a car object,
                    # `minuteur` in the modes without a timer slot) —
                    # measured: persisted silently before this fix.
                    # Round 2: delegates to `garde_ecran.persister_si_valide`,
                    # THE single write site (see its docstring).
                    screen_data = {**subentry.data, "agencement": valide}
                    if garde_ecran.persister_si_valide(
                        self, entry, subentry, screen_data, errors, description_placeholders,
                        section_courante="agencement",
                    ):
                        return await self.async_step_reconfigure()

        return reafficher(
            self, "agencement", SCHEMA_AGENCEMENT, displayed_values, errors,
            description_placeholders,
        )

    async def async_step_voiture(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """The "Car" step (voiture): seven entities, or the "No car" checkbox.
        UNTICKING it (`sans_voiture=True`) REMOVES the object from the
        subentry — never seven fields left empty: the contract requires the
        COMPLETE object as soon as it exists (root `$defs`, `voiture` ->
        `required` on all seven), and `blocDefaut: voiture` requires it
        outright (schema._invariants_croises). Removing the key requires
        `data=` (not `data_updates=`, which only does a UNION —
        `subentry.data | {"voiture": None}` would keep the key with a `None`
        value, not the absence the contract asks for).

        Review round 1 (Critical): THE most serious case measured by the
        reviewer lived HERE — removing the car while `blocDefaut` is still
        "voiture" made an ALREADY VALID screen invalid, WITHOUT A WORD (the
        docstring already named `schema._invariants_croises` just above,
        without ever calling it). BOTH branches that persist (removal,
        add/edit) now go through `garde_ecran.persister_si_valide` before
        writing.

        Review round 2 (point 3): the refusal of the `sans_voiture` branch
        named "voiture" — the section the user is ALREADY in, where there
        is nothing left to fix (they have just left it). The only real
        remedy is in "Blocks and modes" (remove `blocDefaut: voiture`).
        `section_courante="voiture"` lets
        `garde_ecran.check_complete_screen` redirect to "agencement" when
        the faulty section IS the one the write comes from — never in the
        add/edit branch below, where "voiture" remains the right answer
        (the user is not already there if they come from a
        `blocDefaut: voiture` chosen from the layout)."""
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        existant = subentry.data.get("voiture")
        displayed_values = dict(existant) if existant else {}

        if user_input is not None:
            displayed_values = user_input
            if user_input.get("sans_voiture"):
                screen_data = dict(subentry.data)
                screen_data.pop("voiture", None)
                if garde_ecran.persister_si_valide(
                    self, entry, subentry, screen_data, errors, description_placeholders,
                    section_courante="voiture",
                ):
                    return await self.async_step_reconfigure()
            else:
                candidat = {
                    champ: user_input[champ]
                    for champ in CHAMPS_VOITURE
                    if user_input.get(champ) not in (None, "")
                }
                if user_input.get("note"):
                    candidat["note"] = user_input["note"]
                try:
                    valide = schema.VOITURE(candidat)
                except vol.Invalid as err:
                    champ, mot_cle = _localiser_champ(err)
                    errors[champ] = _ERROR_BY_KEYWORD.get(mot_cle, ERROR_FIELD_INVALID)
                else:
                    # Fix round 3: decision 7, which had remained unwired
                    # HERE -- the SEVEN fields of `voiture` are entities in
                    # the contract (`$ref: entite`), as exposed to typos as
                    # any field of a "list" section. WARNS, never refuses
                    # -- same rule as the sections skeleton
                    # (`list_sections.py`). C1 (final review): the
                    # placeholder is ALWAYS set, never only `if inconnues`
                    # -- see `avertissement_entites_inconnues`.
                    description_placeholders["entites_inconnues"] = (
                        avertissement_entites_inconnues(self.hass, entities_in(valide, "voiture"))
                    )
                    screen_data = {**subentry.data, "voiture": valide}
                    if garde_ecran.persister_si_valide(
                        self, entry, subentry, screen_data, errors, description_placeholders,
                        section_courante="voiture",
                    ):
                        return await self.async_step_reconfigure(
                            description_placeholders=description_placeholders
                        )

        return reafficher(
            self, "voiture", SCHEMA_VOITURE, displayed_values, errors, description_placeholders
        )

    async def async_step_aspirateur_maison(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """The "Room vacuum" step (aspirateur de la piece): a SINGLE Bouton that
        REPLACES the generic "Vacuum" entry of the "Whole house" view
        (`rendu/maison.ts`, ASPIRATEUR_GENERIQUE) — never one more tile.

        The last of the four root fields to receive its input door. What
        blocked it was not here but in the application: as long as the
        substitution was done by comparison with a literal `entity_id`,
        opening this form delivered a half-dead button. Fixed in the
        previous step of this same task, and in that order.

        The step id is `aspirateur_maison` (snake_case, a Python method
        name); the contract key remains `aspirateurMaison` (camelCase) —
        `async_step_aspirateurMaison` would not have been a valid Python
        name in that style. `translations/*.json` bridges the two."""
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        existant = subentry.data.get("aspirateurMaison")
        displayed_values = _display_button(existant)

        if user_input is not None:
            displayed_values = user_input
            if user_input.get("sans_aspirateur_maison"):
                screen_data = dict(subentry.data)
                screen_data.pop("aspirateurMaison", None)
                if garde_ecran.persister_si_valide(
                    self, entry, subentry, screen_data, errors, description_placeholders,
                    section_courante="aspirateur_maison",
                ):
                    return await self.async_step_reconfigure()
            else:
                try:
                    candidat = _build_button_data(user_input, existant)
                    valide = schema.BOUTON(candidat)
                except ServiceIncomplet as err:
                    errors[err.champ_vide] = ERROR_SERVICE_INCOMPLETE
                except ChampVide as err:
                    errors[err.champ] = ERROR_FIELD_EMPTY
                except vol.Invalid as err:
                    champ, mot_cle = _localiser_champ(err)
                    errors[champ] = _ERROR_BY_KEYWORD.get(mot_cle, ERROR_FIELD_INVALID)
                else:
                    # Decision 7: WARNS, never refuses. The placeholder is
                    # ALWAYS set (C1 of the 3b final review): a
                    # `description_placeholders` without the key makes HA
                    # raise on a description that carries it.
                    description_placeholders["entites_inconnues"] = (
                        avertissement_entites_inconnues(
                            self.hass, entities_in(valide, "aspirateurMaison"))
                    )
                    screen_data = {**subentry.data, "aspirateurMaison": valide}
                    if garde_ecran.persister_si_valide(
                        self, entry, subentry, screen_data, errors, description_placeholders,
                        section_courante="aspirateur_maison",
                    ):
                        return await self.async_step_reconfigure(
                            description_placeholders=description_placeholders
                        )

        return reafficher(
            self, "aspirateur_maison", SCHEMA_ASPIRATEUR_MAISON,
            displayed_values, errors, description_placeholders,
        )
