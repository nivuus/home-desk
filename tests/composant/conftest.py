"""Harnais commun. `enable_custom_integrations` est ce qui fait voir
custom_components/home_desk a l'instance de test ; sans elle, tous les tests de
flow echouent sur « integration not found », pour une raison sans rapport avec
le code teste."""
import pytest
from homeassistant import config_entries, data_entry_flow

from custom_components.home_desk.const import DOMAIN, SOUS_ENTREE_ECRAN

pytest_plugins = "pytest_homeassistant_custom_component"

# La sous-entree minimale d'identite : `temperature` est requis (ronde 1 de
# relecture, tache 6 — un champ racine du contrat qu'aucune tache ne portait
# encore). Reutilisee partout ou un test doit juste franchir cette premiere
# section pour atteindre les sections « liste ».
IDENTITE_MINIMALE = {"nom": "Salon d essai", "hauteurUtile": 900, "temperature": "sensor.temp_salon"}

# Un element VALIDE par section « liste », partage par les tests de
# test_config_flow.py et test_config_flow_listes.py (ajout generique,
# preuve de bout en bout que seul `sources` manque encore a schema.valider).
ELEMENTS_VALIDES = {
    "commandes": {"libelle": "Lampe test", "icone": "bulb", "entite": "light.test_commande"},
    "ambiances": {"libelle": "Ambiance test", "icone": "sofa", "entite": "light.test_ambiance"},
    "extrasMaison": {"libelle": "Extra test", "icone": "list", "entite": "switch.test_extra"},
    "synthese": {
        "entite": "sensor.test_synthese", "texte": "Texte test", "operateur": "==", "valeur": "ok",
    },
    "ouvrants": {"entite": "binary_sensor.test_ouvrant"},
}


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


async def _creer_ecran(hass, entree, **overrides) -> str:
    """Cree une sous-entree d'identite minimale (nom/hauteurUtile/temperature
    valides), rend son `subentry_id`. Partagee par les deux fichiers de test
    de config_flow (identite et sections « liste »)."""
    donnee = {**IDENTITE_MINIMALE, **overrides}
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN), context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(flow["flow_id"], donnee)
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    return next(iter(hass.config_entries.async_get_entry(entree.entry_id).subentries))


async def _init_reconfigure(hass, entree, subentry_id: str):
    return await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_RECONFIGURE, "subentry_id": subentry_id})


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
        flow["flow_id"], IDENTITE_MINIMALE)
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
            flow["flow_id"], {"nouveau": True})
        # Ajout : le formulaire n'a PAS de champ "geste" (reserve a
        # l'edition d'un element EXISTANT, cf. listes._schema_bouton) — le
        # soumettre ferait echouer data_schema (cle inconnue).
        resultat = await hass.config_entries.subentries.async_configure(
            flow["flow_id"], tuile)
        assert resultat["type"] is data_entry_flow.FlowResultType.FORM, (
            "enregistrer une tuile doit reafficher le choix de la section, "
            "pas terminer le flow")

    assert [t["libelle"] for t in _commandes(hass)] == [t["libelle"] for t in tuiles]
    return entree
