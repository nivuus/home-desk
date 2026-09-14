"""Lecture du registre d'entites de Home Assistant.

Decision 7 de la spec : une entite inconnue du registre donne un
AVERTISSEMENT, jamais un refus -- elle peut arriver plus tard (une ampoule
pas encore appairee, un capteur dont l'integration n'est pas encore
chargee). Refuser interdirait de preparer un ecran avant que son materiel
existe ; ne rien dire laisse une faute de frappe produire une tuile morte
que personne ne relie jamais a sa cause.

Module a part, et pas une fonction de plus dans `config_flow.py` : c'est la
SEULE dependance de ce composant au registre d'entites, et `config_flow.py`
plafonne a 500 lignes.

Ronde de correction 1 (defaut A) : `entites_dans` collectait toute chaine
ayant la FORME `domaine.objet`, recursivement dans tout l'objet -- ce qui
avertit aussi sur `lien: "media_player.html"` ou `libelle: "tv.salon"`,
deux champs de TEXTE LIBRE deja autorises par le contrat.

Ronde de correction 2 (reserve 1 de la ronde 1) : la premiere correction
remplacait la FORME par un ENSEMBLE de noms de propriete « qui portent une
entite » (`CHAMPS_ENTITE`) -- mais un ensemble de NOMS ne peut pas porter
une information qui depend du CHEMIN. Mesure sur le contrat entier : `nom`
est une entite dans `racine.minuteurs[]`, et du texte libre a la racine
(le nom de l'ecran) comme dans `$defs/source` (le libelle d'une source
media) -- un ensemble plat contenant `nom` aurait fait REAPPARAITRE le
defaut A pour `sources.nom`, par son propre correctif. `entites_dans`
descend desormais dans la VALEUR et dans le SOUS-SCHEMA qui la decrit, EN
PARALLELE, plutot que dans un ensemble de noms deconnecte du chemin.

Ronde de correction 2 (reserve 2) : ce module lisait lui-meme `contrat/
ecran.schema.json` -- une SECONDE lecture du meme fichier que `schema.py`
revendique lire SEUL (voir sa docstring : « Reste dans schema.py ce qui
MIROITE le contrat, et LUI SEUL le lit »). Il importe desormais
`schema.SCHEMA_JSON`, deja lu une fois la-bas, jamais un second
`pathlib.Path` + `json.loads` ICI -- la meme regle que `validateurs.py`
respecte deja (aucun des deux ne contient plus ni `pathlib` ni `json`).

Ronde de correction 3 : `voiture` (section « objet », `objets.py`) porte
SEPT champs `$ref: entite` (`batterie`, `autonomie`, `branchee`, `enCharge`,
`clim`, `demarrerClim`, `arreterClim`) et n'etait cablee nulle part -- la
decision 7 couvrait huit familles de section sur neuf. `entites_dans`
resolvait son sous-schema de depart via `properties[cle]["items"]`, ce qui
suppose une section TABLEAU ; `voiture` est un OBJET (`properties["voiture"]`
n'a pas d'`items`). La resolution est desormais generique aux deux formes,
sans `if cle == "voiture"` : un cas particulier par NOM aurait ete la meme
faute que l'ensemble plat de noms de la ronde 2.
"""
from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .schema import SCHEMA_JSON


def entites_inconnues(hass: HomeAssistant, entites: list[str]) -> list[str]:
    """Celles des `entites` qu'aucune entree du registre ne porte.

    L'ordre d'entree est preserve : le message d'avertissement les cite dans
    l'ordre ou l'utilisateur les a saisies, jamais dans un ordre de hachage
    qui changerait d'une saisie a l'autre.

    Une entite peut exister dans l'ETAT sans etre au registre (un
    `input_*` cree en YAML, un template). On interroge donc AUSSI
    `hass.states` : avertir sur une entite qui repond deja serait un
    avertissement faux, et un avertissement faux se fait ignorer, ce qui tue
    aussi les vrais.
    """
    registre = er.async_get(hass)
    return [
        e for e in entites
        if registre.async_get(e) is None and hass.states.get(e) is None
    ]


def _resoudre(sous_schema: dict) -> dict:
    """Suit un `$ref: #/$defs/<nom>` vers sa definition ; rend le
    sous-schema tel quel s'il n'en porte aucun."""
    ref = sous_schema.get("$ref", "")
    if ref.startswith("#/$defs/"):
        return SCHEMA_JSON["$defs"][ref.removeprefix("#/$defs/")]
    return sous_schema


def _entites_avec_schema(valeur: Any, sous_schema: dict) -> list[str]:
    """Descend dans `valeur` ET dans `sous_schema`, EN PARALLELE : c'est le
    sous-schema, jamais le NOM de la cle ni la FORME de la valeur, qui dit
    si une chaine est une entite -- `nom` en est une dans un slot de
    minuteur, jamais a la racine ni dans une source media, et seul le
    sous-schema associe a CE chemin le sait.

    - `$ref: #/$defs/entite` sur une valeur `str` : c'est une entite.
    - `type: array` : chaque element est descendu avec `items`.
    - `type: object` (ou un `$ref` qui y resout) : chaque cle PRESENTE dans
      `valeur` est descendue avec `properties[cle]` ; une cle absente de
      `properties` (un champ que le contrat ne connait pas) ne rend rien.
    - tout le reste (un `str`/`bool`/`int` dont le sous-schema n'est pas
      une entite, un type qui ne correspond a rien de ce qui precede) : rien.
    """
    if sous_schema.get("$ref") == "#/$defs/entite":
        return [valeur] if isinstance(valeur, str) else []
    resolu = _resoudre(sous_schema)
    type_ = resolu.get("type")
    if type_ == "array" and isinstance(valeur, list):
        items = resolu.get("items", {})
        return [e for element in valeur for e in _entites_avec_schema(element, items)]
    if type_ == "object" and isinstance(valeur, dict):
        proprietes = resolu.get("properties", {})
        return [
            e for cle, sous_valeur in valeur.items() if cle in proprietes
            for e in _entites_avec_schema(sous_valeur, proprietes[cle])
        ]
    return []


def entites_dans(valeur: Any, cle: str) -> list[str]:
    """Les chaines de `valeur` (l'element d'une section « liste » ou l'objet
    d'une section « objet ») que le CONTRAT designe comme des entites --
    jamais une chaine au seul motif qu'elle en a la FORME, ni au seul motif
    que sa CLE porte un nom connu ailleurs comme entite (voir la docstring
    de module).

    `cle` : la section d'ou vient `valeur`. Son sous-schema de depart est
    `properties[cle]["items"]` pour une section « liste » (un TABLEAU,
    `listes.py`) -- pour `ouvrants`/`listesTachesExtra`, cet `items` EST
    `$ref: #/$defs/entite` : l'element nu (une chaine SANS cle autour) est
    donc collecte SANS cas particulier. Une section « objet » (`voiture`,
    `objets.py`) n'a PAS d'`items` : `properties[cle]` EST deja le bon
    sous-schema, generique aux deux formes -- jamais un `if cle ==
    "voiture"`, la meme faute de forme que l'ensemble plat de noms que la
    ronde de correction 2 a deja fermee."""
    proprietes_cle = SCHEMA_JSON["properties"][cle]
    sous_schema = proprietes_cle.get("items", proprietes_cle)
    return _entites_avec_schema(valeur, sous_schema)
