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

from conftest import VOITURE_COMPLETE, _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import ERREUR_CHAMP_REQUIS


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
    assert resultat["errors"]["clim"] == ERREUR_CHAMP_REQUIS
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
