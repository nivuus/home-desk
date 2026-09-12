"""Harnais commun. `enable_custom_integrations` est ce qui fait voir
custom_components/home_desk a l'instance de test ; sans elle, tous les tests de
flow echouent sur « integration not found », pour une raison sans rapport avec
le code teste."""
import pytest
from homeassistant import config_entries

from custom_components.home_desk.const import DOMAIN

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture
async def entree(hass):
    """L'entree unique « Tablettes murales », deja creee. Tous les tests de
    sous-entree en ont besoin : une sous-entree ne s'initialise que sous une
    entree existante."""
    resultat = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.flow.async_configure(resultat["flow_id"], {})
    return resultat["result"]
