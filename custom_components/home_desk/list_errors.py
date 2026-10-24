"""What NAMES a fault of a "list" section: the table that translates a
JSON Schema keyword into an error code (`_ERROR_BY_KEYWORD`), and the
function that attributes a fault to a form FIELD (`_localiser_champ`).

Extracted from `list_sections.py` in correction round 1 (defect B):
`list_sections.py` had regained, with task 7, exactly the margin that this
same task had freed elsewhere (478 -> 498/500). The seam is the one that
has already deflated `schema.py` twice: what NAMES a fault leaves, what
USES it stays in `list_sections.py` (and in `objets.py`, which replays the
same mechanism for `$defs/agencement`). The proof that it was already
separable: `objets.py` already imported both names TOGETHER from
`list_sections.py` (`from .list_sections import _ERROR_BY_KEYWORD,
_localiser_champ`) -- a module that imports private names from another is
a seam asking to be opened.

BYTE-FOR-BYTE MOVE from `list_sections.py`: neither one was rewritten, only
moved -- that is what makes the extraction PROVABLE (232 green tests after
a byte-identical move is proof; after a rewrite, it is not). Names
unchanged, including their `_` prefix: these two names remain
implementation details SHARED between `list_sections.py` and `objets.py`,
never a public API of this component.
"""
from __future__ import annotations

import voluptuous as vol

from . import schema
from .const import (
    ERROR_FIELD_DUPLICATE,
    ERROR_FIELD_ITEM_REQUIRED,
    ERROR_FIELD_INVALID_FORMAT,
    ERROR_FIELD_UNKNOWN,
    ERROR_FIELD_REQUIRED,
    ERROR_FIELD_TOO_SHORT,
    ERROR_FIELD_TOO_MANY_ITEMS,
    ERROR_FIELD_TOO_FEW_ITEMS,
    ERROR_FIELD_INVALID_TYPE,
    ERROR_FIELD_VALUE_FIXED,
    ERROR_FIELD_VALUE_NOT_ALLOWED,
)

# Review round 4: table DERIVED from the keywords that `fautes._Faute`
# (and voluptuous/probatio themselves, for "required"/"additionalProperties")
# can produce on $defs/bouton, $defs/synthese and $defs/entite — the
# THREE shapes a "list" section validates (`Section.valider`). Each
# keyword becomes a translated SENTENCE that says what to do, never the raw
# JSON Schema keyword: see `schema.motif()`/`fautes.motif()`, reserved for
# the corpus (`contrat/cas-schema.json`), never shown to a human from this
# table.
_ERROR_BY_KEYWORD: dict[str, str] = {
    "required": ERROR_FIELD_REQUIRED,
    "pattern": ERROR_FIELD_INVALID_FORMAT,
    "type": ERROR_FIELD_INVALID_TYPE,
    "minLength": ERROR_FIELD_TOO_SHORT,
    "enum": ERROR_FIELD_VALUE_NOT_ALLOWED,
    "const": ERROR_FIELD_VALUE_FIXED,
    "minItems": ERROR_FIELD_TOO_FEW_ITEMS,
    "maxItems": ERROR_FIELD_TOO_MANY_ITEMS,
    "uniqueItems": ERROR_FIELD_DUPLICATE,
    "additionalProperties": ERROR_FIELD_UNKNOWN,
    # "contains" joined the table at task 7: $defs/agencement (zones must
    # contain "commandes", modes must contain "defaut") is now reachable
    # via SectionsObjetMixin.async_step_agencement (objets.py), which
    # replays this same mapping mechanism — the ONLY reason why this
    # table, defined HERE, is imported by objets.py rather than
    # duplicated. Checked by execution (not assumed): submitting `zones`
    # without "commandes" does raise `('zones', 'contains')`, translated
    # into ERROR_FIELD_ITEM_REQUIRED — a message that explicitly names
    # "commandes"/"defaut" (see translations/fr.json). A submission of
    # DUPLICATE zones/modes (which the UI's multiple SelectSelector
    # prevents but which a direct call to the flow does not block) makes
    # "uniqueItems" reachable in the same way — checked by execution, not
    # added as a permanent test (outside the scope of the two rules of
    # this task, cf. report). $defs/bouton, $defs/synthese and
    # $defs/entite (the three shapes a "list" section of THIS module
    # validates) still never use it: a keyword absent from this table
    # falls back on ERROR_FIELD_INVALID, a STATIC message (never any
    # interpolated {motif}): the leak of round 3/4 therefore cannot
    # reappear even for a keyword someone forgot.
    "contains": ERROR_FIELD_ITEM_REQUIRED,
}


def _localiser_champ(err: vol.Invalid) -> tuple[str, str]:
    """The FIELD and the keyword of a fault on the LOCAL item that a "list"
    section form has just built — never `fautes.localiser()` alone, whose
    ajv-parity truncation (dropping the LAST segment for
    "required"/"additionalProperties", see its own docstring) is designed
    for `motif()` and the corpus, not for attributing a refusal to a form
    FIELD.

    Review round 2: round 1 had fixed EXACTLY this same truncation in
    `objets.py` (`_localiser_champ`, defined THERE at the time) believing
    it specific to agencement/voiture — measured: `entite` omitted from a
    command tile (`$defs/bouton`), the value field omitted from a summary
    line (`$defs/synthese`) and `nom` omitted from a source
    (`$defs/source`) fell back HERE, in `list_sections.py`, on "base" — the
    SAME defect, never closed at the root. Now shared: `objets.py` imports
    it from HERE rather than keeping a second copy of it."""
    if isinstance(err, vol.MultipleInvalid):
        err = err.errors[0]
    _, mot_cle = schema.localiser(err)
    champ = str(err.path[0]) if err.path else "base"
    return champ, mot_cle

