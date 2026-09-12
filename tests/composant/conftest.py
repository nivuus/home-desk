"""Harnais commun. `enable_custom_integrations` est ce qui fait voir
custom_components/home_desk a l'instance de test ; sans elle, tous les tests de
flow echouent sur « integration not found », pour une raison sans rapport avec
le code teste."""
import pytest
from homeassistant import config_entries, data_entry_flow

from custom_components.home_desk.const import DOMAIN, SOUS_ENTREE_ECRAN

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture
async def entree(hass):
    """L'entree unique « Tablettes murales », deja creee. Tous les tests de
    sous-entree en ont besoin : une sous-entree ne s'initialise que sous une
    entree existante."""
    resultat = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.flow.async_configure(resultat["flow_id"], {})
    return resultat["result"]


def _commandes(hass):
    """L'etat REEL des tuiles de commande de l'unique ecran peuple par
    `entree_peuplee` : lu directement depuis la sous-entree persistee, jamais
    depuis un flow (qui peut avoir fini sa course, ou pas)."""
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    subentry = next(iter(entry.subentries.values()))
    return list(subentry.data.get("commandes", []))


async def _geste(hass, section: str, index: int, geste: str):
    """Rejoue le parcours reel d'UN geste sur le N-ieme element d'une section
    « liste » : reconfigurer la sous-entree, choisir la section, choisir
    l'element, soumettre `geste` avec ses champs INCHANGES — un vrai geste
    « monter »/« descendre » ne touche QUE le rang, jamais les champs de la
    tuile elle-meme."""
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    subentry = next(iter(entry.subentries.values()))
    element = subentry.data[section][index]

    flow = await hass.config_entries.subentries.async_init(
        (entry.entry_id, SOUS_ENTREE_ECRAN),
        context={
            "source": config_entries.SOURCE_RECONFIGURE,
            "subentry_id": subentry.subentry_id,
        },
    )
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": section})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"choix": str(index)})
    return await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**element, "geste": geste})


@pytest.fixture
async def entree_peuplee(hass, entree):
    """Un ecran invente, avec QUATRE tuiles de commande : assez pour que
    « monter la troisieme » (index 2) soit distinguable d'un simple echange
    des deux premieres — ce qu'un ecran a deux tuiles ne permettrait pas."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Salon d essai", "hauteurUtile": 900})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY

    entry = hass.config_entries.async_get_entry(entree.entry_id)
    subentry_id = next(iter(entry.subentries))

    tuiles = [
        {"libelle": "Lampe salon", "icone": "bulb", "entite": "light.salon"},
        {"libelle": "Volet salon", "icone": "rideau", "entite": "cover.salon"},
        {"libelle": "Porte garage", "icone": "porte", "entite": "lock.garage"},
        {"libelle": "Prise TV", "icone": "case", "entite": "switch.tv"},
    ]
    for tuile in tuiles:
        flow = await hass.config_entries.subentries.async_init(
            (entree.entry_id, SOUS_ENTREE_ECRAN),
            context={
                "source": config_entries.SOURCE_RECONFIGURE,
                "subentry_id": subentry_id,
            },
        )
        await hass.config_entries.subentries.async_configure(
            flow["flow_id"], {"next_step_id": "commandes"})
        await hass.config_entries.subentries.async_configure(
            flow["flow_id"], {"choix": "ajouter"})
        resultat = await hass.config_entries.subentries.async_configure(
            flow["flow_id"], tuile)
        assert resultat["type"] is data_entry_flow.FlowResultType.FORM, (
            "enregistrer une tuile doit reafficher le choix de la section, "
            "pas terminer le flow")

    assert [t["libelle"] for t in _commandes(hass)] == [t["libelle"] for t in tuiles]
    return entree
