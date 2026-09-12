# `contrat/` — ce que l'application et l'intégration partagent

Trois fichiers, versionnés, lus des DEUX côtés : par `app/src/` en TypeScript,
et par `custom_components/home_desk/` en Python (plan 3).

| Fichier | Écrit par | Pourquoi il est ici |
|---|---|---|
| `budget.json` | à la main, sauf la clé `hauteurs` — mesurée par `app/outils/mesurer-hauteurs.mjs` dans un vrai navigateur, puis recopiée depuis sa sortie | La règle de `combien()` et ses mesures. L'intégration doit pouvoir dire « cet écran déborde » AU MOMENT DE LA SAISIE, donc elle doit rejouer la même règle. |
| `icones.json` | `app/scripts/generer-contrats.mjs` | Le formulaire doit proposer les icônes RÉELLES de l'application, pas une liste recopiée qui dérive. |
| `ecran.schema.json` | à la main, sauf l'`enum` de `$defs/bouton/properties/icone` — injecté par ce même générateur depuis `icones.json`, pour que le schéma ne puisse plus accepter une icône que l'application ne sait pas dessiner | Le schéma d'un écran. Deux implémentations (TypeScript, `voluptuous`), une seule vérité. |

**Rien de cette maison n'entre ici.** Pas d'`entity_id`, pas de nom de pièce :
ces fichiers partent chez toutes les maisons.

**`version`** est porté par chaque fichier, dans l'intention qu'une
configuration d'une `version` inconnue soit un jour refusée net, jamais
rendue à moitié. **Cette garantie n'est pas encore tenue** : `version` n'est
lu par aucun code de `app/src/`, et il n'est même pas `required` dans
`ecran.schema.json`. Elle sera tenue par la résolution côté intégration
(plan 3), au moment où celle-ci validera un écran avant de l'appliquer — pas
avant, et pas ici.

## Ce que le schéma ne vérifie PAS

`ecran.schema.json` prouve la FORME d'un écran, pas toutes ses dépendances
entre champs. JSON Schema sait exprimer ce genre de règle (`if`/`then`,
comme `synthese.allOf` le fait déjà pour `operateur`/`valeur`), mais chacune
des trois ci-dessous demande un travail de conception à part — elles
appartiennent au plan suivant, pas à celui-ci. Ce sont de vraies dettes,
consignées ici parce que le seul lecteur futur de ces fichiers est
l'implémenteur Python du plan 3, et qu'un journal de travail ne part pas
avec le dépôt :

- **`blocDefaut: "voiture"` n'exige pas l'objet `voiture`.** Un écran peut
  déclarer `blocDefaut: "voiture"` à la racine sans déclarer `voiture` du
  tout ; rien dans le schéma ne relie les deux.
- **`"minuteur"` dans `agencement.modes` n'exige pas `minuteurs` non vide.**
  Un agencement peut lister le mode `minuteur` sans qu'aucun minuteur ne
  soit déclaré pour l'écran.
- **`version` n'est ni `required` ni lu**, voir ci-dessus.
