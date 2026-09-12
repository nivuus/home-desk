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

# `contrat/icones.json`, et depuis peu le champ icone de `contrat/ecran.schema.json`, sont
# produits par ce meme build (npm run contrats) et lus par l'integration Home Assistant.
# `contrat/budget.json` et le reste de `ecran.schema.json` sont ecrits a la main : ce build ne
# les regenere jamais (cf. contrat/README.md). On surveille quand meme les DEUX repertoires ici,
# pour la meme raison qu'on surveille `dist` : un oubli de `git add` sur l'un ou l'autre laisse
# un fichier commite en retard sur ce que `app/src/` decrit. Un contrat perime (icones) est pire
# qu'un bundle perime : il ferait proposer a l'operateur des icones que l'application ne sait
# plus dessiner.
ecarts = subprocess.run(["git", "-C", str(REPO), "status", "--porcelain", "dist", "contrat"],
                        capture_output=True, text=True, check=True).stdout.strip()
if ecarts:
    print("dist/ ou contrat/ ne correspond PAS a app/src/ commite.\n"
          "Soit le build vient de produire un resultat different de ce qui est\n"
          "versionne (dist/, ou la part generee de contrat/ : icones.json et le\n"
          "champ icone de ecran.schema.json), soit un changement a la main dans\n"
          "budget.json ou ecran.schema.json n'a pas ete committe — ce test ne\n"
          "distingue pas les deux, il verifie seulement qu'il ne reste rien en\n"
          "ecart. Reconstruire et tout committer :\n"
          "    cd app && npm run build && cd .. && git add dist contrat && git commit\n"
          "\nFichiers en ecart :\n" + ecarts)
    sys.exit(1)

print("test_dist_a_jour: OK")
