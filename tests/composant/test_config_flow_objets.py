"""Les DEUX sections « objet » (`agencement` — « Blocs et modes » —,
`voiture`) et les DEUX regles hors-schema de la tache 7. Separe de
`test_config_flow.py` en ronde 1 de relecture (ce dernier approchait 500
lignes) — meme couture que `list_sections.py`/`list_fields.py` a la tache 6.
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
    ERROR_ALERT_NOT_FIRST,
    ERROR_BUDGET_UNTENABLE_MODE,
    ERROR_FIELD_ITEM_REQUIRED,
    ERROR_RECIPE_WITHOUT_MODE,
    SUBENTRY_SCREEN,
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
    assert resultat["errors"]["base"] == ERROR_RECIPE_WITHOUT_MODE
    # Ronde 1 de relecture (Mineur) : le message affirmait que la tuile « ne
    # ferait rien » — FAUX, `app/src/demarrage.ts` ouvre `#recette` sur le
    # SEUL hash, sans jamais lire `agencement.modes` (la tuile fonctionne).
    # Ce qui manque vraiment, c'est le point de reprise sur l'accueil
    # (`modes.ts`, CONDITIONS.recette). Sonde de bout en bout, en francais
    # et en anglais, le texte que l'utilisateur verrait reellement.
    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    message_fr = fr["config_subentries"][SUBENTRY_SCREEN]["error"][ERROR_RECIPE_WITHOUT_MODE]
    assert "recette" in message_fr.lower()
    assert "blocs et modes" in message_fr.lower()
    assert "ne fera rien" not in message_fr.lower()
    assert "inerte" not in message_fr.lower()
    en = json.loads((CHEMIN_TRADUCTIONS / "en.json").read_text(encoding="utf-8"))
    message_en = en["config_subentries"][SUBENTRY_SCREEN]["error"][ERROR_RECIPE_WITHOUT_MODE]
    assert "recette" in message_en.lower()
    assert "blocks and modes" in message_en.lower()


# ---------------------------------------------------------------------------
# Le budget suit les deux compositions de l'ecran (budget_intenable_mode)
# ---------------------------------------------------------------------------


async def _creer_ecran_a_hauteur(hass, entree, hauteur: int) -> str:
    """An already persisted screen whose height no longer passes the budget.

    The identity step refuses such a height up front (`screen_overflow` with the default
    zones), so a screen this low can only exist as DATA that predates the rule: the agencement
    step is then the one that has to catch it. Created tall, then lowered in place."""
    subentry_id = await _creer_ecran(hass, entree)
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    subentry = entry.subentries[subentry_id]
    hass.config_entries.async_update_subentry(
        entry, subentry, data={**subentry.data, "hauteurUtile": hauteur})
    return subentry_id


async def _soumettre_agencement(hass, entree, subentry_id, zones, modes):
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    return await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"zones": zones, "modes": modes})


async def test_le_budget_suit_la_carte_avec_les_zones_saisies(hass, entree):
    """Card-stack plan, task 1: the form no longer prices mode by mode. The screen shows an
    empty-stack composition AND a card over the day, and `screen_overflow` reports the larger
    overflow -- the card's, whose last rung (reduced synthesis, no Ambiance row) is the most
    expensive composition the screen can be forced into.

    hauteurUtile=436 with zones ["ambiances", "commandes", "blocCentral"] (deliberately NOT the
    default four: it proves the zones ENTERED HERE count, not `budget.ZONES_DEFAUT`):
    121 + 24 + (62 + 264) + 8 x 1 = 479 at zero rows, an overflow of 43. With the default zones
    it would be 511 - 436 = 75. Checked by running it, not typed from memory."""
    subentry_id = await _creer_ecran_a_hauteur(hass, entree, 436)
    resultat = await _soumettre_agencement(
        hass, entree, subentry_id, ["ambiances", "commandes", "blocCentral"], ["defaut"])
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERROR_BUDGET_UNTENABLE_MODE
    assert resultat["description_placeholders"]["debordement"] == "43"
    assert "mode" not in resultat["description_placeholders"]

    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert entry.subentries[subentry_id].data.get("agencement") is None, (
        "un refus ne doit RIEN persister")


async def test_la_rangee_ambiance_ne_change_pas_le_verdict_d_une_carte(hass, entree):
    """The card's ladder drops the Ambiance row, so a persisted Ambiance tile cannot move the
    verdict any more (it did while the form priced `voiture` and `cinema` separately): the same
    layout is refused with the same figure before and after one is added. `rangee_ambiance`
    is still read from the persisted screen, but it is the card that dominates."""
    subentry_id = await _creer_ecran_a_hauteur(hass, entree, 436)
    zones = ["ambiances", "commandes", "blocCentral"]
    modes = ["defaut", "voiture"]

    avant = await _soumettre_agencement(hass, entree, subentry_id, zones, modes)
    assert avant["description_placeholders"]["debordement"] == "43"

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "ambiances"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], ELEMENTS_VALIDES["ambiances"])
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM

    apres = await _soumettre_agencement(hass, entree, subentry_id, zones, modes)
    assert apres["errors"]["base"] == ERROR_BUDGET_UNTENABLE_MODE
    assert apres["description_placeholders"]["debordement"] == "43"


async def test_le_budget_de_la_carte_suit_l_echelle(hass, entree):
    """2026-10-24 (spec 2026-10-23, "Place a l'ecran"): the card is drawn on the LAST rung of the
    ladder when nothing else fits (reduced synthesis, no Ambiance row), so the form prices that
    rung. At 500 px with the four default zones: 121 + 24 + (62 + 264 + 24) + 8 x 2 = 511 px, an
    overflow of 11 px -- not the 115 px of the full composition (two-line synthesis and Ambiance
    row), which would refuse by a figure the tablet never shows."""
    subentry_id = await _creer_ecran_a_hauteur(hass, entree, 500)
    resultat = await _soumettre_agencement(
        hass, entree, subentry_id,
        ["ambiances", "commandes", "blocCentral", "synthese"], ["defaut"])
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERROR_BUDGET_UNTENABLE_MODE
    assert resultat["description_placeholders"]["debordement"] == "11"


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
    """Mineur de la ronde 1 : `contains` -> `ERROR_FIELD_ITEM_REQUIRED`
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
    assert resultat["errors"]["zones"] == ERROR_FIELD_ITEM_REQUIRED


async def test_agencement_alerte_pas_en_tete_est_refuse_a_la_saisie(hass, entree):
    """Relecture finale de branche (deuxieme ronde) : `ERREUR_ALERTE_PAS_
    EN_TETE` etait le SEUL des 27 codes d'erreur de formulaire cite nulle
    part dans `tests/composant/` -- mesure : retirer son entree de la
    table des messages (`_ERROR_BY_KEYWORD`, list_errors.py, ou desormais le
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
    assert resultat["errors"]["modes"] == ERROR_ALERT_NOT_FIRST

    # Le champ est une liste de cases a cocher : « mettre en premier » n'a
    # aucun geste evident, contrairement aux voisines de ce message
    # (« augmentez », « retirez »...) -- le message doit donc NOMMER le
    # geste (decocher/recocher), pas seulement la regle.
    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    message_fr = fr["config_subentries"][SUBENTRY_SCREEN]["error"][ERROR_ALERT_NOT_FIRST]
    assert "alerte" in message_fr.lower()
    assert "décochez" in message_fr.lower()
    assert "recochez" in message_fr.lower()
    en = json.loads((CHEMIN_TRADUCTIONS / "en.json").read_text(encoding="utf-8"))
    message_en = en["config_subentries"][SUBENTRY_SCREEN]["error"][ERROR_ALERT_NOT_FIRST]
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
# meme couture que `list_fields_sources.py` : « une section = un fichier ».
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
    l'"operateur" de synthese, `list_fields.py` ; les options DYNAMIQUES
    de `_schema_choix`, `list_sections.py`, qui portent deja leur propre libelle
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
