"""Le CATALOGUE des sections « liste » de la famille $defs/bouton,
$defs/synthese et ouvrants (scalaire) : leurs champs, leurs selecteurs, la
construction et l'affichage d'un element. `listes.py` porte le SQUELETTE
(choisir/ajouter/modifier/monter/descendre/supprimer), identique pour les
huit sections ; ce module porte ce qui DIFFERE pour CETTE famille —
exactement la couture que la tache 6 decrit (« elles different par leurs
champs, pas par leur forme »).

Ce module reste la SEULE adresse canonique de `SECTIONS` (ronde 2 de
relecture, tache 6) : `listes_champs_sources.py` et
`listes_champs_minuteurs.py` (tache 7, sources media / minuteurs /
etiquettes de minuteur) portent chacun LEUR famille de sections, mais leurs
dictionnaires sont fusionnes ICI dans `SECTIONS` — jamais consommes
directement par `listes.py` ou `config_flow.py`, qui continuent de
n'importer QUE `listes_champs.SECTIONS`. Les primitives VRAIMENT partagees
entre les trois modules (`_selecteur_entite`, `_selecteur_geste`,
`_fusionner`, `ChampVide`, `ServiceIncomplet`, `Section`) ont ete extraites
dans `listes_communs.py` a la meme occasion : sans ce partage, les avoir
recopiees aurait ete la divergence silencieuse que ce chantier s'interdit
partout ailleurs (schema.py, budget.py).

Ronde 1 de relecture (re-export) : `CHEMIN_ICONES`/`_ICONES_OPTIONS`/
`_selecteur_icone`, eux, vivent directement ICI — jamais dans
`listes_communs.py` — puisque ce module en est le SEUL consommateur (le
vocabulaire d'icones ne sert qu'a $defs/bouton). Un re-export depuis
`listes_communs.py` n'aurait servi qu'a ne rien casser au premier
deplacement, exactement l'anti-motif que la tache 6 avait deja corrige pour
`SECTIONS`.
"""
from __future__ import annotations

import json
import pathlib
from typing import Any

import voluptuous as vol

from homeassistant.helpers import selector

from . import schema
from .const import ACTION_ENREGISTRER
from .listes_communs import (
    ChampVide,
    Section,
    ServiceIncomplet,
    _fusionner,
    _selecteur_entite,
    _selecteur_geste,
)
from .listes_champs_minuteurs import SECTIONS as _SECTIONS_MINUTEURS
from .listes_champs_sources import SECTIONS as _SECTIONS_SOURCES

__all__ = ["SECTIONS", "Section", "ChampVide", "ServiceIncomplet"]

# Le vocabulaire d'icones vient de contrat/icones.json, JAMAIS retape a la
# main. Ronde 1 de relecture : ramene ici depuis `listes_communs.py`, dont
# c'etait le seul consommateur (voir la docstring de module ci-dessus).
CHEMIN_ICONES = pathlib.Path(__file__).parent / "contrat" / "icones.json"
_ICONES_OPTIONS: list[str] = json.loads(CHEMIN_ICONES.read_text(encoding="utf-8"))["icones"]


def _selecteur_icone() -> selector.SelectSelector:
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=list(_ICONES_OPTIONS), mode=selector.SelectSelectorMode.DROPDOWN
        )
    )

# --------------------------------------------------------------------------
# $defs/bouton (commandes, ambiances, extrasMaison) : DIX proprietes dans le
# contrat, dix dans ce formulaire — plus aucun champ que ce formulaire
# ignorerait. `service` (paire de deux chaines) n'a pas d'equivalent HA a
# deux valeurs : deux champs texte separes (`service_domaine`/
# `service_action`), recomposes en tableau par `_construire_donnee_bouton`
# et decomposes pour l'affichage par `_afficher_bouton`. `vue` garde son
# `str` large ici : son motif `^#` est CELUI de `schema.BOUTON`
# (`_VUE_PATTERN`), rejoue a la validation — jamais retape ici.
# --------------------------------------------------------------------------

CHAMPS_BOUTON = frozenset(
    {
        "libelle", "icone", "entite", "cible", "service", "lien", "vue",
        "epingle", "absenceNommee", "note",
    }
)

_CHAMPS_TEXTE_BOUTON = ("libelle", "icone", "entite", "cible", "lien", "vue", "absenceNommee", "note")


def _schema_bouton(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {
        vol.Required("libelle"): str,
        vol.Required("icone"): _selecteur_icone(),
        vol.Required("entite"): _selecteur_entite(),
        vol.Optional("cible"): _selecteur_entite(),
        vol.Optional("service_domaine"): str,
        vol.Optional("service_action"): str,
        vol.Optional("lien"): str,
        vol.Optional("vue"): str,
        vol.Optional("epingle", default=False): selector.BooleanSelector(),
        vol.Optional("absenceNommee"): str,
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


def _construire_donnee_bouton(user_input: dict[str, Any], existant: dict | None) -> dict:
    """Ronde 2 de relecture (tache 6) : `service_domaine`/`service_action`,
    une paire a demi remplie, levait en silence auparavant. Refuse desormais
    via `ServiceIncomplet(champ_vide)`.

    Ronde 4 : `libelle` vide ou compose uniquement d'espaces leve desormais
    `ChampVide("libelle")`, meme doctrine que `nom`."""
    if not (user_input.get("libelle") or "").strip():
        raise ChampVide("libelle")
    donnee: dict[str, Any] = {}
    for champ in _CHAMPS_TEXTE_BOUTON:
        valeur = user_input.get(champ)
        if valeur not in (None, ""):
            donnee[champ] = valeur
    if user_input.get("epingle") is True:
        donnee["epingle"] = True
    domaine = (user_input.get("service_domaine") or "").strip()
    action = (user_input.get("service_action") or "").strip()
    if domaine and not action:
        raise ServiceIncomplet("service_action")
    if action and not domaine:
        raise ServiceIncomplet("service_domaine")
    if domaine and action:
        donnee["service"] = [domaine, action]
    return _fusionner(CHAMPS_BOUTON, existant, donnee)


def _afficher_bouton(valeur: dict | None) -> dict:
    """L'inverse de `_construire_donnee_bouton` pour `service` : un tableau
    stocke `["light", "turn_on"]` redevient les deux champs texte du
    formulaire."""
    if not valeur:
        return {}
    affichage = dict(valeur)
    service = affichage.pop("service", None)
    if service:
        affichage["service_domaine"], affichage["service_action"] = service[0], service[1]
    return affichage


# --------------------------------------------------------------------------
# $defs/synthese (ligne de synthese) : HUIT proprietes dans le contrat, huit
# dans ce formulaire.
# --------------------------------------------------------------------------

CHAMPS_SYNTHESE = frozenset(
    {"entite", "texte", "operateur", "valeur", "perso", "horsTaches", "absenceNommee", "note"}
)

_CHAMPS_TEXTE_SYNTHESE = ("entite", "texte", "operateur", "absenceNommee", "note")


def _schema_synthese(editable: bool) -> vol.Schema:
    """`valeur` reste un CHAMP TEXTE UNIQUE : `<`/`>` exigent un nombre,
    `==`/`!=` acceptent aussi une chaine — l'union discriminee par
    `operateur` que `_construire_donnee_synthese`/`schema.SYNTHESE`
    tranchent ensemble (conversion puis validation)."""
    champs: dict[Any, Any] = {
        vol.Required("entite"): _selecteur_entite(),
        vol.Required("texte"): str,
        vol.Required("operateur"): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.OPERATEURS), mode=selector.SelectSelectorMode.DROPDOWN
            )
        ),
        vol.Required("valeur"): str,
        vol.Optional("perso", default=False): selector.BooleanSelector(),
        vol.Optional("horsTaches", default=False): selector.BooleanSelector(),
        vol.Optional("absenceNommee"): str,
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


def _convertir_valeur(brut: str) -> Any:
    """Une saisie numerique (`"35"`, `"-2.5"`) devient un nombre ; le reste
    reste une chaine. `int` avant `float`."""
    try:
        return int(brut)
    except ValueError:
        pass
    try:
        return float(brut)
    except ValueError:
        return brut


def _construire_donnee_synthese(user_input: dict[str, Any], existant: dict | None) -> dict:
    """Ronde 4 de relecture (mineur) : `texte` vide ou compose uniquement
    d'espaces leve `ChampVide("texte")`."""
    if not (user_input.get("texte") or "").strip():
        raise ChampVide("texte")
    donnee: dict[str, Any] = {}
    for champ in _CHAMPS_TEXTE_SYNTHESE:
        valeur = user_input.get(champ)
        if valeur not in (None, ""):
            donnee[champ] = valeur
    valeur_brute = user_input.get("valeur")
    if valeur_brute not in (None, ""):
        donnee["valeur"] = _convertir_valeur(valeur_brute)
    if user_input.get("perso") is True:
        donnee["perso"] = True
    if user_input.get("horsTaches") is True:
        donnee["horsTaches"] = True
    return _fusionner(CHAMPS_SYNTHESE, existant, donnee)


def _afficher_synthese(valeur: dict | None) -> dict:
    """`valeur` est STOCKEE comme un NOMBRE (int/float) des que
    `_convertir_valeur` a reussi, mais `_schema_synthese` declare ce champ
    `str` — reproposer le nombre TEL QUEL romprait l'accord entre les deux
    (voir le rapport de tache 6, ronde 4)."""
    if not valeur:
        return {}
    affichage = dict(valeur)
    if "valeur" in affichage:
        affichage["valeur"] = str(affichage["valeur"])
    return affichage


# --------------------------------------------------------------------------
# `ouvrants` (racine du contrat) : un tableau d'`entite`, pas de `bouton` —
# la section « liste plus simple, sans formulaire de tuile ». Un element est
# une chaine, pas un dict.
# --------------------------------------------------------------------------

def _schema_ouvrant(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {vol.Required("entite"): _selecteur_entite()}
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


def _construire_donnee_ouvrant(user_input: dict[str, Any], existant: Any) -> Any:
    return user_input.get("entite")


def _afficher_ouvrant(valeur: Any) -> dict:
    return {"entite": valeur} if valeur else {}


def _valider_ouvrant(valeur: Any) -> Any:
    """`schema.ENTITE` est un validateur FEUILLE : une entite invalide leve
    avec un chemin VIDE — on attribue nous-memes ce chemin plutot que de
    laisser `_async_step_section_element` retomber sur "base"."""
    try:
        return schema.ENTITE(valeur)
    except vol.Invalid as err:
        if not err.path:
            raise type(err)(str(err), path=["entite"]) from err
        raise


# Le squelette (listes.py) est reutilise HUIT fois depuis la tache 7 : les
# tuiles de commande, la rangee d'ambiance et les extras maison partagent
# litteralement la meme forme ($defs/bouton), seule la cle de donnee change.
# La ligne de synthese differe par ses champs ($defs/synthese), les
# ouvrants par leur FORME (un scalaire, pas un objet) — les sources, les
# slots de minuteur et les etiquettes de minuteur (listes_champs_sources.py,
# listes_champs_minuteurs.py) different de la meme facon, jamais par le
# parcours choisir/ajouter/modifier/monter/descendre/supprimer.
SECTIONS: dict[str, Section] = {
    "commandes": Section(
        "commandes", lambda el: el["libelle"], schema.BOUTON, _schema_bouton,
        _construire_donnee_bouton, _afficher_bouton,
    ),
    "ambiances": Section(
        "ambiances", lambda el: el["libelle"], schema.BOUTON, _schema_bouton,
        _construire_donnee_bouton, _afficher_bouton,
    ),
    "extrasMaison": Section(
        "extrasMaison", lambda el: el["libelle"], schema.BOUTON, _schema_bouton,
        _construire_donnee_bouton, _afficher_bouton,
    ),
    "ouvrants": Section(
        "ouvrants", lambda el: el, _valider_ouvrant, _schema_ouvrant,
        _construire_donnee_ouvrant, _afficher_ouvrant,
    ),
    "synthese": Section(
        "synthese", lambda el: el["texte"], schema.SYNTHESE, _schema_synthese,
        _construire_donnee_synthese, _afficher_synthese,
    ),
    **_SECTIONS_SOURCES,
    **_SECTIONS_MINUTEURS,
}
