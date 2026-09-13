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
# `entites_dans` : descend dans la VALEUR et dans le SOUS-SCHEMA du contrat,
# EN PARALLELE (ronde de correction 2) -- jamais la FORME d'une chaine
# (defaut A, ronde 1), jamais un ENSEMBLE DE NOMS deconnecte du CHEMIN
# (reserve 1, ronde 1) : `nom` est une entite dans `minuteurs[]`, du texte
# libre a la racine et dans `$defs/source`, et seul le sous-schema associe
# au chemin le sait.
# ---------------------------------------------------------------------------


def test_entites_dans_reconnait_les_deux_champs_entite_d_une_tuile():
    """`$defs/bouton` : `entite` et `cible` sont des entites, `libelle` du
    texte libre -- meme quand il A LA FORME d'une entite (defaut A)."""
    candidat = {
        "libelle": "tv.salon", "icone": "bulb",
        "entite": "light.salon", "cible": "switch.garage",
    }
    assert set(entites_dans(candidat, "commandes")) == {"light.salon", "switch.garage"}


def test_entites_dans_LE_TEST_DE_LA_COLLISION_nom_entite_ou_texte_libre():
    """LE test qui distingue cette correction de la precedente (reserve 1,
    ronde 2) : `nom` est une entite dans `minuteurs[]`, du texte libre dans
    `sources[]`. Un ENSEMBLE PLAT de noms ne peut pas porter cette
    difference -- seul le sous-schema associe au CHEMIN le peut. Si ce test
    passe, la correction est structurellement juste ; s'il tombe, c'est
    qu'un ensemble de noms est revenu."""
    source = {
        "nom": "salon.spotify",  # texte libre, la FORME trompe
        "titre": ["sensor.nexiste_pas"],
        "sousTitre": [], "affiche": [], "progression": [], "transport": [], "volume": [],
    }
    assert entites_dans(source, "sources") == ["sensor.nexiste_pas"]

    minuteur = {"timer": "timer.cuisine", "nom": "input_text.minuteur_nom"}
    assert set(entites_dans(minuteur, "minuteurs")) == {
        "timer.cuisine", "input_text.minuteur_nom",
    }


def test_entites_dans_descend_dans_allumee_un_objet_imbrique_de_source():
    """`allumee` ($defs/source) n'est lui-meme PAS `$ref: entite` -- un objet
    imbrique dont SEULE la cle `entite` en est une ; `etats` (une liste de
    chaines simples au contrat) n'en est pas."""
    source = {
        "nom": "Radio", "titre": [], "sousTitre": [], "affiche": [],
        "progression": [], "transport": [], "volume": [],
        "allumee": {"entite": "input_boolean.presence", "etats": ["on", "playing"]},
    }
    assert entites_dans(source, "sources") == ["input_boolean.presence"]


def test_entites_dans_pour_une_section_a_element_nu_traite_la_valeur_comme_l_entite():
    """`ouvrants`/`listesTachesExtra` : leur `items` EST `$ref: entite` --
    l'element nu (une chaine SANS cle autour) est donc collecte SANS cas
    particulier, la MEME descente que pour un dict."""
    assert entites_dans("binary_sensor.porte", "ouvrants") == ["binary_sensor.porte"]
    assert entites_dans("todo.taches", "listesTachesExtra") == ["todo.taches"]


def test_entites_dans_une_chaine_nue_hors_d_une_section_a_entite_ne_rend_rien():
    """Le pendant negatif : `etiquettesMinuteur` a aussi un element NU, mais
    son `items` est `{"type": "string"}` au contrat -- jamais une entite,
    meme si la chaine EN A LA FORME."""
    assert entites_dans("light.salon", "etiquettesMinuteur") == []
