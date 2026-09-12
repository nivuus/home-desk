# home-desk — notes d'implémentation

## Chemins critiques

- Le hook dépose dans `/opt/nivuus/home-manager/config`, **créé par le socle**.
  Il refuse si ce répertoire est absent plutôt que de créer un orphelin.
- `config/www/` et `config/packages/` sont **partagés**. Douze occupants mesurés
  dans le premier au 2026-09-05, le fragment d'intents de `home-stock` dans le
  second. Le hook ne remplace jamais ces répertoires — seulement
  `www/wallpanel/`, et il **copie** le fichier `packages/home_desk.yaml`.

## Décisions à ne pas défaire

- **`dist/` est versionné.** Le contrat livre par `git archive HEAD` ; un build
  à l'installation aurait exigé `apt: [nodejs, npm]` et 115 Mo de
  `node_modules` sur la cible. `dist/` contient aussi ses `assets/`, dupliqués
  depuis `app/assets/` — 411 Ko payés une fois pour que le dépôt se fasse en
  **un seul `replace_tree()` atomique**. `www/wallpanel/` est relu par trois
  clients qui rechargent tout seuls : deux gestes de dépôt y ouvriraient une
  fenêtre.
- **Le hook n'écrit jamais dans `configuration.yaml`**, il signale deux lignes.
  Règle posée par le `PRESERVED` de `home-manager` et reprise par `home-stock`.
- **Pas de hook `activate`.** Le tri topologique ordonne les `install`, **pas**
  les unités `nivuus-package-activate@*` — elles vivent toutes dans
  `multi-user.target.wants` sans ordre garanti entre elles. Un `activate` serait
  au mieux inutile, au pire une course.
- **`home-stock` n'est pas dans `requires.packages`** : dépendance de bus, pas
  d'installation. Le silence que cela produisait est corrigé dans l'application
  par `absenceNommee` (`app/src/ecran.ts`), pas par une ligne de manifeste.
- **Les `id:` des sept automations de `packages/home_desk.yaml` sont ceux de
  production.** Ils fixent l'`entity_id` des entités `automation.*` dans le
  registre ; les changer perdrait l'historique et les traces.
- **`app/src/ecran.ts` est la seule couture vers cette maison.** N'ajoutez
  jamais d'`entity_id` en dur ailleurs : c'est ce qui garde la
  paramétrisation bon marché le jour où elle deviendra utile.
- **`custom_components/vignette/manifest.json` pointe vers ce dépôt.** Il
  annonçait `github.com/nivuus/vignette`, qui rend 404 (mesuré le 2026-09-05).
  Le composant n'a pas de dépôt propre : cette copie **est** l'original.

## `absenceNommee` — les cinq points de passage

Le champ est déclaré sur `Bouton` et sur `EntreeSynthese` (`app/src/ecran.ts`).
Une commande qui le porte n'est jamais filtrée quand son entité est muette :
elle reste, inerte, et affiche son libellé. Cinq endroits le respectent, et
**tous les cinq sont nécessaires** — le plan n'en nommait que trois :

| Fichier | Ce qu'il fait |
|---|---|
| `rendu/corps.ts:356` | le filtre des commandes de la pièce |
| `rendu/corps.ts:357` | le **second** filtre (`recetteOuvrable`), qui reprenait ce que le premier venait de laisser passer |
| `rendu/corps.ts:105` | `ligneSynthese`, qui **sautait** l'entrée |
| `rendu/corps.ts:188` | l'étiquette, appelée **inconditionnellement** depuis |
| `rendu/maison.ts:88` | la tuile « Scanner », qui vit dans `extrasMaison` et n'est **pas** rendue par `corps.ts` |

`interaction.ts` rend l'appui inerte, et `base.css` retire le retour tactile
(`.absent`) : une tuile qui accuse réception d'une action qui n'a pas lieu est
le « bouton mort » que ce projet s'interdit.

## Génération 1 — morte, et il ne faut pas la réveiller par erreur

Trois pièces **ont l'air vivantes** et ne le sont pas depuis le 2026-08-02 :
`config/.storage/lovelace.wallpanel_*` (trois dashboards),
`config/custom_templates/wallpanel.jinja`, et les cinq capteurs
`sensor.wallpanel_hero_*` / `_moment` / `_conseil_meteo` déclarés aux lignes
103-166 de `configuration.yaml`.

Contrôle indépendant : `grep -rn "wallpanel_hero\|wallpanel_moment\|conseil_meteo" app/src/`
ne rend **qu'une occurrence, en commentaire** (`app/src/modes.ts:55`). Aucune
ligne de l'application ne les lit.

Elles **restent au socle** (décision 3) : `home-desk` ne transporte pas de code
mort, et les retirer coûterait une écriture manuelle dans `configuration.yaml`
plus la perte d'un renommage `hero`/`heros` qui ne vit que dans l'entity
registry. Leur retrait est une **dette de `home-manager`**, pas d'ici.

## Style

Scripts de test autonomes lancés par `make test`, pas de pytest, pas de
dépendance hors `python3` + PyYAML — c'est le style du dépôt `installer`. La
suite vitest de l'application a sa propre cible, `make test-app`.

## Dette d'environnement connue, à ne pas réparer ici

Sur l'hôte de cette maison, le CLI `ha` a ses commandes **WebSocket** cassées :
`aiohttp` manque au `python3` système, donc `automation trace`,
`automation category`, `dashboard` et `script trace` échouent. Les commandes
**REST** fonctionnent. C'est une dette nommée dans `home-stock` ; on la
contourne (REST, ou `docker exec`), on ne la répare pas ici.

Et le CLI `ha` **n'a pas** de sous-commande `core check` — c'est un wrapper
REST, pas le CLI Supervisor. Pour valider une configuration avant rechargement :

```bash
docker exec homeassistant python -m homeassistant --script check_config -c /config
```
