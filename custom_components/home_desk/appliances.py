"""The voluptuous mirror of one item of the house's `appareils`
(`contrat/maison.schema.json`, `$defs/appareil`).

The roles each appliance type requires or accepts are written ONCE, in the
contract's `allOf` of `if/then` branches (one per `type`). This module never
retypes that table: `appliance_validator` is handed the parsed `$defs`
(`schema.py` stays the only reader of the embedded contract) and BUILDS the
validator from the branches. It understands exactly the constructs those
branches use and raises `ValueError` at import on anything else, so a
contract edit this mirror cannot follow fails every suite at once instead
of being silently ignored.

Validation runs in two steps, like ajv's `if/then`: the shape shared by every
type first (so an unknown `type` is an `enum` fault, never a missing role),
then the branch of that type."""
from __future__ import annotations

import re
from typing import Any, Callable

import voluptuous as vol

from .fautes import _FauteType
from .validateurs import (
    _absent,
    _any_required,
    _array,
    _enum,
    _not_const,
    _number,
    _object,
    _present,
    _string,
    _string_pattern,
)

_ENTITY_REF = "ecran.schema.json#/$defs/entite"
_LIST_REF = "#/$defs/listeEntites"
_THRESHOLD = "seuil"
_ROOM = "piece"


def _unsupported(where: str, what: Any) -> ValueError:
    return ValueError(
        f"contrat/maison.schema.json: {where} uses {what!r}, which "
        "custom_components/home_desk/appliances.py does not mirror -- "
        "extend the mirror before the contract")


def _patterned_entities(defs: dict) -> dict[str, Callable]:
    """Every `$defs/entite*` other than the screen's: a string matching its
    `pattern`, nothing else. Keyed by the `$ref` a role uses."""
    refs = {}
    for name, schema in defs.items():
        if not name.startswith("entite"):
            continue
        if set(schema) - {"description"} != {"type", "pattern"} or schema["type"] != "string":
            raise _unsupported(f"$defs/{name}", schema)
        refs[f"#/$defs/{name}"] = _string_pattern(re.compile(schema["pattern"]))
    return refs


def _patterned_lists(defs: dict, patterned: dict[str, Callable]) -> dict[str, Callable]:
    """Every `$defs/liste*` other than `listeEntites`: an array whose items are
    one patterned `entite*`. Maps the `$ref` a role uses to the validator of an
    ITEM; the role's own `minItems`/`maxItems` bound the array (`_role`)."""
    refs = {}
    for name, schema in defs.items():
        if not name.startswith("liste") or name == "listeEntites":
            continue
        item = schema.get("items", {}).get("$ref")
        if set(schema) - {"description"} != {"type", "items"} or schema["type"] != "array" \
                or set(schema["items"]) != {"$ref"} or item not in patterned:
            raise _unsupported(f"$defs/{name}", schema)
        refs[f"#/$defs/{name}"] = patterned[item]
    return refs


def _room_rules(defs: dict) -> dict[str, Callable]:
    """Every `$defs/piece*`: a room name that may be anything but one value
    (`not: {const}`) -- `maison`, for the types whose card never reaches the
    rank a whole-house appliance is shown at. Keyed by the `$ref` a branch's
    `piece` uses."""
    refs = {}
    for name, schema in defs.items():
        if not name.startswith(_ROOM):
            continue
        if set(schema) - {"description"} != {"not"} or set(schema["not"]) != {"const"}:
            raise _unsupported(f"$defs/{name}", schema)
        refs[f"#/$defs/{name}"] = _not_const(schema["not"]["const"])
    return refs


def _role(name: str, role_schema: dict, entity: Callable, patterned: dict[str, Callable],
          lists: dict[str, Callable]) -> Callable:
    """A role is one entity id (`$ref` to `entite`), one entity id of a
    constrained domain (`$ref` to a patterned `entite*`) or a list of entity
    ids (`$ref` to `listeEntites`, with optional `minItems`/`maxItems`)."""
    ref = role_schema.get("$ref")
    if ref == _ENTITY_REF and set(role_schema) == {"$ref"}:
        return entity
    if ref in patterned and set(role_schema) == {"$ref"}:
        return patterned[ref]
    if ref in lists and set(role_schema) <= {"$ref", "minItems", "maxItems"}:
        return _array(lists[ref], role_schema.get("minItems", 0), role_schema.get("maxItems"))
    if ref == _LIST_REF and set(role_schema) <= {"$ref", "minItems", "maxItems"}:
        return _array(entity, role_schema.get("minItems", 0), role_schema.get("maxItems"))
    raise _unsupported(f"role {name!r}", role_schema)


def _entities(type_name: str, schema: dict, entity: Callable, patterned: dict[str, Callable],
              lists: dict[str, Callable]) -> Callable:
    """The `entites` object of one branch: its roles, closed to any other."""
    if not set(schema) <= {"required", "anyOf", "additionalProperties", "properties"}:
        raise _unsupported(f"entites of {type_name!r}", sorted(schema))
    if schema.get("additionalProperties") is not False:
        raise _unsupported(f"entites of {type_name!r}", "an open object")
    required = set(schema.get("required", []))
    shape = vol.Schema(
        {
            (vol.Required(name) if name in required else vol.Optional(name)):
                _role(name, role_schema, entity, patterned, lists)
            for name, role_schema in schema["properties"].items()
        },
        extra=vol.PREVENT_EXTRA,
    )
    if "anyOf" not in schema:
        return shape
    groups = []
    for alternative in schema["anyOf"]:
        if set(alternative) != {"required"}:
            raise _unsupported(f"anyOf of {type_name!r}", alternative)
        groups.append(alternative["required"])
    return vol.All(shape, _any_required(groups))


def _branch(branch: dict, entity: Callable, patterned: dict[str, Callable],
            lists: dict[str, Callable], rooms: dict[str, Callable]) -> tuple[str, Callable]:
    """One `{if: {type: const}, then: {...}}`: the type it names and the
    validator of an item of that type."""
    type_name = branch["if"]["properties"]["type"]["const"]
    then = branch["then"]
    if not set(then) <= {"properties", "required", "not"} \
            or not set(then["properties"]) <= {"entites", _THRESHOLD, _ROOM}:
        raise _unsupported(f"branch {type_name!r}", sorted(then))
    room_schema = then["properties"].get(_ROOM)
    if room_schema is not None and (set(room_schema) != {"$ref"} or room_schema["$ref"] not in rooms):
        raise _unsupported(f"piece of {type_name!r}", room_schema)
    room = object if room_schema is None else rooms[room_schema["$ref"]]
    if then.get("required", [_THRESHOLD]) != [_THRESHOLD] or then.get(
            "not", {"required": [_THRESHOLD]}) != {"required": [_THRESHOLD]}:
        raise _unsupported(f"branch {type_name!r}", then)
    # Exactly one statement about the threshold per type: required, forbidden, or optional by
    # `properties.seuil: true`. Saying nothing is a contract edit the mirror must not guess at.
    optional = then["properties"].get(_THRESHOLD)
    if optional not in (None, True) or "entites" not in then["properties"]:
        raise _unsupported(f"branch {type_name!r}", then)
    if ("required" in then) + ("not" in then) + (optional is True) != 1:
        raise _unsupported(f"branch {type_name!r}", "a threshold neither required, forbidden nor optional")
    threshold = (_present(_THRESHOLD) if "required" in then
                 else _absent(_THRESHOLD) if "not" in then else None)
    entities = _entities(type_name, then["properties"]["entites"], entity, patterned, lists)
    item = vol.Schema(
        {
            vol.Required("type"): object,
            vol.Required("piece"): room,
            vol.Required("entites"): entities,
            vol.Optional(_THRESHOLD): object,
        },
        extra=vol.PREVENT_EXTRA,
    )
    return type_name, item if threshold is None else vol.All(item, threshold)


def appliance_validator(defs: dict, entity: Callable) -> Callable:
    """The validator of one appliance, built from `$defs` of the house
    contract. ENTITY is the screen contract's entity-id validator."""
    appareil = defs["appareil"]
    props = appareil["properties"]
    types = props["type"]["enum"]
    patterned = _patterned_entities(defs)
    lists = _patterned_lists(defs, patterned)
    rooms = _room_rules(defs)
    branches = dict(_branch(b, entity, patterned, lists, rooms) for b in appareil["allOf"])
    if sorted(branches) != sorted(types):
        raise _unsupported("the type branches", sorted(set(branches) ^ set(types)))
    shared = vol.Schema(
        {
            vol.Required("type"): _enum(frozenset(types)),
            vol.Required("piece"): _string(props["piece"]["minLength"]),
            vol.Required("entites"): _object(),
            vol.Optional(_THRESHOLD): _number(props[_THRESHOLD]["minimum"]),
        },
        extra=vol.PREVENT_EXTRA,
    )

    def valider(value):
        if not isinstance(value, dict):
            raise _FauteType("attendu un objet")
        shared(value)
        return branches[value["type"]](value)

    return valider
