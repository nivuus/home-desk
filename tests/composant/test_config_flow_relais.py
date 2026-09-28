"""Les relais generiques de `EcranSubentryFlow` (config_flow.py) : le
`__getattr__` qui remplace les seize methodes d'un appel chacune ecrites a la
main jusqu'a la tache 7 -- HA appelle un step PAR SON NOM (`getattr(flow,
f"async_step_{step_id}")`), donc les noms doivent repondre, mais rien
n'oblige a les ECRIRE.

Separe de `test_config_flow.py` (ce fichier approchait 500 lignes) --  meme
couture que `test_config_flow_identite.py`/`test_config_flow_objets.py`.
"""
from custom_components.home_desk.config_flow import EcranSubentryFlow
from custom_components.home_desk.list_fields import SECTIONS


def test_les_relais_de_section_sont_rendus_generiquement():
    """Les 2 steps x N sections qu'exige `list_sections.ListSectionsMixin`.

    Home Assistant appelle un step PAR SON NOM (`getattr(flow,
    f"async_step_{step_id}")`), donc on ne peut pas s'en passer -- mais on
    peut les rendre generiques. Ce test garde la CAPACITE (« chaque section
    a ses deux steps, et ils delеguent au bon squelette »), jamais des noms
    de methode recopies : un test qui listerait seize noms passerait encore
    si les seize relais ne faisaient plus rien."""
    flow = EcranSubentryFlow()
    for section in SECTIONS:
        for suffixe in ("", "_element"):
            nom = f"async_step_{section}{suffixe}"
            assert hasattr(flow, nom), f"{nom} absent"
            assert callable(getattr(flow, nom))


def test_getattr_ne_fabrique_PAS_un_step_pour_n_importe_quoi():
    """LA garde de ce mecanisme, et la seule qui compte.

    `_raise_if_step_does_not_exist` de Home Assistant repose sur `hasattr`.
    Un `__getattr__` qui rendrait quelque chose pour tout nom ferait croire
    a HA que TOUS les steps existent : une faute de frappe dans un
    `async_step_id` ne leverait plus `UnknownStep` mais partirait dans un
    squelette de section inexistante, et le formulaire casserait plus loin,
    ailleurs, sans rapport visible avec la cause."""
    flow = EcranSubentryFlow()
    for absent in (
        "async_step_section_qui_n_existe_pas",
        "async_step_commandes_elementaire",
        "async_step_",
        "attribut_quelconque",
        "_async_step_section",     # existe deja : ne doit PAS passer par __getattr__
    ):
        if absent == "_async_step_section":
            assert hasattr(flow, absent)   # vrai attribut, resolu normalement
            continue
        assert not hasattr(flow, absent), f"{absent} ne devrait pas exister"


def test_un_relais_delegue_au_squelette_avec_SA_section(monkeypatch):
    """Capacite, pas nom : on verifie que `async_step_ambiances` passe bien
    « ambiances » et pas « commandes ». Decor a DEUX sections -- avec une
    seule, un relais qui passerait toujours la meme section passerait."""
    vus = []
    flow = EcranSubentryFlow()
    monkeypatch.setattr(
        EcranSubentryFlow, "_async_step_section",
        lambda self, section, user_input=None: vus.append(section),
    )
    flow.async_step_ambiances()
    flow.async_step_commandes()
    assert vus == ["ambiances", "commandes"]
