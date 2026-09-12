"""libelles.py affirme dans sa propre docstring qu'il RELIT la MEME source que
le frontend (`translations/*.json`), "jamais une seconde table qui pourrait
diverger". Ronde 3 de relecture (point 3) : cette these n'etait gardee par
aucun test — remplacer le corps de `section()` par un dictionnaire fige en
dur laissait 154/154 verts. Meme idiome que `test_schema_lit_reellement_
son_contrat_embarque` (schema.py) et `test_budget_lit_reellement_son_contrat_
embarque` (budget.py) : on espionne `pathlib.Path.read_text` et on verifie
qu'un appel reel declenche une lecture sous CHEMIN_TRADUCTIONS, pas un retour
calcule sans jamais toucher le disque."""
import pathlib

from custom_components.home_desk import libelles


def test_libelles_section_lit_reellement_les_traductions_embarquees(monkeypatch):
    """Contrairement a schema.py/budget.py (lus a l'IMPORT), libelles.py lit a
    l'APPEL (`_traductions()` est invoquee depuis `section()`/`mode()`, pas au
    chargement du module) : pas besoin d'`importlib.reload`, un espionnage le
    temps de l'appel suffit a prouver la lecture reelle."""
    chemins_lus = []
    lire_original = pathlib.Path.read_text

    def lire_espion(self, *args, **kwargs):
        if self.suffix == ".json":
            chemins_lus.append(pathlib.Path(self))
        return lire_original(self, *args, **kwargs)

    monkeypatch.setattr(pathlib.Path, "read_text", lire_espion)

    class _ConfigFactice:
        language = "en"

    class _HassFactice:
        config = _ConfigFactice()

    rendu = libelles.section(_HassFactice(), "agencement")

    assert rendu == "Blocks and modes"
    assert chemins_lus, "aucune lecture JSON detectee lors de l'appel a section()"
    for chemin in chemins_lus:
        assert chemin.resolve().is_relative_to(libelles.CHEMIN_TRADUCTIONS.parent), (
            f"libelles.section() a lu {chemin}, hors de {libelles.CHEMIN_TRADUCTIONS.parent} : "
            "une these de lecture embarquee qui n'est pas gardee n'est qu'une affirmation."
        )
    assert any(chemin.name == "en.json" for chemin in chemins_lus), (
        "section() avec langue 'en' doit lire translations/en.json, pas une autre table."
    )


def test_libelles_mode_lit_reellement_les_traductions_embarquees(monkeypatch):
    """Meme garde que ci-dessus, pour `mode()` : les deux fonctions publiques
    du module doivent chacune passer par une lecture reelle, pas seulement
    l'une d'elles."""
    chemins_lus = []
    lire_original = pathlib.Path.read_text

    def lire_espion(self, *args, **kwargs):
        if self.suffix == ".json":
            chemins_lus.append(pathlib.Path(self))
        return lire_original(self, *args, **kwargs)

    monkeypatch.setattr(pathlib.Path, "read_text", lire_espion)

    class _ConfigFactice:
        language = "fr"

    class _HassFactice:
        config = _ConfigFactice()

    rendu = libelles.mode(_HassFactice(), "minuteur")

    assert rendu == "Minuteur"
    assert chemins_lus, "aucune lecture JSON detectee lors de l'appel a mode()"
    assert any(chemin.name == "fr.json" for chemin in chemins_lus), (
        "mode() avec langue 'fr' doit lire translations/fr.json, pas une autre table."
    )
