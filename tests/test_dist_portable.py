#!/usr/bin/env python3
"""dist/ est suivi par git, complet, et ne porte aucun chemin de machine.

C'est le corollaire de la decision 2 : le bundle est versionne, donc
`git archive HEAD` l'emporte et l'installateur n'a jamais besoin de Node.
Un dist/ non suivi ferait echouer l'installation en silence — le hook
deposerait un repertoire vide.

Transposition de test_compose_portable.py du package home-manager.

Run: python3 tests/test_dist_portable.py
"""
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]

# Les cinq artefacts que le hook depose. assets/ est duplique depuis
# app/assets/ par le build : c'est 411 Ko payes une fois (git stocke par
# contenu) pour que dist/ soit COMPLET, donc deposable par un seul
# replace_tree() atomique — le repertoire est relu par trois clients qui
# rechargent tout seuls.
ATTENDUS = (
    "wallpanel.js", "wallpanel.css",
    "salon.html", "bureau.html", "cuisine.html",
)

# Aucun chemin de machine ne doit survivre dans ce qui est depose.
# /opt/nivuus/HomeAssistant est l'ancien emplacement, disparu le 2026-08-28.
INTERDITS = ("/opt/nivuus/HomeAssistant", "/home/mallanic")

failures = []


def suivis(sous_repertoire):
    out = subprocess.run(["git", "-C", str(REPO), "ls-files", sous_repertoire],
                         capture_output=True, text=True, check=True)
    return [l for l in out.stdout.splitlines() if l]


fichiers = suivis("dist")
if not fichiers:
    failures.append("dist/ n'est suivi par AUCUN fichier : "
                    "git archive HEAD n'emporterait rien")

noms = {pathlib.PurePosixPath(f).name for f in fichiers}
for attendu in ATTENDUS:
    if attendu not in noms:
        failures.append(f"dist/{attendu} n'est pas suivi par git")

if not any(f.startswith("dist/assets/") for f in fichiers):
    failures.append("dist/assets/ n'est suivi par aucun fichier ; "
                    "les polices DSEG et les deux videos manqueraient")

# Les binaires ne se relisent pas en texte : on ne scanne que le texte.
for rel in fichiers:
    chemin = REPO / rel
    if chemin.suffix not in (".js", ".css", ".html"):
        continue
    texte = chemin.read_text(encoding="utf-8", errors="replace")
    for interdit in INTERDITS:
        if interdit in texte:
            failures.append(f"{rel} porte le chemin de machine {interdit}")

# Le code SUIVI de l'application ne doit plus citer l'ancien emplacement.
for rel in suivis("app"):
    chemin = REPO / rel
    if chemin.suffix not in (".js", ".mjs", ".ts", ".json"):
        continue
    texte = chemin.read_text(encoding="utf-8", errors="replace")
    if "/opt/nivuus/HomeAssistant" in texte:
        failures.append(f"{rel} cite encore /opt/nivuus/HomeAssistant, "
                        "emplacement disparu le 2026-08-28")

if failures:
    print("\n".join(failures))
    sys.exit(1)
print("test_dist_portable: OK")
