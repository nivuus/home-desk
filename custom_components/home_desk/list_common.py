"""The primitives SHARED by every family of "list" sections: the common
entity selector, the gesture selector, the merge of an edited item with the
existing one (`_fusionner`), the two business-refusal exceptions
(`ServiceIncomplet`, `ChampVide`) and the `Section` shape itself.

Extracted from `list_fields.py` in task 7 — third version of this
paragraph, third inaccuracy fixed in review round 2 ("write what IS, not
what you meant to do"): task 7 adds NO section to the
button/summary/opening family of `list_fields.py` itself (`ouvrants`
already dated from task 6; `etiquettesMinuteur`, for that matter, does NOT
live in that module but in `list_fields_timers.py`, a distinct family).
What task 7 adds is THREE sections of a SEPARATE family (`sources`,
`minuteurs`, `etiquettesMinuteur`), in TWO new modules
(`list_fields_sources.py`, `list_fields_timers.py`) that need the SAME
primitives as `list_fields.py` (`_fusionner`, `ChampVide`,
`ServiceIncomplet`, `Section`, an entity selector, a gesture selector).
`list_fields.py` was ALREADY close to 500 lines since task 6 (427/500):
adding these primitives there, rather than extracting them HERE so that the
THREE modules import them, would have pushed it over the limit. The seam
chosen is the one the brief itself suggests ("one section = one file"):
this module carries what is TRULY common to the TWO families,
`list_fields.py` keeps the first one and assembles `SECTIONS` (still the
ONLY canonical address), the two task-7 modules carry the second. Without
this sharing, `_fusionner`/`ChampVide`/`ServiceIncomplet` would have had
two copies to diverge silently — exactly what this work forbids itself
everywhere else (schema.py, budget.py).

Review round 1 (re-export): the icon vocabulary
(`CHEMIN_ICONES`/`_ICONES_OPTIONS`/`_selecteur_icone`) and the MULTIPLE
entity selector (`_selecteur_entite_multiple`) went back to living in their
respective SOLE consumer (`list_fields.py`, `list_fields_sources.py`):
leaving them here was only a re-export so as not to break anything during
the move, exactly the anti-pattern that task 6 had already fixed for
`SECTIONS` — never shared by a SECOND family.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import voluptuous as vol

from homeassistant.helpers import selector

from .const import ACTION_MOVE_DOWN, ACTION_SAVE, ACTION_MOVE_UP, ACTION_DELETE

_ACTIONS_EDITION = [ACTION_SAVE, ACTION_MOVE_UP, ACTION_MOVE_DOWN, ACTION_DELETE]


def _selecteur_entite() -> selector.EntitySelector:
    """No domain restriction, on ANY section (checked against the three
    real screens, see task 6 report): the `domaines` parameter has never
    been reintroduced since its removal in round 2."""
    return selector.EntitySelector(selector.EntitySelectorConfig())


def _selecteur_geste() -> selector.SelectSelector:
    """The four gestures are FIXED values (never dynamic like the options
    of `element`, list_sections.py): `translation_key` applies to them
    cleanly, the same mechanism `derivative` uses for `time_unit`
    (`homeassistant/components/derivative/config_flow.py` +
    `strings.json` -> `selector.time_unit.options`)."""
    return selector.SelectSelector(
        selector.SelectSelectorConfig(options=list(_ACTIONS_EDITION), translation_key="geste")
    )


def _fusionner(champs_contrat: frozenset[str], existant: dict | None, item_data: dict) -> dict:
    """Replaces an existing item only with the fields THIS form manages
    (`item_data`); any contract field the existing item carried and that
    this form does NOT manage yet (`champs_contrat` excludes the complement)
    survives intact. See the task 6 report, round 1 (the Critical) for the
    incident this function fixes."""
    fusion = {k: v for k, v in (existant or {}).items() if k not in champs_contrat}
    fusion.update(item_data)
    return fusion


class ServiceIncomplet(Exception):
    """Raised by `list_fields._build_button_data` when
    `service_domaine`/`service_action` are half filled. See the task 6
    report, round 3, for the unreadable message this exception replaces
    (`schema._paire_service()` replayed by hand, raw JSON Schema pattern
    set on "base")."""

    def __init__(self, champ_vide: str) -> None:
        self.champ_vide = champ_vide
        super().__init__(champ_vide)


class ChampVide(Exception):
    """Raised when a REQUIRED text field of a "list" section
    ($defs/bouton.libelle, $defs/synthese.texte, $defs/source.nom) is empty
    or contains ONLY spaces — never a fix in schema.py, which must stay
    faithful to the contract shared with ajv (spaces count there as
    characters, see its original docstring in list_fields.py, round 4 of
    task 6)."""

    def __init__(self, champ: str) -> None:
        self.champ = champ
        super().__init__(champ)


@dataclass(frozen=True)
class Section:
    """What `list_sections.ListSectionsMixin` needs to know about a
    section, and NOTHING more: how to display an item in the choice
    (`libelle`), validate it (`valider`), build its form
    (`construire_schema`), produce the data to validate from the input
    (`build_data`), and produce the suggested values from the stored data
    (`display`)."""

    cle: str
    libelle: Callable[[Any], str]
    valider: Callable[[Any], Any]
    construire_schema: Callable[[bool], vol.Schema]
    build_data: Callable[[dict, Any], Any]
    display: Callable[[Any], dict]
