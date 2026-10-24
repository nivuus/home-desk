"""The house subentry: one shared list of media sources, served to every
tablet through `home_desk/maison` and edited from Home Assistant.

Wire values (`home_desk/maison`, `ecran_corrompu`, `home_desk_config_changed`)
are written literally, like test_websocket.py: renaming the Python constant
must break this file, not follow it silently."""
import pytest
import voluptuous as vol
from homeassistant import config_entries, data_entry_flow
from homeassistant.config_entries import ConfigSubentry
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import async_capture_events

from conftest import _creer_ecran
from custom_components.home_desk import garde_ecran
from custom_components.home_desk.const import DOMAIN, ERROR_FIELD_EMPTY

HOUSE = "maison"

SOURCE_BEDROOM = {
    "nom": "Chambre TV",
    "piece": "Chambre",
    "titre": ["media_player.chambre"],
    "sousTitre": [],
    "affiche": ["media_player.chambre"],
    "progression": [],
    "transport": ["media_player.chambre"],
    "volume": ["media_player.chambre"],
}


@pytest.fixture
async def tablet(hass, hass_ws_client, hass_read_only_access_token):
    """A websocket client authenticated as a NON-admin user, like the tablets."""
    assert await async_setup_component(hass, DOMAIN, {})
    return await hass_ws_client(hass, hass_read_only_access_token)


async def _create_house(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, HOUSE), context={"source": config_entries.SOURCE_USER})
    return flow


def _house(hass, entree):
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    return entry, next(s for s in entry.subentries.values() if s.subentry_type == HOUSE)


def _store_house(hass, entree, data):
    """Seeds a house subentry with arbitrary DATA, bypassing the flow (a
    restored backup), so the read path can be tested on its own."""
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    hass.config_entries.async_add_subentry(
        entry, ConfigSubentry(data=data, subentry_type=HOUSE, title="Maison", unique_id=None))


async def _add_source_through_flow(hass, entree, fields):
    entry, house = _house(hass, entree)
    flow = await hass.config_entries.subentries.async_init(
        (entry.entry_id, HOUSE),
        context={"source": config_entries.SOURCE_RECONFIGURE, "subentry_id": house.subentry_id})
    assert flow["step_id"] == "sources"
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    return await hass.config_entries.subentries.async_configure(flow["flow_id"], fields)


async def test_ws_maison_returns_empty_list_without_house_subentry(hass, ws_client, entree):
    await ws_client.send_json_auto_id({"type": "home_desk/maison"})
    reponse = await ws_client.receive_json()
    assert reponse["success"] is True
    assert reponse["result"] == {"sources": []}


async def test_ws_maison_returns_the_stored_sources(hass, ws_client, entree):
    _store_house(hass, entree, {"version": 1, "sources": [SOURCE_BEDROOM]})
    await ws_client.send_json_auto_id({"type": "home_desk/maison"})
    reponse = await ws_client.receive_json()
    assert reponse["success"] is True
    assert reponse["result"] == {"sources": [SOURCE_BEDROOM]}


async def test_ws_maison_refuses_corrupt_stored_data(hass, ws_client, entree):
    _store_house(hass, entree, {"version": 1, "sources": [{**SOURCE_BEDROOM, "piece": ""}]})
    await ws_client.send_json_auto_id({"type": "home_desk/maison"})
    reponse = await ws_client.receive_json()
    assert reponse["success"] is False
    assert reponse["error"]["code"] == "ecran_corrompu"


async def test_ws_maison_open_to_non_admin_user(hass, tablet, entree):
    _store_house(hass, entree, {"version": 1, "sources": [SOURCE_BEDROOM]})
    await tablet.send_json_auto_id({"type": "home_desk/maison"})
    reponse = await tablet.receive_json()
    assert reponse["success"] is True
    assert reponse["result"]["sources"][0]["piece"] == "Chambre"


async def test_creating_the_house_stores_an_empty_valid_list(hass, entree):
    resultat = await _create_house(hass, entree)
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    _entry, house = _house(hass, entree)
    assert dict(house.data) == {"version": 1, "sources": []}


async def test_second_house_subentry_is_refused(hass, entree):
    await _create_house(hass, entree)
    resultat = await _create_house(hass, entree)
    assert resultat["type"] is data_entry_flow.FlowResultType.ABORT
    assert resultat["reason"] == "already_configured"
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert [s.subentry_type for s in entry.subentries.values()].count(HOUSE) == 1


async def test_adding_a_house_source_through_the_flow_persists_it(hass, entree):
    await _create_house(hass, entree)
    resultat = await _add_source_through_flow(hass, entree, SOURCE_BEDROOM)
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["step_id"] == "sources"
    _entry, house = _house(hass, entree)
    assert house.data["sources"] == [SOURCE_BEDROOM]


async def test_invalid_house_data_is_not_persisted(hass, entree):
    await _create_house(hass, entree)
    resultat = await _add_source_through_flow(hass, entree, {**SOURCE_BEDROOM, "piece": "  "})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"] == {"piece": ERROR_FIELD_EMPTY}
    entry, house = _house(hass, entree)
    assert house.data["sources"] == []

    with pytest.raises(vol.Invalid):
        garde_ecran.persist_house_if_valid(
            hass, entry, house, {"version": 1, "sources": [{**SOURCE_BEDROOM, "piece": ""}]})
    _entry, house = _house(hass, entree)
    assert house.data["sources"] == []


async def test_house_change_fires_change_event_for_every_screen(hass, entree):
    assert await async_setup_component(hass, DOMAIN, {})
    await _creer_ecran(hass, entree, nom="salon")
    await _creer_ecran(hass, entree, nom="cuisine")
    await _create_house(hass, entree)
    await hass.async_block_till_done()
    evenements = async_capture_events(hass, "home_desk_config_changed")

    await _add_source_through_flow(hass, entree, SOURCE_BEDROOM)
    await hass.async_block_till_done()

    assert sorted(e.data["nom"] for e in evenements) == ["cuisine", "salon"]


async def test_removing_the_house_fires_change_event_for_every_screen(hass, entree):
    assert await async_setup_component(hass, DOMAIN, {})
    await _creer_ecran(hass, entree, nom="salon")
    await _create_house(hass, entree)
    await hass.async_block_till_done()
    evenements = async_capture_events(hass, "home_desk_config_changed")

    entry, house = _house(hass, entree)
    hass.config_entries.async_remove_subentry(entry, house.subentry_id)
    await hass.async_block_till_done()

    assert [e.data for e in evenements] == [{"nom": "salon"}]


async def test_screen_listing_ignores_the_house_subentry(hass, ws_client, entree):
    await _creer_ecran(hass, entree, nom="salon")
    await _create_house(hass, entree)
    await ws_client.send_json_auto_id({"type": "home_desk/ecrans"})
    reponse = await ws_client.receive_json()
    assert reponse["result"] == [{"nom": "salon", "titre": "salon"}]


async def test_screen_source_offers_the_optional_room(hass, entree):
    from conftest import _init_reconfigure
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "sources"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Salon TV", "piece": "Salon"})
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert entry.subentries[subentry_id].data["sources"][0]["piece"] == "Salon"


def _export_path(hass):
    import pathlib
    return pathlib.Path(hass.config.path("home_desk_ecrans.yaml"))


async def test_export_import_round_trip_keeps_house_sources(hass, entree):
    """The file carries the house list after `ecrans:`; a `note` on a house
    source travels as a comment, like a screen note, and survives import."""
    from custom_components.home_desk import yaml_ecrans

    chemin = _export_path(hass)
    chemin.unlink(missing_ok=True)
    try:
        await _creer_ecran(hass, entree, nom="salon")
        await _create_house(hass, entree)
        await _add_source_through_flow(hass, entree, SOURCE_BEDROOM)
        _entry, house = _house(hass, entree)
        noted = {**SOURCE_BEDROOM, "note": "Only the bedroom TV"}
        garde_ecran.persist_house_if_valid(
            hass, _entry, house, {"version": 1, "sources": [noted]})

        await hass.services.async_call(DOMAIN, "exporter", blocking=True)
        texte = chemin.read_text(encoding="utf-8")
        assert texte.index("ecrans:") < texte.index("maison:")
        assert "# Only the bedroom TV" in texte
        assert "note:" not in texte
        ecrans, maison = yaml_ecrans.lire(texte)
        assert [e["nom"] for e in ecrans] == ["salon"]
        assert maison == {"sources": [noted]}

        await hass.services.async_call(DOMAIN, "importer", blocking=True)
        entry, house = _house(hass, entree)
        assert house.data == {"version": 1, "sources": [noted]}
        assert [s.title for s in entry.subentries.values() if s.subentry_type == "ecran"] == ["salon"]
    finally:
        chemin.unlink(missing_ok=True)


async def test_import_without_maison_removes_house_subentry(hass, entree):
    """The file is the whole truth: no `maison:` key, no house afterwards."""
    chemin = _export_path(hass)
    chemin.unlink(missing_ok=True)
    try:
        await _creer_ecran(hass, entree, nom="salon")
        await hass.services.async_call(DOMAIN, "exporter", blocking=True)
        assert "maison:" not in chemin.read_text(encoding="utf-8")
        await _create_house(hass, entree)
        await _add_source_through_flow(hass, entree, SOURCE_BEDROOM)

        await hass.services.async_call(DOMAIN, "importer", blocking=True)
        entry = hass.config_entries.async_get_entry(entree.entry_id)
        assert [s for s in entry.subentries.values() if s.subentry_type == HOUSE] == []
        assert len(entry.subentries) == 1
    finally:
        chemin.unlink(missing_ok=True)


async def test_import_with_invalid_house_writes_nothing(hass, entree):
    """An invalid house refuses the whole import: screens and house stay as
    they were."""
    from homeassistant.exceptions import HomeAssistantError

    chemin = _export_path(hass)
    chemin.unlink(missing_ok=True)
    try:
        await _creer_ecran(hass, entree, nom="salon")
        await _create_house(hass, entree)
        await _add_source_through_flow(hass, entree, SOURCE_BEDROOM)
        await hass.services.async_call(DOMAIN, "exporter", blocking=True)
        texte = chemin.read_text(encoding="utf-8")
        chemin.write_text(texte.replace("piece: Chambre", "piece: ''"), encoding="utf-8")
        entry = hass.config_entries.async_get_entry(entree.entry_id)
        avant = {k: (s.title, dict(s.data)) for k, s in entry.subentries.items()}

        with pytest.raises(HomeAssistantError):
            await hass.services.async_call(DOMAIN, "importer", blocking=True)
        apres = {k: (s.title, dict(s.data)) for k, s in entry.subentries.items()}
        assert apres == avant
    finally:
        chemin.unlink(missing_ok=True)
