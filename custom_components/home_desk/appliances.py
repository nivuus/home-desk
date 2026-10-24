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
    _number,
    _object,
    _present,
    _string,
    _string_pattern,
)

_ENTITY_REF = "ecran.schema.json#/$defs/entite"
_LIST_REF = "#/$defs/listeEntites"
_BUTTON_REF = "#/$defs/entiteBouton"
_THRESHOLD = "seuil"


def _unsupported(where: str, what: Any) -> ValueError:
    return ValueError(
        f"contrat/maison.schema.json: {where} uses {what!r}, which "
        "custom_components/home_desk/appliances.py does not mirror -- "
        "extend the mirror before the contract")


def _button_entity(defs: dict) -> Callable:
    """`$defs/entiteBouton`: a string matching its `pattern`, nothing else."""
    button = defs["entiteBouton"]
    if set(button) - {"description"} != {"type", "pattern"} or button["type"] != "string":
        raise _unsupported("$defs/entiteBouton", button)
    return _string_pattern(re.compile(button["pattern"]))


def _role(name: str, role_schema: dict, entity: Callable, button: Callable) -> Callable:
    """A role is one entity id (`$ref` to `entite`), one button entity id
    (`$ref` to `entiteBouton`) or a list of entity ids (`$ref` to
    `listeEntites`, with optional `minItems`/`maxItems` beside it)."""
    ref = role_schema.get("$ref")
    if ref == _ENTITY_REF and set(role_schema) == {"$ref"}:
        return entity
    if ref == _BUTTON_REF and set(role_schema) == {"$ref"}:
        return button
    if ref == _LIST_REF and set(role_schema) <= {"$ref", "minItems", "maxItems"}:
        return _array(entity, role_schema.get("minItems", 0), role_schema.get("maxItems"))
    raise _unsupported(f"role {name!r}", role_schema)


def _entities(type_name: str, schema: dict, entity: Callable, button: Callable) -> Callable:
    """The `entites` object of one branch: its roles, closed to any other."""
    if not set(schema) <= {"required", "anyOf", "additionalProperties", "properties"}:
        raise _unsupported(f"entites of {type_name!r}", sorted(schema))
    if schema.get("additionalProperties") is not False:
        raise _unsupported(f"entites of {type_name!r}", "an open object")
    required = set(schema.get("required", []))
    shape = vol.Schema(
        {
            (vol.Required(name) if name in required else vol.Optional(name)):
                _role(name, role_schema, entity, button)
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


def _branch(branch: dict, entity: Callable, button: Callable) -> tuple[str, Callable]:
    """One `{if: {type: const}, then: {...}}`: the type it names and the
    validator of an item of that type."""
    type_name = branch["if"]["properties"]["type"]["const"]
    then = branch["then"]
    if not set(then) <= {"properties", "required", "not"} or set(then["properties"]) != {"entites"}:
        raise _unsupported(f"branch {type_name!r}", sorted(then))
    if then.get("required", [_THRESHOLD]) != [_THRESHOLD] or then.get(
            "not", {"required": [_THRESHOLD]}) != {"required": [_THRESHOLD]}:
        raise _unsupported(f"branch {type_name!r}", then)
    # Neither required nor forbidden: the threshold is optional (the plants card).
    threshold = (_present(_THRESHOLD) if "required" in then
                 else _absent(_THRESHOLD) if "not" in then else None)
    entities = _entities(type_name, then["properties"]["entites"], entity, button)
    item = vol.Schema(
        {
            vol.Required("type"): object,
            vol.Required("piece"): object,
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
    button = _button_entity(defs)
    branches = dict(_branch(b, entity, button) for b in appareil["allOf"])
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
