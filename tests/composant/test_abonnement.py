"""`home_desk/abonner` : l'abonnement d'une tablette aux changements de SON
ecran, tel qu'un utilisateur NON ADMINISTRATEUR le voit.

Mesure du 2026-09-28 en production : la tablette de la cuisine, connectee
avec l'utilisateur non administrateur « Tablet », recevait a chaque demarrage
« Refusing to allow Tablet to subscribe to event home_desk_config_changed ».
Home Assistant ne laisse un non-administrateur `subscribe_events` que sur une
liste fixe d'evenements ; l'edition en direct n'atteignait donc jamais le mur.
Les tests existants se connectaient en ADMINISTRATEUR (`hass_ws_client` sans
jeton), la seule identite pour laquelle le defaut n'existe pas : ceux-ci se
connectent avec le jeton en lecture seule du harnais, un utilisateur non
administrateur comme celui des tablettes.

Les valeurs de fil sont ecrites EN DUR, comme dans test_websocket.py : un
renommage cote Python doit faire tomber ce fichier."""
import pytest
from conftest import _creer_ecran, _init_reconfigure
from homeassistant.setup import async_setup_component

from custom_components.home_desk.const import DOMAIN


@pytest.fixture
async def tablette(hass, hass_ws_client, hass_read_only_access_token):
    """Un client websocket authentifie comme un utilisateur NON administrateur."""
    assert await async_setup_component(hass, DOMAIN, {})
    return await hass_ws_client(hass, hass_read_only_access_token)


async def _ajouter_une_tuile(hass, entree, subentry_id: str) -> None:
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nouveau": True})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"libelle": "Lampe test", "icone": "bulb", "entite": "light.test"})
    await hass.async_block_till_done()


async def test_le_bus_est_ferme_a_une_tablette(hass, tablette, entree):
    """La cause, epinglee : si Home Assistant ouvrait un jour cet evenement
    aux non-administrateurs, ce test tomberait et dirait que la commande
    dediee n'est plus necessaire."""
    await tablette.send_json_auto_id(
        {"type": "subscribe_events", "event_type": "home_desk_config_changed"})
    reponse = await tablette.receive_json()

    assert reponse["success"] is False
    assert reponse["error"]["code"] == "unauthorized"


async def test_une_tablette_entend_son_ecran_et_lui_seul(hass, tablette, entree):
    """Decor a DEUX ecrans : modifier la cuisine ne dit rien au salon, et
    modifier le salon le lui dit -- le filtre par nom est cote serveur."""
    salon = await _creer_ecran(hass, entree, nom="salon")
    await _creer_ecran(hass, entree, nom="cuisine")
    cuisine = next(i for i, s in hass.config_entries.async_get_entry(
        entree.entry_id).subentries.items() if s.data["nom"] == "cuisine")

    await tablette.send_json_auto_id({"type": "home_desk/abonner", "nom": "salon"})
    abonnement = await tablette.receive_json()
    assert abonnement["success"] is True

    await _ajouter_une_tuile(hass, entree, cuisine)
    await _ajouter_une_tuile(hass, entree, salon)

    message = await tablette.receive_json()
    assert message == {"id": abonnement["id"], "type": "event", "event": {"nom": "salon"}}


async def test_se_desabonner_fait_taire_la_tablette(hass, tablette, entree):
    """L'abonnement vit dans `connection.subscriptions` : le
    `unsubscribe_events` generique de Home Assistant le retire."""
    salon = await _creer_ecran(hass, entree, nom="salon")
    await tablette.send_json_auto_id({"type": "home_desk/abonner", "nom": "salon"})
    abonnement = await tablette.receive_json()

    await tablette.send_json_auto_id(
        {"type": "unsubscribe_events", "subscription": abonnement["id"]})
    assert (await tablette.receive_json())["success"] is True

    await _ajouter_une_tuile(hass, entree, salon)
    await tablette.send_json_auto_id({"type": "home_desk/ecrans"})
    suivant = await tablette.receive_json()
    assert suivant["type"] == "result", "aucun evenement ne doit preceder la reponse"
