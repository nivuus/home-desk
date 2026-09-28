"""The names this component publishes, and which must exist only here.

Hardcoding them at every site is making an appointment with a typo that
no test sees: a misnamed websocket command does not raise, it is simply
never called.

Caught in the final branch review, TWICE in a row on this very
paragraph: "each one is read by at least two modules" was false
(first correction: "most of them" -- ALSO FALSE, measured again, this
time by a script that actually counts the readers of each constant in
`custom_components/home_desk/*.py` rather than estimating: of the 40
constants in this file, 30 have only ONE Python reader, 10 have two or
more -- 25%, not "most of them"). The justification does not depend on
that count, though, and still holds for the 30: each one is a PUBLISHED
CONTRACT outside this Python module -- a websocket error code that
`app/src/connexion.ts` reads by its VALUE, a file name an OPERATOR goes
looking for by hand in `config/`, a service name called by a YAML
automation that never reads this file. It is THAT boundary that
justifies a named constant, never the number of internal Python readers
-- a count which, having already changed value twice in this one file,
does not deserve a third attempt."""

DOMAIN = "home_desk"

# The version of the SHAPE of a screen configuration, not of the component.
# The application flatly refuses a config whose version it does not know
# (fourth degradation, spec decision 10): this is the number it compares.
# It only increases if the shape stops being readable by the previous version.
VERSION_CONFIG = 1

# The subentry type. One "Tablettes murales" entry, N "ecran" subentries
# — adding a fourth tablet is the same operation as for the first three.
SUBENTRY_SCREEN = "ecran"

WS_ECRAN = f"{DOMAIN}/ecran"
WS_ECRANS = f"{DOMAIN}/ecrans"
# Subscription to EVENEMENT_CHANGEMENT for ONE screen. Home Assistant only
# lets a non-admin user `subscribe_events` to a fixed allowlist
# (websocket_api SUBSCRIBE_ALLOWLIST), and the tablets log in as a
# non-admin user: this command is the integration's own door to the event.
WS_ABONNER = f"{DOMAIN}/abonner"

# The HTTP path of the tablet entry document (`page.py`). It is the
# `startURL` typed into each tablet's Fully Kiosk, with `?ecran=<nom>`.
URL_PAGE = f"/{DOMAIN}/tablette"

# Fired on the bus at every write of a subentry, payload: the name of the
# screen. This is what lets a tablet reload itself without polling.
EVENEMENT_CHANGEMENT = f"{DOMAIN}_config_changed"

# The error codes of the "ecran" subentry form (config_flow.py).
# translations/fr.json and translations/en.json carry the SAME string as a
# JSON key — a JSON file cannot import a Python constant, so the link is
# nailed down by a test that reads the file and indexes it with THESE
# constants (tests/composant/test_config_flow.py): renaming one without the
# other breaks the test rather than leaving the display silently broken.
ERROR_HEIGHT_OUT_OF_BOUNDS = "hauteur_hors_bornes"
ERROR_BUDGET_UNTENABLE = "budget_intenable"

# Fallback refusal of a field of an item of a "list" section (command
# tile, ambiance row, "home extras" tile, watched opening, summary line —
# the five sections of `list_fields.SECTIONS`): the SAME validation that
# schema.valider() applies to the complete screen (schema.BOUTON /
# schema.SYNTHESE / schema.ENTITE, via list_sections.py), replayed field by
# field to refuse AT INPUT TIME rather than at write time.
#
# Review round 4: until then, THIS code ALWAYS carried the message, and its
# template ("Ce champ n'est pas valide : {motif}.") interpolated the RAW
# `schema.motif()` — a JSON Schema keyword meant for the ajv corpus, never
# for a human ("Ce champ n'est pas valide : : required.", among others, on
# the MOST common field of the MOST common section; measured on four
# paths). Exactly the gibberish that round 3 thought it had closed by
# fixing it ONLY for `service`. `list_sections.py` now translates each JSON
# Schema keyword into a DEDICATED code (below, `_ERROR_BY_KEYWORD`); THIS
# code only remains the FALLBACK for a keyword that neither of the two
# shapes ($defs/bouton, $defs/synthese) can produce today (`contains`,
# specific to $defs/agencement). Its message is now STATIC, WITHOUT
# `{motif}`: the leak therefore cannot reappear even for an unforeseen
# keyword.
ERROR_FIELD_INVALID = "champ_invalide"

# One code per JSON Schema keyword reachable by $defs/bouton,
# $defs/synthese and $defs/entite (the three shapes a "list" section
# validates) — each one a translated SENTENCE that says what to do, never
# the raw keyword. `list_sections.py` picks them via `_ERROR_BY_KEYWORD`,
# derived from `fautes.localiser()`.
ERROR_FIELD_REQUIRED = "champ_requis"
ERROR_FIELD_INVALID_FORMAT = "champ_format_invalide"
ERROR_FIELD_INVALID_TYPE = "champ_type_invalide"
ERROR_FIELD_TOO_SHORT = "champ_trop_court"
ERROR_FIELD_VALUE_NOT_ALLOWED = "champ_valeur_non_autorisee"
ERROR_FIELD_VALUE_FIXED = "champ_valeur_figee"
ERROR_FIELD_TOO_FEW_ITEMS = "champ_trop_peu_d_elements"
ERROR_FIELD_TOO_MANY_ITEMS = "champ_trop_d_elements"
ERROR_FIELD_DUPLICATE = "champ_doublon"
ERROR_FIELD_UNKNOWN = "champ_inconnu"

# Review round 4 (minor): `libelle` ($defs/bouton) and `texte`
# ($defs/synthese) are required and non-empty in the contract (minLength: 1),
# but only the LENGTH is checked there (spaces count) — a label "   "
# passed and was PERSISTED, the dead button this repository forbids itself.
# Same doctrine as `nom` (ERROR_NAME_EMPTY above, round 1): checked HERE,
# never in schema.py (which must stay faithful to the contract shared with
# ajv, where spaces do count as characters).
ERROR_FIELD_EMPTY = "champ_vide"

# Review round 1 (task 6): debt from task 5 fixed here. An empty `nom`
# passed (SCHEMA_IDENTITE only declares a `str`, unbounded) and was
# PERSISTED although the contract requires `minLength: 1` — now refused AT
# INPUT TIME, same rule as the two errors above.
ERROR_NAME_EMPTY = "nom_vide"

# Review round 2 (task 6): submitting the menu of a "list" section
# (list_sections.py, `_async_step_section`) without ticking the "new item"
# checkbox NOR choosing an existing item redisplayed the form SILENTLY, without saying
# why nothing had happened -- the same kind of mute refusal that the three
# errors above exist to avoid, missing here since round 1.
ERROR_SELECTION_MISSING = "selection_manquante"

# Review round 3 (task 6): round 2 had fixed the SILENCE of a half-filled
# `service_domaine`/`service_action` by refusing it -- but via
# `ERROR_FIELD_INVALID` + `schema.motif()`, which names ONLY JSON Schema
# vocabulary meant for the ajv corpus ("minItems"), never a human: the
# message actually displayed was "Ce champ n'est pas valide : : minItems."
# -- double colon, no field highlighted (set on "base"), no action named.
# Dedicated code, set on the field that is ACTUALLY empty, message that
# says what to do.
ERROR_SERVICE_INCOMPLETE = "service_incomplet"

# The four actions on an item of a "list" section (list_sections.py) — an
# item already chosen. Adding a BLANK item is not one of them: it is the
# "new item" checkbox of the section form, not an action value (review
# round 1: the old "add" action sentinel shared the "choix" field with the
# indexes of real items, which prevented cleanly translating its "Add"
# option - removed).
ACTION_SAVE = "enregistrer"
ACTION_MOVE_UP = "monter"
ACTION_MOVE_DOWN = "descendre"
ACTION_DELETE = "supprimer"

# Task 7: four more sections (media sources and timers/timer labels, two
# "list" sections that join list_fields.SECTIONS; agencement and voiture,
# two "object" sections carried by objets.SectionsObjetMixin), and the two
# cross rules the contract CANNOT carry (the third cross invariant, placed
# in list_sections._async_step_section_element; the budget check MODE BY
# MODE, placed in objets.SectionsObjetMixin.async_step_agencement).

# The counterpart of `list_sections._ERROR_BY_KEYWORD["contains"]`
# (schema.AGENCEMENT: zones must contain "commandes", modes must contain
# "defaut"). STATIC message (like ERROR_FIELD_INVALID): `vol.ContainsInvalid`
# carries no data that would tell which of the two lists failed beyond the
# FIELD already set by `fautes.localiser()` ("zones" or "modes").
ERROR_FIELD_ITEM_REQUIRED = "champ_element_requis"

# The counterpart of ERROR_SERVICE_INCOMPLETE for the
# `allumee_entite`/`allumee_etats` pair of $defs/source
# (list_fields_sources.AllumeeIncomplete): same regime as a half-filled
# service, but a DEDICATED message — the one of ERROR_SERVICE_INCOMPLETE
# explicitly names "the two fields of the service", which would be a lie
# displayed on a pair that calls no service.
ERROR_POWERED_ON_INCOMPLETE = "allumee_incomplet"

# The THIRD cross invariant (inherited from plan 2, deliberately never put
# in the contract): a `vue: '#recette'` tile on a screen whose
# `agencement.modes` does not contain `recette`.
#
# Review round 1 (Minor): the first version of this comment (and of the
# displayed message) claimed the tile "would do nothing" — FALSE, checked
# against `app/src/demarrage.ts` (the `hashchange` listener opens
# `#recette` on the hash ALONE, line ~1067, without ever reading
# `agencement.modes`): the tile OPENS the view normally. What is actually
# missing without the "recette" mode is the RESUME POINT on the home view:
# `modes.ts` (CONDITIONS.recette = c.recetteEnCours) only engages the
# collapsed recipe block IF "recette" is among the modes ITERATED by
# `agencement.modes` — without it, leaving the view without "Terminer"
# leaves no visible trace on the home view, the only function this mode
# exists to carry. The JSON schema judges a FINISHED screen; this refusal
# judges an input IN PROGRESS, and it alone can suggest the remedy (go to
# "Blocs et modes" and add the "recette" mode there): a JSON Schema
# if/then cannot perform that last step. Set by
# `list_sections._async_step_section_element` on tiles ($defs/bouton),
# checked against `agencement.modes` AS ALREADY PERSISTED.
ERROR_RECIPE_WITHOUT_MODE = "recette_sans_mode"

# The budget checked MODE BY MODE (objets.py,
# SectionsObjetMixin.async_step_agencement): task 5 could only judge the
# "defaut" mode (the cheapest), for lack of data — here, `agencement.modes`
# finally exists. Refused on the MOST EXPENSIVE of the entered modes, and
# NAMES it in `description_placeholders` ("mode") in addition to the
# overflow ("debordement"): "this screen overflows by X px" does not say
# what to change, "the minuteur mode overflows by X px" does. A code
# DISTINCT from ERROR_BUDGET_UNTENABLE (the identity only checks one fixed
# mode, "defaut"; here, several modes are at stake and the one that fails
# must be named) — the two messages therefore necessarily differ.
ERROR_BUDGET_UNTENABLE_MODE = "budget_intenable_mode"

# Caught in the final branch review: `alerte`, in `agencement.modes`, must
# be its FIRST item (spec of 2026-09-12, "an alert yields to nothing") --
# checked by `schema._alerte_en_tete()`, also carried by the JSON contract
# (`contrat/ecran.schema.json`, root `allOf`). NOT attributed via
# `list_sections._ERROR_BY_KEYWORD` (unlike the other agencement
# refusals): the exception (`fautes._FauteAlertePremiere`) INHERITS the
# "const" keyword to share its pattern with ajv (see schema.py), a keyword
# already taken by an unrelated message (ERROR_FIELD_VALUE_FIXED) --
# SectionsObjetMixin.async_step_agencement (objets.py) therefore tells this
# refusal apart by the TYPE of the exception, not by its keyword.
ERROR_ALERT_NOT_FIRST = "alerte_pas_en_tete"

# Review round 1 (Critical): neither list_sections.py nor objets.py replayed
# schema.valider() on the COMPLETE SCREEN before persisting — each only
# checked ITS OWN shape (schema.BOUTON, schema.AGENCEMENT,
# schema.VOITURE...), blind to the CROSS invariants between sections
# ("minuteur" mode without a slot, blocDefaut "voiture" without a voiture
# object). Since the subentry is valid FROM ITS CREATION (SECTIONS
# initialises the nine "list" sections to [], so "sources" is no longer
# missing), this integration can afford the reverse invariant: a valid
# screen MUST STAY valid at every step that persists.
# `garde_ecran.check_complete_screen` makes that hold; this code names the
# offending section (`description_placeholders["section"]`, a ROOT field of
# the contract - "minuteurs", "voiture", "agencement"...) rather than
# letting a screen that became invalid persist silently.
ERROR_SCREEN_WOULD_BECOME_INVALID = "ecran_deviendrait_invalide"

# Task 8: the error codes of the websocket TRANSPORT (websocket.py), never
# those of an input form -- ERROR_SCREEN_NOT_FOUND is the refusal of
# `home_desk/ecran` when no subentry carries the requested `nom` (an empty
# object would be a screen WITHOUT TILES, indistinguishable from an
# absence); ERROR_VERSION_UNKNOWN is its refusal when the stored subentry
# carries a `version` this component does not recognise -- the fourth
# degradation (spec, decision 10), set at WRITE time by the flow
# (VERSION_CONFIG above) and now CHECKED AT READ time, here.
#
# Review round 1 (Point 2): these wire values are a PUBLISHED CONTRACT
# towards `app/src/` (TypeScript, which cannot import this module) -- at
# least one test must pin them by their LITERAL, never only through the
# constant (otherwise renaming the constant breaks no test, as round 1
# measured).
ERROR_SCREEN_NOT_FOUND = "not_found"
ERROR_VERSION_UNKNOWN = "version_inconnue"

# Review round 1 (Critical + Point 4): distinct from ERROR_VERSION_UNKNOWN.
# A subentry whose VERSION is known but whose DATA is otherwise invalid
# (restored backup, direct import -- two of the three doors that the
# docstring of `websocket._resoudre` names, neither guarded by the form)
# must NEVER share the generic `invalid_format` code that Home Assistant
# produces for a malformed CLIENT request (`nom` missing from the websocket
# message, for example): the two refusals, measured side by side, returned
# the SAME `{"code": "invalid_format", "message": "required key not
# provided at '...'"}"` -- a client cannot tell "my request is wrong" from
# "the stored config is rotten". `websocket.ws_ecran` now assigns this
# DEDICATED code as soon as `schema.valider()` fails on a version that is
# nonetheless KNOWN.
ERROR_SCREEN_CORRUPT = "ecran_corrompu"

# Review round 1 (Important): `nom` is the PRIMARY key of the transport
# (websocket.py resolves a screen BY ITS NAME) -- nothing in the contract
# requires it to be unique (schema.py carries no cross-screen constraint,
# and has no means to: each subentry is validated alone), but two screens
# with the same name would make one of them PERMANENTLY unreachable through
# `home_desk/ecran` (which always returns the FIRST one found) and
# `home_desk/ecrans` would show two strictly identical lines for them.
# It is a rule of the FLOW (config_flow.py), not of the contract -- set at
# CREATION and at RECONFIGURATION of the identity (`_valider_identite`).
ERROR_NAME_ALREADY_USED = "nom_deja_utilise"

# Task 9: the two services that move the configuration out of / into the
# HA store (`.storage`) to / from a YAML file in the `config/` directory --
# `services.py`, described for the interface by `services.yaml` and named
# for humans by translations/*.json ("services" key). `importer` is also
# the entry point of the plan 3c migration (the repository's current
# screens, hardcoded today in app/src/ecran.ts, will enter through it as a
# file EXPORTED once by hand).
SERVICE_EXPORTER = "exporter"
SERVICE_IMPORTER = "importer"

# The path, RELATIVE to `config/` (`hass.config.path(...)`), of the file
# that `home_desk.exporter` writes and `home_desk.importer` reads back --
# published here so that neither one retypes it, and so that a test can
# pin it without reading the body of the two services.
SCREENS_EXPORT_FILE = "home_desk_ecrans.yaml"
