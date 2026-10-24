"""The house subentry flow: the media sources shared by every tablet,
declared once (contrat/maison.schema.json) instead of on each screen.

The shared list is a SUBENTRY, not `entry.data`/options: the entry holds
nothing by design (`HomeDeskConfigFlow`), and a subentry already has the
guarded write path, the change listener and the list-section UI.

At most one house subentry: `async_step_user` aborts with
`already_configured` when one exists, and otherwise creates it EMPTY and
valid (`{"version": VERSION_MAISON, "sources": [], "appareils": []}`) --
there is nothing to enter at creation. The sources are then added from
`async_step_reconfigure`, which opens the list directly (a single section,
so no menu).

The appliances (`appareils`) have no form: they are written through the YAML
(`home_desk.exporter` / `home_desk.importer`). Saving the sources rewrites
`{**subentry.data, "sources": ...}`, so the appliances travel through the
form untouched.

Reuses `list_sections.ListSectionsMixin` (choose/add/edit/move/remove one
item) with two overrides: `_sections` (`HOUSE_SECTIONS`, the screen source
fields plus a REQUIRED `piece`) and `_persister_si_valide` (the house gate,
`garde_ecran.persist_house_if_valid`, instead of the screen one). The
mixin's step names (`async_step_sources`, `async_step_sources_element`)
are spelt out here: Home Assistant calls a step by its name.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigSubentry, ConfigSubentryFlow, SubentryFlowResult

from . import garde_ecran, libelles, schema
from .const import ERROR_HOUSE_WOULD_BECOME_INVALID, SUBENTRY_HOUSE
from .list_fields_sources import HOUSE_SECTIONS
from .list_sections import ListSectionsMixin

_SOURCES = "sources"
_APPLIANCES = "appareils"


class HouseSubentryFlow(ListSectionsMixin, ConfigSubentryFlow):
    """One subentry for the whole house: its shared media sources."""

    _sections = HOUSE_SECTIONS

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        entry = self._get_entry()
        if any(s.subentry_type == SUBENTRY_HOUSE for s in entry.subentries.values()):
            return self.async_abort(reason="already_configured")
        return self.async_create_entry(
            title=libelles.house_title(self.hass),
            data={"version": schema.VERSION_MAISON, _SOURCES: [], _APPLIANCES: []},
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section(_SOURCES, user_input)

    async def async_step_sources(
        self,
        user_input: dict[str, Any] | None = None,
        description_placeholders: dict[str, str] | None = None,
    ) -> SubentryFlowResult:
        return await self._async_step_section(_SOURCES, user_input, description_placeholders)

    async def async_step_sources_element(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section_element(_SOURCES, user_input)

    def _persister_si_valide(
        self,
        entry: ConfigEntry,
        subentry: ConfigSubentry,
        cle: str,
        elements: list,
        errors: dict[str, str],
        description_placeholders: dict[str, str],
    ) -> bool:
        """The house counterpart of the mixin's screen gate: writes the
        complete house list through `garde_ecran.persist_house_if_valid`,
        or reports the refusal on the form and writes nothing."""
        try:
            garde_ecran.persist_house_if_valid(
                self.hass, entry, subentry, {**subentry.data, cle: elements})
        except vol.Invalid:
            errors["base"] = ERROR_HOUSE_WOULD_BECOME_INVALID
            return False
        return True
