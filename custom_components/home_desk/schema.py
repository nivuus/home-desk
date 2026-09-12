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

_ENTITE_PATTERN = re.compile(_DEFS["entite"]["pattern"])
_VUE_PATTERN = re.compile(_DEFS["bouton"]["properties"]["vue"]["pattern"])

# Publiques (pas de prefixe _) : config_flow.py les reutilise pour refuser
# une hauteur hors bornes DES LA SAISIE, avant que schema.valider() ne le
# fasse plus tard sur l'ecran complet. Les bornes viennent du contrat une
# seule fois, ici ; les redupliquer en dur dans config_flow.py aurait ete
# exactement la seconde copie que ce fichier existe pour empecher.
HAUTEUR_MIN = _SCHEMA_JSON["properties"]["hauteurUtile"]["minimum"]
HAUTEUR_MAX = _SCHEMA_JSON["properties"]["hauteurUtile"]["maximum"]

# Publique pour la meme raison : listes.py construit le SelectSelector
# d'`operateur` de la ligne de synthese sur CES quatre valeurs, jamais une
# liste ecrite a la main a cote de _OPERATEURS. LISTE, pas _OPERATEURS
# (un frozenset) : un menu affiche dans l'ORDRE de ses options, et l'ordre
# d'un frozenset n'est pas garanti stable d'un processus Python a l'autre
# (verifie : trois lancements, trois ordres) — corrige en ronde 1 de
# relecture de la tache 6. La liste vient du JSON directement, jamais de
# l'ensemble prive derive pour la validation membership.
OPERATEURS: list[str] = list(_DEFS["synthese"]["properties"]["operateur"]["enum"])

# Publiques pour la MEME raison qu'OPERATEURS : ZONES, BLOC_DEFAUT, MODES et
# MODULATEURS restent des `frozenset` PRIVES tant qu'aucun formulaire ne les
# consomme (`_zones`/`_bloc_defaut`/`_modes`/`_modulateurs` ci-dessous, pour
# la seule validation d'appartenance) -- mais la tache "Blocs et modes"
# (apres la tache 6) leur donnera un SelectSelector, exactement comme
# OPERATEURS pour la ligne de synthese. Correction PREVENTIVE, ronde 2 de
# relecture de la tache 6 : ecrire ces quatre listes en frozenset aujourd'hui
# et les decouvrir non ordonnees ce jour-la serait la MEME dette qu'OPERATEURS
# portait avant la ronde 1, repoussee d'une tache pour rien. Listes, jamais
# les ensembles prives : le meme ordre que le contrat, garanti stable d'un
# processus Python a l'autre.
ZONES: list[str] = list(_DEFS["agencement"]["properties"]["zones"]["items"]["enum"])
BLOC_DEFAUT: list[str] = list(_DEFS["agencement"]["properties"]["blocDefaut"]["enum"])
MODES: list[str] = list(_DEFS["agencement"]["properties"]["modes"]["items"]["enum"])
MODULATEURS: list[str] = list(_DEFS["agencement"]["properties"]["modulateurs"]["items"]["enum"])


# --------------------------------------------------------------------------
# Validateurs feuille. Chacun leve une SOUS-CLASSE de vol.Invalid dediee au
# mot-cle JSON Schema qu'il traduit ("type", "pattern", "minimum", "enum",
# ...) — jamais un vol.Invalid generique avec error_type="...".
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


def _chaine(min_len: int = 0):
    """Un `str`, avec au besoin une longueur minimale (`minLength`)."""

    def valider(valeur):
        if not isinstance(valeur, str):
            raise _FauteType("attendu une chaine")
        if min_len and len(valeur) < min_len:
            raise _FauteMinLength(f"longueur minimale {min_len}")
        return valeur

    return valider


def _motif_chaine(regex: re.Pattern, min_len: int = 0):
    """Un `str` qui doit en plus respecter un `pattern`."""

    def valider(valeur):
        if not isinstance(valeur, str):
            raise _FauteType("attendu une chaine")
        if min_len and len(valeur) < min_len:
            raise _FauteMinLength(f"longueur minimale {min_len}")
        if not regex.match(valeur):
            raise _FautePattern("ne respecte pas le motif attendu")
        return valeur

    return valider


def _enum(valeurs):
    def valider(valeur):
        if valeur not in valeurs:
            raise _FauteEnum(f"doit etre parmi {sorted(valeurs)}")
        return valeur

    return valider


def _const(attendu):
    """Le pendant de `"const": ...` : type ET valeur, sans confondre 1 et True."""

    def valider(valeur):
        if type(valeur) is not type(attendu) or valeur != attendu:
            raise _FauteConst(f"doit valoir {attendu!r}")
        return valeur

    return valider


def hauteur_utile(valeur):
    """Publique : reutilisee telle quelle par config_flow.py (EcranSubentryFlow),
    pour que le formulaire de saisie refuse la MEME plage que schema.valider().
    Le nom sans prefixe EST l'interface ; ne pas le re-prefixer sans repercuter
    l'import de config_flow.py."""
    if isinstance(valeur, bool) or not isinstance(valeur, int):
        raise _FauteType("attendu un entier")
    if valeur < HAUTEUR_MIN:
        raise _FauteMinimum(f"minimum {HAUTEUR_MIN}")
    if valeur > HAUTEUR_MAX:
        raise _FauteMaximum(f"maximum {HAUTEUR_MAX}")
    return valeur


def paire_service():
    """Le pendant de `"service": {"minItems": 2, "maxItems": 2, "items":
    {"type": "string", "minLength": 1}}`. Ecrit a la main plutot qu'avec
    `vol.Length` : ce dernier ne distingue pas minItems de maxItems dans sa
    classe, et son message ("length must be...") ne survivrait pas plus que
    error_type au passage dans un dict — la meme fragilite qui a motive
    `_Faute` ci-dessus, appliquee ici puisque le cout marginal est nul une
    fois la hierarchie en place.

    Publique (sans prefixe, ronde 2 de relecture de la tache 6) :
    `listes_champs._construire_donnee_bouton` la REUTILISE pour refuser une
    paire service_domaine/service_action a demi remplie, plutot que
    d'ecrire une seconde regle "il en faut exactement deux" a cote de celle-
    ci -- le meme motif ("minItems"/"maxItems") nomme le refus des DEUX
    cotes (formulaire ET validation finale de schema.BOUTON), jamais deux
    regles qui pourraient diverger."""
    chaine_non_vide = _chaine(1)

    def valider(valeur):
        if not isinstance(valeur, list):
            raise _FauteType("attendu une liste")
        if len(valeur) < 2:
            raise _FauteMinItems("service attend exactement 2 elements")
        if len(valeur) > 2:
            raise _FauteMaxItems("service attend exactement 2 elements")
        return [chaine_non_vide(v) for v in valeur]

    return valider


def _uniques():
    """Le pendant de `"uniqueItems": true`. Remplace `vol.Unique()` pour la
    meme raison que `paire_service` remplace `vol.Length` : rester dans notre
    propre hierarchie d'exceptions plutot que dans le vocabulaire interne de
    voluptuous."""

    def valider(valeur):
        vus = []
        for item in valeur:
            if item in vus:
                raise _FauteUniqueItems(f"doublon : {item!r}")
            vus.append(item)
        return valeur

    return valider


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
        vol.Optional("service"): paire_service(),
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
        raise _FauteType("valeur doit etre un nombre", path=["valeur"])
    if operateur in ("==", "!=") and not (est_nombre or isinstance(valeur, str)):
        raise _FauteType("valeur doit etre une chaine ou un nombre", path=["valeur"])
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
            [_enum(frozenset(ZONES))], _uniques(), vol.Contains("commandes")
        ),
        vol.Optional("blocDefaut"): _enum(frozenset(BLOC_DEFAUT)),
        vol.Required("modes"): vol.All(
            [_enum(frozenset(MODES))], _uniques(), vol.Contains("defaut")
        ),
        vol.Required("modulateurs"): vol.All([_enum(frozenset(MODULATEURS))], _uniques()),
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
        vol.Optional("hauteurUtile"): hauteur_utile,
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
            raise _FauteMinItems("minuteurs ne doit pas etre vide", path=["minuteurs"])

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
    elif isinstance(err, _Faute):
        mot_cle = err.mot_cle
    else:
        mot_cle = err.error_type or "invalid"

    chemin = "/" + "/".join(str(p) for p in chemin_parts) if chemin_parts else ""
    return f"{chemin}: {mot_cle}"
