"""The example `maison.appareils` block of the docs must stay valid.

`docs/claude/pile-de-cartes-appareils.example.yaml` is what an owner copies; it is read by
the importer's own parser (`yaml_ecrans.lire`) and validated by the contract's validator
(`schema.validate_house`, the one the config write gate uses), so it cannot drift from
`contrat/maison.schema.json`. It must also show every appliance type the contract declares."""
import json
import pathlib
import re

import pytest
import voluptuous as vol

from custom_components.home_desk import schema, yaml_ecrans

RACINE = pathlib.Path(__file__).resolve().parents[2]
EXEMPLE = RACINE / "docs" / "claude" / "pile-de-cartes-appareils.example.yaml"
# `lire` wants a document with screens; the example is only the `maison:` block.
_ECRANS_VIDES = "ecrans: []\n"


def _maison() -> dict:
    _, maison = yaml_ecrans.lire(_ECRANS_VIDES + EXEMPLE.read_text(encoding="utf-8"))
    assert maison is not None, "the example has no `maison:` block"
    return maison


def test_the_example_is_valid_for_the_contract():
    schema.validate_house({"version": schema.VERSION_MAISON, **_maison()})


def test_the_example_shows_every_appliance_type_of_the_contract():
    contrat = json.loads((RACINE / "contrat" / "maison.schema.json").read_text(encoding="utf-8"))
    declares = set(contrat["$defs"]["appareil"]["properties"]["type"]["enum"])
    shown = {a["type"] for a in _maison()["appareils"]}
    assert shown == declares, "every appliance type of the contract, and no other"


def test_a_type_shown_twice_is_the_room_plus_house_pattern():
    """The only reason to declare a type twice: the appliance in its room, and the same
    appliance once more in `maison` so its rank-2 states reach every tablet. The `maison`
    entry restates roles of the room entry (same entity ids), so both merge into one card
    (`cardEntities`, merge by key); it never names another appliance."""
    by_type: dict[str, list[dict]] = {}
    for a in _maison()["appareils"]:
        by_type.setdefault(a["type"], []).append(a)
    pairs = {t: entries for t, entries in by_type.items() if len(entries) > 1}
    assert pairs, "the example shows the pattern at least once"
    for type_name, entries in pairs.items():
        rooms = [e for e in entries if e["piece"] != "maison"]
        house = [e for e in entries if e["piece"] == "maison"]
        assert len(rooms) == 1 and len(house) == 1, type_name
        assert house[0]["entites"].items() <= rooms[0]["entites"].items(), type_name


def test_the_example_uses_placeholder_entities_only():
    texte = EXEMPLE.read_text(encoding="utf-8")
    ids = [m for m in re.findall(r"\b[a-z_]+\.[a-z0-9_]+\b", texte)
           if m.split(".")[0] in {"sensor", "binary_sensor", "button", "number", "fan", "vacuum",
                                  "camera", "image", "switch", "input_boolean",
                                  "alarm_control_panel"}]
    assert ids and all(i.split(".")[1].startswith("example_") for i in ids)


def test_a_broken_example_is_refused():
    maison = _maison()
    maison["appareils"][0]["entites"]["pause"] = "switch.example_printer_pause"
    with pytest.raises(vol.Invalid):
        schema.validate_house({"version": schema.VERSION_MAISON, **maison})
