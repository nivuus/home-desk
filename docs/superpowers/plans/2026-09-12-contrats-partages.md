# Les contrats partagés — plan d'implémentation (1/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortir des commentaires et du code les trois contrats que l'application et la future intégration Home Assistant devront partager — le budget de hauteur, la liste des icônes, le schéma d'un écran — sans changer d'un pixel ce que les trois tablettes affichent.

**Architecture:** Trois fichiers JSON versionnés sous `contrat/`, produits ou vérifiés par le build de l'application, consommés par `app/src/` aujourd'hui et par `custom_components/home_desk/` au plan 3. Le type `Piece` devient `Ecran` et gagne les champs que la configuration exigera (`note`, `hauteurUtile`). Aucune donnée ne quitte encore le dépôt : à la fin de ce plan, l'application se comporte exactement comme avant, et `make test` + `make test-app` le prouvent.

**Tech Stack:** TypeScript 5.3, `lit` 3, vitest 2.1, rollup 4, `ajv` (nouveau), Node ≥ 20, `playwright-core` 1.60 (déjà présent, pour la campagne de mesure).

**Spec:** `docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`

## Global Constraints

- **`dist/` est versionné** et doit correspondre à `app/src/` à chaque commit. Toute modification de `app/src/` exige `cd app && npm run build`, puis `git add dist`. `tests/test_dist_a_jour.py` le vérifie.
- **`make test` reste en `python3` + PyYAML seulement.** Sa raison d'être est de tourner sur la cible d'installation, qui n'a rien d'autre (`Makefile`, l. 5-8). Aucune dépendance nouvelle n'y entre dans ce plan.
- **Aucune régression d'affichage.** Les 41 fichiers vitest (912 tests) passent à chaque commit. Un test qui change de valeur attendue est un échec du plan, pas un ajustement.
- **Budget de hauteur : 585 px.** Viewport de référence `343×585` (`app/outils/mesurer-rendus.mjs`, l. 35).
- **Le français des commentaires porte ses accents.** `pieces.ts` écrit « pièce » ; les identifiants écrivent `piece`. Cette distinction est utilisée par la tâche 1 — ne pas l'abîmer.
- **Rien de cette maison n'entre dans `contrat/`.** Pas d'`entity_id`, pas de nom de pièce. Ces fichiers partent chez toutes les maisons.

---

### Task 1: Renommer `Piece` en `Ecran` et ouvrir les champs de configuration

Renommage mécanique, plus deux champs additifs. Aucun changement de comportement : c'est la tâche qui doit être la plus ennuyeuse du plan.

**Files:**
- Rename: `app/src/pieces.ts` → `app/src/ecran.ts`
- Modify: tous les fichiers de `app/src/` et `app/tests/` qui importent `Piece` ou `PIECES` (10 + 10, cf. étape 2)
- Modify: `CLAUDE.md`, `README.md` (trois mentions de `app/src/pieces.ts` chacune)
- Test: `app/tests/ecran.test.ts` (renommé depuis `app/tests/pieces.test.ts`)

**Interfaces:**
- Consumes: rien (première tâche).
- Produces:
  - `export type Ecran` (ex-`Piece`), dans `app/src/ecran.ts`, augmenté de :
    - `note?: string`
    - `hauteurUtile?: number`
  - `export const ECRANS: Record<'salon' | 'bureau' | 'cuisine', Ecran>` (ex-`PIECES`)
  - `note?: string` sur `Bouton`, `EntreeSynthese` (via `Commun`), `Voiture`
  - `note?: string` sur `DeclarationSource` (`app/src/media.ts`)
  - `export const ecranVide: Ecran` dans `app/tests/aides.ts` (ex-`pieceVide`)
  - `monterDemarrage(ecran: Ecran, options)` garde sa signature, son premier paramètre change de type-nom seulement.

- [ ] **Step 1: Établir le point de départ vert**

```bash
cd app && npm test 2>&1 | tail -5
```

Attendu : 41 fichiers, 912 tests, 0 échec. **Si ce n'est pas le cas, arrêter et le signaler** — ce plan ne démarre pas sur une suite rouge.

- [ ] **Step 2: Relever exactement ce qui sera touché**

```bash
cd app && grep -rln '\bPiece\b\|\bPIECES\b\|pieceVide' src/ tests/ | sort
```

Attendu : environ 20 fichiers. Garder cette liste sous les yeux — c'est la seule chose qui doit bouger.

- [ ] **Step 3: Renommer le fichier, en gardant l'historique git**

```bash
cd app && git mv src/pieces.ts src/ecran.ts && git mv tests/pieces.test.ts tests/ecran.test.ts
```

- [ ] **Step 4: Renommer les identifiants**

Trois substitutions, et seulement elles. Les identifiants sont sans accent, les commentaires français écrivent « pièce » avec accent : `\bPiece\b` et `\bPIECES\b` ne peuvent donc pas atteindre la prose.

```bash
cd app && find src tests -name '*.ts' -print0 | xargs -0 sed -i \
  -e 's/\bPiece\b/Ecran/g' \
  -e 's/\bPIECES\b/ECRANS/g' \
  -e 's/\bpieceVide\b/ecranVide/g' \
  -e "s#from '\./pieces'#from './ecran'#g" \
  -e "s#from '\.\./src/pieces'#from '../src/ecran'#g" \
  -e "s#from '\./\.\./src/pieces'#from '../src/ecran'#g"
```

Puis vérifier qu'aucun import ne pointe plus vers l'ancien nom :

```bash
cd app && grep -rn "pieces'" src/ tests/ ; echo "attendu : aucune ligne"
```

- [ ] **Step 5: Vérifier que rien n'a changé**

```bash
cd app && npx tsc --noEmit && npm test 2>&1 | tail -5
```

Attendu : compilation propre, 912 tests verts, **exactement le même nombre qu'à l'étape 1**.

- [ ] **Step 6: Écrire le test des nouveaux champs**

Dans `app/tests/ecran.test.ts`, ajouter :

```typescript
import { describe, it, expect } from 'vitest';
import { ECRANS, type Ecran, type Bouton } from '../src/ecran';

describe('les champs ouverts par la configuration', () => {
  it('accepte une note sur un écran, un bouton et une entrée de synthèse', () => {
    const e: Ecran = {
      ...ECRANS.salon,
      note: 'écran d\'entrée : la porte y est épinglée',
      hauteurUtile: 585,
    };
    const b: Bouton = { libelle: 'X', icone: 'bulb', entite: 'light.x', note: 'pourquoi X' };
    expect(e.note).toContain('épinglée');
    expect(e.hauteurUtile).toBe(585);
    expect(b.note).toBe('pourquoi X');
  });

  it('laisse les trois écrans actuels sans note ni hauteur — les deux champs sont facultatifs',
    () => {
      for (const e of Object.values(ECRANS)) {
        expect(e.note).toBeUndefined();
        expect(e.hauteurUtile).toBeUndefined();
      }
    });
});
```

- [ ] **Step 7: Le faire échouer**

```bash
cd app && npx vitest run tests/ecran.test.ts 2>&1 | tail -20
```

Attendu : ÉCHEC de compilation — « Object literal may only specify known properties, and 'note' does not exist in type 'Ecran' ».

- [ ] **Step 8: Ajouter les champs**

Dans `app/src/ecran.ts`, sur le type `Ecran` :

```typescript
  /** Pourquoi cet écran est réglé comme il l'est. Jamais rendu ; présent dans le formulaire
   *  qui l'édite (plan 3) et dans l'export YAML, où il redevient un commentaire. Ce champ est
   *  la seule chose qui empêchera les ~300 lignes de raisonnement daté de ce fichier de
   *  disparaître le jour où la donnée partira chez Home Assistant. */
  note?: string;
  /** Hauteur utile de l'écran, en pixels CSS. Absent = 585, la valeur des Fire 7 de cette
   *  maison (viewport de référence 343×585, cf. `outils/mesurer-rendus.mjs`). Déclaré ici
   *  plutôt qu'en constante de `modes.ts` parce qu'une autre maison n'aura pas ces tablettes —
   *  c'est la conséquence directe de la portabilité (décision 4 de la spec du 2026-09-12). */
  hauteurUtile?: number;
```

Sur `Bouton`, sur `Commun` (le socle de `EntreeSynthese`) et sur `Voiture`, ajouter :

```typescript
  /** Cf. la docstring du même champ sur `Ecran`. */
  note?: string;
```

Et sur `DeclarationSource` dans `app/src/media.ts`, le même champ avec la même docstring d'une ligne.

- [ ] **Step 9: Le faire passer**

```bash
cd app && npx vitest run tests/ecran.test.ts 2>&1 | tail -5 && npm test 2>&1 | tail -5
```

Attendu : la nouvelle suite verte, et 914 tests au total (912 + 2).

- [ ] **Step 10: Mettre à jour la documentation qui nomme le fichier**

Dans `CLAUDE.md`, remplacer les trois occurrences de `app/src/pieces.ts` par `app/src/ecran.ts`, et dans la ligne « **`app/src/pieces.ts` est la seule couture vers cette maison.** » remplacer le nom du fichier sans toucher au reste de la phrase.

Dans `README.md`, faire de même pour les deux occurrences de `app/src/pieces.ts`, et ajouter sous l'encadré « Ce package est propre à UNE maison » :

```markdown
> **En cours de renversement.** La spec du 2026-09-12
> (`docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`)
> annule cette décision : la donnée part chez Home Assistant, le type reste ici.
> Ce plan-ci (1/3) ne déplace encore aucune donnée.
```

- [ ] **Step 11: Reconstruire et committer**

```bash
cd app && npm run build && cd .. && make test
git add -A
git commit -m "refactor: Piece devient Ecran, et ouvre note/hauteurUtile

Renommage mecanique (type, fichier, constante, fixture) plus deux champs
additifs. Aucun changement de comportement : 912 tests inchanges, plus 2
nouveaux sur les champs ouverts.

\`note\` est ce qui empechera les ~300 lignes de raisonnement date de ce
fichier de disparaitre quand la donnee partira chez HA (decision 6 de la
spec du 2026-09-12). \`hauteurUtile\` cesse de supposer que toute tablette
est un Fire 7 (decision 4).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `contrat/budget.json` — la règle et ses constantes quittent les commentaires

`combien()` encode aujourd'hui la règle en `if`, et ses justifications chiffrées vivent en commentaires. L'intégration Python devra rejouer exactement la même règle. Cette tâche en fait une donnée, sans rien changer au résultat.

**Files:**
- Create: `contrat/budget.json`
- Create: `contrat/README.md`
- Modify: `app/src/modes.ts` (la fonction `combien`, l. 129-140)
- Modify: `app/tsconfig.json` (`resolveJsonModule`)
- Test: `app/tests/budget.test.ts`

**Interfaces:**
- Consumes: rien de la tâche 1 (mais s'exécute après).
- Produces:
  - `contrat/budget.json`, forme exacte :
    ```json
    {
      "version": 1,
      "hauteurUtileParDefaut": 585,
      "viewportReference": { "largeur": 343, "hauteur": 585 },
      "modesSansCommande": ["minuteur"],
      "modesABlocHaut": ["media", "cinema", "voiture"],
      "commandesParDefaut": 4,
      "commandesSousBlocHaut": 2,
      "tuilesParRangee": 2,
      "mesures": {
        "rangeeAmbiance": { "px": 100, "detail": "72 px de tuiles + etiquette + 8 px de gouttiere", "date": "2026-08-29" },
        "rangeeCommandes": { "px": 74, "detail": "64 px + 10 px de gouttiere", "date": "2026-08-29" },
        "ecranModeMinuteur": { "px": 630, "detail": "liste seule, 45 px au-dela du budget", "date": "2026-08-03" },
        "ecranModeVoiture": { "px": 648, "detail": "bloc voiture a deux commandes", "date": "2026-08-03" }
      }
    }
    ```
  - `export function combien(mode: ModePrincipal, rangeeAmbiance?: boolean): number` — signature inchangée, corps réécrit.
  - `export const BUDGET` dans `app/src/modes.ts`, réexport typé du JSON, pour que la tâche 3 le consomme.

- [ ] **Step 1: Écrire le test de non-régression AVANT de toucher à `combien`**

`app/tests/budget.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { combien, ordreCommandes, BUDGET } from '../src/modes';
import { ECRANS } from '../src/ecran';

/** La table de vérité de `combien()` AVANT cette tâche, relevée dans `modes.ts` l. 129-140.
 *  Elle ne doit pas bouger d'un chiffre : c'est tout l'objet de ce test.
 *
 *  Testée sur `combien` DIRECTEMENT, et non à travers `ordreCommandes` : celui-ci prend
 *  `(commandes, contexte)` et dérive le mode du contexte lui-même (`modes.ts` l. 210), donc
 *  atteindre les neuf modes par lui demanderait de fabriquer neuf contextes — neuf occasions
 *  de tester autre chose que ce qu'on croit. `combien` est donc exporté par cette tâche. */
const ATTENDU: [string, boolean, number][] = [
  ['minuteur', true, 0], ['minuteur', false, 0],
  ['media', true, 2], ['cinema', true, 2], ['voiture', true, 2],
  ['media', false, 4], ['cinema', false, 4], ['voiture', false, 4],
  ['defaut', true, 4], ['defaut', false, 4],
  ['alerte', true, 4], ['recette', true, 4], ['menage', true, 4], ['aeration', true, 4],
];

describe('contrat/budget.json', () => {
  it('porte le budget des Fire 7 et le viewport de reference', () => {
    expect(BUDGET.hauteurUtileParDefaut).toBe(585);
    expect(BUDGET.viewportReference).toEqual({ largeur: 343, hauteur: 585 });
  });

  it('reproduit exactement la table de verite de combien()', () => {
    for (const [mode, rangeeAmbiance, places] of ATTENDU) {
      expect(combien(mode as any, rangeeAmbiance), `${mode} / ambiance=${rangeeAmbiance}`)
        .toBe(places);
    }
  });

  it('laisse ordreCommandes rendre ce qu\'il rendait', () => {
    // Deux verifications de bout en bout, reprises telles quelles de `tests/modes.test.ts`
    // (l. 159 et 177) : la table ci-dessus dit ce que `combien` promet, celles-ci disent que
    // la promesse arrive bien jusqu'a l'ecran.
    const quatre = ECRANS.bureau.commandes;
    expect(ordreCommandes(quatre, CALME_VOITURE)).toHaveLength(2);
    expect(ordreCommandes(quatre, { ...CALME_VOITURE, rangeeAmbiance: false })).toHaveLength(4);
  });
});
```

> `CALME_VOITURE` est un `ContexteModes` valant `blocDefaut: 'voiture'` et rien d'autre d'actif.
> **Le reprendre depuis `tests/modes.test.ts`** (la base `CALME` y est déjà construite, cf. son
> l. 28) plutôt que d'en fabriquer un neuf — un contexte inventé testerait autre chose.

- [ ] **Step 2: Le faire échouer**

```bash
cd app && npx vitest run tests/budget.test.ts 2>&1 | tail -20
```

Attendu : ÉCHEC — « Cannot find module '../../contrat/budget.json' ».

- [ ] **Step 3: Créer le contrat**

Créer `contrat/budget.json` avec le contenu exact donné dans **Interfaces** ci-dessus.

Créer `contrat/README.md` :

```markdown
# `contrat/` — ce que l'application et l'intégration partagent

Trois fichiers, versionnés, lus des DEUX côtés : par `app/src/` en TypeScript,
et par `custom_components/home_desk/` en Python (plan 3).

| Fichier | Écrit par | Pourquoi il est ici |
|---|---|---|
| `budget.json` | à la main | La règle de `combien()` et ses mesures. L'intégration doit pouvoir dire « cet écran déborde » AU MOMENT DE LA SAISIE, donc elle doit rejouer la même règle. |
| `icones.json` | `app/scripts/generer-contrats.mjs` | Le formulaire doit proposer les icônes RÉELLES de l'application, pas une liste recopiée qui dérive. |
| `ecran.schema.json` | à la main | Le schéma d'un écran. Deux implémentations (TypeScript, `voluptuous`), une seule vérité. |

**Rien de cette maison n'entre ici.** Pas d'`entity_id`, pas de nom de pièce :
ces fichiers partent chez toutes les maisons.

**`version`** est porté par chaque fichier. Une configuration d'une `version`
inconnue est refusée net par l'application, jamais rendue à moitié.
```

- [ ] **Step 4: Autoriser l'import de JSON**

Dans `app/tsconfig.json`, sous `compilerOptions`, ajouter :

```json
    "resolveJsonModule": true,
```

- [ ] **Step 5: Vérifier que le test passe SANS avoir touché `combien`**

```bash
cd app && npx vitest run tests/budget.test.ts 2>&1 | tail -5
```

Attendu : VERT. La table de vérité est capturée, `combien()` n'a pas bougé. C'est le filet.

- [ ] **Step 6: Réécrire `combien` en calcul sur la donnée**

Dans `app/src/modes.ts`, remplacer le corps de `combien` (l. 129-140) en **gardant intégralement la docstring existante** et en lui ajoutant :

```typescript
import BUDGET from '../../contrat/budget.json';

export { BUDGET };

/** [docstring existante, conservée telle quelle]
 *
 *  2026-09-12 : la règle et ses chiffres vivent désormais dans `contrat/budget.json`, lu aussi
 *  par l'intégration Home Assistant (plan 3) — elle doit pouvoir dire « cet écran déborde » au
 *  moment de la saisie, ce qu'elle ne peut pas faire en relisant des `if` TypeScript. Le
 *  RÉSULTAT est strictement inchangé : `tests/budget.test.ts` porte la table de vérité d'avant
 *  et la vérifie à chaque commit. */
export function combien(mode: ModePrincipal, rangeeAmbiance = true): number {
  if ((BUDGET.modesSansCommande as string[]).includes(mode)) return 0;
  const blocHaut = (BUDGET.modesABlocHaut as string[]).includes(mode);
  return blocHaut && rangeeAmbiance
    ? BUDGET.commandesSousBlocHaut
    : BUDGET.commandesParDefaut;
}
```

- [ ] **Step 7: Vérifier que rien n'a changé**

```bash
cd app && npx tsc --noEmit && npm test 2>&1 | tail -5
```

Attendu : 914 tests + les 2 de `budget.test.ts` = 916, tous verts. **Aucune valeur attendue n'a été modifiée dans `tests/modes.test.ts`** — si une l'a été, la tâche a échoué.

- [ ] **Step 8: Reconstruire et committer**

```bash
cd app && npm run build && cd .. && make test
git add -A
git commit -m "refactor(modes): la regle de combien() devient contrat/budget.json

Les chiffres quittent les commentaires pour une donnee versionnee, lisible
par l'integration Python du plan 3 — elle doit pouvoir dire « cet ecran
deborde » au moment de la saisie, ce qu'elle ne peut pas faire en relisant
des if TypeScript.

Resultat strictement inchange : tests/budget.test.ts capture la table de
verite d'avant (14 couples mode/ambiance) et la verifie a chaque commit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Mesurer les hauteurs par bloc, et n'honorer `hauteurUtile` que si on le peut

**Le problème que cette tâche résout, et qu'il ne faut pas contourner.** `hauteurUtile` a été ajouté à `Ecran` (tâche 1), mais **`combien()` ne sait pas s'en servir** : il applique une table (0/2/4) calibrée pour 585 px, il ne calcule rien. Or les hauteurs par bloc n'ont **jamais été mesurées** — les commentaires de `modes.ts` ne donnent que des totaux d'écran (630 px pour `minuteur`, 648 px pour `voiture`). Inventer un modèle de hauteurs pour faire semblant de calculer serait la pire issue possible : l'intégration refuserait ou accepterait des compositions sur des chiffres faux.

Cette tâche mesure pour de vrai, puis **s'arrête net si le modèle ne reproduit pas la table existante**.

**Files:**
- Create: `app/outils/mesurer-hauteurs.mjs`
- Modify: `contrat/budget.json` (ajout de `hauteurs`)
- Modify: `app/src/modes.ts` (`combien`)
- Modify: `app/src/rendu/corps.ts` (attribut `data-zone` sur les zones mesurées)
- Test: `app/tests/budget.test.ts` (cas `hauteurUtile`)

**Interfaces:**
- Consumes: `BUDGET` et `combien()` de la tâche 2 ; `Ecran.hauteurUtile` de la tâche 1.
- Produces:
  - `contrat/budget.json` gagne une clé `hauteurs: Record<string, number>` — une entrée par zone mesurée (`bandeau`, `synthese`, `blocDefaut`, `blocHaut`, `blocMinuteur`, `rangeeAmbiance`, `rangeeCommandes`, `gouttiere`).
  - `combien(mode, rangeeAmbiance, hauteurUtile?)` — **troisième paramètre facultatif**, défaut `BUDGET.hauteurUtileParDefaut`.
  - `export class BudgetIntenable extends Error` dans `app/src/modes.ts`, levée quand aucune composition ne tient.

- [ ] **Step 1: Marquer les zones à mesurer**

Dans `app/src/rendu/corps.ts`, ajouter un attribut `data-zone` sur quatre conteneurs, **sans toucher aux classes CSS ni à la structure**. L'attribut ne sert qu'à la mesure, et il est inerte pour le rendu.

Les ancrages, relevés le 2026-09-12 :

| Zone | Élément à marquer | Où le trouver |
|---|---|---|
| `bandeau` | la racine rendue par `rendreBandeau` | `app/src/rendu/bandeau.ts`, le `html\`` de premier niveau |
| `synthese` | le conteneur de la ligne de synthèse | `app/src/rendu/corps.ts`, le bloc qui consomme le retour de `ligneSynthese` |
| `ambiances` | le `<div class="groupe" style="--ambiances: …">` | `corps.ts` ~l. 415, sous la condition `piece.ambiances.length \|\| tuileMinuteur` |
| `commandes` | chaque `<div class="groupe">` de la rangée de commandes | `corps.ts` ~l. 455, sous `commandes.length ? …` |
| `blocCentral` | le conteneur du bloc central, quel que soit le mode | `corps.ts`, entre les deux précédents |

Exemple, sur la rangée d'ambiance :

```html
<div class="groupe" data-zone="ambiances" style="--ambiances: ${piece.ambiances.length + (tuileMinuteur ? 1 : 0)}">
```

> Si l'un de ces conteneurs n'existe pas sous la forme attendue, **le marquer là où il est
> réellement** et corriger ce tableau dans le plan — la structure a pu bouger depuis le relevé.

> `data-mvt` existe déjà sur certains blocs (`rendu/corps.ts` l. 50 et 62 : `bloc:alerte`, `bloc:hors-ligne`) et sert au moteur de mouvement. **Ne pas le réutiliser** : deux consommateurs sur un même attribut, c'est un couplage qu'on paierait au premier changement d'animation.

- [ ] **Step 2: Vérifier que l'attribut n'a rien cassé**

```bash
cd app && npm test 2>&1 | tail -5
```

Attendu : 916 tests verts. Un attribut de données ne change aucun rendu attendu.

- [ ] **Step 3: Écrire l'outil de mesure**

`app/outils/mesurer-hauteurs.mjs` — modelé sur `mesurer-rendus.mjs` (même récupération de jetons par `NIVUUS_HA_DATA`, même viewport) :

```javascript
#!/usr/bin/env node
/** Mesure la HAUTEUR RENDUE de chaque zone de l'écran, par mode, dans un vrai navigateur.
 *
 *  Pourquoi cet outil existe : `contrat/budget.json` porte une RÈGLE (0/2/4 commandes) calibrée
 *  pour les 585 px des Fire 7, pas un modèle de hauteurs. L'intégration Home Assistant (plan 3)
 *  doit pouvoir dire « cet écran déborde de tant » pour une tablette QUELCONQUE — ce qui exige
 *  de connaître ce que chaque zone coûte. Ces chiffres n'ont jamais été mesurés : les
 *  commentaires de `modes.ts` ne donnent que des totaux d'écran (630 px, 648 px).
 *
 *  Usage : NIVUUS_HA_DATA=<repertoire de donnees HA> node outils/mesurer-hauteurs.mjs <piece>
 *  Sortie : du JSON sur stdout, à recopier dans `contrat/budget.json` sous `hauteurs`.
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const DATA = (process.env.NIVUUS_HA_DATA ?? '').replace(/\/$/, '');
if (!DATA) {
  console.error('NIVUUS_HA_DATA n\'est pas defini.');
  process.exit(2);
}
const piece = process.argv[2] ?? 'salon';
const mcp = JSON.parse(readFileSync(`${DATA}/.mcp.json`, 'utf8')).mcpServers.homeassistant.env;
const HA_URL = mcp.HA_URL.replace(/\/$/, '');
const jetons = {
  access_token: mcp.HA_TOKEN,
  refresh_token: 'mesure-sans-rafraichissement',
  expires: Date.now() + 31536000000,
  clientId: `${HA_URL}/`,
};

const nav = await chromium.launch({ headless: true });
const ctx = await nav.newContext({ viewport: { width: 343, height: 585 } });
await ctx.addInitScript((j) => localStorage.setItem('hassTokens', JSON.stringify(j)), jetons);
const page = await ctx.newPage();
await page.goto(`${HA_URL}/local/wallpanel/${piece}.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-zone]', { timeout: 15000 });

const hauteurs = await page.evaluate(() => {
  const parZone = {};
  for (const el of document.querySelectorAll('[data-zone]')) {
    const zone = el.getAttribute('data-zone');
    const h = Math.round(el.getBoundingClientRect().height);
    // Plusieurs rangees de commandes : on garde la hauteur d'UNE rangee, pas leur somme.
    parZone[zone] = parZone[zone] === undefined ? h : Math.min(parZone[zone], h);
  }
  return parZone;
});

console.log(JSON.stringify({ piece, viewport: '343x585', hauteurs }, null, 2));
await nav.close();
```

- [ ] **Step 4: Mesurer les trois écrans**

```bash
cd app
for p in salon bureau cuisine; do
  NIVUUS_HA_DATA=/opt/nivuus/home-manager node outils/mesurer-hauteurs.mjs $p
done
```

> Si `NIVUUS_HA_DATA` ne trouve pas de `.mcp.json`, chercher le bon répertoire de données (`ls -d /opt/nivuus/*/ | xargs -I{} ls {}.mcp.json 2>/dev/null`). **Ne pas inventer les chiffres si l'outil ne tourne pas** : passer à l'étape 8.

- [ ] **Step 5: Poser les mesures dans le contrat**

Ajouter à `contrat/budget.json` :

```json
  "hauteurs": {
    "_source": "app/outils/mesurer-hauteurs.mjs, viewport 343x585, mesure du 2026-09-12",
    "bandeau": 0,
    "synthese": 0,
    "blocCentral": 0,
    "rangeeAmbiance": 0,
    "rangeeCommandes": 0
  }
```

en remplaçant chaque `0` par la valeur mesurée (prendre la **plus grande** des trois pièces pour chaque zone — c'est le pire cas, et le budget doit tenir au pire cas).

- [ ] **Step 6: Écrire le test du calcul**

Ajouter à `app/tests/budget.test.ts` :

```typescript
import { combien, BudgetIntenable } from '../src/modes';

describe('hauteurUtile', () => {
  it('rend exactement la table historique pour 585 px', () => {
    expect(combien('media', true, 585)).toBe(2);
    expect(combien('defaut', true, 585)).toBe(4);
    expect(combien('minuteur', true, 585)).toBe(0);
  });

  it('rend moins de commandes sur un ecran plus court', () => {
    const court = 585 - BUDGET.hauteurs.rangeeCommandes * 2;
    expect(combien('defaut', true, court)).toBeLessThan(combien('defaut', true, 585));
  });

  it('leve BudgetIntenable quand meme zero commande ne tient pas', () => {
    expect(() => combien('defaut', true, 100)).toThrow(BudgetIntenable);
  });
});
```

- [ ] **Step 7: Faire passer le test**

Réécrire `combien` en calcul :

```typescript
export class BudgetIntenable extends Error {}

export function combien(
  mode: ModePrincipal,
  rangeeAmbiance = true,
  hauteurUtile = BUDGET.hauteurUtileParDefaut,
): number {
  if ((BUDGET.modesSansCommande as string[]).includes(mode)) return 0;
  const h = BUDGET.hauteurs;
  let reste = hauteurUtile - h.bandeau - h.synthese - h.blocCentral;
  if (rangeeAmbiance) reste -= h.rangeeAmbiance;
  if (reste < 0) throw new BudgetIntenable(
    `${mode} ne tient pas dans ${hauteurUtile} px, meme sans commande`);
  const rangees = Math.min(Math.floor(reste / h.rangeeCommandes), 2);
  return rangees * BUDGET.tuilesParRangee;
}
```

- [ ] **Step 8: LA PORTE — le modèle reproduit-il la table historique ?**

```bash
cd app && npm test 2>&1 | tail -20
```

**Deux issues, et une seule est acceptable sans décision humaine :**

- **Les 916 tests passent, y compris `tests/modes.test.ts` inchangé** → le modèle mesuré reproduit exactement la table historique. Continuer à l'étape 9.
- **Un seul test de `modes.test.ts` change de valeur** → le modèle NE reproduit PAS la règle existante. **S'ARRÊTER.** Ne pas ajuster les mesures pour faire passer les tests — ce serait truquer la mesure. Annuler `combien` à sa version de la tâche 2 (`git checkout app/src/modes.ts`), garder les mesures dans `contrat/budget.json` comme documentation, et **remonter le constat** : le budget reste une table, `hauteurUtile` reste déclaratif, et la validation Python du plan 3 se limitera à « ce mode a-t-il zéro place ». C'est un résultat, pas un échec.

- [ ] **Step 9: Reconstruire et committer**

```bash
cd app && npm run build && cd .. && make test
git add -A
git commit -m "feat(budget): mesurer les hauteurs par zone, et honorer hauteurUtile

Les hauteurs par bloc n'avaient JAMAIS ete mesurees : modes.ts ne donnait
que des totaux d'ecran (630 px en mode minuteur, 648 en mode voiture).
Sans elles, hauteurUtile ne pouvait pas etre autre chose qu'un champ
declaratif, et l'integration du plan 3 n'aurait pu valider une composition
que sur des chiffres inventes.

outils/mesurer-hauteurs.mjs mesure les zones dans un vrai navigateur au
viewport de reference. combien() devient un calcul, et reproduit la table
historique a l'identique — c'etait la condition d'acceptation.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `contrat/icones.json` publié par le build

Le formulaire de l'intégration (plan 3) doit proposer les icônes **réelles** de l'application. Une liste recopiée à la main dériverait au premier ajout — et `icones.ts` en a déjà reçu quatre après coup (`scan`, `horsligne`, `case`, `coche`), chaque fois pour éviter le repli trompeur sur `cloudy`.

**Files:**
- Create: `app/scripts/generer-contrats.mjs`
- Create: `contrat/icones.json`
- Modify: `app/package.json` (script `build`)
- Modify: `tests/test_dist_a_jour.py` (étendre la vérification à `contrat/`)
- Test: `app/tests/contrat-icones.test.ts`

**Interfaces:**
- Consumes: `contrat/README.md` de la tâche 2.
- Produces: `contrat/icones.json`, forme `{ "version": 1, "icones": string[] }`, trié alphabétiquement.

- [ ] **Step 1: Écrire le test de synchronisation**

`app/tests/contrat-icones.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { CHEMINS } from '../src/rendu/icones';
import CONTRAT from '../../contrat/icones.json';

describe('contrat/icones.json', () => {
  it('liste exactement les icones que l\'application sait dessiner', () => {
    expect(CONTRAT.icones).toEqual(Object.keys(CHEMINS).sort());
  });

  it('contient les quatre ajoutees apres coup, qui existent pour eviter le repli sur cloudy', () => {
    for (const nom of ['scan', 'horsligne', 'case', 'coche']) {
      expect(CONTRAT.icones).toContain(nom);
    }
  });
});
```

- [ ] **Step 2: Le faire échouer**

```bash
cd app && npx vitest run tests/contrat-icones.test.ts 2>&1 | tail -10
```

Attendu : ÉCHEC — « Cannot find module '../../contrat/icones.json' ».

- [ ] **Step 3: Écrire le générateur**

`app/scripts/generer-contrats.mjs` :

```javascript
/** Publie sous `contrat/` ce que l'intégration Home Assistant doit connaître de l'application.
 *
 *  Pour l'instant : la liste des icônes. Elle est DÉRIVÉE de `src/rendu/icones.ts`, jamais
 *  recopiée — ce fichier a déjà reçu quatre icônes après coup (`scan`, `horsligne`, `case`,
 *  `coche`), chaque fois pour éviter qu'une tuile ne retombe sur `cloudy`, le repli par défaut
 *  de `icone()`. Une liste tenue à la main aurait raté les quatre.
 *
 *  Ce script tourne sous node AVANT toute compilation TypeScript, comme `generer-pages.mjs` :
 *  il lit donc le SOURCE, par expression régulière, et n'importe rien.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, '..', 'src', 'rendu', 'icones.ts');
const SORTIE = join(ICI, '..', '..', 'contrat');

const source = readFileSync(SOURCE, 'utf8');
const debut = source.indexOf('export const CHEMINS');
if (debut < 0) throw new Error('CHEMINS introuvable dans src/rendu/icones.ts');

// Une icone par ligne, sous la forme `  nom: svg`...`,` — les lignes de commentaire n'en ont pas.
const icones = [...source.slice(debut).matchAll(/^ {2}([a-z][a-z0-9]*): svg`/gm)]
  .map((m) => m[1])
  .sort();

if (icones.length === 0) throw new Error('aucune icone reconnue — le motif a-t-il change ?');

mkdirSync(SORTIE, { recursive: true });
writeFileSync(join(SORTIE, 'icones.json'),
  JSON.stringify({ version: 1, icones }, null, 2) + '\n');
console.log(`contrats : ${icones.length} icones -> ${SORTIE}/icones.json`);
```

- [ ] **Step 4: Le brancher au build**

Dans `app/package.json`, dans le script `build`, insérer `generer-contrats` avant `versionner` :

```json
    "contrats": "node scripts/generer-contrats.mjs",
    "build": "npm run jetons && rollup -c && npm run assets && node scripts/generer-pages.mjs && npm run contrats && node scripts/versionner.mjs",
```

- [ ] **Step 5: Générer et vérifier**

```bash
cd app && npm run contrats && cat ../contrat/icones.json | head -8
cd app && npx vitest run tests/contrat-icones.test.ts 2>&1 | tail -5
```

Attendu : le fichier existe, la suite est VERTE. Si le compte d'icônes paraît faible, l'expression régulière a raté des lignes — vérifier contre `grep -c ': svg`' src/rendu/icones.ts`.

- [ ] **Step 6: Empêcher que `contrat/` devienne périmé**

Dans `tests/test_dist_a_jour.py`, étendre la vérification. Remplacer :

```python
ecarts = subprocess.run(["git", "-C", str(REPO), "status", "--porcelain", "dist"],
                        capture_output=True, text=True, check=True).stdout.strip()
```

par :

```python
# `contrat/` est produit par le meme build que `dist/` (npm run contrats), et il est lu par
# l'integration Home Assistant. Un contrat perime est pire qu'un bundle perime : il ferait
# proposer a l'operateur des icones que l'application ne sait plus dessiner.
ecarts = subprocess.run(["git", "-C", str(REPO), "status", "--porcelain", "dist", "contrat"],
                        capture_output=True, text=True, check=True).stdout.strip()
```

Et dans le message d'erreur, remplacer `dist/ commite ne correspond PAS` par `dist/ ou contrat/ ne correspond PAS`.

- [ ] **Step 7: Vérifier l'ensemble**

```bash
cd app && npm run build && npm test 2>&1 | tail -5
cd .. && make test
```

Attendu : tests verts des deux côtés, et `make test` ne signale aucun écart.

- [ ] **Step 8: Committer**

```bash
git add -A
git commit -m "feat(contrat): publier la liste des icones au build

Le formulaire de l'integration (plan 3) doit proposer les icones REELLES
de l'application. icones.ts en a deja recu quatre apres coup (scan,
horsligne, case, coche), chaque fois pour eviter qu'une tuile ne retombe
sur cloudy : une liste tenue a la main aurait rate les quatre.

test_dist_a_jour.py couvre desormais contrat/ aussi — un contrat perime
ferait proposer des icones que l'application ne sait plus dessiner.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `contrat/ecran.schema.json` et sa validation

Le schéma est la pièce que l'intégration Python et l'application devront interpréter pareil. Cette tâche l'écrit et le prouve **contre les trois écrans réels** — la meilleure preuve disponible qu'il décrit bien ce qui existe.

**Files:**
- Create: `contrat/ecran.schema.json`
- Modify: `app/package.json` (`ajv` en devDependency)
- Test: `app/tests/contrat-schema.test.ts`

**Interfaces:**
- Consumes: `ECRANS` (tâche 1), `contrat/README.md` (tâche 2).
- Produces: `contrat/ecran.schema.json`, JSON Schema draft 2020-12, `$id: "https://nivuus.dev/contrat/ecran/1"`.
  - `agencement` y est **facultatif** : la donnée d'aujourd'hui ne le porte pas encore (c'est le plan 2), et la résolution côté intégration le remplira par défaut. Le rendre obligatoire maintenant ferait échouer le seul jeu de données qui existe.

- [ ] **Step 1: Installer `ajv`**

```bash
cd app && npm install --save-dev ajv@^8.17.1
```

- [ ] **Step 2: Écrire le test**

`app/tests/contrat-schema.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import { ECRANS } from '../src/ecran';
import SCHEMA from '../../contrat/ecran.schema.json';

const valider = new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA);

describe('contrat/ecran.schema.json', () => {
  it('accepte les trois ecrans reels', () => {
    for (const [nom, ecran] of Object.entries(ECRANS)) {
      const ok = valider(ecran);
      expect(ok, `${nom} : ${JSON.stringify(valider.errors)}`).toBe(true);
    }
  });

  it('refuse un seuil chaine sous un operateur d\'ordre', () => {
    const casse = {
      ...ECRANS.bureau,
      synthese: [{ entite: 'sensor.x', operateur: '<', valeur: '35', texte: 'x' }],
    };
    expect(valider(casse)).toBe(false);
  });

  it('refuse une hauteur utile absurde', () => {
    expect(valider({ ...ECRANS.salon, hauteurUtile: 12 })).toBe(false);
  });

  it('accepte une note sur l\'ecran et sur un bouton', () => {
    const annote = {
      ...ECRANS.salon,
      note: 'ecran d\'entree',
      commandes: ECRANS.salon.commandes.map((b, i) =>
        i === 0 ? { ...b, note: 'pourquoi celle-ci' } : b),
    };
    expect(valider(annote), JSON.stringify(valider.errors)).toBe(true);
  });

  it('refuse une entite qui n\'a pas la forme domaine.objet', () => {
    expect(valider({ ...ECRANS.salon, temperature: 'pas_un_entity_id' })).toBe(false);
  });
});
```

- [ ] **Step 3: Le faire échouer**

```bash
cd app && npx vitest run tests/contrat-schema.test.ts 2>&1 | tail -10
```

Attendu : ÉCHEC — module `../../contrat/ecran.schema.json` introuvable.

- [ ] **Step 4: Écrire le schéma**

`contrat/ecran.schema.json` :

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://nivuus.dev/contrat/ecran/1",
  "title": "Un ecran mural",
  "type": "object",
  "required": ["nom", "temperature", "ambiances", "commandes", "synthese",
               "extrasMaison", "sources", "ouvrants"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "nom": { "type": "string", "minLength": 1 },
    "note": { "type": "string" },
    "hauteurUtile": { "type": "integer", "minimum": 320, "maximum": 4000 },
    "temperature": { "$ref": "#/$defs/entite" },
    "ambiances": { "type": "array", "items": { "$ref": "#/$defs/bouton" } },
    "commandes": { "type": "array", "items": { "$ref": "#/$defs/bouton" } },
    "extrasMaison": { "type": "array", "items": { "$ref": "#/$defs/bouton" } },
    "aspirateurMaison": { "$ref": "#/$defs/bouton" },
    "synthese": { "type": "array", "items": { "$ref": "#/$defs/synthese" } },
    "sources": { "type": "array", "items": { "$ref": "#/$defs/source" } },
    "ouvrants": { "type": "array", "items": { "$ref": "#/$defs/entite" } },
    "aspirateur": { "$ref": "#/$defs/entite" },
    "listesTachesExtra": { "type": "array", "items": { "$ref": "#/$defs/entite" } },
    "minuteurs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["timer", "nom"],
        "additionalProperties": false,
        "properties": {
          "timer": { "$ref": "#/$defs/entite" },
          "nom": { "$ref": "#/$defs/entite" },
          "note": { "type": "string" }
        }
      }
    },
    "etiquettesMinuteur": { "type": "array", "items": { "type": "string" } },
    "voiture": {
      "type": "object",
      "required": ["batterie", "autonomie", "branchee", "enCharge", "clim",
                   "demarrerClim", "arreterClim"],
      "additionalProperties": false,
      "properties": {
        "batterie": { "$ref": "#/$defs/entite" },
        "autonomie": { "$ref": "#/$defs/entite" },
        "branchee": { "$ref": "#/$defs/entite" },
        "enCharge": { "$ref": "#/$defs/entite" },
        "clim": { "$ref": "#/$defs/entite" },
        "demarrerClim": { "$ref": "#/$defs/entite" },
        "arreterClim": { "$ref": "#/$defs/entite" },
        "note": { "type": "string" }
      }
    },
    "blocDefaut": { "enum": ["voiture", "repas", "agenda", "entretien", "previsions"] },
    "delorean": { "const": true },
    "agencement": { "$ref": "#/$defs/agencement" }
  },
  "$defs": {
    "entite": {
      "type": "string",
      "pattern": "^[a-z_]+\\.[a-z0-9_]+$",
      "description": "Un entity_id Home Assistant : domaine.objet, minuscules."
    },
    "bouton": {
      "type": "object",
      "required": ["libelle", "icone", "entite"],
      "additionalProperties": false,
      "properties": {
        "libelle": { "type": "string", "minLength": 1 },
        "icone": { "type": "string", "minLength": 1 },
        "entite": { "$ref": "#/$defs/entite" },
        "cible": { "$ref": "#/$defs/entite" },
        "service": {
          "type": "array", "minItems": 2, "maxItems": 2,
          "items": { "type": "string", "minLength": 1 }
        },
        "lien": { "type": "string" },
        "vue": { "type": "string", "pattern": "^#" },
        "epingle": { "const": true },
        "absenceNommee": { "type": "string" },
        "note": { "type": "string" }
      }
    },
    "synthese": {
      "type": "object",
      "required": ["entite", "texte", "operateur", "valeur"],
      "additionalProperties": false,
      "properties": {
        "entite": { "$ref": "#/$defs/entite" },
        "texte": { "type": "string", "minLength": 1 },
        "operateur": { "enum": ["==", "!=", "<", ">"] },
        "valeur": {},
        "perso": { "const": true },
        "horsTaches": { "const": true },
        "note": { "type": "string" }
      },
      "allOf": [
        {
          "if": { "properties": { "operateur": { "enum": ["<", ">"] } }, "required": ["operateur"] },
          "then": { "properties": { "valeur": { "type": "number" } } }
        },
        {
          "if": { "properties": { "operateur": { "enum": ["==", "!="] } }, "required": ["operateur"] },
          "then": { "properties": { "valeur": { "type": ["string", "number"] } } }
        }
      ]
    },
    "source": {
      "type": "object",
      "required": ["nom", "titre", "sousTitre", "affiche", "progression", "transport", "volume"],
      "additionalProperties": false,
      "properties": {
        "nom": { "type": "string", "minLength": 1 },
        "titre": { "type": "array", "items": { "$ref": "#/$defs/entite" } },
        "sousTitre": { "type": "array", "items": { "$ref": "#/$defs/entite" } },
        "affiche": { "type": "array", "items": { "$ref": "#/$defs/entite" } },
        "progression": { "type": "array", "items": { "$ref": "#/$defs/entite" } },
        "transport": { "type": "array", "items": { "$ref": "#/$defs/entite" } },
        "volume": { "type": "array", "items": { "$ref": "#/$defs/entite" } },
        "allumee": {
          "type": "object",
          "required": ["entite", "etats"],
          "additionalProperties": false,
          "properties": {
            "entite": { "$ref": "#/$defs/entite" },
            "etats": { "type": "array", "items": { "type": "string" } }
          }
        },
        "note": { "type": "string" }
      }
    },
    "agencement": {
      "description": "Facultatif tant que le plan 2 ne l'a pas porte dans la donnee. La resolution cote integration le remplit par defaut.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "zones": {
          "type": "array",
          "uniqueItems": true,
          "items": { "enum": ["synthese", "blocCentral", "ambiances", "commandes"] },
          "contains": { "const": "commandes" }
        },
        "blocDefaut": { "enum": ["voiture", "repas", "agenda", "entretien", "previsions"] },
        "modes": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "enum": ["alerte", "recette", "minuteur", "menage", "cinema",
                     "media", "aeration", "voiture", "defaut"]
          },
          "contains": { "const": "defaut" }
        },
        "modulateurs": {
          "type": "array",
          "uniqueItems": true,
          "items": { "enum": ["invites", "chaleur", "delorean"] }
        },
        "note": { "type": "string" }
      }
    }
  }
}
```

- [ ] **Step 5: Le faire passer**

```bash
cd app && npx vitest run tests/contrat-schema.test.ts 2>&1 | tail -30
```

Attendu : VERT. **Si un des trois écrans réels est refusé, le schéma a tort, pas la donnée** : lire l'erreur d'`ajv`, corriger le schéma. C'est exactement à ça que sert ce test.

> Piège connu : `Voiture` et `SlotMinuteur` n'ont pas encore de champ `note` dans le schéma si la tâche 1 ne l'a pas ajouté au type. Vérifier la cohérence entre `app/src/ecran.ts` et le schéma avant de conclure.

- [ ] **Step 6: Vérifier l'ensemble et committer**

```bash
cd app && npm run build && npm test 2>&1 | tail -5
cd .. && make test
git add -A
git commit -m "feat(contrat): le schema d'un ecran, prouve contre les trois reels

JSON Schema draft 2020-12, lu par l'application (ajv) et bientot par
l'integration (voluptuous). L'union discriminee de EntreeSynthese y est
rejouee en if/then : un seuil '35' entre guillemets sous un operateur
d'ordre est refuse, comme TypeScript le refusait deja.

agencement y est FACULTATIF : la donnee d'aujourd'hui ne le porte pas
encore (plan 2). Le rendre obligatoire ferait echouer le seul jeu de
donnees qui existe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## À la fin de ce plan

- L'application affiche **exactement** ce qu'elle affichait, prouvé par 912 tests inchangés.
- `contrat/` porte trois fichiers que l'intégration Python du plan 3 lira sans rien recopier.
- `Ecran` porte `note` et `hauteurUtile` ; aucune donnée n'a encore quitté le dépôt.
- Une inconnue a été levée ou nommée : les hauteurs par zone sont mesurées, ou l'on sait qu'elles ne suffisent pas et pourquoi (tâche 3, étape 8).

**Ce qui suit :** plan 2 (`agencement` porté par la donnée, `rendreCorps` en assembleur), puis plan 3 (l'intégration, le transport, la migration, la mise en production).
