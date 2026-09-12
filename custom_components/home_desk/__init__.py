"""Tablettes murales — la configuration des ecrans vit ici, plus dans le bundle.

Ce composant ne cree AUCUNE entite. Il detient une configuration, la valide, et
la publie par websocket. C'est deliberé : une entite par ecran donnerait un etat
a synchroniser, un historique a purger et un registre a migrer, pour une donnee
qui change trois fois par an.

La configuration elle-meme est structuree en une entree unique « Tablettes
murales » (rien dedans) et N sous-entrees « ecran » (une par tablette, le
type `const.SOUS_ENTREE_ECRAN`) — voir `config_flow.py`. `async_setup_entry`
n'a donc rien a lire ici : les sous-entrees vivent sur `entry.subentries`,
disponibles directement par l'API `ConfigEntry` sans etape de chargement
supplementaire.

Tache 8 : le TRANSPORT. `async_setup_entry` enregistre les deux commandes
websocket (`websocket.py`) et pose un ECOUTEUR DE MISE A JOUR DE L'ENTREE
(`entry.add_update_listener`) qui emet `EVENEMENT_CHANGEMENT` -- jamais un
appel disperse dans une branche du flow, ce que le brief interdit
explicitement (« sinon une branche oubliee ne notifierait rien »). Cet
ecouteur est declenche par TOUTE ecriture qui passe par
`hass.config_entries.async_update_entry`/`async_update_subentry`/
`async_add_subentry` (verifie en lisant `config_entries.py` du conteneur :
les trois aboutissent a `_async_save_and_notify`, qui parcourt
`entry.update_listeners`) -- donc aussi bien la CREATION d'un ecran
(`EcranSubentryFlow.async_step_user`) que sa RECONFIGURATION
(`garde_ecran.persister_si_valide`, le site d'ecriture unique du paquet).
Il ne recoit que `(hass, entry)`, jamais la sous-entree modifiee : ce
module garde donc un instantane des `data` DEJA VUES par sous-entree pour
determiner LAQUELLE a change, et n'emettre QUE pour celle-la (les trois
tablettes ecoutent le meme bus, et deux d'entre elles n'ont aucune raison
de se recharger parce que la troisieme a change)."""
from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import websocket
from .const import DOMAIN, EVENEMENT_CHANGEMENT

__all__ = ["DOMAIN", "async_setup_entry", "async_unload_entry"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Enregistre le transport (les deux commandes websocket) et l'ecouteur
    qui emet `EVENEMENT_CHANGEMENT` a chaque ecriture d'une sous-entree."""
    websocket_api.async_register_command(hass, websocket.ws_ecran)
    websocket_api.async_register_command(hass, websocket.ws_ecrans)

    # L'instantane est capture ICI (a l'etat courant de `entry.subentries`),
    # jamais a `{}` : sans ce point de depart, la toute PREMIERE ecriture
    # suivant le demarrage de Home Assistant sur une sous-entree deja
    # existante et INCHANGEE (un simple redemarrage, par exemple un rechargement
    # d'une AUTRE sous-entree) serait vue a tort comme un changement.
    dernieres_donnees: dict[str, Any] = {
        sous_entree.subentry_id: sous_entree.data for sous_entree in entry.subentries.values()
    }

    async def _async_sur_mise_a_jour(hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Compare les `data` de chaque sous-entree a celles DEJA VUES ;
        emet `EVENEMENT_CHANGEMENT` avec le `nom` de celle qui differe.
        Necessaire (pas seulement suffisant) : comparer sur `nom` seul
        aurait manque un changement qui laisse le nom inchange (ajouter une
        tuile, par exemple)."""
        for sous_entree in entry.subentries.values():
            if dernieres_donnees.get(sous_entree.subentry_id) != sous_entree.data:
                dernieres_donnees[sous_entree.subentry_id] = sous_entree.data
                hass.bus.async_fire(
                    EVENEMENT_CHANGEMENT, {"nom": sous_entree.data.get("nom")}
                )

    entry.async_on_unload(entry.add_update_listener(_async_sur_mise_a_jour))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Decharge l'entree."""
    return True
