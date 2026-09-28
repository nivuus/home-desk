"""The two services that move the configuration out of / into the HA store
(`.storage`, invisible to git) to/from a YAML file in the `config/`
directory -- `home_desk.exporter` writes it, `home_desk.importer` reads it
back.

This is the answer to two of the five regressions frankly named in the
README: "the config is no longer versioned by default" (exporter catches
up ON DEMAND, never automatically -- nothing here runs at
`async_setup_entry`) and "the reasoning leaves the repository" (the `note`
fields, living in `.storage`, become COMMENTS again in the exported
file -- see `yaml_ecrans.py`, which carries the whole format).

`importer` is also the entry point of the plan 3c migration: seeding, in a
fresh installation where no subentry exists yet, the screens currently
hardcoded in `app/src/ecran.ts`. That is why it is ATOMIC (see
`garde_ecran.importer_ecrans`, which carries the guarantee) -- it is
exactly the moment where a partial write would be the costliest to
diagnose, just before the literals are removed from the repository.

Neither of them takes a field: the RESPONSIBILITY of choosing WHAT to
export/import would remain to be added if this component ever had to
manage several installations at once -- `single_config_entry: true`
(manifest.json) makes it useless today, a single entry always exists
when these services are registered (see `async_setup_services`, called
by `__init__.async_setup_entry`, never before an entry exists)."""
from __future__ import annotations

import pathlib

import voluptuous as vol
import yaml

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError

from . import garde_ecran, yaml_ecrans
from .const import DOMAIN, SCREENS_EXPORT_FILE, SERVICE_EXPORTER, SERVICE_IMPORTER


def _read_file(chemin: pathlib.Path) -> str:
    """Blocking I/O, never called directly from a coroutine -- always
    through `hass.async_add_executor_job` (see the two services below).
    In PRODUCTION, Home Assistant rejects a blocking call made FROM the
    event loop.

    Review round 1 (Important, ninth lying docstring of the project): the
    previous version claimed "the `pytest-homeassistant-custom-component`
    tests check it" -- FALSE, measured by inlining this call WITHOUT
    `async_add_executor_job`: the suite AT THE TIME stayed entirely green
    (the exact count names nothing reproducible once the suite itself has
    changed). This production safeguard (`hass.
    verify_event_loop_thread`) is DISABLED for this suite
    (`skip_for_tests=True`, specific to Home Assistant's test idiom) --
    so the suite can NOT see a regression on this point through that
    path. What `test_services.py` guards instead: a probe that checks
    that `hass.async_add_executor_job` is REALLY called for
    `_read_file`/`_write_file` (`test_exporter_et_importer_font_
    leur_ES_hors_de_la_boucle_d_evenements`) -- a proof about the CODE, not
    about the HA safeguard itself, which no suite in this repository can
    exercise."""
    return chemin.read_text(encoding="utf-8")


def _write_file(chemin: pathlib.Path, texte: str) -> None:
    """The write counterpart of `_read_file`, same rule -- and the same
    limit on what this repository can prove, see its docstring."""
    chemin.write_text(texte, encoding="utf-8")


def _entree(hass: HomeAssistant):
    """The single "Tablettes murales" entry. Never `[0]` without a guard
    elsewhere in this package (see `websocket._subentries`) -- but HERE,
    direct indexing is safe: these two services are registered ONLY by
    `async_setup_entry` (so after the entry exists) and unregistered by
    `async_unload_entry` (so before it disappears) -- see
    `async_setup_services`/`async_unload_services`."""
    return hass.config_entries.async_entries(DOMAIN)[0]


async def _async_exporter(call: ServiceCall) -> None:
    """`home_desk.exporter`: writes ALL the entry's current screens to
    `config/home_desk_ecrans.yaml`, `note` as comments (see
    `yaml_ecrans.rendre`). `titre` (`ConfigSubentry.title`) is included
    alongside the contract fields -- renaming the title alone (websocket.py
    documents that possibility, independent of `nom`) must survive a round
    trip, not only the fields of `schema.ECRAN`."""
    hass = call.hass
    entry = _entree(hass)
    ecrans = [{"titre": subentry.title, **subentry.data} for subentry in entry.subentries.values()]
    texte = yaml_ecrans.rendre(ecrans)
    chemin = pathlib.Path(hass.config.path(SCREENS_EXPORT_FILE))
    await hass.async_add_executor_job(_write_file, chemin, texte)


async def _async_importer(call: ServiceCall) -> None:
    """`home_desk.importer`: reads `config/home_desk_ecrans.yaml` back and
    REPLACES all of the entry's subentries with its content -- see
    `garde_ecran.importer_ecrans` for the ATOMIC guarantee (all or
    nothing) and why it is a replacement, never a merge.

    Three distinct faults, never conflated under a generic message: the
    file is unreadable (`OSError` -- missing, permissions...), it is not
    valid YAML or does not have the expected shape
    (`yaml.YAMLError`/`ValueError`, see `yaml_ecrans.lire`), or it is but
    at least one screen does not honour the contract, or carries a
    duplicate `nom` (`vol.Invalid`, see `garde_ecran.importer_ecrans`).
    Each one becomes a `HomeAssistantError` -- never caught wider than
    these three types, never swallowed: an import that fails must say so,
    not carry on silently with a half-read configuration."""
    hass = call.hass
    entry = _entree(hass)
    chemin = pathlib.Path(hass.config.path(SCREENS_EXPORT_FILE))
    try:
        texte = await hass.async_add_executor_job(_read_file, chemin)
    except OSError as err:
        raise HomeAssistantError(f"impossible de lire {chemin} : {err}") from err
    try:
        ecrans_bruts = yaml_ecrans.lire(texte)
    except (yaml.YAMLError, ValueError) as err:
        raise HomeAssistantError(f"{chemin} n'est pas exploitable : {err}") from err

    ecrans: list[tuple[str, dict]] = []
    for brut in ecrans_bruts:
        screen_data = dict(brut)
        titre = screen_data.pop("titre", None)
        if titre is None:
            raise HomeAssistantError(
                f"{chemin} : un ecran ne porte pas de champ 'titre' -- "
                "ce fichier n'a pas ete produit par home_desk.exporter"
            )
        ecrans.append((titre, screen_data))

    try:
        garde_ecran.importer_ecrans(hass, entry, ecrans)
    except vol.Invalid as err:
        raise HomeAssistantError(f"import refuse, rien n'a ete ecrit : {err}") from err


_SCHEMA_SANS_CHAMP = vol.Schema({})
# Review round 1 (Minor): neither service takes a field (see the module
# docstring) -- without a SCHEMA saying so, Home Assistant silently
# SWALLOWS any unknown field (`{"chemin": "..."}`, for example) instead of
# rejecting it: a dead button in miniature, the kind of silent refusal
# this repository forbids itself elsewhere. `vol.Schema({})` EXPLICITLY
# rejects every key.
#
# Review round 2: round 1 stopped at "checked by running it" -- a
# throwaway probe, true at the time and then guarded by NOTHING (passing
# `extra=vol.ALLOW_EXTRA` instead left the suite green).
# `test_exporter_et_importer_refusent_un_champ_inconnu` (test_services.py)
# now locks this rule with a test, not only with this comment.


def async_setup_services(hass: HomeAssistant) -> None:
    """Registers the two services -- called by `__init__.async_setup_entry`,
    so after the entry exists (see `_entree`)."""
    hass.services.async_register(DOMAIN, SERVICE_EXPORTER, _async_exporter, schema=_SCHEMA_SANS_CHAMP)
    hass.services.async_register(DOMAIN, SERVICE_IMPORTER, _async_importer, schema=_SCHEMA_SANS_CHAMP)


def async_unload_services(hass: HomeAssistant) -> None:
    """The counterpart of `async_setup_services` -- called by
    `__init__.async_unload_entry`, symmetrically. Reloading the entry
    (options changed, restart) unloads then reloads: without this removal,
    `async_register` would be called again on an ALREADY registered
    service -- harmless (Home Assistant silently replaces the handler),
    but this module prefers to say so rather than leave it implicit."""
    hass.services.async_remove(DOMAIN, SERVICE_EXPORTER)
    hass.services.async_remove(DOMAIN, SERVICE_IMPORTER)
