"""The guard that protects the invariant this integration can now afford:
since `schema.valider()` passes from the very creation of a subentry
(`list_fields.SECTIONS` initialises the "list" sections to `[]`, see the
task 7 report), a valid screen must STAY valid at EVERY step that
persists — never checked against ITS LOCAL shape ALONE (schema.BOUTON,
schema.AGENCEMENT, schema.VOITURE...), which does not see the CROSS
invariants between sections ("minuteur" mode without a timer slot,
blocDefaut "voiture" without a car object).

Found by review round 1 of task 7 (the Critical): neither
`list_sections.py` nor `objets.py` replayed `schema.valider()` on the
COMPLETE SCREEN before persisting — each one only checked the fragment it
had just built. Three measured paths, all silently accepted before this
module: removing the last timer slot while the "minuteur" mode stayed
active, choosing `blocDefaut: voiture` without a `voiture` object, and
REMOVING the car while `blocDefaut` was still "voiture" — that last case
even turned an ALREADY VALID screen invalid without a word, through the
very gesture task 7 had just delivered.

Reuses `err.path` directly — NOT `fautes.localiser()`, which truncates the
LAST segment for "required" (a rule designed to make `motif()` match the
ajv corpus, `contrat/cas-schema.json`: "a missing required field" designates
the OBJECT that carries it, not the field itself, irrelevant here). This
module needs ONLY the FIRST segment of the path — the faulty ROOT field —
never truncated whatever the keyword. Verified by execution: a screen where
`agencement.modes` contains "minuteur" and `minuteurs` is empty (present,
EMPTY — never absent, since `SECTIONS` initialises it) raises with
`err.path == ['minuteurs']` (`_FauteMinItems`, not truncated); a screen
where `blocDefaut` is "voiture" without a `voiture` object raises with
`err.path == ['voiture']` (`RequiredFieldInvalid`, a path with a SINGLE
segment — nothing to truncate, yet `localiser()` would have emptied it).

**Review round 2, two further corrections:**

1. **The refusal named the section where the error is DETECTED, not the
   one that can FIX it.** Removing the car while `blocDefaut` still
   requires it raised `err.path == ["voiture"]` — naming "voiture" to the
   user who has just tried to remove it, WHILE THEY ARE ALREADY ON THAT
   SECTION, where there is nothing more to fix (they have just left it).
   The only real remedy is in "Blocks and modes" (remove `blocDefaut:
   voiture`, or the "minuteur" mode). `section_courante` (supplied by the
   caller, which knows FROM WHICH section it persists) makes this
   distinction possible: if the section named by the error is the very one
   the write comes from, the guard points to "agencement" instead — the
   ONLY other possible lever for both invariants (`blocDefaut`/`modes` live
   only there). In the OPPOSITE case (the user IS in "agencement" and picks
   `blocDefaut: voiture` or the "minuteur" mode there without the object/
   the slot existing): `section_courante == "agencement"` and the named
   section ("voiture"/"minuteurs") is never equal to it — no redirection,
   naming the MISSING section remains the right advice, since the user is
   not already there.
2. **`{section}` interpolated the RAW contract identifier** ("minuteurs",
   never "Minuteurs") — the same fault that minor 6 of round 1 had already
   closed for the `SelectSelector` options, left open here because this
   path does not go through a selector. `libelles.section(hass, ...)`
   rereads the SAME translation table as the reconfiguration menu.
"""
from __future__ import annotations

from types import MappingProxyType
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigSubentry

from . import libelles, schema
from .const import ERROR_SCREEN_WOULD_BECOME_INVALID, SUBENTRY_SCREEN, VERSION_CONFIG


def noms_utilises(entry: Any, *, exclure: str | None = None) -> frozenset[str]:
    """The `nom` of the "ecran" subentries of `entry`, excluding `exclure`.

    Review round 1 (Important, task 8): `nom` is the PRIMARY key of the
    transport (`websocket.py` resolves a screen BY ITS NAME) -- two
    namesakes would make one of the two permanently unreachable.
    `config_flow._valider_identite` uses it to refuse an already taken
    `nom` before writing; lives here (not in `config_flow.py`, already at
    the 500-line limit) like the other invariants that go beyond the scope
    of a single subentry."""
    return frozenset(
        subentry.data["nom"]
        for subentry_id, subentry in entry.subentries.items()
        if subentry_id != exclure and "nom" in subentry.data
    )


def check_complete_screen(
    screen_data: dict, *, section_courante: str | None = None, hass: Any = None
) -> tuple[dict[str, str], dict[str, str]]:
    """Replays `schema.valider()` on SCREEN_DATA, the COMPLETE candidate
    screen — never a fragment. Empty (no error) if the screen holds;
    otherwise a refusal set on "base" (it is not a field OF THIS STEP that
    is at fault, it is the CONSISTENCY between sections) which NAMES the
    section to fix in `description_placeholders["section"]` — a caller
    (`persister_si_valide` below, the only one) merges this refusal into
    its own `errors`/`description_placeholders` instead of persisting.

    `section_courante`: the section FROM which this call persists (if
    known) — when the faulty section is identical to it, the real remedy is
    redirected to "agencement" (see the module docstring, point 1).
    `hass`: if supplied, the rendered name is the HUMAN label
    (`libelles.section`) rather than the raw contract identifier (point 2)
    — optional so that the unit tests of the MECHANISM (without an HA flow)
    stay simple to write."""
    try:
        schema.valider(screen_data)
    except vol.Invalid as err:
        if isinstance(err, vol.MultipleInvalid):
            err = err.errors[0]
        section_brute = str(err.path[0]) if err.path else "base"
        if section_brute == section_courante:
            section_brute = "agencement"
        section = libelles.section(hass, section_brute) if hass is not None else section_brute
        return {"base": ERROR_SCREEN_WOULD_BECOME_INVALID}, {"section": section}
    return {}, {}


def persister_si_valide(
    flow: Any,
    entry: Any,
    subentry: Any,
    complete_screen_data: dict,
    errors: dict[str, str],
    description_placeholders: dict[str, str],
    *,
    section_courante: str | None = None,
    data_updates: dict | None = None,
    titre: str | None = None,
) -> bool:
    """THE single write site of the package (review round 2): the ONLY
    call to `ConfigSubentryFlow._async_update` in all of `custom_components/
    home_desk` lives HERE — guarded by `test_garde_ecran_est_le_seul_module_a_
    appeler_async_update` (AST, same idiom as the `test_formulaire_est_le_
    seul_module_...` test guarding `async_show_form` with a `data_schema`).

    Before this round, `list_sections.py` held a SECOND site (`_persister`,
    called by `_persister_si_valide` AND, in theory, by any future code that
    would call it directly, skipping the guard): the only test that claimed
    to guarantee the uniqueness of the write site COUNTED the calls per
    file rather than checking their global UNIQUENESS — making the four
    gestures write WITHOUT going through the guard (a direct
    `_persister(...)`) left that count EQUAL on both sides, hence GREEN.
    There can no longer be a second site: this module is the only one to
    contain the name `_async_update`.

    Returns `True` and persists if `schema.valider()` accepts
    `complete_screen_data`; returns `False` and populates
    `errors`/`description_placeholders` otherwise, WITHOUT WRITING
    ANYTHING. `data_updates`, if supplied, is passed to `_async_update`
    instead of `data=complete_screen_data` (the UNION that
    `list_sections.py` uses for its "list" sections, which never removes a
    key); `titre`, if supplied, also renames the subentry's TITLE
    (`_async_update(title=...)`) — required for `async_step_identite`,
    whose `nom` must stay in sync with the title the integration page
    displays (see round 2, point 4: a rename that did not go through this
    parameter left the title diverging)."""
    errors_ecran, placeholders_ecran = check_complete_screen(
        complete_screen_data, section_courante=section_courante, hass=flow.hass
    )
    if errors_ecran:
        errors.update(errors_ecran)
        description_placeholders.update(placeholders_ecran)
        return False
    kwargs: dict[str, Any] = {}
    if titre is not None:
        kwargs["title"] = titre
    if data_updates is not None:
        flow._async_update(entry=entry, subentry=subentry, data_updates=data_updates, **kwargs)
    else:
        flow._async_update(entry=entry, subentry=subentry, data=complete_screen_data, **kwargs)
    return True


def importer_ecrans(hass: Any, entry: Any, ecrans: list[tuple[str, dict]]) -> None:
    """Task 9: the SECOND legitimate write site of this module -- the BULK
    CREATION path this guard protects, for `home_desk.importer`
    (services.py). `ecrans`: a list of (title, screen data), each
    `screen_data` already carrying every key `schema.ECRAN` expects ("note"
    included wherever the contract allows it -- it is only one more
    optional field for `schema.valider`, no special handling here).

    ATOMIC (spec, task 9 brief): the TWO passes are deliberately separate.
    The first ONLY validates, each screen against `schema.valider` -- the
    SAME authority that `check_complete_screen` invokes above, cross
    invariants included (`_invariants_croises`, schema.py). Nothing is
    written as long as a single one fails: a partial import would leave the
    configuration in a state nobody wanted and nothing names, worse than a
    refusal (brief docstring). The second builds the `ConfigSubentry`
    objects and writes only once the first has passed in full.

    ENTIRELY REPLACES the current subentries of `entry` -- never a merge.
    It is the most honest reading of an "import" symmetrical to an "export"
    which, for its part, enumerates ALL the current screens (see
    services.py): the file is the whole truth, not a delta. It is also the
    path that `home_desk.importer` serves for the plan 3c migration (seeding
    the repository's screens into a fresh installation, where no subentry
    exists yet).

    A SINGLE real write (`_async_update_entry`, one of the five gates
    guarded by `test_garde_ecran_est_le_seul_module_a_appeler_une_porte_
    d_ecriture` -- this module is exempt from it): building the complete
    dict of the new subentries first and then writing it in one go, rather
    than one `async_add_subentry`/`async_remove_subentry` per screen, is
    what makes the switch itself indivisible from the point of view of any
    code that would read `entry.subentries` in the meantime (there is no
    "meantime": a single call, synchronous, like the rest of this module).

    CONSTRAINT ADDED BY THIS MODULE, NOT BY THE CONTRACT (to be stated
    explicitly, never silently): `nom` must stay UNIQUE among `ecrans` --
    the SAME rule that `noms_utilises`/`_valider_identite` (config_flow.py)
    impose on the CREATION/RECONFIGURATION of a screen through the form.
    `contrat/ecran.schema.json` does not and cannot carry this constraint
    (each subentry is validated alone there); without it HERE, an import
    could seed two namesake screens that the FORM would never have let
    coexist -- making one of the two PERMANENTLY unreachable through
    `home_desk/ecran` (websocket.py, which always returns the first one
    found).

    Spotted in the final branch review: "the SAME rule" above was false
    until this correction -- `_valider_identite` STRIPS `nom` before
    comparing AND before persisting (round 2, task 8: "salon " otherwise
    passed the guards but was stored raw); this function compared the RAW
    `nom` values. Measured: "Salon"/"Salon " imported together both passed,
    persisted raw, and the transport served both of them -- exactly the
    regression that ruling 41 (task 8) had closed on the form side. `nom` is
    now stripped HERE TOO, before computing duplicates AND before writing
    -- the same normalised value on both sides, never two rules that look
    alike.

    `version` IS SET HERE WHEN IT IS ABSENT (review round 1, the Critical)
    -- before this correction, a screen WITHOUT `version`
    (`contrat/ecran.schema.json` never makes it required: `schema.py`,
    `vol.Optional("version")`) passed `schema.valider` (which accepts it
    absent) and was persisted as is, only to be refused on READ by
    `websocket._resoudre` ("carries no version [...] Recreate this screen")
    -- exactly the gesture the import was meant to avoid, measured on the
    three REAL screens of `app/src/ecran.ts` (none carries `version`, no
    reason for a hand-written or migrated file to carry it).
    `websocket._resoudre` already names `home_desk.importer` among the
    unguarded gates it catches on READ; this module now closes it on WRITE
    too, as early as possible. A version PRESENT but DIFFERENT from
    `VERSION_CONFIG` remains a CLEAR refusal (a real incompatibility, never
    an omission to fix on the operator's behalf) -- named, never merged
    with the absent case."""
    ecrans_normalises: list[tuple[str, dict]] = []
    for titre, screen_data in ecrans:
        screen_data = dict(screen_data)
        # Spotted in the final branch review: STRIPPED HERE, before
        # computing duplicates AND before writing -- the SAME rule as
        # `_valider_identite` (config_flow.py), never a comparison on the
        # raw value that would let "Salon"/"Salon " through as two
        # distinct names. Only a string is stripped: `schema.valider`
        # (below) already refuses an absent `nom` or one of another type,
        # so nothing here needs to assume it is present.
        if isinstance(screen_data.get("nom"), str):
            screen_data["nom"] = screen_data["nom"].strip()
        version = screen_data.get("version")
        if version is None:
            screen_data["version"] = VERSION_CONFIG
        elif version != VERSION_CONFIG:
            raise vol.Invalid(
                f"l'ecran {titre!r} porte la version {version!r}, que ce "
                f"composant ne reconnait pas (seule {VERSION_CONFIG!r} "
                "l'est) -- mettez a jour l'integration home_desk avant de "
                "reessayer, ou retirez ce champ 'version' du fichier pour "
                "laisser l'import le poser lui-meme"
            )
        ecrans_normalises.append((titre, screen_data))

    noms = [screen_data.get("nom") for _titre, screen_data in ecrans_normalises]
    doublons = sorted({nom for nom in noms if nom is not None and noms.count(nom) > 1})
    if doublons:
        raise vol.Invalid(
            f"le fichier importe porte plusieurs ecrans nommes {doublons} -- "
            "deux ecrans homonymes rendraient l'un des deux inatteignable, "
            "renommez l'un d'eux dans le fichier avant de reessayer"
        )

    # Spotted in the final branch review (second round): the RETURN value
    # of `schema.valider` was thrown away -- `screen_data` (the raw value
    # already normalised above) was persisted as is, never the version that
    # `schema.valider` VALIDATES AND NORMALISES (`_trie()` on `modulateurs`,
    # among others). Measured: the three real screens imported, then
    # opened/saved WITHOUT CHANGING ANYTHING through "Blocks and modes",
    # produced a SORTED `modulateurs` (the form, for its part, does persist
    # the validated value) -- the import alone kept the raw value. The next
    # export then carried a diff for a no-op gesture, exactly what `_trie()`
    # exists to avoid.
    ecrans_valides: list[tuple[str, dict]] = [
        (titre, schema.valider(screen_data)) for titre, screen_data in ecrans_normalises
    ]

    new_subentries: dict[str, ConfigSubentry] = {}
    for titre, screen_data in ecrans_valides:
        subentry = ConfigSubentry(
            data=MappingProxyType(screen_data),
            subentry_type=SUBENTRY_SCREEN,
            title=titre,
            unique_id=None,
        )
        new_subentries[subentry.subentry_id] = subentry
    hass.config_entries._async_update_entry(entry, subentries=new_subentries)


def migrer_sous_entree(hass: Any, entry: Any, subentry: Any, data: dict) -> None:
    """The THIRD legitimate write site of this module: the load-time shape
    migration (`migration.py`, which computes DATA and may not call a write
    gate itself).

    Deliberately NOT gated by `schema.valider`, unlike the two sites above:
    a migration lifts a screen to the current SHAPE, it does not judge it.
    A version-1 screen that was already invalid for another reason stays
    invalid, and at version 2 the transport names that precisely
    (`ecran_corrompu`) -- refusing to migrate it would leave it at version
    1, where the tablet would be told to update an integration that is
    already current (`version_inconnue`), the wrong gesture."""
    hass.config_entries.async_update_subentry(entry, subentry, data=data)
