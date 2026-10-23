# Sous-entrée maison et échelle de budget des modes média

## La sous-entrée maison

- `SUBENTRY_HOUSE = "maison"` (`custom_components/home_desk/const.py`). Une
  seule par installation : elle liste les sources média de la maison, chacune
  avec un champ optionnel `piece`. Les écrans affichent une source qui joue
  ailleurs dans la maison.
- Flux de configuration : `HouseSubentryFlow` dans `maison.py`. Il passe par
  `formulaire.py` pour le formulaire et par `garde_ecran.persist_house_if_valid`
  pour l'écriture, jamais directement.
- Commande websocket `home_desk/maison` (module `websocket.py`).
- Contrat : `contrat/maison.schema.json` et le corpus `contrat/cas-maison.json`;
  miroir Python : `schema.validate_house`. Après toute modification :
  `make contrat`, puis committer la copie embarquée.
- Export/import YAML : le bloc `maison:` porte la maison. Un `maison:` absent
  à l'import SUPPRIME la maison.
- `garde_ecran.persist_house_if_valid` est le TROISIÈME appelant légitime des
  portes d'écriture (voir « Invariants du composant » dans `CLAUDE.md`).
- Le nom de la pièce vient de la configuration, jamais du code.

## L'échelle de budget des modes à bloc média

Les modes listés dans `contrat/budget.json` -> `modesABlocMedia` (`media`,
`cinema`) essaient dans l'ordre : composition complète, synthèse réduite,
synthèse réduite sans la rangée Ambiance.

- TypeScript : `app/src/screen-budget.ts`. Jumeau Python :
  `custom_components/home_desk/budget.py`.
- Corpus partagé `contrat/cas-budget.json`, lu par les deux suites.
- Hauteurs : `budget.json` -> `hauteurs` (`blocMedia`, `syntheseReduite`),
  mesurées par `app/outils/mesurer-carte-media.mjs`.

## Teintes de la carte média

- `app/src/tones.ts` (calcul des teintes), `app/src/rendu/poster-sampler.ts`
  (échantillonnage de la vignette; les pixels ne sont lus QUE sur la vignette
  de `vignetter()`), `app/src/boot/media-tones.ts` (câblage au démarrage).
- Contrôle de rendu : `app/outils/verifier-carte-media.mjs`.
