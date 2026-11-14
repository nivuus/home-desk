"""Renaming a screen carries the house appliances of that room along.

An appliance's `piece` is matched to the screen's `nom` exactly (the tablet's
`appliancesFor`); after a rename that left it behind, its card would show on
no tablet and the next export would be refused by the importer. The rename
rewrites the matching `piece` in the same gesture, through the guarded write
path, and leaves every other appliance alone."""
from homeassistant import data_entry_flow
from homeassistant.config_entries import ConfigSubentry

from conftest import IDENTITE_MINIMALE, _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import DOMAIN

HOUSE = "maison"
OLD = IDENTITE_MINIMALE["nom"]
NEW = "Salon renomme"

PRINTER = {
    "type": "imprimante",
    "piece": OLD,
    "entites": {"etat": "sensor.printer_state", "progression": "sensor.printer_progress",
                "ams": ["sensor.tray_1"]},
}
# In ANOTHER screen's room: a rename must leave it alone.
AIR = {"type": "air", "piece": "Bureau", "seuil": 25,
       "entites": {"pm25": "sensor.air_pm25", "purificateur": "fan.air_purifier"}}


def _store_house(hass, entree, appareils):
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    hass.config_entries.async_add_subentry(entry, ConfigSubentry(
        data={"version": 2, "sources": [], "appareils": appareils},
        subentry_type=HOUSE, title="Maison", unique_id=None))


async def _rename(hass, entree, subentry_id, nom):
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    return await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "nom": nom})


async def test_renaming_a_screen_moves_its_appliances_to_the_new_name(hass, entree, ws_client):
    subentry_id = await _creer_ecran(hass, entree)
    await _creer_ecran(hass, entree, nom="Bureau")
    _store_house(hass, entree, [PRINTER, AIR])

    resultat = await _rename(hass, entree, subentry_id, NEW)
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU, resultat

    await ws_client.send_json_auto_id({"type": "home_desk/maison"})
    reponse = await ws_client.receive_json()
    assert reponse["success"] is True, reponse
    assert reponse["result"]["appareils"] == [{**PRINTER, "piece": NEW}, AIR]


async def test_after_a_rename_export_then_import_passes(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    await _creer_ecran(hass, entree, nom="Bureau")
    _store_house(hass, entree, [PRINTER, AIR])
    await _rename(hass, entree, subentry_id, NEW)

    await hass.services.async_call(DOMAIN, "exporter", blocking=True)
    try:
        await hass.services.async_call(DOMAIN, "importer", blocking=True)
    finally:
        import pathlib
        pathlib.Path(hass.config.path("home_desk_ecrans.yaml")).unlink(missing_ok=True)

    entry = hass.config_entries.async_get_entry(entree.entry_id)
    house = next(s for s in entry.subentries.values() if s.subentry_type == HOUSE)
    assert [a["piece"] for a in house.data["appareils"]] == [NEW, "Bureau"]


async def test_a_change_that_keeps_the_name_leaves_the_house_untouched(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    await _creer_ecran(hass, entree, nom="Bureau")
    _store_house(hass, entree, [PRINTER, AIR])
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    house = next(s for s in entry.subentries.values() if s.subentry_type == HOUSE)
    before = house.data

    resultat = await _rename(hass, entree, subentry_id, OLD)
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU, resultat
    assert house.data is before
