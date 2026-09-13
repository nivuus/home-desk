"""Le miroir voluptuous de contrat/ecran.schema.json.

DEUX validateurs pour une seule forme, et c'est assume : ajv ne tourne pas dans
Home Assistant, voluptuous ne tourne pas dans un navigateur. Ce qui les empeche
de diverger n'est pas la discipline, c'est contrat/cas-schema.json — un corpus
que les DEUX suites rejouent, ou un cas present d'un cote et absent de l'autre
est impossible puisque c'est le meme fichier.

`fautes.motif()` (reexportee ici) rend la faute au format du corpus :
`chemin: mot-cle`. Les deux validateurs doivent nommer le MEME endroit ; sans
quoi un test negatif passe pour la mauvaise raison. La hierarchie `_Faute` et
`motif()` elle-meme vivent dans `fautes.py`, separees d'ici en ronde 3 de
relecture (une seule et meme preoccupation — nommer une faute — pas celle de
ce module, qui MIROITE le contrat).

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

Les validateurs FEUILLE (`_chaine`, `_enum`, `_const`, `_uniques`...) vivent
dans `validateurs.py`, separes d'ici en relecture finale de branche
(deuxieme ronde) pour la MEME raison que `fautes.py` (ronde 3, tache 6) :
une couture reelle, pas une coupe arbitraire pour rester sous 500 lignes.
Ce module reste le SEUL a LIRE le contrat embarque ; `validateurs.py` ne
fait que composer des fabriques pures, parametrees par ce que CE module
en tire (`HAUTEUR_MIN`/`HAUTEUR_MAX`, notamment)."""
from __future__ import annotations

import json
import pathlib
import re

import voluptuous as vol

from .const import VERSION_CONFIG
from .fautes import (
    _FauteMinItems,
    _FauteType,
    localiser,
    motif,
)

# Decision de la tache 3 : jamais "../../contrat", toujours relatif au module.
# Clouee par test_schema_lit_le_contrat_embarque (tests/composant/test_schema.py).
CHEMIN_SCHEMA = pathlib.Path(__file__).parent / "contrat" / "ecran.schema.json"

# Publique (ronde de correction 2, tache 7) : ce module reste le SEUL a LIRE
# le contrat embarque (voir la docstring de module) -- `registre.py` avait
# ouvert sa PROPRE lecture du meme fichier pour descendre valeur/sous-schema
# en parallele (`entites_dans`), une seconde copie que ce module existe pour
# empecher. Meme raisonnement que `HAUTEUR_MIN`/`HAUTEUR_MAX` ci-dessous : le
# JSON deja lu, publie une seule fois, ici.
SCHEMA_JSON = json.loads(CHEMIN_SCHEMA.read_text(encoding="utf-8"))

_DEFS = SCHEMA_JSON["$defs"]

_ICONES = frozenset(_DEFS["bouton"]["properties"]["icone"]["enum"])
_OPERATEURS = frozenset(_DEFS["synthese"]["properties"]["operateur"]["enum"])

_ENTITE_PATTERN = re.compile(_DEFS["entite"]["pattern"])
_VUE_PATTERN = re.compile(_DEFS["bouton"]["properties"]["vue"]["pattern"])

# Publiques (pas de prefixe _) : config_flow.py les reutilise pour refuser
# une hauteur hors bornes DES LA SAISIE, avant que schema.valider() ne le
# fasse plus tard sur l'ecran complet. Les bornes viennent du contrat une
# seule fois, ici ; les redupliquer en dur dans config_flow.py aurait ete
# exactement la seconde copie que ce fichier existe pour empecher.
HAUTEUR_MIN = SCHEMA_JSON["properties"]["hauteurUtile"]["minimum"]
HAUTEUR_MAX = SCHEMA_JSON["properties"]["hauteurUtile"]["maximum"]

# Ronde 2 de relecture (tache 8) : DERIVEE du contrat, exactement comme
# HAUTEUR_MIN/HAUTEUR_MAX ci-dessus -- jamais un `1` retape a la main. La
# ronde 1 avait couple `_const(1)` a `const.VERSION_CONFIG` (import), mais
# son commentaire affirmait a tort que `version` serait « propre a
# home_desk, pas au contrat partage avec ajv » : FAUX, mesure --
# `contrat/ecran.schema.json:10` porte `"version": {"const": 1}`, le MEME
# fichier que `SCHEMA_JSON` lit ligne 57 et qu'ajv consomme aussi. Ce qui
# est propre a home_desk, c'est seulement l'ABSENCE de cas sur `version`
# dans `contrat/cas-schema.json` (compte : 0) -- la mesure d'un trou de
# couverture du corpus partage, pas une dispense de le lire depuis lui.
#
# L'assertion ci-dessous fait du contrat l'AUTORITE : si quelqu'un change
# `VERSION_CONFIG` (const.py) sans repercuter le contrat (ou l'inverse),
# l'import de ce module echoue net plutot que de laisser les deux copies
# diverger en silence.
VERSION_SCHEMA: int = SCHEMA_JSON["properties"]["version"]["const"]
assert VERSION_SCHEMA == VERSION_CONFIG, (
    f"contrat/ecran.schema.json declare version={VERSION_SCHEMA!r} mais "
    f"const.VERSION_CONFIG vaut {VERSION_CONFIG!r} -- les deux doivent "
    "rester identiques : le second est la version de FORME que ce "
    "composant sait lire, le premier est celle que le contrat publie."
)

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
# MODULATEURS sont des LISTES ordonnees des maintenant, alors qu'AUCUN
# formulaire ne les consomme encore (elles ne servent ici qu'a la validation
# d'appartenance, via `frozenset(...)` construit a la volee plus bas dans
# AGENCEMENT) -- la tache "Blocs et modes" (apres la tache 6) leur donnera un
# SelectSelector, exactement comme OPERATEURS pour la ligne de synthese.
# Correction PREVENTIVE, ronde 2 de relecture de la tache 6 : les ecrire en
# frozenset aujourd'hui et les decouvrir non ordonnees ce jour-la aurait ete
# la MEME dette qu'OPERATEURS portait avant la ronde 1, repoussee d'une tache
# pour rien. Listes, jamais des ensembles prives : le meme ordre que le
# contrat, garanti stable d'un processus Python a l'autre.
ZONES: list[str] = list(_DEFS["agencement"]["properties"]["zones"]["items"]["enum"])
BLOC_DEFAUT: list[str] = list(_DEFS["agencement"]["properties"]["blocDefaut"]["enum"])
MODES: list[str] = list(_DEFS["agencement"]["properties"]["modes"]["items"]["enum"])
MODULATEURS: list[str] = list(_DEFS["agencement"]["properties"]["modulateurs"]["items"]["enum"])


# --------------------------------------------------------------------------
# Validateurs feuille : DEPLACES dans validateurs.py en relecture finale de
# branche (deuxieme ronde), pour rester sous 500 lignes -- meme couture que
# celle qui avait deja produit fautes.py (ronde 3, tache 6). `hauteur_utile`
# reste l'exception : sa fabrique (`_hauteur_utile`) vit la-bas, mais SA
# VALEUR PUBLIQUE (bornee par le contrat EMBARQUE que SEUL ce module lit)
# est composee ICI, pour que `config_flow.py`/`objets.py` continuent de la
# lire comme `schema.hauteur_utile`, sans aucun changement d'interface.
# --------------------------------------------------------------------------
from .validateurs import (  # noqa: E402
    _alerte_en_tete,
    _chaine,
    _const,
    _enum,
    _hauteur_utile,
    _motif_chaine,
    _paire_service,
    _trie,
    _uniques,
)

hauteur_utile = _hauteur_utile(HAUTEUR_MIN, HAUTEUR_MAX)

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
        vol.Optional("service"): _paire_service(),
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
            [_enum(frozenset(MODES))], _uniques(), vol.Contains("defaut"), _alerte_en_tete()
        ),
        vol.Required("modulateurs"): vol.All([_enum(frozenset(MODULATEURS))], _uniques(), _trie()),
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
        # Ronde 2 de relecture (tache 8) : `_const(VERSION_SCHEMA)`, DERIVEE
        # du contrat (voir sa definition plus haut, a cote de HAUTEUR_MIN),
        # et non plus `_const(VERSION_CONFIG)` -- la ronde 1 avait couple
        # a la constante Python, mais la valeur qui compte ICI est celle
        # QUE LE CONTRAT PUBLIE, l'assertion module-level garantissant deja
        # que les deux ne peuvent pas diverger silencieusement.
        vol.Optional("version"): _const(VERSION_SCHEMA),
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

