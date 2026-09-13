"""Ce qui NOMME une faute d'une section « liste » : la table qui traduit un
mot-cle JSON Schema en code d'erreur (`_ERREUR_PAR_MOT_CLE`), et la fonction
qui attribue une faute a un CHAMP de formulaire (`_localiser_champ`).

Extrait de `listes.py` en ronde de correction 1 (defaut B) : `listes.py`
avait regagne, avec la tache 7, exactement la marge que cette meme tache
avait liberee ailleurs (478 -> 498/500). La couture est celle qui a deja
degonfle `schema.py` deux fois : ce qui NOMME une faute part, ce qui
l'UTILISE reste dans `listes.py` (et dans `objets.py`, qui rejoue le meme
mecanisme pour `$defs/agencement`). La preuve qu'elle etait deja separable :
`objets.py` importait deja les deux noms ENSEMBLE depuis `listes.py`
(`from .listes import _ERREUR_PAR_MOT_CLE, _localiser_champ`) -- un module
qui importe des noms prives d'un autre est une couture qui demande a etre
ouverte.

DEPLACEMENT OCTET POUR OCTET depuis `listes.py` : ni l'un ni l'autre n'a ete
reecrit, seulement deplace -- c'est ce qui rend l'extraction PROUVABLE (232
tests verts apres un deplacement byte-identique est une preuve ; apres une
reecriture, ce n'en est pas une). Noms inchanges, y compris leur prefixe
`_` : ces deux noms restent des details d'implementation PARTAGES entre
`listes.py` et `objets.py`, jamais une API publique de ce composant.
"""
from __future__ import annotations

import voluptuous as vol

from . import schema
from .const import (
    ERREUR_CHAMP_DOUBLON,
    ERREUR_CHAMP_ELEMENT_REQUIS,
    ERREUR_CHAMP_FORMAT_INVALIDE,
    ERREUR_CHAMP_INCONNU,
    ERREUR_CHAMP_REQUIS,
    ERREUR_CHAMP_TROP_COURT,
    ERREUR_CHAMP_TROP_D_ELEMENTS,
    ERREUR_CHAMP_TROP_PEU_D_ELEMENTS,
    ERREUR_CHAMP_TYPE_INVALIDE,
    ERREUR_CHAMP_VALEUR_FIGEE,
    ERREUR_CHAMP_VALEUR_NON_AUTORISEE,
)

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

