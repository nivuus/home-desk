"""THROWAWAY -- deleted at step 8 of the production rollout (plan 3c, task 10).

Renders the import YAML from the JSON produced by `exporter-ecrans.mjs`, THROUGH
`yaml_ecrans.rendre()` and never through a homemade renderer: the reader
(`yaml_ecrans.lire`, the one `home_desk.importer` uses) and the writer
must be the two halves of the SAME module, otherwise they diverge the day
one of them learns a case the other ignores.

`yaml_ecrans.py` imports only `yaml`: it is loaded BY ITS PATH, without
going through `custom_components/home_desk/__init__.py`, which pulls in the
whole of Home Assistant. python3 + PyYAML are enough -- same regime as `make test`.

Usage: python3 outils/rendre-ecrans-yaml.py <input.json> <output.yaml>
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

    # THE ROUND TRIP, BEFORE WRITING. `rendre` flattens a multi-line note
    # (limitation documented in plan 3a) and nothing else says whether an edge
    # case slipped through. Reading back with the REAL reader of
    # `home_desk.importer` and comparing is the only check that has the
    # same reach as the import itself.
    relu = yaml_ecrans.lire(texte)
    if relu != ecrans:
        # `zip` truncates silently if the two lists do not have the same length --
        # exactly the case where the diagnostic matters most (a whole screen swallowed or
        # duplicated by the round trip). First name what is missing on one side or the
        # other, before the field-by-field comparison on what still pairs up.
        if len(ecrans) != len(relu):
            noms_ecrits = {e.get("nom", "?") for e in ecrans}
            noms_relus = {e.get("nom", "?") for e in relu}
            print(
                f"ROUND TRIP BROKEN: {len(ecrans)} screen(s) written, "
                f"{len(relu)} read back.",
                file=sys.stderr,
            )
            absents_a_la_relecture = sorted(noms_ecrits - noms_relus)
            if absents_a_la_relecture:
                print(f"  missing on read-back: {absents_a_la_relecture}", file=sys.stderr)
            en_trop_a_la_relecture = sorted(noms_relus - noms_ecrits)
            if en_trop_a_la_relecture:
                print(f"  extra on read-back: {en_trop_a_la_relecture}", file=sys.stderr)
        for attendu, obtenu in zip(ecrans, relu):
            for cle in sorted(set(attendu) | set(obtenu)):
                if attendu.get(cle) != obtenu.get(cle):
                    print(
                        f"ROUND TRIP BROKEN on {attendu.get('nom', '?')}.{cle}\n"
                        f"  written: {attendu.get(cle)!r}\n"
                        f"  read:    {obtenu.get(cle)!r}",
                        file=sys.stderr,
                    )
        print("NOTHING WAS WRITTEN.", file=sys.stderr)
        return 1

    destination.write_text(texte, encoding="utf-8")
    print(f"{len(ecrans)} screens rendered into {destination} ({len(texte.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])))
