"""Les DEUX sections « objet » (`agencement` — « Blocs et modes » —,
`voiture`) et les DEUX regles hors-schema de la tache 7. Separe de
`test_config_flow.py` en ronde 1 de relecture (ce dernier approchait 500
lignes) — meme couture que `listes.py`/`listes_champs.py` a la tache 6.
`sources` (I5) est parti dans son propre fichier en ronde 2, la section
`voiture` elle-meme (I1) en ronde 3, pour la meme raison (voir
`test_config_flow_sources.py`, `test_config_flow_voiture.py`).

Les formulaires de ces deux sections sont du remplissage de champs ; ce qui
merite un test, ce sont les regles qu'AUCUN test parametre sur `SECTIONS`
ne peut couvrir d'office (agencement/voiture n'y sont pas, ce ne sont pas
des sections « liste ») : les deux regles hors-schema, l'ordre soumis des
multi-selections (I2), et les scenarios concrets du Critique (une
modification qui rendrait l'ecran invalide) — leur MECANISME est teste
directement dans `test_garde_ecran.py`, ces trois-ci en sont la preuve DE
BOUT EN BOUT, par le flow reel.
"""
import ast
import json
import pathlib

from homeassistant import data_entry_flow

from conftest import ELEMENTS_VALIDES, VOITURE_COMPLETE, _creer_ecran, _geste, _init_reconfigure
from custom_components.home_desk.const import (
    ACTION_SUPPRIMER,
    DOMAIN,
    ERREUR_BUDGET_INTENABLE_MODE,
    ERREUR_CHAMP_ELEMENT_REQUIS,
    ERREUR_ECRAN_DEVIENDRAIT_INVALIDE,
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


# ---------------------------------------------------------------------------
# Le Critique : un step qui persiste doit garder l'ecran ENTIER valide
# ---------------------------------------------------------------------------


async def test_agencement_mode_minuteur_sans_slot_est_refuse_ecran_de_la_cuisine(hass, entree):
    """L'agencement REEL de la cuisine (`app/src/ecran.ts:543`) : mode
    "minuteur" choisi alors qu'aucun slot de minuteur n'existe encore.
    `schema.AGENCEMENT` seul ne le voit pas (il ne voit que l'agencement) ;
    seul `garde_ecran.verifier_ecran_complet`, sur l'ECRAN COMPLET, le
    peut."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"zones": ["commandes"], "modes": ["defaut", "minuteur"]})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERREUR_ECRAN_DEVIENDRAIT_INVALIDE
    # Ronde 2 de relecture (point 3) : libelle traduit ("Timers"), pas
    # l'identifiant brut ("minuteurs") — l'utilisateur EST dans
    # "agencement" ici, "minuteurs" (la section MANQUANTE) reste la
    # bonne reponse, jamais redirigee.
    assert resultat["description_placeholders"]["section"] == "Timers"
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data.get("agencement") is None, "un refus ne doit RIEN persister"


async def test_agencement_blocDefaut_voiture_sans_objet_est_refuse_ecran_du_salon(hass, entree):
    """L'agencement REEL du salon (`app/src/ecran.ts:314`) :
    `blocDefaut: voiture` choisi sans qu'aucun objet `voiture` n'existe."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"zones": ["commandes"], "modes": ["defaut"], "blocDefaut": "voiture"},
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERREUR_ECRAN_DEVIENDRAIT_INVALIDE
    # Ronde 2 de relecture (point 3) : libelle traduit ("Car"), pas
    # l'identifiant brut ("voiture").
    assert resultat["description_placeholders"]["section"] == "Car"


async def test_retirer_la_voiture_alors_que_blocDefaut_l_exige_encore_est_refuse(hass, entree):
    """LE cas le plus grave mesure par le relecteur : un ecran DEJA VALIDE
    (blocDefaut "voiture" ET l'objet voiture, tous deux persistes) devient
    invalide SANS UN MOT si on retire la voiture. Ce test PROUVE l'inverse :
    le retrait est refuse, et l'ecran reste inchange."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "voiture"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], VOITURE_COMPLETE)

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"zones": ["commandes"], "modes": ["defaut"], "blocDefaut": "voiture"},
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU, "l'ecran EST valide, voiture existe"

    # Ecran DEJA VALIDE. Retirer la voiture doit etre refuse.
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "voiture"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"sans_voiture": True})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERREUR_ECRAN_DEVIENDRAIT_INVALIDE
    # Ronde 2 de relecture (point 3) : nomme desormais "Blocks and modes"
    # (le libelle EN d'"agencement"), jamais "voiture" — la section ou
    # l'utilisateur se trouve DEJA (il vient d'y essayer le retrait),
    # ou il n'y a plus rien a corriger. Le remede reel est dans
    # « Blocs et modes ».
    assert resultat["description_placeholders"]["section"] == "Blocks and modes"
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["voiture"] == VOITURE_COMPLETE, "un refus ne doit RIEN changer"

    # Ronde 3 de relecture (point 2) : le CODE nommait deja "Blocks and
    # modes" (ci-dessus), mais le CORPS DU MESSAGE, lui, recommandait
    # encore statiquement « Minuteurs » et « Voiture » — EXACTEMENT les
    # deux sections que ce correctif vient de decider de ne plus nommer,
    # puisque l'utilisateur s'y trouve deja et n'y a rien a corriger.
    # Aucun test n'assertait la CHAINE RENDUE (placeholder substitue dans
    # le gabarit), seulement le placeholder seul — ce qui laissait la
    # phrase se contredire elle-meme, invisible a la suite. Ici, on
    # rejoue REELLEMENT la substitution HA (`str.format`) sur les DEUX
    # gabarits et on lit le texte final, mot pour mot.
    en = json.loads((CHEMIN_TRADUCTIONS / "en.json").read_text(encoding="utf-8"))
    gabarit_en = en["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_ECRAN_DEVIENDRAIT_INVALIDE]
    rendu_en = gabarit_en.format(section=resultat["description_placeholders"]["section"])
    assert "Blocks and modes" in rendu_en
    assert "Voiture" not in rendu_en and "Car" not in rendu_en
    assert "Minuteurs" not in rendu_en and "Timers" not in rendu_en

    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    gabarit_fr = fr["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_ECRAN_DEVIENDRAIT_INVALIDE]
    rendu_fr = gabarit_fr.format(section="Blocs et modes")
    assert "Blocs et modes" in rendu_fr
    assert "Voiture" not in rendu_fr
    assert "Minuteurs" not in rendu_fr


async def test_supprimer_le_dernier_minuteur_alors_que_le_mode_minuteur_est_actif_est_refuse(
    hass, entree
):
    """Ronde 2 de relecture, point 1 : le rapport de la ronde 1 NOMMAIT ce
    scenario (docstring de `_persister_si_valide`, listes.py) sans jamais
    l'exercer de bout en bout — seul son PENDANT (ajouter le mode sans
    slot, `test_agencement_mode_minuteur_sans_slot_est_refuse_ecran_de_la_
    cuisine`) l'etait. Ici : un slot EXISTE, le mode "minuteur" est deja
    actif, l'ecran EST valide — puis on supprime ce slot UNIQUE (le geste
    "supprimer" d'une section « liste », pas un objet « voiture »/
    "agencement" cette fois). Refuse, et nomme "agencement" (le SEUL
    remede reel : retirer le mode "minuteur"), jamais "minuteurs" (ou
    l'utilisateur vient d'essayer la suppression).

    Ronde 4 de relecture : ce test joue AUSSI, deliberement, le role de
    DERNIER REMPART pour une classe de mutation que le test AST de
    `garde_ecran.py` (`test_garde_ecran_est_le_seul_module_a_appeler_une_
    porte_d_ecriture`) ne peut structurellement pas voir — une ecriture
    par `object.__setattr__(subentry, "data", ...)` DIRECTEMENT sur le
    `ConfigSubentry` (un dataclass gele que `async_update_subentry`
    lui-meme degele de la meme facon), sans jamais nommer une des quatre
    portes d'ecriture documentees par HA. Mesure : remplacer le corps de
    `_persister_si_valide` (listes.py) par exactement cet appel laisse LE
    TEST AST VERT — seul CE test-ci tombe (`KeyError: 'base'`, plus aucune
    erreur posee), et seulement PARCE QUE ce scenario precis persiste par
    la voie `listes.py` que la mutation modifiait. Ce n'est plus un
    accident : c'est le remede EN CONNAISSANCE DE CAUSE a une limite
    structurelle documentee ailleurs, pas une proprete fortuite qu'un
    futur remaniement pourrait faire disparaitre sans que personne s'en
    apercoive."""
    subentry_id = await _creer_ecran(hass, entree)
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
        flow["flow_id"], {"zones": ["commandes"], "modes": ["defaut", "minuteur"]})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU, resultat.get("errors")

    resultat = await _geste(hass, "minuteurs", 0, ACTION_SUPPRIMER)
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERREUR_ECRAN_DEVIENDRAIT_INVALIDE
    assert resultat["description_placeholders"]["section"] == "Blocks and modes"

    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert len(entry.subentries[subentry_id].data["minuteurs"]) == 1, (
        "un refus ne doit RIEN persister")


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
