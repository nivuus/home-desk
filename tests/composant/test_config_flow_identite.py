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
from custom_components.home_desk.const import ERREUR_BUDGET_INTENABLE, ERREUR_NOM_VIDE


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
    assert resultat["errors"]["nom"] == ERREUR_NOM_VIDE
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
    assert resultat["errors"]["hauteurUtile"] == ERREUR_BUDGET_INTENABLE
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
    (a) retirer la ligne `if "note" not in donnee: nouvelles_donnees.pop
    ("note", None)` — une note videe restait persistee telle quelle. (b)
    remplacer `garde_ecran.persister_si_valide(..., nouvelles_donnees, ...)`
    (une ecriture COMPLETE) par un appel qui ne passerait que `donnee` (le
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
