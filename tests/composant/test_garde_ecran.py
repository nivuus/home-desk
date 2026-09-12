"""Le mecanisme central de la ronde 1 de relecture (le Critique, tache 7) :
`garde_ecran.verifier_ecran_complet` — teste ICI directement (sans passer
par un flow HA), la propriete elle-meme plutot que trois cas particuliers.
Les cas particuliers (via le flow reel) vivent dans
`test_config_flow_objets.py` ; ce fichier tient le MECANISME qui les rend
tous vrais a la fois.

Le relecteur : « sept des neuf mutations survivantes portent sur une regle
que ton code ou ton rapport affirme tenir. Tu les as toutes verifiees par
des sondes jetables, et tu n'en as transforme aucune en test. » Ce module
et son complement structurel plus bas repondent a ce constat : le
MECANISME, pas seulement ses trois manifestations mesurees.
"""
import ast
import pathlib

from custom_components.home_desk import garde_ecran

_ECRAN_BASE = {
    "nom": "x",
    "temperature": "sensor.t",
    "ambiances": [],
    "commandes": [],
    "extrasMaison": [],
    "synthese": [],
    "sources": [],
    "ouvrants": [],
    "minuteurs": [],
    "etiquettesMinuteur": [],
}


def test_un_ecran_valide_sans_agencement_ne_leve_rien():
    errors, placeholders = garde_ecran.verifier_ecran_complet(_ECRAN_BASE)
    assert errors == {}
    assert placeholders == {}


def test_mode_minuteur_sans_slot_est_refuse_et_nomme_minuteurs():
    """LE cas mesure par le relecteur (l'agencement reel de la cuisine,
    `app/src/ecran.ts`) : `agencement.modes` contient "minuteur",
    `minuteurs` est present mais VIDE — jamais absent, depuis que
    `listes_champs.SECTIONS` l'initialise a la creation."""
    ecran = {
        **_ECRAN_BASE,
        "agencement": {"zones": ["commandes"], "modes": ["defaut", "minuteur"], "modulateurs": []},
    }
    errors, placeholders = garde_ecran.verifier_ecran_complet(ecran)
    assert errors == {"base": "ecran_deviendrait_invalide"}
    assert placeholders == {"section": "minuteurs"}


def test_mode_minuteur_avec_un_slot_ne_leve_rien():
    """Le pendant positif : ajouter le slot qui manquait rend l'ecran
    valide a nouveau — la garde ne refuse pas un ecran qui TIENT."""
    ecran = {
        **_ECRAN_BASE,
        "minuteurs": [{"timer": "timer.t", "nom": "input_text.n"}],
        "agencement": {"zones": ["commandes"], "modes": ["defaut", "minuteur"], "modulateurs": []},
    }
    errors, placeholders = garde_ecran.verifier_ecran_complet(ecran)
    assert errors == {}
    assert placeholders == {}


def test_blocDefaut_voiture_sans_objet_voiture_est_refuse_et_nomme_voiture():
    """LE second cas mesure par le relecteur (l'agencement reel du salon,
    `app/src/ecran.ts`)."""
    ecran = {
        **_ECRAN_BASE,
        "agencement": {
            "zones": ["commandes"], "modes": ["defaut"], "modulateurs": [], "blocDefaut": "voiture",
        },
    }
    errors, placeholders = garde_ecran.verifier_ecran_complet(ecran)
    assert errors == {"base": "ecran_deviendrait_invalide"}
    assert placeholders == {"section": "voiture"}


def test_le_nom_de_section_n_est_jamais_tronque_contrairement_a_fautes_localiser():
    """Ronde 1 de relecture : `verifier_ecran_complet` utilise `err.path`
    DIRECTEMENT, jamais `fautes.localiser()`, qui tronque le DERNIER
    segment pour "required" (pour faire correspondre `motif()` au corpus
    ajv — hors de propos ici). Preuve DIRECTE que la troncature de
    `localiser()` aurait rendu ce cas precis inexploitable : `err.path`
    pour un champ RACINE manquant est un chemin a UN SEUL segment
    (`["voiture"]`), que `localiser()` aurait vide."""
    from custom_components.home_desk import schema
    import voluptuous as vol

    ecran = {
        **_ECRAN_BASE,
        "agencement": {
            "zones": ["commandes"], "modes": ["defaut"], "modulateurs": [], "blocDefaut": "voiture",
        },
    }
    try:
        schema.valider(ecran)
        assert False, "cet ecran doit lever"
    except vol.Invalid as err:
        if isinstance(err, vol.MultipleInvalid):
            err = err.errors[0]
        chemin_localiser, _ = schema.localiser(err)
        assert chemin_localiser == [], (
            "fautes.localiser() tronque ce cas a un chemin VIDE — "
            "exactement pourquoi verifier_ecran_complet ne l'utilise pas")
        assert list(err.path) == ["voiture"], "err.path, lui, porte le nom du champ"


# ---------------------------------------------------------------------------
# Le complement STRUCTUREL : chaque site qui persiste (`_async_update`) dans
# listes.py/objets.py doit etre APPAIRE d'un appel a verifier_ecran_complet.
# Une regle mecanique, pas une intuition : si un futur geste ajoute un
# `_async_update` de plus sans le garder, ce test tombe — meme si personne
# n'a encore ecrit le cas particulier qu'il rendrait possible.
# ---------------------------------------------------------------------------


def _compter_appels(chemin: pathlib.Path, nom_fonction: str) -> int:
    arbre = ast.parse(chemin.read_text(encoding="utf-8"))
    return sum(
        1
        for noeud in ast.walk(arbre)
        if isinstance(noeud, ast.Call)
        and (
            (isinstance(noeud.func, ast.Attribute) and noeud.func.attr == nom_fonction)
            or (isinstance(noeud.func, ast.Name) and noeud.func.id == nom_fonction)
        )
    )


def test_chaque_persist_est_appaire_d_une_verification_de_l_ecran_complet():
    """`self._async_update(...)` (le SEUL point d'ecriture, ConfigSubentryFlow)
    et `verifier_ecran_complet(...)` doivent apparaitre le MEME nombre de
    fois dans listes.py et dans objets.py : la structure de ce chantier
    fait passer CHAQUE ecriture par un appel prealable a la garde
    (`_persister_si_valide` dans listes.py ; inline dans objets.py). Un
    futur geste qui ajoute un `_async_update` sans l'appairer fait tomber
    CE test, meme avant qu'un scenario concret ne le revele."""
    composant_dir = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"
    for nom_fichier in ("listes.py", "objets.py", "config_flow.py"):
        chemin = composant_dir / nom_fichier
        n_update = _compter_appels(chemin, "_async_update")
        n_garde = _compter_appels(chemin, "verifier_ecran_complet")
        assert n_update == n_garde, (
            f"{nom_fichier} : {n_update} appel(s) a _async_update pour "
            f"{n_garde} a verifier_ecran_complet — un site d'ecriture "
            "n'est pas garde")
        assert n_update > 0, f"{nom_fichier} : aucun _async_update trouve (le test ne verifie rien)"
