"""Vacuum rooms for the tablets: where each robot can clean, and launching it.

Two websocket commands, both open to any authenticated user -- the tablets
log in as a NON-ADMIN user, and Home Assistant's own `vacuum/get_segments` is
`require_admin` (same reason as `home_desk/abonner`, see `websocket.py`):

`home_desk/aspirateurs` -> `[{entite, nom, pieces: [{zone, nom}], passages:
{min, max, raison?}}]`, one per vacuum whose segments are mapped to Home
Assistant areas ("Map vacuum segments to areas" in the entity settings). The
rooms are those areas, in the mapping's order, named as the area registry
names them -- never a list written in this repository. `raison` is present
only when the robot COULD do several passes but its bounds could not be read:
the tablet then says why it offers a single one instead of hiding it.

`home_desk/aspirer` {entite, zones, passages} -> cleans those areas. One pass
is Home Assistant's standard `vacuum.clean_area`, called with the tablet
user's context; several passes go through `valetudo.py`, the only door that
knows how to say "twice".
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import area_registry as ar, entity_registry as er

from . import valetudo
from .const import DOMAIN

WS_ASPIRATEURS = f"{DOMAIN}/aspirateurs"
WS_ASPIRER = f"{DOMAIN}/aspirer"

ERROR_VACUUM_UNKNOWN = "aspirateur_inconnu"
ERROR_ROOMS_UNMAPPED = "pieces_non_cartographiees"
ERROR_PASSES_OUT_OF_BOUNDS = "passages_hors_bornes"
ERROR_ROBOT_UNREACHABLE = "robot_injoignable"
ERROR_CLEAN_REFUSED = "nettoyage_refuse"


def _cartographie(entree: er.RegistryEntry) -> dict[str, list[str]]:
    return entree.options.get("vacuum", {}).get("area_mapping") or {}


async def _passages(hass: HomeAssistant, entity_id: str) -> dict[str, Any]:
    cible = valetudo.robot(hass, entity_id)
    if cible is None:
        return {"min": 1, "max": 1}
    try:
        capacite = await valetudo.capacite(hass, cible)
    except valetudo.RobotInjoignable as err:
        return {"min": 1, "max": 1, "raison": str(err)}
    return {"min": capacite.passages_min, "max": capacite.passages_max}


async def lister(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Every vacuum with at least one segment mapped to an existing area."""
    zones = ar.async_get(hass)
    robots = []
    for entree in er.async_get(hass).entities.values():
        if entree.domain != "vacuum" or entree.disabled:
            continue
        pieces = [
            {"zone": zone.id, "nom": zone.name}
            for zone in (zones.async_get_area(z) for z in _cartographie(entree))
            if zone is not None
        ]
        if not pieces:
            continue
        etat = hass.states.get(entree.entity_id)
        robots.append({
            "entite": entree.entity_id,
            "nom": etat.name if etat is not None else entree.entity_id,
            "pieces": pieces,
            "passages": await _passages(hass, entree.entity_id),
        })
    return sorted(robots, key=lambda r: r["nom"])


class Refus(Exception):
    """A launch refused before anything reached the robot."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


async def lancer(hass: HomeAssistant, entity_id: str, zones: list[str], passages: int,
                 context: Any) -> None:
    """Cleans `zones` with `entity_id`, `passages` times over."""
    entree = er.async_get(hass).async_get(entity_id)
    if entree is None or entree.domain != "vacuum":
        raise Refus(ERROR_VACUUM_UNKNOWN, f"{entity_id} is not a known vacuum")
    carte = _cartographie(entree)
    absentes = [z for z in zones if z not in carte]
    if absentes:
        raise Refus(ERROR_ROOMS_UNMAPPED,
                    f"{entity_id} has no segment mapped to {', '.join(absentes)}")
    if passages == 1:
        await hass.services.async_call(
            "vacuum", "clean_area", {"entity_id": entity_id, "cleaning_area_id": zones},
            blocking=True, context=context)
        return
    cible = valetudo.robot(hass, entity_id)
    if cible is None:
        raise Refus(ERROR_PASSES_OUT_OF_BOUNDS, f"{entity_id} cleans in a single pass only")
    try:
        capacite = await valetudo.capacite(hass, cible)
    except valetudo.RobotInjoignable as err:
        raise Refus(ERROR_ROBOT_UNREACHABLE, str(err)) from err
    if not capacite.passages_min <= passages <= capacite.passages_max:
        raise Refus(ERROR_PASSES_OUT_OF_BOUNDS,
                    f"{entity_id} accepts {capacite.passages_min} to "
                    f"{capacite.passages_max} passes, not {passages}")
    # Same order and de-duplication as core's `clean_area`: the rooms in the
    # order chosen, each segment once.
    segments = list(dict.fromkeys(s for z in zones for s in carte[z]))
    await valetudo.nettoyer(hass, cible, segments, passages, capacite.ordre)


@websocket_api.websocket_command({vol.Required("type"): WS_ASPIRATEURS})
@websocket_api.async_response
async def ws_aspirateurs(hass: HomeAssistant, connection: websocket_api.ActiveConnection,
                         msg: dict) -> None:
    """`home_desk/aspirateurs`: see the module docstring."""
    connection.send_result(msg["id"], await lister(hass))


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ASPIRER,
        vol.Required("entite"): str,
        vol.Required("zones"): vol.All([str], vol.Length(min=1)),
        vol.Required("passages"): vol.All(int, vol.Range(min=1)),
    }
)
@websocket_api.async_response
async def ws_aspirer(hass: HomeAssistant, connection: websocket_api.ActiveConnection,
                     msg: dict) -> None:
    """`home_desk/aspirer`: see the module docstring."""
    try:
        await lancer(hass, msg["entite"], msg["zones"], msg["passages"],
                     connection.context(msg))
    except Refus as err:
        connection.send_error(msg["id"], err.code, str(err))
        return
    except HomeAssistantError as err:
        connection.send_error(msg["id"], ERROR_CLEAN_REFUSED, str(err))
        return
    connection.send_result(msg["id"])
