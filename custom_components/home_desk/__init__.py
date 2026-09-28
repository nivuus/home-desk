"""Wall tablets — the screen configuration lives here, no longer in the bundle.

This component creates NO entity. It holds a configuration, validates it, and
publishes it over websocket. This is deliberate: one entity per screen would
give a state to synchronise, a history to purge and a registry to migrate, for
data that changes three times a year.

The configuration itself is structured as a single "Wall tablets" entry
(nothing in it) and N "ecran" subentries (one per tablet, of type
`const.SUBENTRY_SCREEN`) — see `config_flow.py`. `async_setup_entry`
therefore has nothing to read here: the subentries live on
`entry.subentries`, available directly through the `ConfigEntry` API with no
extra loading step.

Task 8: the TRANSPORT. `async_setup_entry` registers the two websocket
commands (`websocket.py`) and installs an ENTRY UPDATE LISTENER
(`entry.add_update_listener`) that fires `EVENEMENT_CHANGEMENT` -- never a
call scattered across a branch of the flow, which the brief explicitly
forbids ("otherwise a forgotten branch would notify nothing"). This
listener is triggered by EVERY write that goes through
`hass.config_entries.async_update_entry`/`async_update_subentry`/
`async_add_subentry` (verified by reading the container's
`config_entries.py`: all three end in `_async_save_and_notify`, which walks
`entry.update_listeners`) -- so both the CREATION of a screen
(`EcranSubentryFlow.async_step_user`) and its RECONFIGURATION
(`garde_ecran.persister_si_valide`, the package's single write site).
It only receives `(hass, entry)`, never the modified subentry: this
module therefore keeps a snapshot of the `data` ALREADY SEEN per subentry
to determine WHICH one changed, and fires ONLY for that one (the three
tablets listen on the same bus, and two of them have no reason to reload
because the third one changed).

Review round 1 (Important): the diff runs in BOTH DIRECTIONS, not only
`new name`. The most ordinary gesture there is -- RENAMING a screen --
orphaned the PREVIOUS NAME: the event only carried the name AFTER, so a
tablet still displaying the OLD name heard nothing, and its next
`home_desk/ecran` request would receive `not_found` without ever having
been told to reload. A subentry DELETION suffered from the same blind spot:
it disappears from `entry.subentries`, so the loop that visits ONLY the
PRESENT subentries would never have seen it. `_async_sur_mise_a_jour`
therefore fires the OLD name for every RENAMED (in addition to the new one)
or VANISHED subentry, and the NEW name for every created or modified
subentry.

Review round 2: the rule is DELETION and RENAME, NOT "every name that stops
being servable" -- two OTHER gestures also make names unreachable (removing
the integration, unloading the entry) and fire NOTHING. Deliberate, not a
third blind spot: an UNLOAD also goes through `async_unload_entry` during a
simple RELOAD (settings changed, Home Assistant restart) -- naively firing
at that moment would trigger the event on every restart, for screens that
have not changed at all. `websocket._subentries` already degrades cleanly
to `[]` for that case (second degradation of the spec, see websocket.py): a
tablet that queries afterwards receives an empty list or `not_found`, never
a blank wall -- but it only DISCOVERS this by querying, not through a
pushed event.

Review round 2 (Minor): the snapshot now holds `(data, titre)`, not only
`data` -- `titre` (`ConfigSubentry.title`) is a WIRE field since `ws_ecrans`
exposes it separately from `nom` (round 1), and it can be renamed
INDEPENDENTLY of `data` through Home Assistant's GENERIC gesture. Without
this second member, renaming ONLY the title (`data` unchanged) triggered no
event: a tablet then displayed a stale title indefinitely, a gap that did
not exist before `titre` became a wire field."""
from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from . import animations, migration, services, websocket
from .const import DOMAIN, EVENEMENT_CHANGEMENT
from .page import async_register_page

__all__ = ["DOMAIN", "async_setup", "async_setup_entry", "async_unload_entry"]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Component setup, once per Home Assistant run: registers the tablet
    entry document (`page.py`). A view cannot be removed, so it has no
    business in `async_setup_entry`, which runs again on every reload."""
    async_register_page(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Registers the transport (the two websocket commands, the two
    export/import services -- task 9) and the listener that fires
    `EVENEMENT_CHANGEMENT` on every write of a subentry.

    The shape migration runs FIRST (`migration.py`): the transport refuses
    any version other than `VERSION_CONFIG`, and the snapshot below must
    be taken on the migrated data -- taken before, the first unrelated
    write would fire a change event for every migrated screen."""
    migration.migrate_subentries(hass, entry)
    websocket_api.async_register_command(hass, websocket.ws_ecran)
    websocket_api.async_register_command(hass, websocket.ws_ecrans)
    websocket_api.async_register_command(hass, websocket.ws_abonner)
    websocket_api.async_register_command(hass, websocket.ws_animations)
    services.async_setup_services(hass)
    animations.async_setup_service(hass)

    # The snapshot is captured HERE (at the current state of
    # `entry.subentries`), never as `{}`: without this starting point, the
    # very FIRST write following Home Assistant's startup on an already
    # existing and UNCHANGED subentry (a mere restart, for instance a reload
    # of ANOTHER subentry) would wrongly be seen as a change.
    #
    # Review round 2 (Minor): the `(data, titre)` tuple, not only `data` --
    # see the module docstring.
    last_state: dict[str, tuple[Any, str]] = {
        subentry.subentry_id: (subentry.data, subentry.title)
        for subentry in entry.subentries.values()
    }

    async def _async_sur_mise_a_jour(hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Compares each subentry's `(data, titre)` with the state ALREADY
        SEEN, IN BOTH DIRECTIONS -- review round 1 (Important).

        First pass: every subentry SEEN before but absent now has been
        DELETED -- fires its OLD name (it stopped being servable, a tablet
        that displayed it must learn so) and forgets its snapshot (round 2:
        without this `pop`, a dead name would reappear on EVERY following
        write, forever -- not merely a memory leak).

        Second pass: every subentry whose `(data, titre)` DIFFERS from the
        snapshot -- creation (nothing seen before), change of `data`, OR
        rename of the `titre` alone (round 2: Home Assistant's GENERIC
        gesture, independent of `nom`). If `nom` changed (a RENAME), the OLD
        name is fired IN ADDITION to the new one: the tablet that displayed
        the old name would otherwise never learn it (it only listens for
        that name). Comparing the WHOLE state, not `nom` alone, remains
        necessary besides: a change that leaves the name unchanged (adding
        a tile, renaming only the title) must notify too."""
        ids_actuels = set(entry.subentries)
        for subentry_id in [i for i in last_state if i not in ids_actuels]:
            vanished_data, _titre_disparu = last_state.pop(subentry_id)
            nom_disparu = vanished_data.get("nom")
            if nom_disparu is not None:
                hass.bus.async_fire(EVENEMENT_CHANGEMENT, {"nom": nom_disparu})

        for subentry in entry.subentries.values():
            previous_state = last_state.get(subentry.subentry_id)
            etat_apres = (subentry.data, subentry.title)
            if previous_state == etat_apres:
                continue
            last_state[subentry.subentry_id] = etat_apres
            nom_apres = subentry.data.get("nom")
            previous_name = previous_state[0].get("nom") if previous_state is not None else None
            if previous_name is not None and previous_name != nom_apres:
                hass.bus.async_fire(EVENEMENT_CHANGEMENT, {"nom": previous_name})
            hass.bus.async_fire(EVENEMENT_CHANGEMENT, {"nom": nom_apres})

    entry.async_on_unload(entry.add_update_listener(_async_sur_mise_a_jour))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unloads the entry. Unregisters the two services (task 9) -- unlike
    the websocket commands, which Home Assistant offers no way to remove
    (see websocket.py), `hass.services.async_remove` exists:
    `services.async_unload_services` makes use of it, symmetrical to
    `async_setup_services`."""
    services.async_unload_services(hass)
    animations.async_unload_service(hass)
    return True
