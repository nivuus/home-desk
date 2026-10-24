# Sous-entrée maison et échelle de budget de la carte

## La sous-entrée maison

- `SUBENTRY_HOUSE = "maison"` (`custom_components/home_desk/const.py`). Une
  seule par installation : elle liste les sources média de la maison, chacune
  avec un champ `piece` **obligatoire** (`contrat/maison.schema.json`, miroir
  `schema._piece_requise`) : une source de la maison sans pièce ne dirait pas
  où elle joue. Sur les `sources` propres d'un écran, `piece` reste
  facultatif. Les écrans affichent une source qui joue ailleurs dans la
  maison.
- Flux de configuration : `HouseSubentryFlow` dans `maison.py`. Il passe par
  `formulaire.py` pour le formulaire et par `garde_ecran.persist_house_if_valid`
  pour l'écriture, jamais directement.
- Commande websocket `home_desk/maison` (module `websocket.py`).
- Contrat : `contrat/maison.schema.json` et le corpus `contrat/cas-maison.json`;
  miroir Python : `schema.validate_house`. Après toute modification :
  `make contrat`, puis committer la copie embarquée.
- Export/import YAML : le bloc `maison:` porte la maison. Un `maison:` absent
  à l'import SUPPRIME la maison.
- `garde_ecran.persist_house_if_valid` est le QUATRIÈME appelant légitime des
  portes d'écriture, après `persister_si_valide`, `importer_ecrans` et
  `migrate_subentry` (voir « Invariants du composant » dans `CLAUDE.md`).
- Le nom de la pièce vient de la configuration, jamais du code.

### Les appareils (version 2)

- `appareils: [{type, piece, entites, seuil?}]`, servis par `home_desk/maison`
  avec les sources (`{"sources", "appareils"}`) et portés par `s.house` côté
  tablette (`House`, `app/src/configuration.ts`).
- Les rôles requis et facultatifs de chaque `type` vivent UNE fois, dans les
  branches `if/then` de `$defs/appareil` (`contrat/maison.schema.json`).
  `appliances.py` construit le validateur voluptuous depuis ces branches et
  refuse à l'import toute construction qu'il ne sait pas refléter ; ajv lit le
  même fichier. Ne recopiez jamais la table ailleurs.
- Rôles listes (`ams` 4 au plus, `sondes`, `zones`, `niveaux`, ces trois
  derniers non vides) : des tableaux d'`entity_id` ; tous les autres, un seul.
- `seuil` : requis pour `air` et `encre`, **interdit** ailleurs (`not`), plutôt
  qu'ignoré : une valeur saisie pour rien serait un champ mort.
- `piece` : toute chaîne non vide, `"maison"` pour un appareil montré partout.
  Pas de contrôle contre une liste de pièces : la `piece` des sources ne l'a pas
  non plus, et aucune liste de pièces n'existe dans l'intégration.
- Pas de formulaire HA : les appareils s'écrivent par le YAML
  (`home_desk.exporter` / `home_desk.importer`). Le formulaire des sources
  réécrit `{**data, "sources": ...}`, donc conserve les appareils (gardé par
  `test_reconfiguring_sources_keeps_appliances`).
- Migration : `migration.migrate_house_data` (v1 -> v2, `appareils: []`), au
  chargement, par `garde_ecran.migrate_subentry`. Un `maison:` exporté avant la
  version 2 (sans `appareils`) est refusé à l'import, en nommant le champ.

## L'échelle de budget de la carte

Le budget reçoit un genre de bloc (`carte` 264 px, `haut` 153 px, `defaut`
84 px), plus un mode. Seul `carte` essaie dans l'ordre : composition complète, synthèse réduite,
synthèse réduite sans la rangée Ambiance.

- TypeScript : `app/src/screen-budget.ts`. Jumeau Python :
  `custom_components/home_desk/budget.py`.
- Corpus partagé `contrat/cas-budget.json`, lu par les deux suites.
- Hauteurs : `budget.json` -> `hauteurs` (`blocCarte`, `syntheseReduite`),
  mesurées par `app/outils/mesurer-carte-media.mjs`.
- La pile qui remplit ce bloc, ses cartes et son contrôle de rendu :
  `docs/claude/pile-de-cartes.md`.

## Teintes de la carte média

- `app/src/tones.ts` (calcul des teintes), `app/src/rendu/poster-sampler.ts`
  (échantillonnage de la vignette; les pixels ne sont lus QUE sur la vignette
  de `vignetter()`), `app/src/boot/card-tones.ts` (câblage au démarrage, for any image card since the card stack).
- Contrôle de rendu : `app/outils/verifier-carte-media.mjs` (mesures partagées
  avec la pile dans `app/outils/card-check.mjs`).
