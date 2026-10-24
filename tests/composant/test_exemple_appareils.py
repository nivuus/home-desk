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
    shown = [a["type"] for a in _maison()["appareils"]]
    assert sorted(shown) == sorted(declares), "one entry per appliance type, no duplicate"


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
