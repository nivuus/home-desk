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


def motif(err: vol.Invalid) -> str:
    """Rend la faute au format du corpus : `chemin: mot-cle`, le pendant de
    `${instancePath}: ${keyword}` cote ajv (app/tests/cas-schema.test.ts).

    - `required` et `additionalProperties` : voluptuous porte le champ
      fautif (le manquant, ou l'inconnu) comme DERNIER segment du chemin ;
      ajv, lui, designe l'OBJET qui porte la faute, le nom du champ voyageant
      a part (`missingProperty` / `additionalProperty`). On retire donc ce
      dernier segment pour les deux mots-cles — jamais pour les autres, ou le
      chemin voluptuous et le instancePath ajv designent deja le meme point.
    - Une `vol.MultipleInvalid` ne porte pas `.error_type` (elle ne passe
      jamais par `Invalid.__init__`) : on lit sa premiere erreur, qui suffit
      ici puisque chaque cas du corpus n'exerce qu'UNE seule regle a la fois.
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
      tout le reste passe desormais par `isinstance(err, _Faute)`.

    Correction de la ronde 3 : ce module ne nomme QUE le vocabulaire JSON
    Schema destine au corpus (`contrat/cas-schema.json`) — jamais un message
    montre TEL QUEL a un utilisateur. Un refus METIER a la saisie (un champ
    `service` a demi rempli, par exemple) doit porter son PROPRE code
    d'erreur, lisible, jamais ce mot-cle brut (voir `listes_champs.
    ServiceIncomplet` et `const.ERREUR_SERVICE_INCOMPLET`, qui existent
    exactement pour ne plus jamais montrer `": minItems"` a un humain)."""
    if isinstance(err, vol.MultipleInvalid):
        err = err.errors[0]

    chemin_parts = list(err.path)
    if isinstance(err, vol.RequiredFieldInvalid):
        mot_cle = "required"
        chemin_parts = chemin_parts[:-1]
    elif type(err).__name__ == "ExtraKeysInvalid" or err.msg == "extra keys not allowed":
        mot_cle = "additionalProperties"
        chemin_parts = chemin_parts[:-1]
    elif isinstance(err, vol.ContainsInvalid):
        mot_cle = "contains"
    elif isinstance(err, _Faute):
        mot_cle = err.mot_cle
    else:
        mot_cle = err.error_type or "invalid"

    chemin = "/" + "/".join(str(p) for p in chemin_parts) if chemin_parts else ""
    return f"{chemin}: {mot_cle}"
