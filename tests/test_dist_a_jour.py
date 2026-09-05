#!/usr/bin/env python3
"""dist/ commite doit correspondre a app/src/ commite.

Le corollaire indispensable d'un bundle versionne (decision 2). Sans ce test,
la seule chose que la decision garantit est qu'UN bundle est livre — pas qu'il
corresponde aux sources livrees avec lui. Un dist/ perime serait depose sur les
trois tablettes sans que rien ne le signale, et le mode de panne est muet : les
tablettes afficheraient l'ancienne version pour toujours.

Ce test exige Node. Il SAUTE proprement quand Node est absent — il tourne alors
sur la machine de developpement et en CI, pas sur la cible d'installation, ou
il n'aurait aucun sens.

Run: python3 tests/test_dist_a_jour.py
"""
import pathlib
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]
APP = REPO / "app"
DIST = REPO / "dist"

if shutil.which("npm") is None:
    print("test_dist_a_jour: SAUTE (npm absent)")
    sys.exit(0)

if not (APP / "node_modules").is_dir():
    print("test_dist_a_jour: SAUTE (node_modules absent — lancer `npm ci` "
          "dans app/ pour activer ce test)")
    sys.exit(0)

build = subprocess.run(["npm", "run", "build"], cwd=APP,
                       capture_output=True, text=True)
if build.returncode != 0:
    print("le build a echoue :\n" + build.stderr)
    sys.exit(1)

ecarts = subprocess.run(["git", "-C", str(REPO), "status", "--porcelain", "dist"],
                        capture_output=True, text=True, check=True).stdout.strip()
if ecarts:
    print("dist/ commite ne correspond PAS a app/src/ commite.\n"
          "Le build vient de produire un resultat different de ce qui est\n"
          "versionne. Reconstruire et committer dist/ :\n"
          "    cd app && npm run build && cd .. && git add dist && git commit\n"
          "\nFichiers en ecart :\n" + ecarts)
    sys.exit(1)

print("test_dist_a_jour: OK")
