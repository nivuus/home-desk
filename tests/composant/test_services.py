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

Ronde 2 de relecture : les tests de refus d'`home_desk.importer` (YAML
invalide, fichier absent, ecran sans titre, homonymes, version absente ou
inconnue) ont ete deplaces dans `test_services_import_refus.py` -- ce
fichier approchait les 500 lignes, et « comment importer refuse » est une
responsabilite distincte de « exporter fonctionne, l'aller-retour est
fidele » qui reste ici. Les fixtures et constantes partagees (`_chemin_
export`, `_ecrans`, `_fichier_export_propre`, `entree_peuplee`) restent
definies UNE FOIS ici et sont importees par l'autre fichier."""
import pathlib

import pytest
import voluptuous as vol
import yaml
from conftest import ELEMENTS_VALIDES, _creer_ecran

from custom_components.home_desk import services, yaml_ecrans
from custom_components.home_desk.const import DOMAIN

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

       CONSTAT (ronde 2 de relecture), a dire sans l'armer : `aspirateurMaison`
       (un BOUTON, comme les tuiles) est un TROISIEME champ-dict que rien
       ici n'exerce. Il passe par exactement le meme code que `agencement`/
       `voiture` (`_rendre_champ`, branche `isinstance(value, dict)`,
       generique aux noms de champs) -- verifie par sonde, la lacune est
       donc sans risque reel. Ajouter une troisieme note ici pour le seul
       principe de couverture serait armer une regle deja gardee deux fois
       par le MEME mecanisme, pas fermer un angle mort distinct.
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
    (mesure : inliner l'E/S sans `hass.async_add_executor_job` laissait la
    suite D'ALORS entierement verte, voir services.py -- le nombre exact
    ne nomme plus rien de reproductible une fois la suite elle-meme
    modifiee, seule la propriete compte). Cette sonde verifie directement
    ce que ce depot PEUT prouver : que `_read_file`/`_write_file`
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

    assert "_write_file" in appels
    assert "_read_file" in appels


async def test_exporter_et_importer_refusent_un_champ_inconnu(hass, entree):
    """Ronde 2 de relecture : `_SCHEMA_SANS_CHAMP` (`vol.Schema({})`,
    services.py) refuse un champ inconnu -- prouve par execution des la
    ronde 1 (son propre commentaire le disait : « verifie par execution »,
    ce qui etait vrai et exactement le probleme), jamais garde par un
    test avant celui-ci. Passer `extra=vol.ALLOW_EXTRA` a la place laisse
    la suite verte sans cette sonde."""
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(DOMAIN, "exporter", {"chemin": "x"}, blocking=True)
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(DOMAIN, "importer", {"chemin": "x"}, blocking=True)
