"""Le miroir voluptuous rend-il le meme verdict qu'ajv, pour le meme motif ?

Ce fichier et app/tests/cas-schema.test.ts lisent le MEME contrat/cas-schema.json.
C'est toute la garantie : deux implementations, un seul jeu de cas.
"""
import importlib
import json
import pathlib

import pytest
import voluptuous as vol

from custom_components.home_desk import schema as _module_schema
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


def test_schema_lit_reellement_son_contrat_embarque(monkeypatch):
    """Correction de la ronde 1 (Important 1) : le test ci-dessus ne clouait
    que le NOM de la constante CHEMIN_SCHEMA, pas ce que le module lit
    reellement. Une mutation qui laisse CHEMIN_SCHEMA intacte mais fait lire
    le JSON depuis `parents[2] / "contrat"` (le depot, pas l'embarque) passait
    l'ancien test (13 passed) tout en cassant en production — exactement la
    panne que la decision de la tache 3 existe pour empecher.

    On espionne pathlib.Path.read_text pendant un rechargement du module, et
    on verifie que CHAQUE lecture JSON qu'il declenche a l'import reste sous
    le repertoire du composant. C'est la lecture qui est clouee, pas le nom
    d'une constante qui pourrait etre decorative."""
    composant_dir = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"

    chemins_lus = []
    lire_original = pathlib.Path.read_text

    def lire_espion(self, *args, **kwargs):
        if self.suffix == ".json":
            chemins_lus.append(pathlib.Path(self))
        return lire_original(self, *args, **kwargs)

    monkeypatch.setattr(pathlib.Path, "read_text", lire_espion)
    try:
        importlib.reload(_module_schema)
    finally:
        monkeypatch.undo()
        # Remet un module sain (lu sans espion) pour le reste de la suite,
        # que d'autres fichiers de tests importeront depuis sys.modules.
        importlib.reload(_module_schema)

    assert chemins_lus, "aucune lecture JSON detectee a l'import de schema.py"
    for chemin in chemins_lus:
        assert chemin.resolve().is_relative_to(composant_dir), (
            f"schema.py a lu {chemin}, hors de {composant_dir} : "
            "nommer le contrat embarque sans le lire ne suffit pas.")
