"""Les DEUX sections « objet » (`agencement` — « Blocs et modes » —,
`voiture`) et les DEUX regles hors-schema de la tache 7. Separe de
`test_config_flow.py` en ronde 1 de relecture (ce dernier approchait 500
lignes) — meme couture que `listes.py`/`listes_champs.py` a la tache 6.
`sources` (I5) est parti dans son propre fichier en ronde 2, la section
`voiture` elle-meme (I1) en ronde 3, pour la meme raison (voir
`test_config_flow_sources.py`, `test_config_flow_voiture.py`) ; les
scenarios du Critique (une modification qui rendrait l'ecran invalide)
sont partis en relecture finale de branche (deuxieme ronde), meme raison
encore (voir `test_config_flow_invariants_croises.py`).

Les formulaires de ces deux sections sont du remplissage de champs ; ce qui
merite un test, ce sont les regles qu'AUCUN test parametre sur `SECTIONS`
ne peut couvrir d'office (agencement/voiture n'y sont pas, ce ne sont pas
des sections « liste ») : les deux regles hors-schema et l'ordre soumis des
multi-selections (I2) restent ICI ; les scenarios du Critique -- dont le
MECANISME est teste directement dans `test_garde_ecran.py`, ces tests-ci
en etant la preuve DE BOUT EN BOUT par le flow reel -- vivent desormais
dans le fichier separe ci-dessus.
"""
import ast
import json
import pathlib

from homeassistant import data_entry_flow

from conftest import ELEMENTS_VALIDES, _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import (
    DOMAIN,
    ERREUR_ALERTE_PAS_EN_TETE,
    ERREUR_BUDGET_INTENABLE_MODE,
    ERREUR_CHAMP_ELEMENT_REQUIS,
    ERREUR_RECETTE_SANS_MODE,
    SOUS_ENTREE_ECRAN,
)

CHEMIN_TRADUCTIONS = (
    pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk" / "translations"
)


# ---------------------------------------------------------------------------
# Le TROISIEME invariant croise (recette_sans_mode)
# ---------------------------------------------------------------------------


async def test_le_TROISIEME_invariant_croise_est_refuse_a_la_saisie(hass, entree_peuplee):
    """Legue par le plan 2, nomme et deliberement NON mis dans le schema.

    Une tuile `vue: '#recette'` sur un ecran dont `agencement.modes` ne
    contient pas `recette`. Il n'est pas dans le schema JSON a dessein : le
    schema juge un ecran FINI, le formulaire juge une saisie EN COURS — et
    lui seul peut proposer le remede, ce qu'un if/then JSON Schema ne sait
    pas faire.

    `entree_peuplee` n'a jamais configure d'agencement : `agencement.modes`
    est donc vide, et TOUTE tuile `vue: '#recette'` y est refusee."""
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    subentry_id = next(iter(entry.subentries))
    flow = await _init_reconfigure(hass, entree_peuplee, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "libelle": "Recette",
            "icone": "book",
            "entite": "sensor.test_prochain_repas",
            "vue": "#recette",
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERREUR_RECETTE_SANS_MODE
    # Ronde 1 de relecture (Mineur) : le message affirmait que la tuile « ne
    # ferait rien » — FAUX, `app/src/demarrage.ts` ouvre `#recette` sur le
    # SEUL hash, sans jamais lire `agencement.modes` (la tuile fonctionne).
    # Ce qui manque vraiment, c'est le point de reprise sur l'accueil
    # (`modes.ts`, CONDITIONS.recette). Sonde de bout en bout, en francais
    # et en anglais, le texte que l'utilisateur verrait reellement.
    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    message_fr = fr["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_RECETTE_SANS_MODE]
    assert "recette" in message_fr.lower()
    assert "blocs et modes" in message_fr.lower()
    assert "ne fera rien" not in message_fr.lower()
    assert "inerte" not in message_fr.lower()
    en = json.loads((CHEMIN_TRADUCTIONS / "en.json").read_text(encoding="utf-8"))
    message_en = en["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_RECETTE_SANS_MODE]
    assert "recette" in message_en.lower()
    assert "blocks and modes" in message_en.lower()


# ---------------------------------------------------------------------------
# Le budget verifie MODE PAR MODE (budget_intenable_mode)
# ---------------------------------------------------------------------------


async def test_le_budget_nomme_le_PIRE_mode_pas_le_premier_qui_deborde(hass, entree):
    """La tache 5 ne verifiait que le mode "defaut", le moins cher. Ici la
    donnee existe enfin, donc la verification peut etre complete.

    Ronde 1 de relecture (Important I3) : le decor precedent n'avait
    qu'UN SEUL mode qui debordait ("minuteur"), ce qui rendait « nommer le
    PREMIER mode qui deborde » et « nommer le PIRE » indiscernables : un
    bug qui nommerait le premier mode debordant plutot que le pire aurait
    laisse ce test vert. Decor corrige : DEUX modes debordent, de montants
    DIFFERENTS, "cinema" SOUMIS AVANT "minuteur" dans la liste (pour qu'un
    bug "premier trouve" nomme cinema, pas minuteur) -- zones=["ambiances",
    "commandes", "blocCentral"] (deliberement PAS ZONES_DEFAUT, qui porte
    aussi "synthese" -- pour prouver que ce sont les zones SAISIES ICI, et
    non budget.ZONES_DEFAUT, qui comptent dans la verification de
    l'agencement).

    hauteurUtile=436 : le plus petit budget qui passe encore la garde
    d'IDENTITE (_valider_identite, mode "defaut" contre ZONES_DEFAUT -- 436
    px, verifie par execution : cout_ecran("defaut", True, 0, ZONES_DEFAUT)
    == 436). Le mode "minuteur" exige un slot de minuteur (garde_ecran.py,
    le Critique) -- persiste ici pour que l'agencement lui-meme reste
    valide -- ce qui rend aussi rangee_ambiance vrai en permanence (la
    formule compte aussi les minuteurs, cf. app/src/demarrage.ts) : ce
    test-ci ne cherche donc PAS a faire varier rangee_ambiance (voir le
    test suivant pour cette preuve-la, avec un decor SANS minuteur). A
    rangee_ambiance=True : verifier_budget("cinema", True, 436, zones) =
    29, verifier_budget("minuteur", True, 436, zones) = 82 (le pire) --
    verifie par execution, PAS retape de memoire (le brief nomme "45" a cet
    endroit, et previent explicitement que cette valeur est fausse)."""
    subentry_id = await _creer_ecran(hass, entree, hauteurUtile=436)
    zones = ["ambiances", "commandes", "blocCentral"]
    modes = ["defaut", "cinema", "minuteur"]

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "minuteurs"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], ELEMENTS_VALIDES["minuteurs"])
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"zones": zones, "modes": modes})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERREUR_BUDGET_INTENABLE_MODE
    # "cinema" est SOUMIS AVANT "minuteur" : un bug "premier qui deborde"
    # nommerait cinema (29 px). Le PIRE est minuteur (82 px).
    # Ronde 2 de relecture (point 3) : {mode} est desormais TRADUIT
    # ("Timer", le libelle EN du selecteur "mode"), plus l'identifiant
    # brut du contrat ("minuteur").
    assert resultat["description_placeholders"]["mode"] == "Timer"
    assert resultat["description_placeholders"]["debordement"] == "82"

    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert entry.subentries[subentry_id].data.get("agencement") is None, (
        "un refus ne doit RIEN persister")


async def test_le_budget_suit_rangee_ambiance_REELLEMENT_persistee(hass, entree):
    """Ronde 1 de relecture (Important I3, seconde moitie) : prouve que
    `rangee_ambiance` (async_step_agencement) vient bien de l'ecran
    REELLEMENT persiste, jamais fige a `True` ni calcule d'un seul cote.
    Decor SANS mode "minuteur" (dont la seule presence dans `minuteurs`
    forcerait `rangee_ambiance` a vrai en permanence, cf. le test
    ci-dessus -- ce test-ci veut l'isoler de la seule contribution des
    AMBIANCES) : `modes=["defaut", "cinema"]`, memes zones que ci-dessus.

    Sans aucune tuile d'ambiance persistee, rangee_ambiance=False et
    verifier_budget("cinema", False, 436, zones) = 0 : l'agencement TIENT.
    Une fois une VRAIE tuile d'ambiance ajoutee, rangee_ambiance=True et
    verifier_budget("cinema", True, 436, zones) = 29 : LE MEME agencement,
    resoumis a l'identique, est desormais REFUSE. Un code qui ignorerait
    `rangee_ambiance` (fige a True, ou a False) rendrait les deux
    soumissions indiscernables."""
    subentry_id = await _creer_ecran(hass, entree, hauteurUtile=436)
    zones = ["ambiances", "commandes", "blocCentral"]
    modes = ["defaut", "cinema"]

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"zones": zones, "modes": modes})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU, resultat.get("errors")

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "ambiances"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], ELEMENTS_VALIDES["ambiances"])
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"zones": zones, "modes": modes})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERREUR_BUDGET_INTENABLE_MODE
    # Ronde 2 de relecture (point 3) : libelle traduit ("Cinema"), pas
    # l'identifiant brut ("cinema").
    assert resultat["description_placeholders"]["mode"] == "Cinema"
    assert resultat["description_placeholders"]["debordement"] == "29"


# ---------------------------------------------------------------------------
# I2 : l'ordre SOUMIS de zones/modes est l'ordre STOCKE (pas de tri)
# ---------------------------------------------------------------------------


async def test_agencement_conserve_l_ordre_soumis_des_zones_et_des_modes(hass, entree):
    """Ronde 1 de relecture (Important I2) : le repli assume au rapport
    (« l'ordre soumis est l'ordre stocke, la meme garantie qu'un monter/
    descendre ») n'etait garde par AUCUN test — remplacer `list(...)` par
    `sorted(...)` (objets.py) passait les 123 tests d'alors. `zones` et
    `modes` sont ici DELIBEREMENT dans un ordre NON alphabetique : un
    `sorted()` les rangerait differemment de ce que ce test exige.

    `modes_soumis` garde "alerte" en PREMIERE position (relecture finale de
    branche : `schema._alerte_en_tete()` refuse desormais tout autre ordre
    quand "alerte" est present) -- le reste de la liste (`voiture`,
    `defaut`) reste non trie pour continuer a distinguer cette garde d'un
    `sorted()`."""
    subentry_id = await _creer_ecran(hass, entree)
    zones_soumises = ["commandes", "synthese", "ambiances"]
    modes_soumis = ["alerte", "voiture", "defaut"]
    assert zones_soumises != sorted(zones_soumises)
    assert modes_soumis != sorted(modes_soumis)

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"zones": zones_soumises, "modes": modes_soumis})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU

    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["agencement"]["zones"] == zones_soumises
    assert subentry.data["agencement"]["modes"] == modes_soumis


async def test_agencement_zones_sans_commandes_est_refuse(hass, entree):
    """Mineur de la ronde 1 : `contains` -> `ERREUR_CHAMP_ELEMENT_REQUIS`
    n'etait asserte nulle part (mutation verte : supprimer
    `vol.Contains("commandes")` de `schema.AGENCEMENT` ne faisait tomber
    AUCUN test de flow)."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"zones": ["synthese", "ambiances"], "modes": ["defaut"]})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["zones"] == ERREUR_CHAMP_ELEMENT_REQUIS


async def test_agencement_alerte_pas_en_tete_est_refuse_a_la_saisie(hass, entree):
    """Relecture finale de branche (deuxieme ronde) : `ERREUR_ALERTE_PAS_
    EN_TETE` etait le SEUL des 27 codes d'erreur de formulaire cite nulle
    part dans `tests/composant/` -- mesure : retirer son entree de la
    table des messages (`_ERREUR_PAR_MOT_CLE`, listes_erreurs.py, ou desormais le
    cas special d'`objets.py`) laissait les 208 tests d'alors verts, et le
    formulaire retombait sur le charabia « Ce champ n'est pas valide »
    (le meme que la ronde 3 de la tache 6 avait corrige). Ce test epingle
    les DEUX moities : le CHAMP attribue (`errors["modes"]`, pas "base")
    et la PHRASE rendue, dans les deux langues -- via la meme sonde de
    bout en bout que `test_le_TROISIEME_invariant_croise_est_refuse_a_la_
    saisie` plus haut."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"zones": ["commandes"], "modes": ["defaut", "media", "alerte"]})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["modes"] == ERREUR_ALERTE_PAS_EN_TETE

    # Le champ est une liste de cases a cocher : « mettre en premier » n'a
    # aucun geste evident, contrairement aux voisines de ce message
    # (« augmentez », « retirez »...) -- le message doit donc NOMMER le
    # geste (decocher/recocher), pas seulement la regle.
    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    message_fr = fr["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_ALERTE_PAS_EN_TETE]
    assert "alerte" in message_fr.lower()
    assert "décochez" in message_fr.lower()
    assert "recochez" in message_fr.lower()
    en = json.loads((CHEMIN_TRADUCTIONS / "en.json").read_text(encoding="utf-8"))
    message_en = en["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_ALERTE_PAS_EN_TETE]
    assert "alert" in message_en.lower()
    assert "uncheck" in message_en.lower()
    assert "check" in message_en.lower()


# ---------------------------------------------------------------------------
# I1 (la section Voiture n'avait aucun test fonctionnel) vit dans
# test_config_flow_voiture.py, separe d'ici en ronde 3 de relecture (ce
# fichier depassait 500 lignes) — meme couture que `test_config_flow_
# sources.py` en ronde 2.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# I5 (les six champs multi-entites de `sources`, Required SANS default) et
# les deux mineurs de `sources` vivent dans test_config_flow_sources.py,
# separe d'ici en ronde 2 de relecture (ce fichier approchait 500 lignes) —
# meme couture que `listes_champs_sources.py` : « une section = un fichier ».
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Mineur (ronde 1) / point 5 (ronde 2) : les translation_key, gardes par
# aucun test.
# ---------------------------------------------------------------------------


def test_tous_les_selectselectorconfig_d_objets_py_portent_un_translation_key():
    """Ronde 2 de relecture (point 5) : les quatre `translation_key`
    ajoutes en ronde 1 (bloc_defaut/zone/mode/modulateur) n'etaient GARDES
    par AUCUN test — retirer UN SEUL, ou les QUATRE, laissait `make test-
    composant` entierement vert (`_cles_attendues`, test_config_flow.py,
    ne prouve que le JSON PORTE ces cles, jamais que les selecteurs les
    DEMANDENT).

    Generalise au FICHIER (AST, pas aux quatre noms en dur) : TOUT
    `SelectSelectorConfig` d'`objets.py` doit porter un `translation_key` —
    un cinquieme selecteur, ajoute demain a ce module SANS lui, fait
    tomber ce test aussi, pas seulement les quatre d'aujourd'hui.

    Scope deliberement limite a `objets.py` (pas tout le paquet) : trois
    AUTRES `SelectSelectorConfig` existent ailleurs (`_selecteur_icone` et
    l'"operateur" de synthese, `listes_champs.py` ; les options DYNAMIQUES
    de `_schema_choix`, `listes.py`, qui portent deja leur propre libelle
    via `SelectOptionDict` et n'ont donc rien a traduire) — dette anterieure
    a cette tache, non fermee ici (voir le rapport)."""
    chemin = (
        pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk" / "objets.py"
    )
    arbre = ast.parse(chemin.read_text(encoding="utf-8"))
    appels = [
        noeud for noeud in ast.walk(arbre)
        if isinstance(noeud, ast.Call)
        and isinstance(noeud.func, ast.Attribute)
        and noeud.func.attr == "SelectSelectorConfig"
    ]
    assert len(appels) >= 4, "moins de SelectSelectorConfig que prevu : ce test ne verifie plus rien"
    sans_translation_key = [
        n for n in appels if not any(kw.arg == "translation_key" for kw in n.keywords)
    ]
    assert not sans_translation_key, (
        f"{len(sans_translation_key)} SelectSelectorConfig sans translation_key dans objets.py")
