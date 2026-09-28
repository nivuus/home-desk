"""The transport: three websocket commands, and nothing else.

This module is what finally lets a tablet receive its configuration --
tasks 1 to 7 only delivered the INPUT side (the integration, its sections,
its valid-screen guard). Two commands:

`home_desk/ecran` { "nom": "salon" } -> the RESOLVED AND VALID screen,
`version` included. Rejects with `ERROR_SCREEN_NOT_FOUND` if no subentry
carries that `nom` (an empty object would be a screen WITH NO TILES,
indistinguishable from an absence for the application); rejects with
`ERROR_VERSION_UNKNOWN` if the stored subentry carries a `version` this
component does not recognise (fourth degradation, spec decision 10);
rejects with `ERROR_SCREEN_CORRUPT` if the version is known but the DATA
no longer honours the contract -- a code DISTINCT from the previous one,
and from the generic `invalid_format` Home Assistant produces for a
malformed CLIENT request (see review round 1, Critical + Point 4: both
shared the same code before this fix, making the two faults
indistinguishable for `app/src/`).

`home_desk/ecrans` -> [{ "nom": ..., "titre": ... }, ...], one per
subentry. IT IS NOT A CONVENIENCE: it is what the application shows when
`?ecran=` is missing or unknown, the FIRST of the four degradations.
Without it, that case has no way out other than a blank wall or a guessed
screen, and both are forbidden -- so it does NOT revalidate each subentry
(a single corrupt screen must never prevent the tablets from choosing
among the others). Also returns `[]` if the integration has no entry at
all any more (SECOND degradation named by the spec: HA reachable, no
screen configured -- including right after the integration is removed,
since nothing unregisters these commands at `async_unload_entry`: Home
Assistant offers no inverse of `async_register_command`).

`home_desk/abonner` { "nom": "salon" } -> a SUBSCRIPTION: one `event`
message `{"nom": ...}` each time `EVENEMENT_CHANGEMENT` is fired for that
screen, until `unsubscribe_events` names its id. It exists because the
tablets log in as a NON-ADMIN user, and Home Assistant refuses such a user
`subscribe_events` on any event outside its fixed SUBSCRIBE_ALLOWLIST
(measured on 2026-09-28: "Refusing to allow Tablet to subscribe to event
home_desk_config_changed" at every tablet start) -- so live editing never
reached the wall. A command registered without `require_admin` is open to
any authenticated user, which is the door Home Assistant intends an
integration to use for its own events. The filter by name is done HERE:
three tablets share the bus, and each must only hear about its own screen.

All three commands are registered by `__init__.async_setup_entry`; the
`EVENEMENT_CHANGEMENT` event is fired by an ENTRY UPDATE LISTENER, not by
a call from this module -- see `__init__.py`.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import Event, HomeAssistant, callback

from . import schema
from .const import (
    DOMAIN,
    ERROR_SCREEN_CORRUPT,
    ERROR_SCREEN_NOT_FOUND,
    ERROR_VERSION_UNKNOWN,
    EVENEMENT_CHANGEMENT,
    VERSION_CONFIG,
    WS_ABONNER,
    WS_ECRAN,
    WS_ECRANS,
)


class _VersionInconnue(Exception):
    """Raised by `_resoudre` when the stored `version` does not match
    `VERSION_CONFIG` -- a clean refusal, never a half read.

    `raison` distinguishes two cases that do NOT call for the same action
    (review round 1, Minor): "absente" (no `version` at all -- a config
    PREDATING version tracking, which no version of this component ever
    wrote; "update the integration" would be a useless action there, the
    integration already being newer than the data) versus "future" (a
    `version` that is PRESENT but different from `VERSION_CONFIG` -- the
    only one that truly calls for updating the component)."""

    def __init__(self, version: Any, raison: str) -> None:
        super().__init__(version, raison)
        self.version = version
        self.raison = raison


class _EcranCorrompu(Exception):
    """Raised by `_resoudre` when the `version` is KNOWN but
    `schema.valider()` still rejects the data -- the third path named by
    the `_resoudre` docstring (restored backup, direct import) met for
    real, not only in theory."""

    def __init__(self, cause: vol.Invalid) -> None:
        super().__init__(str(cause))
        self.cause = cause


def _subentries(hass: HomeAssistant) -> list[Any]:
    """The "ecran" subentries of the "Tablettes murales" entry, or `[]`
    if it no longer exists (integration removed afterwards: nothing
    unregisters these commands, `async_unload_entry` has no means to --
    see the module docstring). Review round 1 (Important): the previous
    version indexed `[0]` without a guard, with a docstring claiming an
    empty list was impossible -- a false claim, measured: an uncaught
    `IndexError` crashed the command there (`unknown_error` on the client
    side, full traceback on the server side) exactly in the case the
    SECOND degradation (spec) must cover."""
    entrees = hass.config_entries.async_entries(DOMAIN)
    if not entrees:
        return []
    return list(entrees[0].subentries.values())


def _trouver(hass: HomeAssistant, nom: str) -> Any | None:
    """The subentry whose `data["nom"]` equals `nom`, or None."""
    for subentry in _subentries(hass):
        if subentry.data.get("nom") == nom:
            return subentry
    return None


def _resoudre(subentry: Any) -> dict:
    """Returns the screen as the application will receive it: valid,
    `version` included.

    VALIDATED ON READ, and not only on write. A subentry may have been
    written by an earlier version of the schema, restored from an HA
    backup, or imported by `home_desk.importer` -- three paths that do not
    go through the form. Serving without revalidating means trusting three
    doors of which only one is guarded.

    The `version` is checked FIRST, and separately from
    `schema.valider()`: the contract only accepts `VERSION_CONFIG` (through
    `schema._const`, tied to that same constant), so a FUTURE version
    would raise a `vol.Invalid` there anyway -- but a generic one, without
    the distinct `version_inconnue` code the fourth degradation requires
    (spec, decision 10).

    Review round 1 (Critical): the first version of this module let
    `schema.valider()` propagate its BARE `vol.Invalid` up to the command,
    where it was confused with the generic `invalid_format` of a malformed
    CLIENT request (measured side by side: same code, same message grammar
    for "sources missing in the subentry" and "nom missing in the websocket
    message"). Caught HERE and re-raised as `_EcranCorrompu`, so that
    `ws_ecran` gives it a DEDICATED code."""
    version = subentry.data.get("version")
    if version is None:
        raise _VersionInconnue(version, "absente")
    if version != VERSION_CONFIG:
        raise _VersionInconnue(version, "future")
    try:
        return schema.valider(dict(subentry.data))
    except vol.Invalid as err:
        raise _EcranCorrompu(err) from err


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ECRAN,
        vol.Required("nom"): str,
    }
)
@callback
def ws_ecran(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """`home_desk/ecran`: the RESOLVED AND VALID screen named `nom`."""
    subentry = _trouver(hass, msg["nom"])
    if subentry is None:
        connection.send_error(
            msg["id"],
            ERROR_SCREEN_NOT_FOUND,
            f"aucun ecran nomme {msg['nom']!r} -- voir home_desk/ecrans pour "
            "la liste des ecrans configures, ou creez-le depuis Parametres > "
            "Appareils et services > Tablettes murales",
        )
        return
    try:
        ecran = _resoudre(subentry)
    except _VersionInconnue as err:
        if err.raison == "absente":
            message = (
                f"la sous-entree de {msg['nom']!r} ne porte aucune version -- "
                "elle est anterieure au suivi de version de ce composant et "
                "n'a jamais ete ecrite par lui. Recreez cet ecran depuis "
                "Parametres > Appareils et services > Tablettes murales"
            )
        else:
            message = (
                f"la sous-entree de {msg['nom']!r} porte la version "
                f"{err.version!r}, que ce composant ne reconnait pas -- "
                "mettez a jour l'integration home_desk avant de servir cet "
                "ecran"
            )
        connection.send_error(msg["id"], ERROR_VERSION_UNKNOWN, message)
        return
    except _EcranCorrompu as err:
        connection.send_error(
            msg["id"],
            ERROR_SCREEN_CORRUPT,
            f"la configuration stockee de {msg['nom']!r} ne respecte plus le "
            f"contrat ({err.cause}) -- corrigez-la depuis Parametres > "
            "Appareils et services > Tablettes murales, ou restaurez une "
            "sauvegarde anterieure",
        )
        return
    connection.send_result(msg["id"], ecran)


@websocket_api.websocket_command({vol.Required("type"): WS_ECRANS})
@callback
def ws_ecrans(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """`home_desk/ecrans`: the list `[{"nom": ..., "titre": ...}, ...]` --
    the first of the four degradations (see the module docstring), never
    revalidated screen by screen: one corrupt screen must not deprive the
    tablets of the choice of the others. `nom` (entered data) and `titre`
    (`ConfigSubentry.title`, a generic HA property, renameable
    independently of `nom` by the user from the integration page) are two
    distinct fields, even though they are kept in sync by
    `config_flow.async_step_identite` -- nothing stops the user from
    renaming the TITLE alone through Home Assistant's generic action."""
    connection.send_result(
        msg["id"],
        [
            {"nom": subentry.data.get("nom"), "titre": subentry.title}
            for subentry in _subentries(hass)
        ],
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ABONNER,
        vol.Required("nom"): str,
    }
)
@callback
def ws_abonner(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """`home_desk/abonner`: relays `EVENEMENT_CHANGEMENT` for the screen
    `nom` only. The listener is stored in `connection.subscriptions`, so
    `unsubscribe_events` and the closing of the socket both remove it --
    the same bookkeeping as Home Assistant's own `subscribe_events`."""
    nom = msg["nom"]

    @callback
    def _pour_cet_ecran(data: dict) -> bool:
        return data.get("nom") == nom

    @callback
    def _relayer(event: Event) -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"nom": event.data.get("nom")}))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(
        EVENEMENT_CHANGEMENT, _relayer, event_filter=_pour_cet_ecran)
    connection.send_result(msg["id"])
