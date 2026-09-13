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
ECRANS` importes -- un renommage cote Python doit faire tomber CE fichier."""
import pathlib

import pytest
import voluptuous as vol
import yaml
from conftest import ELEMENTS_VALIDES, _creer_ecran
from homeassistant.exceptions import HomeAssistantError

from custom_components.home_desk import garde_ecran, yaml_ecrans
from custom_components.home_desk.const import DOMAIN

NOTE_PORTE = "Porte epinglee : la tablette est a l'entree"


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
    """Etend le decor partage (conftest.py) de trois facons que les tests
    ci-dessous exigent :

    1. Une `note` sur la premiere tuile de commande -- necessaire pour
       eprouver qu'exporter la rend en COMMENTAIRE (le decor partage n'en
       porte aucune, `IDENTITE_MINIMALE` non plus).
    2. Un SECOND ecran minimal -- sans lui, le test d'aller-retour resterait
       aveugle a un decor a UN SEUL ecran, exactement l'ecueil que le brief
       nomme ("un seul ecran la ou il en fallait deux"). Une tuile de
       commande a lui aussi, distincte de celles du premier ecran, pour que
       la fidelite soit eprouvee sur DEUX ecrans qui ne se ressemblent pas.
    3. Un `titre` (`ConfigSubentry.title`) qui DIFFERE du `nom` du premier
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
        entry, subentry, data={**subentry.data, "commandes": commandes},
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
        data={**deuxieme.data, "commandes": [ELEMENTS_VALIDES["commandes"]]})
    return entree


# ---------------------------------------------------------------------------
# home_desk.exporter
# ---------------------------------------------------------------------------


async def test_exporter_pose_les_note_en_COMMENTAIRES(hass, entree_peuplee):
    """Un note: au milieu des donnees serait une chaine de plus. Un # au-dessus
    de ce qu'il justifie est ce qu'un humain relit -- c'est toute la difference,
    et c'est la raison d'etre de ce service."""
    await hass.services.async_call(DOMAIN, "exporter", blocking=True)

    texte = _chemin_export(hass).read_text(encoding="utf-8")

    assert f"# {NOTE_PORTE}" in texte
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

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert _ecrans(hass) == []


async def test_importer_un_fichier_absent_REFUSE(hass, entree):
    """Une faute DIFFERENTE de la precedente (un fichier illisible, pas un
    YAML qui echoue la validation) -- doit lever la MEME famille d'erreur
    cote appelant (`HomeAssistantError`), jamais une exception non
    rattrapee qui remonterait comme un bug du composant plutot que comme un
    refus nomme."""
    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(DOMAIN, "importer", blocking=True)


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

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(DOMAIN, "importer", blocking=True)

    assert _ecrans(hass) == []


def test_importer_ecrans_valide_tout_avant_d_ecrire_quoi_que_ce_soit():
    """Le MECANISME (garde_ecran.importer_ecrans), teste directement sans
    passer par le service HA -- le meme idiome que test_garde_ecran.py pour
    `verifier_ecran_complet`. `hass` est un objet factice dont
    `config_entries._async_update_entry` leve si on l'appelle : si
    `importer_ecrans` ecrivait AVANT d'avoir fini de valider tous les
    ecrans, cette sonde le prouverait -- une preuve plus dure qu'une simple
    assertion sur l'etat final, qui ne distinguerait pas "jamais appele" de
    "appele puis annule"."""

    class _ConfigEntriesQuiExplose:
        @staticmethod
        def _async_update_entry(*_args, **_kwargs):
            raise AssertionError("importer_ecrans a ecrit alors qu'un ecran est invalide")

    class _HassFactice:
        config_entries = _ConfigEntriesQuiExplose()

    ecrans = [
        ("Valide", {
            "nom": "Valide", "temperature": "sensor.t",
            "ambiances": [], "commandes": [], "extrasMaison": [],
            "synthese": [], "sources": [], "ouvrants": [],
        }),
        ("Invalide", {"nom": "Invalide"}),
    ]

    with pytest.raises(vol.Invalid):
        garde_ecran.importer_ecrans(hass=_HassFactice(), entry=object(), ecrans=ecrans)
