# Garde-manger sur la tablette de la cuisine — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Garde-manger" view on the kitchen tablet to take a batch out of stock, fully or partly, eaten/thrown/expired, browsing by location then aisle — replacing the "À consommer" rows in the Tasks view.

**Architecture:** home-stock gains the aisle of each batch in `home_stock/batches/list` (backward compatible) and refreshes its coordinator after `meal/plan|move|cancel`. home-desk adds a pure model (grouping, pagination, quantities), a loader and a consume action wired like the recipe view (two-press arming, `envoyerCommande`, no optimistic removal), a full-screen sub-view `#garde-manger` with internal levels, and swaps the kitchen "Courses" tile for it.

**Tech Stack:** home-stock: Python 3.14, Home Assistant custom component, pytest-homeassistant-custom-component. home-desk: TypeScript + lit, vitest (jsdom), rollup build into versioned `dist/`; Python component with pytest (Python ≥ 3.14).

**Spec:** `docs/superpowers/specs/2026-09-28-garde-manger-tablette-design.md` (this repo, merged as PR #7).

## Global Constraints

- Code, identifiers, comments, commit messages in **English**; UI strings shown to the household stay French (existing app convention: French labels in render code).
- **No source file over 500 lines** — split along a real seam.
- Wall-screen rules: rows 64 px, **at most 6 rows per page, no scrolling**, 585 px view height budget, Back button, auto-return to home.
- Irreversible actions use **two-press arming** (`createArming`, 3 s), **never a long press**.
- **No optimistic removal** for stock consumption; nothing leaves the screen before home-stock confirms.
- The tablet user is **non-admin**: every new server-side test that simulates the tablet connects with `hass_read_only_access_token`.
- Test discipline of both repos: **two-subject fixtures**; every new test is **proven able to fail** (mutate the code, see red, restore).
- home-stock first (release), then home-desk. **Do not deploy to production, do not restart Home Assistant, do not edit the live HA configuration** — production is done later with the owner.
- PR titles conventional **in English**; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Push over HTTPS (`https://github.com/nivuus/<repo>.git`); root has no SSH key.
- Host shell: wrap pipelines in `bash -c '...'`, use `command grep`. Reusable-workflow CI logs: `gh api repos/nivuus/<repo>/actions/jobs/<id>/logs`.

## Review Focus

1. **A product without aisle** (`aisle_id NULL`, 6 today): must land in "Sans rayon", last — never dropped, never crash.
2. **A batch without `best_before`**: sorts last, displays no date, never "Invalid Date".
3. **Quantity edge cases**: remaining below the step (e.g. 30 g left, step 50) → the only choice is the remaining; fractions of 1 piece (½ = 0.5) allowed; floating noise (0.1+0.2) never shown — format to at most 2 decimals, integers without decimals.
4. **home-stock older than this change** (no `aisle_*` fields): the aisle level is skipped, the view still works.
5. **Stale list**: a batch consumed elsewhere → `stock/consume` refuses (`RefusHA`); the sheet shows home-stock's message, the list is reloaded on Back, nothing is removed before.

---

## Part A — home-stock (repo `nivuus/home-stock`)

Setup: fresh HTTPS clone in the scratchpad; branch `feat/batches-aisle` from `origin/main`. Integration tests need Python ≥ 3.14: `uv venv -p 3.14 .venv && uv pip install -p .venv -r requirements.txt` then `.venv/bin/pytest tests/<file> -q`. (`requirements.txt` pins the HA test harness.)

### Task A1: aisle and location position in `home_stock/batches/list`

**Files:**
- Modify: `custom_components/home_stock/storage/repositories.py` (`stock_rows`, ~line 544)
- Test: `tests/test_websocket.py`, `tests/storage/test_repositories.py`

**Interfaces:**
- Produces: each row of `{"batches": [...]}` gains `aisle_id: int|None`, `aisle_name: str|None`, `aisle_position: int|None`, `location_position: int|None`. Nothing else changes (the HA panel keeps working).

- [ ] **Step 1: Write the failing tests.** In `tests/test_websocket.py`, add a fixture variant seeding TWO products: one with an aisle (look the aisle up by name from the seeded referential, e.g. `"Crémerie"`, via `repo`/SQL, and set `product.aisle_id`), one without. Tests:

```python
async def test_batches_list_carries_the_aisle_and_positions(hass, two_products, hass_ws_client, hass_read_only_access_token):
    client = await hass_ws_client(hass, hass_read_only_access_token)   # the tablet is not an admin
    await client.send_json_auto_id({"type": "home_stock/batches/list"})
    rows = {r["product_name"]: r for r in (await client.receive_json())["result"]["batches"]}
    assert rows["Yaourt"]["aisle_name"] == "Crémerie"
    assert isinstance(rows["Yaourt"]["aisle_position"], int)
    assert rows["Pâtes"]["aisle_id"] is None and rows["Pâtes"]["aisle_name"] is None
    assert isinstance(rows["Pâtes"]["location_position"], int)
```

- [ ] **Step 2: Run, see it fail** (`KeyError: 'aisle_name'`).
- [ ] **Step 3: Implement** — in `stock_rows`, add `LEFT JOIN aisle s ON s.id = p.aisle_id` and select `p.aisle_id, s.name AS aisle_name, s.position AS aisle_position, l.position AS location_position`. Keep `ORDER BY` unchanged. Update the docstring.
- [ ] **Step 4: Run the test file and `tests/storage/test_repositories.py`; all green.** Mutation: drop the `LEFT` (inner join) → the no-aisle product disappears → red; restore.
- [ ] **Step 5: Commit** `feat(home-stock): give batches/list the aisle of each batch`.

### Task A2: refresh the coordinator after `meal/plan`, `meal/move`, `meal/cancel`

**Files:**
- Modify: `custom_components/home_stock/websocket_recipes.py` (`meal_plan`, `meal_move`, `meal_cancel`, ~lines 309–370)
- Test: new `tests/test_meals_refresh.py`

Measured 2026-09-28: `meal/cancel` returned `deleted` but `sensor.home_stock_next_meal` kept the cancelled lunch until the 15-minute coordinator interval; only `meal/validate` (~line 417) refreshes.

- [ ] **Step 1: Failing tests** — one per command, through the websocket, with `hass_read_only_access_token`, seeding two planned meals (lunch and dinner of the same day, far enough in the future to be "next"): after `meal/cancel` of the first, `await hass.async_block_till_done()`, `hass.states.get("sensor.home_stock_next_meal").attributes["meal_id"]` equals the second's id; after `meal/plan` of an earlier meal, it becomes that one; after `meal/move` of the next meal to a later day, the other one becomes next. Never call the coordinator refresh from the test.
- [ ] **Step 2: Run, see all three fail** (stale `meal_id`).
- [ ] **Step 3: Implement** — after `connection.send_result(...)` in each of the three handlers, `await runtime.coordinator.async_request_refresh()`, exactly as `meal_validate` does.
- [ ] **Step 4: Run `tests/test_meals_refresh.py`, `tests/test_meals_plan.py`, `tests/test_meal_sensors.py`, `tests/test_offline_queue_contract.py`; green.** Mutation: remove one refresh → its test red; restore.
- [ ] **Step 5: Commit** `fix(home-stock): refresh the meal sensors after plan, move and cancel`.

### Task A3: PR, CI, merge, release

- [ ] Run the whole suite `.venv/bin/pytest tests -q` and `make test`. Note: `main`'s `security` job is red for a reason outside this work (HA pins `cryptography==48.0.1`, fixed upstream on HA `dev`); do not "fix" it here, say so in the PR.
- [ ] Open the PR `feat(home-stock): batches carry their aisle, meal edits refresh the sensors`; wait for CI; the only acceptable red is the pre-existing `security` job. Squash-merge (the owner authorised merging package PRs) and wait for the `Release` workflow to publish the new tag. Record the version.

---

## Part B — home-desk (repo `nivuus/home-desk`)

Setup: fresh HTTPS clone; branch `feat/garde-manger` from `origin/main` (which already contains the `home_desk/abonner` fix, v1.3.1). `app/node_modules`: `cd app && npm ci`. Component tests: Python ≥ 3.14 venv per `Makefile` target `test-composant`. Suites: `make test`, `make test-app`, `make test-composant`. `dist/` is versioned: `cd app && npm run build` before committing any app change (`test_dist_a_jour` checks it).

Naming: new modules in English under `app/src/pantry/` and `app/src/rendu/pantry*.ts`; do not rename existing French modules. `app/src/garde-manger.ts` already exists (next meal) — leave it.

### Task B1: pure model — grouping, sorting, pagination

**Files:**
- Create: `app/src/pantry/model.ts`
- Test: `app/tests/pantry-model.test.ts`

**Interfaces (Produces):**

```ts
export type Batch = {
  id: number; productId: number; product: string; remaining: number; unit: string; // base_unit
  bestBefore: string | null; locationId: number; location: string; locationPosition: number;
  aisleId: number | null; aisle: string | null; aislePosition: number | null;
};
export function parseBatches(raw: unknown): Batch[];            // never throws; drops malformed rows
export function hasAisles(batches: Batch[]): boolean;           // false if the server sent no aisle_* keys
export type LocationGroup = { locationId: number; name: string; count: number };
export function locations(batches: Batch[]): LocationGroup[];   // by locationPosition; empty ones included when known from rows
export type AisleGroup = { aisleId: number | null; name: string; count: number };
export function aislesOf(batches: Batch[], locationId: number): AisleGroup[]; // by aislePosition, null aisle last, named 'Sans rayon'
export function batchesOf(batches: Batch[], f: { locationId?: number; aisleId?: number | null; ids?: Set<number> }): Batch[]; // sorted by bestBefore asc, null last, then product name
export const PAGE_ROWS = 6;
export function page<T>(items: T[], index: number): { rows: T[]; more: number }; // 6 rows, or 5 + a "Suite › (more)" row
```

- [ ] **Step 1: Failing tests** covering Review Focus 1, 2, 4: two locations × two aisles fixture plus one no-aisle product; `aislesOf` order and "Sans rayon" last; `batchesOf` date order with a null date last; `page()` for 6 items (no "more"), 7 items (5 + more=2), second page; `parseBatches` on rows missing `aisle_*` → `hasAisles === false`; malformed row dropped, no throw.
- [ ] **Step 2: Run** `cd app && npx vitest run tests/pantry-model.test.ts` → fail (module missing).
- [ ] **Step 3: Implement** `model.ts` (pure, no DOM, no HA).
- [ ] **Step 4: Green; mutation check** (e.g. sort null dates first → red; restore).
- [ ] **Step 5: Commit** `feat(home-desk): pantry model for the kitchen tablet`.

### Task B2: quantities — fractions, step, bounds, formatting

**Files:**
- Create: `app/src/pantry/quantity.ts`
- Test: `app/tests/pantry-quantity.test.ts`

**Interfaces (Produces):**

```ts
export type Fraction = 'all' | 'half' | 'quarter';
export function stepFor(unit: string, remaining: number): number;   // 'piece' → 1; else remaining < 200 ? 10 : 50
export function fromFraction(f: Fraction, remaining: number): number;
export function clampQuantity(q: number, remaining: number, step: number): number; // in [min(step, remaining), remaining]
export function increment(q: number, remaining: number, unit: string, dir: 1 | -1): number;
export function formatQuantity(q: number, unit: string): string;   // '350 g', '1,5 pièce', '3 pièces', '250 ml'; ≤ 2 decimals, French decimal comma
```

Read the actual `base_unit` values from home-stock (`custom_components/home_stock` — grep `base_unit` / the unit referential) and map every one of them in `formatQuantity`; unknown unit → number + raw unit.

- [ ] **Step 1: Failing tests** for Review Focus 3: 30 g left with step 50 → `clampQuantity` gives 30 and increment/decrement stay at 30; ½ of 1 piece = 0.5 → '0,5 pièce'; ¼ of 350 g = 87.5 → '87,5 g'; 0.1+0.2 formats '0,3'; step switches from 50 to 10 under 200 g; ml mirrors g.
- [ ] **Step 2–4:** fail → implement → green; mutation check.
- [ ] **Step 5: Commit** `feat(home-desk): pantry quantities (fractions, step, bounds)`.

### Task B3: loader and consume action

**Files:**
- Create: `app/src/boot/pantry.ts`
- Modify: `app/src/boot/state.ts` (new fields), `app/src/boot/types.ts` only if `ConnexionLike` needs nothing new (it already has `envoyerCommande` and `listerTaches` — do not widen it)
- Test: `app/tests/pantry-action.test.ts`

**Interfaces:**
- Consumes: `Connexion.envoyerCommande(payload)` (rejects with `RefusHA(code, message)` or a timeout error), `Connexion.listerTaches('todo.home_stock_expirations')` → items whose `uid` is the batch id (string), `createArming` from `cochage.ts`, `ScreenState.horsLigne`, `ScreenState.dessiner`.
- Produces (state fields on `ScreenState`): `pantry: { status: 'idle'|'loading'|'ready'|'error'|'empty'; batches: Batch[]; soonIds: Set<number>; level: 'entry'|'aisles'|'batches'|'sheet'; locationId?: number; aisleId?: number|null; soon?: boolean; pageIndex: number; selected?: Batch; quantity: number; message?: string; banner?: string; pendingKey?: string }` and `armementStock` (a `createArming` instance).
- Produces (functions): `loadPantry(s): Promise<void>` (never throws; sets `status`), `openLocation/openAisle/openSoon/openBatch/back(s)`, `chooseFraction(s,f)`, `stepQuantity(s,dir)`, `pressReason(s, reason: 'consumption'|'discard'|'expired')`.

Behaviour of `pressReason` (spec §2): offline → nothing; first press arms `reason` (and generates `pendingKey` = `crypto.randomUUID()` if available, else a timestamp+random string, kept until success or Back); second press within 3 s sends `{type:'home_stock/stock/consume', product_id, batch_id, quantity, reason, idempotency_key: pendingKey}`; success → `banner` ('Mangé : 175 g de Yaourt nature' / 'Jeté : …' / 'Périmé : …'), level back to `'batches'`, `loadPantry`; `RefusHA` → stay on the sheet, `message = refus.message`, nothing removed; other rejection (timeout) → `message = "home-stock ne répond pas — rien n'a été retiré"`, `pendingKey` kept so a retry cannot double-consume.

- [ ] **Step 1: Failing tests** with a fake connexion (`envoyerCommande: vi.fn()`, `listerTaches: vi.fn()`), two batches: first press sends nothing and arms; second sends the exact payload; success reloads (batches/list called again) and sets the banner; `RefusHA` keeps level `'sheet'` and the batch list unchanged; timeout keeps `pendingKey` and a second confirm reuses it; offline sends nothing; loader failure → `status 'error'`; empty stock → `'empty'`; back from `'sheet'` clears `pendingKey`.
- [ ] **Step 2–4:** fail → implement → green; mutation check (e.g. remove the reload on success → red).
- [ ] **Step 5: Commit** `feat(home-desk): pantry loader and consume action`.

### Task B4: rendering

**Files:**
- Create: `app/src/rendu/pantry-lists.ts` (entry, aisles, batches levels), `app/src/rendu/pantry-sheet.ts` (sheet), styles next to the existing ones (follow how `rendu/taches.ts` / `rendu/recette.ts` get their CSS)
- Modify: `app/src/rendu/icones.ts` — add one icon for the tile (e.g. `stock`, a jar/shelf SVG path in the style of the others); then `npm run contrats` regenerates `contrat/icones.json` (never edit it by hand)
- Test: `app/tests/pantry-render.test.ts`

Render the spec §1–§2 exactly: entry = "À consommer vite (N)" row + four location tiles (empty ones greyed, `inactif`); aisles level (skipped when one aisle or `!hasAisles`); batches rows with product, `formatQuantity`, date (red past, orange when id ∈ soonIds, none when null); "Suite › (N)" as 6th row; sheet header, fraction buttons, − / + with the live line "Sortir X · il restera Y", "Mangé" primary and "Jeté"/"Périmé" secondary, armed look + "Toucher pour confirmer", all three inactive when offline; `message` area; `status` screens "Garde-manger indisponible" + "Réessayer" and "Rien en stock"; a Back button on every level. Mark the view `data-mvt="vue:garde-manger"` like the other sub-views.

- [ ] **Step 1: Failing tests** (jsdom): each level renders the expected rows for a two-location/two-aisle fixture; greyed empty location; date classes; "Suite › (2)" for 7 batches; offline disables the three reason buttons; armed button carries the armed class; error and empty screens. **Budget test by arithmetic** like `cochage.ts::MAX_LIGNES_TACHES` and `tests/taches.test.ts`: each level's height ≤ 585 px.
- [ ] **Step 2–4:** fail → implement → green; mutation check.
- [ ] **Step 5: Commit** `feat(home-desk): pantry views`.

### Task B5: wiring, component, kitchen screen

**Files:**
- Modify: `app/src/boot/wiring.ts` (`isSubView` gains `'#garde-manger'`; on `hashchange` to it: reset `pantry.level='entry'`, `pageIndex=0`, `void loadPantry(s)`), `app/src/boot/subviews.ts` (paint branch), `app/src/boot/wiring.ts`/`controls.ts` (pointer handlers → the B3 functions), the auto-return: `RETOUR_MS` like `#taches`
- Modify: `custom_components/home_desk/*` — find every CLOSED list of views (grep `#recette`, `#taches`, `vue`) and add `#garde-manger` where a list is closed; `list_sections.py` special-cases `#recette` only — check whether `#garde-manger` needs an equivalent availability rule (it does not require a planned meal: no special case unless a closed list exists)
- Modify: `app/src/ecran.ts` and the reference screens used by the fidelity tests: in the KITCHEN screen, replace the `Courses` tile (`{ libelle: 'Courses', icone: 'list', entite: 'todo.home_stock_shopping', vue: '#taches' … }`) by `{ libelle: 'Garde-manger', icone: '<B4 icon>', entite: 'todo.home_stock_expirations', vue: '#garde-manger' }` at the same grid position, and add `horsTaches: true` to the kitchen synthesis line on `todo.home_stock_expirations`. `todo.home_stock_shopping` stays in `listesTachesExtra` (shopping remains reachable in Tasks).
- Test: extend `app/tests/navigation.test.ts` (hash → view, auto-return, Back to home from entry), `tests/composant/` (a screen with a `#garde-manger` tile validates and is served by `home_desk/ecran`), and the existing fidelity/reference suites must stay green (update their expected kitchen fixtures, never weaken an assertion).

- [ ] **Step 1: Failing tests** for navigation and the component acceptance.
- [ ] **Step 2–4:** fail → implement → green. Then the full suites: `make test`, `make test-app` (count must not drop from 1165+new), `make test-composant`.
- [ ] **Step 5: Rebuild** `cd app && npm run build`; `make test` (`test_dist_a_jour`) green; update the headless render page if `app/outils/verifier-rendu.mjs` / `mesurer-rendus.mjs` keep a kitchen expectation.
- [ ] **Step 6: Commit** `feat(home-desk): open the pantry from the kitchen home screen`.

### Task B6: PR, CI, merge, release — no production

- [ ] PR `feat(home-desk): pantry screen on the kitchen tablet`, body: what it does, the kitchen config change the owner must apply in production (tile swap + `horsTaches`), and "requires home-stock ≥ <A3 version> for aisles; works without (aisle level skipped)".
- [ ] CI green (package contract, policy, security), squash-merge, wait for the `Release` workflow, record the version.
- [ ] **Stop.** Report: both versions, PR URLs, test counts before/after, mutation checks done, anything deferred. Production (lay home-stock, lay home-desk, HA restart, edit the kitchen subentry, check on the tablet) is done by the coordinator with the owner.
