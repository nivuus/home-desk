"""Les flows, y compris leurs cas d'erreur.

Un flow qui ne teste que son chemin heureux ne teste rien : le seul moment ou
un formulaire compte, c'est quand la saisie est mauvaise.
"""
import json
import pathlib

import pytest
from homeassistant import config_entries, data_entry_flow

from conftest import _commandes, _geste
from custom_components.home_desk.const import (
    ACTION_AJOUTER,
    DOMAIN,
    ERREUR_BUDGET_INTENABLE,
    ERREUR_CHAMP_INVALIDE,
    ERREUR_HAUTEUR_HORS_BORNES,
    SOUS_ENTREE_ECRAN,
    VERSION_CONFIG,
)
from custom_components.home_desk.schema import HAUTEUR_MAX, HAUTEUR_MIN

CHEMIN_TRADUCTIONS = (
    pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk" / "translations"
)


def _toutes_les_cles(donnee) -> set[str]:
    """La STRUCTURE d'un JSON de traductions : l'ensemble des chemins de
    cles, sans les valeurs (des chaines dans une langue different). Deux
    fichiers de MEME structure ont le meme ensemble ; un fichier vide, une
    cle renommee ou retiree d'un seul cote change ce que rend cette fonction
    d'un cote sans changer l'autre."""
    chemins: set[str] = set()

    def parcourir(noeud, prefixe: str) -> None:
        if isinstance(noeud, dict):
            for cle, valeur in noeud.items():
                chemins.add(f"{prefixe}/{cle}")
                parcourir(valeur, f"{prefixe}/{cle}")

    parcourir(donnee, "")
    return chemins


async def test_l_entree_se_cree_une_seule_fois(hass):
    """Une seule entree « Tablettes murales » : N tablettes sont N SOUS-entrees.
    Sans ce refus, deux entrees detiendraient deux verites concurrentes."""
    premier = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.flow.async_configure(premier["flow_id"], {})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat["title"] == "Tablettes murales", (
        "c'est cette ligne que l'utilisateur lit dans sa liste d'integrations")

    second = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert second["type"] is data_entry_flow.FlowResultType.ABORT
    assert second["reason"] == "single_instance_allowed"


async def test_un_ecran_qui_deborde_est_REFUSE_avec_son_chiffre(hass, entree):
    """LE test de cette tache. Le formulaire refuse une hauteur ou l'ecran ne
    tient pas, et dit de combien — pas « valeur invalide ». C'est toute la
    raison d'etre de verifier_budget : dire non AU MOMENT DE LA SAISIE, pas
    devant la tablette."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Test", "hauteurUtile": 100})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["hauteurUtile"] == ERREUR_BUDGET_INTENABLE
    assert "336" in str(resultat["description_placeholders"]), (
        "le formulaire doit dire DE COMBIEN l'ecran deborde, pas seulement qu'il deborde")


async def test_une_hauteur_hors_bornes_est_refusee_a_la_saisie(hass, entree):
    """Important ronde 1 : `verifier_budget` seul ne couvre pas une hauteur
    absurde — 10 000 px ne deborde JAMAIS (l'ecran est toujours plus petit),
    et sans cette garde le formulaire l'acceptait pour que `schema.valider()`
    la refuse plus tard, a l'ECRITURE : l'inverse exact de ce que cette tache
    existe pour faire. La garde reutilise `schema.hauteur_utile`, la MEME
    fonction que celle qui validera l'ecran complet — aucune borne recopiee
    ici."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Trop haute", "hauteurUtile": 10000})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["hauteurUtile"] == ERREUR_HAUTEUR_HORS_BORNES
    placeholders = str(resultat["description_placeholders"])
    assert str(HAUTEUR_MIN) in placeholders and str(HAUTEUR_MAX) in placeholders, (
        "le formulaire doit dire la plage attendue, pas seulement qu'elle est depassee")


async def test_une_saisie_refusee_garde_le_nom_et_la_note(hass, entree):
    """Mineur ronde 1 : sans `add_suggested_values_to_schema`, un refus de
    budget effacait aussi le nom et la note deja saisis — a retaper pour
    rien. Ce test clouerait tout autant la presence meme de `data_schema`
    dans le formulaire redonne : sans lui (« on peut le retirer sans rien
    casser », note de relecture), l'acces a `.schema` ci-dessous leverait."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"nom": "Salon", "hauteurUtile": 100, "note": "Fire 7 au mur"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    marqueurs = {str(cle): cle for cle in resultat["data_schema"].schema}
    assert marqueurs["nom"].description == {"suggested_value": "Salon"}
    assert marqueurs["note"].description == {"suggested_value": "Fire 7 au mur"}


async def test_un_ecran_valide_est_accepte_et_porte_sa_version(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"nom": "Salon d essai", "hauteurUtile": 585, "note": "Fire 7, mur du salon"})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat["data"]["version"] == VERSION_CONFIG, (
        "la version est posee a l'ECRITURE, pas devinee a la lecture")
    assert resultat["data"]["note"] == "Fire 7, mur du salon", (
        "la note doit survivre jusqu'a data, pas se perdre en route")
    assert resultat["title"] == "Salon d essai", (
        "c'est cette ligne que l'utilisateur lit dans la liste des ecrans")


@pytest.mark.parametrize("langue", ["fr", "en"])
def test_les_traductions_nomment_le_debordement(langue):
    """Ronde 1 de relecture : sans ce test, `translations/fr.json` pouvait
    etre vide, sa cle d'erreur renommee, ou `{debordement}` retire de la
    phrase — les 42 tests d'alors restaient tous verts, puisqu'aucun ne
    chargeait ce fichier. Les cles utilisees ci-dessous viennent de
    const.py (`SOUS_ENTREE_ECRAN`, `ERREUR_BUDGET_INTENABLE`), jamais
    reecrites en dur : renommer l'une sans repercuter le JSON fait tomber
    CE test plutot que de laisser l'affichage silencieusement casse."""
    traductions = json.loads(
        (CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    phrase = traductions["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_BUDGET_INTENABLE]
    assert "{debordement}" in phrase, (
        "le formulaire doit dire DE COMBIEN l'ecran deborde, pas seulement qu'il deborde")


@pytest.mark.parametrize("langue", ["fr", "en"])
def test_les_traductions_nomment_le_motif_du_champ_invalide(langue):
    """Meme piege que ci-dessus, pour le refus ajoute par cette tache :
    `champ_invalide` doit nommer le MOTIF (schema.motif()), pas seulement
    dire que le champ est invalide. Sans ce test, `{motif}` pouvait
    disparaitre de la phrase sans qu'aucun autre test ne le voie — celui du
    dessus ne couvre que `budget_intenable`."""
    traductions = json.loads(
        (CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    phrase = traductions["config_subentries"][SOUS_ENTREE_ECRAN]["error"][ERREUR_CHAMP_INVALIDE]
    assert "{motif}" in phrase, (
        "le formulaire doit dire QUELLE regle est violee, pas seulement que le champ est invalide")


def test_fr_et_en_ont_la_meme_structure_de_traductions():
    """Sans ce test, `translations/fr.json` pouvait perdre une cle entiere
    (une section « liste », un message d'erreur) sans qu'aucun test ne le
    voie : les tests de step ne LISENT jamais ce fichier, seul le frontend le
    ferait. Compare les CLES, jamais les valeurs (langues differentes)."""
    fr = json.loads((CHEMIN_TRADUCTIONS / "fr.json").read_text(encoding="utf-8"))
    en = json.loads((CHEMIN_TRADUCTIONS / "en.json").read_text(encoding="utf-8"))
    assert _toutes_les_cles(fr) == _toutes_les_cles(en)


# ---------------------------------------------------------------------------
# Les trois sections « liste » : tuiles de commande, rangee d'ambiance, ligne
# de synthese. Le squelette (listes.py) est le meme pour les trois ; on ne
# rejoue le chemin heureux et les bords que sur « commandes », qui l'exerce
# entierement — les deux autres sont couvertes par les tests de section
# generiques ci-dessous (ajout, refus nommant le motif).
# ---------------------------------------------------------------------------


async def test_monter_une_tuile_change_son_rang_et_RIEN_D_AUTRE(hass, entree_peuplee):
    """Monter/descendre plutot qu'un glisser-depose : HA n'offre pas de
    reordonnancement fiable dans un formulaire de flow (spec, « ennuyeux,
    sur »). Encore faut-il que ce soit vraiment sur — c'est-a-dire que la
    tuile change de rang et que rien d'autre ne bouge."""
    avant = _commandes(hass)
    await _geste(hass, "commandes", index=2, geste="monter")
    apres = _commandes(hass)
    assert [c["libelle"] for c in apres] == [
        avant[0]["libelle"], avant[2]["libelle"], avant[1]["libelle"],
        *[c["libelle"] for c in avant[3:]]]
    # Rien d'autre : ni les champs des tuiles, ni les autres sections.
    assert {c["libelle"]: c for c in apres} == {c["libelle"]: c for c in avant}


async def test_monter_la_PREMIERE_ne_fait_rien_et_ne_leve_pas(hass, entree_peuplee):
    """Le bord. Un index hors bornes sur la premiere ligne est l'erreur la
    plus facile a ecrire et la plus penible a decouvrir : elle ne se voit
    qu'en cliquant, devant le formulaire, sur la seule ligne qu'on ne pense
    pas a essayer. Idem pour « descendre » sur la derniere."""
    avant = _commandes(hass)
    await _geste(hass, "commandes", index=0, geste="monter")
    assert _commandes(hass) == avant
    await _geste(hass, "commandes", index=len(avant) - 1, geste="descendre")
    assert _commandes(hass) == avant


async def test_supprimer_une_tuile_retire_UNE_seule_entree(hass, entree_peuplee):
    avant = _commandes(hass)
    await _geste(hass, "commandes", index=1, geste="supprimer")
    apres = _commandes(hass)
    assert [c["libelle"] for c in apres] == [
        c["libelle"] for c in avant if c["libelle"] != avant[1]["libelle"]]
    assert len(apres) == len(avant) - 1


async def test_modifier_une_tuile_existante_change_SES_champs_et_rien_d_autre(
    hass, entree_peuplee
):
    """`enregistrer` sur un element EXISTANT (`geste` fait alors partie du
    formulaire, contrairement a l'ajout) : une modification reelle des
    champs doit etre persistee, a l'index inchange, sans laisser `geste`
    dans la donnee — `schema.BOUTON` la refuserait
    (`additionalProperties: false`) si jamais il y restait."""
    avant = _commandes(hass)
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    subentry = next(iter(entry.subentries.values()))

    flow = await hass.config_entries.subentries.async_init(
        (entry.entry_id, SOUS_ENTREE_ECRAN),
        context={
            "source": config_entries.SOURCE_RECONFIGURE,
            "subentry_id": subentry.subentry_id,
        },
    )
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"choix": "0"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {**avant[0], "libelle": "Lampe salon (renommee)", "geste": "enregistrer"},
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM

    apres = _commandes(hass)
    assert apres[0]["libelle"] == "Lampe salon (renommee)"
    assert "geste" not in apres[0]
    assert [c["libelle"] for c in apres[1:]] == [c["libelle"] for c in avant[1:]]
    assert len(apres) == len(avant)


async def test_ajouter_une_tuile_valide_l_ajoute_a_la_fin(hass, entree):
    """Le chemin « ajouter » du menu de section, sur un ecran neuf (aucune
    tuile) : la section liste part bien de zero, sans etat cache."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN), context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Cuisine", "hauteurUtile": 900})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    subentry_id = next(iter(
        hass.config_entries.async_get_entry(entree.entry_id).subentries))

    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_RECONFIGURE, "subentry_id": subentry_id})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["step_id"] == "commandes"
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"choix": ACTION_AJOUTER})
    assert resultat["step_id"] == "commandes_element"
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"libelle": "Plafonnier", "icone": "bulb", "entite": "light.cuisine"})

    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["commandes"] == [
        {"libelle": "Plafonnier", "icone": "bulb", "entite": "light.cuisine"}]


async def test_synthese_operateur_dordre_refuse_une_valeur_non_numerique_et_nomme_le_motif(
    hass, entree
):
    """Le piege de la tache : `<`/`>` exigent un nombre ($defs/synthese, allOf
    du contrat). Un champ texte unique laisserait passer une chaine — refusee
    par `schema.SYNTHESE` (rejoue par `_async_step_section_element`), et le
    refus doit NOMMER le motif, pas juste dire « valeur invalide »."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN), context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Salon", "hauteurUtile": 900})
    subentry_id = next(iter(
        hass.config_entries.async_get_entry(entree.entry_id).subentries))

    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_RECONFIGURE, "subentry_id": subentry_id})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "synthese"})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"choix": ACTION_AJOUTER})
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
    assert "valeur" in resultat["description_placeholders"]["motif"], (
        "le motif doit nommer le champ fautif, comme schema.motif() le fait "
        "pour schema.valider()")


async def test_synthese_operateur_dordre_accepte_une_valeur_numerique_saisie_en_texte(
    hass, entree
):
    """Le complement du piege : une saisie numerique DOIT passer, sans quoi
    le champ texte unique serait inutilisable pour le cas courant (un seuil
    de temperature)."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN), context={"source": config_entries.SOURCE_USER})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nom": "Salon", "hauteurUtile": 900})
    subentry_id = next(iter(
        hass.config_entries.async_get_entry(entree.entry_id).subentries))

    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_RECONFIGURE, "subentry_id": subentry_id})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "synthese"})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"choix": ACTION_AJOUTER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "entite": "sensor.temperature_salon",
            "texte": "Trop chaud",
            "operateur": "<",
            "valeur": "19.5",
        },
    )
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["synthese"][0]["valeur"] == 19.5, (
        "une saisie numerique doit devenir un NOMBRE, pas rester la chaine \"19.5\"")


async def test_icone_vient_du_contrat_embarque_pas_d_une_liste_ecrite_a_la_main():
    """Ronde de mutation : si `listes._ICONES_OPTIONS` etait une liste tapee
    a la main plutot que lue depuis contrat/icones.json, ce test resterait
    vert tant que personne n'ajoute une icone des deux cotes a la fois — ce
    qui est precisement le piege deja corrige au plan 1. On verifie donc la
    PROVENANCE : les options offertes sont EXACTEMENT celles du fichier."""
    import json as _json

    from custom_components.home_desk import listes

    brut = _json.loads(listes.CHEMIN_ICONES.read_text(encoding="utf-8"))
    assert listes._ICONES_OPTIONS == brut["icones"]


async def test_le_champ_operateur_ne_propose_que_les_quatre_valeurs_du_schema():
    from custom_components.home_desk import listes

    champs_schema = listes._schema_synthese(editable=False).schema
    selecteur = next(
        v for k, v in champs_schema.items() if str(k) == "operateur")
    options = selecteur.config["options"]
    assert set(options) == {"==", "!=", "<", ">"}
