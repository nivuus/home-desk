#!/usr/bin/env python3
"""Le hook depose trois choses, et n'abime rien de ce qu'il partage.

LE TEST LE PLUS IMPORTANT DE CE FICHIER est celui des occupants intacts.
`config/www/` porte douze occupants mesures le 2026-09-05 (community de HACS,
nivuus-panel, media, uploaded, deux sauvegardes datees...) et `config/packages/`
porte le fragment d'intents de `home-stock`. Un hook qui remplacerait l'un ou
l'autre repertoire detruirait le travail des autres integrations. Les occupants
sont COMPTES, jamais nommes : leur nombre bouge (neuf le 2026-08-29, onze le
2026-09-04, douze le 2026-09-05) et un test qui les nommerait casserait au
premier ajout.

Aucun test ne touche la production : --root pointe vers un repertoire temporaire.

Run: python3 tests/test_install_hook.py
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import threading

REPO = pathlib.Path(__file__).resolve().parents[1]
HOOK = REPO / "hooks" / "install.py"
CONFIG_REL = "opt/nivuus/home-manager/config"

failures = []


def check(label, got, want):
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")


def lancer(root, contexte=None):
    return subprocess.run(
        [sys.executable, str(HOOK), "--phase", "install", "--root", str(root)],
        input=json.dumps(contexte or {}), capture_output=True, text=True)


def socle(root, configuration=""):
    """Un socle minimal, avec ses repertoires partages deja peuples."""
    config = pathlib.Path(root) / CONFIG_REL
    (config / "www" / "community").mkdir(parents=True)
    (config / "www" / "nivuus-panel").mkdir()
    (config / "www" / "wifi-qrcode-card.js").write_text("// autrui")
    (config / "packages").mkdir()
    (config / "packages" / "home_stock_intents.yaml").write_text("intent_script: {}")
    (config / "custom_components").mkdir()
    (config / "configuration.yaml").write_text(configuration, encoding="utf-8")
    return config


# --- 1. Il refuse si le socle est absent -----------------------------------
with tempfile.TemporaryDirectory() as root:
    r = lancer(root)
    check("refus sans socle: code", r.returncode, 1)
    if "home-manager" not in r.stderr:
        failures.append(f"refus sans socle: stderr muet sur la cause: {r.stderr!r}")
    check("refus sans socle: rien de cree",
          (pathlib.Path(root) / CONFIG_REL).exists(), False)

# --- 2. Il depose les trois artefacts aux bons chemins ---------------------
with tempfile.TemporaryDirectory() as root:
    config = socle(root, "vignette:\npackages: !include_dir_named packages\n")
    r = lancer(root)
    check("depot: code", r.returncode, 0)
    check("bundle", (config / "www" / "wallpanel" / "wallpanel.js").is_file(), True)
    check("css", (config / "www" / "wallpanel" / "wallpanel.css").is_file(), True)
    check("page salon", (config / "www" / "wallpanel" / "salon.html").is_file(), True)
    check("assets", (config / "www" / "wallpanel" / "assets").is_dir(), True)
    check("vignette", (config / "custom_components" / "vignette"
                       / "__init__.py").is_file(), True)
    check("fragment", (config / "packages" / "home_desk.yaml").is_file(), True)

    # --- 3. Les repertoires PARTAGES sont intacts -------------------------
    check("occupants de www/ intacts", len(list((config / "www").iterdir())), 4)
    check("fragment d'autrui intact",
          (config / "packages" / "home_stock_intents.yaml").is_file(), True)
    check("occupants de packages/ intacts",
          len(list((config / "packages").iterdir())), 2)

    # --- 4. Idempotence ---------------------------------------------------
    r2 = lancer(root)
    check("idempotence: code", r2.returncode, 0)
    check("idempotence: occupants de www/",
          len(list((config / "www").iterdir())), 4)

    # --- 5. Un fichier obsolete disparait ---------------------------------
    perime = config / "www" / "wallpanel" / "perime.js"
    perime.write_text("// version precedente")
    lancer(root)
    check("fichier obsolete retire", perime.exists(), False)

    # --- 6. Silence quand les deux lignes sont declarees -------------------
    sortie = lancer(root).stdout
    if "vignette:" in sortie and "manque" in sortie.lower():
        failures.append("signale `vignette:` alors qu'elle est declaree")
    if "include_dir_named" in sortie:
        failures.append("signale `packages:` alors qu'elle est declaree")

# --- 7. Il SIGNALE les deux lignes manquantes, sans les ecrire -------------
with tempfile.TemporaryDirectory() as root:
    config = socle(root, "homeassistant:\n  name: Maison\n")
    r = lancer(root)
    check("signalement: code", r.returncode, 0)
    if "vignette:" not in r.stdout:
        failures.append("ne signale pas la ligne `vignette:` manquante")
    if "packages: !include_dir_named packages" not in r.stdout:
        failures.append("ne signale pas la ligne `packages:` manquante")
    check("configuration.yaml NON reecrit",
          (config / "configuration.yaml").read_text(encoding="utf-8"),
          "homeassistant:\n  name: Maison\n")
    # Le fragment est depose quand meme : c'est du texte inerte tant que rien
    # ne le charge, et son absence rendrait le signalement incomprehensible.
    check("fragment depose malgre tout",
          (config / "packages" / "home_desk.yaml").is_file(), True)

# --- 8. Une declaration vers un AUTRE repertoire ne compte pas -------------
with tempfile.TemporaryDirectory() as root:
    config = socle(root, "vignette:\npackages: !include_dir_named ailleurs\n")
    r = lancer(root)
    if "packages: !include_dir_named packages" not in r.stdout:
        failures.append("ne signale pas une declaration qui vise un AUTRE "
                        "repertoire que celui ou le fragment est depose")

# --- 9. Deux executions concurrentes ne s'entrelacent pas ------------------
with tempfile.TemporaryDirectory() as root:
    config = socle(root, "vignette:\npackages: !include_dir_named packages\n")
    resultats = []
    fils = [threading.Thread(target=lambda: resultats.append(lancer(root)))
            for _ in range(4)]
    for f in fils:
        f.start()
    for f in fils:
        f.join()
    check("concurrence: tous en succes",
          sorted(r.returncode for r in resultats), [0, 0, 0, 0])
    check("concurrence: bundle en place",
          (config / "www" / "wallpanel" / "wallpanel.js").is_file(), True)
    check("concurrence: vignette complete",
          (config / "custom_components" / "vignette" / "__init__.py").is_file(),
          True)

if failures:
    print("\n".join(failures))
    sys.exit(1)
print("test_install_hook: OK")
