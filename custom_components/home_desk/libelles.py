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
applies everywhere else (schema.py, budget.py). It reads them through Home
Assistant's translation cache (`translation.async_get_cached_translations`,
as `registre.avertissement_entites_inconnues` does), loaded outside the event
loop when the integration is set up: a call reads no file. The language is
`hass.config.language`, the instance setting (a config flow has no other
reliable signal), and a key missing in it falls back the way Home Assistant
does, to English, key by key -- this module chooses no language itself."""
from __future__ import annotations

from homeassistant.helpers import translation

from .const import DOMAIN, SUBENTRY_HOUSE

_CATEGORY = "config_subentries"


def _label(hass, key: str) -> str | None:
    cached = translation.async_get_cached_translations(
        hass, hass.config.language, _CATEGORY, DOMAIN)
    return cached.get(f"component.{DOMAIN}.{_CATEGORY}.{key}")


def section(hass, cle: str) -> str:
    """The human label of a section key, the one from the reconfiguration
    menu (`config_subentries.ecran.step.reconfigure.
    menu_options`) — this menu already covers the "list" sections AND the
    two "object" sections (agencement, voiture). Falls back to `cle` itself
    if absent: must never happen for a real key, but must never raise
    either (a degraded text is better than a broken flow)."""
    return _label(hass, f"ecran.step.reconfigure.menu_options.{cle}") or cle


def house_title(hass) -> str:
    """The title of the house subentry, in the instance's language: the
    subentry type's own name (`config_subentries.maison.entry_type`), so
    the integration page lists it under the word it was added with. Falls
    back to the raw subentry type, like `section` falls back to its key."""
    return _label(hass, f"{SUBENTRY_HOUSE}.entry_type") or SUBENTRY_HOUSE
