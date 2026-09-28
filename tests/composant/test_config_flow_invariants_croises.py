"""Le Critique (tache 7) : un step qui persiste doit garder l'ecran ENTIER
valide, pas seulement SA PROPRE section. Scinde de `test_config_flow_
objets.py` en relecture finale de branche (deuxieme ronde) : ce dernier
depassait 500 lignes une fois un test de plus ajoute a `async_step_
agencement` -- un seam reel, deja amorce par le commentaire de section
que ces quatre tests partageaient dans l'ancien fichier (« Le Critique :
un step qui persiste doit garder l'ecran ENTIER valide »), distinct de
« agencement/voiture, le remplissage de champs et ses deux regles
hors-schema » qui reste la-bas.

Ces quatre tests exercent `garde_ecran.check_complete_screen` (invoque
par `garde_ecran.persister_si_valide`, LE site d'ecriture unique) SUR LE
FLOW REEL -- son MECANISME est teste directement dans
`test_garde_ecran.py`, ici la preuve DE BOUT EN BOUT."""
import json
import pathlib

from homeassistant import data_entry_flow

from conftest import ELEMENTS_VALIDES, VOITURE_COMPLETE, _creer_ecran, _geste, _init_reconfigure
from custom_components.home_desk.const import (
    ACTION_DELETE,
    ERROR_SCREEN_WOULD_BECOME_INVALID,
    SUBENTRY_SCREEN,
)

CHEMIN_TRADUCTIONS = (
    pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk" / "translations"
)


async def test_agencement_mode_minuteur_sans_slot_est_refuse_ecran_de_la_cuisine(hass, entree):
    """L'agencement REEL de la cuisine (`app/src/ecran.ts:543`) : mode
    "minuteur" choisi alors qu'aucun slot de minuteur n'existe encore.
    `schema.AGENCEMENT` seul ne le voit pas (il ne voit que l'agencement) ;
    seul `garde_ecran.check_complete_screen`, sur l'ECRAN COMPLET, le
    peut."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "agencement"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"zones": ["commandes"], "modes": ["defaut", "minuteur"]})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERROR_SCREEN_WOULD_BECOME_INVALID
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
    assert resultat["errors"]["base"] == ERROR_SCREEN_WOULD_BECOME_INVALID
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
    assert resultat["errors"]["base"] == ERROR_SCREEN_WOULD_BECOME_INVALID
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
    gabarit_en = en["config_subentries"][SUBENTRY_SCREEN]["error"][ERROR_SCREEN_WOULD_BECOME_INVALID]
    rendu_en = gabarit_en.format(section=resultat["description_placeholders"]["section"])
    assert "Blocks and modes" in rendu_en
    assert "Voiture" not in rendu_en and "Car" not in rendu_en
    assert "Minuteurs" not in rendu_en and "Timers" not in rendu_en

    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    gabarit_fr = fr["config_subentries"][SUBENTRY_SCREEN]["error"][ERROR_SCREEN_WOULD_BECOME_INVALID]
    rendu_fr = gabarit_fr.format(section="Blocs et modes")
    assert "Blocs et modes" in rendu_fr
    assert "Voiture" not in rendu_fr
    assert "Minuteurs" not in rendu_fr


async def test_supprimer_le_dernier_minuteur_alors_que_le_mode_minuteur_est_actif_est_refuse(
    hass, entree
):
    """Ronde 2 de relecture, point 1 : le rapport de la ronde 1 NOMMAIT ce
    scenario (docstring de `_persister_si_valide`, list_sections.py) sans jamais
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
    `_persister_si_valide` (list_sections.py) par exactement cet appel laisse LE
    TEST AST VERT — seul CE test-ci tombe (`KeyError: 'base'`, plus aucune
    erreur posee), et seulement PARCE QUE ce scenario precis persiste par
    la voie `list_sections.py` que la mutation modifiait. Ce n'est plus un
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

    resultat = await _geste(hass, "minuteurs", 0, ACTION_DELETE)
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["base"] == ERROR_SCREEN_WOULD_BECOME_INVALID
    assert resultat["description_placeholders"]["section"] == "Blocks and modes"

    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert len(entry.subentries[subentry_id].data["minuteurs"]) == 1, (
        "un refus ne doit RIEN persister")
