"""`home_desk.jouer_animation`: play a media file over the wall of one or
more tablets.

The service takes a media-source id (what Home Assistant's `media` selector
produces), resolves it to a signed URL, decides which player the tablet must
use, and pushes `{url, type, duree, fond}` to the `home_desk/animations`
subscribers of each named screen (see `websocket.ws_animations`).

Everything that can be checked here is checked BEFORE anything is sent: an
unknown screen refuses the whole call, not only its share of it, and so does
a missing file, a type no tablet player can render, an animated image with no
duration (it has no detectable end), or a duration outside ]0, DUREE_MAX_S].
Each refusal is a `ServiceValidationError` in French, like the rest of the
component's messages, so an automation that misfires says why in its trace.

The service is NOT admin-only: it is meant to be called from automations and
from dashboards used by the household, and it writes nothing."""
from __future__ import annotations

import mimetypes
from pathlib import Path

import voluptuous as vol

from homeassistant.components import media_source
from homeassistant.components.media_player.browse_media import async_process_play_media_url
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send

from . import websocket
from .const import DOMAIN, DUREE_MAX_S, SERVICE_JOUER_ANIMATION, SIGNAL_ANIMATION

# dotLottie (`.lottie`) is unknown to Python's `mimetypes`, and Home
# Assistant's local media source asserts that every file it resolves HAS a
# MIME type -- without this registration, resolving a `.lottie` file fails
# with an AssertionError inside Home Assistant. `application/zip+dotlottie`
# is the type registered with IANA for the format.
MIME_DOTLOTTIE = "application/zip+dotlottie"
mimetypes.add_type(MIME_DOTLOTTIE, ".lottie")

# Lottie JSON: the generic JSON type Python guesses for `.json`, and the
# IANA type of the Lottie format itself -- which starts with `video/`, so it
# must be recognised BEFORE the generic `video/*` branch.
_MIMES_LOTTIE = frozenset({"application/json", "video/lottie+json", MIME_DOTLOTTIE})
_SUFFIXES_LOTTIE = (".json", ".lottie")

SCHEMA = vol.Schema(
    {
        vol.Required("ecrans"): vol.All(cv.ensure_list, [cv.string], vol.Length(min=1)),
        vol.Required("media"): vol.Schema(
            {
                vol.Required("media_content_id"): cv.string,
                vol.Optional("media_content_type"): cv.string,
            },
            # The `media` selector also sends `metadata` (title, thumbnail...).
            extra=vol.ALLOW_EXTRA,
        ),
        vol.Optional("duree"): vol.Coerce(float),
        vol.Optional("fond", default="noir"): vol.In(("noir", "transparent")),
    }
)


def type_lecteur(mime: str | None, media_content_id: str) -> str | None:
    """The tablet player able to render this media: "lottie", "video",
    "image", or None if none can.

    The id's suffix is consulted for Lottie only: a Lottie file is JSON or a
    zip to any other tool, and a media source other than the local one may
    report it with a generic type."""
    if mime in _MIMES_LOTTIE or media_content_id.lower().endswith(_SUFFIXES_LOTTIE):
        return "lottie"
    if mime is None:
        return None
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("image/"):
        return "image"
    return None


def _est_un_fichier(chemin: Path) -> bool:
    """Blocking I/O: always called through `hass.async_add_executor_job`."""
    return chemin.is_file()


async def _async_resoudre(hass: HomeAssistant, media_id: str) -> media_source.PlayMedia:
    """Resolves `media_id` or refuses with "média introuvable".

    Two ways for a media to be missing. The source cannot resolve the id at
    all (unknown source, unknown media directory, invalid path): that is
    `Unresolvable`. Or the id is well formed but names no file: Home
    Assistant's local source resolves such a path WITHOUT error (it never
    looks at the disk), so the file's existence is checked here, on the path
    the source reports. A source that has no local path (`path is None`) is
    trusted: its URL is all there is to check, and only the tablet can."""
    try:
        media = await media_source.async_resolve_media(hass, media_id, None)
    except media_source.Unresolvable as err:
        raise ServiceValidationError(f"média introuvable : {media_id}") from err
    if media.path is not None and not await hass.async_add_executor_job(
            _est_un_fichier, media.path):
        raise ServiceValidationError(f"média introuvable : {media_id}")
    return media


async def _async_jouer(call: ServiceCall) -> None:
    """`home_desk.jouer_animation`: validates everything, then sends."""
    hass = call.hass
    # Duplicates would play twice on the same wall: kept once, in order.
    ecrans = list(dict.fromkeys(call.data["ecrans"]))
    # The same lookup `home_desk/ecran` uses: a name the service accepts is,
    # by construction, a name a tablet can load and subscribe to -- exact
    # and case-sensitive.
    inconnus = [nom for nom in ecrans if websocket.trouver_ecran(hass, nom) is None]
    if inconnus:
        raise ServiceValidationError(f"écran inconnu : {', '.join(inconnus)}")

    duree = call.data.get("duree")
    if duree is not None and not 0 < duree <= DUREE_MAX_S:
        raise ServiceValidationError(
            f"la durée doit être comprise entre 0 (exclu) et {DUREE_MAX_S} s, "
            f"reçu {duree:g} s")

    media_id = call.data["media"]["media_content_id"]
    media = await _async_resoudre(hass, media_id)
    lecteur = type_lecteur(media.mime_type, media_id)
    if lecteur is None:
        raise ServiceValidationError(
            f"type de média non lisible par une tablette : {media.mime_type} ({media_id})")
    if lecteur == "image" and duree is None:
        raise ServiceValidationError(
            "une image animée n'a pas de fin détectable : indiquez une durée")

    charge = {
        # Relative and signed: the tablet is served by this same Home
        # Assistant, and a signed path needs no token in the request.
        "url": async_process_play_media_url(hass, media.url, allow_relative_url=True),
        "type": lecteur,
        "duree": None if duree is None else round(duree * 1000),
        "fond": call.data["fond"],
    }
    for nom in ecrans:
        async_dispatcher_send(hass, SIGNAL_ANIMATION, nom, charge)


def async_setup_service(hass: HomeAssistant) -> None:
    """Registers the service -- called by `__init__.async_setup_entry`."""
    hass.services.async_register(DOMAIN, SERVICE_JOUER_ANIMATION, _async_jouer, schema=SCHEMA)


def async_unload_service(hass: HomeAssistant) -> None:
    """The counterpart of `async_setup_service`, called by
    `__init__.async_unload_entry`."""
    hass.services.async_remove(DOMAIN, SERVICE_JOUER_ANIMATION)
