"""Le miroir Python du budget de hauteur rend-il le meme verdict que `modes.ts` ?

Ce fichier et app/tests/cas-budget.test.ts lisent le MEME contrat/cas-budget.json.
C'est toute la garantie : deux implementations, un seul jeu de cas.
"""
import importlib
import json
import pathlib

import pytest

from custom_components.home_desk import budget as _module_budget
from custom_components.home_desk.budget import CHEMIN_BUDGET, combien, verifier_budget

CORPUS = json.loads(
    (pathlib.Path(__file__).resolve().parents[2] / "contrat" / "cas-budget.json")
    .read_text(encoding="utf-8"))


@pytest.mark.parametrize("cas", CORPUS["cas"], ids=lambda c: (
    f"{c['mode']}-ambiance={c['rangeeAmbiance']}-"
    f"zones={','.join(c['zones']) if c['zones'] else 'defaut'}-{c['hauteurUtile']}px"))
def test_le_corpus_rend_le_meme_verdict(cas):
    nom = (f"{cas['mode']}/ambiance={cas['rangeeAmbiance']}/"
           f"zones={cas['zones']}/{cas['hauteurUtile']}px")
    rendu_commandes = combien(cas["mode"], cas["rangeeAmbiance"], cas["hauteurUtile"], cas["zones"])
    assert rendu_commandes == cas["commandes"], (
        f"{nom} : combien() rend {rendu_commandes}, le corpus attend {cas['commandes']}")
    rendu_debordement = verifier_budget(cas["mode"], cas["rangeeAmbiance"], cas["hauteurUtile"], cas["zones"])
    assert rendu_debordement == cas["debordement"], (
        f"{nom} : verifier_budget() rend {rendu_debordement}, "
        f"le corpus attend {cas['debordement']}")


def test_le_corpus_n_est_pas_vide():
    """Sans ce test, une table videe laisserait la suite verte en n'exercant rien."""
    assert len(CORPUS["cas"]) > 15


def test_budget_lit_le_contrat_embarque():
    """Decision de la tache 3, reprise pour budget.py : il lit le contrat EMBARQUE dans
    custom_components/home_desk/contrat/, jamais celui du depot. Un chemin qui remonterait vers
    ../../contrat marcherait ici (le depot est present) et casserait une fois le composant depose
    seul dans config/custom_components/ — panne qu'aucune des trois suites ne peut voir puisqu'elles
    tournent toutes depuis le depot. Ce test cloue donc la regle plutot que son seul effet
    observable."""
    assert CHEMIN_BUDGET.is_absolute()
    composant_dir = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"
    assert CHEMIN_BUDGET.resolve().is_relative_to(composant_dir), (
        f"{CHEMIN_BUDGET} n'est pas sous {composant_dir} : "
        "budget.py ne doit jamais remonter vers le contrat du depot.")
    assert CHEMIN_BUDGET.name == "budget.json"
    assert CHEMIN_BUDGET.is_file()


def test_budget_lit_reellement_son_contrat_embarque(monkeypatch):
    """Meme correction que la ronde 1 sur schema.py (Important 1), appliquee ici : le test
    ci-dessus ne cloue que le NOM de la constante CHEMIN_BUDGET, pas ce que le module lit
    reellement. Une mutation qui laisse CHEMIN_BUDGET intacte mais fait lire le JSON depuis
    `parents[2] / "contrat"` (le depot, pas l'embarque) passerait l'ancien test tout en cassant en
    production — exactement la panne que la decision de la tache 3 existe pour empecher.

    On espionne pathlib.Path.read_text pendant un rechargement du module, et on verifie que
    CHAQUE lecture JSON qu'il declenche a l'import reste sous le repertoire du composant. C'est la
    lecture qui est clouee, pas le nom d'une constante qui pourrait etre decorative."""
    composant_dir = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"

    chemins_lus = []
    lire_original = pathlib.Path.read_text

    def lire_espion(self, *args, **kwargs):
        if self.suffix == ".json":
            chemins_lus.append(pathlib.Path(self))
        return lire_original(self, *args, **kwargs)

    monkeypatch.setattr(pathlib.Path, "read_text", lire_espion)
    try:
        importlib.reload(_module_budget)
    finally:
        monkeypatch.undo()
        # Remet un module sain (lu sans espion) pour le reste de la suite, que d'autres fichiers
        # de tests importeront depuis sys.modules.
        importlib.reload(_module_budget)

    assert chemins_lus, "aucune lecture JSON detectee a l'import de budget.py"
    for chemin in chemins_lus:
        assert chemin.resolve().is_relative_to(composant_dir), (
            f"budget.py a lu {chemin}, hors de {composant_dir} : "
            "nommer le contrat embarque sans le lire ne suffit pas.")
