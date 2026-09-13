"""Le mecanisme central de la ronde 1 de relecture (le Critique, tache 7) :
`garde_ecran.verifier_ecran_complet` — teste ICI directement (sans passer
par un flow HA), la propriete elle-meme plutot que trois cas particuliers.
Les cas particuliers (via le flow reel) vivent dans
`test_config_flow_objets.py` ; ce fichier tient le MECANISME qui les rend
tous vrais a la fois.

Le relecteur (ronde 1) : « sept des neuf mutations survivantes portent sur
une regle que ton code ou ton rapport affirme tenir. Tu les as toutes
verifiees par des sondes jetables, et tu n'en as transforme aucune en
test. » Ce module et son complement structurel plus bas repondent a ce
constat : le MECANISME, pas seulement ses trois manifestations mesurees.

Ronde 2 de relecture : le complement structurel de la ronde 1 (« chaque
`_async_update` est appaire d'un `verifier_ecran_complet` ») COMPTAIT les
appels par fichier plutot que de verifier une UNICITE globale — un
`_persister(...)` qui ecrivait EN SAUTANT la garde laissait le compte tomber
a zero des DEUX cotes a la fois, donc rester VERT. Remplace par
`test_garde_ecran_est_le_seul_module_a_appeler__async_update`, sur le MEME
idiome que `test_formulaire_est_le_seul_module_a_appeler_async_show_form_
avec_un_data_schema` (test_config_flow.py) : une EXISTENCE, jamais une
egalite de comptage."""
import ast
import pathlib

import pytest

from custom_components.home_desk import garde_ecran
from custom_components.home_desk.const import ERREUR_ECRAN_DEVIENDRAIT_INVALIDE

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
    `listes_champs.SECTIONS` l'initialise a la creation.

    Ronde 2 de relecture (mineur) : la constante `ERREUR_ECRAN_
    DEVIENDRAIT_INVALIDE` est importee ICI, jamais retapee en dur — la
    regle vaut aussi pour les tests, pas seulement pour le code."""
    ecran = {
        **_ECRAN_BASE,
        "agencement": {"zones": ["commandes"], "modes": ["defaut", "minuteur"], "modulateurs": []},
    }
    errors, placeholders = garde_ecran.verifier_ecran_complet(ecran)
    assert errors == {"base": ERREUR_ECRAN_DEVIENDRAIT_INVALIDE}
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
    assert errors == {"base": ERREUR_ECRAN_DEVIENDRAIT_INVALIDE}
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


def test_section_courante_egale_a_la_section_fautive_redirige_vers_agencement():
    """Ronde 2 de relecture (point 3) : retirer la voiture DEPUIS la
    section "voiture" pendant que `blocDefaut` l'exige encore nommait
    "voiture" — la section ou l'utilisateur se trouve DEJA, sans rien a y
    corriger. Le seul remede reel est dans "agencement" (« Blocs et
    modes »). `section_courante` porte la section D'OU L'ON ECRIT ; quand
    elle egale la section fautive, la garde redirige vers "agencement"."""
    ecran = {
        **_ECRAN_BASE,
        "agencement": {
            "zones": ["commandes"], "modes": ["defaut"], "modulateurs": [], "blocDefaut": "voiture",
        },
    }
    errors, placeholders = garde_ecran.verifier_ecran_complet(ecran, section_courante="voiture")
    assert errors == {"base": ERREUR_ECRAN_DEVIENDRAIT_INVALIDE}
    assert placeholders == {"section": "agencement"}


def test_section_courante_differente_de_la_section_fautive_ne_redirige_pas():
    """Le pendant : depuis "agencement" lui-meme (l'utilisateur vient d'y
    choisir `blocDefaut: voiture` sans que l'objet existe), la section
    fautive ("voiture") N'EST PAS celle d'ou l'on ecrit — aucune
    redirection, "voiture" reste la bonne reponse (l'utilisateur n'y est
    pas deja)."""
    ecran = {
        **_ECRAN_BASE,
        "agencement": {
            "zones": ["commandes"], "modes": ["defaut"], "modulateurs": [], "blocDefaut": "voiture",
        },
    }
    errors, placeholders = garde_ecran.verifier_ecran_complet(ecran, section_courante="agencement")
    assert errors == {"base": ERREUR_ECRAN_DEVIENDRAIT_INVALIDE}
    assert placeholders == {"section": "voiture"}


def test_hass_fourni_traduit_la_section_en_libelle_humain():
    """Point 3 de la ronde 2 (deuxieme moitie) : `{section}` interpolait
    l'identifiant BRUT du contrat ("minuteurs"), jamais traduit — la meme
    faute que le mineur 6 de la ronde 1 fermait deja pour les options de
    `SelectSelector`. Sans `hass`, le MECANISME reste testable seul
    (l'identifiant brut, comme avant) ; avec un `hass` (ici un objet
    minimal portant `config.language`), la section rendue est le libelle
    HUMAIN du menu de reconfiguration."""
    class _ConfigFactice:
        language = "en"

    class _HassFactice:
        config = _ConfigFactice()

    ecran = {
        **_ECRAN_BASE,
        "agencement": {"zones": ["commandes"], "modes": ["defaut", "minuteur"], "modulateurs": []},
    }
    errors, placeholders = garde_ecran.verifier_ecran_complet(ecran, hass=_HassFactice())
    assert errors == {"base": ERREUR_ECRAN_DEVIENDRAIT_INVALIDE}
    assert placeholders == {"section": "Timers"}, "le libelle EN du menu, jamais l'identifiant brut"


# ---------------------------------------------------------------------------
# Le complement STRUCTUREL : `garde_ecran.py` est le SEUL module a appeler
# `_async_update` — jamais une egalite de comptage par fichier (ronde 1),
# qu'un contournement local (un second site d'ecriture qui saute la garde)
# laissait vert des DEUX cotes a la fois.
# ---------------------------------------------------------------------------


# Ronde 3 de relecture (point 1) : la ronde 2 ne nommait qu'`_async_update` —
# un mutant qui ecrit via `self.hass.config_entries.async_update_subentry(
# entry=..., subentry=..., data=...)` (l'idiome PUBLIC, celui que
# `ConfigSubentryFlow._async_update` appelle lui-meme en interne,
# `config_entries.py:3785` documentant explicitement `_async_update` comme
# « Internal to be used by update_and_abort and update_reload_and_abort
# methods only ») passait les 154 tests — mesure. `async_update_and_abort`
# et `async_update_reload_and_abort` (les DEUX methodes que cette docstring
# nomme) sont les DEUX AUTRES portes documentees qui aboutissent au meme
# effet. Les QUATRE noms sont donc gardes, jamais un seul.
_PORTES_ECRITURE = (
    "_async_update",
    "async_update_subentry",
    "async_update_and_abort",
    "async_update_reload_and_abort",
    # Ronde 2 de relecture (tache 8) : la CREATION, pas seulement la mise
    # a jour -- la tache 9 (un importeur) semera des sous-entrees, et si
    # elle le fait par `hass.config_entries.async_add_subentry(...)`
    # directement (hors du flow, qui passe par `self.async_create_entry`
    # puis le gestionnaire de flow), ce serait la TROISIEME porte que la
    # docstring de `websocket._resoudre` nomme deja -- jamais gardee tant
    # qu'elle n'est appelee nulle part. Fermee ICI, avant d'exister.
    "async_add_subentry",
    # Ronde 3 de relecture (tache 8) : `async_add_subentry` ET
    # `async_remove_subentry` deleguent tous les deux a une methode
    # PRIVEE commune, `_async_update_entry(entry, subentries=...)`
    # (`config_entries.py:2583`) -- verifie par sonde : un appel DIRECT a
    # cette methode (en sautant les deux portes publiques ci-dessus) seme
    # reellement une sous-entree INVALIDE (`{"nom": "porte-derobee"}`,
    # aucun champ requis), confirme en relisant `entry.subentries` --
    # pendant que ce test restait VERT. C'est l'ANCETRE COMMUN des deux
    # portes de creation/suppression : la surveiller couvre ses
    # DESCENDANTS d'un coup, un chemin plus court que celui nomme au
    # dessus.
    "_async_update_entry",
)


def _appels_portes_ecriture(chemin: pathlib.Path) -> set[str]:
    arbre = ast.parse(chemin.read_text(encoding="utf-8"))
    return {
        noeud.func.attr
        for noeud in ast.walk(arbre)
        if isinstance(noeud, ast.Call)
        and isinstance(noeud.func, ast.Attribute)
        and noeud.func.attr in _PORTES_ECRITURE
    }


def test_garde_ecran_est_le_seul_module_a_appeler_une_porte_d_ecriture():
    """Ronde 2 de relecture (le clou qui n'etait pas le bon) : le test
    precedent comptait `_async_update` face a `verifier_ecran_complet`,
    PAR FICHIER — un `_persister(...)` qui ecrivait en SAUTANT la garde
    laissait ce compte EGAL (zero des deux cotes), donc VERT.

    Ronde 3 (point 1, le cran suivant) : meme apres avoir corrige ca, le
    test ne nommait QU`_async_update` — `self.hass.config_entries.
    async_update_subentry(entry=..., subentry=..., data=...)` (l'idiome
    PUBLIC que HA documente pour cet usage, cf. commentaire ci-dessus)
    ecrit exactement pareil, EN SAUTANT `garde_ecran.persister_si_valide`,
    et passait les 154 tests. Genre le meme MECANISME (un `glob("*.py")`,
    une EXISTENCE, jamais un compte — le MEME idiome que `test_formulaire_
    est_le_seul_module_a_appeler_async_show_form_avec_un_data_schema`,
    test_config_flow.py) aux QUATRE portes d'ecriture documentees par HA,
    pas a un seul nom.

    Ronde 4 (la limite structurelle de ce test, a dire plutot qu'a taire) :
    ce test ferme TOUTE ecriture qui passe par l'une des quatre portes
    NOMMEES ci-dessus — `_async_update`, `async_update_subentry`,
    `async_update_and_abort`, `async_update_reload_and_abort`. Il NE PEUT
    PAS fermer une mutation directe par `object.__setattr__(subentry,
    "data", ...)` : `ConfigSubentry` est un `@dataclass(frozen=True,
    kw_only=True)` (`config_entries.py:371`), et `async_update_subentry`
    lui-meme (`config_entries.py:2741`) contourne son propre gel par ce
    meme appel — rien n'empeche un appelant de faire l'IDENTIQUE
    directement, sans jamais nommer une des quatre portes. Mesure : ce
    mutant precis (`_persister_si_valide`, listes.py, remplace par
    `object.__setattr__(subentry, "data", {**subentry.data, cle:
    elements}); return True`) laisse CE test VERT — un test AST sur des
    noms d'attribut ne peut structurellement pas voir un appel qui n'en
    nomme aucun des quatre, et generaliser plus loin reviendrait a
    poursuivre un ensemble de contournements infini (tout appelant peut
    ecrire `object.__setattr__` sur n'importe quel objet). Ce n'est pas un
    oubli de ce test : c'est la limite de ce que « chercher un nom dans un
    arbre syntaxique » peut prouver. Le mutant EST attrape ailleurs — voir
    `test_supprimer_le_dernier_minuteur_alors_que_le_mode_minuteur_est_
    actif_est_refuse` (test_config_flow_objets.py), qui joue desormais ce
    role EN CONNAISSANCE DE CAUSE, pas par accident.

    Ronde 3 de relecture (tache 8) : `_async_update_entry` rejoint les
    CINQ portes desormais nommees — l'ANCETRE COMMUN de `async_add_
    subentry` ET `async_remove_subentry` (`config_entries.py:2583`),
    mesure par sonde : un appel DIRECT a cette methode privee, en
    sautant les deux portes publiques, seme une sous-entree INVALIDE
    (`{"nom": "porte-derobee"}`) pendant que ce test restait VERT — un
    chemin plus COURT que celui nomme pour `async_add_subentry` seul.
    La LIMITE RESIDUELLE, une fois cette cinquieme porte fermee, reste
    EXACTEMENT celle du paragraphe precedent : `object.__setattr__`
    direct sur `entry.subentries` (un dict MUTABLE, contrairement au
    dataclass GELE de `ConfigSubentry` — mais tout aussi accessible a
    quiconque possede une reference `entry`) contournerait les CINQ
    portes nommees sans en appeler aucune. MEME classe de dette que
    celle deja ecrite ci-dessus pour `ConfigSubentry.data`, ecrite ICI
    AUSSI plutot que laissee implicite — la tache 7 (ronde 4) avait pris
    soin de noircir cette limite pour la mutation SUR LA SOUS-ENTREE ;
    cette ronde le fait desormais pour la mutation SUR L'ENTREE elle-meme,
    la meme limite structurelle rencontree une deuxieme fois."""
    composant_dir = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk"
    fautifs: dict[str, set[str]] = {}
    for chemin in composant_dir.glob("*.py"):
        if chemin.name == "garde_ecran.py":
            continue
        trouves = _appels_portes_ecriture(chemin)
        if trouves:
            fautifs[chemin.name] = trouves
    assert not fautifs, f"porte(s) d'ecriture hors de garde_ecran.py : {fautifs}"

    # Preuve que ce test verifie bien QUELQUE CHOSE (garde_ecran.py
    # appelle au moins une des quatre portes) plutot que de passer a vide.
    trouves_garde = _appels_portes_ecriture(composant_dir / "garde_ecran.py")
    assert trouves_garde, "garde_ecran.py n'appelle plus aucune porte d'ecriture"


# ---------------------------------------------------------------------------
# Point 2 de la ronde 2 : `listes._localiser_champ` (le meme mecanisme que
# `garde_ecran.verifier_ecran_complet`, applique cette fois aux HUIT
# sections « liste ») ne tronque plus le nom du champ pour "required".
# ---------------------------------------------------------------------------


def test_localiser_champ_ne_tronque_aucune_des_quatre_formes():
    """Mesure sur les QUATRE formes que le relecteur a nommees. Trois
    d'entre elles (BOUTON/entite, SOURCE/nom, MINUTEUR_SLOT/nom) ne sont
    PAS atteignables par le flow reel (`entite`/`timer`/`nom` sont des
    `EntitySelector` que `data_schema` refuse deja en `InvalidData` avant
    ce module ; `nom` de SOURCE est intercepte par `ChampVide` — verifie
    par execution) : la SEULE facon de les eprouver est directement, sur
    le MECANISME, avec un dict CONSTRUIT a la main — exactement la forme
    qu'un champ omis par une future construction (pas seulement une
    saisie utilisateur) prendrait. La quatrieme (SYNTHESE/valeur, un `str`
    NU plutot qu'un selecteur) EST atteignable par le flow reel : voir
    `test_valeur_vide_sur_une_ligne_de_synthese_nomme_le_champ_pas_base`
    (test_config_flow_champs.py)."""
    import voluptuous as vol
    from custom_components.home_desk import schema
    from custom_components.home_desk.listes import _localiser_champ

    cas = (
        ("BOUTON/entite", schema.BOUTON, {"libelle": "x", "icone": "bulb"}, "entite"),
        ("SOURCE/nom", schema.SOURCE, {
            "titre": [], "sousTitre": [], "affiche": [], "progression": [],
            "transport": [], "volume": [],
        }, "nom"),
        ("MINUTEUR_SLOT/nom", schema.MINUTEUR_SLOT, {"timer": "timer.t"}, "nom"),
    )
    for nom, valider, candidat, champ_attendu in cas:
        try:
            valider(candidat)
            assert False, f"{nom} : ce candidat doit lever"
        except vol.Invalid as err:
            champ, mot_cle = _localiser_champ(err)
            assert champ == champ_attendu, f"{nom} : {champ!r} != {champ_attendu!r} (mot_cle={mot_cle!r})"
            assert mot_cle == "required"


# ---------------------------------------------------------------------------
# Tache 9 : `garde_ecran.importer_ecrans`, le SECOND site d'ecriture
# legitime de ce module (le chemin de creation en masse pour
# `home_desk.importer`, services.py) -- meme MECANISME que ci-dessus,
# teste directement sans passer par le service HA.
# ---------------------------------------------------------------------------


def test_importer_ecrans_valide_tout_avant_d_ecrire_quoi_que_ce_soit():
    """`hass` est un objet factice dont `config_entries._async_update_entry`
    leve si on l'appelle : si `importer_ecrans` ecrivait AVANT d'avoir fini
    de valider tous les ecrans, cette sonde le prouverait -- une preuve
    plus dure qu'une simple assertion sur l'etat final, qui ne
    distinguerait pas "jamais appele" de "appele puis annule"."""
    import voluptuous as vol

    class _ConfigEntriesQuiExplose:
        @staticmethod
        def _async_update_entry(*_args, **_kwargs):
            raise AssertionError("importer_ecrans a ecrit alors qu'un ecran est invalide")

    class _HassFactice:
        config_entries = _ConfigEntriesQuiExplose()

    ecrans = [
        ("Valide", {
            "nom": "Valide", "temperature": "sensor.t",
            "ambiances": [], "commandes": [], "extrasMaison": [],
            "synthese": [], "sources": [], "ouvrants": [],
        }),
        ("Invalide", {"nom": "Invalide"}),
    ]

    with pytest.raises(vol.Invalid):
        garde_ecran.importer_ecrans(hass=_HassFactice(), entry=object(), ecrans=ecrans)


def test_importer_ecrans_ecrit_en_UNE_SEULE_FOIS():
    """Ronde 1 de relecture (tache 9, Mineur -- « la bascule indivisible »)
    : la docstring de `garde_ecran.importer_ecrans` argumente sur dix
    lignes qu'une SEULE ecriture reelle (`_async_update_entry`) rend la
    bascule indivisible -- jamais gardee par un test avant cette ronde.
    Remplacer cette ecriture unique par une boucle
    `async_remove_subentry` + `async_add_subentry` par ecran produirait le
    MEME etat final tout en ouvrant une FENETRE ou `entry.subentries` est
    incomplet -- invisible a un test qui ne verifie que l'etat final.
    Cette sonde compte les appels REELS plutot que l'etat :
    `_async_update_entry` doit etre appele EXACTEMENT une fois, avec les
    DEUX ecrans a la fois ; les deux autres portes ne doivent jamais
    l'etre."""

    class _ConfigEntriesFactice:
        appels: list[tuple[str, tuple, dict]] = []

        def _async_update_entry(self, *args, **kwargs):
            self.appels.append(("_async_update_entry", args, kwargs))

        def async_add_subentry(self, *args, **kwargs):
            raise AssertionError("importer_ecrans ne doit jamais appeler async_add_subentry")

        def async_remove_subentry(self, *args, **kwargs):
            raise AssertionError("importer_ecrans ne doit jamais appeler async_remove_subentry")

    class _HassFactice:
        config_entries = _ConfigEntriesFactice()

    ecrans = [
        ("Un", {
            "nom": "Un", "temperature": "sensor.t",
            "ambiances": [], "commandes": [], "extrasMaison": [],
            "synthese": [], "sources": [], "ouvrants": [],
        }),
        ("Deux", {
            "nom": "Deux", "temperature": "sensor.t",
            "ambiances": [], "commandes": [], "extrasMaison": [],
            "synthese": [], "sources": [], "ouvrants": [],
        }),
    ]

    garde_ecran.importer_ecrans(hass=_HassFactice(), entry=object(), ecrans=ecrans)

    appels = _HassFactice.config_entries.appels
    assert len(appels) == 1, f"attendu UNE seule ecriture, obtenu {len(appels)}"
    _nom_appel, _args, kwargs = appels[0]
    assert len(kwargs["subentries"]) == 2
