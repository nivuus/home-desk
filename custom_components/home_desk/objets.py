"""Les sections « objet » d'un ecran : `agencement` (« Blocs et modes ») et
`voiture` — un OBJET UNIQUE par ecran, jamais une collection d'elements
choisis/ajoutes un par un comme les sections « liste » de `listes.py`. Ce
qui les distingue de `SectionsListeMixin` : pas de choisir/ajouter, pas de
monter/descendre/supprimer, pas d'index — juste un formulaire qui rejoue
`schema.AGENCEMENT`/`schema.VOITURE` sur l'objet ENTIER a chaque
soumission.

Extrait de `config_flow.py` a la tache 7 pour rester sous 500 lignes (meme
couture que `listes.py`/`listes_champs.py` a la tache 6, decidee AVANT
d'ecrire plutot qu'apres coup, comme le brief le demandait) : `EcranSubentryFlow`
reutilise `SectionsObjetMixin` exactement comme `SectionsListeMixin`.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import SubentryFlowResult
from homeassistant.helpers import selector

from . import schema
from .budget import BUDGET, verifier_budget
from .const import ERREUR_BUDGET_INTENABLE_MODE, ERREUR_CHAMP_INVALIDE
from .formulaire import reafficher
# Meme mecanisme que `listes.py` (schema.* -> vol.Invalid -> fautes.localiser
# -> code d'erreur dedie), rejoue ici sur un objet UNIQUE plutot que sur un
# element de section « liste » : reutiliser CETTE table plutot qu'en ecrire
# une seconde copie, la meme regle que ce chantier applique partout
# ailleurs (schema.py, budget.py).
from .listes import _ERREUR_PAR_MOT_CLE

# Tache 7 : « Blocs et modes » (agencement) n'est PAS une section « liste »
# (listes.py) — un OBJET unique par ecran, jamais une collection d'elements
# independants choisis/ajoutes un par un. `zones`/`modes`/`modulateurs`
# restent des LISTES ORDONNEES du contrat (schema.ZONES/MODES/MODULATEURS,
# deja des listes depuis la tache 6 precisement pour cet usage) : un
# `SelectSelector(multiple=True)` les soumet dans l'ordre choisi par
# l'utilisateur — HA ne les trie ni ne les reordonne lui-meme — ce qui
# porte la MEME garantie d'ordre qu'un monter/descendre, sans le geste
# dedie (voir le rapport de tache pour ce repli assume). `default=list` sur
# les trois : un champ jamais touche doit quand meme soumettre une LISTE
# VIDE, jamais une cle absente — `schema.AGENCEMENT` les exige toutes les
# trois (`vol.Required`).
SCHEMA_AGENCEMENT = vol.Schema(
    {
        vol.Optional("blocDefaut"): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.BLOC_DEFAUT), mode=selector.SelectSelectorMode.DROPDOWN
            )
        ),
        vol.Optional("zones", default=list): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.ZONES), multiple=True, mode=selector.SelectSelectorMode.LIST
            )
        ),
        vol.Optional("modes", default=list): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.MODES), multiple=True, mode=selector.SelectSelectorMode.LIST
            )
        ),
        vol.Optional("modulateurs", default=list): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.MODULATEURS), multiple=True, mode=selector.SelectSelectorMode.LIST
            )
        ),
        vol.Optional("note"): str,
    }
)

# Les sept entites de $defs/voiture, jamais retapees en dur ailleurs — la
# case "sans_voiture" (brief, etape 2) N'EST PAS un champ du contrat : elle
# ne quitte jamais ce formulaire, cf. SectionsObjetMixin.async_step_voiture.
CHAMPS_VOITURE = (
    "batterie", "autonomie", "branchee", "enCharge", "clim", "demarrerClim", "arreterClim",
)

SCHEMA_VOITURE = vol.Schema(
    {
        vol.Optional("sans_voiture", default=False): selector.BooleanSelector(),
        **{
            vol.Optional(champ): selector.EntitySelector(selector.EntitySelectorConfig())
            for champ in CHAMPS_VOITURE
        },
        vol.Optional("note"): str,
    }
)


class SectionsObjetMixin:
    """Le pendant de `listes.SectionsListeMixin` pour les DEUX sections
    « objet ». `EcranSubentryFlow` (config_flow.py) le reutilise en mixin,
    aux cotes de `SectionsListeMixin` — les deux ne partagent aucun nom de
    methode, l'ordre des bases n'a donc pas d'effet observable ici."""

    async def async_step_agencement(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """« Blocs et modes » (agencement) : un OBJET unique, jamais une
        section « liste » (voir SCHEMA_AGENCEMENT ci-dessus pour l'ordre des
        multi-selections).

        Rejoue `schema.AGENCEMENT` (le miroir complet, y compris ses deux
        `Contains` — zones doit contenir "commandes", modes doit contenir
        "defaut") puis, seulement si l'objet est structurellement valide,
        la DEUXIEME regle hors-schema de cette tache : le budget verifie
        MODE PAR MODE, avec les zones SAISIES ICI et la hauteur/l'ambiance
        REELLEMENT persistees. Le refus nomme le mode le PLUS COUTEUX, pas
        seulement un chiffre — « le mode minuteur deborde de X px », jamais
        « cet ecran deborde de X px »."""
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        valeurs_affichees = dict(subentry.data.get("agencement") or {})

        if user_input is not None:
            valeurs_affichees = user_input
            candidat: dict[str, Any] = {
                "zones": list(user_input.get("zones") or []),
                "modes": list(user_input.get("modes") or []),
                "modulateurs": list(user_input.get("modulateurs") or []),
            }
            if user_input.get("blocDefaut"):
                candidat["blocDefaut"] = user_input["blocDefaut"]
            if user_input.get("note"):
                candidat["note"] = user_input["note"]
            try:
                valide = schema.AGENCEMENT(candidat)
            except vol.Invalid as err:
                chemin, mot_cle = schema.localiser(err)
                champ = str(chemin[0]) if chemin else "base"
                errors[champ] = _ERREUR_PAR_MOT_CLE.get(mot_cle, ERREUR_CHAMP_INVALIDE)
            else:
                # rangee_ambiance : MEME formule que app/src/demarrage.ts
                # (`piece.ambiances.length > 0 || (piece.minuteurs?.length
                # ?? 0) > 0`) — la tache 5 ne pouvait que la SUPPOSER vraie
                # (aucune section n'existait encore) ; ici, les deux listes
                # sont deja persistees et disent la verite.
                rangee_ambiance = (
                    len(subentry.data.get("ambiances", [])) > 0
                    or len(subentry.data.get("minuteurs", [])) > 0
                )
                hauteur_utile = subentry.data.get(
                    "hauteurUtile", BUDGET["hauteurUtileParDefaut"]
                )
                pire_mode: str | None = None
                pire_debordement = 0
                for mode in valide["modes"]:
                    debordement = verifier_budget(
                        mode, rangee_ambiance, hauteur_utile, valide["zones"]
                    )
                    if debordement > pire_debordement:
                        pire_debordement = debordement
                        pire_mode = mode
                if pire_mode is not None:
                    errors["base"] = ERREUR_BUDGET_INTENABLE_MODE
                    description_placeholders["mode"] = pire_mode
                    description_placeholders["debordement"] = str(pire_debordement)
                else:
                    donnees = dict(subentry.data)
                    donnees["agencement"] = valide
                    self._async_update(entry=entry, subentry=subentry, data=donnees)
                    return await self.async_step_reconfigure()

        return reafficher(
            self, "agencement", SCHEMA_AGENCEMENT, valeurs_affichees, errors,
            description_placeholders,
        )

    async def async_step_voiture(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """« Voiture » : sept entites, ou la case « Pas de voiture ». La
        DECOCHER (`sans_voiture=True`) RETIRE l'objet de la sous-entree —
        jamais sept champs laisses vides : le contrat exige l'objet COMPLET
        des qu'il existe (`$defs` racine, `voiture` -> `required` sur les
        sept), et `blocDefaut: voiture` l'exige tout court
        (schema._invariants_croises). Retirer la cle exige `data=` (pas
        `data_updates=`, qui ne fait qu'une UNION — `subentry.data |
        {"voiture": None}` garderait la cle avec une valeur `None`, pas
        l'absence que le contrat demande)."""
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        existant = subentry.data.get("voiture")
        valeurs_affichees = dict(existant) if existant else {}

        if user_input is not None:
            valeurs_affichees = user_input
            if user_input.get("sans_voiture"):
                donnees = dict(subentry.data)
                donnees.pop("voiture", None)
                self._async_update(entry=entry, subentry=subentry, data=donnees)
                return await self.async_step_reconfigure()

            candidat = {
                champ: user_input[champ]
                for champ in CHAMPS_VOITURE
                if user_input.get(champ) not in (None, "")
            }
            if user_input.get("note"):
                candidat["note"] = user_input["note"]
            try:
                valide = schema.VOITURE(candidat)
            except vol.Invalid as err:
                chemin, mot_cle = schema.localiser(err)
                champ = str(chemin[0]) if chemin else "base"
                errors[champ] = _ERREUR_PAR_MOT_CLE.get(mot_cle, ERREUR_CHAMP_INVALIDE)
            else:
                donnees = dict(subentry.data)
                donnees["voiture"] = valide
                self._async_update(entry=entry, subentry=subentry, data=donnees)
                return await self.async_step_reconfigure()

        return reafficher(self, "voiture", SCHEMA_VOITURE, valeurs_affichees, errors)
