"""Harnais commun. `enable_custom_integrations` est ce qui fait voir
custom_components/home_desk a l'instance de test ; sans elle, tous les tests de
flow echouent sur « integration not found », pour une raison sans rapport avec
le code teste."""
import pytest

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield
