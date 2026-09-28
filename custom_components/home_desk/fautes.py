"""Naming a fault in JSON Schema vocabulary: the `_Faute` hierarchy (the
keyword on the CLASS, never on `error_type`) and `motif()`, which renders
it in the corpus format (`path: keyword`, the counterpart of
`${instancePath}: ${keyword}` on the ajv side).

One and the same concern, split out of `schema.py` (the voluptuous mirror
of the contract itself, TWO validators for a single shape) in review
round 3 of task 6: `schema.py` was approaching 500 lines and task 7 adds
`MINUTEUR_SLOT`/`etiquettesMinuteur` to it on top. The two halves do not
come apart from each other: `motif()` works ONLY because `mot_cle` lives
on the CLASS of each `_Faute*`, never on an instance — hence a single
module rather than two that would cite each other in a loop.
"""
from __future__ import annotations

import voluptuous as vol

# --------------------------------------------------------------------------
# Each `_Faute*` raises a SUBCLASS of vol.Invalid dedicated to the JSON
# Schema keyword it translates ("type", "pattern", "minimum", "enum", ...) —
# never a generic vol.Invalid with error_type="...".
#
# Round 1 correction (Important 3): error_type is an instance ATTRIBUTE, and
# BOTH backends rewrite it while propagating it up through a value validator
# nested in a dict (`validate_mapping`, in voluptuous as in Home Assistant's
# probatio shim, substitutes a generic internal message for it — "dictionary
# value" on the bare voluptuous side). motif() therefore cannot rely on it.
# The CLASS of the exception, on the other hand, is never touched by this
# mechanism: that is already why required/additionalProperties/contains are
# detected by isinstance() further down; the remaining keywords now are
# too, via `_Faute.mot_cle`.
# --------------------------------------------------------------------------

class _Faute(vol.Invalid):
    """The JSON Schema keyword lives on the CLASS, never on `error_type`."""
    mot_cle = "invalid"


class _FauteType(_Faute):
    mot_cle = "type"


class _FautePattern(_Faute):
    mot_cle = "pattern"


class _FauteMinimum(_Faute):
    mot_cle = "minimum"


class _FauteMaximum(_Faute):
    mot_cle = "maximum"


class _FauteEnum(_Faute):
    mot_cle = "enum"


class _FauteConst(_Faute):
    mot_cle = "const"


class _FauteMinLength(_Faute):
    mot_cle = "minLength"


class _FauteMinItems(_Faute):
    mot_cle = "minItems"


class _FauteMaxItems(_Faute):
    mot_cle = "maxItems"


class _FauteUniqueItems(_Faute):
    mot_cle = "uniqueItems"


class _FauteAlertePremiere(_FauteConst):
    """Caught in the final branch review, TWICE. First: `alerte`, if
    present in `agencement.modes`, must be its FIRST item (spec of
    2026-09-12, section "Invariants checked by the schema": "alert in
    first position if present -- an alert yields to nothing") -- now
    carried by `contrat/ecran.schema.json` itself (a root `allOf`:
    `contains: {const: alerte}` -> `then: {prefixItems: [{const:
    alerte}]}`, checked at run time against ajv), instead of a constraint
    added by this component alone. `mot_cle` therefore INHERITS from
    `_FauteConst` ("const") rather than inventing one ("alertePremiere",
    the first version of this class, previous round): it is the REAL JSON
    Schema keyword ajv produces for this rule (`prefixItems[0].const`), and
    `contrat/cas-schema.json` now carries a shared case for it, pattern
    "/agencement/modes/0: const" -- the two implementations finally land
    on the SAME verdict, for the SAME pattern.

    Then: a distinct SUBCLASS of `_FauteConst` remains necessary despite
    the shared keyword, so that `objets.async_step_agencement` can tell BY
    TYPE (`isinstance`, not by mot_cle -- two identical mot_cle cannot
    carry two different messages in `list_sections._ERROR_BY_KEYWORD`, a
    flat dict) this PRECISE refusal apart from any other `const` refusal
    elsewhere (`version`, `delorean`...) and give it its own message,
    which NAMES the action (see objets.py) -- the final branch review
    measured that a message which merely NAMES the rule, without the
    action, is insufficient as soon as the field is a list of checkboxes
    rather than a plain text field."""


def localiser(err: vol.Invalid) -> tuple[list, str]:
    """The PATH and the JSON Schema KEYWORD of a fault — the analysis that
    `motif()` formats for the corpus, shared here (review round 4) so that
    `list_sections.py` can attribute a user refusal to the right FIELD and
    the right KEYWORD WITHOUT duplicating this analysis: a second copy of
    this computation would have been exactly the divergence this module
    exists to prevent.

    - `required` and `additionalProperties`: voluptuous carries the
      offending field (the missing one, or the unknown one) as the LAST
      segment of the path; ajv, for its part, designates the OBJECT that
      carries the fault, the field name travelling separately
      (`missingProperty` / `additionalProperty`). So that last segment is
      dropped for these two keywords — never for the others, where the
      voluptuous path and the ajv instancePath already designate the same
      point.
    - A `vol.MultipleInvalid` does not carry `.error_type` (it never goes
      through `Invalid.__init__`): its first error is read, which is enough
      here since each corpus case exercises only ONE rule at a time (and
      since a "list" section refusal only ever raises one).
    - `voluptuous` is loaded by this module directly (the classic PyPI
      package), but from the moment `custom_components/home_desk` imports
      `homeassistant.core` (`__init__.py`), Home Assistant replaces
      `sys.modules["voluptuous"]` with `probatio._vol_shim`: since HA
      2026.9, `voluptuous` is only a compatibility facade on top of
      `probatio`, its REAL validation library (checked by inspecting the
      component under both regimes — see the task 3 report). The two
      backends differ on extra fields: classic voluptuous raises a generic
      `Invalid` with the message "extra keys not allowed"; the probatio shim
      raises a dedicated `ExtraKeysInvalid` with the message "not a valid
      option". Hence the double detection below rather than a single branch
      that would only work under Home Assistant, or only under bare
      voluptuous.
    - Round 1 correction (Important 3): `err.error_type` is NOT reliable for
      our own validators either. BOTH backends rewrite it when the error
      propagates up through a value validator nested in a dict
      (`validate_mapping`), with a generic internal message ("dictionary
      value" on the bare voluptuous side) — checked by replaying the whole
      corpus under bare voluptuous (schema.py loaded alone, homeassistant
      never imported): 4 cases out of 11 got the keyword wrong before this
      correction. Our own validators therefore now raise subclasses of
      `_Faute`, whose keyword lives on the CLASS — never touched by this
      rewrite, unlike the attribute. `required`, `additionalProperties` and
      `contains` are still detected as before (classes/messages of
      voluptuous or of the shim, outside our control); everything else now
      goes through `isinstance(err, _Faute)`."""
    if isinstance(err, vol.MultipleInvalid):
        err = err.errors[0]

    chemin_parts = list(err.path)
    if isinstance(err, vol.RequiredFieldInvalid):
        return chemin_parts[:-1], "required"
    if type(err).__name__ == "ExtraKeysInvalid" or err.msg == "extra keys not allowed":
        return chemin_parts[:-1], "additionalProperties"
    if isinstance(err, vol.ContainsInvalid):
        return chemin_parts, "contains"
    if isinstance(err, _Faute):
        return chemin_parts, err.mot_cle
    return chemin_parts, (err.error_type or "invalid")


def motif(err: vol.Invalid) -> str:
    """Renders the fault in the corpus format: `path: keyword`, the
    counterpart of `${instancePath}: ${keyword}` on the ajv side
    (app/tests/cas-schema.test.ts) — JSON Schema vocabulary, never a
    message shown AS IS to a user (see `localiser()` for the shared
    analysis).

    Round 3 correction, EXTENDED in round 4: round 3 had claimed here that
    this module "names ONLY the JSON Schema vocabulary meant for the
    corpus" while checking it ONLY for `service` (`ServiceIncomplet`, then
    in `list_fields.py`, now in `list_common.py`) — whereas ALL THE OTHER
    refusals of an item of a "list" section
    (`list_sections._async_step_section_element`) still interpolated the
    RAW `motif()` into the user message ("Ce champ n'est pas valide : :
    required.", among others, measured on four paths): the SAME class of
    defect, in the same place, created by the round that thought it had
    closed it — sixth and seventh lying docstrings of the project.
    `list_sections.py` now translates EACH keyword into a dedicated error
    code (`list_sections._ERROR_BY_KEYWORD`) via `localiser()`, never
    `motif()`: this function now only serves the corpus, here, and its own
    tests (`tests/composant/test_schema.py`) — checked by grep, not
    assumed."""
    chemin_parts, mot_cle = localiser(err)
    chemin = "/" + "/".join(str(p) for p in chemin_parts) if chemin_parts else ""
    return f"{chemin}: {mot_cle}"
