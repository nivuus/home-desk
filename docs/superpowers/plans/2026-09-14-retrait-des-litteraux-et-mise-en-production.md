# Plan 3c — Retrait des littéraux et mise en production

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire migrer la configuration des trois écrans du code TypeScript vers Home Assistant, la vérifier contre l'instance réelle, vivre avec, puis retirer les littéraux — et terminer le chantier installé sur l'instance de cette maison.

**Architecture:** Trois phases qui ne se mélangent pas. **Phase 1** (dépôt, tâches 1-5) livre la dernière porte de saisie manquante, l'outil d'export jetable et ses trois épreuves de fidélité, et le lot de portabilité — sans rien changer à ce que les tablettes affichent. **Phase 2** (production, tâches 6-7) exécute le dossier de mise en production contre l'instance réelle, étape par étape, chacune avec son retour arrière ; elle n'est **pas** du travail de sous-agent. **Phase 3** (dépôt, tâches 8-11) bascule les tests sur un triplet d'écrans de référence, retire les littéraux, l'outil, ses épreuves, les trois pages historiques et la branche de transition `data-piece` dans un seul commit, puis redéploie.

**Tech Stack:** TypeScript 5.9 / vitest 2.1 / rollup (application) ; Python 3.14 / voluptuous / pytest-homeassistant-custom-component (composant Home Assistant 2026.9.1) ; python3 + PyYAML seulement (suite paquet) ; esbuild 0.25 et l'API du compilateur TypeScript (outil d'export jetable) ; Fully Kiosk et `docker exec homeassistant` (production).

**Spec:** `docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`, amendée le 2026-09-13. Lire en particulier « La migration », « La mise en production » et « Ce qui reste ouvert » : ce plan est l'exécution de ces trois sections.

**Plans antérieurs, tous fusionnés dans `main` :** `2026-09-12-contrats-partages.md` (plan 1), `2026-09-12-agencement-donnee.md` (plan 2), `2026-09-12-integration-home-desk.md` (plan 3a), `2026-09-13-application-lit-la-config.md` (plan 3b). Ce plan est le dernier de la série.

---

## Global Constraints

Copiées de la spec et de `CLAUDE.md`. **Les exigences de chaque tâche incluent implicitement cette section.**

- **Tout le code est en anglais** — identifiants, commentaires, docstrings, messages de commit — même si la conversation est en français. **MAIS** : les chaînes utilisateur de l'**application** sont du **français accentué** (usage établi : `sessionAbsente()`, `erreurDemarrage()`), et les messages Python du **composant** restent du **français sans accents** (diagnostic développeur pour le journal HA).
- **Aucun fichier source au-dessus de 500 lignes.** Quand un fichier approche, on le coupe à une **couture réelle** — un module, une responsabilité, une frontière — jamais à un nombre de lignes.
- **Ne jamais écrire dans `/opt/nivuus/`** depuis le dépôt ou depuis un test. Le seul écrivain légitime est le moteur d'installation `nivuus`, lancé par l'opérateur.
- **Ne jamais lire, afficher ni committer `HA_TOKEN`.**
- **Rien de cette maison n'entre dans `contrat/`** : aucun `entity_id`, aucun nom de pièce, aucune URL, aucun jeton. `contrat/` décrit des FORMES.
- **`make test` reste `python3` + PyYAML seulement** — c'est ce qui le rend lançable sur la cible d'installation, qui n'a rien d'autre. Pas de pytest, pas de dépendance tierce. (`make test-composant` est pytest et tire Home Assistant complet ; `make test-app` est vitest. Trois suites, délibérément séparées.)
- **Après toute modification de `contrat/` : `make contrat`, et committer le résultat.** Sans ce geste, la copie embarquée `custom_components/home_desk/contrat/` reste périmée.
- **Le site d'écriture unique** : les sept portes d'écriture de Home Assistant ne s'appellent que depuis `garde_ecran.py` (`tests/composant/test_garde_ecran.py`, table `_PORTES_ECRITURE`, garde AST). **`formulaire.py` est le seul module autorisé à appeler `async_show_form(..., data_schema=...)`** (`tests/composant/test_config_flow.py`, garde AST). Ne pas les contourner.
- **`make test-composant` exige Python ≥ 3.14.** Le `python3` du système est 3.13.5. Geste complet :
  `make test-composant PYTHON=/root/.local/share/uv/python/cpython-3.14.3-linux-x86_64-gnu/bin/python3.14`
- **`dist/` est versionné et `tests/test_dist_a_jour.py` le garde** en relançant `npm run build` et en comparant à HEAD **commité**. Donc : `npm --prefix app run build`, puis `git add dist`, puis `git commit`, **puis** `make test`. Dans cet ordre, sans exception.
- **`git stash` est interdit dans ce dépôt** (pile partagée entre worktrees ; incident déjà payé). Committer, ou laisser sale.
- **Ajouter les chemins explicitement aux commits.** Jamais `git add -A`.

### Les quatre leçons de test, payées douze fois sur la branche 3a

Elles s'appliquent à chaque tâche, et un relecteur les fait respecter :

1. **Un test qui NOMME un identifiant ne garde pas une CAPACITÉ.** Vérifier qu'une fonction existe ne prouve pas qu'elle est appelée sur le chemin réel.
2. **Un test qui épingle la MOITIÉ d'un message laisse l'autre moitié mentir.**
3. **Un décor trop pauvre rend un test aveugle.** Un seul écran au décor ne peut pas prouver qu'un filtre par nom filtre.
4. **La mutation prouve qu'une règle est gardée, jamais que c'est la bonne règle.** Chaque tâche de ce plan nomme au moins une mutation à exécuter, et le rapport d'implémenteur donne la sortie réelle du test qui tombe.

Corollaire découvert en 3b, et qui a coûté un défaut : **un test qui garde un MODULE ne garde pas son BRANCHEMENT.** Un calcul juste, exécuté, mesuré, mais qui n'atteint aucun écran, est un calcul mort. Et : **une mesure écrite dans un document n'est vraie qu'au commit où elle est prise** — quand un correctif touche ce qu'un autre mesure, l'ordre des commits devient une dépendance.

---

## L'état mesuré au 2026-09-14

Tout ce qui suit est **mesuré sur `main` à `6a34a16`**, pas cité de mémoire. Les tâches s'appuient sur ces chiffres, et un chiffre qui aurait bougé fait tomber un test nommément, avec un nombre.

| Fait | Valeur mesurée | Commande |
|---|---|---|
| `app/src/ecran.ts` | **551 lignes** | `wc -l app/src/ecran.ts` |
| `entity_id` distincts dans `ecran.ts` | **54** | `grep -ohE "'[a-z_]+\.[a-z0-9_]+'" app/src/ecran.ts \| sort -u \| wc -l` |
| …occurrences | **113** | même grep sans `sort -u` |
| …par domaine | 9 `binary_sensor`, 7 `sensor`, 7 `media_player`, 7 `light`, 4 `todo`, 4 `script`, 3 `timer`, 3 `input_text`, 2 `vacuum`, 2 `fan`, 2 `cover`, 2 `button`, 1 `lock`, 1 `climate` | `… \| sort -u \| cut -d. -f1 \| sort \| uniq -c` |
| `entity_id` distincts dans tout `app/src/` | **69** | même grep sur `app/src/` |
| **Reliquat après ce plan** | **15** — 14 propres à cette maison, plus `sun.sun` | 69 − 54 |
| Plages de commentaire dans `ecran.ts` | **178** (27 blocs `/* */`, 151 lignes `//`) | scanner TypeScript, cf. tâche 3 |
| …lignes de commentaire | **286** | idem |
| …plages multilignes | **21** | idem |
| Fichiers de tests lisant `ECRANS` | **14** (la spec disait 12) | `grep -rl ECRANS app/tests/` |
| …références | **311** (la spec disait 292) | `grep -roh ECRANS app/tests/ \| wc -l` |
| …par fichier | `corps` 76, `ecran` 52, `demarrage` 48, `contrat-schema` 28, `orchestration` 27, `maison` 17, `modes` 16, `nuit` 13, `budget` 9, `agencement` 9, `page` 5, `navigation` 5, `cochage` 5, `repli` 1 | boucle `grep -o` par fichier |
| `dist/` | **quatre HTML** : `index.html`, `salon.html`, `bureau.html`, `cuisine.html` | `ls dist/*.html` |
| Suites vertes à `266ec5d` | `make test` **5/5** ; `npm --prefix app test` **52 fichiers / 1114 tests** ; `make test-composant` **248** | les trois cibles |
| `config_flow.py` | **499 lignes sur 500** — marge de UNE ligne | `wc -l` |
| `objets.py` | **330 lignes** — c'est là que va la troisième section « objet » | `wc -l` |
| `app/src/demarrage.ts` | **2032 lignes** — quatre fois la limite | `wc -l` |
| `app/outils/verifier-rendu.mjs` | **4654 lignes**, mode `--deploye` en place | `wc -l` |
| `yaml_ecrans.py` | n'importe que `yaml` — **aucune dépendance Home Assistant** | `grep -n "^import\|^from"` |
| `esbuild` / `typescript` | **0.25.12** / **5.9.3**, tous deux dans `app/node_modules` | `package.json` |

**Ce qui a changé depuis la spec, et qu'il faut savoir :** le plan 3b a livré la branche de transition (`app/src/page.ts`), l'`index.html` unique avec `?ecran=`, les cinq dégradations, le rechargement à chaud, et les trois champs racine `aspirateur` / `listesTachesExtra` / `delorean`. Le compte de fichiers de tests est passé de 12 à 14 et celui des références de 292 à 311, **parce que 3b en a ajouté deux** (`page.test.ts`, `repli.test.ts`) — et ces deux-là testent la branche de transition, donc leurs six références **meurent avec elle**, elles ne se migrent pas.

---

## Ce que ce plan NE fait PAS, et pourquoi

À dire avant de commencer, pour qu'un implémenteur n'élargisse pas le périmètre de sa propre initiative.

1. **Il ne prend pas les 15 `entity_id` résiduels.** Ils vivent dans `rendu/maison.ts` (la table `TOUTE_LA_MAISON`), `demarrage.ts` (les quatre `calendar.*`, `weather.maison`, `input_boolean.mode_invites`, `input_number.duree_minuteur_cuisine`, `sun.sun`), `alertes.ts`, `garde-manger.ts`, `rendu/defaut.ts`, `rendu/bandeau.ts`, `rendu/nuit.ts`. L'objectif 1 amendé porte sur **la configuration d'écran, pas sur l'inventaire de la maison** : les prendre serait trois champs de contrat neufs (`alertes`, `toutLaMaison`, `calendriers`) plus quatre littéraux isolés — un quatrième plan, pour une portabilité vers une AUTRE maison que rien n'indique être demandée.
2. **Il ne découpe pas `app/src/demarrage.ts`** (2032 lignes, quatre fois la limite de 500). C'est une dette réelle et nommée, mais la découper **pendant** cette migration détruirait la propriété sur laquelle repose tout le retour arrière de la production : « remettre l'ancienne `startURL` rend le comportement d'avant, **octet pour octet**, puisque c'est littéralement le même code ». Refactorer le module sous la migration, c'est retirer le filet en marchant dessus. À ouvrir **après** le redéploiement de la tâche 11, dans son propre chantier, avec sa propre relecture.
3. **Il n'ouvre pas de vue « Réglages » sur la tablette** (écrire la config depuis l'écran). Hors périmètre de la spec ; l'architecture ne l'interdit pas — ce serait un service de plus sur le même composant.
4. **Il ne répare pas la dette d'environnement du CLI `ha`** (commandes WebSocket cassées, `aiohttp` manquant au `python3` système). On la contourne par REST ou `docker exec`, c'est une dette de `home-stock`.

---

## Les arbitrages que ce plan tranche

La spec laisse trois choses « à trancher en écrivant le plan ». Les voici tranchées, avec leur argument, pour qu'un implémenteur n'ait pas à deviner.

### A. Trois écrans de référence, pas un seul riche

*Question ouverte de la spec : « Le nombre d'écrans de référence dans `tests/aides.ts` (trois, comme aujourd'hui ? un seul, riche ?) ».*

**Trois.** Un seul écran riche ferait tomber en silence toute une classe de tests : ceux qui affirment un **contraste** entre écrans. Mesuré — `ecran.test.ts:109-110` affirme que `salon` et `bureau` ne déclarent PAS `aspirateurMaison` pendant que `cuisine` le déclare ; `maison.test.ts:252` repose sur la même opposition ; `modes.test.ts` et `nuit.test.ts` comparent des écrans qui n'atteignent pas les mêmes modes. Avec un seul écran, ces tests ne deviennent pas faux : ils deviennent **vides**, ce qui est pire, parce que rien ne le dit.

Le triplet est donc conçu par contraste délibéré, et **il ne décrit pas cette maison** — c'est précisément ce qui prouve que les tests ont cessé d'affirmer des choses sur elle :

| Écran de référence | Ce qu'il porte | Ce qu'il prouve |
|---|---|---|
| `ecranRiche` (`nom: 'Alpha'`) | toutes les sections peuplées : `commandes`, `ambiances`, `synthese`, `minuteurs`, `sources`, `ouvrants`, `extrasMaison`, `listesTachesExtra`, `aspirateurMaison`, `voiture`, `delorean`, `aspirateur` | le chemin où tout est déclaré |
| `ecranMoyen` (`nom: 'Beta'`) | `commandes`, `ambiances`, `synthese`, `agenda`, une `absenceNommee` — **ni `voiture`, ni `aspirateurMaison`, ni `delorean`** | le contraste : ce qui est optionnel est vraiment optionnel |
| `ecranMinimal` (`nom: 'Gamma'`) | le strict minimum que le contrat exige, rien de plus | qu'un écran nu rend sans planter |

`ecranVide` (`app/tests/aides.ts:14`) **reste** : il sert de socle littéral aux 38 fichiers qui construisent leurs propres `Ecran`, et il n'est pas remplacé.

### B. La production ne s'exécute pas en sous-agent

Les tâches 6 et 7 touchent une instance Home Assistant en service, trois tablettes au mur, et comportent un redémarrage qui coupe brièvement toute la maison. Aucune n'est déléguée : le coordinateur les mène **avec le propriétaire**, une étape à la fois, et **s'arrête** à chaque porte de vérification. C'est le point où la règle « les opérations irréversibles ou à effet de bord externe s'arrêtent et demandent » mord pour de bon.

### C. `contrat/budget.json` est clos

*Question ouverte de la spec : « Le format exact de `contrat/budget.json` ».* Elle est **fermée depuis le plan 1** : le fichier existe, `custom_components/home_desk/budget.py` le lit, `app/src/agencement.ts` aussi, et le corpus partagé `contrat/cas-budget.json` est lu par les deux suites. Rien à trancher ici ; l'entrée reste dans la spec comme trace.

---

## Structure des fichiers

**Créés, puis DÉTRUITS dans ce même plan** (tâche 10) — ils portent tous `JETABLE` en tête de fichier :

| Fichier | Responsabilité | Meurt en |
|---|---|---|
| `app/outils/exporter-ecrans.mjs` | évalue `ECRANS` via esbuild, émet le JSON des trois écrans **et** le registre des 178 plages de commentaire | tâche 10 |
| `outils/rendre-ecrans-yaml.py` | lit ce JSON, rend le YAML par `yaml_ecrans.rendre()` — jamais par un rendeur maison | tâche 10 |
| `app/tests/migration-donnee.test.ts` | épreuve de niveau 1 : égalité champ par champ + les deux dénombrements | tâche 10 |
| `app/tests/migration-rendu.test.ts` | épreuve de niveau 3 : le DOM rendu depuis `ECRANS` égale le DOM rendu depuis le transport | tâche 10 |
| `tests/test_registre_commentaires.py` | épreuve de niveau 2 : le registre est exhaustif (178 = attachées + types + orphelines) | tâche 10 |

**Créés et qui restent :**

| Fichier | Responsabilité |
|---|---|
| `tests/composant/test_config_flow_aspirateur_maison.py` | la dernière porte de saisie racine |
| `tests/test_portabilite_app.py` | la garde qui cherche les IP et les secrets dans `app/`, là où aucune garde ne regardait |
| `docs/superpowers/production/2026-09-14-mise-en-production-3c.md` | le dossier de production : relevé, ordre, retours arrière, journal d'exécution |

**Modifiés :**

| Fichier | Ce qui change | Tâche |
|---|---|---|
| `app/src/rendu/maison.ts` | la substitution `aspirateurMaison` s'appuie sur une **identité nommée**, plus sur un littéral d'entité | 1 |
| `custom_components/home_desk/objets.py` | troisième section « objet » : `aspirateur_maison` | 1 |
| `custom_components/home_desk/config_flow.py:393` | une entrée de menu de plus | 1 |
| `custom_components/home_desk/translations/{fr,en}.json` | libellés de la nouvelle section | 1 |
| `app/src/styles/base.css:38-39`, `app/outils/verifier-rendu.mjs:1012-1013`, `app/README.md:18-20` | les trois IP de tablettes | 5 |
| `tests/test_dist_portable.py:76` | `"192.168.0.1"` devient un motif qui attrape vraiment les trois IP | 5 |
| `nivuus-package.yaml` | « les 66 `entity_id` en dur » — chiffre périmé | 5 |
| `app/tests/aides.ts` | le triplet d'écrans de référence | 8 |
| les 12 fichiers de tests qui lisent `ECRANS` | basculent sur le triplet | 8, 9 |
| `app/src/ecran.ts` | **les littéraux partent**, le TYPE reste | 10 |
| `app/src/page.ts` | la branche de transition `data-piece` part | 10 |
| `app/scripts/generer-pages.mjs`, `app/gabarits/piece.html` | les trois pages historiques partent | 10 |
| `README.md`, `app/README.md`, `CLAUDE.md` | les gestes opérateur, les régressions nommées, les dettes fermées | 10, 11 |

---

# Phase 1 — le dépôt, avant de toucher à la production

Rien de cette phase ne change ce que les trois tablettes affichent. C'est délibéré : tout ce qui suit doit être en place, vert et committé **avant** l'étape 1 de la mise en production.

---

### Task 1: `aspirateurMaison` — le littéral d'abord, la porte de saisie ensuite

Le dernier des quatre champs racine du contrat sans porte de saisie. `CLAUDE.md` nomme le blocage exact : *« Son vrai blocage est le littéral `'vacuum.aspirateur_cuisine'` écrit en dur dans `rendu/maison.ts` : le rendre éditable depuis Home Assistant avant de traiter ce littéral livrerait un bouton à demi mort. »* **L'ordre des étapes de cette tâche est donc la tâche elle-même** : le littéral d'abord, la saisie ensuite.

Le défaut est précis. `app/src/rendu/maison.ts:79` fait :

```ts
...TOUTE_LA_MAISON.map((b) => (b.entite === 'vacuum.aspirateur_cuisine' && piece.aspirateurMaison)
  ? piece.aspirateurMaison : b),
```

La table `TOUTE_LA_MAISON` **reste dans le dépôt** (c'est l'inventaire de la maison, pas la configuration d'écran — objectif 1 amendé), et son entrée « Aspirateur » porte légitimement `vacuum.aspirateur_cuisine` ligne 45. Ce qui ne va pas, ce n'est pas le littéral de la table : c'est que la **comparaison** le recopie. Deux écritures du même fait, à quinze lignes d'écart, dont l'une peut changer sans l'autre — et alors `aspirateurMaison`, saisi depuis Home Assistant, ne remplacerait plus rien, **sans un mot**.

**Files:**
- Modify: `app/src/rendu/maison.ts:25-46` (export d'une entrée nommée), `:78-81` (la comparaison)
- Modify: `custom_components/home_desk/objets.py` (troisième section « objet »)
- Modify: `custom_components/home_desk/config_flow.py:393` (une entrée de menu)
- Modify: `custom_components/home_desk/translations/fr.json`, `custom_components/home_desk/translations/en.json`
- Test: `app/tests/maison.test.ts` (ajouts), `tests/composant/test_config_flow_aspirateur_maison.py` (créé)

**Interfaces:**
- Consomme : `Bouton`, `Ecran` (`app/src/ecran.ts`) ; `schema.BOUTON`, `_schema_bouton(editable: bool) -> vol.Schema`, `_construire_donnee_bouton(user_input: dict, existant: dict | None) -> dict`, `_afficher_bouton(valeur: dict | None) -> dict`, `ChampVide`, `ServiceIncomplet` (`listes_champs.py`) ; `garde_ecran.persister_si_valide(...)` ; `formulaire.reafficher(...)` ; `registre.avertissement_entites_inconnues`, `registre.entites_dans`.
- Produit : `export const ASPIRATEUR_GENERIQUE: Bouton` depuis `app/src/rendu/maison.ts` — l'entrée de `TOUTE_LA_MAISON` que `piece.aspirateurMaison` remplace. Et le step `aspirateur_maison` du flow de sous-entrée.

- [ ] **Step 1: Écrire le test qui échoue — la substitution ne doit PAS dépendre de la valeur de l'entité**

Dans `app/tests/maison.test.ts`, à la suite des tests existants sur `aspirateurMaison` :

```ts
import { rendreMaison, TOUTE_LA_MAISON, ASPIRATEUR_GENERIQUE } from '../src/rendu/maison';

describe('aspirateurMaison : la substitution est nommée, pas devinée', () => {
  const entiteOrigine = ASPIRATEUR_GENERIQUE.entite;
  afterEach(() => { ASPIRATEUR_GENERIQUE.entite = entiteOrigine; });

  it("l'entrée générique est bien DANS la table commune", () => {
    expect(TOUTE_LA_MAISON).toContain(ASPIRATEUR_GENERIQUE);
  });

  it('remplace l’entrée générique même si celle-ci change d’entité', () => {
    // LA mutation que ce test existe pour attraper : une comparaison écrite
    // `b.entite === 'vacuum.aspirateur_cuisine'` passe le test du dessus et
    // TOMBE ici, parce que la table a bougé et pas la comparaison.
    ASPIRATEUR_GENERIQUE.entite = 'vacuum.un_autre_appareil';
    const piece = { ...ecranVide, aspirateurMaison: {
      libelle: 'Aspirer ici', icone: 'aspirateur' as const,
      entite: 'vacuum.local', service: ['vacuum', 'start'] as [string, string],
    } };
    const etat = etatQuiRendTout();   // aide locale du fichier : tout est utilisable
    const html = rendreEnChaine(rendreMaison(etat, piece));
    expect(html).toContain('Aspirer ici');
    expect(html).not.toContain('>Aspirateur<');
  });
});
```

> **Note à l'implémenteur.** `etatQuiRendTout()` et `rendreEnChaine()` sont les aides **déjà présentes dans ce fichier** — lisez-les avant d'écrire, et réutilisez les noms réels du fichier plutôt que ceux-ci s'ils diffèrent. N'en créez pas de nouvelles : `maison.test.ts` monte déjà `rendreMaison` une quinzaine de fois.

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npm --prefix app test -- maison`
Expected: FAIL — `ASPIRATEUR_GENERIQUE` n'est pas exporté (erreur d'import), et le second test échouerait de toute façon puisque la comparaison littérale ne reconnaît plus l'entrée.

- [ ] **Step 3: Nommer l'entrée, comparer par identité**

Dans `app/src/rendu/maison.ts`, extraire la dernière entrée de la table et la comparer par identité :

```ts
/** L'entrée générique de `TOUTE_LA_MAISON` que `piece.aspirateurMaison` REMPLACE quand il est
 *  déclaré (jamais une tuile de plus — arbitrage du propriétaire, 2026-08-03).
 *
 *  Exportée et comparée PAR IDENTITÉ, pas par sa valeur d'entité : depuis que `aspirateurMaison`
 *  se saisit depuis Home Assistant (plan 3c, tâche 1), une comparaison `b.entite === 'vacuum.…'`
 *  recopiait le même fait à quinze lignes de sa source, et la tuile saisie cessait de remplacer
 *  quoi que ce soit — en silence — le jour où la table changeait d'aspirateur. */
export const ASPIRATEUR_GENERIQUE: Bouton = {
  libelle: 'Aspirateur', icone: 'home', entite: 'vacuum.aspirateur_cuisine',
  service: ['vacuum', 'start'],
};

export const TOUTE_LA_MAISON: Bouton[] = [
  // … les neuf entrées inchangées, dans l'ordre ; l'entrée « Aspirateur » littérale
  // est REMPLACÉE par la référence ci-dessous, à la même place, en dernier.
  ASPIRATEUR_GENERIQUE,
];
```

et, dans `rendreMaison` :

```ts
  const boutons = [
    ...TOUTE_LA_MAISON.map((b) => (b === ASPIRATEUR_GENERIQUE && piece.aspirateurMaison)
      ? piece.aspirateurMaison : b),
    ...piece.extrasMaison,
  ];
```

- [ ] **Step 4: Lancer la suite application entière**

Run: `npm --prefix app test`
Expected: PASS — **52 fichiers**, et le compte de tests monte de 2. Aucun autre fichier ne doit bouger : la valeur rendue est identique, seule la manière de désigner l'entrée a changé.

- [ ] **Step 5: Reconstruire `dist/` et committer les deux ensemble**

```bash
npm --prefix app run build
git add app/src/rendu/maison.ts app/tests/maison.test.ts dist
git commit -m "fix(app): name the generic vacuum tile instead of matching its entity"
make test
```

Expected: `make test` **5/5** — `test_dist_a_jour` compare le build à HEAD **commité**, d'où le `git commit` AVANT.

- [ ] **Step 6: Écrire le test qui échoue côté composant**

Créer `tests/composant/test_config_flow_aspirateur_maison.py` :

```python
"""La troisieme section « objet » : `aspirateurMaison`, un Bouton UNIQUE.

Le dernier des quatre champs racine du contrat a recevoir une porte de
saisie (plan 3c, tache 1) ; les trois autres -- `aspirateur`,
`listesTachesExtra`, `delorean` -- ont ete ouverts par la tache 7 du plan 3b.
Meme forme que `voiture` (objets.py) : un objet entier rejoue a chaque
soumission, et une case pour le RETIRER plutot que de laisser des champs
vides."""
from homeassistant import data_entry_flow

from conftest import _creer_ecran, _init_reconfigure
from custom_components.home_desk.const import ERREUR_CHAMP_VIDE, ERREUR_SERVICE_INCOMPLET

BOUTON = {
    "libelle": "Aspirer ici",
    "icone": "aspirateur",
    "entite": "vacuum.piece_a",
    "service_domaine": "vacuum",
    "service_action": "start",
}


async def _soumettre(hass, entree, subentry_id, donnees):
    flow = await _init_reconfigure(hass, entree, subentry_id)
    await hass.config_entries.subentries.async_configure(
        flow["flow_id"], {"next_step_id": "aspirateur_maison"})
    return await hass.config_entries.subentries.async_configure(flow["flow_id"], donnees)


async def test_le_bouton_est_persiste_avec_son_service_recompose(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    resultat = await _soumettre(hass, entree, subentry_id, BOUTON)
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["aspirateurMaison"] == {
        "libelle": "Aspirer ici", "icone": "aspirateur",
        "entite": "vacuum.piece_a", "service": ["vacuum", "start"],
    }, "les deux champs service_* se recomposent en TABLEAU, comme partout ailleurs"


async def test_une_paire_service_a_demi_remplie_est_refusee_sans_rien_persister(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    demi = {**BOUTON}
    del demi["service_action"]
    resultat = await _soumettre(hass, entree, subentry_id, demi)
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["service_action"] == ERREUR_SERVICE_INCOMPLET
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert "aspirateurMaison" not in subentry.data


async def test_un_libelle_fait_d_espaces_est_refuse(hass, entree):
    subentry_id = await _creer_ecran(hass, entree)
    resultat = await _soumettre(hass, entree, subentry_id, {**BOUTON, "libelle": "   "})
    assert resultat["type"] is data_entry_flow.FlowResultType.FORM
    assert resultat["errors"]["libelle"] == ERREUR_CHAMP_VIDE


async def test_cocher_sans_aspirateur_maison_retire_la_cle_entierement(hass, entree):
    """`not in`, jamais `is None` : le contrat decrit un objet ABSENT, pas une
    valeur nulle. `data_updates=` ferait une UNION et garderait la cle."""
    subentry_id = await _creer_ecran(hass, entree)
    await _soumettre(hass, entree, subentry_id, BOUTON)
    resultat = await _soumettre(
        hass, entree, subentry_id, {**BOUTON, "sans_aspirateur_maison": True})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert "aspirateurMaison" not in subentry.data


async def test_une_entite_inconnue_AVERTIT_au_lieu_de_REFUSER(hass, entree):
    """Decision 7 de la spec, quatrieme-et-maintenant-cinquieme cablage. La
    PHRASE, pas seulement la liste nue : `avertissement_entites_inconnues`
    passe par le cache de traductions, et un repli silencieux sur la liste
    seule est exactement le mode de panne que C1 a corrige en 3b."""
    subentry_id = await _creer_ecran(hass, entree)
    resultat = await _soumettre(
        hass, entree, subentry_id, {**BOUTON, "entite": "vacuum.nexiste_absolument_pas"})
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    subentry = hass.config_entries.async_get_entry(entree.entry_id).subentries[subentry_id]
    assert subentry.data["aspirateurMaison"]["entite"] == "vacuum.nexiste_absolument_pas", (
        "un AVERTISSEMENT ne refuse pas : la valeur est persistee")
    placeholders = resultat["description_placeholders"]
    assert "vacuum.nexiste_absolument_pas" in placeholders["entites_inconnues"]
    assert "vérifier" in placeholders["entites_inconnues"], (
        "la phrase de traduction, pas la liste nue -- et l'accent EST dans la chaine "
        "francaise de l'application (`fr.json` : « a verifier » s'ecrit « à vérifier »). "
        "`.lower()` ne retire pas les accents : chercher \"verifier\" nu ne matcherait jamais.")
```

- [ ] **Step 7: Lancer les tests, vérifier qu'ils échouent**

Run: `make test-composant PYTHON=/root/.local/share/uv/python/cpython-3.14.3-linux-x86_64-gnu/bin/python3.14`
Expected: 5 FAILED — le step `aspirateur_maison` n'existe pas ; `_raise_if_step_does_not_exist` refuse le `next_step_id`.

- [ ] **Step 8: Ajouter la troisième section « objet » dans `objets.py`**

`config_flow.py` est à **499 lignes sur 500** : cette section va dans `objets.py` (330 lignes), qui est fait pour ça. **Ne retapez pas les dix champs du bouton** — ils existent une fois, dans `listes_champs.py`, et c'est exactement la règle que ce dépôt applique partout (`schema.py`, `budget.py`, `listes_erreurs.py`).

```python
from .listes_champs import (
    _afficher_bouton, _construire_donnee_bouton, _schema_bouton, ChampVide, ServiceIncomplet,
)

# La case qui RETIRE la section, jamais un champ du contrat : elle ne quitte
# pas ce formulaire (meme doctrine que `sans_voiture`, cf. async_step_voiture).
SCHEMA_ASPIRATEUR_MAISON = _schema_bouton(editable=False).extend(
    {vol.Optional("sans_aspirateur_maison", default=False): selector.BooleanSelector()}
)
```

et la méthode, dans `SectionsObjetMixin`, calquée sur `async_step_voiture` :

```python
    async def async_step_aspirateur_maison(
        self, user_input: dict[str, Any] | None = None
    ) -> SubentryFlowResult:
        """« Aspirateur de la piece » : un Bouton UNIQUE qui REMPLACE l'entree
        generique « Aspirateur » de la vue « Toute la maison »
        (`rendu/maison.ts`, ASPIRATEUR_GENERIQUE) — jamais une tuile de plus.

        Le dernier des quatre champs racine a recevoir sa porte de saisie. Son
        blocage n'etait pas ici mais dans l'application : tant que la
        substitution se faisait par comparaison a un `entity_id` litteral,
        ouvrir ce formulaire livrait un bouton a demi mort. Corrige a l'etape
        precedente de cette meme tache, et dans cet ordre-la."""
        entry = self._get_entry()
        subentry = self._get_reconfigure_subentry()
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}
        existant = subentry.data.get("aspirateurMaison")
        valeurs_affichees = _afficher_bouton(existant)

        if user_input is not None:
            valeurs_affichees = user_input
            if user_input.get("sans_aspirateur_maison"):
                donnees = dict(subentry.data)
                donnees.pop("aspirateurMaison", None)
                if garde_ecran.persister_si_valide(
                    self, entry, subentry, donnees, errors, description_placeholders,
                    section_courante="aspirateur_maison",
                ):
                    return await self.async_step_reconfigure()
            else:
                try:
                    candidat = _construire_donnee_bouton(user_input, existant)
                    valide = schema.BOUTON(candidat)
                except ServiceIncomplet as err:
                    errors[err.champ_vide] = ERREUR_SERVICE_INCOMPLET
                except ChampVide as err:
                    errors[err.champ] = ERREUR_CHAMP_VIDE
                except vol.Invalid as err:
                    champ, mot_cle = _localiser_champ(err)
                    errors[champ] = _ERREUR_PAR_MOT_CLE.get(mot_cle, ERREUR_CHAMP_INVALIDE)
                else:
                    # Decision 7 : AVERTIT, ne refuse jamais. Le placeholder est
                    # TOUJOURS pose (C1 de la relecture finale du 3b) : un
                    # `description_placeholders` sans la cle fait lever HA sur
                    # une description qui la porte.
                    description_placeholders["entites_inconnues"] = (
                        avertissement_entites_inconnues(
                            self.hass, entites_dans(valide, "aspirateurMaison"))
                    )
                    donnees = {**subentry.data, "aspirateurMaison": valide}
                    if garde_ecran.persister_si_valide(
                        self, entry, subentry, donnees, errors, description_placeholders,
                        section_courante="aspirateur_maison",
                    ):
                        return await self.async_step_reconfigure(
                            description_placeholders=description_placeholders
                        )

        return reafficher(
            self, "aspirateur_maison", SCHEMA_ASPIRATEUR_MAISON,
            valeurs_affichees, errors, description_placeholders,
        )
```

> **Pourquoi `aspirateur_maison` et pas `aspirateurMaison`.** Les sections « liste » portent des ids camelCase (`extrasMaison`, `listesTachesExtra`) parce que `__getattr__` les DÉRIVE de la clé du contrat. Ici la méthode est écrite à la main : `async_step_aspirateurMaison` serait un nom de méthode Python en camelCase. L'id du step est donc `aspirateur_maison` et la clé du contrat reste `aspirateurMaison` — la traduction fait le pont.

**Vérifiez que `entites_dans(valide, "aspirateurMaison")` rend bien `["vacuum.piece_a"]`** : `registre.entites_dans` marche le schéma et la valeur EN PARALLÈLE (`SCHEMA_JSON["properties"]["aspirateurMaison"]` est un `$ref` vers `$defs/bouton`). Si le `$ref` n'est pas déréférencé par `entites_dans`, c'est un défaut de `registre.py` à corriger **là-bas**, pas à contourner ici — et il faut alors un test dans `tests/composant/test_registre.py`.

- [ ] **Step 9: Ajouter l'entrée de menu et les traductions**

`config_flow.py:393` :

```python
            menu_options=["identite", *SECTIONS, "agencement", "voiture", "aspirateur_maison"],
```

`translations/fr.json`, dans `config_subentries.ecran.step` :

```json
    "aspirateur_maison": {
      "title": "Aspirateur de la pièce",
      "description": "Remplace la tuile « Aspirateur » générique de la vue « Toute la maison » par un appareil propre à cette pièce. Cochez « Pas d'aspirateur de pièce » pour revenir à la tuile générique.{entites_inconnues}",
      "data": {
        "sans_aspirateur_maison": "Pas d'aspirateur de pièce",
        "libelle": "Libellé", "icone": "Icône", "entite": "Entité", "cible": "Cible",
        "service_domaine": "Service — domaine", "service_action": "Service — action",
        "lien": "Lien", "vue": "Vue", "epingle": "Épinglée",
        "absenceNommee": "Texte quand l'entité est muette", "note": "Note"
      }
    }
```

et dans `config_subentries.ecran.step.reconfigure.menu_options` : `"aspirateur_maison": "Aspirateur de la pièce"`.

`translations/en.json` : les mêmes clés, en anglais.

> **Le placeholder `{entites_inconnues}` est OBLIGATOIRE dans la description.** Un step dont la description porte `{x}` doit **toujours** recevoir `x` — c'est la panne que C1 a corrigée en 3b — et réciproquement, poser le placeholder sans que la description le porte donne un avertissement qui n'atteint aucun écran. Les deux bouts s'apparient, et `tests/composant/test_avertissement_entites.py` les apparie **dans les deux sens, par langue** : votre nouveau step doit y passer sans que vous touchiez ce fichier. S'il faut l'y ajouter à la main, c'est que ce test énumère au lieu de découvrir — corrigez-le pour qu'il découvre.

- [ ] **Step 10: Lancer les tests, vérifier qu'ils passent**

Run: `make test-composant PYTHON=/root/.local/share/uv/python/cpython-3.14.3-linux-x86_64-gnu/bin/python3.14`
Expected: PASS — **253** tests (248 + 5).

- [ ] **Step 11: La mutation, et sa sortie réelle dans le rapport**

Remplacer `valide = schema.BOUTON(candidat)` par `valide = candidat`, relancer, **coller la sortie** dans le rapport, puis restaurer.
Expected: `test_le_bouton_est_persiste_avec_son_service_recompose` ou `test_un_libelle_fait_d_espaces_est_refuse` FAILED. Si **aucun** test ne tombe, la validation n'est gardée par rien : ajoutez le test manquant avant de continuer.

- [ ] **Step 12: Committer**

```bash
git add custom_components/home_desk/objets.py custom_components/home_desk/config_flow.py \
        custom_components/home_desk/translations/fr.json custom_components/home_desk/translations/en.json \
        tests/composant/test_config_flow_aspirateur_maison.py
git commit -m "feat(component): add the last missing root field entry -- aspirateurMaison"
```

- [ ] **Step 13: Fermer la dette dans `CLAUDE.md`**

La section « Dettes connues du composant » porte : *« Un champ racine du contrat n'a toujours aucune porte de saisie : `aspirateurMaison` … Part au plan 3c. »* Remplacer par le constat fermé, en nommant **les deux moitiés** de la correction (le littéral de `rendu/maison.ts` ET le formulaire), parce que c'est l'ordre qui était le piège. Committer.

---

### Task 2: L'outil d'export, moitié DONNÉE

**JETABLE.** Cet outil lit `ECRANS` ; privé de sa donnée à la tâche 10, il ne compile plus. Il est supprimé dans le même commit que les littéraux. Le garder laisserait dans le dépôt un fichier mort qui a l'air vivant — exactement le piège que `CLAUDE.md` nomme pour la génération 1.

**Deux moitiés, deux natures.** Pour la **donnée**, l'outil **évalue** le module au lieu de le relire : `esbuild` compile `src/ecran.ts` en mémoire, on importe `ECRANS`, on sérialise. C'est exact par construction. Un AST qui reconstruirait des valeurs littérales serait un second interpréteur de TypeScript, et c'est précisément là qu'un cas limite disparaît. (L'AST sert à l'autre moitié, les commentaires — tâche 3.)

**Le rendu YAML passe par `yaml_ecrans.rendre()`**, le module Python déjà gardé par les tests de `tests/composant/test_yaml_ecrans.py`. Jamais par un rendeur maison, qui divergerait du lecteur.

**Le fichier produit n'entre JAMAIS dans git** : il porte les 54 `entity_id` et les noms de pièces de cette maison. Il va dans un chemin de travail, puis sur l'hôte, en `config/home_desk_ecrans.yaml` — nom fixé par `const.FICHIER_EXPORT_ECRANS`, le service n'accepte aucun chemin d'appel.

**Files:**
- Create: `app/outils/exporter-ecrans.mjs`
- Create: `app/outils/rendre-ecrans-yaml.py`
- Modify: `.gitignore` (le YAML et le JSON produits)
- Test: `app/tests/migration-donnee.test.ts` arrive à la tâche 4 ; ici, l'outil se prouve par son propre aller-retour

**Interfaces:**
- Consomme : `ECRANS` (`app/src/ecran.ts`), `esbuild` (`app/node_modules`), `yaml_ecrans.rendre` / `yaml_ecrans.lire` (`custom_components/home_desk/yaml_ecrans.py`, qui n'importe que `yaml` — **aucune dépendance Home Assistant**, c'est ce qui permet de l'appeler hors de HA).
- Produit : `app/outils/exporter-ecrans.mjs --json <chemin>` écrit un tableau JSON de trois objets, chacun `{titre, version: 1, ...champs du contrat}`. `app/outils/rendre-ecrans-yaml.py <json> <yaml>` écrit le YAML d'import.

- [ ] **Step 1: Ignorer les produits AVANT de les produire**

Un fichier qui porte les 54 `entity_id` ne doit pas pouvoir être committé par accident. Ajouter à `.gitignore` :

```
# Produits de l'outil d'export du plan 3c (JETABLES, cf. app/outils/exporter-ecrans.mjs).
# Ils portent la configuration REELLE de cette maison : ils ne doivent jamais entrer dans git.
/home_desk_ecrans.yaml
/ecrans-exportes.json
/registre-commentaires.tsv
```

Committer ce seul changement.

- [ ] **Step 2: Écrire la moitié donnée de l'outil**

`app/outils/exporter-ecrans.mjs` :

```js
/** JETABLE — supprimé à l'étape 8 de la mise en production (plan 3c, tâche 10), dans le même
 *  commit que les littéraux d'`ECRANS`, les trois épreuves de fidélité, les trois pages
 *  historiques et la branche de transition `data-piece`.
 *
 *  Cet outil lit `ECRANS` : privé de sa donnée, il ne compile plus. Il n'a aucune raison de
 *  survivre à la migration, et le garder laisserait un fichier mort qui a l'air vivant.
 *
 *  DEUX MOITIÉS, DEUX NATURES DE PREUVE :
 *
 *  - la DONNÉE (ici) est ÉVALUÉE, jamais relue : esbuild compile `src/ecran.ts` en mémoire et on
 *    importe `ECRANS`. Exact par construction. Reconstruire des valeurs depuis l'AST serait
 *    écrire un second interpréteur de TypeScript, et c'est là qu'un cas limite disparaît.
 *  - les COMMENTAIRES (`--registre`, tâche 3) passent par l'AST, parce qu'ils ne survivent pas à
 *    la compilation. Ils ne se comparent à rien : ils se DÉNOMBRENT.
 *
 *  Usage :
 *    node outils/exporter-ecrans.mjs --json ../ecrans-exportes.json
 *    node outils/exporter-ecrans.mjs --registre ../registre-commentaires.tsv
 */
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RACINE = path.resolve(import.meta.dirname, '..');
const VERSION_CONFIG = 1;   // `const.VERSION_CONFIG` côté Python, `schema._const` au contrat.

/** Compile `src/ecran.ts` dans un fichier temporaire et l'importe. On passe par le disque plutôt
 *  que par un `data:` URL pour que les imports relatifs du module résolvent normalement. */
export async function chargerEcrans() {
  const repertoire = await fs.mkdtemp(path.join(os.tmpdir(), 'export-ecrans-'));
  const sortie = path.join(repertoire, 'ecran.mjs');
  await build({
    entryPoints: [path.join(RACINE, 'src', 'ecran.ts')],
    outfile: sortie, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
  });
  try {
    const module = await import(pathToFileURL(sortie).href);
    return module.ECRANS;
  } finally {
    await fs.rm(repertoire, { recursive: true, force: true });
  }
}

/** Un écran du contrat tel que `home_desk.importer` l'attend : les champs du contrat, plus
 *  `version` (que `websocket._resoudre` vérifie EN PREMIER) et `titre` (`ConfigSubentry.title`,
 *  qu'`_async_exporter` place à côté des champs du contrat et qu'`_async_importer` re-extrait). */
function pourImport(ecran) {
  return { titre: ecran.nom, version: VERSION_CONFIG, ...ecran };
}

export function ecransPourImport(ECRANS) {
  return Object.values(ECRANS).map(pourImport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--json');
  if (i === -1 || !process.argv[i + 1]) {
    console.error('usage : node outils/exporter-ecrans.mjs --json <chemin> | --registre <chemin>');
    process.exit(2);
  }
  const ecrans = ecransPourImport(await chargerEcrans());
  await fs.writeFile(process.argv[i + 1], JSON.stringify(ecrans, null, 2) + '\n', 'utf8');
  console.log(`${ecrans.length} écrans écrits dans ${process.argv[i + 1]}`);
}
```

- [ ] **Step 3: Lancer l'outil et regarder ce qu'il produit**

```bash
cd app && node outils/exporter-ecrans.mjs --json ../ecrans-exportes.json
python3 -c "
import json; d=json.load(open('../ecrans-exportes.json'))
print(len(d), [e['nom'] for e in d])
print('entity_id distincts :', len({m for e in d for m in __import__('re').findall(r'\"?([a-z_]+\.[a-z0-9_]+)', json.dumps(e))}))"
```

Expected: `3 ['Salon', 'Bureau', 'Cuisine']` (l'ordre est celui de `Object.values(ECRANS)`, pas une garantie ; ne l'épinglez pas). Le décompte d'`entity_id` doit être **54** — c'est la première confirmation que l'évaluation n'a rien perdu.

- [ ] **Step 4: Écrire le rendeur YAML, qui refuse d'écrire ce qu'il ne peut pas relire**

`app/outils/rendre-ecrans-yaml.py` :

```python
"""JETABLE -- supprime a l'etape 8 de la mise en production (plan 3c, tache 10).

Rend le YAML d'import a partir du JSON produit par `exporter-ecrans.mjs`, PAR
`yaml_ecrans.rendre()` et jamais par un rendeur maison : le lecteur
(`yaml_ecrans.lire`, celui qu'utilise `home_desk.importer`) et l'ecrivain
doivent etre les deux moities du MEME module, sinon ils divergent le jour ou
l'un des deux apprend un cas que l'autre ignore.

`yaml_ecrans.py` n'importe que `yaml` : il se charge PAR SON CHEMIN, sans
passer par `custom_components/home_desk/__init__.py`, qui lui tire Home
Assistant en entier. python3 + PyYAML suffisent -- meme regime que `make test`.

Usage : python3 outils/rendre-ecrans-yaml.py <entree.json> <sortie.yaml>
"""
import importlib.util
import json
import pathlib
import sys

RACINE = pathlib.Path(__file__).resolve().parents[2]
CHEMIN = RACINE / "custom_components" / "home_desk" / "yaml_ecrans.py"

_spec = importlib.util.spec_from_file_location("yaml_ecrans", CHEMIN)
yaml_ecrans = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(yaml_ecrans)


def main(source: pathlib.Path, destination: pathlib.Path) -> int:
    ecrans = json.loads(source.read_text(encoding="utf-8"))
    texte = yaml_ecrans.rendre(ecrans)

    # L'ALLER-RETOUR, AVANT D'ECRIRE. `rendre` aplatit une note multiligne
    # (limitation documentee au plan 3a) et rien d'autre ne dit si un cas
    # limite est passe a travers. Relire avec le lecteur REEL de
    # `home_desk.importer` et comparer, c'est la seule verification qui a la
    # meme portee que l'import lui-meme.
    relu = yaml_ecrans.lire(texte)
    if relu != ecrans:
        for attendu, obtenu in zip(ecrans, relu):
            for cle in sorted(set(attendu) | set(obtenu)):
                if attendu.get(cle) != obtenu.get(cle):
                    print(
                        f"ALLER-RETOUR ROMPU sur {attendu.get('nom', '?')}.{cle}\n"
                        f"  ecrit : {attendu.get(cle)!r}\n"
                        f"  relu  : {obtenu.get(cle)!r}",
                        file=sys.stderr,
                    )
        print("RIEN N'A ETE ECRIT.", file=sys.stderr)
        return 1

    destination.write_text(texte, encoding="utf-8")
    print(f"{len(ecrans)} ecrans rendus dans {destination} ({len(texte.splitlines())} lignes)")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])))
```

- [ ] **Step 5: Produire le YAML et vérifier qu'il se relit**

```bash
cd app && python3 outils/rendre-ecrans-yaml.py ../ecrans-exportes.json ../home_desk_ecrans.yaml
```

Expected: `3 ecrans rendus dans ../home_desk_ecrans.yaml (… lignes)` et **rien sur stderr**. Si l'aller-retour se rompt, l'outil n'écrit rien et nomme le champ exact : c'est un vrai défaut, à corriger dans `yaml_ecrans.py` avec un test dans `tests/composant/test_yaml_ecrans.py` — **jamais** en contournant depuis l'outil.

- [ ] **Step 6: Vérifier que rien de cette maison n'a fuité dans git**

```bash
git status --porcelain
```

Expected: seuls `app/outils/exporter-ecrans.mjs` et `app/outils/rendre-ecrans-yaml.py` sont neufs. **Ni `home_desk_ecrans.yaml`, ni `ecrans-exportes.json`** — ils sont ignorés depuis l'étape 1. Si l'un des deux apparaît, arrêtez et corrigez `.gitignore` avant tout commit.

- [ ] **Step 7: Committer l'outil**

```bash
git add app/outils/exporter-ecrans.mjs app/outils/rendre-ecrans-yaml.py
git commit -m "feat(tools): throwaway exporter -- evaluate ECRANS, render YAML through yaml_ecrans"
```

---

### Task 3: L'outil d'export, moitié COMMENTAIRES — le registre des 178 plages

**C'est le seul endroit de ce chantier où une perte serait SILENCIEUSE.** Une donnée perdue casse un test ; un raisonnement perdu ne casse rien, et ne se remarque que le jour où plus personne ne sait pourquoi « Porte » est épinglée. 286 lignes de commentaire ne se comparent à rien — donc on ne les compare pas : **on les dénombre**.

L'outil émet un **registre exhaustif** : une ligne par plage de commentaire, avec **un verdict et un seul** parmi trois. **Il ÉCHOUE si une seule plage n'a pas de verdict** — la somme des trois égale le nombre total de plages. C'est ce qui transforme « passe manuelle assumée » en une liste auditable et **finie**.

| Verdict | Ce qu'il veut dire |
|---|---|
| `attachee` | devenue la `note` de tel chemin (`cuisine.commandes[3].note`) |
| `type` | porte sur un TYPE, reste dans le dépôt — les docstrings de `Bouton`, `Voiture`, `EntreeSynthese` ne partent pas, c'est la décision 1 |
| `orpheline` | abandonnée, **avec sa raison, écrite par un humain** |

**La quatrième colonne est une réserve mesurée**, pas une décoration : `yaml_ecrans.rendre` **aplatit une note multiligne** (limitation documentée au plan 3a). Les trois `note:` réelles d'`ecran.ts` sont monolignes — mais **21 des 178 plages** sont multilignes. Le registre porte donc le **nombre de lignes de la note produite**, et l'outil joint les lignes avec un séparateur explicite et documenté.

**Files:**
- Modify: `app/outils/exporter-ecrans.mjs` (le mode `--registre`)
- Create: `app/outils/verdicts-commentaires.tsv` — **celui-ci ENTRE dans git** : il ne porte que des verdicts et des raisons, jamais d'`entity_id`
- Create: `contrat/cas-notes.json` (un cas de jointure multiligne, ajouté au corpus partagé)
- Test: `tests/test_registre_commentaires.py` (tâche 4)

**Interfaces:**
- Consomme : l'API du compilateur TypeScript (`typescript` 5.9.3, dans `app/node_modules`), le scanner en particulier.
- Produit : `node outils/exporter-ecrans.mjs --registre <chemin>` écrit un TSV `ligne_debut<TAB>ligne_fin<TAB>verdict<TAB>chemin_ou_raison<TAB>lignes_de_la_note`, et **sort en code 1** si une plage n'a pas de verdict.

- [ ] **Step 1: Mesurer, pour que le test ait un nombre à défendre**

```bash
cd app && node -e "
const ts = require('typescript'); const fs = require('fs');
const src = fs.readFileSync('src/ecran.ts','utf8');
const s = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, src);
let n=0, lignes=0, multi=0, k;
while ((k = s.scan()) !== ts.SyntaxKind.EndOfFileToken)
  if (k === ts.SyntaxKind.SingleLineCommentTrivia || k === ts.SyntaxKind.MultiLineCommentTrivia) {
    const l = s.getTokenText().split('\n').length; n++; lignes+=l; if (l>1) multi++;
  }
console.log({plages:n, lignes, multilignes:multi});"
```

Expected: `{ plages: 178, lignes: 286, multilignes: 21 }` — mesuré le 2026-09-14 sur `ecran.ts` à 551 lignes. **Si ces nombres diffèrent, `ecran.ts` a bougé depuis** : reportez les vôtres dans le plan, le test et le rapport, et dites-le. Un nombre périmé qui reste écrit est la faute que ce dépôt a payée trois fois.

- [ ] **Step 2: Écrire le fichier de verdicts, à la main, une ligne par plage**

`app/outils/verdicts-commentaires.tsv` — deux colonnes, `ligne_debut<TAB>verdict[:raison]`. C'est la **passe manuelle** de l'étape 2 de la migration, rendue auditable. Elle se fait en lisant `ecran.ts` de haut en bas ; l'outil dira lesquelles manquent.

```tsv
# JETABLE (plan 3c, tache 10). Un verdict par plage de commentaire d'app/src/ecran.ts.
# Trois verdicts, et TROIS SEULEMENT :
#   attachee   -> devient la `note` de la valeur qui la SUIT immediatement
#   type       -> porte sur un TYPE, reste dans le depot (decision 1 de la spec)
#   orpheline:<raison>  -> abandonnee, et la raison est obligatoire
1	type
...
```

> **L'implémenteur écrit ce fichier lui-même, ligne à ligne, en lisant `ecran.ts`.** Ce n'est pas du remplissage : classer 178 plages est le travail que la spec appelle « passe manuelle assumée », et c'est la seule chose de ce plan qu'aucune machine ne décide. Une plage dont le verdict est `orpheline` **sans raison** fait échouer l'outil au même titre qu'une plage absente.

- [ ] **Step 3: Ajouter le mode `--registre` à l'outil**

Dans `app/outils/exporter-ecrans.mjs` :

```js
import ts from 'typescript';

/** Le séparateur de jointure des notes multilignes. `yaml_ecrans.rendre` APLATIT une note
 *  multiligne (limitation mesurée et documentée au plan 3a) : sans séparateur explicite, deux
 *  phrases se colleraient en une seule, illisible, et personne ne le verrait. Documenté ici,
 *  posé dans `contrat/cas-notes.json`, et rejoué par les deux suites du corpus partagé. */
export const SEPARATEUR_NOTE = ' — ';

export function plagesDeCommentaire(source) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  const plages = [];
  let k;
  while ((k = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (k !== ts.SyntaxKind.SingleLineCommentTrivia
        && k !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const texte = scanner.getTokenText();
    const debut = source.slice(0, scanner.getTokenStart()).split('\n').length;
    const lignes = texte.split('\n');
    plages.push({ debut, fin: debut + lignes.length - 1, texte, note: enNote(texte) });
  }
  return plages;
}

/** Le texte d'une plage, débarrassé de sa syntaxe, prêt à devenir une `note`. */
export function enNote(texte) {
  return texte
    .replace(/^\/\*\*?/, '').replace(/\*\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*(\/\/|\*)?\s?/, '').trimEnd())
    .filter((l) => l !== '')
    .join(SEPARATEUR_NOTE);
}
```

et la sortie TSV, qui **échoue** si un verdict manque :

```js
export function registre(plages, verdicts) {
  const lignes = [], sans = [];
  for (const p of plages) {
    const verdict = verdicts.get(p.debut);
    if (verdict === undefined) { sans.push(p); continue; }
    const [nom, raison = ''] = verdict.split(':');
    lignes.push([p.debut, p.fin, nom, raison, p.note.split(SEPARATEUR_NOTE).length].join('\t'));
  }
  return { lignes, sans };
}
```

Le point d'entrée `--registre` imprime, **avant tout**, la ligne de contrôle :

```
178 plages = 96 attachees + 61 type + 21 orphelines
```

et sort en **code 1** en nommant chaque plage sans verdict, avec son numéro de ligne et ses trois premiers mots. *(Les trois nombres de l'exemple sont une illustration de forme, pas une cible : c'est la somme qui doit tomber juste.)*

- [ ] **Step 4: Lancer, corriger les manquantes, relancer jusqu'au vert**

```bash
cd app && node outils/exporter-ecrans.mjs --registre ../registre-commentaires.tsv; echo "code=$?"
```

Expected au premier passage : `code=1` et la liste des plages non classées. On complète `verdicts-commentaires.tsv`, on relance. **Fini quand `code=0` et que la somme des trois verdicts égale 178.**

- [ ] **Step 5: Garder la jointure là où elle vit vraiment — dans `yaml_ecrans`**

> **Correction du scan de pré-vol (ruling R1).** Le plan prévoyait ici un `contrat/cas-notes.json` « lu par les deux suites du corpus partagé ». C'était faux : **aucune tâche ne le branchait à quoi que ce soit**, et le côté TypeScript ne rend jamais de YAML — une `note` n'y est qu'une chaîne. Un fichier de corpus que personne ne lit est très exactement « une règle juste, écrite une fois, gardée zéro fois », le motif que ce dépôt paie en boucle. **L'aplatissement est une propriété de `yaml_ecrans.py`, qui SURVIT à la migration** : c'est donc sa suite qui doit la garder, et la garde reste après la tâche 10.

Ajouter un cas à `tests/composant/test_yaml_ecrans.py` :

```python
def test_une_note_multiligne_survit_a_l_aller_retour():
    """`rendre` APLATIT une note multiligne (limitation mesuree au plan 3a).
    Sans separateur explicite, deux phrases se collent en une seule, illisible,
    et personne ne le voit. L'outil d'export du plan 3c joint par
    `SEPARATEUR_NOTE` (' -- ') ; ce test garde la moitie qui RESTE une fois
    l'outil parti : que la chaine jointe traverse rendre/lire intacte."""
    ecran = {
        "titre": "Zone A", "version": 1, "nom": "Alpha",
        "temperature": "sensor.zone_a_temperature",
        "note": "Premiere phrase. -- Seconde phrase, qui vivait sur une autre ligne.",
        "ambiances": [], "commandes": [], "synthese": [],
        "extrasMaison": [], "sources": [], "ouvrants": [],
    }
    assert yaml_ecrans.lire(yaml_ecrans.rendre([ecran])) == [ecran]
```

Run: `make test-composant PYTHON=/root/.local/share/uv/python/cpython-3.14.3-linux-x86_64-gnu/bin/python3.14`
Expected: PASS. **Si ce test échoue**, c'est une vraie limitation de `yaml_ecrans` qui mordrait à l'import réel de l'étape 4 de la production : corrigez-la **dans `yaml_ecrans.py`**, jamais dans l'outil.

`contrat/` n'est pas touché, donc **pas de `make contrat`** ici.

- [ ] **Step 6: Committer**

```bash
git add app/outils/exporter-ecrans.mjs app/outils/verdicts-commentaires.tsv \
        contrat/cas-notes.json custom_components/home_desk/contrat
git commit -m "feat(tools): comment register -- 178 ranges, three verdicts, fails on any unclassified"
```

---

### Task 12: Attacher les 143 notes — le registre devient un transport, pas un constat

> **Tâche ajoutée en cours d'exécution (ruling R7).** Elle s'exécute **ici**, entre la tâche 3 et la tâche 4. Elle porte le numéro 12 parce que les numéros 4 à 11 étaient déjà pris et que les renuméroter invaliderait les briefs déjà extraits.

**Le trou, et comment il a été trouvé.** L'implémenteur de la tâche 3 a signalé, dans son propre rapport, que les **143 plages classées `attachee` ne sont exécutées par aucun code** : le registre dit où chaque commentaire doit aller, et rien ne l'y met. Il avait raison, et c'est un défaut du plan, pas de sa tâche.

La spec ne laisse aucun doute sur ce qui est attendu (§ « La migration », étape 1) :

> *« `app/outils/exporter-ecrans.mjs` lit `ECRANS` et produit le YAML que `home_desk.importer` avale. Il passe par l'AST TypeScript pour récupérer les **commentaires qui précèdent chaque littéral** et les poser en `note:` — la majorité des ~300 lignes, attachées à ce qu'elles justifient. »*

Sans cette tâche, la régression n°3 que le README doit annoncer — *« Le raisonnement quitte le dépôt. Les `note` sont sauvegardées avec HA »* — serait **un mensonge** : le raisonnement ne quitterait pas le dépôt, il serait **supprimé**, et le registre ne serait que l'inventaire de ce qu'on a perdu au lieu du manifeste de ce qu'on a déplacé.

**Files:**
- Modify: `app/outils/exporter-ecrans.mjs` (le mode `--json` attache, le registre gagne sa colonne de chemin)
- Modify: `app/outils/verdicts-commentaires.tsv` si un verdict `attachee` se révèle impossible à attacher
- Test: `app/tests/migration-notes.test.ts` (créé, **JETABLE**)

**Interfaces:**
- Consomme : `chargerEcrans()`, `ecransPourImport()`, `plagesDeCommentaire()`, `enNote()`, `SEPARATEUR_NOTE` (tâches 2 et 3).
- Produit : `attacherNotes(ECRANS, plages, verdicts) -> { ecrans, attachements }`, où `attachements` est la liste `{ligne, chemin, lignesDeNote}` — une entrée par plage `attachee` — et `chargerVerdicts() -> Map<number, string>`.

- [ ] **Step 1: Mesurer où une `note` a le droit d'atterrir**

Mesuré le 2026-09-14 sur `contrat/ecran.schema.json` — **sept emplacements, et un seul refus** :

| Emplacement | `note` permise ? |
|---|---|
| la racine d'un écran | oui |
| `minuteurs[]` | oui |
| `voiture` | oui |
| `$defs/bouton` (donc `commandes[]`, `ambiances[]`, `extrasMaison[]`, `aspirateurMaison`) | oui |
| `$defs/synthese` | oui |
| `$defs/source` | oui |
| `agencement` | oui |
| **`$defs/source.allumee`** | **NON** |

Refais cette mesure toi-même avant d'écrire, et **dérive la table du schéma** — ne la recopie pas. Une huitième place qui apparaîtrait au contrat doit être trouvée par le code, pas par ce tableau.

- [ ] **Step 2: Écrire le test qui échoue — les 143 notes doivent arriver quelque part**

Créer `app/tests/migration-notes.test.ts` :

```ts
/** JETABLE — part à la tâche 10, avec l'outil et les littéraux.
 *
 *  Le registre de la tâche 3 dit où chaque commentaire doit aller. Ce test vérifie qu'il Y VA.
 *  Sans lui, la régression n°3 du README (« le raisonnement quitte le dépôt ») serait fausse :
 *  le raisonnement ne partirait pas, il serait supprimé — et personne ne le remarquerait. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ECRANS } from '../src/ecran';
import { attacherNotes, chargerVerdicts, plagesDeCommentaire } from '../outils/exporter-ecrans.mjs';

const source = readFileSync(new URL('../src/ecran.ts', import.meta.url), 'utf8');
const verdicts = chargerVerdicts();
const { ecrans, attachements } = attacherNotes(ECRANS, plagesDeCommentaire(source), verdicts);

/** Toutes les valeurs de clé `note`, à toute profondeur. */
function notesDe(n: unknown): string[] {
  if (Array.isArray(n)) return n.flatMap(notesDe);
  if (n && typeof n === 'object') {
    const o = n as Record<string, unknown>;
    return Object.entries(o).flatMap(([k, v]) => (k === 'note' ? [String(v)] : notesDe(v)));
  }
  return [];
}

describe('les notes arrivent où le registre le dit', () => {
  it('attache EXACTEMENT une fois chaque verdict « attachee »', () => {
    const attendus = [...verdicts.values()].filter((v) => v.startsWith('attachee')).length;
    expect(attachements).toHaveLength(attendus);
    expect(new Set(attachements.map((a) => a.ligne)).size).toBe(attendus);
  });

  it('n’attache jamais une note à un endroit que le contrat refuse', () => {
    // `source.allumee` est le seul objet du contrat SANS `note` — mesuré le 2026-09-14.
    for (const { chemin } of attachements) expect(chemin).not.toMatch(/\.allumee$/);
  });

  it('ne DÉTRUIT aucune des trois notes que la donnée portait déjà', () => {
    const avant = notesDe(ECRANS);
    expect(avant).toHaveLength(3);
    const apres = notesDe(ecrans).join('\n');
    for (const note of avant) expect(apres).toContain(note);
  });

  it('porte le nombre de lignes de chaque note, et il y en a des multilignes', () => {
    expect(attachements.every((a) => a.lignesDeNote >= 1)).toBe(true);
    expect(attachements.some((a) => a.lignesDeNote > 1)).toBe(true);
  });
});
```

- [ ] **Step 3: Lancer, vérifier qu'il échoue**

Run: `npm --prefix app test -- migration-notes`
Expected: FAIL — `attacherNotes` et `chargerVerdicts` n'existent pas encore.

- [ ] **Step 4: Construire l'index position → chemin, par l'AST**

**C'est le seul endroit du chantier où l'AST touche à la donnée, et la frontière est nette :** il donne des **positions**, jamais des **valeurs**. Reconstruire une valeur depuis l'AST serait écrire un second interpréteur de TypeScript, et c'est là qu'un cas limite disparaît ; lire la position d'un littéral d'objet, non.

```js
/** Pour chaque littéral d'objet sous la déclaration `ECRANS`, sa position de début et le chemin
 *  qui y mène (`cuisine.commandes[2]`). On n'en tire AUCUNE valeur : uniquement des positions.
 *  Les valeurs viennent toutes de l'évaluation, comme pour le reste de l'outil. */
export function indexerObjets(source) { /* ts.createSourceFile puis descente récursive */ }
```

Descends la déclaration `ECRANS` : à chaque `PropertyAssignment` empile le nom de la clé, à chaque `ArrayLiteralExpression` empile l'index, et enregistre `{debut, fin, chemin}` pour chaque `ObjectLiteralExpression` rencontrée.

- [ ] **Step 5: Attacher, avec la règle de remontée**

Une plage `attachee` se rattache à **l'objet qui la suit** — mais un commentaire peut précéder une simple propriété (`// la porte d'entrée`, juste au-dessus de `entite: '…'`). La note appartient alors à **l'objet englobant le plus proche qui accepte une `note`** au contrat.

Trois règles, et l'outil **échoue** plutôt que de deviner :

1. **Aucun objet ne suit la plage** → échec, en nommant la ligne : ce verdict `attachee` est faux, il doit devenir `type` ou `orpheline:<raison>` dans `verdicts-commentaires.tsv`. **Corrige le verdict, jamais l'outil.**
2. **L'objet trouvé n'accepte pas de `note`** (aujourd'hui : `source.allumee` seul) → remonte au premier englobant qui l'accepte ; si aucun n'accepte, échec en nommant la ligne.
3. **L'objet porte DÉJÀ une `note`** (les trois de `ECRANS`) → **joins**, avec `SEPARATEUR_NOTE`, la note existante en premier. **N'écrase jamais** : ces trois-là sont les seules que l'auteur ait délibérément écrites comme notes.

- [ ] **Step 6: Faire attacher le mode `--json`, et donner son chemin au registre**

`--json` exporte désormais les écrans **enrichis**. Et le registre (`--registre`) remplit sa colonne `chemin_ou_raison` avec le chemin réel pour chaque `attachee` — c'est ce qui le rend auditable ligne à ligne, et c'est exactement ce que la spec décrit : « devenue la `note` de tel chemin, p. ex. `cuisine.commandes[3].note` ».

- [ ] **Step 7: Lancer l'outil de bout en bout et MESURER ce qui est arrivé**

```bash
cd app && node outils/exporter-ecrans.mjs --json ../ecrans-exportes.json \
  && node outils/exporter-ecrans.mjs --registre ../registre-commentaires.tsv \
  && python3 outils/rendre-ecrans-yaml.py ../ecrans-exportes.json ../home_desk_ecrans.yaml
cd .. && python3 -c "
import json
d = json.load(open('ecrans-exportes.json'))
def notes(n):
    if isinstance(n, dict):
        if 'note' in n: yield n['note']
        for v in n.values(): yield from notes(v)
    elif isinstance(n, list):
        for v in n: yield from notes(v)
t = [x for e in d for x in notes(e)]
print('objets portant une note :', len(t))
print('caracteres de raisonnement transportes :', sum(len(x) for x in t))"
```

Expected: le nombre d'objets portant une note est **cohérent avec les 143 `attachee`**, et il sera **inférieur** — plusieurs plages se rattachent au même objet et s'y joignent. **Reporte le chiffre réel ET l'écart, avec son explication.** Un écart non expliqué est une perte.

- [ ] **Step 8: Vérifier que le YAML porte le raisonnement, et que l'aller-retour tient toujours**

`yaml_ecrans.rendre` rend les `note` **en commentaires YAML**, et `lire` les re-parse en champs `note` : c'est ce qui fait qu'une note reste lisible par l'humain qui ouvre le fichier sur l'hôte. L'aller-retour intégré au rendeur (tâche 2) est donc la garde de ce transport, et il devient beaucoup plus exigeant qu'avant.

Expected: `rendre-ecrans-yaml.py` sort en **code 0**, stderr vide, et le YAML est nettement plus long qu'avant (**407 lignes** sans les notes). Donne les deux nombres. **Si l'aller-retour se rompt sur une note**, c'est un vrai défaut de `yaml_ecrans.py` qui mordrait à l'import réel : corrige-le là-bas, avec un test dans `tests/composant/test_yaml_ecrans.py`, jamais en contournant depuis l'outil.

- [ ] **Step 9: Lancer les trois suites et committer**

```bash
npm --prefix app test
make test
git status --porcelain
git add app/outils/exporter-ecrans.mjs app/outils/verdicts-commentaires.tsv app/tests/migration-notes.test.ts
git commit -m "feat(tools): attach the classified comments as notes -- the register now moves reasoning"
```

**Vérifie que ni `ecrans-exportes.json`, ni `home_desk_ecrans.yaml`, ni `registre-commentaires.tsv` n'apparaissent dans `git status --porcelain`.** Ils portent désormais, en plus des 54 `entity_id`, l'intégralité du raisonnement de cette maison.

---

### Task 4: Les trois épreuves de fidélité

**JETABLES, toutes les trois.** Elles importent `ECRANS` : elles sont jetables **par construction** et partent dans le même commit que lui (tâche 10).

La preuve tient en trois niveaux **parce que les deux moitiés n'ont pas la même nature de preuve**, et l'aller-retour du plan 3a ne vaut rien ici : il comparait du YAML à du YAML, alors que cette épreuve compare du **TypeScript** à du YAML.

| Niveau | Ce qui est prouvé | Nature |
|---|---|---|
| 1 | la DONNÉE | une **égalité**, décidable et totale, plus deux dénombrements |
| 2 | les COMMENTAIRES | un **registre** exhaustif, jamais une égalité |
| 3 | le RENDU | ce que la tablette AFFICHE — ni 1 ni 2 ne le disent |

**Pourquoi les deux dénombrements du niveau 1, alors qu'il y a déjà une égalité profonde.** Une égalité profonde manquerait un champ optionnel qui disparaîtrait **des deux côtés** — l'outil ne l'exporte pas, le test ne le cherche pas, et les deux objets restent égaux. Les compteurs sont l'ancre extérieure : **54 `entity_id` distincts, 113 occurrences**, et le décompte par domaine.

**Files:**
- Create: `app/tests/migration-donnee.test.ts`
- Create: `app/tests/migration-rendu.test.ts`
- Create: `tests/test_registre_commentaires.py`
- Modify: `Makefile` (la cible `test` apprend le cinquième script — **non** : voir l'étape 5)

**Interfaces:**
- Consomme : `ecransPourImport` et `plagesDeCommentaire` (`app/outils/exporter-ecrans.mjs`, tâches 2 et 3), `ECRANS` (`app/src/ecran.ts`), `monterDemarrage` (`app/tests/aides.ts:166`), les bouchons de transport déjà utilisés par `app/tests/demarrage.test.ts` et `app/tests/repli.test.ts` (plan 3b).

- [ ] **Step 1: Niveau 1 — l'égalité et les deux dénombrements**

`app/tests/migration-donnee.test.ts` :

```ts
/** JETABLE — part à la tâche 10 du plan 3c, avec `ECRANS` et l'outil d'export.
 *
 *  Niveau 1 de la preuve de migration : ce que l'outil exporte ÉGALE ce que le code portait.
 *  L'égalité profonde ne suffit pas — elle manquerait un champ optionnel disparu DES DEUX CÔTÉS.
 *  Les deux dénombrements sont l'ancre extérieure. */
import { describe, it, expect } from 'vitest';
import { ECRANS } from '../src/ecran';
import { ecransPourImport } from '../outils/exporter-ecrans.mjs';

const exportes = ecransPourImport(ECRANS);

describe('niveau 1 — la donnée', () => {
  it('exporte exactement trois écrans, un par clé d’ECRANS', () => {
    expect(exportes.map((e) => e.nom).sort())
      .toEqual(Object.values(ECRANS).map((e) => e.nom).sort());
  });

  it.each(Object.entries(ECRANS))('%s : champ par champ, version comprise', (_cle, ecran) => {
    const exporte = exportes.find((e) => e.nom === ecran.nom)!;
    // AMENDÉ (ruling R7) : l'export ATTACHE les 143 commentaires classés `attachee` en `note`
    // (tâche 12). L'égalité stricte est donc fausse par construction — ce qu'il faut prouver,
    // c'est que **rien d'AUTRE qu'une `note`** n'a bougé. `sansNotes` retire récursivement
    // toute clé `note` des deux côtés ; les notes elles-mêmes sont gardées par
    // `migration-notes.test.ts`, qui les compte contre le registre.
    expect(sansNotes(exporte)).toEqual(sansNotes({ titre: ecran.nom, version: 1, ...ecran }));
  });

  it('porte 54 entity_id distincts en 113 occurrences', () => {
    // Sur `sansNotes`, obligatoirement : les commentaires d'`ecran.ts` CITENT des entity_id
    // en prose, et une fois attachés en `note` (tâche 12) ils feraient monter les deux
    // compteurs sans qu'aucune donnée n'ait bougé. Les 54/113 mesurent la DONNÉE.
    const tous = JSON.stringify(exportes.map(sansNotes)).match(/"[a-z_]+\.[a-z0-9_]+"/g) ?? [];
    expect(tous.length).toBe(113);
    expect(new Set(tous).size).toBe(54);
  });

  it('les répartit par domaine comme la spec l’a mesuré', () => {
    const tous = JSON.stringify(exportes.map(sansNotes)).match(/"([a-z_]+)\.[a-z0-9_]+"/g) ?? [];
    const parDomaine: Record<string, number> = {};
    for (const d of new Set(tous)) {
      const domaine = d.slice(1).split('.')[0];
      parDomaine[domaine] = (parDomaine[domaine] ?? 0) + 1;
    }
    expect(parDomaine).toEqual({
      binary_sensor: 9, sensor: 7, media_player: 7, light: 7, todo: 4, script: 4,
      timer: 3, input_text: 3, vacuum: 2, fan: 2, cover: 2, button: 2, lock: 1, climate: 1,
    });
  });
});
```

> **`sansNotes(x)` est une aide locale de ce fichier** : une copie profonde de `x` dont toute clé `note` a été retirée, à toute profondeur. Écris-la, cinq lignes. Elle s'applique **des deux côtés**, donc les trois `note` que `ECRANS` portait déjà disparaissent aussi de la comparaison — c'est voulu : `migration-notes.test.ts` (tâche 12) garde qu'elles ne sont pas détruites, et c'est son travail, pas celui-ci.

> **Le motif `"[a-z_]+\.[a-z0-9_]+"` attrape ce qui RESSEMBLE à un `entity_id` dans le JSON sérialisé, guillemets compris.** Il peut attraper un faux positif (une `vue` comme `"#recette.en_cours"` n'en est pas une) ou en manquer un. C'est voulu : **le même motif** a produit les chiffres 54/113 de la mesure du 2026-09-14, sur le même contenu. Ce que le test garde, c'est que **le compte ne bouge pas**, pas que le motif soit une définition d'`entity_id`. Si vous améliorez le motif, re-mesurez et changez les trois nombres dans le même commit.

- [ ] **Step 2: Lancer, et lire le premier échec comme une mesure**

Run: `npm --prefix app test -- migration-donnee`
Expected: PASS. **Si les compteurs tombent à côté**, ne corrigez pas le test : `ecran.ts` a changé depuis la mesure. Re-mesurez, reportez les nouveaux chiffres ici, dans le plan et dans le rapport, et dites-le explicitement.

- [ ] **Step 3: Niveau 2 — le registre est exhaustif**

`tests/test_registre_commentaires.py` — **python3 + PyYAML seulement**, comme toute la suite `make test` :

```python
"""JETABLE -- part a la tache 10 du plan 3c.

Niveau 2 de la preuve de migration. 286 lignes de commentaire ne se comparent
a rien : elles se DENOMBRENT. Ce test verifie que le registre est EXHAUSTIF
(chaque plage a exactement un verdict), que les verdicts sont des trois mots
autorises, et qu'aucune plage classee `orpheline` ne l'est sans raison.

C'est le seul endroit du chantier ou une perte serait SILENCIEUSE : une donnee
perdue casse un test, un raisonnement perdu ne casse rien.
"""
import pathlib
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
VERDICTS = RACINE / "app" / "outils" / "verdicts-commentaires.tsv"
SOURCE = RACINE / "app" / "src" / "ecran.ts"
VERDICTS_AUTORISES = {"attachee", "type", "orpheline"}


def plages(texte: str) -> list[int]:
    """Les lignes de DEBUT de chaque plage de commentaire. Un scanner de
    dix lignes, pas un parseur TypeScript : il suffit de compter les MEMES
    plages que `exporter-ecrans.mjs`, et le test de comptage ci-dessous
    echoue bruyamment si les deux divergent."""
    debuts, dans_bloc = [], False
    for numero, ligne in enumerate(texte.splitlines(), start=1):
        nu = ligne.strip()
        if dans_bloc:
            if "*/" in nu:
                dans_bloc = False
            continue
        if nu.startswith("/*"):
            debuts.append(numero)
            dans_bloc = "*/" not in nu
        elif nu.startswith("//"):
            debuts.append(numero)
    return debuts


def main() -> int:
    lignes = [
        l for l in VERDICTS.read_text(encoding="utf-8").splitlines()
        if l.strip() and not l.startswith("#")
    ]
    classees = {}
    for l in lignes:
        debut, verdict = l.split("\t", 1)
        classees[int(debut)] = verdict

    attendues = set(plages(SOURCE.read_text(encoding="utf-8")))
    manquantes = sorted(attendues - set(classees))
    en_trop = sorted(set(classees) - attendues)
    sans_raison = sorted(
        d for d, v in classees.items()
        if v.split(":")[0] == "orpheline" and len(v.split(":", 1)[1].strip()) < 10
    )
    inconnus = sorted(d for d, v in classees.items() if v.split(":")[0] not in VERDICTS_AUTORISES)

    for titre, liste in (
        ("plages SANS verdict", manquantes),
        ("verdicts sans plage correspondante", en_trop),
        ("orphelines SANS raison (>= 10 caracteres exiges)", sans_raison),
        ("verdicts hors des trois autorises", inconnus),
    ):
        if liste:
            print(f"ECHEC -- {titre} : {liste}", file=sys.stderr)

    if manquantes or en_trop or sans_raison or inconnus:
        return 1

    comptes = {v: 0 for v in VERDICTS_AUTORISES}
    for v in classees.values():
        comptes[v.split(":")[0]] += 1
    total = len(attendues)
    assert sum(comptes.values()) == total, "la somme des verdicts doit egaler le nombre de plages"
    print(f"OK -- {total} plages = " + " + ".join(f"{n} {v}" for v, n in sorted(comptes.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Lancer le niveau 2**

Run: `python3 tests/test_registre_commentaires.py; echo "code=$?"`
Expected: `code=0` et une ligne `OK -- 178 plages = N attachee + N orpheline + N type`.

> **Le scanner de dix lignes de ce test et le scanner TypeScript de l'outil comptent la même chose de deux manières différentes.** C'est délibéré : deux mesures indépendantes qui doivent tomber d'accord. Si elles divergent (un `//` dans une chaîne de caractères, par exemple), **le désaccord est l'information** — tranchez lequel a raison, alignez, et écrivez pourquoi dans le rapport.

- [ ] **Step 5: NE PAS ajouter ce script à `make test`**

La boucle de `make test` énumère cinq scripts. **N'ajoutez pas le sixième** : il est jetable, il disparaît à la tâche 10, et un `make test` qui passe de 5 à 6 puis revient à 5 raconte une histoire fausse dans deux rapports. Il se lance à la main, et la tâche 10 vérifie sa disparition. Écrivez cette raison en tête du script.

- [ ] **Step 6: Niveau 3 — le DOM rendu des deux côtés**

`app/tests/migration-rendu.test.ts` :

```ts
/** JETABLE — part à la tâche 10 du plan 3c.
 *
 *  Niveau 3, l'épreuve qui compte : ni la donnée ni les notes ne disent ce que la tablette
 *  AFFICHE. Chaque écran est monté DEUX FOIS — une fois depuis `ECRANS`, une fois depuis le
 *  transport alimenté par ce que l'outil exporte — et les deux DOM sont comparés. */
import { describe, it, expect, afterEach } from 'vitest';
import { ECRANS } from '../src/ecran';
import { ecransPourImport } from '../outils/exporter-ecrans.mjs';
import { monterDemarrage, vider } from './aides';

afterEach(vider);

describe('niveau 3 — le rendu', () => {
  it.each(Object.entries(ECRANS))('%s rend le même DOM des deux côtés', async (_cle, ecran) => {
    const exporte = ecransPourImport(ECRANS).find((e) => e.nom === ecran.nom)!;
    const { titre: _t, version: _v, ...depuisTransport } = exporte;

    const aGauche = await monterDemarrage(ecran);
    const domLitteral = aGauche.racine.innerHTML;
    await vider();

    const aDroite = await monterDemarrage(depuisTransport as typeof ecran);
    expect(aDroite.racine.innerHTML).toBe(domLitteral);
  });
});
```

> **Pourquoi `monterDemarrage` des deux côtés plutôt qu'un vrai bouchon de transport à droite.** Ce que le niveau 3 doit isoler, c'est la **donnée**, pas le transport : celui-ci a sa propre suite (`demarrage.test.ts`, `repli.test.ts`, 3b) et sa propre épreuve sur l'instance (étape 5 de la production). Faire passer la droite par un faux websocket ajouterait une variable sans rien prouver de plus, et un échec ne dirait plus laquelle des deux a bougé. **Le décor à deux sources, ici, ce sont les deux objets.**
>
> **Ce test ne vaut que si les modes atteints sont les mêmes des deux côtés.** `monterDemarrage` prend des `options` : si les trois écrans réels atteignent plusieurs modes (cuisine : recette, courses, minuteurs), **montez chaque mode**, pas seulement le mode par défaut. Un test qui ne compare que l'écran d'accueil laisse la vue Recette mentir. Lisez `OptionsMontage` (`aides.ts:118`) et couvrez les modes que `modes.test.ts` sait atteindre pour chaque écran.

- [ ] **Step 7: Lancer les trois suites**

```bash
npm --prefix app test
python3 tests/test_registre_commentaires.py
make test
```

Expected: vitest **54 fichiers** (52 + 2), tous verts ; le registre `code=0` ; `make test` **5/5**, inchangé.

- [ ] **Step 8: La mutation — retirer un champ de l'export**

Dans `exporter-ecrans.mjs`, remplacer `{ titre: ecran.nom, version: VERSION_CONFIG, ...ecran }` par une copie qui **omet `extrasMaison`**. Relancer, coller la sortie, restaurer.
Expected: le niveau 1 tombe sur l'égalité, **et** le niveau 3 tombe sur la cuisine (la tuile « Scanner » vit dans `extrasMaison` et n'est rendue que par `rendu/maison.ts`). **Si le niveau 3 ne tombe pas**, c'est que le montage n'atteint pas la vue « Toute la maison » : corrigez le décor avant de continuer — c'est la leçon n°3, et c'est exactement le trou que `absenceNommee` a déjà payé cinq fois dans ce dépôt.

- [ ] **Step 9: Committer**

```bash
git add app/tests/migration-donnee.test.ts app/tests/migration-rendu.test.ts \
        tests/test_registre_commentaires.py
git commit -m "test(migration): three throwaway fidelity proofs -- data, comments, rendered DOM"
```

---

### Task 5: Le lot de portabilité — les IP, le secret, et la garde qui les cherche

Dette **antérieure à ce chantier**, que la spec renvoie explicitement ici. Elle a la forme que ce dépôt paie en boucle : **une règle juste, écrite une fois, gardée zéro fois.**

**Ce qui est mesuré au 2026-09-14** (`grep -rn "192\.168\.0\.\(159\|218\|138\)"`) :

| Fichier | Ce que c'est | Livré par `git archive HEAD` ? |
|---|---|---|
| `app/src/styles/base.css:38-39` | le commentaire de mesure Fully Kiosk — **la SOURCE dont `dist/wallpanel.css` est bâti** | **oui**, et le produit aussi (`dist/wallpanel.css:114-115`) |
| `app/outils/verifier-rendu.mjs:1012-1013` | la même mesure de moteur de rendu | oui |
| `app/README.md:18-20` | un TABLEAU des trois IP avec leurs `entity_id` de capture d'écran | oui |
| `docs/superpowers/specs/`, `docs/superpowers/plans/` | la trace historique du chantier | oui |

**Et une trouvaille de cette mesure, qui n'était nommée nulle part :** `app/docs/superpowers/plans/2026-08-06-bandeau-mise-en-page.md:592` porte une URL Fully Kiosk **avec son mot de passe en clair** (`?cmd=getScreenshot&password=…`). C'est un secret de cette maison dans un fichier livré. Ce n'est pas une IP, ce n'est pas dans le périmètre annoncé, et c'est plus grave que ce que le périmètre annonçait.

**La garde manquante.** `tests/test_dist_portable.py` scanne `dist/` (`INTERDITS = ("/opt/nivuus/HomeAssistant", "/home/mallanic")`) et `custom_components/` (`INTERDITS_COMPOSANT = INTERDITS + ("home-manager", "/opt/nivuus", "192.168.0.1")`). Trois défauts mesurés :

1. **`app/` n'est scanné par AUCUNE garde de portabilité** — or c'est la SOURCE.
2. `"192.168.0.1"` ne s'applique qu'à `custom_components/`, un répertoire différent.
3. Même transposé, ce littéral n'attrape `.159` et `.138` que **par coïncidence de préfixe** (`"192.168.0.1" in "192.168.0.159"` est vrai) et **jamais `.218`**.

**Files:**
- Create: `tests/test_portabilite_app.py`
- Modify: `tests/test_dist_portable.py:76`
- Modify: `app/src/styles/base.css:38-39`, `app/outils/verifier-rendu.mjs:1012-1013`, `app/README.md:18-20`, `app/docs/superpowers/plans/2026-08-06-bandeau-mise-en-page.md:592`
- Modify: `nivuus-package.yaml` (« les 66 `entity_id` en dur » — périmé, c'est 69)

- [ ] **Step 1: Écrire la garde AVANT de nettoyer**

Elle doit **échouer** sur l'état actuel : c'est ce qui prouve qu'elle cherche vraiment. `tests/test_portabilite_app.py`, python3 seul :

```python
"""`app/` n'etait scanne par AUCUNE garde de portabilite -- or c'est la SOURCE
dont `dist/` est bati. `tests/test_dist_portable.py` ne connaissait que deux
chemins de fichier, aucune IP, et son litteral "192.168.0.1"
(INTERDITS_COMPOSANT) ne s'appliquait qu'a `custom_components/`.

Une regle juste, ecrite une fois dans CLAUDE.md, et gardee zero fois : le
motif que ce depot a paye douze fois sur la branche 3a. Ce fichier est le
filet manquant.

Il cherche des MOTIFS, jamais des litteraux : "192.168.0.1" n'attrape ".159"
et ".138" que par coincidence de prefixe, et jamais ".218".
"""
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
SCANNES = ("app/src", "app/outils", "app/scripts", "app/gabarits", "app/README.md")

INTERDITS = (
    (re.compile(r"192\.168\.\d{1,3}\.\d{1,3}"), "une adresse IP du reseau local"),
    (re.compile(r"password=\S+", re.I), "un mot de passe en clair dans une URL"),
    (re.compile(r"/opt/nivuus/HomeAssistant"), "un chemin d'installation de CETTE machine"),
    (re.compile(r"/home/[a-z]+/"), "un chemin de repertoire personnel"),
)


def fichiers():
    for entree in SCANNES:
        chemin = RACINE / entree
        if chemin.is_file():
            yield chemin
        else:
            for f in chemin.rglob("*"):
                if f.is_file() and "node_modules" not in f.parts:
                    yield f


def main() -> int:
    fautes = []
    for f in fichiers():
        try:
            texte = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for numero, ligne in enumerate(texte.splitlines(), start=1):
            for motif, quoi in INTERDITS:
                if motif.search(ligne):
                    fautes.append(f"{f.relative_to(RACINE)}:{numero} -- {quoi}")
    for faute in fautes:
        print(f"ECHEC -- {faute}", file=sys.stderr)
    if fautes:
        print(f"\n{len(fautes)} occurrence(s). `app/` est la SOURCE de `dist/` : "
              "ce qui est ecrit ici est LIVRE.", file=sys.stderr)
        return 1
    print(f"OK -- {len(list(fichiers()))} fichiers de `app/` sans trace de cette machine")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Lancer la garde et regarder ce qu'elle trouve**

Run: `python3 tests/test_portabilite_app.py; echo "code=$?"`
Expected: `code=1`, avec **au moins** `app/src/styles/base.css:38`, `:39`, `app/outils/verifier-rendu.mjs:1012`, `:1013`, `app/README.md:18-20`. **Notez la liste complète dans le rapport** : c'est le devis exact du nettoyage, et elle contiendra peut-être des occurrences que la mesure du plan n'avait pas vues.

- [ ] **Step 3: Nettoyer, sans perdre le SAVOIR**

Le commentaire de `base.css` n'est pas décoratif : il explique **pourquoi** les unités de viewport sont écrites comme elles le sont (deux moteurs Chrome différents, `dvh` absent sur l'un). Retirer les IP ne doit pas retirer le fait.

```css
/* Les trois tablettes n'ont PAS le même moteur de rendu : deux d'entre elles rendent en
   Chrome 100.0.4896.127, la troisième en Chrome 119.0.6045.194 (mesuré le 2026-08-03).
   Les IP qui identifiaient chaque tablette ont été retirées le 2026-09-14 — `app/` est la
   SOURCE dont `dist/` est bâti, et `dist/` est livré par `git archive HEAD` (plan 3c,
   tâche 5, gardé par `tests/test_portabilite_app.py`). Le tableau « quelle tablette porte
   quel moteur » vit désormais dans le dossier de production, pas dans le dépôt. */
```

Même traitement pour `verifier-rendu.mjs:1012-1013`. Pour `app/README.md:18-20`, le tableau perd sa colonne IP et garde les deux autres (URL, `entity_id` de capture) ; le README gagne une ligne disant où trouver les IP.

Pour `app/docs/superpowers/plans/2026-08-06-bandeau-mise-en-page.md:592` : **retirer le mot de passe**, garder le geste. `git log` conserve l'ancienne ligne — dites-le dans le commit, et dites que ce mot de passe doit être considéré comme exposé et changé sur les trois tablettes. Ce n'est pas à vous de le changer.

- [ ] **Step 4: Corriger la garde de `dist/`, qui n'attrapait `.218` par aucun chemin**

`tests/test_dist_portable.py` — remplacer le littéral par un motif, en gardant la structure du fichier :

```python
# Les IP se cherchent par MOTIF, jamais par litteral : "192.168.0.1" n'attrape
# ".159" et ".138" que par coincidence de prefixe (`"192.168.0.1" in
# "192.168.0.159"` est vrai) et JAMAIS ".218". Mesure et corrige au plan 3c.
MOTIFS_COMPOSANT = (re.compile(r"192\.168\.\d{1,3}\.\d{1,3}"),)
```

et l'appliquer là où `INTERDITS_COMPOSANT` était parcouru, **sans retirer** les littéraux de chemin qui, eux, sont justes.

- [ ] **Step 5: Reconstruire, committer, relancer**

```bash
npm --prefix app run build
git add app/src/styles/base.css app/outils/verifier-rendu.mjs app/README.md \
        app/docs/superpowers/plans/2026-08-06-bandeau-mise-en-page.md \
        tests/test_portabilite_app.py tests/test_dist_portable.py dist
git commit -m "fix(portability): remove this house's IPs and one cleartext password from app/"
python3 tests/test_portabilite_app.py
make test
```

Expected: la garde `code=0`, `make test` **5/5**. `dist/wallpanel.css` ne porte plus d'IP — **c'est le vrai résultat** : la source nettoyée, le produit suit.

- [ ] **Step 6: Ajouter la garde à `make test`, celle-ci pour de bon**

Contrairement au registre de la tâche 4, cette garde **reste**. Dans le `Makefile`, la boucle de `test` passe à **six** scripts :

```make
	@for t in test_manifest_contract test_install_hook test_dist_portable test_portabilite_app test_dist_a_jour test_contrat_embarque; do \
```

Run: `make test`
Expected: **6/6**.

- [ ] **Step 7: Corriger le chiffre périmé du manifeste**

`nivuus-package.yaml` porte, dans la justification de l'absence de `wizard:` : *« les 66 `entity_id` en dur ne sont pas des questions qu'on pose à un opérateur »*. **Mesuré le 2026-09-14 : 69**, et ce nombre tombera à **15** à la tâche 10. Écrire les deux : le chiffre du jour, et celui qu'il deviendra, avec la raison qui ne change pas (l'inventaire de la maison reste, la configuration d'écran part).

Run: `make test` — `tests/test_manifest_contract.py` valide le manifeste.
Expected: **6/6**.

- [ ] **Step 8: Committer et fermer la dette dans `CLAUDE.md`**

La section « Dettes connues du composant » porte une entrée sur les trois IP et leurs quatre emplacements. La remplacer par le constat fermé, **en nommant la garde** — c'est la garde qui fait la différence entre une dette fermée et une dette réécrite.

```bash
git add Makefile nivuus-package.yaml CLAUDE.md
git commit -m "chore: guard app/ for portability and fix the stale entity count in the manifest"
```

---

# Phase 2 — la production

> **Cette phase ne s'exécute pas en sous-agent.** Elle touche une instance Home Assistant en service, trois tablettes au mur, et comporte un redémarrage qui coupe brièvement toute la maison. Le coordinateur la mène **avec le propriétaire**, une étape à la fois, et **s'arrête à chaque porte de vérification**. Aucune étape n'est enchaînée sur la foi de la précédente.

> **Préalable absolu : les tâches 1 à 5 sont committées et les trois suites sont vertes.** Si l'une ne l'est pas, la phase 2 n'ouvre pas.

---

### Task 6: Le dossier de production, et la mesure qui le conditionne

La spec pose une réserve nommée, et elle est la **première chose à faire** :

> *« À RE-MESURER AVANT D'ÉCRIRE LE DOSSIER DE PRODUCTION : cette spec affirme que `fully_kiosk.set_config` accepte la clé `startURL` sur cette instance, mesuré le 2026-09-12. Ce fait n'a pas été revérifié depuis, et **tout le retour arrière des étapes 5 et 7 repose dessus**. »*

Si `set_config` n'accepte pas `startURL` sur cette instance aujourd'hui, **les étapes 5, 6 et 7 n'ont plus de retour arrière** et la mise en production redevient une bascule unique sur les trois tablettes. Ce n'est pas un détail d'intendance : c'est la condition qui décide si ce plan peut être exécuté tel quel.

**Files:**
- Create: `docs/superpowers/production/2026-09-14-mise-en-production-3c.md`

- [ ] **Step 1: Re-mesurer `fully_kiosk.set_config` contre l'instance**

Le CLI `ha` de cette machine a ses commandes **WebSocket** cassées (`aiohttp` manque au `python3` système) ; les commandes **REST** fonctionnent. Dette nommée dans `home-stock`, on la contourne, on ne la répare pas ici.

Relever, **sans jamais afficher ni committer `HA_TOKEN`** :

1. les services que l'intégration Fully Kiosk expose réellement, et les clés que `set_config` accepte ;
2. les trois entités `button.tablette_*_load_start_url` (ou leur nom réel), qui déclenchent le rechargement ;
3. **les trois `startURL` actuelles**, telles que servies — c'est le relevé de l'étape 1 de la mise en production, et c'est la valeur exacte du retour arrière.

- [ ] **Step 2: Décider, et le dire**

Deux issues, et il faut choisir **avant** d'écrire le dossier :

- **`startURL` est acceptée** → le dossier s'écrit tel que la spec le décrit, huit étapes, chacune avec son retour arrière.
- **`startURL` n'est PAS acceptée** → **arrêtez et remontez-le au propriétaire.** Les étapes 5 à 7 perdent leur retour arrière ; la décision de continuer quand même (bascule unique) ou de trouver un autre chemin de repointage lui appartient, pas à l'exécutant. C'est l'un des quatre cas où ce chantier s'arrête et demande.

- [ ] **Step 3: Écrire le dossier**

`docs/superpowers/production/2026-09-14-mise-en-production-3c.md`. Il porte, dans cet ordre :

1. **Le relevé de l'étape 1** : les trois `startURL` actuelles, l'empreinte `?v=` servie, la version de paquet installée, le chemin de l'archive et celui de la sauvegarde HA. **Ce fichier porte des données de cette maison** — vérifiez, avant de committer, qu'il ne porte **aucun jeton**. Les URL et les noms d'écran, oui : ils sont déjà dans `app/src/ecran.ts` jusqu'à la tâche 10, et le dossier de production n'est pas `contrat/`.
2. **Ce qui ne revient PAS en arrière**, recopié de la spec et daté : le redémarrage de l'étape 2 coupe **toute la maison**, pas seulement les tablettes — l'heure se choisit à l'avance et **s'écrit ici** ; à partir de l'étape 2 la granularité du retour arrière est le **bundle**, rachetée par tablette uniquement par la branche `data-piece` ; le retour arrière Fully est **asynchrone** (une tablette hors ligne garde son URL neuve jusqu'à son retour) ; après l'étape 8 l'archive de l'étape 1 est le **seul** chemin de retour, à garder au moins une semaine.
3. **Les huit étapes**, chacune avec sa porte de vérification et son retour arrière, reprises de la spec (§ « L'ordre, et son retour arrière à chaque étape »).
4. **Un journal d'exécution vide**, une ligne par étape : date, heure, qui, ce qui a été observé à la porte. Il se remplit pendant la tâche 7 — et c'est lui qui rend la tâche 11 capable de dire ce qui s'est réellement passé.

- [ ] **Step 4: Nommer la porte de fidélité de l'étape 4, en exécutable**

La spec exige, à l'étape 4 : *« chaque objet rendu ÉGALE le littéral correspondant champ par champ, `version: 1` comprise — le niveau 1, exécuté contre l'instance réelle et non contre le harnais »*.

Le geste qui le prouve **sans écrire un client websocket ni toucher à `HA_TOKEN`** : après l'import, appeler `home_desk.exporter` sur l'instance, récupérer `config/home_desk_ecrans.yaml`, et le comparer **octet pour octet** au fichier qui a été importé.

```bash
# sur l'hôte, après avoir appelé le service home_desk.exporter
diff <(sudo cat /opt/nivuus/home-manager/config/home_desk_ecrans.yaml) ./home_desk_ecrans.yaml
```

Un `diff` vide prouve que l'aller-retour **stockage** est fidèle. Écrivez dans le dossier **pourquoi ce n'est pas suffisant à soi seul** — il prouve le stockage, pas le rendu : le rendu est prouvé à l'étape 5 par `verifier-rendu.mjs` et par la capture comparée. Les deux ensemble font la porte ; l'une seule ne la fait pas.

- [ ] **Step 5: Committer le dossier**

```bash
git add docs/superpowers/production/2026-09-14-mise-en-production-3c.md
git commit -m "docs(production): runbook for the 3c rollout, with the re-measured Fully Kiosk fact"
```

- [ ] **Step 6: S'arrêter et présenter au propriétaire**

Le dossier est un plan d'action sur sa maison. Présentez-le, avec en tête **la mesure de l'étape 1 et son verdict**, et **attendez son accord** avant d'ouvrir la tâche 7. C'est le deuxième des quatre arrêts.

---

### Task 7: Exécuter les étapes 1 à 7

**Une étape par fois. Chacune se termine par sa porte de vérification, et le journal se remplit au fur et à mesure — pas à la fin.** Une porte qui ne passe pas déclenche le retour arrière de son étape, et la tâche s'arrête là.

**Files:**
- Modify: `docs/superpowers/production/2026-09-14-mise-en-production-3c.md` (le journal, à chaque étape)

- [ ] **Step 1: Étape 1 — filet et relevé**

Sauvegarde HA complète. Copie datée de `config/www/wallpanel/`. Les trois `startURL` actuelles et l'empreinte `?v=` servie, **écrites dans le dossier**. Archive de la version de paquet installée, **hors de la cible**.

Porte : la sauvegarde est listée et non vide ; la copie porte **8 fichiers** ; les trois URL sont écrites ; l'archive existe **hors** de la cible.
Retour arrière : sans objet — rien n'a changé.

- [ ] **Step 2: Étape 2 — dépôt du paquet de transition, puis redémarrage**

Le commit déposé porte **encore** les littéraux, les trois pages historiques et la branche `data-piece`. C'est tout l'intérêt : rien ne doit changer à l'écran.

```bash
docker exec homeassistant python -m homeassistant --script check_config -c /config
```

Porte : `check_config` propre **AVANT** le redémarrage. HA remonte ; l'intégration « Tablettes murales » est proposée à l'ajout. **Et les trois pages historiques rendent à l'identique** — `verifier-rendu.mjs --deploye`, plus une capture par tablette comparée à l'étape 1. C'est la preuve que rien n'a encore bougé.
Retour arrière : redéployer l'archive de l'étape 1, `check_config`, redémarrer.

> **L'heure du redémarrage a été écrite dans le dossier à la tâche 6.** Si elle n'y est pas, elle n'a pas été choisie : arrêtez et demandez-la.

- [ ] **Step 3: Étape 3 — créer l'intégration, vide**

Paramètres > Appareils et services > Tablettes murales. **Aucun écran.**

Porte : l'entrée existe ; `home_desk/ecrans` rend `[]` ; les trois tablettes sont inchangées.
Retour arrière : supprimer l'entrée de configuration.

- [ ] **Step 4: Étape 4 — importer les trois écrans**

Déposer le YAML produit à la tâche 2 en `config/home_desk_ecrans.yaml`, appeler `home_desk.importer`.

Porte : **la porte de fidélité** — `home_desk/ecrans` rend trois lignes, `home_desk/ecran` rend chacune, et le `diff` de l'export contre le fichier importé est **vide** (tâche 6, étape 4).
Retour arrière : `importer` est **atomique et total** (`garde_ecran.importer_ecrans`) — ré-importer un fichier corrigé, ou supprimer l'entrée (retour à l'étape 3).

- [ ] **Step 5: Étape 5 — repointer UNE tablette : la cuisine**

`fully_kiosk.set_config`, clé `startURL` → **`/local/wallpanel/index.html?ecran=Cuisine`**, puis `button.tablette_cuisine_load_start_url`.

> **La MAJUSCULE n'est pas une coquille.** `websocket.py` apparie `data["nom"]` **exactement**, et `app/src/ecran.ts` porte `nom: 'Cuisine'`. `?ecran=cuisine` rendrait `not_found` et afficherait le sélecteur d'écrans au lieu de la cuisine. Le nom de fichier n'est pas négociable non plus : `/local/wallpanel/?ecran=` rendrait **403** — HA sous-classe `StaticResource` d'aiohttp sans toucher au traitement des répertoires, `show_index` vaut `False`, et `_resolve_path_to_response` lève `HTTPForbidden`.

La cuisine d'abord parce que c'est l'écran le plus riche : minuteurs, recette, courses, `absenceNommee`.

Porte : l'écran se lève sans rester bloqué sur l'attente ; capture comparée à l'étape 1 ; `verifier-rendu.mjs` sur la nouvelle URL ; **les cinq dégradations sondées sur place**, en tapant les URL à la main (écran inconnu, version inconnue, écran corrompu, intégration absente, réseau).
Retour arrière : `set_config` avec l'URL **relevée à l'étape 1**, puis rechargement → page historique → branche `data-piece` → littéral. Le comportement d'avant, **octet pour octet**.

- [ ] **Step 6: Étape 6 — vivre avec, 24 heures**

Porte : aucun mur blanc, aucune tuile morte ; les minuteurs se lancent, la vue Recette s'ouvre, la liste de courses se coche. **Et l'épreuve propre à ce chantier** : éditer une tuile depuis Home Assistant et voir l'écran se recharger **tout seul** (`home_desk_config_changed`). La promesse « édition vivante » se prouve ici, pas en test.
Retour arrière : identique à l'étape 5.

> **24 heures veut dire 24 heures.** C'est la seule étape du plan dont la valeur vient du temps qui passe, et la seule qui puisse attraper une panne lente (fuite mémoire, reconnexion websocket après une coupure, veille de la tablette). L'abréger, c'est la supprimer.

- [ ] **Step 7: Étape 7 — repointer le salon, puis le bureau, un à la fois**

`/local/wallpanel/index.html?ecran=Salon`, puis `?ecran=Bureau` — **majuscules**, mêmes raisons. Le salon porte la voiture et la DeLorean ; le bureau l'agenda et `todo.travail`.

Porte : identique à l'étape 5, **par tablette**.
Retour arrière : identique à l'étape 5, **par tablette**.

- [ ] **Step 8: Clore le journal et committer**

Le journal porte huit lignes (ou moins, si l'on s'est arrêté), chacune datée et disant ce qui a été **observé**, pas ce qui était attendu.

```bash
git add docs/superpowers/production/2026-09-14-mise-en-production-3c.md
git commit -m "docs(production): execution log for steps 1 to 7"
```

- [ ] **Step 9: S'arrêter avant la phase 3**

Les trois tablettes tournent sur le transport. Les littéraux sont encore là, et c'est **exactement** ce qui rend tout réversible. Passer à la tâche 8 retire ce filet : **présentez l'état au propriétaire et attendez son accord.** C'est le troisième arrêt.

---

# Phase 3 — le retrait

> **N'ouvrez cette phase qu'après l'accord du propriétaire à la fin de la tâche 7.** Les trois tablettes tournent sur le transport depuis au moins 24 heures, et les littéraux sont encore là — c'est ce qui rend tout réversible. Cette phase retire le filet.

---

### Task 8: Le triplet d'écrans de référence, et les sept fichiers légers

**Le cœur de la phase.** Les 12 fichiers de tests qui lisent `ECRANS` doivent cesser d'affirmer des choses **sur cette maison** (« le salon épingle Porte ») pour affirmer des choses **sur le contrat**. Les 38 autres construisent leurs propres `Ecran` littéraux et survivent **intacts** tant que le TYPE survit — c'est l'argument de la décision 1, et il tient.

**Trois écrans de référence, pas un seul.** L'argument complet est en tête de plan (§ « Les arbitrages que ce plan tranche », A) : un écran unique ne rendrait pas les tests de contraste faux, il les rendrait **vides**, et rien ne le dirait.

**Files:**
- Create: `app/tests/ecrans-reference.ts`
- Modify: `app/tests/aides.ts` (`ecranVide` perd son nom de pièce réelle)
- Modify: `app/tests/repli.test.ts` (1), `cochage.test.ts` (5), `navigation.test.ts` (5), `agencement.test.ts` (9), `budget.test.ts` (9), `nuit.test.ts` (13), `modes.test.ts` (16) — **sept fichiers, 58 références**
- *(`page.test.ts` (5) n'est PAS migré : ses références testent la branche de transition, et elles meurent avec elle à la tâche 10.)*

**Interfaces:**
- Produit : `export const ECRANS_REFERENCE: { riche: Ecran; moyen: Ecran; minimal: Ecran }` depuis `app/tests/ecrans-reference.ts`, plus les trois alias `ecranRiche`, `ecranMoyen`, `ecranMinimal`.

> **Pourquoi un fichier séparé, alors que la spec dit « construit dans `tests/aides.ts` ».** `aides.ts` fait 228 lignes et a **une** responsabilité : monter réellement `demarrer()` (réseau bouchonné, connexion factice, `monterDemarrage`). Le triplet est de la **donnée de référence**, lue par des fichiers qui ne montent rien (`budget.test.ts`, `agencement.test.ts`, `contrat-schema.test.ts`). Les mélanger ferait de `aides.ts` un fourre-tout à 400 lignes et forcerait ces fichiers à importer le harnais de montage pour lire trois objets. C'est une couture réelle — la même que `schema.py` → `fautes.py` → `validateurs.py` côté Python. **Écart assumé par rapport à la lettre de la spec, pas à son intention** ; `ecranVide` reste dans `aides.ts`, où il sert de socle aux montages.

- [ ] **Step 1: Écrire le test qui garde le triplet AVANT d'écrire le triplet**

Le triplet doit être **conforme au contrat** et **ne pas décrire cette maison**. Les deux se gardent, et le second est le plus facile à perdre. Dans un nouveau `app/tests/ecrans-reference.test.ts` :

```ts
/** Le triplet de référence se garde lui-même : conforme au contrat, et SANS cette maison. */
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import SCHEMA from '../../contrat/ecran.schema.json';
import { ECRANS_REFERENCE } from './ecrans-reference';

const valider = new Ajv({ allErrors: true }).compile(SCHEMA);

describe('les écrans de référence', () => {
  it.each(Object.entries(ECRANS_REFERENCE))('%s est conforme au contrat', (_nom, ecran) => {
    expect(valider(ecran), JSON.stringify(valider.errors)).toBe(true);
  });

  it('ne portent AUCUNE entité de cette maison', () => {
    // La liste vient d'`ecran.ts` tant qu'il existe ; après la tâche 10, elle est vide et
    // ce test devient une tautologie — c'est voulu, il part alors lui aussi.
    const serialise = JSON.stringify(ECRANS_REFERENCE);
    for (const interdit of ['aqara', 'peugeot', 'e208', 'delorean_', 'nexiste']) {
      expect(serialise.toLowerCase()).not.toContain(interdit);
    }
    expect(serialise).not.toMatch(/\b(salon|cuisine|bureau|chambre)\b/i);
  });

  it('portent les contrastes dont les suites ont besoin', () => {
    expect(ECRANS_REFERENCE.riche.aspirateurMaison).toBeDefined();
    expect(ECRANS_REFERENCE.moyen.aspirateurMaison).toBeUndefined();
    expect(ECRANS_REFERENCE.minimal.aspirateurMaison).toBeUndefined();
    expect(ECRANS_REFERENCE.riche.voiture).toBeDefined();
    expect(ECRANS_REFERENCE.moyen.voiture).toBeUndefined();
    expect(ECRANS_REFERENCE.riche.minuteurs?.length).toBeGreaterThan(0);
    expect(ECRANS_REFERENCE.minimal.commandes).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer, vérifier qu'il échoue à l'import**

Run: `npm --prefix app test -- ecrans-reference`
Expected: FAIL — le module n'existe pas.

- [ ] **Step 3: Écrire le triplet**

`app/tests/ecrans-reference.ts`. Les entités suivent une convention **délibérément neutre** (`light.zone_a_1`, `sensor.zone_b_temperature`) : c'est ce qui rend visible, à la lecture, qu'un test a cessé de parler de cette maison.

```ts
/** Trois écrans de référence, conformes au contrat et qui NE DÉCRIVENT PAS cette maison.
 *
 *  Ils remplacent `ECRANS` dans les douze suites qui lisaient la configuration réelle. Trois et
 *  non un seul : un écran unique ne rendrait pas les tests de contraste faux, il les rendrait
 *  VIDES — `aspirateurMaison` déclaré ici et absent là, `voiture` présente ici et absente là,
 *  des modes atteints ici et pas là. Un test vide ne dit rien, et ne dit pas qu'il ne dit rien.
 *
 *  Conformité et neutralité sont gardées par `ecrans-reference.test.ts`. */
import type { Ecran } from '../src/ecran';

/** Tout est déclaré : c'est le chemin où chaque section a quelque chose à rendre. */
export const ecranRiche: Ecran = {
  nom: 'Alpha',
  temperature: 'sensor.zone_a_temperature',
  hauteurUtile: 585,
  ambiances: [
    { libelle: 'Ambiance A', icone: 'bulb', entite: 'light.zone_a_1', service: ['light', 'toggle'] },
  ],
  commandes: [
    { libelle: 'Commande A', icone: 'bulb', entite: 'light.zone_a_2', service: ['light', 'toggle'] },
    { libelle: 'Épinglée', icone: 'porte', entite: 'binary_sensor.zone_a_ouvrant', epingle: true },
    { libelle: 'Muette nommée', icone: 'list', entite: 'todo.zone_a_absente',
      absenceNommee: 'Liste indisponible' },
  ],
  extrasMaison: [
    { libelle: 'Extra A', icone: 'scan', entite: 'script.zone_a_scan', service: ['script', 'turn_on'] },
  ],
  aspirateurMaison: {
    libelle: 'Aspirer ici', icone: 'aspirateur', entite: 'vacuum.zone_a', service: ['vacuum', 'start'],
  },
  synthese: [
    { texte: 'Ouvrants', entite: 'binary_sensor.zone_a_ouvrant', operateur: 'egal', valeur: 'on' },
  ],
  sources: [
    { libelle: 'Source A', entite: 'media_player.zone_a', icone: 'film' },
  ],
  ouvrants: ['binary_sensor.zone_a_ouvrant'],
  aspirateur: 'vacuum.zone_a',
  listesTachesExtra: ['todo.zone_a_extra'],
  minuteurs: [{ timer: 'timer.zone_a', nom: 'Minuteur A' }],
  etiquettesMinuteur: ['Court', 'Long'],
  voiture: {
    batterie: 'sensor.vehicule_batterie', autonomie: 'sensor.vehicule_autonomie',
    branchee: 'binary_sensor.vehicule_branchee', enCharge: 'binary_sensor.vehicule_en_charge',
    clim: 'sensor.vehicule_clim', demarrerClim: 'button.vehicule_clim_on',
    arreterClim: 'button.vehicule_clim_off',
  },
  delorean: true,
  agencement: { zones: ['ambiances', 'commandes', 'blocCentral', 'synthese'], blocDefaut: 'voiture' },
};

/** Le contraste : ni voiture, ni aspirateur de pièce, ni DeLorean. */
export const ecranMoyen: Ecran = {
  nom: 'Beta',
  temperature: 'sensor.zone_b_temperature',
  ambiances: [
    { libelle: 'Ambiance B', icone: 'bulb', entite: 'light.zone_b_1', service: ['light', 'toggle'] },
  ],
  commandes: [
    { libelle: 'Commande B', icone: 'rideau', entite: 'cover.zone_b', service: ['cover', 'toggle'] },
  ],
  extrasMaison: [],
  synthese: [
    { texte: 'Tâches', entite: 'todo.zone_b', operateur: 'superieur', valeur: 0 },
  ],
  sources: [],
  ouvrants: ['binary_sensor.zone_b_ouvrant'],
  listesTachesExtra: ['todo.zone_b'],
  agencement: { zones: ['commandes', 'ambiances', 'synthese'] },
};

/** Le strict minimum que le contrat exige : huit champs requis, rien de plus. */
export const ecranMinimal: Ecran = {
  nom: 'Gamma',
  temperature: 'sensor.zone_c_temperature',
  ambiances: [], commandes: [], synthese: [], extrasMaison: [], sources: [], ouvrants: [],
};

export const ECRANS_REFERENCE = {
  riche: ecranRiche, moyen: ecranMoyen, minimal: ecranMinimal,
} as const;
```

> **Les valeurs ci-dessus sont un point de départ conforme, pas une cible figée.** L'implémenteur les ajuste pour que les sept fichiers de l'étape 6 passent — en ajoutant ce qui manque, **jamais** en affaiblissant une assertion qui passait avant. Toute assertion supprimée est nommée dans le rapport, avec ce qu'elle gardait et pourquoi elle n'a plus d'objet.

- [ ] **Step 4: Lancer le test du triplet**

Run: `npm --prefix app test -- ecrans-reference`
Expected: PASS, 3 + 1 + 1 tests. Si la conformité ajv échoue, **lisez `valider.errors`** : c'est le contrat qui parle, et il a raison.

- [ ] **Step 5: Neutraliser `ecranVide`**

`app/tests/aides.ts:14` porte `nom: 'Salon'` — un nom de pièce de cette maison, dans le socle de toutes les suites de montage. Le passer à `'Zéro'` (ou tout nom neutre), et relancer **toute** la suite : un test qui dépendait de ce nom le dira.

Run: `npm --prefix app test`
Expected: PASS. Toute casse ici est une **trouvaille** — un test qui affirmait quelque chose sur le nom « Salon » par le décor plutôt que par intention. Nommez-la dans le rapport.

- [ ] **Step 6: Migrer les sept fichiers légers, un par un, en relançant à chaque fois**

Dans cet ordre (du plus petit au plus gros) : `repli` (1), `cochage` (5), `navigation` (5), `agencement` (9), `budget` (9), `nuit` (13), `modes` (16). **Un fichier, un lancement, un commit.**

La substitution n'est pas mécanique. Pour chaque référence, la question est : *ce test affirme-t-il quelque chose sur le CONTRAT, ou sur CETTE MAISON ?*

| Ce que le test disait | Ce qu'il doit dire |
|---|---|
| `ECRANS.cuisine` (l'écran le plus riche) | `ecranRiche` |
| `ECRANS.salon` / `ECRANS.bureau` (un écran moyen) | `ecranMoyen` |
| « le salon n'a pas d'`aspirateurMaison` » | « un écran qui ne le déclare pas garde la tuile générique » |
| « la cuisine épingle Porte » | « une commande `epingle: true` est rendue en premier » |
| un nombre tiré de la donnée réelle (`toHaveLength(7)`) | le même nombre **dérivé** du triplet (`ecranRiche.commandes.length`) |

> **Le dernier cas est le piège.** Un `toHaveLength(7)` recopié devient un `toHaveLength(3)` recopié : on a changé le chiffre, pas la faute. Dérivez-le, ou remplacez l'assertion de comptage par l'assertion de **comportement** qu'elle approximait.

```bash
npm --prefix app test -- <fichier>
git add app/tests/<fichier>.test.ts
git commit -m "test(app): <fichier> asserts the contract, not this house"
```

- [ ] **Step 7: Vérifier le compte de références restantes**

```bash
for f in $(grep -rl "ECRANS" app/tests/); do printf "%4d  %s\n" $(grep -o "ECRANS" $f | wc -l) $f; done | sort -rn
```

Expected: **7 fichiers, 253 références** — les six lourds (`corps` 76, `ecran` 52, `demarrage` 48, `contrat-schema` 28, `orchestration` 27, `maison` 17 = **248**) plus `page` 5, qui reste jusqu'à la tâche 10. Le compte se pose : **311 − 58 = 253**. S'il ne tombe pas juste, **c'est une trouvaille** — un fichier a bougé depuis la mesure du 2026-09-14 — pas une erreur d'arithmétique à arrondir.

- [ ] **Step 8: Lancer les trois suites et committer le triplet**

```bash
npm --prefix app test && make test
git add app/tests/ecrans-reference.ts app/tests/ecrans-reference.test.ts app/tests/aides.ts
git commit -m "test(app): reference screen triplet -- contract-shaped, and not this house"
```

Expected: vitest **55 fichiers** (52, plus les deux épreuves de la tâche 4, plus `ecrans-reference.test.ts` — `ecrans-reference.ts` n'en est pas un, il n'a pas de test), `make test` **6/6**.

---

### Task 9: Les six fichiers lourds — 248 références

Même travail que la tâche 8, sur les six fichiers où il y a le plus à perdre. Séparé parce qu'un relecteur peut légitimement accepter la tâche 8 et rejeter celle-ci : `corps.test.ts` (76) et `ecran.test.ts` (52) portent des assertions que **personne d'autre ne porte**.

**Files:**
- Modify: `app/tests/maison.test.ts` (17), `orchestration.test.ts` (27), `contrat-schema.test.ts` (28), `demarrage.test.ts` (48), `ecran.test.ts` (52), `corps.test.ts` (76)

**Le cas particulier d'`ecran.test.ts`.** Ce fichier teste `ECRANS` **lui-même** : il affirme que la cuisine déclare tel `aspirateurMaison`, que le salon ne le déclare pas, que telle valeur est bien recopiée. Quand les littéraux partent, **la majeure partie de ce fichier n'a plus d'objet**. Ce qui survit, c'est ce qui affirme quelque chose sur le TYPE et sur le CONTRAT — et cela devient un test du triplet de référence. **Ne le migrez pas ligne à ligne : décidez, test par test, s'il survit, et dites-le.** Un fichier qui passe de 52 références à 4 tests est un résultat correct, à condition que le rapport nomme ce qui est parti et pourquoi.

- [ ] **Step 1: `maison.test.ts` — 17 références**

Il porte la substitution `aspirateurMaison` (tâche 1) et le budget de hauteur de la vue « Toute la maison ». `TOUTE_LA_MAISON` **reste dans le dépôt** : les tests qui l'affirment ne bougent pas. Seuls ceux qui lisent `ECRANS.cuisine` basculent sur `ecranRiche`.

Run: `npm --prefix app test -- maison`
Expected: PASS. Commit.

- [ ] **Step 2: `orchestration.test.ts` — 27 références**

Il monte réellement `demarrer()`. Les références à `ECRANS` y sont surtout du **décor** : elles deviennent `ecranRiche` / `ecranMoyen` presque telles quelles. **Le décor à deux écrans est obligatoire** partout où le test distingue un écran d'un autre — c'est la leçon n°3, et c'est ce que 3b a déjà payé sur le rechargement à chaud.

Run: `npm --prefix app test -- orchestration`
Expected: PASS. Commit.

- [ ] **Step 3: `contrat-schema.test.ts` — 28 références**

Il valide `ECRANS` contre `contrat/ecran.schema.json`. Il valide désormais **le triplet**. C'est une reprise, pas une création — et elle recoupe `ecrans-reference.test.ts` (tâche 8, étape 1). **Ne gardez pas les deux** : fusionnez dans `contrat-schema.test.ts`, qui est le fichier dont c'est le sujet, et retirez le doublon du test du triplet en le disant dans le rapport.

Run: `npm --prefix app test -- contrat-schema`
Expected: PASS. Commit.

- [ ] **Step 4: `demarrage.test.ts` — 48 références**

`demarrage.ts` fait **2032 lignes** et ce fichier est son filet. **Ne le refactorez pas** : substituez le décor, rien d'autre. Toute envie de réorganiser ce fichier appartient au chantier « découper `demarrage.ts` », qui s'ouvre **après** la tâche 11 (§ « Ce que ce plan NE fait PAS », point 2).

Run: `npm --prefix app test -- demarrage`
Expected: PASS. Commit.

- [ ] **Step 5: `ecran.test.ts` — 52 références, et la décision test par test**

Trois catégories, et une seule survit telle quelle :

| Ce que le test affirme | Sort |
|---|---|
| une propriété du **contrat** (« tout `Bouton` a un `libelle` non vide ») | **survit**, sur le triplet |
| une propriété du **type** (« `absenceNommee` est optionnel ») | **survit**, sur le triplet |
| une valeur de **cette maison** (« la cuisine épingle `binary_sensor.porte_entree` ») | **part**, et le rapport dit ce qu'elle gardait |

Run: `npm --prefix app test -- ecran`
Expected: PASS, avec **nettement moins** de tests qu'avant. Commit, avec le compte avant/après dans le message.

- [ ] **Step 6: `corps.test.ts` — 76 références, le plus gros**

Il porte `absenceNommee` et ses **cinq** points de passage (`CLAUDE.md` : `corps.ts:417`, `:425`, `:106`, `:270`, et `rendu/maison.ts:90`), dont **tous les cinq sont nécessaires** — le plan d'origine n'en nommait que trois. `ecranRiche` porte délibérément une commande `absenceNommee` : **vérifiez que les cinq points restent exercés après la bascule**, et dites-le explicitement dans le rapport. Une commande muette qui disparaît du décor désarme cinq gardes d'un coup, en silence.

Run: `npm --prefix app test -- corps`
Expected: PASS. Commit.

- [ ] **Step 7: La mutation — retirer un des cinq points de passage d'`absenceNommee`**

Dans `app/src/rendu/corps.ts`, retirer `|| b.absenceNommee !== undefined` du filtre de la ligne ~417. Relancer `corps.test.ts`, **coller la sortie**, restaurer.
Expected: FAILED. **Si rien ne tombe**, le triplet a perdu ce que `ECRANS` portait : ajoutez au décor ce qui manque **avant** de continuer. Recommencez pour `rendu/maison.ts:90` (la tuile « Scanner », qui vit dans `extrasMaison` et n'est **pas** rendue par `corps.ts`).

- [ ] **Step 8: Vérifier qu'il ne reste que `page.test.ts`**

```bash
grep -rl "ECRANS" app/tests/
```

Expected: **`app/tests/page.test.ts` seul**, avec ses 5 références — elles testent la branche de transition et meurent avec elle à la tâche 10.

```bash
npm --prefix app test && make test
```

Expected: vitest **55 fichiers**, tous verts ; `make test` **6/6**.

---

### Task 10: Le commit de retrait — étape 8

**Un seul commit.** Les littéraux, l'outil, ses trois épreuves, les trois pages historiques et la branche `data-piece` partent **ensemble**. Séparés, ils laisseraient le dépôt dans un état où le code ne compile pas, ou pire : où il compile en portant du code mort qui a l'air vivant.

**Files:**
- Modify: `app/src/ecran.ts` — les littéraux partent, **le TYPE reste**
- Modify: `app/src/page.ts` — la branche de transition part
- Delete: `app/tests/page.test.ts` (ou ce qu'il en reste), `app/gabarits/piece.html`, `dist/salon.html`, `dist/bureau.html`, `dist/cuisine.html`
- Delete: `app/outils/exporter-ecrans.mjs`, `app/outils/rendre-ecrans-yaml.py`, `app/outils/verdicts-commentaires.tsv`
- Delete: `app/tests/migration-donnee.test.ts`, `app/tests/migration-rendu.test.ts`, `tests/test_registre_commentaires.py`
- Modify: `app/scripts/generer-pages.mjs`, `app/outils/verifier-rendu.mjs:853`, `:4018`, `:4025`, `:4231`

- [ ] **Step 1: Retirer les littéraux, garder le type**

`app/src/ecran.ts` passe de **551 lignes** à son squelette de types. Ce qui part : la constante `ECRANS` et ses trois écrans. Ce qui **reste** : `Ecran`, `Bouton`, `Voiture`, `EntreeSynthese`, `Source`, `Minuteur`, et leurs docstrings — **c'est la décision 1 de la spec**, et le registre de la tâche 3 a classé ces commentaires-là `type` précisément pour qu'ils restent.

Le fichier garde une docstring de tête qui dit ce qui s'est passé, et **où la donnée vit maintenant** :

```ts
/** Le TYPE d'un écran. La DONNÉE vit dans Home Assistant depuis le 2026-09-…, sous-entrées de
 *  l'intégration « Tablettes murales » (`custom_components/home_desk/`), servie par la commande
 *  websocket `home_desk/ecran` et lue par `configuration.ts`.
 *
 *  Les trois écrans littéraux ont été retirés à l'étape 8 de la mise en production (plan 3c) —
 *  après que les trois tablettes ont vécu 24 heures sur le transport, et pas avant. Les
 *  commentaires qui portaient sur la DONNÉE sont partis avec elle, en `note` : le registre de
 *  `app/outils/verdicts-commentaires.tsv` en tenait le compte, plage par plage, et il part lui
 *  aussi dans ce commit (voir `git log` pour l'état final du registre).
 *
 *  Ce fichier N'EST PLUS une couture vers cette maison. Quinze `entity_id` lui survivent dans
 *  sept autres fichiers — l'INVENTAIRE de la maison, pas la configuration d'écran — et
 *  `tests/test_portabilite_app.py` garde ce qui doit l'être. */
```

- [ ] **Step 2: Retirer la branche de transition — et NE PAS retirer `demarrerAvecEcran`**

`app/src/page.ts` se réduit à deux branches :

```ts
/** Quel écran cette page doit-elle montrer ?
 *
 *  Séparé d'`index.ts` parce qu'`index.ts` s'exécute À L'IMPORT : l'importer, c'est le lancer.
 *
 *  La troisième branche — `data-piece` → `ECRANS[clé]` — a vécu du 2026-09-13 au 2026-09-…, le
 *  temps de la mise en production : elle rachetait le retour arrière par tablette, que le dépôt
 *  atomique de `www/wallpanel/` (`hooks/install.py`, `replace_tree`) rend autrement impossible.
 *  Elle est partie avec les littéraux qu'elle lisait. */
export function demarrerPage(
  racine: HTMLElement, href: string, deps: Partial<DependancesPage> = {},
): Promise<void> {
  const demarrer = deps.demarrer ?? demarrerHA;
  const nom = new URL(href).searchParams.get('ecran');
  return demarrer(racine, nom ?? '');
}
```

> **PIÈGE MESURÉ — ne supprimez PAS `demarrerAvecEcran`.** Elle a l'air transitoire parce que `page.ts` l'importait pour la branche `data-piece`. Elle ne l'est pas : `demarrer()` l'appelle elle-même (`demarrage.ts:2016`, une fois l'écran résolu par le transport), et **quatre suites** la montent directement — `demarrage.test.ts`, `navigation.test.ts`, `pannes.test.ts`, et le harnais `aides.ts`. La supprimer casse la moitié de la suite application **et** le chemin de rendu réel.

- [ ] **Step 3: Retirer les trois pages historiques**

`app/scripts/generer-pages.mjs` ne produit plus que `index.html` à partir de `app/gabarits/index.html`. `app/gabarits/piece.html` est supprimé. `dist/salon.html`, `dist/bureau.html`, `dist/cuisine.html` sont supprimés — **par `git rm`**, pas seulement retirés du build : ils sont **versionnés**.

`app/outils/verifier-rendu.mjs` désapprend l'URL historique, à ses quatre emplacements mesurés : `:853` (la documentation des deux URL), `:4018` (le commentaire qui décrit les pages servies), `:4025` et `:4231` (les deux gabarits HTML en dur qui portent `data-piece="cuisine"` et `data-piece="salon"`). **Vérifiez par `grep -n "data-piece\|<piece>.html"` qu'il n'en reste aucun** — le plan 3b lui a appris la nouvelle URL *sans désapprendre l'ancienne*, délibérément ; c'est ici que l'ancienne part.

- [ ] **Step 4: Retirer l'outil et ses épreuves**

```bash
git rm app/outils/exporter-ecrans.mjs app/outils/rendre-ecrans-yaml.py \
       app/outils/verdicts-commentaires.tsv \
       app/tests/migration-donnee.test.ts app/tests/migration-rendu.test.ts \
       app/tests/migration-notes.test.ts \
       tests/test_registre_commentaires.py \
       app/gabarits/piece.html \
       dist/salon.html dist/bureau.html dist/cuisine.html
```

**`app/tests/page.test.ts` n'est PAS dans cette liste, à dessein** (ruling R3 du scan de pré-vol) : voir juste en dessous.

> **`page.test.ts` : lisez-le avant de le supprimer.** Ses cinq références à `ECRANS` testent la branche `data-piece` et meurent avec elle — mais le fichier teste aussi **la priorité de `?ecran=` sur `data-piece`** et **la chute vers la dégradation n°1 quand il n'y a rien**. Cette dernière survit : gardez-la, dans ce fichier réduit ou dans `repli.test.ts`. Supprimer le fichier entier retirerait la garde de la dégradation n°1, que **rien d'autre ne porte**.

Retirer aussi les trois lignes ajoutées à `.gitignore` à la tâche 2 (les produits n'existent plus) et le sixième script de `make test`… **non** : `test_portabilite_app` **reste** (tâche 5). Seul `test_registre_commentaires` disparaît, et il n'avait jamais été ajouté au `Makefile` (tâche 4, étape 5) — vérifiez que `make test` est toujours à **6 scripts**, pas 5.

- [ ] **Step 5: Reconstruire et mesurer ce qui reste**

```bash
npm --prefix app run build
ls dist/*.html
grep -ohE "'[a-z_]+\.[a-z0-9_]+'" -r app/src/ | sort -u | wc -l
wc -l app/src/ecran.ts
grep -rl "ECRANS" app/tests/ || echo "aucun"
```

Expected, **et ce sont les chiffres du chantier** :
- `dist/index.html` **seul**
- **15** `entity_id` distincts dans `app/src/` (contre 69) — les quatorze de cette maison plus `sun.sun`
- `app/src/ecran.ts` très en dessous de 551 lignes
- **aucun** fichier de tests ne lit `ECRANS`

- [ ] **Step 6: Lancer les trois suites AVANT de committer, puis committer, puis les relancer**

```bash
npm --prefix app test
make test-composant PYTHON=/root/.local/share/uv/python/cpython-3.14.3-linux-x86_64-gnu/bin/python3.14
git add -u && git add dist app/src app/tests app/scripts app/outils
git commit -m "feat!: remove the screen literals -- the configuration now lives in Home Assistant"
make test
```

Expected: vitest vert (le compte de fichiers baisse de 3 : les deux épreuves et `page.test.ts` s'il a été fusionné) ; `make test-composant` **253** ; `make test` **6/6**.

> **L'ordre n'est pas négociable.** `test_dist_a_jour` relance `npm run build` et compare à HEAD **commité** : lancé avant le commit, il échoue sur un `dist/` que rien ne contredit. C'est le piège que 3b a payé, et il est écrit dans les Global Constraints.

- [ ] **Step 7: Mettre les documents au niveau du code**

Trois fichiers mentent dès que ce commit existe :

- **`README.md`** — le geste opérateur n°3 devient `/local/wallpanel/index.html?ecran=<nom>` (le nom de fichier est obligatoire, décision 9), et un **quatrième geste** apparaît : ajouter l'intégration « Tablettes murales » et créer ses écrans. Les **cinq régressions nommées** de la spec (§ « Ce que ça coûte ») s'écrivent ici, franchement : une installation neuve n'affiche plus rien tant qu'aucun écran n'est configuré ; la config n'est plus versionnée par défaut ; le raisonnement quitte le dépôt ; un aller-retour réseau s'ajoute au démarrage ; une dépendance de test lourde entre.
- **`app/README.md`** — le tableau des trois tablettes perd ses URL historiques.
- **`CLAUDE.md`** — la décision « `app/src/ecran.ts` est la couture PRINCIPALE vers cette maison » devient fausse : il n'y a plus de configuration d'écran dedans. La réécrire avec la mesure du jour (**15** `entity_id` dans sept fichiers, gardés par `tests/test_portabilite_app.py`), et fermer la dette « `dist/` embarque la configuration littérale COMPLÈTE de cette maison » — **elle ne l'embarque plus**, et c'est le résultat le plus important de tout le chantier. Mesurez-le avant de l'écrire : `grep -oE '"[a-z_]+\.[a-z0-9_]+"' dist/wallpanel.js | sort -u | wc -l`.

```bash
git add README.md app/README.md CLAUDE.md
git commit -m "docs: operator gestures, named regressions, and the closed literal-configuration debt"
```

---

### Task 11: Le redéploiement, et la clôture

- [ ] **Step 1: Déployer, avec la même prudence qu'à l'étape 2**

Les trois suites sont vertes sur le commit qu'on s'apprête à déployer (tâche 10, étape 6). Déployer le paquet, puis :

```bash
docker exec homeassistant python -m homeassistant --script check_config -c /config
```

Porte : les trois tablettes rechargent **seules** et rendent **à l'identique**. Comparez aux captures de l'étape 1 du dossier de production.

**Retour arrière : redéployer l'archive de l'étape 1 EN ENTIER.** Pas « recopier trois HTML » : sans leur bundle d'époque, trois pages dont la branche `data-piece` n'existe plus donnent **trois murs blancs**.

- [ ] **Step 2: Clore le journal de production**

La huitième ligne du journal, datée, avec ce qui a été observé. Et la phrase qui compte pour la suite : **l'archive de l'étape 1 et la sauvegarde HA se gardent au moins une semaine** — après ce déploiement, l'archive est le **seul** chemin de retour. Un `git revert` suffit pour le dépôt, mais il exige de reconstruire `dist/` et de redéployer : ce n'est plus un retour arrière, c'est un nouveau déploiement.

- [ ] **Step 3: Écrire ce que le chantier a réellement produit**

Dans le dossier de production, une section finale avec **les mesures d'après**, pas les intentions :

| | Avant (2026-09-14) | Après |
|---|---|---|
| `entity_id` distincts dans `app/src/` | 69 | à mesurer |
| …dans `dist/wallpanel.js` | 69 | à mesurer |
| `app/src/ecran.ts` | 551 lignes | à mesurer |
| Fichiers HTML dans `dist/` | 4 | à mesurer |
| Fichiers de tests lisant `ECRANS` | 14 (311 réf.) | à mesurer |
| Plages de commentaire migrées / restées / abandonnées | — | le registre final |

Et **ce qui n'a pas été atteint** : les 15 `entity_id` résiduels, `demarrage.ts` à 2032 lignes, et le mot de passe Fully exposé dans `git log` (tâche 5) qui doit être changé sur les trois tablettes. Un chantier qui ne nomme que ses succès oblige le suivant à re-mesurer.

```bash
git add docs/superpowers/production/2026-09-14-mise-en-production-3c.md
git commit -m "docs(production): final measurements and what this project did not reach"
```

- [ ] **Step 4: Rendre la main**

Les quatre plans de la série sont exécutés. `superpowers:finishing-a-development-branch` prend le relais pour l'intégration de la branche — et la décision d'intégration appartient au propriétaire.

---

## Auto-relecture du plan

**1. Couverture de la spec.** Chaque exigence des sections « La migration », « La mise en production », « Le build et l'installation », « Ce que ça coûte » et « Ce qui reste ouvert » a une tâche :

| Exigence de la spec | Tâche |
|---|---|
| Outil d'export, moitié donnée, par évaluation | 2 |
| Rendu YAML par `yaml_ecrans.rendre()`, jamais un rendeur maison | 2 |
| Le fichier produit n'entre jamais dans git | 2, étape 1 |
| Registre exhaustif des commentaires, trois verdicts, échec si une plage manque | 3 |
| Quatrième colonne : lignes de la note, séparateur documenté, cas au corpus partagé | 3, étapes 3 et 5 |
| Niveaux 1, 2, 3 de la preuve | 4 |
| Les 49 ordres de zones | **déjà fait au plan 3b** (`app/tests/zones-ordres.test.ts`, 49/49, dette rayée) |
| `aspirateurMaison` éditable, après son littéral | 1 |
| IP des tablettes + les quinze `entity_id` résiduels | 5 (IP) ; les quinze sont **explicitement hors périmètre**, § « Ce que ce plan NE fait PAS » |
| Re-mesurer `fully_kiosk.set_config` avant le dossier | 6, étape 1 |
| Les huit étapes de production, chacune avec son retour arrière | 6 (dossier), 7 (1-7), 11 (8) |
| Écrans de référence dans les tests | 8, 9 |
| Retrait des littéraux, de l'outil, des épreuves, des pages, de `data-piece` — **un seul commit** | 10 |
| Gestes opérateur (le n°3 change, un n°4 apparaît) | 10, étape 7 |
| Les cinq régressions nommées dans le README | 10, étape 7 |
| Format de `contrat/budget.json` | **fermé depuis le plan 1**, § « Les arbitrages », C |
| Vue « Réglages » sur la tablette | hors périmètre, § « Ce que ce plan NE fait PAS » |

**2. Balayage des remplissages.** Aucun « TBD », aucun « à compléter ». Les deux endroits où le plan ne donne pas le contenu final sont nommés comme tels et disent pourquoi : le fichier de verdicts de la tâche 3 (classer 178 plages **est** le travail, et aucune machine ne le décide) et les valeurs du triplet de la tâche 8 (point de départ conforme, ajusté par les suites, toute assertion perdue nommée au rapport).

**3. Cohérence des noms.** `ASPIRATEUR_GENERIQUE` (tâche 1) est relu tel quel en tâche 9, étape 1. `ecransPourImport` et `plagesDeCommentaire` (tâches 2 et 3) sont consommés tels quels en tâche 4. `ECRANS_REFERENCE` / `ecranRiche` / `ecranMoyen` / `ecranMinimal` (tâche 8) sont relus tels quels en tâche 9. `SEPARATEUR_NOTE` est défini en tâche 3 et utilisé en tâche 3 seulement. Le step `aspirateur_maison` (id du flow) et la clé `aspirateurMaison` (contrat) sont distincts **à dessein**, et la raison est écrite à l'endroit où la confusion se produirait.

**4. Les deux pièges d'ordre, écrits là où ils mordent.** `npm run build` → `git commit` → `make test`, jamais autrement (Global Constraints, rappelé aux tâches 1, 5 et 10). Et le littéral de `rendu/maison.ts` **avant** la porte de saisie d'`aspirateurMaison`, jamais l'inverse (tâche 1, qui est cet ordre).
