"""`/api/vignette`: the artwork reducer must never relay a request elsewhere.

The view is unauthenticated (an `<img>` / CSS background cannot carry a bearer
token), so every control lives in the view itself: the image is obtained from
the entity the signed path names, never from an origin taken from the request;
the path is validated after parsing; the entity's own token is checked; the
image header is bounded before any decode; conversions are bounded.

Every test registers a catch-all HTTP mock: an outbound request, whatever its
destination, is RECORDED instead of failing unseen, so "no outbound request"
is an assertion that can fail.
"""
from __future__ import annotations

import asyncio
import io
import re
import struct
import threading
import time
import zlib
from unittest.mock import patch

import pytest
from homeassistant.components.image import ImageEntity
from homeassistant.components.media_player import MediaPlayerEntity, MediaPlayerState
from homeassistant.setup import async_setup_component
from PIL import Image
from pytest_homeassistant_custom_component.common import setup_test_component_platform

import custom_components.vignette as vignette

FOREIGN_HOST = "foreign.example"
ENTITY_COLOR = (0, 160, 0)
FOREIGN_COLOR = (220, 0, 0)


def _png(size: tuple[int, int], color: tuple[int, int, int]) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, format="PNG")
    return out.getvalue()


def _png_header_only(width: int, height: int) -> bytes:
    """A PNG whose IHDR announces `width` x `height` and whose pixel data is
    missing: opening it reads the header, decoding it would fail or explode."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data)))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(b"\0" * 10)) + chunk(b"IEND", b""))


class _Player(MediaPlayerEntity):
    _attr_name = "Poster"
    _attr_unique_id = "poster"
    _attr_state = MediaPlayerState.PLAYING
    _attr_media_image_hash = "hash1"

    def __init__(self, image: bytes) -> None:
        self.image = image

    async def async_get_media_image(self):
        return self.image, "image/png"


class _Picture(ImageEntity):
    _attr_name = "Picture"
    _attr_unique_id = "picture"
    _attr_content_type = "image/png"

    def __init__(self, hass, image: bytes) -> None:
        super().__init__(hass)
        self.image_bytes = image

    async def async_image(self):
        return self.image_bytes


@pytest.fixture
async def setup(hass, hass_client_no_auth, aioclient_mock):
    """A media player and an image entity, the vignette view, a client that
    carries no credentials, and a catch-all outbound mock that serves a
    DIFFERENT colour for the foreign host."""
    player = _Player(_png((800, 1200), ENTITY_COLOR))
    picture = _Picture(hass, _png((300, 300), ENTITY_COLOR))
    setup_test_component_platform(hass, "media_player", [player])
    setup_test_component_platform(hass, "image", [picture])
    assert await async_setup_component(hass, "media_player", {"media_player": {"platform": "test"}})
    assert await async_setup_component(hass, "image", {"image": {"platform": "test"}})
    assert await async_setup_component(hass, "vignette", {"vignette": {}})
    await hass.async_block_till_done()

    foreign = _png((800, 1200), FOREIGN_COLOR)
    aioclient_mock.get(re.compile(re.escape(FOREIGN_HOST)), content=foreign,
                       headers={"Content-Type": "image/png"})
    aioclient_mock.get(re.compile("."), content=player.image,
                       headers={"Content-Type": "image/png"})
    client = await hass_client_no_auth()
    return client, player, picture, aioclient_mock


def _poster_path(hass) -> str:
    return hass.states.get("media_player.poster").attributes["entity_picture"]


def _vignette(path: str, width: int = 200) -> str:
    from urllib.parse import quote
    return f"/api/vignette?w={width}&url={quote(path, safe='')}"


def _center_color(body: bytes) -> tuple[int, int, int]:
    image = Image.open(io.BytesIO(body)).convert("RGB")
    return image.getpixel((image.width // 2, image.height // 2))


def _close(color, expected) -> bool:
    return all(abs(a - b) <= 24 for a, b in zip(color, expected, strict=True))


async def test_legitimate_artwork_path_is_reduced(hass, setup):
    client, _player, _picture, _mock = setup
    response = await client.get(_vignette(_poster_path(hass)))
    assert response.status == 200
    assert response.content_type == "image/jpeg"
    body = await response.read()
    assert Image.open(io.BytesIO(body)).width <= 200
    assert _close(_center_color(body), ENTITY_COLOR)


async def test_legitimate_image_entity_path_is_reduced(hass, setup):
    client, _player, _picture, _mock = setup
    path = hass.states.get("image.picture").attributes["entity_picture"]
    response = await client.get(_vignette(path))
    assert response.status == 200
    assert _close(_center_color(await response.read()), ENTITY_COLOR)


async def test_no_outbound_http_request_so_no_redirect_can_be_followed(hass, setup):
    """The view makes no HTTP hop of its own: there is nothing whose redirect
    it could follow, whatever the upstream would answer."""
    client, _player, _picture, mock = setup
    response = await client.get(_vignette(_poster_path(hass)))
    assert response.status == 200
    assert mock.mock_calls == []


@pytest.mark.parametrize("headers", [
    {"Host": FOREIGN_HOST},
    {"Host": FOREIGN_HOST, "X-Forwarded-Host": FOREIGN_HOST},
])
async def test_foreign_host_header_causes_no_request_to_that_host(hass, setup, headers):
    client, _player, _picture, mock = setup
    response = await client.get(_vignette(_poster_path(hass)), headers=headers)
    assert [call for call in mock.mock_calls if FOREIGN_HOST in str(call[1])] == []
    assert response.status == 200
    assert _close(_center_color(await response.read()), ENTITY_COLOR)


async def test_cache_never_serves_content_obtained_for_another_origin(hass, setup):
    client, _player, _picture, _mock = setup
    path = _poster_path(hass)
    await client.get(_vignette(path), headers={"Host": FOREIGN_HOST})
    response = await client.get(_vignette(path))
    assert response.status == 200
    assert _close(_center_color(await response.read()), ENTITY_COLOR)


@pytest.mark.parametrize("suffix", [
    # A `..` followed by a slash is already stopped by Home Assistant's own
    # security filter middleware; the view must not rely on it.
    "/../../config",
    # These reach the view: a trailing `..` and its percent-encoded forms.
    "/..",
    "/%2e%2e",
    "/.%2E",
    "/%252e%252e",
])
async def test_traversal_in_the_relayed_path_is_refused(hass, setup, suffix):
    client, _player, _picture, mock = setup
    base, _, query = _poster_path(hass).partition("?")
    response = await client.get(_vignette(f"{base}{suffix}?{query}"))
    assert response.status == 400
    assert mock.mock_calls == []


@pytest.mark.parametrize("path", [
    "http://foreign.example/api/media_player_proxy/media_player.poster?token=x",
    "//foreign.example/api/media_player_proxy/media_player.poster?token=x",
    "/api/media_player_proxy/image.picture?token=x",
    "/api/states?token=x",
])
async def test_scheme_authority_or_foreign_route_is_refused(hass, setup, path):
    client, _player, _picture, mock = setup
    response = await client.get(_vignette(path))
    assert response.status == 400
    assert mock.mock_calls == []


@pytest.mark.parametrize("token", ["", "wrong", "été"])
async def test_wrong_or_missing_token_is_refused(hass, setup, token):
    client, _player, _picture, mock = setup
    path = f"/api/media_player_proxy/media_player.poster?cache=hash1&token={token}"
    response = await client.get(_vignette(path))
    assert response.status == 403
    assert mock.mock_calls == []

    response = await client.get(_vignette(
        f"/api/image_proxy/image.picture?token={token}"))
    assert response.status == 403


async def test_wrong_token_is_not_served_from_the_cache(hass, setup):
    client, _player, _picture, _mock = setup
    assert (await client.get(_vignette(_poster_path(hass)))).status == 200
    response = await client.get(_vignette(
        "/api/media_player_proxy/media_player.poster?token=wrong&cache=hash1"))
    assert response.status == 403


async def test_unknown_entity_is_refused_like_home_assistant_does(hass, setup):
    client, _player, _picture, _mock = setup
    response = await client.get(_vignette(
        "/api/media_player_proxy/media_player.absent?token=x&cache=hash1"))
    assert response.status == 401


async def test_oversized_canvas_is_refused_before_decoding(hass, setup):
    client, player, _picture, mock = setup
    huge = _png_header_only(8000, 8000)
    player.image = huge
    mock.clear_requests()
    mock.get(re.compile("."), content=huge, headers={"Content-Type": "image/png"})

    from PIL import ImageFile
    loads: list[int] = []
    original = ImageFile.ImageFile.load

    def spy(self):
        loads.append(1)
        return original(self)

    with patch.object(ImageFile.ImageFile, "load", spy):
        response = await client.get(_vignette(_poster_path(hass)))
    assert response.status == 413
    assert loads == []


def test_reduction_reads_the_header_and_never_decodes_an_oversized_canvas():
    from PIL import ImageFile
    loads: list[int] = []
    original = ImageFile.ImageFile.load

    def spy(self):
        loads.append(1)
        return original(self)

    with patch.object(ImageFile.ImageFile, "load", spy), pytest.raises(Exception) as caught:
        vignette._reduire(_png_header_only(8000, 8000), 200)
    assert loads == [], f"the pixel data was decoded before refusing ({caught.value!r})"
    assert type(caught.value).__name__ == "CanvasTooLarge"


async def test_conversions_are_bounded(hass, setup):
    client, _player, _picture, _mock = setup
    lock = threading.Lock()
    running = 0
    peak = 0

    def slow(raw: bytes, width: int) -> bytes:
        nonlocal running, peak
        with lock:
            running += 1
            peak = max(peak, running)
        time.sleep(0.2)
        with lock:
            running -= 1
        return b"jpeg"

    path = _poster_path(hass)
    with patch.object(vignette, "_reduire", slow):
        responses = await asyncio.gather(*(
            client.get(_vignette(path, width=100 + i)) for i in range(6)))
    assert [r.status for r in responses] == [200] * 6
    assert peak <= vignette.CONVERSIONS_MAX
