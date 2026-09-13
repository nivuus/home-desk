"""Nommer une faute au vocabulaire JSON Schema : la hierarchie `_Faute` (le
mot-cle sur la CLASSE, jamais sur `error_type`) et `motif()`, qui la traduit
au format du corpus (`chemin: mot-cle`, le pendant de `${instancePath}:
${keyword}` cote ajv).

Une seule et meme preoccupation, separee de `schema.py` (le miroir
voluptuous du contrat lui-meme, DEUX validateurs pour une seule forme) en
ronde 3 de relecture de la tache 6 : `schema.py` approchait les 500 lignes
et la tache 7 y ajoute encore `MINUTEUR_SLOT`/`etiquettesMinuteur`. Les deux
moities ne se separent pas l'une de l'autre : `motif()` ne fonctionne QUE
parce que `mot_cle` vit sur la CLASSE de chaque `_Faute*`, jamais sur une
instance — d'ou un module unique plutot que deux qui se citeraient en
boucle.
"""
from __future__ import annotations

import voluptuous as vol

# --------------------------------------------------------------------------
# Chaque `_Faute*` leve une SOUS-CLASSE de vol.Invalid dediee au mot-cle JSON
# Schema qu'elle traduit ("type", "pattern", "minimum", "enum", ...) — jamais
# un vol.Invalid generique avec error_type="...".
#
# Correction de la ronde 1 (Important 3) : error_type est un ATTRIBUT
# d'instance, et les DEUX backends le reecrivent en le remontant a travers un
# validateur de valeur imbrique dans un dict (`validate_mapping`, dans
# voluptuous comme dans le shim probatio de Home Assistant, lui substitue un
# message interne generique — "dictionary value" cote voluptuous nu). motif()
# ne peut donc pas s'y fier. La CLASSE de l'exception, elle, n'est jamais
# touchee par ce mecanisme : c'est deja pourquoi required/additionalProperties
# /contains sont detectes par isinstance() plus bas ; les mots-cles qui
# restent le sont desormais aussi, via `_Faute.mot_cle`.
# --------------------------------------------------------------------------

class _Faute(vol.Invalid):
    """Le mot-cle JSON Schema vit sur la CLASSE, jamais sur `error_type`."""
    mot_cle = "invalid"


class _FauteType(_Faute):
    mot_cle = "type"


class _FautePattern(_Faute):
    mot_cle = "pattern"


class _FauteMinimum(_Faute):
    mot_cle = "minimum"


class _FauteMaximum(_Faute):
    mot_cle = "maximum"


class _FauteEnum(_Faute):
    mot_cle = "enum"


class _FauteConst(_Faute):
    mot_cle = "const"


class _FauteMinLength(_Faute):
    mot_cle = "minLength"


class _FauteMinItems(_Faute):
    mot_cle = "minItems"


class _FauteMaxItems(_Faute):
    mot_cle = "maxItems"


class _FauteUniqueItems(_Faute):
    mot_cle = "uniqueItems"


class _FauteAlertePremiere(_Faute):
    """Releve en relecture finale de branche : `alerte`, si present dans
    `agencement.modes`, doit en etre le PREMIER element (spec du
    2026-09-12, section « Invariants verifies par le schema » : « alerte en
    premiere position si present -- une alerte ne cede a rien »).
    `contrat/ecran.schema.json` ne l'exprime PAS (comme `uniqueItems`/
    `contains` sur `modes`, il le pourrait — mais cette regle est ajoutee
    par ce composant, jamais par le contrat, voir schema.py) : `mot_cle`
    n'est donc PAS un mot-cle JSON Schema, contrairement a ses voisines
    ci-dessus -- `motif()`/le corpus partage (`contrat/cas-schema.json`) ne
    l'exercent jamais, seul `tests/composant/test_schema.py` la garde
    directement."""
    mot_cle = "alertePremiere"


def localiser(err: vol.Invalid) -> tuple[list, str]:
    """Le CHEMIN et le MOT-CLE JSON Schema d'une faute — l'analyse que
    `motif()` formate pour le corpus, partagee ici (ronde 4 de relecture)
    pour que `listes.py` puisse attribuer un refus utilisateur au bon CHAMP
    et au bon MOT-CLE SANS dupliquer cette analyse : une seconde copie de ce
    calcul aurait ete exactement la divergence que ce module existe pour
    empecher.

    - `required` et `additionalProperties` : voluptuous porte le champ
      fautif (le manquant, ou l'inconnu) comme DERNIER segment du chemin ;
      ajv, lui, designe l'OBJET qui porte la faute, le nom du champ voyageant
      a part (`missingProperty` / `additionalProperty`). On retire donc ce
      dernier segment pour les deux mots-cles — jamais pour les autres, ou le
      chemin voluptuous et le instancePath ajv designent deja le meme point.
    - Une `vol.MultipleInvalid` ne porte pas `.error_type` (elle ne passe
      jamais par `Invalid.__init__`) : on lit sa premiere erreur, qui suffit
      ici puisque chaque cas du corpus n'exerce qu'UNE seule regle a la fois
      (et puisqu'un refus de section « liste » n'en souleve jamais qu'une).
    - `voluptuous` est charge par ce module directement (le paquet PyPI
      classique), mais des l'instant ou `custom_components/home_desk` importe
      `homeassistant.core` (`__init__.py`), Home Assistant remplace
      `sys.modules["voluptuous"]` par `probatio._vol_shim` : depuis HA
      2026.9, `voluptuous` n'est plus qu'une facade de compatibilite au-dessus
      de `probatio`, sa VRAIE bibliotheque de validation (verifie par
      inspection du composant sous les deux regimes — voir le rapport de la
      tache 3). Les deux backends different sur l'exces de champs : la
      voluptuous classique leve un `Invalid` generique avec le message
      "extra keys not allowed" ; le shim probatio leve un `ExtraKeysInvalid`
      dedie avec le message "not a valid option". D'ou la double detection
      ci-dessous plutot qu'une seule branche qui ne marcherait que sous
      Home Assistant, ou que sous voluptuous nu.
    - Correction de la ronde 1 (Important 3) : `err.error_type` n'est PAS
      fiable pour nos propres validateurs non plus. Les DEUX backends le
      reecrivent quand l'erreur remonte a travers un validateur de valeur
      imbrique dans un dict (`validate_mapping`), avec un message interne
      generique ("dictionary value" cote voluptuous nu) — verifie en rejouant
      le corpus entier sous voluptuous nu (schema.py charge seul, homeassistant
      jamais importe) : 4 cas sur 11 se trompaient de mot-cle avant cette
      correction. Nos propres validateurs levent donc desormais des
      sous-classes de `_Faute`, dont le mot-cle vit sur la CLASSE — jamais
      touchee par cette reecriture, contrairement a l'attribut. `required`,
      `additionalProperties` et `contains` restent detectes comme avant
      (classes/messages de voluptuous ou du shim, hors de notre controle) ;
      tout le reste passe desormais par `isinstance(err, _Faute)`."""
    if isinstance(err, vol.MultipleInvalid):
        err = err.errors[0]

    chemin_parts = list(err.path)
    if isinstance(err, vol.RequiredFieldInvalid):
        return chemin_parts[:-1], "required"
    if type(err).__name__ == "ExtraKeysInvalid" or err.msg == "extra keys not allowed":
        return chemin_parts[:-1], "additionalProperties"
    if isinstance(err, vol.ContainsInvalid):
        return chemin_parts, "contains"
    if isinstance(err, _Faute):
        return chemin_parts, err.mot_cle
    return chemin_parts, (err.error_type or "invalid")


def motif(err: vol.Invalid) -> str:
    """Rend la faute au format du corpus : `chemin: mot-cle`, le pendant de
    `${instancePath}: ${keyword}` cote ajv (app/tests/cas-schema.test.ts) —
    un vocabulaire JSON Schema, jamais un message montre TEL QUEL a un
    utilisateur (voir `localiser()` pour l'analyse partagee).

    Correction de la ronde 3, ETENDUE en ronde 4 : la ronde 3 avait affirme
    ici que ce module « ne nomme QUE le vocabulaire JSON Schema destine au
    corpus » en ne le verifiant QUE pour `service` (`listes_champs.
    ServiceIncomplet`) — alors que TOUS LES AUTRES refus d'un element de
    section « liste » (`listes._async_step_section_element`) interpolaient
    encore `motif()` BRUT dans le message utilisateur (« Ce champ n'est pas
    valide : : required. », entre autres, mesure sur quatre chemins) : la
    MEME classe de defaut, au meme endroit, creee par la ronde qui pensait
    l'avoir fermee — sixieme et septieme docstrings menteuses du chantier.
    `listes.py` traduit desormais CHAQUE mot-cle en un code d'erreur dedie
    (`listes._ERREUR_PAR_MOT_CLE`) via `localiser()`, jamais `motif()` :
    cette fonction ne sert plus qu'au corpus, ici, et a ses propres tests
    (`tests/composant/test_schema.py`) — verifie par grep, pas suppose."""
    chemin_parts, mot_cle = localiser(err)
    chemin = "/" + "/".join(str(p) for p in chemin_parts) if chemin_parts else ""
    return f"{chemin}: {mot_cle}"
