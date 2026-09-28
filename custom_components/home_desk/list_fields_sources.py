"""The `sources` "list" section ($defs/source of the contract): a name and
six entity sets (title, subtitle, poster, progress, transport, volume — the
`_CHAMPS_MULTI_ENTITES` keys below), plus the optional `allumee` object
(entity + states). Split from `list_fields.py` in task 7 along the seam
described in its own module docstring ("one section = one file", suggested
by the brief).

**Deliberate fallback, to be stated in the report rather than kept quiet:**
the brief asks for COLLAPSIBLE sections for the six entity sets of a
source. `selector.EntitySelector(multiple=True)` does exist in this version
of Home Assistant (checked in the container's sources, `helpers/selector.py`
— `EntitySelectorConfig.multiple: bool`), but the subentry flow API offers
NO collapsible section inside ONE step (`data_schema` is a flat form, not
an accordion): the fallback chosen is therefore ONE step per source, its
six fields laid out flat as MULTIPLE entity selectors — exactly the
fallback the brief explicitly allows.

Review round 1 (re-export): `_selecteur_entite_multiple` lives directly
HERE, never in `list_common.py` — this module is its ONLY consumer (the six
entity sets of $defs/source). A re-export from `list_common.py` would only
have served to break nothing on the first move, exactly the anti-pattern
that task 6 had already corrected for `SECTIONS`.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.helpers import selector

from . import schema
from .const import ACTION_SAVE
from .list_common import ChampVide, Section, _fusionner, _selecteur_entite, _selecteur_geste

CHAMPS_SOURCE = frozenset(
    {"nom", "titre", "sousTitre", "affiche", "progression", "transport", "volume", "allumee", "note"}
)

_CHAMPS_MULTI_ENTITES = ("titre", "sousTitre", "affiche", "progression", "transport", "volume")


def _selecteur_entite_multiple() -> selector.EntitySelector:
    """The multi-valued counterpart of `list_common._selecteur_entite`,
    for the six entity sets of `$defs/source` (title, subtitle, poster,
    progress, transport, volume) — each an ARRAY of entities in the
    contract, never a single one. Same absence of domain restriction."""
    return selector.EntitySelector(selector.EntitySelectorConfig(multiple=True))


class AllumeeIncomplete(Exception):
    """The counterpart of `list_common.ServiceIncomplet` for the
    `allumee_entite`/`allumee_etats` pair: only one of the two fields filled
    in would be dropped silently (or worse, would truncate `allumee` into an
    object invalid in the contract's sense, `$defs/source.allumee` requiring
    `entite` AND `etats`) without this guard. A DEDICATED exception rather
    than reusing `ServiceIncomplet`: the latter's message explicitly names
    "the two fields of the SERVICE" (`translations/*.json`,
    `service_incomplet`) — a lie if it were displayed here, for a pair that
    has nothing to do with a service call."""

    def __init__(self, champ_vide: str) -> None:
        self.champ_vide = champ_vide
        super().__init__(champ_vide)


def _schema_source(editable: bool) -> vol.Schema:
    """Review round 1 (Important I5): the six multi-entity fields were
    `vol.Required(...)` WITHOUT a `default` — the SAME fault that the
    `objets.py` docstring spells out for `zones`/`modes`/`modulateurs`
    ("a field never touched must still submit an EMPTY LIST, never a
    missing key") without this module following it. Measured: submitting a
    source without touching `titre` (a MULTIPLE entity selector, zero
    selection = zero key in the payload) raised `InvalidData` — an uncaught
    EXCEPTION, never a form shown again with errors. The contract
    ($defs/source) imposes NO `minItems` on these six arrays anyway: a
    source with a single entity set filled in (the rest left empty) is
    already VALID in the contract's sense — `default=list` only assumes
    what the contract already allows, never one more invented
    constraint."""
    champs: dict[Any, Any] = {
        vol.Required("nom"): str,
        vol.Optional("titre", default=list): _selecteur_entite_multiple(),
        vol.Optional("sousTitre", default=list): _selecteur_entite_multiple(),
        vol.Optional("affiche", default=list): _selecteur_entite_multiple(),
        vol.Optional("progression", default=list): _selecteur_entite_multiple(),
        vol.Optional("transport", default=list): _selecteur_entite_multiple(),
        vol.Optional("volume", default=list): _selecteur_entite_multiple(),
        vol.Optional("allumee_entite"): _selecteur_entite(),
        vol.Optional("allumee_etats"): str,
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_SAVE)] = _selecteur_geste()
    return vol.Schema(champs)


def _build_source_data(user_input: dict[str, Any], existant: dict | None) -> dict:
    """`allumee_etats` is entered as a comma-separated list: the contract
    has no HA equivalent with a variable number of inputs for a short
    `list[str]`. Review round 1 (Minor): this splitting has TWO real
    limits, neither invented nor fixed here (the first would be a change of
    input format, the second a divergence from the contract, which does not
    require a non-empty state) — a state that itself contains a comma
    cannot be entered (no real HA state carries one, to date); an EMPTY
    segment between two commas (double comma, leading/trailing comma) is
    silently DROPPED rather than refused."""
    if not (user_input.get("nom") or "").strip():
        raise ChampVide("nom")
    item_data: dict[str, Any] = {"nom": user_input["nom"]}
    for champ in _CHAMPS_MULTI_ENTITES:
        item_data[champ] = list(user_input.get(champ) or [])
    entite = (user_input.get("allumee_entite") or "").strip()
    etats_bruts = (user_input.get("allumee_etats") or "").strip()
    if entite and etats_bruts:
        item_data["allumee"] = {
            "entite": entite,
            "etats": [e.strip() for e in etats_bruts.split(",") if e.strip()],
        }
    elif entite or etats_bruts:
        raise AllumeeIncomplete("allumee_etats" if entite else "allumee_entite")
    if user_input.get("note"):
        item_data["note"] = user_input["note"]
    return _fusionner(CHAMPS_SOURCE, existant, item_data)


def _display_source(value: dict | None) -> dict:
    if not value:
        return {}
    affichage = dict(value)
    allumee = affichage.pop("allumee", None)
    if allumee:
        affichage["allumee_entite"] = allumee.get("entite")
        affichage["allumee_etats"] = ", ".join(allumee.get("etats", []))
    return affichage


SECTIONS: dict[str, Section] = {
    "sources": Section(
        "sources", lambda el: el["nom"], schema.SOURCE, _schema_source,
        _build_source_data, _display_source,
    ),
}
