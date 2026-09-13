"""Lecture du registre d'entites de Home Assistant.

Decision 7 de la spec : une entite inconnue du registre donne un
AVERTISSEMENT, jamais un refus -- elle peut arriver plus tard (une ampoule
pas encore appairee, un capteur dont l'integration n'est pas encore
chargee). Refuser interdirait de preparer un ecran avant que son materiel
existe ; ne rien dire laisse une faute de frappe produire une tuile morte
que personne ne relie jamais a sa cause.

Module a part, et pas une fonction de plus dans `config_flow.py` : c'est la
SEULE dependance de ce composant au registre d'entites, et `config_flow.py`
plafonne a 500 lignes.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from . import schema


def entites_inconnues(hass: HomeAssistant, entites: list[str]) -> list[str]:
    """Celles des `entites` qu'aucune entree du registre ne porte.

    L'ordre d'entree est preserve : le message d'avertissement les cite dans
    l'ordre ou l'utilisateur les a saisies, jamais dans un ordre de hachage
    qui changerait d'une saisie a l'autre.

    Une entite peut exister dans l'ETAT sans etre au registre (un
    `input_*` cree en YAML, un template). On interroge donc AUSSI
    `hass.states` : avertir sur une entite qui repond deja serait un
    avertissement faux, et un avertissement faux se fait ignorer, ce qui tue
    aussi les vrais.
    """
    registre = er.async_get(hass)
    return [
        e for e in entites
        if registre.async_get(e) is None and hass.states.get(e) is None
    ]


def entites_dans(valeur: Any) -> list[str]:
    """Toutes les chaines de `valeur` qui ONT LA FORME d'un entity_id
    (`schema.ENTITE`), recursivement au travers des dicts et des listes.

    Generique aux HUIT formes de section « liste » (`entite`/`cible` d'une
    tuile, les six listes de `sources`, `timer`/`nom` d'un slot de
    minuteur...) : une liste de CHAMPS recopiee a la main aurait du suivre
    chaque nouvelle forme de section, exactement la divergence que ce
    chantier s'interdit ailleurs (schema.py, budget.py). Reutilise
    `schema.ENTITE`, la MEME forme que le contrat valide deja -- jamais un
    second motif qui pourrait diverger."""
    trouvees: list[str] = []
    if isinstance(valeur, str):
        try:
            schema.ENTITE(valeur)
        except vol.Invalid:
            pass
        else:
            trouvees.append(valeur)
    elif isinstance(valeur, dict):
        for sous_valeur in valeur.values():
            trouvees.extend(entites_dans(sous_valeur))
    elif isinstance(valeur, (list, tuple)):
        for sous_valeur in valeur:
            trouvees.extend(entites_dans(sous_valeur))
    return trouvees
