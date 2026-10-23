"""The Python mirror of the screen-budget functions of `app/src/screen-budget.ts`:
`coutEcran`/`combien`/`arrangement`/`verifierBudget`.  policy: allow-fr (TypeScript names, not ours)

TWO implementations for a single rule, and that is deliberate: this component runs in Home
Assistant, the application runs in a browser. What keeps them from diverging is not
discipline, it is `contrat/cas-budget.json` — a corpus that BOTH suites replay
(`app/tests/cas-budget.test.ts` on the TypeScript side, `tests/composant/test_budget.py` here), where a
case present on one side and absent from the other is impossible since it is the same file.

The integration's form (tasks 5 to 7) will reject an input on the strength of
`check_budget`. If it computes anything other than its TypeScript twin, it rejects screens that
fit and accepts screens that overflow — and nobody sees it before the tablet is
on the wall. TRANSLATE, DO NOT REINVENT: every term below has an exact counterpart in
`screen-budget.ts`, even when a shorter formula would have given the same result on the known cases —
two formulas of that kind have already been proposed and rejected in this project, both green
on the tested points and both wrong on an untested point (the column gutter,
the one between rows, or the derived ceiling).

`screen-budget.ts` holds these functions since 2026-10-24 (task 9 of the media card redesign);
they lived in `app/src/modes.ts` before.

The contract read here is the EMBEDDED one (`contrat/` under this module), never the repository's: once
installed, this component runs from `config/custom_components/home_desk/` and has no path
to the repository. Same rule as `schema.py` (task 3 decision), cf.
`test_budget_lit_reellement_son_contrat_embarque` (`tests/composant/test_budget.py`).
"""
from __future__ import annotations

import json
import pathlib

# Task 3 decision, carried over here: never "../../contrat", always relative to the module.
# Pinned by test_budget_lit_le_contrat_embarque AND
# test_budget_lit_reellement_son_contrat_embarque (tests/composant/test_budget.py) — the second
# spies on the actual read, not just the name of this constant.
CHEMIN_BUDGET = pathlib.Path(__file__).parent / "contrat" / "budget.json"

BUDGET = json.loads(CHEMIN_BUDGET.read_text(encoding="utf-8"))

# The four default zones (`AGENCEMENT_DEFAUT.zones`, `app/src/agencement.ts`). `contrat/`
# has no file that names them — they come from a contract only on the TypeScript side, where
# `agencement.ts` declares them by hand. This list IS the translation of that declaration, and
# not an invention: the same four values, in the same order.
ZONES_DEFAUT: list[str] = ["ambiances", "commandes", "blocCentral", "synthese"]


def cout_ecran(mode: str, rangee_ambiance: bool, rangees: int,
               zones: list[str] | None = None, synthese_reduite: bool = False) -> int:
    """What the screen measures for `rangees` rows of controls, at a given mode, ambience row and
    zones. `.corps` is a FLEX COLUMN with a fixed gutter: its cost is the sum of its
    children plus one gutter between each pair, plus its vertical padding, with the header band
    on top. ONE SINGLE child is always there, the "Toute la maison" (whole house) button — it lives outside
    the adjustable order (cf. `rendu/corps.ts` on the application side). The others count only if
    `zones` asks for them: the central block ONE, the summary line ONE, the "Ambiance" row
    TWO (its label is a child in its own right), the control grid ONE.

    `zones=None` means "the four default zones", exactly like the TypeScript default
    value (`AGENCEMENT_DEFAUT.zones`). `synthese_reduite` bills the one-line synthesis
    (`hauteurs.syntheseReduite`, 2026-10-24) instead of the two-line one."""
    if zones is None:
        zones = ZONES_DEFAUT
    h = BUDGET["hauteurs"]
    # Four branches: `minuteur` pays `blocMinuteur` (215 px), the media modes (`media`,
    # `cinema`) pay `blocMedia` (263 px, since 2026-10-24), the other tall block (`voiture`)
    # pays `blocHaut` (153 px), all the others pay `blocDefaut` (84 px). A single central block
    # per screen: never an "on top of".
    if mode in BUDGET["modesABlocMinuteur"]:
        bloc = h["blocMinuteur"]
    elif mode in BUDGET["modesABlocMedia"]:
        bloc = h["blocMedia"]
    elif mode in BUDGET["modesABlocHaut"]:
        bloc = h["blocHaut"]
    else:
        bloc = h["blocDefaut"]

    # "Toute la maison" (whole house) is OUTSIDE the adjustable order: always there, always billed. The
    # four others cost something only if the layout asks for them.
    enfants = 1
    somme = h["touteLaMaison"]
    if "blocCentral" in zones:
        enfants += 1
        somme += bloc
    if "synthese" in zones:
        enfants += 1
        somme += h["syntheseReduite"] if synthese_reduite else h["synthese"]
    if rangee_ambiance and "ambiances" in zones:
        # The "Ambiance" label is a child in its own right of the flex column, not a title
        # inside the group: two children, hence two gutters.
        enfants += 2
        somme += h["etiquetteAmbiance"] + h["rangeeAmbiance"]
    if rangees > 0:
        enfants += 1
        # The rows live in ONE grid: their gutter is the grid's (10 px), not
        # the column's (8 px) — and there is none after the last one.
        somme += h["rangeeCommandes"] * rangees + h["gouttiereCommandes"] * (rangees - 1)
    return h["bandeau"] + h["paddingCorps"] + somme + h["gouttiere"] * (enfants - 1)


def combien(mode: str, rangee_ambiance: bool = True,
            hauteur_utile: int | None = None,
            zones: list[str] | None = None,
            synthese_reduite: bool = False) -> int:
    """How many controls the screen shows. NEVER RAISES: an untenable budget returns 0, and
    the screen then displays its other zones without a row of controls — exactly what the
    `minuteur` mode already does legitimately.

    `hauteur_utile=None` means `BUDGET["hauteurUtileParDefaut"]` (585, the Fire 7s).
    `zones=None` means the four default zones."""
    if hauteur_utile is None:
        hauteur_utile = BUDGET["hauteurUtileParDefaut"]
    if zones is None:
        zones = ZONES_DEFAUT
    # A screen that does not display the `commandes` zone displays NO control at all — it is not a
    # budget question, it is a composition question. Returns 0, NEVER raises.
    if "commandes" not in zones:
        return 0
    # The ceiling of TWO rows is not one more number: it is what `commandesParDefaut`
    # (4 slots) and `tuilesParRangee` (2 columns) already say. `rangees_max` is DERIVED, it is
    # never written `2`.
    rangees_max = BUDGET["commandesParDefaut"] // BUDGET["tuilesParRangee"]
    # `combien` LOOPS from `rangees_max` down to 1 and returns the first that fits; it never divides
    # the remainder by the height of a row.
    for rangees in range(rangees_max, 0, -1):
        if cout_ecran(mode, rangee_ambiance, rangees, zones, synthese_reduite) <= hauteur_utile:
            return rangees * BUDGET["tuilesParRangee"]
    # Never a row cut in half: below one row, only zero remains — whether the budget
    # holds or not.
    return 0


def _echelons(rangee_ambiance: bool) -> list[dict[str, bool]]:
    """The rungs of the ladder, in the owner's order (spec 2026-10-23, "Place a l'ecran"): the
    full composition, then the reduced synthesis, then the reduced synthesis without the
    Ambiance row. Same list as `echelons` in `screen-budget.ts`."""
    return [
        {"rangeeAmbiance": rangee_ambiance, "syntheseReduite": False},
        {"rangeeAmbiance": rangee_ambiance, "syntheseReduite": True},
        {"rangeeAmbiance": False, "syntheseReduite": True},
    ]


def arrangement(mode: str, rangee_ambiance: bool = True,
                hauteur_utile: int | None = None,
                zones: list[str] | None = None) -> dict[str, bool | int]:
    """What the screen shows in `mode`: the first rung whose `combien` reaches
    `commandesSousBlocHaut`, or the last rung if none does. Only the modes of
    `modesABlocMedia` climb the ladder; every other mode gets its full composition. The budget
    decides, never a list of rooms. Returns the keys of the TypeScript `Arrangement`
    (`rangeeAmbiance`, `syntheseReduite`, `commandes`), so the corpus compares them as is."""
    rungs = _echelons(rangee_ambiance)
    if mode not in BUDGET["modesABlocMedia"]:
        rungs = rungs[:1]
    chiffres = [
        {**r, "commandes": combien(mode, r["rangeeAmbiance"], hauteur_utile, zones,
                                   r["syntheseReduite"])}
        for r in rungs
    ]
    for a in chiffres:
        if a["commandes"] >= BUDGET["commandesSousBlocHaut"]:
            return a
    return chiffres[-1]


def check_budget(mode: str, rangee_ambiance: bool, hauteur_utile: int,
                 zones: list[str] | None = None) -> int:
    """By how much this composition overflows, in pixels. 0 if it fits. Written for the
    Home Assistant integration's form, which must be able to say "this screen overflows by
    58 px" (`check_budget('minuteur', True, 500)`, checked by running it — the previous
    value, 45, was wrong: `check_budget('minuteur', True, 585)` returns 0, not 45)
    AT INPUT TIME — not in front of the tablet.

    Always counts ZERO rows of controls: it is the smallest composition the screen
    can render, hence the question "does it fit, even empty?". The rendering never calls it:
    it is `combien` that degrades, `check_budget` that delivers the verdict.

    Since 2026-10-24, for the modes of `modesABlocMedia`, that smallest composition is the LAST
    rung of the ladder (reduced synthesis, no Ambiance row): the screen draws it whenever nothing
    else fits, so the form refuses only what overflows even there."""
    r = _echelons(rangee_ambiance)[2 if mode in BUDGET["modesABlocMedia"] else 0]
    return max(0, cout_ecran(mode, r["rangeeAmbiance"], 0, zones, r["syntheseReduite"])
               - hauteur_utile)
