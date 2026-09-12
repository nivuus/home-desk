"""Les cinq sections « liste » du menu d'une sous-entree : tuiles de
commande, rangee d'ambiance, extras maison, ouvrants, ligne de synthese.

Separe de `test_config_flow.py` (identite, budget, traductions) en ronde 1
de relecture pour rester sous 500 lignes chacun — meme couture que
`listes.py`/`listes_champs.py`.
"""
import json

import pytest
import voluptuous as vol
from homeassistant import config_entries, data_entry_flow

from conftest import ELEMENTS_VALIDES, _commandes, _creer_ecran, _geste, _init_reconfigure
from custom_components.home_desk import listes_champs, schema
from custom_components.home_desk.const import (
    ACTION_DESCENDRE,
    ACTION_ENREGISTRER,
    ACTION_MONTER,
    ACTION_SUPPRIMER,
    ERREUR_CHAMP_INVALIDE,
)
from custom_components.home_desk.listes_champs import SECTIONS
from custom_components.home_desk.schema import OPERATEURS


# ---------------------------------------------------------------------------
# Le squelette des sections « liste », teste sur "commandes"
# ---------------------------------------------------------------------------


async def test_monter_une_tuile_change_son_rang_et_RIEN_D_AUTRE(hass, entree_peuplee):
    """Monter/descendre plutot qu'un glisser-depose : HA n'offre pas de
    reordonnancement fiable dans un formulaire de flow (spec, « ennuyeux,
    sur »). Encore faut-il que ce soit vraiment sur — c'est-a-dire que la
    tuile change de rang et que rien d'autre ne bouge."""
    avant = _commandes(hass)
    await _geste(hass, "commandes", index=2, geste=ACTION_MONTER)
    apres = _commandes(hass)
    assert [c["libelle"] for c in apres] == [
        avant[0]["libelle"], avant[2]["libelle"], avant[1]["libelle"],
        *[c["libelle"] for c in avant[3:]]]
    assert {c["libelle"]: c for c in apres} == {c["libelle"]: c for c in avant}


async def test_monter_la_PREMIERE_ne_fait_rien_et_ne_leve_pas(hass, entree_peuplee):
    """Le bord. Un index hors bornes sur la premiere ligne est l'erreur la
    plus facile a ecrire et la plus penible a decouvrir : elle ne se voit
    qu'en cliquant, devant le formulaire, sur la seule ligne qu'on ne pense
    pas a essayer. Idem pour « descendre » sur la derniere."""
    avant = _commandes(hass)
    await _geste(hass, "commandes", index=0, geste=ACTION_MONTER)
    assert _commandes(hass) == avant
    await _geste(hass, "commandes", index=len(avant) - 1, geste=ACTION_DESCENDRE)
    assert _commandes(hass) == avant


async def test_supprimer_une_tuile_retire_UNE_seule_entree(hass, entree_peuplee):
    avant = _commandes(hass)
    await _geste(hass, "commandes", index=1, geste=ACTION_SUPPRIMER)
    apres = _commandes(hass)
    assert [c["libelle"] for c in apres] == [
        c["libelle"] for c in avant if c["libelle"] != avant[1]["libelle"]]
    assert len(apres) == len(avant) - 1


async def test_ajouter_une_tuile_valide_l_ajoute_a_la_fin(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["step_id"] == "commandes"
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nouveau": True})
    assert resultat["step_id"] == "commandes_element"
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"libelle": "Plafonnier", "icone": "bulb", "entite": "light.cuisine"})

    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["commandes"] == [
        {"libelle": "Plafonnier", "icone": "bulb", "entite": "light.cuisine"}]


async def test_modifier_le_libelle_seul_preserve_tous_les_autres_champs(hass, entree):
    """LE Critique de la ronde 1 : `elements[index] = valide` ecrasait
    l'element ENTIER par le seul resultat valide du formulaire ; une tuile
    portant `service`/`vue`/`epingle`/`absenceNommee`/`lien`, editee pour
    son SEUL libelle, perdait les quatre autres en silence — une tuile qui
    n'agissait que par `service` devenait litteralement le bouton mort que
    ce depot s'interdit. Verifie le chemin REALISTE : les champs geres par
    le formulaire sont PRE-REMPLIS et RESOUMIS INCHANGES, exactement ce
    qu'un utilisateur qui ne touche pas a ces champs produirait."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    complet = {
        "libelle": "Portail",
        "icone": "porte",
        "entite": "cover.portail",
        "cible": "cover.portail",
        "service_domaine": "cover",
        "service_action": "open_cover",
        "lien": "https://exemple.local/portail",
        "vue": "#garage",
        "epingle": True,
        "absenceNommee": "Portail indisponible",
        "note": "Ne pas ouvrir sous la pluie",
    }
    resultat = await hass.config_entries.subentries.async_configure(flow["flow_id"], complet)
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM

    tuile = _commandes(hass)[0]
    assert tuile["service"] == ["cover", "open_cover"], (
        "les deux champs texte doivent se recomposer en la paire du contrat")

    # Reedition : formulaire PRE-REMPLI (comme un vrai utilisateur le
    # verrait via add_suggested_values_to_schema), seul "libelle" change.
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"choix": "0"})
    resoumis = {**complet, "libelle": "Portail (renomme)", "geste": ACTION_ENREGISTRER}
    resultat = await hass.config_entries.subentries.async_configure(flow["flow_id"], resoumis)
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM

    tuile = _commandes(hass)[0]
    assert tuile["libelle"] == "Portail (renomme)"
    assert tuile["service"] == ["cover", "open_cover"]
    assert tuile["vue"] == "#garage"
    assert tuile["epingle"] is True
    assert tuile["absenceNommee"] == "Portail indisponible"
    assert tuile["lien"] == "https://exemple.local/portail"
    assert tuile["cible"] == "cover.portail"
    assert tuile["note"] == "Ne pas ouvrir sous la pluie"


def test_fusionner_preserve_un_champ_que_le_formulaire_ne_gere_pas_encore():
    """Le mecanisme GENERAL derriere le Critique, teste independamment des
    donnees courantes : si un champ du contrat existe sur un element mais
    N'EST PAS dans `champs_contrat` (le formulaire ne le gere pas encore),
    `_fusionner` doit le laisser INTACT — jamais l'effacer parce que
    `donnee` ne le porte pas. Prouve la regle meme si, aujourd'hui,
    CHAMPS_BOUTON/CHAMPS_SYNTHESE couvrent deja tout le contrat."""
    geres = frozenset({"libelle"})
    existant = {"libelle": "Avant", "vue": "#garage", "epingle": True}
    donnee = {"libelle": "Apres"}
    fusion = listes_champs._fusionner(geres, existant, donnee)
    assert fusion == {"libelle": "Apres", "vue": "#garage", "epingle": True}


def test_champs_bouton_couvre_exactement_les_proprietes_du_contrat():
    """`CHAMPS_BOUTON` est une liste ECRITE A LA MAIN (frozenset) : sans ce
    test, elle pourrait diverger du contrat (un champ ajoute a
    `$defs/bouton` sans etre ajoute ici) en silence — `_fusionner` la
    laisserait alors s'effacer exactement comme le Critique."""
    proprietes = set(schema._DEFS["bouton"]["properties"])
    assert listes_champs.CHAMPS_BOUTON == proprietes


def test_champs_synthese_couvre_exactement_les_proprietes_du_contrat():
    proprietes = set(schema._DEFS["synthese"]["properties"])
    assert listes_champs.CHAMPS_SYNTHESE == proprietes


def test_composition_du_formulaire_bouton_est_complete():
    """Mineur (ronde 1) : la composition du formulaire n'etait fixee par
    aucun test — `cible` ou `epingle` pouvaient disparaitre du formulaire,
    suite verte."""
    champs = {str(k) for k in listes_champs._schema_bouton(True).schema}
    assert champs == {
        "libelle", "icone", "entite", "cible", "service_domaine", "service_action",
        "lien", "vue", "epingle", "absenceNommee", "note", "geste",
    }


def test_composition_du_formulaire_synthese_est_complete():
    champs = {str(k) for k in listes_champs._schema_synthese(True).schema}
    assert champs == {
        "entite", "texte", "operateur", "valeur", "perso", "horsTaches",
        "absenceNommee", "note", "geste",
    }


def test_sections_declare_les_cinq_sections_attendues():
    """Ronde 1 (Important I2) : `ambiances` n'etait exercee par AUCUN test —
    la retirer de `SECTIONS` laissait la suite verte. Assertion STATIQUE en
    plus du test parametre ci-dessous : retirer une section change le nombre
    de tests COLLECTES (signal faible), mais fait tomber CELLE-CI (signal
    fort)."""
    assert set(SECTIONS) == {"commandes", "ambiances", "extrasMaison", "ouvrants", "synthese"}


@pytest.mark.parametrize("cle", sorted(SECTIONS))
async def test_chaque_section_accepte_un_ajout_et_l_ecrit_dans_SA_propre_cle(hass, entree, cle):
    """Ronde 1 (Important I2) : parametre sur `SECTIONS` lui-meme, pas sur
    une liste recopiee a la main — toute section ajoutee demain (minuteurs,
    tache 7) est couverte d'office. Sonde exactement les deux mutations
    relevees : ecrire une section dans la cle d'une AUTRE, et retirer une
    section de `SECTIONS` (assertion statique ci-dessus)."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"next_step_id": cle})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], ELEMENTS_VALIDES[cle])
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM

    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert len(subentry.data.get(cle, [])) == 1
    for autre in SECTIONS:
        if autre != cle:
            assert subentry.data.get(autre, []) == [], (
                f"l'ajout dans {cle!r} a fuite dans {autre!r}")


# ---------------------------------------------------------------------------
# La ligne de synthese : l'union discriminee operateur/valeur
# ---------------------------------------------------------------------------


async def test_synthese_operateur_dordre_refuse_une_valeur_non_numerique_et_nomme_le_motif(
    hass, entree
):
    """Le piege de la tache : `<`/`>` exigent un nombre ($defs/synthese, allOf
    du contrat). Un champ texte unique laisserait passer une chaine — refusee
    par `schema.SYNTHESE`, et le refus doit NOMMER le motif."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "synthese"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "entite": "sensor.temperature_salon",
            "texte": "Trop chaud",
            "operateur": "<",
            "valeur": "chaud",
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["valeur"] == ERREUR_CHAMP_INVALIDE
    assert "valeur" in resultat["description_placeholders"]["motif"]


async def test_synthese_operateur_dordre_accepte_une_valeur_numerique_saisie_en_texte(
    hass, entree
):
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "synthese"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "entite": "sensor.temperature_salon",
            "texte": "Trop chaud",
            "operateur": "<",
            "valeur": "19.5",
        },
    )
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["synthese"][0]["valeur"] == 19.5


async def test_un_refus_reaffiche_la_saisie_pas_les_valeurs_stockees(hass, entree):
    """Important ronde 1 (I1) : un refus a l'enregistrement doit reafficher
    CE QUE l'utilisateur venait de taper — sans cette correction, un ajout
    refuse (donc `existant = None`) reaffichait un formulaire VIDE, le meme
    defaut que la ronde 1 de la tache 5 avait deja corrige dans
    `config_flow.py`, reintroduit ici dans le module voisin."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "synthese"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "entite": "sensor.temperature_salon",
            "texte": "Trop chaud",
            "operateur": "<",
            "valeur": "chaud",
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    marqueurs = {str(cle): cle for cle in resultat["data_schema"].schema}
    assert marqueurs["texte"].description == {"suggested_value": "Trop chaud"}
    assert marqueurs["entite"].description == {"suggested_value": "sensor.temperature_salon"}


def test_operateurs_est_une_liste_ordonnee_selon_le_contrat():
    """Important ronde 1 (I3) : `OPERATEURS` etait derive d'un `frozenset`
    (ordre non garanti d'un processus Python a l'autre, mesure). Le
    `SelectSelector` d'operateur affiche donc un ordre STABLE, celui du
    contrat."""
    assert OPERATEURS == ["==", "!=", "<", ">"]
    assert isinstance(OPERATEURS, list)


def test_le_champ_operateur_ne_propose_que_les_quatre_valeurs_du_schema():
    champs_schema = listes_champs._schema_synthese(editable=False).schema
    selecteur = next(v for k, v in champs_schema.items() if str(k) == "operateur")
    assert set(selecteur.config["options"]) == {"==", "!=", "<", ">"}


def test_convertir_valeur_garde_un_entier_entier():
    resultat = listes_champs._convertir_valeur("35")
    assert resultat == 35
    assert isinstance(resultat, int) and not isinstance(resultat, float)


def test_convertir_valeur_reconnait_un_flottant():
    assert listes_champs._convertir_valeur("19.5") == 19.5


def test_convertir_valeur_garde_une_chaine_non_numerique():
    assert listes_champs._convertir_valeur("chaud") == "chaud"


def test_icone_vient_du_contrat_embarque_pas_d_une_liste_ecrite_a_la_main():
    """Ronde de mutation : si `listes_champs._ICONES_OPTIONS` etait une liste
    tapee a la main plutot que lue depuis contrat/icones.json, ce test
    resterait vert tant que personne n'ajoute une icone des deux cotes a la
    fois — le piege deja corrige au plan 1. On verifie la PROVENANCE."""
    brut = json.loads(listes_champs.CHEMIN_ICONES.read_text(encoding="utf-8"))
    assert listes_champs._ICONES_OPTIONS == brut["icones"]


# ---------------------------------------------------------------------------
# Point 3 de la ronde 1 : le plan ne rendait jamais la sous-entree validable
# ---------------------------------------------------------------------------


async def test_apres_temperature_extrasmaison_ouvrants_seul_sources_manque_encore(hass, entree):
    """Le plan ne portait de ligne de menu ni pour `temperature`, ni pour
    `extrasMaison`, ni pour `ouvrants` — trois champs RACINE requis du
    contrat qu'AUCUNE tache ne couvrait, la sous-entree ne serait donc
    JAMAIS devenue validable. Cette tache les ajoute (`temperature` dans
    l'identite, `extrasMaison`/`ouvrants` comme sections « liste »).

    Preuve EXECUTABLE plutot que promesse en prose : remplir tout ce que ce
    squelette couvre desormais ne suffit PAS encore — `sources`
    ($defs/source, une forme entierement differente, hors du perimetre de
    cette tache et du plan) reste requis et absent. `schema.valider()` leve
    UNE SEULE regle manquante, exactement celle-la."""
    subentry_id = await _creer_ecran(hass, entree)
    for cle, donnee in ELEMENTS_VALIDES.items():
        flow = await _init_reconfigure(hass, entree, subentry_id)
        await hass.config_entries.subentries.async_configure(
            flow["flow_id"], {"next_step_id": cle})
        await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
        await hass.config_entries.subentries.async_configure(flow["flow_id"], donnee)

    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    with pytest.raises(vol.Invalid) as excinfo:
        schema.valider(dict(subentry.data))
    # `motif()` retire le DERNIER segment du chemin pour "required" (le
    # champ manquant voyage a part, comme ajv le fait avec missingProperty)
    # — pour un champ RACINE manquant, le chemin devient vide : ": required",
    # sans nom de champ ni slash. Verifie en executant, pas suppose.
    assert schema.motif(excinfo.value) == ": required"

    donnees = dict(subentry.data)
    donnees["sources"] = []
    schema.valider(donnees)  # ne leve plus : "sources" etait la seule piece manquante
