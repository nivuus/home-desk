"""`garde_ecran.importer_ecrans` -- le SECOND site d'ecriture legitime de
ce module (le chemin de creation en masse pour `home_desk.importer`,
services.py), teste directement sans passer par le service HA -- meme
MECANISME, meme doctrine que `test_garde_ecran.py` pour
`check_complete_screen`.

Scinde de `test_garde_ecran.py` en relecture finale de branche (deuxieme
ronde) : ce dernier depassait les 500 lignes une fois les deux tests
ci-dessous ajoutes -- un seam reel, deja amorce par le commentaire de
section que ces quatre tests partageaient dans l'ancien fichier
("Tache 9 : garde_ecran.importer_ecrans, le SECOND site d'ecriture
legitime de ce module"). Aucune fixture partagee a importer : chaque test
ici construit son propre `hass`/`config_entries` factices, comme dans
l'ancien fichier."""
import voluptuous as vol
import pytest

from custom_components.home_desk import garde_ecran


def test_importer_ecrans_valide_tout_avant_d_ecrire_quoi_que_ce_soit():
    """`hass` est un objet factice dont `config_entries._async_update_entry`
    leve si on l'appelle : si `importer_ecrans` ecrivait AVANT d'avoir fini
    de valider tous les ecrans, cette sonde le prouverait -- une preuve
    plus dure qu'une simple assertion sur l'etat final, qui ne
    distinguerait pas "jamais appele" de "appele puis annule"."""

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


def test_importer_ecrans_ecrit_en_UNE_SEULE_FOIS():
    """Ronde 1 de relecture (tache 9, Mineur -- « la bascule indivisible »)
    : la docstring de `garde_ecran.importer_ecrans` argumente sur dix
    lignes qu'une SEULE ecriture reelle (`_async_update_entry`) rend la
    bascule indivisible -- jamais gardee par un test avant cette ronde.
    Remplacer cette ecriture unique par une boucle
    `async_remove_subentry` + `async_add_subentry` par ecran produirait le
    MEME etat final tout en ouvrant une FENETRE ou `entry.subentries` est
    incomplet -- invisible a un test qui ne verifie que l'etat final.
    Cette sonde compte les appels REELS plutot que l'etat :
    `_async_update_entry` doit etre appele EXACTEMENT une fois, avec les
    DEUX ecrans a la fois ; les deux autres portes ne doivent jamais
    l'etre."""

    class _ConfigEntriesFactice:
        appels: list[tuple[str, tuple, dict]] = []

        def _async_update_entry(self, *args, **kwargs):
            self.appels.append(("_async_update_entry", args, kwargs))

        def async_add_subentry(self, *args, **kwargs):
            raise AssertionError("importer_ecrans ne doit jamais appeler async_add_subentry")

        def async_remove_subentry(self, *args, **kwargs):
            raise AssertionError("importer_ecrans ne doit jamais appeler async_remove_subentry")

    class _HassFactice:
        config_entries = _ConfigEntriesFactice()

    ecrans = [
        ("Un", {
            "nom": "Un", "temperature": "sensor.t",
            "ambiances": [], "commandes": [], "extrasMaison": [],
            "synthese": [], "sources": [], "ouvrants": [],
        }),
        ("Deux", {
            "nom": "Deux", "temperature": "sensor.t",
            "ambiances": [], "commandes": [], "extrasMaison": [],
            "synthese": [], "sources": [], "ouvrants": [],
        }),
    ]

    garde_ecran.importer_ecrans(hass=_HassFactice(), entry=object(), ecrans=ecrans)

    appels = _HassFactice.config_entries.appels
    assert len(appels) == 1, f"attendu UNE seule ecriture, obtenu {len(appels)}"
    _nom_appel, _args, kwargs = appels[0]
    assert len(kwargs["subentries"]) == 2


def test_importer_ecrans_persiste_la_valeur_VALIDEE_pas_le_brut_normalise():
    """Relecture finale de branche (deuxieme ronde) : `importer_ecrans`
    appelait `schema.valider(screen_data)` puis JETAIT sa valeur de retour,
    persistant `screen_data` (le brut, seulement normalise `version`/`nom` par
    CE module) -- jamais la version que `schema.valider` valide ET
    NORMALISE (`_trie()` sur `modulateurs`, schema.py). Mesure : un import
    dont `modulateurs` n'est pas trie ecrivait ce desordre tel quel dans
    `entry.subentries`, alors que le MEME ecran cree/modifie par le
    formulaire aurait toujours porte la version triee (`schema.AGENCEMENT`
    y est deja rejoue avant persistance) -- une asymetrie qui fabrique
    exactement le bruit d'export que `_trie()` existe pour supprimer :
    importer les trois ecrans reels puis rouvrir "Blocs et modes" sans
    rien changer suffisait a faire bouger `modulateurs` au prochain
    export."""

    class _ConfigEntriesFactice:
        appels: list[tuple[str, tuple, dict]] = []

        def _async_update_entry(self, *args, **kwargs):
            self.appels.append(("_async_update_entry", args, kwargs))

    class _HassFactice:
        config_entries = _ConfigEntriesFactice()

    ecrans = [
        ("Salon", {
            "nom": "Salon", "temperature": "sensor.t",
            "ambiances": [], "commandes": [], "extrasMaison": [],
            "synthese": [], "sources": [], "ouvrants": [],
            "agencement": {
                "zones": ["commandes"], "modes": ["defaut"],
                "modulateurs": ["invites", "chaleur"],
            },
        }),
    ]

    garde_ecran.importer_ecrans(hass=_HassFactice(), entry=object(), ecrans=ecrans)

    appels = _HassFactice.config_entries.appels
    (sous_entree,) = appels[0][2]["subentries"].values()
    assert sous_entree.data["agencement"]["modulateurs"] == ["chaleur", "invites"], (
        "importer_ecrans doit persister modulateurs TRIE (la valeur que "
        "schema.valider rend), pas l'ordre brut soumis dans le fichier")


def test_importer_ecrans_persiste_le_nom_STRIPPE_pas_le_brut():
    """Relecture finale de branche (deuxieme ronde) : la moitie « avant
    l'ecriture » du strip de `nom` n'etait gardee par AUCUN test --
    `test_importer_deux_ecrans_homonymes_APRES_ESPACES_est_REFUSE`
    (test_services_import_refus.py) ne garde que le calcul des DOUBLONS
    (deux ecrans "Salon"/"Salon " ensemble). Une mutation qui stripperait
    `nom` pour CE calcul seul, en persistant le `nom` BRUT ensuite
    (`ecrans_normalises.append((titre, {**screen_data, "nom": brut}))`, par
    exemple), laissait cette suite-la verte : un SEUL ecran nomme "Salon "
    n'a pas de doublon a detecter, et rien ne verifiait la valeur
    REELLEMENT persistee. Sans ce test, un tel ecran deviendrait
    DEFINITIVEMENT inatteignable par le transport (`websocket.py` resout
    par egalite EXACTE de `nom`, jamais strippe cote lecture)."""

    class _ConfigEntriesFactice:
        appels: list[tuple[str, tuple, dict]] = []

        def _async_update_entry(self, *args, **kwargs):
            self.appels.append(("_async_update_entry", args, kwargs))

    class _HassFactice:
        config_entries = _ConfigEntriesFactice()

    ecrans = [
        ("Salon", {
            "nom": "  Salon  ", "temperature": "sensor.t",
            "ambiances": [], "commandes": [], "extrasMaison": [],
            "synthese": [], "sources": [], "ouvrants": [],
        }),
    ]

    garde_ecran.importer_ecrans(hass=_HassFactice(), entry=object(), ecrans=ecrans)

    appels = _HassFactice.config_entries.appels
    (sous_entree,) = appels[0][2]["subentries"].values()
    assert sous_entree.data["nom"] == "Salon", (
        f"nom persiste {sous_entree.data['nom']!r} -- attendu 'Salon', strippe")
