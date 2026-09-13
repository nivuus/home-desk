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

# Refus de repli d'un champ d'element de section « liste » (tuile de
# commande, rangee d'ambiance, tuile « extras maison », ouvrant surveille,
# ligne de synthese — les cinq sections de `listes_champs.SECTIONS`) : la
# MEME validation que schema.valider() applique a l'ecran complet
# (schema.BOUTON / schema.SYNTHESE / schema.ENTITE, via listes.py), rejouee
# champ par champ pour refuser A LA SAISIE plutot qu'a l'ecriture.
#
# Ronde 4 de relecture : jusque-la, CE code portait TOUJOURS le message,
# et son gabarit ("Ce champ n'est pas valide : {motif}.") interpolait
# `schema.motif()` BRUT — un mot-cle JSON Schema destine au corpus ajv,
# jamais a un humain ("Ce champ n'est pas valide : : required.", entre
# autres, sur le champ le PLUS courant de la section la PLUS courante ;
# mesure sur quatre chemins). Exactement le charabia que la ronde 3 pensait
# avoir ferme en ne le corrigeant QUE pour `service`. `listes.py` traduit
# desormais chaque mot-cle JSON Schema en un code DEDIE (ci-dessous,
# `_ERREUR_PAR_MOT_CLE`) ; CE code ne reste que le REPLI d'un mot-cle
# qu'aucune des deux formes ($defs/bouton, $defs/synthese) ne peut
# produire aujourd'hui (`contains`, propre a $defs/agencement). Son message
# est desormais STATIQUE, SANS `{motif}` : la fuite ne peut donc plus
# reapparaitre meme pour un mot-cle non prevu.
ERREUR_CHAMP_INVALIDE = "champ_invalide"

# Un code par mot-cle JSON Schema atteignable par $defs/bouton,
# $defs/synthese et $defs/entite (les trois formes qu'une section « liste »
# valide) — chacun une PHRASE traduite qui dit quoi faire, jamais le
# mot-cle brut. `listes.py` les choisit via `_ERREUR_PAR_MOT_CLE`, derivee
# de `fautes.localiser()`.
ERREUR_CHAMP_REQUIS = "champ_requis"
ERREUR_CHAMP_FORMAT_INVALIDE = "champ_format_invalide"
ERREUR_CHAMP_TYPE_INVALIDE = "champ_type_invalide"
ERREUR_CHAMP_TROP_COURT = "champ_trop_court"
ERREUR_CHAMP_VALEUR_NON_AUTORISEE = "champ_valeur_non_autorisee"
ERREUR_CHAMP_VALEUR_FIGEE = "champ_valeur_figee"
ERREUR_CHAMP_TROP_PEU_D_ELEMENTS = "champ_trop_peu_d_elements"
ERREUR_CHAMP_TROP_D_ELEMENTS = "champ_trop_d_elements"
ERREUR_CHAMP_DOUBLON = "champ_doublon"
ERREUR_CHAMP_INCONNU = "champ_inconnu"

# Ronde 4 de relecture (mineur) : `libelle` ($defs/bouton) et `texte`
# ($defs/synthese) sont requis et non vides dans le contrat (minLength: 1),
# mais seule la LONGUEUR y est verifiee (des espaces comptent) — un libelle
# "   " passait et etait PERSISTE, le bouton mort que ce depot s'interdit.
# Meme doctrine que `nom` (ERREUR_NOM_VIDE ci-dessus, ronde 1) : verifie
# ICI, jamais dans schema.py (qui doit rester fidele au contrat partage
# avec ajv, ou les espaces comptent bel et bien comme des caracteres).
ERREUR_CHAMP_VIDE = "champ_vide"

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

# Ronde 3 de relecture (tache 6) : la ronde 2 avait corrige le SILENCE d'un
# `service_domaine`/`service_action` a demi rempli en le refusant -- mais via
# `ERREUR_CHAMP_INVALIDE` + `schema.motif()`, qui ne nomme QUE du vocabulaire
# JSON Schema destine au corpus ajv ("minItems"), jamais un humain : le
# message reellement affiche etait « Ce champ n'est pas valide : : minItems. »
# -- deux-points double, aucun champ surligne (pose sur "base"), aucun geste
# nomme. Code dedie, pose sur le champ REELLEMENT vide, message qui dit quoi
# faire.
ERREUR_SERVICE_INCOMPLET = "service_incomplet"

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

# Tache 7 : quatre sections de plus (sources media et minuteurs/etiquettes
# de minuteur, deux sections « liste » qui rejoignent listes_champs.SECTIONS ;
# agencement et voiture, deux sections « objet » portees par
# objets.SectionsObjetMixin), et les deux regles croisees que le contrat NE
# PEUT PAS porter (le troisieme invariant croise, pose dans
# listes._async_step_section_element ; la verification de budget MODE PAR
# MODE, posee dans objets.SectionsObjetMixin.async_step_agencement).

# Le pendant de `listes._ERREUR_PAR_MOT_CLE["contains"]` (schema.AGENCEMENT :
# zones doit contenir "commandes", modes doit contenir "defaut"). Message
# STATIQUE (comme ERREUR_CHAMP_INVALIDE) : `vol.ContainsInvalid` ne porte
# aucune donnee qui distinguerait laquelle des deux listes a echoue au-dela
# du CHAMP deja pose par `fautes.localiser()` ("zones" ou "modes").
ERREUR_CHAMP_ELEMENT_REQUIS = "champ_element_requis"

# Le pendant de ERREUR_SERVICE_INCOMPLET pour la paire `allumee_entite`/
# `allumee_etats` de $defs/source (listes_champs_sources.AllumeeIncomplete) :
# meme regime qu'un service a demi rempli, mais un message DEDIE — celui de
# ERREUR_SERVICE_INCOMPLET nomme explicitement "les deux champs du service",
# ce qui serait un mensonge affiche sur une paire qui n'appelle aucun
# service.
ERREUR_ALLUMEE_INCOMPLETE = "allumee_incomplet"

# Le TROISIEME invariant croise (legue par le plan 2, jamais mis dans le
# contrat a dessein) : une tuile `vue: '#recette'` sur un ecran dont
# `agencement.modes` ne contient pas `recette`.
#
# Ronde 1 de relecture (Mineur) : la premiere version de ce commentaire (et
# du message affiche) affirmait que la tuile « ne ferait rien » — FAUX,
# verifie contre `app/src/demarrage.ts` (l'ecouteur `hashchange` ouvre
# `#recette` sur le SEUL hash, ligne ~1067, sans jamais lire
# `agencement.modes`) : la tuile OUVRE la vue normalement. Ce qui manque
# reellement sans le mode "recette", c'est le POINT DE REPRISE sur
# l'accueil : `modes.ts` (CONDITIONS.recette = c.recetteEnCours) n'engage
# le bloc reduit de la recette QUE si "recette" fait partie des modes
# ITERES par `agencement.modes` — sans lui, quitter la vue sans "Terminer"
# ne laisse aucune trace visible sur l'accueil, la seule fonction que ce
# mode existe pour porter. Le schema JSON juge un ecran FINI ; ce refus
# juge une saisie EN COURS, et lui seul peut proposer le remede (aller dans
# « Blocs et modes » et y ajouter le mode "recette") : un if/then JSON
# Schema ne sait pas faire ce dernier geste. Pose par
# `listes._async_step_section_element` sur les tuiles ($defs/bouton),
# verifie contre `agencement.modes` TEL QUE DEJA PERSISTE.
ERREUR_RECETTE_SANS_MODE = "recette_sans_mode"

# Le budget verifie MODE PAR MODE (objets.py,
# SectionsObjetMixin.async_step_agencement) : la tache 5 ne pouvait juger que
# le mode "defaut" (le moins cher), faute de donnee — ici, `agencement.modes`
# existe enfin. Refuse sur le MODE LE PLUS COUTEUX des modes saisis, et le
# NOMME dans `description_placeholders` ("mode") en plus du debordement
# ("debordement") : « cet ecran deborde de X px » n'indique pas quoi
# changer, « le mode minuteur deborde de X px » si. Code DISTINCT de
# ERREUR_BUDGET_INTENABLE (l'identite ne verifie qu'un seul mode fixe,
# "defaut" ; ici, plusieurs modes sont en jeu et celui qui echoue doit etre
# nomme) — les deux messages different donc necessairement.
ERREUR_BUDGET_INTENABLE_MODE = "budget_intenable_mode"

# Ronde 1 de relecture (Critique) : ni listes.py ni objets.py ne rejouaient
# schema.valider() sur l'ECRAN COMPLET avant de persister — chacun ne
# verifiait que SA PROPRE forme (schema.BOUTON, schema.AGENCEMENT,
# schema.VOITURE...), aveugle aux invariants CROISES entre sections (mode
# "minuteur" sans slot, blocDefaut "voiture" sans objet voiture). Depuis que
# la sous-entree est valide DES SA CREATION (SECTIONS initialise les huit
# sections « liste » a [], donc "sources" ne manque plus), cette
# integration peut s'offrir l'invariant inverse : un ecran valide DOIT LE
# RESTER a chaque etape qui persiste. `garde_ecran.verifier_ecran_complet`
# le fait tenir ; ce code nomme la section fautive
# (`description_placeholders["section"]`, un champ RACINE du contrat -
# "minuteurs", "voiture", "agencement"...) plutot que de laisser persister
# un ecran devenu invalide en silence.
ERREUR_ECRAN_DEVIENDRAIT_INVALIDE = "ecran_deviendrait_invalide"

# Tache 8 : les codes d'erreur du TRANSPORT websocket (websocket.py), jamais
# ceux d'un formulaire de saisie -- ERREUR_ECRAN_INTROUVABLE est le refus de
# `home_desk/ecran` quand aucune sous-entree ne porte le `nom` demande (un
# objet vide serait un ecran SANS TUILES, indistinguable d'une absence) ;
# ERREUR_VERSION_INCONNUE est son refus quand la sous-entree stockee porte
# une `version` que ce composant ne reconnait pas -- la quatrieme
# degradation (spec, decision 10), posee a l'ECRITURE par le flow
# (VERSION_CONFIG ci-dessus) et desormais VERIFIEE A LA LECTURE, ici.
#
# Ronde 1 de relecture (Point 2) : ces valeurs de fil sont un CONTRAT PUBLIE
# vers `app/src/` (TypeScript, qui ne peut pas importer ce module) -- au
# moins un test doit les epingler par leur LITTERAL, jamais seulement par la
# constante (sinon un renommage de la constante ne fait tomber aucun test,
# comme le mesure la ronde 1).
ERREUR_ECRAN_INTROUVABLE = "not_found"
ERREUR_VERSION_INCONNUE = "version_inconnue"

# Ronde 1 de relecture (Critique + Point 4) : distinct d'ERREUR_VERSION_
# INCONNUE. Une sous-entree dont la VERSION est connue mais dont les
# DONNEES sont par ailleurs invalides (sauvegarde restauree, import direct
# -- deux des trois portes que la docstring de `websocket._resoudre` nomme,
# ni gardees par le formulaire) ne doit JAMAIS partager le code generique
# `invalid_format` que Home Assistant produit pour une requete CLIENTE mal
# formee (`nom` absent du message websocket, par exemple) : les deux
# refus, mesures cote a cote, rendaient le MEME `{"code": "invalid_format",
# "message": "required key not provided at '...'"}"` -- un client ne peut
# pas distinguer « ma requete est mauvaise » de « la config stockee est
# pourrie ». `websocket.ws_ecran` attribue desormais ce code DEDIE des que
# `schema.valider()` echoue sur une version pourtant CONNUE.
ERREUR_ECRAN_CORROMPU = "ecran_corrompu"

# Ronde 1 de relecture (Important) : `nom` est la cle PRIMAIRE du transport
# (websocket.py resout un ecran PAR SON NOM) -- rien dans le contrat ne
# l'exige unique (schema.py ne porte aucune contrainte inter-ecrans, et
# n'en a pas les moyens : chaque sous-entree est validee seule), mais deux
# ecrans homonymes rendraient l'un des deux DEFINITIVEMENT inatteignable
# par `home_desk/ecran` (qui rend toujours le PREMIER trouve) et
# `home_desk/ecrans` en afficherait deux lignes rigoureusement identiques.
# C'est une regle du FLOW (config_flow.py), pas du contrat -- posee a la
# CREATION et a la RECONFIGURATION de l'identite (`_valider_identite`).
ERREUR_NOM_DEJA_UTILISE = "nom_deja_utilise"

# Tache 9 : les deux services qui font sortir/entrer la configuration du
# depot HA (`.storage`) vers un fichier YAML du repertoire `config/` --
# `services.py`, decrits pour l'interface par `services.yaml` et nommes
# pour l'humain par translations/*.json (cle "services"). `importer` est
# aussi l'entree de la migration du plan 3c (les ecrans actuels du depot,
# aujourd'hui en dur dans app/src/ecran.ts, y entreront comme un fichier
# EXPORTE une premiere fois a la main).
SERVICE_EXPORTER = "exporter"
SERVICE_IMPORTER = "importer"

# Le chemin, RELATIF a `config/` (`hass.config.path(...)`), du fichier que
# `home_desk.exporter` ecrit et que `home_desk.importer` relit -- publie
# ici pour que ni l'un ni l'autre ne le retape, et pour qu'un test puisse
# l'epingler sans lire le corps des deux services.
FICHIER_EXPORT_ECRANS = "home_desk_ecrans.yaml"
