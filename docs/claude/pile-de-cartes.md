# Card stack

Spec (French, binding): `docs/superpowers/specs/2026-10-24-pile-de-cartes-design.md`. This file
says where each rule lives in the code, not why it was chosen. Example configuration:
`docs/claude/pile-de-cartes-appareils.example.yaml`.

## Card types

`CardType` (`app/src/stack/types.ts`) has **16** members. Each is drawn by a module of
`app/src/cards/` registered in `MODULES` (`stack/collect.ts`); its `detect(f, s)` gives the card's
stable key (`${type}:${main entity}`) and its rank. The condition is the one the code tests.

| Type | Rank | Source | Condition |
|---|---|---|---|
| `recette` | 0 | screen | a recipe is in progress (`recetteUid`) |
| `minuteur` | 1 | screen | the most urgent timer of the room, running or paused |
| `aeration` | 2 | screen | an opening of the room is open and `CONDITIONS.aeration` holds (heating on, or rain) |
| `aspirateur` | 2 or 4 | screen + house | state `error` or `paused` = 2; `cleaning` or `returning` = 4; otherwise no card |
| `voiture` | 2 or 4 | screen + house | charging (`enCharge` is `on`) = 4; unplugged AND battery under `limite` = 2 (no `limite` declared: never "to plug in") |
| `imprimante` | 2 or 4 | house | `print_status`: `running`/`prepare`/`slicing`/`pause` = 4; `finish`/`failed` = 2 until the next job; `erreur` `on` = 2; `idle`, `init`, `offline`, unreadable = no card |
| `animaux` | 2 | house | at least one of `fontaineVide`, `filtre`, `panneFontaine`, `panneDistributeur` is `on` |
| `media` | 3 | screen | the source the tablet follows (its own, else what plays elsewhere) |
| `cinema` | 3 | screen | a source whose screen is on; a source that is both is one `cinema` card |
| `tapis` | 4 | house | `vitesse` reads above zero |
| `plantes` | 5 | house | a probe reads strictly under its threshold (its own `soil_warning`, else the appliance's `seuil`; neither: not judged) |
| `air` | 5 | house | `pm25` strictly above `seuil` |
| `alarme` | 5 | house | a zone is `armed_home`, `armed_away`, `armed_night`, `armed_vacation` or `armed_custom_bypass` |
| `encre` | 5 | house | a cartridge level strictly under `seuil` |
| `repas` | 5 | screen | the hour before the next planned meal, on a screen that declares the recipe view |
| `garde-manger` | 5 | screen | a batch nears its date or a product runs short, on a screen that declares `#garde-manger` |

Ranks: 0 recipe open, 1 timer, 2 waits for a gesture, 3 music or film, 4 runs on its own,
5 soft reminders. `alerte` stays outside the stack and takes the whole block, timer included
(`boot/home.ts`).

## Appliance roles per type

Copied from `contrat/maison.schema.json` (`$defs/appareil`, one `if/then` branch per type); the
contract is the only place the table lives, `appliances.py` builds its mirror from it. A role not
listed for its type is refused. List roles are arrays of entity ids, all others one entity id.
`piece` is the `nom` of a screen or `maison`; `air`, `alarme`, `encre`, `plantes` and `tapis`
refuse `maison` (`$defs/pieceDeTablette`, see "House-wide appliances").

| Type | Required | Optional | `seuil` |
|---|---|---|---|
| `imprimante` | `etat`, `progression` | `finTache`, `couche`, `couchesTotal`, `tache`, `couverture`, `camera`, `pause`\*, `reprise`\*, `arret`\*, `erreur`, `ams` (list, at most 4) | forbidden |
| `aspirateur` | `aspirateur` | `plan`, `erreur` (`sensor`: Valetudo's `Error`, the subtitle while stuck) | forbidden |
| `voiture` | `batterie`, `branchee` | `enCharge`, `autonomie`, `limite`, `finCharge`, `demarrerCharge`\*, `arreterCharge`\* | forbidden |
| `animaux` | at least one of `fontaineVide`, `filtre`, `panneFontaine`, `panneDistributeur` (all `binary_sensor`) | `joursFiltre` (`sensor`), `nourrir` (`number`/`input_number`) | forbidden |
| `plantes` | `sondes` (list) | `habitude` (`input_boolean`: turned on when watered) | optional |
| `tapis` | `vitesse` (`sensor`) | `pas`, `distance` (`sensor`), `reglageVitesse` (`number`/`input_number`), `arret`\* | forbidden |
| `air` | `pm25` (`sensor`), `purificateur` (`fan`) | none | **required** |
| `alarme` | `zones` (list of `alarm_control_panel`) | none | forbidden |
| `encre` | `niveaux` (list of `sensor`) | none | **required** |

\* `button.*` only (`$defs/entiteBouton`): the card presses it with `button.press`. The screen's
own car (`contrat/ecran.schema.json`) restricts `demarrerCharge`, `arreterCharge` and
`boutonLimite` the same way, like its Home Assistant form.

`nourrir` gives one portion: its `min` when positive, else its `step` when positive, else no
button.

`recette`, `minuteur`, `media`, `cinema`, `aeration`, `repas` and `garde-manger` have no appliance:
they read the screen. `aspirateur` and `voiture` read both.

## Merge order

`cardEntities` (`stack/appliances.ts`) builds the entities of one card type for a screen:

1. Every declaration of the same card key is merged, field by field: the **screen's own** first
   (the most specific), then the **room's** appliances (`piece` equals the screen's `nom`
   exactly), then the **house's** (`piece` = `maison`). Earlier declarations win; later ones only
   fill what is undeclared.
2. Only then is the rank computed, on the merged shape: a house appliance is judged by the rank
   its merged card would have.

Room names compare as configured, in any script. A role the contract requires and an adapter
cannot find throws (`requiredRole`): a corrupt house, never a silent card.

## House-wide appliances

An appliance with `piece: maison` shows on every tablet, but **only while its merged card is
rank 2** (`appliancesFor`). So it fits cards that wait for a gesture: a finished or failed
print, a stuck or paused robot, a car to plug in, an empty fountain. A house-wide `tapis`
(rank 4) or `plantes`, `air`, `alarme`, `encre` (rank 5) would never show, so the contract
refuses `maison` for those five types. An appliance of the screen's own room shows at any rank.

No appliance may show nowhere. Besides the contract's refusal above, the YAML import
(`garde_ecran.importer_ecrans`) refuses an appliance whose `piece` is neither `maison` nor the
`nom` of a screen of the same file, compared exactly (a typo, a trailing space, a room without
a tablet). The refusal is translated: `exceptions.appliance_room_unknown` in
`translations/*.json`, raised as a `ServiceValidationError`.

**Room entry plus `maison` entry.** To have an appliance's every state in its room and its
rank-2 states on every tablet, declare it twice: once with its room, once with `maison` and the
same main entity (the role its card key is built from: `aspirateur`, the car's `batterie`). Both
entries merge into one card by key (see "Merge order"): its room sees one card at any rank,
the other tablets see it only at rank 2. The `maison` entry must carry what the rank is read
from on the tablets that do not have the room entry, such as the car's `limite`. The example
YAML does this for the vacuum and the car; `test_exemple_appareils.py` and
`stack-appliances.test.ts` pin the pattern.

## Time zone of the meal card

`mealStartMs` (`app/src/garde-manger.ts`) parses the calendar's `start_time` attribute, which
Home Assistant writes as a local time without an offset, in the **tablet's** time zone. The
server writes it in **its** time zone. The meal card's hour window is therefore right only
while the tablets and the Home Assistant server share one time zone, which is the case in this
house. A tablet set to another zone would shift the window by the difference.

## Absent roles

A role whose entity is missing from the states, `unavailable` or `unknown` (or not a number
where one is read) is **absent**:

- a reading: its line is omitted, and it does not count toward a card's condition (a probe or
  cartridge that cannot be read is not judged; an unreadable `etat` or `aspirateur` gives no card);
- a button: its place stays empty (`.vide`), never a dead button. Left, centre and right keep
  their position;
- a stepper bound (`reglageVitesse` without `step`, `min` or `max`): both slots stay empty
  rather than a step of ours.

## « Plus tard »

Hides a card for **2 h on every tablet**. The state lives in the integration, not in a browser:
`custom_components/home_desk/plus_tard.py`, a Home Assistant `Store` (`.storage/home_desk.plus_tard`),
house-wide, `SNOOZE_S = 7200` in `const.py`. It is not a config write and does not go through
`garde_ecran.py`. WebSocket commands `home_desk/plus_tard` (a card key) and
`home_desk/plus_tard/abonner` (the active set, pushed on every change and expiry). The tablet
(`stack/snooze.ts`) follows the pushed set and also expires each key at its end on **its own
clock**, so a silent subscription cannot keep a card hidden. `collectStack` removes snoozed keys
before ordering. Button: `laterButton` (`cards/actions.ts`).

## Ordering and the displayed card

- **Order** (`stack/order.ts`): by rank, then by the position of the card's mode (`MODE_OF`:
  `recette`, `minuteur`, `media`, `cinema`, `aspirateur` = `menage`, `aeration`, `voiture`) in
  `agencement.modes`; a type with no mode, or whose mode is not listed, ends its rank; stable.
- **Displayed card** (`stack/follow.ts`, pure): a higher-priority card takes the place only at
  its **appearance**; one already there waits. After `RETURN_MS` = 60 000 ms without a touch the
  stack returns to its head (`boot/home-stack.ts`).
- **The command grid follows the head card**, never the displayed one (`stackHead`,
  `boot/home.ts`): swiping never reorders the commands.
- Empty stack: the screen's default block returns (`agencement.blocDefaut`).

## Swipe and dots

- `attachSwipe` (`stack/swipe.ts`) sits on `.pile`, never on `.carte` (lit rewrites its `style`).
  The threshold is `SEUIL_PX` of `geste.ts`; vertical gestures are left to the page (`pan-y`).
  No wrap: at either end the card moves a quarter of the finger and snaps back (180 ms slide).
- **One contact per card**: a second `pointerdown` (the WebView's phantom, or a second finger)
  is stopped in the capture phase during a gesture.
- `cardPress`: `.appuye` on contact, **action on release** if the finger moved less than
  `SEUIL_PX`; a swipe that starts on a button (volume steppers included) does not fire it. The
  `hold` option repeats while held (`hold-repeat.ts`). Press state lives per element (`WeakMap`).
- **Dots** (`rendu/stack.ts`): one per card, the current one elongated, inside the card at the end
  of the label row, only when the stack holds more than one card (`data-cards` on `.pile`).

## Height budget per block kind

`app/src/screen-budget.ts` (twin `custom_components/home_desk/budget.py`, corpus
`contrat/cas-budget.json`) takes a block kind, never a mode:

| Kind | Height | When |
|---|---|---|
| `carte` | 264 px (`blocCarte`) | the stack is not empty; the only kind that steps down the scale |
| `haut` | 153 px | empty stack, car block |
| `defaut` | 84 px | empty stack, meal or agenda |

A stacked block is exactly 264 px: the dots are inside the card.

## Card frame

`app/src/rendu/card-frame.ts` + `app/src/styles/cards.css`. 311 x 264, radius 28; header: label
(11 px, upper case, one line), title (15 px, two lines at most), optional subtitle; a middle zone;
three round 62 px buttons, icon only, the centre one primary. A place with no real action stays
empty.

- Backgrounds: `image` (the subject's picture, intact; colours from `poster-sampler.ts`; an
  opaque plate only where text would fall under 5:1), `solid` (a token), `theme`. Never a
  gradient or a veil.
- The 7 solid tokens (`SOLID_TOKENS`): `neutral`, `timer`, `timer-late`, `charging`, `plug-in`,
  `air-bad`, `calm`; each has six roles `--carte-<token>-{fond,texte,icone,disque,primaire,sur-primaire}`.
- Text from HA: `dir="auto"`, explicit line heights, one-line ellipsis.
- **Language**: card strings (`app/src/cards/strings.ts`) are French only, like the rest of the
  interface; a locale-indexed string table is missing. Numbers, durations and times already go
  through `Intl`.

## Car form fields

`CHAMPS_VOITURE` (seven required) and `CHAMPS_VOITURE_OPTIONNELS`
(`custom_components/home_desk/objets.py`): `limite` (`number`/`input_number`), `finCharge`
(timestamp `sensor`), `demarrerCharge`, `arreterCharge`, `boutonLimite` (`button` only, pressed by
`button.press`). Every contract field must be in the form, or saving erases it.

## 3D printer (`app/src/cards/printer.ts`)

House appliance only (no screen source). State table from ha-bambulab (sources cited at the head
of the module). `finish`/`failed` stay rank 2 until the next job (nothing says "plate removed");
`print_error` `on` during a job is rank 2 (filament runout included). Buttons `pause`/`reprise`/
`arret` are `button.*`, empty when the integration reports them `unavailable`. Camera: held, it
covers the card (`CardFrame.overlay`, `cards/printer-camera.ts`); a swipe hides it at the
threshold; at most 5 s (`DELAI_SECOURS_MS`). AMS spools: `cards/printer-spools.ts`,
`styles/printer.css`.

## Adding a card type

1. Add it to `CardType` (`stack/types.ts`) and, if it has one, its mode to `MODE_OF` (`stack/order.ts`).
2. `app/src/cards/<card>.ts`: `detect(f, s)` (stable key, rank) and `frame(card, f, s)`; strings
   in `cards/strings.ts`. Appliance types read through `cardEntities`.
3. Register it in `MODULES` (`stack/collect.ts`).
4. vitest tests on fixtures (`app/tests/card-aides.ts`), never a real entity.
5. Add a fixture to `app/outils/pile-fixture*.js`. `verifier-pile.mjs` reads the list of types
   from `types.ts` (`outils/pile-types.mjs`) and **fails** if a type has no card in the fixture.
6. An appliance type also needs a branch in `contrat/maison.schema.json` (then `make contrat`),
   its mirror cases in `contrat/cas-maison.json`, and an entry in the example YAML (a test fails
   otherwise).

## Running the checks

```bash
cd app && node outils/verifier-pile.mjs          # expect 0 faults, exit 0
node outils/verifier-pile.mjs --contre-epreuve   # cards forced to 300 px: MUST fail
# other counter-proofs, each MUST fail: =points, =contraste, =sans-points, =points-dehors,
# =carte-seule, =trois-lignes, =bobines, =bobine-active
# swipe.ts mutants, each MUST fail: --mutant=lock|threshold|contact|hold-end
```

Outside Home Assistant: `src/` bundled by esbuild, real Chromium 343 x 585, the system's
fallback font. For every `CardType` of the source, in two variants and three scripts (Latin,
CJK, Arabic), it checks 311 x 264, two-line titles, nothing past 585 px, worst-pixel contrast
(5:1 text, 4.5:1 icons and dots), the dots rule; then real CDP touches (`pile-touches.mjs`).
Measures are shared with the media card (`outils/card-check.mjs`).

The example appliances are checked by `make test-composant`
(`tests/composant/test_exemple_appareils.py`): the YAML is read by the importer's parser and
validated by `schema.validate_house`; it must cover every appliance type, and a type shown twice must be the room-plus-`maison` pattern.

**To run by the owner on the real HA**: `verifier-rendu.mjs` and `mesurer-hauteurs.mjs` (syntax
checked only; they need the page served by HA and its token).
