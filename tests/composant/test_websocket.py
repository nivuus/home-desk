"""Le transport (`websocket.py`) : les deux commandes websocket, et
l'evenement de changement.

Cinq comportements ; les trois derniers sont les seuls qui comptent
vraiment (brief, tache 8) -- le chemin heureux et la liste ne font que
poser le decor que les trois autres exploitent."""
from conftest import IDENTITE_MINIMALE, _creer_ecran
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.home_desk.const import (
    DOMAIN,
    ERREUR_ECRAN_INTROUVABLE,
    ERREUR_VERSION_INCONNUE,
    EVENEMENT_CHANGEMENT,
    VERSION_CONFIG,
    WS_ECRAN,
    WS_ECRANS,
)


def _subentry(hass, entry_id: str):
    entry = hass.config_entries.async_get_entry(entry_id)
    return entry, next(iter(entry.subentries.values()))


async def test_ecran_rend_la_configuration_validee(hass, ws_client, entree_peuplee):
    """Le chemin heureux, pour memoire : `home_desk/ecran` rend l'ecran
    RESOLU par `schema.valider()`, `version` comprise, avec les quatre
    tuiles de commande posees par `entree_peuplee`."""
    await ws_client.send_json_auto_id({"type": WS_ECRAN, "nom": "Salon d essai"})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is True
    ecran = reponse["result"]
    assert ecran["nom"] == "Salon d essai"
    assert ecran["version"] == VERSION_CONFIG
    assert [c["libelle"] for c in ecran["commandes"]] == [
        "Lampe salon", "Volet salon", "Porte garage", "Prise TV",
    ]


async def test_ecrans_rend_la_liste_pour_la_premiere_degradation(hass, ws_client, entree_peuplee):
    """Sans cette commande, `?ecran=` absent n'a d'autre issue qu'un mur
    blanc ou un ecran devine. Les deux sont interdits (spec, decision 10)."""
    await ws_client.send_json_auto_id({"type": WS_ECRANS})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is True
    assert reponse["result"] == [{"nom": "Salon d essai", "titre": "Salon d essai"}]


async def test_un_nom_inconnu_rend_une_ERREUR_NOMMEE_pas_un_objet_vide(hass, ws_client, entree_peuplee):
    """Un objet vide serait un ecran sans tuiles : l'application le rendrait
    sans savoir qu'elle rend une absence. L'erreur doit se distinguer --
    et le decor (un ecran REEL, nomme differemment) prouve que ce n'est
    pas juste « aucun ecran configure » qui est detecte ici."""
    await ws_client.send_json_auto_id({"type": WS_ECRAN, "nom": "cuisine"})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is False
    assert reponse["error"]["code"] == ERREUR_ECRAN_INTROUVABLE
    assert "cuisine" in reponse["error"]["message"]


async def test_une_version_inconnue_est_REFUSEE_a_la_lecture(hass, ws_client, entree):
    """La quatrieme degradation, cote composant. Une sous-entree ecrite par
    une version FUTURE du composant ne doit pas etre servie a moitie :
    refus net.

    C'est la dette n.3 leguee par le plan 2 -- `version` n'etait ni requis
    ni lu. Elle est refermee ici : posee a l'ECRITURE par le flow, verifiee
    a la LECTURE par le transport. La mutation directe de `subentry.data`
    (plutot qu'un chemin du flow, qui n'accepte que VERSION_CONFIG) simule
    les TROIS portes qui ne passent pas par le formulaire : sauvegarde
    restauree, import direct, ou -- ici -- une version future du composant
    qui aurait ecrit une forme que celle-ci ne reconnait pas encore."""
    subentry_id = await _creer_ecran(hass, entree)
    entry, subentry = _subentry(hass, entree.entry_id)
    hass.config_entries.async_update_subentry(
        entry, subentry, data={**subentry.data, "version": VERSION_CONFIG + 1}
    )

    await ws_client.send_json_auto_id({"type": WS_ECRAN, "nom": IDENTITE_MINIMALE["nom"]})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is False
    assert reponse["error"]["code"] == ERREUR_VERSION_INCONNUE


async def test_ecrire_une_sous_entree_emet_l_evenement_avec_le_NOM(hass, entree):
    """La charge utile porte le nom de l'ecran, pas un simple signal : les
    trois tablettes ecoutent le meme bus, et deux d'entre elles n'ont
    aucune raison de se recharger parce que la troisieme a change."""
    evenements = async_capture_events(hass, EVENEMENT_CHANGEMENT)

    await _creer_ecran(hass, entree, nom="salon d essai")
    await hass.async_block_till_done()

    assert len(evenements) == 1
    assert evenements[0].data == {"nom": "salon d essai"}
