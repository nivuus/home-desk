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

from . import libelles, schema
from .budget import BUDGET, verifier_budget
from .const import ERREUR_ALERTE_PAS_EN_TETE, ERREUR_BUDGET_INTENABLE_MODE, ERREUR_CHAMP_INVALIDE
from .fautes import _FauteAlertePremiere
from .formulaire import reafficher
# Ronde 1 de relecture (Critique) : verifie l'ecran COMPLET avant tout
# persist — voir garde_ecran.py. `async_step_agencement` et
# `async_step_voiture` en avaient besoin au MEME titre que listes.py
# (`blocDefaut: voiture` sans objet voiture, ou le retrait de la voiture
# pendant que blocDefaut la reclame encore, persistaient en silence avant
# ce correctif). Ronde 2 : importe comme MODULE — `garde_ecran.
# persister_si_valide` est LE site d'ecriture unique du paquet, ce module
# ne nomme plus `_async_update` lui-meme.
from . import garde_ecran
# Meme mecanisme que `listes.py` (schema.* -> vol.Invalid -> fautes.localiser
# -> code d'erreur dedie), rejoue ici sur un objet UNIQUE plutot que sur un
# element de section « liste » : reutiliser CETTE table (et `_localiser_
# champ`, meme raison) plutot qu'en ecrire une seconde copie, la meme regle
# que ce chantier applique partout ailleurs (schema.py, budget.py).
#
# Ronde 2 de relecture : `_localiser_champ` vivait ICI seule jusqu'a cette
# ronde — la ronde 1 avait corrige la troncature de `fautes.localiser()`
# pour agencement/voiture en la croyant limitee a ces deux formes, alors
# que `listes.py` portait EXACTEMENT le meme defaut pour les sections
# « liste » (voir sa propre docstring pour la mesure). Une seule
# implementation partagee depuis lors -- extraite dans `listes_erreurs.py`
# en ronde de correction 1 (defaut B), ce module en important deja les DEUX
# noms ENSEMBLE etant la preuve que la couture etait deja separable.
from .listes_erreurs import _ERREUR_PAR_MOT_CLE, _localiser_champ
# Ronde de correction 3 : decision 7, cablee ICI pour "voiture" -- les sept
# champs de $defs/voiture (en ligne, sans $defs propre) sont des entites
# tout comme celles d'une section « liste » (voir registre.py). Relecture
# finale de branche (C1) : `avertissement_entites_inconnues` remplace
# l'appel direct a `entites_inconnues` -- voir sa docstring.
from .registre import avertissement_entites_inconnues, entites_dans

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
        # Ronde 1 de relecture (Mineur) : les quatre `SelectSelector`
        # ci-dessous portent desormais un `translation_key` — meme mecanique
        # que "geste" (`listes_communs._selecteur_geste`). Avant cette
        # ronde, aucun n'en avait : l'utilisateur lisait les identifiants
        # BRUTS du contrat ("blocCentral", "aeration", "delorean",
        # "extrasMaison" via zones/modes/modulateurs), jamais un libelle.
        vol.Optional("blocDefaut"): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.BLOC_DEFAUT),
                mode=selector.SelectSelectorMode.DROPDOWN,
                translation_key="bloc_defaut",
            )
        ),
        vol.Optional("zones", default=list): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.ZONES),
                multiple=True,
                mode=selector.SelectSelectorMode.LIST,
                translation_key="zone",
            )
        ),
        vol.Optional("modes", default=list): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.MODES),
                multiple=True,
                mode=selector.SelectSelectorMode.LIST,
                translation_key="mode",
            )
        ),
        vol.Optional("modulateurs", default=list): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.MODULATEURS),
                multiple=True,
                mode=selector.SelectSelectorMode.LIST,
                translation_key="modulateur",
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
                # Relecture finale de branche (deuxieme ronde) : `err` peut
                # etre une `vol.MultipleInvalid` -- meme deballage que
                # `_localiser_champ` (listes_erreurs.py) fait pour lire le mot-cle,
                # necessaire ICI aussi pour l'isinstance ci-dessous.
                premiere = err.errors[0] if isinstance(err, vol.MultipleInvalid) else err
                if isinstance(premiere, _FauteAlertePremiere):
                    # Cas special, PAS via `_ERREUR_PAR_MOT_CLE` : cette
                    # faute herite du mot-cle "const" de `_FauteConst`
                    # (pour que `contrat/cas-schema.json` partage le MEME
                    # motif qu'ajv, voir schema._alerte_en_tete()) -- mais
                    # "const" y est deja pris par un tout autre message
                    # (ERREUR_CHAMP_VALEUR_FIGEE, un champ fige a une seule
                    # valeur, jamais une histoire d'ORDRE). Distinguee par
                    # TYPE, jamais par mot-cle : deux mot-cle identiques ne
                    # peuvent pas porter deux messages differents dans un
                    # dict a plat.
                    errors["modes"] = ERREUR_ALERTE_PAS_EN_TETE
                else:
                    champ, mot_cle = _localiser_champ(err)
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
                    # Ronde 2 de relecture (point 3) : {mode} interpolait
                    # l'identifiant BRUT du contrat ("minuteur"), jamais
                    # traduit — alors que le SelectSelector correspondant
                    # (translation_key="mode", ronde 1) publie deja "Minuteur"
                    # / "Timer". `libelles.mode` relit la MEME table.
                    description_placeholders["mode"] = libelles.mode(self.hass, pire_mode)
                    description_placeholders["debordement"] = str(pire_debordement)
                else:
                    # Ronde 1 de relecture (Critique) : schema.AGENCEMENT
                    # rejoue plus haut ne voit que L'AGENCEMENT lui-meme,
                    # jamais les invariants CROISES avec le reste de
                    # l'ecran (`blocDefaut: voiture` sans objet voiture,
                    # `minuteur` dans les modes sans slot de minuteur) —
                    # mesure : persistait en silence avant ce correctif.
                    # Ronde 2 : delegue a `garde_ecran.persister_si_valide`,
                    # LE site d'ecriture unique (voir sa docstring).
                    donnees = {**subentry.data, "agencement": valide}
                    if garde_ecran.persister_si_valide(
                        self, entry, subentry, donnees, errors, description_placeholders,
                        section_courante="agencement",
                    ):
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
        l'absence que le contrat demande).

        Ronde 1 de relecture (Critique) : LE cas le plus grave mesure par le
        relecteur vivait ICI — retirer la voiture pendant que `blocDefaut`
        vaut encore "voiture" rendait un ecran DEJA VALIDE invalide, SANS UN
        MOT (la docstring nommait deja `schema._invariants_croises`
        juste au-dessus, sans jamais l'appeler). Les DEUX branches qui
        persistent (retrait, ajout/edition) passent desormais par
        `garde_ecran.persister_si_valide` avant d'ecrire.

        Ronde 2 de relecture (point 3) : le refus de la branche `sans_
        voiture` nommait "voiture" — la section ou l'utilisateur se trouve
        DEJA, ou il n'y a plus rien a corriger (il vient d'en sortir). Le
        seul remede reel est dans « Blocs et modes » (retirer `blocDefaut:
        voiture`). `section_courante="voiture"` permet a `garde_ecran.
        verifier_ecran_complet` de rediriger vers "agencement" quand la
        section fautive EST celle d'ou vient l'ecriture — jamais dans la
        branche d'ajout/edition ci-dessous, ou "voiture" reste la bonne
        reponse (l'utilisateur n'y est pas deja s'il vient de `blocDefaut:
        voiture` choisi depuis l'agencement)."""
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        existant = subentry.data.get("voiture")
        valeurs_affichees = dict(existant) if existant else {}

        if user_input is not None:
            valeurs_affichees = user_input
            if user_input.get("sans_voiture"):
                donnees = dict(subentry.data)
                donnees.pop("voiture", None)
                if garde_ecran.persister_si_valide(
                    self, entry, subentry, donnees, errors, description_placeholders,
                    section_courante="voiture",
                ):
                    return await self.async_step_reconfigure()
            else:
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
                    champ, mot_cle = _localiser_champ(err)
                    errors[champ] = _ERREUR_PAR_MOT_CLE.get(mot_cle, ERREUR_CHAMP_INVALIDE)
                else:
                    # Ronde de correction 3 : decision 7, restee non cablee
                    # ICI -- les SEPT champs de `voiture` sont des entites au
                    # contrat (`$ref: entite`), aussi exposees a la faute de
                    # frappe que n'importe quel champ d'une section « liste ».
                    # AVERTIT, ne refuse jamais -- meme regle que le squelette
                    # des sections (`listes.py`). C1 (relecture finale) : le
                    # placeholder est TOUJOURS pose, jamais seulement `if
                    # inconnues` -- voir `avertissement_entites_inconnues`.
                    description_placeholders["entites_inconnues"] = (
                        avertissement_entites_inconnues(self.hass, entites_dans(valide, "voiture"))
                    )
                    donnees = {**subentry.data, "voiture": valide}
                    if garde_ecran.persister_si_valide(
                        self, entry, subentry, donnees, errors, description_placeholders,
                        section_courante="voiture",
                    ):
                        return await self.async_step_reconfigure(
                            description_placeholders=description_placeholders
                        )

        return reafficher(
            self, "voiture", SCHEMA_VOITURE, valeurs_affichees, errors, description_placeholders
        )
