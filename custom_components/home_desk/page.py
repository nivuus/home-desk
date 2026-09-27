"""The tablet entry document, served with `Cache-Control: no-cache`.

Why this view exists (root cause n.2 of the 2026-09-14 step-5 failure):
Home Assistant serves `/local/` with `public, max-age=2678400` -- 31 days,
hardcoded in `homeassistant/components/http/static.py`, no option to change
it. The build fingerprints the script and the stylesheet (`?v=<hash>`), so
their URLs change with every bundle; but the DOCUMENT that carries those URLs
is loaded by a fixed `startURL`. A WebView that cached the document keeps
executing the bundle it named, for up to a month, whatever gets deployed.

The fix belongs to the document, not to the tablets: it is served here, from
the very file the hook deposits, with `no-cache`. Every load revalidates;
an unchanged document costs a 304 (aiohttp's `FileResponse` answers
`If-None-Match` from the file's size and mtime), a redeployed one comes back
in full. The fingerprinted assets stay on `/local/` and keep their 31-day
cache, which is what their fingerprint is for.

No authentication, like `/local/` which serves the same file: a wall tablet
has no Home Assistant session, and the document holds no secret."""
from __future__ import annotations

from pathlib import Path

from aiohttp import hdrs, web

from homeassistant.core import HomeAssistant
from homeassistant.helpers.http import HomeAssistantView

from .const import URL_PAGE

# Relative to the configuration directory. `hooks/install.py` deposits
# `dist/` onto `www/wallpanel/` (`OWNED_TREES`); `tests/composant/
# test_page.py` ties the two, so neither can move alone.
DOCUMENT_RELATIF = "www/wallpanel/index.html"


class TabletPageView(HomeAssistantView):
    """GET the entry document; the query string (`?ecran=<nom>`) is read
    by the application in the browser, never here."""

    url = URL_PAGE
    name = "home_desk:page"
    requires_auth = False

    def __init__(self, document: Path) -> None:
        self._document = document

    async def get(self, request: web.Request) -> web.StreamResponse:
        # `FileResponse` stats the file itself (in an executor) and turns a
        # missing file into a 404: no deployed bundle is said, not hidden.
        return web.FileResponse(self._document, headers={hdrs.CACHE_CONTROL: "no-cache"})


def async_register_page(hass: HomeAssistant) -> None:
    """Register the view. Home Assistant cannot remove a view once added, so
    this runs from the component setup (once per run), never per entry."""
    hass.http.register_view(TabletPageView(Path(hass.config.path(DOCUMENT_RELATIF))))
