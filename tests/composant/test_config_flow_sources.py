"""La section « liste » `sources` : ce qu'AUCUN test parametre sur
`SECTIONS` ne peut couvrir d'office, parce que c'est PROPRE a cette section
(les six champs multi-entites optionnels, l'objet `allumee` aplati/
recompose) — le squelette choisir/ajouter/monter/descendre/supprimer, lui,
est deja couvert par `test_config_flow_listes.py`.

Separe de `test_config_flow_objets.py` en ronde 2 de relecture (ce dernier
depassait 500 lignes) — meme couture que `listes_champs_sources.py`
lui-meme : « une section = un fichier »."""
from homeassistant import data_entry_flow

from conftest import _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import ERREUR_ALLUMEE_INCOMPLETE


async def test_source_dont_un_seul_champ_multi_entite_est_touche_est_acceptee(hass, entree):
    """I5, ronde 1 de relecture : mesure AVANT correction, une soumission
    qui ne touche pas `titre` (par exemple) levait `InvalidData` — une
    EXCEPTION, jamais un formulaire reaffiche. Le contrat n'impose aucun
    `minItems` sur ces six tableaux : les laisser vides est deja valide."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "sources"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "nom": "Salon TV",
            "affiche": ["media_player.tv"],
            "transport": ["media_player.tv"],
            "volume": ["media_player.tv"],
            # "titre", "sousTitre", "progression" volontairement absents.
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["sources"][0]["titre"] == []
    assert subentry.data["sources"][0]["affiche"] == ["media_player.tv"]


async def test_source_allumee_incomplete_est_refusee(hass, entree):
    """Mineur de la ronde 1 : `AllumeeIncomplete` n'etait asserte nulle
    part (mutation verte : supprimer le `raise` laissait tout vert)."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "sources"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"nom": "Salon TV", "allumee_entite": "binary_sensor.tv_allumee"},
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["allumee_etats"] == ERREUR_ALLUMEE_INCOMPLETE
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["sources"] == [], "un refus ne doit RIEN persister"


async def test_source_avec_allumee_se_reedite_avec_les_deux_champs_preremplis(hass, entree):
    """Mineur de la ronde 1 : la recomposition `_afficher_source` (l'inverse
    de la construction, pour l'objet `allumee`) n'etait exercee par AUCUN
    aller-retour d'edition."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "sources"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "nom": "Salon TV",
            "allumee_entite": "binary_sensor.tv_allumee",
            "allumee_etats": "on, playing",
        },
    )

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "sources"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"choix": "0"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    marqueurs = {str(c): c for c in resultat["data_schema"].schema}
    assert marqueurs["allumee_entite"].description == {"suggested_value": "binary_sensor.tv_allumee"}
    assert marqueurs["allumee_etats"].description == {"suggested_value": "on, playing"}
