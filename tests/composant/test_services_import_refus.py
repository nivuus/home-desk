"""`home_desk.importer` -- les REFUS. Scinde de `test_services.py` (ronde 2
de relecture : celui-ci approchait 500 lignes) sur un seam reel, pas
arbitraire : la responsabilite « `exporter` fonctionne, l'aller-retour est
fidele » vit dans `test_services.py` ; celle-ci est « comment `importer`
refuse », une responsabilite distincte et nommable. Les fixtures et
constantes partagees (`_chemin_export`, `_ecrans`, `_fichier_export_propre`,
`entree_peuplee`) restent definies UNE FOIS dans `test_services.py` et sont
importees ici -- une fixture reste une fixture pour pytest quel que soit le
module qui l'importe, tant qu'elle est visible dans l'espace de noms du
module de test.

Ronde 1 de relecture (le Critique, section `version` plus bas) : les trois
ecrans REELS d'`app/src/ecran.ts` ne portent AUCUN champ `version` -- un
fait mesure, pas suppose, et la raison pour laquelle
`test_importer_pose_version_config_quand_elle_est_absente` ne se contente
pas de lire `subentry.data`, mais verifie de bout en bout, PAR
`home_desk/ecran` (websocket.py), que l'ecran importe est SERVI, pas
seulement stocke."""
import pytest
from homeassistant.exceptions import HomeAssistantError

from custom_components.home_desk import yaml_ecrans
from custom_components.home_desk.const import DOMAIN, VERSION_CONFIG
from test_services import _chemin_export, _ecrans, _fichier_export_propre, entree_peuplee

__all__ = ["_fichier_export_propre", "entree_peuplee"]  # fixtures reexportees, pas un oubli de lint


async def test_importer_un_YAML_invalide_REFUSE_TOUT(hass, entree):
    """Tout ou rien. Un import partiel laisserait la configuration dans un
    etat que personne n'a voulu, et que rien ne nomme -- pire qu'un refus.

    "invalide" au sens large : un ecran conforme cote a cote d'un ecran qui
    ne l'est pas (le cas le plus insidieux -- un import naif qui s'arreterait
    au premier refus aurait deja ecrit le premier)."""
    texte = (
        "ecrans:\n"
        "- titre: Valide\n"
        "  nom: Valide\n"
        "  temperature: sensor.t\n"
        "  ambiances: []\n"
        "  commandes: []\n"
        "  extrasMaison: []\n"
        "  synthese: []\n"
        "  sources: []\n"
        "  ouvrants: []\n"
        "- titre: Invalide\n"
        "  nom: Invalide\n"
        "  ambiances: []\n"
    )
    _chemin_export(hass).write_text(texte, encoding="utf-8")

    with pytest.raises(HomeAssistantError) as excinfo:
        await hass.services.async_call(DOMAIN, "importer", blocking=True)

    # Ronde 1 de relecture (Important) : `pytest.raises(HomeAssistantError)`
    # SEUL passe encore si les trois `except` de services.py sont fondus en
    # un seul generique -- mesure. Le message doit venir precisement du
    # chemin `vol.Invalid` (schema.valider refuse l'ecran "Invalide"), pas
    # d'un chemin different qui aurait aussi pu lever une HomeAssistantError.
    assert "import refuse, rien n'a ete ecrit" in str(excinfo.value)
    assert _ecrans(hass) == []


async def test_importer_un_fichier_absent_REFUSE(hass, entree):
    """Une faute DIFFERENTE de la precedente (un fichier illisible, pas un
    YAML qui echoue la validation) -- doit lever la MEME famille d'erreur
    cote appelant (`HomeAssistantError`), jamais une exception non
    rattrapee qui remonterait comme un bug du composant plutot que comme un
    refus nomme. Message epingle (ronde 1 de relecture, Important) : sans
    lui, fondre les trois `except` de services.py sous un seul generique
    laisse ce test VERT quand meme -- seul le message distingue ce chemin
    (`OSError`) de celui de `test_importer_un_YAML_invalide_REFUSE_TOUT`
    (`vol.Invalid`)."""
    with pytest.raises(HomeAssistantError) as excinfo:
        await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert "impossible de lire" in str(excinfo.value)


async def test_importer_un_fichier_qui_n_est_pas_du_YAML_REFUSE(hass, entree):
    """Le TROISIEME chemin de refus (ni fichier absent, ni ecran non
    conforme) : le fichier existe mais n'est PAS du YAML syntaxiquement
    valide -- `yaml.YAMLError`, jamais confondu avec les deux autres."""
    _chemin_export(hass).write_text("ecrans: [1, 2\n", encoding="utf-8")

    with pytest.raises(HomeAssistantError) as excinfo:
        await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert "n'est pas exploitable" in str(excinfo.value)


async def test_importer_un_fichier_hors_sujet_REFUSE_sans_rien_effacer(hass, entree_peuplee):
    """Un fichier YAML syntaxiquement VALIDE mais qui n'a pas la forme
    attendue (pas de cle 'ecrans') est le QUATRIEME chemin de refus, et le
    plus dangereux a rater : si `yaml_ecrans.lire` rendait `[]` au lieu de
    lever (voir `test_lire_*_LEVE`, test_yaml_ecrans.py, qui gardent ce
    mecanisme directement), `importer` viderait alors TOUTE la
    configuration EXISTANTE sans un mot -- ce test le garde de bout en
    bout, ecrans REELLEMENT presents compris."""
    avant = _ecrans(hass)
    assert avant

    _chemin_export(hass).write_text("autre_chose: 42\n", encoding="utf-8")

    with pytest.raises(HomeAssistantError) as excinfo:
        await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert "n'est pas exploitable" in str(excinfo.value)
    assert _ecrans(hass) == avant


async def test_importer_un_ecran_sans_titre_REFUSE(hass, entree):
    """`titre` est ce que `exporter` ajoute a cote des champs du contrat
    (voir sa docstring) -- un fichier qui ne le porte pas n'a pas ete
    produit par `home_desk.exporter`, et ne doit pas etre importe a
    moitie (un `titre` invente serait un mensonge de plus)."""
    texte = (
        "ecrans:\n"
        "- nom: SansTitre\n"
        "  temperature: sensor.t\n"
        "  ambiances: []\n"
        "  commandes: []\n"
        "  extrasMaison: []\n"
        "  synthese: []\n"
        "  sources: []\n"
        "  ouvrants: []\n"
    )
    _chemin_export(hass).write_text(texte, encoding="utf-8")

    with pytest.raises(HomeAssistantError) as excinfo:
        await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert "titre" in str(excinfo.value)
    assert _ecrans(hass) == []


async def test_importer_deux_ecrans_homonymes_est_REFUSE(hass, entree):
    """Contrainte posee par ce composant, PAS par le contrat (schema.py ne
    porte et ne peut pas porter d'unicite entre sous-entrees) -- la meme
    regle que `config_flow._valider_identite` impose a la creation par le
    formulaire (voir garde_ecran.noms_utilises). Sans elle ICI, un import
    pourrait semer deux ecrans homonymes que le formulaire n'aurait jamais
    laisse coexister, rendant l'un des deux durablement inatteignable par
    `home_desk/ecran` (qui rend toujours le premier trouve)."""
    ecran = {
        "nom": "Salon",
        "temperature": "sensor.t",
        "ambiances": [], "commandes": [], "extrasMaison": [],
        "synthese": [], "sources": [], "ouvrants": [],
    }
    texte = yaml_ecrans.rendre([{"titre": "Un", **ecran}, {"titre": "Deux", **ecran}])
    _chemin_export(hass).write_text(texte, encoding="utf-8")

    with pytest.raises(HomeAssistantError) as excinfo:
        await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert "import refuse, rien n'a ete ecrit" in str(excinfo.value)
    assert _ecrans(hass) == []


# ---------------------------------------------------------------------------
# version -- ronde 1 de relecture, LE CRITIQUE : les trois ecrans reels
# d'`app/src/ecran.ts` ne portent aucun champ `version` ; `schema.valider`
# l'accepte absente (`vol.Optional`), mais `websocket._resoudre` refuse
# ensuite de la servir. Fermee par `garde_ecran.importer_ecrans`, qui pose
# VERSION_CONFIG quand elle est absente et refuse net quand elle est
# presente mais differente.
# ---------------------------------------------------------------------------


async def test_importer_pose_version_config_quand_elle_est_absente(hass, entree, ws_client):
    """Preuve DE BOUT EN BOUT, pas seulement sur `subentry.data` : un
    fichier qui ne porte PAS `version` (exactement la forme des trois
    ecrans reels d'`app/src/ecran.ts`) doit produire un ecran SERVI par
    `home_desk/ecran`, jamais un ecran refuse a la lecture qui demanderait
    de le "recreer" -- le geste que l'import devait justement eviter."""
    texte = (
        "ecrans:\n"
        "- titre: SansVersion\n"
        "  nom: SansVersion\n"
        "  temperature: sensor.t\n"
        "  ambiances: []\n"
        "  commandes: []\n"
        "  extrasMaison: []\n"
        "  synthese: []\n"
        "  sources: []\n"
        "  ouvrants: []\n"
    )
    _chemin_export(hass).write_text(texte, encoding="utf-8")

    await hass.services.async_call(DOMAIN, "importer", blocking=True)

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    sous_entree = next(iter(entry.subentries.values()))
    assert sous_entree.data["version"] == VERSION_CONFIG

    await ws_client.send_json_auto_id({"type": "home_desk/ecran", "nom": "SansVersion"})
    reponse = await ws_client.receive_json()
    assert reponse["success"] is True, (
        f"l'ecran importe sans version doit etre SERVI, pas refuse : {reponse}")
    assert reponse["result"]["version"] == VERSION_CONFIG


async def test_importer_une_version_inconnue_est_REFUSEE(hass, entree):
    """Le pendant du test precedent : une version PRESENTE mais DIFFERENTE
    de `VERSION_CONFIG` est une vraie incompatibilite, jamais une omission
    -- refusee net, jamais corrigee a la place de l'operateur."""
    texte = (
        "ecrans:\n"
        "- titre: VersionFuture\n"
        "  nom: VersionFuture\n"
        "  version: 999\n"
        "  temperature: sensor.t\n"
        "  ambiances: []\n"
        "  commandes: []\n"
        "  extrasMaison: []\n"
        "  synthese: []\n"
        "  sources: []\n"
        "  ouvrants: []\n"
    )
    _chemin_export(hass).write_text(texte, encoding="utf-8")

    with pytest.raises(HomeAssistantError) as excinfo:
        await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert "999" in str(excinfo.value)
    assert _ecrans(hass) == []
