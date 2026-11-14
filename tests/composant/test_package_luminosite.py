"""The adaptive brightness automation of `packages/home_desk.yaml`, loaded
from the package file itself (never a copy) into Home Assistant's real
automation integration.

An unavailable light sensor is not darkness: its ten-minute tick must leave
the tablets' brightness untouched, where a numeric reading still sets it."""
import pathlib
from datetime import timedelta

import pytest
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from homeassistant.util.yaml import load_yaml
from pytest_homeassistant_custom_component.common import (
    async_fire_time_changed,
    async_mock_service,
)

PACKAGE = pathlib.Path(__file__).resolve().parents[2] / "packages" / "home_desk.yaml"
AUTOMATION_ID = "tablettes_luminosite_adaptative"
SENSOR = "sensor.capteur_humain_eclairement"
TABLETS = (
    "number.tablette_cuisine_screen_brightness",
    "number.tablette_salon_screen_brightness",
    "number.tablette_bureau_screen_brightness",
)


@pytest.fixture
async def brightness_calls(hass):
    automation = next(a for a in load_yaml(PACKAGE)["automation"] if a["id"] == AUTOMATION_ID)
    for tablet in TABLETS:
        hass.states.async_set(tablet, "100")
    for light in ("light.lumiere_salon", "light.lumiere_cuisine", "light.bureau"):
        hass.states.async_set(light, "off")
    calls = async_mock_service(hass, "number", "set_value")
    assert await async_setup_component(hass, "automation", {"automation": [automation]})
    await hass.async_block_till_done()
    yield calls
    # Detach the time pattern: its next-tick timer would outlive the test.
    await hass.services.async_call(
        "automation", "turn_off", {"entity_id": "all"}, blocking=True)


async def _next_tick(hass):
    """Fires the `/10` minutes time pattern: the next whole ten minutes."""
    now = dt_util.utcnow()
    tick = now.replace(minute=now.minute - now.minute % 10, second=0, microsecond=0)
    async_fire_time_changed(hass, tick + timedelta(minutes=10))
    await hass.async_block_till_done()


@pytest.mark.parametrize("reading", ["unavailable", "unknown"])
async def test_an_unknown_light_reading_leaves_brightness_untouched(
        hass, brightness_calls, reading):
    hass.states.async_set(SENSOR, reading)
    await hass.async_block_till_done()
    brightness_calls.clear()
    await _next_tick(hass)
    assert brightness_calls == []


async def test_a_numeric_light_reading_still_sets_brightness(hass, brightness_calls):
    """The control: the same tick with a reading DOES write, so the test
    above cannot pass merely because nothing ever fires."""
    hass.states.async_set(SENSOR, "200")
    await hass.async_block_till_done()
    brightness_calls.clear()
    await _next_tick(hass)
    assert sorted(e for c in brightness_calls for e in c.data["entity_id"]) == sorted(TABLETS)
    assert {c.data["value"] for c in brightness_calls} == {220}
