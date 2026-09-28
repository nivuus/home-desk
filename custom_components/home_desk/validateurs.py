"""The LEAF validators that `schema.py` composes to mirror
`contrat/ecran.schema.json` -- each raises one of the `_Faute*` of
`fautes.py`, dedicated to the JSON Schema keyword it translates ("type",
"pattern", "minimum", "enum"...), never a generic `vol.Invalid` with
`error_type="..."` (see `fautes.py` for the why of this hierarchy).

Split from `schema.py` during the final branch review (second round):
`schema.py` had gone past 500 lines once the last two refusals were added
(`_alerte_en_tete`, `_trie`) -- the SAME seam that had already produced
`fautes.py` in round 3 of task 6 ("one and the same concern, separated from
what MIRRORS the contract"), never named in `CLAUDE.md` back then, unlike
this time.

This module READS nothing from the contract (no `pathlib.Path`, no JSON):
its functions are pure FACTORIES, parameterised by their expected
bounds/values at call time -- `schema.py` remains the ONLY reader of the
embedded contract, and composes these factories with the vocabularies it
extracts from it (`HAUTEUR_MIN`/`HAUTEUR_MAX`, notably, for
`hauteur_utile`). That is what avoids any circular dependency between the
two modules."""
from __future__ import annotations

import re

from .fautes import (
    _FauteAlertePremiere,
    _FauteConst,
    _FauteEnum,
    _FauteMaximum,
    _FauteMaxItems,
    _FauteMinItems,
    _FauteMinLength,
    _FauteMinimum,
    _FautePattern,
    _FauteType,
    _FauteUniqueItems,
)


def _string(min_len: int = 0):
    """A `str`, with a minimum length (`minLength`) when needed."""

    def valider(value):
        if not isinstance(value, str):
            raise _FauteType("attendu une chaine")
        if min_len and len(value) < min_len:
            raise _FauteMinLength(f"longueur minimale {min_len}")
        return value

    return valider


def _string_pattern(regex: re.Pattern, min_len: int = 0):
    """A `str` that must also match a `pattern`."""

    def valider(value):
        if not isinstance(value, str):
            raise _FauteType("attendu une chaine")
        if min_len and len(value) < min_len:
            raise _FauteMinLength(f"longueur minimale {min_len}")
        if not regex.match(value):
            raise _FautePattern("ne respecte pas le motif attendu")
        return value

    return valider


def _enum(values):
    def valider(value):
        if value not in values:
            raise _FauteEnum(f"doit etre parmi {sorted(values)}")
        return value

    return valider


def _const(attendu):
    """The counterpart of `"const": ...`: type AND value, without confusing 1 and True."""

    def valider(value):
        if type(value) is not type(attendu) or value != attendu:
            raise _FauteConst(f"doit valoir {attendu!r}")
        return value

    return valider


def _hauteur_utile(minimum: int, maximum: int):
    """Factory of `schema.hauteur_utile` -- the bounds come from the
    contract (`HAUTEUR_MIN`/`HAUTEUR_MAX`, schema.py), never retyped here.
    `schema.hauteur_utile = _hauteur_utile(HAUTEUR_MIN, HAUTEUR_MAX)` remains
    the PUBLIC interface reused as is by `config_flow.py`, so that the entry
    form refuses the SAME range as `schema.valider()`."""

    def valider(value):
        if isinstance(value, bool) or not isinstance(value, int):
            raise _FauteType("attendu un entier")
        if value < minimum:
            raise _FauteMinimum(f"minimum {minimum}")
        if value > maximum:
            raise _FauteMaximum(f"maximum {maximum}")
        return value

    return valider


def _paire_service():
    """The counterpart of `"service": {"minItems": 2, "maxItems": 2, "items":
    {"type": "string", "minLength": 1}}`. Written by hand rather than with
    `vol.Length`: the latter does not distinguish minItems from maxItems in
    its class, and its message ("length must be...") would not survive the
    trip through a dict any better than error_type — the same fragility that
    motivated `_Faute` (fautes.py), applied here since the marginal cost is
    zero once the hierarchy is in place.

    PRIVATE again since review round 4. Round 2 had made it public
    (`paire_service`, no prefix) claiming that
    `list_fields._build_button_data` REUSED it to refuse a half-filled
    `service_domaine`/`service_action` pair — round 3 removed that reuse
    (the JSON Schema pattern it produced, "minItems" set on "base", was
    unreadable for a human; see `list_fields.ServiceIncomplet`) WITHOUT
    correcting this claim, which became false at the very moment it was
    being written — the sixth lying docstring of this effort. No caller
    outside this module uses it any more (`grep paire_service`, verified):
    private again.

    The "exactly two items" rule therefore now lives in TWO places, owned:
    HERE (final validation of `schema.BOUTON`, the ONLY guarantee that
    `contrat/ecran.schema.json` truly requires) and in
    `list_fields.ServiceIncomplet` (the readable refusal, at entry time).
    Both are needed — a complete entry can still produce an invalid
    `service` through a path other than the form (direct import of a
    config, for example) — but it is a DELIBERATE duplication, named here
    rather than hidden."""
    non_empty_string = _string(1)

    def valider(value):
        if not isinstance(value, list):
            raise _FauteType("attendu une liste")
        if len(value) < 2:
            raise _FauteMinItems("service attend exactement 2 elements")
        if len(value) > 2:
            raise _FauteMaxItems("service attend exactement 2 elements")
        return [non_empty_string(v) for v in value]

    return valider


def _uniques():
    """The counterpart of `"uniqueItems": true`. Replaces `vol.Unique()` for
    the same reason `_paire_service` replaces `vol.Length`: staying within
    our own exception hierarchy rather than voluptuous's internal
    vocabulary."""

    def valider(value):
        vus = []
        for item in value:
            if item in vus:
                raise _FauteUniqueItems(f"doublon : {item!r}")
            vus.append(item)
        return value

    return valider


def _alerte_en_tete():
    """`alerte`, when present in `modes`, must be its FIRST item -- spec
    of 2026-09-12, "Invariants checked by the schema": "alerte in first
    position if present (an alert yields to nothing)". `modePrincipal`
    (app/src/modes.ts) returns the FIRST active mode of this array whose
    condition holds -- a layout that does not follow this rule would make a
    real alert yield to a lower-priority mode as soon as the latter
    activates, exactly what the spec forbids.

    CARRIED BY THE CONTRACT since the second final branch review
    (`contrat/ecran.schema.json`, root `allOf`: `contains: {const:
    alerte}` -> `then: {prefixItems: [{const: alerte}]}`, verified against
    ajv at runtime) -- corrected from a first version of this function that
    wrongly claimed this rule was "added by this component, not by the
    contract", by analogy with `_uniques()`. That analogy was FALSE,
    measured: the contract already carries `"uniqueItems": true` on
    `zones`, `modes` AND `modulateurs` -- `_uniques()` is the MIRROR of a
    contract constraint, the exact opposite of what the old docstring
    claimed. Here, the raised exception (`_FauteAlertePremiere`, fautes.py)
    INHERITS the `_FauteConst` keyword ("const") rather than inventing one:
    it is the REAL JSON Schema keyword ajv produces for this rule
    (`prefixItems[0].const`), and `contrat/cas-schema.json` now carries a
    shared case for it -- both implementations finally land on the SAME
    verdict, for the SAME pattern ("/agencement/modes/0: const"), verified
    by execution on both sides (`tests/composant/test_schema.py`,
    `app/tests/cas-schema.test.ts`).

    `path=[0]` DELIBERATELY designates the faulty index (the first item of
    the array), exactly what ajv names (`instancePath`:
    `/agencement/modes/0`) -- never the whole array. `objets.py`
    (`async_step_agencement`) tells this PRECISE refusal apart from any
    other `const` refusal elsewhere (`version`...) by the TYPE
    of the exception (`isinstance(err, _FauteAlertePremiere)`), not by its
    keyword, now shared with other fields -- see its own docstring."""

    def valider(value):
        if "alerte" in value and value[0] != "alerte":
            raise _FauteAlertePremiere(
                "'alerte', si present, doit etre le PREMIER mode de la liste "
                "(une alerte ne cede a rien)",
                path=[0],
            )
        return value

    return valider


def _trie():
    """Found during the final branch review: `modulateurs` has no
    meaningful order (spec of 2026-09-12, "Invariants checked by the
    schema": "the schema normalises it into a sorted set, so that an export
    diff is not noisy") -- never applied before this fix: `AGENCEMENT` kept
    the SUBMITTED order, like `zones`/`modes` (where the order IS
    meaningful, see `test_agencement_conserve_l_ordre_
    soumis_des_zones_et_des_modes`, test_config_flow_objets.py). Two
    exports of the same screen, with `modulateurs` picked in a different
    order in the form, therefore produced a noisy YAML diff
    (`yaml_ecrans.rendre`) for a reordering with no effect whatsoever on
    the rendering -- `CONDITIONS_MODULATEURS` (app/src/modes.ts) never reads
    the order, only membership."""

    def valider(value):
        return sorted(value)

    return valider
