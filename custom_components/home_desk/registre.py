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
deux champs de TEXTE LIBRE deja autorises par le contrat (`minLength: 1`
seulement). Exactement le mode de panne que ce module nomme lui-meme ci-
dessus : un avertissement FAUX se fait ignorer, ce qui tue aussi les vrais.

La correction n'est PAS une liste de champs a EXCLURE (`libelle`/`note`/
`lien`...) : un champ de texte libre ajoute demain au contrat serait scanne
sans que rien ne le dise -- le meme defaut, en pire. C'est une liste
d'INCLUSION, DERIVEE DU CONTRAT a l'import : les noms de propriete que
`contrat/ecran.schema.json` designe lui-meme comme portant une entite
(`$ref: #/$defs/entite`, direct ou via `items`), a la racine et dans
chaque `$defs`. Rien n'est recopie, et un champ retire ou ajoute au contrat
suit sans qu'une ligne ici ne bouge.
"""
from __future__ import annotations

import json
import pathlib
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

_CHEMIN_SCHEMA = pathlib.Path(__file__).parent / "contrat" / "ecran.schema.json"
_SCHEMA_JSON = json.loads(_CHEMIN_SCHEMA.read_text(encoding="utf-8"))


def _est_ref_entite(sous_schema: dict) -> bool:
    """VRAI si `sous_schema` designe UNE entite (`$ref: #/$defs/entite`) ou
    une LISTE d'entites (`type: array`, `items` en etant une)."""
    if sous_schema.get("$ref") == "#/$defs/entite":
        return True
    items = sous_schema.get("items")
    return isinstance(items, dict) and items.get("$ref") == "#/$defs/entite"


def _proprietes_entite(schema_objet: dict) -> frozenset[str]:
    """Les noms de propriete d'un schema `type: object` qui portent une
    entite, au premier niveau de `properties` -- jamais imbrique plus loin
    (un objet imbrique SANS `$defs` propre, comme `voiture` ou `minuteurs`,
    est hors de portee : voir le rapport de la ronde de correction 1)."""
    return frozenset(
        nom for nom, sous in schema_objet.get("properties", {}).items()
        if _est_ref_entite(sous)
    )


# DERIVE a l'import, jamais recopie : la racine du contrat, puis chaque
# `$defs` (bouton, synthese, source, agencement -- entite lui-meme n'a pas
# de sous-propriete). Mesure aujourd'hui : {temperature, aspirateur,
# ouvrants, listesTachesExtra} (racine) ; {entite, cible} (bouton) ;
# {entite} (synthese) ; {titre, sousTitre, affiche, progression, transport,
# volume} (source). `allumee.entite` ($defs/source) est imbrique SANS
# `$ref` a son propre niveau -- non compte ici, mais retrouve quand meme a
# l'usage : `entite` y est deja un nom reconnu, et `_parcourir` (plus bas)
# descend dans tout dict, quelle que soit sa cle.
CHAMPS_ENTITE: frozenset[str] = _proprietes_entite(_SCHEMA_JSON).union(
    *(_proprietes_entite(d) for d in _SCHEMA_JSON.get("$defs", {}).values())
)

# Les sections « liste » dont l'ELEMENT LUI-MEME est une entite -- une
# chaine NUE, sans cle autour (`ouvrants`, `listesTachesExtra`) : les
# proprietes RACINE de type tableau dont les elements sont `$ref: entite`.
# `etiquettesMinuteur`, l'AUTRE section a element nu, n'y figure pas : ses
# elements sont `{"type": "string"}` au contrat, jamais une entite.
SECTIONS_ELEMENT_ENTITE: frozenset[str] = frozenset(
    nom for nom, sous in _SCHEMA_JSON.get("properties", {}).items()
    if sous.get("type") == "array"
    and isinstance(sous.get("items"), dict)
    and sous["items"].get("$ref") == "#/$defs/entite"
)


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


def entites_dans(valeur: Any, cle: str | None = None) -> list[str]:
    """Les chaines de `valeur` que le CONTRAT designe comme des entites --
    jamais une chaine au seul motif qu'elle EN A LA FORME (voir la
    docstring de module : `lien`/`libelle`/`note` sont du texte libre, pas
    des entites, meme quand leur valeur ressemble a un `entity_id`).

    `cle` : la section « liste » d'ou vient `valeur` (`listes.py`). Pour les
    DEUX sections dont l'element est une chaine NUE (`SECTIONS_ELEMENT_
    ENTITE` : `ouvrants`, `listesTachesExtra`), `valeur` EST l'entite --
    aucune cle de dict ne l'entoure pour la reconnaitre autrement. Absente
    (l'identite, `config_flow.py`, qui passe deja des valeurs nommees) ou
    hors de cet ensemble, `valeur` est parcourue normalement."""
    if cle in SECTIONS_ELEMENT_ENTITE and isinstance(valeur, str):
        return [valeur]
    return _parcourir(valeur)


def _parcourir(valeur: Any) -> list[str]:
    """Descend dans `valeur` : sous une cle de `CHAMPS_ENTITE`, une chaine
    est une entite et une liste en contient ; sous toute autre cle, on
    continue de DESCENDRE (pour atteindre `allumee.entite`, imbrique) mais
    on n'EXTRAIT rien tant qu'aucune cle reconnue n'est atteinte -- une
    chaine de texte libre, elle, n'est ni un dict ni une liste et arrete la
    descente sans rien rendre."""
    trouvees: list[str] = []
    if isinstance(valeur, dict):
        for cle, sous_valeur in valeur.items():
            if cle in CHAMPS_ENTITE:
                if isinstance(sous_valeur, str):
                    trouvees.append(sous_valeur)
                elif isinstance(sous_valeur, list):
                    trouvees.extend(v for v in sous_valeur if isinstance(v, str))
            else:
                trouvees.extend(_parcourir(sous_valeur))
    elif isinstance(valeur, list):
        for element in valeur:
            trouvees.extend(_parcourir(element))
    return trouvees
