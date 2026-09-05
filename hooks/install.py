#!/usr/bin/env python3
"""Phase install du package home-desk : deposer l'affichage des tablettes.

Ce package est un SATELLITE : il n'a pas de repertoire de deploiement a lui, il
ecrit dans celui que `home-manager` a cree. Son manifeste le declare par
`requires: packages: [home-manager]`, ce qui fait installer le socle en premier
— et ce package est le cas d'ecole du champ, puisque « home-desk » trie AVANT
« home-manager » en alphabetique.

QUATRE REGLES.

1. IL REFUSE SI LE SOCLE EST ABSENT. `requires.packages` bloque deja le cas
   dans le wizard, mais ce hook tourne aussi en autonome — `--root /`, un
   config.json ecrit a la main — ou rien ne l'a valide. Creer une arborescence
   orpheline que personne ne lira serait pire que refuser.

2. IL REMPLACE CE QUI PORTE SON NOM, IL COPIE DANS CE QU'IL PARTAGE.
   `www/wallpanel/` et `custom_components/vignette/` portent le nom du
   package : ils sont remplaces en entier, sans quoi un fichier retire entre
   deux versions et les __pycache__ perimes survivraient — des fichiers
   fantomes que Home Assistant chargerait.
   `www/` et `packages/` sont PARTAGES : douze occupants mesures dans le
   premier au 2026-09-05 (HACS, nivuus-panel, media, uploaded, deux
   sauvegardes datees...), et le fragment d'intents de `home-stock` dans le
   second. Les remplacer supprimerait le travail des autres. Pour ceux-la, un
   fichier est copie, jamais un repertoire.

3. DEUX EXECUTIONS CONCURRENTES SE SERIALISENT. Reexecuter ce hook est le seul
   mecanisme de mise a jour. Voir exclusive_deposit().

4. IL N'ECRIT JAMAIS DANS configuration.yaml — il SIGNALE deux lignes.
   `vignette:` et `packages: !include_dir_named packages`. Le fichier porte les
   automations d'une maison entiere ; le PRESERVED de home-manager le protege,
   et home-stock a explicitement rejete l'insertion idempotente au profit d'un
   message. La ligne `packages:` etait ABSENTE au 2026-09-04 ; elle a ete posee
   a la main le 2026-09-05 pour le fragment d'intents de home-stock, qui etait
   depose depuis le 2026-08-28 et jamais charge.

LE DEPOT DU BUNDLE EST ATOMIQUE, ET CE N'EST PAS UNE PRECAUTION. replace_tree()
copie vers un voisin temporaire puis bascule par os.replace(). Le motif vient
de home-stock, ou une revue a mesure 291 lectures sur fichier absent pendant la
fenetre rmtree + copytree. Ici c'est PIRE : `www/wallpanel/` est lu par TROIS
clients qui rechargent tout seuls. C'est aussi pourquoi dist/ contient ses
assets — un dist/ complet se depose en UN geste.
"""
import argparse
import contextlib
import fcntl
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Le repertoire de configuration cree par home-manager.
CONFIG_REL = "opt/nivuus/home-manager/config"

# Repertoires qui portent le nom du package : remplaces en entier.
OWNED_TREES = (
    ("dist", "www/wallpanel"),
    ("custom_components/vignette", "custom_components/vignette"),
)

# Fichier depose dans un repertoire PARTAGE : copie seul, jamais par
# remplacement du repertoire, qui appartient aussi a home-stock.
# Il est depose INCONDITIONNELLEMENT : c'est du texte inerte tant que rien ne
# le charge, et son absence rendrait le signalement de la regle 4
# incomprehensible — l'operateur ajouterait une ligne pour charger un fichier
# qui n'existe pas.
FRAGMENT_REL = "packages/home_desk.yaml"
SHARED_FILES = (
    (FRAGMENT_REL, FRAGMENT_REL),
)

# Les deux lignes que le hook controle sans jamais les ecrire.
PACKAGES_DECLARATION = "packages: !include_dir_named packages"
VIGNETTE_DECLARATION = "vignette:"

# Les deux tags que Home Assistant accepte pour charger un repertoire de
# paquets, et le nom du repertoire qu'ils designent — capture indispensable :
# `packages: !include_dir_named autre_dossier` declare bien quelque chose, mais
# pas le repertoire ou ce hook depose son fragment.
PACKAGES_RE = re.compile(
    r"^\s*packages:\s*!include_dir_(?:merge_)?named\s+(\S+)\s*$", re.MULTILINE)
# `vignette:` en debut de ligne, sans indentation : c'est une cle de premier
# niveau. Indentee, elle appartiendrait a un autre bloc et n'activerait rien.
VIGNETTE_RE = re.compile(r"^vignette:\s*$", re.MULTILINE)


def emit(event):
    print(json.dumps(event), flush=True)


def _discard(path):
    """Ecarter ce qui occupe deja `path`, quelle que soit sa nature."""
    if not os.path.lexists(path):
        return
    if os.path.isdir(path) and not os.path.islink(path):
        shutil.rmtree(path)
    else:
        os.remove(path)


def replace_tree(source, dest):
    """Remplacer dest par source, sans jamais laisser dest absent.

    Reprise a l'identique de home-stock/hooks/install.py. Voir l'en-tete de
    module pour la raison : trois clients relisent ce repertoire tout seuls.
    """
    parent = os.path.dirname(dest)
    os.makedirs(parent, exist_ok=True)

    tmp = dest + ".new"
    old_aside = dest + ".old"
    _discard(tmp)
    _discard(old_aside)

    try:
        shutil.copytree(source, tmp, symlinks=True)
    except Exception:
        _discard(tmp)
        raise

    moved_old = os.path.lexists(dest)
    if moved_old:
        if os.path.isdir(dest) and not os.path.islink(dest):
            os.replace(dest, old_aside)
        else:
            os.remove(dest)
            moved_old = False

    os.replace(tmp, dest)

    if moved_old:
        shutil.rmtree(old_aside)


def copy_file(source, dest):
    """Deposer un fichier dans un repertoire partage, sans toucher au reste."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(source, dest)


def _lire_configuration(config_dir):
    """Le texte de configuration.yaml, ou "" s'il est illisible.

    Une recherche textuelle, pas un yaml.safe_load : configuration.yaml est
    plein de tags !include et !secret que le parseur standard refuse.

    La lecture est TOLERANTE a l'encodage : ce controle tourne APRES les
    depots, donc une UnicodeDecodeError ici ferait echouer l'installation
    entiere alors que tous les fichiers sont deja en place — pire que le
    message superflu qu'elle empecherait.
    """
    path = os.path.join(config_dir, "configuration.yaml")
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def declares_packages(texte):
    """configuration.yaml charge-t-il le repertoire ou ce hook depose ?

    LIMITE ASSUMEE, la meme que chez home-stock : une declaration logee dans un
    fichier inclus echappe a cette recherche. Le hook signalera alors une ligne
    deja presente ailleurs — un message superflu, jamais une perte.
    """
    wanted = os.path.dirname(FRAGMENT_REL)
    return any(m.group(1) == wanted for m in PACKAGES_RE.finditer(texte))


def declares_vignette(texte):
    """configuration.yaml active-t-il le composant de redimensionnement ?"""
    return VIGNETTE_RE.search(texte) is not None


@contextlib.contextmanager
def exclusive_deposit(config_dir):
    """Serialiser les executions concurrentes du hook sur le meme socle.

    Le verrou porte sur config_dir lui-meme : il existe forcement a cet instant
    (la regle 1 vient de le verifier) et ce n'est l'artefact d'aucune des deux
    executions — contrairement a tout ce que ce hook depose.
    """
    fd = os.open(config_dir, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", required=True)
    parser.add_argument("--root", default="/")
    args = parser.parse_args()
    json.load(sys.stdin)          # le contexte est lu, rien n'en depend ici
    root = args.root.rstrip("/") or "/"

    config_dir = os.path.join(root, CONFIG_REL)

    # Regle 1 : refuser plutot que de creer un orphelin.
    if not os.path.isdir(config_dir):
        print("home-desk install: le package home-manager n'est pas installe "
              f"({config_dir} est absent) ; l'affichage des tablettes depose "
              "ses fichiers dans la configuration de Home Assistant, qu'il ne "
              "cree pas lui-meme", file=sys.stderr)
        return 1

    with exclusive_deposit(config_dir):
        emit({"event": "progress", "pct": 20,
              "msg": "Depose du bundle des tablettes"})
        replace_tree(os.path.join(HERE, "dist"),
                     os.path.join(config_dir, "www/wallpanel"))

        emit({"event": "progress", "pct": 50,
              "msg": "Depose du composant de redimensionnement"})
        replace_tree(os.path.join(HERE, "custom_components/vignette"),
                     os.path.join(config_dir, "custom_components/vignette"))

        emit({"event": "progress", "pct": 70,
              "msg": "Depose des automations des tablettes"})
        for rel_source, rel_dest in SHARED_FILES:
            copy_file(os.path.join(HERE, rel_source),
                      os.path.join(config_dir, rel_dest))

        # Regle 4 : signaler, jamais ecrire.
        texte = _lire_configuration(config_dir)

        if not declares_vignette(texte):
            emit({"event": "progress", "pct": 85,
                  "msg": "Le redimensionnement des affiches n'est PAS actif : "
                         "ajoutez cette ligne a configuration.yaml, en premier "
                         f"niveau : {VIGNETTE_DECLARATION} — sans elle, les "
                         "affiches de media arrivent en pleine resolution sur "
                         "les tablettes ; une affiche 2000x3000 occupe ~23 Mo "
                         "decodee et tue la WebView des Fire 7"})

        if not declares_packages(texte):
            emit({"event": "progress", "pct": 92,
                  "msg": "Les automations des tablettes sont deposees mais NE "
                         "SERONT PAS CHARGEES : ajoutez cette ligne a "
                         "configuration.yaml, sous « homeassistant: » : "
                         f"{PACKAGES_DECLARATION} — sans elle, les trois "
                         "ecrans restent sans luminosite adaptative, sans "
                         "garde thermique et sans theme jour/nuit"})

        emit({"event": "progress", "pct": 95,
              "msg": "Affichage des tablettes depose dans la configuration "
                     "de Home Assistant"})

    emit({"event": "done"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
