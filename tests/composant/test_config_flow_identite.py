"""Reconfigurer l'identite (`nom`/`hauteurUtile`/`temperature`/`note`) d'une
sous-entree EXISTANTE — I4, ronde 1 de relecture ; `async_step_identite`
n'existait pas avant elle (`nom`/`hauteurUtile`/`temperature`/`note` etaient
immuables a vie une fois la sous-entree creee).

Separe de `test_config_flow.py` en ronde 2 de relecture (ce dernier
depassait 500 lignes) — meme couture que `test_config_flow_objets.py` a la
ronde 1 : ces six tests forment un groupe coherent (UN step, ses gardes,
son renommage) plutot qu'un decoupage arbitraire.
"""
from homeassistant import data_entry_flow

from conftest import IDENTITE_MINIMALE, _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import (
    ERROR_BUDGET_UNTENABLE,
    ERROR_NAME_ALREADY_USED,
    ERROR_NAME_EMPTY,
    VERSION_CONFIG,
)


async def test_reconfigurer_l_identite_change_le_nom_et_la_hauteur(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {**IDENTITE_MINIMALE, "nom": "Salon renomme", "hauteurUtile": 900, "note": "Renomme"},
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["nom"] == "Salon renomme"
    assert subentry.data["hauteurUtile"] == 900
    assert subentry.data["note"] == "Renomme"


async def test_reconfigurer_l_identite_refuse_un_nom_vide(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "nom": "   "})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["nom"] == ERROR_NAME_EMPTY
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["nom"] == IDENTITE_MINIMALE["nom"], "un refus ne doit RIEN persister"


async def test_reconfigurer_l_identite_refuse_une_hauteur_qui_deborde(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "hauteurUtile": 100})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["hauteurUtile"] == ERROR_BUDGET_UNTENABLE
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["hauteurUtile"] == IDENTITE_MINIMALE["hauteurUtile"]


async def test_reconfigurer_l_identite_preremplit_les_valeurs_stockees(hass, entree):
    subentry_id = await _creer_ecran(hass, entree, note="Une note")
    flow = await _init_reconfigure(hass, entree, subentry_id)
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    marqueurs = {str(cle): cle for cle in resultat["data_schema"].schema}
    assert marqueurs["nom"].description == {"suggested_value": IDENTITE_MINIMALE["nom"]}
    assert marqueurs["note"].description == {"suggested_value": "Une note"}


async def test_reconfigurer_l_identite_vide_la_note_existante(hass, entree):
    """Ronde 2 de relecture (point 6) : deux mutations survivaient sur
    `async_step_identite`, toutes deux invisibles sur CE seul test.
    (a) retirer la ligne `if "note" not in identity_data: new_data.pop
    ("note", None)` — une note videe restait persistee telle quelle. (b)
    remplacer `garde_ecran.persister_si_valide(..., new_data, ...)`
    (une ecriture COMPLETE) par un appel qui ne passerait que `identity_data` (le
    seul DELTA identite, sans "note" quand elle est vide) en `data_updates`
    — une UNION qui NE RETIRE JAMAIS de cle garderait alors l'ancienne note.
    Une note EXISTANTE, videe puis resoumise, doit disparaitre : ce test
    tombe sous les DEUX mutations."""
    subentry_id = await _creer_ecran(hass, entree, note="Une note qui doit partir")
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "note": ""})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert "note" not in subentry.data


async def test_reconfigurer_l_identite_refuse_un_nom_deja_pris_par_un_autre_ecran(hass, entree):
    """Ronde 1 de relecture (Important, tache 8) : `nom` est la cle primaire
    du transport websocket -- deux ecrans homonymes en rendraient un
    inatteignable. Renommer "salon" en "cuisine" alors que "cuisine" existe
    deja doit se refuser, en nommant le conflit."""
    salon_id = await _creer_ecran(hass, entree, nom="salon")
    await _creer_ecran(hass, entree, nom="cuisine")

    flow = await _init_reconfigure(hass, entree, salon_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "nom": "cuisine"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["nom"] == ERROR_NAME_ALREADY_USED
    assert "cuisine" in str(resultat["description_placeholders"])
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[salon_id]
    assert subentry.data["nom"] == "salon", "un refus ne doit RIEN persister"


async def test_reconfigurer_l_identite_vers_son_propre_nom_actuel_n_est_pas_un_conflit(hass, entree):
    """Le pendant du test precedent : renommer un ecran vers SON PROPRE nom
    (aucun changement de `nom`) ne doit jamais se refuser lui-meme --
    `garde_ecran.noms_utilises` EXCLUT la sous-entree en cours de
    reconfiguration."""
    subentry_id = await _creer_ecran(hass, entree, nom="salon")
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "nom": "salon", "hauteurUtile": 950})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["hauteurUtile"] == 950


async def test_reconfigurer_l_identite_preserve_la_version(hass, entree):
    """Ronde 1 de relecture (Important, tache 8) : le transport websocket
    (`websocket.py`) refuse net (`version_inconnue`) toute sous-entree dont
    la `version` ne vaut pas exactement `VERSION_CONFIG` -- si une
    reconfiguration la perdait, l'ecran deviendrait IRRECUPERABLE par le
    transport, pas seulement degrade. Rien ne gardait cette garantie avant
    ce test : `_valider_identite` ne touche jamais `version`, et
    `new_data = dict(subentry.data)` (avant `.update(identity_data)`)
    la conserve seulement TANT QUE ce point de depart ne change pas."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "nom": "Salon renomme"})
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["version"] == VERSION_CONFIG


async def test_reconfigurer_l_identite_renomme_le_titre_de_la_sous_entree(hass, entree):
    """Ronde 2 de relecture (point 4) : `_async_update` etait appele SANS
    `title=` — mesure, renommer l'ecran (`nom`) laissait le TITRE de la
    sous-entree (celui que la page d'integration liste) inchange, divergent
    du `nom` des la premiere reconfiguration."""
    subentry_id = await _creer_ecran(hass, entree)
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert entry.subentries[subentry_id].title == IDENTITE_MINIMALE["nom"]

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "nom": "Cuisine renommee"})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert entry.subentries[subentry_id].title == "Cuisine renommee"
