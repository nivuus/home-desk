"""Le transport : deux commandes websocket, et rien d'autre.

Ce module est ce qui fait qu'une tablette recoit enfin sa configuration --
les taches 1 a 7 n'ont livre que la SAISIE (l'integration, ses sections, sa
garde d'ecran valide). Deux commandes :

`home_desk/ecran` { "nom": "salon" } -> l'ecran RESOLU ET VALIDE, `version`
comprise. Refuse `ERREUR_ECRAN_INTROUVABLE` si aucune sous-entree ne porte
ce `nom` (un objet vide serait un ecran SANS TUILES, indistinguable d'une
absence pour l'application) ; refuse `ERREUR_VERSION_INCONNUE` si la
sous-entree stockee porte une `version` que ce composant ne reconnait pas
(quatrieme degradation, spec decision 10).

`home_desk/ecrans` -> [{ "nom": ..., "titre": ... }, ...], une par
sous-entree. N'EST PAS UN CONFORT : c'est ce que l'application affiche
quand `?ecran=` est absent ou inconnu, la PREMIERE des quatre degradations.
Sans elle, ce cas n'a d'autre issue qu'un mur blanc ou un ecran devine, et
les deux sont interdits -- elle ne revalide donc PAS chaque sous-entree
(une seule ecran corrompu ne doit jamais empecher les tablettes de choisir
parmi les autres).

Les deux commandes sont enregistrees par `__init__.async_setup_entry` ;
l'evenement `EVENEMENT_CHANGEMENT` est emis par un ECOUTEUR DE MISE A JOUR
DE L'ENTREE, pas par un appel depuis ce module -- voir `__init__.py`.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from . import schema
from .const import (
    DOMAIN,
    ERREUR_ECRAN_INTROUVABLE,
    ERREUR_VERSION_INCONNUE,
    VERSION_CONFIG,
    WS_ECRAN,
    WS_ECRANS,
)


class _VersionInconnue(Exception):
    """Levee par `_resoudre` quand la `version` stockee ne correspond pas a
    `VERSION_CONFIG` -- refus net, jamais une lecture a moitie."""


def _sous_entrees(hass: HomeAssistant) -> list[Any]:
    """Les sous-entrees « ecran » de l'unique entree « Tablettes murales ».
    `manifest.json` porte `single_config_entry: true` : il en existe au
    plus une, et cette commande n'est enregistree que depuis
    `async_setup_entry`, donc au moins une existe deja quand elle tourne."""
    entree = hass.config_entries.async_entries(DOMAIN)[0]
    return list(entree.subentries.values())


def _trouver(hass: HomeAssistant, nom: str) -> Any | None:
    """La sous-entree dont `data["nom"]` vaut `nom`, ou None."""
    for sous_entree in _sous_entrees(hass):
        if sous_entree.data.get("nom") == nom:
            return sous_entree
    return None


def _resoudre(sous_entree: Any) -> dict:
    """Rend l'ecran tel que l'application le recevra : valide, `version`
    comprise.

    VALIDE A LA LECTURE, et pas seulement a l'ecriture. Une sous-entree peut
    avoir ete ecrite par une version anterieure du schema, restauree depuis
    une sauvegarde HA, ou importee par `home_desk.importer` -- trois
    chemins qui ne passent pas par le formulaire. Servir sans revalider,
    c'est faire confiance a trois portes dont une seule est gardee.

    La `version` est verifiee EN PREMIER, et separement de
    `schema.valider()` : le contrat n'accepte que `VERSION_CONFIG` (via
    `schema._const(1)`), donc une version FUTURE y leverait de toute facon
    un `vol.Invalid` -- mais generique, sans le code `version_inconnue`
    distinct que la quatrieme degradation exige (spec, decision 10)."""
    if sous_entree.data.get("version") != VERSION_CONFIG:
        raise _VersionInconnue(sous_entree.data.get("version"))
    return schema.valider(dict(sous_entree.data))


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ECRAN,
        vol.Required("nom"): str,
    }
)
@callback
def ws_ecran(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """`home_desk/ecran` : l'ecran RESOLU ET VALIDE nomme `nom`."""
    sous_entree = _trouver(hass, msg["nom"])
    if sous_entree is None:
        connection.send_error(
            msg["id"],
            ERREUR_ECRAN_INTROUVABLE,
            f"aucun ecran nomme {msg['nom']!r} -- voir home_desk/ecrans pour "
            "la liste des ecrans configures, ou creez-le depuis Parametres > "
            "Appareils et services > Tablettes murales",
        )
        return
    try:
        ecran = _resoudre(sous_entree)
    except _VersionInconnue as err:
        connection.send_error(
            msg["id"],
            ERREUR_VERSION_INCONNUE,
            f"la sous-entree de {msg['nom']!r} porte la version {err.args[0]!r}, "
            "que ce composant ne reconnait pas -- mettez a jour l'integration "
            "home_desk avant de servir cet ecran",
        )
        return
    connection.send_result(msg["id"], ecran)


@websocket_api.websocket_command({vol.Required("type"): WS_ECRANS})
@callback
def ws_ecrans(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """`home_desk/ecrans` : la liste `[{"nom": ..., "titre": ...}, ...]` --
    la premiere des quatre degradations (voir la docstring de module),
    jamais revalidee ecran par ecran : un ecran corrompu ne doit pas priver
    les tablettes du choix des autres."""
    connection.send_result(
        msg["id"],
        [
            {"nom": sous_entree.data.get("nom"), "titre": sous_entree.title}
            for sous_entree in _sous_entrees(hass)
        ],
    )
