#!/usr/bin/env python3
"""dist/ est suivi par git, complet, et ne porte aucun chemin de machine.

C'est le corollaire de la decision 2 : le bundle est versionne, donc
`git archive HEAD` l'emporte et l'installateur n'a jamais besoin de Node.
Un dist/ non suivi ferait echouer l'installation en silence — le hook
deposerait un repertoire vide.

`custom_components/home_desk/` recoit la meme garde, pour la meme raison : il
sera bientot publiable. Il est meme plus expose que dist/, puisqu'il tourne
DANS la configuration — d'ou des motifs interdits supplementaires, propres a
lui (home-manager, /opt/nivuus, l'adresse de l'instance).

Transposition de test_compose_portable.py du package home-manager.

Run: python3 tests/test_dist_portable.py
"""
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]

# Les cinq artefacts que le hook depose. assets/ est duplique depuis
# app/assets/ par le build : c'est 11 Ko payes une fois (git stocke par
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
                    "les polices DSEG manqueraient")

# Les binaires ne se relisent pas en texte : on ne scanne que le texte.
for rel in fichiers:
    chemin = REPO / rel
    if chemin.suffix not in (".js", ".css", ".html"):
        continue
    texte = chemin.read_text(encoding="utf-8", errors="replace")
    for interdit in INTERDITS:
        if interdit in texte:
            failures.append(f"{rel} porte le chemin de machine {interdit}")

# Le composant tourne DANS la configuration : plus expose que dist/, qui n'est
# qu'un bundle statique depose a cote. Memes motifs que dist/, plus deux
# specifiques a lui — home-manager et /opt/nivuus designeraient le socle par
# son nom de package ou son chemin.
INTERDITS_COMPOSANT = INTERDITS + ("home-manager", "/opt/nivuus")

# Les IP se cherchent par MOTIF, jamais par litteral : "192.168.0.1" n'attrape
# ".159" et ".138" que par coincidence de prefixe (`"192.168.0.1" in
# "192.168.0.159"` est vrai) et JAMAIS ".218". Mesure et corrige au plan 3c.
MOTIFS_COMPOSANT = (re.compile(r"192\.168\.\d{1,3}\.\d{1,3}"),)

for rel in suivis("custom_components/home_desk"):
    chemin = REPO / rel
    # Releve en relecture finale de branche : ".yaml" manquait ici --
    # services.yaml (tache 9) echappait entierement a cette garde, seul
    # fichier suivi du composant hors .py/.json (mesure : git ls-files).
    if chemin.suffix not in (".py", ".json", ".yaml"):
        continue
    texte = chemin.read_text(encoding="utf-8", errors="replace")
    for interdit in INTERDITS_COMPOSANT:
        if interdit in texte:
            failures.append(f"{rel} porte le chemin ou l'adresse de cette "
                            f"maison {interdit!r}")
    for motif in MOTIFS_COMPOSANT:
        if motif.search(texte):
            failures.append(f"{rel} porte une adresse IP du reseau local")

# The bundle is generated, not a source file: the org policy (nivuus/.github)
# would otherwise hold it to the French-text and 500-line rules of hand-written
# code. Both exemptions are written by the build itself (app/rollup.config.js,
# banner), on the bundle's first line, so a rebuild can never lose them.
BUNDLE = REPO / "dist" / "wallpanel.js"
if BUNDLE.exists():
    premiere = BUNDLE.read_text(encoding="utf-8").splitlines()[0]
    for marqueur in ("policy: allow-fr-file", "policy: allow-long-file"):
        if marqueur not in premiere:
            failures.append(f"dist/wallpanel.js does not open with {marqueur!r}: "
                            "the org policy would check a generated bundle as code")

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
