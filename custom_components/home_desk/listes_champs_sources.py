"""La section « liste » `sources` ($defs/source du contrat) : un nom et six
jeux d'entites (titre, sousTitre, affiche, progression, transport, volume),
plus l'objet optionnel `allumee` (entite + etats). Separe de
`listes_champs.py` a la tache 7 pour la couture decrite dans son propre
module docstring (« une section = un fichier », suggeree par le brief).

**Repli assume, a dire dans le rapport plutot qu'a taire :** le brief
demande des sections REPLIABLES pour les six jeux d'entites d'une source.
`selector.EntitySelector(multiple=True)` existe bien dans cette version de
Home Assistant (verifie dans les sources du conteneur, `helpers/selector.py`
— `EntitySelectorConfig.multiple: bool`), mais l'API de flow de sous-entree
n'offre AUCUNE section repliable a l'interieur d'UN step (`data_schema` est
un formulaire plat, pas un accordeon) : le repli retenu est donc UNE etape
par source, ses six champs poses a plat comme des selecteurs d'entites
MULTIPLES — exactement le repli que le brief autorise explicitement.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from . import schema
from .const import ACTION_ENREGISTRER
from .listes_communs import ChampVide, Section, _fusionner, _selecteur_entite, _selecteur_entite_multiple, _selecteur_geste

CHAMPS_SOURCE = frozenset(
    {"nom", "titre", "sousTitre", "affiche", "progression", "transport", "volume", "allumee", "note"}
)

_CHAMPS_MULTI_ENTITES = ("titre", "sousTitre", "affiche", "progression", "transport", "volume")


class AllumeeIncomplete(Exception):
    """Le pendant de `listes_communs.ServiceIncomplet` pour la paire
    `allumee_entite`/`allumee_etats` : un seul des deux champs rempli serait
    abandonne en silence (ou pire, tronquerait `allumee` en un objet
    invalide au sens du contrat, `$defs/source.allumee` exigeant `entite` ET
    `etats`) sans cette garde. Exception DEDIEE plutot qu'une reutilisation
    de `ServiceIncomplet` : le message de ce dernier nomme explicitement
    « les deux champs du SERVICE » (`translations/*.json`,
    `service_incomplet`) — un mensonge s'il s'affichait ici, pour une paire
    qui n'a rien a voir avec un appel de service."""

    def __init__(self, champ_vide: str) -> None:
        self.champ_vide = champ_vide
        super().__init__(champ_vide)


def _schema_source(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {
        vol.Required("nom"): str,
        vol.Required("titre"): _selecteur_entite_multiple(),
        vol.Required("sousTitre"): _selecteur_entite_multiple(),
        vol.Required("affiche"): _selecteur_entite_multiple(),
        vol.Required("progression"): _selecteur_entite_multiple(),
        vol.Required("transport"): _selecteur_entite_multiple(),
        vol.Required("volume"): _selecteur_entite_multiple(),
        vol.Optional("allumee_entite"): _selecteur_entite(),
        vol.Optional("allumee_etats"): str,
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


def _construire_donnee_source(user_input: dict[str, Any], existant: dict | None) -> dict:
    """`allumee_etats` est saisi comme une liste separee par des virgules :
    le contrat n'a pas d'equivalent HA a nombre variable d'entrees pour un
    `list[str]` court, et la ligne de synthese (`schema.py`, `_ALLUMEE`)
    n'impose aucune contrainte de format sur chaque etat au-dela d'etre une
    chaine — un champ texte unique, decoupe sur la virgule, ne perd donc
    aucune expressivite du contrat."""
    if not (user_input.get("nom") or "").strip():
        raise ChampVide("nom")
    donnee: dict[str, Any] = {"nom": user_input["nom"]}
    for champ in _CHAMPS_MULTI_ENTITES:
        donnee[champ] = list(user_input.get(champ) or [])
    entite = (user_input.get("allumee_entite") or "").strip()
    etats_bruts = (user_input.get("allumee_etats") or "").strip()
    if entite and etats_bruts:
        donnee["allumee"] = {
            "entite": entite,
            "etats": [e.strip() for e in etats_bruts.split(",") if e.strip()],
        }
    elif entite or etats_bruts:
        raise AllumeeIncomplete("allumee_etats" if entite else "allumee_entite")
    if user_input.get("note"):
        donnee["note"] = user_input["note"]
    return _fusionner(CHAMPS_SOURCE, existant, donnee)


def _afficher_source(valeur: dict | None) -> dict:
    if not valeur:
        return {}
    affichage = dict(valeur)
    allumee = affichage.pop("allumee", None)
    if allumee:
        affichage["allumee_entite"] = allumee.get("entite")
        affichage["allumee_etats"] = ", ".join(allumee.get("etats", []))
    return affichage


SECTIONS: dict[str, Section] = {
    "sources": Section(
        "sources", lambda el: el["nom"], schema.SOURCE, _schema_source,
        _construire_donnee_source, _afficher_source,
    ),
}
