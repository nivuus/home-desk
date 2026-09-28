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


def test_la_version_du_contrat_est_celle_que_le_composant_reconnait():
    """Ronde 2 de relecture (tache 8) : le nombre `1` existait en trois
    copies sans lien (const.py, `contrat/ecran.schema.json`, `_const(1)`
    ecrit a la main dans schema.py) -- `VERSION_SCHEMA` est maintenant
    DERIVEE du contrat (comme `HAUTEUR_MIN`/`HAUTEUR_MAX`) et couplee a
    `VERSION_CONFIG` par une assertion a l'import. Ce test epingle la
    valeur par un LITTERAL (`2` depuis la migration du 2026-09-28, qui
    retire DeLorean -- `1` avant), et prouve que la contrainte est encore
    REELLEMENT appliquee -- une regression qui la retirerait
    (`_const(VERSION_SCHEMA)` -> `vol.Any(int)`) laisserait n'importe
    quelle version passer, invisible sans ce test fonctionnel."""
    assert _module_schema.VERSION_CONFIG == 2
    assert _module_schema.VERSION_SCHEMA == 2

    for version_refusee in (1, 3):
        with pytest.raises(vol.Invalid):
            valider({**CORPUS["minimal"], "version": version_refusee})

    valider({**CORPUS["minimal"], "version": 2})


def test_zones_modes_modulateurs_blocdefaut_sont_des_listes_ordonnees_selon_le_contrat():
    """Ronde 2 de relecture : correction PREVENTIVE, mise en place avant
    qu'aucun formulaire ne consomme ces quatre vocabulaires — exactement la
    dette qu'`OPERATEURS` portait avant la ronde 1
    (`test_operateurs_est_une_liste_ordonnee_selon_le_contrat`,
    test_config_flow_champs.py). Un `frozenset` (ordre non garanti d'un
    processus Python a l'autre, mesure lors de la ronde 1) redeviendrait
    invisible tant qu'aucun `SelectSelector` ne les affiche encore."""
    assert _module_schema.ZONES == ["synthese", "blocCentral", "ambiances", "commandes"]
    assert _module_schema.BLOC_DEFAUT == ["voiture", "repas", "agenda"]
    assert _module_schema.MODES == [
        "alerte", "recette", "minuteur", "menage", "cinema", "media", "aeration",
        "voiture", "defaut",
    ]
    assert _module_schema.MODULATEURS == ["invites", "chaleur"]
    for valeurs in (
        _module_schema.ZONES, _module_schema.BLOC_DEFAUT,
        _module_schema.MODES, _module_schema.MODULATEURS,
    ):
        assert isinstance(valeurs, list)


_AGENCEMENT_MINIMAL = {"zones": ["commandes"], "modes": ["defaut"], "modulateurs": []}


def test_alerte_doit_etre_le_premier_mode_si_present():
    """Releve en relecture finale de branche : la spec (2026-09-12,
    « Invariants verifies par le schema ») exige « alerte en premiere
    position si present (une alerte ne cede a rien) » -- jamais verifie
    nulle part avant cette correction. Mesure : `modes: ["defaut", "media",
    "alerte"]` passait `schema.AGENCEMENT` tel quel. `modePrincipal`
    (app/src/modes.ts) rend le PREMIER mode actif de cette liste : un tel
    agencement ferait ceder une alerte reelle au mode media.

    Deuxieme relecture finale de branche : cette regle est desormais
    PORTEE PAR LE CONTRAT (`contrat/ecran.schema.json`, `allOf` racine
    `contains`/`prefixItems`) -- `motif()` doit donc rendre EXACTEMENT ce
    qu'ajv rend pour le meme cas (verifie par execution cote TypeScript,
    `app/tests/cas-schema.test.ts`), pas un mot-cle invente. Voir
    `contrat/cas-schema.json`, cas "alerte presente mais pas en premiere
    position est refusee", qui rejoue ce MEME motif depuis le corpus
    partage -- ce test-ci verifie la regle directement sur `AGENCEMENT`
    seul (le chemin qu'emprunte `objets.async_step_agencement`), le
    corpus la verifie sur l'ECRAN COMPLET (le chemin qu'emprunte
    `schema.valider`) : les deux chemins, un seul motif."""
    _module_schema.AGENCEMENT({**_AGENCEMENT_MINIMAL, "modes": ["alerte", "defaut"]})
    _module_schema.AGENCEMENT({**_AGENCEMENT_MINIMAL, "modes": ["defaut"]})

    with pytest.raises(vol.Invalid) as capture:
        _module_schema.AGENCEMENT({**_AGENCEMENT_MINIMAL, "modes": ["media", "alerte", "defaut"]})
    assert motif(capture.value) == "/modes/0: const"


def test_modulateurs_sont_normalises_en_ensemble_trie():
    """Spec (2026-09-12) : « `modulateurs` n'a pas d'ordre significatif : le
    schema le normalise en ensemble trie, pour qu'un diff d'export ne
    bruite pas. » Releve en relecture finale de branche : jamais applique
    -- `schema.AGENCEMENT` conservait l'ordre SOUMIS (voir
    `test_agencement_conserve_l_ordre_soumis_des_zones_et_des_modes`,
    test_config_flow_objets.py, qui ne porte QUE sur `zones`/`modes`, pas
    `modulateurs`) : deux exports du MEME ecran, modulateurs choisis dans
    un ordre different, auraient produit un diff YAML bruyant pour un
    reordonnancement sans effet (le rendu, `CONDITIONS_MODULATEURS.ts`,
    ne lit jamais l'ordre)."""
    valide = _module_schema.AGENCEMENT(
        {**_AGENCEMENT_MINIMAL, "modulateurs": ["invites", "chaleur"]}
    )
    assert valide["modulateurs"] == ["chaleur", "invites"]


def test_delorean_n_existe_plus_dans_le_contrat():
    """Version 2 (spec 2026-09-28, section 4): the hardcoded DeLorean scenes
    are gone, replaced by animations launched from Home Assistant. Both
    traces are REFUSED, never silently ignored: a screen that still carries
    one was written for version 1 and must go through the migration."""
    with pytest.raises(vol.Invalid) as capture:
        valider({**CORPUS["minimal"], "delorean": True})
    assert motif(capture.value) == ": additionalProperties"

    with pytest.raises(vol.Invalid):
        _module_schema.AGENCEMENT({**_AGENCEMENT_MINIMAL, "modulateurs": ["delorean"]})
    with pytest.raises(vol.Invalid):
        valider({**CORPUS["minimal"], "agencement": {
            **_AGENCEMENT_MINIMAL, "modulateurs": ["chaleur", "delorean"]}})
