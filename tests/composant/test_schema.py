"""Le miroir voluptuous rend-il le meme verdict qu'ajv, pour le meme motif ?

Ce fichier et app/tests/cas-schema.test.ts lisent le MEME contrat/cas-schema.json.
C'est toute la garantie : deux implementations, un seul jeu de cas.
"""
import json
import pathlib

import pytest
import voluptuous as vol

from custom_components.home_desk.schema import CHEMIN_SCHEMA, motif, valider

CORPUS = json.loads(
    (pathlib.Path(__file__).resolve().parents[2] / "contrat" / "cas-schema.json")
    .read_text(encoding="utf-8"))


@pytest.mark.parametrize("cas", CORPUS["cas"], ids=lambda c: c["nom"])
def test_le_corpus_rend_le_meme_verdict(cas):
    ecran = {**CORPUS["minimal"], **cas.get("modifie", {})}
    if cas["valide"]:
        valider(ecran)          # ne doit pas lever
        return
    with pytest.raises(vol.Invalid) as capture:
        valider(ecran)
    assert motif(capture.value) == cas["motif"], (
        f"voluptuous nomme {motif(capture.value)!r}, "
        f"le corpus attend {cas['motif']!r}")


def test_le_corpus_porte_des_cas_des_deux_signes():
    """Sans ce test, un corpus vide laisserait la suite verte en n'exercant rien."""
    assert any(c["valide"] for c in CORPUS["cas"])
    assert any(not c["valide"] for c in CORPUS["cas"])


def test_schema_lit_le_contrat_embarque():
    """Decision de la tache 3 : schema.py lit le contrat EMBARQUE dans
    custom_components/home_desk/contrat/, jamais celui du depot. Un chemin qui
    remonterait vers ../../contrat marcherait ici (le depot est present) et
    casserait une fois le composant depose seul dans
    config/custom_components/ — panne qu'aucune des trois suites ne peut voir
    puisqu'elles tournent toutes depuis le depot. Ce test cloue donc la regle
    plutot que son seul effet observable."""
    assert CHEMIN_SCHEMA.is_absolute()
    composant_dir = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"
    assert CHEMIN_SCHEMA.resolve().is_relative_to(composant_dir), (
        f"{CHEMIN_SCHEMA} n'est pas sous {composant_dir} : "
        "schema.py ne doit jamais remonter vers le contrat du depot.")
    assert CHEMIN_SCHEMA.name == "ecran.schema.json"
    assert CHEMIN_SCHEMA.is_file()
