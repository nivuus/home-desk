"""Les validateurs FEUILLE que `schema.py` compose pour miroiter
`contrat/ecran.schema.json` -- chacun leve une des `_Faute*` de
`fautes.py`, dediee au mot-cle JSON Schema qu'il traduit ("type",
"pattern", "minimum", "enum"...), jamais un `vol.Invalid` generique avec
`error_type="..."` (voir `fautes.py` pour le pourquoi de cette
hierarchie).

Separe de `schema.py` en relecture finale de branche (deuxieme ronde) :
`schema.py` avait depasse 500 lignes une fois les deux derniers refus
ajoutes (`_alerte_en_tete`, `_trie`) -- la MEME couture qui avait deja
produit `fautes.py` en ronde 3 de la tache 6 (« une seule et meme
preoccupation, separee de ce qui MIROITE le contrat »), jamais nommee
alors dans `CLAUDE.md`, contrairement a cette fois-ci.

Ce module ne LIT rien du contrat (aucun `pathlib.Path`, aucun JSON) : ses
fonctions sont des FABRIQUES pures, parametrees par leurs bornes/valeurs
attendues a l'appel -- `schema.py` reste le SEUL lecteur du contrat
embarque, et compose ces fabriques avec les vocabulaires qu'il en tire
(`HAUTEUR_MIN`/`HAUTEUR_MAX`, notamment, pour `hauteur_utile`). C'est ce
qui evite toute dependance circulaire entre les deux modules."""
from __future__ import annotations

import re

from .fautes import (
    _FauteAlertePremiere,
    _FauteConst,
    _FauteEnum,
    _FauteMaximum,
    _FauteMaxItems,
    _FauteMinItems,
    _FauteMinLength,
    _FauteMinimum,
    _FautePattern,
    _FauteType,
    _FauteUniqueItems,
)


def _chaine(min_len: int = 0):
    """Un `str`, avec au besoin une longueur minimale (`minLength`)."""

    def valider(valeur):
        if not isinstance(valeur, str):
            raise _FauteType("attendu une chaine")
        if min_len and len(valeur) < min_len:
            raise _FauteMinLength(f"longueur minimale {min_len}")
        return valeur

    return valider


def _motif_chaine(regex: re.Pattern, min_len: int = 0):
    """Un `str` qui doit en plus respecter un `pattern`."""

    def valider(valeur):
        if not isinstance(valeur, str):
            raise _FauteType("attendu une chaine")
        if min_len and len(valeur) < min_len:
            raise _FauteMinLength(f"longueur minimale {min_len}")
        if not regex.match(valeur):
            raise _FautePattern("ne respecte pas le motif attendu")
        return valeur

    return valider


def _enum(valeurs):
    def valider(valeur):
        if valeur not in valeurs:
            raise _FauteEnum(f"doit etre parmi {sorted(valeurs)}")
        return valeur

    return valider


def _const(attendu):
    """Le pendant de `"const": ...` : type ET valeur, sans confondre 1 et True."""

    def valider(valeur):
        if type(valeur) is not type(attendu) or valeur != attendu:
            raise _FauteConst(f"doit valoir {attendu!r}")
        return valeur

    return valider


def _hauteur_utile(minimum: int, maximum: int):
    """Fabrique de `schema.hauteur_utile` -- les bornes viennent du
    contrat (`HAUTEUR_MIN`/`HAUTEUR_MAX`, schema.py), jamais retapees ici.
    `schema.hauteur_utile = _hauteur_utile(HAUTEUR_MIN, HAUTEUR_MAX)` reste
    l'interface PUBLIQUE reutilisee telle quelle par `config_flow.py`, pour
    que le formulaire de saisie refuse la MEME plage que `schema.valider()`."""

    def valider(valeur):
        if isinstance(valeur, bool) or not isinstance(valeur, int):
            raise _FauteType("attendu un entier")
        if valeur < minimum:
            raise _FauteMinimum(f"minimum {minimum}")
        if valeur > maximum:
            raise _FauteMaximum(f"maximum {maximum}")
        return valeur

    return valider


def _paire_service():
    """Le pendant de `"service": {"minItems": 2, "maxItems": 2, "items":
    {"type": "string", "minLength": 1}}`. Ecrit a la main plutot qu'avec
    `vol.Length` : ce dernier ne distingue pas minItems de maxItems dans sa
    classe, et son message ("length must be...") ne survivrait pas plus que
    error_type au passage dans un dict — la meme fragilite qui a motive
    `_Faute` (fautes.py), appliquee ici puisque le cout marginal est nul une
    fois la hierarchie en place.

    PRIVEE de nouveau depuis la ronde 4 de relecture. La ronde 2 l'avait
    rendue publique (`paire_service`, sans prefixe) en affirmant que
    `listes_champs._construire_donnee_bouton` la REUTILISAIT pour refuser
    une paire `service_domaine`/`service_action` a demi remplie — la ronde 3
    a retire cette reutilisation (le motif JSON Schema qu'elle produisait,
    "minItems" pose sur "base", etait illisible pour un humain ; voir
    `listes_champs.ServiceIncomplet`) SANS corriger cette affirmation, qui
    est devenue fausse au moment meme ou elle l'ecrivait — sixieme
    docstring menteuse du chantier. Aucun appelant hors de ce module ne
    l'utilise plus (`grep paire_service`, verifie) : redevenue privee.

    La regle « exactement deux elements » vit donc desormais a DEUX
    endroits, assume : ICI (validation finale de `schema.BOUTON`, la SEULE
    garantie que `contrat/ecran.schema.json` exige vraiment) et dans
    `listes_champs.ServiceIncomplet` (le refus lisible, a la saisie). Les
    deux sont necessaires — une saisie complete peut toujours produire un
    `service` invalide par un autre chemin que le formulaire (import direct
    d'une config, par exemple) — mais c'est une duplication DELIBEREE,
    nommee ici plutot que cachee."""
    chaine_non_vide = _chaine(1)

    def valider(valeur):
        if not isinstance(valeur, list):
            raise _FauteType("attendu une liste")
        if len(valeur) < 2:
            raise _FauteMinItems("service attend exactement 2 elements")
        if len(valeur) > 2:
            raise _FauteMaxItems("service attend exactement 2 elements")
        return [chaine_non_vide(v) for v in valeur]

    return valider


def _uniques():
    """Le pendant de `"uniqueItems": true`. Remplace `vol.Unique()` pour la
    meme raison que `_paire_service` remplace `vol.Length` : rester dans
    notre propre hierarchie d'exceptions plutot que dans le vocabulaire
    interne de voluptuous."""

    def valider(valeur):
        vus = []
        for item in valeur:
            if item in vus:
                raise _FauteUniqueItems(f"doublon : {item!r}")
            vus.append(item)
        return valeur

    return valider


def _alerte_en_tete():
    """`alerte`, present dans `modes`, doit en etre le PREMIER element --
    spec du 2026-09-12, « Invariants verifies par le schema » : « alerte
    en premiere position si present (une alerte ne cede a rien) ».
    `modePrincipal` (app/src/modes.ts) rend le PREMIER mode actif de cette
    liste dont la condition tient -- un agencement qui ne respecte pas
    cette regle ferait ceder une alerte reelle a un mode moins prioritaire
    des que celui-ci s'active, exactement ce que la spec interdit.

    PORTEE PAR LE CONTRAT depuis la deuxieme relecture finale de branche
    (`contrat/ecran.schema.json`, `allOf` racine : `contains: {const:
    alerte}` -> `then: {prefixItems: [{const: alerte}]}`, verifie contre
    ajv a l'execution) -- corrige d'une premiere version de cette fonction
    qui affirmait a tort que cette regle etait « ajoutee par ce composant,
    pas par le contrat », par analogie avec `_uniques()`. Cette analogie
    etait FAUSSE, mesure : le contrat porte deja `"uniqueItems": true` sur
    `zones`, `modes` ET `modulateurs` -- `_uniques()` est le MIROIR d'une
    contrainte du contrat, l'exact contraire de ce que l'ancienne
    docstring affirmait. Ici, l'exception levee (`_FauteAlertePremiere`,
    fautes.py) HERITE du mot-cle `_FauteConst` ("const") plutot que d'en
    inventer un : c'est le mot-cle JSON Schema REEL que produit ajv pour
    cette regle (`prefixItems[0].const`), et `contrat/cas-schema.json` en
    porte desormais un cas partage -- les deux implementations tombent
    enfin sur le MEME verdict, pour le MEME motif ("/agencement/modes/0:
    const"), verifie par execution des deux cotes (`tests/composant/
    test_schema.py`, `app/tests/cas-schema.test.ts`).

    `path=[0]` design DELIBEREMENT l'index fautif (le premier element de
    la liste), exactement ce qu'ajv nomme (`instancePath` :
    `/agencement/modes/0`) -- jamais la liste entiere. `objets.py`
    (`async_step_agencement`) distingue ce refus PRECIS d'un refus
    `const` quelconque ailleurs (`version`, `delorean`...) par le TYPE de
    l'exception (`isinstance(err, _FauteAlertePremiere)`), pas par son
    mot-cle desormais partage avec d'autres champs -- voir sa propre
    docstring."""

    def valider(valeur):
        if "alerte" in valeur and valeur[0] != "alerte":
            raise _FauteAlertePremiere(
                "'alerte', si present, doit etre le PREMIER mode de la liste "
                "(une alerte ne cede a rien)",
                path=[0],
            )
        return valeur

    return valider


def _trie():
    """Releve en relecture finale de branche : `modulateurs` n'a pas
    d'ordre significatif (spec du 2026-09-12, « Invariants verifies par le
    schema » : « le schema le normalise en ensemble trie, pour qu'un diff
    d'export ne bruite pas ») -- jamais applique avant cette correction :
    `AGENCEMENT` conservait l'ordre SOUMIS, comme `zones`/`modes` (ou
    l'ordre EST significatif, voir `test_agencement_conserve_l_ordre_
    soumis_des_zones_et_des_modes`, test_config_flow_objets.py). Deux
    exports du meme ecran, `modulateurs` choisis dans un ordre different
    au formulaire, produisaient donc un diff YAML bruyant
    (`yaml_ecrans.rendre`) pour un reordonnancement sans aucun effet sur le
    rendu -- `CONDITIONS_MODULATEURS` (app/src/modes.ts) ne lit jamais
    l'ordre, seulement l'appartenance."""

    def valider(valeur):
        return sorted(valeur)

    return valider
