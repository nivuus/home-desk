"""Le MECANISME de `yaml_ecrans.py` (le format d'export/import, note en
commentaires), teste directement -- sans service HA, sans `hass`. Les tests
DE BOUT EN BOUT (le service, l'aller-retour complet) vivent dans
`test_services.py` ; ce fichier tient ce qui peut se prouver sans lui.

Ronde 1 de relecture (tache 9) : deplace ICI depuis `test_services.py`
(qui depassait 500 lignes) -- un seam reel, pas arbitraire : ce fichier ne
connait que `yaml_ecrans`, jamais `hass`/`DOMAIN`/les services."""
import pytest

from custom_components.home_desk import yaml_ecrans

_ECRAN_MINIMAL_TEXTE = (
    "ecrans:\n"
    "- titre: Salon\n"
    "  nom: Salon\n"
    "  temperature: sensor.t\n"
    "  ambiances: []\n"
    "  commandes: []\n"
    "  extrasMaison: []\n"
    "  synthese: []\n"
    "  sources: []\n"
    "  ouvrants: []\n"
)


# ---------------------------------------------------------------------------
# `lire` -- les refus de forme (Mineur, ronde 1 de relecture : "rendre []
# au lieu de lever laisse tout vert -- un fichier hors sujet effacerait
# alors toute la configuration sans un mot"). Testes ICI sur le MECANISME,
# en plus de `test_importer_un_fichier_hors_sujet_REFUSE_sans_rien_effacer`
# (test_services.py) qui les eprouve par le service.
# ---------------------------------------------------------------------------


def test_lire_un_fichier_vide_LEVE():
    with pytest.raises(ValueError):
        yaml_ecrans.lire("")


def test_lire_sans_cle_ecrans_LEVE():
    with pytest.raises(ValueError):
        yaml_ecrans.lire("autre_chose: 1\n")


def test_lire_quand_ecrans_n_est_pas_une_liste_LEVE():
    with pytest.raises(ValueError):
        yaml_ecrans.lire("ecrans: 42\n")


def test_lire_quand_un_element_d_ecrans_n_est_pas_un_mapping_LEVE():
    with pytest.raises(ValueError):
        yaml_ecrans.lire("ecrans:\n- 1\n- 2\n")


# ---------------------------------------------------------------------------
# Le commentaire ORPHELIN (ronde 1 de relecture, point 3 du Critique) :
# `_construire` (yaml_ecrans.py) n'attribue une note qu'a la colonne EXACTE
# du bloc qu'il annote, jamais a la seule LIGNE du dessus.
# ---------------------------------------------------------------------------


def test_un_commentaire_au_dessus_d_ecrans_est_ignore():
    texte = "# En-tete orpheline\n" + _ECRAN_MINIMAL_TEXTE
    assert yaml_ecrans.lire(texte)[0].get("note") is None


def test_un_commentaire_au_milieu_des_champs_est_ignore():
    texte = _ECRAN_MINIMAL_TEXTE.replace(
        "  temperature: sensor.t\n", "  # milieu orpheline\n  temperature: sensor.t\n")
    assert yaml_ecrans.lire(texte)[0].get("note") is None


def test_un_commentaire_entre_ecrans_et_le_premier_tiret_est_ignore():
    """Le cas mesure par la relecture : ce commentaire satisfait « juste
    au-dessus » (la regle d'une version precedente) sans satisfaire « a la
    bonne colonne » (la regle actuelle) -- sans cette seconde regle, il
    devenait une note RACINE INVENTEE sur le premier ecran."""
    texte = "ecrans:\n# entre les deux\n" + _ECRAN_MINIMAL_TEXTE[len("ecrans:\n"):]
    assert yaml_ecrans.lire(texte)[0].get("note") is None
