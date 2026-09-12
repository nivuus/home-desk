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

**Une entree, N sous-entrees.** L'entree « Tablettes murales » ne detient
RIEN : toute la configuration vit dans les sous-entrees, une par ecran.
Ajouter une quatrieme tablette est alors la MEME operation que pour les trois
premieres. Une seconde entree detiendrait une seconde verite, et le transport
(taches 8-9) ne saurait pas laquelle publier — d'ou le refus
`single_instance_allowed`.

Cette tache ne porte que la premiere section du menu de la sous-entree,
« Identite et budget » : `nom`, `hauteurUtile`, `note`. Le menu a huit
entrees, et la validation par `schema.valider` de l'ecran COMPLET, arrivent
a la tache 6 — avant cela, `nom`/`hauteurUtile`/`note` seuls ne satisferaient
pas les champs requis de `contrat/ecran.schema.json` (temperature, ambiances,
commandes, ...). Le budget, lui, doit deja etre verifie ICI : c'est la seule
donnee qui existe a cette etape, et le mode le moins cher (`defaut`,
`rangeeAmbiance=True`) suffit a refuser un ecran qu'AUCUN mode ne pourrait
tenir.
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

from .budget import verifier_budget
from .const import DOMAIN, SOUS_ENTREE_ECRAN, VERSION_CONFIG

# La section « Identite et budget » seule : le reste (ambiances, commandes,
# synthese, ...) arrive avec le menu a huit entrees de la tache 6.
SCHEMA_IDENTITE = vol.Schema(
    {
        vol.Required("nom"): str,
        vol.Required("hauteurUtile"): int,
        vol.Optional("note"): str,
    }
)


class HomeDeskConfigFlow(ConfigFlow, domain=DOMAIN):
    """L'entree unique. Elle ne detient RIEN : toute la configuration vit dans
    les sous-entrees, une par ecran. Une seconde entree detiendrait une
    seconde verite, et le transport ne saurait pas laquelle publier.

    Le refus "single_instance_allowed" vient de `manifest.json`
    (`single_config_entry: true`) : Home Assistant l'applique avant meme
    d'appeler cette classe, donc ce step n'a rien a verifier lui-meme."""

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


class EcranSubentryFlow(ConfigSubentryFlow):
    """Une sous-entree, un ecran. Pour cette tache : la seule section
    « Identite et budget ». Le menu a huit entrees arrive a la tache 6."""

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """Saisie de `nom`, `hauteurUtile`, `note`. Refuse AU MOMENT DE LA
        SAISIE une hauteur ou meme le mode le moins cher ne tient pas, et dit
        de combien — jamais « valeur invalide », qui signalerait un refus
        sans dire quoi faire."""
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}

        if user_input is not None:
            deborde = verifier_budget(
                "defaut", rangee_ambiance=True, hauteur_utile=user_input["hauteurUtile"]
            )
            if deborde:
                errors["hauteurUtile"] = "budget_intenable"
                description_placeholders["debordement"] = str(deborde)
            else:
                donnee = {**user_input, "version": VERSION_CONFIG}
                return self.async_create_entry(title=donnee["nom"], data=donnee)

        return self.async_show_form(
            step_id="user",
            data_schema=SCHEMA_IDENTITE,
            errors=errors,
            description_placeholders=description_placeholders,
        )
