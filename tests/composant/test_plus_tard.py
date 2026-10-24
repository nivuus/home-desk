"""`home_desk/plus_tard` and `home_desk/plus_tard/abonner`: "plus tard" hides a
card on EVERY tablet for two hours, and the state lives in the integration
(a `Store`), never in one browser.

The clients connect as a NON-ADMIN user, like the tablets (see
test_abonnement.py). Wire values are written literally, never imported from
`const`, so that a rename on the Python side fails this file."""
from datetime import timedelta

import pytest
from homeassistant import config_entries
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.home_desk.const import DOMAIN

KEY = "aspirateur:vacuum.x"
SNOOZE = "home_desk/plus_tard"
SUBSCRIBE = "home_desk/plus_tard/abonner"
STORAGE_KEY = "home_desk.plus_tard"


@pytest.fixture
async def tablette(hass, hass_ws_client, hass_read_only_access_token):
    assert await async_setup_component(hass, DOMAIN, {})
    return await hass_ws_client(hass, hass_read_only_access_token)


async def _subscribe(client) -> tuple[int, dict]:
    """Subscribes, returns the subscription id and the set it is sent first."""
    await client.send_json_auto_id({"type": SUBSCRIBE})
    result = await client.receive_json()
    assert result["success"] is True, result
    first = await client.receive_json()
    assert first["type"] == "event" and first["id"] == result["id"], first
    return result["id"], first["event"]


async def _snooze(client, key: str = KEY) -> list[dict]:
    """Snoozes `key`, returns the messages up to and including its result
    (the subscribers' event may come first on the same socket)."""
    await client.send_json_auto_id({"type": SNOOZE, "cle": key})
    messages = []
    while True:
        message = await client.receive_json()
        messages.append(message)
        if message["type"] == "result":
            return messages


def _result(messages: list[dict]) -> dict:
    return next(m for m in messages if m["type"] == "result")


async def test_snooze_hides_for_two_hours(hass, tablette, entree, freezer):
    now = dt_util.utcnow()
    sub_id, initial = await _subscribe(tablette)
    assert initial == {}

    messages = await _snooze(tablette)
    assert _result(messages)["success"] is True
    end = now + timedelta(seconds=7200)
    assert {"id": sub_id, "type": "event", "event": {KEY: end.isoformat()}} in messages

    # One second before the end the key is still active: a fresh subscriber
    # is sent it, and the first subscriber heard nothing in between (the
    # next message on the socket is the fresh subscription's own result).
    freezer.move_to(now + timedelta(seconds=7199))
    async_fire_time_changed(hass, now + timedelta(seconds=7199))
    await hass.async_block_till_done()
    second_id, still = await _subscribe(tablette)
    assert still == {KEY: end.isoformat()}

    freezer.move_to(end)
    async_fire_time_changed(hass, end)
    await hass.async_block_till_done()
    expired = [await tablette.receive_json(), await tablette.receive_json()]
    assert {m["id"] for m in expired} == {sub_id, second_id}
    assert all(m["type"] == "event" and m["event"] == {} for m in expired)


async def test_broadcasts_to_every_subscriber(hass, hass_ws_client, hass_read_only_access_token, entree):
    assert await async_setup_component(hass, DOMAIN, {})
    first = await hass_ws_client(hass, hass_read_only_access_token)
    second = await hass_ws_client(hass, hass_read_only_access_token)
    first_id, _ = await _subscribe(first)
    second_id, _ = await _subscribe(second)

    messages = await _snooze(first)
    assert any(m["type"] == "event" and m["id"] == first_id and KEY in m["event"] for m in messages)
    heard = await second.receive_json()
    assert heard["id"] == second_id and list(heard["event"]) == [KEY]


async def test_snooze_survives_reload(hass, tablette, entree, hass_storage):
    sub_id, _ = await _subscribe(tablette)
    messages = await _snooze(tablette)
    end = next(m["event"][KEY] for m in messages if m["type"] == "event")

    assert await hass.config_entries.async_unload(entree.entry_id)
    await hass.async_block_till_done()
    # Written to disk by the unload at the latest: a restart reads it back.
    assert hass_storage[STORAGE_KEY]["data"] == {KEY: end}

    assert await hass.config_entries.async_setup(entree.entry_id)
    await hass.async_block_till_done()
    # The tablet subscribed before the reload keeps its subscription (its
    # socket never closed, so it would never subscribe again) and is told the set.
    again = await tablette.receive_json()
    assert again == {"id": sub_id, "type": "event", "event": {KEY: end}}
    _, fresh = await _subscribe(tablette)
    assert fresh == {KEY: end}


async def test_a_restart_reads_the_stored_snoozes(hass, hass_storage, tablette, freezer):
    now = dt_util.utcnow()
    live = (now + timedelta(minutes=30)).isoformat()
    gone = (now - timedelta(minutes=1)).isoformat()
    hass_storage[STORAGE_KEY] = {
        "version": 1, "minor_version": 1, "key": STORAGE_KEY,
        "data": {KEY: live, "aeration:binary_sensor.window": gone},
    }
    flow = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    await hass.config_entries.flow.async_configure(flow["flow_id"], {})
    await hass.async_block_till_done()

    _, active = await _subscribe(tablette)
    assert active == {KEY: live}


@pytest.mark.parametrize("cle", [
    "", "aspirateur", "aspirateur:", ":vacuum.x", "Aspirateur:vacuum.x", "a" * 250 + ":" + "b" * 10,
    "aspirateur:vacuum.x\n",
])
async def test_a_malformed_key_is_refused(hass, tablette, entree, cle):
    sub_id, _ = await _subscribe(tablette)
    await tablette.send_json_auto_id({"type": SNOOZE, "cle": cle})
    answer = await tablette.receive_json()
    assert answer["success"] is False
    assert answer["error"]["code"] == "invalid_format"
    _, active = await _subscribe(tablette)
    assert active == {}


async def test_a_key_in_any_script_is_accepted(hass, tablette, entree):
    """Card keys carry a media source's name, which is the user's text."""
    messages = await _snooze(tablette, "media:Радио 東京 ‏موسيقى")
    assert _result(messages)["success"] is True


async def test_unload_leaves_no_timer_behind(hass, tablette, entree, freezer):
    """A snooze arms an expiry timer; the unload cancels it (the test harness
    fails on a lingering timer), and the reload arms it again."""
    sub_id, _ = await _subscribe(tablette)
    now = dt_util.utcnow()
    await _snooze(tablette)
    assert await hass.config_entries.async_unload(entree.entry_id)
    await hass.async_block_till_done()

    end = now + timedelta(seconds=7200)
    freezer.move_to(end)
    async_fire_time_changed(hass, end)
    await hass.async_block_till_done()

    assert await hass.config_entries.async_setup(entree.entry_id)
    await hass.async_block_till_done()
    # Expired while unloaded: the reload tells the subscriber it is gone,
    # and that is the only message it gets: the next one on the socket is
    # the result of a fresh subscription.
    assert await tablette.receive_json() == {"id": sub_id, "type": "event", "event": {}}
    await tablette.send_json_auto_id({"type": SUBSCRIBE})
    assert (await tablette.receive_json())["type"] == "result"
