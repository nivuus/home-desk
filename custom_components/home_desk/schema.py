"""Le miroir voluptuous de contrat/ecran.schema.json.

DEUX validateurs pour une seule forme, et c'est assume : ajv ne tourne pas dans
Home Assistant, voluptuous ne tourne pas dans un navigateur. Ce qui les empeche
de diverger n'est pas la discipline, c'est contrat/cas-schema.json — un corpus
que les DEUX suites rejouent, ou un cas present d'un cote et absent de l'autre
est impossible puisque c'est le meme fichier.

`motif()` rend la faute au format du corpus : `chemin: mot-cle`. Les deux
validateurs doivent nommer le MEME endroit ; sans quoi un test negatif passe
pour la mauvaise raison.

Le schema lu ici est celui EMBARQUE (`contrat/` sous ce module), jamais celui
du depot : une fois installe, ce composant tourne depuis
config/custom_components/home_desk/ et n'a aucun chemin vers le depot. Un
chemin relatif remontant vers ../../contrat marcherait en test (le depot est
la) et casserait en production — sans qu'aucune suite ne le voie, puisque les
trois tournent depuis le depot. D'ou `pathlib.Path(__file__).parent`, jamais
un chemin qui remonte.

Les vocabulaires qui bougent (icones, operateurs, enums d'agencement) sont LUS
depuis ce JSON plutot que retranscrits en dur : une troisieme copie a la main,
a cote de celle deja generee dans ecran.schema.json depuis icones.json,
serait exactement la sorte de divergence silencieuse que ce fichier existe
pour empecher.
"""
from __future__ import annotations

import json
import pathlib
import re

import voluptuous as vol

# Decision de la tache 3 : jamais "../../contrat", toujours relatif au module.
# Clouee par test_schema_lit_le_contrat_embarque (tests/composant/test_schema.py).
CHEMIN_SCHEMA = pathlib.Path(__file__).parent / "contrat" / "ecran.schema.json"

_SCHEMA_JSON = json.loads(CHEMIN_SCHEMA.read_text(encoding="utf-8"))

_DEFS = _SCHEMA_JSON["$defs"]

_ICONES = frozenset(_DEFS["bouton"]["properties"]["icone"]["enum"])
_OPERATEURS = frozenset(_DEFS["synthese"]["properties"]["operateur"]["enum"])
_ZONES = frozenset(_DEFS["agencement"]["properties"]["zones"]["items"]["enum"])
_BLOC_DEFAUT = frozenset(_DEFS["agencement"]["properties"]["blocDefaut"]["enum"])
_MODES = frozenset(_DEFS["agencement"]["properties"]["modes"]["items"]["enum"])
_MODULATEURS = frozenset(_DEFS["agencement"]["properties"]["modulateurs"]["items"]["enum"])

_ENTITE_PATTERN = re.compile(_DEFS["entite"]["pattern"])
_VUE_PATTERN = re.compile(_DEFS["bouton"]["properties"]["vue"]["pattern"])

_HAUTEUR_MIN = _SCHEMA_JSON["properties"]["hauteurUtile"]["minimum"]
_HAUTEUR_MAX = _SCHEMA_JSON["properties"]["hauteurUtile"]["maximum"]


# --------------------------------------------------------------------------
# Validateurs feuille. Chacun leve vol.Invalid avec error_type = le mot-cle
# JSON Schema qu'il traduit ("type", "pattern", "minimum", "enum", ...) — pas
# un message libre : c'est cette valeur que motif() rapporte telle quelle.
# --------------------------------------------------------------------------

def _chaine(min_len: int = 0):
    """Un `str`, avec au besoin une longueur minimale (`minLength`)."""

    def valider(valeur):
        if not isinstance(valeur, str):
            raise vol.Invalid("attendu une chaine", error_type="type")
        if min_len and len(valeur) < min_len:
            raise vol.Invalid(f"longueur minimale {min_len}", error_type="minLength")
        return valeur

    return valider


def _motif_chaine(regex: re.Pattern, min_len: int = 0):
    """Un `str` qui doit en plus respecter un `pattern`."""

    def valider(valeur):
        if not isinstance(valeur, str):
            raise vol.Invalid("attendu une chaine", error_type="type")
        if min_len and len(valeur) < min_len:
            raise vol.Invalid(f"longueur minimale {min_len}", error_type="minLength")
        if not regex.match(valeur):
            raise vol.Invalid("ne respecte pas le motif attendu", error_type="pattern")
        return valeur

    return valider


def _enum(valeurs: frozenset):
    def valider(valeur):
        if valeur not in valeurs:
            raise vol.Invalid(f"doit etre parmi {sorted(valeurs)}", error_type="enum")
        return valeur

    return valider


def _const(attendu):
    """Le pendant de `"const": ...` : type ET valeur, sans confondre 1 et True."""

    def valider(valeur):
        if type(valeur) is not type(attendu) or valeur != attendu:
            raise vol.Invalid(f"doit valoir {attendu!r}", error_type="const")
        return valeur

    return valider


def _hauteur_utile(valeur):
    if isinstance(valeur, bool) or not isinstance(valeur, int):
        raise vol.Invalid("attendu un entier", error_type="type")
    if valeur < _HAUTEUR_MIN:
        raise vol.Invalid(f"minimum {_HAUTEUR_MIN}", error_type="minimum")
    if valeur > _HAUTEUR_MAX:
        raise vol.Invalid(f"maximum {_HAUTEUR_MAX}", error_type="maximum")
    return valeur


ENTITE = _motif_chaine(_ENTITE_PATTERN)


# --------------------------------------------------------------------------
# Objets imbriques ($defs/*)
# --------------------------------------------------------------------------

BOUTON = vol.Schema(
    {
        vol.Required("libelle"): _chaine(1),
        vol.Required("icone"): vol.All(_chaine(1), _enum(_ICONES)),
        vol.Required("entite"): ENTITE,
        vol.Optional("cible"): ENTITE,
        vol.Optional("service"): vol.All([_chaine(1)], vol.Length(min=2, max=2)),
        vol.Optional("lien"): _chaine(1),
        vol.Optional("vue"): _motif_chaine(_VUE_PATTERN),
        vol.Optional("epingle"): _const(True),
        vol.Optional("absenceNommee"): _chaine(),
        vol.Optional("note"): _chaine(),
    },
    extra=vol.PREVENT_EXTRA,
)


def _valeur_synthese(donnee: dict) -> dict:
    """Les deux `allOf` de $defs/synthese : le type de `valeur` depend de
    `operateur`. `path=["valeur"]` : c'est la valeur, pas l'objet entier, que
    ajv designe (`/synthese/0/valeur`)."""
    operateur = donnee.get("operateur")
    valeur = donnee.get("valeur")
    est_nombre = isinstance(valeur, (int, float)) and not isinstance(valeur, bool)
    if operateur in ("<", ">") and not est_nombre:
        raise vol.Invalid("valeur doit etre un nombre", path=["valeur"], error_type="type")
    if operateur in ("==", "!=") and not (est_nombre or isinstance(valeur, str)):
        raise vol.Invalid("valeur doit etre une chaine ou un nombre", path=["valeur"], error_type="type")
    return donnee


SYNTHESE = vol.All(
    vol.Schema(
        {
            vol.Required("entite"): ENTITE,
            vol.Required("texte"): _chaine(1),
            vol.Required("operateur"): _enum(_OPERATEURS),
            vol.Required("valeur"): object,
            vol.Optional("perso"): _const(True),
            vol.Optional("horsTaches"): _const(True),
            vol.Optional("absenceNommee"): _chaine(),
            vol.Optional("note"): _chaine(),
        },
        extra=vol.PREVENT_EXTRA,
    ),
    _valeur_synthese,
)

_ALLUMEE = vol.Schema(
    {
        vol.Required("entite"): ENTITE,
        vol.Required("etats"): [_chaine()],
    },
    extra=vol.PREVENT_EXTRA,
)

SOURCE = vol.Schema(
    {
        vol.Required("nom"): _chaine(1),
        vol.Required("titre"): [ENTITE],
        vol.Required("sousTitre"): [ENTITE],
        vol.Required("affiche"): [ENTITE],
        vol.Required("progression"): [ENTITE],
        vol.Required("transport"): [ENTITE],
        vol.Required("volume"): [ENTITE],
        vol.Optional("allumee"): _ALLUMEE,
        vol.Optional("note"): _chaine(),
    },
    extra=vol.PREVENT_EXTRA,
)

MINUTEUR_SLOT = vol.Schema(
    {
        vol.Required("timer"): ENTITE,
        vol.Required("nom"): ENTITE,
        vol.Optional("note"): _chaine(),
    },
    extra=vol.PREVENT_EXTRA,
)

VOITURE = vol.Schema(
    {
        vol.Required("batterie"): ENTITE,
        vol.Required("autonomie"): ENTITE,
        vol.Required("branchee"): ENTITE,
        vol.Required("enCharge"): ENTITE,
        vol.Required("clim"): ENTITE,
        vol.Required("demarrerClim"): ENTITE,
        vol.Required("arreterClim"): ENTITE,
        vol.Optional("note"): _chaine(),
    },
    extra=vol.PREVENT_EXTRA,
)

AGENCEMENT = vol.Schema(
    {
        vol.Required("zones"): vol.All(
            [_enum(_ZONES)], vol.Unique(), vol.Contains("commandes")
        ),
        vol.Optional("blocDefaut"): _enum(_BLOC_DEFAUT),
        vol.Required("modes"): vol.All(
            [_enum(_MODES)], vol.Unique(), vol.Contains("defaut")
        ),
        vol.Required("modulateurs"): vol.All([_enum(_MODULATEURS)], vol.Unique()),
        vol.Optional("note"): _chaine(),
    },
    extra=vol.PREVENT_EXTRA,
)


# --------------------------------------------------------------------------
# La forme complete, et les trois invariants croises que l'allOf racine du
# JSON Schema exprime (README.md, contrat/) : blocDefaut "voiture" => voiture,
# mode "minuteur" => minuteurs non vide. Le troisieme (agencement complet) est
# deja porte par AGENCEMENT ci-dessus (ses trois listes sont Required).
# --------------------------------------------------------------------------

_ECRAN_STRUCTURE = vol.Schema(
    {
        vol.Optional("version"): _const(1),
        vol.Required("nom"): _chaine(1),
        vol.Optional("note"): _chaine(),
        vol.Optional("hauteurUtile"): _hauteur_utile,
        vol.Required("temperature"): ENTITE,
        vol.Required("ambiances"): [BOUTON],
        vol.Required("commandes"): [BOUTON],
        vol.Required("extrasMaison"): [BOUTON],
        vol.Optional("aspirateurMaison"): BOUTON,
        vol.Required("synthese"): [SYNTHESE],
        vol.Required("sources"): [SOURCE],
        vol.Required("ouvrants"): [ENTITE],
        vol.Optional("aspirateur"): ENTITE,
        vol.Optional("listesTachesExtra"): [ENTITE],
        vol.Optional("minuteurs"): [MINUTEUR_SLOT],
        vol.Optional("etiquettesMinuteur"): [_chaine()],
        vol.Optional("voiture"): VOITURE,
        vol.Optional("delorean"): _const(True),
        vol.Optional("agencement"): AGENCEMENT,
    },
    extra=vol.PREVENT_EXTRA,
)


def _invariants_croises(ecran: dict) -> dict:
    """Les deux `if`/`then` de l'`allOf` racine. `vol.RequiredFieldInvalid`
    avec `path=[<champ manquant>]` : motif() en retire le dernier segment,
    exactement comme pour un `required` structurel — c'est le meme mot-cle,
    juste porte par une regle inter-champs plutot que par le dict lui-meme."""
    agencement = ecran.get("agencement")
    if not agencement:
        return ecran

    if agencement.get("blocDefaut") == "voiture" and "voiture" not in ecran:
        raise vol.RequiredFieldInvalid("voiture est requis quand blocDefaut vaut voiture", path=["voiture"])

    if "minuteur" in agencement.get("modes", []):
        if "minuteurs" not in ecran:
            raise vol.RequiredFieldInvalid("minuteurs est requis quand le mode minuteur est present", path=["minuteurs"])
        if len(ecran["minuteurs"]) < 1:
            raise vol.Invalid("minuteurs ne doit pas etre vide", path=["minuteurs"], error_type="minItems")

    return ecran


ECRAN: vol.Schema = vol.Schema(vol.All(_ECRAN_STRUCTURE, _invariants_croises))


def valider(brut: dict) -> dict:
    """Valide et normalise un ecran. Leve vol.Invalid (en pratique une
    vol.MultipleInvalid, qui en est une sous-classe) si `brut` n'est pas
    conforme."""
    return ECRAN(brut)


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
    """
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
    else:
        mot_cle = err.error_type or "invalid"

    chemin = "/" + "/".join(str(p) for p in chemin_parts) if chemin_parts else ""
    return f"{chemin}: {mot_cle}"
