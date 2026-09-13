"""Les deux services qui font sortir/entrer la configuration du depot HA
(`.storage`, invisible a git) vers un fichier YAML du repertoire `config/` --
`home_desk.exporter` l'ecrit, `home_desk.importer` le relit.

C'est la reponse a deux des cinq regressions nommees franchement dans le
README : « la config n'est plus versionnee par defaut » (exporter la
rattrape A LA DEMANDE, jamais automatiquement -- rien ici ne s'execute a
`async_setup_entry`) et « le raisonnement quitte le depot » (les `note`,
vivantes dans `.storage`, redeviennent des COMMENTAIRES dans le fichier
exporte -- voir `yaml_ecrans.py`, qui porte tout le format).

`importer` est aussi l'entree de la migration du plan 3c : semer, dans une
installation neuve ou aucune sous-entree n'existe encore, les ecrans
aujourd'hui en dur dans `app/src/ecran.ts`. C'est pour cela qu'il est
ATOMIQUE (voir `garde_ecran.importer_ecrans`, qui porte la garantie) --
c'est exactement le moment ou une ecriture partielle serait la plus couteuse
a diagnostiquer, juste avant que les literaux ne soient retires du depot.

Ni l'un ni l'autre ne prend de champ : la RESPONSABILITE de choisir QUOI
exporter/importer resterait a ajouter si un jour ce composant devait gerer
plusieurs installations a la fois -- `single_config_entry: true`
(manifest.json) le rend inutile aujourd'hui, une seule entree existe
toujours quand ces services sont enregistres (voir `async_setup_services`,
appele par `__init__.async_setup_entry`, jamais avant qu'une entree existe)."""
from __future__ import annotations

import pathlib

import voluptuous as vol
import yaml

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError

from . import garde_ecran, yaml_ecrans
from .const import DOMAIN, FICHIER_EXPORT_ECRANS, SERVICE_EXPORTER, SERVICE_IMPORTER


def _lire_fichier(chemin: pathlib.Path) -> str:
    """E/S bloquante, jamais appelee directement depuis une coroutine --
    toujours via `hass.async_add_executor_job` (voir les deux services
    ci-dessous). Home Assistant refuse en PRODUCTION un appel bloquant fait
    DEPUIS la boucle d'evenements.

    Ronde 1 de relecture (Important, neuvieme docstring menteuse du
    chantier) : la version precedente affirmait « les tests de
    `pytest-homeassistant-custom-component` le verifient » -- FAUX, mesure
    en inlinant cet appel SANS `async_add_executor_job` : les 186 tests
    restent verts. Ce garde-fou de production (`hass.
    verify_event_loop_thread`) est DESACTIVE pour cette suite
    (`skip_for_tests=True`, propre a l'idiome de test de Home Assistant) --
    la suite ne peut donc PAS voir une regression sur ce point par ce
    chemin. Ce que `test_services.py` garde a la place : une sonde qui
    verifie que `hass.async_add_executor_job` est REELLEMENT appele pour
    `_lire_fichier`/`_ecrire_fichier` (`test_exporter_et_importer_font_
    leur_ES_hors_de_la_boucle_d_evenements`) -- une preuve du CODE, pas du
    garde-fou HA lui-meme, qu'aucune suite de ce depot ne peut exercer."""
    return chemin.read_text(encoding="utf-8")


def _ecrire_fichier(chemin: pathlib.Path, texte: str) -> None:
    """Le pendant en ecriture de `_lire_fichier`, meme regle -- et la meme
    limite de ce que ce depot peut prouver, voir sa docstring."""
    chemin.write_text(texte, encoding="utf-8")


def _entree(hass: HomeAssistant):
    """L'entree unique « Tablettes murales ». Jamais `[0]` sans garde
    ailleurs dans ce paquet (voir `websocket._sous_entrees`) -- mais ICI,
    l'indexation directe est sure : ces deux services ne sont enregistres
    QUE par `async_setup_entry` (donc apres que l'entree existe) et
    desenregistres par `async_unload_entry` (donc avant qu'elle ne
    disparaisse) -- voir `async_setup_services`/`async_unload_services`."""
    return hass.config_entries.async_entries(DOMAIN)[0]


async def _async_exporter(call: ServiceCall) -> None:
    """`home_desk.exporter` : ecrit TOUS les ecrans actuels de l'entree
    dans `config/home_desk_ecrans.yaml`, `note` en commentaires (voir
    `yaml_ecrans.rendre`). `titre` (`ConfigSubentry.title`) est inclus a
    cote des champs du contrat -- un renommage du seul titre (websocket.py
    en documente la possibilite, independante de `nom`) doit survivre a un
    aller-retour, pas seulement les champs de `schema.ECRAN`."""
    hass = call.hass
    entry = _entree(hass)
    ecrans = [{"titre": sous_entree.title, **sous_entree.data} for sous_entree in entry.subentries.values()]
    texte = yaml_ecrans.rendre(ecrans)
    chemin = pathlib.Path(hass.config.path(FICHIER_EXPORT_ECRANS))
    await hass.async_add_executor_job(_ecrire_fichier, chemin, texte)


async def _async_importer(call: ServiceCall) -> None:
    """`home_desk.importer` : relit `config/home_desk_ecrans.yaml` et
    REMPLACE l'integralite des sous-entrees de l'entree par son contenu --
    voir `garde_ecran.importer_ecrans` pour la garantie ATOMIQUE (tout ou
    rien) et pourquoi c'est un remplacement, jamais une fusion.

    Trois fautes distinctes, jamais confondues sous un message generique :
    le fichier est illisible (`OSError` -- absent, permissions...), il
    n'est pas du YAML valide ou n'a pas la forme attendue
    (`yaml.YAMLError`/`ValueError`, voir `yaml_ecrans.lire`), ou il l'est
    mais au moins un ecran ne respecte pas le contrat, ou porte un `nom` en
    double (`vol.Invalid`, voir `garde_ecran.importer_ecrans`). Chacune
    devient une `HomeAssistantError` -- jamais rattrapee plus large que ces
    trois types, jamais avalee : un import qui echoue doit le dire, pas
    continuer en silence sur une configuration a moitie lue."""
    hass = call.hass
    entry = _entree(hass)
    chemin = pathlib.Path(hass.config.path(FICHIER_EXPORT_ECRANS))
    try:
        texte = await hass.async_add_executor_job(_lire_fichier, chemin)
    except OSError as err:
        raise HomeAssistantError(f"impossible de lire {chemin} : {err}") from err
    try:
        ecrans_bruts = yaml_ecrans.lire(texte)
    except (yaml.YAMLError, ValueError) as err:
        raise HomeAssistantError(f"{chemin} n'est pas exploitable : {err}") from err

    ecrans: list[tuple[str, dict]] = []
    for brut in ecrans_bruts:
        donnees = dict(brut)
        titre = donnees.pop("titre", None)
        if titre is None:
            raise HomeAssistantError(
                f"{chemin} : un ecran ne porte pas de champ 'titre' -- "
                "ce fichier n'a pas ete produit par home_desk.exporter"
            )
        ecrans.append((titre, donnees))

    try:
        garde_ecran.importer_ecrans(hass, entry, ecrans)
    except vol.Invalid as err:
        raise HomeAssistantError(f"import refuse, rien n'a ete ecrit : {err}") from err


_SCHEMA_SANS_CHAMP = vol.Schema({})
# Ronde 1 de relecture (Mineur) : ni l'un ni l'autre service ne prend de
# champ (voir la docstring de module) -- sans un SCHEMA qui le dise, Home
# Assistant AVALE en silence tout champ inconnu (`{"chemin": "..."}`, par
# exemple) plutot que de le refuser : un bouton mort en miniature, le genre
# de refus muet que ce depot s'interdit ailleurs. `vol.Schema({})` refuse
# EXPLICITEMENT toute cle -- verifie par execution (`vol.Invalid: extra
# keys not allowed`).


def async_setup_services(hass: HomeAssistant) -> None:
    """Enregistre les deux services -- appelee par `__init__.async_setup_entry`,
    donc apres que l'entree existe (voir `_entree`)."""
    hass.services.async_register(DOMAIN, SERVICE_EXPORTER, _async_exporter, schema=_SCHEMA_SANS_CHAMP)
    hass.services.async_register(DOMAIN, SERVICE_IMPORTER, _async_importer, schema=_SCHEMA_SANS_CHAMP)


def async_unload_services(hass: HomeAssistant) -> None:
    """Le pendant de `async_setup_services` -- appelee par
    `__init__.async_unload_entry`, symetrique. Un rechargement de l'entree
    (options modifiees, redemarrage) decharge puis recharge : sans ce
    retrait, `async_register` serait rappele sur un service DEJA enregistre
    -- inoffensif (Home Assistant remplace silencieusement le gestionnaire),
    mais ce module prefere le dire plutot que le laisser implicite."""
    hass.services.async_remove(DOMAIN, SERVICE_EXPORTER)
    hass.services.async_remove(DOMAIN, SERVICE_IMPORTER)
