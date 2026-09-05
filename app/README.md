# wallpanel-app — l'affichage des tablettes murales

**C'est ce projet qui tourne sur les trois tablettes murales (salon, bureau, cuisine), pas un
dashboard Lovelace.** Application web dédiée en TypeScript + [`lit`](https://lit.dev), construite
par rollup vers `config/www/wallpanel/` et servie par Home Assistant.

> ⚠️ **Chemin de déploiement, corrigé le 2026-08-29.** La configuration de Home Assistant a été
> déplacée le 2026-08-28 de `/opt/nivuus/HomeAssistant/config` vers
> `/opt/nivuus/home-manager/config` — c'est ce dossier-là que `docker-compose.yml` monte sur
> `/config`. Les quatre fichiers qui écrivaient encore à l'ancienne adresse (`rollup.config.js`,
> `scripts/copier-assets.mjs`, `scripts/versionner.mjs`, `outils/verifier-rendu.mjs`) ont été
> mis à jour. Le symptôme, si cela se reproduit un jour : `npm run build` réussit sans un mot,
> recrée un dossier orphelin que personne ne sert, et les tablettes continuent d'afficher
> l'ancien bundle — tandis que `verifier-rendu.mjs` annonce « Aucune page à vérifier ».

| Pièce | URL affichée par Fully Kiosk | Admin Fully | Screenshot HA |
|-------|------------------------------|-------------|---------------|
| Salon | `/local/wallpanel/salon.html` | `192.168.0.218:2323` | `image.tablette_salon_capture_d_ecran` |
| Bureau | `/local/wallpanel/bureau.html` | `192.168.0.138:2323` | `image.tablette_bureau_capture_d_ecran` |
| Cuisine | `/local/wallpanel/cuisine.html` | `192.168.0.159:2323` | `image.tablette_cuisine_capture_d_ecran` |

L'app se connecte à HA en **websocket** avec le jeton de session du navigateur (`src/connexion.ts`) :
aucune card, aucun dashboard, aucun `custom_component` frontend dans la boucle.

Le garde-manger de la cuisine (repas suivant, vue recette, liste de courses, DLC) vient de
l'intégration **`home_stock`** : ce que la tablette affiche vit dans des **attributs d'entités**,
donc arrive gratuitement par `subscribe_events` ; la vue recette fait en plus **deux lectures
ponctuelles à son ouverture** (`home_stock/recipe/get`, `home_stock/meal/preview`) et une écriture
sur « Terminer » (`home_stock/meal/validate`). **Aucune lecture périodique, aucun client HTTP** —
c'est la leçon de la source précédente, qui téléchargeait 3,8 Mo par jour sur une dalle à 130 Mo
de libre.

> ⚠️ Les dashboards `.storage/lovelace.wallpanel_salon|bureau|cuisine` existent encore (filet de
> retour arrière du 2026-08-02) et paraissent plausibles — **les modifier n'a aucun effet sur les
> tablettes**. Même chose pour `config/custom_templates/wallpanel.jinja`, qui n'alimente plus que
> les capteurs `sensor.wallpanel_hero_*`, inutilisés ici.

## Où se trouve quoi

| Fichier | Contenu |
|---------|---------|
| `src/pieces.ts` | tuiles, commandes, entités et lignes de synthèse **par pièce** |
| `src/modes.ts` | mode principal exclusif (`alerte`, `minuteur`, `menage`, `cinema`, `media`, `aeration`, `voiture`, `defaut`), modulateurs cumulables (`invites`, `chaleur`, `delorean`), nombre de commandes visibles |
| `src/rendu/*.ts` | blocs centraux (`media`, `voiture`, `taches`, `minuteur`, `nuit`, `maison`, `defaut`, `recette`…) et `icones.ts` |
| `src/garde-manger.ts` | le repas suivant et le compte de DLC, **lus dans les attributs** de `sensor.home_stock_next_meal` et `todo.home_stock_expirations` |
| `src/contexte.ts` | moment du jour (nuit 23 h–5 h), alertes |
| `src/demarrage.ts` | connexion, souscriptions d'état, orchestration, retour auto après inactivité |
| `src/styles/` | `base.css` + `jetons.css` (généré, Material 3 Expressive) |

## Commandes

Toutes à lancer **depuis ce dossier**, jamais depuis la racine du dépôt.

```bash
npm test                          # vitest — 40 fichiers de tests, aucun navigateur
node outils/verifier-rendu.mjs    # rendu réel 343×585 dans Chromium ; NE DÉPLOIE PAS
node outils/verifier-rendu.mjs --deploye   # idem, sur le bundle réellement en place
node outils/mesurer-salve.mjs salon        # coût des 12 premières secondes (salve de connexion)
node outils/mesurer-salve.mjs salon --src  # idem, sur le bundle construit depuis src/
node outils/mesurer-rendus.mjs salon 300   # régime établi : styles/layouts par seconde, nœuds DOM
npm run build                     # ⚠️ DÉPLOIE EN PRODUCTION (écrit config/www/wallpanel/)
npm run jetons                    # régénère src/styles/jetons.css
```

`verifier-rendu.mjs` échoue sur : débordement du cadre, cible tactile < 62 px, contraste
texte/fond < 5:1, texte tronqué hors des cas autorisés. Il construit le bundle en mémoire depuis
`src/` — un vérificateur ne déploie pas. Il lui faut un jeton HA valable, lu dans `data/.mcp.json`.

Les deux `mesurer-*.mjs` ne vérifient rien : ils chiffrent ce que la page COÛTE, sur une dalle
343×585, et ne déploient pas davantage. Ils existent parce qu'une page qui rend juste peut quand
même faire tuer Fully par Android — c'est ce qui arrivait avant la coalescence des redessins
(cf. `Etat.notifier`, `src/etat.ts`) : 1712 recalculs de style à chaque connexion websocket.
Toute évolution qui touche la boucle de rendu se mesure avec eux avant `npm run build`.
Piège de lecture : le compteur de nœuds DOM monte puis retombe (ramasse-miettes) — une pente qui
monte n'est pas une fuite tant qu'on n'a pas échantillonné assez longtemps pour voir le recyclage.

Après un `npm run build`, la WebView Fully peut continuer à servir l'ancien bundle :

```
button.tablette_<piece>_vider_le_cache_du_navigateur
button.tablette_<piece>_load_start_url
```

## Contraintes non négociables

- Cadre **343 × 585 px**, marge nulle : la hauteur totale ne bouge pas selon qu'une alerte ou un
  média est actif — on **remplace** un bloc, on n'en ajoute jamais un.
- Cibles tactiles **≥ 62 px**, contraste **≥ 5:1**.
- **Aucun geste de navigation** et **aucun appui long** : tout au bouton. Une action destructive
  (cocher une tâche, valider un repas) demande deux appuis — armement puis confirmation
  (`src/cochage.ts`), et le libellé du second appui dit ce qu'il fait.
- Pas de donnée en double sur la même tablette (la répétition **entre** tablettes est permise :
  c'est ce qui autorise la ligne « n produits à consommer » au salon en plus de la cuisine).
- **Aucune lecture périodique** pour une donnée qui tient dans un attribut d'entité.
- Couleurs uniquement via les jetons Material 3 générés, jamais de hex en dur.
- Moteur des Fire (cuisine, salon) = **Chrome 100**, pas de `dvh` ; `verifier-rendu.mjs` simule ce
  moteur, jsdom (tests unitaires) ne calcule aucune mise en page réelle.
