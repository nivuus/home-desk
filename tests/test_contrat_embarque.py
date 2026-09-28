#!/usr/bin/env python3
"""Le composant embarque sa copie de contrat/, et elle ne doit jamais diverger.

Le composant tourne depuis config/custom_components/, d'ou il ne voit pas le
depot : il DOIT embarquer sa copie du contrat. Ce test est ce qui empeche les
deux exemplaires de diverger — sans lui, une mesure de hauteur republiee dans
contrat/budget.json n'atteindrait jamais le formulaire qui refuse une saisie,
et le composant validerait un ecran que l'application fait deborder.

FICHIERS vient d'un glob sur contrat/*.json, comme la boucle
`for f in $(PACKAGE_DIR)/contrat/*.json` de la cible `contrat` du Makefile :
une enumeration recopiee a la main dans les deux fichiers divergerait en
silence des qu'un fichier est ajoute a contrat/ (prouve par mutation —
ajouter un fichier sans lancer `make contrat` doit faire tomber ce test EN LE
NOMMANT, pas passer 5/5 sans rien dire).

Run: python3 tests/test_contrat_embarque.py
"""
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parents[1]

source = REPO / "contrat"
embarque = REPO / "custom_components" / "home_desk" / "contrat"

# pathlib.Path.glob("*.json") reprend les fichiers caches (contrairement au
# module glob.glob) ; le shell du Makefile (dash, sans dotglob) ne les voit
# JAMAIS. Sans ce filtre, un ".x.json" ferait tomber ce test avec un message
# qui ment : `make contrat` ne le reparerait jamais, son glob shell ne le
# voyant pas. On aligne donc explicitement les deux ensembles.
FICHIERS = sorted(
    p.name for p in source.glob("*.json") if not p.name.startswith(".")
)

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
# depot sans qu'aucune ligne de Python ne l'ouvre. Le glob ci-dessus ne peut
# plus le capturer cote source (il ne matche que *.json), mais ce garde-fou
# reste utile independamment de `make contrat` : rien n'empeche une copie
# manuelle du fichier dans l'arbre embarque.
if (embarque / "README.md").exists():
    failures.append("README.md embarque sans lecteur : retirez-le")

if failures:
    print("\n".join(failures))
    sys.exit(1)
print("test_contrat_embarque: OK")
