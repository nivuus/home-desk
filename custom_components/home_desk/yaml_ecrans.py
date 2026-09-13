"""Le format d'export/import de `home_desk.exporter` / `home_desk.importer` :
un YAML lisible ou les `note` du contrat redeviennent des COMMENTAIRES,
jamais des champs.

Un `note: "..."` au milieu des donnees serait une chaine de plus. Un `#`
au-dessus de ce qu'il justifie est ce qu'un humain relit -- c'est la reponse
a la regression n.3 nommee franchement par la spec (« le raisonnement quitte
le depot », les `note` ne sont plus dans `git log`) : ce module est ce qui
permet de les y remettre quand on le decide, en import comme en export.

`note` peut apparaitre a la racine d'un ecran ET dans chacune des six formes
imbriquees qui la portent (schema.BOUTON, SYNTHESE, SOURCE, MINUTEUR_SLOT,
VOITURE, AGENCEMENT) -- jamais dans les listes de chaines nues (ouvrants,
etiquettesMinuteur, service) qui n'ont pas de champ a nommer. Plutot que de
nommer ces six formes une par une (une septieme s'ajouterait un jour sans que
ce fichier le sache, exactement la seconde copie que ce depot s'interdit),
`rendre`/`lire` traitent GENERIQUEMENT tout dict qui porte une cle "note" :
le mecanisme ne connait aucun nom de champ du contrat, seulement la regle
« note d'un dict -> commentaire seul sur sa ligne, juste au-dessus du bloc
que ce dict represente ».

`rendre` pilote la STRUCTURE et les commentaires a la main ; le rendu de
CHAQUE VALEUR SCALAIRE (l'echappement d'une chaine qui commence par un
caractere reserve, une chaine vide, "true"/"123" pris pour un booleen/un
entier...) est delegue a PyYAML (`yaml.safe_dump`) -- reinventer ces regles
de citation aurait ete exactement la resolution locale qu'aucune
bibliotheque mure ne justifie de reecrire (voir `_scalaire`).

`lire` fait le chemin inverse en deux passes : la premiere releve, ligne par
ligne, celles qui NE SONT QUE des commentaires (jamais un commentaire de fin
de ligne, que ce module n'ecrit jamais et ne sait donc pas relire), avec LEUR
COLONNE ; la seconde COMPOSE le texte (`yaml.SafeLoader.get_single_node`, la
phase de PyYAML qui construit l'arbre de noeuds AVANT de batir les objets
Python, seule a conserver la position de chaque noeud) et construit chaque
mapping a la main : un dict recoit une cle "note" quand la ligne juste
au-dessus de son demarrage est un commentaire dont la COLONNE est EXACTEMENT
celle de ce mapping (`noeud.start_mark.column` -- verifie par execution :
c'est la colonne de la PREMIERE CLE du mapping, jamais celle du "-" pour un
element de liste, ni celle de la cle qui l'introduit pour une valeur nommee).

Ronde 1 de relecture (Critique) : la premiere version de cette regle ne
verifiait que la LIGNE ("juste au-dessus"), jamais la colonne -- un
commentaire ORPHELIN place entre `ecrans:` et le premier `-` (l'en-tete
qu'un operateur ajouterait a la main, par exemple) satisfaisait deja "juste
au-dessus" et devenait une note RACINE INVENTEE sur le premier ecran,
persistee au prochain import puis reecrite comme une VRAIE note au prochain
export -- sans qu'aucun message ne le signale. La colonne ferme cet angle
mort : `rendre` place TOUJOURS son commentaire a la MEME colonne que le
premier champ du bloc qu'il annote, jamais a celle d'une cle parente ni du
`-` qui le precede ; un fichier edite a la main qui respecte cette meme
convention (commentaire nu, immediatement au-dessus, a la colonne exacte du
bloc) reste lisible, un commentaire a une AUTRE colonne (ou ailleurs qu'une
ligne juste au-dessus) est simplement ignore -- perdu comme note, mais
jamais confondu avec la mauvaise.

LIMITES CONNUES, assumees plutot que masquees :

1. Une `note` qui contiendrait elle-meme un saut de ligne est applatie (les
   sauts de ligne y deviennent des espaces) avant d'etre ecrite -- sans
   quoi une note multiligne casserait la regle "un commentaire, une ligne"
   dont ce module depend pour se relire lui-meme. Aucun ecran reel de ce
   depot n'a jamais porte de note multiligne (le contrat ne l'interdit pas,
   mais rien ne l'exerce).
2. Un espace de tete ou de queue du texte d'une note SURVIT au
   round-trip -- `_lignes_commentaires` ne retire que l'UNIQUE espace
   separateur que `rendre` insere lui-meme apres "#", jamais davantage :
   un fichier EDITE A LA MAIN qui ajoute ses propres espaces autour du
   texte les verrait donc conserves, contrairement a un simple `.strip()`
   qui les aurait avales en silence (mesure, corrigee en ronde 1 de
   relecture)."""
from __future__ import annotations

from typing import Any

import yaml

CLE_RACINE = "ecrans"


def _scalaire(valeur: Any) -> str:
    """Le rendu YAML d'une seule ligne de VALEUR (str/int/float/bool/None),
    correctement echappee -- delegue a PyYAML (`yaml.safe_dump` sur un dict
    a une seule cle, dont on ne garde que la partie apres "v: ") plutot que
    reecrit a la main."""
    rendu = yaml.safe_dump({"v": valeur}, allow_unicode=True, default_flow_style=False)
    return rendu[len("v: "):].rstrip("\n")


def _rendre_champ(cle: str, valeur: Any, indent: int) -> list[str]:
    """Rend `cle: valeur` a INDENT. Un dict recoit sa propre `note`
    eventuelle en commentaire juste au-dessus de `cle:` (le bloc que ce
    champ represente COMMENCE a `cle:`, jamais avant) ; une liste de dicts
    delegue chaque element a `_rendre_element` (qui gere la note DE
    l'element, positionnee au-dessus de son "-") ; une liste de chaines (ou
    vide) et un scalaire n'ont jamais de note a placer."""
    if isinstance(valeur, dict):
        # Ronde de mise au point : le commentaire d'un champ-dict NOMME
        # (agencement, voiture, aspirateurMaison -- jamais un ELEMENT de
        # liste, voir `_rendre_element`) doit se trouver sur la ligne
        # JUSTE AU-DESSUS de la premiere ligne du mapping IMBRIQUE que
        # `lire` construira -- et ce mapping commence a SA PROPRE premiere
        # cle (ici "zones:" pour agencement), PAS a la ligne "agencement:"
        # elle-meme (qui appartient au mapping PARENT). Mesure par
        # round-trip : placer le commentaire au-dessus de "cle:" perdait la
        # note (elle atterrissait sur la ligne du "cle:" lui-meme, jamais
        # relue). Place donc DANS le bloc, comme sa toute premiere ligne.
        sous_indent = indent + 2
        lignes = [f"{' ' * indent}{cle}:"]
        note = valeur.get("note")
        if note is not None:
            lignes.append(f"{' ' * sous_indent}# {_normaliser_note(note)}")
        for sous_cle in valeur:
            if sous_cle == "note":
                continue
            lignes.extend(_rendre_champ(sous_cle, valeur[sous_cle], sous_indent))
        return lignes
    if isinstance(valeur, list):
        if not valeur:
            return [f"{' ' * indent}{cle}: []"]
        lignes = [f"{' ' * indent}{cle}:"]
        for item in valeur:
            lignes.extend(_rendre_element(item, indent + 2))
        return lignes
    return [f"{' ' * indent}{cle}: {_scalaire(valeur)}"]


def _rendre_element(item: Any, indent: int) -> list[str]:
    """Un ELEMENT de liste (une tuile, une source, un slot de minuteur, ou
    -- ouvrants/etiquettesMinuteur -- une simple chaine).

    Ronde 1 de relecture (Mineur) : une version precedente de cette
    docstring affirmait INDENT « celui du "-" » dans TOUS les cas -- faux,
    verifie sur les deux appelants (`_rendre_champ`) : pour un element
    SCALAIRE (`ouvrants`, `etiquettesMinuteur`), le "-" est bien emis A
    INDENT (`f"{indent}- {valeur}"`). Pour un element MAPPING (une tuile,
    une source...), INDENT est au contraire la colonne de sa PREMIERE CLE
    -- le "-" se retrouve alors DEUX colonnes AVANT (`indent - 2`), jamais
    a INDENT lui-meme : le premier champ est rendu comme les autres par
    `_rendre_champ` (qui ignore qu'il est le premier) puis "greffe" sur un
    "-" ajoute apres coup, en retirant deux espaces de tete a sa toute
    premiere ligne. C'est cette MEME colonne (celle de la premiere cle,
    jamais celle du "-") que `_construire` (la lecture) doit retrouver
    pour reconnaitre une note -- voir sa docstring."""
    if not isinstance(item, dict):
        return [f"{' ' * indent}- {_scalaire(item)}"]
    note = item.get("note")
    lignes = ([f"{' ' * indent}# {_normaliser_note(note)}"] if note is not None else [])
    cles = [c for c in item if c != "note"]
    if not cles:
        # Aucune forme du contrat qui atterrit en liste n'est vide de tout
        # champ (chacune porte au moins un champ Required) -- ce cas ne
        # devrait jamais survenir avec des donnees issues de schema.valider,
        # mais un "- {}" reste un YAML valide et relisible plutot qu'un
        # crash si un futur champ optionnel-seul l'atteignait un jour.
        lignes.append(f"{' ' * indent}- {{}}")
        return lignes
    for i, cle in enumerate(cles):
        sous_lignes = _rendre_champ(cle, item[cle], indent)
        if i == 0:
            premiere = sous_lignes[0]
            sous_lignes[0] = f"{' ' * (indent - 2)}- {premiere[indent:]}"
        lignes.extend(sous_lignes)
    return lignes


def _normaliser_note(note: str) -> str:
    """Aplatit un saut de ligne eventuel (voir la LIMITE CONNUE de la
    docstring de module) -- jamais autre chose : le texte de la note reste
    sinon intact, y compris ses propres "#" ou ":"."""
    return note.replace("\n", " ")


def rendre(ecrans: list[dict]) -> str:
    """Le texte YAML complet du fichier d'export. `ecrans` : une liste de
    dict, chacun l'union de "titre" (`ConfigSubentry.title`, un champ HA qui
    n'appartient pas au contrat mais que l'aller-retour doit preserver -- va
    `websocket.ws_ecrans`) et de toutes les cles de `schema.ECRAN` que porte
    la sous-entree, "note" comprise partout ou le contrat l'autorise : cette
    fonction s'en charge, l'appelant n'a RIEN a retirer avant d'appeler
    `rendre`."""
    if not ecrans:
        return f"{CLE_RACINE}: []\n"
    lignes = [f"{CLE_RACINE}:"]
    for ecran in ecrans:
        lignes.extend(_rendre_element(ecran, 2))
    return "\n".join(lignes) + "\n"


def _lignes_commentaires(texte: str) -> dict[int, tuple[str, int]]:
    """Numero de ligne (0-indexee) -> (texte du commentaire, COLONNE de son
    "#") pour toute ligne qui N'EST QUE un commentaire -- jamais un
    commentaire de fin de ligne, que `rendre` n'ecrit jamais et que ce
    module ne pretend donc pas relire.

    Ronde 1 de relecture : seul le PREMIER espace suivant "#" (celui que
    `_rendre_element`/`_rendre_champ` inserent toujours, `f"# {note}"`) est
    retire -- jamais un `.strip()` du contenu entier, qui aurait aussi
    avale un espace de tete ou de queue APPARTENANT au texte de la note
    elle-meme (mesure : une note "  indentee" revenait "indentee"). Seule
    l'indentation DE LA LIGNE (avant le "#") est retiree pour calculer sa
    colonne -- jamais celle du contenu apres lui."""
    commentaires: dict[int, tuple[str, int]] = {}
    for i, ligne in enumerate(texte.splitlines()):
        sans_tete = ligne.lstrip(" ")
        if sans_tete.startswith("#"):
            colonne = len(ligne) - len(sans_tete)
            contenu = sans_tete[1:]
            if contenu.startswith(" "):
                contenu = contenu[1:]
            commentaires[i] = (contenu, colonne)
    return commentaires


def _construire(loader: yaml.SafeLoader, noeud: yaml.Node, commentaires: dict[int, tuple[str, int]]) -> Any:
    """Construit l'objet Python que NOEUD represente, en attribuant a tout
    MAPPING une cle "note" quand la ligne juste au-dessus de son
    demarrage est un commentaire dont la COLONNE est EXACTEMENT celle de
    ce mapping (`noeud.start_mark.column`) -- jamais la ligne seule.

    Ronde 1 de relecture (Critique) : verifie par execution que
    `noeud.start_mark.column` vaut la colonne de la PREMIERE CLE du
    mapping, que ce mapping soit un ELEMENT DE LISTE (sa colonne est alors
    celle du contenu APRES le "- ", jamais celle du "-" lui-meme) ou la
    VALEUR d'une cle nommee (sa colonne est alors celle de sa propre
    premiere cle, jamais celle de la cle qui l'introduit -- `agencement:`
    demarre une ligne AVANT `zones:`, la vraie premiere ligne du mapping
    qu'il porte). `rendre` place TOUJOURS son commentaire a cette MEME
    colonne (voir `_rendre_element`/`_rendre_champ`) : c'est ce qui ferme
    le commentaire ORPHELIN qu'une simple regle "ligne du dessus" laissait
    passer -- entre `ecrans:` et le premier `-`, par exemple, ou aucune
    colonne ne correspond a aucun mapping tant qu'il n'est pas indente a la
    colonne exacte d'un ecran reel."""
    if isinstance(noeud, yaml.MappingNode):
        resultat: dict[str, Any] = {}
        commentaire = commentaires.get(noeud.start_mark.line - 1)
        if commentaire is not None and commentaire[1] == noeud.start_mark.column:
            resultat["note"] = commentaire[0]
        for cle_noeud, valeur_noeud in noeud.value:
            cle = loader.construct_object(cle_noeud, deep=True)
            resultat[cle] = _construire(loader, valeur_noeud, commentaires)
        return resultat
    if isinstance(noeud, yaml.SequenceNode):
        return [_construire(loader, item, commentaires) for item in noeud.value]
    return loader.construct_object(noeud, deep=True)


def lire(texte: str) -> list[dict]:
    """L'inverse de `rendre` : rend la liste de dict (titre + champs
    d'ecran, note reconstituee depuis les commentaires) qu'un texte produit
    par `rendre` encode. Leve `yaml.YAMLError` si TEXTE n'est pas du YAML
    syntaxiquement valide ; `ValueError` s'il l'est mais ne porte pas la
    forme attendue (pas de cle "ecrans", ou une valeur qui n'est pas une
    liste de mappings) -- deux fautes distinctes, jamais confondues sous un
    seul message generique."""
    commentaires = _lignes_commentaires(texte)
    loader = yaml.SafeLoader(texte)
    try:
        racine = loader.get_single_node()
    finally:
        loader.dispose()
    if racine is None:
        raise ValueError(f"fichier vide -- attendu une cle {CLE_RACINE!r} portant une liste d'ecrans")
    document = _construire(loader, racine, commentaires)
    if not isinstance(document, dict) or CLE_RACINE not in document:
        raise ValueError(f"cle {CLE_RACINE!r} absente -- ce fichier n'a pas ete produit par home_desk.exporter")
    ecrans = document[CLE_RACINE]
    if not isinstance(ecrans, list) or not all(isinstance(e, dict) for e in ecrans):
        raise ValueError(f"{CLE_RACINE!r} doit etre une liste d'ecrans (un mapping chacun)")
    return ecrans
