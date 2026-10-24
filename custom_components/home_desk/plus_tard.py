""""Plus tard": the stack cards hidden on every tablet for `SNOOZE_S`.

House-wide state, so ONE `Snoozes` per Home Assistant run (`hass.data`), not
one per config entry: it outlives an entry reload, and so do the tablets'
subscriptions to it (their socket stays open across a reload, and a tablet
only subscribes again after a reconnection). What the entry owns is the
expiry timer and the stop listener: `async_start` arms them, `async_stop`
cancels them and writes the set to disk.

Kept in a `Store` (`.storage/home_desk.plus_tard`), not in a subentry: a
snooze is not a configuration write, so it never goes through
`garde_ecran.py` and never reloads the entry. End times are UTC ISO 8601."""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
import re

import voluptuous as vol

from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_point_in_utc_time
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DATA_SNOOZES, DOMAIN, SNOOZE_KEY_MAX, SNOOZE_S

STORAGE_KEY = f"{DOMAIN}.plus_tard"
STORAGE_VERSION = 1

# `<type>:<id>`, as the cards build it (`app/src/stack/types.ts`). The id is
# an entity id or a media source's name, which is the user's text in any
# script: only control characters are refused there.
_KEY = re.compile(r"[a-z][a-z-]*:[^\x00-\x1f\x7f]+")

Listener = Callable[[dict[str, str]], None]


def valid_key(value: object) -> str:
    """Voluptuous validator of a card key (the `cle` of `home_desk/plus_tard`)."""
    if not isinstance(value, str) or len(value) > SNOOZE_KEY_MAX or not _KEY.fullmatch(value):
        raise vol.Invalid(f"not a card key (<type>:<id>, at most {SNOOZE_KEY_MAX} characters)")
    return value


class Snoozes:
    """The active snoozes: card key -> end (aware UTC datetime)."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[dict[str, str]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._until: dict[str, datetime] = {}
        self._listeners: list[Listener] = []
        self._unsub_timer: CALLBACK_TYPE | None = None
        self._unsub_stop: CALLBACK_TYPE | None = None
        self.running = False

    async def async_load(self) -> None:
        """Reads the stored set back. A stored value that is not an ISO
        8601 datetime raises: this module alone writes the store."""
        stored = await self._store.async_load() or {}
        self._until = {key: dt_util.as_utc(datetime.fromisoformat(end)) for key, end in stored.items()}

    @callback
    def async_start(self) -> None:
        """Arms the expiry timer and tells the subscribers the current set
        (some may have expired while the entry was unloaded)."""
        self.running = True
        self._unsub_stop = self._hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, self._on_stop)
        self._notify()

    async def async_stop(self) -> None:
        """Cancels the timer and the stop listener, then writes the set."""
        self.running = False
        self._cancel_timer()
        if self._unsub_stop is not None:
            self._unsub_stop()
            self._unsub_stop = None
        await self._store.async_save(self._serialized())

    @callback
    def snooze(self, key: str, now: datetime) -> None:
        self._until[key] = now + timedelta(seconds=SNOOZE_S)
        self._store.async_delay_save(self._serialized)
        self._notify()

    @callback
    def active(self, now: datetime) -> dict[str, str]:
        """The keys still hidden at `now`, with their end; drops the others."""
        self._until = {key: end for key, end in self._until.items() if end > now}
        return {key: end.isoformat() for key, end in self._until.items()}

    @callback
    def subscribe(self, listener: Listener) -> CALLBACK_TYPE:
        """Adds a listener of the active set; returns what removes it."""
        self._listeners.append(listener)

        @callback
        def _remove() -> None:
            self._listeners.remove(listener)

        return _remove

    def _serialized(self) -> dict[str, str]:
        return {key: end.isoformat() for key, end in self._until.items()}

    @callback
    def _notify(self) -> None:
        """Sends the active set to every listener and re-arms the timer on
        the next end."""
        current = self.active(dt_util.utcnow())
        for listener in list(self._listeners):
            listener(current)
        self._cancel_timer()
        if self.running and self._until:
            self._unsub_timer = async_track_point_in_utc_time(
                self._hass, self._on_expiry, min(self._until.values()))

    @callback
    def _on_expiry(self, _now: datetime) -> None:
        self._unsub_timer = None
        self._notify()

    @callback
    def _on_stop(self, _event: Event) -> None:
        self._unsub_stop = None
        self._cancel_timer()

    @callback
    def _cancel_timer(self) -> None:
        if self._unsub_timer is not None:
            self._unsub_timer()
            self._unsub_timer = None


async def async_start(hass: HomeAssistant) -> Snoozes:
    """The run's `Snoozes`, read from disk the first time, then started."""
    snoozes: Snoozes | None = hass.data.get(DATA_SNOOZES)
    if snoozes is None:
        snoozes = Snoozes(hass)
        await snoozes.async_load()
        hass.data[DATA_SNOOZES] = snoozes
    snoozes.async_start()
    return snoozes


def get(hass: HomeAssistant) -> Snoozes | None:
    """The run's `Snoozes` while the entry is loaded, else None."""
    snoozes: Snoozes | None = hass.data.get(DATA_SNOOZES)
    return snoozes if snoozes is not None and snoozes.running else None
