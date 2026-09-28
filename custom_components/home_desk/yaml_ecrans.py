"""The export/import format of `home_desk.exporter` / `home_desk.importer`:
a readable YAML where the contract's `note` fields become COMMENTS again,
never fields.

A `note: "..."` in the middle of the data would be one more string. A `#`
above what it justifies is what a human rereads -- it is the answer to
regression no.3, named frankly by the spec ("the reasoning leaves the
repository", the `note` fields are no longer in `git log`): this module is
what makes it possible to put them back there when we decide to, on import
as on export.

`note` can appear at the root of a screen AND in each of the six nested
shapes that carry it (schema.BOUTON, SYNTHESE, SOURCE, MINUTEUR_SLOT,
VOITURE, AGENCEMENT) -- never in the arrays of bare strings (ouvrants,
etiquettesMinuteur, service) which have no field to name. Rather than
naming these six shapes one by one (a seventh would be added one day
without this file knowing, exactly the second copy this repository forbids
itself), `rendre`/`lire` GENERICALLY handle any dict that carries a "note"
key: the mechanism knows no field name of the contract, only the rule
"a dict's note -> a comment alone on its line, just above the block that
this dict represents".

`rendre` drives the STRUCTURE and the comments by hand; the rendering of
EACH SCALAR VALUE (escaping a string that starts with a reserved character,
an empty string, "true"/"123" mistaken for a boolean/an integer...) is
delegated to PyYAML (`yaml.safe_dump`) -- reinventing these quoting rules
would have been exactly the local resolution that no mature library
justifies rewriting (see `_scalaire`).

`lire` does the reverse path in two passes: the first records, line by
line, those that are ONLY comments (never an end-of-line comment, which this
module never writes and therefore cannot reread), with THEIR COLUMN; the
second COMPOSES the text (`yaml.SafeLoader.get_single_node`, the PyYAML
phase that builds the node tree BEFORE building the Python objects, the
only one that keeps each node's position) and builds each mapping by hand:
a dict receives a "note" key when the line just above its start is a
comment whose COLUMN is EXACTLY that of this mapping
(`noeud.start_mark.column` -- verified by execution: it is the column of the
mapping's FIRST KEY, never that of the "-" for a sequence item, nor that of
the key that introduces it for a named value).

Review round 1 (Critical): the first version of this rule only checked
the LINE ("just above"), never the column -- an ORPHAN comment placed
between `ecrans:` and the first `-` (the header an operator would add by
hand, for example) already satisfied "just above" and became an INVENTED
ROOT note on the first screen, persisted on the next import then rewritten
as a REAL note on the next export -- without any message reporting it. The
column closes this blind spot: `rendre` ALWAYS places its comment at the
SAME column as the first field of the block it annotates, never at that of
a parent key nor of the `-` that precedes it; a hand-edited file that
follows this same convention (bare comment, immediately above, at the exact
column of the block) stays readable, a comment at ANOTHER column (or
anywhere other than a line just above) is simply ignored -- lost as a note,
but never mistaken for the wrong one.

KNOWN LIMITS, owned rather than hidden -- both guarded by a test
(`tests/composant/test_yaml_ecrans.py`), not merely stated here:

1. A `note` that would itself contain a line break is flattened (the line
   breaks become spaces) before being written -- otherwise a multi-line
   note would break the "one comment, one line" rule this module depends
   on to reread itself. No real screen of this repository has ever carried
   a multi-line note (the contract does not forbid it, but nothing
   exercises it) -- guarded nonetheless by
   `test_une_note_multiligne_est_aplatie_pas_perdue_ni_cassee` (review
   round 2: round 1 asserted it without a test, removing the flattening
   left the suite green).
2. A leading or trailing space in a note's text SURVIVES the round-trip --
   `_lignes_commentaires` only removes the SINGLE separator space that
   `rendre` itself inserts after "#", never more: a HAND-EDITED file that
   adds its own spaces around the text would therefore see them kept,
   unlike a plain `.strip()` which would have silently swallowed them --
   guarded by
   `test_une_note_avec_espaces_de_tete_ou_de_queue_survit_a_l_aller_retour`  (test name; policy: allow-fr)
   (review round 2: fixed in round 1 but without a test, putting the
   `.strip()` back left the suite green)."""
from __future__ import annotations

from typing import Any

import yaml

CLE_RACINE = "ecrans"


def _scalaire(value: Any) -> str:
    """The YAML rendering of a single-line VALUE (str/int/float/bool/None),
    correctly escaped -- delegated to PyYAML (`yaml.safe_dump` on a
    single-key dict, of which only the part after "v: " is kept) rather than
    rewritten by hand."""
    rendu = yaml.safe_dump({"v": value}, allow_unicode=True, default_flow_style=False)
    return rendu[len("v: "):].rstrip("\n")


def _rendre_champ(cle: str, value: Any, indent: int) -> list[str]:
    """Renders `cle: value` at INDENT. A dict receives its own optional
    `note` as a comment just above `cle:` (the block this field represents
    STARTS at `cle:`, never before); a sequence of dicts delegates each item
    to `_rendre_element` (which handles the item's OWN note, placed above
    its "-"); a sequence of strings (or an empty one) and a scalar never
    have a note to place."""
    if isinstance(value, dict):
        # Tuning round: the comment of a NAMED dict field (agencement,
        # voiture, aspirateurMaison -- never a sequence ITEM, see
        # `_rendre_element`) must sit on the line JUST ABOVE the first line
        # of the NESTED mapping that `lire` will build -- and that mapping
        # starts at ITS OWN first key (here "zones:" for agencement), NOT at
        # the "agencement:" line itself (which belongs to the PARENT
        # mapping). Measured by round-trip: placing the comment above
        # "cle:" lost the note (it landed on the line of "cle:" itself,
        # never reread). So it is placed INSIDE the block, as its very
        # first line.
        sub_indent = indent + 2
        lignes = [f"{' ' * indent}{cle}:"]
        note = value.get("note")
        if note is not None:
            lignes.append(f"{' ' * sub_indent}# {_normaliser_note(note)}")
        for sub_key in value:
            if sub_key == "note":
                continue
            lignes.extend(_rendre_champ(sub_key, value[sub_key], sub_indent))
        return lignes
    if isinstance(value, list):
        if not value:
            return [f"{' ' * indent}{cle}: []"]
        lignes = [f"{' ' * indent}{cle}:"]
        for item in value:
            lignes.extend(_rendre_element(item, indent + 2))
        return lignes
    return [f"{' ' * indent}{cle}: {_scalaire(value)}"]


def _rendre_element(item: Any, indent: int) -> list[str]:
    """A sequence ITEM (a tile, a source, a timer slot, or -- ouvrants/
    etiquettesMinuteur -- a plain string).

    Review round 1 (Minor): a previous version of this docstring asserted
    INDENT is "that of the '-'" in ALL cases -- wrong, verified on both
    callers (`_rendre_champ`): for a SCALAR item (`ouvrants`,
    `etiquettesMinuteur`), the "-" is indeed emitted AT INDENT
    (`f"{indent}- {value}"`). For a MAPPING item (a tile, a source...),
    INDENT is on the contrary the column of its FIRST KEY -- the "-" then
    ends up TWO columns BEFORE (`indent - 2`), never at INDENT itself: the
    first field is rendered like the others by `_rendre_champ` (which does
    not know it is the first) then "grafted" onto a "-" added afterwards, by
    removing two leading spaces from its very first line. It is this SAME
    column (that of the first key, never that of the "-") that
    `_construire` (the reading side) must find again to recognise a note --
    see its docstring."""
    if not isinstance(item, dict):
        return [f"{' ' * indent}- {_scalaire(item)}"]
    note = item.get("note")
    lignes = ([f"{' ' * indent}# {_normaliser_note(note)}"] if note is not None else [])
    cles = [c for c in item if c != "note"]
    if not cles:
        # No contract shape that lands in a sequence is empty of every
        # field (each carries at least one Required field) -- this case
        # should never happen with data coming from schema.valider, but a
        # "- {}" stays valid, rereadable YAML rather than a crash if a
        # future optional-only field ever reached it.
        lignes.append(f"{' ' * indent}- {{}}")
        return lignes
    for i, cle in enumerate(cles):
        sub_lines = _rendre_champ(cle, item[cle], indent)
        if i == 0:
            premiere = sub_lines[0]
            sub_lines[0] = f"{' ' * (indent - 2)}- {premiere[indent:]}"
        lignes.extend(sub_lines)
    return lignes


def _normaliser_note(note: str) -> str:
    """Flattens any line break (see the KNOWN LIMIT in the module
    docstring) -- never anything else: the note's text otherwise stays
    intact, including its own "#" or ":"."""
    return note.replace("\n", " ")


def rendre(ecrans: list[dict]) -> str:
    """The complete YAML text of the export file. `ecrans`: a sequence of
    dicts, each the union of "titre" (`ConfigSubentry.title`, an HA field
    that does not belong to the contract but that the round-trip must
    preserve -- see `websocket.ws_ecrans`) and of every `schema.ECRAN` key
    the subentry carries, "note" included wherever the contract allows it:
    this function takes care of it, the caller has NOTHING to remove before
    calling `rendre`."""
    if not ecrans:
        return f"{CLE_RACINE}: []\n"
    lignes = [f"{CLE_RACINE}:"]
    for ecran in ecrans:
        lignes.extend(_rendre_element(ecran, 2))
    return "\n".join(lignes) + "\n"


def _lignes_commentaires(texte: str) -> dict[int, tuple[str, int]]:
    """Line number (0-indexed) -> (comment text, COLUMN of its "#") for
    every line that is ONLY a comment -- never an end-of-line comment, which
    `rendre` never writes and which this module therefore does not claim to
    reread.

    Review round 1: only the FIRST space following "#" (the one that
    `_rendre_element`/`_rendre_champ` always insert, `f"# {note}"`) is
    removed -- never a `.strip()` of the whole content, which would also
    have swallowed a leading or trailing space BELONGING to the note's own
    text (measured: a note "  indentee" came back "indentee"). Only the
    LINE's indentation (before the "#") is removed to compute its column --
    never that of the content after it."""
    commentaires: dict[int, tuple[str, int]] = {}
    for i, ligne in enumerate(texte.splitlines()):
        sans_tete = ligne.lstrip(" ")
        if sans_tete.startswith("#"):
            column = len(ligne) - len(sans_tete)
            contenu = sans_tete[1:]
            if contenu.startswith(" "):
                contenu = contenu[1:]
            commentaires[i] = (contenu, column)
    return commentaires


def _construire(loader: yaml.SafeLoader, noeud: yaml.Node, commentaires: dict[int, tuple[str, int]]) -> Any:
    """Builds the Python object that NOEUD represents, giving every
    MAPPING a "note" key when the line just above its start is a comment
    whose COLUMN is EXACTLY that of this mapping
    (`noeud.start_mark.column`) -- never the line alone.

    Review round 1 (Critical): verified by execution that
    `noeud.start_mark.column` is the column of the mapping's FIRST KEY,
    whether that mapping is a SEQUENCE ITEM (its column is then that of the
    content AFTER the "- ", never that of the "-" itself) or the VALUE of a
    named key (its column is then that of its own first key, never that of
    the key introducing it -- `agencement:` starts one line BEFORE
    `zones:`, the true first line of the mapping it carries). `rendre`
    ALWAYS places its comment at this SAME column (see
    `_rendre_element`/`_rendre_champ`): that is what shuts out the ORPHAN
    comment that a plain "line above" rule let through -- between
    `ecrans:` and the first `-`, for example, where no column matches any
    mapping unless it is indented at the exact column of a real screen."""
    if isinstance(noeud, yaml.MappingNode):
        result: dict[str, Any] = {}
        commentaire = commentaires.get(noeud.start_mark.line - 1)
        if commentaire is not None and commentaire[1] == noeud.start_mark.column:
            result["note"] = commentaire[0]
        for cle_noeud, value_node in noeud.value:
            cle = loader.construct_object(cle_noeud, deep=True)
            result[cle] = _construire(loader, value_node, commentaires)
        return result
    if isinstance(noeud, yaml.SequenceNode):
        return [_construire(loader, item, commentaires) for item in noeud.value]
    return loader.construct_object(noeud, deep=True)


def lire(texte: str) -> list[dict]:
    """The inverse of `rendre`: returns the sequence of dicts (title +
    screen fields, note rebuilt from the comments) that a text produced by
    `rendre` encodes. Raises `yaml.YAMLError` if TEXTE is not syntactically
    valid YAML; `ValueError` if it is but does not carry the expected shape
    (no "ecrans" key, or a value that is not a sequence of mappings) -- two
    distinct faults, never conflated under a single generic message."""
    commentaires = _lignes_commentaires(texte)
    loader = yaml.SafeLoader(texte)
    try:
        racine = loader.get_single_node()
    finally:
        loader.dispose()
    if racine is None:
        raise ValueError(f"fichier vide -- attendu une cle {CLE_RACINE!r} portant une liste d'ecrans")
    document = _construire(loader, racine, commentaires)
    if not isinstance(document, dict) or CLE_RACINE not in document:
        raise ValueError(f"cle {CLE_RACINE!r} absente -- ce fichier n'a pas ete produit par home_desk.exporter")
    ecrans = document[CLE_RACINE]
    if not isinstance(ecrans, list) or not all(isinstance(e, dict) for e in ecrans):
        raise ValueError(f"{CLE_RACINE!r} doit etre une liste d'ecrans (un mapping chacun)")
    return ecrans
