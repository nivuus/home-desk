# Pile de cartes — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le mode exclusif du bloc central des tablettes par une pile de cartes de taille fixe (311 × 264), ordonnée par priorité, parcourue en glissant, minuteur d'abord.

**Architecture:** Un modèle pur (`app/src/stack/`) collecte les cartes actives, les ordonne par rang puis par `agencement.modes`, et suit la carte affichée (prise de place à l'apparition, retour au bout d'une minute). Chaque carte est un module `app/src/cards/<type>.ts` (`detect` + `render`) qui s'inscrit dans un cadre commun (`rendu/card-frame.ts`). Le budget de hauteur ne dépend plus d'un mode mais d'un **genre de bloc** (`carte`, `haut`, `defaut`) ; « plus tard » vit dans l'intégration (`plus_tard.py`, `Store` HA + websocket) ; les appareils des nouvelles cartes viennent de la sous-entrée maison (version 2, `appareils`).

**Tech Stack:** TypeScript + lit 3, vitest/jsdom, rollup ; intégration HA Python (voluptuous, pytest-homeassistant-custom-component) ; contrat JSON Schema partagé (`contrat/`).

**Spec:** `docs/superpowers/specs/2026-10-24-pile-de-cartes-design.md` (lire avant toute tâche ; elle fait foi).

## Global Constraints

- Carte : **311 × 264 px**, rayon **28 px**, padding de la carte média ; en-tête = étiquette (majuscules, **11 px**) + titre (**15 px**, deux lignes max) + sous-titre facultatif ; **trois boutons ronds de 62 px**, icônes seules, le central en couleur primaire.
- **Aucun bouton avec du texte.** Une place sans action réelle reste vide (gauche, centre, droite gardent leur position) ; jamais de bouton factice ni de bouton mort.
- Fond : image si le sujet en a une, sinon couleur ou texture unie. Contraste au pire pixel **≥ 5:1** pour le texte, plaque opaque seulement où il le faut, icônes **≥ 4,5:1**. Jamais de dégradé sur grande surface, jamais de voile sur une image.
- Ordre : rang 0 recette ouverte · 1 minuteur · 2 attend un geste · 3 musique/film · 4 tourne tout seul · 5 rappels doux ; dans un rang, ordre de `agencement.modes`, type absent en fin de rang. `alerte` hors pile, plein bloc, minuteur compris.
- Retour à la carte de tête après **60 000 ms** sans toucher. « Plus tard » masque une carte **2 h** sur toutes les tablettes.
- La grille de commandes suit la carte **de tête**, jamais la carte affichée.
- Écran 343 × 585, Fire 7, Chromium 119 ; rien ne déborde des 585 px.
- Aucune langue figée : hauteurs de ligne explicites, ellipse sur une ligne, `dir="auto"` sur tout texte venu de HA ; les chaînes d'interface des cartes vivent dans **un seul** module (`app/src/cards/strings.ts`).
- Aucun `entity_id` écrit en dur dans `app/` (sauf ceux qui y vivent déjà) : les entités viennent de l'écran ou de `appareils`.
- Code, commentaires, commits en anglais. Aucun fichier source au-delà de **500 lignes**. Seul `garde_ecran.py` appelle une porte d'écriture de config ; seul `formulaire.py` appelle `async_show_form` avec `data_schema`. Après toute modification de `contrat/` : `make contrat` et commit du résultat.
- Fin de chaque lot : `make test`, `make test-app`, `make test-composant` verts, `dist/` reconstruit (`cd app && npm run build`) et commité.

## Review Focus

1. **Démarrer un minuteur pendant la musique, en cuisine.** La carte fait tomber la rangée Ambiance, et avec elle `tuileMinuteur` : sans correction, aucun moyen de lancer un minuteur tant qu'une carte est affichée — le défaut même que la spec corrige. Décision du plan (à confirmer par le propriétaire) : quand la rangée Ambiance tombe et que l'écran a des minuteurs, la tuile minuteur prend la première place de la grille de commandes. Test : tâche 6, `home-stack.test.ts` « timer tile survives a dropped Ambiance row ».
2. **Une carte qui disparaît pendant qu'on la regarde** (l'aspirateur rentre à la base, le film s'arrête) : l'affichage passe à la carte de tête, jamais à un index hors pile ni à un écran vide. Test : tâche 2, `stack-follow.test.ts` « displayed card vanishing falls back to head ».
3. **Deux tablettes, un « plus tard »** : la carte disparaît sur les deux, revient sur les deux après 2 h, et survit à un redémarrage de HA. Test : tâche 7, `test_plus_tard.py::test_snooze_survives_reload` et « broadcasts to every subscriber ».
4. **Un titre d'impression ou un nom de pièce long, CJK ou arabe** : la carte reste à 264 px de haut, le titre s'arrête à deux lignes. Test : tâche 8, `verifier-pile.mjs` (mesure réelle) et tâche 3, `card-frame.test.ts` (attributs `dir="auto"`, classes de clamp).
5. **Un glissement qui commence sur un bouton** ne déclenche pas le bouton ; un appui franc le déclenche une fois. Test : tâche 4, `stack-swipe.test.ts`.

---

# Lot 1 — la pile, le glissement, le budget, les cartes issues des modes

### Task 1: Le budget par genre de bloc

Le déclencheur de l'échelle devient « la pile n'est pas vide ». Le budget ne reçoit plus un mode mais un genre de bloc.

**Files:**
- Modify: `contrat/budget.json` — retirer `modesABlocMinuteur`, `modesABlocMedia`, `modesABlocHaut`, `hauteurs.blocMinuteur`, `hauteurs.blocMedia` et leurs `_blocMinuteur`/`_blocMedia` ; ajouter `hauteurs.blocCarte: 264` avec un `_blocCarte` qui reprend la mesure de `_blocMedia` ; garder `blocHaut: 153`, `blocDefaut: 84`.
- Modify: `contrat/cas-budget.json` — chaque cas porte `"bloc"` au lieu de `"mode"` ; recalculer les attendus (le minuteur, désormais `carte`, passe de 0 à 2 commandes sur 585 px).
- Modify: `app/src/screen-budget.ts`, `custom_components/home_desk/budget.py`
- Modify: `custom_components/home_desk/config_flow.py:213`, `custom_components/home_desk/objets.py` (appelants de `check_budget`)
- Modify: `app/outils/mesurer-hauteurs.mjs` (il lisait `modesABloc*` comme proxy de famille de bloc)
- Test: `app/tests/budget.test.ts`, `app/tests/cas-budget.test.ts`, `tests/composant/test_budget.py`

**Interfaces:**
- Produces (TS): `export type BudgetBlock = 'carte' | 'haut' | 'defaut';` `combien(bloc: BudgetBlock, rangeeAmbiance?, hauteurUtile?, zones?, syntheseReduite?): number`, `arrangement(bloc: BudgetBlock, ...): Arrangement`, `verifierBudget(bloc: BudgetBlock, rangeeAmbiance, hauteurUtile, zones?): number`. Seul `carte` gravit l'échelle.
- Produces (Py): `combien(bloc: str, ...)`, `arrangement(bloc: str, ...)`, `check_budget(bloc: str, ...)`, mêmes sémantiques.
- `modes.ts` garde provisoirement `arrangementEcran(c)` en traduisant le mode : `minuteur|recette|media|cinema|menage|aeration → 'carte'`, `voiture → 'haut'`, sinon `'defaut'` (la tâche 6 le remplace).

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// app/tests/budget.test.ts
it('a card costs 264 px whatever it shows', () => {
  expect(verifierBudget('carte', true, 585)).toBe(0);
  expect(combien('carte', true, 585)).toBe(0);           // full composition does not fit
  expect(arrangement('carte', true, 585)).toEqual({ rangeeAmbiance: false, syntheseReduite: true, commandes: 2 });
  expect(arrangement('carte', false, 585)).toEqual({ rangeeAmbiance: false, syntheseReduite: true, commandes: 2 });
});
it('the empty-stack blocks keep their budget', () => {
  expect(combien('defaut', true, 585)).toBe(4);
  expect(combien('haut', true, 585)).toBe(2);
  expect(arrangement('haut', true, 585).rangeeAmbiance).toBe(true);
});
```

```python
# tests/composant/test_budget.py
def test_a_card_climbs_the_ladder():
    assert budget.arrangement("carte", True, 585) == {"rangeeAmbiance": False, "syntheseReduite": True, "commandes": 2}
    assert budget.check_budget("carte", True, 585) == 0

def test_the_form_refuses_what_overflows_with_a_card_or_empty():
    # the form checks both the card and the empty-stack block, and reports the larger overflow
    assert budget.check_budget("carte", True, 400) > 0
```

- [ ] **Step 2: Lancer, constater l'échec**

Run: `cd app && npx vitest run tests/budget.test.ts tests/cas-budget.test.ts` puis `make test-composant`
Expected: FAIL (`'carte'` inconnu, cas du corpus sur `mode`).

- [ ] **Step 3: Implémenter** — `coutEcran` choisit `blocCarte | blocHaut | blocDefaut` par le genre ; `parEchelle(bloc) = bloc === 'carte'`. Même chose côté Python. Dans `config_flow.py`, le formulaire calcule `max(check_budget("defaut", ...), check_budget("carte", ...))` (et `"haut"` quand `blocDefaut` vaut `voiture`) — l'écran affiche les deux compositions au fil de la journée. `mesurer-hauteurs.mjs` publie la famille par le genre de bloc. Réécrire les `_source`/`_arrangement` du corpus.

- [ ] **Step 4: `make contrat`, puis relancer**

Run: `make contrat && make test && make test-app && make test-composant`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add contrat custom_components/home_desk app/src/screen-budget.ts app/src/modes.ts app/outils/mesurer-hauteurs.mjs app/tests tests/composant
git commit -m "refactor(budget): budget by block kind, any card climbs the ladder"
```

### Task 2: Le modèle de pile

**Files:**
- Create: `app/src/stack/types.ts`, `app/src/stack/order.ts`, `app/src/stack/follow.ts`
- Test: `app/tests/stack-order.test.ts`, `app/tests/stack-follow.test.ts`

**Interfaces:**
- Produces (`stack/types.ts`):
  ```ts
  export type CardType = 'recette' | 'minuteur' | 'media' | 'cinema' | 'aspirateur' | 'voiture'
    | 'aeration' | 'imprimante' | 'animaux' | 'plantes' | 'tapis' | 'repas' | 'garde-manger'
    | 'air' | 'alarme' | 'encre';
  export type Rank = 0 | 1 | 2 | 3 | 4 | 5;
  /** `key` is stable across tablets: `${type}:${main entity}`. It is what "plus tard" snoozes. */
  export type Card = { key: string; type: CardType; rank: Rank };
  export type StackView = { displayedKey: string | null; lastTouchMs: number | null; known: string[] };
  ```
- Produces (`stack/order.ts`): `export const MODE_OF: Partial<Record<CardType, ModePrincipal>>` (`aspirateur → 'menage'`, les autres types qui sont aussi des modes à l'identique) ; `export function orderStack(cards: Card[], modes: ModePrincipal[]): Card[]` — tri stable par `rank`, puis par l'index de `MODE_OF[type]` dans `modes`, un type absent en fin de son rang.
- Produces (`stack/follow.ts`): `export const RETURN_MS = 60_000;` `export function followStack(prev: StackView, ordered: Card[], nowMs: number): StackView` et `export function touchStack(prev: StackView, displayedKey: string, nowMs: number): StackView`.

Règles de `followStack` (spec, « Décisions prises… ») : une carte **apparue** (clé absente de `prev.known`) plus prioritaire que l'affichée prend la place ; si `lastTouchMs` date de plus de `RETURN_MS`, retour à la tête et `lastTouchMs = null` ; si l'affichée n'est plus dans la pile, tête ; pile vide → `displayedKey: null`. `known` = clés de `ordered`.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// stack-order.test.ts
const c = (type: CardType, rank: Rank): Card => ({ key: `${type}:x`, type, rank });
it('ranks first, then agencement.modes, unknown types last in their rank', () => {
  const out = orderStack([c('imprimante', 4), c('aspirateur', 4), c('media', 3), c('minuteur', 1)],
                         ['alerte', 'recette', 'minuteur', 'menage', 'media', 'defaut']);
  expect(out.map((x) => x.type)).toEqual(['minuteur', 'media', 'aspirateur', 'imprimante']);
});
it('recipe before timer', () => {
  expect(orderStack([c('minuteur', 1), c('recette', 0)], AGENCEMENT_DEFAUT.modes)[0].type).toBe('recette');
});

// stack-follow.test.ts
const v0: StackView = { displayedKey: null, lastTouchMs: null, known: [] };
it('a higher card that appears takes the place', () => {
  const a = followStack(v0, [c('media', 3)], 0);
  const b = followStack(touchStack(a, 'media:x', 0), [c('minuteur', 1), c('media', 3)], 1_000);
  expect(b.displayedKey).toBe('minuteur:x');
});
it('a card already there never comes back on its own before the minute', () => {
  let v = followStack(v0, [c('minuteur', 1), c('media', 3)], 0);
  v = touchStack(v, 'media:x', 0);
  expect(followStack(v, [c('minuteur', 1), c('media', 3)], 59_999).displayedKey).toBe('media:x');
  expect(followStack(v, [c('minuteur', 1), c('media', 3)], 60_000).displayedKey).toBe('minuteur:x');
});
it('displayed card vanishing falls back to head', () => {
  const v = touchStack(followStack(v0, [c('minuteur', 1), c('aspirateur', 4)], 0), 'aspirateur:x', 0);
  expect(followStack(v, [c('minuteur', 1)], 10).displayedKey).toBe('minuteur:x');
});
it('empty stack displays nothing', () => {
  expect(followStack(v0, [], 0).displayedKey).toBeNull();
});
```

- [ ] **Step 2: Lancer** — Run: `cd app && npx vitest run tests/stack-order.test.ts tests/stack-follow.test.ts` · Expected: FAIL (modules absents).
- [ ] **Step 3: Implémenter les trois modules** (fonctions pures, aucune lecture d'`Etat`).
- [ ] **Step 4: Relancer** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(stack): card stack model, order and follow rules"`

### Task 3: Le cadre de carte et les fonds

**Files:**
- Create: `app/src/rendu/card-frame.ts`, `app/src/styles/cards.css` (importée par `src/index.ts` comme les autres feuilles), `app/src/cards/strings.ts`, `app/src/boot/card-tones.ts`
- Modify: `app/src/boot/media-tones.ts` (devient un appelant de `card-tones.ts` ; `tonesToPaint`/`measureCard` y déménagent sans changer de signature), `app/src/rendu/media.ts` (la carte média se rend dans le cadre commun, rendu visuel inchangé)
- Test: `app/tests/card-frame.test.ts`, `app/tests/card-backgrounds.test.ts`, `app/tests/carte-media.test.ts` (doit rester vert)

**Interfaces:**
- Produces (`rendu/card-frame.ts`):
  ```ts
  export type CardBackground =
    | { kind: 'image'; url: string }
    | { kind: 'solid'; token: SolidToken };          // a colour or a flat texture, never a gradient
  export type SolidToken = 'neutral' | 'timer' | 'timer-late' | 'charging' | 'plug-in'
    | 'air-good' | 'air-bad' | 'calm';
  export type CardButton = { icon: string; label: string; primary?: true; act: () => void; inert?: true };
  export type CardFrame = {
    key: string; label: string; title: string; subtitle?: string;
    middle: TemplateResult; buttons: [CardButton?, CardButton?, CardButton?];
    background: CardBackground; tones?: ToneState;   // only for 'image'
  };
  export function renderCardFrame(f: CardFrame): TemplateResult;
  ```
  `label` d'un bouton sert d'`aria-label` uniquement, jamais affiché. Racine : `<section class="carte" data-zone="blocCentral" data-card="${key}">`.
- Produces (`boot/card-tones.ts`): `export function afterCardPaint(s: ScreenState, url: string): void` — le geste de `afterMediaPaint` pour toute carte à fond image (mesure des boîtes, `tonesFor`, repaint quand prêt). `ScreenState.mediaCard` est renommé `measuredCard`.
- Produces (`cards/strings.ts`): `export const S = { … } as const` — toutes les chaînes d'interface des cartes (étiquettes d'état, unités) ; les tâches suivantes y ajoutent les leurs.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// card-frame.test.ts
it('renders three fixed slots, empty ones stay empty', () => {
  render(renderCardFrame({ ...BASE, buttons: [undefined, PLAY, undefined] }), hote);
  const slots = hote.querySelectorAll('.carte .actions > *');
  expect(slots).toHaveLength(3);
  expect(slots[0].classList.contains('vide')).toBe(true);
  expect(slots[1].getAttribute('aria-label')).toBe(PLAY.label);
  expect(slots[1].textContent!.trim()).toBe('');            // icon only, never text
  expect(slots[1].classList.contains('primaire')).toBe(true);
});
it('every text from HA carries dir=auto and the two-line clamp', () => {
  render(renderCardFrame(BASE), hote);
  for (const sel of ['.etiquette', '.titre', '.sous-titre']) expect(hote.querySelector(sel)!.getAttribute('dir')).toBe('auto');
  expect(hote.querySelector('.titre')!.classList.contains('deux-lignes')).toBe(true);
});
// card-backgrounds.test.ts — reads cards.css, every solid token pair passes
it.each(SOLID_TOKENS)('solid %s: text ≥ 5:1, icons ≥ 4.5:1', (token) => {
  const { fond, texte, icone } = tokenColours(token);   // parsed from cards.css custom properties
  expect(contrastRatio(lum(fond), lum(texte))).toBeGreaterThanOrEqual(5);
  expect(contrastRatio(lum(fond), lum(icone))).toBeGreaterThanOrEqual(4.5);
});
```

- [ ] **Step 2: Lancer** — Run: `cd app && npx vitest run tests/card-frame.test.ts tests/card-backgrounds.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implémenter** — `cards.css` : `.carte { width: 311px; height: 264px; border-radius: 28px; box-sizing: border-box; overflow: hidden }`, padding repris de `.media`, hauteurs de ligne explicites (11 px / 15 px), `.deux-lignes` = `-webkit-line-clamp: 2`, `.actions` = grille de trois colonnes de 62 px ; une paire de propriétés `--carte-<token>-fond/-texte/-icone` par `SolidToken`, couleurs pleines. Image : `<img>` en `object-fit: cover`, plaques posées par `tones` exactement comme la carte média.
- [ ] **Step 4: Relancer, et toute la suite** — Run: `make test-app` · Expected: PASS (`carte-media.test.ts`, `media-tones.test.ts` inclus).
- [ ] **Step 5: Commit** — `git commit -m "feat(cards): shared card frame, solid backgrounds, tones for any image card"`

### Task 4: Le glissement

**Files:**
- Create: `app/src/stack/swipe.ts`, `app/src/rendu/stack.ts`
- Modify: `app/package.json` seulement si la bibliothèque est retenue
- Test: `app/tests/stack-swipe.test.ts`, `app/tests/stack-render.test.ts`

**Interfaces:**
- Consumes: `SEUIL_PX` (`geste.ts`), `CardFrame` (tâche 3).
- Produces (`stack/swipe.ts`): `export function attachSwipe(el: HTMLElement, h: { count: number; index: number; onChange(index: number): void; onTouch(): void }): () => void` (rend le détacheur). Et `export function cardPress(act: () => void): { onpointerdown, onpointermove, onpointerup, onpointercancel }` — l'action d'un bouton de carte part au **relâchement** si le doigt a bougé de moins de `SEUIL_PX`, le retour visuel (`.appuye`) au contact : c'est la seule façon de tenir à la fois « un appui agit tout de suite » et « un glissement qui commence sur un bouton ne le déclenche pas ».
- Produces (`rendu/stack.ts`): `export function renderStack(frames: CardFrame[], displayedIndex: number): TemplateResult` — la carte affichée seule dans le DOM, plus les points (`.points`, le courant allongé) **uniquement si** `frames.length > 1`.

- [ ] **Step 1: Chercher avant de construire** — lire la doc actuelle d'Embla Carousel (npm `embla-carousel`, 8.6.0 relevé le 2026-10-24 ; options `dragThreshold`, `watchDrag`, prévention du clic après glissement) et la comparer à une extension de `geste.ts` sur trois critères : Chromium 119, slides obligatoirement présentes dans le DOM (seize cartes, dont des images), compatibilité avec `cardPress`. Écrire la ligne de décision en tête de `stack/swipe.ts`.
- [ ] **Step 2: Écrire les tests qui échouent**

```ts
// stack-swipe.test.ts (jsdom, PointerEvent synthétiques)
it('a horizontal drag past SEUIL_PX moves to the next card', () => {
  drag(el, { dx: -(SEUIL_PX * 4) });
  expect(onChange).toHaveBeenCalledWith(1);
});
it('a drag that starts on a button does not fire the button', () => {
  dragFrom(button, { dx: -(SEUIL_PX * 4) });
  expect(act).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledWith(1);
});
it('a clean tap fires once', () => {
  tap(button);
  expect(act).toHaveBeenCalledTimes(1);
});
it('no move past the ends', () => {
  attachSwipe(el, { count: 2, index: 1, onChange, onTouch });
  drag(el, { dx: -(SEUIL_PX * 4) });
  expect(onChange).not.toHaveBeenCalled();
});
// stack-render.test.ts
it('dots only with more than one card', () => {
  render(renderStack([F1], 0), hote); expect(hote.querySelector('.points')).toBeNull();
  render(renderStack([F1, F2], 1), hote); expect(hote.querySelectorAll('.points > *')[1].classList.contains('courant')).toBe(true);
});
```

- [ ] **Step 3: Lancer** — Run: `cd app && npx vitest run tests/stack-swipe.test.ts tests/stack-render.test.ts` · Expected: FAIL.
- [ ] **Step 4: Implémenter** — animation courte (translation, ≤ 200 ms, aucune ombre ni dégradé), `touch-action: pan-y` sur la carte.
- [ ] **Step 5: Relancer** — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(stack): swipe between cards, tap-safe card buttons"`

### Task 5: Les cartes Minuteur, Recette et Média

**Files:**
- Create: `app/src/cards/timer.ts`, `app/src/cards/recipe.ts`, `app/src/cards/media.ts`
- Test: `app/tests/card-timer.test.ts`, `app/tests/card-recipe.test.ts`, `app/tests/card-media-stack.test.ts`

**Interfaces:**
- Chaque module exporte `detect(f: Frame, s: ScreenState): Card[]` et `frame(card: Card, f: Frame, s: ScreenState): CardFrame`.
- `timer`: une carte `minuteur:${timer}` (rang 1) pour le minuteur le plus urgent dès que `vuesMinuteurs` en compte un actif ou en pause ; milieu = décompte en très gros (réutilise `writeTime` et les ancres de `ancrerMinuteur`), heure de sonnerie, « +N » autres minuteurs ; boutons +1 min · pause/reprise (primaire) · arrêt (services `timer.*` déjà appelés par `ActionsMinuteur`) ; fond `timer`, puis `timer-late` sous 60 s restantes.
- `recipe`: `recette:${uid}` (rang 0) quand `ctx.recetteEnCours` ; milieu = étape courante + décompte du minuteur actif (contenu actuel de `rendreRecetteReduite`) ; bouton central = rouvrir `#recette` ; fond `neutral`.
- `media`: `media:${source key}` (rang 3) ou `cinema:${…}` quand l'écran de la source est allumé ; `frame` délègue à la carte média existante (tâche 3), comportement et teintes inchangés.

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
it('a paused timer is still a rank-1 card', () => {
  expect(detect(frameWith({ timers: [paused('timer.cuisine', 120)] }), s)).toEqual([{ key: 'minuteur:timer.cuisine', type: 'minuteur', rank: 1 }]);
});
it('timer card: three icon buttons, primary in the middle, late colour under a minute', () => {
  const fr = frame(card, frameWith({ timers: [running('timer.cuisine', 45)] }), s);
  expect(fr.buttons.map((b) => b?.icon)).toEqual(['plus', 'pause', 'stop']);
  expect(fr.buttons[1]!.primary).toBe(true);
  expect(fr.background).toEqual({ kind: 'solid', token: 'timer-late' });
});
it('no timer, no card', () => { expect(detect(frameWith({ timers: [] }), s)).toEqual([]); });
```

- [ ] **Step 2: Lancer** — Run: `cd app && npx vitest run tests/card-timer.test.ts tests/card-recipe.test.ts tests/card-media-stack.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implémenter les trois modules.**
- [ ] **Step 4: Relancer** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(cards): timer, recipe and media cards"`

### Task 6: Les cartes Aspirateur, Voiture, À faire — et la pile dans l'écran d'accueil

**Files:**
- Create: `app/src/cards/vacuum.ts`, `app/src/cards/car.ts`, `app/src/cards/airing.ts`, `app/src/stack/collect.ts`, `app/src/boot/home-stack.ts`
- Modify: `app/src/ecran.ts` (`Voiture` gagne `limite?`, `finCharge?`, `demarrerCharge?`, `arreterCharge?`, `boutonLimite?`, tous des `entity_id`), `contrat/ecran.schema.json` (`$defs` voiture : mêmes propriétés facultatives), `custom_components/home_desk/schema.py` (miroir), `app/src/modes.ts`, `app/src/boot/frame.ts`, `app/src/boot/home.ts`, `app/src/boot/draw.ts`, `app/src/boot/state.ts`, `app/src/rendu/corps.ts`
- Remove: `app/src/rendu/modes.ts` (`rendreMenage`, `rendreAeration` remplacés par les cartes), `rendreMinuteurs` de `rendu/minuteur.ts` s'il n'a plus d'appelant
- Test: `app/tests/card-vacuum.test.ts`, `app/tests/card-car.test.ts`, `app/tests/card-airing.test.ts`, `app/tests/home-stack.test.ts`, `app/tests/modes.test.ts` (table de vérité réduite)

**Interfaces:**
- `vacuum`: `aspirateur:${entité}` ; rang 2 sur `error`, rang 4 sur `cleaning`/`returning` ; milieu = état, batterie, temps restant, pièces choisies au lancement depuis la tablette (`VacuumState`) quand elles sont connues ; boutons base · pause/reprise (primaire) · choisir les pièces (`openVacuumChoice`) ; fond image = `entity_picture` de la caméra du plan quand l'appareil la déclare (lot 2), sinon `neutral`.
- `car`: `voiture:${batterie}` ; rang 4 en charge, rang 2 « à brancher » = débranchée **et** batterie < `limite` (sans `limite` déclarée : jamais « à brancher ») ; milieu = charge et autonomie en gros, heure de fin, limite ; boutons limite · arrêt/démarrage charge (primaire) · clim ; un champ absent = place vide ; fonds `charging` / `plug-in`.
- `airing`: `aeration:${ouvrant}` rang 2 sur la condition actuelle de `CONDITIONS.aeration` ; bouton central « plus tard » (tâche 7 le branche ; jusque-là la place reste vide) ; fond `neutral`, jamais le rouge d'erreur.
- `stack/collect.ts`: `export function collectStack(f: Frame, s: ScreenState): Card[]` — concatène les `detect` des modules de `cards/`, retire les clés masquées (`s.snoozed`, tâche 7), puis `orderStack`.
- `modes.ts`: `ModePrincipal` garde ses neuf valeurs (le contrat les ordonne encore) mais `modePrincipal` ne rend plus que `alerte | voiture | defaut` ; `arrangementEcran(c)` devient `arrangementEcran(c: ContexteModes, stackHead: CardType | null)` → `arrangement(stackHead ? 'carte' : c.blocDefaut === 'voiture' ? 'haut' : 'defaut', …)` ; `ordreCommandes(commandes, c, stackHead)` clé ses remontées par `stackHead` (`cinema` → Ambilight, Lumières ; `media` → Lumières, Chauffage).
- `boot/home-stack.ts`: `export function paintStack(s: ScreenState, f: Frame, cards: Card[]): TemplateResult | undefined` — applique `followStack`, arme **un** `minuteurFn(RETURN_MS)` au dernier toucher (annule le précédent) qui appelle `dessiner`, attache `attachSwipe` après peinture, appelle `afterCardPaint` pour une carte à fond image. `ScreenState` gagne `stack: StackView` et `snoozed: Set<string>`.
- `draw.ts`: `minuteursAffiches` devient « la carte affichée est de type `minuteur` » au lieu de `mode === 'minuteur'`.
- `rendu/corps.ts`: quand `arrangement.rangeeAmbiance` est faux et que `tuileMinuteur` est fourni, la tuile prend la **première place** de la grille de commandes (Review Focus n° 1).

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
// card-car.test.ts
it('unplugged under the limit waits for a gesture', () => {
  expect(detect(car({ branchee: 'off', batterie: 42, limite: 80 }))).toEqual([{ key: 'voiture:sensor.b', type: 'voiture', rank: 2 }]);
});
it('no declared limit: never "plug in"', () => { expect(detect(car({ branchee: 'off', batterie: 10 }))).toEqual([]); });
it('a missing action leaves its slot empty', () => {
  expect(frame(card, car({ enCharge: 'on', sans: ['boutonLimite'] })).buttons[0]).toBeUndefined();
});
// card-vacuum.test.ts
it('stuck is rank 2, cleaning rank 4', () => {
  expect(detect(vac('error'))[0].rank).toBe(2);
  expect(detect(vac('cleaning'))[0].rank).toBe(4);
  expect(detect(vac('docked'))).toEqual([]);
});
// home-stack.test.ts
it('kitchen, music playing: one 264 px card, two controls, timer tile kept', () => {
  const dom = paintKitchen({ sourceJoue: true });
  expect(dom.querySelector('.carte')).not.toBeNull();
  expect(dom.querySelectorAll('.commandes .commande')).toHaveLength(2);
  expect(dom.querySelector('.commandes .tuile-minuteur')).not.toBeNull();   // timer tile survives a dropped Ambiance row
});
it('timer starts during music: the timer card takes the place', () => {
  const s = kitchen({ sourceJoue: true }); dessiner(s); touch(s);
  startTimer(s, 'timer.cuisine'); dessiner(s);
  expect(displayedType(s)).toBe('minuteur');
});
it('controls follow the head card, not the displayed one', () => {
  const s = livingRoom({ ecranAllume: true, aspirateur: 'error' }); dessiner(s);
  swipeTo(s, 'cinema');
  expect(firstControl(s)).toBe(firstControlFor('aspirateur'));
});
it('back to the head after a minute without touch', () => {
  const s = kitchen({ sourceJoue: true, timer: true }); dessiner(s); swipeTo(s, 'media');
  advance(60_000);
  expect(displayedType(s)).toBe('minuteur');
});
it('empty stack: the default block and its budget come back', () => {
  const dom = paintOffice({});
  expect(dom.querySelector('.carte')).toBeNull();
  expect(dom.querySelectorAll('.commandes .commande')).toHaveLength(4);
});
it('alerte stays outside the stack and takes the block, timer included', () => {
  const dom = paintKitchen({ alerte: true, timer: true });
  expect(dom.querySelector('.alerte')).not.toBeNull();
  expect(dom.querySelector('.carte')).toBeNull();
});
```

- [ ] **Step 2: Lancer** — Run: `cd app && npx vitest run tests/card-vacuum.test.ts tests/card-car.test.ts tests/card-airing.test.ts tests/home-stack.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implémenter les cartes, `collect.ts`, `home-stack.ts`, le schéma voiture (`make contrat`), puis le branchement dans `frame.ts`/`home.ts`/`draw.ts`/`corps.ts`.** `home.ts` approche les 500 lignes avec ses commentaires : la pile vit dans `home-stack.ts`, `home.ts` ne fait que l'appeler.
- [ ] **Step 4: Toute la suite** — Run: `make test && make test-app && make test-composant` · Expected: PASS ; les tests de mode existants (`rendu-modes.test.ts`, `modes.test.ts`, `corps-arrangement.test.ts`) sont réécrits sur la pile, pas supprimés sans remplaçant.
- [ ] **Step 5: Commit** — `git commit -m "feat(stack): vacuum, car and airing cards; the home view renders the stack"`

### Task 7: « Plus tard » partagé par toutes les tablettes

**Files:**
- Create: `custom_components/home_desk/plus_tard.py`, `app/src/stack/snooze.ts`
- Modify: `custom_components/home_desk/websocket.py`, `custom_components/home_desk/const.py` (`WS_PLUS_TARD = "home_desk/plus_tard"`, `WS_PLUS_TARD_ABONNER = "home_desk/plus_tard/abonner"`, `SNOOZE_S = 7200`), `custom_components/home_desk/__init__.py` (chargement du `Store` au setup), `app/src/boot/wiring.ts`, `app/src/cards/airing.ts` (son bouton central)
- Test: `tests/composant/test_plus_tard.py`, `app/tests/stack-snooze.test.ts`

**Interfaces:**
- Décision du plan : l'état vit dans un `homeassistant.helpers.storage.Store` (`home_desk.plus_tard`), pas dans une sous-entrée — ce n'est pas une porte d'écriture de configuration, donc l'invariant de `garde_ecran.py` reste intact, et un « plus tard » ne recharge pas l'entrée. C'est un écart de lettre avec la spec (« écrite par `garde_ecran.py` »), signalé au propriétaire.
- Produces (Py): `class Snoozes` (`async_load()`, `snooze(key: str, now: datetime) -> None`, `active(now) -> dict[str, str]` clé → fin ISO 8601, expire les périmées) ; `ws_plus_tard` `{type, cle}` ; `ws_plus_tard_abonner` envoie `active()` à l'abonnement puis à chaque changement et à chaque échéance (`async_track_point_in_utc_time`).
- Produces (TS): `export function snoozeCard(cx, key: string): Promise<void>` et `export function subscribeSnoozes(cx, onChange: (keys: Set<string>) => void): Promise<() => void>` ; `wiring.ts` met `s.snoozed` à jour et appelle `dessiner`.
- Produces (cartes) : `export function laterButton(s: ScreenState, key: string): CardButton` (icône `snooze` de `rendu/icones.ts`, ajoutée si absente), dans `cards/strings.ts` pour son `label`.

- [ ] **Step 1: Écrire les tests qui échouent**

```python
async def test_snooze_hides_for_two_hours(hass, ws_client, freezer): ...
    # set → subscriber receives {"aspirateur:vacuum.x": <now+7200 s>}; at now+7199 still there; at now+7200 gone
async def test_broadcasts_to_every_subscriber(hass, hass_ws_client): ...
    # two clients subscribed, one snoozes, both receive the new set
async def test_snooze_survives_reload(hass, ...): ...
    # snooze, unload + reload the entry, subscriber still receives the key
def test_no_write_gate_outside_garde_ecran(): ...
    # the existing AST test still passes with plus_tard.py present (run test_garde_ecran.py)
```

```ts
it('a snoozed key leaves the stack', () => {
  expect(collectStack(frameWith({ vacuum: 'error' }), { ...s, snoozed: new Set(['aspirateur:vacuum.x']) })).toEqual([]);
});
```

- [ ] **Step 2: Lancer** — Run: `make test-composant` et `cd app && npx vitest run tests/stack-snooze.test.ts` · Expected: FAIL.
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Relancer** — Expected: PASS (dont `test_garde_ecran.py`).
- [ ] **Step 5: Commit** — `git commit -m "feat(stack): snooze a card on every tablet for two hours"`

### Task 8: Contrôle de rendu de la pile, documentation, fin du lot 1

**Files:**
- Create: `app/outils/verifier-pile.mjs` (sur le patron de `verifier-carte-media.mjs` : bundle esbuild de `src/`, feuilles de `src/index.ts`, viewport 343 × 585, police de repli DejaVu Sans)
- Create: `docs/claude/pile-de-cartes.md` ; Modify: `CLAUDE.md` (une entrée d'index, remplace celle de l'échelle `modesABlocMedia`), `docs/claude/maison-et-budget-media.md` (renvoi)
- Modify: `dist/` (rebuild)

- [ ] **Step 1: Écrire le contrôle** — pour chaque carte du lot (fixtures d'`état` sans entité réelle) × trois écritures (latin, CJK, arabe, avec titre et nom de pièce trop longs) : boîte de `.carte` = 311 × 264 à ±0,5 px, `.titre` ≤ 2 lignes, aucun débordement de `.corps` au-delà de 585 px, contraste mesuré au pire pixel ≥ 5:1 (texte) et ≥ 4,5:1 (icônes) ; sortie non nulle à la première faute, et une contre-épreuve (carte de 300 px forcée) qui DOIT échouer.
- [ ] **Step 2: Lancer** — Run: `cd app && node outils/verifier-pile.mjs && node outils/verifier-pile.mjs --contre-epreuve; echo $?` · Expected: première passe `0 faute`, contre-épreuve code ≠ 0.
- [ ] **Step 3: Documenter, reconstruire** — Run: `cd app && npm run build && cd .. && make test && make test-app && make test-composant` · Expected: PASS, `dist/` à jour (`test_dist_a_jour`).
- [ ] **Step 4: Commit** — `git commit -m "chore(stack): render check, docs and dist for the first batch"`

---

# Lot 2 — les appareils de la maison et l'imprimante 3D

### Task 9: La sous-entrée maison gagne `appareils` (version 2)

**Files:**
- Modify: `contrat/maison.schema.json` (`version: 2`, `appareils` requis), `contrat/cas-maison.json`, `custom_components/home_desk/schema.py` (`VERSION_MAISON` lu du contrat, `validate_house`), `custom_components/home_desk/migration.py` (`migrate_house_data`), `custom_components/home_desk/__init__.py` (migration au chargement via `garde_ecran.migrate_subentry`, déjà générique), `custom_components/home_desk/maison.py` (la reconfiguration des sources **conserve** `appareils`), `custom_components/home_desk/yaml_ecrans.py` (export/import de `maison.appareils`), `custom_components/home_desk/websocket.py` (`ws_maison` rend `{"sources", "appareils"}`), `app/src/configuration.ts`, `app/src/boot/state.ts` (`s.house` porte `appareils`)
- Test: `tests/composant/test_schema_maison.py`, `tests/composant/test_migration_maison.py`, `tests/composant/test_yaml_ecrans.py`, `tests/composant/test_maison.py`, `app/tests/cas-maison.test.ts`, `app/tests/configuration.test.ts`

**Interfaces:**
- Contrat : `appareils: [{ type, piece, entites, seuil? }]`, `type ∈ {imprimante, aspirateur, voiture, animaux, plantes, tapis, air, alarme, encre}`, `piece` = un nom de pièce ou `"maison"`, `entites` = objet de rôles → `entity_id`, rôles requis et facultatifs par type (`if/then` par `type`) :

  | type | requis | facultatifs |
  |---|---|---|
  | imprimante | `etat`, `progression` | `finTache`, `couche`, `couchesTotal`, `tache`, `couverture`, `camera`, `pause`, `reprise`, `arret`, `erreur`, `ams` (liste de 4 au plus) |
  | aspirateur | `aspirateur` | `plan`, `erreur` |
  | voiture | `batterie`, `branchee` | `enCharge`, `autonomie`, `limite`, `finCharge`, `demarrerCharge`, `arreterCharge` |
  | animaux | au moins un de `fontaineVide`, `filtre`, `panneFontaine`, `panneDistributeur` | `joursFiltre`, `nourrir` |
  | plantes | `sondes` (liste) | `habitude` |
  | tapis | `vitesse` | `pas`, `distance`, `reglageVitesse`, `arret` |
  | air | `pm25`, `purificateur` | — (`seuil` requis) |
  | alarme | `zones` (liste) | — |
  | encre | `niveaux` (liste) | — (`seuil` requis) |

- `migrate_house_data(data) -> dict | None` : v1 → `{**data, "version": 2, "appareils": []}`, sinon `None`.
- TS : `export type ApplianceType = 'imprimante' | 'aspirateur' | 'voiture' | 'animaux' | 'plantes' | 'tapis' | 'air' | 'alarme' | 'encre';` et `export type Appareil = { type: ApplianceType; piece: string; entites: Record<string, string | string[]>; seuil?: number }` dans `configuration.ts`.
- Décision du plan : pas de formulaire HA pour `appareils` dans ce plan ; ils s'écrivent par le YAML (`home_desk.exporter` / `home_desk.importer`), comme la maison de la tâche 12 de la carte média. Le formulaire de la maison les conserve sans les montrer. Signalé au propriétaire.

- [ ] **Step 1: Écrire les tests qui échouent** — corpus `cas-maison.json` : un cas valide par type, un cas refusé par rôle requis manquant, un `type` inconnu refusé, `piece: "maison"` accepté ; Python : `test_v1_house_migrates_to_v2_with_no_appliances`, `test_reconfiguring_sources_keeps_appliances`, `test_yaml_round_trip_keeps_appliances`, `test_ws_maison_returns_appliances`.
- [ ] **Step 2: Lancer** — Run: `make contrat && make test-composant && make test-app` · Expected: FAIL.
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Relancer** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(house): appliances in the house subentry, schema version 2"`

### Task 10: Les appareils dans la pile — où chaque carte apparaît

**Files:**
- Create: `app/src/stack/appliances.ts`
- Modify: `app/src/cards/vacuum.ts`, `app/src/cards/car.ts` (lisent aussi les appareils), `app/src/stack/collect.ts`
- Test: `app/tests/stack-appliances.test.ts`

**Interfaces:**
- Produces: `export function appliancesFor(house: Appareil[], room: string, rank: (a: Appareil) => Rank | null): Appareil[]` — un appareil de la pièce de l'écran est toujours candidat ; un appareil en `"maison"` ne l'est que lorsque sa carte est au **rang 2** (« attend un geste »).
- Une même entité déclarée par l'écran (`piece.aspirateur`, `piece.voiture`) et par un appareil donne **une** carte (clé identique, dédoublonnée dans `collectStack`).

- [ ] **Step 1: Tests** — « house vacuum stuck shows on every room » ; « house vacuum cleaning shows only in its room » ; « same vacuum from screen and house is one card » ; « no appliance, no card, no error ».
- [ ] **Step 2: Lancer** — Expected: FAIL. **Step 3: Implémenter.** **Step 4: Relancer** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(stack): house appliances, alerts shown on every tablet"`

### Task 11: La carte Imprimante 3D

**Files:**
- Create: `app/src/cards/printer.ts`
- Modify: `app/outils/verifier-pile.mjs` (fixtures imprimante), `app/src/cards/strings.ts`
- Test: `app/tests/card-printer.test.ts`

**Interfaces:**
- `printer`: `imprimante:${etat}` ; rang 2 quand terminée et non retirée, en erreur, ou filament manquant ; rang 4 en cours ou en pause ; aucune carte au repos. Les valeurs d'état Bambu Lab qui décident de chaque cas sont relues dans la doc actuelle de l'intégration `bambu_lab` (ha-bambulab) avant d'écrire la table — jamais devinées.
- Milieu : pourcentage en gros, heure de fin (`finTache`, au format de l'heure locale via `Intl.DateTimeFormat`), couche `n / total`, les bobines de l'AMS (pastilles de leur couleur, celle qui imprime plus grosse).
- Boutons : caméra (ouvre l'image `camera` en plein bloc tant qu'on la touche) · pause/reprise (primaire) · arrêt ; un rôle absent = place vide.
- Fond : image `couverture` (`entity_picture`), teintes par `afterCardPaint` ; sans image, `neutral`.

- [ ] **Step 1: Tests** — `detect` pour chaque état (cours, pause, fini, erreur, repos) avec le rang attendu ; « AMS: the active spool is larger » ; « no stop role, no stop button » ; « a CJK job title keeps dir=auto ».
- [ ] **Step 2: Lancer** — Expected: FAIL. **Step 3: Implémenter.** **Step 4: Relancer, et `node outils/verifier-pile.mjs`** — Expected: PASS, 0 faute.
- [ ] **Step 5: Rebuild et commit** — `cd app && npm run build` puis `git commit -m "feat(cards): 3D printer card"`

---

# Lot 3 — les autres cartes

Chaque tâche suit le même cycle que la tâche 11 : `detect` (rang par cas), `frame` (milieu, trois places, fond), tests, `verifier-pile.mjs` étendu, commit. Les seuils sont ceux de la spec, « Laissé au constructeur » : `soil_warning` de la sonde quand il existe, sinon `seuil` de l'appareil ; PM2,5 et encre par `seuil`.

### Task 12: Animaux et Plantes

**Files:** Create `app/src/cards/pets.ts`, `app/src/cards/plants.ts` · Test `app/tests/card-pets.test.ts`, `app/tests/card-plants.test.ts`

- `pets`: rang 2 ; une ligne par problème actif (fontaine vide, filtre à changer avec `joursFiltre`, panne fontaine, panne distributeur) ; boutons nourrir (`number.set_value` sur `nourrir`, valeur `min` de l'entité) · c'est fait · plus tard. « C'est fait » sans action HA réelle (le cas de la fontaine) **vaut** « plus tard » (spec). Fond texture unie `calm`.
- `plants`: rang 5 ; une jauge par sonde sous son seuil ; boutons plus tard · arrosée (primaire, `input_boolean.turn_on` sur `habitude`, sinon plus tard) · détails (vue existante des plantes si l'écran en déclare une, sinon place vide).
- Tests : « fountain fixed by hand: done means later » ; « watered calls the habit then hides » ; « a probe without soil_warning uses seuil ».
- [ ] Tests qui échouent → FAIL → implémenter → PASS → `git commit -m "feat(cards): pets and plants cards"`

### Task 13: Tapis, Air et Encre

**Files:** Create `app/src/cards/treadmill.ts`, `app/src/cards/air.ts`, `app/src/cards/ink.ts` · Test `app/tests/card-treadmill.test.ts`, `app/tests/card-air.test.ts`, `app/tests/card-ink.test.ts`

- `treadmill`: rang 4 quand `vitesse` > 0 ; milieu vitesse, pas, distance, durée ; boutons ralentir · arrêt (si `arret`) · accélérer (`number.set_value` ± l'attribut `step` de `reglageVitesse`, bornés par `min`/`max`).
- `air`: rang 5 quand `pm25` > `seuil` ; boutons plus tard · marche/arrêt (`fan.toggle`) · mode favori (`fan.set_preset_mode` si `preset_modes` le contient, sinon vide) ; fonds `air-good` / `air-bad`.
- `ink`: rang 5 quand un niveau < `seuil` ; une barre par couleur (nom de l'entité, `dir="auto"`) ; seul le bouton central, plus tard.
- Tests : « speed step comes from the entity » ; « no favourite preset, empty slot » ; « ink below threshold only ».
- [ ] Tests qui échouent → FAIL → implémenter → PASS → `git commit -m "feat(cards): treadmill, air and ink cards"`

### Task 14: Repas, Garde-manger et Alarme

**Files:** Create `app/src/cards/meal.ts`, `app/src/cards/pantry.ts`, `app/src/cards/alarm.ts` · Test `app/tests/card-meal.test.ts`, `app/tests/card-pantry.test.ts`, `app/tests/card-alarm.test.ts`

- `meal`: rang 5 dans l'heure qui précède le repas planifié (`currentMeal(s)`, déjà sur l'écran) ; boutons courses · ouvrir la recette (primaire, si recette) · valider (`script.turn_on` du script déclaré par l'écran) ; fond photo si le repas en a une, sinon `neutral`.
- `pantry`: rang 5 quand les capteurs d'expirations ou de manques de l'écran sont à `on` ; les trois premiers produits ; boutons plus tard · ouvrir `#garde-manger` (primaire) · courses.
- `alarm`: rang 5 dès qu'une zone est armée ; bouton central désarmer **seulement** si l'attribut `code_format` de la zone est nul — une saisie de code n'a pas sa place dans trois boutons ronds ; avec un code, la place reste vide et la carte le dit dans son milieu. Écart à signaler au propriétaire.
- Tests : « meal card only within the hour » ; « pantry lists three products » ; « coded alarm has no disarm button ».
- [ ] Tests qui échouent → FAIL → implémenter → PASS → `git commit -m "feat(cards): meal, pantry and alarm cards"`

### Task 15: Fin du plan

- [ ] **Step 1:** `node app/outils/verifier-pile.mjs` couvre les seize types — Expected: 0 faute, contre-épreuve en échec.
- [ ] **Step 2:** Mettre à jour `docs/claude/pile-de-cartes.md` (types, rangs, rôles d'appareils, « plus tard »), l'index de `CLAUDE.md`, et rédiger le bloc YAML `maison.appareils` d'exemple (sans entité réelle) dans `docs/claude/`.
- [ ] **Step 3:** `cd app && npm run build && cd .. && make test && make test-app && make test-composant` — Expected: PASS.
- [ ] **Step 4:** `git commit -m "docs(stack): card stack reference and appliance example"`
