"""Migration of the house subentry from version 1 to 2.

Version 2 adds `appareils` (the appliances behind the stack's cards). A
version-1 house has none, so it migrates to an empty list; everything else is
kept byte for byte. The rewrite happens at load time, before the transport
reads the house: `validate_house` refuses any other version."""
import copy

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.home_desk import migration
from custom_components.home_desk.const import DOMAIN, SUBENTRY_HOUSE

_SOURCE = {
    "nom": "Bedroom TV",
    "piece": "Bedroom",
    "titre": ["media_player.bedroom_tv"],
    "sousTitre": [],
    "affiche": [],
    "progression": [],
    "transport": ["media_player.bedroom_tv"],
    "volume": ["media_player.bedroom_tv"],
}
_HOUSE_V1 = {"version": 1, "sources": [_SOURCE]}


def _entry_with(hass, data) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Tablettes murales",
        subentries_data=[{"data": copy.deepcopy(data), "subentry_type": SUBENTRY_HOUSE,
                          "title": "Maison", "unique_id": None}],
    )
    entry.add_to_hass(hass)
    return entry


def _house(hass, entry_id: str) -> dict:
    entry = hass.config_entries.async_get_entry(entry_id)
    return next(dict(s.data) for s in entry.subentries.values() if s.subentry_type == SUBENTRY_HOUSE)


def test_migrate_house_data_lifts_only_version_1():
    assert migration.migrate_house_data(_HOUSE_V1) == {"version": 2, "sources": [_SOURCE], "appareils": []}
    assert migration.migrate_house_data({"version": 2, "sources": [], "appareils": []}) is None
    assert migration.migrate_house_data({"sources": []}) is None


async def test_v1_house_migrates_to_v2_with_no_appliances(hass):
    """Through `async_setup_entry`, the path production takes."""
    entry = _entry_with(hass, _HOUSE_V1)

    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    house = _house(hass, entry.entry_id)
    assert house == {"version": 2, "sources": [_SOURCE], "appareils": []}
    assert list(house) == ["version", "sources", "appareils"]


async def test_the_migrated_house_is_served(hass, hass_ws_client):
    entry = _entry_with(hass, _HOUSE_V1)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "home_desk/maison"})
    reponse = await client.receive_json()

    assert reponse["success"] is True, reponse
    assert reponse["result"] == {"sources": [_SOURCE], "appareils": []}


async def test_a_current_house_is_not_rewritten(hass):
    current = {"version": 2, "sources": [], "appareils": [
        {"type": "tapis", "piece": "Bureau", "entites": {"vitesse": "sensor.treadmill_speed"}}]}
    entry = _entry_with(hass, current)

    assert migration.migrate_subentries(hass, entry) == 0
    assert _house(hass, entry.entry_id) == current
