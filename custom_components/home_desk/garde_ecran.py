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
"""
from __future__ import annotations

import voluptuous as vol

from . import schema
from .const import ERREUR_ECRAN_DEVIENDRAIT_INVALIDE


def verifier_ecran_complet(donnees: dict) -> tuple[dict[str, str], dict[str, str]]:
    """Rejoue `schema.valider()` sur DONNEES, l'ecran COMPLET candidat —
    jamais un fragment. Vide (aucune erreur) si l'ecran tient ; sinon un
    refus pose sur "base" (ce n'est pas un champ DE CE STEP qui est en
    cause, c'est la COHERENCE entre sections) qui NOMME la section fautive
    dans `description_placeholders["section"]` — un appelant (listes.py,
    objets.py, config_flow.py) fusionne ce refus dans son propre
    `errors`/`description_placeholders` plutot que de persister."""
    try:
        schema.valider(donnees)
    except vol.Invalid as err:
        if isinstance(err, vol.MultipleInvalid):
            err = err.errors[0]
        section = str(err.path[0]) if err.path else "base"
        return {"base": ERREUR_ECRAN_DEVIENDRAIT_INVALIDE}, {"section": section}
    return {}, {}
