"""Tablettes murales — la configuration des ecrans vit ici, plus dans le bundle.

Ce composant ne cree AUCUNE entite. Il detient une configuration, la valide, et
la publie par websocket. C'est deliberé : une entite par ecran donnerait un etat
a synchroniser, un historique a purger et un registre a migrer, pour une donnee
qui change trois fois par an.
"""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN

__all__ = ["DOMAIN", "async_setup_entry", "async_unload_entry"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Charge l'entree. Le transport et les services arrivent aux taches 8 et 9."""
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Decharge l'entree."""
    return True
