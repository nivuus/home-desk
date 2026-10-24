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
    assert schema.VERSION_MAISON == 1
    assert schema.VERSION_MAISON == json.loads(
        (pathlib.Path(schema.__file__).parent / "contrat" / "maison.schema.json")
        .read_text(encoding="utf-8"))["properties"]["version"]["const"]
