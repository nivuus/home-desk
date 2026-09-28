# `contrat/` — ce que l'application et l'intégration partagent

Cinq fichiers, versionnés, lus des DEUX côtés : par `app/src/` en TypeScript,
et par `custom_components/home_desk/` en Python (plan 3). Le tableau
ci-dessous n'en nomme que trois — `budget.json`, `icones.json`,
`ecran.schema.json` ; les deux autres, `cas-budget.json` et
`cas-schema.json`, sont les corpus partagés décrits plus bas
(« Les deux tables de cas »), pas des règles.

| Fichier | Écrit par | Pourquoi il est ici |
|---|---|---|
| `budget.json` | à la main, sauf la clé `hauteurs` — mesurée par `app/outils/mesurer-hauteurs.mjs` dans un vrai navigateur, puis recopiée depuis sa sortie | La règle de `combien()` et ses mesures. L'intégration doit pouvoir dire « cet écran déborde » AU MOMENT DE LA SAISIE, donc elle doit rejouer la même règle. |
| `icones.json` | `app/scripts/generer-contrats.mjs` | Le formulaire doit proposer les icônes RÉELLES de l'application, pas une liste recopiée qui dérive. |
| `ecran.schema.json` | à la main, sauf l'`enum` de `$defs/bouton/properties/icone` — injecté par ce même générateur depuis `icones.json`, pour que le schéma ne puisse plus accepter une icône que l'application ne sait pas dessiner | Le schéma d'un écran. Deux implémentations (TypeScript, `voluptuous`), une seule vérité. |

**Rien de cette maison n'entre ici.** Pas d'`entity_id`, pas de nom de pièce :
ces fichiers partent chez toutes les maisons.

**`version`** est porté par `ecran.schema.json` (`"version": {"const": 2}`
depuis le 2026-09-28 — la version 2 retire les scènes d'animation codées en dur ;
`custom_components/home_desk/migration.py` réécrit au chargement les écrans
enregistrés en version 1),
dans l'intention qu'une configuration d'une `version` inconnue soit
refusée net, jamais rendue à moitié. **Le schéma tient déjà LA MOITIÉ de
cette garantie, mesuré à ajv** : une `version` PRÉSENTE mais différente
de `2` (`{version: 3}`, par exemple) est bien refusée par `const` — ce que
le schéma NE PEUT PAS faire, puisque `version` reste `Optional` (jamais
`required`) dans `ecran.schema.json`, c'est refuser une `version` ABSENTE
: un écran qui ne la porte pas du tout passe le schéma sans un mot.
**Cette seconde moitié est tenue depuis la tâche 8** (plan 3), par
l'intégration, pas par le contrat : `websocket._resoudre`
(`custom_components/home_desk/websocket.py`) refuse net de SERVIR un
écran dont la `version` diffère de `VERSION_CONFIG`, et
`garde_ecran.importer_ecrans` (tâche 9) POSE elle-même `VERSION_CONFIG`
quand un écran importé ne porte pas `version`, plutôt que de la laisser
absente jusqu'à la lecture. `version` reste `Optional` délibérément : le
contrat ne valide qu'un écran À LA FOIS, il n'a aucune notion de « la
version que CE composant reconnaît aujourd'hui » (une propriété de
l'intégration qui l'exécute, pas de la forme de l'écran) — seule
l'intégration peut porter cette seconde moitié de la garantie.

## Ce que le schéma ne vérifie PAS

`ecran.schema.json` prouve la FORME d'un écran, pas toutes ses dépendances
entre champs. JSON Schema sait exprimer ce genre de règle (`if`/`then`,
comme `synthese.allOf` le fait déjà pour `operateur`/`valeur`) — c'est ce que
l'`allOf` racine fait désormais pour `blocDefaut: "voiture"` → `voiture`,
pour `modes` contenant `"minuteur"` → `minuteurs` non vide (plan 2, tâche 6),
et pour `modes` contenant `"alerte"` → `alerte` EN PREMIÈRE POSITION
(relecture finale de branche, deuxième ronde — `prefixItems` conditionnel,
vérifié à ajv ; `contrat/cas-schema.json` en porte un cas partagé). La dette
qui restait de ce genre (`version` ni `required` ni lue) est tenue depuis
la tâche 8, voir ci-dessus.

**Ce qui reste hors de portée du schéma, structurellement, pas par
oubli** : `agencement.modulateurs` est NORMALISÉ en ensemble trié côté
Python (`schema._trie()`, relecture finale de branche, deuxième ronde —
« un diff d'export ne doit pas bouger pour un réordonnancement sans
effet ») mais ce N'EST PAS une règle de VALIDATION que JSON Schema (ou
ajv) pourrait exprimer : un schéma valide une forme, il ne transforme
jamais la donnée qu'il valide. Il n'existe donc, et ne peut exister,
aucun équivalent TypeScript de ce tri — sans conséquence pratique
aujourd'hui, puisque `app/src/` ne fait jamais que LIRE des `modulateurs`
déjà écrits (par HA ou à la main dans `ecran.ts`), jamais les
reconstruire.

## Ce répertoire est copié dans le composant

`custom_components/home_desk/contrat/` en porte un double **octet pour octet**,
parce que le composant tourne depuis `config/custom_components/` et n'a aucun
chemin vers ce dépôt. `make contrat` le regénère, `make test` refuse de passer
si les deux divergent.

`README.md` n'y est pas : aucune ligne de Python ne l'ouvre.

**Après toute modification d'un fichier de ce répertoire : `make contrat`, et
committez le résultat.** Sans ce geste, la mesure que vous venez de publier
n'atteint pas le formulaire qui s'en sert pour refuser une saisie.

## Les deux tables de cas

`cas-budget.json` (tâche 4) est un corpus de vérité pour le budget de hauteur : chaque cas donne
un mode, une rangée d'ambiance, des zones (`null` = les quatre du défaut) et une hauteur utile, et
attend un nombre de commandes et un débordement en pixels. Il est lu par deux suites :

- `app/tests/cas-budget.test.ts`, qui rejoue chaque cas avec `combien()` et `verifierBudget()`
  (`app/src/modes.ts`) ;
- `tests/composant/test_budget.py`, qui rejoue le même cas avec le miroir Python `combien()` et
  `verifier_budget()` (`custom_components/home_desk/budget.py`).

Les vingt-deux cas sont sur-déterminés : onze restes mesurés dans un vrai navigateur, prédits
exactement, une corroboration à 630 px sur une mesure du 2026-08-03 antérieure au modèle, et
quatre cas à zones omises qu'aucun des trois écrans réels de la maison n'exerce aujourd'hui — les
premiers que le formulaire de l'intégration rencontrera quand quelqu'un réordonnera ses zones
depuis Home Assistant. Un terme retiré d'un seul côté de l'addition doit casser UNE des deux
suites, jamais les deux : c'est ce que ce corpus garde, pas seulement le résultat final.

`cas-schema.json` (tâche 3) est un corpus de conformité pour `ecran.schema.json` :
un écran `minimal`, et une liste de `cas` qui le modifient — chacun disant s'il
doit rester valide, et pour un cas invalide, **le motif exact attendu**
(`chemin: mot-clé`, au vocabulaire de JSON Schema — `type`, `minimum`,
`pattern`, `enum`, `additionalProperties`, `required`, `contains`).

Il est lu par DEUX suites, et c'est tout ce qu'il garantit :

- `app/tests/cas-schema.test.ts`, qui rejoue chaque cas avec `ajv` ;
- `tests/composant/test_schema.py`, qui rejoue le même cas avec le miroir
  `voluptuous` (`custom_components/home_desk/schema.py`).

Un cas invalide qui n'assertirait que le refus (et pas le motif) passerait
pour la mauvaise raison — n'importe quelle autre faute du même objet
suffirait à le faire réussir. C'est ce que `motif()` (côté `voluptuous`) et
`motifs()` (côté `ajv`, dans le test vitest) existent pour empêcher : les deux
doivent nommer LE MÊME endroit, pas seulement refuser.

**Ce fichier vit dans `contrat/`, et nulle part ailleurs.** Posé dans
`app/tests/`, il serait invisible à `pytest` ; posé dans `tests/composant/`,
invisible à `vitest`. `contrat/` est le seul répertoire que les deux suites
regardent — c'est ce qui rend un cas présent d'un côté et absent de l'autre
tout simplement impossible : c'est le même fichier, chargé deux fois par deux
lecteurs différents, jamais recopié.

Comme les autres fichiers de ce répertoire, il est **inventé** : aucun
écran de `cas-schema.json` ne décrit une pièce ou une entité de cette maison.
Même règle pour `cas-budget.json` juste au-dessus : aucun de ses vingt-deux
cas ne porte de mode, de hauteur ou de zone propre à un écran réel de cette
maison — seulement des valeurs choisies pour exercer la règle.
