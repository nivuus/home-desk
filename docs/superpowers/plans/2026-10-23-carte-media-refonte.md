# Media card redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the wall-tablet media card (big transport and volume buttons, a readable progress bar, the poster shown untouched with poster-derived colours) and let every tablet follow what plays elsewhere in the house.

**Architecture:** A new "house" subentry in the `home_desk` integration holds one shared list of media sources (each with a `piece`), served by a new websocket command. The app resolves its own sources first, then the house list, and enters `media` mode for a remote source that is `playing`/`buffering`. The card's colours come from a pure module (`app/src/tones.ts`) fed by a DOM sampler that draws the 400 px vignette at card size. The height budget gains a `blocMedia` cost and an ordered list of fall-backs (reduced synthèse, then no Ambiance row), mirrored in Python.

**Tech Stack:** TypeScript, lit, rollup, vitest, ajv (app); Python, voluptuous, pytest-homeassistant-custom-component (integration); `@material/material-color-utilities` 0.4.0 (already a devDependency); playwright tools in `app/outils/`.

**Spec:** `docs/superpowers/specs/2026-10-23-carte-media-refonte-design.md`

## Global Constraints

- Branch from `origin/main` (57013d6 + the spec commit `be366f4`), never the local `main`; push over HTTPS; PR title is a conventional commit in English.
- New identifiers, comments, commit messages and log lines are English. Contract keys stay in the contract's existing French vocabulary (`piece`, `sources`). The tablet's on-screen copy stays French as it is today (`EN COURS`); the room name comes from configuration, never from code.
- No source file over 500 lines. Already over or near: `app/src/ecran.ts` (548, do not grow it), `app/src/styles/base.css` (975, media rules move out in Task 8), `app/src/modes.ts` (453, budget functions move out in Task 9).
- Fire 7, WebView Chromium 119, frame 343 × 585 px. No screen may overflow 585 px (`hauteurUtile`).
- Every poster goes through `vignetter()` (400 px, `/api/vignette`); pixels are only ever read from that vignette.
- Text contrast ≥ 5:1 (project threshold, `verifier-rendu.mjs`).
- Tap targets 62 px; no fine gesture on the card.
- No veil, no reduced opacity, no gradient on the poster or on any large surface; discs and text plates are solid.
- No dead button: a button exists only if its `CAP.*` bit says the player can do it; no invented volume level.
- No `entity_id` literal outside screen/house configuration.
- After any change under `contrat/`: `make contrat`, commit the embedded copy.
- Only `garde_ecran.py` calls a config-entry write gate; only `formulaire.py` calls `async_show_form` with a `data_schema`.

## Review Focus

1. A remote source left `paused` (paused from its own room, not from this tablet) must not hold any tablet in `media` mode → test in Task 4 (`a remote paused source does not count as playing`).
2. The office lists `musique_salon` among its own sources and the house list also contains it → the card shows it once, as its own source, labelled with its `piece` → test in Task 4 (`an entity already among own sources is excluded from elsewhere`).
3. A poster whose pixels cannot be read (external `http…` URL, 404, tainted canvas) → the card renders the no-poster theme, never a poster with guessed colours, and nothing is thrown at render → tests in Task 7 (`unreadable poster yields the no-poster tones`, `only SecurityError is treated as unreadable`).
4. Volume at 0.98 then `+`, or 0.03 then `−`, and a hold released outside the button → clamps to 1/0, and the repeat stops on `pointerup`, `pointercancel` and `pointerleave` → tests in Task 8.
5. An integration with no house subentry (fresh install, or an import file without `maison:`) → `home_desk/maison` returns `{"sources": []}`, the tablet runs with its own sources only; an import without `maison:` removes the house subentry rather than leaving a stale one → tests in Tasks 2 and 3.

---

### Task 1: Contract — `piece` on a source and the house list schema

**Files:**
- Modify: `contrat/ecran.schema.json` (`$defs/source`)
- Create: `contrat/maison.schema.json`, `contrat/cas-maison.json`
- Modify: `custom_components/home_desk/schema.py` (the `SOURCE` mirror; new `validate_house`)
- Test: `app/tests/cas-maison.test.ts`, `tests/composant/test_schema_maison.py`, existing `app/tests/cas-schema.test.ts` + `tests/composant/test_schema.py` (new cases in `contrat/cas-schema.json`)

**Interfaces:**
- Produces: `$defs/source.piece` — optional string, `minLength: 1`. `maison.schema.json`: `{version: const 1, sources: array of source with piece REQUIRED}`, `additionalProperties: false`; its source item is `allOf: [{$ref: "ecran.schema.json#/$defs/source"}, {required: ["piece"]}]`. Python: `schema.validate_house(raw: dict) -> dict` raising `vol.Invalid` with the same `path: keyword` motif format as `schema.valider`. `schema.VERSION_MAISON = 1`.

- [ ] **Step 1: Write the failing cases.** In `contrat/cas-schema.json` add: a screen whose source carries `"piece": "Salon"` (valid) and one with `"piece": ""` (invalid, `sources/0/piece: minLength`). Create `contrat/cas-maison.json` in the same corpus shape with: empty `sources` (valid), a source without `piece` (invalid, `sources/0: required`), a source with an unknown key (invalid, `additionalProperties`), wrong `version` (invalid, `version: const`).
- [ ] **Step 2: Write `app/tests/cas-maison.test.ts`** replaying `cas-maison.json` with Ajv2020 after `ajv.addSchema(ecranSchema)` (same pattern as `cas-schema.test.ts`), and `tests/composant/test_schema_maison.py` replaying it through `schema.validate_house`.
- [ ] **Step 3: Run** `cd app && npx vitest run tests/cas-schema.test.ts tests/cas-maison.test.ts` and `make test-composant` — expected FAIL (unknown `piece`, missing schema/function).
- [ ] **Step 4: Implement** the schema edits, `validate_house` reusing the existing `SOURCE` validator plus a required `piece`, reading the embedded `contrat/maison.schema.json` for its version (same `pathlib.Path(__file__).parent` rule). Run `make contrat`.
- [ ] **Step 5: Run** both suites and `make test` (`test_contrat_embarque` must pass) — expected PASS.
- [ ] **Step 6: Commit** `feat(contract): room name on a media source and a shared house source list`.

### Task 2: Integration — the house subentry and `home_desk/maison`

**Files:**
- Modify: `custom_components/home_desk/const.py` (`SUBENTRY_HOUSE = "maison"`, `WS_MAISON = f"{DOMAIN}/maison"`)
- Create: `custom_components/home_desk/maison.py` (subentry flow `HouseSubentryFlow`; reuses the source fields of `list_fields_sources.py`)
- Modify: `config_flow.py` (`async_get_supported_subentry_types` adds `SUBENTRY_HOUSE`), `garde_ecran.py` (`persist_house_if_valid`), `websocket.py` (`home_desk/maison`), `__init__.py` (update listener), `translations/fr.json` + `translations/en.json`
- Test: `tests/composant/test_maison.py`; update `test_garde_ecran.py` only if a new gate caller appears (it must not)

**Interfaces:**
- Consumes: `schema.validate_house` (Task 1).
- Produces: websocket `home_desk/maison` (no admin, no field) → `{"sources": [...]}` validated by `validate_house`, `{"sources": []}` when no house subentry exists; error `ecran_corrompu` if the stored data fails validation. At most one house subentry (the flow aborts with `already_configured` if one exists). `garde_ecran.persist_house_if_valid(hass, entry, subentry, data) -> None`. On any change to the house subentry, the update listener fires `EVENEMENT_CHANGEMENT` once per screen name, so every subscribed tablet reloads.
- Design decision (recorded here, not in the spec): the shared list is a subentry, not `entry.data`/options — the entry "holds nothing" by design (`HomeDeskConfigFlow` docstring) and subentries already have the guarded write path, the change listener and the list-section UI.

- [ ] **Step 1: Write failing tests** in `tests/composant/test_maison.py`: `test_ws_maison_returns_empty_list_without_house_subentry`; `test_ws_maison_returns_the_stored_sources` (one source `piece: "Chambre"`); `test_ws_maison_open_to_non_admin_user`; `test_second_house_subentry_is_refused`; `test_adding_a_house_source_through_the_flow_persists_it` (drives the flow: add → source fields incl. `piece` → save); `test_house_change_fires_change_event_for_every_screen` (two screens → two events with their `nom`); `test_invalid_house_data_is_not_persisted` (empty `piece`).
- [ ] **Step 2: Run** `make test-composant` — expected FAIL.
- [ ] **Step 3: Implement.** The flow lists sources, adds/edits/removes one with the same fields as a screen source plus a required `piece` text field; every write goes through `persist_house_if_valid`; forms through `formulaire.py`. Listener: when a subentry of type `SUBENTRY_HOUSE` changes (or disappears), fire for every screen subentry's `nom` instead of the house's (it has none).
- [ ] **Step 4: Run** `make test-composant` — expected PASS, including the two AST guards (`test_garde_ecran_est_le_seul_module_...`, `test_formulaire_est_le_seul_module_...`).
- [ ] **Step 5: Commit** `feat(integration): shared house media sources, edited from Home Assistant`.

### Task 3: YAML export/import carries the house list

**Files:**
- Modify: `custom_components/home_desk/yaml_ecrans.py` (`rendre`, `lire`), `services.py`, `garde_ecran.importer_ecrans`
- Test: `tests/composant/test_yaml_ecrans.py`, `tests/composant/test_services.py`

**Interfaces:**
- Produces: the file gains an optional top-level `maison: {sources: [...]}` after `ecrans:`; `yaml_ecrans.lire(texte) -> tuple[list[dict], dict | None]` (screens, house or `None`); `yaml_ecrans.rendre(ecrans, maison: dict | None) -> str`; `importer_ecrans(hass, entry, ecrans, maison: dict | None)` validates the house with the screens in the same first pass and replaces it in the same single write (absent → no house subentry afterwards).

- [ ] **Step 1: Write failing tests**: `test_export_import_round_trip_keeps_house_sources` (incl. `note` comments on a house source); `test_import_without_maison_removes_house_subentry`; `test_import_with_invalid_house_writes_nothing` (screens untouched).
- [ ] **Step 2: Run** `make test-composant` — expected FAIL.
- [ ] **Step 3: Implement** and update all callers of `lire`/`rendre`.
- [ ] **Step 4: Run** `make test-composant` — expected PASS.
- [ ] **Step 5: Commit** `feat(integration): export and import the house source list`.

### Task 4: App — which source the card shows

**Files:**
- Modify: `app/src/media.ts` (types, `resoudreSource`)
- Create: `app/src/media-choice.ts`
- Test: `app/tests/media.test.ts`, `app/tests/media-choice.test.ts`

**Interfaces:**
- Produces in `media.ts`: `DeclarationSource.piece?: string`; `SourceResolue.piece?: string` (copied from the declaration); `SourceResolue.active: boolean` (an entity of `titre`/`progression`/`transport` is `playing` or `buffering` — `paused` excluded); `ACTIVE_STATES = ['playing', 'buffering']`; `entitiesOf(decl: DeclarationSource): Set<string>` (every entity named in the six lists and `allumee.entite`).
- Produces in `media-choice.ts`:
  - `sourcesElsewhere(house: DeclarationSource[], own: DeclarationSource[]): DeclarationSource[]` — house order kept, a declaration dropped if it shares any entity with any own declaration.
  - `pickSource(own: SourceResolue[], elsewhere: SourceResolue[], pinned?: string): { source?: SourceResolue; remote: boolean }` — first own with `joue`; else first remote with `active`; else the remote whose `nom` equals `pinned` if it is still `joue`; else none.

- [ ] **Step 1: Write failing tests** (`media-choice.test.ts`): `own playing source wins over a remote playing one`; `a remote playing source is picked when no own source plays`; `a remote paused source does not count as playing`; `a remote paused source stays shown when pinned`; `pin is ignored once the pinned source is idle`; `declared house order breaks ties between remote sources`; `an entity already among own sources is excluded from elsewhere`. In `media.test.ts`: `piece is carried to the resolved source`, `active is false when paused and joue is true`.
- [ ] **Step 2: Run** `cd app && npx vitest run tests/media.test.ts tests/media-choice.test.ts` — expected FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — expected PASS.
- [ ] **Step 5: Commit** `feat(app): follow what plays elsewhere in the house`.

### Task 5: App — load the house list and drive the modes

**Files:**
- Modify: `app/src/configuration.ts` (`loadHouse`), `app/src/boot/types.ts` (dependency), `app/src/demarrage.ts` (load with the screen, reload on the change event), `app/src/boot/state.ts` (`house`, `pinnedMedia`), `app/src/boot/frame.ts`, `app/src/boot/home.ts` (card from `frame.media`)
- Test: `app/tests/configuration.test.ts`, `app/tests/frame.test.ts` (create if absent, following existing boot tests), `app/tests/demarrage*.test.ts`

**Interfaces:**
- Consumes: Task 4; websocket `home_desk/maison` (Task 2).
- Produces: `loadHouse(cx: TransportConfig): Promise<Result<DeclarationSource[]>>` — `unknown_command` (integration older than this feature) → `ok([])`; any other refusal → the same `panne` mapping as `chargerEcran`. `ScreenState.house: DeclarationSource[]`, `ScreenState.pinnedMedia?: string`. `Frame.media: { source?: SourceResolue; remote: boolean }`. `ctx.sourceJoue = frame.media.source !== undefined`. `ecranAllume` keeps reading own sources only (a remote TV never triggers `cinema`). The card's pause button on a remote source sets `pinnedMedia` to that source's `nom` (wired through `brancherMedia`, Task 8).

- [ ] **Step 1: Write failing tests**: `loadHouse maps unknown_command to an empty list`; `frame enters media mode for a remote playing source`; `frame does not enter cinema for a remote TV that is only on`; `frame keeps media mode on the tablet that paused a remote source`; `startup loads the house list with the screen and reloads it on the change event`.
- [ ] **Step 2: Run** `cd app && npx vitest run` on those files — expected FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd app && npx vitest run` (whole app suite) — expected PASS.
- [ ] **Step 5: Commit** `feat(app): load the house sources and switch to media mode for remote playback`.

### Task 6: Poster tones — pure module

**Files:**
- Create: `app/src/tones.ts`
- Test: `app/tests/tones.test.ts`

**Interfaces:**
- Produces:
  - `type Box = { x: number; y: number; w: number; h: number }` (pixels of the sampled image).
  - `type CardTones = { text: string; plate?: string; primary: string; onPrimary: string; secondary: string; onSecondary: string; worstContrast: number }` (hex colours; `worstContrast` is the text's worst-pixel ratio WITHOUT plate).
  - `contrastRatio(l1: number, l2: number): number`, `relativeLuminance(r: number, g: number, b: number): number` (WCAG).
  - `cardTones(quantPixels: number[], rgba: Uint8ClampedArray, width: number, textBoxes: Box[]): CardTones` — `quantPixels` are ARGB ints of the 64 × 64 downscale; `rgba`/`width` are the card-size sample.
- Values pinned by the spec: `QuantizerCelebi.quantize(pixels, 128)` → `Score.score(...)[0]` → `TonalPalette.fromHueAndChroma(hue, max(chroma, 36))`. Text tone = best worst-pixel contrast among tones `[0, 5, 10, 95, 98, 100]` over every pixel of every box (sampling every pixel, not every other one). Dark text (tone < 50): primary 30 / on 98, secondary 90 / on 10. Light text: primary 90 / on 10, secondary 25 / on 95. `plate` set only when `worstContrast < 5`: tone 92 under dark text, tone 15 under light text. Import from `@material/material-color-utilities` (check that rollup resolves its extensionless ESM imports; the bare Node import failed during design, the bundler path is what ships).

- [ ] **Step 1: Write failing tests** on synthetic images: `pastel poster gets dark text and no plate` (fill `#f6d2c4` with a `#ffffff` disc; `worstContrast >= 5`); `diagonal stripes need a plate and reach 5:1 on it` (the `#e04a2f/#1d6fd1/#f4f1e8` 18 px stripes of the mockup; `plate` defined, contrast(text, plate) ≥ 5); `dark poster gets light text`; `icon contrast on every disc is at least 4.5:1` (for all three posters); `a dull grey poster still gets chroma 36 discs`.
- [ ] **Step 2: Run** `cd app && npx vitest run tests/tones.test.ts` — expected FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `feat(app): derive media card colours from the poster`.

### Task 7: Poster tones — reading the pixels

**Files:**
- Create: `app/src/rendu/poster-sampler.ts`
- Test: `app/tests/poster-sampler.test.ts`

**Interfaces:**
- Consumes: `cardTones`, `Box` (Task 6); `vignetter` (`media.ts`).
- Produces:
  - `coverCrop(imgW: number, imgH: number, boxW: number, boxH: number): { sx: number; sy: number; sw: number; sh: number }` — the source rectangle `background-size: cover; background-position: center` shows.
  - `type ToneState = { status: 'pending' } | { status: 'ready'; tones: CardTones } | { status: 'unreadable' }`.
  - `tonesFor(url: string, card: { w: number; h: number; boxes: Box[] }): ToneState` — synchronous cache lookup keyed by `url` + card size + boxes; on a miss starts the async computation and returns `pending`.
  - `onTonesReady(fn: () => void): void` — called once per finished computation so `home.ts` re-renders.
- Rules: only same-origin URLs (the `/api/vignette` output) are sampled; any other URL is `unreadable` without a request. Image `error` → `unreadable`. `getImageData` throwing a `DOMException` named `SecurityError` → `unreadable`; any other exception propagates. The card-size sample is drawn with `coverCrop` at the card's CSS pixel size; the 64 × 64 quantization sample from the same image.

- [ ] **Step 1: Write failing tests**: `coverCrop centres a portrait poster in a landscape card` (e.g. 400 × 600 into 311 × 260); `coverCrop centres a landscape poster in a portrait card`; `unreadable poster yields the no-poster tones` (external `http://…` URL → `unreadable`, no image created); `only SecurityError is treated as unreadable` (inject a sampler that throws a `TypeError` → rejects). Drawing itself is checked by Task 10 in a real browser (vitest has no canvas).
- [ ] **Step 2: Run** `cd app && npx vitest run tests/poster-sampler.test.ts` — expected FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `feat(app): sample the poster vignette under the card text`.

### Task 8: The card — layout, volume, styles

**Files:**
- Modify: `app/src/rendu/media.ts` (card), `app/src/boot/home.ts` (pass `ToneState`, measure boxes after render)
- Create: `app/src/rendu/media-volume.ts`, `app/src/styles/media.css` (all `.media*` rules leave `base.css`; wire it where `base.css` is bundled)
- Test: `app/tests/carte-media.test.ts`, `app/tests/media-volume.test.ts`

**Interfaces:**
- Consumes: `SourceResolue` (Task 4), `ToneState`/`tonesFor` (Task 7), `fractionProgression` (`progression.ts`).
- Produces: `rendreCarteMedia(s: SourceResolue, maintenantMs: number, tones: ToneState): TemplateResult`; `brancherMedia(act: typeof agir, pin: (nom: string) => void)`; `stepVolume(level: number, direction: 1 | -1): number` (±0.05, result rounded to the 0.05 grid, clamped to [0, 1]); `holdRepeat(el: HTMLElement, fire: () => void, opts?: { delayMs: number; everyMs: number })` returning a disposer. Text-bearing elements carry `data-tone-box` so `home.ts` can measure them relative to `.media` and pass `boxes` to `tonesFor`.
- Layout (spec, "Disposition (piste C)"): label `EN COURS · <piece>` (`EN COURS` alone without `piece`), title (2-line clamp), subtitle; 8 px progress bar with visible track, elapsed left, `−remaining` right (`m:ss`, `h:mm:ss` beyond an hour), both rewritten by the same per-second tick that already advances `--progression` (`progression.ts`, `demarrage.ts`) — never a second timer; transport row prev / play-pause (primary disc) / next spread across the width; volume row `−` / big `NN %` over a thin gauge / `+`, 62 px buttons. Rows without data are not rendered. Step-only volume: `volume_up`/`volume_down`, no level, no gauge. `VOLUME_SET`: `volume_set` with `stepVolume`, optimistic level shown at once, hold repeats. Plate: always present as padding on text boxes so it never changes layout; its background is transparent unless `tones.plate`. `pending`/`unreadable`/no poster: no poster layer, theme colours, solid discs. Keep `data-zone="blocCentral"`, `data-mvt="bloc:media"`, `urlSure`.

- [ ] **Step 1: Write failing tests**: `label names the room of a remote source`; `no progress row without progression`; `no transport row without transport`; `step-only volume shows no level`; `poster layer only when tones are ready`; `plate background only when tones carry a plate`; `remaining time is written with a minus sign`; `elapsed and remaining follow the progress tick`; `pause on a remote source pins it`; `stepVolume clamps at both ends and snaps to 5 %` (0.98→1, 0.03→0, 0.42→0.45); `hold repeat stops on pointerup, pointercancel and pointerleave` (fake timers).
- [ ] **Step 2: Run** `cd app && npx vitest run tests/carte-media.test.ts tests/media-volume.test.ts` — expected FAIL.
- [ ] **Step 3: Implement**, including the CSS move (`base.css` must end under 500 lines only if the move achieves it; otherwise note the remaining overshoot in the task report — do not cut it elsewhere in this task).
- [ ] **Step 4: Run** `cd app && npx vitest run` — expected PASS.
- [ ] **Step 5: Commit** `feat(app): larger media controls, readable progress and volume`.

### Task 9: Height budget — `blocMedia` and the fall-back ladder

**Files:**
- Create: `app/src/screen-budget.ts` (`coutEcran`, `combien`, `verifierBudget` move here from `modes.ts`; update every importer; no re-export from `modes.ts`)
- Modify: `app/src/modes.ts` (`ordreCommandes` uses `arrangement`; correct the "never the Ambiance row" comment with today's date and the owner's decision), `contrat/budget.json`, `contrat/cas-budget.json`, `custom_components/home_desk/budget.py`, `app/src/boot/frame.ts` (`Frame.arrangement`), `app/src/rendu/corps.ts` (drop the Ambiance zone and add class `reduite` to `.synthese` per `arrangement`), `app/src/styles/base.css` (`.synthese.reduite` single line)
- Test: `app/tests/budget.test.ts`, `app/tests/cas-budget.test.ts`, `app/tests/corps.test.ts`, `tests/composant/test_budget.py`

**Interfaces:**
- Produces: `budget.json`: `hauteurs.blocMedia` and `hauteurs.syntheseReduite` (measured, Step 1), `modesABlocMedia: ["media", "cinema"]` (removed from `modesABlocHaut`, which keeps `voiture`). `arrangement(mode, rangeeAmbiance, hauteurUtile, zones): { rangeeAmbiance: boolean; syntheseReduite: boolean; commandes: number }` — tries, in order, (full), (reduced synthèse), (reduced synthèse + no Ambiance row) and returns the first whose `combien` ≥ `commandesSousBlocHaut`; if none, the last one. Only `modesABlocMedia` modes use the ladder; every other mode returns the full arrangement. `combien` gains `syntheseReduite = false`. Python twins: `arrangement(...)` and `combien(..., synthese_reduite=False)` in `budget.py`, same corpus.

- [ ] **Step 1: Measure** with `node app/outils/mesurer-hauteurs.mjs` on the three screens in `media` mode with the Task 8 card (title on two lines, progress, transport, step and level volume) and the reduced synthèse; write the tallest card height as `blocMedia` and the reduced synthèse as `syntheseReduite` into `contrat/budget.json` (cost NET of gutters, see the `combien` docstring). If the card exceeds what the ladder can fit with two commands on the office screen, shrink the card's internal padding first (spec, "Laissé au constructeur").
- [ ] **Step 2: Write failing cases** in `cas-budget.json` (replayed by both suites): `media, no ambiance row, 585 → reduced synthèse only, 2+ commands` (living room shape); `media, ambiance row, 585 → reduced synthèse and no Ambiance row, 2 commands` (office/kitchen shape); `voiture is never laddered`; `defaut keeps its Ambiance row`. In `corps.test.ts`: `ambiance zone not rendered when the arrangement drops it`, `synthèse carries reduite when the arrangement reduces it`.
- [ ] **Step 3: Run** `cd app && npx vitest run tests/budget.test.ts tests/cas-budget.test.ts tests/corps.test.ts` and `make test-composant` — expected FAIL.
- [ ] **Step 4: Implement**, then `make contrat`.
- [ ] **Step 5: Run** `cd app && npx vitest run`, `make test-composant`, `make test` — expected PASS.
- [ ] **Step 6: Commit** `feat(budget): make room for the media card, synthèse first, Ambiance row second`.

### Task 10: Render check on the card without veil

**Files:**
- Modify: `app/outils/verifier-rendu.mjs`

**Interfaces:**
- Consumes: the built pages; three poster fixtures it already uses, plus the mockup's "stripes" and "pastel" posters as generated images.
- Produces: for each `media`/`cinema` render, the worst-pixel contrast of every `[data-tone-box]` against its painted background (plate when present, poster pixels otherwise) ≥ 5:1, disc icons ≥ 4.5:1, no element outside 585 px; `--auto-test` keeps a deliberately failing render (stripes with the plate forced off) that the check must flag.

- [ ] **Step 1: Run** `node app/outils/verifier-rendu.mjs --auto-test` after adding the stripes-without-plate counter-proof — expected: the counter-proof is reported as failing (proves the check can fail).
- [ ] **Step 2: Run** `node app/outils/verifier-rendu.mjs` on all screens and modes — expected: no failure.
- [ ] **Step 3: Commit** `test(render): check media card contrast on the untouched poster`.

### Task 11: Build, docs, all suites

**Files:**
- Modify: `dist/` (rebuilt), `CLAUDE.md` (index line for the house subentry and the budget ladder; detail in `docs/claude/` if the file nears 500 lines)

- [ ] **Step 1: Run** `cd app && npm run build`, then `make test`, `make test-app`, `make test-composant` — expected: all PASS, `test_dist_a_jour` included.
- [ ] **Step 2: Commit** `build: rebuild dist for the media card redesign`.
- [ ] **Step 3:** Push the branch over HTTPS and open the PR `feat(home-desk): media card redesign and whole-house sources` (body ends with the Claude Code attribution line).

### Task 12: Production — house list, deployment, tablets

Done only after the PR is merged and deployed (`nivuus check / update`), with the owner.

- [ ] **Step 1: Measure each new device** from Home Assistant state (`.storage/core.entity_registry` and the recorder DB read-only, as for the living-room TV in the `media.ts` header — never with the long-lived token on the command line): which entity carries `media_title`, `entity_picture`, `media_position`, transport and volume features for the bedroom and bathroom music, the bedroom TV, the TV-room TV and its Plex player, the Nebula projector. Exclude phone Plex players (spec, "Ma supposition").
- [ ] **Step 2: Write the `maison:` block** (with `piece` on every source) into a copy of the exported `home_desk_ecrans.yaml`, and add `piece` to each screen's own sources (`Salon` for `musique_salon` on every screen that lists it, `Maison` for `musique_maison`, `Cuisine`…). Ask the owner to run `home_desk.exporter` first, then to put the file in place and run `home_desk.importer` (the import replaces everything: a missing block deletes data).
- [ ] **Step 3: Verify on the tablets**: music in the bedroom → all three tablets show `EN COURS · Chambre` with working pause and volume; pause from the living-room tablet → the card stays there, the other tablets return to their mode; office and kitchen lose their Ambiance row only while the card is shown; a striped or very light poster reads clearly; no screen overflows.
