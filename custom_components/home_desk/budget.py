"""Le miroir Python de `coutEcran`/`combien`/`verifierBudget` (`app/src/modes.ts`).

DEUX implementations pour une seule regle, et c'est assume : ce composant tourne dans Home
Assistant, l'application tourne dans un navigateur. Ce qui les empeche de diverger n'est pas la
discipline, c'est `contrat/cas-budget.json` — un corpus que les DEUX suites rejouent
(`app/tests/cas-budget.test.ts` cote TypeScript, `tests/composant/test_budget.py` ici), ou un cas
present d'un cote et absent de l'autre est impossible puisque c'est le meme fichier.

Le formulaire de l'integration (taches 5 a 7) refusera une saisie sur la foi de
`verifier_budget`. S'il calcule autre chose que `verifierBudget`, il refuse des ecrans qui
tiennent et accepte des ecrans qui debordent — et personne ne le voit avant que la tablette soit
au mur. TRADUIRE, PAS REINVENTER : chaque terme ci-dessous a une contrepartie exacte dans
`modes.ts`, meme quand une formule plus courte aurait donne le meme resultat sur les cas connus —
deux formules de ce genre ont deja ete proposees et refusees dans ce chantier, toutes deux vertes
sur les points testes et toutes deux fausses sur un point non teste (la gouttiere de colonne,
celle entre rangees, ou le plafond derive).

Le contrat lu ici est celui EMBARQUE (`contrat/` sous ce module), jamais celui du depot : une fois
installe, ce composant tourne depuis `config/custom_components/home_desk/` et n'a aucun chemin
vers le depot. Meme regle que `schema.py` (decision de la tache 3), cf.
`test_budget_lit_reellement_son_contrat_embarque` (`tests/composant/test_budget.py`).
"""
from __future__ import annotations

import json
import pathlib

# Decision de la tache 3, reprise ici : jamais "../../contrat", toujours relatif au module.
# Clouee par test_budget_lit_le_contrat_embarque ET
# test_budget_lit_reellement_son_contrat_embarque (tests/composant/test_budget.py) — la seconde
# espionne la lecture reelle, pas seulement le nom de cette constante.
CHEMIN_BUDGET = pathlib.Path(__file__).parent / "contrat" / "budget.json"

BUDGET = json.loads(CHEMIN_BUDGET.read_text(encoding="utf-8"))

# Les quatre zones du defaut (`AGENCEMENT_DEFAUT.zones`, `app/src/agencement.ts`). `contrat/`
# n'a pas de fichier qui les nomme — elles ne viennent d'un contrat que cote TypeScript, ou
# `agencement.ts` les declare a la main. Cette liste EST la traduction de cette declaration, et
# non une invention : les memes quatre valeurs, dans le meme ordre.
ZONES_DEFAUT: list[str] = ["ambiances", "commandes", "blocCentral", "synthese"]


def cout_ecran(mode: str, rangee_ambiance: bool, rangees: int,
               zones: list[str] | None = None) -> int:
    """Ce que l'ecran mesure pour `rangees` rangees de commandes, a mode, rangee d'ambiance et
    zones donnes. `.corps` est une COLONNE FLEX a gouttiere fixe : son cout est la somme de ses
    enfants plus une gouttiere entre chaque paire, plus son padding vertical, le bandeau venant
    au-dessus. UN SEUL enfant est toujours la, le bouton « Toute la maison » — il vit hors de
    l'ordre reglable (cf. `rendu/corps.ts` cote application). Les autres ne comptent que si
    `zones` les demande : le bloc central UN, la ligne de synthese UN, la rangee « Ambiance »
    DEUX (son etiquette est un enfant a part entiere), la grille de commandes UN.

    `zones=None` signifie « les quatre zones du defaut », exactement comme la valeur par defaut
    TypeScript (`AGENCEMENT_DEFAUT.zones`)."""
    if zones is None:
        zones = ZONES_DEFAUT
    h = BUDGET["hauteurs"]
    # Trois branches, jamais deux : `minuteur` paie `blocMinuteur` (206 px), les modes a bloc
    # haut (`media`, `cinema`, `voiture`) paient `blocHaut` (153 px), tous les autres paient
    # `blocDefaut` (84 px). Un seul bloc central par ecran : c'est un TERNAIRE a trois branches,
    # jamais un "en plus".
    if mode in BUDGET["modesABlocMinuteur"]:
        bloc = h["blocMinuteur"]
    elif mode in BUDGET["modesABlocHaut"]:
        bloc = h["blocHaut"]
    else:
        bloc = h["blocDefaut"]

    # « Toute la maison » est HORS de l'ordre reglable : toujours la, toujours facturee. Les
    # quatre autres ne coutent que si l'agencement les demande.
    enfants = 1
    somme = h["touteLaMaison"]
    if "blocCentral" in zones:
        enfants += 1
        somme += bloc
    if "synthese" in zones:
        enfants += 1
        somme += h["synthese"]
    if rangee_ambiance and "ambiances" in zones:
        # L'etiquette « Ambiance » est un enfant a part entiere de la colonne flex, pas un titre
        # dans le groupe : deux enfants, donc deux gouttieres.
        enfants += 2
        somme += h["etiquetteAmbiance"] + h["rangeeAmbiance"]
    if rangees > 0:
        enfants += 1
        # Les rangees vivent dans UNE grille : leur gouttiere est celle de la grille (10 px), pas
        # celle de la colonne (8 px) — et il n'y en a pas apres la derniere.
        somme += h["rangeeCommandes"] * rangees + h["gouttiereCommandes"] * (rangees - 1)
    return h["bandeau"] + h["paddingCorps"] + somme + h["gouttiere"] * (enfants - 1)


def combien(mode: str, rangee_ambiance: bool = True,
            hauteur_utile: int | None = None,
            zones: list[str] | None = None) -> int:
    """Combien de commandes l'ecran montre. NE LEVE JAMAIS : un budget intenable rend 0, et
    l'ecran affiche alors ses autres zones sans rangee de commandes — exactement ce que le mode
    `minuteur` fait deja legitimement.

    `hauteur_utile=None` signifie `BUDGET["hauteurUtileParDefaut"]` (585, les Fire 7).
    `zones=None` signifie les quatre zones du defaut."""
    if hauteur_utile is None:
        hauteur_utile = BUDGET["hauteurUtileParDefaut"]
    if zones is None:
        zones = ZONES_DEFAUT
    # Un ecran qui n'affiche pas la zone `commandes` n'affiche AUCUNE commande — ce n'est pas une
    # question de budget, c'est une question de composition. Rend 0, ne leve JAMAIS.
    if "commandes" not in zones:
        return 0
    # Le plafond de DEUX rangees n'est pas un chiffre de plus : c'est ce que `commandesParDefaut`
    # (4 places) et `tuilesParRangee` (2 colonnes) disent deja. `rangees_max` se DERIVE, il ne
    # s'ecrit jamais `2`.
    rangees_max = BUDGET["commandesParDefaut"] // BUDGET["tuilesParRangee"]
    # `combien` BOUCLE de `rangees_max` vers 1 et rend le premier qui tient ; il ne divise jamais
    # le reste par la hauteur d'une rangee.
    for rangees in range(rangees_max, 0, -1):
        if cout_ecran(mode, rangee_ambiance, rangees, zones) <= hauteur_utile:
            return rangees * BUDGET["tuilesParRangee"]
    # Jamais de rangee coupee en deux : sous une rangee, il ne reste que zero — que le budget
    # tienne ou non.
    return 0


def verifier_budget(mode: str, rangee_ambiance: bool, hauteur_utile: int,
                     zones: list[str] | None = None) -> int:
    """De combien cette composition deborde, en pixels. 0 si elle tient. Ecrite pour le
    formulaire de l'integration Home Assistant, qui doit pouvoir dire « cet ecran deborde de
    45 px » AU MOMENT DE LA SAISIE — pas devant la tablette.

    Compte toujours ZERO rangee de commandes : c'est la composition la plus petite que l'ecran
    puisse rendre, donc la question « tient-elle, meme a vide ? ». Le rendu ne l'appelle jamais :
    c'est `combien` qui degrade, `verifier_budget` qui porte le verdict."""
    return max(0, cout_ecran(mode, rangee_ambiance, 0, zones) - hauteur_utile)
