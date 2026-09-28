"""Migration of the stored screen configuration from version 1 to 2.

Version 2 removes the hardcoded DeLorean scenes (spec 2026-09-28, section
4): the root `delorean` flag and the `"delorean"` value of
`agencement.modulateurs` no longer exist in the contract. A subentry written
at version 1 must be rewritten at load time, before anything reads it --
`websocket._resoudre` refuses any version other than `VERSION_CONFIG`.

Two-subject fixture: `salon` carries both DeLorean traces, `cuisine` carries
neither. An implementation that rewrote only the screens that had something
to drop (and left `cuisine` at version 1), or that dropped too much, fails
on one of the two."""
import copy

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.home_desk import migration
from custom_components.home_desk.const import DOMAIN, SUBENTRY_SCREEN

_SALON_V1 = {
    "version": 1,
    "nom": "salon",
    "hauteurUtile": 980,
    "temperature": "sensor.temperature_salon",
    "ambiances": [{"libelle": "Soir", "icone": "sofa", "entite": "scene.soir"}],
    "commandes": [{"libelle": "Lampe", "icone": "bulb", "entite": "light.salon"}],
    "extrasMaison": [],
    "synthese": [],
    "sources": [],
    "ouvrants": ["binary_sensor.porte_entree"],
    "delorean": True,
    "agencement": {
        "zones": ["ambiances", "commandes", "blocCentral", "synthese"],
        "modes": ["alerte", "media", "defaut"],
        "modulateurs": ["chaleur", "delorean", "invites"],
        "note": "Entry screen.",
    },
    "note": "Living room tablet.",
}

_CUISINE_V1 = {
    "version": 1,
    "nom": "cuisine",
    "hauteurUtile": 585,
    "temperature": "sensor.temperature_cuisine",
    "ambiances": [],
    "commandes": [{"libelle": "Hotte", "icone": "ventilateur", "entite": "fan.hotte"}],
    "extrasMaison": [],
    "synthese": [],
    "sources": [],
    "ouvrants": [],
    "agencement": {
        "zones": ["commandes", "synthese"],
        "modes": ["defaut"],
        "modulateurs": ["invites"],
    },
}


def _entree(hass) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Tablettes murales",
        subentries_data=[
            {"data": copy.deepcopy(_SALON_V1), "subentry_type": SUBENTRY_SCREEN,
             "title": "salon", "unique_id": None},
            {"data": copy.deepcopy(_CUISINE_V1), "subentry_type": SUBENTRY_SCREEN,
             "title": "cuisine", "unique_id": None},
        ],
    )
    entry.add_to_hass(hass)
    return entry


def _par_nom(hass, entry_id: str) -> dict[str, dict]:
    entry = hass.config_entries.async_get_entry(entry_id)
    return {sous.data["nom"]: dict(sous.data) for sous in entry.subentries.values()}


def _salon_v2_attendu() -> dict:
    attendu = copy.deepcopy(_SALON_V1)
    del attendu["delorean"]
    attendu["agencement"]["modulateurs"] = ["chaleur", "invites"]
    attendu["version"] = 2
    return attendu


def _cuisine_v2_attendue() -> dict:
    return {**copy.deepcopy(_CUISINE_V1), "version": 2}


async def test_le_chargement_migre_les_deux_ecrans_en_version_2(hass):
    """Through `async_setup_entry`, the path production takes: the
    migration must run at load time, not only when called by hand."""
    entry = _entree(hass)

    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    ecrans = _par_nom(hass, entry.entry_id)
    assert ecrans["salon"] == _salon_v2_attendu()
    assert ecrans["cuisine"] == _cuisine_v2_attendue()


async def test_la_migration_ne_touche_a_rien_d_autre(hass):
    """Every key other than `version`, `delorean` and
    `agencement.modulateurs` is byte-identical, key order included (a
    re-export must not produce a diff for an unrelated key)."""
    entry = _entree(hass)
    migration.migrer_sous_entrees(hass, entry)

    ecrans = _par_nom(hass, entry.entry_id)
    assert list(ecrans["salon"]) == [k for k in _SALON_V1 if k != "delorean"]
    assert list(ecrans["cuisine"]) == list(_CUISINE_V1)
    for cle in _SALON_V1:
        if cle not in ("version", "delorean", "agencement"):
            assert ecrans["salon"][cle] == _SALON_V1[cle], cle
    for cle in ("zones", "modes", "note"):
        assert ecrans["salon"]["agencement"][cle] == _SALON_V1["agencement"][cle], cle


async def test_la_migration_compte_ses_reecritures_et_ne_refait_rien(hass):
    """Both subentries are version 1, so both are rewritten (`cuisine` too:
    its version moves). A second pass finds nothing left at version 1."""
    entry = _entree(hass)

    assert migration.migrer_sous_entrees(hass, entry) == 2
    avant = _par_nom(hass, entry.entry_id)
    assert migration.migrer_sous_entrees(hass, entry) == 0
    assert _par_nom(hass, entry.entry_id) == avant


async def test_un_second_chargement_ne_reecrit_rien(hass):
    """Reloading the entry after the migration leaves the stored data as it
    is, and a direct call afterwards finds nothing to do."""
    entry = _entree(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    apres_premier = _par_nom(hass, entry.entry_id)

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert _par_nom(hass, entry.entry_id) == apres_premier
    assert migration.migrer_sous_entrees(hass, entry) == 0


async def test_une_sous_entree_sans_version_n_est_pas_migree(hass):
    """Only version 1 is rewritten. A subentry with no `version` at all
    predates version tracking: stamping it `2` would hide what the
    transport reports for it (`version_inconnue`, "absente")."""
    sans_version = {k: v for k, v in _CUISINE_V1.items() if k != "version"}
    entry = MockConfigEntry(
        domain=DOMAIN,
        subentries_data=[
            {"data": copy.deepcopy(sans_version), "subentry_type": SUBENTRY_SCREEN,
             "title": "cuisine", "unique_id": None},
            {"data": copy.deepcopy(_SALON_V1), "subentry_type": SUBENTRY_SCREEN,
             "title": "salon", "unique_id": None},
        ],
    )
    entry.add_to_hass(hass)

    assert migration.migrer_sous_entrees(hass, entry) == 1
    ecrans = _par_nom(hass, entry.entry_id)
    assert ecrans["cuisine"] == sans_version
    assert ecrans["salon"] == _salon_v2_attendu()


async def test_l_ecran_migre_est_servi_par_le_transport(hass, hass_ws_client):
    """The point of migrating at load: the tablet asks for its screen and
    gets it, instead of `version_inconnue`."""
    entry = _entree(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "home_desk/ecran", "nom": "salon"})
    reponse = await client.receive_json()

    assert reponse["success"] is True, reponse
    assert reponse["result"]["version"] == 2
    assert "delorean" not in reponse["result"]
    assert reponse["result"]["agencement"]["modulateurs"] == ["chaleur", "invites"]
