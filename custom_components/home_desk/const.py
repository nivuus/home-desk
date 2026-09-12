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

# Refus generique d'un champ d'element de section « liste » (tuile de
# commande, rangee d'ambiance, ligne de synthese) : la MEME validation que
# schema.valider() applique a l'ecran complet (schema.BOUTON / schema.SYNTHESE,
# via listes.py), rejouee champ par champ pour refuser A LA SAISIE plutot qu'a
# l'ecriture. Meme regle de nommage que les deux erreurs ci-dessus : jamais
# retape en dur, jamais recopie dans translations/*.json sans repercuter l'un
# sur l'autre.
ERREUR_CHAMP_INVALIDE = "champ_invalide"

# Ronde 1 de relecture (tache 6) : dette de la tache 5 corrigee ici. `nom`
# vide passait (SCHEMA_IDENTITE ne declare qu'un `str`, sans borne) et etait
# PERSISTE alors que le contrat exige `minLength: 1` — refuse desormais A LA
# SAISIE, meme regle que les deux erreurs au-dessus.
ERREUR_NOM_VIDE = "nom_vide"

# Ronde 2 de relecture (tache 6) : soumettre le menu d'une section « liste »
# (listes.py, `_async_step_section`) sans cocher "nouveau" NI choisir un
# element existant reaffichait le formulaire EN SILENCE, sans dire pourquoi
# rien ne s'etait passe -- le meme genre de refus muet que les trois erreurs
# ci-dessus existent pour eviter, ici manquant depuis la ronde 1.
ERREUR_SELECTION_MANQUANTE = "selection_manquante"

# Les quatre gestes d'un element de section « liste » (listes.py) — un
# element deja choisi. Ajouter un element VIERGE n'en est pas un : c'est la
# case a cocher "nouveau" du formulaire de section, pas une valeur de geste
# (ronde 1 de relecture : l'ancien sentinel ACTION_AJOUTER partageait le
# champ "choix" avec des index d'elements reels, ce qui empechait de
# traduire proprement son option "Ajouter" - retire).
ACTION_ENREGISTRER = "enregistrer"
ACTION_MONTER = "monter"
ACTION_DESCENDRE = "descendre"
ACTION_SUPPRIMER = "supprimer"
