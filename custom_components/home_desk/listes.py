"""Le squelette commun des sections « liste » du menu d'un ecran : tuiles de
commande, rangee d'ambiance, tuiles « extras maison », ouvrants surveilles, et
ligne de synthese. Cinq sections, UNE SEULE forme — choisir/ajouter, modifier,
monter, descendre, supprimer — ecrite ici une fois et reutilisee par
`EcranSubentryFlow` (config_flow.py) pour les cinq ; la tache 7 y ajoute les
minuteurs de la meme facon. Ce que chaque section a de PARTICULIER (ses
champs, ses selecteurs, la construction/l'affichage d'un element) vit dans
`listes_champs.py` — separe d'ici pour rester sous 500 lignes chacun, jamais
a un compte de lignes arbitraire : c'est la couture que la tache 6 decrit
elle-meme (« elles different par leurs champs, pas par leur forme »).

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
  menu lui-meme (le bloc `data_schema(user_input)` decrit au point suivant
  s'applique de toute facon, meme sur un MENU : HA construit lui-meme
  `vol.Schema({"next_step_id": vol.In(...)})` pour le valider). Un
  `async_show_menu(menu_options=[...])` route donc VERS un step homonyme de
  chaque option : les noms de section (`commandes`, `ambiances`,
  `extrasMaison`, `ouvrants`, `synthese`) sont a la fois les cles des donnees
  ET les noms des steps qu'ils declenchent.
- La MEME methode applique AUSSI `data_schema(user_input)` avant d'appeler le
  step courant, des que `data_schema` est present sur l'etape, QUEL QUE SOIT
  le type de cette etape (verifie en lisant `data_entry_flow.py`, la boucle
  `_async_configure`, lignes 355-377 : le bloc s'execute inconditionnellement
  — un MENU fabrique lui-meme un `vol.Schema({"next_step_id": vol.In(...)})`,
  qui passe par le meme bloc). Une violation de `data_schema` (mauvais type,
  option hors enum) remonte donc comme une EXCEPTION `InvalidData`, jamais
  comme un formulaire reaffiche avec erreurs : la seule facon d'obtenir un
  refus ergonomique (`errors={...}`) est de laisser `data_schema` large
  (types `str`, selecteurs qui n'imposent que le DOMAINE d'une entite ou
  l'appartenance a un ENUM deja correct) et de faire NOUS-MEMES le refus
  metier, exactement comme `EcranSubentryFlow.async_step_user` le fait deja
  pour le budget et les bornes de hauteur. `section.valider` (schema.BOUTON /
  schema.SYNTHESE / schema.ENTITE) est donc rejouee A LA MAIN sur le resultat
  CONSTRUIT (`section.construire_donnee`), jamais confiee a `data_schema`.

**Persistance immediate, jamais de creation en fin de parcours.** Une
sous-entree « ecran » existe deja (creee par `async_step_user`, tache 5)
avant qu'aucune section liste ne soit ouverte : il n'y a donc rien a
« creer » ici, seulement a METTRE A JOUR. Chaque geste (ajouter, enregistrer,
monter, descendre, supprimer) appelle `ConfigSubentryFlow._async_update`
(ecriture immediate, sans terminer le flow) puis reaffiche un step — jamais
`async_create_entry` : celui-ci exige `self.source == SOURCE_USER`
(`ConfigSubentryFlow.async_create_entry`) et leve sous `SOURCE_RECONFIGURE`,
la source de CE flow.

**Ronde 1 de relecture, trois corrections structurelles :**

1. **Critique — un `enregistrer` ecrasait silencieusement les champs hors
   formulaire.** `elements[index] = valide` remplacait l'element ENTIER par
   le seul resultat valide du formulaire ; une tuile portant `service`,
   `vue`, `epingle`, `absenceNommee` ou `lien`, editee pour son seul
   `libelle`, perdait les cinq autres en silence — une tuile qui n'agissait
   que par `service` devenait litteralement le bouton mort que ce depot
   s'interdit. Deux corrections cumulatives, dans `listes_champs.py` : (a)
   les cinq champs rejoignent desormais le formulaire — il n'y a plus de
   champ du contrat que ce formulaire ignore ; (b) `_fusionner()` ne
   conserve de l'existant QUE les champs que ce formulaire NE GERE PAS
   (`CHAMPS_BOUTON`/`CHAMPS_SYNTHESE`), en defense pour un champ futur du
   contrat que le formulaire n'aurait pas encore rattrape — jamais activee
   en pratique aujourd'hui, puisque (a) couvre deja tout.
2. **Important — un refus a la saisie perdait ce que l'utilisateur venait de
   taper.** `existant` (les valeurs STOCKEES) servait de valeurs suggerees
   MEME apres un refus : un ajout refuse (donc `existant = None`) reaffichait
   un formulaire VIDE, pas la saisie fautive. `valeurs_affichees` distingue
   desormais l'affichage initial (les valeurs stockees, via `section.
   afficher`) du reaffichage apres erreur (la saisie brute de l'utilisateur,
   `user_input`).
3. **Important — le sentinel "ajouter" partageait le champ `choix` avec des
   index d'elements reels**, ce qui empechait de traduire proprement son
   option (un `SelectSelector` ne peut pas melanger des options traduites et
   des options DONNEES sous le meme `translation_key`). Le menu de section
   porte maintenant DEUX champs : `nouveau` (un `BooleanSelector`, traduit
   comme n'importe quel champ via son LABEL, jamais une option) et `element`
   (un `SelectSelector` dynamique, present seulement s'il existe deja des
   elements, ses options etant les libelles REELS). `geste`, lui, n'a que
   des valeurs FIXES (les quatre gestes) : `translation_key` s'y applique
   proprement (`listes_champs._selecteur_geste`).
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigSubentry
from homeassistant.helpers import selector

from . import schema
from .const import (
    ACTION_DESCENDRE,
    ACTION_ENREGISTRER,
    ACTION_MONTER,
    ACTION_SUPPRIMER,
    ERREUR_CHAMP_INVALIDE,
    ERREUR_SELECTION_MANQUANTE,
)
from .formulaire import reafficher
# `SECTIONS`/`Section` restent importes ICI pour l'usage INTERNE de ce module
# (`_async_step_section*` ci-dessous), mais ne sont plus re-exportes depuis
# la ronde 2 de relecture : deux adresses valables pour le meme objet
# (`from .listes import SECTIONS` ET `from .listes_champs import SECTIONS`)
# sont une divergence en attente — le jour ou l'une des deux copies bouge
# sans l'autre (un `__all__` qui oublie de suivre un renommage, par exemple),
# rien ne le signale. `listes_champs.py` EST leur definition : c'est donc la
# SEULE adresse canonique, y compris pour config_flow.py.
from .listes_champs import SECTIONS, Section

__all__ = ["SectionsListeMixin"]


def _schema_choix(elements: list, section: Section) -> vol.Schema:
    """Le menu « ajouter | choisir » du brief, sur DEUX champs plutot qu'un
    sentinel partage (ronde 1, point 3 de la docstring de module) : `nouveau`
    (un booleen, traduit par son LABEL — jamais une option) declenche un
    element vierge ; `choix` (dynamique, absent si la section est encore
    vide) choisit un element existant par son libelle reel. Nom du champ
    aligne sur `translations/fr.json`/`en.json`
    (`config_subentries.ecran.step.<section>.data.choix`)."""
    champs: dict[Any, Any] = {vol.Optional("nouveau", default=False): selector.BooleanSelector()}
    if elements:
        options = [
            selector.SelectOptionDict(value=str(i), label=f"{i + 1}. {section.libelle(el)}")
            for i, el in enumerate(elements)
        ]
        champs[vol.Optional("choix")] = selector.SelectSelector(
            selector.SelectSelectorConfig(options=options, mode=selector.SelectSelectorMode.LIST)
        )
    return vol.Schema(champs)


class SectionsListeMixin:
    """Le squelette. `EcranSubentryFlow` (config_flow.py) l'utilise en mixin ;
    les methodes `async_step_<section>` / `async_step_<section>_element` que
    HA exige par leur NOM (`FlowManager._async_handle_step` fait
    `getattr(flow, f"async_step_{step_id}")`, jamais une resolution
    generique) restent de fins relais definis dans config_flow.py — chacun
    vers UNE des deux methodes ci-dessous, jamais divergents entre eux."""

    _index_courant: int | None = None

    def _elements(self, subentry: ConfigSubentry, cle: str) -> list:
        return list(subentry.data.get(cle, []))

    def _persister(
        self, entry: ConfigEntry, subentry: ConfigSubentry, cle: str, elements: list
    ) -> None:
        self._async_update(entry=entry, subentry=subentry, data_updates={cle: elements})

    async def _async_step_section(self, cle: str, user_input: dict[str, Any] | None):
        section = SECTIONS[cle]
        subentry = self._get_reconfigure_subentry()
        elements = self._elements(subentry, cle)
        errors: dict[str, str] = {}

        if user_input is not None:
            if user_input.get("nouveau"):
                self._index_courant = None
                return await getattr(self, f"async_step_{cle}_element")()
            choisi = user_input.get("choix")
            if choisi is not None:
                self._index_courant = int(choisi)
                return await getattr(self, f"async_step_{cle}_element")()
            # Ronde 2 de relecture : ni "nouveau" coche, ni element choisi —
            # reaffichait EN SILENCE, sans dire pourquoi rien ne s'etait
            # passe. Refus EXPLICITE desormais, meme regime que les refus
            # metier d'EcranSubentryFlow.async_step_user (config_flow.py).
            errors["nouveau"] = ERREUR_SELECTION_MANQUANTE

        return reafficher(self, cle, _schema_choix(elements, section), user_input, errors)

    async def _async_step_section_element(self, cle: str, user_input: dict[str, Any] | None):
        """Le formulaire d'un element, plus ses quatre gestes (`geste`,
        champ present uniquement en EDITION — ajouter un element vierge n'a
        rien a monter, descendre ou supprimer). `monter`/`descendre` sont
        GARDES aux deux bords : un index hors bornes ne fait rien et ne leve
        pas (cf. rapport, mutation de l'etape 5 du brief). Un refus a
        l'enregistrement REAFFICHE LA SAISIE (`valeurs_affichees`), jamais
        les valeurs stockees d'avant (ronde 1, Important 2)."""
        section = SECTIONS[cle]
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        elements = self._elements(subentry, cle)
        index = self._index_courant
        existant = elements[index] if index is not None else None
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        valeurs_affichees = section.afficher(existant)

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

            # ACTION_ENREGISTRER : rejoue schema.BOUTON/schema.SYNTHESE/
            # schema.ENTITE, LA MEME validation que schema.valider() sur
            # l'ecran complet — deux validateurs pour une regle serait la
            # divergence que schema.py existe pour empecher.
            #
            # Ronde 2 de relecture : `construire_donnee` peut desormais lever
            # elle-meme (`_construire_donnee_bouton`, une paire service_*
            # a demi remplie) — DANS ce meme bloc `try`, jamais avant : sinon
            # ce refus remonterait comme une exception non rattrapee plutot
            # que comme un formulaire reaffiche avec erreurs.
            valeurs_affichees = user_input
            try:
                candidat = section.construire_donnee(user_input, existant)
                valide = section.valider(candidat)
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

        return reafficher(
            self,
            f"{cle}_element",
            section.construire_schema(index is not None),
            valeurs_affichees,
            errors,
            description_placeholders,
        )
