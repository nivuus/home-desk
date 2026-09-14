# Dossier de mise en production — plan 3c

Bascule des trois tablettes murales (salon, cuisine, bureau) d'une configuration
écrite en dur dans le code vers une configuration éditable depuis Home
Assistant.

**À qui s'adresse ce document.** C'est un plan d'action sur une maison en
service, pas une note pour développeur. Chaque geste qu'il décrit porte son
retour arrière, écrit **avant** que le geste soit fait, jamais après. Il se lit
en entier avant de commencer, et il se remplit — section 5 — pendant
l'opération.

**Origine.** `docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`,
section « La mise en production », amendée le 2026-09-13 (branche de
transition). Ce dossier en est l'exécution : les faits qu'il porte sont datés
et mesurés contre l'instance réelle, pas recopiés de la spec sans vérification.

---

## 1. Ce qui est mesuré, et ce qui ne l'est pas encore

### 1.1 Mesuré le 2026-09-14, contre l'instance réelle

La spec posait une réserve nommée : *« `fully_kiosk.set_config` accepte-t-il
encore la clé `startURL` sur cette instance ? Tout le retour arrière des
étapes 5 et 7 en dépend. »* Cette réserve a été confrontée à l'instance
aujourd'hui, en lecture seule (API REST de Home Assistant — les commandes
websocket du CLI `ha` sont cassées sur cette machine, dette connue, non
réparée ici). Résultat :

| Fait | Valeur mesurée | Verdict |
|---|---|---|
| Service `fully_kiosk.set_config` | Existe. Champs `device_id`, `key`, `value`. La clé n'est pas contrainte à une liste fermée : `startURL` passe. | **La réserve est levée.** |
| Service `fully_kiosk.load_url` | Existe. Champs `device_id`, `url`. | Disponible, non retenu comme chemin principal (voir § 4, étape 5). |
| Boutons de rechargement | `button.tablette_salon_load_start_url`, `button.tablette_cuisine_load_start_url`, `button.tablette_bureau_load_start_url` — les trois existent. | Ce sont eux qui font relire la nouvelle `startURL` après le `set_config`. |
| Version Home Assistant | `2026.9.1` | — |
| Répertoire de configuration (dans le conteneur) | `/config` (langue `fr`, fuseau `Europe/Paris`) | Correspond à `/opt/nivuus/home-manager/config` sur l'hôte. |
| Intégration `fully_kiosk` | Chargée | — |
| Intégration `vignette` | Chargée | — |
| Intégration `home_desk` | **Non chargée** | Normal : le composant n'est pas encore installé. Ce dossier prépare cette installation, il ne la précède pas d'une autre mesure. |

**Conséquence directe : les étapes 5, 6 et 7 (§ 4) ont un retour arrière réel.**
Sans cette mesure, la mise en production redevenait une bascule unique et
irréversible sur trois tablettes en service — voir § 3, point 2.

### 1.2 Les `startURL` — corrigé le 2026-09-14 : elles SONT lisibles

**Cette section affirmait le contraire, et c'était faux.** Elle disait : « Les
trois `startURL` actuelles ne sont mesurables par aucun état Home Assistant.
Vérifié : Fully Kiosk ne les publie ni sur `media_player.tablette_*`, ni sur
`binary_sensor.tablette_*`, ni sur `button.tablette_*`. » Les trois domaines
cités ont bien été regardés ; le quatrième, non. L'intégration Fully Kiosk
publie **`sensor.tablette_<pièce>_current_page`**, et l'URL y est en clair.

Une mesure qui énumère les endroits où elle a cherché n'a pas prouvé l'absence :
elle a prouvé l'absence **là où elle a regardé**. C'est la même faute que
`_PORTES_ECRITURE` à qui il manquait une porte, et que les « trois câblages »
qui étaient quatre — le motif que ce dépôt paie régulièrement.

Lecture brute du 2026-09-14 à 16 h 09 (page **affichée**, avant le geste de
relevé décrit plus bas) :

| Tablette | `sensor.tablette_<pièce>_current_page` |
|---|---|
| Salon | `http://<hôte-HA>:8123/local/wallpanel/salon.html#` |
| Cuisine | `http://<hôte-HA>:8123/local/wallpanel/cuisine.html` |
| Bureau | `http://<hôte-HA>:8123/local/wallpanel/bureau.html` |

(`<hôte-HA>` est l'adresse relevée sur place ; ce document ne porte pas
l'adresse de cette maison — c'est la règle du lot de portabilité, tâche 5.)

**Attention à ce que ce capteur dit exactement.** Il publie la page
**affichée**, pas la `startURL` **configurée**. Les deux coïncident tant que la
tablette n'a pas navigué — et le salon prouve qu'elles peuvent diverger : son
URL porte un `#` final que la `startURL` n'a presque certainement pas. Prendre
`current_page` pour un relevé de `startURL` reviendrait à réécrire ce `#` dans
la configuration au premier retour arrière.

**Le geste qui transforme cette lecture en relevé** (à faire à l'étape 1, il ne
coûte qu'un rechargement sur une page déjà affichée) :

1. Appeler `button.tablette_<pièce>_load_start_url` — la tablette recharge sa
   `startURL` configurée, quelle qu'elle soit.
2. Lire `sensor.tablette_<pièce>_current_page` juste après.
3. **Retirer un `#` final s'il y en a un** (voir juste en dessous).
4. Écrire les trois valeurs au journal d'exécution, § 5, ligne de l'étape 1.

**D'où vient le `#` du salon — mesuré le 2026-09-14, et ce n'est pas la
configuration.** Le geste ci-dessus a été exécuté sur les trois tablettes : le
`#` du salon a **survécu** au rechargement forcé, pendant soixante secondes de
sondage. Deux explications restaient possibles depuis Home Assistant, qui ne
sait pas les distinguer : ou la `startURL` configurée porte ce `#`, ou
l'application le réécrit elle-même à chaque chargement.

C'est la seconde, et la réponse est dans le code, pas dans une déduction :
`app/src/demarrage.ts` fait `location.hash = ''` à six endroits (lignes 754,
847, 864, 976, 986, 1063) quand une sous-vue se ferme — minuteur, recette,
tâches, maison. Or affecter une chaîne vide à `location.hash` **laisse un `#`
final dans l'URL** ; c'est le comportement du navigateur, pas un défaut. Le
salon avait simplement une sous-vue fermée derrière lui.

**Relevé retenu, donc, le 2026-09-14 à 16 h 20** — les trois de la même forme,
le `#` du salon retiré comme signature de l'application :

| Tablette | `startURL` relevée |
|---|---|
| Salon | `http://<hôte-HA>:8123/local/wallpanel/salon.html` |
| Cuisine | `http://<hôte-HA>:8123/local/wallpanel/cuisine.html` |
| Bureau | `http://<hôte-HA>:8123/local/wallpanel/bureau.html` |

Ce sont **ces trois valeurs** que rechargent les retours arrière des étapes 5
et 7. Un `#` de trop n'aurait rien cassé — un fragment vide charge le même
document — mais réécrire dans la configuration une trace laissée par
l'application aurait fait passer un artefact pour un réglage.

### 1.2 bis La rotation du mot de passe Fully Kiosk — toujours nécessaire, plus bloquante

Le mot de passe admin Fully Kiosk doit toujours être considéré comme **exposé** :
il était en clair dans un fichier livré par `git archive`
(`app/docs/superpowers/plans/2026-08-06-bandeau-mise-en-page.md:592`), retiré du
fichier à la tâche 5, mais `git log` le conserve — un dépôt garde son historique.

Ce qui change : **ce n'est plus un préalable à l'étape 1.** Le relevé se fait
désormais sans lui (§ 1.2). La rotation redevient ce qu'elle est — une tâche de
sécurité à part entière, à faire parce que le secret est éventé, pas parce que
la mise en production l'attend. Elle demande un geste physique sur les trois
tablettes (Fully Kiosk Browser → Réglages → Plus de réglages → Mot de passe
distant / Interface web) et les nouveaux mots de passe se documentent **hors de
ce dépôt**.

Tant qu'elle n'est pas faite, ne pas considérer l'API d'administration Fully
Kiosk comme un canal de confiance.

### 1.3 Où poser l'archive — tranché le 2026-09-14 par une convention existante

Le retour arrière des étapes 2 et 8 (§ 4) repose sur un mouvement atomique
(`cp -a` puis deux renommages POSIX) qui **n'est atomique que si l'archive de
l'étape 1 et `config/www/wallpanel/` vivent sur le même système de fichiers**
— un `mv` entre systèmes de fichiers différents retombe sur une copie puis une
suppression, ce qui rouvre exactement la fenêtre que ce geste doit éviter.

**Cette section posait la question comme ouverte. Elle ne l'était pas.** Elle
disait : « Recherché dans ce dépôt : aucune convention nommée pour ce chemin. »
C'était vrai, et c'était la mauvaise portée de recherche : la convention
n'existe pas dans le dépôt, elle existe **sur l'hôte**, posée par le
déploiement précédent de ce même paquet. Mesuré le 2026-09-14 :

```
/opt/nivuus/home-manager/
    backups-home-desk-20260905/        <- pose au deploiement du 2026-09-05
        wallpanel/  vignette/  configuration.yaml  automations.yaml  secrets.yaml  auth/
    backups-retrait-ytube-20260905/    <- meme forme, autre chantier
```

La forme est donc `backups-<sujet>-<AAAAMMJJ>/`, à la racine de
`home-manager/`, à côté de `config/` — et **sur le même système de fichiers que
la cible** (vérifié : même numéro de périphérique que
`config/www/wallpanel/`). Chercher une convention dans le dépôt quand le geste
s'exécute sur l'hôte, c'était chercher sous le lampadaire.

**Chemin retenu pour l'archive de l'étape 1 :
`/opt/nivuus/home-manager/backups-home-desk-20260914/`.**

**Ce qu'elle contient, et une déviation assumée par rapport au 2026-09-05.**
L'archive de l'étape 1 porte ce dont *ce* retour arrière a besoin :
`wallpanel/` (la cible du geste), `vignette/`, `packages/home_desk.yaml` et
`configuration.yaml`. Elle ne reprend **pas** `secrets.yaml` ni `auth/`, que
l'archive du 2026-09-05 emportait : la sauvegarde Home Assistant complète de
l'étape 1 les couvre déjà, et recopier les secrets de la maison dans un second
endroit non chiffré est une exposition payée pour rien.

**Ce qui reste à décider, et que ce document ne décide pas.** L'étape 1 demande
que l'archive existe « hors de la cible, pas seulement sur l'hôte qui va être
modifié ». Le chemin ci-dessus satisfait « hors de la cible » ; il ne satisfait
pas « hors de l'hôte ». Si l'hôte est perdu, l'archive l'est avec lui, et la
sauvegarde Home Assistant aussi — elle vit dans `config/backups/`, sur la même
machine. Où poser la copie hors-hôte est une décision du propriétaire :
elle sort du périmètre de ce dépôt, et l'inventer serait envoyer la
configuration de cette maison vers une destination que personne n'a choisie.

## 2. Un avertissement de lecture, à connaître avant d'ouvrir le fichier

**Le YAML déposé par l'import (étape 4) est peu lisible à la main.** L'outil
de migration attache les commentaires du code source comme raisonnement
(`note`) sur les objets qu'ils justifient — mesuré : 143 commentaires, regroupés
sur 20 objets, 12 177 caractères de raisonnement au total. C'est voulu : sans
ça, la raison d'être de chaque réglage disparaîtrait avec le code qui la
portait.

**Mais le rendeur YAML aplatit une note multiligne.** C'est une limitation
documentée et acceptée du module `yaml_ecrans` (posée au plan 3a), pas un
défaut introduit par ce chantier. Conséquence concrète : la note de la
cuisine, qui joint dix-huit commentaires du code source, devient **une seule
ligne de commentaire de plus de 1 500 caractères** (1 584 caractères mesurés
le 2026-09-14 sur le fichier de travail produit par l'outil — la valeur exacte
dépendra du fichier réellement produit à l'étape 4, l'ordre de grandeur est ce
qui compte) dans `config/home_desk_ecrans.yaml`. Ouvrir ce fichier dans un
éditeur qui ne
retourne pas la ligne donnera l'impression d'un fichier cassé ou d'un unique
bloc illisible à cet endroit — il ne l'est pas, c'est le format attendu.

Qui ouvre `config/home_desk_ecrans.yaml` sur l'hôte doit le savoir **avant**,
pas le découvrir en pleine opération.

---

## 3. Ce qui ne revient PAS en arrière

À dire avant de commencer, pas après.

1. **Le redémarrage de Home Assistant à l'étape 2 coupe TOUTE la maison**, pas
   seulement les tablettes. C'est une coupure brève mais réelle — chauffage,
   lumières, serrure, tout ce que Home Assistant pilote s'arrête le temps du
   redémarrage. L'heure se choisit à l'avance et **s'écrit ici** :

   **Heure retenue pour le redémarrage de l'étape 2 : _______________ (à
   remplir avant de commencer, par le propriétaire).**

2. **À partir de l'étape 2, la granularité du retour arrière est le bundle
   entier des trois tablettes**, pas une tablette isolée. `hooks/install.py`
   remplace `www/wallpanel/` en un seul geste atomique (`replace_tree()`) —
   décision de `CLAUDE.md`, non renégociée ici. Cette granularité n'est
   rachetée **par tablette** que par la branche de transition (`data-piece`)
   déposée à l'étape 2 : sans elle, les étapes 5, 6 et 7 n'auraient aucun
   retour arrière et la mise en production serait une bascule unique et
   définitive.

3. **Le retour arrière côté Fully Kiosk est asynchrone.** Une tablette qui est
   hors ligne au moment où l'on décide de revenir en arrière garde sa nouvelle
   `startURL` jusqu'à son prochain retour en ligne — elle ne revient pas
   « en même temps » que les autres. Le pire cas : une tablette qui redémarre
   sur la nouvelle URL juste après la décision de revenir en arrière.

4. **Après l'étape 8, l'archive de l'étape 1 est le SEUL chemin de retour.**
   La branche de transition et les trois pages historiques partent dans le
   même commit que les littéraux. Un `git revert` suffit pour le dépôt, mais
   il faudrait reconstruire `dist/` et redéployer — ce n'est plus un retour
   arrière, c'est un nouveau déploiement. **Garder l'archive de l'étape 1, avec
   la sauvegarde Home Assistant, au moins une semaine** après l'étape 8.

5. **Ce que l'outil de migration n'a pas attaché ne revient pas non plus.**
   Les commentaires classés « orphelins » par le registre (`registre-
   commentaires.tsv`) restent dans `git log`, mais quittent le système vivant :
   récupérables par un développeur qui sait chercher, jamais sous les yeux de
   qui édite le réglage depuis Home Assistant.

---

## 4. Les huit étapes

Chaque étape porte sa porte de vérification (ce qui doit être vrai avant de
passer à la suite) et son retour arrière (ce qui annule le geste si la porte
échoue).

### Étape 1 — Filet et relevé

**Geste.** Sauvegarde Home Assistant complète (service `backup.create` —
**attendre qu'elle finisse** : l'appel dépasse le délai du client CLI bien avant
que la sauvegarde soit écrite, et un client qui abandonne ne veut pas dire un
geste qui a échoué ; se fier à `sensor.backup_etat_du_gestionnaire_de_sauvegarde`
et au fichier produit, pas au code de retour). Copie datée de
`config/www/wallpanel/` au chemin du § 1.3. Relever et écrire les trois
`startURL` actuelles par le geste du § 1.2 (`load_start_url`, puis lecture de
`current_page` — **sans rotation préalable du mot de passe**, voir § 1.2 bis) et
l'empreinte `?v=` actuellement servie. Archiver la version du paquet `home-desk`
installée. Écrire le chemin de l'archive et celui de la sauvegarde Home
Assistant dans le journal (§ 5).

**Repère mesuré le 2026-09-14 :** l'empreinte alors servie était
`v=aaa1261229`, identique dans `wallpanel.css` et `wallpanel.js` des trois
pages historiques. Si l'empreinte relevée le jour de l'opération diffère, c'est
qu'un déploiement a eu lieu entre-temps — le reste de ce dossier doit être
revérifié avant de continuer, à commencer par le compte de fichiers ci-dessous.

**Porte.** La sauvegarde Home Assistant est listée et non vide. La copie
datée porte **10 fichiers** — mesuré directement sur l'hôte le 2026-09-14,
sur le bundle déposé le 2026-09-05 :

```
config/www/wallpanel/
    bureau.html   cuisine.html   salon.html   wallpanel.css   wallpanel.js
    assets/
        DSEG14Classic-Bold.woff2   DSEG7Classic-Bold.woff2
        eclair.webp   firepath_384.webm   flux_264.webm
```

(5 fichiers à la racine, 5 dans `assets/`.) **Ce compte remplace le « 8
fichiers » de la spec d'origine**, mesuré le 2026-09-12 avant que la branche
de transition n'ajoute `index.html` — un compte qui daterait vite,
mentionné ici pour qu'on ne s'étonne pas de l'écart si quelqu'un recompare à
la spec. Les trois `startURL` sont écrites — **relevées après
`load_start_url`**, pas recopiées depuis `current_page` tel quel (§ 1.2).
L'archive est posée au chemin du § 1.3, **hors** de la cible et sur le même
système de fichiers qu'elle : c'est de là que dépend l'atomicité du retour
arrière des étapes 2 et 8 (§ 4). La copie hors-hôte, elle, reste une décision
du propriétaire (§ 1.3, dernier paragraphe) — son absence n'interdit pas de
continuer, mais elle doit être dite, pas oubliée.

**Ce que ce comptage révèle, et qui sert à l'étape 2** : à la date de cette
mesure, l'hôte **ne porte pas d'`index.html`**. Le bundle actuellement
déployé est celui d'avant le plan 3b — il n'a jamais vu la branche
`data-piece`. La porte de l'étape 2 doit donc constater **11 fichiers** après
le dépôt du paquet de transition (les 10 ci-dessus, plus `index.html`) : un
compte qui se vérifie d'un coup d'œil, pas une impression.

**Retour arrière.** Sans objet — rien n'a encore changé.

### Étape 2 — Dépôt du paquet de transition, puis redémarrage

**Geste.** Déployer le commit qui porte **encore** les littéraux, les trois
pages historiques (`salon.html`, `bureau.html`, `cuisine.html`) et la branche
de transition `data-piece`. Valider la configuration
(`docker exec homeassistant python -m homeassistant --script check_config
-c /config`). Redémarrer Home Assistant, à l'heure écrite au § 3, point 1.

**Porte.** `check_config` propre **avant** le redémarrage. Home Assistant
remonte, l'intégration `home_desk` est proposée à l'ajout dans Paramètres >
Appareils et services. `config/www/wallpanel/` porte **11 fichiers** — les 10
de l'étape 1 plus `index.html` (voir l'étape 1, ce que le comptage révèle).
**Et les trois pages historiques rendent à l'identique** : `verifier-rendu.mjs
--deploye` plus une capture par tablette, comparée à la copie de l'étape 1.
C'est la preuve que rien n'a encore bougé pour l'occupant de la maison, même
si le code sous-jacent a changé.

**Retour arrière.** Remettre la copie datée de l'étape 1 sur
`config/www/wallpanel/`, en **un seul mouvement atomique** — jamais fichier
par fichier, pour la même raison qu'au dépôt : trois clients rechargent tout
seuls, et une fenêtre où le répertoire est à moitié remplacé leur servirait un
mélange des deux bundles. C'est exactement l'algorithme que
`hooks/install.py` applique lui-même à chaque dépôt
(`replace_tree()`, `hooks/install.py:107-138` : copie vers un voisin
temporaire sur le même système de fichiers, puis deux renommages atomiques,
puis suppression de l'ancien) :

```bash
# Sur l'hôte, en root. ARCHIVE = la copie datée écrite à l'étape 1,
# CIBLE = le répertoire réellement servi. Les deux DOIVENT être sur le même
# système de fichiers : un `mv` entre systèmes de fichiers différents n'est
# pas atomique (il retombe sur une copie puis une suppression), ce qui rouvre
# exactement la fenêtre qu'on cherche à éviter.
ARCHIVE=/opt/nivuus/home-manager/archives/wallpanel-2026-09-14   # chemin choisi en § 1.3, écrit au journal de l'étape 1
CIBLE=/opt/nivuus/home-manager/config/www/wallpanel

cp -a "$ARCHIVE" "$CIBLE.new"
mv "$CIBLE" "$CIBLE.old"
mv "$CIBLE.new" "$CIBLE"
rm -rf "$CIBLE.old"
```

Puis `check_config`, puis redémarrer.

**D'où vient cette commande, et sa limite.** Elle n'est pas une commande
existante trouvée dans le dépôt : c'est la reproduction directe, à la main,
de l'algorithme de `replace_tree()` — la seule fonction de ce dépôt qui fait
exactement ce geste. Aucun outil prêt à l'emploi ne l'expose en dehors de ce
hook : `hooks/install.py` dit lui-même (règle 3, ligne 28) que « réexécuter ce
hook est le seul mécanisme de mise à jour », mais son point d'entrée
(`main()`) dépose **toujours** `HERE/dist` — le `dist/` du dépôt depuis lequel
le hook s'exécute — jamais un chemin d'archive arbitraire ; l'utiliser pour ce
retour arrière obligerait à extraire un clone du dépôt `home-desk` au commit
qui était `HEAD` juste avant cette étape, puis à exécuter
`echo '{}' | python3 hooks/install.py --phase install --root /` depuis ce
clone — ce qui redéploierait aussi `custom_components/vignette`,
`custom_components/home_desk` et `packages/home_desk.yaml` depuis cet ancien
commit, un périmètre plus large que le seul bundle et non discuté par la
spec. `packages/installer` (lu pour cette ronde :
`packages/installer/installer/README.md`) est confirmé comme un installeur de
**système d'exploitation** — partitionnement, `debootstrap`, GRUB — sans
commande pour redéployer un paquet déjà installé sur un hôte en service ;
ce n'est donc pas un chemin pour ce geste.

Où poser cette archive, et pourquoi c'est décidé en amont plutôt qu'ici :
§ 1.3.

### Étape 3 — Créer l'intégration, vide

**Geste.** Paramètres > Appareils et services > ajouter l'intégration
« Tablettes murales ». Aucun écran configuré à ce stade.

**Porte.** L'entrée existe. Le transport `home_desk/ecrans` rend `[]`. Les
trois tablettes sont inchangées — elles continuent d'afficher les pages
historiques.

**Retour arrière.** Supprimer l'entrée de configuration.

### Étape 4 — Importer les trois écrans

**Geste.** Déposer le YAML produit par l'outil de migration en
`config/home_desk_ecrans.yaml` (voir l'avertissement de lecture, § 2). Appeler
le service `home_desk.importer`.

**Porte — la fidélité, à deux niveaux, aucun ne suffit seul.**

1. **Le stockage.** `home_desk/ecrans` rend trois lignes, `home_desk/ecran`
   rend chacune, et chaque objet rendu **égale** le littéral correspondant
   champ par champ, `version: 1` comprise. Le geste qui le prouve sans écrire
   de client websocket ni toucher au jeton Home Assistant : appeler le service
   `home_desk.exporter` **après** l'import, récupérer le
   `config/home_desk_ecrans.yaml` produit, et le comparer **octet pour octet**
   au fichier qui a été importé :

   ```bash
   # sur l'hôte, après avoir appelé le service home_desk.exporter
   diff <(sudo cat /opt/nivuus/home-manager/config/home_desk_ecrans.yaml) ./home_desk_ecrans.yaml
   ```

   Un `diff` vide prouve que l'aller-retour **stockage** est fidèle — l'import
   n'a rien perdu, rien déformé.

2. **Le rendu.** Le `diff` vide ne prouve que le stockage, pas ce que la
   tablette affiche : deux structures identiques peuvent produire un rendu
   différent si un champ n'est simplement pas lu à l'endroit attendu. C'est
   pourquoi l'étape 4 seule **n'est pas** la porte de fidélité complète — elle
   se complète à l'étape 5, par `verifier-rendu.mjs` sur la nouvelle URL et
   par la capture comparée à l'étape 1. Les deux ensemble font la porte ;
   l'une seule ne la fait pas.

**Retour arrière.** L'import est atomique et total : soit ré-importer un
fichier corrigé, soit supprimer l'entrée de configuration (retour à
l'étape 3).

### Étape 5 — Repointer une tablette : la cuisine

**Geste.** Appeler `fully_kiosk.set_config` sur la tablette de la cuisine,
`key: startURL`, avec cette valeur **exacte, majuscule comprise** :

```
http://<hôte-HA>:8123/local/wallpanel/index.html?ecran=Cuisine
```

où `<hôte-HA>:8123` est **repris tel quel du relevé de l'étape 1** — la même
origine que celle qu'affichent déjà les trois tablettes.

Puis appeler `button.tablette_cuisine_load_start_url` pour faire recharger la
tablette sur cette URL.

**Le piège d'URL relative — corrigé le 2026-09-14, il était dans ce document.**
Ce dossier prescrivait ici `/local/wallpanel/index.html?ecran=Cuisine`, sans
schéma ni hôte. Mesuré le 2026-09-14 sur les trois tablettes en service : leur
`startURL` est **absolue**, de la forme
`http://<hôte-HA>:8123/local/wallpanel/<pièce>.html`. Une `startURL` est
l'adresse que Fully Kiosk charge **au démarrage de l'application**, hors de
toute page courante : il n'y a aucun document contre lequel résoudre un chemin
relatif. Écrire la valeur telle qu'elle était prescrite aurait donné une URL
que la tablette ne sait pas charger — et le geste qui suit
(`load_start_url`) l'aurait appliquée immédiatement, sur l'écran le plus utilisé
de la maison. Le retour arrière aurait fonctionné, mais l'étape aurait échoué
pour une raison sans rapport avec ce qu'elle teste.

**Le piège de casse à ne pas reproduire.** Le composant apparie le nom
d'écran **exactement** : `websocket.py` compare `data["nom"]` tel quel, et
`app/src/ecran.ts` porte `nom: 'Cuisine'`, majuscule en tête. `?ecran=cuisine`
en minuscules ne trouverait rien, rendrait `not_found`, et afficherait le
sélecteur d'écrans au lieu de la cuisine. **Et le nom de fichier est
obligatoire** : `/local/wallpanel/?ecran=Cuisine`, sans `index.html`, rend une
erreur **403**. Recopier l'URL ci-dessus telle quelle, sans la retaper de
mémoire.

La cuisine est choisie en premier parce que c'est l'écran le plus riche :
minuteurs, recette, liste de courses, `absenceNommee` — s'il y a un défaut de
rendu à découvrir, mieux vaut le découvrir sur l'écran qui expose le plus de
mécanismes.

**Porte.** L'écran se lève sans rester bloqué sur l'écran d'attente. Capture
comparée à celle de l'étape 1. `verifier-rendu.mjs` passé sur la nouvelle URL.
**Les cinq dégradations nommées sondées sur place**, en tapant les URL à la
main (transport websocket coupé, écran corrompu, version inconnue, etc. — voir
la spec, § « Cinq dégradations nommées »).

**Retour arrière.** `fully_kiosk.set_config` avec l'URL **relevée à l'étape 1**
(l'ancienne `startURL` de la cuisine), puis rechargement par le même bouton.
La tablette revient sur la page historique, qui prend la branche de transition
`data-piece`, qui lit le littéral — le comportement d'avant, octet pour octet,
puisque c'est littéralement le même code que celui déployé à l'étape 2.

### Étape 6 — Vivre avec, 24 heures

**Geste.** Ne rien faire d'autre que l'usage quotidien normal de la cuisine,
pendant 24 heures.

**Porte.** Aucun mur blanc, aucune tuile morte. Les minuteurs se lancent, la
vue Recette s'ouvre, la liste de courses se coche. **L'épreuve propre à ce
chantier** : éditer une tuile depuis Home Assistant et observer l'écran se
recharger tout seul (événement `home_desk_config_changed`) — c'est la promesse
« édition vivante » qui se prouve ici, en conditions réelles, pas en test
automatisé.

**Retour arrière.** Identique à l'étape 5.

### Étape 7 — Repointer le salon, puis le bureau

**Geste.** Un à la fois, dans cet ordre : le salon, puis le bureau. Même
mécanique qu'à l'étape 5 — `fully_kiosk.set_config` puis le bouton de
rechargement propre à chaque tablette.

```
Salon  : http://<hôte-HA>:8123/local/wallpanel/index.html?ecran=Salon
Bureau : http://<hôte-HA>:8123/local/wallpanel/index.html?ecran=Bureau
```

Même origine `<hôte-HA>:8123` qu'à l'étape 5, reprise du relevé de l'étape 1 :
une `startURL` relative n'est pas chargeable (voir l'étape 5, « Le piège d'URL
relative »).

Le salon porte la voiture et la DeLorean ; le bureau, l'agenda et
`todo.travail`. Chacun vit ses propres 24 heures (étape 6 répétée) avant de
passer au suivant.

**Porte.** Identique à l'étape 5, par tablette.

**Retour arrière.** Identique à l'étape 5, par tablette — chaque tablette
revient indépendamment des deux autres (voir § 3, point 3 : le retour est
asynchrone si une tablette est hors ligne au moment du geste).

### Étape 8 — Le commit de retrait, puis le redéploiement

**Geste.** Retirer les littéraux d'`ecran.ts`, l'outil de migration et ses
trois épreuves, les trois pages historiques, la branche de transition
`data-piece`. Basculer les douze fichiers de tests sur les écrans de
référence. `npm run build`. Committer. Installer.

**Porte.** **Les trois suites de tests vertes AVANT le déploiement** —
attention : `test_dist_a_jour` relance `npm run build` et compare le résultat
à `HEAD` **commité**, pas au répertoire de travail. Après déploiement : les
trois tablettes rechargent seules (le même mécanisme qu'à l'étape 6) et
rendent à l'identique.

**Retour arrière.** **Redéployer l'archive de l'étape 1 en entier**, avec le
même geste qu'à l'étape 2 (§ « Étape 2 », le mouvement atomique
`cp -a` + double `mv` + `rm -rf`, jamais fichier par fichier), puis
`check_config`, puis redémarrer. Pas « recopier les trois pages HTML » : sans
leur bundle d'époque, ces trois pages prennent une branche `data-piece` qui
n'existe plus, et donnent trois murs blancs. C'est le seul chemin de retour à
partir de cette étape (§ 3, point 4) — garder l'archive au moins une semaine
après ce commit.

---

## 5. Journal d'exécution

À remplir pendant l'opération, une ligne par étape. C'est ce journal qui
permettra, après coup, de dire ce qui s'est réellement passé plutôt que ce qui
était prévu.

| Étape | Date | Heure | Qui | Ce qui a été observé à la porte |
|---|---|---|---|---|
| 1 — Filet et relevé | 2026-09-14 | 16 h 09 – 16 h 21 | Claude | **Porte franchie.** Sauvegarde 378 Mo vérifiée (`tar` lisible de bout en bout, gestionnaire `idle`). Archive `backups-home-desk-20260914/` : 10 fichiers, identique octet pour octet à la cible, même système de fichiers (périph. 65024). Empreinte servie `v=aaa1261229`. Trois `startURL` relevées (§ 1.2). **Réserve dite, non levée : pas de copie hors-hôte.** |
| 2 — Paquet de transition + redémarrage | | | | |
| 3 — Intégration vide | | | | |
| 4 — Import des trois écrans | | | | |
| 5 — Cuisine repointée | | | | |
| 6 — 24 heures, cuisine | | | | |
| 7a — Salon repointé | | | | |
| 7b — Salon, 24 heures | | | | |
| 7c — Bureau repointé | | | | |
| 7d — Bureau, 24 heures | | | | |
| 8 — Commit de retrait + redéploiement | | | | |

### Compte rendu de l'étape 1 — 2026-09-14, 16 h 09 à 16 h 21

**Première tentative, 16 h 09 — interrompue.** L'écriture de l'archive a été
refusée par le garde-fou du harnais (« Production Deploy »), puis tout accès à
l'hôte l'a été. Aucune écriture n'avait eu lieu. La tentative n'a pas été
perdue pour autant : c'est elle qui a mis au jour les deux défauts de ce
dossier corrigés plus haut — le relevé des `startURL` déclaré impossible alors
qu'il ne l'est pas (§ 1.2), et **l'URL prescrite aux étapes 5 et 7, relative
alors qu'une `startURL` doit être absolue** (§ 4, étape 5). Le second aurait
fait échouer la bascule de la cuisine au moment même du geste.

**Reprise après autorisation explicite du propriétaire, 16 h 15 — porte
franchie.**

| Élément de la porte | Constaté |
|---|---|
| Sauvegarde HA | `Custom_backup_2026.9.1_2026-09-14_16.10`, 378 306 560 octets. Vérifiée **complète** : `tar -tf` lit l'archive de bout en bout, `sensor.backup_etat_du_gestionnaire_de_sauvegarde` = `idle`. |
| Archive du bundle | `/opt/nivuus/home-manager/backups-home-desk-20260914/` — `wallpanel/` (10 fichiers), `vignette/`, `home_desk.yaml`, `configuration.yaml`. `diff -r` contre la cible : **identique**. |
| Atomicité du retour arrière | Archive et cible sur le **même** système de fichiers (périphérique 65024, vérifié). |
| Compte de fichiers | **10**, conforme — 5 à la racine, 5 dans `assets/`, **pas d'`index.html`**. |
| Empreinte servie | `v=aaa1261229` |
| Les trois `startURL` | Relevées (§ 1.2), après `load_start_url` et retrait du `#` du salon. |

**Une leçon de plus, et elle est du même genre que les deux autres.** Le `#` du
salon a survécu au rechargement forcé — ma propre procédure de relevé, écrite
une heure plus tôt, prétendait lever une ambiguïté qu'elle ne levait pas.
Ce qui l'a levée est la lecture de `demarrage.ts`, pas une mesure de plus
depuis Home Assistant : l'application écrit ce `#` elle-même. **Sonder le
système en marche dit ce qu'il fait ; seul le code dit pourquoi.**

**Réserve inscrite, non levée.** L'archive et la sauvegarde vivent toutes deux
sur l'hôte qui va être modifié. La copie hors-hôte réclamée par la porte
n'existe pas : elle reste une décision du propriétaire (§ 1.3, dernier
paragraphe). L'étape 1 est déclarée franchie **avec** cette réserve dite, pas
en la passant sous silence.
