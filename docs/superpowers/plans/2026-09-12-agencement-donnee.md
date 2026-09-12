# L'agencement devient une donnée — plan d'implémentation (2/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire passer dans la donnée les quatre réglages d'agencement que le code tient aujourd'hui en dur — l'ordre des zones, le contenu du bloc central par défaut, quels modes vivent sur l'écran et dans quel ordre de priorité — sans changer d'un pixel ce que les trois tablettes affichent.

**Architecture:** Un type `Agencement` entre dans `Ecran` ; les trois écrans déclarent explicitement ce qui était jusqu'ici *déduit* de la présence d'une donnée. `modePrincipal()` garde ses conditions en TypeScript et perd sa hiérarchie, qui devient une liste ordonnée. `rendreCorps()` cesse d'écrire sa composition dans son gabarit `lit` et parcourt une table `zone → fonction`. Enfin, `hauteurUtile` — ajouté au plan 1 mais lu par personne — est câblé jusqu'à `combien()`, et l'asymétrie que la relecture finale du plan 1 avait signalée est refermée : le rendu ne lève plus, la validation devient une fonction à part.

**Tech Stack:** TypeScript 5.3, `lit` 3, vitest 2.1, rollup 4, `ajv` 8.20, Node ≥ 20.

**Spec:** `docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md` (décision 3 : palette fermée, agencement ouvert ; décision 4 : le budget devient une propriété de l'écran).

**Plan précédent :** `docs/superpowers/plans/2026-09-12-contrats-partages.md`, fusionné dans `main` à `693196d`.

## Global Constraints

- **`dist/` est versionné** et doit correspondre à `app/src/` à chaque commit. Toute modification de `app/src/` exige `cd app && npm run build`, puis `git add dist`. `tests/test_dist_a_jour.py` le vérifie, et couvre aussi `contrat/`.
- **`make test` reste en `python3` + PyYAML seulement.** Sa raison d'être est de tourner sur la cible d'installation, qui n'a rien d'autre.
- **Aucune régression d'affichage.** Point de départ : **936 tests vitest** (44 fichiers), `make test` 4/4, `tsc --noEmit` propre. Un test dont la valeur attendue change est un échec du plan, pas un ajustement.
- **Les conditions des modes restent en TypeScript.** Seuls leur ORDRE et leur ACTIVATION deviennent des données. Rendre les conditions configurables serait écrire un langage de règles, et c'est explicitement hors périmètre (spec, « Ce qu'on ne construit pas »).
- **Rien de cette maison n'entre dans `contrat/`** : pas d'`entity_id`, pas de nom de pièce, pas d'URL.
- **Le budget de référence est 585 px**, viewport `343×585`. Les hauteurs vivent dans `contrat/budget.json`, mesurées, et ne se réinventent pas.

## Deux vocabulaires nommés « zone » — à ne pas confondre

C'est le piège principal de ce plan.

| | Les **zones d'agencement** (ce plan) | Les **`data-zone`** (plan 1, mesure) |
|---|---|---|
| Où | `contrat/ecran.schema.json`, `$defs/agencement.zones` | attribut DOM dans `app/src/rendu/` |
| Combien | **4** : `synthese`, `blocCentral`, `ambiances`, `commandes` | **7** : + `bandeau`, `etiquetteAmbiance`, `touteLaMaison` |
| À quoi ça sert | décider l'ORDRE des blocs mobiles | mesurer les hauteurs, lu par `outils/mesurer-hauteurs.mjs` |

Les trois `data-zone` en trop ne sont pas un oubli : **`bandeau` et `touteLaMaison` sont fixes** — le bandeau est la barre d'état, « Toute la maison » est collé en bas par `margin-top: auto` — et **`etiquetteAmbiance` appartient à la zone `ambiances`**, dont elle est le titre. Les déplacer n'a pas de sens et coûterait un cas de plus au moteur.

**Ne renomme ni ne déplace aucun `data-zone`.** `contrat/budget.json` et `outils/mesurer-hauteurs.mjs` en dépendent, et `make test` le vérifie.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `app/src/agencement.ts` *(créé)* | Le type `Agencement`, le défaut, et `resoudreAgencement()`. Module PUR, sans import de rendu ni d'état — comme `modes.ts`. | 1 |
| `app/src/ecran.ts` | `Ecran.agencement?`, et les trois déclarations explicites | 1 |
| `app/src/modes.ts` | `CONDITIONS`, `modePrincipal()` sans hiérarchie, `modulateursActifs()` filtré, `combien()` qui honore `hauteurUtile`, `verifierBudget()` | 2, 4, 5 |
| `app/src/rendu/corps.ts` | `rendreCorps()` en assembleur, table `ZONES` | 3 |
| `app/src/demarrage.ts` | Résout l'agencement une fois, le recopie dans `ContexteModes` | 1, 2, 4 |
| `contrat/ecran.schema.json` | Les deux invariants croisés | 6 |
| `app/tests/agencement.test.ts` *(créé)* | Résolution, défauts, équivalence avec la déduction d'aujourd'hui | 1 |

`agencement.ts` est un fichier neuf plutôt qu'un ajout à `ecran.ts` : ce dernier porte déjà 515 lignes et sa vocation est de déclarer la maison, pas de calculer. `modes.ts` établit le précédent — les fonctions pures vivent à part et ne lisent jamais un écran elles-mêmes.

---

### Task 1: `Agencement` entre dans le type, et les trois écrans le déclarent

Aucun code ne lit encore ce champ à la fin de cette tâche. C'est voulu : la donnée arrive d'abord, les consommateurs suivent. Le rendu est strictement inchangé.

**Files:**
- Create: `app/src/agencement.ts`
- Create: `app/tests/agencement.test.ts`
- Modify: `app/src/ecran.ts` (le type `Ecran`, et les trois objets `ECRANS`)

**Interfaces:**
- Consumes: `ModePrincipal` et `Modulateur` (`app/src/modes.ts`), déjà exportés.
- Produces :
  ```typescript
  export type Zone = 'synthese' | 'blocCentral' | 'ambiances' | 'commandes';
  export type BlocDefaut = 'voiture' | 'repas' | 'agenda';
  export type Agencement = {
    zones: Zone[];
    modes: ModePrincipal[];      // actifs, dans l'ordre de priorité
    modulateurs: Modulateur[];   // actifs ; cumulatifs, donc sans ordre
    blocDefaut?: BlocDefaut;
    note?: string;
  };
  export const AGENCEMENT_DEFAUT: Agencement;
  export function resoudreAgencement(ecran: Ecran): Agencement;
  ```
  et sur `Ecran` : `agencement?: Agencement;`

> `BlocDefaut` ne porte que trois valeurs, comme `Ecran.blocDefaut` aujourd'hui. Le schéma en accepte cinq sur `agencement.blocDefaut` (`entretien`, `previsions` en plus) : ce sont des valeurs PROSPECTIVES que le rendu ne sait pas encore produire. Ne les ajoute pas au type TypeScript — le plan 1 a justement restreint la racine du schéma pour que le type et le contrat s'accordent, et l'écart restant sur `agencement` est documenté.

- [ ] **Step 1: Établir le point de départ vert**

```bash
cd app && npm test 2>&1 | grep -E "Test Files|Tests "
```

Attendu : `44 passed (44)` et `936 passed (936)`. **Si ce n'est pas le cas, arrêter et le signaler.**

- [ ] **Step 2: Écrire le test de la résolution par défaut**

`app/tests/agencement.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { AGENCEMENT_DEFAUT, resoudreAgencement } from '../src/agencement';
import { ECRANS } from '../src/ecran';
import { ecranVide } from './aides';

describe('resoudreAgencement', () => {
  it('rend le defaut pour un ecran qui ne declare rien', () => {
    expect(resoudreAgencement(ecranVide)).toEqual(AGENCEMENT_DEFAUT);
  });

  it('le defaut ordonne les zones comme le gabarit les ecrivait', () => {
    expect(AGENCEMENT_DEFAUT.zones).toEqual(
      ['ambiances', 'blocCentral', 'commandes', 'synthese']);
  });

  it('le defaut active les neuf modes, alerte en tete et defaut en queue', () => {
    expect(AGENCEMENT_DEFAUT.modes[0]).toBe('alerte');
    expect(AGENCEMENT_DEFAUT.modes.at(-1)).toBe('defaut');
    expect(AGENCEMENT_DEFAUT.modes).toHaveLength(9);
  });

  it('rend la declaration de l ecran quand il en porte une', () => {
    expect(resoudreAgencement(ECRANS.salon)).toEqual(ECRANS.salon.agencement);
  });
});
```

> L'ordre des zones du défaut est celui du gabarit actuel, à relever dans `app/src/rendu/corps.ts` avant d'écrire : la rangée « Ambiance » vient en premier, puis le bloc central, puis les commandes, puis la synthèse. **Vérifie-le dans le fichier** plutôt que de me croire — si l'ordre réel diffère, c'est le test ci-dessus qu'il faut corriger, pas le gabarit.

- [ ] **Step 3: Le faire échouer**

```bash
cd app && npx vitest run tests/agencement.test.ts 2>&1 | tail -10
```

Attendu : ÉCHEC — « Cannot find module '../src/agencement' ».

- [ ] **Step 4: Écrire le module**

`app/src/agencement.ts` :

```typescript
/** L'agencement d'un écran : ce que la configuration décide de la COMPOSITION, par opposition
 *  aux liaisons (quelles entités) que porte `ecran.ts`.
 *
 *  Quatre réglages, et seulement eux (décision 3 de la spec du 2026-09-12) :
 *  l'ordre des zones mobiles, le contenu du bloc central par défaut, quels modes vivent sur cet
 *  écran, et leur priorité d'exclusivité.
 *
 *  CE QUI N'EST PAS ICI, et n'y sera pas : les CONDITIONS de chaque mode. Elles lisent
 *  `ContexteModes` et restent en TypeScript (`modes.ts`). Les rendre configurables serait écrire
 *  un langage de règles — et la génération 1 de ces tablettes était exactement ça, un générateur
 *  de dashboards Lovelace, morte le 2026-08-02.
 *
 *  Module PUR : aucun import de rendu, aucune lecture d'état. Même règle que `modes.ts`, et c'est
 *  ce qui le rend testable sans navigateur. */
import type { ModePrincipal, Modulateur } from './modes';
import type { Ecran } from './ecran';

/** Les zones MOBILES. Le bandeau n'y est pas : c'est la barre d'état de l'écran, la déplacer n'a
 *  pas de sens et coûterait un cas de plus au moteur. « Toute la maison » non plus : elle est
 *  collée en bas par `margin-top: auto` (`base.css`), c'est ce qui absorbe l'espace résiduel.
 *  L'étiquette « Ambiance » n'est pas une zone à part : elle est le titre de `ambiances` et
 *  voyage avec elle.
 *
 *  À ne pas confondre avec les sept `data-zone` du DOM, qui servent à MESURER les hauteurs
 *  (`outils/mesurer-hauteurs.mjs`) et non à les ordonner. */
export type Zone = 'synthese' | 'blocCentral' | 'ambiances' | 'commandes';

/** Trois valeurs, comme `Ecran.blocDefaut`. Le schéma en accepte cinq sur `agencement.blocDefaut`
 *  (`entretien`, `previsions`) : prospectives, le rendu ne sait pas encore les produire. */
export type BlocDefaut = 'voiture' | 'repas' | 'agenda';

export type Agencement = {
  /** Ordre de haut en bas des zones mobiles. Chaque valeur au plus une fois ; `commandes` est
   *  obligatoire — un écran sans commande n'est plus une tablette de commande. */
  zones: Zone[];
  /** Modes actifs, dans leur ORDRE D'EXCLUSIVITÉ : le premier dont la condition est vraie occupe
   *  le bloc central. `defaut` est le repli et doit y figurer. */
  modes: ModePrincipal[];
  /** Modulateurs actifs. Cumulatifs, donc SANS ordre significatif — ils ne prennent le bloc de
   *  personne, ils réordonnent, masquent ou survolent. */
  modulateurs: Modulateur[];
  blocDefaut?: BlocDefaut;
  note?: string;
};

/** Ce que rend un écran qui ne déclare rien — c'est-à-dire une maison neuve.
 *
 *  Reproduit EXACTEMENT le comportement d'avant ce plan : l'ordre des zones est celui que le
 *  gabarit de `rendreCorps` écrivait en dur, et l'ordre des modes celui de la cascade de `if` de
 *  `modePrincipal`. C'est ce qui permet à un écran de ne rien déclarer sans rien perdre. */
export const AGENCEMENT_DEFAUT: Agencement = {
  zones: ['ambiances', 'blocCentral', 'commandes', 'synthese'],
  modes: ['alerte', 'recette', 'minuteur', 'menage', 'cinema', 'media', 'aeration',
          'voiture', 'defaut'],
  modulateurs: ['invites', 'chaleur', 'delorean'],
};

/** L'agencement d'un écran, ou le défaut. Une SEULE façon d'y accéder : aucun appelant ne doit
 *  écrire `ecran.agencement ?? QUELQUE_CHOSE` de son côté, sans quoi deux défauts finiraient par
 *  diverger — c'est exactement ce qui était arrivé à `blocDefaut`, détecté par la présence du
 *  champ `voiture` avant la tâche 14. */
export function resoudreAgencement(ecran: Ecran): Agencement {
  return ecran.agencement ?? AGENCEMENT_DEFAUT;
}
```

- [ ] **Step 5: Le faire passer partiellement**

```bash
cd app && npx vitest run tests/agencement.test.ts 2>&1 | tail -10
```

Attendu : les trois premiers tests PASSENT, le quatrième ÉCHOUE — `ECRANS.salon.agencement` vaut `undefined`, l'écran ne déclare encore rien.

- [ ] **Step 6: Déclarer le champ sur `Ecran`**

Dans `app/src/ecran.ts`, importer le type et l'ajouter :

```typescript
import type { Agencement } from './agencement';
```

et sur le type `Ecran`, à côté de `hauteurUtile` :

```typescript
  /** La COMPOSITION de cet écran : ordre des zones, modes actifs et leur priorité, modulateurs,
   *  bloc central par défaut. Cf. `agencement.ts` pour ce qui s'y règle et ce qui n'y est
   *  délibérément pas.
   *
   *  Facultatif : absent, `resoudreAgencement` rend `AGENCEMENT_DEFAUT`, qui reproduit
   *  exactement le comportement d'avant ce plan. Une maison neuve n'a donc rien à déclarer pour
   *  avoir un écran qui marche. */
  agencement?: Agencement;
```

- [ ] **Step 7: Déclarer les trois agencements**

C'est le cœur de la tâche : ce qui était DÉDUIT devient DÉCLARÉ (décision 3 de la spec).

Aujourd'hui, la présence d'un mode se déduit d'une donnée — le salon n'entre jamais en mode `minuteur` parce que `minuteurs` est absent, le bureau n'entre jamais en `aeration` parce que `ouvrants` est vide. Ces déductions restent vraies après ce plan (les conditions ne changent pas), mais elles cessent d'être la SEULE façon de le dire.

Dans `ECRANS.salon` :

```typescript
    agencement: {
      zones: ['ambiances', 'blocCentral', 'commandes', 'synthese'],
      // Le salon n'a pas de minuteur (aucun `minuteurs` déclaré) ni de recette : les deux modes
      // sont retirés de la liste plutôt que laissés à une condition qui ne peut pas se déclencher.
      // Déclarer ce que l'écran fait est plus lisible que déduire ce qu'il ne fait pas.
      modes: ['alerte', 'menage', 'cinema', 'media', 'aeration', 'voiture', 'defaut'],
      modulateurs: ['invites', 'chaleur', 'delorean'],
      blocDefaut: 'voiture',
      note: 'Écran d\'entrée. La voiture occupe le bloc central, et la scène DeLorean joue ici '
          + 'seulement : le modèle réduit est posé à côté.',
    },
```

Dans `ECRANS.bureau` :

```typescript
    agencement: {
      zones: ['ambiances', 'blocCentral', 'commandes', 'synthese'],
      // Ni minuteur, ni recette, ni voiture, ni DeLorean. `aeration` retiré aussi : `ouvrants`
      // est vide, la condition ne peut pas se déclencher.
      modes: ['alerte', 'menage', 'cinema', 'media', 'defaut'],
      modulateurs: ['invites', 'chaleur'],
      blocDefaut: 'agenda',
      note: 'C\'est au bureau qu\'on regarde son agenda.',
    },
```

Dans `ECRANS.cuisine` :

```typescript
    agencement: {
      zones: ['ambiances', 'blocCentral', 'commandes', 'synthese'],
      // La seule pièce où l'on fait cuire quelque chose : seule à porter `minuteur` et `recette`.
      modes: ['alerte', 'recette', 'minuteur', 'menage', 'cinema', 'media', 'aeration', 'defaut'],
      modulateurs: ['invites', 'chaleur'],
      blocDefaut: 'repas',
      note: 'C\'est en cuisine qu\'on cuisine.',
    },
```

> **`blocDefaut` est maintenant déclaré à DEUX endroits** — la racine de `Ecran` et `agencement`. C'est transitoire et voulu : le champ racine reste la source pour tout le code existant jusqu'à la tâche 2, qui bascule les lecteurs. Ne retire pas le champ racine dans cette tâche-ci, et **vérifie que les deux portent la même valeur** pour les trois écrans.

- [ ] **Step 8: Vérifier que rien n'a changé**

```bash
cd app && npx tsc --noEmit && npm test 2>&1 | grep -E "Test Files|Tests "
```

Attendu : `44 passed`, `940 passed (940)` — les 936 d'avant plus les 4 de la nouvelle suite. **Aucun test existant ne doit avoir changé de valeur attendue** : rien ne lit encore `agencement`.

- [ ] **Step 9: Écrire le test qui prouve l'équivalence**

C'est le test qui donne sa valeur à la tâche : la déclaration doit dire la même chose que la déduction d'aujourd'hui. Ajouter à `app/tests/agencement.test.ts` :

```typescript
describe('les trois ecrans declarent ce qui etait deduit', () => {
  it('un mode minuteur declare implique des slots de minuteur, et reciproquement', () => {
    for (const [nom, e] of Object.entries(ECRANS)) {
      const a = resoudreAgencement(e);
      expect(a.modes.includes('minuteur'), nom).toBe((e.minuteurs?.length ?? 0) > 0);
    }
  });

  it('un mode aeration declare implique des ouvrants, et reciproquement', () => {
    for (const [nom, e] of Object.entries(ECRANS)) {
      const a = resoudreAgencement(e);
      expect(a.modes.includes('aeration'), nom).toBe(e.ouvrants.length > 0);
    }
  });

  it('un bloc central voiture declare implique les entites de la voiture', () => {
    for (const [nom, e] of Object.entries(ECRANS)) {
      const a = resoudreAgencement(e);
      expect(a.blocDefaut === 'voiture', nom).toBe(e.voiture !== undefined);
    }
  });

  it('le blocDefaut de l agencement reprend celui de la racine', () => {
    for (const [nom, e] of Object.entries(ECRANS)) {
      expect(resoudreAgencement(e).blocDefaut, nom).toBe(e.blocDefaut);
    }
  });

  it('tout mode declare est un mode que modes.ts connait', () => {
    const connus = ['alerte', 'recette', 'minuteur', 'menage', 'cinema', 'media',
                    'aeration', 'voiture', 'defaut'];
    for (const [nom, e] of Object.entries(ECRANS)) {
      for (const m of resoudreAgencement(e).modes) expect(connus, nom).toContain(m);
    }
  });
});
```

- [ ] **Step 10: Le faire passer**

```bash
cd app && npx vitest run tests/agencement.test.ts 2>&1 | grep -E "Tests |FAIL"
cd app && npm test 2>&1 | grep -E "Test Files|Tests "
```

Attendu : 9 tests dans la nouvelle suite, et **945 au total** (936 + 9). **Si l'un des quatre premiers échoue, c'est une déclaration de l'étape 7 qui ment sur l'écran** — corrige la déclaration, jamais le test.

- [ ] **Step 11: Reconstruire et committer**

```bash
cd app && npm run build && cd .. && make test
git add -A
git commit -m "feat(agencement): la composition d'un ecran devient une donnee

Le type, le defaut, la resolution — et les trois ecrans declarent ce qui
etait jusqu'ici DEDUIT de la presence d'une donnee (le salon n'entrait
jamais en mode minuteur parce que \`minuteurs\` etait absent, le bureau
jamais en aeration parce que \`ouvrants\` etait vide). Decision 3 de la spec
du 2026-09-12.

Personne ne lit encore ce champ : la donnee arrive d'abord, les
consommateurs suivent aux taches 2 et 3. Rendu strictement inchange.

Cinq tests prouvent que la declaration dit la MEME chose que la deduction
d'aujourd'hui — c'est ce qui rend la bascule des taches suivantes sure.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `modePrincipal` perd sa hiérarchie, garde ses conditions

**Files:**
- Modify: `app/src/modes.ts` (`modePrincipal`, `modulateursActifs`, `ContexteModes`)
- Modify: `app/src/demarrage.ts` (construction de `ContexteModes`, vers la ligne 1402)
- Test: `app/tests/modes.test.ts` (ajouts), `app/tests/contextes.ts` (le contexte partagé)

**Interfaces:**
- Consumes: `Agencement`, `resoudreAgencement` (tâche 1).
- Produces :
  ```typescript
  export const CONDITIONS: Record<ModePrincipal, (c: ContexteModes) => boolean>;
  export const CONDITIONS_MODULATEURS: Record<Modulateur, (c: ContexteModes) => boolean>;
  ```
  et `ContexteModes` gagne deux champs **facultatifs** :
  ```typescript
    modes?: ModePrincipal[];        // absent => AGENCEMENT_DEFAUT.modes
    modulateurs?: Modulateur[];     // absent => AGENCEMENT_DEFAUT.modulateurs
  ```
  `modePrincipal(c)` et `modulateursActifs(c)` gardent leur signature.

> Les deux champs sont FACULTATIFS, et c'est ce qui garde les tests existants verts sans les réécrire : un contexte qui ne les porte pas se comporte exactement comme avant. Même patron que `rangeeAmbiance` et `blocDefaut` avant eux.

- [ ] **Step 1: Écrire le test de non-régression de la hiérarchie**

Ajouter à `app/tests/modes.test.ts` :

```typescript
import { CONDITIONS } from '../src/modes';
import { AGENCEMENT_DEFAUT } from '../src/agencement';

describe('modePrincipal — la hierarchie devient une liste', () => {
  /** Les neuf modes, chacun avec un contexte qui NE DECLENCHE QUE LUI, du plus prioritaire au
   *  moins. Relevé sur la cascade de `if` d'avant cette tâche : c'est la table de vérité à ne pas
   *  bouger. */
  const DECLENCHEURS: [string, Partial<ContexteModes>][] = [
    ['alerte', { alerte: true }],
    ['recette', { recetteEnCours: true }],
    ['minuteur', { minuteurEnCours: true }],
    ['menage', { aspirateurEnMarche: true }],
    ['cinema', { ecranAllume: true }],
    ['media', { sourceJoue: true }],
    ['aeration', { ouvrantOuvertDepuisMs: 40 * 60_000, chauffageEnMarche: true }],
    ['voiture', { blocDefaut: 'voiture' }],
    ['defaut', {}],
  ];

  it('chaque mode se declenche seul sur son contexte', () => {
    for (const [mode, sur] of DECLENCHEURS) {
      expect(modePrincipal(ctx(sur)), mode).toBe(mode);
    }
  });

  it('la priorite est celle de la liste : un contexte qui declenche TOUT rend le premier', () => {
    const tout = ctx(Object.assign({}, ...DECLENCHEURS.map(([, s]) => s)));
    expect(modePrincipal(tout)).toBe('alerte');
  });

  it('un mode absent de la liste ne se declenche jamais, meme si sa condition est vraie', () => {
    const sansMinuteur = AGENCEMENT_DEFAUT.modes.filter((m) => m !== 'minuteur');
    expect(modePrincipal(ctx({ minuteurEnCours: true, modes: sansMinuteur }))).toBe('defaut');
  });

  it('l ordre declare prime sur l ordre par defaut', () => {
    // Média devant le ménage, l'inverse du défaut.
    const inverse: ModePrincipal[] = ['media', 'menage', 'defaut'];
    expect(modePrincipal(ctx({ aspirateurEnMarche: true, sourceJoue: true, modes: inverse })))
      .toBe('media');
  });

  it('CONDITIONS couvre les neuf modes', () => {
    expect(Object.keys(CONDITIONS).sort()).toEqual([...AGENCEMENT_DEFAUT.modes].sort());
  });
});
```

> `ctx()` est l'aide déjà présente dans `tests/modes.test.ts` (elle étend `CALME`, importé de `tests/contextes.ts` depuis le plan 1). Elle n'accepte aujourd'hui que des champs de `ContexteModes` : les clés `modes` en feront partie dès l'étape 3, donc ce test ne compilera qu'après.

- [ ] **Step 2: Le faire échouer**

```bash
cd app && npx tsc --noEmit 2>&1 | head -5
```

Attendu : ÉCHEC de TYPE — `CONDITIONS` n'existe pas, et `modes` n'est pas un champ de `ContexteModes`.

**Rappel :** `vitest run` utilise esbuild, qui **ne vérifie pas les types**. Une étape « fais-le échouer » qui attend une erreur de type ne montre rien via vitest — utilise `tsc --noEmit`, comme ici.

- [ ] **Step 3: Extraire les conditions**

Dans `app/src/modes.ts`, remplacer le corps de `modePrincipal` par une table plus un parcours. **Garde tous les commentaires existants** : chacun porte un arbitrage daté, et ils déménagent avec leur condition.

```typescript
/** La CONDITION de chaque mode — ce qui reste en TypeScript quand l'ORDRE part dans la donnée.
 *
 *  Cette frontière est délibérée (spec du 2026-09-12, « Ce qu'on ne construit pas ») : rendre les
 *  conditions configurables, ce serait écrire un langage de règles, et la génération 1 de ces
 *  tablettes était exactement ça — un générateur de dashboards Lovelace, mort le 2026-08-02.
 *
 *  `defaut` rend `true` : c'est le repli, et c'est pour ça que l'agencement exige sa présence. */
export const CONDITIONS: Record<ModePrincipal, (c: ContexteModes) => boolean> = {
  alerte: (c) => c.alerte,
  // Priorité 2 par défaut, devant le minuteur : pendant une cuisson, l'écran doit pouvoir ramener
  // à l'étape en cours. Le décompte du minuteur le plus urgent est repris dans le bloc
  // (`rendreRecetteReduite`), donc rien n'est perdu ; la liste détaillée des trois minuteurs reste
  // à un appui (tuile).
  recette: (c) => c.recetteEnCours,
  // Priorité 3 par défaut, devant le ménage et le média : une cuisson a une échéance, une playlist
  // n'en a pas. Le mode ne dure que le temps du minuteur et rend la main de lui-même dès que les
  // trois helpers sont au repos.
  minuteur: (c) => c.minuteurEnCours,
  menage: (c) => c.aspirateurEnMarche,
  cinema: (c) => c.ecranAllume,
  media: (c) => c.sourceJoue,
  // `aeration` n'est PAS une alerte et ne le redevient pas : `alertes.ts` a délibérément retiré la
  // fenêtre du rang d'alerte (un ouvrant ouvert à la main est un état voulu qui peut durer des
  // heures). Ce raisonnement n'est pas révisé ici — ce mode occupe le bloc d'information central,
  // en couleur neutre, jamais le rouge d'erreur, et ne confisque rien.
  aeration: (c) => c.ouvrantOuvertDepuisMs > AERATION_MS && (c.chauffageEnMarche || c.ilPleut),
  // Le bloc par défaut du salon, à la place des six prochaines heures (demande du propriétaire,
  // 2026-08-03) — plus haut que la normale (cf. `combien`), il garde donc son propre mode.
  // `'repas'`/`'agenda'`/absent partagent tous le même gabarit que l'ancien `previsions`
  // (`defaut`, tâche 14) : c'est `demarrage.ts` qui choisit ensuite leur contenu respectif.
  voiture: (c) => c.blocDefaut === 'voiture',
  defaut: () => true,
};

/** Le premier mode ACTIF dont la condition est vraie. L'ordre vient de l'agencement de l'écran
 *  (`agencement.ts`), plus d'une cascade de `if` — mais le défaut reproduit cette cascade à
 *  l'identique, et `tests/modes.test.ts` en garde la table de vérité. */
export function modePrincipal(c: ContexteModes): ModePrincipal {
  const actifs = c.modes ?? AGENCEMENT_DEFAUT.modes;
  return actifs.find((m) => CONDITIONS[m](c)) ?? 'defaut';
}
```

> Le `?? 'defaut'` est une ceinture : l'agencement EXIGE `defaut` dans sa liste (le schéma le vérifie par `contains`), donc `find` ne devrait jamais rendre `undefined`. Mais un agencement mal formé ne doit pas faire planter un mur — même règle que la garde `piece.voiture &&` de `demarrage.ts`, défensive plutôt que redondante.

Ajouter l'import : `import { AGENCEMENT_DEFAUT } from './agencement';`

- [ ] **Step 4: Faire de même pour les modulateurs**

```typescript
export const CONDITIONS_MODULATEURS: Record<Modulateur, (c: ContexteModes) => boolean> = {
  invites: (c) => c.modeInvites,
  chaleur: (c) => chaleurActive(c),
  delorean: (c) => c.instantDelorean,
};

/** Les modulateurs actifs. Cumulatifs : ils ne prennent le bloc de personne. L'ordre de la liste
 *  déclarée n'a donc AUCUNE importance ici — on rend dans l'ordre de `CONDITIONS_MODULATEURS`
 *  pour que la sortie reste stable d'un appel à l'autre, ce dont les tests dépendent. */
export function modulateursActifs(c: ContexteModes): Modulateur[] {
  const declares = c.modulateurs ?? AGENCEMENT_DEFAUT.modulateurs;
  return (Object.keys(CONDITIONS_MODULATEURS) as Modulateur[])
    .filter((m) => declares.includes(m) && CONDITIONS_MODULATEURS[m](c));
}
```

- [ ] **Step 5: Ajouter les deux champs à `ContexteModes`**

```typescript
  /** Modes actifs et leur priorité, repris de `Agencement` par `demarrage.ts` — ce module ne lit
   *  jamais un écran lui-même. Facultatif : absent, `AGENCEMENT_DEFAUT.modes` s'applique, ce qui
   *  reproduit la cascade de `if` d'avant le plan 2. Même patron que `blocDefaut` et
   *  `rangeeAmbiance` avant lui. */
  modes?: ModePrincipal[];
  /** Modulateurs actifs, même provenance et même défaut. Sans ordre significatif. */
  modulateurs?: Modulateur[];
```

- [ ] **Step 6: Vérifier que la table de vérité tient**

```bash
cd app && npx tsc --noEmit && npx vitest run tests/modes.test.ts 2>&1 | grep -E "Tests |FAIL"
```

Attendu : la suite `modes.test.ts` passe de 56 à 61 tests, tous verts. **Aucune valeur attendue d'un test existant ne doit avoir changé.**

- [ ] **Step 7: Câbler `demarrage.ts`**

Vers la ligne 1402, là où `const ctx: ContexteModes = {` est construit, ajouter les deux champs et résoudre l'agencement UNE fois, en tête de la fonction qui en a besoin :

```typescript
const agencement = resoudreAgencement(piece);
```

puis dans l'objet :

```typescript
      // Repris tels quels de l'agencement de l'écran (`agencement.ts`) — `modes.ts` ne lit jamais
      // un écran lui-même, exactement comme pour `blocDefaut` et `rangeeAmbiance`.
      modes: agencement.modes,
      modulateurs: agencement.modulateurs,
```

Ajouter l'import : `import { resoudreAgencement } from './agencement';`

**Ne change pas encore `blocDefaut`** : il continue de venir de `piece.blocDefaut`. La bascule vers `agencement.blocDefaut` se fait à la tâche 3, quand `rendreCorps` deviendra l'assembleur — les changer ici obligerait à toucher les six autres lecteurs de `piece.blocDefaut` dans `demarrage.ts` au milieu d'une tâche qui parle de modes.

- [ ] **Step 8: Vérifier l'ensemble**

```bash
cd app && npx tsc --noEmit && npm test 2>&1 | grep -E "Test Files|Tests "
```

Attendu : `44 passed`, `950 passed (950)` — les 945 de fin de tâche 1 plus les 5 de cette tâche.

**Le test qui compte** : le salon ne déclare plus `minuteur` ni `recette` dans ses modes. Vérifie qu'aucun test de `demarrage.test.ts` ou `orchestration.test.ts` ne devient rouge — s'il l'est, c'est qu'un test montait le salon en s'attendant à un mode que l'écran ne déclare plus. **Dans ce cas, arrête-toi et signale-le** : soit la déclaration de la tâche 1 est fausse, soit le test décrivait un comportement que personne n'a jamais vu sur la vraie tablette. Les deux méritent une décision, pas un ajustement.

- [ ] **Step 9: Reconstruire et committer**

```bash
cd app && npm run build && cd .. && make test
git add -A
git commit -m "refactor(modes): la hierarchie des modes devient une liste ordonnee

modePrincipal() garde ses CONDITIONS en TypeScript et perd sa cascade de
if : l'ordre vient de l'agencement. modulateursActifs() filtre de meme sur
une liste declaree.

La frontiere est deliberee (spec du 2026-09-12) : rendre les conditions
configurables serait ecrire un langage de regles, et la generation 1 de ces
tablettes etait exactement ca — un generateur Lovelace, mort le 2026-08-02.

Les deux champs de ContexteModes sont FACULTATIFS : un contexte qui ne les
porte pas se comporte comme avant, ce qui garde les 56 tests de
modes.test.ts verts sans en reecrire un seul.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `rendreCorps` devient un assembleur

**Files:**
- Modify: `app/src/rendu/corps.ts` (`rendreCorps`, vers les lignes 324-540)
- Modify: `app/src/demarrage.ts` (passe l'agencement)
- Test: `app/tests/corps.test.ts` (ajouts)

**Interfaces:**
- Consumes: `Agencement`, `resoudreAgencement`, `Zone` (tâche 1).
- Produces: `rendreCorps` gagne un paramètre **facultatif en dernière position** :
  ```typescript
  agencement?: Agencement,   // absent => AGENCEMENT_DEFAUT
  ```
  Sa signature reste sinon identique, et l'ordre des paramètres existants ne bouge pas.

> Facultatif et en dernier, comme `ctx`, `tuileMinuteur`, `masquerEntretien` et `recetteOuvrable` avant lui. C'est la convention de ce fichier, et c'est ce qui garde les tests de rendu existants verts sans les réécrire.

- [ ] **Step 1: Relever l'ordre réel des zones dans le gabarit**

```bash
cd app && grep -n 'data-zone' src/rendu/corps.ts
```

Note l'ordre dans lequel `rangeeAmbiance`, `blocCentral`, `commandes` et `synthese` apparaissent dans le `html\`` de `rendreCorps`. **C'est cet ordre que `AGENCEMENT_DEFAUT.zones` doit reproduire** — si la tâche 1 s'est trompée, corrige `AGENCEMENT_DEFAUT` et son test maintenant, pas le gabarit.

- [ ] **Step 2: Écrire le test de l'assembleur**

Ajouter à `app/tests/corps.test.ts` :

```typescript
import { AGENCEMENT_DEFAUT } from '../src/agencement';

/** Lit l'ordre des zones REELLEMENT rendues dans le DOM, par leur attribut `data-zone`.
 *  On ignore `bandeau` (rendu ailleurs), `etiquetteAmbiance` (titre de la zone `ambiances`,
 *  qui voyage avec elle) et `touteLaMaison` (fixe en bas, collée par `margin-top: auto`). */
function zonesRendues(racine: HTMLElement): string[] {
  const mobiles = ['synthese', 'blocCentral', 'ambiances', 'commandes'];
  return [...racine.querySelectorAll('[data-zone]')]
    .map((e) => e.getAttribute('data-zone')!)
    .map((z) => (z === 'rangeeAmbiance' ? 'ambiances' : z))
    .filter((z) => mobiles.includes(z));
}

describe('rendreCorps — assembleur de zones', () => {
  it('rend les zones dans l ordre du defaut quand rien n est declare', () => {
    // La cuisine rend les quatre zones mobiles : trois ambiances, un bloc central (repas),
    // quatre commandes, une synthèse à cinq entrées.
    expect(zonesRendues(rendreDans(ECRANS.cuisine)))
      .toEqual(['ambiances', 'blocCentral', 'commandes', 'synthese']);
  });

  it('rend la synthese EN TETE quand l agencement le demande', () => {
    const racine = rendreDans(ECRANS.cuisine,
      { ...AGENCEMENT_DEFAUT, zones: ['synthese', 'ambiances', 'blocCentral', 'commandes'] });
    expect(zonesRendues(racine)[0]).toBe('synthese');
  });

  it('omet entierement une zone absente de la liste', () => {
    const racine = rendreDans(ECRANS.cuisine,
      { ...AGENCEMENT_DEFAUT, zones: ['blocCentral', 'commandes'] });
    expect(zonesRendues(racine)).not.toContain('synthese');
    expect(zonesRendues(racine)).not.toContain('ambiances');
  });

  it('garde le bandeau et Toute la maison hors de l ordre reglable', () => {
    const racine = rendreDans(ECRANS.cuisine, { ...AGENCEMENT_DEFAUT, zones: ['commandes'] });
    expect(racine.querySelector('[data-zone="touteLaMaison"]')).not.toBeNull();
  });
});
```

> `rendreDans(ecran, agencement?)` est une aide locale à ajouter en tête de ce fichier :
>
> ```typescript
> function rendreDans(ecran: Ecran, agencement?: Agencement): HTMLElement {
>   const racine = document.createElement('div');
>   render(rendreCorps(etatFactice, ecran, undefined, undefined, undefined, false, false,
>                      agencement), racine);
>   return racine;
> }
> ```
>
> `etatFactice` et l'import de `render` existent déjà dans `corps.test.ts` — **relis son en-tête et reprends sa façon de monter un rendu** plutôt que d'en inventer une seconde. Si sa fabrique d'état porte un autre nom, utilise le sien.

- [ ] **Step 3: Le faire échouer**

```bash
cd app && npx vitest run tests/corps.test.ts 2>&1 | tail -10
```

Attendu : ÉCHEC — `rendreCorps` n'accepte pas de septième paramètre, et l'ordre est figé dans le gabarit.

- [ ] **Step 4: Extraire chaque zone en fonction**

Dans `app/src/rendu/corps.ts`, découper le gabarit de `rendreCorps` en quatre fonctions locales qui rendent chacune **exactement** ce que le gabarit rendait pour cette zone — attributs `data-zone` et `data-mvt` compris, classes CSS inchangées.

```typescript
/** Une zone mobile, rendue. `undefined` = la zone n'a rien à montrer sur cet écran (le salon sans
 *  rangée d'ambiance, un mode sans bloc central) et disparaît COMPLÈTEMENT — pas un `.groupe`
 *  vide, qui resterait un enfant de la colonne flex et coûterait une gouttière de 8 px que le
 *  budget n'a pas. C'est la règle posée le 2026-08-29 pour la rangée d'ambiance, ici généralisée. */
type RenduZone = TemplateResult | undefined;
```

Puis une table, construite dans `rendreCorps` (elle capture ses variables locales) :

```typescript
  const ZONES: Record<Zone, () => RenduZone> = {
    ambiances: () => (piece.ambiances.length || tuileMinuteur ? RENDU_AMBIANCES : undefined),
    blocCentral: () => blocCentral,
    commandes: () => (commandes.length ? RENDU_COMMANDES : undefined),
    synthese: () => RENDU_SYNTHESE,
  };
```

**Tu n'écris aucun gabarit neuf.** `RENDU_AMBIANCES`, `RENDU_COMMANDES` et `RENDU_SYNTHESE` ci-dessus sont des marque-places de LECTURE, pas de code à inventer : remplace chacun par le bloc `html\`…\`` **déplacé verbatim** depuis le gabarit actuel de `rendreCorps`, sans changer un attribut, une classe ni une variable capturée. Les conditions (`piece.ambiances.length || tuileMinuteur`, `commandes.length`) sont elles aussi celles qui gardent déjà ces blocs dans le gabarit — reprends-les telles quelles.

Le contrôle qui prouve que tu n'as rien changé : après ce déplacement, le DOM rendu pour l'agencement par défaut doit être **identique caractère pour caractère** à celui d'avant. C'est ce que vérifie l'étape 6.

et le gabarit final :

```typescript
  return html`
    <div class="corps">
      ${zones.map((z) => ZONES[z]()).filter((t) => t !== undefined)}
      <div class="xl" data-zone="touteLaMaison" data-mvt="tuile:toute-la-maison" …>…</div>
    </div>`;
```

avec, en tête de fonction :

```typescript
  const zones = (agencement ?? AGENCEMENT_DEFAUT).zones;
```

> **Le `filter` avant le rendu est indispensable**, pas cosmétique : `lit` rendrait un `undefined` comme un nœud vide, mais c'est la colonne flex de `.corps` qui compte — chaque enfant coûte une gouttière de 8 px. Sur un budget à 3 px de marge, une gouttière de trop fait déborder l'écran. Ce raisonnement est déjà écrit dans le commentaire de la rangée d'ambiance (`corps.ts`, vers la ligne 430) : relis-le, il explique le mécanisme mieux que ce paragraphe.

- [ ] **Step 5: Ajouter le paramètre**

À la fin de la liste des paramètres de `rendreCorps`, après `recetteOuvrable` :

```typescript
  // Tâche 3 du plan 2 : l'ORDRE des zones mobiles vient de l'agencement de l'écran. Facultatif et
  // en dernière position, comme `ctx`/`tuileMinuteur`/`masquerEntretien`/`recetteOuvrable` avant
  // lui : sans lui, l'ordre est celui d'`AGENCEMENT_DEFAUT`, c'est-à-dire exactement celui que ce
  // gabarit écrivait en dur. Les tests de rendu existants restent donc verts sans être réécrits.
  agencement?: Agencement,
```

- [ ] **Step 6: Le faire passer**

```bash
cd app && npx tsc --noEmit && npx vitest run tests/corps.test.ts 2>&1 | grep -E "Tests |FAIL"
```

Attendu : VERT, y compris les tests existants du fichier. **Si un test de rendu existant devient rouge, la sortie DOM a changé** — compare le HTML rendu avant/après et remets l'écart à zéro. Aucun attribut, aucune classe, aucun ordre ne doit bouger sur l'agencement par défaut.

- [ ] **Step 7: Câbler `demarrage.ts`**

Passer `agencement` aux appels de `rendreCorps`. `agencement` est déjà résolu depuis la tâche 2 — **ne le résous pas une seconde fois**, un second `resoudreAgencement` serait un second défaut qui finirait par diverger.

Basculer aussi les lecteurs de `piece.blocDefaut` vers `agencement.blocDefaut` (il y en a six, relevés par `grep -n "piece.blocDefaut" src/demarrage.ts`). Les deux portent la même valeur pour les trois écrans — la tâche 1 l'a vérifié par test — donc la bascule est à résultat constant.

- [ ] **Step 8: Retirer le champ racine devenu redondant**

Maintenant que plus personne ne lit `piece.blocDefaut`, retire-le du type `Ecran` et des trois déclarations. **Vérifie d'abord qu'il n'a plus aucun lecteur** :

```bash
cd app && grep -rn "\.blocDefaut" src/ tests/ | grep -v "agencement"
```

Attendu : aucune ligne. S'il en reste, bascule-les avant de retirer le champ.

Retire aussi `blocDefaut` des `properties` de la racine dans `contrat/ecran.schema.json` — il y vit encore avec ses trois valeurs. Le champ existe désormais UNIQUEMENT dans `agencement`.

> C'est la seule suppression de champ du plan. Elle est sûre parce que le test de la tâche 1 (« le blocDefaut de l'agencement reprend celui de la racine ») a prouvé l'équivalence avant qu'on s'appuie dessus.

- [ ] **Step 9: Vérifier et committer**

```bash
cd app && npx tsc --noEmit && npm test 2>&1 | grep -E "Test Files|Tests "
cd .. && make test
```

Attendu : `44 passed`, `954 passed (954)`.

```bash
cd app && npm run build && cd ..
git add -A
git commit -m "refactor(corps): rendreCorps assemble ses zones au lieu de les ecrire

La composition quitte le gabarit lit pour un parcours de agencement.zones,
via une table zone -> fonction. Les fonctions de rendu ne changent pas :
elles deviennent les entrees de cette table.

Le bandeau et « Toute la maison » restent HORS de l'ordre reglable : le
premier est la barre d'etat, le second est colle en bas par margin-top:auto
et c'est lui qui absorbe l'espace residuel.

Une zone sans rien a montrer disparait COMPLETEMENT, jamais en enfant vide :
.corps est une colonne flex a gouttiere de 8 px, et le budget n'a que 3 px
de marge. Regle posee le 2026-08-29 pour la rangee d'ambiance, ici generalisee.

blocDefaut vit desormais dans agencement seulement — la racine d'Ecran et du
schema le perdent, apres que la tache 1 a prouve l'equivalence.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `hauteurUtile` câblé, et la levée en rendu refermée

**Le problème que cette tâche résout, et il n'est pas cosmétique.** Le plan 1 a ajouté `Ecran.hauteurUtile` et appris à `combien()` à l'honorer — mais **personne ne le lui transmet** : `ordreCommandes` reçoit un `ContexteModes`, où le champ n'existe pas. Le câbler ouvre en même temps un piège que la relecture finale du plan 1 a nommé : `combien()` lève `BudgetIntenable`, et c'est le **moteur de rendu** qui l'appelle. Un écran déclarant `hauteurUtile: 480` ferait donc un écran blanc — ce que ce projet s'interdit au même titre que le bouton mort.

**Files:**
- Modify: `app/src/modes.ts` (`combien`, `ordreCommandes`, `ContexteModes`, `BudgetIntenable`)
- Modify: `app/src/demarrage.ts` (recopie `hauteurUtile`)
- Test: `app/tests/budget.test.ts` (ajouts)

**Interfaces:**
- Consumes: `BUDGET`, `combien`, `BudgetIntenable` (plan 1).
- Produces :
  ```typescript
  // `combien` NE LEVE PLUS. Signature inchangée, comportement au bord changé :
  export function combien(mode: ModePrincipal, rangeeAmbiance?: boolean,
                          hauteurUtile?: number): number;   // rend 0 au lieu de lever
  // La levée déménage dans une fonction de VALIDATION, que le rendu n'appelle jamais :
  export function verifierBudget(mode: ModePrincipal, rangeeAmbiance: boolean,
                                 hauteurUtile: number): number;  // px de débordement, 0 si ça tient
  ```
  et `ContexteModes` gagne `hauteurUtile?: number`.

> **C'est la décision de conception de cette tâche.** `BudgetIntenable` a été écrite au plan 1 « pour que l'intégration Home Assistant puisse dire NON à la saisie » — mais elle était levée par la fonction que le rendu appelle. On sépare les deux : le rendu dégrade (0 commande, comme le mode `minuteur` le fait déjà légitimement), la validation rapporte un nombre de pixels. `verifierBudget` est ce que le plan 3 appellera depuis le formulaire.

- [ ] **Step 1: Écrire le test des deux comportements**

Ajouter à `app/tests/budget.test.ts` :

```typescript
import { combien, verifierBudget, BudgetIntenable } from '../src/modes';

describe('hauteurUtile — le rendu degrade, la validation refuse', () => {
  it('rend la table historique pour 585 px', () => {
    expect(combien('defaut', true, 585)).toBe(4);
    expect(combien('media', true, 585)).toBe(2);
    expect(combien('minuteur', true, 585)).toBe(0);
  });

  it('rend MOINS de commandes sur un ecran plus court', () => {
    const court = 585 - BUDGET.hauteurs.rangeeCommandes;
    expect(combien('defaut', true, court)).toBeLessThan(combien('defaut', true, 585));
  });

  it('rend 0 plutot que de lever quand plus rien ne tient', () => {
    expect(combien('defaut', true, 100)).toBe(0);
  });

  it('verifierBudget rend 0 quand la composition tient', () => {
    expect(verifierBudget('defaut', true, 585)).toBe(0);
  });

  it('verifierBudget rend le debordement en pixels quand elle ne tient pas', () => {
    expect(verifierBudget('defaut', true, 100)).toBeGreaterThan(0);
  });

  it('ordreCommandes ne leve JAMAIS, meme sur un ecran absurde', () => {
    expect(() => ordreCommandes(ECRANS.bureau.commandes,
      { ...CALME_VOITURE, hauteurUtile: 50 })).not.toThrow();
  });
});
```

- [ ] **Step 2: Le faire échouer**

```bash
cd app && npx tsc --noEmit 2>&1 | head -5
```

Attendu : ÉCHEC de TYPE — `verifierBudget` n'existe pas, `hauteurUtile` n'est pas un champ de `ContexteModes`.

- [ ] **Step 3: Séparer le calcul du verdict**

Dans `app/src/modes.ts` :

```typescript
/** Le coût en pixels d'une composition, hors rangées de commandes. Extrait de `combien` pour que
 *  `verifierBudget` le réutilise sans dupliquer l'addition — deux additions du même budget
 *  finiraient par diverger, et c'est précisément ce que `contrat/budget.json` existe pour
 *  empêcher. */
function coutFixe(mode: ModePrincipal, rangeeAmbiance: boolean): number {
  const h = BUDGET.hauteurs;
  // DÉPLACE ICI, VERBATIM, l'addition que `combien` fait aujourd'hui — celle qui somme bandeau,
  // paddingCorps, synthese, le bloc central du mode, l'étiquette et la rangée d'ambiance quand
  // elles sont là, touteLaMaison, et les gouttières. Ne la réécris pas de mémoire : elle a été
  // MESURÉE (plan 1, tâche 3) et le moindre terme oublié fausse le budget. Seul le `return`
  // change de destinataire.
}

/** Combien de commandes l'écran montre. NE LÈVE JAMAIS : un budget intenable rend 0, et l'écran
 *  affiche alors ses autres zones sans rangée de commandes — exactement ce que le mode `minuteur`
 *  fait déjà légitimement (630 px pour sa seule liste, aucune place pour une commande).
 *
 *  2026-09-12, plan 2 : cette fonction LEVAIT `BudgetIntenable` jusqu'ici. Or c'est le moteur de
 *  rendu qui l'appelle, via `ordreCommandes` — un écran mal configuré aurait fait un écran blanc,
 *  ce que ce projet s'interdit au même titre que le bouton mort. Le verdict déménage dans
 *  `verifierBudget`, que le rendu n'appelle jamais et que le formulaire de l'intégration (plan 3)
 *  appellera. Le rendu dégrade, la saisie refuse. */
export function combien(mode: ModePrincipal, rangeeAmbiance = true,
                        hauteurUtile = BUDGET.hauteurUtileParDefaut): number {
  if ((BUDGET.modesSansCommande as string[]).includes(mode)) return 0;
  const reste = hauteurUtile - coutFixe(mode, rangeeAmbiance);
  if (reste < 0) return 0;
  const rangees = Math.min(Math.floor(reste / BUDGET.hauteurs.rangeeCommandes), 2);
  return rangees * BUDGET.tuilesParRangee;
}

/** De combien cette composition déborde, en pixels. 0 si elle tient. Écrite pour le formulaire de
 *  l'intégration Home Assistant (plan 3), qui doit pouvoir dire « cet écran déborde de 45 px en
 *  mode minuteur » AU MOMENT DE LA SAISIE — pas devant la tablette.
 *
 *  Le rendu ne l'appelle jamais : c'est toute la différence avec la version d'avant, où le verdict
 *  et le calcul vivaient dans la même fonction. */
export function verifierBudget(mode: ModePrincipal, rangeeAmbiance: boolean,
                               hauteurUtile: number): number {
  return Math.max(0, coutFixe(mode, rangeeAmbiance) - hauteurUtile);
}
```

Et retirer `BudgetIntenable` — plus aucun code ne la lève. **Vérifie qu'elle n'a plus de lecteur** avant de la supprimer :

```bash
cd app && grep -rn "BudgetIntenable" src/ tests/
```

- [ ] **Step 4: Câbler jusqu'à `combien`**

Ajouter le champ à `ContexteModes` :

```typescript
  /** Hauteur utile de l'écran en pixels CSS, reprise d'`Ecran.hauteurUtile` par `demarrage.ts` —
   *  ce module ne lit jamais un écran lui-même. Facultatif : absent,
   *  `BUDGET.hauteurUtileParDefaut` (585, les Fire 7) s'applique. Même patron que `modes`,
   *  `modulateurs`, `blocDefaut` et `rangeeAmbiance` avant lui. */
  hauteurUtile?: number;
```

Dans `ordreCommandes`, au dernier appel :

```typescript
  return epingler(ordre, combien(mode, c.rangeeAmbiance, c.hauteurUtile));
```

Et dans `demarrage.ts`, à côté de `modes` et `modulateurs` :

```typescript
      hauteurUtile: piece.hauteurUtile,
```

- [ ] **Step 5: Vérifier et committer**

```bash
cd app && npx tsc --noEmit && npm test 2>&1 | grep -E "Test Files|Tests "
```

Attendu : `44 passed`, `960 passed (960)`. **`tests/modes.test.ts` ne doit pas avoir changé d'une valeur** : aucun des trois écrans ne déclare `hauteurUtile`, donc tous retombent sur 585.

```bash
cd app && npm run build && cd .. && make test
git add -A
git commit -m "feat(budget): hauteurUtile cable, et la levee quitte le chemin de rendu

Le plan 1 avait ajoute hauteurUtile et appris a combien() a l'honorer, mais
personne ne le lui transmettait : ordreCommandes recoit un ContexteModes, ou
le champ n'existait pas.

Le cabler ouvrait un piege nomme par la relecture finale du plan 1 :
combien() LEVAIT BudgetIntenable, et c'est le moteur de rendu qui l'appelle.
Un ecran declarant hauteurUtile: 480 aurait fait un ECRAN BLANC — ce que ce
projet s'interdit au meme titre que le bouton mort.

Les deux roles se separent : combien() degrade (0 commande, comme le mode
minuteur le fait deja legitimement), verifierBudget() rend le debordement en
pixels et sera appele par le formulaire de l'integration au plan 3. Le rendu
degrade, la saisie refuse.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `minuteur` paie son coût, et `blocMinuteur` cesse d'être décoratif

`contrat/budget.json` publie `blocMinuteur: 206`, et **personne ne le lit** : `combien()` court-circuite les modes de `modesSansCommande` avant tout calcul. Le plan 1 l'a documenté (`_blocMinuteur`) et différé ; c'est ici qu'on le referme.

**Vérifié avant d'écrire ce plan** : le calcul complet rend le même résultat. Mode `minuteur` avec rangée d'ambiance, sans rangée de commandes — `121 + 24 + 32 + 206 + 9 + 72 + 62 + 4×8 = 558`, reste `585 − 558 = 27`, soit moins que les 64 px d'une rangée, donc **0 commande**. Identique à aujourd'hui. Cette tâche est à résultat constant.

**Files:**
- Modify: `app/src/modes.ts` (`coutFixe`, `combien`), `contrat/budget.json` (`_blocMinuteur`, `modesSansCommande`)
- Test: `app/tests/budget.test.ts`

**Interfaces:**
- Consumes: `coutFixe`, `combien`, `verifierBudget` (tâche 4).
- Produces: aucune signature nouvelle. `BUDGET.modesSansCommande` disparaît du contrat.

- [ ] **Step 1: Écrire le test**

```typescript
describe('le mode minuteur paie son cout comme les autres', () => {
  it('rend toujours 0 commande a 585 px', () => {
    expect(combien('minuteur', true, 585)).toBe(0);
    expect(combien('minuteur', false, 585)).toBe(0);
  });

  it('rend 0 PARCE QUE rien ne tient, pas par court-circuit', () => {
    // Un écran assez haut pour financer une rangée sous le bloc minuteur en rendrait deux tuiles.
    const haut = 585 + BUDGET.hauteurs.rangeeCommandes + BUDGET.hauteurs.gouttiere;
    expect(combien('minuteur', true, haut)).toBe(2);
  });

  it('verifierBudget chiffre le debordement du mode minuteur', () => {
    expect(verifierBudget('minuteur', true, 585)).toBe(0);
    expect(verifierBudget('minuteur', true, 500)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Le faire échouer**

```bash
cd app && npx vitest run tests/budget.test.ts 2>&1 | grep -E "Tests |FAIL|AssertionError" | head -5
```

Attendu : le deuxième test ÉCHOUE — `combien('minuteur', …)` rend 0 quelle que soit la hauteur, à cause du court-circuit.

- [ ] **Step 3: Faire payer le mode minuteur**

Dans `coutFixe`, utiliser `BUDGET.hauteurs.blocMinuteur` quand le mode est `minuteur`, comme `blocHaut` pour média/cinéma/voiture et `blocDefaut` pour les autres. Puis retirer le court-circuit de `combien` :

```typescript
export function combien(mode: ModePrincipal, rangeeAmbiance = true,
                        hauteurUtile = BUDGET.hauteurUtileParDefaut): number {
  const reste = hauteurUtile - coutFixe(mode, rangeeAmbiance);
  if (reste < 0) return 0;
  const rangees = Math.min(Math.floor(reste / BUDGET.hauteurs.rangeeCommandes), 2);
  return rangees * BUDGET.tuilesParRangee;
}
```

- [ ] **Step 4: Retirer `modesSansCommande` du contrat**

Il n'a plus de lecteur. Dans `contrat/budget.json`, retire la clé, et remplace `_blocMinuteur` par une phrase qui dit ce qui a changé :

```json
  "_blocMinuteur": "206 px, le bloc du mode minuteur. Consomme par combien() comme tout autre bloc central depuis le plan 2 : le mode minuteur rend 0 commande PARCE QUE 27 px restent apres son cout, pas par court-circuit. La cle modesSansCommande a disparu avec ce court-circuit."
```

- [ ] **Step 5: Vérifier et committer**

```bash
cd app && npx tsc --noEmit && npm test 2>&1 | grep -E "Test Files|Tests "
cd .. && make test
```

Attendu : `44 passed`, `963 passed (963)`. **La table de vérité de `tests/budget.test.ts` (14 couples) ne doit pas avoir changé d'une valeur** — c'est ce qui prouve que la tâche est à résultat constant.

```bash
cd app && npm run build && cd ..
git add -A
git commit -m "refactor(budget): le mode minuteur paie son cout, blocMinuteur est lu

contrat/budget.json publiait blocMinuteur: 206 que personne ne lisait —
combien() court-circuitait les modes sans commande avant tout calcul. Le
plan 1 l'avait documente et differe ; c'est ici qu'on le referme.

A RESULTAT CONSTANT, et mesure : 121+24+32+206+9+72+62+4x8 = 558, reste
27 px, moins que les 64 px d'une rangee — donc 0 commande, comme avant. La
difference est que c'est maintenant une CONSEQUENCE, pas une exception, et
que verifierBudget() sait enfin chiffrer le debordement de ce mode pour le
formulaire du plan 3.

modesSansCommande disparait du contrat avec le court-circuit qu'elle servait.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Les deux invariants croisés entrent dans le schéma

`contrat/README.md` porte une section « Ce que le schéma ne vérifie PAS », qui nomme trois dettes et les renvoie à ce plan. Deux sont des dépendances entre champs ; la troisième (`version` ni requis ni lu) appartient au plan 3, qui écrira la résolution.

**Files:**
- Modify: `contrat/ecran.schema.json`, `contrat/README.md`
- Test: `app/tests/contrat-schema.test.ts`

**Interfaces:**
- Consumes: le schéma et l'aide `refusePour(valeur, { instancePath, keyword, params? })` du plan 1.
- Produces: aucune signature nouvelle.

- [ ] **Step 1: Écrire les tests**

```typescript
describe('les invariants croises', () => {
  it('refuse blocDefaut voiture sans l objet voiture', () => {
    const { voiture, ...sansVoiture } = ECRANS.salon;
    refusePour({ ...sansVoiture,
                 agencement: { ...ECRANS.salon.agencement!, blocDefaut: 'voiture' } },
               { instancePath: '', keyword: 'required' });
  });

  it('accepte blocDefaut voiture quand l objet voiture est la', () => {
    expect(valider(ECRANS.salon), JSON.stringify(valider.errors)).toBe(true);
  });

  it('refuse le mode minuteur sans slots de minuteur', () => {
    const { minuteurs, ...sansSlots } = ECRANS.cuisine;
    refusePour(sansSlots, { instancePath: '', keyword: 'required' });
  });

  it('accepte le mode minuteur quand les slots sont la', () => {
    expect(valider(ECRANS.cuisine), JSON.stringify(valider.errors)).toBe(true);
  });
});
```

- [ ] **Step 2: Le faire échouer**

```bash
cd app && npx vitest run tests/contrat-schema.test.ts 2>&1 | grep -E "Tests |FAIL"
```

Attendu : les deux tests de REFUS échouent — le schéma accepte les deux configurations incohérentes.

- [ ] **Step 3: Écrire les invariants**

Au niveau racine du schéma, ajouter un `allOf` :

```json
  "allOf": [
    {
      "if": {
        "properties": {
          "agencement": {
            "properties": { "blocDefaut": { "const": "voiture" } },
            "required": ["blocDefaut"]
          }
        },
        "required": ["agencement"]
      },
      "then": { "required": ["voiture"] }
    },
    {
      "if": {
        "properties": {
          "agencement": {
            "properties": { "modes": { "contains": { "const": "minuteur" } } },
            "required": ["modes"]
          }
        },
        "required": ["agencement"]
      },
      "then": {
        "required": ["minuteurs"],
        "properties": { "minuteurs": { "minItems": 1 } }
      }
    }
  ],
```

> **Le `required` DANS le `if` est indispensable.** Sans lui, un `if` dont la condition porte sur une propriété absente réussit *à vide* et déclenche son `then` : un écran sans `agencement` se verrait exiger un objet `voiture`. C'est le piège de JSON Schema que le plan 1 avait déjà rencontré sur `synthese.allOf` — relis ce bloc, il est le modèle à suivre.

- [ ] **Step 4: Le faire passer**

```bash
cd app && npx vitest run tests/contrat-schema.test.ts 2>&1 | grep -E "Tests |FAIL"
```

Attendu : VERT, et **les trois écrans réels toujours acceptés** — c'est le test qui compte. Si l'un est refusé, le schéma a tort, pas la donnée.

- [ ] **Step 5: Mettre à jour le README du contrat**

Dans `contrat/README.md`, section « Ce que le schéma ne vérifie PAS » : retire les deux entrées désormais vérifiées, garde celle sur `version` en renvoyant au plan 3. Si la section n'a plus qu'une entrée, ne la supprime pas — une dette nommée vaut mieux qu'une dette tue.

- [ ] **Step 6: Vérifier et committer**

```bash
cd app && npm run build && npm test 2>&1 | grep -E "Test Files|Tests "
cd .. && make test
git add -A
git commit -m "feat(contrat): le schema exprime les deux invariants croises

blocDefaut: voiture exige desormais l'objet voiture, et le mode minuteur
exige des slots non vides. Deux dettes nommees par le README du plan 1 et
renvoyees a ce plan-ci.

Le required DANS le if n'est pas decoratif : sans lui, un if dont la
condition porte sur une propriete absente reussit A VIDE et declenche son
then — un ecran sans agencement se verrait exiger un objet voiture. Meme
piege que synthese.allOf avait deja evite au plan 1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## À la fin de ce plan

- Les trois tablettes affichent **exactement** ce qu'elles affichaient, prouvé par les tests du plan 1 restés verts et par la table de vérité de `combien()` inchangée.
- Les quatre réglages d'agencement sont des **données** : ordre des zones, bloc central, modes actifs, priorité.
- `hauteurUtile` est **câblé de bout en bout**, et le rendu ne peut plus lever.
- `blocMinuteur` est **consommé** ; `verifierBudget()` existe, prête pour le formulaire du plan 3.
- Le schéma exprime **deux invariants de plus**.

**Ce qui reste pour le plan 3 :** l'intégration `custom_components/home_desk`, le transport websocket, le démarrage asynchrone et ses quatre dégradations, la migration des 66 `entity_id` hors du dépôt, et la mise en production tablette par tablette.

**Dette transmise, à ne pas perdre :** les fixtures de `app/outils/verifier-rendu.mjs` injectent `media_player.ytube_music_player`, entité disparue au renommage Music Assistant — l'outil rapporte « mode non atteint » sur `media` en silence depuis, et il alimente désormais un fichier contractuel.
