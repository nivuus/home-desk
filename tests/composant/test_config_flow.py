"""Les flows, y compris leurs cas d'erreur.

Un flow qui ne teste que son chemin heureux ne teste rien : le seul moment ou
un formulaire compte, c'est quand la saisie est mauvaise.
"""
import pytest
from homeassistant import config_entries, data_entry_flow

from custom_components.home_desk.const import DOMAIN, SOUS_ENTREE_ECRAN, VERSION_CONFIG


async def test_l_entree_se_cree_une_seule_fois(hass):
    """Une seule entree « Tablettes murales » : N tablettes sont N SOUS-entrees.
    Sans ce refus, deux entrees detiendraient deux verites concurrentes."""
    premier = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.flow.async_configure(premier["flow_id"], {})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY

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
    assert resultat["errors"]["hauteurUtile"] == "budget_intenable"
    assert "336" in str(resultat["description_placeholders"]), (
        "le formulaire doit dire DE COMBIEN l'ecran deborde, pas seulement qu'il deborde")


async def test_un_ecran_valide_est_accepte_et_porte_sa_version(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Salon d essai", "hauteurUtile": 585})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat["data"]["version"] == VERSION_CONFIG, (
        "la version est posee a l'ECRITURE, pas devinee a la lecture")
