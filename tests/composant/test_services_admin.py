"""`home_desk.exporter` and `home_desk.importer` write: the first overwrites
the export file, the second replaces every screen and the house. Both are
admin services; an automation (a call without a user) still runs them.

The non-admin user here is a member of Home Assistant's default "Users"
group -- the kind of account the tablets log in with."""
import pathlib

import pytest
from homeassistant.auth.const import GROUP_ID_USER
from homeassistant.core import Context
from homeassistant.exceptions import Unauthorized

from custom_components.home_desk.const import DOMAIN


@pytest.fixture
async def non_admin_user(hass, hass_owner_user):
    # The owner exists first: Home Assistant makes the first user it creates the owner.
    return await hass.auth.async_create_user("Tablet", group_ids=[GROUP_ID_USER])


def _export_file(hass) -> pathlib.Path:
    return pathlib.Path(hass.config.path("home_desk_ecrans.yaml"))


@pytest.fixture(autouse=True)
def _clean_export_file(hass):
    _export_file(hass).unlink(missing_ok=True)
    yield
    _export_file(hass).unlink(missing_ok=True)


@pytest.mark.parametrize("service", ["exporter", "importer"])
async def test_a_non_admin_user_is_refused(hass, entree, non_admin_user, service):
    assert not non_admin_user.is_admin
    with pytest.raises(Unauthorized):
        await hass.services.async_call(
            DOMAIN, service, blocking=True, context=Context(user_id=non_admin_user.id))
    assert not _export_file(hass).exists()


async def test_an_admin_user_and_an_automation_still_export_and_import(
        hass, entree, hass_admin_user):
    await hass.services.async_call(
        DOMAIN, "exporter", blocking=True, context=Context(user_id=hass_admin_user.id))
    assert _export_file(hass).exists()
    _export_file(hass).unlink()

    await hass.services.async_call(DOMAIN, "exporter", blocking=True, context=Context())
    assert _export_file(hass).exists()
    await hass.services.async_call(DOMAIN, "importer", blocking=True, context=Context())
