"""La troisieme section « objet » : `aspirateurMaison`, un Bouton UNIQUE.

Le dernier des quatre champs racine du contrat a recevoir une porte de
saisie (plan 3c, tache 1) ; les trois autres -- `aspirateur`,
`listesTachesExtra`, `delorean` -- ont ete ouverts par la tache 7 du plan 3b.
Meme forme que `voiture` (objets.py) : un objet entier rejoue a chaque
soumission, et une case pour le RETIRER plutot que de laisser des champs
vides."""
import pytest
from homeassistant import data_entry_flow
from homeassistant.helpers import translation

from conftest import _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import (
    DOMAIN,
    ERROR_FIELD_INVALID_FORMAT,
    ERROR_FIELD_EMPTY,
    ERROR_SERVICE_INCOMPLETE,
)


@pytest.fixture(autouse=True)
async def _langue_francaise(hass):
    """`hass.config.language` vaut "en" par defaut dans ce harnais (mesure :
    `homeassistant/core_config.py`, `self.language: str = "en"`), jamais
    "fr" tant que rien ne le change -- et une vraie installation de cette
    maison EST en francais (toutes les chaines utilisateur du depot le
    sont). `registre.avertissement_entites_inconnues` lit `hass.config.
    language` directement (pas de repli comme `libelles._langue`), et le
    cache de traductions est charge PAR LANGUE (`translation.async_load_
    integrations`) : changer `language` seul, sans recharger, laisserait
    le cache "fr" vide et le test retomberait sur la liste nue -- pas
    l'erreur ici testee, mais un faux negatif d'environnement."""
    hass.config.language = "fr"
    await translation.async_load_integrations(hass, {DOMAIN})


BOUTON = {
    "libelle": "Aspirer ici",
    "icone": "aspirateur",
    "entite": "vacuum.piece_a",
    "service_domaine": "vacuum",
    "service_action": "start",
}


async def _soumettre(hass, entree, subentry_id, donnees):
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "aspirateur_maison"})
    return await hass.config_entries.subentries.async_configure(flow["flow_id"], donnees)


async def test_le_bouton_est_persiste_avec_son_service_recompose(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    resultat = await _soumettre(hass, entree, subentry_id, BOUTON)
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["aspirateurMaison"] == {
        "libelle": "Aspirer ici", "icone": "aspirateur",
        "entite": "vacuum.piece_a", "service": ["vacuum", "start"],
    }, "les deux champs service_* se recomposent en TABLEAU, comme partout ailleurs"


async def test_une_paire_service_a_demi_remplie_est_refusee_sans_rien_persister(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    demi = {**BOUTON}
    del demi["service_action"]
    resultat = await _soumettre(hass, entree, subentry_id, demi)
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["service_action"] == ERROR_SERVICE_INCOMPLETE
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert "aspirateurMaison" not in subentry.data


async def test_un_libelle_fait_d_espaces_est_refuse(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    resultat = await _soumettre(hass, entree, subentry_id, {**BOUTON, "libelle": "   "})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["libelle"] == ERROR_FIELD_EMPTY


async def test_cocher_sans_aspirateur_maison_retire_la_cle_entierement(hass, entree):
    """`not in`, jamais `is None` : le contrat decrit un objet ABSENT, pas une
    valeur nulle. `data_updates=` ferait une UNION et garderait la cle."""
    subentry_id = await _creer_ecran(hass, entree)
    await _soumettre(hass, entree, subentry_id, BOUTON)
    resultat = await _soumettre(
        hass, entree, subentry_id, {**BOUTON, "sans_aspirateur_maison": True})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert "aspirateurMaison" not in subentry.data


async def test_une_vue_qui_ne_commence_pas_par_diese_est_refusee(hass, entree):
    """Le formulaire (`_schema_bouton`, list_fields.py) ne pose AUCUNE
    contrainte de forme sur `vue` (`vol.Optional("vue"): str`, large a
    dessein -- voir la docstring de module de list_fields.py) : seul
    `schema.BOUTON` (`_VUE_PATTERN`, motif `^#` du contrat) la garde.
    Mutation de l'etape 11 (rapportee dans task-1-report.md) : remplacer
    `schema.BOUTON(candidat)` par `candidat` laissait ce refus disparaitre
    sans qu'aucun autre test de ce fichier ne le remarque -- la seule
    facon de fermer ce trou etait d'en ecrire un qui le vise directement."""
    subentry_id = await _creer_ecran(hass, entree)
    resultat = await _soumettre(hass, entree, subentry_id, {**BOUTON, "vue": "taches"})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["vue"] == ERROR_FIELD_INVALID_FORMAT
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert "aspirateurMaison" not in subentry.data


async def test_une_entite_inconnue_AVERTIT_au_lieu_de_REFUSER(hass, entree):
    """Decision 7 de la spec, quatrieme-et-maintenant-cinquieme cablage. La
    PHRASE, pas seulement la liste nue : `avertissement_entites_inconnues`
    passe par le cache de traductions, et un repli silencieux sur la liste
    seule est exactement le mode de panne que C1 a corrige en 3b."""
    subentry_id = await _creer_ecran(hass, entree)
    resultat = await _soumettre(
        hass, entree, subentry_id, {**BOUTON, "entite": "vacuum.nexiste_absolument_pas"})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["aspirateurMaison"]["entite"] == "vacuum.nexiste_absolument_pas", (
        "un AVERTISSEMENT ne refuse pas : la valeur est persistee")
    placeholders = resultat["description_placeholders"]
    assert "vacuum.nexiste_absolument_pas" in placeholders["entites_inconnues"]
    assert "vérifier" in placeholders["entites_inconnues"], (
        "la phrase de traduction, pas la liste nue -- et l'accent EST dans la chaine "
        "francaise de l'application (`fr.json` : « a verifier » s'ecrit « à vérifier »). "
        "`.lower()` ne retire pas les accents : chercher \"verifier\" nu ne matcherait jamais.")
