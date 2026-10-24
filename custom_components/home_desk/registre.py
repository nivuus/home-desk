"""Reading the Home Assistant entity registry.

Decision 7 of the spec: an entity unknown to the registry gives a WARNING,
never a refusal -- it may appear later (a bulb not yet paired, a sensor
whose integration is not loaded yet). Refusing would forbid preparing a
screen before its hardware exists; saying nothing lets a typo produce a dead
tile that nobody ever connects to its cause.

A separate module, not one more function in `config_flow.py`: it is the
ONLY dependency of this component on the entity registry, and
`config_flow.py` is capped at 500 lines.

Correction round 1 (defect A): `entities_in` collected any string having
the SHAPE `domain.object`, recursively through the whole object -- which
also warns on `lien: "media_player.html"` or `libelle: "tv.salon"`, two
FREE TEXT fields already allowed by the contract.

Correction round 2 (reservation 1 of round 1): the first correction
replaced the SHAPE with a SET of property names "that carry an entity"
(`CHAMPS_ENTITE`) -- but a set of NAMES cannot carry information that
depends on the PATH. Measured on the whole contract: `nom` is an entity in
`racine.minuteurs[]`, and free text at the root (the screen's name) as well
as in `$defs/source` (the label of a media source) -- a flat set containing
`nom` would have made defect A REAPPEAR for `sources.nom`, through its own
fix. `entities_in` now descends into the VALUE and into the SUB-SCHEMA that
describes it, IN PARALLEL, rather than into a set of names disconnected
from the path.

Correction round 2 (reservation 2): this module read `contrat/
ecran.schema.json` itself -- a SECOND reading of the same file that
`schema.py` claims to read ALONE (see its docstring: "What MIRRORS the
contract stays in schema.py, and IT ALONE reads it"). It now imports
`schema.SCHEMA_JSON`, already read once over there, never a second
`pathlib.Path` + `json.loads` HERE -- the same rule `validateurs.py`
already follows (neither of them contains `pathlib` or `json` any more).

Correction round 3: `voiture` ("object" section, `objets.py`) carries SEVEN
`$ref: entite` fields (`batterie`, `autonomie`, `branchee`, `enCharge`,
`clim`, and the two climate start/stop keys) and was wired nowhere -- decision 7
covered eight section families out of nine. `entities_in` resolved its
starting sub-schema via `properties[cle]["items"]`, which assumes an ARRAY
section; `voiture` is an OBJECT (`properties["voiture"]` has no `items`).
Resolution is now generic to both shapes, without `if cle == "voiture"`: a
special case by NAME would have been the same fault as the flat set of
names of round 2.

Final branch review (C1, Critical): `avertissement_entites_
inconnues` joins this module -- THE text (accented, French) to set in
`description_placeholders["entites_inconnues"]`, at the nine sites that
compute `entites_inconnues` (list_sections.py, objets.py, config_flow.py x2).
Before this round, each site set the BARE LIST (`", ".join(inconnues)`)
ONLY `if inconnues:` -- two compounded faults, measured by the reviewer:
(a) the SENTENCE around it ("Entities entered but missing...") was
hardcoded in ONLY two descriptions (`step.user`/`step.identite`), never in
the one of the step ACTUALLY redisplayed after a warning -- invisible
everywhere it should have mattered; (b) those TWO descriptions therefore
displayed it PERMANENTLY, followed by nothing, the "dead button in prose"
this repository forbids itself. This function closes both at once: empty
(nothing to display) if `entites` contains NO unknown entity, otherwise the
COMPLETE SENTENCE -- never typed HERE. The only accented text lives in
`translations/*.json` ("avertissements" category, added by this round),
read by `homeassistant.helpers.translation.async_get_cached_
translations` then `.format()`-ed with the LIST (a diagnostic, never prose):
exactly the idiom `translation.async_get_exception_message` already applies
in the Home Assistant core for a different category ("exceptions") --
verified on the INSTALLED sources of Home Assistant 2026.9.1
(`.venv-composant/lib/python3.14/site-packages/homeassistant/
helpers/translation.py`), never from memory. So this module does NOT depart
from the repository rule (no accented text in the component's Python): it
FOLLOWS it, it only FORMATS an already accented string that lives
elsewhere.

The translations are already cached by the time this path runs: a
SUBentry flow only exists once the SINGLE entry has been created and the
component loaded (`async_setup_entry` has run, which waited for its
translations to load -- `homeassistant/setup.py`,
`translation.async_load_integrations`). The fallback below (the bare list,
without the sentence) therefore only covers a case structurally unreachable
HERE; it stays written so as never to raise rather than let a form crash
over a warning.
"""
from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er, translation

from .const import DOMAIN
from .schema import SCHEMA_JSON


def entites_inconnues(hass: HomeAssistant, entites: list[str]) -> list[str]:
    """Those of `entites` that no registry entry carries.

    Input order is preserved: the warning message cites them in the order
    the user entered them, never in a hash order that would change from one
    input to the next.

    An entity may exist in the STATE machine without being in the registry
    (an `input_*` created in YAML, a template). So `hass.states` is queried
    AS WELL: warning about an entity that already responds would be a false
    warning, and a false warning gets ignored, which kills the real ones
    too.
    """
    registre = er.async_get(hass)
    return [
        e for e in entites
        if registre.async_get(e) is None and hass.states.get(e) is None
    ]


def avertissement_entites_inconnues(hass: HomeAssistant, entites: list[str]) -> str:
    """The text to set in `description_placeholders["entites_inconnues"]`
    -- empty if none of the `entites` is unknown (nothing to display, C1),
    otherwise the COMPLETE sentence, already translated (see the module
    docstring for why it is NEVER typed here), preceded by a paragraph
    break: every description that carries this placeholder ends with it
    WITHOUT a static separator in front -- it is this value, never the
    template, that carries the spacing, so that a description WITHOUT a
    warning leaves neither a blank line nor a stray space."""
    inconnues = entites_inconnues(hass, entites)
    if not inconnues:
        return ""
    names = ", ".join(inconnues)
    cles = translation.async_get_cached_translations(
        hass, hass.config.language, "avertissements", DOMAIN
    )
    gabarit = cles.get(f"component.{DOMAIN}.avertissements.entites_inconnues")
    phrase = names if gabarit is None else gabarit.format_map({"liste": names})
    # `gabarit is None`: theoretical fallback -- see the module docstring,
    # this path should never run, a subentry existing only once the
    # component (and its translations) is already loaded.
    return f"\n\n{phrase}"


def _resoudre(sub_schema: dict) -> dict:
    """Follows a `$ref: #/$defs/<name>` to its definition; returns the
    sub-schema as is if it carries none."""
    ref = sub_schema.get("$ref", "")
    if ref.startswith("#/$defs/"):
        return SCHEMA_JSON["$defs"][ref.removeprefix("#/$defs/")]
    return sub_schema


def _entities_with_schema(value: Any, sub_schema: dict) -> list[str]:
    """Descends into `value` AND into `sub_schema`, IN PARALLEL: it is the
    sub-schema, never the key's NAME nor the value's SHAPE, that says
    whether a string is an entity -- `nom` is one in a timer slot, never at
    the root nor in a media source, and only the sub-schema attached to
    THIS path knows it.

    - `$ref: #/$defs/entite` on a `str` value: it is an entity.
    - `type: array`: each item is descended with `items`.
    - `type: object` (or a `$ref` resolving to one): each key PRESENT in
      `value` is descended with `properties[cle]`; a key absent from
      `properties` (a field the contract does not know) yields nothing.
    - everything else (a `str`/`bool`/`int` whose sub-schema is not an
      entity, a type matching none of the above): nothing.
    """
    if sub_schema.get("$ref") == "#/$defs/entite":
        return [value] if isinstance(value, str) else []
    resolu = _resoudre(sub_schema)
    type_ = resolu.get("type")
    if type_ == "array" and isinstance(value, list):
        items = resolu.get("items", {})
        return [e for element in value for e in _entities_with_schema(element, items)]
    if type_ == "object" and isinstance(value, dict):
        proprietes = resolu.get("properties", {})
        return [
            e for cle, sub_value in value.items() if cle in proprietes
            for e in _entities_with_schema(sub_value, proprietes[cle])
        ]
    return []


def entities_in(value: Any, cle: str) -> list[str]:
    """The strings of `value` (the item of a "list" section or the object
    of an "object" section) that the CONTRACT designates as entities --
    never a string merely because it has the SHAPE of one, nor merely
    because its KEY carries a name known elsewhere as an entity (see the
    module docstring).

    `cle`: the section `value` comes from. Its starting sub-schema is
    `properties[cle]["items"]` for a "list" section (an ARRAY,
    `list_sections.py`) -- for `ouvrants` and the extra task lists section,
    that `items` IS `$ref: #/$defs/entite`: the bare item (a string WITHOUT
    a key around it) is therefore collected WITHOUT a special case. An
    "object" section (`voiture`, `objets.py`) has NO `items`:
    `properties[cle]` ALREADY IS the right sub-schema, generic to both
    shapes -- never an `if cle == "voiture"`, the same shape fault as the
    flat set of names that correction round 2 already closed."""
    proprietes_cle = SCHEMA_JSON["properties"][cle]
    sub_schema = proprietes_cle.get("items", proprietes_cle)
    return _entities_with_schema(value, sub_schema)
