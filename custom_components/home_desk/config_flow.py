"""The configuration flows: a single entry, and one subentry per screen.

Checked against the real sources of Home Assistant 2026.9.1 (container
`homeassistant`, cf. task report), not written from memory: the entry
step of a `ConfigSubentryFlow` is `async_step_user`,
`async_get_supported_subentry_types` is `classmethod` + `callback`, and
`ConfigSubentryFlow.async_create_entry` requires `self.source == SOURCE_USER`
(otherwise `ValueError`) — which the test's `SOURCE_USER` context already guarantees.
These three points are the ones the brief left open; the sources of the
`bayesian` component (which already carries subentries) confirm all
three.

The brief's `single_instance_allowed` rejection went through
`self._async_abort_entries_match()` INSIDE the step. The given test, however, calls
`async_init` then `async_configure` in TWO stages on the single entry: a
step that creates the entry as early as `async_init` (thus never reaching
`async_configure`, the flow having already left `_progress`) makes the
second call fail with `UnknownFlow`, for a reason unrelated to the rejection
under test. The Home Assistant sources (`color_extractor`, among others)
show the current idiom: `manifest.json` carries `"single_config_entry":
true`, and `ConfigEntriesFlowManager.async_init` checks that field and ABORTS
*before even calling the step* if an entry already exists — the step itself
remains a normal `show_form` then `create_entry` round trip.
`_async_abort_entries_match()` remains correct for a future application misuse
(e.g. two entries from different sources), but here the manifest already
says it all: follow the real API rather than the brief, as requested.

**Review round 1: the message of this rejection comes from the Home
Assistant CORE, never from this module.** `ConfigEntriesFlowManager.async_init`
builds the abort `ConfigFlowResult` itself with
`translation_domain=HOMEASSISTANT_DOMAIN` (not `DOMAIN`), and the frontend
resolves the translation on `translation_domain or handler.domain`: the key
actually read is therefore `component.homeassistant.config.abort.
single_instance_allowed` ("Already configured. Only a single configuration is
possible."), never `component.home_desk.config.abort.
single_instance_allowed`. A `config.abort.single_instance_allowed` key
in `translations/fr.json` would therefore be DEAD: no user path
reaches it, and it has been removed. The gesture the user must make —
add a screen from the EXISTING integration, not a second integration
— now lives in `config.step.user.description` of `translations/fr.json`
(and `en.json`), the ONLY description the first installation actually
displays.

**One entry, N subentries.** The "Tablettes murales" (wall tablets) entry holds
NOTHING: the whole configuration lives in the subentries, one per screen.
Adding a fourth tablet is then the SAME operation as for the first
three. A second entry would hold a second truth, and the transport
(tasks 8-9) would not know which one to publish — hence the
`single_instance_allowed` rejection.

The subentry's "Identity and budget" section carries `nom`,
`hauteurUtile`, `temperature`, `note`. The budget must already be checked HERE:
it is the only data that exists at this step, and the cheapest mode
(`defaut`, `rangeeAmbiance=True`) is enough to reject a screen that NO mode
could fit.

**Review round 1 (task 6): `temperature` has joined this section.**
It is a required ROOT field of the contract (`contrat/ecran.schema.json`,
"required") that no task of the plan carried yet — neither task 5, nor
the task 6 plan, which covered the "list" sections but not the
scalar fields of the contract. Without it, the subentry could never have
passed `schema.valider()`, whatever "list" sections were
delivered elsewhere. `temperature` is not a list: it lives here,
in the identity, never in `list_sections.py`.

**Review round 1, second rejection: `hauteurUtile` also carries the contract
bounds** (`schema.HAUTEUR_MIN`/`HAUTEUR_MAX`, 320 and 4000 px). The budget
alone does not cover them: a huge height (10,000 px, for example) NEVER
overflows (`check_budget` returns 0 for it), and without this second guard the
form accepted it — only for `schema.valider()` to reject it later,
reversing exactly what this task exists to avoid (reject at
input time, not in front of the tablet). The guard reuses `schema.hauteur_utile`,
the SAME function `schema.py` applies to the complete screen: no bound
is duplicated here.
"""
from __future__ import annotations

from functools import partial
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    ConfigSubentryFlow,
    SubentryFlowResult,
)
from homeassistant.core import callback

from homeassistant.helpers import selector

from . import schema
from .budget import BUDGET, check_budget
from .const import (
    DOMAIN,
    ERROR_BUDGET_UNTENABLE,
    ERROR_HEIGHT_OUT_OF_BOUNDS,
    ERROR_NAME_ALREADY_USED,
    ERROR_NAME_EMPTY,
    SUBENTRY_SCREEN,
    VERSION_CONFIG,
)
from .formulaire import reafficher
# Review round 1 (Critical): checks the COMPLETE screen before any
# persist — see garde_ecran.py. `async_step_identite` (I4, same round)
# needs it just as list_sections.py/objets.py do. Round 2: imported as a
# MODULE — `garde_ecran.persister_si_valide` is THE single write site
# of the package, this module no longer names `_async_update` itself.
from . import garde_ecran
from .list_sections import ListSectionsMixin
from .list_fields import SECTIONS
# Task 7: the two "object" sections (Blocks and modes, Car) live
# in their OWN mixin, `objets.py` — extracted from this module to stay
# under 500 lines (same seam as `list_sections.py`/`list_fields.py`).
from .objets import SectionsObjetMixin
# Spec decision 7, kept in task 7: an entity unknown to the
# registry WARNS, never rejects (see registre.py). Final branch review
# (C1): `avertissement_entites_inconnues` replaces the direct call
# to `entites_inconnues` -- see its docstring.
from .registre import avertissement_entites_inconnues

# `temperature` ($defs/entite): the sensor the screen shows in its header band.
# Review round 1 (task 6): it was a required ROOT field of the contract
# (contrat/ecran.schema.json, "required") that neither task 5 nor task 6
# carried yet — no task of the plan covered it, without which the
# subentry could never have passed schema.valider(). It belongs to
# the identity (config_flow.py), not to list_sections.py: it is not a list.
#
# Review round 2: NO domain restriction — removed for the SAME
# reason as $defs/bouton (list_fields.py): "sensor" seemed plausible
# but was held by no test, and the contract ($defs/entite) itself
# restricts no domain. A constraint not held by a test is an
# INVENTED constraint.

# The "Identity and budget" section alone; the "list" sections (control
# tiles, ambience row, summary line) have been in list_sections.py since
# task 6, reused below by EcranSubentryFlow. The type of
# `hauteurUtile` stays `int` here (the frontend field): the actual bounds
# validation goes through `schema.hauteur_utile`, called explicitly in
# `EcranSubentryFlow.async_step_user`.
#
# Task 6 correction: `data_schema` IS applied automatically by
# `FlowManager._async_configure` before calling the step (checked in
# data_entry_flow.py, cf. the docstring of list_sections.py) — the opposite claim
# above, written in task 5, was wrong. No consequence HERE: the two
# fields validated by SCHEMA_IDENTITE (`str`, `int`) add no business
# rule to it, only a type already correct for any caller of this module. The
# budget and bounds rejections remain AFTER-the-fact checks, in the
# step itself — it is the only way to get a form redisplayed with
# errors rather than an exception (list_sections.py, same reason for the "list"
# sections).
#
# Review round 2: `hauteurUtile` stays `vol.Required` HERE, whereas
# the contract carries it as `Optional` ($defs/ecran, schema.py) — a DELIBERATE
# DEVIATION, never a misreading of the contract. A screen can reject an
# untenable budget AT INPUT TIME (the very purpose of `async_step_user` below) only
# if it knows a CONCRETE height; leaving the field empty would forbid that
# early check, not work around it. The three real screens
# (app/src/ecran.ts) moreover NEVER declare `hauteurUtile` — the field
# is therefore PRE-FILLED with `BUDGET["hauteurUtileParDefaut"]` (585, the
# Fire 7s), read from the contract, never retyped by hand: a user who
# does not touch this field gets exactly the value the application
# already assumes in its absence (`budget.py`, `combien()`).
SCHEMA_IDENTITE = vol.Schema(
    {
        vol.Required("nom"): str,
        # Review round 3 (coverage hole): a `default=585` retyped
        # by hand would have survived the test that simply compares against
        # `BUDGET[...]` (585 today on both sides). `default=` here is
        # a CALLABLE (voluptuous does not wrap it, `Marker.default` stays
        # the callable itself): it re-reads BUDGET on EVERY call of
        # `.default()`, never once at import — a test that
        # monkeypatches BUDGET therefore proves the PROVENANCE, not just
        # today's value.
        vol.Required(
            "hauteurUtile", default=lambda: BUDGET["hauteurUtileParDefaut"]
        ): int,
        vol.Required("temperature"): selector.EntitySelector(selector.EntitySelectorConfig()),
        vol.Optional("note"): str,
        # Plan 3b: two of the four root fields WITHOUT an input door (spec
        # amended on 2026-09-13) -- the three real screens carry them and
        # survived every edit, but could be neither created nor
        # modified from HA. Optional: the contract carries them as `Optional`.
        vol.Optional("aspirateur"): selector.EntitySelector(selector.EntitySelectorConfig()),
    }
)


def _valider_identite(user_input: dict[str, Any], *, noms_existants: frozenset[str] = frozenset()) -> tuple[dict[str, str], dict[str, str], dict[str, Any] | None]:
    """The FOUR guards common to CREATION and RECONFIGURATION
    (`async_step_user`/`async_step_identite`): name not empty, name not ALREADY
    USED (`garde_ecran.noms_utilises` -- `nom` is the primary key of the
    websocket transport), budget of the cheapest mode, height bounds.
    `noms_existants` is empty at creation. Returns `(errors,
    description_placeholders, identity_data)`, `identity_data` being `None` unless the
    four guards pass."""
    errors: dict[str, str] = {}
    description_placeholders: dict[str, str] = {}
    # Round 2 (task 8): `nom` STRIPPED HERE, reused for empty/uniqueness/
    # persistence -- "salon " otherwise passed both guards but was stored raw.
    nom = user_input["nom"].strip()
    if not nom:
        errors["nom"] = ERROR_NAME_EMPTY
        return errors, description_placeholders, None
    if nom in noms_existants:
        errors["nom"] = ERROR_NAME_ALREADY_USED
        description_placeholders["nom"] = nom
        return errors, description_placeholders, None
    deborde = check_budget(
        "defaut", rangee_ambiance=True, hauteur_utile=user_input["hauteurUtile"]
    )
    if deborde:
        errors["hauteurUtile"] = ERROR_BUDGET_UNTENABLE
        description_placeholders["debordement"] = str(deborde)
        return errors, description_placeholders, None
    try:
        schema.hauteur_utile(user_input["hauteurUtile"])
    except vol.Invalid:
        errors["hauteurUtile"] = ERROR_HEIGHT_OUT_OF_BOUNDS
        description_placeholders["min"] = str(schema.HAUTEUR_MIN)
        description_placeholders["max"] = str(schema.HAUTEUR_MAX)
        return errors, description_placeholders, None
    # Round 1 (task 6): an empty `note` was PERSISTED ("" stays "") where the
    # contract wants it ABSENT (Optional, never an empty string). Second
    # site: `async_step_identite`, which also removes the key from `new_data`.
    identity_data = {
        k: v for k, v in user_input.items()
        if not (k == "note" and v == "")
    }
    identity_data["nom"] = nom  # the STRIPPED one, never the raw one
    return errors, description_placeholders, identity_data


class HomeDeskConfigFlow(ConfigFlow, domain=DOMAIN):
    """The single entry. It holds NOTHING: the whole configuration lives in
    the subentries, one per screen. A second entry would hold a
    second truth, and the transport would not know which one to publish.

    The "single_instance_allowed" rejection comes from `manifest.json`
    (`single_config_entry: true`): Home Assistant applies it before even
    calling this class, so this step has nothing to check itself — and
    its MESSAGE comes from the Home Assistant core, never from our translations
    (see the module docstring)."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirms the creation of the single entry. No data to enter:
        a minimal round trip (show_form then create_entry), so that
        the user sees and validates the addition of the integration."""
        if user_input is not None:
            return self.async_create_entry(title="Tablettes murales", data={})
        return self.async_show_form(step_id="user")

    @classmethod
    @callback
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        """The subentry types the "Tablettes murales" (wall tablets) entry can
        carry. Only one for now: a tablet screen."""
        return {SUBENTRY_SCREEN: EcranSubentryFlow}


class EcranSubentryFlow(ListSectionsMixin, SectionsObjetMixin, ConfigSubentryFlow):
    """One subentry, one screen. `async_step_user` (task 5) creates the
    subentry with its sole "Identity and budget" section. Once created,
    one COMES BACK to it through `async_step_reconfigure` (source `SOURCE_RECONFIGURE`,
    cf. list_sections.py): that is where the "list" sections (list_sections.py)
    and "object" sections (objets.py, task 7) live.

    Review round 1: the mixins come FIRST in the bases (and
    not last, the previous order) — standard Python convention for a
    mixin, which must appear before the functional base class to
    be able to override it through the MRO. No observable effect here (none of the
    three classes defines a name in common today), but the
    opposite would have been a trap for the next override."""

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Input of `nom`, `hauteurUtile`, `temperature`, `note`. Rejects AT
        INPUT TIME an empty name, a height where even the cheapest mode
        does not fit (and says by how much), or a height outside the
        contract bounds (10,000 px never overflows, but
        `schema.valider()` would reject it anyway, later) — never
        "invalid value", which would signal a rejection without saying what to do.

        `nom` is checked FIRST (round 1, task 6: task 5 debt,
        an empty `nom` got through), then its UNIQUENESS (task 8). The budget comes next: it is the most
        frequent guard on `hauteurUtile` (any height that is too tight, even within the
        bounds, overflows), and it is the one the overflowing-screen
        rejection test (test_config_flow.py) exercises with
        100 px — a value that, in practice, always overflows before being
        out of bounds (the minimal cost of a screen already exceeds 320 px, the lower
        bound). The bounds are therefore the only reachable guard only for
        an EXCESSIVE height, beyond anything the budget can ever
        report. `temperature` needs no manual check: a
        real `entity_id` always satisfies the format expected by
        `schema.ENTITE` — and its `EntitySelector` no longer filters ANY
        domain since review round 2 (see the note near
        `SCHEMA_IDENTITE`)."""
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}

        if user_input is not None:
            errors, description_placeholders, identity_data = _valider_identite(
                user_input, noms_existants=garde_ecran.noms_utilises(self._get_entry())
            )
            if identity_data is not None:
                identity_data["version"] = VERSION_CONFIG
                # Review round 3 (Important 1): a section never
                # opened persisted NOTHING -- the key stayed ABSENT, not
                # empty, whereas the contract requires the five list keys at
                # the ROOT. Seeded HERE, DERIVED from `SECTIONS` -- never
                # copied by hand, never overwritten if already carried.
                for cle in SECTIONS:
                    identity_data.setdefault(cle, [])
                # Decision 7: WARNS, never rejects. Ruling 18:
                # `_valider_identite` has NO access to `hass`, the call lives
                # HERE. C1: placeholder ALWAYS set -- this flow ENDS
                # here, only `create_entry.default` can still show it.
                description_placeholders["entites_inconnues"] = avertissement_entites_inconnues(
                    self.hass,
                    [v for v in (identity_data.get("temperature"), identity_data.get("aspirateur")) if v],
                )
                return self.async_create_entry(
                    title=identity_data["nom"], data=identity_data,
                    description_placeholders=description_placeholders,
                )

        # Redisplays the previous input (nom, note) after a rejection: without this
        # pre-filling, an untenable budget would also erase what
        # the user had already filled in correctly. `reafficher`
        # (formulaire.py) is the ONLY place that writes this gesture, review
        # round 2 — never again retyped by hand here or in list_sections.py.
        return reafficher(self, "user", SCHEMA_IDENTITE, user_input, errors, description_placeholders)

    async def async_step_reconfigure(
        self,
        user_input: dict[str, Any] | None = None,
        description_placeholders: dict[str, str] | None = None,
    ) -> SubentryFlowResult:
        """Entry point of an EXISTING subentry. A menu to the
        "list" sections of `list_fields.SECTIONS` (control tiles,
        ambience row, house extras, openings, summary line,
        media sources, timer slots, timer labels,
        the extra to-do lists — the last four added in task 7),
        plus the TWO "object" sections of that same task (`agencement` —
        "Blocks and modes" — and `voiture`), which have no place in
        `SECTIONS`: they are not collections of items chosen one
        by one, but a single object per screen.

        `description_placeholders`, if provided (decision 7): the unknown-entity
        warning computed by `async_step_identite` before coming back
        HERE -- optional, this step remaining directly callable by HA.

        Task 7 round (to report, not to keep quiet): the brief describes FOUR
        new menu lines. This menu adds SIX (the extra to-do lists
        included, supplement ruling): the timer slots and the
        proposed labels (`etiquettesMinuteur`, a distinct ROOT field
        of the contract) are two DIFFERENT sections in the contract's sense --
        merging them under a single line would have required a dedicated submenu
        for a cosmetic gain that no test requires. Each line remains
        traceable to ONE contract key.

        Review round 1 (Important I4): `"identite"` joins this menu.
        Before this round, `nom`/`hauteurUtile`/`temperature`/`note`
        were entered ONLY AT CREATION (`async_step_user`) — no
        entry of this menu ever led back to them, making them IMMUTABLE for life.
        `async_step_identite` reuses `SCHEMA_IDENTITE` and the same
        guards as creation (`_valider_identite`).

        C1: the only SCREEN reached by `async_step_identite` and the single-entity
        "object" sections of `objets.SectionsObjetMixin` (voiture,
        aspirateur_maison -- 3c/1) after a successful persist -- its description
        therefore carries `{entites_inconnues}` (translations/*.json), default ""
        HERE for the callers that do not compute it themselves."""
        return self.async_show_menu(
            step_id="reconfigure",
            menu_options=["identite", *SECTIONS, "agencement", "voiture", "aspirateur_maison"],
            description_placeholders={"entites_inconnues": "", **(description_placeholders or {})},
        )

    async def async_step_identite(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Reconfigures `nom`/`hauteurUtile`/`temperature`/`note` of an
        EXISTING subentry — I4, review round 1. Replays the SAME
        four guards as creation (`_valider_identite`), the uniqueness of
        `nom` EXCLUDING this subentry itself, THEN `garde_ecran.
        persister_si_valide` (round 1, Critical; round 2, THE single
        write site): changing the usable height cannot today
        break any cross invariant, but applying it HERE TOO avoids
        having to remember it the day a future rule could.

        Review round 2 (point 4): `titre=new_data["nom"]`
        — measured, `_async_update` was called WITHOUT `title=`; renaming a
        screen (`nom`) left the TITLE of the subentry (the one the
        integration page lists, set by `async_step_user` at
        creation) unchanged, the two diverging from the first
        reconfiguration."""
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        displayed_values = {
            cle: subentry.data[cle]
            for cle in ("nom", "hauteurUtile", "temperature", "note", "aspirateur")
            if cle in subentry.data
        }

        if user_input is not None:
            displayed_values = user_input
            noms = garde_ecran.noms_utilises(entry, exclure=subentry.subentry_id)
            errors, description_placeholders, identity_data = _valider_identite(
                user_input, noms_existants=noms
            )
            if identity_data is not None:
                new_data = dict(subentry.data)
                new_data.update(identity_data)
                if "note" not in identity_data:
                    new_data.pop("note", None)
                entites = [
                    v for v in (
                        new_data.get("temperature"),
                        new_data.get("aspirateur"),
                    ) if v
                ]
                # C1: placeholder ALWAYS set -- the screen that actually
                # shows it is the "reconfigure" menu (see its docstring),
                # never this step, which is left on the very next line.
                description_placeholders["entites_inconnues"] = avertissement_entites_inconnues(
                    self.hass, entites
                )
                if garde_ecran.persister_si_valide(
                    self, entry, subentry, new_data, errors, description_placeholders,
                    section_courante="identite", titre=new_data["nom"],
                ):
                    return await self.async_step_reconfigure(
                        description_placeholders=description_placeholders
                    )

        return reafficher(
            self, "identite", SCHEMA_IDENTITE, displayed_values, errors, description_placeholders
        )

    def __getattr__(self, nom: str) -> Any:
        """The relays (2 steps x N sections, `list_fields.SECTIONS`) that
        `list_sections.ListSectionsMixin` requires, made generic.

        Home Assistant calls a step BY ITS NAME
        (`getattr(flow, f"async_step_{step_id}")`, `data_entry_flow.py`) and
        checks its existence through `hasattr`: these names must therefore
        answer, but nothing forces us to WRITE them. Sixteen one-call
        methods cost 82 lines in a file capped at
        500, and every additional "list" section cost ten more
        -- the ninth (the extra to-do lists, task 7) pushed it over
        the cap.

        `__getattr__` is called ONLY if the normal lookup fails: the
        real methods (`async_step_user`, `_async_step_section`...)
        always win.

        WHAT MATTERS HERE is the final `raise AttributeError`. Without it,
        `hasattr` would return true for ANY name, and
        `_raise_if_step_does_not_exist` would stop protecting: a
        typo in a step identifier would no longer raise `UnknownStep`,
        it would go into the skeleton of a non-existent section and
        break further on, elsewhere, with no visible link to its cause.
        Also covers the DUNDER names Python looks up on its own
        (`__deepcopy__`...): they do not start with `async_step_`, so
        they fall through to it -- the correct behaviour."""
        if nom.startswith("async_step_"):
            reste = nom.removeprefix("async_step_")
            if reste.endswith("_element"):
                section = reste.removesuffix("_element")
                if section in SECTIONS:
                    return partial(self._async_step_section_element, section)
            elif reste in SECTIONS:
                return partial(self._async_step_section, reste)
        raise AttributeError(nom)
