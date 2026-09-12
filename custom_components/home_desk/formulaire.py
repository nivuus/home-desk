"""Le SEUL point de sortie qui reaffiche un formulaire de sous-entree, que ce
soit le premier affichage d'une etape ou un refus.

Ronde 1 de relecture (tache 6) avait deja corrige DEUX fois le meme defaut,
dans deux modules voisins : un refus qui reaffichait les valeurs STOCKEES
d'avant plutot que la saisie FAUTIVE de l'utilisateur (`listes.py`, Important
2 ; `config_flow.py`, meme dette heritee de la tache 5). Ronde 2 : une
troisieme occurrence de l'idiome ecrit a la main serait apparue des que
`_async_step_section` (listes.py) a du, a son tour, refuser une soumission —
et une quatrieme l'aurait suivie a la tache 7 (minuteurs). L'idiome ne vit
donc plus qu'ICI, une seule fois, reutilise par les trois appelants.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigSubentryFlow, SubentryFlowResult


def reafficher(
    flow: ConfigSubentryFlow,
    step_id: str,
    schema_form: vol.Schema,
    valeurs: dict[str, Any] | None,
    errors: dict[str, str] | None = None,
    description_placeholders: dict[str, str] | None = None,
) -> SubentryFlowResult:
    """Reaffiche `step_id` avec `valeurs` PRE-REMPLIES
    (`add_suggested_values_to_schema`) : au premier affichage, ce sont les
    valeurs STOCKEES (ou rien, pour un ajout) ; sur un refus, `valeurs` DOIT
    etre la saisie fautive elle-meme (`user_input`), jamais les valeurs
    d'avant — c'est l'appelant qui choisit laquelle passer, cette fonction ne
    fait que le geste commun aux trois."""
    return flow.async_show_form(
        step_id=step_id,
        data_schema=flow.add_suggested_values_to_schema(schema_form, valeurs),
        errors=errors or {},
        description_placeholders=description_placeholders or {},
    )
