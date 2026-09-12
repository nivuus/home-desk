"""L'entree unique, l'identite de la sous-entree, et les traductions.

Un flow qui ne teste que son chemin heureux ne teste rien : le seul moment ou
un formulaire compte, c'est quand la saisie est mauvaise.

Le squelette des sections « liste » (tuiles de commande, rangee d'ambiance,
extras maison, ouvrants, ligne de synthese) est teste a part, dans
`test_config_flow_listes.py` — separe d'ici en ronde 1 de relecture pour
rester sous 500 lignes chacun, jamais a un compte de lignes arbitraire :
c'est la meme couture que `listes.py`/`listes_champs.py`.
"""
import ast
import json
import pathlib

import pytest
from homeassistant import config_entries, data_entry_flow

from conftest import IDENTITE_MINIMALE
from custom_components.home_desk.budget import BUDGET
from custom_components.home_desk.config_flow import EcranSubentryFlow
from custom_components.home_desk.const import (
    DOMAIN,
    ERREUR_BUDGET_INTENABLE,
    ERREUR_CHAMP_DOUBLON,
    ERREUR_CHAMP_FORMAT_INVALIDE,
    ERREUR_CHAMP_INCONNU,
    ERREUR_CHAMP_INVALIDE,
    ERREUR_CHAMP_REQUIS,
    ERREUR_CHAMP_TROP_COURT,
    ERREUR_CHAMP_TROP_D_ELEMENTS,
    ERREUR_CHAMP_TROP_PEU_D_ELEMENTS,
    ERREUR_CHAMP_TYPE_INVALIDE,
    ERREUR_CHAMP_VALEUR_FIGEE,
    ERREUR_CHAMP_VALEUR_NON_AUTORISEE,
    ERREUR_CHAMP_VIDE,
    ERREUR_HAUTEUR_HORS_BORNES,
    ERREUR_NOM_VIDE,
    ERREUR_SELECTION_MANQUANTE,
    ERREUR_SERVICE_INCOMPLET,
    SOUS_ENTREE_ECRAN,
    VERSION_CONFIG,
)
from custom_components.home_desk.listes import SectionsListeMixin
from custom_components.home_desk.listes_champs import SECTIONS
from custom_components.home_desk.schema import HAUTEUR_MAX, HAUTEUR_MIN
from homeassistant.config_entries import ConfigSubentryFlow

CHEMIN_TRADUCTIONS = (
    pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk" / "translations"
)


def _toutes_les_cles(donnee) -> set[str]:
    """La STRUCTURE d'un JSON de traductions : l'ensemble des chemins de
    cles, sans les valeurs (des chaines dans une langue different). Deux
    fichiers de MEME structure ont le meme ensemble ; un fichier vide, une
    cle renommee ou retiree d'un seul cote change ce que rend cette fonction
    d'un cote sans changer l'autre."""
    chemins: set[str] = set()

    def parcourir(noeud, prefixe: str) -> None:
        if isinstance(noeud, dict):
            for cle, valeur in noeud.items():
                chemins.add(f"{prefixe}/{cle}")
                parcourir(valeur, f"{prefixe}/{cle}")

    parcourir(donnee, "")
    return chemins


def _cles_attendues() -> set[str]:
    """Les cles de traduction qu'EXIGE LE CODE, derivees de `SECTIONS`
    (listes_champs.py) et de `const.py` — jamais une liste recopiee a la
    main. Corrige I5 (ronde 1 de relecture) : comparer fr a en (l'ancien
    test, garde plus bas) n'attrape qu'une DISSYMETRIE ; une perte SYMETRIQUE
    (tout un formulaire perd ses libelles dans LES DEUX langues a la fois)
    passait inapercue. Ce test-ci derive ce qui DOIT exister du CODE, donc
    tombe des qu'un champ existe dans le formulaire sans traduction, meme
    identique des deux cotes."""
    cles = {
        "/config/step/user/title",
        "/config/step/user/description",
        "/config_subentries/ecran/step/user/title",
        "/config_subentries/ecran/step/user/description",
        "/config_subentries/ecran/step/user/data/nom",
        "/config_subentries/ecran/step/user/data/hauteurUtile",
        "/config_subentries/ecran/step/user/data/temperature",
        "/config_subentries/ecran/step/user/data/note",
        "/config_subentries/ecran/step/reconfigure/title",
        f"/config_subentries/ecran/error/{ERREUR_HAUTEUR_HORS_BORNES}",
        f"/config_subentries/ecran/error/{ERREUR_BUDGET_INTENABLE}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_INVALIDE}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_REQUIS}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_FORMAT_INVALIDE}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_TYPE_INVALIDE}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_TROP_COURT}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_VALEUR_NON_AUTORISEE}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_VALEUR_FIGEE}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_TROP_PEU_D_ELEMENTS}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_TROP_D_ELEMENTS}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_DOUBLON}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_INCONNU}",
        f"/config_subentries/ecran/error/{ERREUR_CHAMP_VIDE}",
        f"/config_subentries/ecran/error/{ERREUR_NOM_VIDE}",
        f"/config_subentries/ecran/error/{ERREUR_SELECTION_MANQUANTE}",
        f"/config_subentries/ecran/error/{ERREUR_SERVICE_INCOMPLET}",
        "/selector/geste/options/enregistrer",
        "/selector/geste/options/monter",
        "/selector/geste/options/descendre",
        "/selector/geste/options/supprimer",
    }
    for cle in SECTIONS:
        cles.add(f"/config_subentries/ecran/step/reconfigure/menu_options/{cle}")
        cles.add(f"/config_subentries/ecran/step/{cle}/title")
        cles.add(f"/config_subentries/ecran/step/{cle}/data/choix")
        cles.add(f"/config_subentries/ecran/step/{cle}/data/nouveau")
        for champ in SECTIONS[cle].construire_schema(True).schema:
            cles.add(f"/config_subentries/ecran/step/{cle}_element/data/{champ}")
    return cles


# ---------------------------------------------------------------------------
# L'entree unique et l'identite de la sous-entree (tache 5, etendues tache 6)
# ---------------------------------------------------------------------------


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
    """LE test de la tache 5. Le formulaire refuse une hauteur ou l'ecran ne
    tient pas, et dit de combien — pas « valeur invalide »."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "hauteurUtile": 100})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["hauteurUtile"] == ERREUR_BUDGET_INTENABLE
    assert "336" in str(resultat["description_placeholders"]), (
        "le formulaire doit dire DE COMBIEN l'ecran deborde, pas seulement qu'il deborde")


async def test_une_hauteur_hors_bornes_est_refusee_a_la_saisie(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "hauteurUtile": 10000})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["hauteurUtile"] == ERREUR_HAUTEUR_HORS_BORNES
    placeholders = str(resultat["description_placeholders"])
    assert str(HAUTEUR_MIN) in placeholders and str(HAUTEUR_MAX) in placeholders


async def test_une_saisie_refusee_garde_le_nom_et_la_note(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {**IDENTITE_MINIMALE, "hauteurUtile": 100, "note": "Fire 7 au mur"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    marqueurs = {str(cle): cle for cle in resultat["data_schema"].schema}
    assert marqueurs["nom"].description == {"suggested_value": IDENTITE_MINIMALE["nom"]}
    assert marqueurs["note"].description == {"suggested_value": "Fire 7 au mur"}


async def test_un_ecran_valide_est_accepte_et_porte_sa_version(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "note": "Fire 7, mur du salon"})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat["data"]["version"] == VERSION_CONFIG
    assert resultat["data"]["note"] == "Fire 7, mur du salon"
    assert resultat["data"]["temperature"] == IDENTITE_MINIMALE["temperature"]
    assert resultat["title"] == IDENTITE_MINIMALE["nom"]


async def test_nom_vide_est_refuse_a_la_saisie(hass, entree):
    """Ronde 1 de relecture (Mineur -> corrige) : dette de la tache 5. `nom`
    vide (ou blanc) etait accepte et PERSISTE, alors que le contrat exige
    `minLength: 1`."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "nom": "   "})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["nom"] == ERREUR_NOM_VIDE


def test_ecransubentryflow_porte_le_mixin_EN_PREMIER_dans_son_mro():
    """Ronde 2 de relecture : la ronde 1 avait deja corrige l'ordre des
    bases (le mixin doit apparaitre AVANT ConfigSubentryFlow, convention
    Python pour pouvoir le surcharger via le MRO) mais sans le figer par un
    test — un renversement de cet ordre restait invisible tant qu'aucune des
    deux classes ne definit de nom en commun aujourd'hui, exactement le piege
    que la ronde 1 decrivait dans sa propre docstring (config_flow.py)."""
    mro = EcranSubentryFlow.__mro__
    assert mro.index(SectionsListeMixin) < mro.index(ConfigSubentryFlow)


async def test_hauteurUtile_est_preremplie_du_budget_par_defaut(hass, entree):
    """Ronde 2 de relecture : `hauteurUtile` reste `Required` dans
    SCHEMA_IDENTITE (ecart assume au contrat, ou elle est Optional) mais les
    trois ecrans reels (app/src/ecran.ts) ne la declarent JAMAIS. Le champ
    doit donc etre PRE-REMPLI avec `BUDGET["hauteurUtileParDefaut"]` (585,
    les Fire 7), lu depuis le contrat — jamais un 585 retape a la main qui
    pourrait diverger du budget en silence."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    marqueurs = {str(cle): cle for cle in flow["data_schema"].schema}
    assert marqueurs["hauteurUtile"].default() == BUDGET["hauteurUtileParDefaut"]


def test_hauteurUtile_par_defaut_vient_reellement_de_BUDGET(monkeypatch):
    """Ronde 3 de relecture (trou de couverture) : le test ci-dessus compare
    a `BUDGET[...]`, ce qui resterait VERT meme si 585 etait retape a la
    main dans config_flow.py (BUDGET vaut aussi 585 aujourd'hui — comparer
    des valeurs qui coincident ne prouve pas la PROVENANCE). `default=` est
    un callable qui relit BUDGET a chaque appel de `.default()` : changer
    BUDGET doit changer ce que le formulaire propose, sans recharger aucun
    module.

    Monkeypatche `config_flow.BUDGET` — le nom TEL QUE liE dans ce module
    (`from .budget import BUDGET`), pas `budget.BUDGET` directement : un
    autre test de la suite (`test_budget_lit_reellement_son_contrat_
    embarque`) recharge `budget.py`, ce qui cree un NOUVEAU dict et laisse
    la reference de config_flow.py pointer sur l'ANCIEN objet — muter le
    nouveau ne se verrait pas a travers le lambda de SCHEMA_IDENTITE."""
    from custom_components.home_desk import config_flow as _module_config_flow

    marqueurs = {str(cle): cle for cle in _module_config_flow.SCHEMA_IDENTITE.schema}
    monkeypatch.setitem(_module_config_flow.BUDGET, "hauteurUtileParDefaut", 12345)
    assert marqueurs["hauteurUtile"].default() == 12345


def test_temperature_n_impose_aucun_domaine():
    """Ronde 2 de relecture : `_DOMAINES_TEMPERATURE = ["sensor"]` n'etait
    tenu par aucun test — retire pour la meme raison que le domaine de
    $defs/bouton (listes_champs.py) : une contrainte non verifiee est une
    contrainte inventee, le contrat ($defs/entite) n'en pose aucune."""
    from custom_components.home_desk.config_flow import SCHEMA_IDENTITE
    marqueurs = {str(cle): sel for cle, sel in SCHEMA_IDENTITE.schema.items()}
    assert "domain" not in marqueurs["temperature"].config


async def test_note_vide_n_est_pas_persistee(hass, entree):
    """Ronde 1 : `note: ""` etait stocke tel quel la ou le contrat la veut
    ABSENTE (Optional, jamais une chaine vide)."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "note": ""})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert "note" not in resultat["data"]


# ---------------------------------------------------------------------------
# Traductions
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("langue", ["fr", "en"])
def test_les_traductions_nomment_le_debordement(langue):
    traductions = json.loads(
        (CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    phrase = traductions["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_BUDGET_INTENABLE]
    assert "{debordement}" in phrase


@pytest.mark.parametrize("langue", ["fr", "en"])
def test_le_champ_invalide_n_interpole_plus_de_motif(langue):
    """Ronde 4 de relecture : ce test affirmait l'INVERSE avant cette ronde
    (« {motif} DOIT etre dans la phrase ») — exactement la fuite que la
    ronde 4 corrige, clouee ici par le propre test qui la garantissait.
    `ERREUR_CHAMP_INVALIDE` ne reste que le REPLI d'un mot-cle imprevu
    (chaque mot-cle CONNU a desormais son propre code, `listes.
    _ERREUR_PAR_MOT_CLE`) : son message est STATIQUE, jamais un `{motif}`
    JSON Schema montre a un humain."""
    traductions = json.loads(
        (CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    phrase = traductions["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_CHAMP_INVALIDE]
    assert "{motif}" not in phrase


def test_fr_et_en_ont_la_meme_structure_de_traductions():
    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    en = json.loads((CHEMIN_TRADUCTIONS / "en.json").read_text(encoding="utf-8"))
    assert _toutes_les_cles(fr) == _toutes_les_cles(en)


@pytest.mark.parametrize("langue", ["fr", "en"])
def test_les_traductions_couvrent_toutes_les_cles_exigees_par_le_code(langue):
    """Ronde 1 de relecture (I5) : `test_fr_et_en_ont_la_meme_structure_de_
    traductions` attrape une DISSYMETRIE entre fr/en, jamais une perte
    SYMETRIQUE (tout le formulaire d'edition perdant ses libelles dans les
    DEUX langues a la fois, suite verte). Les cles attendues sont DERIVEES
    du code (`_cles_attendues`), jamais recopiees a la main."""
    traductions = json.loads(
        (CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    presentes = _toutes_les_cles(traductions)
    manquantes = _cles_attendues() - presentes
    assert not manquantes, f"{langue}: cles manquantes {sorted(manquantes)}"


def test_formulaire_est_le_seul_module_a_appeler_async_show_form_avec_un_data_schema():
    """Suggestion de la ronde 3 : la centralisation dans `formulaire.
    reafficher` rend une QUATRIEME reecriture a la main de l'idiome de
    reaffichage INUTILE (tache 7, minuteurs), pas IMPOSSIBLE ni DETECTEE.
    Sonde le code SOURCE des modules du composant, comme
    `test_schema_lit_reellement_son_contrat_embarque` sonde une lecture
    reelle plutot qu'une simple coincidence de valeurs : un futur appel
    direct a `async_show_form(..., data_schema=...)` hors de `formulaire.py`
    fait tomber ce test."""
    composant_dir = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"
    fautifs = []
    for chemin in composant_dir.glob("*.py"):
        if chemin.name == "formulaire.py":
            continue
        arbre = ast.parse(chemin.read_text(encoding="utf-8"))
        for noeud in ast.walk(arbre):
            if (
                isinstance(noeud, ast.Call)
                and isinstance(noeud.func, ast.Attribute)
                and noeud.func.attr == "async_show_form"
                and any(kw.arg == "data_schema" for kw in noeud.keywords)
            ):
                fautifs.append(chemin.name)
    assert not fautifs, f"async_show_form(data_schema=...) hors de formulaire.py : {fautifs}"
