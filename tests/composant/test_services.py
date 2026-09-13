"""`home_desk.exporter` / `home_desk.importer` (services.py) : le YAML ou les
`note` redeviennent des commentaires, et l'aller-retour qui rend la migration
du plan 3c verifiable AVANT d'etre irreversible.

Ronde de relecture (auto-imposee, avant commit) : les valeurs de fil sont un
CONTRAT PUBLIE au-dela de ce module Python -- le nom de service "exporter"/
"importer" est appele par nom depuis des automatisations YAML ou l'interface
(jamais importe de `const.py`, qui ne parle pas YAML), et le chemin
"home_desk_ecrans.yaml" est ce qu'un OPERATEUR va chercher a la main dans
`config/`. Meme doctrine que `test_websocket.py` (voir sa propre note en
tete) : ces deux fichiers EN DUR, jamais `SERVICE_EXPORTER`/`FICHIER_EXPORT_
ECRANS` importes -- un renommage cote Python doit faire tomber CE fichier.
`VERSION_CONFIG` reste importee, meme regle que `test_websocket.py` : ce
n'est pas une epellation de protocole, seulement une valeur de round-trip
interne a Python.

Ronde 1 de relecture (le Critique) : les trois ecrans REELS d'`app/src/
ecran.ts` ne portent AUCUN champ `version` -- un fait mesure, pas suppose,
et la raison pour laquelle `test_importer_pose_version_config_quand_elle_
est_absente` ci-dessous ne se contente pas de lire `subentry.data`, mais
verifie de bout en bout, PAR `home_desk/ecran` (websocket.py), que l'ecran
importe est SERVI, pas seulement stocke."""
import pathlib

import pytest
import yaml
from conftest import ELEMENTS_VALIDES, _creer_ecran
from homeassistant.exceptions import HomeAssistantError

from custom_components.home_desk import services, yaml_ecrans
from custom_components.home_desk.const import DOMAIN, VERSION_CONFIG

NOTE_PORTE = "Porte epinglee : la tablette est a l'entree"
NOTE_AGENCEMENT = "Zone commandes toujours visible, mode minuteur pas encore active"
NOTE_VOITURE = "Objet voiture ajoute pour tester le champ-dict, note comprise"

VOITURE_TEST = {
    "batterie": "sensor.voiture_batterie",
    "autonomie": "sensor.voiture_autonomie",
    "branchee": "binary_sensor.voiture_branchee",
    "enCharge": "binary_sensor.voiture_en_charge",
    "clim": "binary_sensor.voiture_clim",
    "demarrerClim": "script.voiture_demarrer_clim",
    "arreterClim": "script.voiture_arreter_clim",
}


def _ecrans(hass):
    """L'etat REEL de tous les ecrans de l'entree unique, sans le
    `subentry_id` (un import en cree de NOUVEAUX -- l'aller-retour doit
    rendre les MEMES ecrans, pas les MEMES identifiants internes HA) --
    tries par titre pour une comparaison stable quel que soit l'ordre
    d'iteration de `entry.subentries`."""
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    return sorted(
        ((dict(sous_entree.data), sous_entree.title) for sous_entree in entry.subentries.values()),
        key=lambda paire: paire[1],
    )


async def _vider(hass):
    """Retire toutes les sous-entrees de l'entree unique -- pour prouver
    que `importer` les RECREE de lui-meme, jamais qu'il les a laissees en
    place."""
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    for subentry_id in list(entry.subentries):
        hass.config_entries.async_remove_subentry(entry, subentry_id)


def _chemin_export(hass) -> pathlib.Path:
    return pathlib.Path(hass.config.path("home_desk_ecrans.yaml"))


@pytest.fixture(autouse=True)
def _fichier_export_propre(hass):
    """Mesure : `hass.config.path(...)` (donc `_chemin_export`) resout vers
    UN SEUL repertoire, PARTAGE par toutes les fonctions de test de la
    session (`pytest_homeassistant_custom_component/testing_config/`),
    PAS un `tmp_path` prive par test -- au contraire de `entry`/`hass`,
    recrees a chaque fonction. Un fichier laisse par un test faussait donc
    SILENCIEUSEMENT le suivant : `test_importer_un_fichier_absent_REFUSE`
    passait sans qu'aucun fichier ne soit reellement absent (mesure en
    cassant une regle differente : le fichier perime d'un test precedent
    suffisait a faire lever la MEME exception, pour une MAUVAISE raison).
    Ce fixture retire le fichier avant ET apres chaque test de ce
    module -- la portee de ce probleme s'arrete a `home_desk_ecrans.yaml`,
    jamais aux sous-entrees elles-memes (deja isolees par `hass`)."""
    chemin = _chemin_export(hass)
    chemin.unlink(missing_ok=True)
    yield
    chemin.unlink(missing_ok=True)


@pytest.fixture
async def entree_peuplee(hass, entree_peuplee):
    """Etend le decor partage (conftest.py) de cinq facons que les tests
    ci-dessous exigent :

    1. Une `note` sur la premiere tuile de commande -- necessaire pour
       eprouver qu'exporter la rend en COMMENTAIRE (le decor partage n'en
       porte aucune, `IDENTITE_MINIMALE` non plus). C'est le chemin « note
       d'ELEMENT DE LISTE » (BOUTON, SYNTHESE, SOURCE, MINUTEUR_SLOT).
    2. Une `note` sur `agencement` -- ronde 1 de relecture (Important) :
       `yaml_ecrans` a DEUX chemins de rendu de note, et ce decor n'en
       exercait qu'un (le 1). Le second -- un champ-dict NOMME -- est
       CELUI que les trois ecrans REELS d'`app/src/ecran.ts` utilisent
       (leurs trois notes sont toutes sur `agencement`), et celui qui a
       demande deux rondes de mise au point pendant l'ecriture. Sans lui
       ICI, une regression sur ce chemin precis passait inapercue --
       mesure par mutation (voir le rapport).
    3. Une `note` sur `voiture` -- le SECOND champ-dict du contrat (le
       premier etant `agencement`), pour ne pas se fier a un decor qui
       n'exercerait qu'UN SEUL champ-dict.
    4. Un SECOND ecran minimal -- sans lui, le test d'aller-retour resterait
       aveugle a un decor a UN SEUL ecran, exactement l'ecueil que le brief
       nomme ("un seul ecran la ou il en fallait deux"). Une tuile de
       commande a lui aussi, distincte de celles du premier ecran, pour que
       la fidelite soit eprouvee sur DEUX ecrans qui ne se ressemblent pas.
    5. Un `titre` (`ConfigSubentry.title`) qui DIFFERE du `nom` du premier
       ecran -- websocket.py documente le geste GENERIQUE de Home Assistant
       qui les desynchronise (renommer le seul titre depuis la page
       d'integration) ; sans cette divergence ICI, un exporter/importer qui
       oublierait `titre` et le reconstruirait a partir de `nom` passerait
       le test d'aller-retour PAR ACCIDENT (les deux valent la meme chose
       dans tout decor ou ils n'ont jamais diverge)."""
    entree = entree_peuplee
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    subentry = next(iter(entry.subentries.values()))
    commandes = list(subentry.data["commandes"])
    commandes[0] = {**commandes[0], "note": NOTE_PORTE}
    hass.config_entries.async_update_subentry(
        entry, subentry,
        data={
            **subentry.data,
            "commandes": commandes,
            "agencement": {
                "zones": ["commandes"], "modes": ["defaut"], "modulateurs": [],
                "note": NOTE_AGENCEMENT,
            },
        },
        title="Salon (titre renomme a part)")

    # `_creer_ecran` rend `next(iter(entry.subentries))` -- correct pour UN
    # ecran, mais retombe sur le PREMIER cree (ici "Salon d essai") des
    # qu'un second existe deja (meme mise en garde que conftest.py fait a
    # `_subentry_id_par_nom`, test_websocket.py). Retrouve donc le second
    # ecran par son NOM plutot que de faire confiance a cette valeur.
    await _creer_ecran(hass, entree, nom="Cuisine d essai")
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    deuxieme_id = next(
        subentry_id for subentry_id, sous_entree in entry.subentries.items()
        if sous_entree.data.get("nom") == "Cuisine d essai"
    )
    deuxieme = entry.subentries[deuxieme_id]
    hass.config_entries.async_update_subentry(
        entry, deuxieme,
        data={
            **deuxieme.data,
            "commandes": [ELEMENTS_VALIDES["commandes"]],
            "voiture": {**VOITURE_TEST, "note": NOTE_VOITURE},
        })
    return entree


# ---------------------------------------------------------------------------
# home_desk.exporter
# ---------------------------------------------------------------------------


async def test_exporter_pose_les_note_en_COMMENTAIRES(hass, entree_peuplee):
    """Un note: au milieu des donnees serait une chaine de plus. Un # au-dessus
    de ce qu'il justifie est ce qu'un humain relit -- c'est toute la difference,
    et c'est la raison d'etre de ce service.

    Sur les DEUX chemins de rendu de note (ronde 1 de relecture) : une note
    d'ELEMENT DE LISTE (`NOTE_PORTE`, une tuile) ET une note de CHAMP-DICT
    NOMME (`NOTE_AGENCEMENT`/`NOTE_VOITURE`, `agencement`/`voiture`) -- le
    second est celui que les trois ecrans reels d'`app/src/ecran.ts`
    utilisent, et celui qu'un decor a un seul chemin laissait sans preuve."""
    await hass.services.async_call(DOMAIN, "exporter", blocking=True)

    texte = _chemin_export(hass).read_text(encoding="utf-8")

    assert f"# {NOTE_PORTE}" in texte
    assert f"# {NOTE_AGENCEMENT}" in texte
    assert f"# {NOTE_VOITURE}" in texte
    assert "note:" not in texte


async def test_exporter_sans_aucun_ecran_ecrit_une_liste_vide(hass, entree):
    """Le cas le plus degrade : aucun ecran configure. `exporter` ne doit
    pas refuser -- une installation neuve, muette (regression n.1 du
    README), doit pouvoir etre exportee sans erreur, ne serait-ce que pour
    verifier que le service fonctionne avant d'y semer un premier ecran."""
    await hass.services.async_call(DOMAIN, "exporter", blocking=True)

    texte = _chemin_export(hass).read_text(encoding="utf-8")

    assert yaml_ecrans.lire(texte) == []


# ---------------------------------------------------------------------------
# L'aller-retour
# ---------------------------------------------------------------------------


async def test_l_aller_retour_est_FIDELE(hass, entree_peuplee):
    """exporter puis importer doit rendre exactement les memes ecrans. Sans ce
    test, la migration du plan 3c perdrait des champs en silence -- et on ne le
    verrait qu'apres avoir retire les litteraux du depot, c'est-a-dire trop
    tard pour comparer.

    Sur DEUX ecrans (voir la fixture `entree_peuplee` ci-dessus) : un decor a
    un seul ecran ne distinguerait pas "l'ecran a survecu" de "l'ecran est le
    seul que l'import ait su recreer, par accident"."""
    avant = _ecrans(hass)
    assert len(avant) == 2, "le decor doit porter deux ecrans, pas un"

    await hass.services.async_call(DOMAIN, "exporter", blocking=True)
    await _vider(hass)
    assert _ecrans(hass) == []

    await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert _ecrans(hass) == avant


# ---------------------------------------------------------------------------
# home_desk.importer -- refus
# ---------------------------------------------------------------------------


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
    lever (voir `test_lire_*_LEVE` ci-dessous, qui gardent ce mecanisme
    directement), `importer` viderait alors TOUTE la configuration
    EXISTANTE sans un mot -- ce test le garde de bout en bout, ecrans
    REELLEMENT presents compris."""
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


# ---------------------------------------------------------------------------
# async_unload_services (Mineur, jamais garde avant cette ronde)
# ---------------------------------------------------------------------------


def test_unload_services_retire_les_deux_services(hass):
    services.async_setup_services(hass)
    assert hass.services.has_service(DOMAIN, "exporter")
    assert hass.services.has_service(DOMAIN, "importer")

    services.async_unload_services(hass)

    assert not hass.services.has_service(DOMAIN, "exporter")
    assert not hass.services.has_service(DOMAIN, "importer")


# ---------------------------------------------------------------------------
# services.yaml -- frontiere de langage YAML/Python (Mineur) : ce fichier
# ne peut pas importer SERVICE_EXPORTER/SERVICE_IMPORTER, jamais relu
# ailleurs avant cette ronde.
# ---------------------------------------------------------------------------


def test_services_yaml_nomme_les_deux_services():
    chemin = (
        pathlib.Path(__file__).resolve().parents[2]
        / "custom_components" / "home_desk" / "services.yaml"
    )
    contenu = yaml.safe_load(chemin.read_text(encoding="utf-8"))
    assert set(contenu) == {"exporter", "importer"}


# ---------------------------------------------------------------------------
# L'E/S hors de la boucle d'evenements (Important : neuvieme docstring
# menteuse du chantier, voir services.py).
# ---------------------------------------------------------------------------


async def test_exporter_et_importer_font_leur_ES_hors_de_la_boucle_d_evenements(
    hass, entree_peuplee, monkeypatch,
):
    """Home Assistant refuse en PRODUCTION un appel bloquant fait DEPUIS la
    boucle d'evenements -- mais ce garde-fou est desactive pour cette suite
    (mesure : inliner l'E/S sans `hass.async_add_executor_job` laisse les
    186 tests verts, voir services.py). Cette sonde verifie directement ce
    que ce depot PEUT prouver : que `_lire_fichier`/`_ecrire_fichier`
    passent bien PAR `hass.async_add_executor_job`, jamais par un appel
    direct depuis la coroutine du service."""
    appels: list[str] = []
    original = hass.async_add_executor_job

    def espion(fonction, *args):
        appels.append(fonction.__name__)
        return original(fonction, *args)

    monkeypatch.setattr(hass, "async_add_executor_job", espion)

    await hass.services.async_call(DOMAIN, "exporter", blocking=True)
    await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert "_ecrire_fichier" in appels
    assert "_lire_fichier" in appels
