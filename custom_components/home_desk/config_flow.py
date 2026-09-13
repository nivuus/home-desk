"""Les flows de configuration : une entree unique, et une sous-entree par ecran.

Verifie contre les sources reelles de Home Assistant 2026.9.1 (conteneur
`homeassistant`, cf. rapport de tache), pas ecrit de memoire : l'etape
d'entree d'un `ConfigSubentryFlow` est `async_step_user`,
`async_get_supported_subentry_types` est `classmethod` + `callback`, et
`ConfigSubentryFlow.async_create_entry` exige `self.source == SOURCE_USER`
(sinon `ValueError`) — ce que le contexte `SOURCE_USER` du test garantit deja.
Ces trois points sont ceux que le brief laissait ouverts ; les sources du
composant `bayesian` (qui porte deja des sous-entrees) les confirment tous
les trois.

Le refus `single_instance_allowed` du brief passait par
`self._async_abort_entries_match()` DANS l'etape. Le test donne, lui, appelle
`async_init` puis `async_configure` en DEUX temps sur l'entree unique : un
step qui cree l'entree des `async_init` (donc sans jamais atteindre
`async_configure`, le flow ayant deja quitte `_progress`) fait echouer le
second appel avec `UnknownFlow`, pour une raison sans rapport avec le refus
teste. Les sources de Home Assistant (`color_extractor`, entre autres)
montrent l'idiome actuel : `manifest.json` porte `"single_config_entry":
true`, et `ConfigEntriesFlowManager.async_init` verifie ce champ et ABORTE
*avant meme d'appeler le step* si une entree existe deja — le step, lui,
reste un aller-retour normal `show_form` puis `create_entry`.
`_async_abort_entries_match()` reste correct pour un abus applicatif futur
(ex. deux entrees issues de sources differentes), mais ici le manifeste dit
deja tout : suivre l'API reelle plutot que le brief, comme demande.

**Ronde 1 de relecture : le message de ce refus vient du COEUR de Home
Assistant, jamais de ce module.** `ConfigEntriesFlowManager.async_init`
construit lui-meme le `ConfigFlowResult` d'abort avec
`translation_domain=HOMEASSISTANT_DOMAIN` (pas `DOMAIN`), et le frontend
resout la traduction sur `translation_domain or handler.domain` : la cle
effectivement lue est donc `component.homeassistant.config.abort.
single_instance_allowed` (« Deja configure. Une seule configuration est
possible. »), jamais `component.home_desk.config.abort.
single_instance_allowed`. Une cle `config.abort.single_instance_allowed`
dans `translations/fr.json` serait donc MORTE : aucun chemin utilisateur ne
l'atteint, et elle a ete retiree. Le geste que l'utilisateur doit faire —
ajouter un ecran depuis l'integration EXISTANTE, pas une seconde integration
— vit desormais dans `config.step.user.description` de `translations/fr.json`
(et `en.json`), la SEULE description que la premiere installation affiche
reellement.

**Une entree, N sous-entrees.** L'entree « Tablettes murales » ne detient
RIEN : toute la configuration vit dans les sous-entrees, une par ecran.
Ajouter une quatrieme tablette est alors la MEME operation que pour les trois
premieres. Une seconde entree detiendrait une seconde verite, et le transport
(taches 8-9) ne saurait pas laquelle publier — d'ou le refus
`single_instance_allowed`.

La section « Identite et budget » de la sous-entree porte `nom`,
`hauteurUtile`, `temperature`, `note`. Le budget doit deja etre verifie ICI :
c'est la seule donnee qui existe a cette etape, et le mode le moins cher
(`defaut`, `rangeeAmbiance=True`) suffit a refuser un ecran qu'AUCUN mode ne
pourrait tenir.

**Ronde 1 de relecture (tache 6) : `temperature` a rejoint cette section.**
C'est un champ RACINE requis du contrat (`contrat/ecran.schema.json`,
"required") qu'aucune tache du plan ne portait encore — ni la tache 5, ni
le plan de la tache 6, qui couvrait les sections « liste » mais pas les
champs scalaires du contrat. Sans lui, la sous-entree n'aurait jamais pu
passer `schema.valider()`, quelles que soient les sections « liste »
livrees par ailleurs. `temperature` n'est pas une liste : elle vit ici,
dans l'identite, jamais dans `listes.py`.

**Ronde 1 de relecture, second refus : `hauteurUtile` porte aussi les bornes
du contrat** (`schema.HAUTEUR_MIN`/`HAUTEUR_MAX`, 320 et 4000 px). Le budget
seul ne les couvre pas : une hauteur enorme (10 000 px, par exemple) ne
deborde JAMAIS (`verifier_budget` y rend 0), et sans cette seconde garde le
formulaire l'acceptait — pour que `schema.valider()` la refuse plus tard,
inversant exactement ce que cette tache existe pour eviter (refuser a la
saisie, pas devant la tablette). La garde reutilise `schema.hauteur_utile`,
la MEME fonction que `schema.py` applique a l'ecran complet : aucune borne
n'est redupliquee ici.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    ConfigSubentryFlow,
    SubentryFlowResult,
)
from homeassistant.core import callback

from homeassistant.helpers import selector

from . import schema
from .budget import BUDGET, verifier_budget
from .const import (
    DOMAIN,
    ERREUR_BUDGET_INTENABLE,
    ERREUR_HAUTEUR_HORS_BORNES,
    ERREUR_NOM_DEJA_UTILISE,
    ERREUR_NOM_VIDE,
    SOUS_ENTREE_ECRAN,
    VERSION_CONFIG,
)
from .formulaire import reafficher
# Ronde 1 de relecture (Critique) : verifie l'ecran COMPLET avant tout
# persist — voir garde_ecran.py. `async_step_identite` (I4, meme ronde) en
# a besoin au meme titre que listes.py/objets.py. Ronde 2 : importe comme
# MODULE — `garde_ecran.persister_si_valide` est LE site d'ecriture unique
# du paquet, ce module ne nomme plus `_async_update` lui-meme.
from . import garde_ecran
from .listes import SectionsListeMixin
from .listes_champs import SECTIONS
# Tache 7 : les deux sections « objet » (Blocs et modes, Voiture) vivent
# dans leur PROPRE mixin, `objets.py` — extrait de ce module pour rester
# sous 500 lignes (meme couture que `listes.py`/`listes_champs.py`).
from .objets import SectionsObjetMixin

# `temperature` ($defs/entite) : le capteur que l'ecran affiche en bandeau.
# Ronde 1 de relecture (tache 6) : c'etait un champ RACINE requis du contrat
# (contrat/ecran.schema.json, "required") que ni la tache 5 ni la tache 6 ne
# portaient encore — aucune tache du plan ne le couvrait, sans quoi la
# sous-entree n'aurait jamais pu passer schema.valider(). Il appartient a
# l'identite (config_flow.py), pas a listes.py : ce n'est pas une liste.
#
# Ronde 2 de relecture : AUCUNE restriction de domaine — retiree pour la MEME
# raison que $defs/bouton (listes_champs.py) : "sensor" semblait plausible
# mais n'etait tenu par aucun test, et le contrat ($defs/entite) ne restreint
# lui-meme aucun domaine. Une contrainte non tenue par un test est une
# contrainte INVENTEE.

# La section « Identite et budget » seule ; les sections « liste » (tuiles de
# commande, rangee d'ambiance, ligne de synthese) sont dans listes.py depuis
# la tache 6, reutilisees ci-dessous par EcranSubentryFlow. Le type de
# `hauteurUtile` reste `int` ici (le champ frontend) : la validation reelle
# des bornes passe par `schema.hauteur_utile`, appelee explicitement dans
# `EcranSubentryFlow.async_step_user`.
#
# Correction tache 6 : `data_schema` EST applique automatiquement par
# `FlowManager._async_configure` avant d'appeler le step (verifie dans
# data_entry_flow.py, cf. la docstring de listes.py) — l'affirmation inverse
# ci-dessus, ecrite en tache 5, etait fausse. Sans consequence ICI : les deux
# champs valides par SCHEMA_IDENTITE (`str`, `int`) n'y ajoutent aucune regle
# metier, seulement un type deja correct pour tout appelant de ce module. Les
# refus du budget et des bornes restent des controles APRES coup, dans le
# step lui-meme — c'est la seule facon d'obtenir un formulaire reaffiche avec
# erreurs plutot qu'une exception (listes.py, meme raison pour les sections
# « liste »).
#
# Ronde 2 de relecture : `hauteurUtile` reste `vol.Required` ICI, alors que
# le contrat la porte `Optional` ($defs/ecran, schema.py) — ECART ASSUME,
# jamais une lecture fautive du contrat. Un ecran ne peut refuser un budget
# intenable A LA SAISIE (le but meme de `async_step_user` ci-dessous) que
# s'il connait une hauteur CONCRETE ; laisser le champ vide interdirait cette
# verification precoce, pas la contourner. Les trois ecrans reels
# (app/src/ecran.ts) ne declarent d'ailleurs JAMAIS `hauteurUtile` — le champ
# est donc PRE-REMPLI avec `BUDGET["hauteurUtileParDefaut"]` (585, les
# Fire 7), lu depuis le contrat, jamais retape a la main : un utilisateur qui
# ne touche pas ce champ obtient exactement la valeur que l'application
# suppose deja en son absence (`budget.py`, `combien()`).
SCHEMA_IDENTITE = vol.Schema(
    {
        vol.Required("nom"): str,
        # Ronde 3 de relecture (trou de couverture) : un `default=585` retape
        # a la main aurait survecu au test qui compare simplement a
        # `BUDGET[...]` (585 aujourd'hui des deux cotes). `default=` est ici
        # un CALLABLE (voluptuous ne l'enveloppe pas, `Marker.default` reste
        # le callable lui-meme) : il relit BUDGET a CHAQUE appel de
        # `.default()`, jamais une seule fois a l'import — un test qui
        # monkeypatche BUDGET prouve donc la PROVENANCE, pas seulement la
        # valeur du jour.
        vol.Required(
            "hauteurUtile", default=lambda: BUDGET["hauteurUtileParDefaut"]
        ): int,
        vol.Required("temperature"): selector.EntitySelector(selector.EntitySelectorConfig()),
        vol.Optional("note"): str,
    }
)


def _valider_identite(user_input: dict[str, Any], *, noms_existants: frozenset[str] = frozenset()) -> tuple[dict[str, str], dict[str, str], dict[str, Any] | None]:
    """Les QUATRE gardes communes a la CREATION et a la RECONFIGURATION
    (`async_step_user`/`async_step_identite`) : nom non vide, nom non DEJA
    UTILISE (`garde_ecran.noms_utilises` -- `nom` est la cle primaire du
    transport websocket), budget du mode le moins cher, bornes de hauteur.
    `noms_existants` est vide a la creation. Rend `(errors,
    description_placeholders, donnee)`, `donnee` etant `None` sauf si les
    quatre gardes passent."""
    errors: dict[str, str] = {}
    description_placeholders: dict[str, str] = {}
    # Ronde 2 (tache 8) : `nom` STRIPPE ICI, reutilise pour vide/unicite/
    # persistance -- "salon " passait sinon les deux gardes mais se stockait brut.
    nom = user_input["nom"].strip()
    if not nom:
        errors["nom"] = ERREUR_NOM_VIDE
        return errors, description_placeholders, None
    if nom in noms_existants:
        errors["nom"] = ERREUR_NOM_DEJA_UTILISE
        description_placeholders["nom"] = nom
        return errors, description_placeholders, None
    deborde = verifier_budget(
        "defaut", rangee_ambiance=True, hauteur_utile=user_input["hauteurUtile"]
    )
    if deborde:
        errors["hauteurUtile"] = ERREUR_BUDGET_INTENABLE
        description_placeholders["debordement"] = str(deborde)
        return errors, description_placeholders, None
    try:
        schema.hauteur_utile(user_input["hauteurUtile"])
    except vol.Invalid:
        errors["hauteurUtile"] = ERREUR_HAUTEUR_HORS_BORNES
        description_placeholders["min"] = str(schema.HAUTEUR_MIN)
        description_placeholders["max"] = str(schema.HAUTEUR_MAX)
        return errors, description_placeholders, None
    # Ronde 1 (tache 6) : `note` vide etait PERSISTE ("" reste "") la ou le
    # contrat la veut ABSENTE (Optional, jamais une chaine vide).
    donnee = {k: v for k, v in user_input.items() if not (k == "note" and v == "")}
    donnee["nom"] = nom  # le STRIPPE, jamais le brut
    return errors, description_placeholders, donnee


class HomeDeskConfigFlow(ConfigFlow, domain=DOMAIN):
    """L'entree unique. Elle ne detient RIEN : toute la configuration vit dans
    les sous-entrees, une par ecran. Une seconde entree detiendrait une
    seconde verite, et le transport ne saurait pas laquelle publier.

    Le refus "single_instance_allowed" vient de `manifest.json`
    (`single_config_entry: true`) : Home Assistant l'applique avant meme
    d'appeler cette classe, donc ce step n'a rien a verifier lui-meme — et
    son MESSAGE vient du coeur de Home Assistant, jamais de nos traductions
    (voir la docstring de module)."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Confirme la creation de l'entree unique. Aucune donnee a saisir :
        un aller-retour minimal (show_form puis create_entry), pour que
        l'utilisateur voie et valide l'ajout de l'integration."""
        if user_input is not None:
            return self.async_create_entry(title="Tablettes murales", data={})
        return self.async_show_form(step_id="user")

    @classmethod
    @callback
    def async_get_supported_subentry_types(
        cls, config_entry: ConfigEntry
    ) -> dict[str, type[ConfigSubentryFlow]]:
        """Les types de sous-entree que l'entree « Tablettes murales » sait
        porter. Un seul pour l'instant : un ecran de tablette."""
        return {SOUS_ENTREE_ECRAN: EcranSubentryFlow}


class EcranSubentryFlow(SectionsListeMixin, SectionsObjetMixin, ConfigSubentryFlow):
    """Une sous-entree, un ecran. `async_step_user` (tache 5) cree la
    sous-entree avec sa seule section « Identite et budget ». Une fois creee,
    on y REVIENT par `async_step_reconfigure` (source `SOURCE_RECONFIGURE`,
    cf. listes.py) : c'est la que vivent les sections « liste » (listes.py)
    et « objet » (objets.py, tache 7).

    Ronde 1 de relecture : les mixins viennent EN PREMIER dans les bases (et
    non en dernier, l'ordre precedent) — convention Python standard pour un
    mixin, qui doit apparaitre avant la classe fonctionnelle de base pour
    pouvoir la surcharger via le MRO. Sans effet observable ici (aucune des
    trois classes ne definit de nom en commun aujourd'hui), mais c'est
    l'inverse qui aurait ete un piege pour la prochaine surcharge."""

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Saisie de `nom`, `hauteurUtile`, `temperature`, `note`. Refuse AU
        MOMENT DE LA SAISIE un nom vide, une hauteur ou meme le mode le
        moins cher ne tient pas (et dit de combien), ou une hauteur hors des
        bornes du contrat (10 000 px ne deborde jamais, mais
        `schema.valider()` le refuserait quand meme, plus tard) — jamais
        « valeur invalide », qui signalerait un refus sans dire quoi faire.

        `nom` est verifie EN PREMIER (ronde 1, tache 6 : dette de la tache 5,
        `nom` vide passait), puis son UNICITE (tache 8). Le budget vient ensuite : c'est la garde la plus
        frequente sur `hauteurUtile` (toute hauteur trop juste, meme dans les
        bornes, deborde), et c'est elle que
        `test_un_ecran_qui_deborde_est_REFUSE_avec_son_chiffre` exerce avec
        100 px — une valeur qui, en pratique, deborde toujours avant d'etre
        hors bornes (le cout minimal d'un ecran depasse deja 320 px, la borne
        basse). Les bornes ne sont donc la seule garde atteignable que pour
        une hauteur EXCESSIVE, au-dela de ce que le budget peut jamais
        signaler. `temperature` n'a besoin d'aucun controle manuel : un
        `entity_id` reel satisfait toujours le format attendu par
        `schema.ENTITE` — et son `EntitySelector` ne filtre plus AUCUN
        domaine depuis la ronde 2 de relecture (voir la note pres de
        `SCHEMA_IDENTITE`)."""
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}

        if user_input is not None:
            errors, description_placeholders, donnee = _valider_identite(
                user_input, noms_existants=garde_ecran.noms_utilises(self._get_entry())
            )
            if donnee is not None:
                donnee["version"] = VERSION_CONFIG
                # Ronde 3 de relecture (Important 1) : une section
                # jamais ouverte ne persistait RIEN — la cle restait
                # ABSENTE, pas vide, alors que le contrat exige les
                # cinq cles de liste a la RACINE (vol.Required dans
                # schema.py). Les vrais ecrans du depot le prouvent
                # (`salon` ne porte jamais ambiances/extrasMaison,
                # `bureau` ne porte jamais ouvrants/extrasMaison) :
                # MEME faute de classe que le Critique de la ronde 1
                # (un champ absent du formulaire disparaissait de la
                # donnee), ici au niveau des SECTIONS entieres plutot
                # que de leurs champs. Semees ICI, DERIVEES de
                # `SECTIONS` — jamais recopiees a la main, jamais
                # ecrasees si l'appelant les portait deja.
                for cle in SECTIONS:
                    donnee.setdefault(cle, [])
                return self.async_create_entry(title=donnee["nom"], data=donnee)

        # Reaffiche la saisie precedente (nom, note) apres un refus : sans ce
        # pre-remplissage, un budget intenable effacerait aussi ce que
        # l'utilisateur avait deja correctement rempli. `reafficher`
        # (formulaire.py) est le SEUL endroit qui ecrit ce geste, ronde 2 de
        # relecture — plus jamais retape a la main ici ni dans listes.py.
        return reafficher(self, "user", SCHEMA_IDENTITE, user_input, errors, description_placeholders)

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Point d'entree d'une sous-entree EXISTANTE. Un menu vers les huit
        sections « liste » de `listes_champs.SECTIONS` (tuiles de commande,
        rangee d'ambiance, extras maison, ouvrants, ligne de synthese,
        sources media, slots de minuteur, etiquettes de minuteur — les trois
        dernieres ajoutees a la tache 7), plus les DEUX sections « objet »
        de cette meme tache (`agencement` — « Blocs et modes » — et
        `voiture`), qui n'ont pas leur place dans `SECTIONS` : ce ne sont
        pas des collections d'elements choisis un par un, mais un objet
        unique par ecran.

        Ronde de tache 7 (a rapporter, pas a taire) : le brief decrit QUATRE
        nouvelles lignes de menu (Sources media, Blocs et modes, Minuteurs,
        Voiture). Ce menu en ajoute CINQ : les slots de minuteur et les
        etiquettes proposees (`etiquettesMinuteur`, un champ RACINE distinct
        du contrat) sont deux sections DIFFERENTES au sens du contrat, et
        les fusionner sous une seule ligne « Minuteurs » aurait exige un
        sous-menu dedie — une divergence entre le mecanisme generique
        (`SECTIONS`, un menu = une cle) et un cas particulier, pour un gain
        cosmetique qu'aucun test n'exige. Chaque ligne reste directement
        tracable a UNE cle du contrat, ce qui a paru preferable.

        Ronde 1 de relecture (Important I4) : `"identite"` rejoint ce menu.
        Avant cette ronde, `nom`/`hauteurUtile`/`temperature`/`note`
        n'etaient saisis QU'A LA CREATION (`async_step_user`) — aucune
        entree de ce menu n'y ramenait jamais, les rendant IMMUABLES a vie.
        Le message de `budget_intenable_mode` recommandait pourtant
        « augmentez la hauteur utile » : un remede qui n'avait aucune porte
        d'entree dans l'interface. `async_step_identite` reutilise
        `SCHEMA_IDENTITE` et les memes trois gardes que la creation
        (`_valider_identite`)."""
        return self.async_show_menu(
            step_id="reconfigure",
            menu_options=["identite", *SECTIONS, "agencement", "voiture"],
        )

    async def async_step_identite(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Reconfigure `nom`/`hauteurUtile`/`temperature`/`note` d'une
        sous-entree EXISTANTE — I4, ronde 1 de relecture. Rejoue les MEMES
        quatre gardes que la creation (`_valider_identite`), l'unicite du
        `nom` EXCLUANT cette sous-entree elle-meme, PUIS `garde_ecran.
        persister_si_valide` (ronde 1, Critique ; ronde 2, LE site
        d'ecriture unique) : changer la hauteur utile ne peut aujourd'hui
        casser aucun invariant croise, mais l'appliquer ICI AUSSI evite
        d'avoir a s'en souvenir le jour ou une regle future le pourrait.

        Ronde 2 de relecture (point 4) : `titre=nouvelles_donnees["nom"]`
        — mesure, `_async_update` etait appele SANS `title=` ; renommer un
        ecran (`nom`) laissait le TITRE de la sous-entree (celui que la
        page d'integration liste, pose par `async_step_user` a la
        creation) inchange, les deux divergeant des la premiere
        reconfiguration."""
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        valeurs_affichees = {
            cle: subentry.data[cle]
            for cle in ("nom", "hauteurUtile", "temperature", "note")
            if cle in subentry.data
        }

        if user_input is not None:
            valeurs_affichees = user_input
            noms = garde_ecran.noms_utilises(entry, exclure=subentry.subentry_id)
            errors, description_placeholders, donnee = _valider_identite(
                user_input, noms_existants=noms
            )
            if donnee is not None:
                nouvelles_donnees = dict(subentry.data)
                nouvelles_donnees.update(donnee)
                if "note" not in donnee:
                    nouvelles_donnees.pop("note", None)
                if garde_ecran.persister_si_valide(
                    self, entry, subentry, nouvelles_donnees, errors, description_placeholders,
                    section_courante="identite", titre=nouvelles_donnees["nom"],
                ):
                    return await self.async_step_reconfigure()

        return reafficher(
            self, "identite", SCHEMA_IDENTITE, valeurs_affichees, errors, description_placeholders
        )

    # Les SEIZE relais (8 sections x 2 steps, depuis que la tache 7 porte
    # sources/minuteurs/etiquettesMinuteur a huit) qu'exige `listes.
    # SectionsListeMixin` : HA appelle un step par SON NOM (`getattr(flow,
    # f"async_step_{step_id}")`), donc pas de facon generique de les eviter
    # — mais chacun ne fait qu'UN appel, et c'est `_async_step_section`/
    # `_async_step_section_element` qui portent toute la logique, une seule
    # fois, pour les huit sections.
    async def async_step_commandes(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section("commandes", user_input)

    async def async_step_commandes_element(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section_element("commandes", user_input)

    async def async_step_ambiances(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section("ambiances", user_input)

    async def async_step_ambiances_element(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section_element("ambiances", user_input)

    async def async_step_synthese(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section("synthese", user_input)

    async def async_step_synthese_element(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section_element("synthese", user_input)

    async def async_step_extrasMaison(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section("extrasMaison", user_input)

    async def async_step_extrasMaison_element(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section_element("extrasMaison", user_input)

    async def async_step_ouvrants(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section("ouvrants", user_input)

    async def async_step_ouvrants_element(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section_element("ouvrants", user_input)

    # Tache 7 : les TROIS sections « liste » qu'elle ajoute (sources media,
    # slots de minuteur, etiquettes de minuteur) reutilisent le MEME
    # squelette, six relais de plus.
    async def async_step_sources(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section("sources", user_input)

    async def async_step_sources_element(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section_element("sources", user_input)

    async def async_step_minuteurs(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section("minuteurs", user_input)

    async def async_step_minuteurs_element(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section_element("minuteurs", user_input)

    async def async_step_etiquettesMinuteur(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section("etiquettesMinuteur", user_input)

    async def async_step_etiquettesMinuteur_element(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        return await self._async_step_section_element("etiquettesMinuteur", user_input)
