"""Le transport : deux commandes websocket, et rien d'autre.

Ce module est ce qui fait qu'une tablette recoit enfin sa configuration --
les taches 1 a 7 n'ont livre que la SAISIE (l'integration, ses sections, sa
garde d'ecran valide). Deux commandes :

`home_desk/ecran` { "nom": "salon" } -> l'ecran RESOLU ET VALIDE, `version`
comprise. Refuse `ERREUR_ECRAN_INTROUVABLE` si aucune sous-entree ne porte
ce `nom` (un objet vide serait un ecran SANS TUILES, indistinguable d'une
absence pour l'application) ; refuse `ERREUR_VERSION_INCONNUE` si la
sous-entree stockee porte une `version` que ce composant ne reconnait pas
(quatrieme degradation, spec decision 10) ; refuse `ERREUR_ECRAN_CORROMPU`
si la version est connue mais que les DONNEES ne respectent plus le
contrat -- un code DISTINCT du precedent, et du `invalid_format` generique
que Home Assistant produit pour une requete CLIENTE mal formee (voir
ronde 1 de relecture, Critique + Point 4 : les deux partageaient le meme
code avant cette correction, rendant les deux fautes indiscernables pour
`app/src/`).

`home_desk/ecrans` -> [{ "nom": ..., "titre": ... }, ...], une par
sous-entree. N'EST PAS UN CONFORT : c'est ce que l'application affiche
quand `?ecran=` est absent ou inconnu, la PREMIERE des quatre degradations.
Sans elle, ce cas n'a d'autre issue qu'un mur blanc ou un ecran devine, et
les deux sont interdits -- elle ne revalide donc PAS chaque sous-entree
(une seule ecran corrompu ne doit jamais empecher les tablettes de choisir
parmi les autres). Rend aussi `[]` si l'integration n'a plus d'entree du
tout (DEUXIEME degradation nommee par la spec : HA joignable, aucun ecran
configure -- y compris juste apres le retrait de l'integration, puisque
rien ne desenregistre ces commandes a `async_unload_entry` : Home Assistant
n'offre pas de contraire a `async_register_command`).

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
    ERREUR_ECRAN_CORROMPU,
    ERREUR_ECRAN_INTROUVABLE,
    ERREUR_VERSION_INCONNUE,
    VERSION_CONFIG,
    WS_ECRAN,
    WS_ECRANS,
)


class _VersionInconnue(Exception):
    """Levee par `_resoudre` quand la `version` stockee ne correspond pas a
    `VERSION_CONFIG` -- refus net, jamais une lecture a moitie.

    `raison` distingue deux cas qui n'appellent PAS le meme geste (ronde 1
    de relecture, Mineur) : "absente" (aucune `version` du tout -- une
    config ANTERIEURE au suivi de version, qu'aucune version de ce
    composant n'a jamais ecrite ; « mettez a jour l'integration » y serait
    un geste inutile, l'integration etant deja plus recente que la donnee)
    contre "future" (une `version` PRESENTE mais differente de
    `VERSION_CONFIG` -- la seule qui appelle vraiment une mise a jour du
    composant)."""

    def __init__(self, version: Any, raison: str) -> None:
        super().__init__(version, raison)
        self.version = version
        self.raison = raison


class _EcranCorrompu(Exception):
    """Levee par `_resoudre` quand la `version` est CONNUE mais que
    `schema.valider()` refuse quand meme les donnees -- le troisieme
    chemin nomme par la docstring de `_resoudre` (sauvegarde restauree,
    import direct) rencontre pour de vrai, pas seulement en theorie."""

    def __init__(self, cause: vol.Invalid) -> None:
        super().__init__(str(cause))
        self.cause = cause


def _sous_entrees(hass: HomeAssistant) -> list[Any]:
    """Les sous-entrees « ecran » de l'entree « Tablettes murales », ou `[]`
    si elle n'existe plus (integration retiree apres coup : rien ne
    desenregistre ces commandes, `async_unload_entry` n'en a pas les
    moyens -- voir la docstring de module). Ronde 1 de relecture
    (Important) : la version precedente indexait `[0]` sans garde, une
    docstring affirmant l'impossibilite d'une liste vide -- affirmation
    fausse, mesuree : un `IndexError` non rattrape y crashait la commande
    (`unknown_error` cote client, trace complete cote serveur) exactement
    dans le cas que la DEUXIEME degradation (spec) doit couvrir."""
    entrees = hass.config_entries.async_entries(DOMAIN)
    if not entrees:
        return []
    return list(entrees[0].subentries.values())


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
    `schema._const`, couplee a cette meme constante), donc une version
    FUTURE y leverait de toute facon un `vol.Invalid` -- mais generique,
    sans le code `version_inconnue` distinct que la quatrieme degradation
    exige (spec, decision 10).

    Ronde 1 de relecture (Critique) : la premiere version de ce module
    laissait `schema.valider()` remonter son `vol.Invalid` NU jusqu'a la
    commande, ou il se confondait avec le `invalid_format` generique d'une
    requete CLIENTE mal formee (mesure cote a cote : meme code, meme
    grammaire de message pour "sources manquant dans la sous-entree" et
    "nom manquant dans le message websocket"). Rattrape ICI et relevee en
    `_EcranCorrompu`, pour que `ws_ecran` lui attribue un code DEDIE."""
    version = sous_entree.data.get("version")
    if version is None:
        raise _VersionInconnue(version, "absente")
    if version != VERSION_CONFIG:
        raise _VersionInconnue(version, "future")
    try:
        return schema.valider(dict(sous_entree.data))
    except vol.Invalid as err:
        raise _EcranCorrompu(err) from err


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
        if err.raison == "absente":
            message = (
                f"la sous-entree de {msg['nom']!r} ne porte aucune version -- "
                "elle est anterieure au suivi de version de ce composant et "
                "n'a jamais ete ecrite par lui. Recreez cet ecran depuis "
                "Parametres > Appareils et services > Tablettes murales"
            )
        else:
            message = (
                f"la sous-entree de {msg['nom']!r} porte la version "
                f"{err.version!r}, que ce composant ne reconnait pas -- "
                "mettez a jour l'integration home_desk avant de servir cet "
                "ecran"
            )
        connection.send_error(msg["id"], ERREUR_VERSION_INCONNUE, message)
        return
    except _EcranCorrompu as err:
        connection.send_error(
            msg["id"],
            ERREUR_ECRAN_CORROMPU,
            f"la configuration stockee de {msg['nom']!r} ne respecte plus le "
            f"contrat ({err.cause}) -- corrigez-la depuis Parametres > "
            "Appareils et services > Tablettes murales, ou restaurez une "
            "sauvegarde anterieure",
        )
        return
    connection.send_result(msg["id"], ecran)


@websocket_api.websocket_command({vol.Required("type"): WS_ECRANS})
@callback
def ws_ecrans(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """`home_desk/ecrans` : la liste `[{"nom": ..., "titre": ...}, ...]` --
    la premiere des quatre degradations (voir la docstring de module),
    jamais revalidee ecran par ecran : un ecran corrompu ne doit pas priver
    les tablettes du choix des autres. `nom` (donnee saisie) et `titre`
    (`ConfigSubentry.title`, une propriete HA generique, renommable
    independamment de `nom` par l'utilisateur depuis la page d'integration)
    sont deux champs distincts, meme s'ils sont maintenus synchronises par
    `config_flow.async_step_identite` -- rien n'empeche l'utilisateur de
    renommer le TITRE seul par le geste generique de Home Assistant."""
    connection.send_result(
        msg["id"],
        [
            {"nom": sous_entree.data.get("nom"), "titre": sous_entree.title}
            for sous_entree in _sous_entrees(hass)
        ],
    )
