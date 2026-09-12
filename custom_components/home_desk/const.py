"""Les noms que ce composant publie, et qui ne doivent exister qu'ici.

Chacun est lu par au moins deux modules. Les ecrire en dur a chaque endroit,
c'est se donner rendez-vous avec une faute de frappe qu'aucun test ne voit :
une commande websocket mal nommee ne leve pas, elle n'est simplement jamais
appelee.
"""

DOMAIN = "home_desk"

# La version de la FORME d'une configuration d'ecran, pas celle du composant.
# L'application refuse net une config dont la version lui est inconnue
# (quatrieme degradation, spec decision 10) : c'est ce nombre qu'elle compare.
# Il n'augmente que si la forme cesse d'etre lisible par la version d'avant.
VERSION_CONFIG = 1

# Le type de sous-entree. Une entree « Tablettes murales », N sous-entrees
# « ecran » — ajouter une quatrieme tablette est la meme operation que pour
# les trois premieres.
SOUS_ENTREE_ECRAN = "ecran"

WS_ECRAN = f"{DOMAIN}/ecran"
WS_ECRANS = f"{DOMAIN}/ecrans"

# Emis sur le bus a chaque ecriture d'une sous-entree, charge utile : le nom de
# l'ecran. C'est ce qui permet a une tablette de se recharger sans sondage.
EVENEMENT_CHANGEMENT = f"{DOMAIN}_config_changed"

# Les codes d'erreur du formulaire de sous-entree "ecran" (config_flow.py).
# translations/fr.json et translations/en.json portent la MEME chaine comme
# cle JSON — un JSON ne peut pas importer une constante Python, donc le lien
# est clou par un test qui lit le fichier et indexe avec CES constantes
# (tests/composant/test_config_flow.py) : renommer l'une sans l'autre casse
# le test plutot que de laisser l'affichage silencieusement casse.
ERREUR_HAUTEUR_HORS_BORNES = "hauteur_hors_bornes"
ERREUR_BUDGET_INTENABLE = "budget_intenable"
