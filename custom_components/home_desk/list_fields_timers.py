"""The two timer "list" sections: `minuteurs` (the slots, a root key of
the contract — `timer`/`nom` are two ENTITIES, not a label: `nom` designates
the `input_text` that carries the displayed name, see `app/src/ecran.ts`,
kitchen room) and `etiquettesMinuteur` (the suggested labels, an array of
FREE strings with no length constraint in the contract — unlike a source's
`libelle`/`texte`/`nom`, an empty label is NOT rejected here: the contract
(root $defs, property `etiquettesMinuteur`) carries no `minLength`, and
inventing one would be exactly the constraint not held by the contract that
this work forbids itself (see brief, review round 1 of task 6 on domain
allowlists).

Split out of `list_fields.py` in task 7, same seam as
`list_fields_sources.py`: "one section = one file", and the TWO sections here
share enough details (the timers) to fit together under 500 lines
effortlessly.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from . import schema
from .const import ACTION_SAVE
from .list_common import Section, _fusionner, _selecteur_entite, _selecteur_geste

# --------------------------------------------------------------------------
# `minuteurs`: timer slots (timer + name, two entities; free-form note).
# --------------------------------------------------------------------------

CHAMPS_MINUTEUR_SLOT = frozenset({"timer", "nom", "note"})


def _schema_minuteur_slot(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {
        vol.Required("timer"): _selecteur_entite(),
        vol.Required("nom"): _selecteur_entite(),
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_SAVE)] = _selecteur_geste()
    return vol.Schema(champs)


def _build_timer_slot_data(user_input: dict[str, Any], existant: dict | None) -> dict:
    item_data: dict[str, Any] = {"timer": user_input["timer"], "nom": user_input["nom"]}
    if user_input.get("note"):
        item_data["note"] = user_input["note"]
    return _fusionner(CHAMPS_MINUTEUR_SLOT, existant, item_data)


def _display_timer_slot(value: dict | None) -> dict:
    return dict(value) if value else {}


# --------------------------------------------------------------------------
# `etiquettesMinuteur`: an array of free strings, same shape family as
# `ouvrants` (list_fields.py) — a SCALAR item, not an object.
# --------------------------------------------------------------------------

def _schema_etiquette_minuteur(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {vol.Required("etiquette"): str}
    if editable:
        champs[vol.Optional("geste", default=ACTION_SAVE)] = _selecteur_geste()
    return vol.Schema(champs)


def _build_timer_label_data(user_input: dict[str, Any], existant: Any) -> Any:
    return user_input.get("etiquette")


def _display_timer_label(value: Any) -> dict:
    return {"etiquette": value} if value else {}


def _valider_etiquette_minuteur(value: Any) -> Any:
    """The contract (root $defs, `etiquettesMinuteur.items`) only carries
    `"type": "string"`: NO `minLength`, unlike `libelle`/`texte`/`nom` — an
    empty string is therefore VALID as far as the contract is concerned, and
    this module does not forbid it (an empty label has no "dead button"
    equivalent: it opens nothing and displays nothing misleading).

    `schema._string()` is the same LEAF validator as the one that types
    every `note`/`etat` of the voluptuous mirror; applied here DIRECTLY (a
    scalar item, not a nested object), it raises with an EMPTY path on a
    fault — attributed here, same fix as `_valider_ouvrant`
    (list_fields.py)."""
    try:
        return schema._string()(value)
    except vol.Invalid as err:
        if not err.path:
            raise type(err)(str(err), path=["etiquette"]) from err
        raise


SECTIONS: dict[str, Section] = {
    "minuteurs": Section(
        "minuteurs", lambda el: el["timer"], schema.MINUTEUR_SLOT, _schema_minuteur_slot,
        _build_timer_slot_data, _display_timer_slot,
    ),
    "etiquettesMinuteur": Section(
        "etiquettesMinuteur", lambda el: el, _valider_etiquette_minuteur,
        _schema_etiquette_minuteur, _build_timer_label_data,
        _display_timer_label,
    ),
}
