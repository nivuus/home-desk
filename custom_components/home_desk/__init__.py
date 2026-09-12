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
de se recharger parce que la troisieme a change).

Ronde 1 de relecture (Important) : le diff se fait dans LES DEUX SENS,
pas seulement `nouveau nom`. Le geste le plus ordinaire qui soit --
RENOMMER un ecran -- rendait orphelin le NOM PRECEDENT : l'evenement ne
portait que le nom APRES, donc une tablette qui affichait encore l'ANCIEN
nom n'entendait rien, et sa prochaine requete `home_desk/ecran` recevrait
`not_found` sans avoir jamais ete avertie de recharger. Une SUPPRESSION de
sous-entree souffrait du meme angle mort : elle disparait de
`entry.subentries`, donc la boucle qui ne visite QUE les sous-entrees
PRESENTES ne l'aurait jamais vue. `_async_sur_mise_a_jour` emet donc
l'ANCIEN nom pour toute sous-entree RENOMMEE (en plus du nouveau) ou
DISPARUE, et le NOUVEAU nom pour toute sous-entree creee ou modifiee."""
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
        """Compare les `data` de chaque sous-entree a celles DEJA VUES, DANS
        LES DEUX SENS -- ronde 1 de relecture (Important).

        Premiere passe : toute sous-entree VUE avant mais absente
        aujourd'hui a ete SUPPRIMEE -- emet son ANCIEN nom (elle a cesse
        d'etre servable, une tablette qui l'affichait doit l'apprendre) et
        oublie son instantane.

        Seconde passe : toute sous-entree dont les `data` DIFFERENT de
        l'instantane -- creation (rien vu avant) ou modification. Si son
        `nom` a change (un RENOMMAGE), l'ANCIEN nom est emis EN PLUS du
        nouveau : la tablette qui affichait l'ancien nom ne l'apprendrait
        sinon jamais (elle n'ecoute que ce nom-la). Comparer sur `data`
        entier, pas sur `nom` seul, reste necessaire par ailleurs : un
        changement qui laisse le nom inchange (ajouter une tuile, par
        exemple) doit aussi notifier."""
        ids_actuels = set(entry.subentries)
        for subentry_id in [i for i in dernieres_donnees if i not in ids_actuels]:
            donnees_disparues = dernieres_donnees.pop(subentry_id)
            nom_disparu = donnees_disparues.get("nom")
            if nom_disparu is not None:
                hass.bus.async_fire(EVENEMENT_CHANGEMENT, {"nom": nom_disparu})

        for sous_entree in entry.subentries.values():
            donnees_avant = dernieres_donnees.get(sous_entree.subentry_id)
            if donnees_avant == sous_entree.data:
                continue
            dernieres_donnees[sous_entree.subentry_id] = sous_entree.data
            nom_apres = sous_entree.data.get("nom")
            nom_avant = donnees_avant.get("nom") if donnees_avant is not None else None
            if nom_avant is not None and nom_avant != nom_apres:
                hass.bus.async_fire(EVENEMENT_CHANGEMENT, {"nom": nom_avant})
            hass.bus.async_fire(EVENEMENT_CHANGEMENT, {"nom": nom_apres})

    entry.async_on_unload(entry.add_update_listener(_async_sur_mise_a_jour))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Decharge l'entree."""
    return True
