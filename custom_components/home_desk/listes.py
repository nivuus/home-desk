"""Le squelette commun des sections « liste » du menu d'un ecran : tuiles de
commande, rangee d'ambiance, ligne de synthese. Trois sections, UNE SEULE
forme — ajouter, choisir, modifier, monter, descendre, supprimer — ecrite ici
une fois et reutilisee par `EcranSubentryFlow` (config_flow.py) pour les
trois ; la tache 7 y ajoute les minuteurs de la meme facon.

**Verifie sur les sources reelles de Home Assistant 2026.9.1** (meme demarche
que config_flow.py, cf. son rapport de tache) :

- `ConfigSubentryFlowManager.async_create_flow` pose
  `subentry_flow.init_step = context["source"]` : le step D'ENTREE d'un flow
  de sous-entree porte le NOM de la source. Pour une creation, la source est
  `SOURCE_USER` ("user"), d'ou `async_step_user` (tache 5). Pour EDITER une
  sous-entree EXISTANTE, la source est `SOURCE_RECONFIGURE` ("reconfigure") :
  le point d'entree est donc `async_step_reconfigure`, et le contexte doit
  porter `subentry_id` — `ConfigSubentryFlow._get_reconfigure_subentry()` le
  lit dans `self.context["subentry_id"]` et leve si absent.
- `FlowManager._async_configure` (data_entry_flow.py) : quand l'etape
  courante est un MENU et que l'utilisateur choisit une option, HA appelle
  directement `async_step_<option>(None)` — jamais avec le `user_input` du
  menu lui-meme. Un `async_show_menu(menu_options=[...])` route donc VERS un
  step homonyme de chaque option : les noms de section (`commandes`,
  `ambiances`, `synthese`) sont a la fois les cles des donnees ET les noms
  des steps qu'ils declenchent.
- La MEME methode applique AUSSI `data_schema(user_input)` avant d'appeler le
  step courant, des que `data_schema` est present sur l'etape (verifie en
  lisant `data_entry_flow.py`, la boucle `_async_configure`) — contrairement
  a ce qu'affirme la docstring de module de `config_flow.py` au sujet de
  `SCHEMA_IDENTITE` (tache 5). Cette lecture-la etait fausse sur ce point
  precis, sans consequence pour elle puisque `SCHEMA_IDENTITE` n'y valide que
  des TYPES python deja corrects (un `str`, un `int`). Une violation de
  `data_schema` (mauvais type, option hors enum) remonte donc comme une
  EXCEPTION `InvalidData`, jamais comme un formulaire reaffiche avec erreurs :
  la seule facon d'obtenir un refus ergonomique (`errors={...}`) est de
  laisser `data_schema` large (types `str`, selecteurs qui n'imposent que le
  DOMAINE d'une entite ou l'appartenance a un ENUM deja correct) et de faire
  NOUS-MEMES le refus metier, exactement comme `EcranSubentryFlow.
  async_step_user` le fait deja pour le budget et les bornes de hauteur.
  `_valider_element()` ci-dessous rejoue donc `schema.BOUTON`/
  `schema.SYNTHESE` plutot que de compter sur `data_schema` pour refuser une
  saisie : DEUX validateurs pour une seule regle serait exactement la
  divergence que `schema.py` existe pour empecher (sa propre docstring).

**Persistance immediate, jamais de creation en fin de parcours.** Une
sous-entree « ecran » existe deja (creee par `async_step_user`, tache 5)
avant qu'aucune section liste ne soit ouverte : il n'y a donc rien a
« creer » ici, seulement a METTRE A JOUR. Chaque geste (ajouter, enregistrer,
monter, descendre, supprimer) appelle `ConfigSubentryFlow._async_update`
(ecriture immediate, sans terminer le flow) puis reaffiche un step — jamais
`async_create_entry` : celui-ci exige `self.source == SOURCE_USER`
(`ConfigSubentryFlow.async_create_entry`) et leve sous `SOURCE_RECONFIGURE`,
la source de CE flow.
"""
from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass
from typing import Any, Callable

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigSubentry
from homeassistant.helpers import selector

from . import schema
from .const import (
    ACTION_AJOUTER,
    ACTION_DESCENDRE,
    ACTION_ENREGISTRER,
    ACTION_MONTER,
    ACTION_SUPPRIMER,
    ERREUR_CHAMP_INVALIDE,
)

# Le vocabulaire d'icones vient de contrat/icones.json, JAMAIS retape a la
# main : une seconde copie divergerait en silence de celle deja generee dans
# ecran.schema.json (et lue par schema.py) — exactement ce que la relecture
# du plan 1 avait deja corrige en generant l'enum du schema depuis ce
# fichier. Meme regle d'emplacement que schema.py/budget.py (decision de la
# tache 3) : relatif au module, jamais "../../contrat".
CHEMIN_ICONES = pathlib.Path(__file__).parent / "contrat" / "icones.json"
_ICONES_OPTIONS: list[str] = json.loads(CHEMIN_ICONES.read_text(encoding="utf-8"))["icones"]

# $defs/bouton (tuiles de commande et rangee d'ambiance) : light/cover/lock/
# switch, les domaines qu'un bouton d'ecran mural actionne reellement.
_DOMAINES_TUILE = ["light", "cover", "lock", "switch"]
# $defs/synthese (ligne de synthese) : ce qu'une synthese resume est un ETAT
# a lire, jamais un service a appeler.
_DOMAINES_SYNTHESE = ["sensor", "binary_sensor", "todo", "lock", "cover"]

_ACTIONS_EDITION = [ACTION_ENREGISTRER, ACTION_MONTER, ACTION_DESCENDRE, ACTION_SUPPRIMER]


def _selecteur_icone() -> selector.SelectSelector:
    return selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=list(_ICONES_OPTIONS), mode=selector.SelectSelectorMode.DROPDOWN
        )
    )


def _selecteur_entite(domaines: list[str]) -> selector.EntitySelector:
    return selector.EntitySelector(selector.EntitySelectorConfig(domain=domaines))


def _schema_bouton(editable: bool) -> vol.Schema:
    """`$defs/bouton` : les champs les plus utiles a l'edition depuis
    l'interface. `service`, `lien`, `vue`, `epingle`, `absenceNommee` restent
    hors de ce formulaire pour cette tache (voir le rapport de tache 6, section
    couverture du contrat) ; absents de la saisie, ils restent absents de la
    donnee validee — jamais refuses par `schema.BOUTON`, qui les a tous en
    `Optional`."""
    champs: dict[Any, Any] = {
        vol.Required("libelle"): str,
        vol.Required("icone"): _selecteur_icone(),
        vol.Required("entite"): _selecteur_entite(_DOMAINES_TUILE),
        vol.Optional("cible"): _selecteur_entite(_DOMAINES_TUILE),
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = vol.In(_ACTIONS_EDITION)
    return vol.Schema(champs)


def _schema_synthese(editable: bool) -> vol.Schema:
    """`$defs/synthese`. `valeur` reste un CHAMP TEXTE UNIQUE : `<`/`>`
    exigent un nombre, `==`/`!=` acceptent aussi une chaine — l'union
    discriminee par `operateur` que `_valider_element()` tranche en rejouant
    `schema.SYNTHESE`, apres avoir tente de convertir une saisie numerique
    (`_convertir_valeur`). Sans cette conversion, un champ texte unique
    laisserait passer `{operateur: "<", valeur: "35"}` (une CHAINE) au refus
    du schema — exactement le cas que porte le corpus partage
    (`contrat/cas-schema.json`, rejoue par `tests/composant/test_schema.py`).
    La conversion rend `<`/`>` utilisables sans champ dedie ; le refus, lui,
    reste entier pour une valeur vraiment incompatible (`<` avec "chaud") —
    nomme par `motif()`, jamais un « valeur invalide » muet."""
    champs: dict[Any, Any] = {
        vol.Required("entite"): _selecteur_entite(_DOMAINES_SYNTHESE),
        vol.Required("texte"): str,
        vol.Required("operateur"): selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=list(schema.OPERATEURS), mode=selector.SelectSelectorMode.DROPDOWN
            )
        ),
        vol.Required("valeur"): str,
        vol.Optional("perso", default=False): bool,
        vol.Optional("horsTaches", default=False): bool,
        vol.Optional("note"): str,
    }
    if editable:
        champs[vol.Optional("geste", default=ACTION_ENREGISTRER)] = vol.In(_ACTIONS_EDITION)
    return vol.Schema(champs)


def _convertir_valeur(brut: str) -> Any:
    """Une saisie numerique (`"35"`, `"-2.5"`) devient un nombre ; le reste
    reste une chaine. `int` avant `float` : `schema.SYNTHESE` ne distingue
    pas les deux (`isinstance(valeur, (int, float))`), mais garder l'entier
    entier evite d'ecrire `35.0` pour un seuil que l'utilisateur a tape
    `35`."""
    try:
        return int(brut)
    except ValueError:
        pass
    try:
        return float(brut)
    except ValueError:
        return brut


@dataclass(frozen=True)
class _Section:
    cle: str
    champ_libelle: str
    valider: Callable[[dict], dict]
    construire_schema: Callable[[bool], vol.Schema]
    champ_valeur_numerique: str | None = None


# Le squelette est reutilise TROIS fois : les tuiles de commande et la rangee
# d'ambiance partagent litteralement la meme forme ($defs/bouton), seule la
# cle de donnee change. La ligne de synthese differe par ses champs
# ($defs/synthese), pas par la forme du parcours.
SECTIONS: dict[str, _Section] = {
    "commandes": _Section("commandes", "libelle", schema.BOUTON, _schema_bouton),
    "ambiances": _Section("ambiances", "libelle", schema.BOUTON, _schema_bouton),
    "synthese": _Section("synthese", "texte", schema.SYNTHESE, _schema_synthese, "valeur"),
}


def _construire_donnee(section: _Section, user_input: dict[str, Any]) -> dict[str, Any]:
    """Le geste ne fait pas partie de la donnee persistee. Un champ optionnel
    laisse vide (chaine vide, formulaire) ou une case a cocher non cochee
    (`False`) ne doit PAS finir dans le dict : `schema.BOUTON`/
    `schema.SYNTHESE` les attendent ABSENTS, jamais faux ou vides
    (`_const(True)` leve sur `False`, une chaine vide echouerait `_chaine(1)`
    pour `libelle`/`icone` si jamais l'un d'eux l'etait)."""
    donnee: dict[str, Any] = {}
    for champ, valeur in user_input.items():
        if champ == "geste" or valeur in (None, ""):
            continue
        if champ in ("perso", "horsTaches", "epingle") and valeur is not True:
            continue
        if champ == section.champ_valeur_numerique:
            valeur = _convertir_valeur(valeur)
        donnee[champ] = valeur
    return donnee


class SectionsListeMixin:
    """Le squelette. `EcranSubentryFlow` (config_flow.py) l'utilise en mixin ;
    les methodes `async_step_<section>` / `async_step_<section>_element` que
    HA exige par leur NOM (`FlowManager._async_handle_step` fait
    `getattr(flow, f"async_step_{step_id}")`, jamais une resolution
    generique) restent de fins relais definis dans config_flow.py — chacun
    vers UNE des deux methodes ci-dessous, jamais divergents entre eux."""

    _index_courant: int | None = None

    def _elements(self, subentry: ConfigSubentry, cle: str) -> list[dict]:
        return list(subentry.data.get(cle, []))

    def _persister(
        self, entry: ConfigEntry, subentry: ConfigSubentry, cle: str, elements: list[dict]
    ) -> None:
        self._async_update(entry=entry, subentry=subentry, data_updates={cle: elements})

    async def _async_step_section(self, cle: str, user_input: dict[str, Any] | None):
        """`async def async_step_<section>` : le menu « ajouter | choisir »
        du brief, fondu en UN champ `choix` (la valeur speciale ACTION_AJOUTER
        pour ajouter, sinon l'index de l'element a editer) — un `SelectSelector`
        plutot qu'un `async_show_menu` : le nombre d'options depend du nombre
        d'elements, que `async_show_menu` ne saurait pas nommer un par un avec
        leur libelle."""
        section = SECTIONS[cle]
        subentry = self._get_reconfigure_subentry()
        elements = self._elements(subentry, cle)

        if user_input is not None:
            choix = user_input["choix"]
            self._index_courant = None if choix == ACTION_AJOUTER else int(choix)
            return await getattr(self, f"async_step_{cle}_element")()

        options = [selector.SelectOptionDict(value=ACTION_AJOUTER, label="Ajouter")]
        options += [
            selector.SelectOptionDict(value=str(i), label=f"{i + 1}. {el[section.champ_libelle]}")
            for i, el in enumerate(elements)
        ]
        schema_choix = vol.Schema(
            {
                vol.Required("choix", default=ACTION_AJOUTER): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=options, mode=selector.SelectSelectorMode.LIST
                    )
                )
            }
        )
        return self.async_show_form(step_id=cle, data_schema=schema_choix)

    async def _async_step_section_element(self, cle: str, user_input: dict[str, Any] | None):
        """`async def async_step_<section>_element` : le formulaire d'un
        element, plus ses quatre gestes (`geste`, champ present uniquement en
        EDITION — ajouter un element vierge n'a rien a monter, descendre ou
        supprimer). `monter`/`descendre` sont GARDES aux deux bords : un
        index hors bornes ne fait rien et ne leve pas (cf. rapport, mutation
        de l'etape 5 du brief)."""
        section = SECTIONS[cle]
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        elements = self._elements(subentry, cle)
        index = self._index_courant
        existant = elements[index] if index is not None else {}
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}

        if user_input is not None:
            geste = user_input.get("geste", ACTION_ENREGISTRER)

            if geste == ACTION_MONTER:
                if index is not None and index > 0:
                    elements[index - 1], elements[index] = elements[index], elements[index - 1]
                    self._persister(entry, subentry, cle, elements)
                    self._index_courant = index - 1
                return await self._async_step_section_element(cle, None)

            if geste == ACTION_DESCENDRE:
                if index is not None and index < len(elements) - 1:
                    elements[index + 1], elements[index] = elements[index], elements[index + 1]
                    self._persister(entry, subentry, cle, elements)
                    self._index_courant = index + 1
                return await self._async_step_section_element(cle, None)

            if geste == ACTION_SUPPRIMER:
                if index is not None:
                    del elements[index]
                    self._persister(entry, subentry, cle, elements)
                self._index_courant = None
                return await self._async_step_section(cle, None)

            # ACTION_ENREGISTRER : rejoue schema.BOUTON/schema.SYNTHESE, LA
            # MEME validation que schema.valider() sur l'ecran complet — deux
            # validateurs pour une regle serait la divergence que schema.py
            # existe pour empecher.
            donnee = _construire_donnee(section, user_input)
            try:
                valide = section.valider(donnee)
            except vol.Invalid as err:
                brut = err.errors[0] if isinstance(err, vol.MultipleInvalid) else err
                errors[str(brut.path[0]) if brut.path else "base"] = ERREUR_CHAMP_INVALIDE
                description_placeholders["motif"] = schema.motif(err)
            else:
                if index is not None:
                    elements[index] = valide
                else:
                    elements.append(valide)
                self._persister(entry, subentry, cle, elements)
                self._index_courant = None
                return await self._async_step_section(cle, None)

        return self.async_show_form(
            step_id=f"{cle}_element",
            data_schema=self.add_suggested_values_to_schema(
                section.construire_schema(index is not None), existant
            ),
            errors=errors,
            description_placeholders=description_placeholders,
        )
