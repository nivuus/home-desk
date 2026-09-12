"""Les primitives PARTAGEES par toutes les familles de sections « liste » :
le selecteur d'entite commun, le selecteur de geste, la fusion d'un
element edite avec l'existant (`_fusionner`), les deux exceptions de refus
metier (`ServiceIncomplet`, `ChampVide`) et la forme `Section` elle-meme.

Extrait de `listes_champs.py` a la tache 7 — troisieme version de ce
paragraphe, troisieme inexactitude corrigee en ronde 2 de relecture (« ecris
ce qui EST, pas ce que tu voulais faire ») : la tache 7 n'ajoute AUCUNE
section a la famille bouton/synthese/ouvrant de `listes_champs.py`
elle-meme (`ouvrants` datait deja de la tache 6 ; `etiquettesMinuteur` ne
vit d'ailleurs PAS dans ce module, mais dans `listes_champs_minuteurs.py`,
une famille distincte). Ce que la tache 7 ajoute, ce sont TROIS sections
d'une famille SEPAREE (`sources`, `minuteurs`, `etiquettesMinuteur`), dans
DEUX nouveaux modules (`listes_champs_sources.py`, `listes_champs_
minuteurs.py`) qui ont besoin des MEMES primitives que `listes_champs.py`
(`_fusionner`, `ChampVide`, `ServiceIncomplet`, `Section`, un selecteur
d'entite, un selecteur de geste). `listes_champs.py` etait DEJA pres des
500 lignes depuis la tache 6 (427/500) : y ajouter ces primitives, plutot
que de les extraire ICI pour que les TROIS modules les importent, l'aurait
fait franchir la limite. La couture choisie est celle que le brief suggere
lui-meme (« une section = un fichier ») : ce module porte ce qui est
VRAIMENT commun aux DEUX familles, `listes_champs.py` garde la premiere et
assemble `SECTIONS` (toujours la SEULE adresse canonique), les deux modules
de la tache 7 portent la seconde. Sans ce partage, `_fusionner`/
`ChampVide`/`ServiceIncomplet` auraient eu deux copies a diverger en
silence — exactement ce que ce chantier s'interdit partout ailleurs
(schema.py, budget.py).

Ronde 1 de relecture (re-export) : le vocabulaire d'icones
(`CHEMIN_ICONES`/`_ICONES_OPTIONS`/`_selecteur_icone`) et le selecteur
d'entite MULTIPLE (`_selecteur_entite_multiple`) sont revenus vivre dans
leur SEUL consommateur respectif (`listes_champs.py`, `listes_champs_
sources.py`) : les avoir laisses ici n'etait qu'un re-export pour ne rien
casser au deplacement, exactement l'anti-motif que la tache 6 avait deja
corrige pour `SECTIONS` — jamais partages par une DEUXIEME famille.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import voluptuous as vol

from homeassistant.helpers import selector

from .const import ACTION_DESCENDRE, ACTION_ENREGISTRER, ACTION_MONTER, ACTION_SUPPRIMER

_ACTIONS_EDITION = [ACTION_ENREGISTRER, ACTION_MONTER, ACTION_DESCENDRE, ACTION_SUPPRIMER]


def _selecteur_entite() -> selector.EntitySelector:
    """Aucune restriction de domaine, sur AUCUNE section (verifie sur les
    trois ecrans reels, cf. rapport de tache 6) : le parametre `domaines`
    n'a jamais ete reintroduit depuis son retrait en ronde 2."""
    return selector.EntitySelector(selector.EntitySelectorConfig())


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
    """Ne remplace un element existant qu'avec les champs que CE formulaire
    gere (`donnee`) ; tout champ du contrat que l'existant portait et que ce
    formulaire ne gere PAS encore (`champs_contrat` en exclut le complement)
    survit intact. Voir le rapport de tache 6, ronde 1 (le Critique) pour
    l'incident que cette fonction corrige."""
    fusion = {k: v for k, v in (existant or {}).items() if k not in champs_contrat}
    fusion.update(donnee)
    return fusion


class ServiceIncomplet(Exception):
    """Leve par `listes_champs._construire_donnee_bouton` quand
    `service_domaine`/`service_action` sont a demi remplis. Voir le rapport
    de tache 6, ronde 3, pour le message illisible que cette exception
    remplace (`schema._paire_service()` rejouee a la main, motif JSON
    Schema brut pose sur "base")."""

    def __init__(self, champ_vide: str) -> None:
        self.champ_vide = champ_vide
        super().__init__(champ_vide)


class ChampVide(Exception):
    """Leve quand un champ texte REQUIS d'une section « liste »
    ($defs/bouton.libelle, $defs/synthese.texte, $defs/source.nom) est vide
    ou ne contient QUE des espaces — jamais une correction de schema.py, qui
    doit rester fidele au contrat partage avec ajv (les espaces y comptent
    comme des caracteres, cf. sa docstring d'origine dans listes_champs.py,
    ronde 4 de la tache 6)."""

    def __init__(self, champ: str) -> None:
        self.champ = champ
        super().__init__(champ)


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
