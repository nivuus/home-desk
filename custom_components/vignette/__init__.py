"""Sert une version RÉDUITE des images de `entity_picture`.

Pourquoi ce composant existe (diagnostic du 2026-08-25) : l'affiche que Plex publie dans
`media_player.entity_picture` fait 2000x3000 px. Posée en `background-size: cover` dans la
carte média des tablettes murales — une boîte de 311x153 px — elle occupe ~23 Mo une fois
décodée en bitmap et **tue le process de la WebView** des tablettes Fire 7 du salon : Fully
Kiosk redémarrait en boucle, ~5 s de vie par instance, pendant toute la durée d'un film.

Mesuré sur la vraie tablette : 2000x3000 (23 Mo) = 4 morts en 48 s ; 800x1200 (3,7 Mo) =
1 mort ; 400x600 (0,9 Mo) = 0 mort. Le seuil sûr est de l'ordre du méga-octet de bitmap.

The view is unauthenticated (`requires_auth = False`) because a CSS `background-image` or an
`<img>` cannot carry an `Authorization` header. It therefore holds every control itself:

- it never makes an HTTP request: the signed path (`/api/media_player_proxy/<entity_id>` or
  `/api/image_proxy/<entity_id>`, as published in `entity_picture`) is parsed and validated,
  the entity it names is looked up in Home Assistant, and the entity's own access token is
  checked in constant time, the same rule Home Assistant's proxy views apply to an
  unauthenticated request. The image is then obtained from the entity itself. No origin,
  host header or redirect can therefore steer where the artwork comes from;
- the image header is read before any decode, and a canvas above `PIXELS_MAX` is refused;
- at most `CONVERSIONS_MAX` conversions run at once.

Design choice: no HTTP hop at all, rather than a fetch to the local listening port, because the
listening port can be bound to a specific address or served over TLS, and because a hop would
re-open the redirect and origin questions this view must not have.
"""

from __future__ import annotations

import asyncio
import hmac
import io
import logging
import re
from collections import OrderedDict
from dataclasses import dataclass
from http import HTTPStatus
from urllib.parse import parse_qs, urlsplit

import voluptuous as vol
from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.image import async_get_image
from homeassistant.components.image.const import DATA_COMPONENT as IMAGE_COMPONENT
from homeassistant.components.media_player import DATA_COMPONENT as MEDIA_PLAYER_COMPONENT
from homeassistant.core import HomeAssistant, split_entity_id, valid_entity_id
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.typing import ConfigType

try:  # `request.app["hass"]` est en voie de dépréciation ; la clé typée existe depuis 2024.
    from homeassistant.components.http import KEY_HASS
except ImportError:  # pragma: no cover - installations plus anciennes
    KEY_HASS = "hass"

_LOGGER = logging.getLogger(__name__)

DOMAIN = "vignette"
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({})}, extra=vol.ALLOW_EXTRA)

# The only two signed paths this view accepts, each with the entity domain it serves.
# `media_player_proxy` covers player artwork; `image_proxy` covers image entities.
ROUTE_DOMAINS = {"media_player_proxy": "media_player", "image_proxy": "image"}
_PATH_RE = re.compile(r"/api/(media_player_proxy|image_proxy)/([^/]+)")

LARGEUR_DEFAUT = 400
LARGEUR_MIN = 32
LARGEUR_MAX = 1024

# Au-delà, on refuse de décoder plutôt que de faire tomber Home Assistant sur une image piégée.
SOURCE_BYTES_MAX = 24 * 1024 * 1024
# A 2000x3000 poster is 6 MP; 25 MP keeps one decoded RGB bitmap under about 75 MB.
PIXELS_MAX = 25_000_000
CONVERSIONS_MAX = 2
IMAGE_TIMEOUT_S = 20

# Une affiche est redemandée à CHAQUE chargement de page, et les tablettes rechargent souvent.
# Redimensionner à chaque fois userait le CPU pour rien : le cache est borné et l'entrée la plus
# ancienne saute quand il déborde.
CACHE_MAX = 32


class CanvasTooLarge(Exception):
    """The image header announces more pixels than `PIXELS_MAX`."""


@dataclass(frozen=True)
class SignedPath:
    """A validated `entity_picture` path: which proxy, which entity, which token."""

    route: str
    entity_id: str
    token: str
    cache: str | None


def parse_signed_path(raw: str) -> SignedPath | None:
    """Parse and validate the relayed path; `None` when it is not a signed proxy path.

    The path must be relative (no scheme, no authority, no fragment), exactly one of the two
    proxy routes followed by a valid entity id of the matching domain. A valid entity id only
    holds `[a-z0-9_]` and one dot, so no `..`, slash or percent escape can get through.
    """
    parts = urlsplit(raw)
    if parts.scheme or parts.netloc or parts.fragment:
        return None
    match = _PATH_RE.fullmatch(parts.path)
    if match is None:
        return None
    route, entity_id = match.groups()
    if not valid_entity_id(entity_id) or split_entity_id(entity_id)[0] != ROUTE_DOMAINS[route]:
        return None
    query = parse_qs(parts.query, keep_blank_values=True)
    tokens = query.get("token", [""])
    caches = query.get("cache", [None])
    if len(tokens) != 1 or len(caches) != 1:
        return None
    return SignedPath(route, entity_id, tokens[0], caches[0])


def token_matches(presented: str, expected: list[str]) -> bool:
    """Constant-time comparison against every valid token of the entity."""
    given = presented.encode()
    matched = False
    for token in expected:
        matched |= hmac.compare_digest(given, token.encode())
    return matched


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Enregistre la vue. Aucun service, aucune entité : ce composant n'est qu'une route."""
    hass.http.register_view(VignetteView())
    return True


class VignetteView(HomeAssistantView):
    """`/api/vignette?url=<chemin signé>&w=400` -> la même image, réduite, en JPEG."""

    url = "/api/vignette"
    name = "api:vignette"
    requires_auth = False

    def __init__(self) -> None:
        self._cache: OrderedDict[tuple[SignedPath, int], bytes] = OrderedDict()
        self._verrou = asyncio.Lock()
        self._conversions = asyncio.Semaphore(CONVERSIONS_MAX)

    async def get(self, request: web.Request) -> web.Response:
        source = parse_signed_path(request.query.get("url", ""))
        if source is None:
            return web.Response(status=HTTPStatus.BAD_REQUEST, text="url is not a signed proxy path")

        try:
            largeur = int(request.query.get("w", LARGEUR_DEFAUT))
        except ValueError:
            return web.Response(status=HTTPStatus.BAD_REQUEST, text="w invalide")
        largeur = max(LARGEUR_MIN, min(LARGEUR_MAX, largeur))

        hass: HomeAssistant = request.app[KEY_HASS]
        entity = self._entity(hass, source)
        if entity is None:
            # Same answer as Home Assistant's proxy views give an unauthenticated caller.
            return web.Response(status=HTTPStatus.UNAUTHORIZED)
        if not token_matches(source.token, self._tokens(source, entity)):
            return web.Response(status=HTTPStatus.FORBIDDEN)

        # The key holds the token and the entity's own cache stamp: only a request that
        # already passed the token check above can reach a cached image.
        cle = (source, largeur)
        async with self._verrou:
            if cle in self._cache:
                self._cache.move_to_end(cle)
                return self._reponse(self._cache[cle])

        brut = await self._image(hass, source, entity)
        if brut is None:
            _LOGGER.warning("vignette: no image from %s", source.entity_id)
            return web.Response(status=HTTPStatus.BAD_GATEWAY, text="source illisible")
        if len(brut) > SOURCE_BYTES_MAX:
            return web.Response(status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE, text="source too large")

        try:
            async with self._conversions:
                reduite = await hass.async_add_executor_job(_reduire, brut, largeur)
        except CanvasTooLarge as err:
            _LOGGER.warning("vignette: %s refused (%s)", source.entity_id, err)
            return web.Response(status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE, text="image too large")
        except (OSError, ValueError) as err:
            _LOGGER.warning("vignette: image indecodable (%s) : %s", source.entity_id, err)
            return web.Response(status=HTTPStatus.BAD_GATEWAY, text="image indecodable")

        async with self._verrou:
            self._cache[cle] = reduite
            self._cache.move_to_end(cle)
            while len(self._cache) > CACHE_MAX:
                self._cache.popitem(last=False)

        return self._reponse(reduite)

    @staticmethod
    def _entity(hass: HomeAssistant, source: SignedPath):
        key = MEDIA_PLAYER_COMPONENT if source.route == "media_player_proxy" else IMAGE_COMPONENT
        if (component := hass.data.get(key)) is None:
            return None
        return component.get_entity(source.entity_id)

    @staticmethod
    def _tokens(source: SignedPath, entity) -> list[str]:
        if source.route == "media_player_proxy":
            return [entity.access_token]
        return list(entity.access_tokens)

    @staticmethod
    async def _image(hass: HomeAssistant, source: SignedPath, entity) -> bytes | None:
        """The entity's own image, through the same calls Home Assistant's proxy views make."""
        if source.route == "media_player_proxy":
            data, _content_type = await entity.async_get_media_image()
            return data
        try:
            return (await async_get_image(hass, source.entity_id, IMAGE_TIMEOUT_S)).content
        except HomeAssistantError:
            return None

    @staticmethod
    def _reponse(corps: bytes) -> web.Response:
        # `max-age` long : une affiche est immuable pour une lecture donnée, et l'URL signée
        # change quand le média change (`?cache=` dans `entity_picture`).
        return web.Response(
            body=corps,
            content_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )


def _reduire(brut: bytes, largeur: int) -> bytes:
    """Redimensionne en JPEG. Tourne dans un thread : Pillow est bloquant."""
    from PIL import Image  # importé ici : hors de l'event loop, et seulement si on s'en sert

    try:
        # `Image.open` reads the header only; the pixel data is decoded later, by `thumbnail`.
        image = Image.open(io.BytesIO(brut))
    except Image.DecompressionBombError as err:
        raise CanvasTooLarge(str(err)) from err
    largeur_source, hauteur_source = image.size
    if largeur_source * hauteur_source > PIXELS_MAX:
        raise CanvasTooLarge(f"{largeur_source}x{hauteur_source} px")
    # `thumbnail` conserve les proportions et ne fait que RÉDUIRE : une affiche déjà petite
    # ressort intacte plutôt qu'interpolée vers le haut.
    image.thumbnail((largeur, largeur * 4), Image.LANCZOS)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    sortie = io.BytesIO()
    image.save(sortie, format="JPEG", quality=85, optimize=True)
    return sortie.getvalue()
