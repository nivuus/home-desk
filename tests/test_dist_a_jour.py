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

# Ronde de correction 1 (2026-09-13) — precondition AVANT tout `unlink`. Ce test reconstruit
# dist/ (il supprime les pages HTML puis relance le build) : lance sur un dist/ deja porteur de
# modifications non commitees, il les detruirait sans filet. Portee EXACTE : `dist` seul, pas
# `contrat` — la destruction n'existe que dans dist/, seul repertoire ou ce script `unlink`. Un
# contrat/ sale au depart ne perd rien ici : il tombe sur la verification finale plus bas, avec un
# message deja correct.
ecart_avant = subprocess.run(["git", "-C", str(REPO), "status", "--porcelain", "dist"],
                             capture_output=True, text=True, check=True).stdout.strip()
if ecart_avant:
    print("dist/ porte des modifications non commitees : ce test le RECONSTRUIT (il supprime\n"
          "les pages HTML puis relance le build) et ne peut donc pas tourner sur un dist/ deja\n"
          "modifie -- il detruirait ce qui n'est pas commite. Committez ou annulez ces\n"
          "changements d'abord.\n"
          "\nFichiers en ecart :\n" + ecart_avant)
    sys.exit(1)

# Les pages HTML sont supprimees du disque AVANT le build, sans quoi ce test ne prouve rien sur
# elles precisement. `npm run build` n'a jamais vide `dist/` : il ecrit les fichiers qu'on lui dit
# d'ecrire. Si un generateur (`scripts/generer-pages.mjs`) cessait de produire l'un d'eux, l'ancien
# fichier — deja commite — resterait tel quel sur le disque, identique au commit, donc invisible a
# la comparaison `git status` plus bas. En les retirant d'abord, un fichier non regenere ressort en
# suppression aux yeux de git, et le test echoue — c'est le comportement voulu. Trouve par mutation
# lors de la tache 6 (2026-09-13) : retirer le bloc qui emet `index.html` de `generer-pages.mjs`
# laissait ce test passer quand meme, tant que dist/ n'etait pas nettoye.
#
# Sure de le faire ICI, et seulement ici : la verification `ecart_avant` juste au-dessus vient de
# PROUVER que dist/ est identique au commit. Le `git checkout -- dist` de la restauration
# ci-dessous le ramene donc exactement a ce qu'il etait avant l'unlink, sans jamais rien detruire
# de reel — sans cette precondition, la meme commande aurait ete une SECONDE destruction sur un
# dist/ deja modifie par l'appelant. L'ordre compte : c'est la precondition qui rend la
# restauration sure, pas l'inverse.
try:
    for page_html in DIST.glob("*.html"):
        page_html.unlink()

    build = subprocess.run(["npm", "run", "build"], cwd=APP,
                           capture_output=True, text=True)
    if build.returncode != 0:
        print("le build a echoue :\n" + build.stderr)
        # dist/ est reconstructible depuis le commit (prouve par ecart_avant, plus haut) : on
        # restaure avant de sortir plutot que de laisser l'arbre sale sur un echec de build.
        subprocess.run(["git", "-C", str(REPO), "checkout", "--", "dist"], check=True)
        sys.exit(1)
except Exception:
    # Meme raisonnement pour toute exception levee entre l'unlink et la verification finale
    # (permission refusee, `npm` introuvable en cours de route, etc.) : on restaure, puis on
    # laisse l'exception remonter — ce test doit rester en echec, pas seulement l'arbre propre.
    subprocess.run(["git", "-C", str(REPO), "checkout", "--", "dist"], check=True)
    raise

# Rien ne restaure APRES ce point : un build qui reussit en produisant un resultat different du
# commit est exactement ce que la comparaison ci-dessous doit voir. Restaurer ici effacerait la
# preuve que ce test existe pour montrer.

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
