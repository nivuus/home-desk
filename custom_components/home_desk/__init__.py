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
DISPARUE, et le NOUVEAU nom pour toute sous-entree creee ou modifiee.

Ronde 2 de relecture : la regle est SUPPRESSION et RENOMMAGE, PAS « tout
nom qui cesse d'etre servable » -- deux AUTRES gestes rendent aussi des
noms injoignables (retirer l'integration, decharger l'entree) et
n'emettent RIEN. Delibere, pas un troisieme angle mort : un DECHARGEMENT
passe aussi par `async_unload_entry` lors d'un simple RECHARGEMENT
(reglages modifies, redemarrage de Home Assistant) -- emettre
naivement a ce moment ferait tirer l'evenement a chaque redemarrage, pour
des ecrans qui n'ont pourtant pas change. `websocket._sous_entrees` degrade
deja proprement vers `[]` pour ce cas (deuxieme degradation de la spec,
voir websocket.py) : une tablette qui interroge apres coup recoit une
liste vide ou `not_found`, jamais un mur blanc -- mais elle ne le
DECOUVRE qu'en interrogeant, pas par un evenement pousse.

Ronde 2 de relecture (Mineur) : l'instantane porte desormais `(data,
titre)`, pas seulement `data` -- `titre` (`ConfigSubentry.title`) est un
champ de FIL depuis que `ws_ecrans` l'expose separement de `nom` (ronde 1),
et il est renommable INDEPENDAMMENT de `data` par le geste GENERIQUE de
Home Assistant. Sans ce second membre, renommer le SEUL titre (`data`
inchange) ne declenchait aucun evenement : une tablette affichait alors un
titre perime indefiniment, un ecart qui n'existait pas avant que `titre`
devienne un champ de fil."""
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
    #
    # Ronde 2 de relecture (Mineur) : le tuple `(data, titre)`, pas
    # seulement `data` -- voir la docstring de module.
    dernier_etat: dict[str, tuple[Any, str]] = {
        sous_entree.subentry_id: (sous_entree.data, sous_entree.title)
        for sous_entree in entry.subentries.values()
    }

    async def _async_sur_mise_a_jour(hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Compare `(data, titre)` de chaque sous-entree a l'etat DEJA VU,
        DANS LES DEUX SENS -- ronde 1 de relecture (Important).

        Premiere passe : toute sous-entree VUE avant mais absente
        aujourd'hui a ete SUPPRIMEE -- emet son ANCIEN nom (elle a cesse
        d'etre servable, une tablette qui l'affichait doit l'apprendre) et
        oublie son instantane (ronde 2 : sans ce `pop`, un nom mort
        reapparaitrait a CHAQUE ecriture suivante, pour toujours -- pas
        seulement une fuite memoire).

        Seconde passe : toute sous-entree dont `(data, titre)` DIFFERE de
        l'instantane -- creation (rien vu avant), modification de `data`,
        OU renommage du seul `titre` (ronde 2 : le geste GENERIQUE de Home
        Assistant, independant de `nom`). Si `nom` a change (un
        RENOMMAGE), l'ANCIEN nom est emis EN PLUS du nouveau : la tablette
        qui affichait l'ancien nom ne l'apprendrait sinon jamais (elle
        n'ecoute que ce nom-la). Comparer sur l'etat ENTIER, pas sur `nom`
        seul, reste necessaire par ailleurs : un changement qui laisse le
        nom inchange (ajouter une tuile, renommer le seul titre) doit
        aussi notifier."""
        ids_actuels = set(entry.subentries)
        for subentry_id in [i for i in dernier_etat if i not in ids_actuels]:
            donnees_disparues, _titre_disparu = dernier_etat.pop(subentry_id)
            nom_disparu = donnees_disparues.get("nom")
            if nom_disparu is not None:
                hass.bus.async_fire(EVENEMENT_CHANGEMENT, {"nom": nom_disparu})

        for sous_entree in entry.subentries.values():
            etat_avant = dernier_etat.get(sous_entree.subentry_id)
            etat_apres = (sous_entree.data, sous_entree.title)
            if etat_avant == etat_apres:
                continue
            dernier_etat[sous_entree.subentry_id] = etat_apres
            nom_apres = sous_entree.data.get("nom")
            nom_avant = etat_avant[0].get("nom") if etat_avant is not None else None
            if nom_avant is not None and nom_avant != nom_apres:
                hass.bus.async_fire(EVENEMENT_CHANGEMENT, {"nom": nom_avant})
            hass.bus.async_fire(EVENEMENT_CHANGEMENT, {"nom": nom_apres})

    entry.async_on_unload(entry.add_update_listener(_async_sur_mise_a_jour))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Decharge l'entree."""
    return True
