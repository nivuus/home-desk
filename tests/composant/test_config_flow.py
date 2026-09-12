"""Les flows, y compris leurs cas d'erreur.

Un flow qui ne teste que son chemin heureux ne teste rien : le seul moment ou
un formulaire compte, c'est quand la saisie est mauvaise.
"""
import json
import pathlib

import pytest
from homeassistant import config_entries, data_entry_flow

from custom_components.home_desk.const import (
    DOMAIN,
    ERREUR_BUDGET_INTENABLE,
    ERREUR_HAUTEUR_HORS_BORNES,
    SOUS_ENTREE_ECRAN,
    VERSION_CONFIG,
)
from custom_components.home_desk.schema import HAUTEUR_MAX, HAUTEUR_MIN

CHEMIN_TRADUCTIONS = (
    pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk" / "translations"
)


async def test_l_entree_se_cree_une_seule_fois(hass):
    """Une seule entree « Tablettes murales » : N tablettes sont N SOUS-entrees.
    Sans ce refus, deux entrees detiendraient deux verites concurrentes."""
    premier = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.flow.async_configure(premier["flow_id"], {})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat["title"] == "Tablettes murales", (
        "c'est cette ligne que l'utilisateur lit dans sa liste d'integrations")

    second = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert second["type"] is data_entry_flow.FlowResultType.ABORT
    assert second["reason"] == "single_instance_allowed"


async def test_un_ecran_qui_deborde_est_REFUSE_avec_son_chiffre(hass, entree):
    """LE test de cette tache. Le formulaire refuse une hauteur ou l'ecran ne
    tient pas, et dit de combien — pas « valeur invalide ». C'est toute la
    raison d'etre de verifier_budget : dire non AU MOMENT DE LA SAISIE, pas
    devant la tablette."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Test", "hauteurUtile": 100})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["hauteurUtile"] == ERREUR_BUDGET_INTENABLE
    assert "336" in str(resultat["description_placeholders"]), (
        "le formulaire doit dire DE COMBIEN l'ecran deborde, pas seulement qu'il deborde")


async def test_une_hauteur_hors_bornes_est_refusee_a_la_saisie(hass, entree):
    """Important ronde 1 : `verifier_budget` seul ne couvre pas une hauteur
    absurde — 10 000 px ne deborde JAMAIS (l'ecran est toujours plus petit),
    et sans cette garde le formulaire l'acceptait pour que `schema.valider()`
    la refuse plus tard, a l'ECRITURE : l'inverse exact de ce que cette tache
    existe pour faire. La garde reutilise `schema.hauteur_utile`, la MEME
    fonction que celle qui validera l'ecran complet — aucune borne recopiee
    ici."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Trop haute", "hauteurUtile": 10000})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["hauteurUtile"] == ERREUR_HAUTEUR_HORS_BORNES
    placeholders = str(resultat["description_placeholders"])
    assert str(HAUTEUR_MIN) in placeholders and str(HAUTEUR_MAX) in placeholders, (
        "le formulaire doit dire la plage attendue, pas seulement qu'elle est depassee")


async def test_une_saisie_refusee_garde_le_nom_et_la_note(hass, entree):
    """Mineur ronde 1 : sans `add_suggested_values_to_schema`, un refus de
    budget effacait aussi le nom et la note deja saisis — a retaper pour
    rien. Ce test clouerait tout autant la presence meme de `data_schema`
    dans le formulaire redonne : sans lui (« on peut le retirer sans rien
    casser », note de relecture), l'acces a `.schema` ci-dessous leverait."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"nom": "Salon", "hauteurUtile": 100, "note": "Fire 7 au mur"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    marqueurs = {str(cle): cle for cle in resultat["data_schema"].schema}
    assert marqueurs["nom"].description == {"suggested_value": "Salon"}
    assert marqueurs["note"].description == {"suggested_value": "Fire 7 au mur"}


async def test_un_ecran_valide_est_accepte_et_porte_sa_version(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"nom": "Salon d essai", "hauteurUtile": 585, "note": "Fire 7, mur du salon"})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat["data"]["version"] == VERSION_CONFIG, (
        "la version est posee a l'ECRITURE, pas devinee a la lecture")
    assert resultat["data"]["note"] == "Fire 7, mur du salon", (
        "la note doit survivre jusqu'a data, pas se perdre en route")
    assert resultat["title"] == "Salon d essai", (
        "c'est cette ligne que l'utilisateur lit dans la liste des ecrans")


@pytest.mark.parametrize("langue", ["fr", "en"])
def test_les_traductions_nomment_le_debordement(langue):
    """Ronde 1 de relecture : sans ce test, `translations/fr.json` pouvait
    etre vide, sa cle d'erreur renommee, ou `{debordement}` retire de la
    phrase — les 42 tests d'alors restaient tous verts, puisqu'aucun ne
    chargeait ce fichier. Les cles utilisees ci-dessous viennent de
    const.py (`SOUS_ENTREE_ECRAN`, `ERREUR_BUDGET_INTENABLE`), jamais
    reecrites en dur : renommer l'une sans repercuter le JSON fait tomber
    CE test plutot que de laisser l'affichage silencieusement casse."""
    traductions = json.loads(
        (CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    phrase = traductions["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_BUDGET_INTENABLE]
    assert "{debordement}" in phrase, (
        "le formulaire doit dire DE COMBIEN l'ecran deborde, pas seulement qu'il deborde")
