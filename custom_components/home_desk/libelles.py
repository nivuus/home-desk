"""Translates a RAW contract identifier (a section) into its human label —
for the place where such an identifier ends up in a
`description_placeholders`, never in a `SelectSelector` (which translates
itself via `translation_key`, see `objets.py`): the
`ecran_deviendrait_invalide` message (garde_ecran.py). And the house
subentry's title.

Review round 2: measured — `errors["base"]` carried `description_
placeholders["section"] = "minuteurs"` (the RAW identifier), while the
frontend displays "Timers" next to it (the translated option of the `mode`
selector): the SAME fault that minor 6 of round 1 had already closed for the
`SelectSelector` options — just not closed HERE, where the identifier does
not go through a selector but through an error text.

READS the SAME source as the frontend (`translations/*.json`), never a
second table that could diverge — exactly the prohibition this project
applies everywhere else (schema.py, budget.py). The language comes from
`hass.config.language`: the Home Assistant INSTANCE setting (not a
per-visitor choice — a config flow has no other reliable signal), defaulting
to "en" (checked in `homeassistant/core_config.py`)."""
from __future__ import annotations

import json
import pathlib

CHEMIN_TRADUCTIONS = pathlib.Path(__file__).parent / "translations"


def _traductions(langue: str) -> dict:
    chemin = CHEMIN_TRADUCTIONS / f"{langue}.json"
    if not chemin.exists():
        chemin = CHEMIN_TRADUCTIONS / "fr.json"
    return json.loads(chemin.read_text(encoding="utf-8"))


def _langue(hass) -> str:
    config = getattr(hass, "config", None)
    return getattr(config, "language", None) or "fr"


def section(hass, cle: str) -> str:
    """The human label of a section key, the one from the reconfiguration
    menu (`config_subentries.ecran.step.reconfigure.
    menu_options`) — this menu already covers the "list" sections AND the
    two "object" sections (agencement, voiture). Falls back to `cle` itself
    if absent: must never happen for a real key, but must never raise
    either (a degraded text is better than a broken flow)."""
    menu = _traductions(_langue(hass))["config_subentries"]["ecran"]["step"]["reconfigure"]["menu_options"]
    return menu.get(cle, cle)


def house_title(hass) -> str:
    """The title of the house subentry, in the instance's language: the
    subentry type's own name (`config_subentries.maison.entry_type`), so
    the integration page lists it under the word it was added with."""
    return _traductions(_langue(hass))["config_subentries"]["maison"]["entry_type"]
