"""Le squelette COMMUN des cinq sections « liste » du menu d'une sous-entree
(choisir/ajouter, modifier, monter, descendre, supprimer) — teste sur
"commandes", plus les regles qui s'appliquent aux CINQ sections a la fois
(couverture, refus explicite du menu, reaffichage sur erreur). Le mirroir de
`listes.py`.

Ce qui est PARTICULIER a chaque section (ses champs, ses selecteurs, la ligne
de synthese, les domaines) vit dans `test_config_flow_champs.py` depuis la
ronde 2 de relecture — le mirroir de `listes_champs.py`. Separe de
`test_config_flow.py` (identite, budget, traductions) en ronde 1, pour rester
sous 500 lignes chacun — jamais a un compte de lignes arbitraire, la meme
couture que le code lui-meme.
"""
import pytest
import voluptuous as vol
from homeassistant import data_entry_flow

from conftest import ELEMENTS_VALIDES, _commandes, _creer_ecran, _geste, _init_reconfigure
from custom_components.home_desk import schema
from custom_components.home_desk.const import (
    ACTION_DESCENDRE,
    ACTION_ENREGISTRER,
    ACTION_MONTER,
    ACTION_SUPPRIMER,
    ERREUR_CHAMP_INVALIDE,
    ERREUR_SELECTION_MANQUANTE,
)
from custom_components.home_desk.listes_champs import SECTIONS, _fusionner


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
    qu'un utilisateur qui ne touche pas a ces champs produirait.

    Ronde 2 de relecture : deux assertions avaient disparu au passage a une
    seule tuile (`avant`/`apres` n'existaient plus, et `geste` — un champ du
    FORMULAIRE, jamais du contrat — pouvait fuiter dans la donnee stockee
    sans qu'aucun test ne le voie). Restaurees ici avec TROIS tuiles : de
    quoi distinguer « la tuile editee change » de « les deux autres NE
    BOUGENT PAS », ce qu'un ecran a une seule tuile ne peut pas prouver."""
    subentry_id = await _creer_ecran(hass, entree)

    async def _ajouter(tuile: dict) -> None:
        flow = await _init_reconfigure(hass, entree, subentry_id)
        await hass.config_entries.subentries.async_configure(
            flow["flow_id"], {"next_step_id": "commandes"})
        await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
        resultat = await hass.config_entries.subentries.async_configure(flow["flow_id"], tuile)
        assert resultat["type"] is data_entry_flow.FlowResultType.FORM

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
    await _ajouter(complet)
    await _ajouter({"libelle": "Lampe salon", "icone": "bulb", "entite": "light.salon"})
    await _ajouter({"libelle": "Volet salon", "icone": "rideau", "entite": "cover.salon"})

    avant = _commandes(hass)
    assert avant[0]["service"] == ["cover", "open_cover"], (
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

    apres = _commandes(hass)
    assert apres[0]["libelle"] == "Portail (renomme)"
    assert apres[0]["service"] == ["cover", "open_cover"]
    assert apres[0]["vue"] == "#garage"
    assert apres[0]["epingle"] is True
    assert apres[0]["absenceNommee"] == "Portail indisponible"
    assert apres[0]["lien"] == "https://exemple.local/portail"
    assert apres[0]["cible"] == "cover.portail"
    assert apres[0]["note"] == "Ne pas ouvrir sous la pluie"
    assert "geste" not in apres[0], (
        "`geste` est un champ du FORMULAIRE (monter/descendre/supprimer/"
        "enregistrer) : il ne doit JAMAIS atteindre la donnee stockee")
    assert apres[1:] == avant[1:], (
        "editer la tuile 0 ne doit toucher NI le contenu NI le rang des "
        "deux autres")


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
    fusion = _fusionner(geres, existant, donnee)
    assert fusion == {"libelle": "Apres", "vue": "#garage", "epingle": True}


def test_listes_ne_reexporte_plus_SECTIONS_ni_Section():
    """Ronde 3 de relecture (trou de couverture) : le seam SECTIONS/Section
    a deux adresses a ete resolu en ronde 2 (retire de `listes.__all__`,
    `listes_champs.py` devenu la seule adresse canonique) — mais RIEN ne le
    TENAIT : remettre `SECTIONS`/`Section` dans `listes.__all__` (la meme
    regression qu'un futur renommage pourrait introduire sans y penser)
    laissait la suite verte."""
    from custom_components.home_desk import listes
    assert "SECTIONS" not in listes.__all__
    assert "Section" not in listes.__all__


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
    UNE SEULE regle manquante, exactement celle-la.

    Ce test REMPLIT les cinq sections avant de verifier — il ne prouve donc
    RIEN sur un ecran dont une section n'a jamais ete ouverte (ronde 3 de
    relecture, Important 1, ci-dessous) : deux tests complementaires, pas
    substituables l'un a l'autre."""
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


async def test_un_ecran_dont_aucune_section_n_a_jamais_ete_ouverte_est_deja_validable(
    hass, entree
):
    """Ronde 3 de relecture, Important 1 : une section jamais ouverte ne
    persistait RIEN — la cle restait ABSENTE, pas vide, alors que le contrat
    exige les cinq cles de liste a la RACINE (`vol.Required` dans
    schema.py). Les vrais ecrans du depot le prouvent : `salon` ne porte
    JAMAIS `ambiances`/`extrasMaison`, `bureau` ne porte JAMAIS
    `ouvrants`/`extrasMaison`. MEME faute de classe que le Critique de la
    ronde 1 (un champ absent du formulaire disparaissait de la donnee) — et
    le test ci-dessus la MASQUAIT en remplissant les cinq sections avant de
    verifier. Celui-ci n'ouvre AUCUNE section : seule l'identite est saisie."""
    subentry_id = await _creer_ecran(hass, entree)
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    for cle in SECTIONS:
        assert subentry.data[cle] == [], (
            f"{cle!r} doit exister, VIDE, des la creation — jamais absente")

    with pytest.raises(vol.Invalid) as excinfo:
        schema.valider(dict(subentry.data))
    assert schema.motif(excinfo.value) == ": required"  # "sources", seule piece manquante

    donnees = dict(subentry.data)
    donnees["sources"] = []
    schema.valider(donnees)  # ne leve plus : les cinq sections, vides, suffisent


# ---------------------------------------------------------------------------
# Ronde 2 de relecture : le menu de section soumis sans choix, et l'idiome
# de reaffichage generalise a toutes les sections.
# ---------------------------------------------------------------------------


async def test_soumettre_le_menu_de_section_sans_choix_refuse_explicitement(hass, entree):
    """Ronde 2 de relecture : ni « nouveau » coche, ni element choisi —
    valider ce formulaire reaffichait EN SILENCE, sans dire a l'utilisateur
    pourquoi rien ne s'etait passe. Refus EXPLICITE desormais."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    resultat = await hass.config_entries.subentries.async_configure(flow["flow_id"], {})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["nouveau"] == ERREUR_SELECTION_MANQUANTE


@pytest.mark.parametrize("cle", sorted(SECTIONS))
async def test_un_refus_reaffiche_la_saisie_sur_TOUTES_les_sections(hass, entree, cle):
    """Point 4 de la ronde 2 : l'idiome « reaffiche user_input, jamais les
    valeurs stockees » ne doit plus vivre qu'UNE fois (`formulaire.
    reafficher`) — verifie ici sur les CINQ sections, pas seulement synthese
    (`test_un_refus_reaffiche_la_saisie_pas_les_valeurs_stockees`,
    test_config_flow_champs.py). Un `entite` qui ne respecte pas le motif du
    contrat refuse partout, quelle que soit la section : c'est le seul champ
    commun aux cinq.

    La valeur invalide doit passer le `selector.EntitySelector` de HA (son
    propre format, `cv.entity_id` : chiffres AUTORISES dans le domaine) tout
    en violant `$defs/entite` du contrat (domaine `[a-z_]+`, AUCUN chiffre) —
    sans quoi HA refuserait lui-meme la saisie AVANT d'appeler notre step
    (`InvalidData`, jamais un formulaire reaffiche), pour une raison sans
    rapport avec ce test.

    Ronde 3 de relecture : assertion ajoutee sur `resultat["errors"]["entite"]`
    — `ouvrants` est la seule section dont `schema.ENTITE` est applique EN
    DEHORS d'un `vol.Schema({...})` (un validateur FEUILLE, pas imbrique) ;
    sans `listes_champs._valider_ouvrant`, un `entite` invalide y aurait leve
    avec un chemin VIDE et serait retombe sur "base", aucun champ surligne —
    la MEME classe de defaut que le motif de `service` corrige au point 2."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": cle})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    invalide = {**ELEMENTS_VALIDES[cle], "entite": "a1.pas_une_entite_valide"}
    resultat = await hass.config_entries.subentries.async_configure(flow["flow_id"], invalide)
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["entite"] == ERREUR_CHAMP_INVALIDE
    marqueurs = {str(c): c for c in resultat["data_schema"].schema}
    assert marqueurs["entite"].description == {"suggested_value": "a1.pas_une_entite_valide"}
