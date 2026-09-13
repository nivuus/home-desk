"""Ce que chaque section « liste » a de PARTICULIER : ses champs, ses
selecteurs, la construction/l'affichage d'un element — le miroir de test de
`listes_champs.py`, exactement comme `test_config_flow_listes.py` est celui
de `listes.py` (le squelette commun choisir/ajouter/modifier/monter/
descendre/supprimer, teste a part).

Separe de `test_config_flow_listes.py` en ronde 2 de relecture pour rester
sous 500 lignes chacun — jamais a un compte de lignes arbitraire : c'est la
MEME couture que celle deja appliquee au code lui-meme.
"""
import json
import pathlib

from conftest import _commandes, _creer_ecran, _init_reconfigure
from custom_components.home_desk import listes_champs, schema
from custom_components.home_desk.const import (
    ACTION_ENREGISTRER,
    ERREUR_CHAMP_REQUIS,
    ERREUR_CHAMP_TYPE_INVALIDE,
    ERREUR_SERVICE_INCOMPLET,
    SOUS_ENTREE_ECRAN,
)
from custom_components.home_desk.listes_champs import SECTIONS
from custom_components.home_desk.schema import OPERATEURS
from homeassistant import data_entry_flow

CHEMIN_TRADUCTIONS = (
    pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "home_desk" / "translations"
)


def _message_erreur(langue: str, code: str) -> str:
    """Le message REELLEMENT rendu pour un code d'erreur, dans une langue —
    utilise par les tests qui epinglent le message, pas seulement le code
    (ronde 4 de relecture, point 1 : un code correct peut encore porter un
    message qui ment ou reste illisible ; seul le TEXTE final le prouve)."""
    traductions = json.loads(
        (CHEMIN_TRADUCTIONS / f"{langue}.json").read_text(encoding="utf-8"))
    return traductions["config_subentries"][SOUS_ENTREE_ECRAN]["error"][code]


# ---------------------------------------------------------------------------
# $defs/bouton et $defs/synthese : couverture exacte du contrat, composition
# du formulaire.
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# La ligne de synthese : l'union discriminee operateur/valeur
# ---------------------------------------------------------------------------


async def test_synthese_operateur_dordre_refuse_une_valeur_non_numerique_avec_un_message_lisible(
    hass, entree
):
    """Le piege de la tache : `<`/`>` exigent un nombre ($defs/synthese, allOf
    du contrat). Un champ texte unique laisserait passer une chaine — refusee
    par `schema.SYNTHESE`.

    Ronde 4 de relecture, un des quatre chemins mesures par le relecteur :
    avant cette ronde, le message REELLEMENT rendu etait « Ce champ n'est
    pas valide : /valeur: type. » — le mot-cle JSON Schema brut, montre a un
    humain. `errors["valeur"]` porte desormais `ERREUR_CHAMP_TYPE_INVALIDE`,
    dont le message dit quoi faire, sans plus jamais interpoler de motif."""
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
    assert resultat["errors"]["valeur"] == ERREUR_CHAMP_TYPE_INVALIDE
    assert not resultat["description_placeholders"]
    for langue in ("fr", "en"):
        message = _message_erreur(langue, ERREUR_CHAMP_TYPE_INVALIDE)
        assert ": type" not in message and "{motif}" not in message


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
# $defs/bouton, $defs/synthese, ouvrants : AUCUN domaine impose (verifie sur
# les ecrans reels, ronde 1 puis ronde 2 de relecture).
# ---------------------------------------------------------------------------


async def test_extrasMaison_accepte_un_capteur_comme_le_vrai_Scanner_du_depot(hass, entree):
    """Verification directe (ronde 1 de relecture, suite) : une premiere
    version restreignait "entite" de $defs/bouton a light/cover/lock/switch,
    y compris pour `extrasMaison`. Or le SEUL extra reel du depot
    (app/src/ecran.ts, piece cuisine) est `{ libelle: 'Scanner', icone:
    'scan', entite: 'sensor.<un capteur reel de cette maison>', ... }` — un
    `sensor`, hors de cette liste. Ce test rejoue cette tuile a l'identique,
    SAUF l'`entite` elle-meme (inventee ci-dessous, releve en relecture
    finale de branche : la valeur reelle n'a pas sa place dans une suite de
    tests, seul son DOMAINE `sensor` est ce que ce test exerce) : elle doit
    passer, sans quoi le SEUL extra reel du depot resterait irreproductible
    depuis l'interface, a l'oppose du but de la tache (migrer les ecrans
    reels hors du depot, cf. le brief)."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "extrasMaison"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "libelle": "Scanner",
            "icone": "scan",
            "entite": "sensor.test_prochain_repas",
            "lien": "/home-stock",
            "absenceNommee": "Garde-manger non installe",
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM

    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["extrasMaison"] == [
        {
            "libelle": "Scanner",
            "icone": "scan",
            "entite": "sensor.test_prochain_repas",
            "lien": "/home-stock",
            "absenceNommee": "Garde-manger non installe",
        }
    ]


def test_bouton_n_impose_aucun_domaine_verifie_sur_les_trois_ecrans_reels():
    """Complement du test ci-dessus, au niveau du selecteur directement :
    l'inventaire REEL des trois ecrans (commandes: binary_sensor, climate,
    cover, fan, light, lock, sensor, todo ; ambiances: fan, light, vacuum ;
    extrasMaison: sensor — mesure par grep sur app/src/ecran.ts) deborde
    largement toute liste blanche raisonnable : `entite`/`cible` ne doivent
    filtrer AUCUN domaine, exactement comme `$defs/entite` du contrat, qui
    n'en restreint aucun."""
    champs = listes_champs._schema_bouton(False).schema
    for nom in ("entite", "cible"):
        selecteur = next(v for k, v in champs.items() if str(k) == nom)
        assert "domain" not in selecteur.config, (
            f"{nom} ne doit filtrer aucun domaine (voir la note de "
            "listes_champs.py sur l'inventaire reel des trois ecrans)")


def test_synthese_n_impose_aucun_domaine():
    """Ronde 2 de relecture : `_DOMAINES_SYNTHESE` (sensor/binary_sensor/
    todo/lock/cover) semblait valide par l'inventaire reel mais n'etait tenu
    par AUCUN test — retiree pour la meme raison que le domaine de
    $defs/bouton ci-dessus : une contrainte non verifiee est inventee."""
    champs = listes_champs._schema_synthese(False).schema
    selecteur = next(v for k, v in champs.items() if str(k) == "entite")
    assert "domain" not in selecteur.config


def test_ouvrant_n_impose_aucun_domaine():
    """Meme correction que ci-dessus pour `_DOMAINES_OUVRANT`
    (binary_sensor)."""
    champs = listes_champs._schema_ouvrant(False).schema
    selecteur = next(v for k, v in champs.items() if str(k) == "entite")
    assert "domain" not in selecteur.config


def test_le_selecteur_de_geste_declare_translation_key_geste():
    """`_cles_attendues()` (test_config_flow.py) ne verifie que le cote
    JSON (`selector.geste.options.*`) — jamais que le SELECTEUR lui-meme
    demande ce `translation_key`. Retirer `translation_key="geste"` de
    `_selecteur_geste()` laisserait cette suite verte tant que le JSON garde
    ses cles, exactement le meme angle mort que corrige
    `test_icone_vient_du_contrat_embarque...` pour les icones."""
    selecteur = listes_champs._selecteur_geste()
    assert selecteur.config["translation_key"] == "geste"


def test_libelle_de_chaque_section_vient_du_bon_champ():
    """`Section.libelle` n'avait aucun test DIRECT : le reduire a autre
    chose que le vrai libelle (un simple index, par exemple) restait vert
    tant que les autres tests ne comparaient que des libelles deja
    distincts par ailleurs."""
    assert SECTIONS["commandes"].libelle({"libelle": "Lampe"}) == "Lampe"
    assert SECTIONS["ambiances"].libelle({"libelle": "Ambiance"}) == "Ambiance"
    assert SECTIONS["extrasMaison"].libelle({"libelle": "Extra"}) == "Extra"
    assert SECTIONS["synthese"].libelle({"texte": "Trop chaud"}) == "Trop chaud"
    assert SECTIONS["ouvrants"].libelle("binary_sensor.porte") == "binary_sensor.porte"


# ---------------------------------------------------------------------------
# Ronde 2 de relecture : la paire service_domaine/service_action a demi
# remplie.
# ---------------------------------------------------------------------------


async def test_service_a_demi_rempli_est_refuse_a_l_ajout(hass, entree):
    """Avant la ronde 2, `service_domaine` sans `service_action` (ou
    l'inverse) etait abandonne EN SILENCE : ni ecrit, ni refuse — un
    utilisateur qui ne remplit qu'un des deux champs n'a AUCUN moyen de
    savoir que sa tuile est incomplete.

    Ronde 3 de relecture (Important 2) : la ronde 2 refusait bien, mais via
    `schema._paire_service()` (redevenue privee en ronde 4, releve en
    relecture finale de branche) — un motif JSON Schema ("minItems") pose sur
    "base" (aucun champ surligne), pour un message reellement affiche
    "Ce champ n'est pas valide : : minItems." Charabia, corrige : le refus
    porte maintenant `ERREUR_SERVICE_INCOMPLET`, pose sur le champ
    REELLEMENT vide (`service_action` ici)."""
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
            "service_domaine": "cover",
            # "service_action" volontairement absent.
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["service_action"] == ERREUR_SERVICE_INCOMPLET
    assert _commandes(hass) == [], "aucune tuile ne doit avoir ete ecrite"


async def test_service_a_demi_efface_est_refuse_et_ne_supprime_pas_le_service_existant(
    hass, entree
):
    """Le pendant en EDITION : une tuile qui porte deja un `service` complet,
    reeditee en effacant UN SEUL des deux champs texte, doit etre REFUSEE —
    jamais silencieusement amputee de son `service` (le bouton mort que ce
    depot s'interdit)."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "libelle": "Portail",
            "icone": "porte",
            "entite": "cover.portail",
            "service_domaine": "cover",
            "service_action": "open_cover",
        },
    )
    avant = _commandes(hass)[0]
    assert avant["service"] == ["cover", "open_cover"]

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"choix": "0"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "libelle": "Portail",
            "icone": "porte",
            "entite": "cover.portail",
            "service_domaine": "",  # efface UN SEUL des deux champs.
            "service_action": "open_cover",
            "geste": ACTION_ENREGISTRER,
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["service_domaine"] == ERREUR_SERVICE_INCOMPLET
    assert _commandes(hass)[0]["service"] == ["cover", "open_cover"], (
        "un refus ne doit RIEN ecrire : le service existant doit survivre intact")


async def test_vider_les_deux_champs_service_retire_le_service_existant(hass, entree):
    """Ronde 3 de relecture (trou de couverture 3) : aucun test ne tenait le
    retrait VOLONTAIRE d'un service existant (les deux champs texte vides a
    la fois). Sans ce test, une sur-correction du genre « ne jamais effacer
    un service » (par exemple `elif existant and existant.get('service'):
    ...`) resterait invisible alors qu'elle empeche un retrait legitime —
    exactement la sur-correction qu'un mainteneur futur pourrait ecrire le
    jour ou quelqu'un rouvre ce fichier apres avoir lu le refus ci-dessus."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "libelle": "Portail",
            "icone": "porte",
            "entite": "cover.portail",
            "service_domaine": "cover",
            "service_action": "open_cover",
        },
    )
    assert _commandes(hass)[0]["service"] == ["cover", "open_cover"]

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"choix": "0"})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {
            "libelle": "Portail",
            "icone": "porte",
            "entite": "cover.portail",
            "service_domaine": "",
            "service_action": "",
            "geste": ACTION_ENREGISTRER,
        },
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert not resultat["errors"]
    assert "service" not in _commandes(hass)[0]


# ---------------------------------------------------------------------------
# Ronde 2 de relecture (point 2) : `listes.py` portait le MEME defaut de
# troncature que `garde_ecran.py` corrigeait deja pour agencement/voiture —
# un champ REQUIS omis de la donnee CONSTRUITE retombait sur "base" via
# `schema.localiser()`. `valeur` (SYNTHESE) est la SEULE des quatre formes
# mesurees par le relecteur atteignable par le FLOW REEL (les trois autres
# sont des champs `EntitySelector`/`ChampVide`, deja interceptes avant ce
# module — verifie par execution) : voir `test_localiser_champ_ne_tronque_
# aucune_des_quatre_formes` (test_garde_ecran.py) pour les trois autres,
# testees directement sur le MECANISME.
# ---------------------------------------------------------------------------


async def test_valeur_vide_sur_une_ligne_de_synthese_nomme_le_champ_pas_base(hass, entree):
    """Meme defaut, mesure sur une SECONDE forme ($defs/synthese) : `valeur`
    n'est pas dans `_CHAMPS_TEXTE_SYNTHESE`, donc une soumission vide
    l'omet aussi du candidat construit — la meme troncature s'y appliquait
    identiquement avant cette ronde."""
    subentry_id = await _creer_ecran(hass, entree)
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "synthese"})
    await hass.config_entries.subentries.async_configure(flow["flow_id"], {"nouveau": True})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {"entite": "sensor.x", "texte": "Texte", "operateur": "==", "valeur": ""},
    )
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["valeur"] == ERREUR_CHAMP_REQUIS
    assert "base" not in resultat["errors"]

