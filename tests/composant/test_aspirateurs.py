"""Vacuum rooms for the tablets (`aspirateurs.py`, `valetudo.py`).

The rooms a tablet offers are Home Assistant areas, read from the
"Map vacuum segments to areas" setting of each vacuum -- never a list
written here. One pass goes through core's `vacuum.clean_area`; several
passes reach Valetudo's own payload, the only one that carries
`iterations`. The Valetudo tests drive the REAL MQTT discovery, so the
command topic they check is the one the robot announced."""
import asyncio
import json

import pytest
from pytest_homeassistant_custom_component.common import (
    async_fire_mqtt_message,
    async_mock_service,
)

from homeassistant.helpers import area_registry as ar, entity_registry as er

BASE = "valetudo/Bot"
TOPIC_NETTOYAGE = f"{BASE}/MapSegmentationCapability/clean/set"
DECOUVERTE = {
    "name": "Robot",
    "default_entity_id": "vacuum.robot_rdc",
    "supported_features": ["status", "start", "stop", "return_home"],
    "state_topic": f"{BASE}/hass/Bot_vacuum/state",
    "command_topic": f"{BASE}/hass/Bot_vacuum/command",
    "clean_segments_command_topic": TOPIC_NETTOYAGE,
    "clean_segments_command_template": '{"segment_ids": {{value | to_json}}, "customOrder": true}',
    "unique_id": "Bot_vacuum",
    "device": {"manufacturer": "Valetudo", "model": "Roborock S5", "name": "Bot",
               "identifiers": ["Bot"]},
}
PROPRIETES = "/api/v2/robot/capabilities/MapSegmentationCapability/properties"


def _zones(hass, *noms):
    registre = ar.async_get(hass)
    return [registre.async_create(nom).id for nom in noms]


def _cartographier(hass, entity_id, carte):
    er.async_get(hass).async_update_entity_options(
        entity_id, "vacuum", {"area_mapping": carte, "last_seen_segments": []})


def _aspirateur_local(hass, object_id, nom):
    entree = er.async_get(hass).async_get_or_create(
        "vacuum", "demo", object_id, suggested_object_id=object_id)
    hass.states.async_set(entree.entity_id, "docked", {"friendly_name": nom})
    return entree.entity_id


async def _demander(ws_client, **charge):
    await ws_client.send_json_auto_id(charge)
    return await ws_client.receive_json()


async def test_les_pieces_sont_les_zones_cartographiees_dans_leur_ordre(hass, ws_client, entree):
    cuisine, salon, garage = _zones(hass, "Cuisine", "Salon", "Garage")
    rdc = _aspirateur_local(hass, "rdc", "Aspirateur RDC")
    _cartographier(hass, rdc, {salon: ["17"], cuisine: ["19"]})
    _aspirateur_local(hass, "sans_carte", "Sans carte")

    reponse = await _demander(ws_client, type="home_desk/aspirateurs")

    assert reponse["success"], reponse
    assert reponse["result"] == [{
        "entite": rdc, "nom": "Aspirateur RDC",
        "pieces": [{"zone": salon, "nom": "Salon"}, {"zone": cuisine, "nom": "Cuisine"}],
        "passages": {"min": 1, "max": 1},
    }]
    assert garage not in json.dumps(reponse["result"])


async def test_un_passage_est_le_clean_area_standard_au_nom_de_la_tablette(
        hass, ws_client, entree, hass_admin_user):
    (cuisine,) = _zones(hass, "Cuisine")
    rdc = _aspirateur_local(hass, "rdc", "Aspirateur RDC")
    _cartographier(hass, rdc, {cuisine: ["19"]})
    appels = async_mock_service(hass, "vacuum", "clean_area")

    reponse = await _demander(ws_client, type="home_desk/aspirer", entite=rdc,
                              zones=[cuisine], passages=1)

    assert reponse["success"], reponse
    assert [c.data for c in appels] == [{"entity_id": rdc, "cleaning_area_id": [cuisine]}]
    assert appels[0].context.user_id == hass_admin_user.id


async def test_une_piece_non_cartographiee_est_refusee_avant_le_robot(hass, ws_client, entree):
    cuisine, chambre = _zones(hass, "Cuisine", "Chambre")
    rdc = _aspirateur_local(hass, "rdc", "Aspirateur RDC")
    _cartographier(hass, rdc, {cuisine: ["19"]})
    appels = async_mock_service(hass, "vacuum", "clean_area")

    reponse = await _demander(ws_client, type="home_desk/aspirer", entite=rdc,
                              zones=[chambre], passages=1)

    assert reponse["error"]["code"] == "pieces_non_cartographiees"
    assert appels == []


async def test_plusieurs_passages_sans_valetudo_sont_refuses(hass, ws_client, entree):
    (cuisine,) = _zones(hass, "Cuisine")
    rdc = _aspirateur_local(hass, "rdc", "Aspirateur RDC")
    _cartographier(hass, rdc, {cuisine: ["19"]})

    reponse = await _demander(ws_client, type="home_desk/aspirer", entite=rdc,
                              zones=[cuisine], passages=2)

    assert reponse["error"]["code"] == "passages_hors_bornes"


@pytest.fixture
async def robot_valetudo(hass, mqtt_mock_entry, entree, tmp_path):
    # The MQTT entry re-reads `configuration.yaml` on setup; the packaged
    # test harness ships no config directory, so it gets an empty one.
    (tmp_path / "configuration.yaml").write_text("")
    hass.config.config_dir = str(tmp_path)
    mqtt = await mqtt_mock_entry()
    async_fire_mqtt_message(hass, "homeassistant/vacuum/Bot/Bot_vacuum/config",
                            json.dumps(DECOUVERTE))
    await hass.async_block_till_done()
    assert hass.states.get("vacuum.robot_rdc") is not None
    return mqtt


# The mocked paho client never fires `on_socket_close`, so the MQTT client's
# one-second misc timer outlives every test that sets MQTT up. The harness
# already waives it for Home Assistant's own MQTT tests (every non-platform
# `tests/components/` test); these four inherit the same waiver, nothing more.
_TIMER_MQTT_SIMULE = pytest.mark.parametrize("expected_lingering_timers", [True])


async def _avec_ips(hass, tache, ips="192.168.0.170,fe80::1"):
    """The robot's addresses are a RETAINED message: delivered as soon as the
    module subscribes, which the mock broker does not replay by itself."""
    for _ in range(20):
        await asyncio.sleep(0)
    async_fire_mqtt_message(hass, f"{BASE}/WifiConfigurationCapability/ips", ips, retain=True)
    return await tache


@_TIMER_MQTT_SIMULE
async def test_les_bornes_de_passages_viennent_du_robot(
        hass, robot_valetudo, ws_client, aioclient_mock):
    cuisine, salon = _zones(hass, "Cuisine", "Salon")
    _cartographier(hass, "vacuum.robot_rdc", {cuisine: ["19"], salon: ["17"]})
    aioclient_mock.get(f"http://192.168.0.170{PROPRIETES}",
                       json={"iterationCount": {"min": 1, "max": 3}, "customOrderSupport": True})

    await ws_client.send_json_auto_id({"type": "home_desk/aspirateurs"})
    reponse = await _avec_ips(hass, ws_client.receive_json())

    assert reponse["result"][0]["passages"] == {"min": 1, "max": 3}


@_TIMER_MQTT_SIMULE
async def test_deux_passages_publient_le_message_valetudo_avec_iterations(
        hass, robot_valetudo, ws_client, aioclient_mock):
    cuisine, salon = _zones(hass, "Cuisine", "Salon")
    _cartographier(hass, "vacuum.robot_rdc", {cuisine: ["19"], salon: ["17", "18"]})
    aioclient_mock.get(f"http://192.168.0.170{PROPRIETES}",
                       json={"iterationCount": {"min": 1, "max": 3}, "customOrderSupport": True})
    robot_valetudo.async_publish.reset_mock()

    await ws_client.send_json_auto_id({"type": "home_desk/aspirer", "entite": "vacuum.robot_rdc",
                                       "zones": [salon, cuisine], "passages": 2})
    reponse = await _avec_ips(hass, ws_client.receive_json())

    assert reponse["success"], reponse
    robot_valetudo.async_publish.assert_called_once()
    assert robot_valetudo.async_publish.call_args.args[:2] == (
        TOPIC_NETTOYAGE,
        json.dumps({"segment_ids": ["17", "18", "19"], "iterations": 2, "customOrder": True}))


@_TIMER_MQTT_SIMULE
async def test_au_dela_de_la_borne_du_robot_rien_ne_part(
        hass, robot_valetudo, ws_client, aioclient_mock):
    (cuisine,) = _zones(hass, "Cuisine")
    _cartographier(hass, "vacuum.robot_rdc", {cuisine: ["19"]})
    aioclient_mock.get(f"http://192.168.0.170{PROPRIETES}",
                       json={"iterationCount": {"min": 1, "max": 3}, "customOrderSupport": True})
    robot_valetudo.async_publish.reset_mock()

    await ws_client.send_json_auto_id({"type": "home_desk/aspirer", "entite": "vacuum.robot_rdc",
                                       "zones": [cuisine], "passages": 4})
    reponse = await _avec_ips(hass, ws_client.receive_json())

    assert reponse["error"]["code"] == "passages_hors_bornes"
    robot_valetudo.async_publish.assert_not_called()


@_TIMER_MQTT_SIMULE
async def test_un_robot_injoignable_dit_pourquoi_un_seul_passage(
        hass, robot_valetudo, ws_client, aioclient_mock):
    (cuisine,) = _zones(hass, "Cuisine")
    _cartographier(hass, "vacuum.robot_rdc", {cuisine: ["19"]})
    aioclient_mock.get(f"http://192.168.0.170{PROPRIETES}", exc=asyncio.TimeoutError())

    await ws_client.send_json_auto_id({"type": "home_desk/aspirateurs"})
    reponse = await _avec_ips(hass, ws_client.receive_json())

    passages = reponse["result"][0]["passages"]
    assert (passages["min"], passages["max"]) == (1, 1)
    assert "192.168.0.170" in passages["raison"]
