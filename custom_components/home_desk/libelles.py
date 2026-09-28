"""Translates a RAW contract identifier (a section, a mode) into its
human label — for the TWO places where such an identifier ends up in a
`description_placeholders`, never in a `SelectSelector` (which translates
itself via `translation_key`, see `objets.py`): the
`ecran_deviendrait_invalide` message (garde_ecran.py) and `budget_intenable_mode`
(objets.py).

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


def mode(hass, cle: str) -> str:
    """The human label of a mode (`selector.mode.options`, published in round
    1 for the `SelectSelector` of `SCHEMA_AGENCEMENT` — reused HERE rather
    than retyped)."""
    options = _traductions(_langue(hass))["selector"]["mode"]["options"]
    return options.get(cle, cle)
