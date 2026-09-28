"""La section « objet » `voiture` elle-meme (I1 de la ronde 1 de relecture :
aucun test fonctionnel ne l'exercait). Separe de `test_config_flow_objets.py`
en ronde 3 de relecture (ce dernier depassait 500 lignes une fois la chaine
rendue du message `ecran_deviendrait_invalide` assertee) — meme couture que
`test_config_flow_sources.py` en ronde 2 : « une section = un fichier ».

Les scenarios CROISES entre `voiture` et `agencement` (le Critique : retirer
une voiture DEJA configuree pendant que `blocDefaut` l'exige encore) restent
dans `test_config_flow_objets.py`, qui teste `agencement` — c'est cette
section-la qui porte la garde, pas `voiture`."""
from homeassistant import data_entry_flow
from homeassistant.helpers import entity_registry as er

from conftest import VOITURE_COMPLETE, _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import ERROR_FIELD_REQUIRED


async def test_voiture_complete_est_persistee_avec_ses_sept_champs(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "voiture"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], VOITURE_COMPLETE)
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["voiture"] == VOITURE_COMPLETE


async def test_voiture_incomplete_est_refusee_et_ne_persiste_rien(hass, entree):
    """I1, mutation survivante : supprimer `schema.VOITURE(candidat)`
    (le remplacer par `candidat` tel quel) laissait passer un objet
    INCOMPLET — plus aucun test ne l'en empechait."""
    subentry_id = await _creer_ecran(hass, entree)
    incomplete = dict(VOITURE_COMPLETE)
    del incomplete["clim"]
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "voiture"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], incomplete)
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["clim"] == ERROR_FIELD_REQUIRED
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert "voiture" not in subentry.data, "un refus ne doit RIEN persister"


async def test_cocher_sans_voiture_retire_la_cle_entierement(hass, entree):
    """I1, l'autre mutation survivante : poser `None` au lieu de retirer la
    cle. `"voiture" not in subentry.data` (jamais `is None`) : le contrat
    exige l'ABSENCE, pas une valeur nulle — `schema.VOITURE(None)` leverait
    de toute facon si la cle restait presente."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "voiture"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], VOITURE_COMPLETE)
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["voiture"] == VOITURE_COMPLETE

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "voiture"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"sans_voiture": True})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert "voiture" not in subentry.data


# ---------------------------------------------------------------------------
# Ronde de correction 3 : decision 7 (spec), restee non cablee pour cette
# section -- les sept champs `$ref: entite` de `voiture` sont les plus
# exposes a la faute de frappe du lot (sept `sensor.*`/`binary_sensor.*`/
# `script.*` d'un meme appareil, tapes a la suite), et n'avertissaient
# jamais sur une faute.
# ---------------------------------------------------------------------------


async def test_une_entite_inconnue_AVERTIT_dans_voiture(hass, entree):
    """Decor riche, meme exigence que le squelette des sections « liste ».

    L'objet `voiture` soumis porte ENSEMBLE les trois cas qui comptent :

    - `batterie`, une entite INCONNUE du registre -> DOIT etre citee ;
    - les SIX autres champs `$ref: entite`, tous INSCRITS au registre ici ->
      ne doivent PAS l'etre : citer une entite connue ferait du bruit que
      personne ne lirait plus au bout de deux saisies ;
    - `note`, le seul champ de TEXTE LIBRE du contrat de `voiture`
      (`{"type": "string"}`), avec une valeur qui A LA FORME d'un
      `entity_id` sans en etre un -> ne doit PAS etre citee.

    Ce dernier point est LE test de collision de cette section, et le seul
    qui distingue une lecture du CONTRAT d'une reconnaissance par la FORME
    `domaine.objet`. Sans lui, une implementation revenue au filtrage par
    forme passerait ce test sans qu'on s'en apercoive.
    """
    registre = er.async_get(hass)
    for i, (champ, entite) in enumerate(VOITURE_COMPLETE.items()):
        if champ == "batterie":
            continue
        domaine, objet = entite.split(".")
        registre.async_get_or_create(domaine, "demo", f"u{i}", suggested_object_id=objet)

    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "voiture"})
    candidat = {
        **VOITURE_COMPLETE,
        "batterie": "sensor.nexiste_pas",
        "note": "reglages.avances",
    }
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], candidat)

    # ACCEPTE : le flow ABOUTIT (MENU, comme les autres persistances de
    # `voiture`), jamais un refus -- une entite peut arriver plus tard.
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    assert resultat.get("errors", {}) == {}
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["voiture"] == candidat

    # ET AVERTIT -- sur l'inconnue, et sur elle SEULE.
    placeholders = str(resultat["description_placeholders"])
    assert "sensor.nexiste_pas" in placeholders
    for champ, entite in VOITURE_COMPLETE.items():
        if champ == "batterie":
            continue
        assert entite not in placeholders, f"{champ} est connu du registre : ne pas le citer"
    # La collision : `note` est du texte libre au contrat, pas une entite --
    # meme quand sa valeur ressemble a un `entity_id`.
    assert "reglages.avances" not in placeholders
