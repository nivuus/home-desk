"""Valetudo's native segment cleaning: the one thing Home Assistant cannot say.

`vacuum.clean_area` (Home Assistant core) takes areas and nothing else -- no
number of passes, checked in `components/vacuum/services.yaml` of 2026.10.
Valetudo's `MapSegmentationCapability` does take `iterations`, bounded per
robot by its `iterationCount` property. This module is the only place that
knows Valetudo exists; `aspirateurs.py` calls it only for more than one pass.

Every fact is read, never assumed:

- the command topic is the `clean_segments_command_topic` Valetudo itself
  announced in its MQTT discovery payload (read back through the MQTT
  integration's debug info), never rebuilt from a topic prefix;
- the bounds come from the robot's REST API. Its `configuration_url`
  (`http://valetudo-<name>.local`) does not resolve inside the Home
  Assistant container (no mDNS, measured 2026-10-16), so the address is the
  one the robot publishes, retained, under
  `WifiConfigurationCapability/ips`.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
import ipaddress
import json
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession

FABRICANT = "Valetudo"
_CAPACITE = "/MapSegmentationCapability/"
_PROPRIETES = "/api/v2/robot/capabilities/MapSegmentationCapability/properties"
# How long the robot may take to answer: a retained message arrives at once,
# the REST call over Wi-Fi in well under a second.
DELAI_S = 5


class RobotInjoignable(Exception):
    """The robot's capability could not be read; the message says why."""


@dataclass(frozen=True)
class Robot:
    """A Valetudo robot, as far as segment cleaning is concerned."""

    topic_nettoyage: str

    @property
    def base(self) -> str:
        """`valetudo/<identifier>`: everything before the capability."""
        return self.topic_nettoyage.split(_CAPACITE, 1)[0]


@dataclass(frozen=True)
class Capacite:
    """`MapSegmentationCapability` properties, as the robot reports them."""

    passages_min: int
    passages_max: int
    ordre: bool


@callback
def robot(hass: HomeAssistant, entity_id: str) -> Robot | None:
    """The Valetudo robot behind `entity_id`, or `None` if it is not one."""
    if "mqtt" not in hass.config.components:
        return None
    entree = er.async_get(hass).async_get(entity_id)
    if entree is None or entree.platform != "mqtt" or entree.device_id is None:
        return None
    appareil = dr.async_get(hass).async_get(entree.device_id)
    if appareil is None or appareil.manufacturer != FABRICANT:
        return None
    from homeassistant.components.mqtt import debug_info

    for info in debug_info.info_for_device(hass, entree.device_id)["entities"]:
        if info["entity_id"] != entity_id:
            continue
        charge = info["discovery_data"]["payload"]
        topic = charge.get("clean_segments_command_topic") if isinstance(charge, dict) else None
        if isinstance(topic, str) and _CAPACITE in topic:
            return Robot(topic)
    return None


async def _message_retenu(hass: HomeAssistant, topic: str) -> str:
    from homeassistant.components import mqtt

    recu: asyncio.Future[str] = hass.loop.create_future()

    @callback
    def _recevoir(message: Any) -> None:
        if not recu.done():
            recu.set_result(str(message.payload))

    desabonner = await mqtt.async_subscribe(hass, topic, _recevoir)
    try:
        async with asyncio.timeout(DELAI_S):
            return await recu
    except TimeoutError as err:
        raise RobotInjoignable(f"nothing retained on {topic}") from err
    finally:
        desabonner()


def _ipv4(adresses: str) -> str:
    for adresse in adresses.split(","):
        try:
            ip = ipaddress.ip_address(adresse.strip())
        except ValueError:
            continue
        if ip.version == 4:
            return str(ip)
    raise RobotInjoignable(f"no IPv4 address in {adresses!r}")


async def capacite(hass: HomeAssistant, cible: Robot) -> Capacite:
    """Reads the pass bounds and custom-order support from the robot."""
    ip = _ipv4(await _message_retenu(hass, f"{cible.base}/WifiConfigurationCapability/ips"))
    session = async_get_clientsession(hass)
    try:
        async with asyncio.timeout(DELAI_S), session.get(f"http://{ip}{_PROPRIETES}") as reponse:
            reponse.raise_for_status()
            proprietes = await reponse.json()
    except (TimeoutError, aiohttp.ClientError, ValueError) as err:
        raise RobotInjoignable(f"{ip}: {err}") from err
    try:
        bornes = proprietes["iterationCount"]
        return Capacite(int(bornes["min"]), int(bornes["max"]),
                        proprietes.get("customOrderSupport") is True)
    except (KeyError, TypeError, ValueError) as err:
        raise RobotInjoignable(f"{ip}: unexpected properties {proprietes!r}") from err


async def nettoyer(hass: HomeAssistant, cible: Robot, segments: list[str],
                   passages: int, ordre: bool) -> None:
    """Publishes the segment clean, in the payload Valetudo documents."""
    from homeassistant.components import mqtt

    charge: dict[str, Any] = {"segment_ids": segments, "iterations": passages}
    if ordre:
        charge["customOrder"] = True
    await mqtt.async_publish(hass, cible.topic_nettoyage, json.dumps(charge))
