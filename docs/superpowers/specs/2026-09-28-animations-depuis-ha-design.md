# Animations des tablettes lancées depuis Home Assistant

*Spec de conception — 2026-09-28*

## Le besoin

> « Il faudrait que les écrans d'animation des tablettes soient supprimés du
> repo et qu'on puisse les configurer depuis HA. […] Soit des vidéos, soit des
> Lotties, soit des GIFs. »

## Ce qui existe

Les seules animations de l'app sont les trois scènes DeLorean du salon, écrites
en dur dans `app/src/rendu/delorean.ts` :

| Scène | Déclenchement (horloge de la tablette) | Contenu |
|---|---|---|
| `foudre` | chaque jour à 22 h 04 | `eclair.webp` + voile, flash, coupe CSS |
| `voyage` | chaque jour à 01 h 21 | `firepath_384.webm` + compteur MPH calculé en code |
| `saut` | 21 octobre et 5 novembre | `flux_264.webm` + cadrans du tableau de bord en code |

Elles dépendent de fichiers dans `app/assets/`, de la variante `delorean` de
`modes.ts`, du modulateur `delorean` de l'agencement, du champ `Ecran.delorean`,
de son contrat (`ecran.schema.json`) et d'une case à cocher du formulaire HA.
Les quatre automations HA qui pilotent la maquette (`automations.yaml`,
« Éclairage - DeLorean … ») tournent en parallèle, sans lien avec l'écran.

## Les arbitrages du propriétaire (2026-09-28)

| Question | Choix |
|---|---|
| Déclenchement | **Une automation HA** appelle un service ; plus aucune horloge dans l'app |
| Stockage des fichiers | **Médias de HA** (Media Source, `/media`), téléversés depuis l'interface |
| Code propre à DeLorean (compteur, cadrans) | **Supprimé** ; tout est dans le fichier média |
| Description de l'animation | **Tout dans l'appel** du service ; pas de bibliothèque nommée |
| Acheminement | Le service **résout** le média côté serveur, une commande d'**abonnement** websocket le pousse à la tablette |
| Lecteur Lottie | **`@lottiefiles/dotlottie-web`** (v0.80, août 2026 ; `.json` et `.lottie`) |
| Scènes actuelles | **Filmées** telles qu'elles se rendent aujourd'hui, déposées dans les médias |
| Automations | Les quatre automations DeLorean appellent le nouveau service |

Approches écartées : une entité `event.*` par écran (sa valeur est rejouée à
chaque reconnexion : une vieille animation pourrait repartir) ; la résolution
du média par la tablette (une erreur ne se verrait que sur le mur, jamais dans
la trace de l'automation) ; `lottie-web` (dernière publication en mai 2025, ne
lit pas `.lottie`).

## Conception

### 1. Le service `home_desk.jouer_animation`

```yaml
action: home_desk.jouer_animation
data:
  ecrans: [salon]            # obligatoire, un ou plusieurs noms d'écran
  media:                     # obligatoire, sélecteur `media` de HA
    media_content_id: media-source://media_source/local/animations/foudre.webm
    media_content_type: video/webm
  duree: 4                   # secondes, facultatif
  fond: noir                 # noir (défaut) | transparent
```

- Le média est résolu par `media_source.async_resolve_media` : URL signée et
  type MIME. Le type décide du lecteur : `video/*`, `image/*`, ou Lottie
  (`application/json`, ou extension `.json`/`.lottie` quand le MIME est
  générique — `.lottie` est un zip).
- **Durée** : sans `duree`, une vidéo ou un Lottie joue une fois jusqu'à sa fin ;
  une image animée n'a pas de fin détectable, `duree` y est **obligatoire**.
  Plafond : 120 s dans tous les cas.
- **Refus** (`ServiceValidationError`, message en français, visible dans la
  trace) : écran inconnu, média introuvable ou non résolu, type non lisible,
  image sans durée, durée hors ]0, 120].
- Service **non administrateur**, comme les autres services de home-desk : il ne
  fait qu'afficher.
- Décrit dans `services.yaml` et les traductions (`fr`, `en`).

### 2. L'acheminement

- Commande websocket `home_desk/animations {nom}` : abonnement, calqué sur
  `home_desk/abonner` (un non-administrateur ne peut pas `subscribe_events` sur
  un événement hors de la liste de HA). L'abonnement vit dans
  `connection.subscriptions`, le `unsubscribe_events` générique le retire.
- Le service émet un signal interne (dispatcher HA, pas le bus d'événements)
  par écran visé ; chaque abonnement filtre sur son nom et envoie
  `{url, type, duree, fond}` (`duree` en ms, `null` = fin naturelle).
- **Hors ligne** : l'animation est perdue, jamais mise en file.
- La tablette s'abonne au démarrage et à chaque reconnexion, par le même
  mécanisme que `rechargement.ts` (`cx.abonner`).

### 3. La tablette

- `app/src/animation.ts` — logique pure : état courant, remplacement (une
  animation reçue remplace celle en cours), conditions de fin. Fin au premier
  de : fin naturelle (`ended` vidéo, `complete` Lottie), `duree` écoulée,
  plafond 120 s, **premier contact** (on ne tape jamais à l'aveugle, comme
  aujourd'hui), échec de chargement (`error`) → fermeture immédiate et
  `console.error`. Jamais un écran noir sans fin.
- `app/src/rendu/animation.ts` — le calque : au-dessus de tout,
  `pointer-events: none`, voile noir ou transparent, `<video muted autoplay
  playsinline>`, `<img>`, ou `<canvas>` Lottie. Toujours muet (lecture
  automatique avec son refusée par le navigateur).
- `app/src/lottie.ts` — charge `dotlottie-web` **à la demande**. Le bundle de
  l'app est un IIFE unique : un `import()` y serait inliné (165 Ko de plus
  téléchargés par les trois tablettes à chaque version). Le lecteur est donc un
  **second bundle IIFE**, `dist/dotlottie.js`, injecté par une balise
  `<script>` au premier Lottie. Le WASM (1,2 Mo) est copié dans
  `dist/assets/` par le build et désigné par `setWasmUrl` : jamais de CDN, la
  tablette marche sans internet.
- L'écran de nuit n'est pas une exception : l'automation décide de l'heure.

### 4. Ce qui disparaît

- `app/src/rendu/delorean.ts`, `app/tests/delorean.test.ts`, le CSS
  `.delorean*` de `base.css`, la variante et le modulateur `delorean`
  (`modes.ts`, `agencement.ts`, `boot/*`, `mouvement/fantomes.ts`), le champ
  `Ecran.delorean` (`ecran.ts`).
- `app/assets/eclair.webp`, `firepath_384.webm`, `flux_264.webm` et leurs
  copies dans `dist/assets/`.
- Côté composant : `delorean` du contrat `ecran.schema.json` (propriété et
  valeur de `modulateurs`), du formulaire (`config_flow.py`, `schema.py`,
  `objets.py`, `validateurs.py`, `fautes.py`) et des traductions.
- **Configuration enregistrée** : `VERSION_CONFIG` passe à 2 ; une migration au
  chargement réécrit les sous-entrées en version 1 (retire `delorean` et la
  valeur `delorean` de `agencement.modulateurs`), sans rien toucher d'autre.
  L'importeur n'accepte que la version courante ; le fichier
  `home_desk_ecrans.yaml` de production est corrigé à la main pendant la mise
  en production (commentaires conservés), puis réexporté pour vérifier le
  point fixe.

### 5. Refaire les scènes et brancher les automations

- **Avant la suppression**, les scènes actuelles sont filmées depuis la version
  en production : rendu headless 600 × 1024 (Playwright), capture image par
  image, encodage WebM (ffmpeg). Quatre fichiers : `foudre.webm`,
  `voyage.webm`, `saut-octobre.webm`, `saut-novembre.webm`, déposés dans
  `/opt/nivuus/home-manager/media/animations/` (le `/media` de HA).
- Les quatre automations « Éclairage - DeLorean foudre 22h04 / voyage 01h21 /
  5 novembre / 21 octobre » reçoivent une action `home_desk.jouer_animation`
  (`ecrans: [salon]`, `fond: noir`) en parallèle de la maquette. Édition
  textuelle de `automations.yaml` (commentaires et descriptions conservés, la
  description dit qui a changé quoi), puis `automation.reload`.

## Tests

Décors à deux sujets ; chaque test prouvé capable d'échouer.

- **Composant** : service → l'abonné `salon` reçoit `{url, type, duree, fond}`,
  l'abonné `cuisine` rien ; appel par un utilisateur **non administrateur** ;
  chaque refus un par un (écran inconnu, média introuvable, type non lisible,
  image sans durée, durée hors borne) sans rien envoyer ; désabonnement ;
  migration v1 → v2 (le salon perd `delorean`, la cuisine est intacte) ;
  l'importeur refuse un fichier contenant encore `delorean`.
- **App, logique** : choix du lecteur par type ; chaque condition de fin ;
  remplacement ; plafond ; échec de chargement = fermeture.
- **App, geste** : premier contact ferme l'animation et n'actionne rien
  dessous ; réabonnement après reconnexion ; Lottie chargé seulement au
  premier Lottie (espion sur l'import).
- **Contrat** : `delorean` refusé de bout en bout ; épreuves de fidélité et
  écrans de référence verts ; plus aucune occurrence de `delorean` dans `app/`
  et `custom_components/` hors migration et tests de migration.

## Livraison

Un agent implémente (spec → plan), ouvre la PR, fusionne une fois la CI verte,
attend la release. **La mise en production se fait avec le propriétaire**, dans
cet ordre : filmer les scènes (sur la version actuelle), déposer les médias,
poser home-desk, redémarrer HA, corriger `home_desk_ecrans.yaml` et importer,
modifier les automations, déclencher chaque scène à la main sur le salon et
vérifier par capture d'écran.
