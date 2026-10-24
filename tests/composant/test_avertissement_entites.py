"""C1 (relecture finale de branche, Critique) : l'avertissement d'entite
inconnue (decision 7) etait CALCULE aux neuf sites, mais ne pouvait
ATTEINDRE aucun ecran -- soit la description du step reaffiche ne portait
aucun placeholder, soit le flow se terminait avant que quiconque puisse la
lire. Et la ou `{entites_inconnues}` existait (`user`/`identite`), il
etait colle a une phrase FIXE, affichee a CHAQUE ouverture, suivie de rien
la plupart du temps -- le « bouton mort en prose » que ce depot s'interdit.

Ce module tient les DEUX garde-fous que le relecteur a demandes en priorite :

1. Un test qui APPARIE les deux bouts -- DERIVE des traductions (JSON) et du
   CODE (AST), jamais une liste de steps recopiee a la main (le meme
   principe que `test_garde_ecran.py::
   test_garde_ecran_est_le_seul_module_a_appeler_une_porte_d_ecriture`) :
   un step qui perdrait son placeholder, ou un site qui cesserait de le
   fournir, le fait tomber sans qu'on ait besoin de le nommer d'avance.
2. Deux tests de BOUT EN BOUT (un vrai flow HA) : rien ne s'affiche quand
   tout est connu ; l'avertissement est VISIBLE sur un ecran REELLEMENT
   atteint quand une entite ne l'est pas.
"""
import ast
import json
import pathlib
import string

import pytest
from homeassistant import config_entries, data_entry_flow

from conftest import IDENTITE_MINIMALE, _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import SUBENTRY_SCREEN

COMPOSANT_DIR = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"
CHEMIN_TRADUCTIONS = COMPOSANT_DIR / "translations"


def _placeholders(texte: str) -> set[str]:
    """Les noms `{x}` d'un gabarit de traduction -- via `string.Formatter`,
    jamais une regex maison qui pourrait diverger de ce que Home Assistant
    lit lui-meme."""
    return {champ for _, champ, _, _ in string.Formatter().parse(texte) if champ}


def _cles_dans_les_ecrans_visibles(traductions: dict) -> set[str]:
    """Tous les placeholders `{...}` des DESCRIPTIONS de step et des
    `create_entry` -- les deux seuls endroits qu'un utilisateur REGARDE
    reellement (jamais `error.*`, un mecanisme DEJA garde par ailleurs :
    `test_les_traductions_nomment_le_debordement` et voisins,
    test_config_flow.py). Parcourt le JSON -- jamais une liste de steps
    ("user", "identite"...) recopiee a la main : un dixieme step qui
    porterait ce placeholder demain y serait vu sans reecrire ce test."""
    cles: set[str] = set()
    for sous_entree in traductions.get("config_subentries", {}).values():
        for step in sous_entree.get("step", {}).values():
            cles |= _placeholders(step.get("description", ""))
        for texte in sous_entree.get("create_entry", {}).values():
            cles |= _placeholders(texte)
    for step in traductions.get("config", {}).get("step", {}).values():
        cles |= _placeholders(step.get("description", ""))
    return cles


def _cle_si_appel_avertissement(valeur: ast.AST) -> bool:
    return (
        isinstance(valeur, ast.Call)
        and isinstance(valeur.func, ast.Name)
        and valeur.func.id == "avertissement_entites_inconnues"
    )


def _cles_calculees_par_le_code() -> set[str]:
    """Les noms de placeholder assignes a partir d'un appel a
    `registre.avertissement_entites_inconnues` -- derive de l'AST, jamais
    tape en dur : peu importe la CLE choisie ou le NOMBRE de sites qui
    l'appellent (list_sections.py, objets.py, config_flow.py x2 aujourd'hui), ce
    test les retrouve tous. Couvre deux formes : l'affectation directe
    (`description_placeholders["x"] = avertissement_entites_inconnues(...)`,
    les quatre sites actuels) et l'entree d'un dict litteral dont la valeur
    est cet appel (au cas ou un site futur choisirait cette forme)."""
    cles: set[str] = set()
    for chemin in COMPOSANT_DIR.glob("*.py"):
        arbre = ast.parse(chemin.read_text(encoding="utf-8"))
        for noeud in ast.walk(arbre):
            if (
                isinstance(noeud, ast.Assign)
                and len(noeud.targets) == 1
                and isinstance(noeud.targets[0], ast.Subscript)
                and isinstance(noeud.targets[0].slice, ast.Constant)
                and isinstance(noeud.targets[0].slice.value, str)
                and _cle_si_appel_avertissement(noeud.value)
            ):
                cles.add(noeud.targets[0].slice.value)
            if isinstance(noeud, ast.Dict):
                for cle, valeur in zip(noeud.keys, noeud.values):
                    if (
                        isinstance(cle, ast.Constant)
                        and isinstance(cle.value, str)
                        and _cle_si_appel_avertissement(valeur)
                    ):
                        cles.add(cle.value)
    return cles


# ---------------------------------------------------------------------------
# 1. L'appariement -- le livrable principal de cette ronde.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("langue", ["fr", "en"])
def test_ce_que_le_code_calcule_est_visible_sur_un_ecran_atteignable(langue):
    """Mutation a rejouer (rapportee) : retirer `{entites_inconnues}` des
    descriptions de `<langue>.json` fait tomber CE test -- l'avertissement
    redeviendrait calcule sans qu'aucun ecran puisse le montrer, exactement
    le defaut C1."""
    traductions = json.loads((CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    visibles = _cles_dans_les_ecrans_visibles(traductions)
    calculees = _cles_calculees_par_le_code()
    assert calculees, "aucun site du code ne calcule plus l'avertissement d'entite inconnue"
    manquantes = calculees - visibles
    assert not manquantes, (
        f"{langue}: calcule par le code mais INVISIBLE sur tout ecran atteignable : {manquantes}"
    )


@pytest.mark.parametrize("langue", ["fr", "en"])
def test_ce_qui_est_visible_est_reellement_fourni_par_le_code(langue):
    """Le pendant : un placeholder que porterait une description SANS
    qu'aucun site ne le calcule resterait litteralement `{x}` a l'ecran, ou
    vide sans que personne n'ait choisi de le vider -- les deux moities de
    C1, apparieees dans les deux sens."""
    traductions = json.loads((CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    visibles = _cles_dans_les_ecrans_visibles(traductions)
    calculees = _cles_calculees_par_le_code()
    orphelines = visibles - calculees
    assert not orphelines, (
        f"{langue}: placeholder(s) affiche(s) qu'AUCUN site du code ne fournit : {orphelines}"
    )


# ---------------------------------------------------------------------------
# 2. Bout en bout -- un vrai flow HA, sur le squelette des sections « liste »
#    (list_sections.py), le chemin qui couvre le plus grand nombre de sites C1.
# ---------------------------------------------------------------------------


async def test_aucun_avertissement_visible_quand_toutes_les_entites_sont_connues(hass, entree):
    """Exigence 1 de C1, de bout en bout : rien a signaler, rien affiche --
    jusque sur l'ECRAN reellement atteint, pas seulement dans le dict brut
    (voir `test_registre.py` pour la version unitaire)."""
    hass.states.async_set("sensor.temp_salon", "20")
    hass.states.async_set("light.salon_connue", "on")
    subentry_id = await _creer_ecran(hass, entree, temperature="sensor.temp_salon")

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"libelle": "Lampe salon", "icone": "bulb", "entite": "light.salon_connue"},
    )

    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["step_id"] == "commandes"
    assert resultat["errors"] == {}
    assert resultat["description_placeholders"]["entites_inconnues"] == ""


async def test_avertissement_visible_sur_l_ecran_REELLEMENT_atteint_quand_une_entite_est_inconnue(
    hass, entree
):
    """Exigence 2 de C1 : l'avertissement doit etre VU la ou il est
    calcule. Verifie les DEUX bouts a la fois : le `FlowResult` que
    l'utilisateur recoit porte la phrase, ET le GABARIT du step qu'il
    montre reellement (`commandes`, translations/fr.json) porte bien le
    placeholder qui la recoit -- sans ce second controle, un avertissement
    calcule pour un step DIFFERENT de celui affiche passerait a tort."""
    hass.states.async_set("sensor.temp_salon", "20")
    subentry_id = await _creer_ecran(hass, entree, temperature="sensor.temp_salon")

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"libelle": "Lampe fantome", "icone": "bulb", "entite": "light.n_existe_pas"},
    )

    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["step_id"] == "commandes"
    assert resultat["errors"] == {}
    avertissement = resultat["description_placeholders"]["entites_inconnues"]
    assert avertissement != ""
    assert "light.n_existe_pas" in avertissement

    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    gabarit = fr["config_subentries"]["ecran"]["step"]["commandes"]["description"]
    assert "{entites_inconnues}" in gabarit, (
        "l'ecran REELLEMENT atteint (step_id='commandes') doit porter le placeholder"
    )


async def test_avertissement_visible_a_la_creation_via_create_entry(hass, entree):
    """Le troisieme landing site de C1 : la CREATION d'un ecran ne reaffiche
    aucun formulaire -- le flow se TERMINE (`CREATE_ENTRY`). Le seul ecran
    qui peut encore montrer l'avertissement est `create_entry.default`."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SUBENTRY_SCREEN), context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "temperature": "sensor.n_existe_pas_non_plus"})

    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat.get("errors", {}) == {}
    avertissement = resultat["description_placeholders"]["entites_inconnues"]
    assert "sensor.n_existe_pas_non_plus" in avertissement

    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    gabarit = fr["config_subentries"]["ecran"]["create_entry"]["default"]
    assert "{entites_inconnues}" in gabarit
