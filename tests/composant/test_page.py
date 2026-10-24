"""The tablet entry document, served by the component with `no-cache`.

Root cause n.2 of the step-5 failure (2026-09-14 rollout): Home Assistant
serves `/local/` with `Cache-Control: public, max-age=2678400` (31 days,
`homeassistant/components/http/static.py`, not configurable). The bundle's
`?v=<fingerprint>` busts the cache of the script and the stylesheet, but
never of the DOCUMENT that names them. The Fully Kiosk WebView therefore kept
serving a cached `index.html` that pointed at the previous bundle -- the
fixed code never reached the tablet.

These tests reproduce that failure against the component: the document must
be revalidated on every load (so a redeployed document is never hidden behind
a cached one), and revalidation must stay cheap (a 304 when nothing changed).

The URL is written here literally, never imported from `const`: it is the
`startURL` typed into three tablets, a published contract that a rename on
the Python side must break loudly, here."""
import importlib.util
import os
from pathlib import Path

import pytest


PAGE_URL = "/home_desk/tablette"
DEPOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def config_isolee(hass, tmp_path):
    """A configuration directory of this test's own. The harness shares one
    `testing_config/` across every test: a document written there by one
    test would be served to the next, and the 404 case could never fail.
    Requested BEFORE `entree`, so the view resolves its path here."""
    hass.config.config_dir = str(tmp_path)
    return tmp_path


def _write_document(hass, contenu: str) -> Path:
    chemin = Path(hass.config.path("www", "wallpanel", "index.html"))
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(contenu, encoding="utf-8")
    return chemin


async def test_page_is_served_with_no_cache(hass, config_isolee, entree, hass_client_no_auth):
    """The deployed document, byte for byte, with `no-cache` -- never the
    31-day `max-age` that `/local/` imposes -- and without authentication,
    like `/local/`: a wall tablet has no Home Assistant session."""
    _write_document(hass, "<!doctype html><title>v1</title>")
    client = await hass_client_no_auth()

    reponse = await client.get(f"{PAGE_URL}?ecran=Cuisine")

    assert reponse.status == 200
    assert await reponse.text() == "<!doctype html><title>v1</title>"
    assert reponse.headers["Content-Type"].startswith("text/html")
    assert reponse.headers["Cache-Control"] == "no-cache"


async def test_a_redeployed_document_is_never_hidden_by_a_cached_one(
        hass, config_isolee, entree, hass_client_no_auth):
    """The actual failure, replayed. The client holds the validator of the
    OLD document and revalidates (what `no-cache` makes a browser do): the
    unchanged document costs a 304, the redeployed one comes back in full."""
    chemin = _write_document(hass, "<!doctype html><title>v1</title>")
    client = await hass_client_no_auth()

    premiere = await client.get(PAGE_URL)
    etag = premiere.headers["ETag"]

    inchangee = await client.get(PAGE_URL, headers={"If-None-Match": etag})
    assert inchangee.status == 304
    assert inchangee.headers["Cache-Control"] == "no-cache"

    chemin.write_text("<!doctype html><title>v2 redeployed</title>", encoding="utf-8")
    stat = chemin.stat()
    os.utime(chemin, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))

    apres_depot = await client.get(PAGE_URL, headers={"If-None-Match": etag})
    assert apres_depot.status == 200
    assert await apres_depot.text() == "<!doctype html><title>v2 redeployed</title>"


async def test_missing_document_is_a_404_not_a_crash(hass, config_isolee, entree, hass_client_no_auth):
    """Integration loaded, bundle not deployed: say so with a 404."""
    client = await hass_client_no_auth()

    reponse = await client.get(PAGE_URL)

    assert reponse.status == 404


def test_served_path_is_where_the_hook_deploys_the_bundle():
    """The view reads `www/wallpanel/index.html` because the hook deposits
    `dist/` onto `www/wallpanel/` -- two modules, one fact. Tie them: a test
    that only checked the view against a file it wrote itself would keep
    passing after the hook moved the bundle elsewhere."""
    from custom_components.home_desk.page import DOCUMENT_RELATIF

    spec = importlib.util.spec_from_file_location("install_hook", DEPOT / "hooks" / "install.py")
    hook = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hook)

    destination_dist = dict(hook.OWNED_TREES)["dist"]
    assert DOCUMENT_RELATIF == f"{destination_dist}/index.html"
    assert (DEPOT / "dist" / "index.html").is_file()
