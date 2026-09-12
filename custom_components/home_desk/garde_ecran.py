"""Le garde qui protege l'invariant que cette integration peut desormais
s'offrir : depuis que `schema.valider()` passe des la creation d'une
sous-entree (`listes_champs.SECTIONS` initialise les huit sections « liste »
a `[]`, voir le rapport de tache 7), un ecran valide doit RESTER valide a
CHAQUE etape qui persiste — jamais verifie sur SA SEULE forme locale
(schema.BOUTON, schema.AGENCEMENT, schema.VOITURE...), qui ne voit pas les
invariants CROISES entre sections (mode "minuteur" sans slot de minuteur,
blocDefaut "voiture" sans objet voiture).

Trouve par la ronde 1 de relecture de la tache 7 (le Critique) : ni
`listes.py` ni `objets.py` ne rejouaient `schema.valider()` sur l'ECRAN
COMPLET avant de persister — chacun ne verifiait que le fragment qu'il
venait de construire. Trois chemins mesures, tous acceptes en silence
avant ce module : retirer le dernier slot de minuteur pendant que le mode
"minuteur" restait actif, choisir `blocDefaut: voiture` sans objet
`voiture`, et RETIRER la voiture pendant que `blocDefaut` valait encore
"voiture" — ce dernier cas rendait meme un ecran DEJA VALIDE invalide sans
un mot, par le geste que la tache 7 venait de livrer.

Reutilise directement `err.path` — PAS `fautes.localiser()`, qui tronque le
DERNIER segment pour "required" (une regle pensee pour faire correspondre
`motif()` au corpus ajv, `contrat/cas-schema.json` : "un champ manquant
requis" designe l'OBJET qui le porte, pas le champ lui-meme, hors de
propos ici). Ce module n'a besoin QUE du PREMIER segment du chemin — le
champ RACINE fautif — jamais tronque quel que soit le mot-cle. Verifie par
execution : un ecran ou `agencement.modes` contient "minuteur" et
`minuteurs` est vide (present, VIDE — jamais absent, depuis que `SECTIONS`
le initialise) leve avec `err.path == ['minuteurs']` (`_FauteMinItems`, pas
tronquee) ; un ecran ou `blocDefaut` vaut "voiture" sans objet `voiture`
leve avec `err.path == ['voiture']` (`RequiredFieldInvalid`, un chemin a UN
SEUL segment — rien a tronquer, `localiser()` l'aurait pourtant vide).

**Ronde 2 de relecture, deux corrections supplementaires :**

1. **Le refus nommait la section ou l'erreur est DETECTEE, pas celle qui
   peut la CORRIGER.** Retirer la voiture pendant que `blocDefaut` l'exige
   encore levait `err.path == ["voiture"]` — nommer "voiture" a l'utilisateur
   qui vient d'essayer de la retirer, ALORS QU'IL EST DEJA SUR CETTE
   SECTION, ou il n'y a rien de plus a y corriger (il vient d'en sortir).
   Le seul remede reel est dans « Blocs et modes » (retirer `blocDefaut:
   voiture`, ou le mode "minuteur"). `section_courante` (fourni par
   l'appelant, qui sait DEPUIS QUELLE section il persiste) permet cette
   distinction : si la section nommee par l'erreur est celle-la meme d'ou
   vient l'ecriture, la garde renvoie "agencement" a la place — le SEUL
   autre levier possible pour les deux invariants (`blocDefaut`/`modes` n'y
   vivent que la). Dans le cas INVERSE (l'utilisateur EST dans "agencement"
   et y choisit `blocDefaut: voiture` ou le mode "minuteur" sans que l'objet/
   le slot existe) : `section_courante == "agencement"` et la section nommee
   ("voiture"/"minuteurs") ne lui est jamais egale — aucune redirection,
   nommer la section MANQUANTE reste le bon conseil, puisque l'utilisateur
   n'y est pas deja.
2. **`{section}` interpolait l'identifiant BRUT du contrat** ("minuteurs",
   jamais "Minuteurs") — la meme faute que le mineur 6 de la ronde 1 fermait
   deja pour les options de `SelectSelector`, laissee ouverte ici parce que
   ce chemin ne passe pas par un selecteur. `libelles.section(hass, ...)`
   relit la MEME table de traduction que le menu de reconfiguration.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from . import libelles, schema
from .const import ERREUR_ECRAN_DEVIENDRAIT_INVALIDE


def verifier_ecran_complet(
    donnees: dict, *, section_courante: str | None = None, hass: Any = None
) -> tuple[dict[str, str], dict[str, str]]:
    """Rejoue `schema.valider()` sur DONNEES, l'ecran COMPLET candidat —
    jamais un fragment. Vide (aucune erreur) si l'ecran tient ; sinon un
    refus pose sur "base" (ce n'est pas un champ DE CE STEP qui est en
    cause, c'est la COHERENCE entre sections) qui NOMME la section a
    corriger dans `description_placeholders["section"]` — un appelant
    (`persister_si_valide` ci-dessous, le seul) fusionne ce refus dans son
    propre `errors`/`description_placeholders` plutot que de persister.

    `section_courante` : la section DEPUIS laquelle cet appel persiste (si
    connue) — quand la section fautive lui est identique, le remede reel
    est redirige vers "agencement" (voir la docstring de module, point 1).
    `hass` : si fourni, le nom rendu est le libelle HUMAIN
    (`libelles.section`) plutot que l'identifiant brut du contrat (point 2)
    — optionnel pour que les tests unitaires du MECANISME (sans flow HA)
    restent simples a ecrire."""
    try:
        schema.valider(donnees)
    except vol.Invalid as err:
        if isinstance(err, vol.MultipleInvalid):
            err = err.errors[0]
        section_brute = str(err.path[0]) if err.path else "base"
        if section_brute == section_courante:
            section_brute = "agencement"
        section = libelles.section(hass, section_brute) if hass is not None else section_brute
        return {"base": ERREUR_ECRAN_DEVIENDRAIT_INVALIDE}, {"section": section}
    return {}, {}


def persister_si_valide(
    flow: Any,
    entry: Any,
    subentry: Any,
    donnees_completes: dict,
    errors: dict[str, str],
    description_placeholders: dict[str, str],
    *,
    section_courante: str | None = None,
    data_updates: dict | None = None,
    titre: str | None = None,
) -> bool:
    """LE site d'ecriture unique du paquet (ronde 2 de relecture) : le SEUL
    appel a `ConfigSubentryFlow._async_update` de tout `custom_components/
    home_desk` vit ICI — gardee par `test_garde_ecran_est_le_seul_module_a_
    appeler_async_update` (AST, meme idiome que `test_formulaire_est_le_
    seul_module_a_appeler_async_show_form_avec_un_data_schema`).

    Avant cette ronde, `listes.py` portait un SECOND site (`_persister`,
    appele par `_persister_si_valide` ET, en theorie, par n'importe quel
    futur code qui l'appellerait directement en sautant la garde) : le seul
    test qui pretendait garantir l'unicite du site d'ecriture COMPTAIT les
    appels par fichier plutot que d'en verifier l'UNICITE globale — faire
    ecrire les quatre gestes SANS passer par la garde (un `_persister(...)`
    direct) laissait ce compte EGAL des deux cotes, donc VERT. Il ne peut
    plus y avoir de second site : ce module est le seul a contenir le nom
    `_async_update`.

    Rend `True` et persiste si `schema.valider()` accepte `donnees_
    completes` ; rend `False` et peuple `errors`/`description_placeholders`
    sinon, SANS RIEN ECRIRE. `data_updates`, si fourni, est passe a
    `_async_update` a la place de `data=donnees_completes` (l'UNION que
    `listes.py` utilise pour ses sections « liste », qui ne retire jamais
    de cle) ; `titre`, si fourni, renomme aussi le TITRE de la sous-entree
    (`_async_update(title=...)`) — necessaire pour `async_step_identite`,
    dont `nom` doit rester synchronise avec le titre que la page
    d'integration affiche (voir la ronde 2, point 4 : un renommage qui ne
    passait pas par ce parametre laissait le titre divergent)."""
    errors_ecran, placeholders_ecran = verifier_ecran_complet(
        donnees_completes, section_courante=section_courante, hass=flow.hass
    )
    if errors_ecran:
        errors.update(errors_ecran)
        description_placeholders.update(placeholders_ecran)
        return False
    kwargs: dict[str, Any] = {}
    if titre is not None:
        kwargs["title"] = titre
    if data_updates is not None:
        flow._async_update(entry=entry, subentry=subentry, data_updates=data_updates, **kwargs)
    else:
        flow._async_update(entry=entry, subentry=subentry, data=donnees_completes, **kwargs)
    return True
