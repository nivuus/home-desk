"""The CATALOGUE of the "list" sections of the $defs/bouton,
$defs/synthese and ouvrants (scalar) family: their fields, their selectors,
how an item is built and displayed. `list_sections.py` holds the SKELETON
(choose/add/edit/move up/move down/delete), identical for every section;
this module holds what DIFFERS for THIS family — exactly the seam that
task 6 describes ("they differ by their fields, not by their shape").

This module remains the ONLY canonical address of `SECTIONS` (review
round 2, task 6): `list_fields_sources.py` and `list_fields_timers.py`
(task 7, media sources / timers / timer labels) each hold THEIR family of
sections, but their dictionaries are merged HERE into `SECTIONS` — never
consumed directly by `list_sections.py` or `config_flow.py`, which keep
importing ONLY `list_fields.SECTIONS`. The primitives TRULY shared between
the three modules (`_selecteur_entite`, `_selecteur_geste`, `_fusionner`,
`ChampVide`, `ServiceIncomplet`, `Section`) were extracted into
`list_common.py` on the same occasion: without that sharing, copying them
would have been the silent divergence this work forbids itself everywhere
else (schema.py, budget.py).

Review round 1 (re-export): `CHEMIN_ICONES`/`_ICONES_OPTIONS`/
`_selecteur_icone`, for their part, live directly HERE — never in
`list_common.py` — since this module is their ONLY consumer (the icon
vocabulary only serves $defs/bouton). A re-export from `list_common.py`
would only have served to break nothing on the first move, exactly the
anti-pattern that task 6 had already corrected for `SECTIONS`.
"""
from __future__ import annotations

import json
import pathlib
from typing import Any

import voluptuous as vol

from homeassistant.helpers import selector

from . import schema
from .const import ACTION_SAVE
from .list_common import (
    ChampVide,
    Section,
    ServiceIncomplet,
    _fusionner,
    _selecteur_entite,
    _selecteur_geste,
)
from .list_fields_timers import SECTIONS as _SECTIONS_MINUTEURS
from .list_fields_sources import SECTIONS as _SECTIONS_SOURCES

__all__ = ["SECTIONS", "Section", "ChampVide", "ServiceIncomplet"]

# The icon vocabulary comes from contrat/icones.json, NEVER retyped by
# hand. Review round 1: brought back here from `list_common.py`, this being
# its only consumer (see the module docstring above).
CHEMIN_ICONES = pathlib.Path(__file__).parent / "contrat" / "icones.json"
_ICONES_OPTIONS: list[str] = json.loads(CHEMIN_ICONES.read_text(encoding="utf-8"))["icones"]


def _selecteur_icone() -> selector.SelectSelector:
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=list(_ICONES_OPTIONS), mode=selector.SelectSelectorMode.DROPDOWN
        )
    )

# --------------------------------------------------------------------------
# $defs/bouton (commandes, ambiances, extrasMaison): TEN properties in the
# contract, ten in this form — no field left that this form would
# ignore. `service` (a pair of two strings) has no two-value HA
# equivalent: two separate text fields (`service_domaine`/
# `service_action`), recombined into an array by `_build_button_data`
# and split for display by `_display_button`. `vue` keeps its broad
# `str` here: its `^#` pattern is THE ONE from `schema.BOUTON`
# (`_VUE_PATTERN`), replayed at validation — never retyped here.
# --------------------------------------------------------------------------

CHAMPS_BOUTON = frozenset(
    {
        "libelle", "icone", "entite", "cible", "service", "lien", "vue",
        "epingle", "absenceNommee", "note",
    }
)

_CHAMPS_TEXTE_BOUTON = ("libelle", "icone", "entite", "cible", "lien", "vue", "absenceNommee", "note")


def _schema_bouton(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {
        vol.Required("libelle"): str,
        vol.Required("icone"): _selecteur_icone(),
        vol.Required("entite"): _selecteur_entite(),
        vol.Optional("cible"): _selecteur_entite(),
        vol.Optional("service_domaine"): str,
        vol.Optional("service_action"): str,
        vol.Optional("lien"): str,
        vol.Optional("vue"): str,
        vol.Optional("epingle", default=False): selector.BooleanSelector(),
        vol.Optional("absenceNommee"): str,
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_SAVE)] = _selecteur_geste()
    return vol.Schema(champs)


def _build_button_data(user_input: dict[str, Any], existant: dict | None) -> dict:
    """Review round 2 (task 6): `service_domaine`/`service_action`, a
    half-filled pair, used to raise silently before. Now refused via
    `ServiceIncomplet(champ_vide)`.

    Round 4: a `libelle` that is empty or made only of spaces now raises
    `ChampVide("libelle")`, same doctrine as `nom`."""
    if not (user_input.get("libelle") or "").strip():
        raise ChampVide("libelle")
    item_data: dict[str, Any] = {}
    for champ in _CHAMPS_TEXTE_BOUTON:
        value = user_input.get(champ)
        if value not in (None, ""):
            item_data[champ] = value
    if user_input.get("epingle") is True:
        item_data["epingle"] = True
    domaine = (user_input.get("service_domaine") or "").strip()
    action = (user_input.get("service_action") or "").strip()
    if domaine and not action:
        raise ServiceIncomplet("service_action")
    if action and not domaine:
        raise ServiceIncomplet("service_domaine")
    if domaine and action:
        item_data["service"] = [domaine, action]
    return _fusionner(CHAMPS_BOUTON, existant, item_data)


def _display_button(value: dict | None) -> dict:
    """The inverse of `_build_button_data` for `service`: a stored array
    `["light", "turn_on"]` becomes the two text fields of the form
    again."""
    if not value:
        return {}
    affichage = dict(value)
    service = affichage.pop("service", None)
    if service:
        affichage["service_domaine"], affichage["service_action"] = service[0], service[1]
    return affichage


# --------------------------------------------------------------------------
# $defs/synthese (summary line): EIGHT properties in the contract, eight
# in this form.
# --------------------------------------------------------------------------

CHAMPS_SYNTHESE = frozenset(
    {"entite", "texte", "operateur", "valeur", "perso", "horsTaches", "absenceNommee", "note"}
)

_CHAMPS_TEXTE_SYNTHESE = ("entite", "texte", "operateur", "absenceNommee", "note")


def _schema_synthese(editable: bool) -> vol.Schema:
    """The comparison value stays a SINGLE TEXT FIELD: `<`/`>` require a
    number, `==`/`!=` also accept a string — the union discriminated by
    `operateur` that `_build_summary_data`/`schema.SYNTHESE` settle
    together (conversion then validation)."""
    champs: dict[Any, Any] = {
        vol.Required("entite"): _selecteur_entite(),
        vol.Required("texte"): str,
        vol.Required("operateur"): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.OPERATEURS), mode=selector.SelectSelectorMode.DROPDOWN
            )
        ),
        vol.Required("valeur"): str,
        vol.Optional("perso", default=False): selector.BooleanSelector(),
        vol.Optional("horsTaches", default=False): selector.BooleanSelector(),
        vol.Optional("absenceNommee"): str,
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_SAVE)] = _selecteur_geste()
    return vol.Schema(champs)


def _convert_value(brut: str) -> Any:
    """A numeric input (`"35"`, `"-2.5"`) becomes a number; anything else
    stays a string. `int` before `float`."""
    try:
        return int(brut)
    except ValueError:
        pass
    try:
        return float(brut)
    except ValueError:
        return brut


def _build_summary_data(user_input: dict[str, Any], existant: dict | None) -> dict:
    """Review round 4 (minor): a `texte` that is empty or made only of
    spaces raises `ChampVide("texte")`."""
    if not (user_input.get("texte") or "").strip():
        raise ChampVide("texte")
    item_data: dict[str, Any] = {}
    for champ in _CHAMPS_TEXTE_SYNTHESE:
        value = user_input.get(champ)
        if value not in (None, ""):
            item_data[champ] = value
    raw_value = user_input.get("valeur")
    if raw_value not in (None, ""):
        item_data["valeur"] = _convert_value(raw_value)
    if user_input.get("perso") is True:
        item_data["perso"] = True
    if user_input.get("horsTaches") is True:
        item_data["horsTaches"] = True
    return _fusionner(CHAMPS_SYNTHESE, existant, item_data)


def _display_summary(value: dict | None) -> dict:
    """The comparison value is STORED as a NUMBER (int/float) as soon as
    `_convert_value` has succeeded, but `_schema_synthese` declares that
    field `str` — suggesting the number AS IS again would break the
    agreement between the two (see the task 6 report, round 4)."""
    if not value:
        return {}
    affichage = dict(value)
    if "valeur" in affichage:
        affichage["valeur"] = str(affichage["valeur"])
    return affichage


# --------------------------------------------------------------------------
# `ouvrants` (contract root): an array of `entite`, no `bouton` — the
# "simpler list, without a tile form" section. An item is a string, not a
# dict.
# --------------------------------------------------------------------------

def _schema_ouvrant(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {vol.Required("entite"): _selecteur_entite()}
    if editable:
        champs[vol.Optional("geste", default=ACTION_SAVE)] = _selecteur_geste()
    return vol.Schema(champs)


def _build_opening_data(user_input: dict[str, Any], existant: Any) -> Any:
    return user_input.get("entite")


def _display_opening(value: Any) -> dict:
    return {"entite": value} if value else {}


def _valider_ouvrant(value: Any) -> Any:
    """`schema.ENTITE` is a LEAF validator: an invalid entity raises with
    an EMPTY path — we assign that path ourselves rather than letting
    `_async_step_section_element` fall back to "base"."""
    try:
        return schema.ENTITE(value)
    except vol.Invalid as err:
        if not err.path:
            raise type(err)(str(err), path=["entite"]) from err
        raise


# The skeleton (list_sections.py) is reused EIGHT times since task 7: the
# command tiles, the ambiance row and the house extras share literally the
# same shape ($defs/bouton), only the data key changes. The summary line
# differs by its fields ($defs/synthese), the openings by their SHAPE (a
# scalar, not an object) — the sources, the timer slots and the timer
# labels (list_fields_sources.py, list_fields_timers.py) differ in the same
# way, never by the choose/add/edit/move up/move down/delete path.
SECTIONS: dict[str, Section] = {
    "commandes": Section(
        "commandes", lambda el: el["libelle"], schema.BOUTON, _schema_bouton,
        _build_button_data, _display_button,
    ),
    "ambiances": Section(
        "ambiances", lambda el: el["libelle"], schema.BOUTON, _schema_bouton,
        _build_button_data, _display_button,
    ),
    "extrasMaison": Section(
        "extrasMaison", lambda el: el["libelle"], schema.BOUTON, _schema_bouton,
        _build_button_data, _display_button,
    ),
    "ouvrants": Section(
        "ouvrants", lambda el: el, _valider_ouvrant, _schema_ouvrant,
        _build_opening_data, _display_opening,
    ),
    # Task 7: the extra task-lists section (contract root, the key just
    # below) has EXACTLY the same shape as `ouvrants`
    # (`contrat/ecran.schema.json`: an array of bare `entite`, no objects)
    # -- the same quartet of functions, one of the four root fields that
    # had NO input door (`aspirateurMaison`, the last of the four, has had
    # its own since plan 3c, task 1 -- objets.py, "object" section).
    "listesTachesExtra": Section(
        "listesTachesExtra", lambda el: el, _valider_ouvrant, _schema_ouvrant,
        _build_opening_data, _display_opening,
    ),
    "synthese": Section(
        "synthese", lambda el: el["texte"], schema.SYNTHESE, _schema_synthese,
        _build_summary_data, _display_summary,
    ),
    **_SECTIONS_SOURCES,
    **_SECTIONS_MINUTEURS,
}
