"""`home_desk.jouer_animation` and the `home_desk/animations` subscription.

The service resolves a media-source id, checks everything it can check
(screens known, file present, type playable, duration bounded), and only then
pushes one payload to the subscribers of each named screen. A refused call
sends NOTHING -- each refusal test proves it with a probe command: the next
message a subscriber receives is the probe's result, not an event.

The subscribers are NON-ADMIN clients (`hass_read_only_access_token`), the
identity the wall tablets log in with. Wire values are written literally, as
in test_websocket.py: a rename on the Python side must break this file."""
import json
import pathlib

import pytest
from conftest import _creer_ecran
from homeassistant.core import Context
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import selector
from homeassistant.setup import async_setup_component
import voluptuous as vol
import yaml

from custom_components.home_desk.animations import SCHEMA, type_lecteur
from custom_components.home_desk.const import DOMAIN, DUREE_MAX_S

LOCAL = "media-source://media_source/local/animations"


@pytest.fixture
async def medias(hass, tmp_path):
    """A `local` media directory holding one file per case. Must be set
    BEFORE media_source is set up: its local source reads
    `hass.config.media_dirs` once, at setup."""
    dossier = tmp_path / "animations"
    dossier.mkdir()
    for nom in ("a.webm", "a.gif", "a.lottie", "a.json", "a.txt"):
        (dossier / nom).write_bytes(b"\0")
    hass.config.media_dirs = {"local": str(tmp_path)}
    assert await async_setup_component(hass, "media_source", {})
    return dossier


@pytest.fixture
async def client_non_admin(hass, hass_ws_client, hass_read_only_access_token, medias):
    """A factory of websocket clients authenticated as a NON-admin user."""
    assert await async_setup_component(hass, DOMAIN, {})

    async def _ouvrir():
        return await hass_ws_client(hass, hass_read_only_access_token)

    return _ouvrir


@pytest.fixture
async def tablette(client_non_admin):
    return await client_non_admin()


@pytest.fixture
async def ecrans(hass, medias, entree):
    await _creer_ecran(hass, entree, nom="salon")
    await _creer_ecran(hass, entree, nom="cuisine")


async def _abonner(client, nom: str) -> int:
    await client.send_json_auto_id({"type": "home_desk/animations", "nom": nom})
    reponse = await client.receive_json()
    assert reponse["success"] is True, reponse
    return reponse["id"]


async def _rien_recu(client) -> None:
    """The next message is the result of a probe command: nothing was sent
    to this subscriber before it."""
    await client.send_json_auto_id({"type": "home_desk/ecrans"})
    message = await client.receive_json()
    assert message["type"] == "result", message


async def _jouer(hass, context=None, **donnees):
    await hass.services.async_call(
        DOMAIN, "jouer_animation", donnees, blocking=True, context=context)


def _media(fichier: str, type_contenu: str = "video/webm") -> dict:
    return {"media_content_id": f"{LOCAL}/{fichier}", "media_content_type": type_contenu}


async def test_salon_recoit_la_video_et_la_cuisine_rien(hass, client_non_admin, ecrans):
    tablette = await client_non_admin()
    cuisine_client = await client_non_admin()
    salon = await _abonner(tablette, "salon")
    await _abonner(cuisine_client, "cuisine")

    await _jouer(hass, ecrans=["salon"], media=_media("a.webm"))

    msg = await tablette.receive_json()
    assert msg["id"] == salon and msg["type"] == "event"
    assert msg["event"]["type"] == "video"
    assert msg["event"]["duree"] is None and msg["event"]["fond"] == "noir"
    assert msg["event"]["url"].startswith("/media/local/animations/a.webm?authSig=")
    assert set(msg["event"]) == {"url", "type", "duree", "fond"}
    await _rien_recu(cuisine_client)


async def test_deux_ecrans_recoivent_la_meme_animation(hass, client_non_admin, ecrans):
    tablette = await client_non_admin()
    cuisine_client = await client_non_admin()
    await _abonner(tablette, "salon")
    await _abonner(cuisine_client, "cuisine")

    await _jouer(hass, ecrans=["salon", "cuisine"], media=_media("a.webm"))

    assert (await tablette.receive_json())["event"]["type"] == "video"
    assert (await cuisine_client.receive_json())["event"]["type"] == "video"


@pytest.mark.parametrize(
    ("donnees", "erreur"),
    [
        pytest.param({"ecrans": ["salon", "grenier"], "media": _media("a.webm")},
                     ServiceValidationError, id="ecran-inconnu"),
        pytest.param({"ecrans": ["Salon"], "media": _media("a.webm")},
                     ServiceValidationError, id="nom-a-la-casse-pres"),
        pytest.param({"ecrans": ["salon"], "media": _media("absent.webm")},
                     ServiceValidationError, id="fichier-absent"),
        pytest.param({"ecrans": ["salon"],
                      "media": {"media_content_id": "media-source://media_source/nulle_part/a.webm"}},
                     ServiceValidationError, id="source-inconnue"),
        pytest.param({"ecrans": ["salon"], "media": _media("a.txt", "text/plain")},
                     ServiceValidationError, id="type-non-lisible"),
        pytest.param({"ecrans": ["salon"], "media": _media("a.gif", "image/gif")},
                     ServiceValidationError, id="image-sans-duree"),
        pytest.param({"ecrans": ["salon"], "media": _media("a.webm"), "duree": 0},
                     ServiceValidationError, id="duree-nulle"),
        pytest.param({"ecrans": ["salon"], "media": _media("a.webm"), "duree": 121},
                     ServiceValidationError, id="duree-trop-longue"),
        # Positive in seconds, 0 once rounded to the milliseconds sent: the
        # tablet would drop it as malformed while the call succeeded.
        pytest.param({"ecrans": ["salon"], "media": _media("a.webm"), "duree": 0.0004},
                     ServiceValidationError, id="duree-arrondie-a-zero-ms"),
        pytest.param({"ecrans": ["salon"], "media": _media("a.webm"), "duree": "nan"},
                     ServiceValidationError, id="duree-nan"),
        pytest.param({"ecrans": ["salon"], "media": _media("a.webm"), "fond": "rouge"},
                     vol.Invalid, id="fond-inconnu"),
    ],
)
async def test_un_appel_refuse_n_envoie_rien(hass, tablette, ecrans, donnees, erreur):
    await _abonner(tablette, "salon")

    with pytest.raises(erreur):
        await _jouer(hass, **donnees)

    await _rien_recu(tablette)


async def test_le_nom_d_ecran_est_exact_a_la_casse_pres(hass, client_non_admin, ecrans):
    """A subscriber to "Salon" is not the "salon" screen: names match
    exactly, on both the service side and the subscription side."""
    tablette = await client_non_admin()
    majuscule = await client_non_admin()
    await _abonner(tablette, "salon")
    await _abonner(majuscule, "Salon")

    await _jouer(hass, ecrans=["salon"], media=_media("a.webm"))

    assert (await tablette.receive_json())["event"]["type"] == "video"
    await _rien_recu(majuscule)


async def test_un_ecran_nomme_deux_fois_ne_joue_qu_une_fois(hass, tablette, ecrans):
    await _abonner(tablette, "salon")

    await _jouer(hass, ecrans=["salon", "salon"], media=_media("a.webm"))

    assert (await tablette.receive_json())["type"] == "event"
    await _rien_recu(tablette)


async def test_le_media_introuvable_est_dit_en_francais_seulement(hass, tablette, ecrans):
    """HA's own (English) reason stays in the exception chain for the logs,
    never in the message shown to the user."""
    media_id = "media-source://media_source/nulle_part/a.webm"
    with pytest.raises(ServiceValidationError) as refus:
        await _jouer(hass, ecrans=["salon"], media={"media_content_id": media_id})
    assert str(refus.value) == f"média introuvable : {media_id}"


async def test_le_refus_est_en_francais_et_nomme_l_ecran_inconnu(hass, tablette, ecrans):
    with pytest.raises(ServiceValidationError, match="écran inconnu : grenier"):
        await _jouer(hass, ecrans=["salon", "grenier"], media=_media("a.webm"))


async def test_le_fichier_absent_est_dit_introuvable(hass, tablette, ecrans):
    with pytest.raises(ServiceValidationError, match="média introuvable"):
        await _jouer(hass, ecrans=["salon"], media=_media("absent.webm"))


async def test_une_image_avec_duree_est_jouee_en_millisecondes(hass, tablette, ecrans):
    await _abonner(tablette, "salon")

    await _jouer(hass, ecrans=["salon"], media=_media("a.gif", "image/gif"), duree=4)

    evenement = (await tablette.receive_json())["event"]
    assert evenement["type"] == "image" and evenement["duree"] == 4000


async def test_une_duree_fractionnaire_est_arrondie_a_la_milliseconde(hass, tablette, ecrans):
    await _abonner(tablette, "salon")

    await _jouer(hass, ecrans=["salon"], media=_media("a.webm"), duree=1.5)

    assert (await tablette.receive_json())["event"]["duree"] == 1500


async def test_la_duree_maximale_est_acceptee(hass, tablette, ecrans):
    await _abonner(tablette, "salon")

    await _jouer(hass, ecrans=["salon"], media=_media("a.webm"), duree=120)

    assert (await tablette.receive_json())["event"]["duree"] == 120000


@pytest.mark.parametrize("fichier", ["a.lottie", "a.json"])
async def test_un_fichier_lottie_est_joue_par_le_lecteur_lottie(hass, tablette, ecrans, fichier):
    await _abonner(tablette, "salon")

    await _jouer(hass, ecrans=["salon"], media={"media_content_id": f"{LOCAL}/{fichier}"})

    evenement = (await tablette.receive_json())["event"]
    assert evenement["type"] == "lottie"
    assert evenement["url"].startswith(f"/media/local/animations/{fichier}?authSig=")


async def test_le_fond_transparent_est_transmis(hass, tablette, ecrans):
    await _abonner(tablette, "salon")

    await _jouer(hass, ecrans=["salon"], media=_media("a.webm"), fond="transparent")

    assert (await tablette.receive_json())["event"]["fond"] == "transparent"


async def test_le_service_est_ouvert_a_un_non_administrateur(
        hass, tablette, ecrans, hass_read_only_user):
    await _abonner(tablette, "salon")

    await _jouer(hass, context=Context(user_id=hass_read_only_user.id),
                 ecrans=["salon"], media=_media("a.webm"))

    assert (await tablette.receive_json())["event"]["type"] == "video"


async def test_se_desabonner_fait_taire_la_tablette(hass, tablette, ecrans):
    abonnement = await _abonner(tablette, "salon")
    await tablette.send_json_auto_id(
        {"type": "unsubscribe_events", "subscription": abonnement})
    assert (await tablette.receive_json())["success"] is True

    await _jouer(hass, ecrans=["salon"], media=_media("a.webm"))

    await _rien_recu(tablette)


@pytest.mark.parametrize(
    ("mime", "media_id", "attendu"),
    [
        ("video/webm", "x/a.webm", "video"),
        ("video/mp4", "x/a.mp4", "video"),
        ("image/gif", "x/a.gif", "image"),
        ("image/webp", "x/a.webp", "image"),
        ("application/json", "x/a.json", "lottie"),
        ("application/zip+dotlottie", "x/a.lottie", "lottie"),
        ("video/lottie+json", "x/a", "lottie"),
        (None, "x/a.lottie", "lottie"),
        (None, "x/A.LOTTIE", "lottie"),
        (None, "x/a.JSON", "lottie"),
        ("text/plain", "x/a.txt", None),
        ("audio/mpeg", "x/a.mp3", None),
        (None, "x/a", None),
    ],
)
def test_type_lecteur(mime, media_id, attendu):
    assert type_lecteur(mime, media_id) == attendu


async def test_decharger_l_entree_retire_le_service(hass, medias, entree):
    assert hass.services.has_service(DOMAIN, "jouer_animation")

    assert await hass.config_entries.async_unload(entree.entry_id)

    assert not hass.services.has_service(DOMAIN, "jouer_animation")


async def test_le_composant_charge_media_source(hass, hass_ws_client):
    """The manifest dependency, not a test fixture, is what loads
    media_source: without it the service cannot resolve anything on an
    installation that does not load it for another reason."""
    assert "media_source" not in hass.config.components
    assert await async_setup_component(hass, DOMAIN, {})
    assert "media_source" in hass.config.components


def test_les_champs_du_service_sont_decrits_et_traduits_partout():
    """services.yaml, the two translations and the service schema name the
    SAME fields: a field added to the schema but not to the UI would be
    unreachable from the action editor, and an untranslated one shows its
    raw key."""
    racine = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"
    decrits = yaml.safe_load((racine / "services.yaml").read_text(encoding="utf-8"))
    attendus = {str(cle) for cle in SCHEMA.schema}
    assert set(decrits["jouer_animation"]["fields"]) == attendus
    for langue in ("fr", "en"):
        traductions = json.loads((racine / "translations" / f"{langue}.json").read_text(encoding="utf-8"))
        assert set(traductions["services"]["jouer_animation"]["fields"]) == attendus, langue


def test_le_selecteur_de_duree_offre_exactement_ce_que_le_service_accepte():
    """The action editor's number selector is the service contract seen from
    the UI: every selector must be one Home Assistant accepts, and the
    duration bounds must be those the service enforces -- a `min: 1` there
    hid the ]0, 1[ range the service accepts, and a lower bound that rounds
    to 0 ms would offer a value the service refuses."""
    racine = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"
    champs = yaml.safe_load((racine / "services.yaml").read_text(encoding="utf-8"))[
        "jouer_animation"]["fields"]
    for champ in champs.values():
        selector.validate_selector(champ["selector"])  # raises on an unknown key
    nombre = selector.validate_selector(champs["duree"]["selector"])["number"]
    assert nombre["max"] == DUREE_MAX_S
    assert 0 < round(nombre["min"] * 1000) and nombre["min"] < 1
    assert nombre["unit_of_measurement"] == "s"
