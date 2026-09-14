#!/usr/bin/env python3
"""JETABLE -- part a la tache 10 du plan 3c.

Niveau 2 de la preuve de migration. 286 lignes de commentaire ne se comparent
a rien : elles se DENOMBRENT. Ce test verifie que le registre est EXHAUSTIF
(chaque plage a exactement un verdict), que les verdicts sont des trois mots
autorises, et qu'aucune plage classee `orpheline` ne l'est sans raison.

C'est le seul endroit du chantier ou une perte serait SILENCIEUSE : une donnee
perdue casse un test, un raisonnement perdu ne casse rien.

NE PAS AJOUTER A `make test` (etape 5 de la tache 4, plan 3c) : les cinq
scripts de la boucle du Makefile couvrent le PACKAGE et survivent a
l'installation ; celui-ci importe `ECRANS` en filigrane (il lit `ecran.ts` et
son registre de verdicts) et part avec l'outil d'export a la tache 10. Un
`make test` qui passerait de 5 a 6 scripts pour revenir a 5 raconterait une
histoire fausse dans deux rapports. Il se lance a la main :

    python3 tests/test_registre_commentaires.py

python3 + bibliotheque standard seulement, comme toute la suite `make test` --
ce regime existe pour que ces scripts tournent sur la cible d'installation,
qui n'a rien d'autre.
"""
import pathlib
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
VERDICTS = RACINE / "app" / "outils" / "verdicts-commentaires.tsv"
SOURCE = RACINE / "app" / "src" / "ecran.ts"
VERDICTS_AUTORISES = {"attachee", "type", "orpheline"}


def plages(texte: str) -> list[int]:
    """Les lignes de DEBUT de chaque plage de commentaire. Un scanner de
    dix lignes, pas un parseur TypeScript : il suffit de compter les MEMES
    plages que `exporter-ecrans.mjs`, et le test de comptage ci-dessous
    echoue bruyamment si les deux divergent."""
    debuts, dans_bloc = [], False
    for numero, ligne in enumerate(texte.splitlines(), start=1):
        nu = ligne.strip()
        if dans_bloc:
            if "*/" in nu:
                dans_bloc = False
            continue
        if nu.startswith("/*"):
            debuts.append(numero)
            dans_bloc = "*/" not in nu
        elif nu.startswith("//"):
            debuts.append(numero)
    return debuts


def main() -> int:
    lignes = [
        l for l in VERDICTS.read_text(encoding="utf-8").splitlines()
        if l.strip() and not l.startswith("#")
    ]
    classees = {}
    for l in lignes:
        debut, verdict = l.split("\t", 1)
        classees[int(debut)] = verdict

    attendues = set(plages(SOURCE.read_text(encoding="utf-8")))
    manquantes = sorted(attendues - set(classees))
    en_trop = sorted(set(classees) - attendues)
    sans_raison = sorted(
        d for d, v in classees.items()
        if v.split(":")[0] == "orpheline" and len(v.split(":", 1)[1].strip()) < 10
    )
    inconnus = sorted(d for d, v in classees.items() if v.split(":")[0] not in VERDICTS_AUTORISES)

    for titre, liste in (
        ("plages SANS verdict", manquantes),
        ("verdicts sans plage correspondante", en_trop),
        ("orphelines SANS raison (>= 10 caracteres exiges)", sans_raison),
        ("verdicts hors des trois autorises", inconnus),
    ):
        if liste:
            print(f"ECHEC -- {titre} : {liste}", file=sys.stderr)

    if manquantes or en_trop or sans_raison or inconnus:
        return 1

    comptes = {v: 0 for v in VERDICTS_AUTORISES}
    for v in classees.values():
        comptes[v.split(":")[0]] += 1
    total = len(attendues)
    assert sum(comptes.values()) == total, "la somme des verdicts doit egaler le nombre de plages"
    print(f"OK -- {total} plages = " + " + ".join(f"{n} {v}" for v, n in sorted(comptes.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
