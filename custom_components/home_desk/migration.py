"""Rewrites stored subentries written at an earlier shape version.

House version 1 -> 2 (card stack spec, "Configuration"): the house gains
`appareils`. A version-1 house has none, so it gets an empty list
(`migrate_house_data`); its sources are untouched.

Screen version 1 -> 2 (spec 2026-09-28, section 4): the hardcoded DeLorean scenes
are gone from the tablet, replaced by animations launched from Home
Assistant (`home_desk.jouer_animation`). Version 2 drops the root `delorean`
flag and the `delorean` value of `agencement.modulateurs`; nothing else
changes shape.

Called by `async_setup_entry` BEFORE anything reads the subentries:
`websocket._resoudre` refuses any version other than `VERSION_CONFIG`, so a
screen left at version 1 would go dark on the next restart.

Why not Home Assistant's own `async_migrate_entry`: it migrates the ENTRY
(`ConfigEntry.version`/`minor_version`), while the version that the tablet
and the contract know is carried by each SUBENTRY's data (`version`, the
shape of ONE screen). Bumping the entry version would duplicate that number
in a second place that nothing else reads.

This module holds the pure data transform only; the write goes through
`garde_ecran.migrate_subentry`, the single module allowed to call a Home
Assistant write gate (AST test
`test_garde_ecran_est_le_seul_module_a_appeler_une_porte_d_ecriture`)."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from . import garde_ecran
from .const import SUBENTRY_HOUSE, SUBENTRY_SCREEN

# The only shape this module knows how to lift to the current one, for a
# screen and for the house alike.
_SOURCE_VERSION = 1
_TARGET_VERSION = 2
_REMOVED_MODULATOR = "delorean"


def migrate_data(data: Mapping[str, Any]) -> dict[str, Any] | None:
    """The version-2 form of a version-1 screen, or `None` when DATA is not
    at version 1 (already current, absent, unknown: none of those is this
    migration's business -- the transport names each of them on read).

    Key order is kept: `version` is rewritten in place, `delorean` is
    dropped, and inside `agencement` only `modulateurs` is filtered. A
    re-export of a migrated screen must not show a diff for a key the
    migration had no reason to touch."""
    if data.get("version") != _SOURCE_VERSION:
        return None
    migrated: dict[str, Any] = {}
    for key, value in data.items():
        if key == "delorean":
            continue
        if key == "version":
            value = _TARGET_VERSION
        elif key == "agencement" and isinstance(value, Mapping):
            value = {
                sub_key: (
                    [m for m in sub_value if m != _REMOVED_MODULATOR]
                    if sub_key == "modulateurs" and isinstance(sub_value, list)
                    else sub_value
                )
                for sub_key, sub_value in value.items()
            }
        migrated[key] = value
    return migrated


def migrate_house_data(data: Mapping[str, Any]) -> dict[str, Any] | None:
    """The version-2 form of a version-1 house (no appliances yet), or
    `None` when DATA is not at version 1. `version` is rewritten in place
    and `appareils` appended, so the key order of a re-export only grows."""
    if data.get("version") != _SOURCE_VERSION:
        return None
    return {**data, "version": _TARGET_VERSION, "appareils": []}


# Each subentry type migrates through its own transform; any other type is
# left alone.
_MIGRATIONS = {SUBENTRY_SCREEN: migrate_data, SUBENTRY_HOUSE: migrate_house_data}


def migrate_subentries(hass: Any, entry: Any) -> int:
    """Rewrites every version-1 screen and house subentry of ENTRY to
    version 2. Returns how many were rewritten -- 0 once everything is
    current, which makes a second call (a reload, a restart) a no-op."""
    rewritten = 0
    for subentry in list(entry.subentries.values()):
        migrate = _MIGRATIONS.get(subentry.subentry_type)
        if migrate is None:
            continue
        migrated = migrate(subentry.data)
        if migrated is None:
            continue
        garde_ecran.migrate_subentry(hass, entry, subentry, migrated)
        rewritten += 1
    return rewritten
