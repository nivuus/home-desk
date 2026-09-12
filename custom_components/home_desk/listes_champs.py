"""Le CATALOGUE des sections « liste » : leurs champs, leurs selecteurs, la
construction et l'affichage d'un element. `listes.py` porte le SQUELETTE
(choisir/ajouter/modifier/monter/descendre/supprimer), identique pour les
cinq sections ; ce module porte ce qui DIFFERE — exactement la couture que
la tache 6 decrit (« elles different par leurs champs, pas par leur forme »).
Separe de `listes.py` en ronde 1 de relecture pour rester sous 500 lignes,
jamais a un compte de lignes arbitraire.
"""
from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass
from typing import Any, Callable

import voluptuous as vol

from homeassistant.helpers import selector

from . import schema
from .const import ACTION_DESCENDRE, ACTION_ENREGISTRER, ACTION_MONTER, ACTION_SUPPRIMER

# Le vocabulaire d'icones vient de contrat/icones.json, JAMAIS retape a la
# main : une seconde copie divergerait en silence de celle deja generee dans
# ecran.schema.json (et lue par schema.py) — exactement ce que la relecture
# du plan 1 avait deja corrige en generant l'enum du schema depuis ce
# fichier. Meme regle d'emplacement que schema.py/budget.py (decision de la
# tache 3) : relatif au module, jamais "../../contrat".
CHEMIN_ICONES = pathlib.Path(__file__).parent / "contrat" / "icones.json"
_ICONES_OPTIONS: list[str] = json.loads(CHEMIN_ICONES.read_text(encoding="utf-8"))["icones"]

# AUCUNE section « liste » ne restreint le domaine de ses entites — corrige
# EN DEUX TEMPS apres verification directe sur les ecrans reels
# (app/src/ecran.ts). $defs/bouton (commandes, ambiances, extrasMaison) l'a
# ete des la ronde 1 : une premiere version restreignait "entite"/"cible" a
# light/cover/lock/switch, alors que l'inventaire REEL deborde largement
# cette liste (`commandes` porte aussi binary_sensor, climate, fan, sensor,
# todo ; `ambiances` porte fan et vacuum ; `extrasMaison` ne porte QUE du
# sensor, le Scanner `sensor.home_stock_next_meal`) — et `cible` est
# `script.*` dans les CINQ tuiles reelles qui la portent, un domaine qu'AUCUNE
# des deux listes envisagees n'aurait couvert.
#
# `_DOMAINES_SYNTHESE` (sensor/binary_sensor/todo/lock/cover) et
# `_DOMAINES_OUVRANT` (binary_sensor) semblaient, eux, valides par le meme
# inventaire — mais ce n'etait qu'une COINCIDENCE : le contrat ($defs/entite)
# ne restreint LUI-MEME aucun domaine, ces deux listes n'etaient donc
# soutenues par AUCUN test qui les aurait empechees de diverger du reel, et
# le brief ne demande de restriction nulle part. Ronde 2 de relecture : les
# retirer, exactement comme la ronde 1 l'avait deja fait pour $defs/bouton —
# une contrainte non tenue par un test est une contrainte INVENTEE, quelle
# que soit la plausibilite de sa premiere justification.

_ACTIONS_EDITION = [ACTION_ENREGISTRER, ACTION_MONTER, ACTION_DESCENDRE, ACTION_SUPPRIMER]


def _selecteur_icone() -> selector.SelectSelector:
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=list(_ICONES_OPTIONS), mode=selector.SelectSelectorMode.DROPDOWN
        )
    )


def _selecteur_entite() -> selector.EntitySelector:
    """Aucune restriction de domaine, sur AUCUNE section — voir la note
    ci-dessus. Le parametre `domaines` a disparu en ronde 2 (les deux seuls
    appelants qui le fournissaient encore, synthese et ouvrants, n'etaient
    couverts par aucun test) plutot que d'etre laisse en place, invitant
    silencieusement une future section a en reintroduire un."""
    return selector.EntitySelector(selector.EntitySelectorConfig())


def _selecteur_geste() -> selector.SelectSelector:
    """Les quatre gestes sont des valeurs FIXES (jamais dynamiques comme les
    options de `element`, listes.py) : `translation_key` s'y applique
    proprement, la meme mecanique que `derivative` utilise pour `time_unit`
    (`homeassistant/components/derivative/config_flow.py` +
    `strings.json` -> `selector.time_unit.options`)."""
    return selector.SelectSelector(
        selector.SelectSelectorConfig(options=list(_ACTIONS_EDITION), translation_key="geste")
    )


def _fusionner(champs_contrat: frozenset[str], existant: dict | None, donnee: dict) -> dict:
    """Corrige le Critique de la ronde 1 : un `enregistrer` qui ecrivait
    `elements[index] = valide` remplacait l'element ENTIER par le seul
    resultat valide du formulaire — une tuile portant `service`, `vue`,
    `epingle`, `absenceNommee` ou `lien`, editee pour son seul `libelle`,
    perdait les cinq autres en silence (voir le rapport de tache 6, ronde 1,
    et le test qui tient desormais cette regle).

    Ne remplace un element existant qu'avec les champs que CE formulaire
    gere (`donnee`) ; tout champ du contrat que l'existant portait et que ce
    formulaire ne gere PAS encore (`champs_contrat` en exclut le complement)
    survit intact. Aujourd'hui `champs_contrat` couvre l'integralite de
    $defs/bouton ou $defs/synthese (les cinq champs manquants ont rejoint le
    formulaire dans la meme ronde) : cette branche est une defense pour un
    champ futur, jamais active en pratique — c'est `donnee`, deja filtree
    par le formulaire, qui porte l'essentiel du resultat."""
    fusion = {k: v for k, v in (existant or {}).items() if k not in champs_contrat}
    fusion.update(donnee)
    return fusion


# --------------------------------------------------------------------------
# $defs/bouton (commandes, ambiances, extrasMaison) : DIX proprietes dans le
# contrat, dix dans ce formulaire — plus aucun champ que ce formulaire
# ignorerait. `service` (paire de deux chaines) n'a pas d'equivalent HA a
# deux valeurs : deux champs texte separes (`service_domaine`/
# `service_action`), recomposes en tableau par `_construire_donnee_bouton`
# et decomposes pour l'affichage par `_afficher_bouton`. `vue` garde son
# `str` large ici : son motif `^#` est CELUI de `schema.BOUTON`
# (`_VUE_PATTERN`), rejoue a la validation — jamais retape ici.
# --------------------------------------------------------------------------

CHAMPS_BOUTON = frozenset(
    {
        "libelle", "icone", "entite", "cible", "service", "lien", "vue",
        "epingle", "absenceNommee", "note",
    }
)

_CHAMPS_TEXTE_BOUTON = ("libelle", "icone", "entite", "cible", "lien", "vue", "absenceNommee", "note")


def _schema_bouton(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {
        vol.Required("libelle"): str,
        vol.Required("icone"): _selecteur_icone(),
        vol.Required("entite"): _selecteur_entite(),
        vol.Optional("cible"): _selecteur_entite(),
        vol.Optional("service_domaine"): str,
        vol.Optional("service_action"): str,
        vol.Optional("lien"): str,
        vol.Optional("vue"): str,
        vol.Optional("epingle", default=False): selector.BooleanSelector(),
        vol.Optional("absenceNommee"): str,
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


class ServiceIncomplet(Exception):
    """Leve par `_construire_donnee_bouton` quand `service_domaine`/
    `service_action` sont a demi remplis. Ronde 3 de relecture : la ronde 2
    rejouait `schema._paire_service()` (alors publique, `paire_service()`)
    pour ce refus, qui leve avec un chemin VIDE (un validateur FEUILLE,
    jamais imbrique dans un dict au moment ou il est appele ici) — le
    message reellement affiche etait "Ce champ n'est pas valide : : minItems.",
    un mot-cle JSON Schema destine au corpus ajv, jamais a un humain, pose
    sur "base" (aucun champ surligne). Une exception DEDIEE, portant le nom
    du champ REELLEMENT vide, permet a `_async_step_section_element` de
    poser un message qui nomme le geste a faire plutot qu'un vocabulaire de
    validateur. `schema._paire_service()` redevient privee en ronde 4 (plus
    aucun appelant hors de `schema.py`) ; la regle « exactement deux »
    vit desormais a deux endroits, assume — voir sa docstring."""

    def __init__(self, champ_vide: str) -> None:
        self.champ_vide = champ_vide
        super().__init__(champ_vide)


class ChampVide(Exception):
    """Leve quand un champ texte REQUIS d'une section « liste »
    ($defs/bouton.libelle, $defs/synthese.texte) est vide ou ne contient
    QUE des espaces. Ronde 4 de relecture (mineur) : `nom` est
    `.strip()`-verifie depuis la ronde 1 (`EcranSubentryFlow.
    async_step_user`) ; `libelle`/`texte` ne l'etaient pas — une tuile au
    libelle invisible (`"   "`) etait acceptee et PERSISTEE, le bouton mort
    que ce depot s'interdit.

    Ce N'EST PAS une regle a corriger dans schema.py : `_chaine(1)`
    (minLength: 1) compte les espaces comme des caracteres, EXACTEMENT ce
    qu'ajv ferait aussi sur `contrat/ecran.schema.json` — y ajouter un
    `.strip()` ferait DIVERGER le miroir voluptuous du contrat partage
    (`contrat/cas-schema.json`). Le garde-fou est donc un garde-fou
    d'ERGONOMIE propre a CE formulaire, comme celui deja pose sur `nom`,
    jamais une correction du contrat lui-meme."""

    def __init__(self, champ: str) -> None:
        self.champ = champ
        super().__init__(champ)


def _construire_donnee_bouton(user_input: dict[str, Any], existant: dict | None) -> dict:
    """Ronde 2 de relecture : `service_domaine`/`service_action`, une paire a
    demi remplie, etait auparavant abandonnee EN SILENCE — ni ecrite, ni
    refusee. En EDITION, ce silence effacait un `service` deja stocke des que
    l'utilisateur touchait un seul des deux champs texte (une faute de
    frappe dans "service_action" suffisait a rendre une tuile de commande
    muette, le bouton mort que ce depot s'interdit). Refuse desormais en
    levant `ServiceIncomplet(champ_vide)` — voir sa docstring pour pourquoi
    ce n'est plus `schema._paire_service()` qui porte ce refus depuis la
    ronde 3.

    Ronde 4 : `libelle` vide ou compose uniquement d'espaces leve desormais
    `ChampVide("libelle")`, meme doctrine que `nom`
    (`EcranSubentryFlow.async_step_user`, ronde 1) — voir `ChampVide`."""
    if not (user_input.get("libelle") or "").strip():
        raise ChampVide("libelle")
    donnee: dict[str, Any] = {}
    for champ in _CHAMPS_TEXTE_BOUTON:
        valeur = user_input.get(champ)
        if valeur not in (None, ""):
            donnee[champ] = valeur
    if user_input.get("epingle") is True:
        donnee["epingle"] = True
    domaine = (user_input.get("service_domaine") or "").strip()
    action = (user_input.get("service_action") or "").strip()
    if domaine and not action:
        raise ServiceIncomplet("service_action")
    if action and not domaine:
        raise ServiceIncomplet("service_domaine")
    if domaine and action:
        donnee["service"] = [domaine, action]
    return _fusionner(CHAMPS_BOUTON, existant, donnee)


def _afficher_bouton(valeur: dict | None) -> dict:
    """L'inverse de `_construire_donnee_bouton` pour `service` : un tableau
    stocke `["light", "turn_on"]` redevient les deux champs texte du
    formulaire, faute de quoi une tuile existante reeditee perdrait
    l'affichage (pas la donnee — `_fusionner` la garde) de son service."""
    if not valeur:
        return {}
    affichage = dict(valeur)
    service = affichage.pop("service", None)
    if service:
        affichage["service_domaine"], affichage["service_action"] = service[0], service[1]
    return affichage


# --------------------------------------------------------------------------
# $defs/synthese (ligne de synthese) : HUIT proprietes dans le contrat, huit
# dans ce formulaire.
# --------------------------------------------------------------------------

CHAMPS_SYNTHESE = frozenset(
    {"entite", "texte", "operateur", "valeur", "perso", "horsTaches", "absenceNommee", "note"}
)

_CHAMPS_TEXTE_SYNTHESE = ("entite", "texte", "operateur", "absenceNommee", "note")


def _schema_synthese(editable: bool) -> vol.Schema:
    """`valeur` reste un CHAMP TEXTE UNIQUE : `<`/`>` exigent un nombre,
    `==`/`!=` acceptent aussi une chaine — l'union discriminee par
    `operateur` que `_construire_donnee_synthese`/`schema.SYNTHESE` tranchent
    ensemble (conversion puis validation), apres avoir tente de convertir une
    saisie numerique (`_convertir_valeur`). Sans cette conversion, un champ
    texte unique laisserait passer `{operateur: "<", valeur: "35"}` (une
    CHAINE) au refus du schema — exactement le cas que porte le corpus
    partage (`contrat/cas-schema.json`, rejoue par
    `tests/composant/test_schema.py`). La conversion rend `<`/`>` utilisables
    sans champ dedie ; le refus, lui, reste entier pour une valeur vraiment
    incompatible (`<` avec "chaud") — nomme par `motif()`, jamais un
    « valeur invalide » muet."""
    champs: dict[Any, Any] = {
        vol.Required("entite"): _selecteur_entite(),
        vol.Required("texte"): str,
        vol.Required("operateur"): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.OPERATEURS), mode=selector.SelectSelectorMode.DROPDOWN
            )
        ),
        vol.Required("valeur"): str,
        vol.Optional("perso", default=False): selector.BooleanSelector(),
        vol.Optional("horsTaches", default=False): selector.BooleanSelector(),
        vol.Optional("absenceNommee"): str,
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


def _convertir_valeur(brut: str) -> Any:
    """Une saisie numerique (`"35"`, `"-2.5"`) devient un nombre ; le reste
    reste une chaine. `int` avant `float` : `schema.SYNTHESE` ne distingue
    pas les deux (`isinstance(valeur, (int, float))`), mais garder l'entier
    entier evite d'ecrire `35.0` pour un seuil que l'utilisateur a tape
    `35` — clouee par `test_convertir_valeur_garde_un_entier_entier`
    (ronde 1 : mutation verte au premier passage, aucun test ne l'exercait)."""
    try:
        return int(brut)
    except ValueError:
        pass
    try:
        return float(brut)
    except ValueError:
        return brut


def _construire_donnee_synthese(user_input: dict[str, Any], existant: dict | None) -> dict:
    """Ronde 4 de relecture (mineur) : `texte` vide ou compose uniquement
    d'espaces leve `ChampVide("texte")` — meme garde-fou que `libelle`
    (`_construire_donnee_bouton`), voir sa docstring."""
    if not (user_input.get("texte") or "").strip():
        raise ChampVide("texte")
    donnee: dict[str, Any] = {}
    for champ in _CHAMPS_TEXTE_SYNTHESE:
        valeur = user_input.get(champ)
        if valeur not in (None, ""):
            donnee[champ] = valeur
    valeur_brute = user_input.get("valeur")
    if valeur_brute not in (None, ""):
        donnee["valeur"] = _convertir_valeur(valeur_brute)
    if user_input.get("perso") is True:
        donnee["perso"] = True
    if user_input.get("horsTaches") is True:
        donnee["horsTaches"] = True
    return _fusionner(CHAMPS_SYNTHESE, existant, donnee)


def _afficher_synthese(valeur: dict | None) -> dict:
    """Ronde 4 de relecture (mineur) : `valeur` est STOCKEE comme un NOMBRE
    (int/float) des que `_convertir_valeur` a reussi, mais `_schema_synthese`
    declare ce champ `str` — le seul DESACCORD de type entre `afficher()` et
    `construire_schema()` du composant. Reproposer le nombre TEL QUEL comme
    `suggested_value` desaccorde les deux cotes : une reedition qui ne
    touche pas ce champ resoumettrait ce nombre, que le `str` impose par HA
    (`data_schema(user_input)`, avant meme d'atteindre ce step) refuserait —
    `InvalidData`, une EXCEPTION non rattrapee, jamais un formulaire
    reaffiche. Exactement la classe de defaut (deux cotes d'un meme champ
    qui divergent en silence) qui a deja coute plusieurs rondes ailleurs
    dans ce chantier — corrigee ici avant qu'un test ne la revele en
    plantant plutot qu'en echouant proprement."""
    if not valeur:
        return {}
    affichage = dict(valeur)
    if "valeur" in affichage:
        affichage["valeur"] = str(affichage["valeur"])
    return affichage


# --------------------------------------------------------------------------
# `ouvrants` (racine du contrat) : un tableau d'`entite`, pas de `bouton` —
# la section « liste plus simple, sans formulaire de tuile » demandee en
# ronde 1. Un element est une chaine, pas un dict : `construire_donnee`/
# `afficher` emballent/deballent en consequence ; la fusion de champs ne
# s'y applique pas (un seul champ, remplace en bloc).
# --------------------------------------------------------------------------

def _schema_ouvrant(editable: bool) -> vol.Schema:
    champs: dict[Any, Any] = {vol.Required("entite"): _selecteur_entite()}
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = _selecteur_geste()
    return vol.Schema(champs)


def _construire_donnee_ouvrant(user_input: dict[str, Any], existant: Any) -> Any:
    return user_input.get("entite")


def _afficher_ouvrant(valeur: Any) -> dict:
    return {"entite": valeur} if valeur else {}


def _valider_ouvrant(valeur: Any) -> Any:
    """`schema.ENTITE` est un validateur FEUILLE : applique ici DIRECTEMENT
    (jamais imbrique dans un `vol.Schema({...})` comme pour $defs/bouton ou
    $defs/synthese), une entite invalide leve avec un chemin VIDE — la MEME
    classe de defaut de vocabulaire que la ronde 3 de relecture a corrigee
    pour `service` (schema.py, `_FauteMinItems` sans `path`). `ouvrants` est
    la SEULE section dont le formulaire n'a qu'un champ ("entite") : on
    attribue nous-memes ce chemin plutot que de laisser
    `_async_step_section_element` retomber sur "base" (aucun champ
    surligne) quand `brut.path` est vide."""
    try:
        return schema.ENTITE(valeur)
    except vol.Invalid as err:
        # `path` est en LECTURE SEULE sur vol.Invalid (et sur son equivalent
        # probatio, cf. schema.motif() sur ce meme point) : on ne peut pas la
        # modifier en place, on releve une instance de la MEME classe (donc
        # le MEME `mot_cle`) portant le chemin voulu.
        if not err.path:
            raise type(err)(str(err), path=["entite"]) from err
        raise


@dataclass(frozen=True)
class Section:
    """Ce que `listes.SectionsListeMixin` a besoin de savoir sur une
    section, et RIEN de plus : comment afficher un element dans le choix
    (`libelle`), le valider (`valider`), construire son formulaire
    (`construire_schema`), fabriquer la donnee a valider a partir de la
    saisie (`construire_donnee`), et fabriquer les valeurs suggerees a
    partir de la donnee stockee (`afficher`)."""

    cle: str
    libelle: Callable[[Any], str]
    valider: Callable[[Any], Any]
    construire_schema: Callable[[bool], vol.Schema]
    construire_donnee: Callable[[dict, Any], Any]
    afficher: Callable[[Any], dict]


# Le squelette (listes.py) est reutilise CINQ fois : les tuiles de commande,
# la rangee d'ambiance et les extras maison partagent litteralement la meme
# forme ($defs/bouton), seule la cle de donnee change. La ligne de synthese
# differe par ses champs ($defs/synthese), les ouvrants par leur FORME (un
# scalaire, pas un objet) — mais jamais par le parcours choisir/ajouter/
# modifier/monter/descendre/supprimer.
SECTIONS: dict[str, Section] = {
    "commandes": Section(
        "commandes", lambda el: el["libelle"], schema.BOUTON, _schema_bouton,
        _construire_donnee_bouton, _afficher_bouton,
    ),
    "ambiances": Section(
        "ambiances", lambda el: el["libelle"], schema.BOUTON, _schema_bouton,
        _construire_donnee_bouton, _afficher_bouton,
    ),
    "extrasMaison": Section(
        "extrasMaison", lambda el: el["libelle"], schema.BOUTON, _schema_bouton,
        _construire_donnee_bouton, _afficher_bouton,
    ),
    "ouvrants": Section(
        "ouvrants", lambda el: el, _valider_ouvrant, _schema_ouvrant,
        _construire_donnee_ouvrant, _afficher_ouvrant,
    ),
    "synthese": Section(
        "synthese", lambda el: el["texte"], schema.SYNTHESE, _schema_synthese,
        _construire_donnee_synthese, _afficher_synthese,
    ),
}
