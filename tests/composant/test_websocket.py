"""Le transport (`websocket.py` + l'ecouteur de `__init__.py`) : les deux
commandes websocket, et l'evenement de changement.

Ronde 1 de relecture : les valeurs de fil (`WS_ECRAN`, `WS_ECRANS`, les
codes d'erreur, `EVENEMENT_CHANGEMENT`) sont un CONTRAT PUBLIE vers
`app/src/` (TypeScript, qui ne peut pas importer `const.py`). Un test qui
les compare a la CONSTANTE Python elle-meme est tautologique : renommer la
constante ne le ferait jamais tomber, puisque le code de production et
l'assertion suivraient le meme renommage ensemble. Ce fichier ecrit donc
ces valeurs EN DUR (jamais importees de `const`), pour qu'un renommage cote
Python fasse tomber CE fichier -- exactement ce que `const.py:30-34`
applique deja aux codes de formulaire (via le JSON de traductions, qui sert
la meme fonction d'ancre independante). `VERSION_CONFIG` reste importee :
ce n'est pas une epellation de protocole, seulement une valeur de
round-trip interne a Python."""
from conftest import IDENTITE_MINIMALE, _creer_ecran, _init_reconfigure
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.home_desk.const import DOMAIN, VERSION_CONFIG


def _subentry(hass, entry_id: str):
    entry = hass.config_entries.async_get_entry(entry_id)
    return entry, next(iter(entry.subentries.values()))


def _subentry_id_par_nom(hass, entry_id: str, nom: str) -> str:
    """`_creer_ecran` rend `next(iter(entry.subentries))` -- correct pour
    UN ecran, mais retombe sur le PREMIER cree des qu'un second existe
    deja. Les decors a DEUX ecrans de ce fichier retrouvent donc l'id
    REEL par son `nom` plutot que de faire confiance a cette valeur de
    retour."""
    entry = hass.config_entries.async_get_entry(entry_id)
    for subentry_id, sous_entree in entry.subentries.items():
        if sous_entree.data.get("nom") == nom:
            return subentry_id
    raise AssertionError(f"aucune sous-entree nommee {nom!r}")


# ---------------------------------------------------------------------------
# Chemin heureux et liste -- le decor que les comportements suivants exploitent
# ---------------------------------------------------------------------------


async def test_ecran_rend_la_configuration_validee(hass, ws_client, entree_peuplee):
    """Le chemin heureux, pour memoire : `home_desk/ecran` rend l'ecran
    RESOLU par `schema.valider()`, `version` comprise, avec les quatre
    tuiles de commande posees par `entree_peuplee`."""
    await ws_client.send_json_auto_id({"type": "home_desk/ecran", "nom": "Salon d essai"})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is True
    ecran = reponse["result"]
    assert ecran["nom"] == "Salon d essai"
    assert ecran["version"] == VERSION_CONFIG
    assert [c["libelle"] for c in ecran["commandes"]] == [
        "Lampe salon", "Volet salon", "Porte garage", "Prise TV",
    ]


async def test_ecrans_rend_la_liste_pour_la_premiere_degradation(hass, ws_client, entree_peuplee):
    """Sans cette commande, `?ecran=` absent n'a d'autre issue qu'un mur
    blanc ou un ecran devine. Les deux sont interdits (spec, decision 10)."""
    await ws_client.send_json_auto_id({"type": "home_desk/ecrans"})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is True
    assert reponse["result"] == [{"nom": "Salon d essai", "titre": "Salon d essai"}]


async def test_ecrans_distingue_le_titre_du_nom(hass, ws_client, entree):
    """Mineur (ronde 1) : `titre` (`ConfigSubentry.title`, renommable par le
    geste GENERIQUE de Home Assistant, independamment de `nom`) et `nom`
    (la donnee saisie) sont deux champs distincts -- un decor ou ils
    coincident TOUJOURS ne distingue pas une commande qui renvoie `nom`
    deux fois d'une qui lit vraiment les deux champs separement."""
    await _creer_ecran(hass, entree, nom="salon")
    entry, subentry = _subentry(hass, entree.entry_id)
    hass.config_entries.async_update_subentry(entry, subentry, title="Salon (etage)")

    await ws_client.send_json_auto_id({"type": "home_desk/ecrans"})
    reponse = await ws_client.receive_json()
    assert reponse["result"] == [{"nom": "salon", "titre": "Salon (etage)"}]


async def test_ecrans_rend_les_deux_lignes_meme_si_l_une_est_corrompue(hass, ws_client, entree):
    """Ronde 2 de relecture : la regle « `home_desk/ecrans` ne revalide
    JAMAIS » etait affirmee trois fois (docstring de module, docstring de
    `ws_ecrans`, rapport de tache) mais gardee par AUCUN test -- corrige
    ici. Decor a DEUX ecrans, l'un d'eux prive de plusieurs champs
    RACINE requis (`temperature`, `commandes`, `sources`...) -- un ecran
    que `schema.valider()` refuserait net. `ws_ecrans` ne l'appelle
    jamais : les DEUX lignes doivent rester, le corrompu inclus, pour que
    la PREMIERE degradation (le selecteur d'ecran) reste utilisable meme
    quand un ecran est casse."""
    await _creer_ecran(hass, entree, nom="salon")
    await _creer_ecran(hass, entree, nom="cuisine")
    cuisine_id = _subentry_id_par_nom(hass, entree.entry_id, "cuisine")
    entry, _ = _subentry(hass, entree.entry_id)
    subentry_corrompue = entry.subentries[cuisine_id]
    hass.config_entries.async_update_subentry(
        entry, subentry_corrompue, data={"nom": "cuisine"}
    )

    await ws_client.send_json_auto_id({"type": "home_desk/ecrans"})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is True
    assert reponse["result"] == [
        {"nom": "salon", "titre": "salon"},
        {"nom": "cuisine", "titre": "cuisine"},
    ]


# ---------------------------------------------------------------------------
# Les trois refus nommes -- ceux qui comptent vraiment (brief, tache 8)
# ---------------------------------------------------------------------------


async def test_un_nom_inconnu_rend_une_ERREUR_NOMMEE_pas_un_objet_vide(hass, ws_client, entree_peuplee):
    """Un objet vide serait un ecran sans tuiles : l'application le rendrait
    sans savoir qu'elle rend une absence. L'erreur doit se distinguer --
    et le decor (un ecran REEL, nomme differemment) prouve que ce n'est
    pas juste « aucun ecran configure » qui est detecte ici."""
    await ws_client.send_json_auto_id({"type": "home_desk/ecran", "nom": "cuisine"})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is False
    assert reponse["error"]["code"] == "not_found"
    assert "cuisine" in reponse["error"]["message"]


async def test_une_version_FUTURE_est_REFUSEE_a_la_lecture(hass, ws_client, entree):
    """La quatrieme degradation, cote composant. Une sous-entree ecrite par
    une version FUTURE du composant ne doit pas etre servie a moitie :
    refus net.

    C'est la dette n.3 leguee par le plan 2 -- `version` n'etait ni requis
    ni lu. Elle est refermee ici : posee a l'ECRITURE par le flow, verifiee
    a la LECTURE par le transport. La mutation directe de `subentry.data`
    (plutot qu'un chemin du flow, qui n'accepte que VERSION_CONFIG) simule
    les TROIS portes qui ne passent pas par le formulaire : sauvegarde
    restauree, import direct, ou -- ici -- une version future du composant
    qui aurait ecrit une forme que celle-ci ne reconnait pas encore.

    Ronde 1 de relecture (Mineur M14) : la moitie « quelle version » du
    message n'etait epinglee par rien, alors que la moitie symetrique de
    `not_found` l'est (le `nom` dans son message) -- corrige ici."""
    await _creer_ecran(hass, entree)
    entry, subentry = _subentry(hass, entree.entry_id)
    version_future = VERSION_CONFIG + 1
    hass.config_entries.async_update_subentry(
        entry, subentry, data={**subentry.data, "version": version_future}
    )

    await ws_client.send_json_auto_id({"type": "home_desk/ecran", "nom": IDENTITE_MINIMALE["nom"]})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is False
    assert reponse["error"]["code"] == "version_inconnue"
    assert str(version_future) in reponse["error"]["message"]


async def test_une_version_INFERIEURE_est_aussi_refusee(hass, ws_client, entree):
    """Ronde 1 de relecture (Mineur M11) : un controle `<= VERSION_CONFIG`
    (au lieu de `!=`) passait inapercu, faute d'un decor avec une version
    STRICTEMENT inferieure. TOUTE version differente doit etre refusee, pas
    seulement les superieures -- la version 1, elle, est reecrite au
    chargement par `migration.py` (test_migration_v2.py) avant toute
    lecture ; 0 n'a jamais existe."""
    await _creer_ecran(hass, entree)
    entry, subentry = _subentry(hass, entree.entry_id)
    hass.config_entries.async_update_subentry(entry, subentry, data={**subentry.data, "version": 0})

    await ws_client.send_json_auto_id({"type": "home_desk/ecran", "nom": IDENTITE_MINIMALE["nom"]})
    reponse = await ws_client.receive_json()
    assert reponse["error"]["code"] == "version_inconnue"


async def test_une_version_ABSENTE_recoit_un_message_different_de_mettez_a_jour(hass, ws_client, entree):
    """Mineur (ronde 1) : une sous-entree SANS `version` du tout (jamais
    ecrite par ce composant -- anterieure au suivi de version) recevait le
    MEME message qu'une version future, « mettez a jour l'integration » --
    un geste INUTILE, l'integration etant deja plus recente que la
    donnee. Bouton mort en prose ; le message doit distinguer les deux
    cas."""
    await _creer_ecran(hass, entree)
    entry, subentry = _subentry(hass, entree.entry_id)
    donnees_sans_version = {k: v for k, v in subentry.data.items() if k != "version"}
    hass.config_entries.async_update_subentry(entry, subentry, data=donnees_sans_version)

    await ws_client.send_json_auto_id({"type": "home_desk/ecran", "nom": IDENTITE_MINIMALE["nom"]})
    reponse = await ws_client.receive_json()

    assert reponse["error"]["code"] == "version_inconnue"
    assert "mettez a jour" not in reponse["error"]["message"].lower()


async def test_une_sous_entree_de_version_connue_mais_de_donnees_invalides_est_ECRAN_CORROMPU(hass, ws_client, entree):
    """Le CRITIQUE de la ronde 1 : retirer `schema.valider()` de `_resoudre`
    tout en GARDANT le controle de version laissait 161/161 tests verts --
    ce test echoue precisement sur CE mutant precis (`assert reponse[
    "success"] is False` tombe, puisque la sous-entree corrompue serait
    servie telle quelle).

    Distinct de `version_inconnue` (ronde 1, Point 4) : ICI la version est
    CONNUE, seules les DONNEES ne respectent plus le contrat -- un
    troisieme chemin (sauvegarde restauree, import direct) qui ne passe
    pas par le formulaire. Avant cette correction, ce cas et une requete
    CLIENTE malformee (`nom` absent du message websocket) rendaient tous
    deux `{"code": "invalid_format", ...}` : indiscernables pour
    `app/src/`."""
    await _creer_ecran(hass, entree)
    entry, subentry = _subentry(hass, entree.entry_id)
    donnees_corrompues = {k: v for k, v in subentry.data.items() if k != "sources"}
    hass.config_entries.async_update_subentry(entry, subentry, data=donnees_corrompues)

    await ws_client.send_json_auto_id({"type": "home_desk/ecran", "nom": IDENTITE_MINIMALE["nom"]})
    reponse = await ws_client.receive_json()

    assert reponse["success"] is False
    assert reponse["error"]["code"] == "ecran_corrompu"
    assert reponse["error"]["code"] != "invalid_format"
    assert "sources" in reponse["error"]["message"]


async def test_l_integration_retiree_ne_crashe_pas_le_transport(hass, ws_client, entree_peuplee):
    """Ronde 1 de relecture (Important) : rien ne desenregistre les
    commandes websocket a `async_unload_entry` (Home Assistant n'offre pas
    de contraire a `async_register_command`). Si l'entree unique disparait
    ensuite (retrait de l'integration), un `IndexError` non rattrape
    crashait `home_desk/ecrans` (`unknown_error` cote client) exactement
    dans le cas que la DEUXIEME degradation (spec) doit couvrir sans
    accroc : HA joignable, aucun ecran configure."""
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    await hass.config_entries.async_remove(entry.entry_id)

    await ws_client.send_json_auto_id({"type": "home_desk/ecrans"})
    reponse = await ws_client.receive_json()
    assert reponse["success"] is True
    assert reponse["result"] == []

    await ws_client.send_json_auto_id({"type": "home_desk/ecran", "nom": "Salon d essai"})
    reponse = await ws_client.receive_json()
    assert reponse["success"] is False
    assert reponse["error"]["code"] == "not_found"


# ---------------------------------------------------------------------------
# L'evenement de changement -- decor a DEUX ecrans (ronde 1 de relecture) :
# un decor a un seul ecran ne distingue jamais « tous » de « celui qui change »
# ---------------------------------------------------------------------------


async def test_ecrire_une_sous_entree_emet_l_evenement_avec_le_NOM(hass, entree):
    """La charge utile porte le nom de l'ecran, pas un simple signal : les
    trois tablettes ecoutent le meme bus, et deux d'entre elles n'ont
    aucune raison de se recharger parce que la troisieme a change."""
    evenements = async_capture_events(hass, "home_desk_config_changed")

    await _creer_ecran(hass, entree, nom="salon d essai")
    await hass.async_block_till_done()

    assert len(evenements) == 1
    assert evenements[0].data == {"nom": "salon d essai"}


async def test_seul_l_ecran_modifie_emet_un_evenement(hass, entree):
    """Decor a DEUX ecrans : modifier le second (ajouter une tuile) ne doit
    emettre l'evenement QUE pour lui, jamais pour le premier, inchange --
    un decor a un seul ecran ne distinguerait pas « toutes » de « celle qui
    change »."""
    await _creer_ecran(hass, entree, nom="salon")
    await _creer_ecran(hass, entree, nom="cuisine")
    second_id = _subentry_id_par_nom(hass, entree.entry_id, "cuisine")
    evenements = async_capture_events(hass, "home_desk_config_changed")

    flow = await _init_reconfigure(hass, entree, second_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "commandes"})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"nouveau": True})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"libelle": "Lampe test", "icone": "bulb", "entite": "light.test"})
    await hass.async_block_till_done()

    assert [e.data for e in evenements] == [{"nom": "cuisine"}]


async def test_renommer_un_ecran_emet_l_ANCIEN_nom_ET_le_nouveau(hass, entree):
    """Ronde 1 de relecture (Important) : le geste le plus ordinaire qui
    soit -- RENOMMER -- rendait orphelin le nom precedent : l'evenement ne
    portait que le nom APRES, donc une tablette qui affichait encore
    l'ANCIEN nom n'entendait rien, et sa prochaine requete recevrait
    `not_found` sans avoir jamais ete avertie de recharger."""
    subentry_id = await _creer_ecran(hass, entree, nom="salon")
    evenements = async_capture_events(hass, "home_desk_config_changed")

    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "identite"})
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {**IDENTITE_MINIMALE, "nom": "salon renomme"})
    await hass.async_block_till_done()

    assert {e.data["nom"] for e in evenements} == {"salon", "salon renomme"}


async def test_l_instantane_initial_evite_un_faux_positif_au_redemarrage(hass, entree):
    """Documente dans `__init__.py` : l'instantane est capture a l'etat
    COURANT de `entry.subentries`, jamais a `{}` -- sans ce point de
    depart, un redemarrage de Home Assistant (decharge puis recharge
    l'entree, l'ecouteur est repose) sur une sous-entree DEJA existante et
    INCHANGEE serait vu a tort comme un changement des la PREMIERE
    ecriture suivante, meme sur une AUTRE sous-entree."""
    await _creer_ecran(hass, entree, nom="salon")
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    evenements = async_capture_events(hass, "home_desk_config_changed")
    await _creer_ecran(hass, entree, nom="cuisine")
    await hass.async_block_till_done()

    assert [e.data for e in evenements] == [{"nom": "cuisine"}]


async def test_supprimer_un_ecran_emet_son_ANCIEN_nom(hass, entree):
    """Meme angle mort que le renommage, pour la SUPPRESSION : une
    sous-entree retiree disparait de `entry.subentries`, donc une boucle
    qui ne visite QUE les sous-entrees PRESENTES ne l'aurait jamais vue.

    Ronde 2 de relecture : decor a DEUX ecrans (la meme pauvrete que le
    relecteur venait de corriger sur le test voisin) -- supprimer
    "cuisine" ne doit emettre QUE son nom, jamais celui de "salon",
    inchange."""
    await _creer_ecran(hass, entree, nom="salon")
    await _creer_ecran(hass, entree, nom="cuisine")
    cuisine_id = _subentry_id_par_nom(hass, entree.entry_id, "cuisine")
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    evenements = async_capture_events(hass, "home_desk_config_changed")

    hass.config_entries.async_remove_subentry(entry, cuisine_id)
    await hass.async_block_till_done()

    assert [e.data for e in evenements] == [{"nom": "cuisine"}]


async def test_l_instantane_est_purge_a_la_suppression(hass, entree):
    """Ronde 2 de relecture (Important) : sans le `.pop(subentry_id)` de la
    premiere passe, un nom SUPPRIME resterait dans l'instantane pour
    toujours -- il redeviendrait `donnees_avant is None` a chaque
    comparaison future, donc CHAQUE ecriture suivante sur N'IMPORTE QUEL
    autre ecran reemettrait ce nom mort, indefiniment. Pas de l'hygiene
    memoire : un invariant du bus. Decor a deux ecrans : supprimer
    "cuisine" puis modifier "salon" ne doit jamais reemettre "cuisine"."""
    await _creer_ecran(hass, entree, nom="salon")
    await _creer_ecran(hass, entree, nom="cuisine")
    cuisine_id = _subentry_id_par_nom(hass, entree.entry_id, "cuisine")
    entry = hass.config_entries.async_get_entry(entree.entry_id)
    hass.config_entries.async_remove_subentry(entry, cuisine_id)
    await hass.async_block_till_done()

    evenements = async_capture_events(hass, "home_desk_config_changed")
    salon_id = _subentry_id_par_nom(hass, entree.entry_id, "salon")
    subentry_salon = entry.subentries[salon_id]
    hass.config_entries.async_update_subentry(
        entry, subentry_salon, data={**subentry_salon.data, "note": "une note"}
    )
    await hass.async_block_till_done()

    assert [e.data for e in evenements] == [{"nom": "salon"}]


async def test_renommer_le_seul_titre_emet_aussi_l_evenement(hass, entree):
    """Ronde 2 de relecture (Mineur) : `titre` est devenu un champ de FIL
    (ronde 1, `test_ecrans_distingue_le_titre_du_nom`) sans que l'ecouteur
    ne le surveille -- renommer SEULEMENT le titre (le geste GENERIQUE de
    Home Assistant, `data` inchangee) n'emettait rien, et une tablette
    aurait affiche un titre perime indefiniment."""
    await _creer_ecran(hass, entree, nom="salon")
    entry, subentry = _subentry(hass, entree.entry_id)
    evenements = async_capture_events(hass, "home_desk_config_changed")

    hass.config_entries.async_update_subentry(entry, subentry, title="Salon (etage)")
    await hass.async_block_till_done()

    assert [e.data for e in evenements] == [{"nom": "salon"}]
