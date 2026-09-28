"""`app/` n'etait scanne par AUCUNE garde de portabilite -- or c'est la SOURCE
dont `dist/` est bati. `tests/test_dist_portable.py` ne connaissait que deux
chemins de fichier, aucune IP, et son litteral "192.168.0.1"
(INTERDITS_COMPOSANT) ne s'appliquait qu'a `custom_components/`.

Une regle juste, ecrite une fois dans CLAUDE.md, et gardee zero fois : le
motif que ce depot a paye douze fois sur la branche 3a. Ce fichier est le
filet manquant.

Il cherche des MOTIFS, jamais des litteraux : "192.168.0.1" n'attrape ".159"
et ".138" que par coincidence de prefixe, et jamais ".218".
"""
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
SCANNES = ("app/src", "app/outils", "app/scripts", "app/gabarits", "app/README.md", "app/docs")

INTERDITS = (
    (re.compile(r"192\.168\.\d{1,3}\.\d{1,3}"), "une adresse IP du reseau local"),
    (re.compile(r"password=\S+", re.I), "un mot de passe en clair dans une URL"),
    (re.compile(r"/opt/nivuus/HomeAssistant"), "un chemin d'installation de CETTE machine"),
    (re.compile(r"/home/[a-z]+/"), "un chemin de repertoire personnel"),
)


def fichiers():
    for entree in SCANNES:
        chemin = RACINE / entree
        if chemin.is_file():
            yield chemin
        else:
            for f in chemin.rglob("*"):
                if f.is_file() and "node_modules" not in f.parts:
                    yield f


def main() -> int:
    fautes = []
    for f in fichiers():
        try:
            texte = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for numero, ligne in enumerate(texte.splitlines(), start=1):
            for motif, quoi in INTERDITS:
                if motif.search(ligne):
                    fautes.append(f"{f.relative_to(RACINE)}:{numero} -- {quoi}")
    for faute in fautes:
        print(f"ECHEC -- {faute}", file=sys.stderr)
    if fautes:
        print(f"\n{len(fautes)} occurrence(s). `app/` est la SOURCE de `dist/` : "
              "ce qui est ecrit ici est LIVRE.", file=sys.stderr)
        return 1
    print(f"OK -- {len(list(fichiers()))} fichiers de `app/` sans trace de cette machine")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
