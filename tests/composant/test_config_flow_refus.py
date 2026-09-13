"""Ronde 4 de relecture : l'audit du refus s'etait arrete un cran trop tot
en ronde 3 (`service` seul corrige) — `schema.motif()` fuyait toujours, TEL
QUEL, dans le message de TOUS LES AUTRES refus d'un element de section
« liste » ("Ce champ n'est pas valide : : required.", entre autres, sur le
champ le plus courant de la section la plus courante). Quatre chemins
mesures par le relecteur, un test par chemin, qui epingle le message
REELLEMENT rendu — pas seulement le code d'erreur, qui peut rester correct
alors que le message ment ou reste illisible (la lecon de ce chantier,
appliquee ici a elle-meme : `test_les_traductions_nomment_le_motif_du_
champ_invalide`, ronde 1-3, epinglait la MAUVAISE regle).

Separe de `test_config_flow_champs.py` en ronde 4 pour rester sous 500
lignes chacun — jamais a un compte de lignes arbitraire, la meme couture
que le reste du chantier.
"""
import pathlib

import pytest
import voluptuous as vol
from homeassistant import data_entry_flow

from conftest import _commandes, _creer_ecran, _init_reconfigure
from custom_components.home_desk import listes_erreurs, schema
from custom_components.home_desk.const import (
    ERREUR_CHAMP_FORMAT_INVALIDE,
    ERREUR_CHAMP_INVALIDE,
    ERREUR_CHAMP_REQUIS,
    ERREUR_CHAMP_VIDE,
    SOUS_ENTREE_ECRAN,
)

CHEMIN_TRADUCTIONS = (
    pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk" / "translations"
)


def _message_erreur(langue: str, code: str) -> str:
    """Le message REELLEMENT rendu pour un code d'erreur, dans une langue."""
    import json
    traductions = json.loads(
        (CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    return traductions["config_subentries"][SOUS_ENTREE_ECRAN]["error"][code]


def test_required_a_un_message_qui_dit_quoi_faire():
    """Le chemin le PLUS courant mesure par le relecteur (`libelle` vide,
    section commandes) rendait EXACTEMENT le charabia que la ronde 3
    pensait avoir supprime : « Ce champ n'est pas valide : : required. » —
    et ce message MENTAIT : `libelle` est un champ REMPLI d'une chaine
    vide, jamais absent, sous les yeux de l'utilisateur (la cause :
    `_construire_donnee_bouton` exclut les valeurs vides de `donnee`,
    laissant le candidat SANS la cle du tout).

    `libelle`/`texte` (les seuls champs texte SANS selecteur HA parmi les
    champs requis) sont desormais gardes PLUS TOT par `ChampVide`
    (mineur de cette meme ronde, teste separement plus bas) ; tous les
    AUTRES champs requis ($defs/entite, les enums) sont des selecteurs HA
    (`EntitySelector`/`SelectSelector`) dont le FORMAT est deja verifie par
    Home Assistant avant meme d'atteindre notre step — required n'est donc
    plus ATTEIGNABLE via le flow reel aujourd'hui, sur AUCUNE des cinq
    sections. Verifie directement le MECANISME (`schema.localiser` +
    `listes_erreurs._ERREUR_PAR_MOT_CLE`) malgre tout, pour le jour ou un futur
    champ requis (tache 7, minuteurs) le rendra de nouveau atteignable —
    et le message qu'il produirait des aujourd'hui."""
    with pytest.raises(vol.Invalid) as excinfo:
        schema.BOUTON({"icone": "bulb", "entite": "light.test"})  # "libelle" absent
    _, mot_cle = schema.localiser(excinfo.value)
    assert mot_cle == "required"
    assert listes_erreurs._ERREUR_PAR_MOT_CLE[mot_cle] == ERREUR_CHAMP_REQUIS
    for langue in ("fr", "en"):
        message = _message_erreur(langue, ERREUR_CHAMP_REQUIS)
        assert "required" not in message and "{motif}" not in message and ":" not in message


async def test_vue_sans_diese_est_refuse_avec_un_message_qui_dit_quoi_faire(hass, entree):
    """`vue` doit commencer par `#` (`$defs/bouton.vue`, motif du contrat) —
    rendait « Ce champ n'est pas valide : /vue: pattern. »"""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "libelle": "Portail",
            "icone": "porte",
            "entite": "cover.portail",
            "vue": "garage",  # sans le "#" attendu par le contrat.
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["vue"] == ERREUR_CHAMP_FORMAT_INVALIDE
    assert not resultat["description_placeholders"]
    for langue in ("fr", "en"):
        message = _message_erreur(langue, ERREUR_CHAMP_FORMAT_INVALIDE)
        assert "pattern" not in message and "{motif}" not in message and ":" not in message
    assert _commandes(hass) == []


async def test_libelle_compose_uniquement_d_espaces_est_refuse(hass, entree):
    """Mineur de la ronde 4 : `"   "` passe la validation minLength:1 du
    contrat (les espaces comptent comme des caracteres, ajv ferait pareil)
    mais reste un LIBELLE INVISIBLE une fois affiche — le bouton mort que ce
    depot s'interdit. Meme doctrine que `nom` (ronde 1) : `.strip()`-verifie
    a la saisie, jamais dans schema.py (qui doit rester fidele au contrat
    partage avec ajv)."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"libelle": "   ", "icone": "bulb", "entite": "light.test_libelle_espaces"},
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["libelle"] == ERREUR_CHAMP_VIDE
    assert _commandes(hass) == []


async def test_texte_synthese_compose_uniquement_d_espaces_est_refuse(hass, entree):
    """Le pendant pour `$defs/synthese.texte` — meme garde-fou que
    `libelle` ci-dessus."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "synthese"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "entite": "sensor.temperature_salon",
            "texte": "   ",
            "operateur": "==",
            "valeur": "ok",
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["texte"] == ERREUR_CHAMP_VIDE


def test_champ_invalide_n_interpole_plus_aucun_motif():
    """Ronde 4 de relecture : `ERREUR_CHAMP_INVALIDE` ne reste que le REPLI
    d'un mot-cle qu'aucune des trois formes ($defs/bouton, $defs/synthese,
    $defs/entite) ne peut produire aujourd'hui. Son message est desormais
    STATIQUE : verifie qu'il ne porte plus AUCUN `{motif}` a interpoler --
    la fuite ne peut donc plus reapparaitre, meme pour un mot-cle qu'on
    aurait oublie d'ajouter a `listes_erreurs._ERREUR_PAR_MOT_CLE`."""
    for langue in ("fr", "en"):
        message = _message_erreur(langue, ERREUR_CHAMP_INVALIDE)
        assert "{motif}" not in message


async def test_synthese_valeur_reproposee_est_une_chaine_pas_un_nombre(hass, entree):
    """Mineur de la ronde 4 : le seul DESACCORD de type entre `afficher()`
    et `construire_schema()` du composant. `valeur` est stockee comme un
    NOMBRE des que `_convertir_valeur` reussit, mais le champ du formulaire
    reste `str` (`_schema_synthese`) -- reproposer le nombre TEL QUEL comme
    valeur suggeree romprait l'accord entre les deux ; une resoumission NON
    MODIFIEE serait alors refusee par HA AVANT meme d'atteindre le step
    (`InvalidData`, une exception), jamais un formulaire reaffiche."""
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
            "valeur": "12",
        },
    )
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "synthese"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"choix": "0"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    marqueurs = {str(c): c for c in resultat["data_schema"].schema}
    assert marqueurs["valeur"].description == {"suggested_value": "12"}
    assert isinstance(marqueurs["valeur"].description["suggested_value"], str)
