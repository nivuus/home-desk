"""Rewrites stored screens written at an earlier shape version.

Version 1 -> 2 (spec 2026-09-28, section 4): the hardcoded DeLorean scenes
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
`garde_ecran.migrer_sous_entree`, the single module allowed to call a Home
Assistant write gate (AST test
`test_garde_ecran_est_le_seul_module_a_appeler_une_porte_d_ecriture`)."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from . import garde_ecran
from .const import SUBENTRY_SCREEN

# The only shape this module knows how to lift to the current one.
_VERSION_SOURCE = 1
_VERSION_CIBLE = 2
_MODULATEUR_RETIRE = "delorean"


def migrer_donnees(data: Mapping[str, Any]) -> dict[str, Any] | None:
    """The version-2 form of a version-1 screen, or `None` when DATA is not
    at version 1 (already current, absent, unknown: none of those is this
    migration's business -- the transport names each of them on read).

    Key order is kept: `version` is rewritten in place, `delorean` is
    dropped, and inside `agencement` only `modulateurs` is filtered. A
    re-export of a migrated screen must not show a diff for a key the
    migration had no reason to touch."""
    if data.get("version") != _VERSION_SOURCE:
        return None
    migre: dict[str, Any] = {}
    for cle, valeur in data.items():
        if cle == "delorean":
            continue
        if cle == "version":
            valeur = _VERSION_CIBLE
        elif cle == "agencement" and isinstance(valeur, Mapping):
            valeur = {
                sous_cle: (
                    [m for m in sous_valeur if m != _MODULATEUR_RETIRE]
                    if sous_cle == "modulateurs" and isinstance(sous_valeur, list)
                    else sous_valeur
                )
                for sous_cle, sous_valeur in valeur.items()
            }
        migre[cle] = valeur
    return migre


def migrer_sous_entrees(hass: Any, entry: Any) -> int:
    """Rewrites every version-1 "ecran" subentry of ENTRY to version 2.
    Returns how many were rewritten -- 0 once everything is current, which
    makes a second call (a reload, a restart) a no-op."""
    reecrites = 0
    for subentry in list(entry.subentries.values()):
        if subentry.subentry_type != SUBENTRY_SCREEN:
            continue
        migre = migrer_donnees(subentry.data)
        if migre is None:
            continue
        garde_ecran.migrer_sous_entree(hass, entry, subentry, migre)
        reecrites += 1
    return reecrites
