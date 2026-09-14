"""JETABLE -- supprime a l'etape 8 de la mise en production (plan 3c, tache 10).

Rend le YAML d'import a partir du JSON produit par `exporter-ecrans.mjs`, PAR
`yaml_ecrans.rendre()` et jamais par un rendeur maison : le lecteur
(`yaml_ecrans.lire`, celui qu'utilise `home_desk.importer`) et l'ecrivain
doivent etre les deux moities du MEME module, sinon ils divergent le jour ou
l'un des deux apprend un cas que l'autre ignore.

`yaml_ecrans.py` n'importe que `yaml` : il se charge PAR SON CHEMIN, sans
passer par `custom_components/home_desk/__init__.py`, qui lui tire Home
Assistant en entier. python3 + PyYAML suffisent -- meme regime que `make test`.

Usage : python3 outils/rendre-ecrans-yaml.py <entree.json> <sortie.yaml>
"""
import importlib.util
import json
import pathlib
import sys

RACINE = pathlib.Path(__file__).resolve().parents[2]
CHEMIN = RACINE / "custom_components" / "home_desk" / "yaml_ecrans.py"

_spec = importlib.util.spec_from_file_location("yaml_ecrans", CHEMIN)
yaml_ecrans = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(yaml_ecrans)


def main(source: pathlib.Path, destination: pathlib.Path) -> int:
    ecrans = json.loads(source.read_text(encoding="utf-8"))
    texte = yaml_ecrans.rendre(ecrans)

    # L'ALLER-RETOUR, AVANT D'ECRIRE. `rendre` aplatit une note multiligne
    # (limitation documentee au plan 3a) et rien d'autre ne dit si un cas
    # limite est passe a travers. Relire avec le lecteur REEL de
    # `home_desk.importer` et comparer, c'est la seule verification qui a la
    # meme portee que l'import lui-meme.
    relu = yaml_ecrans.lire(texte)
    if relu != ecrans:
        # `zip` tronque en silence si les deux listes n'ont pas la meme longueur --
        # exactement le cas ou le diagnostic compte le plus (un ecran entier avale ou
        # duplique par l'aller-retour). Nommer d'abord ce qui manque d'un cote ou de
        # l'autre, avant la comparaison champ par champ sur ce qui s'apparie encore.
        if len(ecrans) != len(relu):
            noms_ecrits = {e.get("nom", "?") for e in ecrans}
            noms_relus = {e.get("nom", "?") for e in relu}
            print(
                f"ALLER-RETOUR ROMPU : {len(ecrans)} ecran(s) ecrit(s), "
                f"{len(relu)} relu(s).",
                file=sys.stderr,
            )
            absents_a_la_relecture = sorted(noms_ecrits - noms_relus)
            if absents_a_la_relecture:
                print(f"  absents a la relecture : {absents_a_la_relecture}", file=sys.stderr)
            en_trop_a_la_relecture = sorted(noms_relus - noms_ecrits)
            if en_trop_a_la_relecture:
                print(f"  en trop a la relecture : {en_trop_a_la_relecture}", file=sys.stderr)
        for attendu, obtenu in zip(ecrans, relu):
            for cle in sorted(set(attendu) | set(obtenu)):
                if attendu.get(cle) != obtenu.get(cle):
                    print(
                        f"ALLER-RETOUR ROMPU sur {attendu.get('nom', '?')}.{cle}\n"
                        f"  ecrit : {attendu.get(cle)!r}\n"
                        f"  relu  : {obtenu.get(cle)!r}",
                        file=sys.stderr,
                    )
        print("RIEN N'A ETE ECRIT.", file=sys.stderr)
        return 1

    destination.write_text(texte, encoding="utf-8")
    print(f"{len(ecrans)} ecrans rendus dans {destination} ({len(texte.splitlines())} lignes)")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])))
