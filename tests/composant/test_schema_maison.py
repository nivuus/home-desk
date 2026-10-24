"""Does the voluptuous mirror give the same verdict as ajv for the house list?

This file and app/tests/cas-maison.test.ts replay the SAME
contrat/cas-maison.json: two implementations, one set of cases.
"""
import json
import pathlib

import pytest
import voluptuous as vol

from custom_components.home_desk import schema
from custom_components.home_desk.schema import motif, validate_house

CORPUS = json.loads(
    (pathlib.Path(__file__).resolve().parents[2] / "contrat" / "cas-maison.json")
    .read_text(encoding="utf-8"))


@pytest.mark.parametrize("cas", CORPUS["cas"], ids=lambda c: c["nom"])
def test_the_corpus_gives_the_same_verdict(cas):
    maison = {**CORPUS["minimal"], **cas.get("modifie", {})}
    for cle in cas.get("retire", []):
        del maison[cle]
    if cas["valide"]:
        validate_house(maison)
        return
    with pytest.raises(vol.Invalid) as capture:
        validate_house(maison)
    assert motif(capture.value) == cas["motif"], (
        f"voluptuous names {motif(capture.value)!r}, "
        f"the corpus expects {cas['motif']!r}")


def test_the_corpus_has_cases_of_both_signs():
    assert any(c["valide"] for c in CORPUS["cas"])
    assert any(not c["valide"] for c in CORPUS["cas"])


def test_the_house_version_is_read_from_the_embedded_contract():
    assert schema.VERSION_MAISON == 2
    assert schema.VERSION_MAISON == json.loads(
        (pathlib.Path(schema.__file__).parent / "contrat" / "maison.schema.json")
        .read_text(encoding="utf-8"))["properties"]["version"]["const"]


def test_the_appliance_mirror_refuses_a_contract_construct_it_does_not_follow():
    """The roles per type are built from the contract branches; a keyword the
    mirror does not know must stop the import, never be skipped."""
    import copy

    from custom_components.home_desk.appliances import appliance_validator

    defs = copy.deepcopy(schema.MAISON_JSON["$defs"])
    defs["appareil"]["allOf"][0]["then"]["properties"]["entites"]["minProperties"] = 2
    with pytest.raises(ValueError, match="does not mirror"):
        appliance_validator(defs, schema.ENTITE)

    defs = copy.deepcopy(schema.MAISON_JSON["$defs"])
    defs["appareil"]["allOf"].pop()
    with pytest.raises(ValueError, match="does not mirror"):
        appliance_validator(defs, schema.ENTITE)


def test_the_threshold_of_each_type_is_derived_from_its_branch():
    """Required, forbidden or explicitly optional (`properties.seuil: true`):
    a branch that says nothing about it must stop the import, never be read
    as optional."""
    import copy

    from custom_components.home_desk.appliances import appliance_validator

    branches = {b["if"]["properties"]["type"]["const"]: b["then"]
                for b in schema.MAISON_JSON["$defs"]["appareil"]["allOf"]}
    assert "required" in branches["air"] and "required" in branches["encre"]
    assert branches["plantes"]["properties"].get("seuil") is True
    assert all("not" in then for name, then in branches.items()
               if name not in ("air", "encre", "plantes"))

    defs = copy.deepcopy(schema.MAISON_JSON["$defs"])
    for branch in defs["appareil"]["allOf"]:
        if branch["if"]["properties"]["type"]["const"] == "tapis":
            del branch["then"]["not"]
    with pytest.raises(ValueError, match="does not mirror"):
        appliance_validator(defs, schema.ENTITE)
