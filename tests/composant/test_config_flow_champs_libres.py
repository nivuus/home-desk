"""Tache 7 : les trois champs racine qui gagnent une porte de saisie
(`aspirateur`, `delorean`, et `listesTachesExtra` -- couvert generiquement
par les tests parametres sur `SECTIONS`, `test_config_flow_listes.py`), et
l'avertissement d'entite inconnue (decision 7).

Separe de `test_config_flow.py`/`test_config_flow_identite.py` (deja pres de
500 lignes chacun) -- meme couture que les autres scissions de ce dossier.
"""
from homeassistant import config_entries, data_entry_flow
from homeassistant.helpers import entity_registry as er

from conftest import IDENTITE_MINIMALE, _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import SOUS_ENTREE_ECRAN


# ---------------------------------------------------------------------------
# `delorean` -- ruling 15 (BLOQUANT) : decochee, la cle doit etre RETIREE,
# jamais ecrite a `False` (`const: true` au contrat la refuse). Decor a DEUX
# etats (lecon 3) : une implementation qui retirerait TOUJOURS la cle -- ou
# JAMAIS -- passerait avec un seul etat.
# ---------------------------------------------------------------------------


async def test_delorean_cochee_est_persistee_a_true_a_la_creation(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "delorean": True})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat["data"]["delorean"] is True


async def test_delorean_decochee_n_est_pas_persistee_et_l_ecran_s_enregistre(hass, entree):
    """C'est la moitie qui tombait avant ce correctif : sans le filtre de
    `_valider_identite`, `delorean: False` etait ecrit alors que le contrat
    la porte `const: true` (`False` y est REFUSE) -- l'ecran ne pouvait plus
    s'enregistrer des qu'on ouvrait ce formulaire sans cocher la case."""
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "delorean": False})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert "delorean" not in resultat["data"]


async def test_reconfigurer_delorean_de_coche_a_decochee_retire_la_cle(hass, entree):
    """Le SECOND site (ruling 15) : `nouvelles_donnees.update(donnee)` est
    une UNION qui ne retire JAMAIS une cle deja persistee -- sans son
    jumeau, decocher une case DEJA cochee sur un ecran existant echouerait
    a la retirer (exactement la forme du defaut que "note" a eu en ronde 1
    de la tache 6)."""
    subentry_id = await _creer_ecran(hass, entree, delorean=True)
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert entry.subentries[subentry_id].data["delorean"] is True

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "delorean": False})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert "delorean" not in entry.subentries[subentry_id].data


# ---------------------------------------------------------------------------
# `aspirateur` -- le second champ racine sans porte de saisie avant cette
# tache, meme mecanique que `temperature`.
# ---------------------------------------------------------------------------


async def test_aspirateur_est_persiste_a_la_creation(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "aspirateur": "vacuum.salon"})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat["data"]["aspirateur"] == "vacuum.salon"


# ---------------------------------------------------------------------------
# Decision 7 : une entite inconnue du registre AVERTIT, ne refuse JAMAIS.
# Decor a DEUX entites (lecon 3) : une CONNUE du registre, une inconnue --
# avec une seule, une implementation qui avertirait sur TOUT, ou sur RIEN,
# passerait sans qu'on s'en apercoive.
# ---------------------------------------------------------------------------


async def test_une_entite_inconnue_AVERTIT_au_lieu_de_REFUSER_a_la_creation(hass, entree):
    """Mesure de la relecture finale du plan 3a : `light.nexiste_absolument_
    pas` etait accepte avec `errors={}` ET `description_placeholders={}` --
    du SILENCE, pas un avertissement."""
    er.async_get(hass).async_get_or_create(
        "sensor", "demo", "u1", suggested_object_id="temperature_salon")

    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {**IDENTITE_MINIMALE,
         "temperature": "sensor.temperature_salon",
         "aspirateur": "vacuum.nexiste_absolument_pas"})

    # ACCEPTE : le flow ABOUTIT (CREATE_ENTRY). Une entite peut arriver plus
    # tard -- une ampoule pas encore appairee, une integration pas encore
    # chargee --, donc refuser interdirait de preparer un ecran avant son
    # materiel.
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert resultat.get("errors", {}) == {}

    # ET AVERTIT. La difference entre un avertissement et un refus ne se
    # joue PAS dans le texte mais ici, dans le couple (type de resultat,
    # errors) : un test qui ne regarderait que la phrase laisserait un refus
    # passer pour un avertissement.
    placeholders = str(resultat["description_placeholders"])
    assert "vacuum.nexiste_absolument_pas" in placeholders
    # Et il ne cite QUE l'inconnue : citer l'entite connue ferait du bruit
    # que personne ne lirait plus au bout de deux saisies.
    assert "sensor.temperature_salon" not in placeholders


async def test_une_entite_inconnue_AVERTIT_au_lieu_de_REFUSER_en_reconfiguration(hass, entree):
    """Le pendant en reconfiguration (`async_step_identite`) : meme decor a
    DEUX entites, meme couple (type de resultat, errors)."""
    er.async_get(hass).async_get_or_create(
        "sensor", "demo", "u1", suggested_object_id="temperature_salon")
    subentry_id = await _creer_ecran(hass, entree)

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {**IDENTITE_MINIMALE,
         "temperature": "sensor.temperature_salon",
         "aspirateur": "vacuum.nexiste_absolument_pas"})

    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    assert resultat.get("errors", {}) == {}
    placeholders = str(resultat["description_placeholders"])
    assert "vacuum.nexiste_absolument_pas" in placeholders
    assert "sensor.temperature_salon" not in placeholders


async def test_aucune_entite_inconnue_ne_produit_aucun_avertissement(hass, entree):
    """Le pendant negatif : deux entites, TOUTES DEUX connues -- rien a
    signaler. Sans ce test, une implementation qui avertirait TOUJOURS
    passerait le test positif ci-dessus (qui ne verifie que la PRESENCE de
    l'inconnue, jamais l'ABSENCE d'un faux positif)."""
    registre = er.async_get(hass)
    registre.async_get_or_create("sensor", "demo", "u1", suggested_object_id="temperature_salon")
    registre.async_get_or_create("vacuum", "demo", "u2", suggested_object_id="salon")

    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {**IDENTITE_MINIMALE,
         "temperature": "sensor.temperature_salon",
         "aspirateur": "vacuum.salon"})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert "entites_inconnues" not in resultat["description_placeholders"]


async def test_une_entite_inconnue_AVERTIT_dans_le_squelette_des_sections(hass, entree):
    """Ruling 10 (supplement), deuxieme mutation de la table : le cablage
    dans `_async_step_section_element` (listes.py) n'est garde par AUCUN
    test du brief -- celui-ci le garde, sur le MEME patron (decor a deux
    entites, une connue une inconnue) qu'a l'identite. Une tuile de
    "commandes" porte deux champs entite (`entite`, `cible`) : `entite`
    CONNUE, `cible` INCONNUE."""
    er.async_get(hass).async_get_or_create(
        "light", "demo", "u1", suggested_object_id="salon")
    subentry_id = await _creer_ecran(hass, entree)

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"libelle": "Lampe", "icone": "bulb", "entite": "light.salon",
         "cible": "switch.nexiste_absolument_pas"})

    # ACCEPTE : la tuile s'enregistre (FORM = le menu "commandes", pas un
    # refus) -- une entite peut arriver plus tard.
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat.get("errors", {}) == {}
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert entry.subentries[subentry_id].data["commandes"][0]["cible"] == (
        "switch.nexiste_absolument_pas"
    )

    # ET AVERTIT, en ne citant QUE l'inconnue.
    placeholders = str(resultat["description_placeholders"])
    assert "switch.nexiste_absolument_pas" in placeholders
    assert "light.salon" not in placeholders
