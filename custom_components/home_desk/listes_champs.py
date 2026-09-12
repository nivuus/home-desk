"""Le CATALOGUE des sections « liste » : leurs champs, leurs selecteurs, la
construction et l'affichage d'un element. `listes.py` porte le SQUELETTE
(choisir/ajouter/modifier/monter/descendre/supprimer), identique pour les
cinq sections ; ce module porte ce qui DIFFERE — exactement la couture que
la tache 6 decrit (« elles different par leurs champs, pas par leur forme »).
Separe de `listes.py` en ronde 1 de relecture pour rester sous 500 lignes,
jamais a un compte de lignes arbitraire.
"""
from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass
from typing import Any, Callable

import voluptuous as vol

from homeassistant.helpers import selector

from . import schema
from .const import ACTION_DESCENDRE, ACTION_ENREGISTRER, ACTION_MONTER, ACTION_SUPPRIMER

# Le vocabulaire d'icones vient de contrat/icones.json, JAMAIS retape a la
# main : une seconde copie divergerait en silence de celle deja generee dans
# ecran.schema.json (et lue par schema.py) — exactement ce que la relecture
# du plan 1 avait deja corrige en generant l'enum du schema depuis ce
# fichier. Meme regle d'emplacement que schema.py/budget.py (decision de la
# tache 3) : relatif au module, jamais "../../contrat".
CHEMIN_ICONES = pathlib.Path(__file__).parent / "contrat" / "icones.json"
_ICONES_OPTIONS: list[str] = json.loads(CHEMIN_ICONES.read_text(encoding="utf-8"))["icones"]

# $defs/bouton (tuiles de commande, rangee d'ambiance, extras maison) :
# AUCUNE restriction de domaine — corrige apres verification directe sur les
# trois ecrans reels (app/src/ecran.ts). Une premiere version restreignait
# "entite"/"cible" a light/cover/lock/switch ; l'inventaire REEL des trois
# ecrans dement ce choix : `commandes` porte aussi binary_sensor, climate,
# fan, sensor, todo (ex. `climate.radiateur`, un chauffage) ; `ambiances`
# porte fan et vacuum ; `extrasMaison` ne porte QUE du sensor (le Scanner,
# `sensor.home_stock_next_meal`) — aucun n'aurait ete saisissable derriere
# cette liste. Le contrat lui-meme ($defs/entite) ne restreint aucun domaine
# (un motif d'entity_id generique) : une liste blanche ici aurait ete une
# contrainte INVENTEE, pas une regle du contrat — et une contrainte inventee
# qui rend des ecrans REELS non reproductibles rate exactement le but de
# cette tache (migrer les trois ecrans hors du depot).
# $defs/synthese (ligne de synthese) : ce qu'une synthese resume est un ETAT
# a lire, jamais un service a appeler — verifie de la meme facon sur les
# trois ecrans reels (binary_sensor, cover, lock, sensor, todo).
_DOMAINES_SYNTHESE = ["sensor", "binary_sensor", "todo", "lock", "cover"]
# `ouvrants` (racine du contrat) : verifie sur les trois ecrans reels
# (app/src/ecran.ts, ex. `binary_sensor.porte_balcon_s_ouverture`) — toujours
# un capteur binaire d'ouverture, jamais un `cover`.
_DOMAINES_OUVRANT = ["binary_sensor"]

_ACTIONS_EDITION = [ACTION_ENREGISTRER, ACTION_MONTER, ACTION_DESCENDRE, ACTION_SUPPRIMER]


def _selecteur_icone() -> selector.SelectSelector:
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=list(_ICONES_OPTIONS), mode=selector.SelectSelectorMode.DROPDOWN
        )
    )


def _selecteur_entite(domaines: list[str] | None = None) -> selector.EntitySelector:
    """`domaines=None` (bouton) : aucune restriction, voir la note ci-dessus.
    Un domaine fourni (synthese, ouvrants) reste une vraie contrainte,
    verifiee sur les trois ecrans reels — jamais une liste ecrite au
    jugement."""
    config: dict[str, Any] = {}
    if domaines:
        config["domain"] = domaines
    return selector.EntitySelector(selector.EntitySelectorConfig(**config))


def _selecteur_geste() -> selector.SelectSelector:
    """Les quatre gestes sont des valeurs FIXES (jamais dynamiques comme les
    options de `element`, listes.py) : `translation_key` s'y applique
    proprement, la meme mecanique que `derivative` utilise pour `time_unit`
    (`homeassistant/components/derivative/config_flow.py` +
    `strings.json` -> `selector.time_unit.options`)."""
    return selector.SelectSelector(
        selector.SelectSelectorConfig(options=list(_ACTIONS_EDITION), translation_key="geste")
    )


def _fusionner(champs_contrat: frozenset[str], existant: dict | None, donnee: dict) -> dict:
    """Corrige le Critique de la ronde 1 : un `enregistrer` qui ecrivait
    `elements[index] = valide` remplacait l'element ENTIER par le seul
    resultat valide du formulaire — une tuile portant `service`, `vue`,
    `epingle`, `absenceNommee` ou `lien`, editee pour son seul `libelle`,
    perdait les cinq autres en silence (voir le rapport de tache 6, ronde 1,
    et le test qui tient desormais cette regle).

    Ne remplace un element existant qu'avec les champs que CE formulaire
    gere (`donnee`) ; tout champ du contrat que l'existant portait et que ce
    formulaire ne gere PAS encore (`champs_contrat` en exclut le complement)
    survit intact. Aujourd'hui `champs_contrat` couvre l'integralite de
    $defs/bouton ou $defs/synthese (les cinq champs manquants ont rejoint le
    formulaire dans la meme ronde) : cette branche est une defense pour un
    champ futur, jamais active en pratique — c'est `donnee`, deja filtree
    par le formulaire, qui porte l'essentiel du resultat."""
    fusion = {k: v for k, v in (existant or {}).items() if k not in champs_contrat}
    fusion.update(donnee)
    return fusion


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
    donnee: dict[str, Any] = {}
    for champ in _CHAMPS_TEXTE_BOUTON:
        valeur = user_input.get(champ)
        if valeur not in (None, ""):
            donnee[champ] = valeur
    if user_input.get("epingle") is True:
        donnee["epingle"] = True
    domaine = (user_input.get("service_domaine") or "").strip()
    action = (user_input.get("service_action") or "").strip()
    if domaine and action:
        donnee["service"] = [domaine, action]
    return _fusionner(CHAMPS_BOUTON, existant, donnee)


def _afficher_bouton(valeur: dict | None) -> dict:
    """L'inverse de `_construire_donnee_bouton` pour `service` : un tableau
    stocke `["light", "turn_on"]` redevient les deux champs texte du
    formulaire, faute de quoi une tuile existante reeditee perdrait
    l'affichage (pas la donnee — `_fusionner` la garde) de son service."""
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
    `operateur` que `_construire_donnee_synthese`/`schema.SYNTHESE` tranchent
    ensemble (conversion puis validation), apres avoir tente de convertir une
    saisie numerique (`_convertir_valeur`). Sans cette conversion, un champ
    texte unique laisserait passer `{operateur: "<", valeur: "35"}` (une
    CHAINE) au refus du schema — exactement le cas que porte le corpus
    partage (`contrat/cas-schema.json`, rejoue par
    `tests/composant/test_schema.py`). La conversion rend `<`/`>` utilisables
    sans champ dedie ; le refus, lui, reste entier pour une valeur vraiment
    incompatible (`<` avec "chaud") — nomme par `motif()`, jamais un
    « valeur invalide » muet."""
    champs: dict[Any, Any] = {
        vol.Required("entite"): _selecteur_entite(_DOMAINES_SYNTHESE),
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
    reste une chaine. `int` avant `float` : `schema.SYNTHESE` ne distingue
    pas les deux (`isinstance(valeur, (int, float))`), mais garder l'entier
    entier evite d'ecrire `35.0` pour un seuil que l'utilisateur a tape
    `35` — clouee par `test_convertir_valeur_garde_un_entier_entier`
    (ronde 1 : mutation verte au premier passage, aucun test ne l'exercait)."""
    try:
        return int(brut)
    except ValueError:
        pass
    try:
        return float(brut)
    except ValueError:
        return brut


def _construire_donnee_synthese(user_input: dict[str, Any], existant: dict | None) -> dict:
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


def _afficher_tel_quel(valeur: dict | None) -> dict:
    return dict(valeur) if valeur else {}


# --------------------------------------------------------------------------
# `ouvrants` (racine du contrat) : un tableau d'`entite`, pas de `bouton` —
# la section « liste plus simple, sans formulaire de tuile » demandee en
# ronde 1. Un element est une chaine, pas un dict : `construire_donnee`/
# `afficher` emballent/deballent en consequence ; la fusion de champs ne
# s'y applique pas (un seul champ, remplace en bloc).
# --------------------------------------------------------------------------

def _schema_ouvrant(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {vol.Required("entite"): _selecteur_entite(_DOMAINES_OUVRANT)}
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


def _construire_donnee_ouvrant(user_input: dict[str, Any], existant: Any) -> Any:
    return user_input.get("entite")


def _afficher_ouvrant(valeur: Any) -> dict:
    return {"entite": valeur} if valeur else {}


@dataclass(frozen=True)
class Section:
    """Ce que `listes.SectionsListeMixin` a besoin de savoir sur une
    section, et RIEN de plus : comment afficher un element dans le choix
    (`libelle`), le valider (`valider`), construire son formulaire
    (`construire_schema`), fabriquer la donnee a valider a partir de la
    saisie (`construire_donnee`), et fabriquer les valeurs suggerees a
    partir de la donnee stockee (`afficher`)."""

    cle: str
    libelle: Callable[[Any], str]
    valider: Callable[[Any], Any]
    construire_schema: Callable[[bool], vol.Schema]
    construire_donnee: Callable[[dict, Any], Any]
    afficher: Callable[[Any], dict]


# Le squelette (listes.py) est reutilise CINQ fois : les tuiles de commande,
# la rangee d'ambiance et les extras maison partagent litteralement la meme
# forme ($defs/bouton), seule la cle de donnee change. La ligne de synthese
# differe par ses champs ($defs/synthese), les ouvrants par leur FORME (un
# scalaire, pas un objet) — mais jamais par le parcours choisir/ajouter/
# modifier/monter/descendre/supprimer.
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
        "ouvrants", lambda el: el, schema.ENTITE, _schema_ouvrant,
        _construire_donnee_ouvrant, _afficher_ouvrant,
    ),
    "synthese": Section(
        "synthese", lambda el: el["texte"], schema.SYNTHESE, _schema_synthese,
        _construire_donnee_synthese, _afficher_tel_quel,
    ),
}
