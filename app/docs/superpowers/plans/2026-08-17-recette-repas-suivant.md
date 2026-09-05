# Recette du repas suivant — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La tablette cuisine annonce le repas suivant du planning Grocy et ouvre sa recette dans l'app, avec minuteurs, ingrédients et réduction pendant la cuisson.

**Architecture:** Un client Grocy isolé (`src/grocy.ts`) remplace la lecture `todo.grocy_meal_plan` ; un module pur (`src/repas.ts`) choisit le repas suivant ; une sous-vue `#recette` (`src/rendu/recette.ts`) rend la description HTML de la recette, paginée par l'auteur et sous-découpée si elle déborde ; un nouveau mode principal `recette` garde un point de reprise sur l'accueil quand la vue est réduite.

**Tech Stack:** TypeScript, `lit` (avec `unsafeHTML`), rollup, vitest + jsdom, `outils/verifier-rendu.mjs` (Playwright).

**Spec:** `docs/superpowers/specs/2026-08-17-recette-repas-suivant-design.md`

## Global Constraints

- Travailler **toujours depuis `tools/wallpanel-app`**, jamais depuis la racine du dépôt HA.
- Cadre **343 × 585 px**, marge nulle. La hauteur totale ne bouge pas selon le contenu : on **remplace** un bloc, jamais on n'en ajoute.
- Cibles tactiles **≥ 62 px**, contraste texte/fond **≥ 5:1**.
- **Aucun geste de navigation** : ni swipe, ni appui long. Une action destructive demande **deux appuis** (armement puis confirmation).
- **Pas de donnée en double sur la même tablette** (la répétition entre tablettes est permise).
- Couleurs : **jetons Material 3 générés** (`styles/jetons.css`), jamais de hex en dur dans un composant.
- Moteur cible : **Chrome 100** (Fire 7) — pas de `dvh`, pas de syntaxe récente non transpilée.
- `npm run build` **DÉPLOIE en production** : ne l'exécuter qu'à la tâche 12.
- jsdom ne calcule **aucune** mise en page : toute affirmation de hauteur/contraste vient de `node outils/verifier-rendu.mjs`.
- Base Grocy résolue par l'origine : `http://192.168.0.1:9283` en HTTP, `https://grocy.allanic.me` en HTTPS.
- Emplacements de minuteur : `timer.cuisine`, `timer.cuisine_2`, `timer.cuisine_3` — **jamais `timer.change`** (HA refuse « beyond duration »), toujours `timer.start` avec une durée recalculée.

---

### Task 1: Client Grocy — `src/grocy.ts`

**Files:**
- Create: `src/grocy.ts`
- Test: `tests/grocy.test.ts`

**Interfaces:**
- Consumes: rien (premier module du lot).
- Produces: `baseGrocy(origine: { protocol: string }): string` ; `creerGrocy(deps?: { fetchFn?: typeof fetch; base?: string }): { chargerPlan(): Promise<PlanGrocy | undefined>; chargerIngredients(recetteId: number): Promise<Ingredient[]> }` ; types `EntreePlan`, `SectionPlan`, `RecetteGrocy`, `PlanGrocy`, `Ingredient`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/grocy.test.ts
import { describe, expect, it, vi } from 'vitest';
import { baseGrocy, creerGrocy } from '../src/grocy';

function fetchFactice(routes: Record<string, unknown>) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const cle = Object.keys(routes).find((k) => u.includes(k));
    if (cle === undefined) return { ok: false, status: 404, json: async () => ({}) } as Response;
    return { ok: true, status: 200, json: async () => routes[cle] } as Response;
  }) as unknown as typeof fetch;
}

const PLAN_OK = {
  '/api/objects/meal_plan_sections': [
    { id: 3, name: 'Dîner', time_info: '20:00' },
  ],
  '/api/objects/meal_plan': [
    { id: 139, day: '2026-08-17', type: 'recipe', recipe_id: 76, note: null, done: 0, section_id: 3 },
  ],
  '/api/objects/recipes': [
    { id: 76, name: 'Bol lentilles', description: '<div class="page-recipes">x</div>' },
  ],
};

describe('baseGrocy', () => {
  it('vise le Grocy local en HTTP et le distant en HTTPS', () => {
    expect(baseGrocy({ protocol: 'http:' })).toBe('http://192.168.0.1:9283');
    expect(baseGrocy({ protocol: 'https:' })).toBe('https://grocy.allanic.me');
  });
});

describe('chargerPlan', () => {
  it('assemble entrées, sections et recettes', async () => {
    const g = creerGrocy({ fetchFn: fetchFactice(PLAN_OK), base: 'http://g' });
    const plan = await g.chargerPlan();
    expect(plan?.entrees[0].id).toBe(139);
    expect(plan?.sections[0].time_info).toBe('20:00');
    expect(plan?.recettes[0].name).toBe('Bol lentilles');
  });

  it('rend undefined si une lecture manque, sans lever', async () => {
    const partiel = { ...PLAN_OK } as Record<string, unknown>;
    delete partiel['/api/objects/recipes'];
    const g = creerGrocy({ fetchFn: fetchFactice(partiel), base: 'http://g' });
    await expect(g.chargerPlan()).resolves.toBeUndefined();
  });

  it('rend undefined quand le réseau rejette, sans lever', async () => {
    const g = creerGrocy({
      fetchFn: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
      base: 'http://g',
    });
    await expect(g.chargerPlan()).resolves.toBeUndefined();
  });

  it('rend undefined sur une réponse qui n_est pas un tableau', async () => {
    const g = creerGrocy({
      fetchFn: fetchFactice({ '/api/objects/': { erreur: 'nope' } }), base: 'http://g',
    });
    await expect(g.chargerPlan()).resolves.toBeUndefined();
  });
});

describe('chargerIngredients', () => {
  it('fusionne position, produit, unité et stock', async () => {
    const g = creerGrocy({
      base: 'http://g',
      fetchFn: fetchFactice({
        '/api/objects/recipes_pos': [{ id: 1, recipe_id: 76, product_id: 9, amount: 2, qu_id: 4 }],
        '/api/objects/products': [{ id: 9, name: 'Lentilles' }],
        '/api/objects/quantity_units': [{ id: 4, name: 'g' }],
        '/api/stock': [{ product_id: 9, amount: '5' }],
      }),
    });
    expect(await g.chargerIngredients(76)).toEqual([
      { produit: 9, nom: 'Lentilles', quantite: 2, unite: 'g', stock: 5 },
    ]);
  });

  it('rend un tableau vide si une lecture manque', async () => {
    const g = creerGrocy({ fetchFn: fetchFactice({}), base: 'http://g' });
    expect(await g.chargerIngredients(76)).toEqual([]);
  });

  it('donne un stock de 0 à un produit absent du stock', async () => {
    const g = creerGrocy({
      base: 'http://g',
      fetchFn: fetchFactice({
        '/api/objects/recipes_pos': [{ id: 1, recipe_id: 76, product_id: 9, amount: 1, qu_id: 2 }],
        '/api/objects/products': [{ id: 9, name: 'Feta' }],
        '/api/objects/quantity_units': [{ id: 2, name: 'Pièce' }],
        '/api/stock': [],
      }),
    });
    expect((await g.chargerIngredients(76))[0].stock).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grocy.test.ts`
Expected: FAIL — « Failed to resolve import "../src/grocy" ».

- [ ] **Step 3: Write minimal implementation**

```ts
// src/grocy.ts
/** Lecture de Grocy pour le repas suivant et ses ingrédients. Grocy est interrogé en direct parce
 *  que c'est la SEULE source qui porte la section d'un repas et son heure : `todo.grocy_meal_plan`
 *  (l'intégration HA) ne mappe que `day`/`summary`/`description` et marque `completed` tout ce qui
 *  est à J+1, cf. le spec.
 *
 *  NE LÈVE JAMAIS — même discipline que `chargerMeteo`/`chargerAgenda` (`demarrage.ts`) : une
 *  erreur rend `undefined` (ou un tableau vide), l'appelant garde son dernier plan connu, le bloc
 *  disparaît, l'écran vit.
 *
 *  Les ÉCRITURES ne passent pas par ici : retirer du stock reste un service Home Assistant
 *  (`grocy.consume_*`), soumis au garde `estHorsLigne` comme toute autre commande. */
export type EntreePlan = {
  id: number; day: string; type: string; recipe_id: number | null;
  note: string | null; done: number; section_id: number;
};
export type SectionPlan = { id: number; name: string | null; time_info: string | null };
export type RecetteGrocy = { id: number; name: string; description: string | null };
export type PlanGrocy = { entrees: EntreePlan[]; sections: SectionPlan[]; recettes: RecetteGrocy[] };
export type Ingredient = {
  produit: number; nom: string; quantite: number; unite: string; stock: number;
};

/** Le Grocy local n'est joignable qu'en HTTP ; une page servie en HTTPS (accès distant, téléphone)
 *  verrait ce `fetch` bloqué comme contenu mixte. Même règle que le `isRemote` de
 *  `config/www/grocy-scanner.html`. Les deux hôtes répondent sans clé et autorisent l'origine
 *  correspondante (`Access-Control-Allow-Origin`, vérifié sur les deux). */
export function baseGrocy(origine: { protocol: string }): string {
  return origine.protocol === 'https:' ? 'https://grocy.allanic.me' : 'http://192.168.0.1:9283';
}

type PosGrocy = { recipe_id: number; product_id: number; amount: number; qu_id: number };
type ProduitGrocy = { id: number; name: string };
type UniteGrocy = { id: number; name: string };
type LigneStock = { product_id: number; amount: string | number };

export function creerGrocy(deps: { fetchFn?: typeof fetch; base?: string } = {}) {
  const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const base = deps.base ?? baseGrocy(location);

  /** Rend `undefined` sur tout ce qui n'est pas un tableau exploitable : HTTP non-ok, JSON
   *  malformé, réseau coupé, réponse d'erreur Grocy (`{ error_message: … }`). */
  async function lireTableau<T>(chemin: string): Promise<T[] | undefined> {
    try {
      const r = await fetchFn(`${base}${chemin}`, { headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) return undefined;
      const j: unknown = await r.json();
      return Array.isArray(j) ? (j as T[]) : undefined;
    } catch {
      return undefined;
    }
  }

  return {
    async chargerPlan(): Promise<PlanGrocy | undefined> {
      const [entrees, sections, recettes] = await Promise.all([
        lireTableau<EntreePlan>('/api/objects/meal_plan'),
        lireTableau<SectionPlan>('/api/objects/meal_plan_sections'),
        lireTableau<RecetteGrocy>('/api/objects/recipes'),
      ]);
      if (!entrees || !sections || !recettes) return undefined;
      return { entrees, sections, recettes };
    },

    /** Le stock est relu à chaque appel : c'est la donnée la plus volatile de l'écran (elle change
     *  à chaque retrait), et l'appelant rappelle cette fonction après chaque consommation. */
    async chargerIngredients(recetteId: number): Promise<Ingredient[]> {
      const [pos, produits, unites, stock] = await Promise.all([
        lireTableau<PosGrocy>('/api/objects/recipes_pos'),
        lireTableau<ProduitGrocy>('/api/objects/products'),
        lireTableau<UniteGrocy>('/api/objects/quantity_units'),
        lireTableau<LigneStock>('/api/stock'),
      ]);
      if (!pos || !produits || !unites || !stock) return [];
      const nomProduit = new Map(produits.map((p) => [p.id, p.name]));
      const nomUnite = new Map(unites.map((u) => [u.id, u.name]));
      const enStock = new Map(stock.map((s) => [s.product_id, Number(s.amount) || 0]));
      return pos
        .filter((p) => p.recipe_id === recetteId)
        .map((p) => ({
          produit: p.product_id,
          nom: nomProduit.get(p.product_id) ?? `Produit #${p.product_id}`,
          quantite: p.amount,
          unite: nomUnite.get(p.qu_id) ?? '',
          stock: enStock.get(p.product_id) ?? 0,
        }));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/grocy.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/grocy.ts tests/grocy.test.ts
git commit -m "feat(grocy): client de lecture du plan de repas et des ingredients"
```

---

### Task 2: Choix du repas suivant — `src/repas.ts`

**Files:**
- Create: `src/repas.ts`
- Test: `tests/repas.test.ts`

**Interfaces:**
- Consumes: `PlanGrocy` de la tâche 1.
- Produces: `repasSuivant(plan: PlanGrocy, maintenant: Date): RepasSuivant | undefined` avec
  `type RepasSuivant = { uid: string; etiquette: string; plat: string; description?: string }`.
  `description` est le HTML brut de la recette (absent pour une note) ; `uid` est l'id de l'entrée
  `meal_plan`, c'est la clé de persistance de la tâche 11.

- [ ] **Step 1: Write the failing test**

```ts
// tests/repas.test.ts
import { describe, expect, it } from 'vitest';
import { repasSuivant } from '../src/repas';
import type { PlanGrocy } from '../src/grocy';

const SECTIONS = [
  { id: -1, name: null, time_info: null },
  { id: 1, name: 'Petit-déjeuner', time_info: '07:30' },
  { id: 2, name: 'Déjeuner', time_info: '12:30' },
  { id: 3, name: 'Dîner', time_info: '20:00' },
];

const RECETTES = [
  { id: 76, name: 'Bol lentilles-tomate-feta', description: '<div class="page-recipes">A</div>' },
  { id: 77, name: 'Melon-feta', description: '<div class="page-recipes">B</div>' },
];

function plan(entrees: PlanGrocy['entrees']): PlanGrocy {
  return { entrees, sections: SECTIONS, recettes: RECETTES };
}

function entree(p: Partial<PlanGrocy['entrees'][0]> = {}): PlanGrocy['entrees'][0] {
  return {
    id: 1, day: '2026-08-17', type: 'recipe', recipe_id: 76,
    note: null, done: 0, section_id: 3, ...p,
  };
}

describe('repasSuivant', () => {
  it('montre le dîner quand il est encore devant', () => {
    const r = repasSuivant(plan([entree({ id: 139 })]), new Date(2026, 7, 17, 14, 0));
    expect(r).toEqual({
      uid: '139', etiquette: 'Dîner · 20 h', plat: 'Bol lentilles-tomate-feta',
      description: '<div class="page-recipes">A</div>',
    });
  });

  it('garde le dîner pendant les 2 h de grâce qui suivent son heure', () => {
    const r = repasSuivant(plan([
      entree({ id: 139 }),
      entree({ id: 140, day: '2026-08-18', section_id: 2, recipe_id: 77 }),
    ]), new Date(2026, 7, 17, 21, 30));
    expect(r?.uid).toBe('139');
  });

  it('passe au premier repas de demain une fois la grâce écoulée', () => {
    const r = repasSuivant(plan([
      entree({ id: 139 }),
      entree({ id: 140, day: '2026-08-18', section_id: 2, recipe_id: 77 }),
    ]), new Date(2026, 7, 17, 23, 0));
    expect(r?.uid).toBe('140');
    expect(r?.etiquette).toBe('Demain, déjeuner · 12 h 30');
  });

  it('abrège le petit-déjeuner de demain', () => {
    const r = repasSuivant(plan([
      entree({ id: 141, day: '2026-08-18', section_id: 1, recipe_id: 77 }),
    ]), new Date(2026, 7, 17, 23, 0));
    expect(r?.etiquette).toBe('Demain, petit-déj. · 7 h 30');
  });

  it('écarte un repas déjà fait', () => {
    const r = repasSuivant(plan([
      entree({ id: 139, done: 1 }),
      entree({ id: 142, section_id: 3, recipe_id: 77, day: '2026-08-18' }),
    ]), new Date(2026, 7, 17, 14, 0));
    expect(r?.uid).toBe('142');
  });

  it('rend une note sans description : rien à ouvrir', () => {
    const r = repasSuivant(plan([
      entree({ id: 143, type: 'note', recipe_id: null, note: 'Reste quinoa + légumes' }),
    ]), new Date(2026, 7, 17, 14, 0));
    expect(r).toEqual({ uid: '143', etiquette: 'Dîner · 20 h', plat: 'Reste quinoa + légumes' });
    expect(r?.description).toBeUndefined();
  });

  it('saute une note vide', () => {
    const r = repasSuivant(plan([
      entree({ id: 144, type: 'note', recipe_id: null, note: '   ' }),
      entree({ id: 145, day: '2026-08-18', section_id: 2, recipe_id: 77 }),
    ]), new Date(2026, 7, 17, 14, 0));
    expect(r?.uid).toBe('145');
  });

  it('saute une entrée dont la recette est introuvable, jamais « Unknown recipe »', () => {
    const r = repasSuivant(plan([
      entree({ id: 146, recipe_id: 999 }),
      entree({ id: 147, day: '2026-08-18', section_id: 2, recipe_id: 77 }),
    ]), new Date(2026, 7, 17, 14, 0));
    expect(r?.uid).toBe('147');
  });

  it('range une section sans heure en fin de journée', () => {
    const r = repasSuivant(plan([
      entree({ id: 148, section_id: -1, recipe_id: 77 }),
      entree({ id: 149, section_id: 3 }),
    ]), new Date(2026, 7, 17, 14, 0));
    expect(r?.uid).toBe('149');            // 20:00 avant 23:59
    expect(r?.etiquette).toBe('Dîner · 20 h');
  });

  it('rend undefined quand le plan est épuisé', () => {
    const r = repasSuivant(plan([entree({ id: 139, day: '2026-08-10' })]),
                           new Date(2026, 7, 17, 14, 0));
    expect(r).toBeUndefined();
  });

  it('rend undefined sur un plan vide', () => {
    expect(repasSuivant(plan([]), new Date(2026, 7, 17, 14, 0))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/repas.test.ts`
Expected: FAIL — module `../src/repas` introuvable.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/repas.ts
/** Quel repas vient ensuite dans le planning Grocy. Fonction PURE : l'horloge est reçue en
 *  paramètre, aucune lecture d'`Etat`, aucun réseau — donc testable sans navigateur, comme
 *  `modes.ts` et `minuteur.ts`. */
import type { PlanGrocy } from './grocy';

export type RepasSuivant = {
  /** Id de l'entrée `meal_plan` — la clé de persistance de la recette en cours. */
  uid: string;
  /** « Dîner · 20 h », « Demain, déjeuner · 12 h 30 ». */
  etiquette: string;
  /** Nom de la recette, ou texte de la note. */
  plat: string;
  /** HTML de la recette (blocs `.page-recipes`). Absent pour une note : rien à ouvrir. */
  description?: string;
};

/** Une section sans `time_info` (l'id -1 existe dans ce plan) est rangée en fin de journée plutôt
 *  qu'ignorée : elle porte de vraies entrées, qui doivent passer APRÈS le dîner du même jour. */
const FIN_DE_JOURNEE = '23:59';

/** Un repas reste « suivant » 2 h après son heure. Sans cette marge, à 20 h 01 l'écran basculerait
 *  sur le petit-déjeuner de demain alors qu'on est en train de préparer ce dîner-là. 2 h ne
 *  chevauche jamais le repas d'après : le plus rapproché est déjeuner 12:30 → dîner 20:00. */
const GRACE_MS = 2 * 3_600_000;

/** `'20:00'` → `'20 h'`, `'12:30'` → `'12 h 30'`, `'07:30'` → `'7 h 30'` : l'usage français, et pas
 *  d'heure à deux chiffres inutile qui volerait de la place dans une étiquette bornée à une ligne. */
function heureFr(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  const heures = String(Number(h));
  return m === '00' ? `${heures} h` : `${heures} h ${m}`;
}

/** Fuseau LOCAL, comme partout ailleurs dans ce projet (`estCeJour`, `agenda.ts`) : `meal_plan.day`
 *  est une date civile sans zone, la comparer en UTC décalerait le basculement du soir. */
function horodater(jour: string, hhmm: string): number {
  const [a, m, j] = jour.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(a, m - 1, j, hh, mm).getTime();
}

function estDemain(jour: string, maintenant: Date): boolean {
  const demain = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1);
  const [a, m, j] = jour.split('-').map(Number);
  return a === demain.getFullYear() && m - 1 === demain.getMonth() && j === demain.getDate();
}

function etiqueter(nomSection: string, hhmm: string, jour: string, maintenant: Date): string {
  const heure = heureFr(hhmm);
  if (!estDemain(jour, maintenant)) return `${nomSection} · ${heure}`;
  // « Petit-déjeuner » abrégé : « Demain, petit-déjeuner · 7 h 30 » dépasse la ligne de `.mode-bloc .t`.
  const nom = nomSection === 'Petit-déjeuner' ? 'petit-déj.' : nomSection.toLowerCase();
  return `Demain, ${nom} · ${heure}`;
}

export function repasSuivant(plan: PlanGrocy, maintenant: Date): RepasSuivant | undefined {
  const sections = new Map(plan.sections.map((s) => [s.id, s]));
  const recettes = new Map(plan.recettes.map((r) => [r.id, r]));
  const limite = maintenant.getTime() - GRACE_MS;

  const candidats = plan.entrees
    .filter((e) => e.done === 0)
    .map((e) => {
      const section = sections.get(e.section_id);
      const hhmm = section?.time_info ?? FIN_DE_JOURNEE;
      return { e, quand: horodater(e.day, hhmm), hhmm, nomSection: section?.name ?? 'Repas' };
    })
    .filter(({ quand }) => Number.isFinite(quand) && quand >= limite)
    .sort((a, b) => a.quand - b.quand);

  for (const { e, hhmm, nomSection } of candidats) {
    const etiquette = etiqueter(nomSection, hhmm, e.day, maintenant);
    if (e.type === 'recipe' && e.recipe_id !== null) {
      const recette = recettes.get(e.recipe_id);
      // Recette introuvable : on saute plutôt que d'écrire « Unknown recipe » à l'écran, ce que
      // produit l'intégration HA aujourd'hui — un mensonge affiché en grand dans la cuisine.
      if (!recette) continue;
      return {
        uid: String(e.id), etiquette, plat: recette.name,
        ...(recette.description ? { description: recette.description } : {}),
      };
    }
    // `note` et `product` : un texte à lire, rien à ouvrir. Une note vide n'est pas un repas.
    const texte = (e.note ?? '').trim();
    if (texte === '') continue;
    return { uid: String(e.id), etiquette, plat: texte };
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/repas.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/repas.ts tests/repas.test.ts
git commit -m "feat(repas): choix du repas suivant avec section, heure et marge de grace"
```

---

### Task 3: Pages et assainissement — `src/recette.ts`

**Files:**
- Create: `src/recette.ts`
- Test: `tests/recette.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `decouperPages(html: string): string[]` ; `assainir(html: string): string` ;
  `MOTIF_TAG: RegExp` ; `extraireTags(texte: string): { nom: string; secondes: number }[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/recette.test.ts
import { describe, expect, it } from 'vitest';
import { assainir, decouperPages, extraireTags } from '../src/recette';

describe('decouperPages', () => {
  it('rend un élément par bloc .page-recipes', () => {
    const pages = decouperPages(
      '<div class="page-recipes"><p>garde</p></div><div class="page-recipes"><p>étape</p></div>');
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('garde');
    expect(pages[1]).toContain('étape');
  });

  it('rend une page unique quand la description n_a aucun bloc', () => {
    expect(decouperPages('<p>tout en vrac</p>')).toEqual(['<p>tout en vrac</p>']);
  });

  it('rend un tableau vide sur une description vide', () => {
    expect(decouperPages('')).toEqual([]);
  });
});

describe('assainir', () => {
  it('retire les couleurs en dur, illisibles sur fond sombre', () => {
    const s = assainir('<p style="color:#555;font-size:14px;">gris</p>');
    expect(s).not.toContain('color');
    expect(s).toContain('font-size:14px');
  });

  it('retire background et background-color', () => {
    expect(assainir('<p style="background:#fff;">x</p>')).not.toContain('background');
  });

  it('retire les hauteurs d_image en dur et pose la classe de plafonnement', () => {
    const s = assainir('<img src="u" style="width:100%;height:250px;">');
    expect(s).not.toContain('250px');
    expect(s).toContain('class="recette-img"');
  });

  it('retire tout script, style et attribut on*', () => {
    const s = assainir('<script>alert(1)</script><style>p{}</style><p onclick="x()">t</p>');
    expect(s).not.toContain('script');
    expect(s).not.toContain('onclick');
    expect(s).toContain('<p>t</p>');
  });

  it('conserve la structure et le gras des étapes', () => {
    const s = assainir('<h3>Étape 1</h3><ol><li>Ajouter <strong>100g</strong></li></ol>');
    expect(s).toContain('<h3>Étape 1</h3>');
    expect(s).toContain('<strong>100g</strong>');
  });
});

describe('extraireTags', () => {
  it('lit nom et secondes d_un tag de minuteur', () => {
    expect(extraireTags('Cuire #Pâtes:600 puis égoutter')).toEqual([{ nom: 'Pâtes', secondes: 600 }]);
  });

  it('lit plusieurs tags dans le même texte', () => {
    expect(extraireTags('#Four:1200 et #Repos:300')).toHaveLength(2);
  });

  it('ignore un texte sans tag', () => {
    expect(extraireTags('Mélanger le tout')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/recette.test.ts`
Expected: FAIL — module `../src/recette` introuvable.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/recette.ts
/** Le HTML des recettes vient de Grocy, écrit à la main dans la description du produit : il porte
 *  ses propres pages (`.page-recipes`), ses propres couleurs et des images de 200 à 250 px.
 *
 *  Ce module le prépare pour l'app AVANT tout rendu : découpage en pages, retrait des couleurs en
 *  dur (`color:#555` sur fond sombre échoue au contrôle de contraste 5:1), plafonnement des
 *  images, retrait de tout ce qui est exécutable. Pas de DOM persistant ici : `DOMParser` sert de
 *  parseur, on rend des chaînes — c'est ce qui garde ces fonctions testables sans navigateur. */

/** `#nom:secondes` dans le texte d'une étape. Repris tel quel de `config/www/grocy-recipes.html`
 *  (les recettes existantes en contiennent déjà) : changer ce motif casserait les recettes écrites. */
export const MOTIF_TAG = /#([^#\n]+?):(\d+)/g;

export function extraireTags(texte: string): { nom: string; secondes: number }[] {
  const tags: { nom: string; secondes: number }[] = [];
  for (const m of texte.matchAll(MOTIF_TAG)) {
    tags.push({ nom: m[1].trim(), secondes: Number(m[2]) });
  }
  return tags;
}

function analyser(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

export function decouperPages(html: string): string[] {
  if (html.trim() === '') return [];
  const doc = analyser(html);
  const blocs = Array.from(doc.querySelectorAll('.page-recipes'));
  // Une description sans bloc reste une page : c'est le cas de 9 des 79 recettes de cette
  // installation. Jamais zéro page pour un contenu non vide — l'écran afficherait un cadre creux.
  if (blocs.length === 0) return [html];
  return blocs.map((b) => b.innerHTML);
}

/** Déclarations de style à retirer : celles qui décident d'une couleur (les jetons M3 doivent
 *  reprendre la main) ou d'une hauteur d'image (plafonnée par `.recette-img`, `base.css`). */
const STYLES_INTERDITS = /^(color|background|background-color|height|width|max-height)$/i;

export function assainir(html: string): string {
  const doc = analyser(html);
  doc.querySelectorAll('script, style').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      // Rien d'exécutable : ce HTML est local, mais il n'a aucune raison de porter du script.
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    }
    const style = el.getAttribute('style');
    if (style !== null) {
      const garde = style.split(';')
        .map((d) => d.trim())
        .filter((d) => d !== '' && !STYLES_INTERDITS.test(d.split(':')[0].trim()))
        .join(';');
      if (garde === '') el.removeAttribute('style');
      else el.setAttribute('style', garde);
    }
  });
  // Les images gardent leur place mais plus leur taille : `.recette-img` les plafonne à 140 px,
  // sans quoi une page d'étape de 454 caractères + une image de 200 px dépasse les 585 px.
  doc.querySelectorAll('img').forEach((img) => img.setAttribute('class', 'recette-img'));
  return doc.body.innerHTML;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/recette.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/recette.ts tests/recette.test.ts
git commit -m "feat(recette): decoupage en pages, assainissement du HTML Grocy, tags de minuteur"
```

---

### Task 4: Sous-découpage d'une page trop longue — `src/scinder.ts`

**Files:**
- Create: `src/scinder.ts`
- Test: `tests/scinder.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `scinderSelonHauteur(hauteurs: number[], dispo: number): number[][]` — rend les indices
  d'éléments par sous-page, dans l'ordre. Utilisée par la vue (tâche 6) avec des hauteurs mesurées
  dans le navigateur.

- [ ] **Step 1: Write the failing test**

```ts
// tests/scinder.test.ts
import { describe, expect, it } from 'vitest';
import { scinderSelonHauteur } from '../src/scinder';

describe('scinderSelonHauteur', () => {
  it('laisse une page qui tient en une seule sous-page', () => {
    expect(scinderSelonHauteur([100, 100, 100], 400)).toEqual([[0, 1, 2]]);
  });

  it('coupe entre deux éléments quand ça déborde', () => {
    expect(scinderSelonHauteur([200, 200, 200], 400)).toEqual([[0, 1], [2]]);
  });

  it('ne laisse jamais une sous-page vide, même sur un élément plus haut que la place', () => {
    expect(scinderSelonHauteur([900, 100], 400)).toEqual([[0], [1]]);
  });

  it('rend une seule sous-page vide pour une page sans élément', () => {
    expect(scinderSelonHauteur([], 400)).toEqual([[]]);
  });

  it('accepte une place nulle sans boucler : un élément par sous-page', () => {
    expect(scinderSelonHauteur([10, 10], 0)).toEqual([[0], [1]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scinder.test.ts`
Expected: FAIL — module `../src/scinder` introuvable.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/scinder.ts
/** Répartit les éléments d'une page de recette en sous-pages qui tiennent dans la hauteur
 *  disponible. La pire page du catalogue (454 caractères + image) fait environ 700 px pour 585 px
 *  d'écran : sans ce découpage, soit elle déborde (interdit), soit elle défile (un geste, interdit
 *  aussi sur ces dalles).
 *
 *  PURE et sans DOM : reçoit des hauteurs déjà mesurées, rend des indices. C'est ce qui permet de
 *  tester la règle de coupe sans navigateur — jsdom ne calcule aucune hauteur, la MESURE elle-même
 *  n'est donc vérifiable que par `outils/verifier-rendu.mjs`.
 *
 *  La coupe tombe TOUJOURS entre deux éléments : jamais au milieu d'un `<li>` ou d'un paragraphe,
 *  ce qui couperait une consigne de cuisine en deux. */
export function scinderSelonHauteur(hauteurs: number[], dispo: number): number[][] {
  if (hauteurs.length === 0) return [[]];
  const pages: number[][] = [];
  let courante: number[] = [];
  let cumul = 0;
  hauteurs.forEach((h, i) => {
    // Un élément seul plus haut que la place disponible reste seul sur sa sous-page : mieux vaut
    // une sous-page un peu trop haute qu'une sous-page vide, ou une boucle infinie.
    if (courante.length > 0 && cumul + h > dispo) {
      pages.push(courante);
      courante = [];
      cumul = 0;
    }
    courante.push(i);
    cumul += h;
  });
  pages.push(courante);
  return pages;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scinder.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scinder.ts tests/scinder.test.ts
git commit -m "feat(scinder): repartition d une page de recette en sous-pages"
```

---

### Task 5: Blocs de l'accueil — `rendreRepasSuivant` et `rendreRecetteReduite`

**Files:**
- Modify: `src/rendu/defaut.ts:55-65` (remplace `rendreRepas`)
- Test: `tests/defaut.test.ts`

**Interfaces:**
- Consumes: `RepasSuivant` (tâche 2).
- Produces: `rendreRepasSuivant(r: RepasSuivant | undefined): TemplateResult | undefined` ;
  `rendreRecetteReduite(v: { etape: number; total: number; plat: string; restantS?: number }): TemplateResult`.
  Le bloc du repas n'est touchable que si `r.description` existe ; il pose alors
  `location.hash = '#recette'`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/defaut.test.ts — à ajouter aux suites existantes
import { render } from 'lit';
import { describe, expect, it } from 'vitest';
import { rendreRecetteReduite, rendreRepasSuivant } from '../src/rendu/defaut';

function peindre(t: ReturnType<typeof rendreRepasSuivant>): HTMLElement {
  const hote = document.createElement('div');
  if (t) render(t, hote);
  return hote;
}

describe('rendreRepasSuivant', () => {
  it('affiche la section, l_heure et le plat', () => {
    const hote = peindre(rendreRepasSuivant({
      uid: '139', etiquette: 'Dîner · 20 h', plat: 'Bol lentilles',
      description: '<div class="page-recipes">A</div>',
    }));
    expect(hote.querySelector('.t')?.textContent).toBe('Dîner · 20 h');
    expect(hote.querySelector('.v')?.textContent).toContain('Bol lentilles');
  });

  it('ouvre la vue recette au contact quand il y a une recette', () => {
    const hote = peindre(rendreRepasSuivant({
      uid: '139', etiquette: 'Dîner · 20 h', plat: 'Bol lentilles', description: '<p>x</p>',
    }));
    location.hash = '';
    hote.querySelector('.mode-bloc')!.dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('#recette');
  });

  it('reste inerte sur une note : rien à ouvrir', () => {
    const hote = peindre(rendreRepasSuivant({
      uid: '143', etiquette: 'Déjeuner · 12 h 30', plat: 'Reste quinoa',
    }));
    location.hash = '';
    hote.querySelector('.mode-bloc')!.dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('');
  });

  it('rend undefined sans repas', () => {
    expect(rendreRepasSuivant(undefined)).toBeUndefined();
  });

  it('rend undefined sur un plat vide', () => {
    expect(rendreRepasSuivant({ uid: '1', etiquette: 'Dîner · 20 h', plat: '  ' })).toBeUndefined();
  });
});

describe('rendreRecetteReduite', () => {
  it('affiche l_étape et le plat', () => {
    const hote = peindre(rendreRecetteReduite({ etape: 2, total: 3, plat: 'Bol lentilles' }));
    expect(hote.querySelector('.t')?.textContent).toBe('Étape 2/3');
    expect(hote.querySelector('.v')?.textContent).toContain('Bol lentilles');
  });

  it('ajoute le décompte du minuteur le plus urgent quand il y en a un', () => {
    const hote = peindre(rendreRecetteReduite({
      etape: 2, total: 3, plat: 'Bol lentilles', restantS: 452,
    }));
    expect(hote.querySelector('.t')?.textContent).toBe('Étape 2/3 · 07:32');
  });

  it('rouvre la recette au contact', () => {
    const hote = peindre(rendreRecetteReduite({ etape: 1, total: 2, plat: 'X' }));
    location.hash = '';
    hote.querySelector('.mode-bloc')!.dispatchEvent(new Event('pointerdown'));
    expect(location.hash).toBe('#recette');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/defaut.test.ts`
Expected: FAIL — `rendreRepasSuivant` n'est pas exporté.

- [ ] **Step 3: Write minimal implementation**

Remplacer `rendreRepas` (`src/rendu/defaut.ts:55-65`) par :

```ts
/** Le repas SUIVANT du planning Grocy (`repasSuivant`, `src/repas.ts`), et non plus la liste des
 *  plats du jour : `todo.grocy_meal_plan` ne connaissait ni section ni heure, et rien au-delà
 *  d'aujourd'hui (cf. spec). `.t` porte la section et son heure, `.v` le plat sur deux lignes.
 *
 *  TOUCHABLE quand il y a une recette à ouvrir — comme `.synthese` (`rendu/corps.ts`) ouvre déjà la
 *  vue « Tâches » : on touche ce qu'on vient de lire, sans chevron ni décoration, l'affordance
 *  étant portée par la tuile « Recette » de la grille. Une NOTE (« Reste quinoa + légumes ») n'a pas
 *  de recette : le bloc l'affiche mais reste inerte, et la tuile est masquée (`recetteOuvrable`,
 *  tâche 6) — un bloc qui répond au contact sans rien ouvrir serait le bouton mort que ce projet
 *  traque partout. */
export function rendreRepasSuivant(r: RepasSuivant | undefined): TemplateResult | undefined {
  if (!r || r.plat.trim() === '') return undefined;
  const ouvrable = r.description !== undefined;
  return html`
    <div class="mode-bloc" data-mvt="bloc:repas"
         @pointerdown=${ouvrable ? () => { location.hash = '#recette'; } : null}>
      ${icone('repas')}
      <div class="mode-texte">
        <div class="t">${r.etiquette}</div>
        <div class="v deux-lignes">${r.plat}</div>
      </div>
    </div>`;
}

/** La recette RÉDUITE : le point de reprise pendant la cuisson (mode `recette`, `modes.ts`). Même
 *  gabarit `.mode-bloc` que tous les autres blocs centraux — c'est ce qui garantit que le budget de
 *  hauteur ne bouge pas quand ce mode prend la place du mode `minuteur`.
 *
 *  Le décompte du minuteur le plus urgent vit dans `.t`, à côté de l'étape, JAMAIS sur une ligne à
 *  lui : une ligne de plus ferait grandir le bloc, donc coûterait une commande de la grille
 *  (`combien`, `modes.ts`). Aucun doublon avec la tuile « Minuteur », qui n'affiche que son libellé
 *  (`tuileMinuteur`, `rendu/minuteur.ts`). */
export function rendreRecetteReduite(
  v: { etape: number; total: number; plat: string; restantS?: number },
): TemplateResult {
  const decompte = v.restantS === undefined ? '' : ` · ${formaterRestant(v.restantS)}`;
  return html`
    <div class="mode-bloc" data-mvt="bloc:recette"
         @pointerdown=${() => { location.hash = '#recette'; }}>
      ${icone('book')}
      <div class="mode-texte">
        <div class="t">Étape ${v.etape}/${v.total}${decompte}</div>
        <div class="v deux-lignes">${v.plat}</div>
      </div>
    </div>`;
}
```

Ajouter les imports en tête de `src/rendu/defaut.ts` :

```ts
import { formaterRestant } from '../minuteur';
import type { RepasSuivant } from '../repas';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/defaut.test.ts`
Expected: PASS. Les appels à l'ancien `rendreRepas` dans `demarrage.ts` cassent la compilation : c'est attendu, la tâche 11 les recâble. Vérifier avec `npx tsc --noEmit` que les SEULES erreurs restantes concernent `rendreRepas` dans `src/demarrage.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/rendu/defaut.ts tests/defaut.test.ts
git commit -m "feat(defaut): bloc du repas suivant touchable et bloc de recette reduite"
```

---

### Task 6: Mode `recette`, tuile et navigation par vue

**Files:**
- Modify: `src/modes.ts:16-17` (type), `:20-45` (contexte), `:62-82` (`modePrincipal`)
- Modify: `src/pieces.ts:4-29` (type `Bouton`), `:314-318` (commande cuisine)
- Modify: `src/interaction.ts:83-89` (traitement de `vue`)
- Modify: `src/rendu/corps.ts:299-345` (paramètre `recetteOuvrable`)
- Test: `tests/modes.test.ts`, `tests/pieces.test.ts`, `tests/interaction.test.ts`, `tests/corps.test.ts`

**Interfaces:**
- Consumes: rien des tâches précédentes.
- Produces: `ModePrincipal` gagne `'recette'` ; `ContexteModes` gagne `recetteEnCours: boolean` ;
  `Bouton` gagne `vue?: string` ; `rendreCorps(etat, piece, blocCentral?, ctx?, tuileMinuteur?, masquerEntretien?, recetteOuvrable?)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/modes.test.ts — à ajouter
import { describe, expect, it } from 'vitest';
import { modePrincipal, ordreCommandes, type ContexteModes } from '../src/modes';

const CTX: ContexteModes = {
  alerte: false, aspirateurEnMarche: false, ecranAllume: false, sourceJoue: false,
  ouvrantOuvertDepuisMs: 0, chauffageEnMarche: false, ilPleut: false,
  serrureDeverrouillee: false, temperatureExterieure: 20, soleilLeve: true,
  modeInvites: false, instantDelorean: false, minuteurEnCours: false,
  recetteEnCours: false, blocDefaut: 'repas',
};

describe('mode recette', () => {
  it('prime sur le minuteur, le média et le cinéma', () => {
    expect(modePrincipal({ ...CTX, recetteEnCours: true, minuteurEnCours: true })).toBe('recette');
    expect(modePrincipal({ ...CTX, recetteEnCours: true, sourceJoue: true })).toBe('recette');
    expect(modePrincipal({ ...CTX, recetteEnCours: true, ecranAllume: true })).toBe('recette');
  });

  it('cède devant une alerte : la sécurité passe devant la cuisine', () => {
    expect(modePrincipal({ ...CTX, recetteEnCours: true, alerte: true })).toBe('alerte');
  });

  it('laisse quatre commandes, comme le mode defaut', () => {
    const boutons = [1, 2, 3, 4, 5].map((n) => ({
      libelle: `B${n}`, icone: 'bulb', entite: `light.b${n}`,
    }));
    expect(ordreCommandes(boutons, { ...CTX, recetteEnCours: true })).toHaveLength(4);
  });
});
```

```ts
// tests/interaction.test.ts — à ajouter
it('un bouton `vue` pose le hash sans appeler aucun service', () => {
  const etat = new Etat();
  const cx = { appelerService: vi.fn() };
  const appui = creerAppui(etat, cx, setTimeout);
  location.hash = '';
  appui(etat, { libelle: 'Recette', icone: 'book', entite: 'todo.grocy_meal_plan', vue: '#recette' });
  expect(location.hash).toBe('#recette');
  expect(cx.appelerService).not.toHaveBeenCalled();
});
```

```ts
// tests/pieces.test.ts — à ajouter
it('la cuisine ouvre la vue recette, plus la page autonome', () => {
  const b = PIECES.cuisine.commandes.find((c) => c.libelle === 'Recette');
  expect(b?.vue).toBe('#recette');
  expect(b?.lien).toBeUndefined();
  expect(b?.entite).toBe('todo.grocy_meal_plan');
});
```

```ts
// tests/corps.test.ts — à ajouter
it('masque la tuile Recette quand il n_y a pas de recette ouvrable', () => {
  const etat = new Etat();
  etat.appliquer({ entity_id: 'todo.grocy_meal_plan', state: '1', attributes: {} });
  const hote = document.createElement('div');
  render(rendreCorps(etat, PIECES.cuisine, undefined, undefined, undefined, false, false), hote);
  const libelles = Array.from(hote.querySelectorAll('.commande .t')).map((e) => e.textContent);
  expect(libelles).not.toContain('Recette');
});

it('affiche la tuile Recette quand une recette est ouvrable', () => {
  const etat = new Etat();
  etat.appliquer({ entity_id: 'todo.grocy_meal_plan', state: '1', attributes: {} });
  const hote = document.createElement('div');
  render(rendreCorps(etat, PIECES.cuisine, undefined, undefined, undefined, false, true), hote);
  const libelles = Array.from(hote.querySelectorAll('.commande .t')).map((e) => e.textContent);
  expect(libelles).toContain('Recette');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/modes.test.ts tests/interaction.test.ts tests/pieces.test.ts tests/corps.test.ts`
Expected: FAIL — `recetteEnCours` inconnu du type, `vue` inconnu de `Bouton`, 7e paramètre de `rendreCorps` inexistant.

- [ ] **Step 3: Write minimal implementation**

`src/modes.ts` :

```ts
export type ModePrincipal =
  'alerte' | 'recette' | 'minuteur' | 'menage' | 'cinema' | 'media' | 'aeration' | 'voiture' | 'defaut';
```

Dans `ContexteModes`, après `minuteurEnCours` :

```ts
  /** Une recette est ouverte et réduite (vue `#recette` quittée sans « Terminer »). Prime sur tout
   *  sauf l'alerte : le mode `minuteur` n'affiche AUCUNE commande (630 px mesurés), donc sans cette
   *  préséance, lancer un minuteur ferait disparaître le seul point de reprise de la recette. */
  recetteEnCours: boolean;
```

Dans `modePrincipal`, juste après la branche `alerte` :

```ts
  // Priorité 2, devant le minuteur : pendant une cuisson, l'écran doit pouvoir ramener à l'étape en
  // cours. Le décompte du minuteur le plus urgent est repris dans le bloc (`rendreRecetteReduite`),
  // donc rien n'est perdu ; la liste détaillée des trois minuteurs reste à un appui (tuile).
  if (c.recetteEnCours) return 'recette';
```

`src/pieces.ts`, dans `Bouton` après `lien` :

```ts
  /** Sous-vue de l'app ouverte par ce bouton (`location.hash`), par opposition à `lien` qui sort
   *  vers une page autonome. Traité par `interaction.ts` AVANT `lien` et avant tout `service` : une
   *  navigation interne n'appelle jamais HA et n'a rien à rendre optimiste. */
  vue?: string;
```

Et la commande cuisine (`src/pieces.ts:318`) :

```ts
      // Tâche « recette du repas suivant » (2026-08-17) : ouvre désormais la vue `#recette` de
      // l'app, plus la page autonome `/local/grocy-recipes.html` (qui reste en place comme filet,
      // cf. spec). `entite` reste `todo.grocy_meal_plan` : c'est l'indicateur de disponibilité de
      // Grocy déjà exploité par le masquage générique de `rendu/corps.ts`.
      { libelle: 'Recette', icone: 'book', entite: 'todo.grocy_meal_plan', vue: '#recette' },
```

`src/interaction.ts`, avant le test `b.lien` :

```ts
    // Navigation interne (« Recette ») : aucun service, aucun optimisme, aucun garde hors ligne —
    // consulter une recette reste possible quand la maison ne répond plus.
    if (b.vue) { location.hash = b.vue; return; }
```

`src/rendu/corps.ts` — nouveau paramètre en dernière position et filtre :

```ts
  // Tâche « recette » : la tuile qui ouvre `#recette` n'a de sens que s'il y a une recette à
  // ouvrir. Décidé par `demarrage.ts` sur ce qui est RÉELLEMENT disponible (une note du plan de
  // repas n'a pas de recette), jamais sur la pièce — même patron que `masquerEntretien`.
  recetteOuvrable = false,
): TemplateResult {
```

et, juste après le calcul de `utilisables` :

```ts
  const affichables = recetteOuvrable
    ? utilisables : utilisables.filter((c) => c.vue !== '#recette');
  const commandes = ctx ? ordreCommandes(affichables, ctx) : affichables;
```

(remplace la ligne `const commandes = ctx ? ordreCommandes(utilisables, ctx) : utilisables;`)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/modes.test.ts tests/interaction.test.ts tests/pieces.test.ts tests/corps.test.ts`
Expected: PASS. Les autres suites qui construisent un `ContexteModes` littéral doivent recevoir `recetteEnCours: false` — les corriger, c'est la même compilation qui échouerait sinon.

- [ ] **Step 5: Commit**

```bash
git add src/modes.ts src/pieces.ts src/interaction.ts src/rendu/corps.ts tests/
git commit -m "feat(modes): mode recette prioritaire, tuile Recette et navigation par vue"
```

---

### Task 7: La vue `#recette` — structure, pagination, styles

**Files:**
- Create: `src/rendu/recette.ts`
- Modify: `src/styles/base.css` (bloc `.recette-*`)
- Test: `tests/rendu-recette.test.ts`

**Interfaces:**
- Consumes: `decouperPages`/`assainir` (tâche 3), `scinderSelonHauteur` (tâche 4).
- Produces: `rendreVueRecette(v: VueRecette): TemplateResult` avec
  `type VueRecette = { etiquette: string; plat: string; pages: string[]; page: number; ingredients?: Ingredient[]; panneauOuvert: boolean; horsLigne: boolean }` ;
  `brancherRecette(actions: ActionsRecette)` où
  `type ActionsRecette = { page(n: number): void; reduire(): void; terminer(): void; ouvrirPanneau(): void; fermerPanneau(): void; minuteur(nom: string, secondes: number): void; retirer(produit: number, quantite: number): void; retirerTout(): void }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/rendu-recette.test.ts
import { render } from 'lit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { brancherRecette, rendreVueRecette } from '../src/rendu/recette';

const BASE = {
  etiquette: 'Dîner · 20 h', plat: 'Bol lentilles',
  pages: ['<p>garde</p>', '<h3>Étape 1</h3><ol><li>Mélanger</li></ol>', '<p>fin</p>'],
  page: 1, panneauOuvert: false, horsLigne: false,
};

function peindre(v = BASE): HTMLElement {
  const hote = document.createElement('div');
  render(rendreVueRecette(v), hote);
  return hote;
}

describe('rendreVueRecette', () => {
  it('marque la vue pour le moteur de mouvement', () => {
    expect(peindre().querySelector('[data-mvt="vue:recette"]')).not.toBeNull();
  });

  it('affiche l_étiquette du repas, le plat et le numéro de page', () => {
    const hote = peindre();
    expect(hote.textContent).toContain('Dîner · 20 h');
    expect(hote.textContent).toContain('Bol lentilles');
    expect(hote.querySelector('.recette-pages')?.textContent?.trim()).toBe('2/3');
  });

  it('rend le contenu de la page courante, assaini', () => {
    const hote = peindre({ ...BASE, pages: ['<p style="color:#555">gris</p>'], page: 0 });
    expect(hote.querySelector('.recette-page')?.innerHTML).not.toContain('color');
    expect(hote.textContent).toContain('gris');
  });

  it('appelle page() sur les flèches, jamais un swipe', () => {
    const actions = { page: vi.fn(), reduire: vi.fn(), terminer: vi.fn(),
      ouvrirPanneau: vi.fn(), fermerPanneau: vi.fn(), minuteur: vi.fn(),
      retirer: vi.fn(), retirerTout: vi.fn() };
    brancherRecette(actions);
    const hote = peindre();
    hote.querySelector('.recette-prec')!.dispatchEvent(new Event('pointerdown'));
    hote.querySelector('.recette-suiv')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.page).toHaveBeenNthCalledWith(1, 0);
    expect(actions.page).toHaveBeenNthCalledWith(2, 2);
  });

  it('désactive la flèche précédente sur la première page et la suivante sur la dernière', () => {
    expect(peindre({ ...BASE, page: 0 }).querySelector('.recette-prec')!.className)
      .toContain('inactif');
    expect(peindre({ ...BASE, page: 2 }).querySelector('.recette-suiv')!.className)
      .toContain('inactif');
  });

  it('propose Réduire et Terminer, deux sorties distinctes', () => {
    const actions = { page: vi.fn(), reduire: vi.fn(), terminer: vi.fn(),
      ouvrirPanneau: vi.fn(), fermerPanneau: vi.fn(), minuteur: vi.fn(),
      retirer: vi.fn(), retirerTout: vi.fn() };
    brancherRecette(actions);
    const hote = peindre();
    hote.querySelector('.recette-reduire')!.dispatchEvent(new Event('pointerdown'));
    hote.querySelector('.recette-terminer')!.dispatchEvent(new Event('pointerdown'));
    expect(actions.reduire).toHaveBeenCalledOnce();
    expect(actions.terminer).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rendu-recette.test.ts`
Expected: FAIL — module `../src/rendu/recette` introuvable.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/rendu/recette.ts
/** Vue « Recette » (2026-08-17) : troisième sous-vue de l'application, au même titre que « Toute la
 *  maison » (`rendu/maison.ts`), « Tâches » (`rendu/taches.ts`) et le réglage de minuteur
 *  (`rendu/minuteur.ts`) — un seul niveau de profondeur, jamais l'une dans l'autre.
 *
 *  Atteinte de deux façons, qui visent la MÊME chose : le bloc central de l'accueil (le repas
 *  suivant, ou la recette réduite) et la tuile « Recette » de la grille.
 *
 *  AUCUN GESTE : la page autonome `grocy-recipes.html` tournait au swipe, interdit ici — deux
 *  flèches de 62 px les remplacent. Deux sorties distinctes : « Réduire » garde la recette en cours
 *  (mode `recette`, cf. `modes.ts`), « Terminer » la ferme. */
import { html, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { icone } from './icones';
import { assainir } from '../recette';
import type { Ingredient } from '../grocy';

export type VueRecette = {
  etiquette: string;
  plat: string;
  /** Pages déjà découpées ET sous-découpées par l'appelant (`decouperPages`, `scinderSelonHauteur`). */
  pages: string[];
  page: number;
  ingredients?: Ingredient[];
  panneauOuvert: boolean;
  horsLigne: boolean;
};

export type ActionsRecette = {
  page(n: number): void;
  reduire(): void;
  terminer(): void;
  ouvrirPanneau(): void;
  fermerPanneau(): void;
  minuteur(nom: string, secondes: number): void;
  retirer(produit: number, quantite: number): void;
  retirerTout(): void;
};

let actions: ActionsRecette = {
  page: () => {}, reduire: () => {}, terminer: () => {}, ouvrirPanneau: () => {},
  fermerPanneau: () => {}, minuteur: () => {}, retirer: () => {}, retirerTout: () => {},
};
export function brancherRecette(a: ActionsRecette) { actions = a; }

export function rendreVueRecette(v: VueRecette): TemplateResult {
  const premiere = v.page <= 0;
  const derniere = v.page >= v.pages.length - 1;
  return html`
    <div class="corps recette" data-mvt="vue:recette">
      <div class="etiquette ${v.horsLigne ? 'hl' : ''}">
        ${v.horsLigne ? 'Hors ligne' : v.etiquette}
        <span class="recette-pages">${v.page + 1}/${Math.max(1, v.pages.length)}</span>
      </div>
      <div class="recette-titre">${v.plat}</div>
      <div class="recette-page">${unsafeHTML(assainir(v.pages[v.page] ?? ''))}</div>
      <div class="recette-nav">
        <div class="recette-prec ${premiere ? 'inactif' : ''}"
             @pointerdown=${() => { if (!premiere) actions.page(v.page - 1); }}>
          ${icone('precedent')}</div>
        <div class="recette-suiv ${derniere ? 'inactif' : ''}"
             @pointerdown=${() => { if (!derniere) actions.page(v.page + 1); }}>
          ${icone('suivant')}</div>
      </div>
      <div class="recette-actions">
        <div class="recette-ingredients" @pointerdown=${() => actions.ouvrirPanneau()}>
          ${icone('list')}Ingrédients</div>
        <div class="recette-reduire" @pointerdown=${() => actions.reduire()}>
          ${icone('home')}Réduire</div>
        <div class="recette-terminer" @pointerdown=${() => actions.terminer()}>
          ${icone('coche')}Terminer</div>
      </div>
    </div>`;
}
```

Styles à ajouter à `src/styles/base.css` (jetons uniquement, aucun hex) :

```css
/* Vue Recette (2026-08-17). Budget : étiquette + titre 64 px, nav 62 px, actions 62 px, le reste
   pour la page — c'est cette hauteur restante que `scinderSelonHauteur` reçoit, mesurée dans le
   navigateur par outils/verifier-rendu.mjs (jsdom ne calcule aucune mise en page). */
.recette-titre { font-size: 18px; font-weight: 600; color: var(--md-on-surface); }
.recette-pages { float: right; font-variant-numeric: tabular-nums; }
.recette-page { flex: 1; min-height: 0; overflow: hidden; color: var(--md-on-surface); font-size: 16px; }
.recette-page h3 { font-size: 16px; margin: 6px 0; color: var(--md-on-surface); }
.recette-page ol, .recette-page ul { padding-left: 20px; }
.recette-page li { margin: 4px 0; }
/* Les images des recettes arrivent en 200-250 px de haut : plafonnées ici, jamais dans le HTML
   d'origine (que `assainir` nettoie de ses tailles en dur). */
.recette-img { width: 100%; max-height: 140px; object-fit: cover; border-radius: 12px; }
.recette-nav, .recette-actions { display: grid; gap: 8px; }
.recette-nav { grid-template-columns: 1fr 1fr; }
.recette-actions { grid-template-columns: 1fr 1fr 1fr; }
.recette-nav > *, .recette-actions > * {
  min-height: 62px; display: flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 16px; background: var(--md-surface-container-high); color: var(--md-on-surface);
  font-size: 14px;
}
.recette-nav > .inactif { opacity: 0.4; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rendu-recette.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rendu/recette.ts src/styles/base.css tests/rendu-recette.test.ts
git commit -m "feat(recette): vue plein ecran avec pagination au bouton et deux sorties"
```

---

### Task 8: Minuteurs inline dans la recette

**Files:**
- Modify: `src/rendu/recette.ts` (transformation des tags en boutons)
- Test: `tests/rendu-recette.test.ts`

**Interfaces:**
- Consumes: `MOTIF_TAG` (tâche 3), `ActionsRecette.minuteur` (tâche 7).
- Produces: `VueRecette` gagne `minuteurs: { nom: string; restantS: number; actif: boolean }[]` et
  `slotLibre: boolean` ; le rendu remplace chaque tag `#nom:secondes` par un bouton
  `.recette-minuteur`, décompté depuis l'état HA du créneau qui porte ce nom.

- [ ] **Step 1: Write the failing test**

```ts
// tests/rendu-recette.test.ts — à ajouter
const AVEC_TAG = {
  ...BASE,
  pages: ['<ol><li>Cuire #Pâtes:600 puis égoutter</li></ol>'],
  page: 0, minuteurs: [], slotLibre: true,
};

it('remplace un tag par un bouton de minuteur et retire le texte du tag', () => {
  const hote = peindre(AVEC_TAG);
  const bouton = hote.querySelector('.recette-minuteur');
  expect(bouton?.textContent).toContain('10:00');
  expect(hote.textContent).not.toContain('#Pâtes:600');
  expect(hote.textContent).toContain('Cuire');
});

it('démarre le minuteur avec le nom du tag', () => {
  const actions = { page: vi.fn(), reduire: vi.fn(), terminer: vi.fn(),
    ouvrirPanneau: vi.fn(), fermerPanneau: vi.fn(), minuteur: vi.fn(),
    retirer: vi.fn(), retirerTout: vi.fn() };
  brancherRecette(actions);
  peindre(AVEC_TAG).querySelector('.recette-minuteur')!.dispatchEvent(new Event('pointerdown'));
  expect(actions.minuteur).toHaveBeenCalledWith('Pâtes', 600);
});

it('affiche le décompte publié par HA quand ce minuteur tourne', () => {
  const hote = peindre({ ...AVEC_TAG, minuteurs: [{ nom: 'Pâtes', restantS: 452, actif: true }] });
  const bouton = hote.querySelector('.recette-minuteur');
  expect(bouton?.textContent).toContain('07:32');
  expect(bouton?.className).toContain('encours');
});

it('grise le bouton quand les trois créneaux sont pris', () => {
  const hote = peindre({ ...AVEC_TAG, slotLibre: false });
  expect(hote.querySelector('.recette-minuteur')!.className).toContain('inactif');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rendu-recette.test.ts`
Expected: FAIL — aucun `.recette-minuteur` dans le DOM.

- [ ] **Step 3: Write minimal implementation**

Dans `src/rendu/recette.ts`, ajouter au type puis remplacer le rendu de `.recette-page` :

```ts
export type VueRecette = {
  // … champs de la tâche 7 …
  /** Les minuteurs de la pièce tels que HA les publie (`listerMinuteurs`, `minuteur.ts`). Le
   *  décompte affiché sur un bouton vient de LÀ, jamais d'un compte à rebours local : Android tue
   *  régulièrement l'app, et un décompte porté par la page mentirait après un rechargement. */
  minuteurs: { nom: string; restantS: number; actif: boolean }[];
  /** Au moins un des trois créneaux est au repos (`premierSlotLibre`). */
  slotLibre: boolean;
};
```

```ts
/** Découpe le HTML d'une page sur les tags `#nom:secondes` et rend un tableau alterné
 *  texte/bouton. Le HTML entre deux tags est assaini puis injecté tel quel ; le tag lui-même
 *  DISPARAÎT du texte — il est devenu un bouton, le laisser en clair afficherait « #Pâtes:600 »
 *  au milieu d'une consigne de cuisine. */
function pageAvecMinuteurs(brut: string, v: VueRecette): unknown[] {
  const morceaux: unknown[] = [];
  let curseur = 0;
  for (const m of brut.matchAll(MOTIF_TAG)) {
    const avant = brut.slice(curseur, m.index);
    if (avant !== '') morceaux.push(unsafeHTML(assainir(avant)));
    morceaux.push(boutonMinuteur(m[1].trim(), Number(m[2]), v));
    curseur = (m.index ?? 0) + m[0].length;
  }
  const reste = brut.slice(curseur);
  if (reste !== '') morceaux.push(unsafeHTML(assainir(reste)));
  return morceaux;
}

function boutonMinuteur(nom: string, secondes: number, v: VueRecette): TemplateResult {
  const enCours = v.minuteurs.find((m) => m.nom === nom);
  // Sans créneau libre, un appui ne pourrait rien lancer : le bouton le DIT (grisé) plutôt que de
  // rester engageant et de ne rien faire — même règle que `tuileMinuteur(sature)`.
  const inactif = enCours === undefined && !v.slotLibre;
  const classes = ['recette-minuteur', enCours ? 'encours' : '', inactif ? 'inactif' : '']
    .filter((c) => c !== '').join(' ');
  return html`<span class="${classes}"
    @pointerdown=${() => { if (!inactif) actions.minuteur(nom, secondes); }}>
    ${icone('minuteur')}${formaterRestant(enCours ? enCours.restantS : secondes)}</span>`;
}
```

et dans `rendreVueRecette` :

```ts
      <div class="recette-page">${pageAvecMinuteurs(v.pages[v.page] ?? '', v)}</div>
```

Imports à compléter : `import { assainir, MOTIF_TAG } from '../recette';` et
`import { formaterRestant } from '../minuteur';`.

Styles (`base.css`) :

```css
.recette-minuteur {
  display: inline-flex; align-items: center; gap: 4px; min-height: 62px; padding: 0 14px;
  border-radius: 16px; background: var(--md-secondary-container);
  color: var(--md-on-secondary-container); font-variant-numeric: tabular-nums;
}
.recette-minuteur.encours { background: var(--md-primary); color: var(--md-on-primary); }
.recette-minuteur.inactif { opacity: 0.4; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rendu-recette.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rendu/recette.ts src/styles/base.css tests/rendu-recette.test.ts
git commit -m "feat(recette): boutons de minuteur inline decomptes depuis Home Assistant"
```

---

### Task 9: Panneau ingrédients et retrait de stock

**Files:**
- Modify: `src/rendu/recette.ts` (panneau)
- Create: `src/rendu/panneau-ingredients.ts` *(si `recette.ts` dépasse ~250 lignes — le fichier doit rester lisible d'un seul coup d'œil)*
- Test: `tests/rendu-recette.test.ts`

**Interfaces:**
- Consumes: `Ingredient` (tâche 1), `ActionsRecette.retirer`/`retirerTout` (tâche 7).
- Produces: `VueRecette` gagne `armee: (cle: string) => boolean` ; le panneau rend une ligne par
  ingrédient et exige **deux appuis** par retrait (clés `ing:<produit>` et `tout`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/rendu-recette.test.ts — à ajouter
const AVEC_PANNEAU = {
  ...BASE, page: 0, minuteurs: [], slotLibre: true, panneauOuvert: true,
  armee: () => false,
  ingredients: [
    { produit: 9, nom: 'Lentilles', quantite: 2, unite: 'g', stock: 5 },
    { produit: 10, nom: 'Feta', quantite: 100, unite: 'g', stock: 0 },
  ],
};

it('liste les ingrédients avec quantité et stock', () => {
  const hote = peindre(AVEC_PANNEAU);
  const lignes = hote.querySelectorAll('.ing-ligne');
  expect(lignes).toHaveLength(2);
  expect(lignes[0].textContent).toContain('Lentilles');
  expect(lignes[0].textContent).toContain('2 g');
  expect(lignes[0].querySelector('.ing-stock')!.className).toContain('ok');
  expect(lignes[1].querySelector('.ing-stock')!.className).toContain('manque');
});

it('exige deux appuis pour retirer un ingrédient', () => {
  const actions = { page: vi.fn(), reduire: vi.fn(), terminer: vi.fn(),
    ouvrirPanneau: vi.fn(), fermerPanneau: vi.fn(), minuteur: vi.fn(),
    retirer: vi.fn(), retirerTout: vi.fn() };
  brancherRecette(actions);
  // Premier appui : l'appelant arme, le rendu n'appelle rien de destructif de lui-même.
  peindre(AVEC_PANNEAU).querySelector('.ing-retirer')!.dispatchEvent(new Event('pointerdown'));
  expect(actions.retirer).toHaveBeenCalledWith(9, 2);   // c'est `demarrage.ts` qui arbitre l'armement
  // Ligne armée : le libellé demande confirmation.
  const armee = peindre({ ...AVEC_PANNEAU, armee: (c: string) => c === 'ing:9' });
  expect(armee.querySelector('.ing-ligne')!.textContent).toContain('Toucher pour confirmer');
});

it('propose « Retirer tout » et le signale armé', () => {
  const armee = peindre({ ...AVEC_PANNEAU, armee: (c: string) => c === 'tout' });
  expect(armee.querySelector('.ing-tout')!.textContent).toContain('Confirmer');
});

it('rend les retraits inertes hors ligne', () => {
  const actions = { page: vi.fn(), reduire: vi.fn(), terminer: vi.fn(),
    ouvrirPanneau: vi.fn(), fermerPanneau: vi.fn(), minuteur: vi.fn(),
    retirer: vi.fn(), retirerTout: vi.fn() };
  brancherRecette(actions);
  const hote = peindre({ ...AVEC_PANNEAU, horsLigne: true });
  hote.querySelector('.ing-retirer')!.dispatchEvent(new Event('pointerdown'));
  hote.querySelector('.ing-tout')!.dispatchEvent(new Event('pointerdown'));
  expect(actions.retirer).not.toHaveBeenCalled();
  expect(actions.retirerTout).not.toHaveBeenCalled();
});

it('dit « Aucun ingrédient » plutôt que de rendre un panneau vide', () => {
  const hote = peindre({ ...AVEC_PANNEAU, ingredients: [] });
  expect(hote.textContent).toContain('Aucun ingrédient');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rendu-recette.test.ts`
Expected: FAIL — aucun `.ing-ligne` rendu.

- [ ] **Step 3: Write minimal implementation**

```ts
/** Le panneau RECOUVRE la zone de contenu, dans la MÊME vue : pas de troisième niveau de hash —
 *  l'app en tient deux (accueil → sous-vue), et une recette n'est pas une raison d'en ajouter un.
 *
 *  Retirer du stock est destructif : DEUX appuis, comme cocher une tâche (`cochage.ts`), jamais un
 *  appui long. C'est `demarrage.ts` qui porte l'armement (une seule instance pour la page) ; ce
 *  rendu ne fait que demander l'action et afficher l'état armé que `v.armee` lui donne. */
function rendrePanneau(v: VueRecette): TemplateResult {
  const ingredients = v.ingredients ?? [];
  const toutArme = v.armee('tout');
  return html`
    <div class="ing-panneau">
      <div class="ing-liste">
        ${ingredients.length === 0 ? html`<div class="ing-vide">Aucun ingrédient</div>` : ''}
        ${ingredients.map((i) => {
          const arme = v.armee(`ing:${i.produit}`);
          const assez = i.stock >= i.quantite;
          return html`
            <div class="ing-ligne ${arme ? 'armee' : ''}">
              <div>
                <div class="t">${i.nom}</div>
                <div class="s">${arme ? 'Toucher pour confirmer'
                  : html`${i.quantite} ${i.unite} —
                    <span class="ing-stock ${assez ? 'ok' : 'manque'}">
                      stock ${i.stock} ${i.unite}</span>`}</div>
              </div>
              <div class="ing-retirer"
                   @pointerdown=${() => { if (!v.horsLigne) actions.retirer(i.produit, i.quantite); }}>
                ${icone('croix')}</div>
            </div>`;
        })}
      </div>
      <div class="ing-actions">
        <div class="ing-tout ${toutArme ? 'armee' : ''}"
             @pointerdown=${() => { if (!v.horsLigne) actions.retirerTout(); }}>
          ${toutArme ? 'Confirmer : tout retirer ?' : 'Retirer tout du stock'}</div>
        <div class="ing-fermer" @pointerdown=${() => actions.fermerPanneau()}>Fermer</div>
      </div>
    </div>`;
}
```

Dans `rendreVueRecette`, remplacer la ligne de `.recette-page` par :

```ts
      ${v.panneauOuvert ? rendrePanneau(v)
        : html`<div class="recette-page">${pageAvecMinuteurs(v.pages[v.page] ?? '', v)}</div>`}
```

Styles (`base.css`) :

```css
.ing-panneau { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.ing-liste { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.ing-ligne {
  min-height: 62px; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 0 12px; border-radius: 16px; background: var(--md-surface-container-high);
  color: var(--md-on-surface);
}
.ing-ligne.armee { background: var(--md-tertiary-container); color: var(--md-on-tertiary-container); }
.ing-ligne .t { font-size: 16px; }
.ing-ligne .s { font-size: 13px; opacity: 0.9; }
.ing-stock.ok { color: var(--md-primary); }
.ing-stock.manque { color: var(--md-error); }
.ing-retirer { min-width: 62px; min-height: 62px; display: flex; align-items: center; justify-content: center; }
.ing-actions { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
.ing-actions > * {
  min-height: 62px; display: flex; align-items: center; justify-content: center;
  border-radius: 16px; background: var(--md-surface-container-high); color: var(--md-on-surface);
  font-size: 14px; text-align: center;
}
.ing-actions > .armee { background: var(--md-error-container); color: var(--md-on-error-container); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rendu-recette.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rendu/recette.ts src/styles/base.css tests/rendu-recette.test.ts
git commit -m "feat(recette): panneau ingredients avec stock et retraits en deux appuis"
```

---

### Task 10: Persistance de la recette en cours — `src/recette-en-cours.ts`

**Files:**
- Create: `src/recette-en-cours.ts`
- Test: `tests/recette-en-cours.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `type EtatRecette = { uid: string; page: number; majLe: number }` ;
  `lireRecette(stockage: Pick<Storage, 'getItem'>, maintenantMs: number): EtatRecette | undefined` ;
  `ecrireRecette(stockage: Pick<Storage, 'setItem'>, e: EtatRecette): void` ;
  `effacerRecette(stockage: Pick<Storage, 'removeItem'>): void` ; `CLE_RECETTE = 'wallpanel_recette'` ;
  `PEREMPTION_MS = 4 h`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/recette-en-cours.test.ts
import { describe, expect, it, vi } from 'vitest';
import { effacerRecette, ecrireRecette, lireRecette } from '../src/recette-en-cours';

const T0 = new Date(2026, 7, 17, 20, 0).getTime();

function stockage(valeur: string | null) {
  return { getItem: () => valeur, setItem: vi.fn(), removeItem: vi.fn() };
}

describe('recette en cours', () => {
  it('relit une recette récente', () => {
    const s = stockage(JSON.stringify({ uid: '139', page: 2, majLe: T0 }));
    expect(lireRecette(s, T0 + 60_000)).toEqual({ uid: '139', page: 2, majLe: T0 });
  });

  it('ignore une recette de plus de 4 h : l_écran mural ne reste pas sur celle d_hier', () => {
    const s = stockage(JSON.stringify({ uid: '139', page: 2, majLe: T0 }));
    expect(lireRecette(s, T0 + 5 * 3_600_000)).toBeUndefined();
  });

  it('ignore un contenu illisible sans lever', () => {
    expect(lireRecette(stockage('{pas du json'), T0)).toBeUndefined();
    expect(lireRecette(stockage(null), T0)).toBeUndefined();
    expect(lireRecette(stockage(JSON.stringify({ page: 1 })), T0)).toBeUndefined();
  });

  it('écrit et efface sous la clé attendue', () => {
    const s = stockage(null);
    ecrireRecette(s, { uid: '139', page: 0, majLe: T0 });
    expect(s.setItem).toHaveBeenCalledWith('wallpanel_recette',
      JSON.stringify({ uid: '139', page: 0, majLe: T0 }));
    effacerRecette(s);
    expect(s.removeItem).toHaveBeenCalledWith('wallpanel_recette');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/recette-en-cours.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/recette-en-cours.ts
/** L'étape en cours de lecture, hors de la page : Android tue régulièrement Fully sur ces Fire 7
 *  (cf. `minuteur.ts`, même raison pour l'état des minuteurs), et perdre l'étape au milieu d'une
 *  cuisson est exactement ce que cette fonctionnalité doit empêcher. Même mécanisme que le
 *  `grocy_recipe_state` de la page autonome, avec en plus une péremption.
 *
 *  Ne lève jamais : un stockage illisible, plein ou refusé (mode privé) rend simplement
 *  `undefined`, l'écran repart du repas suivant. */
export const CLE_RECETTE = 'wallpanel_recette';

/** 4 h : au-delà, la recette n'est plus « en cours », c'est un écran mural resté allumé sur le
 *  dîner de la veille. Le repli de 30 min de la vue RÉDUIT (il ne ferme pas) ; c'est cette
 *  péremption-là qui finit par oublier. */
export const PEREMPTION_MS = 4 * 3_600_000;

export type EtatRecette = { uid: string; page: number; majLe: number };

export function lireRecette(
  stockage: Pick<Storage, 'getItem'>, maintenantMs: number,
): EtatRecette | undefined {
  try {
    const brut = stockage.getItem(CLE_RECETTE);
    if (brut === null) return undefined;
    const e = JSON.parse(brut) as Partial<EtatRecette>;
    if (typeof e.uid !== 'string' || typeof e.page !== 'number' || typeof e.majLe !== 'number') {
      return undefined;
    }
    if (maintenantMs - e.majLe > PEREMPTION_MS) return undefined;
    return { uid: e.uid, page: e.page, majLe: e.majLe };
  } catch {
    return undefined;
  }
}

export function ecrireRecette(stockage: Pick<Storage, 'setItem'>, e: EtatRecette): void {
  try { stockage.setItem(CLE_RECETTE, JSON.stringify(e)); } catch { /* stockage plein/refusé */ }
}

export function effacerRecette(stockage: Pick<Storage, 'removeItem'>): void {
  try { stockage.removeItem(CLE_RECETTE); } catch { /* idem */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/recette-en-cours.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/recette-en-cours.ts tests/recette-en-cours.test.ts
git commit -m "feat(recette): persistance de l etape en cours avec peremption de 4 h"
```

---

### Task 11: Câblage dans `demarrage.ts`

**Files:**
- Modify: `src/demarrage.ts` — imports (`:48-51`), `chargerRepas` (`:391-400`), `ctx` (`:1005-1011`), retours anticipés de sous-vue (`~:1100-1200`), `blocCentral` (`:1251-1269`), appel à `rendreCorps` (`:1334`), `estSousVue`/`armerRetour` (`:660-680`)
- Test: `tests/orchestration.test.ts`, `tests/navigation.test.ts`, `tests/aides.ts`

**Interfaces:**
- Consumes: tout ce qui précède (`creerGrocy`, `repasSuivant`, `decouperPages`, `scinderSelonHauteur`, `rendreRepasSuivant`, `rendreRecetteReduite`, `rendreVueRecette`, `brancherRecette`, `lireRecette`/`ecrireRecette`/`effacerRecette`).
- Produces: `OptionsDemarrage` gagne `grocy?: { chargerPlan; chargerIngredients }` (injectable pour les tests) ; `Montage` (dans `tests/aides.ts`) gagne `grocy` pour piloter le plan depuis un test.

- [ ] **Step 1: Write the failing test**

```ts
// tests/navigation.test.ts — à ajouter
import { describe, expect, it, vi } from 'vitest';
import { monterDemarrage } from './aides';
import { PIECES } from '../src/pieces';

const PLAN = {
  entrees: [{ id: 139, day: '2026-08-17', type: 'recipe', recipe_id: 76, note: null, done: 0, section_id: 3 }],
  sections: [{ id: 3, name: 'Dîner', time_info: '20:00' }],
  recettes: [{ id: 76, name: 'Bol lentilles',
    description: '<div class="page-recipes">A</div><div class="page-recipes">B</div>' }],
};

describe('vue recette', () => {
  it('affiche le repas suivant sur l_accueil et l_ouvre au contact', async () => {
    const m = await monterDemarrage(PIECES.cuisine, {
      maintenant: () => new Date(2026, 7, 17, 14, 0),
      grocy: { chargerPlan: async () => PLAN, chargerIngredients: async () => [] },
    });
    expect(m.racine.textContent).toContain('Dîner · 20 h');
    m.racine.querySelector('.mode-bloc')!.dispatchEvent(new Event('pointerdown'));
    await vider();
    expect(location.hash).toBe('#recette');
    expect(m.racine.querySelector('[data-mvt="vue:recette"]')).not.toBeNull();
  });

  it('n_arme PAS le retour de 45 s sur #recette, mais un repli de 30 min', async () => {
    const m = await monterDemarrage(PIECES.cuisine, {
      maintenant: () => new Date(2026, 7, 17, 14, 0),
      grocy: { chargerPlan: async () => PLAN, chargerIngredients: async () => [] },
    });
    location.hash = '#recette';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vider();
    const delais = m.minuteurFn.mock.calls.map((c) => c[1]);
    expect(delais).toContain(1_800_000);
    expect(delais).not.toContain(45_000);
  });

  it('réduit vers l_accueil en gardant l_étape, et le bloc la rouvre', async () => {
    const m = await monterDemarrage(PIECES.cuisine, {
      maintenant: () => new Date(2026, 7, 17, 14, 0),
      grocy: { chargerPlan: async () => PLAN, chargerIngredients: async () => [] },
    });
    location.hash = '#recette';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vider();
    m.racine.querySelector('.recette-suiv')!.dispatchEvent(new Event('pointerdown'));
    await vider();
    m.racine.querySelector('.recette-reduire')!.dispatchEvent(new Event('pointerdown'));
    await vider();
    expect(location.hash).toBe('');
    expect(m.racine.textContent).toContain('Étape 2/2');
  });

  it('Terminer rend le bloc au repas suivant', async () => {
    const m = await monterDemarrage(PIECES.cuisine, {
      maintenant: () => new Date(2026, 7, 17, 14, 0),
      grocy: { chargerPlan: async () => PLAN, chargerIngredients: async () => [] },
    });
    location.hash = '#recette';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vider();
    m.racine.querySelector('.recette-terminer')!.dispatchEvent(new Event('pointerdown'));
    await vider();
    expect(m.racine.textContent).toContain('Dîner · 20 h');
    expect(m.racine.textContent).not.toContain('Étape');
  });

  it('la recette réduite prime sur le mode minuteur', async () => {
    const m = await monterDemarrage(PIECES.cuisine, {
      maintenant: () => new Date(2026, 7, 17, 14, 0),
      grocy: { chargerPlan: async () => PLAN, chargerIngredients: async () => [] },
    });
    location.hash = '#recette';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vider();
    m.racine.querySelector('.recette-reduire')!.dispatchEvent(new Event('pointerdown'));
    m.pousser('timer.cuisine', 'active',
      { finishes_at: new Date(2026, 7, 17, 14, 7, 32).toISOString(), duration: '0:10:00' });
    await vider();
    expect(m.racine.textContent).toContain('Étape 1/2 · 07:32');
    expect(m.racine.querySelectorAll('.commande').length).toBeGreaterThan(0);
  });

  it('démarre un minuteur inline sur le premier créneau libre', async () => {
    const planTag = { ...PLAN, recettes: [{ id: 76, name: 'Bol',
      description: '<div class="page-recipes">Cuire #Pâtes:600</div>' }] };
    const m = await monterDemarrage(PIECES.cuisine, {
      maintenant: () => new Date(2026, 7, 17, 14, 0),
      grocy: { chargerPlan: async () => planTag, chargerIngredients: async () => [] },
    });
    m.pousser('timer.cuisine', 'idle', {});
    location.hash = '#recette';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vider();
    m.racine.querySelector('.recette-minuteur')!.dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).toHaveBeenCalledWith('timer', 'start',
      { entity_id: 'timer.cuisine', duration: '00:10:00' });
    expect(m.appelerService).toHaveBeenCalledWith('input_text', 'set_value',
      { entity_id: 'input_text.minuteur_cuisine_nom', value: 'Pâtes' });
  });

  it('retire un ingrédient en deux appuis, jamais au premier', async () => {
    const m = await monterDemarrage(PIECES.cuisine, {
      maintenant: () => new Date(2026, 7, 17, 14, 0),
      grocy: {
        chargerPlan: async () => PLAN,
        chargerIngredients: async () => [
          { produit: 9, nom: 'Lentilles', quantite: 2, unite: 'g', stock: 5 }],
      },
    });
    location.hash = '#recette';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vider();
    m.racine.querySelector('.recette-ingredients')!.dispatchEvent(new Event('pointerdown'));
    await vider();
    m.racine.querySelector('.ing-retirer')!.dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).not.toHaveBeenCalledWith('grocy', 'consume_product_from_stock',
      expect.anything());
    m.racine.querySelector('.ing-retirer')!.dispatchEvent(new Event('pointerdown'));
    expect(m.appelerService).toHaveBeenCalledWith('grocy', 'consume_product_from_stock',
      { product_id: 9, amount: 2, spoiled: false, transaction_type: 'consume' });
  });
});
```

Étendre `tests/aides.ts` :

```ts
export type OptionsMontage = {
  // … champs existants …
  /** Double du client Grocy (`src/grocy.ts`) : aucun test ne doit sortir sur le réseau, et le plan
   *  de repas est la donnée dont dépend tout ce lot. Absent ⇒ plan indisponible (`undefined`),
   *  exactement l'état d'un Grocy arrêté : les tests existants gardent donc leur comportement. */
  grocy?: {
    chargerPlan: () => Promise<PlanGrocy | undefined>;
    chargerIngredients: (id: number) => Promise<Ingredient[]>;
  };
};
```

et le passer à `demarrer(...)` :

```ts
    grocy: options.grocy ?? {
      chargerPlan: async () => undefined, chargerIngredients: async () => [],
    },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/navigation.test.ts`
Expected: FAIL — `grocy` n'est pas une option de `demarrer`, `#recette` ne rend rien.

- [ ] **Step 3: Write minimal implementation**

Dans `src/demarrage.ts` :

```ts
// 1) Imports
import { creerGrocy, type Ingredient, type PlanGrocy } from './grocy';
import { repasSuivant, type RepasSuivant } from './repas';
import { decouperPages } from './recette';
import { rendreRepasSuivant, rendreRecetteReduite, rendreEntretien, rendreProchainRdv,
         ENTITE_ENTRETIEN } from './rendu/defaut';
import { brancherRecette, rendreVueRecette } from './rendu/recette';
import { ecrireRecette, effacerRecette, lireRecette } from './recette-en-cours';
import { creerArmement } from './cochage';
import { premierSlotLibre, hms } from './minuteur';

// 2) État local du lot, à côté des autres caches de `demarrer()`
let plan: PlanGrocy | undefined;
let repas: RepasSuivant | undefined;          // remplace l'ancien cache `repas: {uid,texte}[]`
let pagesRecette: string[] = [];
let pageRecette = 0;
let recetteUid: string | null = null;         // recette en cours (réduite ou ouverte)
let ingredients: Ingredient[] | undefined;
let panneauIngredients = false;
const armementStock = creerArmement(d.minuteurFn);

// 3) `chargerRepas` devient `chargerPlan` (remplace la lecture `todo.grocy_meal_plan`)
async function chargerPlan(): Promise<void> {
  const frais = await grocy.chargerPlan();
  if (frais) plan = frais;                    // Grocy muet : dernier plan connu conservé
  repas = plan ? repasSuivant(plan, d.maintenant()) : undefined;
  // La recette en cours a pu disparaître du plan (repas supprimé côté Grocy) : on l'oublie plutôt
  // que de garder un mode `recette` qui ne pointe plus rien.
  if (recetteUid !== null && !plan?.entrees.some((e) => String(e.id) === recetteUid)) {
    fermerRecette();
  }
  dessiner();
}

// 4) Ouverture / réduction / fermeture
function ouvrirRecette(): void {
  if (!repas?.description) return;
  recetteUid = repas.uid;
  pagesRecette = decouperPages(repas.description);
  const memoire = lireRecette(d.stockage, d.maintenant().getTime());
  pageRecette = memoire?.uid === recetteUid
    ? Math.min(Math.max(0, memoire.page), pagesRecette.length - 1) : 0;
  ingredients = undefined;
  panneauIngredients = false;
  void chargerIngredients();
  location.hash = '#recette';
}

function memoriserRecette(): void {
  if (recetteUid === null) return;
  ecrireRecette(d.stockage, { uid: recetteUid, page: pageRecette, majLe: d.maintenant().getTime() });
}

function fermerRecette(): void {
  recetteUid = null;
  pagesRecette = [];
  pageRecette = 0;
  panneauIngredients = false;
  effacerRecette(d.stockage);
}

async function chargerIngredients(): Promise<void> {
  const idRecette = plan?.entrees.find((e) => String(e.id) === recetteUid)?.recipe_id;
  if (idRecette === undefined || idRecette === null) return;
  ingredients = await grocy.chargerIngredients(idRecette);
  dessiner();
}

// 5) Actions de la vue, branchées UNE SEULE FOIS sous la garde `initialise` (comme
//    `brancherMinuteur`/`brancherVoiture`/`brancherCochageTaches`)
brancherRecette({
  page: (n) => { pageRecette = n; memoriserRecette(); dessiner(); },
  reduire: () => { memoriserRecette(); location.hash = ''; dessiner(); },
  terminer: () => { fermerRecette(); location.hash = ''; dessiner(); },
  ouvrirPanneau: () => { panneauIngredients = true; void chargerIngredients(); dessiner(); },
  fermerPanneau: () => { panneauIngredients = false; armementStock.desarmer(); dessiner(); },
  minuteur: (nom, secondes) => {
    if (horsLigne) return;
    const slots = piece.minuteurs ?? [];
    const enCours = listerMinuteurs(etat, slots, d.maintenant().getTime())
      .find((v) => v.nom === nom);
    // Un minuteur qui porte déjà ce nom : on met en pause / on reprend, jamais un second créneau
    // pour la même étape. Reprise par `timer.start` recalculé — `timer.change` échoue au-delà de la
    // durée du dernier start (piège déjà payé, cf. contraintes globales).
    if (enCours) {
      if (enCours.actif) agir('timer', 'pause', enCours.timer);
      else agir('timer', 'start', enCours.timer, { duration: hms(enCours.restantS) });
      return;
    }
    const libre = premierSlotLibre(etat, slots);
    if (libre === null) return;              // trois créneaux pris : le bouton était déjà grisé
    agir('timer', 'start', slots[libre].timer, { duration: hms(secondes) });
    agir('input_text', 'set_value', slots[libre].nom, { value: nom });
  },
  retirer: (produit, quantite) => {
    if (horsLigne) return;
    const cle = `ing:${produit}`;
    if (!armementStock.estArmee(cle)) { armementStock.armer(cle, dessiner); dessiner(); return; }
    armementStock.desarmer();
    cx.appelerService('grocy', 'consume_product_from_stock',
      { product_id: produit, amount: quantite, spoiled: false, transaction_type: 'consume' });
    void chargerIngredients();
    dessiner();
  },
  retirerTout: () => {
    if (horsLigne) return;
    if (!armementStock.estArmee('tout')) { armementStock.armer('tout', dessiner); dessiner(); return; }
    armementStock.desarmer();
    const idRecette = plan?.entrees.find((e) => String(e.id) === recetteUid)?.recipe_id;
    if (idRecette) cx.appelerService('grocy', 'consume_recipe', { recipe_id: idRecette });
    void chargerIngredients();
    dessiner();
  },
});

// 6) Retour automatique : `#recette` a son propre repli, plus long, et qui RÉDUIT
const RETOUR_RECETTE_MS = 30 * 60_000;
const estSousVue = (h: string) =>
  h === '#maison' || h === '#taches' || h === '#minuteur' || h === '#recette';
const armerRetour = () => {
  clearTimeout(retour);
  const delai = location.hash === '#recette' ? RETOUR_RECETTE_MS : RETOUR_MS;
  // `#recette` : on remet le hash à '' SANS fermer la recette (`recetteUid` intact) — l'écran mural
  // revient à l'accueil, l'étape reste. C'est la péremption de 4 h (`recette-en-cours.ts`) qui
  // finit par oublier, jamais ce repli.
  retour = d.minuteurFn(() => { memoriserRecette(); location.hash = ''; }, delai);
};

// 7) Contexte des modes
      recetteEnCours: recetteUid !== null,

// 8) Retour anticipé de la sous-vue, à côté de ceux de `#maison`/`#taches`/`#minuteur`
    if (location.hash === '#recette' && recetteUid !== null) {
      moteur.peindre(rendreVueRecette({
        etiquette: repas?.uid === recetteUid ? repas.etiquette : 'Recette',
        plat: repas?.uid === recetteUid ? repas.plat : '',
        pages: pagesRecette, page: pageRecette,
        minuteurs: vuesMinuteurs.map((v) => ({ nom: v.nom, restantS: v.restantS, actif: v.actif })),
        slotLibre: premierSlotLibre(etat, piece.minuteurs ?? []) !== null,
        ingredients, panneauOuvert: panneauIngredients, horsLigne,
        armee: (cle: string) => armementStock.estArmee(cle),
      }));
      return;
    }

// 9) `blocCentral` — le mode `recette` avant `minuteur`, et le repas suivant à la place de `rendreRepas`
    const blocCentral =
      horsLigne ? rendreHorsLigne()
      : mode === 'alerte' && alerte ? rendreAlerte(alerte)
      : mode === 'recette' ? rendreRecetteReduite({
          etape: pageRecette + 1, total: Math.max(1, pagesRecette.length),
          plat: repas?.uid === recetteUid ? repas.plat : 'Recette',
          ...(vuesMinuteurs[0] ? { restantS: vuesMinuteurs[0].restantS } : {}),
        })
      : mode === 'minuteur' ? rendreMinuteurs(vuesMinuteurs, slotLibre)
      // … le reste inchangé …
      : piece.blocDefaut === 'repas' ? rendreRepasSuivant(repas) ?? replEntretien
      : piece.blocDefaut === 'agenda' ? rendreProchainRdv(evenements, maintenant) ?? replEntretien
      : undefined;

// 10) Appel à `rendreCorps` : 7e argument
    moteur.peindre(html`${rendreBandeau(etat, momentRendu, maintenant, piece.temperature, pastille)}
                        ${rendreCorps(etat, piece, blocCentral, ctxCorps, tuile, entretienAffiche,
                                      repas?.description !== undefined || recetteUid !== null)}
                        ${survol()}`);
```

Remplacer aussi l'armement des chargements périodiques : là où `chargerRepas` était appelée
(`void chargerRepas(); d.intervalFn(chargerRepas, 15 * 60_000);`), appeler `chargerPlan`, sous la
même garde `piece.blocDefaut === 'repas'`. Et au démarrage, si `lireRecette` rend un état non
périmé dont l'`uid` est dans le plan, restaurer `recetteUid`/`pagesRecette`/`pageRecette` pour que
le mode `recette` survive à un redémarrage de l'app.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS pour toutes les suites (les anciennes incluses ; `tests/orchestration.test.ts` doit rester verte à l'identique — c'est la condition posée par ce projet à chaque lot).

- [ ] **Step 5: Commit**

```bash
git add src/demarrage.ts tests/
git commit -m "feat(recette): cablage complet (plan Grocy, sous-vue, reduction, minuteurs, stock)"
```

---

### Task 12: Sous-découpage mesuré, vérificateur de rendu et déploiement

**Files:**
- Modify: `src/rendu/recette.ts` (mesure et re-scission après peinture)
- Modify: `outils/verifier-rendu.mjs` (`:1301-1305` liste des vues, injection)
- Test: `node outils/verifier-rendu.mjs`

**Interfaces:**
- Consumes: `scinderSelonHauteur` (tâche 4), `rendreVueRecette` (tâches 7-9).
- Produces: `window.__injecterPlan(plan)` dans le bundle de vérification (comme `__injecterRepas`) ;
  deux vues supplémentaires dans la boucle du vérificateur.

- [ ] **Step 1: Écrire la mesure et la re-scission**

Dans `src/rendu/recette.ts`, exporter une fonction appelée par `demarrage.ts` après peinture :

```ts
/** Sous-découpe la page RÉELLEMENT peinte si elle dépasse la place disponible. Mesure DOM : jsdom
 *  rend 0 partout, ce contrôle n'est donc vérifiable que par `outils/verifier-rendu.mjs` — d'où le
 *  test de bout en bout de la tâche 12, et pas seulement les tests unitaires de `scinderSelonHauteur`.
 *
 *  Rend les pages recalculées (à mémoriser par l'appelant) ou `null` si rien ne change : sans ce
 *  `null`, chaque peinture relancerait une peinture, en boucle. */
export function reScinder(racine: ParentNode, pages: string[], page: number): string[] | null {
  const zone = racine.querySelector('.recette-page') as HTMLElement | null;
  if (!zone) return null;
  if (zone.scrollHeight <= zone.clientHeight) return null;
  const enfants = Array.from(zone.children) as HTMLElement[];
  if (enfants.length < 2) return null;         // un seul élément : rien à couper, il déborde seul
  const groupes = scinderSelonHauteur(enfants.map((e) => e.offsetHeight), zone.clientHeight);
  if (groupes.length < 2) return null;
  const morceaux = groupes.map((g) => g.map((i) => enfants[i].outerHTML).join(''));
  return [...pages.slice(0, page), ...morceaux, ...pages.slice(page + 1)];
}
```

Dans `demarrage.ts`, juste après la peinture de la vue `#recette` :

```ts
      // Sous-découpage : mesuré sur le DOM peint, jamais estimé. `reScinder` rend `null` quand la
      // page tient — sans quoi chaque peinture en déclencherait une autre.
      const recalculees = reScinder(racine, pagesRecette, pageRecette);
      if (recalculees) { pagesRecette = recalculees; dessiner(); }
      return;
```

- [ ] **Step 2: Ajouter les vues au vérificateur**

Dans `outils/verifier-rendu.mjs`, ajouter à la liste des vues (`:1301`) :

```js
    { nom: 'recette (14 h, #recette)', heure: heureJour, hash: '#recette', figerHorloge: true },
    { nom: 'recette réduite (14 h, accueil)', heure: heureJour, hash: '', figerHorloge: true,
      recetteReduite: true },
```

et, à côté de l'injection `__injecterRepas` existante, injecter un plan qui contient **la page la
plus longue du catalogue** (celle qui doit déclencher le sous-découpage) :

```js
  // 454 caractères + une image : la pire page relevée sur les 79 recettes de cette installation
  // (« Œufs brouillés + tartines comté »). C'est le cas qui prouve le sous-découpage — une page
  // courte ne prouverait rien.
  await page.evaluate((plan) => window.__injecterPlan?.(plan), PLAN_ESSAI_RECETTE);
```

- [ ] **Step 3: Lancer le vérificateur**

Run: `node outils/verifier-rendu.mjs`
Expected: 0 faute — aucun débordement (le sous-découpage a fait son travail), aucune cible < 62 px, aucun contraste < 5:1, aucun texte tronqué. Si le contraste échoue sur le contenu de recette, c'est `assainir` qui a laissé passer une couleur : corriger `STYLES_INTERDITS`, pas le CSS.

- [ ] **Step 4: Déployer et contrôler sur la vraie tablette**

```bash
npm run build          # ÉCRIT dans config/www/wallpanel/ — production
```

Puis, via Home Assistant : `button.tablette_cuisine_vider_le_cache_du_navigateur`, puis
`button.tablette_cuisine_load_start_url`. Contrôle visuel sur
`image.tablette_cuisine_capture_d_ecran` — se fier à l'heure affichée par l'horloge, pas à
`frame_timestamp`.

Vérifier à la main sur la tablette : le bloc annonce le bon repas ; un appui ouvre la recette ;
les flèches paginent ; un tag lance bien un minuteur sur un créneau libre ; « Réduire » revient à
l'accueil en gardant l'étape ; « Terminer » rend le bloc au repas suivant.

- [ ] **Step 5: Commit**

```bash
git add src/rendu/recette.ts src/demarrage.ts outils/verifier-rendu.mjs config/www/wallpanel
git commit -m "feat(recette): sous-decoupage mesure, vues de verification et deploiement"
```

---

## Auto-relecture du plan (faite)

- **Couverture du spec** : §1 → tâche 1 ; §2 → tâche 2 ; §3 → tâches 5 et 6 ; §4 → tâches 5 et 6 ; §5 → tâches 3, 4, 7, 8, 9, 12 ; §6 → tâches 10 et 11 ; §7 → tâche 12 (mesure).
- **Trois points de vigilance signalés aux exécutants** :
  1. La tâche 5 casse volontairement la compilation de `demarrage.ts` (l'ancien `rendreRepas` disparaît) ; c'est la tâche 11 qui la répare. Ne pas « réparer » en gardant `rendreRepas`.
  2. Ajouter `recetteEnCours: false` à tous les `ContexteModes` littéraux des suites existantes (tâche 6), sinon la compilation échoue loin du fichier modifié.
  3. `npm run build` déploie : il n'apparaît qu'à la tâche 12, jamais avant.
- **Cohérence des noms** vérifiée entre tâches : `repasSuivant`/`RepasSuivant`, `decouperPages`, `assainir`, `MOTIF_TAG`, `scinderSelonHauteur`, `rendreRepasSuivant`, `rendreRecetteReduite`, `rendreVueRecette`/`brancherRecette`/`ActionsRecette`, `lireRecette`/`ecrireRecette`/`effacerRecette`, `reScinder`.
