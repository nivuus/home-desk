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


# ---------------------------------------------------------------------------
# Ronde 2 de relecture : deux regles ecrites avec une sonde jetable et une
# phrase de docstring, jamais un test -- fermees ici.
# ---------------------------------------------------------------------------


def _ecran_avec_note_de_commande(note: str) -> dict:
    return {
        "titre": "Salon", "nom": "Salon", "temperature": "sensor.t",
        "ambiances": [], "commandes": [
            {"libelle": "Porte", "icone": "porte", "entite": "lock.garage", "note": note},
        ],
        "extrasMaison": [], "synthese": [], "sources": [], "ouvrants": [],
    }


def test_une_note_avec_espaces_de_tete_ou_de_queue_survit_a_l_aller_retour():
    """`_lignes_commentaires` ne retire que l'UNIQUE espace separateur que
    `rendre` insere lui-meme apres "#", jamais davantage -- remettre un
    `.strip()` du contenu entier laisse la suite verte (rien ne
    l'exercait), mais perdrait silencieusement les espaces de tete/queue
    d'une note editee a la main ou saisie ainsi."""
    ecran = _ecran_avec_note_de_commande("  espaces de tete et de queue  ")
    texte = yaml_ecrans.rendre([ecran])
    assert yaml_ecrans.lire(texte) == [ecran]


def test_une_note_multiligne_est_aplatie_pas_perdue_ni_cassee():
    """LIMITE CONNUE assumee (voir la docstring de module) : un saut de
    ligne dans une note devient un espace -- ne pas l'aplatir romprait le
    format (« un commentaire, une ligne », dont `lire` depend pour se
    relire lui-meme) ; retirer l'aplatissement sans rien y substituer
    laisse la suite verte (rien ne l'exercait), mais casserait le YAML
    produit ou perdrait la note selon comment. Gardee ici meme si aucun
    ecran reel de ce depot ne porte de note multiligne aujourd'hui."""
    ecran = _ecran_avec_note_de_commande("premiere ligne\nseconde ligne")
    texte = yaml_ecrans.rendre([ecran])
    resultat = yaml_ecrans.lire(texte)
    assert resultat[0]["commandes"][0]["note"] == "premiere ligne seconde ligne"


def test_une_note_multiligne_jointe_survit_a_l_aller_retour():
    """`rendre` APLATIT une note multiligne (limitation mesuree au plan 3a,
    gardee par le test juste au-dessus). Sans separateur explicite, deux
    phrases se collent en une seule, illisible, et personne ne le voit.
    L'outil d'export du plan 3c joint donc les lignes d'une plage de
    commentaire par `SEPARATEUR_NOTE` (" — ", tiret cadratin entoure
    d'espaces) AVANT d'ecrire la note ; ce test garde la moitie qui RESTE
    une fois l'outil parti (plan 3c, tache 10) : que la chaine ainsi jointe
    traverse `rendre`/`lire` intacte, separateur non-ASCII compris.

    Ecrit avec le separateur REEL de l'outil et non son approximation ASCII
    "--" : un test qui n'exerce pas la chaine reellement produite ne garde
    rien. La note est posee a la RACINE de l'ecran, ou 143 des 178 plages
    d'`ecran.ts` atterrissent."""
    ecran = {
        "titre": "Zone A", "nom": "Alpha",
        "temperature": "sensor.zone_a_temperature",
        "note": "Premiere phrase. — Seconde phrase, qui vivait sur une autre ligne.",
        "ambiances": [], "commandes": [], "synthese": [],
        "extrasMaison": [], "sources": [], "ouvrants": [],
    }
    assert yaml_ecrans.lire(yaml_ecrans.rendre([ecran])) == [ecran]
