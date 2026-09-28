"""The voluptuous mirror of contrat/ecran.schema.json.

TWO validators for a single shape, and that is deliberate: ajv does not run
in Home Assistant, voluptuous does not run in a browser. What keeps them from
diverging is not discipline, it is contrat/cas-schema.json — a corpus that
BOTH suites replay, where a case present on one side and absent from the
other is impossible since it is the same file.

`fautes.motif()` (re-exported here) returns the fault in the corpus format:
`path: keyword`. Both validators must name the SAME place; otherwise a
negative test passes for the wrong reason. The `_Faute` hierarchy and
`motif()` itself live in `fautes.py`, split from here in review round 3 (one
and the same concern — naming a fault — not this module's concern, which
MIRRORS the contract).

The schema read here is the EMBEDDED one (`contrat/` under this module),
never the repository's: once installed, this component runs from
config/custom_components/home_desk/ and has no path to the repository. A
relative path climbing up to ../../contrat would work in tests (the
repository is there) and break in production — without any suite seeing
it, since all three run from the repository. Hence
`pathlib.Path(__file__).parent`, never a path that climbs up.

The vocabularies that move (icons, operators, layout enums) are READ from
this JSON rather than transcribed by hand: a third hand-made copy, next to
the one already generated into ecran.schema.json from icones.json, would be
exactly the kind of silent divergence this file exists to prevent.

The LEAF validators (`_string`, `_enum`, `_const`, `_uniques`...) live in
`validateurs.py`, split from here during the final branch review (second
round) for the SAME reason as `fautes.py` (round 3, task 6): a real seam,
not an arbitrary cut to stay under 500 lines. This module remains the ONLY
one that READS the embedded contract; `validateurs.py` only composes pure
factories, parameterised by what THIS module extracts from it
(`HAUTEUR_MIN`/`HAUTEUR_MAX`, notably)."""
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

# Task 3 decision: never "../../contrat", always relative to the module.
# Pinned by test_schema_lit_le_contrat_embarque (tests/composant/test_schema.py).
CHEMIN_SCHEMA = pathlib.Path(__file__).parent / "contrat" / "ecran.schema.json"

# Public (fix round 2, task 7): this module remains the ONLY one that READS
# the embedded contract (see the module docstring) -- `registre.py` had
# opened its OWN read of the same file to walk value/sub-schema in parallel
# (`entities_in`), a second copy this module exists to prevent. Same
# reasoning as `HAUTEUR_MIN`/`HAUTEUR_MAX` below: the JSON already read,
# published once, here.
SCHEMA_JSON = json.loads(CHEMIN_SCHEMA.read_text(encoding="utf-8"))

_DEFS = SCHEMA_JSON["$defs"]

_ICONES = frozenset(_DEFS["bouton"]["properties"]["icone"]["enum"])
_OPERATEURS = frozenset(_DEFS["synthese"]["properties"]["operateur"]["enum"])

_ENTITE_PATTERN = re.compile(_DEFS["entite"]["pattern"])
_VUE_PATTERN = re.compile(_DEFS["bouton"]["properties"]["vue"]["pattern"])

# Public (no _ prefix): config_flow.py reuses them to refuse an
# out-of-bounds height AS SOON AS IT IS ENTERED, before schema.valider()
# does it later on the complete screen. The bounds come from the contract
# once, here; duplicating them by hand in config_flow.py would have been
# exactly the second copy this file exists to prevent.
HAUTEUR_MIN = SCHEMA_JSON["properties"]["hauteurUtile"]["minimum"]
HAUTEUR_MAX = SCHEMA_JSON["properties"]["hauteurUtile"]["maximum"]

# Review round 2 (task 8): DERIVED from the contract, exactly like
# HAUTEUR_MIN/HAUTEUR_MAX above -- never a `1` retyped by hand. Round 1 had
# coupled `_const(1)` to `const.VERSION_CONFIG` (import), but its comment
# wrongly claimed that `version` would be "specific to home_desk, not to the
# contract shared with ajv": FALSE, measured --
# `contrat/ecran.schema.json:10` carries `"version": {"const": N}`, the SAME
# file that `SCHEMA_JSON` reads on line 57 and that ajv consumes too. What
# is specific to home_desk is only the ABSENCE of cases on `version` in
# `contrat/cas-schema.json` (count: 0) -- the measure of a coverage gap in
# the shared corpus, not an exemption from reading it from there.
#
# The assertion below makes the contract the AUTHORITY: if someone changes
# `VERSION_CONFIG` (const.py) without carrying it over to the contract (or
# the reverse), importing this module fails outright rather than letting the
# two copies silently diverge.
VERSION_SCHEMA: int = SCHEMA_JSON["properties"]["version"]["const"]
assert VERSION_SCHEMA == VERSION_CONFIG, (
    f"contrat/ecran.schema.json declares version={VERSION_SCHEMA!r} but "
    f"const.VERSION_CONFIG is {VERSION_CONFIG!r} -- the two must stay "
    "identical: the second is the SHAPE version this component can read, "
    "the first is the one the contract publishes."
)

# Public for the same reason: list_sections.py builds the `operateur`
# SelectSelector of the summary line on THESE four values, never a list
# written by hand next to _OPERATEURS. A LIST, not _OPERATEURS (a
# frozenset): a menu displays in the ORDER of its options, and the order of
# a frozenset is not guaranteed stable from one Python process to another
# (verified: three runs, three orders) — fixed in review round 1 of task 6.
# The list comes straight from the JSON, never from the private set derived
# for membership validation.
OPERATEURS: list[str] = list(_DEFS["synthese"]["properties"]["operateur"]["enum"])

# Public for the SAME reason as OPERATEURS: ZONES, BLOC_DEFAUT, MODES and
# MODULATEURS are ordered LISTS from now on, although NO form consumes them
# yet (here they only serve membership validation, via `frozenset(...)`
# built on the fly further down in AGENCEMENT) -- the "Blocks and modes"
# task (after task 6) will give them a SelectSelector, exactly like
# OPERATEURS for the summary line. PREVENTIVE fix, review round 2 of task
# 6: writing them as frozensets today and discovering them unordered on
# that day would have been the SAME debt OPERATEURS carried before round 1,
# postponed by one task for nothing. Lists, never private sets: the same
# order as the contract, guaranteed stable from one Python process to
# another.
ZONES: list[str] = list(_DEFS["agencement"]["properties"]["zones"]["items"]["enum"])
BLOC_DEFAUT: list[str] = list(_DEFS["agencement"]["properties"]["blocDefaut"]["enum"])
MODES: list[str] = list(_DEFS["agencement"]["properties"]["modes"]["items"]["enum"])
MODULATEURS: list[str] = list(_DEFS["agencement"]["properties"]["modulateurs"]["items"]["enum"])


# --------------------------------------------------------------------------
# Leaf validators: MOVED to validateurs.py during the final branch review
# (second round), to stay under 500 lines -- same seam as the one that had
# already produced fautes.py (round 3, task 6). `hauteur_utile` remains the
# exception: its factory (`_hauteur_utile`) lives over there, but ITS
# PUBLIC VALUE (bounded by the EMBEDDED contract that ONLY this module
# reads) is composed HERE, so that `config_flow.py`/`objets.py` keep reading
# it as `schema.hauteur_utile`, with no interface change at all.
# --------------------------------------------------------------------------
from .validateurs import (  # noqa: E402
    _alerte_en_tete,
    _string,
    _const,
    _enum,
    _hauteur_utile,
    _string_pattern,
    _paire_service,
    _trie,
    _uniques,
)

hauteur_utile = _hauteur_utile(HAUTEUR_MIN, HAUTEUR_MAX)

ENTITE = _string_pattern(_ENTITE_PATTERN)


# --------------------------------------------------------------------------
# Nested objects ($defs/*)
# --------------------------------------------------------------------------

BOUTON = vol.Schema(
    {
        vol.Required("libelle"): _string(1),
        vol.Required("icone"): vol.All(_string(1), _enum(_ICONES)),
        vol.Required("entite"): ENTITE,
        vol.Optional("cible"): ENTITE,
        vol.Optional("service"): _paire_service(),
        vol.Optional("lien"): _string(1),
        vol.Optional("vue"): _string_pattern(_VUE_PATTERN),
        vol.Optional("epingle"): _const(True),
        vol.Optional("absenceNommee"): _string(),
        vol.Optional("note"): _string(),
    },
    extra=vol.PREVENT_EXTRA,
)


def _summary_value(item_data: dict) -> dict:
    """The two `allOf` of $defs/synthese: the type of the value field
    depends on `operateur`. The path names that value field, not the whole
    object: it is the field, not the object, that ajv designates (the value
    field under `/synthese/0/`)."""
    operateur = item_data.get("operateur")
    value = item_data.get("valeur")
    is_number = isinstance(value, (int, float)) and not isinstance(value, bool)
    if operateur in ("<", ">") and not is_number:
        raise _FauteType("valeur doit etre un nombre", path=["valeur"])
    if operateur in ("==", "!=") and not (is_number or isinstance(value, str)):
        raise _FauteType("valeur doit etre une chaine ou un nombre", path=["valeur"])
    return item_data


SYNTHESE = vol.All(
    vol.Schema(
        {
            vol.Required("entite"): ENTITE,
            vol.Required("texte"): _string(1),
            vol.Required("operateur"): _enum(_OPERATEURS),
            vol.Required("valeur"): object,
            vol.Optional("perso"): _const(True),
            vol.Optional("horsTaches"): _const(True),
            vol.Optional("absenceNommee"): _string(),
            vol.Optional("note"): _string(),
        },
        extra=vol.PREVENT_EXTRA,
    ),
    _summary_value,
)

_ALLUMEE = vol.Schema(
    {
        vol.Required("entite"): ENTITE,
        vol.Required("etats"): [_string()],
    },
    extra=vol.PREVENT_EXTRA,
)

SOURCE = vol.Schema(
    {
        vol.Required("nom"): _string(1),
        vol.Required("titre"): [ENTITE],
        vol.Required("sousTitre"): [ENTITE],
        vol.Required("affiche"): [ENTITE],
        vol.Required("progression"): [ENTITE],
        vol.Required("transport"): [ENTITE],
        vol.Required("volume"): [ENTITE],
        vol.Optional("allumee"): _ALLUMEE,
        vol.Optional("note"): _string(),
    },
    extra=vol.PREVENT_EXTRA,
)

MINUTEUR_SLOT = vol.Schema(
    {
        vol.Required("timer"): ENTITE,
        vol.Required("nom"): ENTITE,
        vol.Optional("note"): _string(),
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
        vol.Optional("note"): _string(),
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
        vol.Optional("note"): _string(),
    },
    extra=vol.PREVENT_EXTRA,
)


# --------------------------------------------------------------------------
# The complete shape, and the three cross-field invariants that the JSON
# Schema root allOf expresses (README.md, contrat/): blocDefaut "voiture" =>
# voiture, mode "minuteur" => non-empty minuteurs. The third (complete
# layout) is already carried by AGENCEMENT above (its three arrays are
# Required).
# --------------------------------------------------------------------------

_ECRAN_STRUCTURE = vol.Schema(
    {
        # Review round 2 (task 8): `_const(VERSION_SCHEMA)`, DERIVED from
        # the contract (see its definition above, next to HAUTEUR_MIN), and
        # no longer `_const(VERSION_CONFIG)` -- round 1 had coupled it to
        # the Python constant, but the value that matters HERE is the one
        # THE CONTRACT PUBLISHES, the module-level assertion already
        # guaranteeing the two cannot silently diverge.
        vol.Optional("version"): _const(VERSION_SCHEMA),
        vol.Required("nom"): _string(1),
        vol.Optional("note"): _string(),
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
        vol.Optional("etiquettesMinuteur"): [_string()],
        vol.Optional("voiture"): VOITURE,
        vol.Optional("agencement"): AGENCEMENT,
    },
    extra=vol.PREVENT_EXTRA,
)


def _invariants_croises(ecran: dict) -> dict:
    """The two `if`/`then` of the root `allOf`. `vol.RequiredFieldInvalid`
    with `path=[<missing field>]`: motif() strips its last segment, exactly
    as for a structural `required` — it is the same keyword, just carried by
    a cross-field rule rather than by the dict itself."""
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
    """Validates and normalises a screen. Raises vol.Invalid (in practice a
    vol.MultipleInvalid, which is a subclass of it) if `brut` does not
    conform."""
    return ECRAN(brut)

