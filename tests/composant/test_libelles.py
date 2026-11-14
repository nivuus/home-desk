"""libelles.py renders labels from the SAME source as the frontend
(`translations/*.json`), through Home Assistant's translation cache -- loaded
once, outside the event loop, when the integration is set up. A call must
therefore read no file at all (a file read in the event loop blocks it), and
an unknown language must fall back the way Home Assistant does (English, key
by key), never to a language chosen here."""
import pathlib

import pytest
from homeassistant.helpers import translation

from custom_components.home_desk import libelles
from custom_components.home_desk.const import DOMAIN


async def _use_language(hass, language: str) -> None:
    hass.config.language = language
    await translation.async_get_translations(hass, language, "config_subentries", {DOMAIN})


@pytest.fixture
def file_reads(monkeypatch):
    reads: list[pathlib.Path] = []
    original_read_text = pathlib.Path.read_text
    original_read_bytes = pathlib.Path.read_bytes

    def read_text(self, *args, **kwargs):
        reads.append(pathlib.Path(self))
        return original_read_text(self, *args, **kwargs)

    def read_bytes(self, *args, **kwargs):
        reads.append(pathlib.Path(self))
        return original_read_bytes(self, *args, **kwargs)

    def spy_open(*args, **kwargs):
        reads.append(pathlib.Path(str(args[0])))
        return original_open(*args, **kwargs)

    import builtins
    original_open = builtins.open
    monkeypatch.setattr(pathlib.Path, "read_text", read_text)
    monkeypatch.setattr(pathlib.Path, "read_bytes", read_bytes)
    return reads, lambda: monkeypatch.setattr(builtins, "open", spy_open)


@pytest.mark.parametrize(("language", "label"), [
    ("en", "Blocks and modes"),
    ("fr", "Blocs et modes"),
])
async def test_labels_come_from_the_translation_cache_without_reading_a_file(
        hass, entree, file_reads, language, label):
    await _use_language(hass, language)
    reads, spy_open = file_reads
    spy_open()
    assert libelles.section(hass, "agencement") == label
    assert libelles.house_title(hass)
    assert reads == [], f"translation file read at call time: {reads}"


async def test_an_unknown_language_falls_back_to_english_like_home_assistant(hass, entree):
    await _use_language(hass, "xx")
    assert libelles.section(hass, "agencement") == "Blocks and modes"
    en = await translation.async_get_translations(hass, "en", "config_subentries", {DOMAIN})
    assert libelles.house_title(hass) == en[f"component.{DOMAIN}.config_subentries.maison.entry_type"]
