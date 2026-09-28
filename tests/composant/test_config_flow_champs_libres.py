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
from custom_components.home_desk.const import SUBENTRY_SCREEN


# ---------------------------------------------------------------------------
# `delorean` -- ruling 15 (BLOQUANT) : decochee, la cle doit etre RETIREE,
# jamais ecrite a `False` (`const: true` au contrat la refuse). Decor a DEUX
# etats (lecon 3) : une implementation qui retirerait TOUJOURS la cle -- ou
# JAMAIS -- passerait avec un seul etat.
# ---------------------------------------------------------------------------


async def test_delorean_cochee_est_persistee_a_true_a_la_creation(hass, entree):
    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SUBENTRY_SCREEN),
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
        (entree.entry_id, SUBENTRY_SCREEN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "delorean": False})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    assert "delorean" not in resultat["data"]


async def test_reconfigurer_delorean_de_coche_a_decochee_retire_la_cle(hass, entree):
    """Le SECOND site (ruling 15) : `new_data.update(identity_data)` est
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
        (entree.entry_id, SUBENTRY_SCREEN),
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
        (entree.entry_id, SUBENTRY_SCREEN),
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
        (entree.entry_id, SUBENTRY_SCREEN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {**IDENTITE_MINIMALE,
         "temperature": "sensor.temperature_salon",
         "aspirateur": "vacuum.salon"})
    assert resultat["type"] is data_entry_flow.FlowResultType.CREATE_ENTRY
    # C1 (relecture finale) : la cle est desormais TOUJOURS posee (le
    # placeholder `{entites_inconnues}` de `create_entry.default` doit
    # TOUJOURS recevoir une valeur, jamais rester absente -- voir
    # `registre.avertissement_entites_inconnues`) ; "rien a signaler" se
    # lit maintenant a la VALEUR (vide), plus a l'absence de la cle.
    assert resultat["description_placeholders"]["entites_inconnues"] == ""


async def test_une_entite_inconnue_AVERTIT_dans_le_squelette_des_sections(hass, entree):
    """Ronde de correction 1 (defaut A) : decor RICHE, c'est tout l'enjeu.
    Une tuile de "commandes" porte ENSEMBLE : `entite` INCONNUE, `cible`
    CONNUE (inscrite au registre), et TROIS champs de texte libre dont la
    valeur A LA FORME d'un `entity_id` (`libelle`, `lien`, `note`). Seule
    l'entite reellement inconnue doit etre citee -- les trois textes
    libres, meme en forme d'entite, ne doivent PAS l'etre : c'est le test
    qui tombait avec le filtrage par FORME (ronde 1 de la tache)."""
    er.async_get(hass).async_get_or_create(
        "switch", "demo", "u1", suggested_object_id="salon")
    subentry_id = await _creer_ecran(hass, entree)

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"libelle": "tv.salon", "icone": "bulb",
         "entite": "light.nexiste_absolument_pas", "cible": "switch.salon",
         "lien": "media_player.html", "note": "reglages.avances"})

    # ACCEPTE : la tuile s'enregistre (FORM = le menu "commandes", pas un
    # refus) -- une entite peut arriver plus tard.
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat.get("errors", {}) == {}
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert entry.subentries[subentry_id].data["commandes"][0]["entite"] == (
        "light.nexiste_absolument_pas"
    )

    # ET AVERTIT, en ne citant QUE l'inconnue -- jamais `cible` (connue), ni
    # `libelle`/`lien`/`note` (du texte libre qui a la FORME d'une entite,
    # mais n'EN EST PAS UNE au contrat).
    placeholders = str(resultat["description_placeholders"])
    assert "light.nexiste_absolument_pas" in placeholders
    assert "switch.salon" not in placeholders
    assert "tv.salon" not in placeholders
    assert "media_player.html" not in placeholders
    assert "reglages.avances" not in placeholders


async def test_une_entite_inconnue_AVERTIT_pour_une_section_a_element_nu(hass, entree):
    """Le cas qui casse une approche naive (defaut A) : `ouvrants` a pour
    element une chaine NUE, sans cle autour -- sans passer `cle` au site
    d'appel, cet avertissement disparaitrait entierement pour cette
    section."""
    subentry_id = await _creer_ecran(hass, entree)

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "ouvrants"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"entite": "binary_sensor.nexiste_absolument_pas"})

    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat.get("errors", {}) == {}
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    assert entry.subentries[subentry_id].data["ouvrants"] == [
        "binary_sensor.nexiste_absolument_pas"
    ]
    assert "binary_sensor.nexiste_absolument_pas" in str(
        resultat["description_placeholders"]
    )


# ---------------------------------------------------------------------------
# Ronde de correction 2 (reserve 1 de la ronde 1) : neuf champs d'entite
# imbriques EN LIGNE (sans `$defs` propre) manquaient -- `minuteurs[].timer`/
# `.nom`, et les sept champs de `voiture`. `voiture` n'a PAS de test ici :
# son chemin d'appel passe par `objets.py`/`SectionsObjetMixin.async_step_
# voiture`, un module SEPARE du squelette des sections (`list_sections.py`) que ce
# fichier exerce. Voir `test_config_flow_voiture.py` pour son cablage --
# reste ouvert en ronde 2, ferme en ronde de correction 3.
# ---------------------------------------------------------------------------


async def test_LE_TEST_DE_LA_COLLISION_dans_le_squelette_des_sections(hass, entree):
    """LE test qui distingue cette correction de la precedente (reserve 1) :
    un element de la section `sources` porte ENSEMBLE `titre` (une vraie
    entite, inconnue -- doit etre citee) et `nom` (texte libre qui A LA
    FORME d'une entite -- ne doit PAS l'etre). Si ce test passe, la
    correction est structurellement juste ; s'il tombe, `entities_in` est
    redevenu un ensemble de noms deconnecte du CHEMIN."""
    subentry_id = await _creer_ecran(hass, entree)

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "sources"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"nom": "salon.spotify", "titre": ["sensor.nexiste_absolument_pas"]})

    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat.get("errors", {}) == {}
    placeholders = str(resultat["description_placeholders"])
    assert "sensor.nexiste_absolument_pas" in placeholders
    assert "salon.spotify" not in placeholders


async def test_une_entite_inconnue_AVERTIT_dans_un_slot_de_minuteur(hass, entree):
    """`minuteurs[].timer`/`.nom` : un objet imbrique EN LIGNE, sans `$defs`
    propre -- neuf champs manques par la table de la ronde 1 (reserve 1).
    `timer` inconnu est cite ; `note`, du texte libre en forme d'entite,
    ne l'est pas ; `nom`, CONNU ici, ne l'est pas non plus."""
    er.async_get(hass).async_get_or_create(
        "input_text", "demo", "u1", suggested_object_id="minuteur_salon")
    subentry_id = await _creer_ecran(hass, entree)

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "minuteurs"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"timer": "timer.nexiste_absolument_pas",
         "nom": "input_text.minuteur_salon",
         "note": "reglages.avances"})

    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat.get("errors", {}) == {}
    placeholders = str(resultat["description_placeholders"])
    assert "timer.nexiste_absolument_pas" in placeholders
    assert "input_text.minuteur_salon" not in placeholders
    assert "reglages.avances" not in placeholders
