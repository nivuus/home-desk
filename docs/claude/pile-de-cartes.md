# Pile de cartes (lot 1)

Spec : `docs/superpowers/specs/2026-10-24-pile-de-cartes-design.md`. Ce fichier dit
où vit chaque règle dans le code, pas pourquoi elle a été choisie.

## Le modèle

- **Rangs** (`app/src/stack/types.ts`, attribués par le `detect` de chaque carte) :
  0 recette ouverte · 1 minuteur · 2 attend un geste (aspirateur bloqué ou en pause,
  voiture à brancher, aération, impression terminée, échouée ou en erreur) · 3
  musique/film (`media`, `cinema`) · 4 tourne tout seul (aspirateur qui passe, charge,
  impression en cours ou en pause) · 5 rappels doux (lot 3).
- **Ordre dans un rang** (`stack/order.ts`) : la position du mode de la carte
  (`MODE_OF`) dans `agencement.modes` ; un type absent finit son rang ; tri stable.
- **Collecte** (`stack/collect.ts`) : chaque module de `app/src/cards/` détecte ses
  cartes, les clés « plus tard » sont retirées, puis `orderStack`. `alerte` reste hors
  pile et prend le bloc, minuteur compris (`boot/home.ts`).
- **Carte affichée** (`stack/follow.ts`, pur) : une carte plus prioritaire ne prend la
  place qu'à son **apparition** ; une carte déjà là attend. Après `RETURN_MS` =
  60 000 ms sans toucher, retour à la tête (`boot/home-stack.ts`, jeton
  `jetonRetourPile`).
- **La grille de commandes suit la carte de tête**, jamais la carte affichée
  (`stackHead` dans `boot/home.ts`) : glisser ne réordonne jamais les commandes.
- Pile vide : le bloc par défaut de l'écran revient (`agencement.blocDefaut`).

## Budget par genre de bloc

`app/src/screen-budget.ts` (jumeau `custom_components/home_desk/budget.py`, corpus
`contrat/cas-budget.json`) reçoit un genre de bloc, jamais un mode :

| Genre | Hauteur | Quand |
|---|---|---|
| `carte` | 264 px (`blocCarte`) | la pile n'est pas vide ; seul genre qui descend l'échelle (synthèse réduite, puis sans rangée Ambiance) |
| `haut` | 153 px | pile vide, bloc voiture |
| `defaut` | 84 px | pile vide, repas ou agenda |

Un bloc empilé fait exactement 264 px : les points sont **dans** la carte.

## Le cadre de carte

`app/src/rendu/card-frame.ts` + `app/src/styles/cards.css`. 311 × 264, rayon 28 ;
en-tête : étiquette (11 px, majuscules, une ligne), titre (15 px, deux lignes
max), sous-titre facultatif ; zone milieu à la carte ; trois places de boutons
ronds de 62 px, icône seule, le central primaire. Une place sans action réelle
reste vide (`.vide`) ; un bouton `inert` garde sa place sans rien lier.

- Fonds : `image` (l'image du sujet, intacte, couleurs tirées par
  `poster-sampler.ts`, plaque opaque seulement où le texte n'atteint pas 5:1),
  `solid` (un jeton), `theme`. Jamais de dégradé, jamais de voile.
- Les 7 jetons unis (`SOLID_TOKENS`) : `neutral`, `timer`, `timer-late`,
  `charging`, `plug-in`, `air-bad`, `calm` ; chacun a six rôles
  `--carte-<jeton>-{fond,texte,icone,disque,primaire,sur-primaire}`.
- Points de la pile (`rendu/stack.ts`) : une pastille pleine au bout de la
  rangée d'étiquette, seulement s'il y a plus d'une carte.
- Textes venus de HA : `dir="auto"`, hauteurs de ligne explicites, ellipse.
- **Langue** : les chaînes des cartes (`app/src/cards/strings.ts`) sont en
  français seulement, comme le reste de l'interface ; il manque une table de
  chaînes indexée par locale. Nombres, durées et heures passent déjà par `Intl`.

## Glissement et appui (`app/src/stack/swipe.ts`)

- `attachSwipe` sur `.pile`, jamais sur `.carte` (lit réécrit son `style`).
  Le seuil est `SEUIL_PX` de `geste.ts` ; geste vertical laissé à la page (`pan-y`).
- **Un contact par carte** : un second `pointerdown` (le fantôme de la WebView,
  ou un second doigt) est arrêté en phase de capture pendant un geste.
- `cardPress` : retour `.appuye` au contact, **action au relâcher** si le doigt a
  bougé de moins de `SEUIL_PX` ; un glissement parti d'un bouton (pas de volume
  compris) ne le déclenche pas. Option `hold` : répétition tenue
  (`hold-repeat.ts`). L'état d'appui vit par élément (`WeakMap`) et survit à un
  rendu.

## « Plus tard »

Masque une carte **2 h sur toutes les tablettes**. L'état vit dans l'intégration :
`custom_components/home_desk/plus_tard.py`, un `Store`
(`.storage/home_desk.plus_tard`), à l'échelle de la maison, jamais une écriture
de configuration (ne passe pas par `garde_ecran.py`). Commandes websocket
`home_desk/plus_tard` et `home_desk/plus_tard/abonner`. La tablette
(`stack/snooze.ts`) suit l'ensemble poussé et fait aussi expirer chaque clé à son
échéance sur **sa propre horloge**. Bouton : `laterButton` (`cards/actions.ts`),
sur la carte aération.

## Voiture : champs du formulaire

`CHAMPS_VOITURE` (sept obligatoires) et `CHAMPS_VOITURE_OPTIONNELS`
(`custom_components/home_desk/objets.py`) : `limite` (`number`/`input_number`),
`finCharge` (`sensor` horodatage), `demarrerCharge`, `arreterCharge`,
`boutonLimite` (`button` seulement, pressés par `button.press`). Tout champ du
contrat doit être dans le formulaire, sinon l'enregistrer l'efface. Sans `limite`,
jamais « à brancher ».

## Imprimante 3D (`app/src/cards/printer.ts`)

Appareil de la maison seulement (aucune source d'écran). Table des états tirée de
ha-bambulab (sources citées en tête du module) : `print_status` `running`/`prepare`/
`slicing`/`pause` → rang 4, `finish`/`failed` → rang 2 jusqu'au travail suivant (rien
ne dit « plateau retiré »), `print_error` à `on` pendant un travail → rang 2 (filament
épuisé compris) ; `idle`, `init`, `offline`, illisible → aucune carte. Boutons
`pause`/`reprise`/`arret` : `button.*` seulement (`$defs/entiteBouton` du contrat
maison), vides quand l'intégration les rend `unavailable`. Caméra : tenue, elle
couvre la carte (`CardFrame.overlay`, `cards/printer-camera.ts`, `hold.fire` de
`cardPress`) ; un glissement la masque au seuil (`onEnd` au désarmement) ; au plus
5 s (`DELAI_SECOURS_MS`). Bobines AMS : `cards/printer-spools.ts`, `styles/printer.css`.

## Ajouter un type de carte

1. `CardType` (`stack/types.ts`) ; son mode dans `MODE_OF` (`stack/order.ts`) s'il en a un.
2. `app/src/cards/<carte>.ts` : `detect(f, s)` (clé stable `${type}:${entité}`,
   rang) et `frame(card, f, s)` → `CardFrame` ; chaînes dans `cards/strings.ts`.
3. L'enregistrer dans `MODULES` (`stack/collect.ts`).
4. Tests vitest sur fixtures (`app/tests/card-aides.ts`), jamais d'entité réelle.
5. L'ajouter au contrôle de rendu : la fixture de `app/outils/pile-fixture.js`
   (l'imprimante : `pile-fixture-printer.js`) et la liste `BATCH` de `verifier-pile.mjs`.

## Lancer les contrôles

```bash
cd app && node outils/verifier-pile.mjs          # 0 faute attendue, sortie 0
node outils/verifier-pile.mjs --contre-epreuve   # carte de 300 px : DOIT échouer
# autres contre-épreuves : =points, =contraste, =sans-points, =points-dehors,
# =carte-seule, =trois-lignes, =bobines, =bobine-active ;
# mutants de swipe.ts : --mutant=lock|threshold|contact|hold-end — chacun DOIT échouer
```

Hors Home Assistant : `src/` empaqueté par esbuild, Chromium réel 343 × 585,
police de repli du système. Mesures partagées avec la carte média :
`outils/card-check.mjs`. Les gestes sont de vrais points tactiles (CDP). La règle des
points lit le nombre de cartes que la pile déclare (`data-cards` sur `.pile`,
`renderStack`) : plusieurs cartes exigent un point chacune, une seule les interdit — sur
les pages réelles de `verifier-rendu.mjs` comme ici.

**À lancer par le propriétaire, sur le HA réel** : `verifier-rendu.mjs` et
`mesurer-hauteurs.mjs` (mis à jour à la tâche 6, seulement vérifiés en syntaxe :
ils exigent la page servie par HA et son jeton).
