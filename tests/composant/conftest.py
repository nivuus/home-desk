"""Harnais commun. `enable_custom_integrations` est ce qui fait voir
custom_components/home_desk a l'instance de test ; sans elle, tous les tests de
flow echouent sur « integration not found », pour une raison sans rapport avec
le code teste."""
import pytest
from homeassistant import config_entries, data_entry_flow
from homeassistant.setup import async_setup_component

from custom_components.home_desk.const import DOMAIN, SUBENTRY_SCREEN
from custom_components.home_desk.list_fields import SECTIONS

pytest_plugins = "pytest_homeassistant_custom_component"

# La sous-entree minimale d'identite : `temperature` est requis (ronde 1 de
# relecture, tache 6 — un champ racine du contrat qu'aucune tache ne portait
# encore). Reutilisee partout ou un test doit juste franchir cette premiere
# section pour atteindre les sections « liste ».
IDENTITE_MINIMALE = {"nom": "Salon d essai", "hauteurUtile": 900, "temperature": "sensor.temp_salon"}

# Un element VALIDE par section « liste », utilise par test_config_flow_
# list_sections.py (ajout generique par section, refus generalise a toutes les
# sections, preuve de bout en bout que seul `sources` manque encore a
# schema.valider()). Ronde 3 de relecture : la mention de test_config_
# flow.py etait perimee — ce fichier n'importe pas ELEMENTS_VALIDES.
#
# Tache 7 : `sources`, `minuteurs` et `etiquettesMinuteur` rejoignent cette
# table — les tests parametres sur `SECTIONS` (test_config_flow_listes.py,
# `_cles_attendues` de test_config_flow.py) les couvrent donc d'office, sans
# une ligne de test supplementaire, exactement ce que le brief invite a
# reutiliser.
ELEMENTS_VALIDES = {
    "commandes": {"libelle": "Lampe test", "icone": "bulb", "entite": "light.test_commande"},
    "ambiances": {"libelle": "Ambiance test", "icone": "sofa", "entite": "light.test_ambiance"},
    "extrasMaison": {"libelle": "Extra test", "icone": "list", "entite": "switch.test_extra"},
    "synthese": {
        "entite": "sensor.test_synthese", "texte": "Texte test", "operateur": "==", "valeur": "ok",
    },
    "ouvrants": {"entite": "binary_sensor.test_ouvrant"},
    # Tache 7 : meme forme qu'`ouvrants` (un tableau d'`entite` nue).
    "listesTachesExtra": {"entite": "todo.test_liste_taches"},
    "sources": {
        "nom": "Source test",
        "titre": ["sensor.test_titre"],
        "sousTitre": ["sensor.test_sous_titre"],
        "affiche": ["media_player.test_affiche"],
        "progression": ["sensor.test_progression"],
        "transport": ["media_player.test_transport"],
        "volume": ["media_player.test_volume"],
    },
    "minuteurs": {"timer": "timer.test_minuteur", "nom": "input_text.test_minuteur_nom"},
    "etiquettesMinuteur": {"etiquette": "Pates"},
}

# Un objet `voiture` complet (les sept champs), partage entre
# test_config_flow_objets.py (le Critique : retirer une voiture DEJA
# configuree) et test_config_flow_voiture.py (I1 : la section elle-meme) —
# ronde 3 de relecture, deplace ici pour que la scission de ces deux
# fichiers n'oblige pas a une seconde copie.
VOITURE_COMPLETE = {
    "batterie": "sensor.voiture_batterie",
    "autonomie": "sensor.voiture_autonomie",
    "branchee": "binary_sensor.voiture_branchee",
    "enCharge": "binary_sensor.voiture_en_charge",
    "clim": "binary_sensor.voiture_clim",
    "demarrerClim": "script.voiture_demarrer_clim",
    "arreterClim": "script.voiture_arreter_clim",
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


@pytest.fixture
async def ws_client(hass, hass_ws_client):
    """Un client websocket DEJA CONNECTE et authentifie (tache 8) : les tests
    du transport (`tests/composant/test_websocket.py`) n'ont besoin que
    d'envoyer/recevoir, jamais de refaire la connexion. `hass_ws_client`
    vient de `pytest_homeassistant_custom_component` (elle appelle elle-meme
    `async_setup_component(hass, "websocket_api", {})`).

    The component is set up FIRST: its `async_setup` registers an HTTP view
    (`page.py`), and the harness's test server freezes the router when it
    starts -- which a running Home Assistant never does (`http/server.py`
    disables the freeze so integrations added from the UI can register
    routes). Setting up in the order a booted instance would keeps this
    fixture from failing for a reason the product does not have."""
    assert await async_setup_component(hass, DOMAIN, {})
    return await hass_ws_client(hass)


async def _creer_ecran(hass, entree, **overrides) -> str:
    """Cree une sous-entree d'identite minimale (nom/hauteurUtile/temperature
    valides), rend son `subentry_id`. Partagee par les deux fichiers de test
    de config_flow (identite et sections « liste »)."""
    donnee = {**IDENTITE_MINIMALE, **overrides}
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SUBENTRY_SCREEN), context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(flow["flow_id"], donnee)
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    return next(iter(hass.config_entries.async_get_entry(entree.entry_id).subentries))


async def _init_reconfigure(hass, entree, subentry_id: str):
    return await hass.config_entries.subentries.async_init(
        (entree.entry_id, SUBENTRY_SCREEN),
        context={"source": config_entries.SOURCE_RECONFIGURE, "subentry_id": subentry_id})


def _commandes(hass):
    """L'etat REEL des tuiles de commande de l'unique ecran peuple par
    `entree_peuplee` : lu directement depuis la sous-entree persistee, jamais
    depuis un flow (qui peut avoir fini sa course, ou pas)."""
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    subentry = next(iter(entry.subentries.values()))
    return list(subentry.data.get("commandes", []))


def _champ_scalaire(section: str) -> str:
    """Le nom du champ UNIQUE d'une section SCALAIRE (ouvrants: "entite",
    etiquettesMinuteur: "etiquette") — derive du schema de la section
    plutot qu'une correspondance ecrite a la main qui pourrait diverger."""
    champs = {str(c) for c in SECTIONS[section].construire_schema(True).schema}
    champs.discard("geste")
    assert len(champs) == 1, f"{section!r} n'est pas une section scalaire a un seul champ"
    return next(iter(champs))


async def _geste(hass, section: str, index: int, geste: str):
    """Rejoue le parcours reel d'UN geste sur le N-ieme element d'une section
    « liste » : reconfigurer la sous-entree, choisir la section, choisir
    l'element, soumettre `geste` avec ses champs INCHANGES — un vrai geste
    « monter »/« descendre » ne touche QUE le rang, jamais les champs de la
    tuile elle-meme.

    Ronde 4 de relecture (mineur) : n'etait PORTABLE que sur les sections
    dont l'element est un dict (`{**element}` echoue avec une TypeError des
    qu'un element est une CHAINE — le cas d'`ouvrants`). Les trois gestes ne
    fonctionnent bien sur les cinq sections que depuis cette correction ;
    voir `test_monter_descendre_supprimer_fonctionnent_sur_les_cinq_
    sections` (test_config_flow_listes.py), qui les exerce toutes.

    Tache 7 : `etiquettesMinuteur` est une DEUXIEME section scalaire, dont
    le champ unique n'est PAS "entite" (`"etiquette"`) — le nom fixe
    "entite" ci-dessous aurait ete FAUX pour elle. `_champ_scalaire` le
    derive du schema de la section plutot que de le deviner."""
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    subentry = next(iter(entry.subentries.values()))
    element = subentry.data[section][index]
    charge = {**element, "geste": geste} if isinstance(element, dict) else {
        _champ_scalaire(section): element, "geste": geste}

    flow = await hass.config_entries.subentries.async_init(
        (entry.entry_id, SUBENTRY_SCREEN),
        context={
            "source": config_entries.SOURCE_RECONFIGURE,
            "subentry_id": subentry.subentry_id,
        },
    )
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": section})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"choix": str(index)})
    return await hass.config_entries.subentries.async_configure(flow["flow_id"], charge)


def _variante(cle: str, i: int):
    """Un element VALIDE de plus pour la section `cle`, distinct du i-eme
    autre — utilise pour peupler une section de plusieurs elements sans
    recopier `ELEMENTS_VALIDES` a la main (ronde 4 de relecture, mineur :
    exercer monter/descendre/supprimer sur les CINQ sections, pas
    seulement "commandes")."""
    base = ELEMENTS_VALIDES[cle]
    if cle in ("ouvrants", "listesTachesExtra"):
        return {**base, "entite": f"{base['entite']}_{i}"}
    if cle == "synthese":
        return {**base, "texte": f"{base['texte']} {i}"}
    if cle == "sources":
        return {**base, "nom": f"{base['nom']} {i}"}
    if cle == "minuteurs":
        return {**base, "timer": f"{base['timer']}_{i}"}
    if cle == "etiquettesMinuteur":
        return {**base, "etiquette": f"{base['etiquette']} {i}"}
    return {**base, "libelle": f"{base['libelle']} {i}"}


def _elements(hass, entree, cle: str) -> list:
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    subentry = next(iter(entry.subentries.values()))
    return list(subentry.data.get(cle, []))


@pytest.fixture
async def entree_peuplee(hass, entree):
    """Un ecran invente, avec QUATRE tuiles de commande : assez pour que
    « monter la troisieme » (index 2) soit distinguable d'un simple echange
    des deux premieres — ce qu'un ecran a deux tuiles ne permettrait pas."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SUBENTRY_SCREEN),
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
            (entree.entry_id, SUBENTRY_SCREEN),
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
        # l'edition d'un element EXISTANT, cf. list_sections._schema_bouton) — le
        # soumettre ferait echouer data_schema (cle inconnue).
        resultat = await hass.config_entries.subentries.async_configure(
            flow["flow_id"], tuile)
        assert resultat["type"] is data_entry_flow.FlowResultType.FORM, (
            "enregistrer une tuile doit reafficher le choix de la section, "
            "pas terminer le flow")

    assert [t["libelle"] for t in _commandes(hass)] == [t["libelle"] for t in tuiles]
    return entree
