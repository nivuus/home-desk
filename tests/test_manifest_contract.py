#!/usr/bin/env python3
"""Le manifeste doit passer le parseur du moteur, pas une relecture locale.

NIVUUS_INSTALLER_DIR fait valider par installer/packages/manifest.py, qui fait
autorite.

home-desk est le CAS D'ECOLE de requires.packages, et le moteur le dit
lui-meme : la docstring de installer/packages/dependencies.py porte « Ce n'est
pas une hypothese : plan_packages() ordonne par sorted(selected), et
`home-desk` trie AVANT `home-manager`. L'ordre alphabetique est exactement le
mauvais. » Ce test est donc la verification de la verification.

Run: python3 tests/test_manifest_contract.py
     make test NIVUUS_INSTALLER_DIR=$HOME/Projects/Nivuus/packages/installer
"""
import os
import pathlib
import sys

import yaml

REPO = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = REPO / "nivuus-package.yaml"

failures = []


def check(label, got, want):
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")


data = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))

check("apiVersion", data.get("apiVersion"), "nivuus.dev/v1")
check("nom", data.get("name"), "home-desk")
check("tier", data.get("tier"), "userspace")

# LA declaration qui fait de ce package un satellite, et le cas qui a motive
# le champ : « home-desk » trie AVANT « home-manager » en alphabetique.
check("depend du socle", (data.get("requires") or {}).get("packages"),
      ["home-manager"])

# home-stock n'y est PAS (decision 8) : la dependance passe par le bus, jamais
# par un import. C'est une dependance d'execution, pas d'installation.
check("ne force pas home-stock",
      "home-stock" in ((data.get("requires") or {}).get("packages") or []),
      False)

check("aucun bloc platform", "platform" in data, False)
check("aucun claim", "claims" in data, False)

# Ni apt ni wizard : l'application est du JavaScript servi par Home Assistant,
# et vignette/manifest.json declare requirements: []. Le bundle etant versionne
# (decision 2), Node n'est pas requis sur la cible.
check("aucune dependance apt", "apt" in data, False)
check("aucun wizard", "wizard" in data, False)

check("hook install", (data.get("hooks") or {}).get("install"),
      "hooks/install.py")
check("pas de hook activate", "activate" in (data.get("hooks") or {}), False)
check("pas de hook resolve", "resolve" in (data.get("hooks") or {}), False)

# Decision 4 : le package est propre a cette maison, et il doit l'AVOUER.
# Un package qui se pretend generique et ne l'est pas produit chez un tiers un
# ecran d'entites inexistantes, sans message.
label = data.get("label") or ""
if "maison" not in label.lower():
    failures.append(f"label: {label!r} ne dit pas que ce package est propre "
                    "a cette maison (decision 4)")

installer = os.environ.get("NIVUUS_INSTALLER_DIR")
if installer:
    sys.path.insert(0, str(pathlib.Path(installer) / "installer"))
    from packages.manifest import load_manifest

    manifest = load_manifest(str(MANIFEST))
    check("parseur du moteur: nom", manifest.name, "home-desk")
    check("parseur du moteur: dependance lue", manifest.packages,
          ("home-manager",))
    check("parseur du moteur: hook install resolu",
          manifest.hook_path("install").endswith("hooks/install.py"), True)
    check("parseur du moteur: aucun activate",
          manifest.hook_path("activate"), "")

    # Le tri topologique doit placer le socle AVANT ce package — contre
    # l'ordre alphabetique, qui est ici exactement le mauvais.
    from packages.dependencies import install_order

    socle = load_manifest(str(pathlib.Path(installer).parent
                              / "home-manager" / "nivuus-package.yaml"))
    ordre = [m.name for m in install_order([manifest, socle])]
    check("tri topologique", ordre, ["home-manager", "home-desk"])
else:
    print("NIVUUS_INSTALLER_DIR absent : verification locale seule")

if failures:
    print("\n".join(failures))
    sys.exit(1)
print("test_manifest_contract: OK")
