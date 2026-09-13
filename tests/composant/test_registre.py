"""Le registre d'entites : ce que le formulaire sait dire d'une entite qu'il
ne connait pas."""
from homeassistant.helpers import entity_registry as er

from custom_components.home_desk.registre import entites_dans, entites_inconnues


async def test_une_entite_absente_du_registre_donne_un_AVERTISSEMENT_jamais_un_refus(hass):
    """Decision 7 de la spec, jamais tenue jusqu'ici.

    Mesure de la relecture finale du plan 3a : `light.nexiste_absolument_pas`
    etait accepte avec `errors={}` ET `description_placeholders={}` -- du
    SILENCE, pas un avertissement. Or une entite peut arriver plus tard
    (ampoule pas encore appairee), donc refuser serait faux ; ne rien dire
    laisse une faute de frappe produire une tuile morte que personne ne
    relie jamais a sa cause.
    """
    inconnues = entites_inconnues(hass, ["light.nexiste_absolument_pas"])
    assert inconnues == ["light.nexiste_absolument_pas"]


async def test_une_entite_presente_au_registre_ne_produit_aucun_avertissement(hass):
    # `tests/composant/conftest.py` n'offre AUCUNE fixture de registre (verifie) :
    # on passe par l'aide standard de Home Assistant.
    registre = er.async_get(hass)
    registre.async_get_or_create("light", "demo", "unique1",
                                 suggested_object_id="salon")
    assert entites_inconnues(hass, ["light.salon"]) == []


async def test_le_decor_a_DEUX_entites_distingue_la_connue_de_l_inconnue(hass):
    """Leçon 3 : avec une seule entite au decor, une implementation qui
    rendrait TOUJOURS la liste complete -- ou TOUJOURS vide -- passerait."""
    registre = er.async_get(hass)
    registre.async_get_or_create("light", "demo", "u1", suggested_object_id="salon")
    assert entites_inconnues(hass, ["light.salon", "light.grenier"]) == ["light.grenier"]


async def test_entites_inconnues_preserve_l_ordre_de_saisie(hass):
    """Le message les cite dans l'ordre ou l'utilisateur les a tapees, jamais
    dans un ordre de hachage qui changerait d'une saisie a l'autre -- un
    avertissement dont le texte bouge tout seul se fait ignorer."""
    entites = ["light.zzz", "light.aaa", "light.mmm"]
    assert entites_inconnues(hass, entites) == entites


async def test_une_entite_connue_de_l_ETAT_mais_absente_du_registre_n_avertit_pas(hass):
    """Un `input_*` cree en YAML ou une entite de template repond sans etre au
    registre. Avertir sur une entite qui repond DEJA serait un avertissement
    faux -- et un avertissement faux se fait ignorer, ce qui tue aussi les
    vrais."""
    hass.states.async_set("sensor.template_maison", "21.5")
    assert entites_inconnues(hass, ["sensor.template_maison"]) == []


# ---------------------------------------------------------------------------
# `entites_dans` : l'extraction DERIVEE DU CONTRAT (ronde de correction 1,
# defaut A) qui rend le cablage possible dans le squelette des sections
# (`listes.py`) SANS deviner par la FORME ce que le contrat DIT -- un champ
# de texte libre dont la valeur ressemble a un `entity_id` (`libelle:
# "tv.salon"`, `lien: "media_player.html"`) ne doit JAMAIS etre cite.
# ---------------------------------------------------------------------------


def test_entites_dans_recurse_dans_un_dict_et_une_liste():
    """Decor a DEUX formes (`entite` scalaire, `titre` une LISTE) : une
    implementation qui ne recurserait que dans les dicts, jamais les listes,
    manquerait les six champs multi-entites de `sources`."""
    candidat = {
        "libelle": "Portail",
        "entite": "cover.portail",
        "titre": ["sensor.titre_1", "sensor.titre_2"],
    }
    assert set(entites_dans(candidat)) == {
        "cover.portail", "sensor.titre_1", "sensor.titre_2",
    }


def test_entites_dans_ignore_le_texte_libre_meme_en_forme_d_entity_id():
    """LE test du defaut A : un decor RICHE, tout ensemble -- une entite,
    et trois champs de texte libre dont la valeur A LA FORME d'un
    `entity_id`. Seule la vraie entite doit ressortir."""
    candidat = {
        "entite": "light.salon",
        "libelle": "tv.salon",
        "lien": "media_player.html",
        "note": "reglages.avances",
    }
    assert entites_dans(candidat) == ["light.salon"]


def test_entites_dans_descend_dans_un_champ_imbrique_sans_cle_reconnue():
    """`allumee` ($defs/source) n'est lui-meme PAS `$ref: entite` -- un objet
    imbrique qui porte `entite` dedans. Sans la descente inconditionnelle
    sous une cle non reconnue, `allumee.entite` serait invisible."""
    candidat = {"allumee": {"entite": "input_boolean.presence", "etats": ["on"]}}
    assert entites_dans(candidat) == ["input_boolean.presence"]


def test_entites_dans_pour_une_section_a_element_nu_traite_la_valeur_comme_l_entite():
    """`ouvrants`/`listesTachesExtra` : l'element EST l'entite, une chaine
    NUE sans cle autour -- `cle` porte l'information que la FORME ne peut
    pas donner."""
    assert entites_dans("binary_sensor.porte", cle="ouvrants") == ["binary_sensor.porte"]
    assert entites_dans("todo.taches", cle="listesTachesExtra") == ["todo.taches"]


def test_entites_dans_sans_cle_reconnue_ignore_une_chaine_nue():
    """Le pendant negatif : une chaine nue d'une section dont l'element
    N'EST PAS une entite au contrat (`etiquettesMinuteur`, un simple
    libelle) ne doit jamais etre traitee comme telle."""
    assert entites_dans("light.salon") == []
    assert entites_dans("Pates", cle="etiquettesMinuteur") == []
