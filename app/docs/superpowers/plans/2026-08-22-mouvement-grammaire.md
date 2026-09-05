# Grammaire de mouvement — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner un geste à tout ce qui apparaît ou disparaît sur les trois tablettes murales, avec un moteur plus petit qu'aujourd'hui.

**Architecture:** On retire deux mécanismes entiers — le régulateur de cadence et le balayage de tuile — puis on remplace les cinq courbes de `grammaire.ts` par deux (spatial et effets, les deux familles de ressorts MD3 Expressive approximées en `cubic-bezier`, seule syntaxe que Chrome 100 comprenne). Une règle d'imbrication empêche l'exhaustivité de coûter deux fois, et un contrôle dans `verifier-rendu.mjs` interdit qu'un futur élément reparte sans marque.

**Tech Stack:** TypeScript, `lit`, Web Animations API, vitest (jsdom), rollup, playwright-core.

**Spec:** `docs/superpowers/specs/2026-08-22-mouvement-grammaire-design.md`

## Global Constraints

- **Cadre 343 × 585 px, marge nulle.** La hauteur totale ne bouge jamais : on remplace un bloc, on n'en ajoute jamais un.
- **Seuls `transform` et `opacity` sont animés par le moteur.** Aucune animation de `width`, `height`, `top` ni `filter`. Exception unique et déjà en place : le fondu de palette (`PALETTE_MS`).
- **Cibles tactiles ≥ 62 px, contraste texte/fond ≥ 5:1.** Vérifiés automatiquement par `outils/verifier-rendu.mjs`.
- **Moteur cible : Chrome 100** (WebView des Fire 7). Pas de `linear()` en easing, pas de `:has()`, pas de `dvh`, pas de nesting CSS.
- **Le retour au contact (`:active`) reste hors moteur et instantané.** C'est la contrainte pour laquelle ce projet existe.
- **`npm run build` DÉPLOIE en production.** Un vérificateur ne déploie pas ; un build, si. Aucune tâche de ce plan ne lance `npm run build` sauf la dernière.
- **Les commits sont écrits dans le plan mais soumis au propriétaire** : ne pas pousser sans son accord explicite.
- **Toute commande se lance depuis `tools/wallpanel-app`**, jamais depuis la racine du dépôt.

---

### Task 1: Retirer le régulateur de cadence

Le moteur mesure la cadence de chaque transition et dégrade les rôles qui passent sous 30 im/s. Le défaut documenté dans `moteur.ts` (bloc « I6 ») fait tomber *tous* les rôles mesurés pendant une trame longue, sans retour avant rechargement. Décision du propriétaire : suppression complète.

**Files:**
- Modify: `src/mouvement.ts` (réduire à `Niveau` + `niveauDemande` + `degrader` retiré)
- Modify: `src/mouvement/moteur.ts` (retirer `compteur`, `mesurer`, `niveaux`, `niveauDe`, `degraderRole`, `actifRole`, `MARGE_TRAME_MS`)
- Modify: `src/mouvement/marques.ts` (le paramètre `actif` de `lireMarques` disparaît)
- Modify: `src/demarrage.ts:1186` (retirer `window.__niveauDe`)
- Modify: `outils/verifier-rendu.mjs` (retirer la lecture de `__niveauDe`)
- Test: `tests/mouvement.test.ts`, `tests/moteur.test.ts`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: `type Niveau = 'complet' | 'sobre' | 'aucun'` et `niveauDemande(url: string, mouvementReduit: boolean): Niveau` restent exportés depuis `src/mouvement.ts`. `creerMoteur(racine, options)` conserve `rendre`, `positionDe`, `tailleDe`, `animer`, `estMasquee`, `minuteurFn`, `decoder`, `niveauInitial` ; perd `mesurer`. `Moteur` conserve `peindre`, `actif`, `basculerPalette`, `oublier` ; perd `niveauDe` et `degraderRole`.

- [ ] **Step 1: Écrire le test qui verrouille la réduction de `mouvement.ts`**

Remplacer intégralement `tests/mouvement.test.ts` par :

```typescript
import { describe, it, expect } from 'vitest';
import { niveauDemande } from '../src/mouvement';

describe('niveauDemande', () => {
  it('rend « complet » quand rien ne le contredit', () => {
    expect(niveauDemande('http://x/salon.html', false)).toBe('complet');
  });

  it('lit le niveau dans le paramètre d’URL — réglable depuis Fully sans reconstruire', () => {
    expect(niveauDemande('http://x/salon.html?mouvement=sobre', false)).toBe('sobre');
    expect(niveauDemande('http://x/salon.html?mouvement=aucun', false)).toBe('aucun');
  });

  it('ignore une valeur inconnue au lieu de lever — un mur ne meurt pas d’une faute de frappe', () => {
    expect(niveauDemande('http://x/salon.html?mouvement=turbo', false)).toBe('complet');
  });

  it('donne la priorité à prefers-reduced-motion sur tout le reste', () => {
    expect(niveauDemande('http://x/salon.html?mouvement=complet', true)).toBe('aucun');
  });

  it('n’exporte plus rien du régulateur retiré', async () => {
    const m = await import('../src/mouvement');
    for (const nom of ['Compteur', 'mesurer', 'PLANCHER_FPS', 'degrader']) {
      expect(m, `${nom} devrait avoir disparu avec le régulateur`).not.toHaveProperty(nom);
    }
  });
});
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run tests/mouvement.test.ts`
Expected: FAIL — le dernier cas trouve encore `Compteur`, `mesurer`, `PLANCHER_FPS` et `degrader`.

- [ ] **Step 3: Réduire `src/mouvement.ts` à son seul rôle restant**

Remplacer intégralement le contenu de `src/mouvement.ts` par :

```typescript
/** Le niveau de mouvement demandé au montage, et rien d'autre.
 *
 *  Ce fichier portait aussi, jusqu'au 2026-08-22, un régulateur de cadence : il mesurait les images
 *  réellement peintes pendant chaque transition et faisait tomber d'un cran les rôles passés sous
 *  30 im/s. Il a été retiré sur décision du propriétaire, parce qu'il éteignait l'écran entier au
 *  lieu du rôle fautif — `consommerSaccadees()` rendait TOUS les noms tombés pendant la même trame,
 *  et une trame longue (rafale de `state_changed`, ramassage mémoire, réveil d'écran) les faisait
 *  donc tous tomber ensemble. Deux épisodes suffisaient à mettre le mur à `aucun`, sans retour
 *  avant rechargement de la page — et la tablette du bureau n'a ni `tabReloadTimer` ni
 *  `clearCacheOnReload`.
 *
 *  Le repli manuel demeure et suffit : `?mouvement=sobre` se pose depuis Fully Kiosk en quelques
 *  secondes, sans reconstruire ni redéployer quoi que ce soit. */

export type Niveau = 'complet' | 'sobre' | 'aucun';

const NIVEAUX: Niveau[] = ['complet', 'sobre', 'aucun'];

/** `prefers-reduced-motion` prime sur tout — c'est une préférence système, pas une option de
 *  l'application. Une valeur inconnue est ignorée, jamais une erreur : un écran mural ne doit pas
 *  mourir d'une faute de frappe dans une URL. */
export function niveauDemande(url: string, mouvementReduit: boolean): Niveau {
  if (mouvementReduit) return 'aucun';
  const brut = new URL(url).searchParams.get('mouvement');
  return NIVEAUX.includes(brut as Niveau) ? (brut as Niveau) : 'complet';
}
```

- [ ] **Step 4: Retirer le régulateur de `moteur.ts`**

Dans `src/mouvement/moteur.ts` :

1. L'import devient :

```typescript
import { niveauDemande, type Niveau } from '../mouvement';
```

2. Supprimer de `OptionsMoteur` le champ `mesurer` et son commentaire.
3. Supprimer de `Moteur` les champs `niveauDe` et `degraderRole` et leurs commentaires.
4. Supprimer les déclarations `const niveaux`, `const degraderRole`, `const actifRole`, `const compteur`, `const mesurer`, `const MARGE_TRAME_MS`.
5. Remplacer `const niveauDe = (r: Role): Niveau => niveaux.get(r) ?? niveauInitial;` par :

```typescript
  // Un niveau FIXE, décidé au montage : plus aucune dégradation en cours de route (cf.
  // `src/mouvement.ts`). La fonction est gardée plutôt qu'inlinée parce que `jouer()` la consulte
  // à quatre endroits, et qu'elle documente que le niveau ne dépend PAS du rôle.
  const niveauDe = (_r: Role): Niveau => niveauInitial;
```

6. Dans `peindre()`, remplacer les deux appels `lireMarques(racine, positionDe, tailleDe, actifRole)` par `lireMarques(racine, positionDe, tailleDe)`.
7. Dans `peindre()`, remplacer la boucle de verdicts par :

```typescript
        for (const v of comparer(avant, apres)) jouer(v, avant);
```

et supprimer entièrement la boucle `for (const nom of compteur.consommerSaccadees())` qui la suit, avec ses commentaires.

8. `jouer()` ne rend plus de durée : changer sa signature en `function jouer(v: Verdict, avant: Map<string, Marque>): void`, remplacer chaque `return <DUREE>;` par `return;`, et chaque `return null;` par `return;`.
9. Le retour de `creerMoteur` devient :

```typescript
  return { peindre, actif: () => actif, basculerPalette,
           oublier: () => { precedentes = null; } };
```

- [ ] **Step 5: Retirer le paramètre `actif` de `lireMarques`**

Dans `src/mouvement/marques.ts` : supprimer le paramètre `actif`, les constantes `POSITION_NULLE` et `TAILLE_NULLE`, la variable `relever`, et leurs commentaires. La signature devient :

```typescript
export function lireMarques(
  racine: HTMLElement,
  positionDe: (el: HTMLElement) => Position = positionReelle,
  tailleDe: (el: HTMLElement) => Taille = tailleReelle,
): Map<string, Marque> {
```

et le corps de la boucle pose directement :

```typescript
    marques.set(decl, {
      role, cle: decl.slice(sep + 1), etat: el.dataset.mvtEtat ?? null,
      el, position: positionDe(el), taille: tailleDe(el),
      rang: rang++,
      copie: ROLES_AVEC_COPIE.includes(role) ? copieFigee(el) : undefined,
    });
```

- [ ] **Step 6: Retirer les deux points d'attache externes**

Dans `src/demarrage.ts`, supprimer la ligne 1186 et son commentaire :

```typescript
          (window as unknown as Record<string, unknown>).__niveauDe = moteur.niveauDe;
```

Dans `outils/verifier-rendu.mjs`, supprimer la lecture de `__niveauDe` et la ligne de rapport qui l'imprime (chercher `__niveauDe`).

- [ ] **Step 7: Reprendre les tests du moteur**

Dans `tests/moteur.test.ts`, supprimer tous les `it()` dont le titre ou le corps porte sur la mesure de cadence ou la dégradation (chercher `degraderRole`, `niveauDe`, `mesurer`, `saccad`). Retirer `mesurer` des options passées à `moteurDeTest`.

- [ ] **Step 8: Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS. Un échec de compilation TypeScript sur `niveauDe`/`degraderRole` signale un appelant oublié — le corriger plutôt que de rétablir la méthode.

- [ ] **Step 9: Commit**

```bash
git add src/mouvement.ts src/mouvement/moteur.ts src/mouvement/marques.ts \
        src/demarrage.ts outils/verifier-rendu.mjs tests/mouvement.test.ts tests/moteur.test.ts
git commit -m "refactor(mouvement): retirer le régulateur de cadence

Il éteignait tous les rôles mesurés pendant une trame longue, sans retour
avant rechargement. Le repli manuel (?mouvement=sobre) suffit."
```

---

### Task 2: Deux courbes, et les durées de la nouvelle grammaire

**Files:**
- Modify: `src/mouvement/grammaire.ts`
- Modify: `src/styles/base.css` (retirer le bloc `@supports linear()`)
- Test: `tests/grammaire.test.ts` (créer)

**Interfaces:**
- Consumes: rien de la tâche 1.
- Produces: `SPATIAL`, `EFFET`, `EFFET_SORTIE` (string), `ENTREE_MS = 350`, `SORTIE_MS = 120`, `CROISEMENT_MS = 320`, `TRAVERSEE_MS = 320`, `ROULEMENT_MS = 140`, `DEPLACEMENT_MS = 350`, `DETAIL_MS = 140`, `PALETTE_MS = 600`, `CASCADE_MS = 30`, `CASCADE_RANGS_MAX = 4`, `AMPLITUDE_PX = 10`, `GLISSE_VUE_PX = 343`, `AFFICHE_ATTENTE_MAX_MS = 800`, `FANTOMES_MAX = 12`, `GARDE_MS = 500`. Le type `Role` devient `'vue' | 'bloc' | 'tuile' | 'ligne' | 'chiffre' | 'detail'`.

- [ ] **Step 1: Écrire le test**

Créer `tests/grammaire.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { SPATIAL, EFFET, EFFET_SORTIE, ENTREE_MS, SORTIE_MS, DETAIL_MS,
         estRole, retardCascade, CASCADE_MS, CASCADE_RANGS_MAX } from '../src/mouvement/grammaire';

describe('les deux familles de courbes MD3 Expressive', () => {
  it('le spatial dépasse sa cible, les effets jamais', () => {
    // Le second point de contrôle porte le dépassement : y > 1 pour le spatial, y = 1 sinon.
    const y2 = (c: string) => Number(c.match(/cubic-bezier\([^,]+,\s*([^,]+)/)![1]);
    expect(y2(SPATIAL)).toBeGreaterThan(1);
    expect(y2(EFFET)).toBeLessThanOrEqual(1);
    expect(y2(EFFET_SORTIE)).toBeLessThanOrEqual(1);
  });

  it('une sortie est toujours plus courte qu’une entrée — un écran se remplit, il ne se vide pas', () => {
    expect(SORTIE_MS).toBeLessThan(ENTREE_MS);
  });

  it('un détail va plus vite qu’un bloc : c’est un effet, pas un déplacement', () => {
    expect(DETAIL_MS).toBeLessThan(ENTREE_MS);
  });
});

describe('estRole', () => {
  it('accepte les six rôles, « detail » compris', () => {
    for (const r of ['vue', 'bloc', 'tuile', 'ligne', 'chiffre', 'detail']) {
      expect(estRole(r), r).toBe(true);
    }
  });

  it('rejette un rôle inconnu sans lever', () => {
    expect(estRole('turbo')).toBe(false);
  });
});

describe('retardCascade', () => {
  it('plafonne pour qu’une longue liste ne devienne pas une attente', () => {
    expect(retardCascade(0)).toBe(0);
    expect(retardCascade(2)).toBe(2 * CASCADE_MS);
    expect(retardCascade(99)).toBe(CASCADE_RANGS_MAX * CASCADE_MS);
  });
});
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run tests/grammaire.test.ts`
Expected: FAIL — `SPATIAL`, `EFFET`, `EFFET_SORTIE`, `DETAIL_MS` n'existent pas, et `estRole('detail')` rend `false`.

- [ ] **Step 3: Réécrire les jetons de `grammaire.ts`**

Dans `src/mouvement/grammaire.ts`, remplacer le bloc des courbes et des durées (de `export const COURBE` jusqu'à `export const PALETTE_MS`) par :

```typescript
/** MD3 Expressive repose sur des ressorts en DEUX familles : le SPATIAL (déplacement, échelle)
 *  peut dépasser légèrement sa cible ; les EFFETS (opacité) ne dépassent jamais.
 *
 *  Chrome 100 — le moteur des Fire 7 — ne comprend pas `linear()`, donc pas de vrai ressort. Un
 *  `cubic-bezier` porte le dépassement, et le projet visait DÉJÀ ça : `base.css` déclarait
 *  `linear(0, .5 30%, 1.08 55%, …)` — 8 % de dépassement — derrière un `@supports` que ces dalles
 *  ne satisfont jamais. L'intention Expressive était écrite dans le fichier et n'atteignait pas
 *  l'écran ; on l'y amène par la seule syntaxe que ces dalles comprennent. */
export const SPATIAL = 'cubic-bezier(.2, 1.06, .3, 1)';
export const EFFET = 'cubic-bezier(.2, 0, 0, 1)';
/** Tout ce qui s'en va : on n'accompagne pas ce qui part. */
export const EFFET_SORTIE = 'cubic-bezier(.4, 0, 1, 1)';

export const ENTREE_MS = 350;
/** TOUJOURS plus courte que l'entrée : un écran doit se remplir, pas se vider. */
export const SORTIE_MS = 120;
export const CROISEMENT_MS = 320;
export const TRAVERSEE_MS = 320;
export const ROULEMENT_MS = 140;
export const DEPLACEMENT_MS = 350;
/** Les petits éléments secondaires. Un objet de cette taille qui se déplace lit comme du bruit,
 *  pas comme un geste : famille « effets », opacité seule. */
export const DETAIL_MS = 140;
/** L'UNIQUE durée du projet qui soit aussi une durée CSS : `base.css` la lit dans `--mvt-palette`
 *  (`.fondu-palette`), variable que `creerMoteur` pose sur `<html>` à partir de cette constante. */
export const PALETTE_MS = 600;
```

**Ne PAS toucher à `BALAYAGE_MS` ni à `COURBE_BALAYAGE`** : `moteur.ts` les utilise encore à ce
stade, et les retirer ici rendrait l'arbre non compilable jusqu'à la tâche 3 — l'étape 6 échouerait
sur une erreur TypeScript sans rapport avec ce que cette tâche teste. La tâche 3 les retire avec
leur unique usage.

Étendre le type `Role` :

```typescript
export type Role = 'vue' | 'bloc' | 'tuile' | 'ligne' | 'chiffre' | 'detail';

const ROLES: Role[] = ['vue', 'bloc', 'tuile', 'ligne', 'chiffre', 'detail'];
```

- [ ] **Step 4: Mettre les appelants au nouveau nom**

Dans `src/mouvement/moteur.ts`, remplacer dans l'import et dans le corps : `COURBE` → `SPATIAL`, `COURBE_SORTIE` → `EFFET_SORTIE`. Les croisements de bloc (`croiserBloc`) passent à `EFFET` et `CROISEMENT_MS` ; la traversée passe à `TRAVERSEE_MS`.

- [ ] **Step 5: Retirer le `@supports linear()` de `base.css`**

Dans `src/styles/base.css`, supprimer le bloc `@supports (transition-timing-function: linear(0, 1)) { … }` et son commentaire. `--ressort` garde son `cubic-bezier(.05, .7, .1, 1)` pour `:active`, qui reste hors moteur.

- [ ] **Step 6: Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/mouvement/grammaire.ts src/mouvement/moteur.ts src/styles/base.css tests/grammaire.test.ts
git commit -m "feat(mouvement): deux courbes MD3 Expressive au lieu de cinq

Le spatial dépasse de 6 %, les effets jamais. Le dépassement que le projet
visait déjà via linear() n'atteignait pas Chrome 100."
```

---

### Task 3: Supprimer le balayage de tuile

`.commande` porte déjà `transition: background .3s` : le fond fond tout seul quand `lit` ajoute la classe. Le moteur pose par-dessus deux couches opaques qui masquent ce fondu pour rejouer le même effet — pour 78 400 px² composés, soit 39 % de la surface de l'écran, à chaque bascule.

**Files:**
- Modify: `src/mouvement/moteur.ts` (retirer la branche `mutation`/`tuile` de `jouer()`)
- Modify: `src/styles/base.css` (retirer `.mvt-balayage*`, ajouter `color 0s .3s`)
- Modify: `src/rendu/corps.ts:178` (retirer `data-mvt-etat` de la tuile)
- Test: `tests/moteur.test.ts`, `tests/corps.test.ts`

**Interfaces:**
- Consumes: `Role` étendu (tâche 2).
- Produces: `jouer()` ne traite plus `mutation` que pour `chiffre` et `bloc`. Aucune signature publique ne change.

- [ ] **Step 1: Écrire le test**

Ajouter à `tests/moteur.test.ts`, dans le `describe` du moteur :

```typescript
  it('ne pose plus aucune couche de balayage quand une tuile change d’état', () => {
    const m = moteurDeTest();
    m.peindre(gabarit(['tuile:light.salon=inactif']));
    m.peindre(gabarit(['tuile:light.salon=actif']));
    expect(m.racine.querySelectorAll('.mvt-balayage')).toHaveLength(0);
    expect(m.animations.filter((a) => a.nom === 'mutation')).toHaveLength(0);
  });
```

Adapter `gabarit`/`moteurDeTest` aux fabriques déjà présentes en tête de `tests/moteur.test.ts` (elles existent : `monter()` et le double d'animation). Si la fabrique du fichier n'expose pas `animations`, se contenter de l'assertion sur `.mvt-balayage`, qui suffit à verrouiller la suppression.

Ajouter à `tests/corps.test.ts` :

```typescript
  it('une tuile de commande ne porte plus d’état de mouvement — le balayage a disparu', () => {
    const hote = document.createElement('div');
    render(rendreCorps(etatAvecSalonAllume(), pieceSalon()), hote);
    const tuile = hote.querySelector('[data-mvt^="tuile:"]') as HTMLElement;
    expect(tuile).not.toBeNull();
    expect(tuile.dataset.mvtEtat).toBeUndefined();
  });
```

Réutiliser les fabriques d'état et de pièce déjà définies en tête de `tests/corps.test.ts`.

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run tests/moteur.test.ts tests/corps.test.ts`
Expected: FAIL — une couche `.mvt-balayage` est posée, et `dataset.mvtEtat` vaut `'actif'`.

- [ ] **Step 3: Retirer la branche de `jouer()`**

Dans `src/mouvement/moteur.ts`, supprimer tout le bloc qui suit le traitement du roulement de chiffres, depuis le commentaire `// Seul le rôle `tuile` balaie.` jusqu'au `return` de fin de branche inclus — c'est-à-dire la déclaration de `classeEtat`, la création de `fond` et `disque`, l'animation du disque et son `retirer`. La fonction se termine désormais sur la branche `chiffre`/`bloc` du verdict `mutation` ; toute autre mutation ne joue rien.

Retirer `BALAYAGE_MS` et `COURBE_BALAYAGE` de l'import en tête de fichier.

- [ ] **Step 4: Retirer les règles CSS et régler le contraste**

Dans `src/styles/base.css` :

1. Supprimer les règles `.commande > .mvt-balayage`, `.commande.jauge > .mvt-balayage`, `.commande > .mvt-balayage.mvt-etat-actif`, `.commande > .mvt-balayage > .mvt-balayage-disque`, `.commande > .mvt-balayage > .mvt-balayage-disque.mvt-etat-actif`, et le long commentaire qui les introduit.
2. Conserver `.commande > * { position: relative; z-index: 1; }` — il sert encore au contenu au-dessus du fond.
3. Remplacer la transition de `.commande` par :

```css
  /* `color 0s .3s` — le texte bascule à la FIN du fondu de fond, jamais pendant. `lit` peint la
     tuile dans son état d'arrivée avant tout mouvement : sans ce délai, le texte prend la couleur
     d'arrivée à la première image pendant que le fond porte encore celle du départ — du blanc sur
     `#d8dee0`, soit environ 1,6:1 contre un plancher projet de 5:1. Fondre les deux couleurs
     ENSEMBLE a été essayé et mesuré : à mi-parcours elles se moyennent et le texte devient plus
     terne que le défaut qu'on corrige. Il tient, puis il cède. */
  transition: background .3s, color 0s .3s, border-radius .2s var(--ressort);
```

4. Retirer `--mvt-fond-inactif` / `--mvt-fond-actif` de `.commande` **seulement si** aucune autre règle ne les lit (vérifier par `grep -n "mvt-fond" src/styles/base.css`). Sinon les laisser.

- [ ] **Step 5: Retirer l'état de la tuile**

Dans `src/rendu/corps.ts`, supprimer la ligne 178 :

```typescript
       data-mvt-etat=${actif ? 'actif' : 'inactif'}
```

- [ ] **Step 6: Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Vérifier le rendu réel**

Run: `node outils/verifier-rendu.mjs`
Expected: aucune régression de contraste ni de débordement. Ce script ne déploie rien.

- [ ] **Step 8: Commit**

```bash
git add src/mouvement/moteur.ts src/mouvement/grammaire.ts src/styles/base.css \
        src/rendu/corps.ts tests/moteur.test.ts tests/corps.test.ts
git commit -m "refactor(mouvement): supprimer le balayage de tuile

Redondant avec transition: background .3s déjà déclarée, et 39 % de la
surface de l'écran composée à chaque bascule. Règle au passage le texte
blanc sur fond de départ (1,6:1) via color 0s .3s."
```

---

### Task 4: Sortie sans déplacement, et le rôle `detail`

**Files:**
- Modify: `src/mouvement/moteur.ts` (branches `sortie` et `entree` de `jouer()`)
- Test: `tests/moteur.test.ts`

**Interfaces:**
- Consumes: `SORTIE_MS`, `DETAIL_MS`, `EFFET`, `EFFET_SORTIE`, `Role` avec `detail` (tâche 2).
- Produces: `jouer()` traite le rôle `detail` en opacité seule.

- [ ] **Step 1: Écrire le test**

Ajouter à `tests/moteur.test.ts` :

```typescript
  it('une sortie est un fondu seul — on n’accompagne pas ce qui part', () => {
    const m = moteurDeTest();
    m.peindre(gabarit(['bloc:repas']));
    m.peindre(gabarit([]));
    const trames = m.dernieresTrames();
    expect(JSON.stringify(trames)).not.toContain('translate');
    expect(trames[0]).toMatchObject({ opacity: 1 });
    expect(trames[1]).toMatchObject({ opacity: 0 });
  });

  it('un détail entre en opacité seule, sans déplacement', () => {
    const m = moteurDeTest();
    m.peindre(gabarit([]));
    m.peindre(gabarit(['detail:pastille']));
    expect(JSON.stringify(m.dernieresTrames())).not.toContain('translate');
  });
```

Si la fabrique du fichier n'expose pas `dernieresTrames()`, l'ajouter : le double d'animation reçoit déjà `(el, trames, options)` — mémoriser le dernier appel dans un tableau et le rendre.

- [ ] **Step 2: Lancer pour voir échouer**

Run: `npx vitest run tests/moteur.test.ts`
Expected: FAIL — la sortie porte encore `translateY(-10px)`, et `detail` entre avec `translateY(10px)`.

- [ ] **Step 3: Implémenter**

Dans `jouer()`, remplacer la branche `entree` par :

```typescript
    if (v.type === 'entree') {
      // Un détail est un EFFET, pas un déplacement : à cette taille, un objet qui bouge lit comme
      // du bruit. Il entre en opacité seule, et plus vite.
      const estDetail = v.marque.role === 'detail';
      animer(v.marque.el,
        estDetail
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ transform: `translateY(${AMPLITUDE_PX}px)`, opacity: 0 },
             { transform: 'none', opacity: 1 }],
        // La cascade est la première chose sacrifiée à `sobre` : les tuiles arrivent alors de
        // front plutôt qu'en rang.
        { duration: estDetail ? DETAIL_MS : ENTREE_MS,
          delay: !estDetail && niveauDe(v.marque.role) === 'complet'
            ? retardCascade(v.marque.rang) : 0,
          easing: estDetail ? EFFET : SPATIAL, fill: 'backwards' });
      return;
    }
```

et la branche `sortie` par :

```typescript
    if (v.type === 'sortie') {
      // `lit` a déjà retiré le nœud réel : il n'existe plus rien à animer sur place. On anime un
      // CLONE, pendant que la mise en page, elle, s'est refermée instantanément.
      const f = calque.fantomer(v.marque);
      if (f === null) return;                      // plafond atteint : sortie sèche, jamais d'erreur
      // Opacité SEULE (2026-08-22) : MD3 n'accompagne pas ce qui part. Une propriété au lieu de
      // deux, et le clone vit 120 ms au lieu de 160.
      const a = animer(f, [{ opacity: 1 }, { opacity: 0 }],
        { duration: SORTIE_MS, easing: EFFET_SORTIE, fill: 'forwards' });
      a.finished.finally(() => calque.relacher(f)).catch(() => {});
      // Ceinture ET bretelles : `finished` ne se résout jamais si l'écran s'éteint en plein vol.
      minuteurFn(() => calque.relacher(f), SORTIE_MS + GARDE_MS);
      return;
    }
```

Ajouter `DETAIL_MS` et `EFFET` à l'import de `./grammaire`.

- [ ] **Step 4: Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mouvement/moteur.ts tests/moteur.test.ts
git commit -m "feat(mouvement): sortie en fondu seul, rôle detail en opacité"
```

---

### Task 5: Règle d'imbrication

Sans elle, l'exhaustivité se paie deux fois : le bloc média qui sort emporte son sous-titre, ses trois boutons et son rail — neuf verdicts et neuf clones pour un seul geste. C'est aussi ce qui permet de garder `FANTOMES_MAX` à 12.

**Files:**
- Modify: `src/mouvement/diff.ts`
- Test: `tests/moteur.test.ts` (section `comparer`)

**Interfaces:**
- Consumes: `Marque` avec `el` (déjà présent).
- Produces: `comparer()` n'émet plus de verdict `entree`/`sortie` pour une marque dont un ancêtre marqué entre ou sort dans la même passe. Signature inchangée.

- [ ] **Step 1: Écrire le test**

Ajouter à `tests/moteur.test.ts`, dans le `describe('comparer')` :

```typescript
  it('un enfant marqué ne sort pas quand son parent marqué sort — un geste, un clone', () => {
    const racine = document.createElement('div');
    const bloc = document.createElement('div');
    bloc.dataset.mvt = 'bloc:media';
    const sous = document.createElement('div');
    sous.dataset.mvt = 'detail:media-sous';
    bloc.appendChild(sous);
    racine.appendChild(bloc);
    const avant = lireMarques(racine, () => [0, 0], () => [10, 10]);

    const apres = lireMarques(document.createElement('div'), () => [0, 0], () => [10, 10]);
    const v = comparer(avant, apres);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ type: 'sortie', marque: { cle: 'media' } });
  });

  it('la même règle vaut à l’entrée', () => {
    const vide = lireMarques(document.createElement('div'), () => [0, 0], () => [10, 10]);
    const racine = document.createElement('div');
    const bloc = document.createElement('div');
    bloc.dataset.mvt = 'bloc:media';
    const sous = document.createElement('div');
    sous.dataset.mvt = 'detail:media-sous';
    bloc.appendChild(sous);
    racine.appendChild(bloc);
    const apres = lireMarques(racine, () => [0, 0], () => [10, 10]);
    expect(comparer(vide, apres)).toHaveLength(1);
  });

  it('mais un déplacement d’enfant reste joué sous un parent qui ne fait que bouger', () => {
    const racine = document.createElement('div');
    const bloc = document.createElement('div');
    bloc.dataset.mvt = 'bloc:media';
    const ch = document.createElement('div');
    ch.dataset.mvt = 'chiffre:h';
    ch.dataset.mvtEtat = '9';
    bloc.appendChild(ch);
    racine.appendChild(bloc);
    const avant = lireMarques(racine, () => [0, 0], () => [10, 10]);
    ch.dataset.mvtEtat = '10';
    const apres = lireMarques(racine, () => [0, 0], () => [10, 10]);
    expect(comparer(avant, apres)).toEqual([
      expect.objectContaining({ type: 'mutation', avant: '9' }),
    ]);
  });
```

- [ ] **Step 2: Lancer pour voir échouer**

Run: `npx vitest run tests/moteur.test.ts -t imbric`
Expected: FAIL — les deux premiers cas rendent 2 verdicts au lieu de 1.

- [ ] **Step 3: Implémenter**

Dans `src/mouvement/diff.ts`, ajouter avant `comparer` :

```typescript
/** Vrai si un ANCÊTRE de `m` figure parmi `ensemble`. C'est ce qui empêche l'exhaustivité de
 *  coûter deux fois : quand le bloc média sort, il emporte son sous-titre, ses trois boutons de
 *  transport et son rail de volume — neuf verdicts et neuf clones pour un seul geste, plus des
 *  animations imbriquées qui se composent sur un élément déjà en train de disparaître. C'est aussi
 *  ce qui permet de garder `FANTOMES_MAX` à 12 malgré la couverture exhaustive : les sorties en
 *  rafale viennent presque toujours d'un conteneur commun.
 *
 *  Ne vaut QUE pour les entrées et les sorties. Un déplacement ou une mutation sous un parent qui
 *  ne fait que bouger reste joué : un chiffre qui roule dans un bloc qui se déplace, ce sont bien
 *  deux gestes distincts. */
function sousUnAncetre(m: Marque, ensemble: Iterable<Marque>): boolean {
  for (const autre of ensemble) {
    if (autre !== m && autre.el !== m.el && autre.el.contains(m.el)) return true;
  }
  return false;
}
```

Puis, dans `comparer`, remplacer la ligne d'entrée :

```typescript
    if (!a) { verdicts.push({ type: 'entree', marque: m }); continue; }
```

par :

```typescript
    if (!a) {
      if (!sousUnAncetre(m, entrantes)) verdicts.push({ type: 'entree', marque: m });
      continue;
    }
```

et la boucle des sorties par :

```typescript
  const sortantes = [...avant.values()]
    .filter((m) => m.role !== 'vue' && !apres.has(`${m.role}:${m.cle}`));
  for (const m of sortantes) {
    if (!sousUnAncetre(m, sortantes)) verdicts.push({ type: 'sortie', marque: m });
  }
```

- [ ] **Step 4: Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mouvement/diff.ts tests/moteur.test.ts
git commit -m "feat(mouvement): un parent qui entre ou sort confisque le geste de ses enfants"
```

---

### Task 6: Le remplacement de bloc devient un croisement

Aujourd'hui repas → voiture produit deux verdicts sans rapport, avec la fente qui se referme puis se rouvre. C'est le cas le plus fréquent de l'écran.

**Files:**
- Modify: `src/mouvement/diff.ts` (nouveau verdict `croisement`)
- Modify: `src/mouvement/moteur.ts` (le jouer)
- Test: `tests/moteur.test.ts`

**Interfaces:**
- Consumes: `CROISEMENT_MS`, `EFFET`, `EFFET_SORTIE` (tâche 2). L'appariement s'exécute **après** la règle d'imbrication de la tâche 5, sur la liste de verdicts qu'elle a déjà réduite.
- Produces: `Verdict` gagne `{ type: 'croisement'; sortante: Marque; entrante: Marque }`. `croiserBloc(el, ancienne)` reste la fonction qui l'exécute dans `moteur.ts`.

- [ ] **Step 1: Écrire le test**

```typescript
  it('une sortie et une entrée de bloc au même rang deviennent UN croisement', () => {
    const racine = document.createElement('div');
    const a = document.createElement('div');
    a.dataset.mvt = 'bloc:repas';
    racine.appendChild(a);
    const avant = lireMarques(racine, () => [0, 40], () => [300, 90]);

    const racine2 = document.createElement('div');
    const b = document.createElement('div');
    b.dataset.mvt = 'bloc:voiture';
    racine2.appendChild(b);
    const apres = lireMarques(racine2, () => [0, 40], () => [300, 90]);

    const v = comparer(avant, apres);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      type: 'croisement',
      sortante: { cle: 'repas' },
      entrante: { cle: 'voiture' },
    });
  });

  it('deux blocs à des places différentes restent une sortie et une entrée', () => {
    const racine = document.createElement('div');
    const a = document.createElement('div');
    a.dataset.mvt = 'bloc:alerte';
    racine.appendChild(a);
    const avant = lireMarques(racine, () => [0, 0], () => [300, 90]);

    const racine2 = document.createElement('div');
    const b = document.createElement('div');
    b.dataset.mvt = 'bloc:voiture';
    racine2.appendChild(b);
    const apres = lireMarques(racine2, () => [0, 300], () => [300, 90]);

    const types = comparer(avant, apres).map((x) => x.type).sort();
    expect(types).toEqual(['entree', 'sortie']);
  });
```

- [ ] **Step 2: Lancer pour voir échouer**

Run: `npx vitest run tests/moteur.test.ts -t croisement`
Expected: FAIL — deux verdicts, pas de type `croisement`.

- [ ] **Step 3: Implémenter le verdict**

Dans `src/mouvement/diff.ts`, étendre le type :

```typescript
  | { type: 'croisement'; sortante: Marque; entrante: Marque }
```

et, juste avant le `return verdicts;` final, apparier :

```typescript
  // Un bloc central qui en remplace un autre (repas → voiture, agenda → alerte) est UN geste, pas
  // une sortie plus une entrée : la fente ne doit ni se refermer ni se rouvrir. C'est le
  // *container transform* de MD3 — le bloc média le faisait déjà seul, on l'étend au rôle entier.
  //
  // « Même place » se lit sur la POSITION relevée, pas sur le rang : deux blocs de rangs différents
  // peuvent occuper la même fente quand des éléments les précèdent apparaissent ou disparaissent
  // dans la même passe. Si l'appariement échoue, on retombe sur le couple sortie + entrée —
  // dégradation lisible, jamais une erreur.
  const sorties = verdicts.filter((v) => v.type === 'sortie' && v.marque.role === 'bloc');
  for (const s of sorties) {
    if (s.type !== 'sortie') continue;                       // affine le type pour TypeScript
    const e = verdicts.find((v) => v.type === 'entree' && v.marque.role === 'bloc'
      && v.marque.position[0] === s.marque.position[0]
      && v.marque.position[1] === s.marque.position[1]);
    if (e === undefined || e.type !== 'entree') continue;
    verdicts.splice(verdicts.indexOf(s), 1);
    verdicts.splice(verdicts.indexOf(e), 1);
    verdicts.push({ type: 'croisement', sortante: s.marque, entrante: e.marque });
  }
```

- [ ] **Step 4: Jouer le croisement**

Dans `src/mouvement/moteur.ts`, ajouter dans `jouer()`, avant la branche `mutation` :

```typescript
    if (v.type === 'croisement') {
      // Même corps que la mutation du bloc média : le clone porte l'ancien contenu déjà peint, le
      // nœud réel entre en fondu. Aucune fente ne se referme.
      croiserBloc(v.entrante.el, v.sortante);
      return;
    }
```

Adapter `roleDuVerdict` :

```typescript
  const roleDuVerdict = (v: Verdict): Role =>
    v.type === 'traversee' ? 'vue' : v.type === 'croisement' ? 'bloc' : v.marque.role;
```

Dans `croiserBloc`, porter les durées à `CROISEMENT_MS` et les courbes à `EFFET_SORTIE` (clone) / `EFFET` (nœud réel).

- [ ] **Step 5: Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/mouvement/diff.ts src/mouvement/moteur.ts tests/moteur.test.ts
git commit -m "feat(mouvement): croiser les blocs centraux au lieu de les sortir puis les entrer"
```

---

### Task 7: Couverture — marquer tous les rendus

**Files:**
- Modify: `src/rendu/voiture.ts`, `src/rendu/minuteur.ts`, `src/rendu/bandeau.ts`, `src/rendu/corps.ts`, `src/rendu/media.ts`, `src/rendu/taches.ts`, `src/rendu/nuit.ts`, `src/rendu/recette.ts`
- Test: `tests/voiture.test.ts`, `tests/minuteur.test.ts`, `tests/bandeau.test.ts`, `tests/corps.test.ts`, `tests/carte-media.test.ts`, `tests/taches.test.ts`, `tests/nuit.test.ts`, `tests/rendu-recette.test.ts`

**Interfaces:**
- Consumes: rôle `detail` (tâche 2), règle d'imbrication (tâche 5).
- Produces: aucune signature ne change — seulement des attributs dans les gabarits.

Les clés doivent rester **stables d'un rendu à l'autre pour le même objet** et **uniques dans l'écran** : c'est la seule chose que `comparer()` regarde. Une clé dérivée d'un index n'est acceptable que là où l'ordre ne change jamais.

- [ ] **Step 1: Écrire un test de couverture par fichier de rendu**

Ajouter à `tests/voiture.test.ts` (et transposer aux sept autres suites) :

```typescript
  it('le bloc voiture porte une marque de mouvement', () => {
    const hote = document.createElement('div');
    render(rendreVoiture(etatVoiture(), CIBLE_VOITURE, null), hote);
    expect(hote.querySelector('.voiture')?.getAttribute('data-mvt')).toBe('bloc:voiture');
  });

  it('le niveau et l’autonomie portent chacun la leur', () => {
    const hote = document.createElement('div');
    render(rendreVoiture(etatVoiture(), CIBLE_VOITURE, null), hote);
    expect(hote.querySelector('.vt-niveau')?.getAttribute('data-mvt')).toBe('detail:vt-niveau');
    expect(hote.querySelector('.vt-autonomie')?.getAttribute('data-mvt'))
      .toBe('detail:vt-autonomie');
  });
```

Réutiliser les fabriques d'état déjà définies en tête de chaque suite.

- [ ] **Step 2: Lancer pour voir échouer**

Run: `npx vitest run tests/voiture.test.ts`
Expected: FAIL — `data-mvt` vaut `null`.

- [ ] **Step 3: Poser les marques**

Appliquer exactement la table du § 8 de la spec :

| Fichier | Élément | Marque |
|---|---|---|
| `rendu/voiture.ts` | `.voiture` | `bloc:voiture` |
| | `.vt-niveau`, `.vt-autonomie` | `detail:vt-niveau`, `detail:vt-autonomie` |
| `rendu/minuteur.ts` | `.minuteurs` (liste) | `bloc:minuteurs` |
| | `.mn-solo` | `bloc:minuteur-solo` |
| | `.mn-etiquettes` | `detail:mn-etiquettes` |
| | `.mn-nouveau` | `detail:mn-nouveau` |
| | boutons ± 5 | `detail:mn-<action>-<slot>` |
| `rendu/bandeau.ts` | `.phrase` | `detail:dedans` |
| | `.dehors` | `detail:dehors` |
| | `.pastille` | `detail:pastille` |
| `rendu/corps.ts` | `.commandes` | `bloc:commandes` |
| | `.ambiance` | `tuile:amb-<clé>` |
| | tuile minuteur | `tuile:minuteur` |
| | `.s` (étiquette d'une tuile) | `detail:etiq-<entité>` |
| `rendu/media.ts` | `.media-sous` | `detail:media-sous` |
| | boutons de transport | `detail:tr-<action>` |
| | `.media-rail` | `detail:volume-rail` |
| | `.media-pas` (− / +) | `detail:volume-moins`, `detail:volume-plus` |
| `rendu/taches.ts` | `.taches-vide` | `detail:taches-vide` |
| | bloc « +N tâches » | `detail:taches-reste` |
| `rendu/nuit.ts` | `.tn`, `.on` | `detail:nuit-temp`, `detail:nuit-ferme` |
| `rendu/recette.ts` | `.ing-vide` | `detail:ing-vide` |
| | `.ing-stock.manque` | `detail:manque-<i>` |

Exemple, dans `src/rendu/voiture.ts` :

```typescript
    <div class="voiture" data-mvt="bloc:voiture">
      <div class="vt-chiffres">
        ${niveau !== null
          ? html`<span class="vt-niveau" data-mvt="detail:vt-niveau">${Math.round(niveau)} %</span>`
          : nothing}
        ${autonomie !== null
          ? html`<span class="vt-autonomie" data-mvt="detail:vt-autonomie"
                 >${Math.round(autonomie)} km</span>`
          : nothing}
```

- [ ] **Step 4: Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Vérifier le rendu réel**

Run: `node outils/verifier-rendu.mjs`
Expected: aucun débordement, aucune cible sous 62 px, aucun contraste sous 5:1. Un attribut n'a pas d'effet visuel — un échec ici signale une erreur de frappe dans un gabarit.

- [ ] **Step 6: Commit**

```bash
git add src/rendu tests
git commit -m "feat(mouvement): marquer tout ce qui apparaît et disparaît"
```

---

### Task 8: Garde-fou dans `verifier-rendu.mjs`

**Files:**
- Modify: `outils/verifier-rendu.mjs`

**Interfaces:**
- Consumes: les marques posées en tâche 7, la règle d'imbrication de la tâche 5.
- Produces: un contrôle `verifierMarquesMouvement(page, etatA, etatB)` intégré au rapport, et un cas dans `--auto-test`.

- [ ] **Step 1: Ajouter le cas d'auto-test qui doit ÉCHOUER**

Dans la section `--auto-test` de `outils/verifier-rendu.mjs`, ajouter le cas suivant, sur le même
patron que les fixtures en mémoire déjà présentes pour le débordement et le contraste. C'est la
preuve que le contrôle sait échouer : sans elle, un contrôle toujours vert passerait pour un
contrôle qui marche.

```javascript
// Trois éléments apparaissent ; un seul est fautif. `.enfant` est couvert par la marque de son
// parent (règle d'imbrication) et `.marque` porte la sienne : seul `.piege` doit être signalé.
const AVANT_MVT = `<div id="app"><div class="socle"></div></div>`;
const APRES_MVT = `<div id="app">
  <div class="socle"></div>
  <div class="piege">apparu sans marque</div>
  <div class="marque" data-mvt="bloc:x"><div class="enfant">couvert par son parent</div></div>
</div>`;

async function autoTestMouvement(page) {
  await page.setContent(AVANT_MVT);
  const avant = await releverSignatures(page);
  await page.setContent(APRES_MVT);
  const apres = await releverSignatures(page);
  const fautifs = comparerSignatures(avant, apres);
  const attendu = ['piege'];
  const ok = JSON.stringify(fautifs) === JSON.stringify(attendu);
  console.log(ok
    ? '  ✓ auto-test mouvement : le piège est vu, l’enfant couvert et l’élément marqué sont épargnés'
    : `  ✗ auto-test mouvement : attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(fautifs)}`);
  return ok;
}
```

Brancher `autoTestMouvement` dans la liste des auto-tests déjà exécutés par le drapeau, et
propager son booléen au code de sortie du script.

- [ ] **Step 2: Lancer l'auto-test pour le voir échouer**

Run: `node outils/verifier-rendu.mjs --auto-test`
Expected: FAIL — le contrôle n'existe pas encore, la fixture piège n'est signalée par personne.

- [ ] **Step 3: Implémenter le contrôle**

```javascript
/** Échoue si un élément apparaît ou disparaît entre deux états sans porter de marque de mouvement.
 *
 *  C'est le garde-fou du chantier du 2026-08-22 : la couverture est exhaustive, et rien n'empêchait
 *  jusqu'ici un futur bloc de repartir sans `data-mvt` — le trou se refermait alors en silence,
 *  puisqu'un élément non marqué ne produit ni erreur ni verdict, seulement une apparition sèche.
 *
 *  La signature est le CHEMIN d'indices depuis `#app` plus la liste des classes : deux nœuds
 *  distincts au même endroit avec les mêmes classes sont, pour ce contrôle, le même élément — ce
 *  qu'on veut, puisque `lit` réutilise ses nœuds en place.
 *
 *  Un élément dont un ANCÊTRE porte une marque est innocent : c'est la règle d'imbrication
 *  (`sousUnAncetre`, `src/mouvement/diff.ts`), qui fait que le parent joue le geste pour tout son
 *  sous-arbre. */
const EXCLUS_MOUVEMENT = ['#mvt-fantomes', '#mvt-fond', '.delorean', 'video', 'img'];

async function releverSignatures(page) {
  return page.evaluate((exclus) => {
    const app = document.getElementById('app');
    if (app === null) return [];
    const out = [];
    const marche = (el, chemin) => {
      if (exclus.some((s) => el.matches(s))) return;
      if (el.classList.length > 0) {
        out.push({
          sig: `${chemin}|${[...el.classList].sort().join('.')}`,
          marque: el.hasAttribute('data-mvt'),
          couvert: el.closest('[data-mvt]') !== null,
          classes: [...el.classList].join('.'),
        });
      }
      [...el.children].forEach((e, i) => marche(e, `${chemin}/${i}`));
    };
    [...app.children].forEach((e, i) => marche(e, `${i}`));
    return out;
  }, EXCLUS_MOUVEMENT);
}

function comparerSignatures(avant, apres) {
  const cle = (x) => x.sig;
  const setA = new Set(avant.map(cle));
  const setB = new Set(apres.map(cle));
  const bouges = [...avant.filter((x) => !setB.has(cle(x))),
                  ...apres.filter((x) => !setA.has(cle(x)))];
  // `couvert` vaut pour l'élément lui-même ET ses ancêtres (`closest` remonte, en s'incluant) :
  // un enfant sous un parent marqué est innocent — c'est la règle d'imbrication.
  return bouges.filter((x) => !x.couvert).map((x) => x.classes);
}
```

Brancher l'appel dans le point de passage unique des scénarios (celui qui pose déjà l'attente des animations, autour de la ligne 1310), et ajouter les fautifs au rapport avec la même mise en forme que les autres contrôles :

```javascript
  if (fautifs.length > 0) {
    console.error(`  ✗ MOUVEMENT — ${fautifs.length} élément(s) apparaissent ou disparaissent `
      + `sans marque : ${fautifs.join(', ')}`);
    console.error('    Poser data-mvt="<rôle>:<clé>" dans le gabarit correspondant '
      + '(rôles : vue, bloc, tuile, ligne, chiffre, detail).');
  }
```

- [ ] **Step 4: Lancer l'auto-test pour le voir passer**

Run: `node outils/verifier-rendu.mjs --auto-test`
Expected: PASS — la fixture piège est signalée, l'auto-test la reconnaît comme attendue.

- [ ] **Step 5: Lancer le vérificateur sur les trois pièces**

Run: `node outils/verifier-rendu.mjs`
Expected: aucun fautif. S'il en reste, poser la marque manquante — jamais élargir `EXCLUS_MOUVEMENT` pour faire taire le contrôle.

- [ ] **Step 6: Commit**

```bash
git add outils/verifier-rendu.mjs
git commit -m "test(rendu): échouer si un élément apparaît sans marque de mouvement"
```

---

### Task 9: Nettoyage, déploiement et contrôle sur les tablettes

**Files:**
- Delete: `outils/maquette-mouvement.html`, `/opt/nivuus/HomeAssistant/config/www/wallpanel/maquette-mouvement.html`
- Modify: `README.md` (section mouvement, si elle décrit le régulateur ou le balayage)
- Modify: `/opt/nivuus/HomeAssistant/data/CLAUDE.md` (règle de couleurs de la section « Contraintes de conception »)

- [ ] **Step 1: Vérifier qu'aucune référence au code retiré ne subsiste**

```bash
grep -rn "Compteur\|PLANCHER_FPS\|consommerSaccadees\|BALAYAGE_MS\|mvt-balayage\|degraderRole" \
  src tests outils README.md
```

Expected: aucune correspondance. Toute correspondance restante est un commentaire périmé — le corriger, ne pas le laisser mentir au prochain lecteur.

- [ ] **Step 2: Supprimer la maquette, qui a fini son office**

```bash
rm outils/maquette-mouvement.html
rm /opt/nivuus/HomeAssistant/config/www/wallpanel/maquette-mouvement.html
```

- [ ] **Step 3: Suite complète et vérificateur**

Run: `npx vitest run && node outils/verifier-rendu.mjs && node outils/verifier-rendu.mjs --auto-test`
Expected: tout vert.

- [ ] **Step 4: Déployer — DEMANDER L'ACCORD DU PROPRIÉTAIRE D'ABORD**

`npm run build` écrit dans `config/www/wallpanel/` et change ce que les trois murs affichent. Ne pas le lancer sans accord explicite.

Run: `npm run build`

- [ ] **Step 5: Vider le cache des trois tablettes**

Pour chaque pièce (salon, bureau, cuisine), appeler `button.tablette_<piece>_vider_le_cache_du_navigateur` puis `button.tablette_<piece>_load_start_url`. La WebView Fully sert sinon l'ancien bundle.

- [ ] **Step 6: Contrôle visuel**

Relever `image.tablette_<piece>_capture_d_ecran` sur les trois pièces. Après un rechargement, la tablette met plusieurs secondes à peindre : se fier à l'heure affichée par l'horloge, jamais à `frame_timestamp`.

Vérifier en particulier : une commande qui s'allume (le texte doit rester lisible pendant tout le fondu), et un changement de bloc central (la fente ne doit ni se refermer ni se rouvrir).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(mouvement): retirer la maquette de comparaison, mettre à jour la doc"
```

---

## Notes d'exécution

**Ordre imposé.** Les tâches 2 → 5 → 7 sont chaînées : les courbes avant les gestes, la règle
d'imbrication **avant** la couverture exhaustive. Poser les marques de la tâche 7 sans la tâche 5
fait exploser le nombre de clones simultanés et sature `FANTOMES_MAX` dès le premier changement de
source média.

**Un trou connu, sans parade automatique.** Une clé instable fait clignoter un élément (sortie puis
entrée à chaque peinture). Le garde-fou de la tâche 8 ne l'attrape pas : il ne voit que l'absence de
marque, jamais une marque mal choisie. À surveiller en revue de la tâche 7.

**jsdom ne calcule aucune mise en page.** `offsetLeft`/`offsetWidth` y valent 0 partout : toute
position ou taille doit être injectée dans les tests, comme le font déjà les suites existantes.
Seul `outils/verifier-rendu.mjs` mesure réellement.
