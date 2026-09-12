#!/usr/bin/env python3
"""Le composant embarque sa copie de contrat/, et elle ne doit jamais diverger.

Le composant tourne depuis config/custom_components/, d'ou il ne voit pas le
depot : il DOIT embarquer sa copie du contrat. Ce test est ce qui empeche les
deux exemplaires de diverger — sans lui, une mesure de hauteur republiee dans
contrat/budget.json n'atteindrait jamais le formulaire qui refuse une saisie,
et le composant validerait un ecran que l'application fait deborder.

Run: python3 tests/test_contrat_embarque.py
"""
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]

FICHIERS = ("budget.json", "icones.json", "ecran.schema.json")

source = REPO / "contrat"
embarque = REPO / "custom_components" / "home_desk" / "contrat"

failures = []

for nom in FICHIERS:
    s, e = source / nom, embarque / nom
    if not e.is_file():
        failures.append(f"{nom}: absent du composant — lancez `make contrat`")
        continue
    if s.read_bytes() != e.read_bytes():
        failures.append(f"{nom}: la copie embarquee DIFFERE de contrat/{nom} — "
                        "lancez `make contrat` et committez le resultat")

# README.md n'est PAS embarque : c'est de la prose pour un lecteur humain du
# depot, pas une donnee que le composant lit. L'embarquer ferait grossir chaque
# depot sans qu'aucune ligne de Python ne l'ouvre.
if (embarque / "README.md").exists():
    failures.append("README.md embarque sans lecteur : retirez-le")

if failures:
    print("\n".join(failures))
    sys.exit(1)
print("test_contrat_embarque: OK")
