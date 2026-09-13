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

from types import MappingProxyType
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigSubentry

from . import libelles, schema
from .const import ERREUR_ECRAN_DEVIENDRAIT_INVALIDE, SOUS_ENTREE_ECRAN, VERSION_CONFIG


def noms_utilises(entry: Any, *, exclure: str | None = None) -> frozenset[str]:
    """Les `nom` des sous-entrees « ecran » de `entry`, hors `exclure`.

    Ronde 1 de relecture (Important, tache 8) : `nom` est la cle PRIMAIRE
    du transport (`websocket.py` resout un ecran PAR SON NOM) -- deux
    homonymes rendraient l'un des deux definitivement inatteignable.
    `config_flow._valider_identite` l'utilise pour refuser un `nom` deja
    pris avant d'ecrire ; vit ici (pas dans `config_flow.py`, deja a la
    limite des 500 lignes) comme les autres invariants qui depassent la
    portee d'une seule sous-entree."""
    return frozenset(
        sous_entree.data["nom"]
        for subentry_id, sous_entree in entry.subentries.items()
        if subentry_id != exclure and "nom" in sous_entree.data
    )


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


def importer_ecrans(hass: Any, entry: Any, ecrans: list[tuple[str, dict]]) -> None:
    """Tache 9 : le SECOND site d'ecriture legitime de ce module -- le
    chemin de CREATION EN MASSE que ce garde protege, pour
    `home_desk.importer` (services.py). `ecrans` : une liste de (titre,
    donnees), `donnees` portant deja toutes les cles que `schema.ECRAN`
    attend ("note" comprise partout ou le contrat l'autorise -- ce n'est
    qu'un champ optionnel de plus pour `schema.valider`, aucun traitement
    special ici).

    ATOMIQUE (spec, brief tache 9) : les DEUX passes sont separees a
    dessein. La premiere ne fait QUE valider, chaque ecran contre
    `schema.valider` -- la MEME autorite que `verifier_ecran_complet`
    invoque plus haut, invariants croises compris (`_invariants_croises`,
    schema.py). Rien n'est ecrit tant qu'un seul echoue : un import
    partiel laisserait la configuration dans un etat que personne n'a
    voulu et que rien ne nomme, pire qu'un refus (docstring du brief). La
    seconde ne construit les `ConfigSubentry` et n'ecrit qu'une fois la
    premiere passee en entier.

    REMPLACE ENTIEREMENT les sous-entrees actuelles de `entry` -- jamais une
    fusion. C'est la lecture la plus honnete d'un "import" symetrique d'un
    "export" qui, lui, enumere l'INTEGRALITE des ecrans actuels (voir
    services.py) : le fichier est la verite entiere, pas un delta. C'est
    aussi le chemin que `home_desk.importer` sert a la migration du plan 3c
    (semer les ecrans du depot dans une installation neuve, ou aucune
    sous-entree n'existe encore).

    Une SEULE ecriture reelle (`_async_update_entry`, une des cinq portes
    gardees par `test_garde_ecran_est_le_seul_module_a_appeler_une_porte_
    d_ecriture` -- ce module en est exempte) : construire d'abord le dict
    complet des nouvelles sous-entrees puis l'ecrire d'un coup, plutot
    qu'un `async_add_subentry`/`async_remove_subentry` par ecran, est ce
    qui rend la bascule elle-meme indivisible du point de vue de tout code
    qui lirait `entry.subentries` entre-temps (il n'y a pas d'"entre-temps"
    : un seul appel, synchrone, comme tout le reste de ce module).

    CONTRAINTE AJOUTEE PAR CE MODULE, PAS PAR LE CONTRAT (a dire
    explicitement, jamais en silence) : `nom` doit rester UNIQUE parmi
    `ecrans` -- la MEME regle que `noms_utilises`/`_valider_identite`
    (config_flow.py) imposent a la CREATION/RECONFIGURATION d'un ecran par
    le formulaire. `contrat/ecran.schema.json` ne porte et ne peut pas
    porter cette contrainte (chaque sous-entree y est validee seule) ; sans
    elle ICI, un import pourrait semer deux ecrans homonymes que le FORMULAIRE
    n'aurait jamais laisse coexister -- rendant l'un des deux
    DEFINITIVEMENT inatteignable par `home_desk/ecran` (websocket.py, qui
    rend toujours le premier trouve).

    Releve en relecture finale de branche : "la MEME regle" ci-dessus etait
    fausse jusqu'a cette correction -- `_valider_identite` STRIPPE `nom`
    avant de comparer ET avant de persister (ronde 2, tache 8 : "salon "
    passait sinon les gardes mais se stockait brut) ; cette fonction
    comparait les `nom` BRUTS. Mesure : "Salon"/"Salon " importes ensemble
    passaient tous deux, persistes bruts, et le transport les servait
    l'un ET l'autre -- exactement la regression que le ruling 41 (tache 8)
    avait fermee cote formulaire. `nom` est desormais strippe ICI AUSSI,
    avant le calcul des doublons ET avant l'ecriture -- la meme valeur
    normalisee des deux cotes, jamais deux regles qui se ressemblent.

    `version` EST POSEE ICI QUAND ELLE EST ABSENTE (ronde 1 de relecture,
    le Critique) -- avant cette correction, un ecran SANS `version`
    (`contrat/ecran.schema.json` ne la rend jamais requise : `schema.py`,
    `vol.Optional("version")`) passait `schema.valider` (qui l'accepte
    absente) et etait persiste tel quel, pour etre ensuite refuse a la
    LECTURE par `websocket._resoudre` ("ne porte aucune version [...]
    Recreez cet ecran") -- exactement le geste que l'import devait eviter,
    mesure sur les trois ecrans REELS d'`app/src/ecran.ts` (aucun ne porte
    `version`, aucune raison qu'un fichier ecrit a la main ou issu d'une
    migration la porte). `websocket._resoudre` nomme deja `home_desk.
    importer` parmi les portes non gardees qu'elle rattrape a la LECTURE ;
    ce module la ferme desormais aussi a l'ECRITURE, au plus tot. Une
    version PRESENTE mais DIFFERENTE de `VERSION_CONFIG` reste un refus NET
    (une vraie incompatibilite, jamais une omission a corriger a la
    place de l'operateur) -- nommee, jamais fondue avec le cas absent."""
    ecrans_normalises: list[tuple[str, dict]] = []
    for titre, donnees in ecrans:
        donnees = dict(donnees)
        # Releve en relecture finale de branche : STRIPPE ICI, avant le
        # calcul des doublons ET avant l'ecriture -- la MEME regle que
        # `_valider_identite` (config_flow.py), jamais une comparaison sur
        # le brut qui laisserait passer "Salon"/"Salon " comme deux noms
        # distincts. Seule une chaine est strippee : `schema.valider`
        # (plus bas) refuse deja un `nom` absent ou d'un autre type, donc
        # rien ici n'a besoin de le supposer present.
        if isinstance(donnees.get("nom"), str):
            donnees["nom"] = donnees["nom"].strip()
        version = donnees.get("version")
        if version is None:
            donnees["version"] = VERSION_CONFIG
        elif version != VERSION_CONFIG:
            raise vol.Invalid(
                f"l'ecran {titre!r} porte la version {version!r}, que ce "
                f"composant ne reconnait pas (seule {VERSION_CONFIG!r} "
                "l'est) -- mettez a jour l'integration home_desk avant de "
                "reessayer, ou retirez ce champ 'version' du fichier pour "
                "laisser l'import le poser lui-meme"
            )
        ecrans_normalises.append((titre, donnees))

    noms = [donnees.get("nom") for _titre, donnees in ecrans_normalises]
    doublons = sorted({nom for nom in noms if nom is not None and noms.count(nom) > 1})
    if doublons:
        raise vol.Invalid(
            f"le fichier importe porte plusieurs ecrans nommes {doublons} -- "
            "deux ecrans homonymes rendraient l'un des deux inatteignable, "
            "renommez l'un d'eux dans le fichier avant de reessayer"
        )

    for _titre, donnees in ecrans_normalises:
        schema.valider(donnees)

    nouvelles_sous_entrees: dict[str, ConfigSubentry] = {}
    for titre, donnees in ecrans_normalises:
        sous_entree = ConfigSubentry(
            data=MappingProxyType(donnees),
            subentry_type=SOUS_ENTREE_ECRAN,
            title=titre,
            unique_id=None,
        )
        nouvelles_sous_entrees[sous_entree.subentry_id] = sous_entree
    hass.config_entries._async_update_entry(entry, subentries=nouvelles_sous_entrees)
