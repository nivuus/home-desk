# Animations launched from Home Assistant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded DeLorean scenes with a `home_desk.jouer_animation` service that plays any video, animated image or Lottie from HA's media library on the named tablets.

**Architecture:** The service validates its call, resolves the media server-side (`media_source.async_resolve_media` + `async_process_play_media_url`), and hands `{url, type, duree, fond}` through an HA dispatcher signal to per-screen websocket subscriptions (`home_desk/animations`, modelled on `home_desk/abonner`). The tablet draws a full-screen overlay (`<video>`, `<img>` or a Lottie `<canvas>`) that ends on natural end, duration, 120 s cap, first touch or load failure. The DeLorean code, assets, contract field and modulator are removed; stored screens migrate from config version 1 to 2.

**Tech Stack:** Python 3.14 / Home Assistant 2026.9 custom component (pytest-homeassistant-custom-component), TypeScript + lit + vitest (jsdom), rollup (IIFE), `@lottiefiles/dotlottie-web` 0.80.0.

**Spec:** `docs/superpowers/specs/2026-09-28-animations-depuis-ha-design.md`

## Global Constraints

- Branch from the latest `origin/main`; the spec branch `docs/animations-spec` merges with this work (one PR).
- Code, identifiers, comments, commit messages in English; **user-facing error messages in French** (like the rest of the component). Existing French identifiers in files you touch stay as they are — do not rename unrelated code.
- No source file over 500 lines. `app/src/ecran.ts` (551) and `app/src/styles/base.css` (1136) already are: do not grow them; removing DeLorean shrinks them.
- Service fields, exactly: `ecrans` (list of screen names, required, ≥1), `media` (HA `media` selector: `{media_content_id, media_content_type}`, required), `duree` (seconds, optional, 0 < duree ≤ 120), `fond` (`noir` | `transparent`, default `noir`).
- Image (`image/*`) without `duree` is refused; video and Lottie without `duree` play once to their end; every animation is capped at **120 s**.
- Refusals are `ServiceValidationError` with a French message, and nothing is sent.
- Service is **not** admin-only; the websocket subscription must work for a **non-admin** user (tests use `hass_read_only_access_token`).
- No queue: a tablet offline when the service runs never plays it later.
- Videos are always `muted autoplay playsinline`.
- dotlottie-web: never a CDN. `DotLottie.setWasmUrl('/local/wallpanel/assets/dotlottie-player.wasm')` before any player; the player code ships as a **second IIFE bundle** `dist/dotlottie.js`, injected by `<script>` on the first Lottie only.
- `VERSION_CONFIG` becomes `2`; migration rewrites version-1 subentries only (drop `delorean`, drop `"delorean"` from `agencement.modulateurs`, set `version: 2`).
- Two-subject fixtures; every new test proven able to fail (mutate, see red, restore) — record each mutation in the PR body.
- Do not touch production (`/opt`, `/etc`, live HA). Push over HTTPS. PR title conventional English; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commands: Python `make test` (or `.venv/bin/pytest tests -q`, set up per the README/Makefile); app `cd app && npx vitest run`, `npx tsc --noEmit -p .` (10 pre-existing errors in `tests/migration-*` — the count must not grow), `npm run build` (rebuilds the versioned `dist/`, commit it). Host shell: wrap pipelines in `bash -c '...'`, use `command grep`.

## Review Focus

1. **Two calls in quick succession**: the second replaces the first, and the first's duration timer / `ended` listener must NOT close the second (stale-callback token) — Task 3.
2. **First touch during an animation** closes it and does NOT actuate the control underneath (the DeLorean overlay let the touch through; the spec says otherwise) — Task 3.
3. **`video.play()` rejected** (autoplay policy, codec) or `<img>`/Lottie `error` → the overlay closes immediately with `console.error`, never a black screen — Tasks 3 and 4.
4. **Reduced motion** (`s.niveauInitial === 'aucun'`) → nothing is shown, same rule the DeLorean overlay followed (`boot/draw.ts`) — Task 3.
5. **Screen name matching**: the service accepts exactly the `nom` values `home_desk/abonner` matches (stored subentry `nom`), no case folding; an unknown name refuses the WHOLE call even if other names are valid — Task 1.

---

### Task 1: the service and the subscription (component)

**Files:**
- Create: `custom_components/home_desk/animations.py` (service schema, validation, resolution, dispatch)
- Modify: `custom_components/home_desk/const.py` (add `SERVICE_JOUER_ANIMATION = "jouer_animation"`, `WS_ANIMATIONS = f"{DOMAIN}/animations"`, `SIGNAL_ANIMATION = f"{DOMAIN}_animation"`, `DUREE_MAX_S = 120`)
- Modify: `custom_components/home_desk/websocket.py` (add `ws_animations`, next to `ws_abonner`)
- Modify: `custom_components/home_desk/__init__.py` (register `ws_animations`; call `animations.async_setup_service` / `async_unload_service` beside the existing services)
- Modify: `custom_components/home_desk/manifest.json` (`"dependencies"` gains `"media_source"`)
- Modify: `custom_components/home_desk/services.yaml`, `translations/fr.json`, `translations/en.json`
- Test: `tests/composant/test_animations.py`

**Interfaces (Produces):**
- Wire payload of each subscription event: `{"url": str, "type": "video" | "image" | "lottie", "duree": int | None, "fond": "noir" | "transparent"}` — `duree` in **milliseconds**, `None` = natural end.
- `animations.type_lecteur(mime: str | None, media_content_id: str) -> str | None` — `video/*` → `"video"`, `image/*` → `"image"`, `application/json` or id ending `.json`/`.lottie` (case-insensitive) → `"lottie"`, else `None`.

- [ ] **Step 1: Failing tests** (`tests/composant/test_animations.py`). Set up media: `hass.config.media_dirs = {"local": str(tmp_path)}`, write `tmp_path / "animations" / "a.webm"`, `a.gif`, `a.lottie`, `a.txt`; `await async_setup_component(hass, "media_source", {})`. Two screens `salon` and `cuisine` (`_creer_ecran` from `conftest`). A non-admin client (`hass_ws_client(hass, hass_read_only_access_token)`) subscribes `{"type": "home_desk/animations", "nom": "salon"}`. Cases:

```python
async def test_salon_recoit_la_video_et_la_cuisine_rien(hass, tablette, entree, medias):
    await _creer_ecran(hass, entree, nom="salon")
    await _creer_ecran(hass, entree, nom="cuisine")
    salon = await _abonner(tablette, "salon")
    cuisine_client = await _client_non_admin(hass)  # second non-admin socket
    cuisine = await _abonner(cuisine_client, "cuisine")

    await hass.services.async_call("home_desk", "jouer_animation", {
        "ecrans": ["salon"],
        "media": {"media_content_id": "media-source://media_source/local/animations/a.webm",
                  "media_content_type": "video/webm"},
    }, blocking=True)

    msg = await tablette.receive_json()
    assert msg["id"] == salon and msg["type"] == "event"
    assert msg["event"]["type"] == "video"
    assert msg["event"]["duree"] is None and msg["event"]["fond"] == "noir"
    assert msg["event"]["url"].startswith("/media/local/animations/a.webm?authSig=")
    # cuisine got nothing: its next message is the result of a probe command
    await cuisine_client.send_json_auto_id({"type": "home_desk/ecrans"})
    assert (await cuisine_client.receive_json())["type"] == "result"
```

  Then, each asserting `ServiceValidationError` AND that the salon subscriber receives nothing (probe with a `home_desk/ecrans` command as above): unknown screen (`["salon", "grenier"]` — whole call refused); missing file; `a.txt` (type not playable); `a.gif` without `duree`; `duree: 0`; `duree: 121`; `fond: "rouge"` (schema). Plus: `a.gif` with `duree: 4` → `type == "image"`, `duree == 4000`; `a.lottie` → `type == "lottie"`; `fond: "transparent"` forwarded; the service is callable with a non-admin context (`Context(user_id=<read-only user id>)`); `unsubscribe_events` on the subscription id silences it; unit test of `type_lecteur` for each branch including uppercase `.LOTTIE`.
- [ ] **Step 2:** `.venv/bin/pytest tests/composant/test_animations.py -q` → fails (service not found).
- [ ] **Step 3: Implement.** `animations.py`:

```python
SCHEMA = vol.Schema({
    vol.Required("ecrans"): vol.All(cv.ensure_list, [cv.string], vol.Length(min=1)),
    vol.Required("media"): vol.Schema({
        vol.Required("media_content_id"): cv.string,
        vol.Optional("media_content_type"): cv.string,
    }, extra=vol.ALLOW_EXTRA),          # the HA media selector adds `metadata`
    vol.Optional("duree"): vol.Coerce(float),
    vol.Optional("fond", default="noir"): vol.In(("noir", "transparent")),
})

async def _async_jouer(call: ServiceCall) -> None:
    hass = call.hass
    noms_connus = {s.data.get("nom") for s in _entree(hass).subentries.values()}
    inconnus = [n for n in call.data["ecrans"] if n not in noms_connus]
    if inconnus:
        raise ServiceValidationError(f"écran inconnu : {', '.join(inconnus)}")
    duree = call.data.get("duree")
    if duree is not None and not 0 < duree <= DUREE_MAX_S:
        raise ServiceValidationError(f"la durée doit être comprise entre 0 et {DUREE_MAX_S} s")
    media_id = call.data["media"]["media_content_id"]
    try:
        media = await media_source.async_resolve_media(hass, media_id, None)
    except media_source.Unresolvable as err:
        raise ServiceValidationError(f"média introuvable : {media_id}") from err
    lecteur = type_lecteur(media.mime_type, media_id)
    if lecteur is None:
        raise ServiceValidationError(f"type de média non lisible : {media.mime_type}")
    if lecteur == "image" and duree is None:
        raise ServiceValidationError("une image animée n'a pas de fin : indiquez une durée")
    charge = {
        "url": async_process_play_media_url(hass, media.url, allow_relative_url=True),
        "type": lecteur,
        "duree": None if duree is None else int(duree * 1000),
        "fond": call.data["fond"],
    }
    for nom in call.data["ecrans"]:
        async_dispatcher_send(hass, SIGNAL_ANIMATION, nom, charge)
```

  (`async_process_play_media_url` is `homeassistant.components.media_player.browse_media.async_process_play_media_url`, the same call `media_source/resolve_media` makes — it signs relative `/media/...` paths.) `_entree` is the single entry, as in `services.py` (registered only while the entry is loaded). `ws_animations` in `websocket.py`:

```python
@websocket_api.websocket_command({vol.Required("type"): WS_ANIMATIONS, vol.Required("nom"): str})
@callback
def ws_animations(hass, connection, msg):
    nom = msg["nom"]
    @callback
    def _relayer(cible: str, charge: dict) -> None:
        if cible == nom:
            connection.send_message(websocket_api.event_message(msg["id"], charge))
    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_ANIMATION, _relayer)
    connection.send_result(msg["id"])
```

  `services.yaml`: `jouer_animation` with selectors `ecrans: text: multiple: true`, `media: media: accept: ["video/*", "image/*", "application/json"]` (check the current HA `media` selector doc for the `accept` key and drop it if unsupported), `duree: number: min: 1, max: 120, unit_of_measurement: s`, `fond: select: options: [noir, transparent]`. Translations: name/description of the service and each field in `fr.json` and `en.json`.
- [ ] **Step 4:** Green, plus the whole suite (`make test`). Mutations: drop the `cible == nom` filter → the cuisine test goes red; drop the image-without-duration check → its test red; remove `"media_source"` resolution error mapping (let `Unresolvable` escape) → missing-file test red.
- [ ] **Step 5:** Commit `feat(home-desk): home_desk.jouer_animation service and per-screen subscription`.

### Task 2: remove DeLorean everywhere, migrate stored screens to version 2

**Files:**
- Delete: `app/src/rendu/delorean.ts`, `app/tests/delorean.test.ts`, `app/assets/eclair.webp`, `app/assets/firepath_384.webm`, `app/assets/flux_264.webm`, and their copies in `dist/assets/`
- Modify (app): `app/src/modes.ts` (`Modulateur` loses `'delorean'`, `instantDelorean` and its predicate go), `app/src/agencement.ts` (default `modulateurs: ['invites', 'chaleur']`), `app/src/ecran.ts` (`delorean` field, the living-room literal, notes mentioning the scene), `app/src/boot/{draw,frame,timers,state,wiring,constants}.ts` (`armerDelorean`, `couperDelorean`, `sceneDelorean`, `deloreanArme`, `vitesseAffichee` if only DeLorean used it, the survol render), `app/src/demarrage.ts` and `app/src/mouvement/fantomes.ts` (comments), `app/src/styles/base.css` (every `.delorean*` rule and `--delorean-duree`), `app/scripts/copier-assets.mjs` (header comment: assets are now the fonts only), tests that mention it (`orchestration`, `contextes`, `corps`, `modes`)
- Modify (component): `custom_components/home_desk/contrat/ecran.schema.json` and the repo-root `contrat/` copy — find which is generated (`app/scripts/generer-contrats.mjs`) and edit the source; `schema.py`, `config_flow.py`, `objets.py`, `validateurs.py`, `fautes.py`, `translations/*.json`; `const.py` `VERSION_CONFIG = 2`; migration in `__init__.async_setup_entry` (before anything reads subentries) or a new `migration.py` if `__init__.py` would pass 500 lines
- Test: `tests/composant/test_migration_v2.py`; update `test_schema.py`, `test_config_flow_*`, `test_garde_ecran_importer.py`

**Interfaces (Produces):** `migration.migrer_sous_entrees(hass, entry) -> int` (number of subentries rewritten).

- [ ] **Step 1: Failing tests.** Migration: an entry with two version-1 subentries — `salon` with `delorean: True` and `agencement.modulateurs: ["chaleur", "delorean", "invites"]`, `cuisine` without either — after setup: `salon` has no `delorean`, `modulateurs == ["chaleur", "invites"]`, `version == 2`, every other key byte-identical; `cuisine` identical except `version == 2`; a second setup rewrites nothing (returns 0). Contract: a screen with `delorean: true` is refused by `schema.ECRAN`; `"delorean"` in `modulateurs` refused; the importer refuses a file carrying either, and writes nothing. App: `npx vitest run` after deleting `delorean.test.ts` shows no reference left; add to `app/tests/contrat-schema.test.ts` that the schema has no `delorean` property and the `modulateurs` enum is `["invites", "chaleur"]`.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement the removals and the migration (use `hass.config_entries.async_update_subentry(entry, subentry, data=...)`; never touch `.storage` directly). Rebuild with `npm run build`.
- [ ] **Step 4:** Green: `make test`, `npx vitest run`, `tsc` count unchanged, and `bash -c 'command grep -rni delorean app/src custom_components contrat | command grep -v migration'` returns nothing. Mutation: migration forgets `modulateurs` → its test red.
- [ ] **Step 5:** Commit `refactor(home-desk): remove the hardcoded DeLorean scenes (config version 2)`.

### Task 3: the overlay on the tablet (video and image)

**Files:**
- Create: `app/src/animation.ts` (pure state + end rules), `app/src/rendu/animation.ts` (lit template), `app/src/boot/animation.ts` (wiring: subscription, timers, touch, media events)
- Modify: `app/src/boot/state.ts` (`animation: AnimationEnCours | null`, `jetonAnimation: number`), `app/src/boot/draw.ts` (render the overlay where the DeLorean survol was, skip when `s.niveauInitial === 'aucun'`), `app/src/demarrage.ts` (call `armerAnimations(cx, nomEcran, s)` next to `armerRechargement`), `app/src/styles/base.css` or a new `app/src/styles/animation.css` imported the same way (preferred: new file, base.css is already over 500 lines)
- Test: `app/tests/animation.test.ts` (logic), `app/tests/animation-geste.test.ts` (mounted, via `monterDemarrage` in `tests/aides.ts` — extend its `abonner` double to record callbacks per command type so a test can push an animation event)

**Interfaces:**
- Consumes: the Task 1 wire payload.
- Produces: `type Animation = { url: string; type: 'video' | 'image' | 'lottie'; duree: number | null; fond: 'noir' | 'transparent' }`; `lireAnimation(evt: Record<string, unknown>): Animation | null` (rejects malformed payloads); `dureeEffective(a: Animation): number` (`min(a.duree ?? DUREE_MAX_MS, DUREE_MAX_MS)`, `DUREE_MAX_MS = 120_000`); `jouerAnimation(s, a)`, `fermerAnimation(s, jeton)`.

- [ ] **Step 1: Failing tests.** Logic: `lireAnimation` accepts the three types and refuses a missing url, unknown type, non-numeric duree; `dureeEffective` caps at 120 000 and uses `duree` when shorter. Gesture (mounted kitchen screen): pushing a `video` event renders `.animation video[muted][autoplay][playsinline]` with the url; `fond: 'noir'` sets the opaque veil class, `transparent` does not; dispatching `ended` on the video closes the overlay; for `image` with `duree: 4000`, the timer (`minuteurFn` spy) closes it; the cap timer is always armed at `dureeEffective`; a second event replaces the first and the FIRST's timer firing afterwards does not close the second (Review Focus 1); a `pointerdown` during an animation closes it and the tile underneath receives nothing (`appelerService` not called — Review Focus 2); `error` on the `<video>`/`<img>` closes it and `console.error` is called (spy) (Review Focus 3); `play()` returning a rejected promise closes it (Review Focus 3); with reduced motion (`niveauInitial === 'aucun'`) nothing renders (Review Focus 4); the subscription is sent with `{type: 'home_desk/animations', nom: <screen>}`.
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement. Each `jouerAnimation` increments `s.jetonAnimation` and captures it; every closer (`ended`, `error`, timer, cap, touch) calls `fermerAnimation(s, jeton)`, which does nothing when the token is stale. The touch listener is a capture-phase `pointerdown` on `s.racine` that, when an animation is displayed, closes it and calls `stopPropagation()` + `preventDefault()`. After render, call `video.play()` and close on rejection. Overlay CSS: `position: fixed; inset: 0; z-index: 50; pointer-events: none;` media `object-fit: contain`, veil `background: #000` for `noir`.
- [ ] **Step 4:** Green (`npx vitest run`, `tsc`), `npm run build`. Mutations: remove the token check → Review Focus 1 test red; remove `stopPropagation` → Review Focus 2 test red.
- [ ] **Step 5:** Commit `feat(home-desk): tablets play animations pushed by Home Assistant`.

### Task 4: Lottie

**Files:**
- Create: `app/src/lottie-bundle.ts` (entry of the second bundle: `export { DotLottie } from '@lottiefiles/dotlottie-web';`), `app/src/lottie.ts` (loader)
- Modify: `app/package.json` (dependency `@lottiefiles/dotlottie-web` pinned `0.80.0`), `app/rollup.config.js` (export an array: the existing config + `{ input: 'src/lottie-bundle.ts', output: { dir: DIST, entryFileNames: 'dotlottie.js', format: 'iife', name: 'WallpanelLottie', banner }, plugins: [resolve(), typescript(), terser(...)] }`), `app/scripts/copier-assets.mjs` (also copy `node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm` to `dist/assets/`), `app/src/rendu/animation.ts` and `app/src/boot/animation.ts` (Lottie branch)
- Test: `app/tests/lottie.test.ts`, extend `app/tests/animation-geste.test.ts`

**Interfaces:**
- Produces: `chargerLottie(doc: Document = document): Promise<typeof DotLottie>` — injects `<script src="/local/wallpanel/dotlottie.js?v=0.80.0">` once (memoised promise), resolves `window.WallpanelLottie.DotLottie` after `load`, calls `DotLottie.setWasmUrl('/local/wallpanel/assets/dotlottie-player.wasm')` once; rejects on script `error` and clears the memo so a later animation can retry.

- [ ] **Step 1: Failing tests.** `chargerLottie`: two calls inject ONE script; `setWasmUrl` called once with the local path before resolution; a script `error` rejects and the next call injects again. Gesture: a `lottie` event renders a `<canvas>`, calls the loader (spy injected through the boot deps, never a real network fetch), constructs `new DotLottie({ canvas, src: url, autoplay: true, loop: false })`; its `complete` event closes the overlay; `loadError` closes it with `console.error`; the overlay's close calls `destroy()`; a `video` or `image` animation never calls the loader (spy count 0).
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement; `npm install` then `npm run build`; verify `dist/dotlottie.js` and `dist/assets/dotlottie-player.wasm` exist and `dist/wallpanel.js` did not grow by more than a few KB (record sizes before/after in the PR).
- [ ] **Step 4:** Green; mutation: memo removed → "two calls inject ONE script" red.
- [ ] **Step 5:** Commit `feat(home-desk): Lottie animations via a lazily loaded dotlottie-web bundle`.

### Task 5: PR, CI, merge, release

- [ ] Full suites green: `make test`, `npx vitest run`, `tsc` count unchanged (10), `npm run build` leaves `git status` clean after commit.
- [ ] PR `feat(home-desk): animations launched from Home Assistant` including the spec and this plan; body: the service contract, the removal of DeLorean and its config migration (v1 → v2), the production steps from the spec's "Livraison" (not done by the agent), bundle sizes, mutation checks.
- [ ] CI green; squash-merge; wait for `Release`; record the version.
- [ ] **Stop and report** (in French): version, PR URL, test counts, mutations, deviations. **No production step** — filming the current scenes, uploading media, installing, editing `home_desk_ecrans.yaml` and the automations are done afterwards with the owner.
