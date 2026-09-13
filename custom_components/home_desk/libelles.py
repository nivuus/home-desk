"""Traduit un identifiant BRUT du contrat (une section, un mode) en son
libelle humain — pour les DEUX endroits ou un tel identifiant finit dans un
`description_placeholders`, jamais dans un `SelectSelector` (qui, lui, se
traduit tout seul via `translation_key`, voir `objets.py`) : le message
`ecran_deviendrait_invalide` (garde_ecran.py) et `budget_intenable_mode`
(objets.py).

Ronde 2 de relecture : mesure — `errors["base"]` portait `description_
placeholders["section"] = "minuteurs"` (l'identifiant BRUT), quand le
frontend affiche a cote « Timers » (l'option traduite du selecteur `mode`)
: la MEME faute que le mineur 6 de la ronde 1 fermait deja pour les options
de `SelectSelector` — juste pas fermee ICI, ou l'identifiant ne passe pas
par un selecteur mais par un texte d'erreur.

RELIT la MEME source que le frontend (`translations/*.json`), jamais une
seconde table qui pourrait diverger — exactement l'interdit que ce chantier
applique partout ailleurs (schema.py, budget.py). La langue vient de
`hass.config.language` : le reglage d'INSTANCE Home Assistant (pas un choix
par visiteur — un config flow n'a aucun autre signal fiable), par defaut
"en" (verifie dans `homeassistant/core_config.py`)."""
from __future__ import annotations

import json
import pathlib

CHEMIN_TRADUCTIONS = pathlib.Path(__file__).parent / "translations"


def _traductions(langue: str) -> dict:
    chemin = CHEMIN_TRADUCTIONS / f"{langue}.json"
    if not chemin.exists():
        chemin = CHEMIN_TRADUCTIONS / "fr.json"
    return json.loads(chemin.read_text(encoding="utf-8"))


def _langue(hass) -> str:
    config = getattr(hass, "config", None)
    return getattr(config, "language", None) or "fr"


def section(hass, cle: str) -> str:
    """Le libelle humain d'une cle de section, celui du menu de
    reconfiguration (`config_subentries.ecran.step.reconfigure.
    menu_options`) — ce menu couvre deja les sections « liste » ET les
    deux sections « objet » (agencement, voiture). Repli sur `cle` elle-meme
    si absente : ne doit jamais arriver pour une cle reelle, mais ne doit
    jamais lever pour autant (un texte degrade vaut mieux qu'un flow casse)."""
    menu = _traductions(_langue(hass))["config_subentries"]["ecran"]["step"]["reconfigure"]["menu_options"]
    return menu.get(cle, cle)


def mode(hass, cle: str) -> str:
    """Le libelle humain d'un mode (`selector.mode.options`, publie en ronde
    1 pour le `SelectSelector` de `SCHEMA_AGENCEMENT` — reutilise ICI plutot
    que retape)."""
    options = _traductions(_langue(hass))["selector"]["mode"]["options"]
    return options.get(cle, cle)
