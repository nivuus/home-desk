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

   **Corrigé le 2026-09-14 : ce critère est trop fort, et il a échoué sur du
   vide.** Le `diff` n'était pas vide — et pourtant l'import n'avait rien perdu.
   L'écart, identique sur les trois écrans et seul de tout le fichier :
   `agencement.modulateurs` réordonné (`invites` passe de la tête à la queue),
   plus la place de la clé `titre` dans la table.

   Le fichier de migration et le composant sont **deux rédacteurs différents**
   du même contenu : exiger d'eux le même octet, c'est mesurer leur style, pas
   leur fidélité. Or l'ordre de `modulateurs` ne porte aucun sens — le contrat
   le déclare `uniqueItems: true` sur un `enum` de trois valeurs (un ensemble,
   pas une séquence), et `app/src/modes.ts:153` le dit en toutes lettres :
   « L'ordre de la liste déclarée n'a donc AUCUNE importance ici — on rend dans
   l'ordre de `CONDITIONS_MODULATEURS` ». L'application réordonne de toute
   façon.

   **Les deux contrôles qui remplacent le `diff` d'octets**, et qui prouvent
   davantage :

   a. **Égalité de STRUCTURE** entre le fichier importé et le fichier
      réexporté : relire les deux avec `yaml_ecrans.lire` et comparer les
      objets champ par champ. Un écart d'ordre dans une liste que le contrat
      déclare `uniqueItems` se nomme et se tolère ; tout autre écart — une
      valeur, une clé perdue, une longueur — est une faute.
   b. **Point fixe du composant** : `exporter` → `importer` → `exporter` doit
      rendre un fichier **identique octet pour octet**. C'est là que le `diff`
      d'octets est le bon outil, parce que les deux côtés ont alors le même
      rédacteur.

   Mesuré le 2026-09-14 : (a) un seul écart, l'ordre de `modulateurs`, sur les
   trois écrans ; (b) point fixe atteint, `sha256` identique.

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
http://<hôte-HA>:8123/home_desk/tablette?ecran=Cuisine
```

où `<hôte-HA>:8123` est **repris tel quel du relevé de l'étape 1** — la même
origine que celle qu'affichent déjà les trois tablettes.

**Corrigé le 2026-09-27 : ce n'est plus `/local/wallpanel/index.html`.** Home
Assistant sert `/local/` avec `max-age` de 31 jours, codé en dur ; une
tablette qui a mis le document en cache exécute le bundle qu'il nomme, quoi
qu'on déploie (cause n°2 de l'échec du 2026-09-14, voir le débogage plus bas).
Le composant `home_desk` sert désormais le **même fichier** sous
`/home_desk/tablette`, avec `Cache-Control: no-cache`
(`custom_components/home_desk/page.py`). Le chemin est aussi une URL que la
cuisine n'a **jamais** chargée : aucune copie en cache ne peut s'interposer.

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
sélecteur d'écrans au lieu de la cuisine. (Sous `/local/`, le nom de fichier était en
plus obligatoire — `/local/wallpanel/?ecran=Cuisine` rendait **403** ; la vue
`/home_desk/tablette` n'a pas ce piège, mais la casse, elle, compte toujours.) Recopier l'URL ci-dessus telle quelle, sans la retaper de
mémoire.

La cuisine est choisie en premier parce que c'est l'écran le plus riche :
minuteurs, recette, liste de courses, `absenceNommee` — s'il y a un défaut de
rendu à découvrir, mieux vaut le découvrir sur l'écran qui expose le plus de
mécanismes.

**Porte.** **Le document servi porte l'empreinte déployée** (ajouté le
2026-09-27, c'est la leçon de la cause n°2) :
`curl -sI http://<hôte-HA>:8123/home_desk/tablette` rend `Cache-Control:
no-cache`, et le corps nomme le même `?v=` que `dist/index.html` au commit
déployé. L'écran se lève sans rester bloqué sur l'écran d'attente. Capture
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
Salon  : http://<hôte-HA>:8123/home_desk/tablette?ecran=Salon
Bureau : http://<hôte-HA>:8123/home_desk/tablette?ecran=Bureau
```

(Corrigé le 2026-09-27, même raison qu'à l'étape 5 : plus `/local/`.)

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
| 2 — Paquet de transition + redémarrage | 2026-09-14 | 16 h 25 – 16 h 33 | Claude | **Porte franchie.** Trois suites vertes avant le geste. `check_config` code 0, zéro ligne d'erreur. Dépôt par `hooks/install.py` (code 0, aucun avertissement `configuration.yaml` — les deux lignes y étaient déjà). 11 fichiers, empreinte `v=c3190c3011`, aucun résidu `.new`/`.old`. Redémarrage 16 h 27 h 42, remontée ~60 s, **1 781 entités = compte d'avant**. `home_desk` proposé à l'ajout, 0 entrée. Les trois tablettes ont rechargé seules (automation `tablettes_reload_browser_apres_demarrage_ha`, 16 h 29 h 32) et rendent juste — captures des trois relues. |
| 3 — Intégration vide | 2026-09-14 | 16 h 41 | Claude | **Porte franchie.** Entrée « Tablettes murales » créée par le flux (`create_entry`), état `loaded`, `num_subentries: 0`. Les trois tablettes inchangées, aucune erreur au journal HA. |
| 4 — Import des trois écrans | 2026-09-14 | 16 h 43 – 16 h 47 | Claude | **Porte franchie, avec le critère corrigé** (voir § 4, étape 4). YAML déposé (`sha256` identique à la source), `home_desk.importer` appelé : `num_subentries: 3`. Fidélité prouvée par égalité de structure (seul écart : l'ordre de `modulateurs`, sans portée) et par le point fixe `exporter→importer→exporter` (`sha256` identique). |
| 5 — Cuisine repointée | 2026-09-14 | 16 h 54 – 16 h 58 | Claude | **PORTE ÉCHOUÉE — retour arrière exécuté, maison rétablie.** Voir le compte rendu ci-dessous. |
| 2 bis — Redépôt (composant qui sert `/home_desk/tablette`) + redémarrage | 2026-09-27 | ~21 h 50 | Claude | **NON EXÉCUTÉ.** Le geste (instantané de l'état déployé, dépôt de `git archive HEAD` par `hooks/install.py`) a été refusé en bloc par le garde-fou du harnais (« Production Deploy ») avant toute écriture. Aucune écriture sur l'hôte. Voir « État à la clôture du 2026-09-27 ». |
| 2 bis — Redépôt + redémarrage (reprise) | 2026-09-28 | 09 h 01 – 09 h 06 | Claude, sur demande directe du propriétaire | **Porte franchie.** Instantané `backups-home-desk-20260928/` (`wallpanel/`, `custom_components/home_desk/` et `vignette/`, `packages/home_desk.yaml`), `diff -r` identique, même périphérique 65024. Relevé d'avant : 1 767 entités, entrée `loaded`, 3 écrans, `/home_desk/tablette` → 404. Dépôt de `git archive 9fd0455` par `hooks/install.py` (code 0). Porte avant : `check_config` code 0, 11 fichiers identiques à `dist/`, aucun `.new`/`.old`, `page.py` présent. Redémarrage 09 h 04 min 45, HTTP rendu à 09 h 05 min 01. Porte après : 1 801 entités (≥ relevé d'avant), entrée `loaded`, 3 écrans ; `GET /home_desk/tablette` → `200`, `Cache-Control: no-cache`, le corps nomme `v=26fbd8a667` = `dist/`. Aucune erreur `home_desk` au journal. (`HEAD` rend `405` : la vue ne sert que `GET`, sans portée pour une WebView.) |
| 2 ter — Redépôt de `3ba7dec` (découpe de `demarrage.ts`, traduction) + redémarrage | 2026-09-28 | 09 h 48 – 09 h 52 | Claude, sur demande directe du propriétaire | **Porte franchie.** Instantané `backups-home-desk-20260928b/`, identique. Dépôt de `git archive 3ba7dec` (code 0), composant identique à la source (aucun ancien `listes*.py` résiduel), 11 fichiers = `dist/`, `check_config` code 0. Redémarrage 09 h 50 min 49, HTTP à 09 h 51 min 05. Après : 1 801 entités, entrée `loaded`, 3 écrans, `GET /home_desk/tablette` → `200` `no-cache`, `v=42af4fc6f0` = `dist/`. |
| 5 — Cuisine repointée (reprise) | 2026-09-28 | 09 h 53 – 10 h 13 | Claude, sur demande directe du propriétaire | **PORTE ÉCHOUÉE sur deux points — retour arrière exécuté, maison rétablie.** Voir « Compte rendu de la reprise de l'étape 5 » ci-dessous. |
| 2 quater — Redépôt de `bc3534d` (défauts A et B corrigés) + redémarrage | 2026-09-28 | 10 h 43 – 10 h 50 | Claude, sur demande directe du propriétaire | **Porte franchie.** Instantané `backups-home-desk-20260928c/`, identique. Dépôt de `git archive bc3534d` (code 0), composant = source, 11 fichiers = `dist/`, `check_config` code 0. Redémarrage 10 h 45 min 02, HTTP à 10 h 45 min 22. Après : 1 787 entités (= relevé d'avant), entrée `loaded`, `GET /home_desk/tablette` → `200` `no-cache`, `v=d3e9aee8f8` = `dist/`. Correctifs vérifiés contre l'instance réelle (navigateur headless, websocket intercepté, aucune écriture) : **A** — `next_meal` à `unknown`, la tuile Recette disparaît, plus de « Garde-manger non installé », « Courses / 15 » intact ; **B** — HA coupé au démarrage : « Chargement… » à 10 s, « Connexion impossible » à 40 s, puis HA rendu : l'écran Cuisine se monte seul, sans rechargement. |
| 5 — Cuisine repointée (2e reprise) | 2026-09-28 | 10 h 49 – 10 h 58 | Claude, sur demande directe du propriétaire | **Porte franchie, une réserve nommée.** Appareil résolu par `device_id` depuis `current_page` (actif). Référence 10 h 49 min 03 sur `cuisine.html`. `set_config` `startURL` = `http://<hôte-HA>:8123/home_desk/tablette?ecran=Cuisine`, `load_start_url` à 10 h 49 min 04, page constatée à 10 h 49 min 45. Capture fraîche à 10 h 51 (horloge et température ont avancé, donc pas une image en cache) : **structure identique à la référence** — météo, Hotte, Rideau, Courses 15, Entretien, synthèse, thème clair, pas de fausse tuile Recette. Document servi `200` `no-cache`, `v=d3e9aee8f8` = `dist/`. Sept sondes de dégradation (navigateur headless, websocket intercepté) conformes ; « HA injoignable » cède à « Connexion impossible » passé 30 s (sonde de 60 s, 2 quater). `verifier-rendu.mjs --deploye` forme `ecran` : les 4 fautes antérieures à la migration (même résultat sur la forme historique et sur `9fd0455`) + **réserve : `MOUVEMENT` — `etiquette`, `groupe` sans `data-mvt`**, un contrôle de marquage d'animation, sans effet sur ce que l'occupant voit ; laissé ouvert, à corriger avant l'étape 8. **La cuisine reste sur la nouvelle URL** ; retour arrière inchangé (`startURL` → `.../local/wallpanel/cuisine.html`). |
| 6 — 24 heures, cuisine | 2026-09-28 → 2026-09-29 | depuis 10 h 49 | | **Ouverte.** |
| 2 quinquies — Défaut d'abonnement trouvé pendant l'étape 6, corrigé (v1.3.1) + redémarrage | 2026-09-28 | 17 h 03 – 17 h 10 | Claude, sur demande directe du propriétaire | **Porte franchie.** Constat : à chaque démarrage de la tablette, `Refusing to allow Tablet to subscribe to event home_desk_config_changed` — Home Assistant refuse `subscribe_events` hors de sa liste fixe à un utilisateur non administrateur, celui des tablettes ; l'édition en direct n'atteignait donc jamais le mur. Correctif (PR #5) : commande `home_desk/abonner`, filtrée par écran côté serveur. Instantané `backups-home-desk-20260928d/`, identique. Relevé d'avant : 1 787 entités. Pose par `nivuus update home-desk` (v1.3.1), `v=c7a7496000`, `check_config` `valid`. Redémarrage 17 h 05 min 48, HTTP à 17 h 06 min 39. Après : 1 787 entités, entrée `loaded`, 3 écrans. Un dernier refus à 17 h 06 min 22, émis par l'ANCIENNE page avant son rechargement ; après rechargement du navigateur de la cuisine (17 h 10 min 19), journal websocket en débogage : `home_desk/abonner` `nom: Cuisine` reçu, aucun refus. **L'étape 6 continue, mais la cuisine tourne désormais sur un code différent depuis 17 h 10 : ses 24 heures sont à recompter à partir de là.** |
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

---

### Compte rendu de l'étape 5 — 2026-09-14, 16 h 54 : la porte échoue, le filet tient

**Le geste.** `fully_kiosk.set_config` sur la tablette de la cuisine,
`key: startURL`, valeur `http://<hôte-HA>:8123/local/wallpanel/index.html?ecran=Cuisine`,
puis `button.tablette_cuisine_load_start_url`. Bascule constatée immédiatement.

**Un piège évité en chemin, qui méritait de l'être.** Le registre porte **deux**
appareils Fully Kiosk nommés « Tablette Cuisine » : l'un désactivé
(`disabled_by: user`, « Tablette Cuisine 22 »), l'autre vivant. Choisir par le
nom aurait envoyé la commande à l'appareil mort, sans erreur et sans effet.
L'appareil a été résolu **en remontant depuis l'entité déjà relevée**
(`sensor.tablette_cuisine_current_page` → son `device_id`), jamais par son
libellé. À refaire ainsi aux étapes 7a et 7b.

**Ce que la tablette a affiché.** La structure est là — rangée Ambiance,
bloc Entretien, bouton « Toute la maison ». **Les états des entités, non :**

| Attendu (page historique, même instant) | Obtenu sur `?ecran=Cuisine` |
|---|---|
| « ☀ 29° » et « Il fait 23,2° ici. » | météo absente, il ne reste que « DEMAIN » |
| Tuiles « Fermer / Ouvert » et « Hotte / Éteint » | **absentes** |
| « Courses / 15 » | « Courses / Garde-manger non installé » |
| Vue Recette disponible | « Recette / Garde-manger non installé » |
| « Tout est fermé — 22 produits à consommer » | « Tout est fermé, rien à signaler » |
| Thème clair | thème sombre |

**Le diagnostic va aussi loin que la mesure le permet, et pas plus loin.**

- **Ce n'est PAS la configuration importée.** Vérifié dans le YAML relu depuis
  Home Assistant : l'écran Cuisine porte bien ses quatre commandes — `Hotte`
  (`light.hotte`), `Rideau` (`cover.rideau_cuisine`), `Courses`, `Recette`. Rien
  n'a été perdu à l'import, ce que la porte de l'étape 4 avait déjà prouvé deux
  fois.
- **Ce n'est PAS le code de rendu.** Le même `wallpanel.js`, déposé à
  l'étape 2, rend la cuisine parfaitement par la branche `data-piece` — la
  capture du retour arrière le montre, identique à celle de l'étape 1.
- **C'est donc le chemin des ÉTATS sur la branche `?ecran=`**, celle que
  `page.ts` fait partir vers `demarrage.demarrer` plutôt que vers
  `demarrerAvecEcran`. Le symptôme est cohérent de bout en bout : **aucune**
  entité ne résout. Les deux tuiles sans `absenceNommee` sont filtrées et
  disparaissent ; les deux qui en portent une restent, inertes, et affichent
  leur libellé — exactement le comportement prévu pour une entité muette. La
  météo suit la même règle.

**La piste pour la correction, à vérifier avant d'y toucher.** Les trois
épreuves de fidélité du plan (`app/tests/migration-*.test.ts`) montent par
`monterDemarrage` (`app/tests/aides.ts`), et le niveau 3 compare le littéral à
l'importé. Reste à établir si l'une d'elles exerce réellement la séquence
`demarrer` → abonnement aux états — ou si toutes passent par le même point
d'entrée, celui qui fonctionne. Si c'est le cas, c'est le motif que ce dépôt
connaît par cœur : **un test qui garde un MODULE ne garde pas son
BRANCHEMENT.** Les 1 148 tests verts n'ont rien attrapé parce qu'ils
n'observaient pas ce branchement-là.

**Le retour arrière.** `startURL` remise à la valeur relevée à l'étape 1
(`.../cuisine.html`), puis rechargement. Capture de contrôle à 16 h 58 :
identique à celle de l'étape 1 — météo, « Fermer / Ouvert », « Hotte / Éteint »,
« Courses / 15 », « Tout est fermé — 22 produits à consommer », thème clair.
**Quatre minutes entre le geste et le rétablissement.**

**Ce que cet échec démontre, et qui n'est pas rien.** La branche de transition
`data-piece` a fait exactement ce pour quoi elle a été posée, et elle a coûté
sa place dans le bundle pour ce seul instant. Sans elle, la cuisine serait
restée dans cet état jusqu'à un nouveau déploiement complet — et les trois
tablettes avec, puisque le bundle est remplacé d'un bloc. C'est l'arbitrage du
plan 3b qui se paie ici, une fois, et qui se rembourse.

**État de la maison à la clôture de cette session :** les trois tablettes sur
leurs pages historiques, servies par le bundle de l'étape 2, rendu vérifié
identique au bundle d'avant. L'intégration « Tablettes murales » est installée
et porte les trois écrans importés — **elle ne pilote aucune tablette**. Rien
ne dépend d'elle tant qu'aucune `startURL` ne pointe sur `index.html`.

**Les étapes 6, 7 et 8 ne s'ouvrent pas** tant que l'étape 5 n'a pas passé sa
porte.

---

### Débogage du 2026-09-14, 17 h 00 – 17 h 55 : DEUX causes, une corrigée, une ouverte

#### Cause n°1 — l'instantané d'états perdu (CORRIGÉE, vérifiée en production)

`demarrer()` connecte pour résoudre la configuration, **puis** monte le corps,
qui s'abonne alors par `surChangement`. Or `auth_ok` envoie `get_states`
immédiatement et `emettre()` le distribue à `rappelsEtat`, vide à cet instant :
l'instantané tombe sans erreur. Le `connecter()` du corps retourne sur la garde
d'idempotence (`readyState === 1`), donc aucun second `get_states`. Ne restent
que les `state_changed` — les seules entités qui **changent**. Une hotte
éteinte, un rideau immobile, la météo, `sun.sun` : jamais.

`demarrerAvecEcran()` (branche `data-piece`) s'abonne **avant** de connecter et
n'a jamais eu le défaut. Même bundle, deux portes, deux comportements.

Corrigé par symétrie avec `surEvenement`, qui traite déjà l'abonnement tardif
dans cette même classe. `surChangement` redemande l'instantané quand un est
déjà parti sur la socket courante (`etatsDemandes`, remis à zéro par socket).
Deux épreuves, dont une contre-épreuve qui interdit l'aller-retour inutile sur
le chemin qui marchait.

**Vérifiée sur la vraie instance**, pas seulement en test : chargée avec une URL
anti-cache, la cuisine a rendu météo, « Fermer / Ouvert », « Hotte / Éteint »,
« Courses 15 » et « 22 produits à consommer ».

#### Cause n°2 — `index.html` n'a pas d'anti-cache (CORRIGÉE le 2026-09-27, voir plus bas)

**La correction n'atteignait pas la tablette.** `wallpanel.js` et
`wallpanel.css` portent une empreinte (`?v=<empreinte>`) ; **le document qui les
référence, lui, est chargé par son URL nue.** La WebView de Fully Kiosk sert
donc un `index.html` en cache, qui pointe l'ancien JS — indéfiniment.

**Expérience décisive** (une seule variable, après un premier essai qui en
changeait deux — même service `fully_kiosk.load_url`, deux URL) :

| URL chargée | Rendu |
|---|---|
| `index.html?ecran=Cuisine&cb=<horodatage>` | **juste** |
| `index.html?ecran=Cuisine` | **cassé** |

Le schéma de versionnement casse le cache des ressources, **jamais celui du
document qui les nomme**. Les trois pages historiques ont exactement le même
défaut.

**Conséquence qui remonte sur l'étape 2, et qu'il faut dire.** La porte de
l'étape 2 demandait que les trois pages historiques « rendent à l'identique ».
Elles rendaient à l'identique — mais **un bundle périmé en cache rend lui aussi
à l'identique**. Cette porte ne sait donc pas distinguer « le nouveau bundle
rend pareil » de « l'ancien bundle est toujours servi ». Ce qui a été vérifié
le 2026-09-14 à 16 h 33 est que les tablettes rendaient juste, **pas** qu'elles
exécutaient le code déposé. La porte doit gagner une vérification d'empreinte
réellement chargée.

**Deux chemins possibles, non tranchés** — c'est une décision de procédure, pas
un correctif à improviser sur une maison en service :

1. **Empreinte dans la `startURL`** (`index.html?ecran=Cuisine&v=<empreinte>`) :
   l'URL du document change exactement quand le bundle change, et les
   ressources restent en cache sur leur propre `?v=`. Précis, mais il faut
   reposer les trois `startURL` à chaque déploiement.
2. **`webviewCacheMode` sur les tablettes** (`fully_kiosk.set_config` accepte
   une clé libre) : posé une fois, plus rien à retenir, au prix d'un
   rechargement complet à chaque démarrage de page.

#### Un reste, plus petit, non expliqué

Sur le rendu JUSTE de `?ecran=Cuisine`, une tuile « Recette » apparaît, inerte,
libellée « Garde-manger non installé » — la page historique, elle, ne rend
aucune tuile Recette au même instant. Ce n'est pas un bouton mort (elle dit
pourquoi elle est là, c'est le contrat d'`absenceNommee`), mais c'est un écart
de rendu entre les deux portes qui n'est pas encore expliqué. Probablement le
second filtre `recetteOuvrable` (`corps.ts:425`), dont l'entrée dépend d'une
commande websocket et non d'un état. À reprendre avant l'étape 6.

#### État de la maison à la fin de cette session

Les trois tablettes sur leurs pages historiques, `startURL` d'origine restaurées
partout. Bundle servi : 11 fichiers, empreinte `v=26fbd8a667` (celle qui porte
la correction n°1). L'intégration « Tablettes murales » est chargée avec ses
trois écrans et **ne pilote aucune tablette**.

---

### Reprise du 2026-09-27 : la cause n°2 corrigée à sa source

#### Ce qui a été tranché, et pourquoi aucun des deux chemins du 2026-09-14

Mesuré le 2026-09-27 sur l'instance : `/local/wallpanel/index.html` est servi
avec `Cache-Control: public, max-age=2678400`. Ce n'est pas un réglage oublié :
`homeassistant/components/http/static.py` le pose en dur (`CACHE_TIME = 31 *
86400`) sur tout `/local/`, sans option (vérifié dans le code du conteneur et
dans les fils de la communauté Home Assistant, qui réclament cette option
depuis des années). La faute n'est donc ni dans les tablettes ni dans la
procédure : **c'est le document d'entrée qui est servi par un chemin fait pour
des ressources immuables.**

- *Empreinte dans la `startURL`* : écarté. C'est un geste à refaire sur trois
  tablettes à chaque déploiement — exactement la « commande à ne pas oublier »
  que `app/scripts/versionner.mjs` a été écrit pour supprimer.
- *`webviewCacheMode` sur les tablettes* : écarté. Un réglage client qui
  compense un en-tête serveur, à reposer sur chaque tablette neuve.

**Retenu : le composant sert le document** (`custom_components/home_desk/
page.py`, commit `fix(page): serve the tablet entry document with no-cache`).
Vue `/home_desk/tablette`, sans authentification comme `/local/`, qui lit le
fichier même que le hook dépose (`www/wallpanel/index.html`) et répond
`Cache-Control: no-cache` : chaque chargement revalide, un document inchangé
coûte un 304, un document redéployé revient en entier. Les ressources à
empreinte restent sous `/local/` avec leur cache long — c'est à ça que sert
leur empreinte. Épreuve : `tests/composant/test_page.py` (le scénario de
l'échec rejoué, un client qui tient le validateur de l'ANCIEN document doit
recevoir le nouveau ; mutation `no-cache` → `max-age` : deux tests tombent).

**Conséquence sur ce dossier** : les URL des étapes 5 et 7 deviennent
`http://<hôte-HA>:8123/home_desk/tablette?ecran=<Nom>`, et la porte de
l'étape 5 gagne la vérification d'empreinte servie (§ 4, étape 5). Le code du
composant ayant changé, **il faut redéposer le paquet et redémarrer Home
Assistant** : c'est le geste de l'étape 2, rejoué avec sa porte et son retour
arrière (le module Python d'une intégration n'est relu qu'au démarrage).

#### Le « reste non expliqué » du 2026-09-14 est la même cause

Rendu le 2026-09-27 dans un navigateur sans cache, contre l'instance réelle,
avec le bundle déployé (`v=26fbd8a667`) : `cuisine.html` et
`index.html?ecran=Cuisine` rendent **la même chose, tuile « Recette /
Garde-manger non installé » comprise** (`sensor.home_stock_next_meal` vaut
`unknown`). La capture de la tablette de la cuisine, au même moment, **n'a pas
cette tuile**. Même document, même état : c'est le bundle qui diffère. La page
historique de la tablette exécute une version **en cache**, antérieure au
dépôt de l'étape 2 — la cause n°2, sur l'autre porte. Il n'y a pas de troisième
défaut dans `recetteOuvrable`.

**Ce que cela dit du retour arrière des étapes 5 à 7**, et il faut l'écrire :
remettre l'ancienne `startURL` ramène la tablette sur **ce qu'elle a en cache**
pour `<pièce>.html` — donc sur le comportement d'avant l'étape 2 tant que ce
cache vit, pas sur le code déposé à l'étape 2. C'est toujours un retour au
comportement connu de l'occupant ; ce n'est plus « le même code, octet pour
octet ». Les pages historiques partent à l'étape 8, et ce décalage avec elles.

#### Aléa du jour

L'hôte a redémarré le 2026-09-27 vers 21 h 36 (hors de cette session ;
`uptime` 5 min à 21 h 41), Home Assistant avec lui. Tablette du salon hors
ligne à 21 h 40 (API Fully Kiosk injoignable). Sans effet sur l'étape 5,
qui ne touche que la cuisine ; à revérifier avant l'étape 7.

#### État à la clôture du 2026-09-27, et le geste qui reste

**Rien n'a changé sur l'hôte.** Mesuré juste avant la tentative :
`www/wallpanel/` identique à `dist/` de la branche (11 fichiers,
`v=26fbd8a667`), `custom_components/home_desk/` différent de la branche
seulement par ce correctif (`page.py`, `__init__.py`, `const.py`),
`GET /home_desk/tablette` → **404** (la vue n'existe pas encore), 1 802
entités, entrée « Tablettes murales » chargée avec ses trois écrans. Cuisine
et bureau sur leurs pages historiques ; salon hors ligne.

Le redépôt a été refusé par le garde-fou du harnais (« Production Deploy »),
comme la première tentative de l'étape 1 le 2026-09-14 : l'autorisation du
propriétaire était relayée par un agent, pas donnée à cette session. Le geste
reste à faire **par le propriétaire, ou par une session qu'il autorise
lui-même** — dans cet ordre, chaque porte avant la suivante :

1. Instantané de l'état déployé, même convention qu'au § 1.3 :
   `backups-home-desk-20260927/` (`wallpanel/`, `custom_components/home_desk/`,
   `home_desk.yaml`), `diff -r` contre la cible, même système de fichiers.
2. `git archive <commit> | tar -x -C <rép. temporaire>`, puis
   `echo '{}' | python3 <rép. temporaire>/hooks/install.py --phase install --root /`.
3. **Porte avant redémarrage** : `check_config` code 0 ; 11 fichiers dans
   `www/wallpanel/`, aucun `.new`/`.old` ; `custom_components/home_desk/page.py`
   présent.
4. Redémarrer Home Assistant (§ 3, point 1 : coupe toute la maison — l'heure
   est à choisir et à écrire).
5. **Porte après redémarrage** : entités au même compte ; entrée « Tablettes
   murales » `loaded`, trois écrans ; `curl -sI .../home_desk/tablette` rend
   `200` et `Cache-Control: no-cache`, et le corps nomme le `?v=` de `dist/`.
6. **Retour arrière** : le mouvement atomique de l'étape 2 appliqué aux deux
   arbres de l'instantané (`wallpanel/` et `custom_components/home_desk/`),
   `check_config`, redémarrer.

Puis l'étape 5 reprend telle qu'écrite au § 4, avec l'URL corrigée.

### Compte rendu de la reprise de l'étape 5 — 2026-09-28, 09 h 53 à 10 h 13

**Le geste.** Appareil résolu depuis `sensor.tablette_cuisine_current_page`
(`device_id`, appareil actif), jamais par son libellé. Capture de référence à
09 h 53 sur la page historique. `fully_kiosk.set_config` `startURL` =
`http://<hôte-HA>:8123/home_desk/tablette?ecran=Cuisine`, puis
`button.tablette_cuisine_load_start_url` : bascule constatée à 09 h 54 min 18.

**Ce qui passe — et c'est la cause n°2 levée en production.** La cuisine rend
**tous** ses états par `?ecran=` : météo « 19° » et « Il fait 21,3° ici »,
« Hotte / Éteint », « Rideau / Ouvert 9 % », « Courses / 15 », Entretien
3 tâches, « Tout est fermé — fenêtre ouverte, 22 produits à consommer », thème
clair. Tout ce qui manquait le 2026-09-14 est là. Document servi : `200`,
`no-cache`, `v=42af4fc6f0` = `dist/` au commit déployé.

**Porte, point par point.**

| Critère | Résultat |
|---|---|
| Empreinte servie = `dist/` | ✅ |
| L'écran se lève, pas bloqué sur l'attente | ✅ |
| Capture comparée à la référence | ⚠️ une tuile de plus : « Recette / Garde-manger non installé » — **message faux**, voir défaut A |
| `verifier-rendu.mjs --deploye`, forme `ecran` | 5 fautes. 4 identiques sur la forme historique **et** sur les sources de `9fd0455` (recette réduite ×2, mode média, rail de progression : modes non atteints avec l'état du jour) — antérieures, sans lien avec la migration. 1 propre à la forme neuve : `MOUVEMENT` — `etiquette`, `groupe` apparaissent sans `data-mvt`. |
| Dégradation `?ecran=` absent / inconnu | ✅ « Quel écran ? » et la liste Salon, Bureau, Cuisine |
| Dégradation aucun écran configuré | ✅ « Aucun écran configuré » et où aller |
| Dégradation version inconnue / écran corrompu | ✅ « Configuration illisible » / « Configuration invalide », le geste nommé |
| Dégradation intégration absente | ✅ « Intégration absente », le geste nommé |
| **Dégradation HA injoignable au démarrage** | ❌ **reste sur « Chargement de la configuration… » indéfiniment** (sondé 60 s, 6 tentatives websocket) — voir défaut B |

Les dégradations ont été sondées dans un navigateur headless contre
l'instance réelle, les pannes simulées par interception du websocket dans le
navigateur (`page.routeWebSocket`) : aucune écriture dans Home Assistant.

**Défaut A — « Garde-manger non installé » quand aucun repas n'est planifié.**
`home_stock` est installé et chargé ; `sensor.home_stock_next_meal` vaut
`unknown` parce que le plan de repas est vide. `etat.estUtilisable()` confond
`unknown` (le capteur existe, rien à dire) et `unavailable` / absent
(l'intégration manque), et `absenceNommee` affiche alors un diagnostic faux.
Le même bundle le montre sur la page historique hors cache : ce n'est pas le
chemin `?ecran=`, c'est le bundle — la capture historique de la tablette ne
l'a pas parce qu'elle exécute encore un bundle ancien en cache.

**Défaut B — HA injoignable au démarrage : l'écran d'attente ne cède jamais.**
`startScreen` attend `cx.prete()`, qui ne se résout qu'au premier `auth_ok` et
ne rejette jamais (la reconnexion de `Connexion` est interne). Le `catch` qui
affiche `startupError()` et réarme le recul exponentiel n'est donc jamais
atteint : la spec promet « l'écran d'attente, puis le bandeau hors ligne ».
La tablette se rétablirait seule au retour de HA, mais sans jamais dire
qu'elle attend le réseau.

**Le retour arrière.** 10 h 12 min 05 : `startURL` remise à la valeur relevée
à l'étape 1 (`.../local/wallpanel/cuisine.html`), rechargement ; page
constatée à 10 h 12 min 37. Capture de contrôle : identique à la référence de
09 h 53. **Dix-neuf minutes sur la nouvelle URL, aucune perte pour
l'occupant.**

**État de la maison à la clôture :** les trois tablettes sur leurs pages
historiques ; composant et bundle de `3ba7dec` déployés ; la vue
`/home_desk/tablette` servie et prête. L'étape 5 se rejoue telle quelle après
correction des défauts A et B (et, au choix du propriétaire, du marquage
`MOUVEMENT`).
