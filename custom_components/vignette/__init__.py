"""Sert une version RÉDUITE des images de `entity_picture`.

Pourquoi ce composant existe (diagnostic du 2026-08-25) : l'affiche que Plex publie dans
`media_player.entity_picture` fait 2000x3000 px. Posée en `background-size: cover` dans la
carte média des tablettes murales — une boîte de 311x153 px — elle occupe ~23 Mo une fois
décodée en bitmap et **tue le process de la WebView** des tablettes Fire 7 du salon : Fully
Kiosk redémarrait en boucle, ~5 s de vie par instance, pendant toute la durée d'un film.

Mesuré sur la vraie tablette : 2000x3000 (23 Mo) = 4 morts en 48 s ; 800x1200 (3,7 Mo) =
1 mort ; 400x600 (0,9 Mo) = 0 mort. Le seuil sûr est de l'ordre du méga-octet de bitmap.

L'URL d'entrée est celle que Home Assistant a lui-même signée (`?token=…`) : c'est ELLE qui
authentifie l'appel, d'où `requires_auth = False` — une balise `background-image` ne peut pas
porter d'en-tête `Authorization`. Sans token valide, la requête interne échoue et rien ne sort.
Le préfixe est validé strictement : cette vue ne doit jamais devenir un relais vers une URL
arbitraire.
"""

from __future__ import annotations

import asyncio
import io
import logging
from collections import OrderedDict

import aiohttp
import voluptuous as vol
from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType
from yarl import URL

try:  # `request.app["hass"]` est en voie de dépréciation ; la clé typée existe depuis 2024.
    from homeassistant.components.http import KEY_HASS
except ImportError:  # pragma: no cover - installations plus anciennes
    KEY_HASS = "hass"

_LOGGER = logging.getLogger(__name__)

DOMAIN = "vignette"
CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({})}, extra=vol.ALLOW_EXTRA)

# Seuls ces chemins sont relayés. `media_player_proxy` couvre les affiches de lecteurs ;
# `image_proxy` les caméras et images, au cas où une tablette en afficherait un jour.
PREFIXES_AUTORISES = ("/api/media_player_proxy/", "/api/image_proxy/")

LARGEUR_DEFAUT = 400
LARGEUR_MIN = 32
LARGEUR_MAX = 1024

# Au-delà, on refuse de décoder plutôt que de faire tomber Home Assistant sur une image piégée.
TAILLE_SOURCE_MAX = 24 * 1024 * 1024
DELAI_SOURCE_S = 20

# Une affiche est redemandée à CHAQUE chargement de page, et les tablettes rechargent souvent.
# Redimensionner à chaque fois userait le CPU pour rien : le cache est borné et l'entrée la plus
# ancienne saute quand il déborde.
CACHE_MAX = 32


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
        self._cache: OrderedDict[tuple[str, int], bytes] = OrderedDict()
        self._verrou = asyncio.Lock()

    async def get(self, request: web.Request) -> web.Response:
        chemin = request.query.get("url", "")
        if not chemin.startswith(PREFIXES_AUTORISES):
            return web.Response(status=400, text="url hors des prefixes autorises")

        try:
            largeur = int(request.query.get("w", LARGEUR_DEFAUT))
        except ValueError:
            return web.Response(status=400, text="w invalide")
        largeur = max(LARGEUR_MIN, min(LARGEUR_MAX, largeur))

        cle = (chemin, largeur)
        async with self._verrou:
            if cle in self._cache:
                self._cache.move_to_end(cle)
                return self._reponse(self._cache[cle])

        hass: HomeAssistant = request.app[KEY_HASS]
        try:
            brut = await self._telecharger(hass, request, chemin)
        except Exception as err:  # noqa: BLE001 - une source injoignable n'est pas une panne de HA
            _LOGGER.warning("vignette: source illisible (%s) : %s", chemin, err)
            return web.Response(status=502, text="source illisible")

        try:
            reduite = await hass.async_add_executor_job(_reduire, brut, largeur)
        except Exception as err:  # noqa: BLE001 - une image illisible ne doit pas remonter en 500
            _LOGGER.warning("vignette: image indecodable (%s) : %s", chemin, err)
            return web.Response(status=502, text="image indecodable")

        async with self._verrou:
            self._cache[cle] = reduite
            self._cache.move_to_end(cle)
            while len(self._cache) > CACHE_MAX:
                self._cache.popitem(last=False)

        return self._reponse(reduite)

    async def _telecharger(
        self, hass: HomeAssistant, request: web.Request, chemin: str
    ) -> bytes:
        """Rejoue la requête signée contre Home Assistant lui-même.

        L'URL est reconstruite à partir de CELLE de la requête entrante (`request.url.join`) :
        la vignette suit ainsi le schéma, l'hôte et le port par lesquels la tablette est
        réellement arrivée, sans dépendre d'un `internal_url` configuré.
        """
        cible = request.url.join(URL(chemin))
        session = async_get_clientsession(hass)
        delai = aiohttp.ClientTimeout(total=DELAI_SOURCE_S)
        async with session.get(cible, timeout=delai) as reponse:
            if reponse.status != 200:
                raise RuntimeError(f"statut {reponse.status}")
            taille = reponse.content_length
            if taille is not None and taille > TAILLE_SOURCE_MAX:
                raise RuntimeError(f"source trop grosse ({taille} octets)")
            # ⚠️ PAS `content.read(n)` : il rend AU PLUS n octets et, sur une réponse
            # fragmentée, s'arrête au premier bloc. L'image ressortait tronquée de quelques
            # octets — Pillow refusait alors de la décoder (« image file is truncated ») et la
            # vignette répondait 502 sur des sources parfaitement valides. On lit donc jusqu'au
            # bout, en gardant le plafond.
            morceaux: list[bytes] = []
            total = 0
            async for bloc in reponse.content.iter_chunked(65536):
                total += len(bloc)
                if total > TAILLE_SOURCE_MAX:
                    raise RuntimeError("source trop grosse (au-dela du plafond en cours de lecture)")
                morceaux.append(bloc)
            return b"".join(morceaux)

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

    image = Image.open(io.BytesIO(brut))
    # `thumbnail` conserve les proportions et ne fait que RÉDUIRE : une affiche déjà petite
    # ressort intacte plutôt qu'interpolée vers le haut.
    image.thumbnail((largeur, largeur * 4), Image.LANCZOS)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    sortie = io.BytesIO()
    image.save(sortie, format="JPEG", quality=85, optimize=True)
    return sortie.getvalue()
