"""Les deux sections « liste » des minuteurs : `minuteurs` (les slots,
racine du contrat — `timer`/`nom` sont deux ENTITES, pas un libelle : `nom`
designe l'`input_text` qui porte le nom affiche, cf. `app/src/ecran.ts`,
piece cuisine) et `etiquettesMinuteur` (les etiquettes proposees, un tableau
de chaines LIBRES sans contrainte de longueur dans le contrat — contrairement
a `libelle`/`texte`/`nom` de source, une etiquette vide n'est PAS refusee ici :
le contrat ($defs racine, propriete `etiquettesMinuteur`) ne porte aucun
`minLength`, et en inventer un serait exactement la contrainte non tenue par
le contrat que ce chantier s'interdit (cf. brief, ronde 1 de relecture de la
tache 6 sur les listes blanches de domaines).

Separe de `listes_champs.py` a la tache 7, meme couture que
`listes_champs_sources.py` : « une section = un fichier », et les DEUX
sections d'ici partagent assez de details (les minuteurs) pour tenir
ensemble sous 500 lignes sans effort.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from . import schema
from .const import ACTION_ENREGISTRER
from .listes_communs import Section, _fusionner, _selecteur_entite, _selecteur_geste

# --------------------------------------------------------------------------
# `minuteurs` : slots de minuteur (timer + nom, deux entites ; note libre).
# --------------------------------------------------------------------------

CHAMPS_MINUTEUR_SLOT = frozenset({"timer", "nom", "note"})


def _schema_minuteur_slot(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {
        vol.Required("timer"): _selecteur_entite(),
        vol.Required("nom"): _selecteur_entite(),
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


def _construire_donnee_minuteur_slot(user_input: dict[str, Any], existant: dict | None) -> dict:
    donnee: dict[str, Any] = {"timer": user_input["timer"], "nom": user_input["nom"]}
    if user_input.get("note"):
        donnee["note"] = user_input["note"]
    return _fusionner(CHAMPS_MINUTEUR_SLOT, existant, donnee)


def _afficher_minuteur_slot(valeur: dict | None) -> dict:
    return dict(valeur) if valeur else {}


# --------------------------------------------------------------------------
# `etiquettesMinuteur` : un tableau de chaines libres, meme famille de forme
# que `ouvrants` (listes_champs.py) — un element SCALAIRE, pas un objet.
# --------------------------------------------------------------------------

def _schema_etiquette_minuteur(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {vol.Required("etiquette"): str}
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


def _construire_donnee_etiquette_minuteur(user_input: dict[str, Any], existant: Any) -> Any:
    return user_input.get("etiquette")


def _afficher_etiquette_minuteur(valeur: Any) -> dict:
    return {"etiquette": valeur} if valeur else {}


def _valider_etiquette_minuteur(valeur: Any) -> Any:
    """Le contrat ($defs racine, `etiquettesMinuteur.items`) ne porte que
    `"type": "string"` : PAS de `minLength`, contrairement a
    `libelle`/`texte`/`nom` — une chaine vide est donc VALIDE au sens du
    contrat, et ce module ne l'interdit pas (une etiquette vide n'a pas
    d'equivalent « bouton mort », elle n'ouvre rien et n'affiche rien de
    trompeur).

    `schema._chaine()` est le meme validateur FEUILLE que celui qui type
    chaque `note`/`etat` du miroir voluptuous ; applique ici DIRECTEMENT (un
    element scalaire, pas un objet imbrique), il leve avec un chemin VIDE en
    cas de faute — attribue ici, meme correction que `_valider_ouvrant`
    (listes_champs.py)."""
    try:
        return schema._chaine()(valeur)
    except vol.Invalid as err:
        if not err.path:
            raise type(err)(str(err), path=["etiquette"]) from err
        raise


SECTIONS: dict[str, Section] = {
    "minuteurs": Section(
        "minuteurs", lambda el: el["timer"], schema.MINUTEUR_SLOT, _schema_minuteur_slot,
        _construire_donnee_minuteur_slot, _afficher_minuteur_slot,
    ),
    "etiquettesMinuteur": Section(
        "etiquettesMinuteur", lambda el: el, _valider_etiquette_minuteur,
        _schema_etiquette_minuteur, _construire_donnee_etiquette_minuteur,
        _afficher_etiquette_minuteur,
    ),
}
