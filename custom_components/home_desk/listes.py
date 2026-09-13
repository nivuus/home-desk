"""Le squelette commun des sections « liste » du menu d'un ecran : tuiles de
commande, rangee d'ambiance, tuiles « extras maison », ouvrants surveilles,
ligne de synthese, sources media, minuteurs et `listesTachesExtra`. UNE
SEULE forme — choisir/ajouter, modifier, monter, descendre, supprimer —
ecrite ici une fois et reutilisee par `EcranSubentryFlow` (config_flow.py)
pour toutes. Ce que chaque section a de PARTICULIER (ses
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
    ERREUR_ALLUMEE_INCOMPLETE,
    ERREUR_CHAMP_ELEMENT_REQUIS,
    ERREUR_CHAMP_INCONNU,
    ERREUR_CHAMP_INVALIDE,
    ERREUR_CHAMP_FORMAT_INVALIDE,
    ERREUR_CHAMP_REQUIS,
    ERREUR_CHAMP_TROP_COURT,
    ERREUR_CHAMP_TROP_D_ELEMENTS,
    ERREUR_CHAMP_TROP_PEU_D_ELEMENTS,
    ERREUR_CHAMP_TYPE_INVALIDE,
    ERREUR_CHAMP_VALEUR_FIGEE,
    ERREUR_CHAMP_VALEUR_NON_AUTORISEE,
    ERREUR_CHAMP_VIDE,
    ERREUR_CHAMP_DOUBLON,
    ERREUR_RECETTE_SANS_MODE,
    ERREUR_SELECTION_MANQUANTE,
    ERREUR_SERVICE_INCOMPLET,
)
from .formulaire import reafficher
# Ronde 1 de relecture (Critique) : verifie l'ecran COMPLET avant tout
# persist — voir garde_ecran.py pour les trois chemins que son absence
# laissait passer en silence. Ronde 2 : `garde_ecran.persister_si_valide`
# est aussi devenu LE site d'ecriture unique du paquet — importe comme
# MODULE (pas seulement une fonction) pour que ce module n'ait plus jamais
# a nommer `_async_update` lui-meme.
from . import garde_ecran
# `SECTIONS`/`Section` restent importes ICI pour l'usage INTERNE de ce module
# (`_async_step_section*` ci-dessous), mais ne sont plus re-exportes depuis
# la ronde 2 de relecture : deux adresses valables pour le meme objet
# (`from .listes import SECTIONS` ET `from .listes_champs import SECTIONS`)
# sont une divergence en attente — le jour ou l'une des deux copies bouge
# sans l'autre (un `__all__` qui oublie de suivre un renommage, par exemple),
# rien ne le signale. `listes_champs.py` EST leur definition : c'est donc la
# SEULE adresse canonique, y compris pour config_flow.py.
from .listes_champs import SECTIONS, Section, ChampVide, ServiceIncomplet
# Tache 7 : `AllumeeIncomplete` (la paire allumee_entite/allumee_etats de
# $defs/source, a demi remplie) importee directement de
# `listes_champs_sources` plutot que re-exportee par `listes_champs.py` — ce
# dernier ne re-exporte QUE ce que `config_flow.py` consomme aussi
# (`SECTIONS`, `Section`, `ChampVide`, `ServiceIncomplet`, deja communs aux
# DEUX modules) ; `AllumeeIncomplete` n'est necessaire qu'ICI.
from .listes_champs_sources import AllumeeIncomplete
# Decision 7 de la spec, tenue a la tache 7 : une entite inconnue du
# registre AVERTIT, ne refuse jamais (voir registre.py).
from .registre import entites_dans, entites_inconnues

# Ronde 4 de relecture : table DERIVEE des mots-cles que `fautes._Faute`
# (et voluptuous/probatio eux-memes, pour "required"/"additionalProperties")
# peuvent produire sur $defs/bouton, $defs/synthese et $defs/entite — les
# TROIS formes qu'une section « liste » valide (`Section.valider`). Chaque
# mot-cle devient une PHRASE traduite qui dit quoi faire, jamais le mot-cle
# JSON Schema brut : voir `schema.motif()`/`fautes.motif()`, reserves au
# corpus (`contrat/cas-schema.json`), jamais montres a un humain depuis
# cette table.
_ERREUR_PAR_MOT_CLE: dict[str, str] = {
    "required": ERREUR_CHAMP_REQUIS,
    "pattern": ERREUR_CHAMP_FORMAT_INVALIDE,
    "type": ERREUR_CHAMP_TYPE_INVALIDE,
    "minLength": ERREUR_CHAMP_TROP_COURT,
    "enum": ERREUR_CHAMP_VALEUR_NON_AUTORISEE,
    "const": ERREUR_CHAMP_VALEUR_FIGEE,
    "minItems": ERREUR_CHAMP_TROP_PEU_D_ELEMENTS,
    "maxItems": ERREUR_CHAMP_TROP_D_ELEMENTS,
    "uniqueItems": ERREUR_CHAMP_DOUBLON,
    "additionalProperties": ERREUR_CHAMP_INCONNU,
    # "contains" a rejoint la table a la tache 7 : $defs/agencement (zones
    # doit contenir "commandes", modes doit contenir "defaut") est
    # desormais atteignable via SectionsObjetMixin.async_step_agencement
    # (objets.py), qui rejoue ce meme mecanisme de mapping — la SEULE
    # raison pour laquelle cette table, definie ICI, est importee par
    # objets.py plutot que dupliquee. Verifie par execution (pas suppose) :
    # soumettre `zones` sans "commandes" leve bien `('zones', 'contains')`,
    # traduit en ERREUR_CHAMP_ELEMENT_REQUIS — un message qui nomme
    # explicitement "commandes"/"defaut" (voir translations/fr.json). Une
    # soumission de zones/modes EN DOUBLE (que le SelectSelector multiple
    # de l'UI empeche mais qu'un appel direct au flow ne bloque pas) rend
    # de la meme facon "uniqueItems" atteignable — verifie par execution,
    # non ajoute comme test permanent (hors du perimetre des deux regles de
    # cette tache, cf. rapport). $defs/bouton, $defs/synthese et
    # $defs/entite (les trois formes qu'une section « liste » de CE module
    # valide) ne l'utilisent toujours jamais : un mot-cle absent de cette
    # table retombe sur ERREUR_CHAMP_INVALIDE, un message STATIQUE (jamais
    # de {motif} interpole) : la fuite de la ronde 3/4 ne peut donc pas
    # reapparaitre meme pour un mot-cle qu'on aurait oublie.
    "contains": ERREUR_CHAMP_ELEMENT_REQUIS,
}

__all__ = ["SectionsListeMixin"]


def _localiser_champ(err: vol.Invalid) -> tuple[str, str]:
    """Le CHAMP et le mot-cle d'une faute sur l'element LOCAL qu'un
    formulaire de section « liste » vient de construire — jamais
    `fautes.localiser()` seul, dont la troncature agv-parity (retirer le
    DERNIER segment pour "required"/"additionalProperties", voir sa propre
    docstring) est pensee pour `motif()` et le corpus, pas pour attribuer
    un refus a un CHAMP de formulaire.

    Ronde 2 de relecture : la ronde 1 avait corrige EXACTEMENT cette meme
    troncature dans `objets.py` (`_localiser_champ`, alors defini LA-BAS)
    en la croyant propre a l'agencement/la voiture — mesure : `entite`
    omis d'une tuile de commande (`$defs/bouton`), `valeur` omise d'une
    ligne de synthese (`$defs/synthese`) et `nom` omis d'une source
    (`$defs/source`) retombaient ICI, dans `listes.py`, sur "base" — le
    MEME defaut, jamais ferme a la racine. Desormais partagee : `objets.py`
    l'importe d'ICI plutot que d'en garder une seconde copie."""
    if isinstance(err, vol.MultipleInvalid):
        err = err.errors[0]
    _, mot_cle = schema.localiser(err)
    champ = str(err.path[0]) if err.path else "base"
    return champ, mot_cle


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

    def _persister_si_valide(
        self,
        entry: ConfigEntry,
        subentry: ConfigSubentry,
        cle: str,
        elements: list,
        errors: dict[str, str],
        description_placeholders: dict[str, str],
    ) -> bool:
        """Ronde 1 de relecture (Critique) : persister ELEMENTS SANS
        d'abord verifier que l'ECRAN COMPLET qui en resulterait reste
        valide laissait passer trois chemins mesures par le relecteur
        (retirer le dernier slot de minuteur pendant que le mode
        "minuteur" reste actif, entre autres). Tous les gestes qui
        persistent (monter, descendre, supprimer, enregistrer) passent
        desormais par ICI : persiste et rend True si `schema.valider()`
        accepte l'ecran complet candidat ; sinon peuple ERRORS/
        DESCRIPTION_PLACEHOLDERS (la section fautive) et rend False, SANS
        RIEN ECRIRE.

        Ronde 2 de relecture : cette methode ne PERSISTE plus elle-meme —
        elle delegue integralement a `garde_ecran.persister_si_valide`, LE
        site d'ecriture unique du paquet. Avant cette ronde, `_persister`
        (un second appel a `_async_update`, juste a cote) restait un
        contournement a une ligne : un mutant qui faisait ecrire
        `ACTION_SUPPRIMER` (ou les QUATRE gestes) directement via
        `_persister`, en sautant la garde, laissait `_persister_si_valide`
        devenir du code MORT — et le test d'alors (qui COMPTAIT les appels a
        `_async_update` face a ceux de `verifier_ecran_complet`, PAR
        FICHIER) restait vert, puisque le compte des DEUX cotes tombait a
        zero ensemble. Il ne peut plus exister de second site : `_persister`
        a disparu, et ce module ne contient plus AUCUN `_async_update`."""
        return garde_ecran.persister_si_valide(
            self, entry, subentry, {**subentry.data, cle: elements},
            errors, description_placeholders,
            section_courante=cle, data_updates={cle: elements},
        )

    async def _async_step_section(
        self,
        cle: str,
        user_input: dict[str, Any] | None = None,
        description_placeholders: dict[str, str] | None = None,
    ):
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

        return reafficher(
            self, cle, _schema_choix(elements, section), user_input, errors,
            description_placeholders,
        )

    async def _async_step_section_element(
        self, cle: str, user_input: dict[str, Any] | None = None
    ):
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
                    nouveaux = list(elements)
                    nouveaux[index - 1], nouveaux[index] = nouveaux[index], nouveaux[index - 1]
                    if self._persister_si_valide(
                        entry, subentry, cle, nouveaux, errors, description_placeholders
                    ):
                        self._index_courant = index - 1
                        return await self._async_step_section_element(cle, None)
                    # Ronde 1 de relecture (Critique) : un ecart de rang ne
                    # rend JAMAIS un ecran invalide (l'ordre n'entre dans
                    # aucun invariant du contrat) — cette branche reste donc
                    # une defense theorique, jamais exercee en pratique,
                    # mais ecrite pour la MEME raison que le reste de ce
                    # correctif : une regle qui protege TOUS les gestes,
                    # jamais seulement ceux ou elle a deja ete vue faillir.
                else:
                    return await self._async_step_section_element(cle, None)

            elif geste == ACTION_DESCENDRE:
                if index is not None and index < len(elements) - 1:
                    nouveaux = list(elements)
                    nouveaux[index], nouveaux[index + 1] = nouveaux[index + 1], nouveaux[index]
                    if self._persister_si_valide(
                        entry, subentry, cle, nouveaux, errors, description_placeholders
                    ):
                        self._index_courant = index + 1
                        return await self._async_step_section_element(cle, None)
                else:
                    return await self._async_step_section_element(cle, None)

            elif geste == ACTION_SUPPRIMER:
                if index is not None:
                    nouveaux = list(elements)
                    del nouveaux[index]
                    # Ronde 1 de relecture (Critique) : LE cas mesure par le
                    # relecteur — retirer le dernier slot de `minuteurs`
                    # pendant que `agencement.modes` contient encore
                    # "minuteur" persistait en silence un ecran devenu
                    # invalide. Refuse desormais AVANT d'ecrire, sur
                    # l'element qu'on s'apprêtait a supprimer.
                    if self._persister_si_valide(
                        entry, subentry, cle, nouveaux, errors, description_placeholders
                    ):
                        self._index_courant = None
                        return await self._async_step_section(cle, None)
                else:
                    return await self._async_step_section(cle, None)

            else:
                # ACTION_ENREGISTRER : rejoue schema.BOUTON/schema.SYNTHESE/
                # schema.ENTITE, LA MEME validation que schema.valider() sur
                # l'ecran complet — deux validateurs pour une regle serait la
                # divergence que schema.py existe pour empecher.
                #
                # Ronde 2 de relecture : `construire_donnee` peut desormais
                # lever elle-meme (`_construire_donnee_bouton`, une paire
                # service_* a demi remplie) — DANS ce meme bloc `try`, jamais
                # avant : sinon ce refus remonterait comme une exception non
                # rattrapee plutot que comme un formulaire reaffiche avec
                # erreurs.
                valeurs_affichees = user_input
                try:
                    candidat = section.construire_donnee(user_input, existant)
                    valide = section.valider(candidat)
                except ServiceIncomplet as err:
                    # Ronde 3 de relecture (Important 2) : refus METIER
                    # lisible, pose sur le champ REELLEMENT vide — jamais le
                    # vocabulaire JSON Schema de `schema.motif()` (voir
                    # listes_champs.ServiceIncomplet pour le message que la
                    # ronde 2 affichait).
                    errors[err.champ_vide] = ERREUR_SERVICE_INCOMPLET
                except AllumeeIncomplete as err:
                    # Tache 7 : le meme refus que ServiceIncomplet, pour la
                    # paire allumee_entite/allumee_etats de $defs/source —
                    # voir listes_champs_sources.AllumeeIncomplete pour
                    # pourquoi ce n'est PAS ServiceIncomplet qui la porte
                    # (son message nomme "le service", un mensonge ici).
                    errors[err.champ_vide] = ERREUR_ALLUMEE_INCOMPLETE
                except ChampVide as err:
                    # Ronde 4 de relecture (mineur) : `libelle`/`texte`
                    # composes uniquement d'espaces — voir listes_champs.
                    # ChampVide.
                    errors[err.champ] = ERREUR_CHAMP_VIDE
                except vol.Invalid as err:
                    # Ronde 4 de relecture (Important 1 du relecteur) : le
                    # generique ERREUR_CHAMP_INVALIDE + `schema.motif()` brut
                    # etait EXACTEMENT le charabia que la ronde 3 pensait
                    # avoir ferme pour `service` seul — mesure sur quatre
                    # autres chemins ("Ce champ n'est pas valide : :
                    # required.", sur un champ REMPLI d'une chaine vide,
                    # entre autres). Chaque mot-cle devient desormais un
                    # code d'erreur DEDIE (`_ERREUR_PAR_MOT_CLE`).
                    #
                    # Ronde 2 de relecture (correction d'un COMMENTAIRE
                    # FAUX laisse par la ronde 4 : celui-ci affirmait ici
                    # « le champ fautif est TOUJOURS celui que fautes.
                    # localiser() designe — plus de "base" quand le chemin
                    # est connu ». Faux pour "required" : `localiser()`
                    # tronque expres le DERNIER segment (parite ajv, voir sa
                    # docstring), et un champ REQUIS omis d'une tuile
                    # (`entite`), d'une ligne de synthese (`valeur`) ou
                    # d'une source (`nom`) retombait donc sur "base" — un
                    # message ecrit pour UN CHAMP, affiche sur tout le
                    # formulaire. `_localiser_champ` (definie plus haut dans
                    # ce module, reutilisee par `objets.py`) lit `err.path`
                    # directement, jamais tronque.
                    champ, mot_cle = _localiser_champ(err)
                    errors[champ] = _ERREUR_PAR_MOT_CLE.get(mot_cle, ERREUR_CHAMP_INVALIDE)
                else:
                    # Tache 7, le TROISIEME invariant croise (legue par le
                    # plan 2, jamais mis dans le contrat a dessein — voir
                    # const.ERREUR_RECETTE_SANS_MODE). Applique aux TROIS
                    # sections qui partagent $defs/bouton (commandes,
                    # ambiances, extrasMaison) : `vue` y est le MEME champ,
                    # et le vrai ecran reel qui pose `vue: '#recette'` le
                    # fait depuis `commandes` (app/src/ecran.ts, piece
                    # cuisine) — rien ne garantit qu'un ecran futur ne le
                    # pose pas ailleurs. Verifie contre `agencement.modes`
                    # TEL QUE DEJA PERSISTE (cette section n'edite jamais
                    # l'agencement elle-meme) ; un ecran sans agencement du
                    # tout (`agencement` absent) n'a AUCUN mode, donc refuse
                    # tout `vue: '#recette'` — exactement le cas ou la tuile
                    # serait la plus inerte.
                    if isinstance(valide, dict) and valide.get("vue") == "#recette":
                        modes_actuels = (subentry.data.get("agencement") or {}).get("modes", [])
                        if "recette" not in modes_actuels:
                            errors["base"] = ERREUR_RECETTE_SANS_MODE
                    if not errors:
                        # Decision 7 : AVERTIT, ne refuse jamais -- generique
                        # a toute section via `registre.entites_dans` (recursif).
                        inconnues = entites_inconnues(self.hass, entites_dans(valide))
                        if inconnues:
                            description_placeholders["entites_inconnues"] = ", ".join(inconnues)
                        nouveaux = list(elements)
                        if index is not None:
                            nouveaux[index] = valide
                        else:
                            nouveaux.append(valide)
                        if self._persister_si_valide(
                            entry, subentry, cle, nouveaux, errors, description_placeholders
                        ):
                            self._index_courant = None
                            return await self._async_step_section(
                                cle, None, description_placeholders
                            )

        return reafficher(
            self,
            f"{cle}_element",
            section.construire_schema(index is not None),
            valeurs_affichees,
            errors,
            description_placeholders,
        )
