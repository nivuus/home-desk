# Plan 3b/3 — L'application lit sa configuration depuis Home Assistant

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'application de tablette murale cesse de porter la configuration des écrans dans son bundle et la demande à Home Assistant par websocket au démarrage, avec cinq dégradations nommées et un rechargement à chaud.

**Architecture:** Le plan 3a a livré toute l'intégration côté Python (config flow, sous-entrées, transport `home_desk/ecran` et `home_desk/ecrans`, événement `home_desk_config_changed`). 3b est le client de ce transport. Quatre trous du module `connexion.ts` se bouchent d'abord (T1), puis un client de transport (T2) et sept écrans de repli (T3) naissent dans des fichiers neufs, puis `demarrer()` devient une coquille qui résout l'écran avant de déléguer au corps existant, inchangé (T4). Le rechargement à chaud (T5) et le passage à un `index.html` unique avec branche de transition (T6) suivent. T7 est la seule tâche Python. T8 mesure une dette du plan 2 au lieu de la réparer.

**Tech Stack:** TypeScript, `lit-html`, vitest + jsdom (47 fichiers / 1049 tests), esbuild (`npm run build`), Python 3.14 + `voluptuous` + `pytest-homeassistant-custom-component` (212 tests), Home Assistant 2026.9.1.

**Spec:** `docs/superpowers/specs/2026-09-12-config-ecrans-depuis-ha-design.md`, **amendée le 2026-09-13 (commit `d5cc210`)**. Lisez la version amendée : elle marque **FAIT** les sections livrées par les plans 1, 2 et 3a, corrige douze chiffres que la mesure a démentis, et porte la décision 11 (« un refus HA se transporte par son CODE ») dont T1 et T2 dépendent entièrement.

**Base:** `main` à `d5cc210`, arbre propre. Suites vertes à cet état :

| Suite | Commande | Attendu |
|---|---|---|
| Portable | `make test` | 5/5 |
| Composant | `make test-composant PYTHON=/root/.local/share/uv/python/cpython-3.14.3-linux-x86_64-gnu/bin/python3.14` | 212 passed |
| Application | `npm --prefix app test` | 47 fichiers / 1049 tests |

Le `python3` du système est 3.13.5 ; `pytest-homeassistant-custom-component` exige ≥ 3.14. Le garde-fou du `Makefile` imprime le geste complet quand on l'oublie — **lisez son message, ne le contournez pas**.

---

## Global Constraints

Ces contraintes lient **toutes** les tâches. Les exigences de chaque tâche les incluent implicitement.

### Langue

- **Le code de ce dépôt est en FRANÇAIS** : identifiants, commentaires, docstrings. `connecter()`, `envoyerCommande()`, `demarrer()`, `Ecran`, `Bouton`, `chargerTaches()`. Écrivez comme le code alentour. **N'anglicisez rien** — c'est l'inverse de l'accord de travail global, et c'est le projet qui gagne : un `loadScreen()` à côté d'un `chargerEcran()` est une incohérence, pas une correction.
- **Les chaînes utilisateur de l'application sont du français ACCENTUÉ.** Modèles existants à imiter : `sessionAbsente()` et `erreurDemarrage()`.
- **Les messages Python du composant restent du français SANS accents.** Ce sont des diagnostics développeur destinés au journal HA, jamais affichés à l'utilisateur (décision 11 de la spec). Ne les accentuez pas, ne les faites pas passer par `translations/`.
- **Les messages de commit sont en français sans accents**, comme tout l'historique du dépôt.

### Structure

- **Aucun fichier source au-dessus de 500 lignes.** Quand un fichier approche, découpez-le sur une couture réelle — un module, une responsabilité, une frontière — jamais à un nombre de lignes arbitraire.
- **Dette connue, hors périmètre de 3b, à ne PAS aggraver** : `app/src/demarrage.ts` fait **1914 lignes**, et quatre autres fichiers dépassent 500 (`mouvement/moteur.ts` 611, `rendu/recette.ts` 605, `rendu/corps.ts` 598, `ecran.ts` 551). 3b ne les répare pas — trouver leurs coutures est un chantier à soi seul. **Mais 3b ne doit pas les faire grossir** : tout code neuf va dans un fichier neuf, et T3 retire même deux fonctions de `demarrage.ts`. Contrôle exigé à la fin de T6 : `wc -l app/src/demarrage.ts` doit rendre **moins** que 1914.
  **Corrigé en relecture finale de branche : cette contrainte n'a PAS été tenue.** Mesuré en fin de branche : `git show main:app/src/demarrage.ts | wc -l` → 1914 ; `wc -l app/src/demarrage.ts` → **2022**, soit **+108 lignes**, jamais retirées. La cause mesurée : la nouvelle `demarrer()` (~96 lignes) — la couture que la tâche 6 a bien créée, mais dans un module NEUF (`app/src/page.ts`, « résoudre quel écran montrer »), pas en réduisant `demarrage.ts` lui-même. Écrit ici plutôt qu'effacé : `demarrage.ts` n'a PAS été refactoré pour corriger ce dépassement — sa découpe reste, comme prévu, un chantier à part entière pour 3c.

### Sécurité et portabilité

- **Ne jamais écrire dans `/opt/nivuus/`.** Aucune tâche de 3b n'y touche.
- **Ne jamais lire, afficher ni committer `HA_TOKEN`.**
- **Rien de cette maison n'entre dans `contrat/`** : aucun `entity_id`, aucun nom de pièce, aucune URL, aucun jeton.
- **`make test` reste `python3` + PyYAML seulement.** C'est la suite qui doit tourner sur la cible d'installation, qui n'a rien d'autre.
- **Après toute modification d'un fichier de `contrat/` : `make contrat`, et committez le résultat.** Sans ce geste la copie embarquée (`custom_components/home_desk/contrat/`) reste périmée. *Aucune tâche de 3b ne modifie `contrat/` — si vous vous apprêtez à le faire, vous sortez du périmètre.*

### Invariants du composant, gardés par des tests AST

- **Le site d'écriture unique** : les sept portes d'écriture de Home Assistant ne peuvent être appelées que depuis `garde_ecran.py`. Test : `tests/composant/test_garde_ecran.py::test_garde_ecran_est_le_seul_module_a_appeler_une_porte_d_ecriture`.
- **`formulaire.py` est le seul module autorisé à appeler `async_show_form(..., data_schema=...)`.** Test : `tests/composant/test_config_flow.py::test_formulaire_est_le_seul_module_a_appeler_async_show_form_avec_un_data_schema`.
- **Ne les contournez pas.** Un test AST qui tombe est un signal juste, pas un obstacle.

### Exigences de test — quatre leçons payées douze fois sur la branche 3a

Elles ne sont pas du style, ce sont des critères de recevabilité :

1. **Un test qui NOMME un identifiant ne garde pas une CAPACITÉ.** Interdire un nom de fonction laisse passer un appel via un alias, un helper intermédiaire, ou l'ancêtre privé commun. Gardez ce que le code PEUT FAIRE.
2. **Un test qui épingle la MOITIÉ d'un message laisse l'autre moitié mentir.** Épinglez la phrase rendue en entier, pas son titre ; le corps d'un message a déjà recommandé le contraire de ce que son correctif venait de décider.
3. **Un décor trop pauvre rend un test aveugle.** Partout où la règle dit « celui-ci et pas les autres », le décor doit contenir au moins DEUX sujets. Un décor à un seul écran a déjà rendu deux tests aveugles sur ce chantier.
4. **La mutation prouve qu'une règle est GARDÉE, jamais que c'est la BONNE règle.** Chaque tâche finit par au moins une mutation jouée à la main : cassez la ligne que le test prétend garder, vérifiez que le test tombe, remettez-la.

### Les quatre codes de refus, valeurs littérales mesurées

Ces valeurs voyagent sur le fil. `app/src/` est en TypeScript et **ne peut pas importer `const.py`** : un test qui compare à la constante serait tautologique. Elles s'écrivent **en dur des deux côtés**, et c'est le seul filet à la frontière de langage.

| Constante Python | Valeur littérale sur le fil | Origine |
|---|---|---|
| `const.ERREUR_ECRAN_INTROUVABLE` | **`"not_found"`** | C'est `websocket_api.const.ERR_NOT_FOUND` de HA, réutilisé à dessein |
| `const.ERREUR_VERSION_INCONNUE` | **`"version_inconnue"`** | propre au composant |
| `const.ERREUR_ECRAN_CORROMPU` | **`"ecran_corrompu"`** | propre au composant |
| — (cœur de HA) | **`"unknown_command"`** | `websocket_api.const.ERR_UNKNOWN_COMMAND`, message `"Unknown command."`, **en anglais** |

⚠️ **`not_found` n'est PAS `ecran_introuvable`.** Une version antérieure de ce plan portait la mauvaise valeur. Vérifiez par vous-même avant d'écrire :

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
.venv-composant/bin/python3 -c "
import sys; sys.path.insert(0, '.')
from custom_components.home_desk import const as c
print(c.ERREUR_ECRAN_INTROUVABLE, c.ERREUR_VERSION_INCONNUE, c.ERREUR_ECRAN_CORROMPU)"
```

Les deux commandes et l'événement, également mesurés : `home_desk/ecran`, `home_desk/ecrans`, `home_desk_config_changed`.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `app/src/configuration.ts` | Client du transport : demande un écran ou la liste, rend une union discriminée. Aucun rendu, aucun DOM. | T2 |
| `app/src/rendu/repli.ts` | Les SEPT écrans de repli, fonctions de présentation pures rendant un `TemplateResult`. Aucune connaissance du transport. | T3 |
| `app/src/rechargement.ts` | Abonnement à `home_desk_config_changed`, filtre par nom, déclenchement du rechargement. | T5 |
| `app/gabarits/index.html` | Le gabarit de la page unique. | T6 |
| `custom_components/home_desk/registre.py` | Lecture du registre d'entités HA, pour l'avertissement d'entité inconnue. | T7 |

**Modifiés :**

| Fichier | Ce qui change | Tâche |
|---|---|---|
| `app/src/connexion.ts` (217 l.) | Le code du refus survit ; `prete()` ; abonnement générique ; délai maximal. | T1 |
| `app/src/demarrage.ts` (1914 l.) | `demarrer` est renommé `demarrerAvecEcran` (corps INCHANGÉ) ; une nouvelle `demarrer` mince résout l'écran ; les deux écrans de repli partent dans `repli.ts`. **Le fichier RÉTRÉCIT.** | T3, T4, T5 |
| `app/src/index.ts` (10 l.) | Résolution `?ecran=` → transport, sinon `data-piece` → littéral. | T6 |
| `app/scripts/generer-pages.mjs` (38 l.) | Produit `index.html` **en plus** des trois pages historiques. | T6 |
| `app/outils/verifier-rendu.mjs` (4621 l.) | Apprend la nouvelle URL **sans désapprendre l'ancienne**. | T6 |
| `app/tests/aides.ts` | `monterDemarrage` absorbe le changement de signature. | T4 |
| `custom_components/home_desk/config_flow.py` (**500/500**) | Les seize relais deviennent un `__getattr__` ; trois champs de saisie. | T7 |

**Tests créés :** `app/tests/configuration.test.ts`, `app/tests/repli.test.ts`, `app/tests/rechargement.test.ts`, `app/tests/index-transition.test.ts`, `app/tests/zones-ordres.test.ts`, `tests/composant/test_registre.py`.

**Tests étendus :** `app/tests/connexion.test.ts`, `app/tests/demarrage.test.ts`, `tests/composant/test_config_flow.py`.

---

## L'ordre, et pourquoi

T1 est le préalable de T2, T4 et T5 : quatre trous dans le seul module que tout le reste emprunte. Les disperser multiplierait par quatre le risque qu'un seul d'entre eux soit « juste, prouvé une fois par une sonde jetable, gardé zéro fois ».

T2 et T3 sont indépendants l'un de l'autre et ne câblent rien : chacun se teste seul. T4 les câble. T5 et T6 suivent. T7 est la seule tâche Python et ne dépend d'aucune autre — elle pourrait être faite en premier, mais elle est placée après pour que les tâches qui déverrouillent 3c passent d'abord. T8 est une mesure, pas une réparation.

---

### Task 1: `connexion.ts` — les quatre trous du module que tout emprunte

**Files:**
- Modify: `app/src/connexion.ts` (217 lignes ; les quatre points sont l. 60-66, 122-157, 197-204)
- Test: `app/tests/connexion.test.ts` (109 lignes aujourd'hui, étendu)

**Interfaces:**
- Consumes: rien des autres tâches. C'est la première.
- Produces :
  - `export class RefusHA extends Error { readonly code: string }` — rejet de `envoyerCommande` quand HA refuse.
  - `Connexion.prete(): Promise<void>` — résolue après `auth_ok`.
  - `Connexion.surEvenement(type: string, cb: (donnees: Record<string, unknown>) => void): void`
  - `Connexion.envoyerCommande(payload, delaiMs?)` — rejette `RefusHA('delai_depasse', …)` passé le délai.
  - `DependancesConnexion` gagne `minuteurFn: typeof setTimeout`.

**Pourquoi les quatre ensemble :** ce sont quatre trous dans un seul module, sur le seul chemin que toute la suite emprunte. Trois d'entre eux n'avaient jamais été nommés avant le 2026-09-13. Séparés en quatre tâches, chacun serait une petite règle juste prouvée une fois — la forme exacte du défaut que cette branche a payé douze fois.

- [ ] **Step 1: Écrire les quatre tests qui échouent**

Ajoutez à la fin de `app/tests/connexion.test.ts`. Le `FauxWebSocket` du fichier (l. 79-84) ne capture pas ce qui est envoyé : il en faut un qui le fasse.

```ts
/** Un faux websocket qui GARDE ce qu'on lui envoie et expose son `onmessage`, pour piloter
 *  le protocole HA depuis le test. Le `FauxWebSocket` déjà présent plus haut suffit au test
 *  de silence (il ne regarde que `intervalFn`) mais ne permet d'observer aucun envoi. */
class WsCapture {
  static derniere: WsCapture | undefined;
  onmessage: ((ev: any) => void) | null = null;
  onclose: (() => void) | null = null;
  envoyes: any[] = [];
  constructor(public url: string) { WsCapture.derniere = this; }
  send(brut: string) { this.envoyes.push(JSON.parse(brut)); }
  /** Rejoue un message venu de HA. */
  recevoir(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

function connexionDeTest(deps: Record<string, unknown> = {}) {
  const jetons: any = {
    access_token: 'a', refresh_token: 'r', clientId: 'c',
    expires: Date.now() + 60 * 60_000,
  };
  return new Connexion(jetons, {
    origineWs: 'ws://test',
    WebSocketImpl: WsCapture as any,
    intervalFn: vi.fn() as any,
    stockage: faux(null),
    ...deps,
  } as any);
}

describe('Connexion — le code d un refus survit jusqu à l appelant', () => {
  it('rejette un RefusHA qui PORTE le code, pas seulement le message', async () => {
    // Décision 11 de la spec : `websocket.py` distingue quatre refus par leur CODE et ses
    // messages sont du français Python sans accents, destinés au journal HA. Si le client ne
    // garde que le message, les cinq dégradations deviennent indistinguables — et l'une
    // d'elles (`unknown_command`) est produite par HA en anglais, donc intraduisible ici.
    const cx = connexionDeTest();
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    const promesse = cx.envoyerCommande({ type: 'home_desk/ecran', nom: 'salon' });
    const envoye = ws.envoyes.find((m) => m.type === 'home_desk/ecran')!;
    ws.recevoir({
      id: envoye.id, type: 'result', success: false,
      error: { code: 'version_inconnue', message: 'la sous-entree ne porte aucune version' },
    });

    await expect(promesse).rejects.toBeInstanceOf(RefusHA);
    await promesse.catch((e: RefusHA) => {
      expect(e.code).toBe('version_inconnue');
      expect(e.message).toBe('la sous-entree ne porte aucune version');
    });
  });

  it('porte un code de repli plutôt que `undefined` quand HA n en donne aucun', async () => {
    const cx = connexionDeTest();
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });
    const promesse = cx.envoyerCommande({ type: 'peu/importe' });
    const envoye = ws.envoyes.find((m) => m.type === 'peu/importe')!;
    ws.recevoir({ id: envoye.id, type: 'result', success: false });
    await promesse.catch((e: RefusHA) => {
      expect(e.code).toBe('inconnu');
      expect(e.message).toBe('commande refusée');
    });
  });
});

describe('Connexion — prete() attend l authentification', () => {
  it('ne se résout PAS tant que auth_ok n est pas arrivé', async () => {
    // `connecter()` rend la main après avoir posé les gestionnaires, AVANT `auth_ok` : une
    // commande envoyée dans la foulée appellerait `ws.send()` sur une socket en CONNECTING.
    const cx = connexionDeTest();
    await cx.connecter();
    let resolue = false;
    void cx.prete().then(() => { resolue = true; });
    await Promise.resolve();
    expect(resolue).toBe(false);

    WsCapture.derniere!.recevoir({ type: 'auth_ok' });
    await cx.prete();
    expect(resolue).toBe(true);
  });
});

describe('Connexion — abonnement à un événement quelconque', () => {
  it('souscrit le type demandé et route sa charge utile', async () => {
    // Décision 2 de la spec : « un événement de bus déclenche le re-rendu à chaud ». Avant
    // ce correctif, `subscribe_events` ne portait que `state_changed` EN DUR et le
    // répartiteur n'examinait un `event` que s'il portait `data.new_state` : un
    // `home_desk_config_changed` tombait dans le vide SANS ERREUR.
    const cx = connexionDeTest();
    const vus: unknown[] = [];
    cx.surEvenement('home_desk_config_changed', (d) => vus.push(d));
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    const souscriptions = ws.envoyes.filter((m) => m.type === 'subscribe_events');
    expect(souscriptions.map((m) => m.event_type).sort())
      .toEqual(['home_desk_config_changed', 'state_changed']);

    ws.recevoir({
      type: 'event',
      event: { event_type: 'home_desk_config_changed', data: { nom: 'cuisine' } },
    });
    expect(vus).toEqual([{ nom: 'cuisine' }]);
  });

  it('ne livre à un abonné QUE son type d événement — décor à deux types', async () => {
    // Leçon 3 : un décor à un seul sujet rend le test aveugle. Avec un seul type abonné, une
    // implémentation qui livrerait TOUT à TOUS passerait.
    const cx = connexionDeTest();
    const config: unknown[] = [];
    const autre: unknown[] = [];
    cx.surEvenement('home_desk_config_changed', (d) => config.push(d));
    cx.surEvenement('call_service', (d) => autre.push(d));
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    ws.recevoir({ type: 'event', event: { event_type: 'call_service', data: { x: 1 } } });
    expect(config).toEqual([]);
    expect(autre).toEqual([{ x: 1 }]);
  });

  it('laisse INTACT le chemin state_changed, qui ne passe pas par surEvenement', async () => {
    // Contre-épreuve : les 1049 tests existants reposent sur `surChangement`. Un abonnement
    // générique qui détournerait `state_changed` les casserait tous d'un coup.
    const cx = connexionDeTest();
    const etats: unknown[] = [];
    cx.surChangement((e) => etats.push(e));
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });
    ws.recevoir({
      type: 'event',
      event: {
        event_type: 'state_changed',
        data: { new_state: { entity_id: 'light.x', state: 'on', attributes: { a: 1 } } },
      },
    });
    expect(etats).toEqual([{ entity_id: 'light.x', state: 'on', attributes: { a: 1 } }]);
  });
});

describe('Connexion — une commande sans réponse ne pend pas pour toujours', () => {
  it('rejette passé le délai, plutôt que de figer l écran d attente', async () => {
    // Si HA accepte la commande puis redémarre, la réponse n'arrive jamais. Sans délai, la
    // promesse reste en suspens POUR TOUJOURS et l'écran d'attente « franc » de la
    // décision 10 devient un écran d'attente PERMANENT — la panne muette que ce projet
    // s'interdit.
    let rappel: (() => void) | undefined;
    const minuteurFn = vi.fn((fn: () => void) => { rappel = fn; return 1 as any; });
    const cx = connexionDeTest({ minuteurFn });
    await cx.connecter();
    WsCapture.derniere!.recevoir({ type: 'auth_ok' });

    const promesse = cx.envoyerCommande({ type: 'home_desk/ecran', nom: 'salon' });
    expect(minuteurFn).toHaveBeenCalledTimes(1);
    rappel!();

    await expect(promesse).rejects.toBeInstanceOf(RefusHA);
    await promesse.catch((e: RefusHA) => expect(e.code).toBe('delai_depasse'));
  });

  it('n arme aucun rejet tardif quand la réponse arrive à temps', async () => {
    let rappel: (() => void) | undefined;
    const minuteurFn = vi.fn((fn: () => void) => { rappel = fn; return 1 as any; });
    const cx = connexionDeTest({ minuteurFn });
    await cx.connecter();
    const ws = WsCapture.derniere!;
    ws.recevoir({ type: 'auth_ok' });

    const promesse = cx.envoyerCommande({ type: 'home_desk/ecran', nom: 'salon' });
    const envoye = ws.envoyes.find((m) => m.type === 'home_desk/ecran')!;
    ws.recevoir({ id: envoye.id, type: 'result', success: true, result: { nom: 'salon' } });
    await expect(promesse).resolves.toEqual({ nom: 'salon' });

    // Le minuteur finit par sonner : il ne doit RIEN faire (la promesse est déjà réglée, et
    // un second règlement serait silencieusement ignoré par le moteur de promesses — donc
    // invisible). On vérifie qu'il ne lève pas et que rien ne change.
    expect(() => rappel!()).not.toThrow();
    await expect(promesse).resolves.toEqual({ nom: 'salon' });
  });
});
```

Ajoutez `RefusHA` à l'import en tête du fichier de test :

```ts
import { Connexion, RefusHA, lireJetons, doitRafraichir, rafraichir, delaiReconnexion } from '../src/connexion';
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm --prefix app test -- connexion`
Expected: FAIL — `RefusHA is not exported`, `cx.prete is not a function`, `cx.surEvenement is not a function`.

- [ ] **Step 3: Ajouter `RefusHA` et `minuteurFn` aux dépendances**

Dans `app/src/connexion.ts`, après le bloc `EvenementEtat` (l. 12) :

```ts
/** Un refus de Home Assistant, avec SON CODE.
 *
 *  Décision 11 de la spec : `websocket.py` distingue quatre refus par un code
 *  (`not_found`, `version_inconnue`, `ecran_corrompu`, plus `unknown_command` rendu par le
 *  cœur de HA quand la commande n'est pas enregistrée du tout). Ses `message`, eux, sont du
 *  français Python SANS accents : des diagnostics développeur destinés au journal HA, jamais
 *  des phrases d'utilisateur. Jeter le code pour ne garder que le message — ce que faisait
 *  `envoyerCommande` avant cette tâche — rendait les cinq dégradations indistinguables, et
 *  poussait à afficher à l'utilisateur une phrase que ce dépôt n'écrit pas pour lui.
 *
 *  `message` reste accessible, et un appelant PEUT l'afficher par paresse. C'est
 *  `configuration.ts` qui traduit un code en phrase française accentuée, et le test qui
 *  épingle LA PHRASE RENDUE est ce qui garde cette frontière. */
export class RefusHA extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'RefusHA';
  }
}

/** Au-delà de ce délai, une commande websocket sans réponse est abandonnée. Quinze secondes :
 *  bien au-dessus de toute latence réelle sur le réseau de la maison (le serveur HA est aussi
 *  le point d'accès), bien en dessous de la patience de qui passe devant un écran mural. */
const DELAI_COMMANDE_MS = 15_000;
```

Ajoutez `minuteurFn` au type des dépendances (l. 60-66) :

```ts
export type DependancesConnexion = {
  fetchFn: typeof fetch;
  intervalFn: typeof setInterval;
  /** Nécessaire au délai maximal d'`envoyerCommande`. Même source unique de `.bind(globalThis)`
   *  que `intervalFn` : `./minuteurs.ts`. */
  minuteurFn: typeof setTimeout;
  stockage: Storage;
  origineWs: string;
  WebSocketImpl: new (url: string) => WebSocket;
};
```

Importez-le (l. 4) et posez son défaut dans le constructeur (après `intervalFn`, l. 100) :

```ts
import { intervalFnParDefaut, minuteurFnParDefaut } from './minuteurs';
```
```ts
      minuteurFn: deps.minuteurFn ?? minuteurFnParDefaut,
```

- [ ] **Step 4: Ajouter `prete()` et l'abonnement générique**

Champs privés, à côté de `rappelsEtat` (l. 73) :

```ts
  private rappelsEvenement = new Map<string, ((donnees: Record<string, unknown>) => void)[]>();
  /** Résolue au premier `auth_ok`, JAMAIS remise en attente sur reconnexion.
   *
   *  `prete()` répond à « peut-on envoyer une commande ? » pour la PREMIÈRE commande, celle du
   *  démarrage — le seul moment où la question se posait, puisque tout le reste du code n'appelle
   *  `envoyerCommande` que bien après, sous la garde `estHorsLigne` de `demarrage.ts`. La remettre
   *  en attente à chaque coupure ferait attendre indéfiniment un appelant qui n'a plus rien à
   *  apprendre ; une panne DURABLE reste signalée par `surSilence`, qui est le mécanisme prévu
   *  pour ça et qui continue de tourner quoi qu'il arrive ici. */
  private resoudrePrete: (() => void) | null = null;
  private readonly pretePromesse: Promise<void> =
    new Promise((r) => { this.resoudrePrete = r; });
```

Méthodes publiques, à côté de `surChangement` (l. 107) :

```ts
  prete(): Promise<void> { return this.pretePromesse; }

  /** Abonne un rappel à un type d'événement de bus QUELCONQUE.
   *
   *  Avant cette tâche, `connecter()` envoyait `subscribe_events` avec `event_type:
   *  'state_changed'` EN DUR, et le répartiteur n'examinait un message `event` que s'il portait
   *  `data.new_state` : un `home_desk_config_changed` tombait dans le vide, sans erreur — la
   *  décision 2 de la spec était inatteignable EN SILENCE.
   *
   *  Appelable AVANT `connecter()` (le cas normal : `demarrage.ts` s'abonne puis connecte) comme
   *  après (la souscription part alors tout de suite). Les souscriptions sont REJOUÉES à chaque
   *  `auth_ok`, donc une reconnexion ne perd aucun abonné. */
  surEvenement(type: string, cb: (donnees: Record<string, unknown>) => void) {
    const deja = this.rappelsEvenement.get(type);
    if (deja) { deja.push(cb); return; }
    this.rappelsEvenement.set(type, [cb]);
    if (this.ws) this.souscrire(type);
  }

  private souscrire(type: string) {
    this.ws?.send(JSON.stringify({ id: this.id++, type: 'subscribe_events', event_type: type }));
  }
```

- [ ] **Step 5: Câbler `auth_ok` et le routage des événements**

Dans `connecter()`, remplacez la branche `auth_ok` (l. 138-142) :

```ts
      } else if (m.type === 'auth_ok') {
        this.essai = 0;
        this.souscrire('state_changed');
        for (const type of this.rappelsEvenement.keys()) this.souscrire(type);
        ws.send(JSON.stringify({ id: this.id++, type: 'get_states' }));
        this.resoudrePrete?.();
        this.resoudrePrete = null;
```

Puis ajoutez UNE branche APRÈS la branche `state_changed` existante (l. 143-145), sans y toucher :

```ts
      } else if (m.type === 'event' && typeof m.event?.event_type === 'string') {
        // Volontairement APRÈS la branche `new_state` ci-dessus : `state_changed` garde son
        // chemin historique intact, celui dont dépendent les 1049 tests de l'application. Cette
        // branche-ci ne voit donc que les événements SANS `new_state` — les événements de bus
        // quelconques, dont `home_desk_config_changed`.
        const rappels = this.rappelsEvenement.get(m.event.event_type);
        if (rappels) for (const cb of rappels) cb(m.event.data ?? {});
```

- [ ] **Step 6: Poser le code du refus et le délai maximal**

Remplacez la ligne 150 (le rejet du refus) :

```ts
        if (m.success) p.resolve(m.result);
        else p.reject(new RefusHA(
          typeof m.error?.code === 'string' ? m.error.code : 'inconnu',
          m.error?.message ?? 'commande refusée',
        ));
```

Puis remplacez `envoyerCommande` (l. 197-204) :

```ts
  /** Envoie une commande websocket arbitraire et attend sa réponse appariée par `id`
   *  (cf. `enAttenteCommandes`). Trois façons d'en finir, jamais aucune autre :
   *   - HA répond `success` → la promesse rend `result` ;
   *   - HA refuse → `RefusHA`, avec son code ;
   *   - HA ne répond pas dans `delaiMs` → `RefusHA('delai_depasse', …)`.
   *
   *  Ce troisième cas est celui qu'on ne voyait pas : si HA accepte la commande puis redémarre,
   *  la réponse n'arrive jamais, et avant cette tâche la promesse restait en suspens POUR
   *  TOUJOURS — l'écran d'attente de la décision 10 devenait un écran d'attente permanent.
   *
   *  Le minuteur n'est pas annulé, et il n'a pas besoin de l'être : le premier règlement RETIRE
   *  l'entrée de `enAttenteCommandes` (donc le second chemin ne trouve plus rien à appeler), et
   *  un second règlement d'une promesse déjà réglée est un no-op garanti par ECMAScript.
   *  Annuler exigerait d'injecter aussi un `clearTimeout` pour rester testable, pour économiser
   *  un minuteur de quinze secondes par commande — une complication plus chère que ce qu'elle
   *  évite. */
  envoyerCommande(
    payload: Record<string, unknown>, delaiMs: number = DELAI_COMMANDE_MS,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws) { reject(new Error('websocket indisponible')); return; }
      const id = this.id++;
      // `finir` centralise le retrait de l'entree : c'est LUI le mecanisme d'idempotence, pas
      // un drapeau. Corrige le 2026-09-13 apres mesure — un drapeau `regle` avait ete ecrit ici,
      // et retirer sa garde ne faisait tomber AUCUN des 1057 tests : il ne gardait rien.
      const finir = <T>(suite: (v: T) => void) => (v: T) => {
        this.enAttenteCommandes.delete(id);
        suite(v);
      };
      this.enAttenteCommandes.set(id, {
        resolve: finir(resolve), reject: finir(reject),
      });
      this.deps.minuteurFn(
        finir(() => reject(new RefusHA(
          'delai_depasse',
          `Home Assistant n'a pas répondu en ${Math.round(delaiMs / 1000)} s`,
        ))),
        delaiMs,
      );
      this.ws.send(JSON.stringify({ id, ...payload }));
    });
  }
```

- [ ] **Step 7: Lancer les tests**

Run: `npm --prefix app test -- connexion`
Expected: PASS.

Run: `npm --prefix app test`
Expected: 47 fichiers, **1057** tests (1049 + les 8 `it(...)` du Step 1), 0 échec. **Si un test existant tombe, ne le modifiez pas** : c'est que le routage des événements ou `auth_ok` a changé de comportement, et c'est le défaut, pas le test.

- [ ] **Step 8: Jouer les mutations (leçon 4)**

Cassez chacune de ces lignes, vérifiez que le test attendu tombe, remettez-la :

| Mutation | Test qui doit tomber |
|---|---|
| `new RefusHA(code, …)` → `new Error(…)` | « rejette un RefusHA qui PORTE le code » |
| `'inconnu'` → `m.error.code` sans garde | « porte un code de repli » |
| retirer `this.resoudrePrete?.()` | « ne se résout PAS tant que auth_ok » |
| retirer la boucle `for (const type of this.rappelsEvenement.keys())` | « souscrit le type demandé » |
| `this.rappelsEvenement.get(m.event.event_type)` → livrer à tous les rappels | « ne livre QUE son type » |
| retirer l'appel à `this.deps.minuteurFn` | « rejette passé le délai » |
| ~~retirer la garde `if (regle) return`~~ | **LIGNE RETIREE.** Mesure du 2026-09-13 : cette garde ne tue aucun test, et c'est JUSTE — l'idempotence vient du retrait de l'entree de `enAttenteCommandes` plus le no-op de specification sur une promesse deja reglee, jamais d'un drapeau. Le drapeau et cette ligne ont ete supprimes ensemble. Une table de mutations qui promet un test impossible pousse a fabriquer un test creux, exactement le decor que ce plan interdit ailleurs. |

Si une mutation NE FAIT TOMBER AUCUN test, la règle n'est pas gardée : écrivez le test manquant avant de continuer.

- [ ] **Step 9: Vérifier le type et committer**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
npx --prefix app tsc --noEmit -p app/tsconfig.json
git add app/src/connexion.ts app/tests/connexion.test.ts
git commit -m "feat(app): connexion transporte le code du refus, sait dire qu elle est prete, s abonne a un evenement quelconque et borne ses commandes

Quatre trous dans le seul module que tout le reste emprunte, boucher
ensemble parce que separes ils auraient donne quatre petites regles
prouvees une fois et gardees zero fois.

- Le CODE d un refus survit (RefusHA) : decision 11 de la spec. Sans lui
  les cinq degradations sont indistinguables, et unknown_command est
  rendu par HA en anglais donc intraduisible ici.
- prete() se resout a auth_ok : connecter() rendait la main AVANT
  l authentification, donc la toute premiere commande websocket de
  l application appelait ws.send() sur une socket en CONNECTING.
- surEvenement() : subscribe_events portait state_changed EN DUR et le
  repartiteur n examinait un event que s il portait data.new_state, donc
  home_desk_config_changed tombait dans le vide SANS ERREUR -- la
  decision 2 de la spec etait inatteignable en silence.
- envoyerCommande borne son attente : un redemarrage de HA apres
  acceptation laissait la promesse en suspens POUR TOUJOURS, et l ecran
  d attente franc de la decision 10 devenait permanent.

Le chemin state_changed est laisse INTACT, et un test le prouve.
vitest 47 fichiers / 1057 tests.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `configuration.ts` — le client du transport

**Files:**
- Create: `app/src/configuration.ts`
- Test: `app/tests/configuration.test.ts`

**Interfaces:**
- Consumes: `RefusHA` et la signature `envoyerCommande(payload) => Promise<unknown>` (T1).
- Produces :
  - `export type Panne = 'introuvable' | 'version' | 'corrompu' | 'integrationAbsente' | 'reseau'`
  - `export type Resultat<T> = { ok: true; valeur: T } | { ok: false; panne: Panne }`
  - `export type EntreeListe = { nom: string; titre: string }`
  - `export function chargerEcran(cx: TransportConfig, nom: string): Promise<Resultat<Ecran>>`
  - `export function listerEcrans(cx: TransportConfig): Promise<Resultat<EntreeListe[]>>`
  - `export type TransportConfig = { envoyerCommande(p: Record<string, unknown>): Promise<unknown> }`

Ce module ne rend rien et ne touche pas au DOM. Il traduit un refus en une panne nommée, et c'est tout.

- [ ] **Step 1: Écrire le test qui échoue**

Créez `app/tests/configuration.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { chargerEcran, listerEcrans } from '../src/configuration';
import { RefusHA } from '../src/connexion';

/** Un transport doublé : rend ce qu'on lui dit, ou lève le refus qu'on lui donne. */
function transport(reponse: (p: Record<string, unknown>) => unknown) {
  return { envoyerCommande: vi.fn(async (p: Record<string, unknown>) => reponse(p)) };
}

describe('chargerEcran — la commande envoyée', () => {
  it('envoie home_desk/ecran avec le nom, et rien d autre', async () => {
    const cx = transport(() => ({ nom: 'cuisine', version: 1 }));
    await chargerEcran(cx, 'cuisine');
    expect(cx.envoyerCommande).toHaveBeenCalledTimes(1);
    expect(cx.envoyerCommande).toHaveBeenCalledWith({ type: 'home_desk/ecran', nom: 'cuisine' });
  });

  it('rend l écran tel que HA l a résolu et validé', async () => {
    const ecran = { nom: 'cuisine', version: 1, hauteurUtile: 585 };
    const cx = transport(() => ecran);
    expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: true, valeur: ecran });
  });
});

describe('chargerEcran — les quatre codes du fil, en VALEUR LITTÉRALE', () => {
  // `app/src/` est en TypeScript et ne peut pas importer `const.py` : un test qui comparerait
  // à la constante serait tautologique. Ces quatre chaînes sont écrites en dur des DEUX côtés,
  // et ce test est le seul filet à la frontière de langage. Mesurées le 2026-09-13 —
  // ERREUR_ECRAN_INTROUVABLE vaut `not_found` (c'est ERR_NOT_FOUND de HA, réutilisé), PAS
  // `ecran_introuvable`.
  const cas: [string, string][] = [
    ['not_found', 'introuvable'],
    ['version_inconnue', 'version'],
    ['ecran_corrompu', 'corrompu'],
    ['unknown_command', 'integrationAbsente'],
  ];

  for (const [code, panne] of cas) {
    it(`traduit le code « ${code} » en panne « ${panne} »`, async () => {
      const cx = transport(() => { throw new RefusHA(code, 'message python sans accents'); });
      expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: false, panne });
    });
  }

  it('range tout code inconnu dans « reseau » plutôt que de lever', async () => {
    const cx = transport(() => { throw new RefusHA('code_jamais_vu', 'x'); });
    expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: false, panne: 'reseau' });
  });

  it('range une erreur qui n est PAS un refus HA dans « reseau »', async () => {
    // Websocket fermé, JSON illisible, délai dépassé côté appelant : tout ce qui n'est pas un
    // refus de HA est un problème de liaison.
    const cx = transport(() => { throw new Error('websocket indisponible'); });
    expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: false, panne: 'reseau' });
  });

  it('range un délai dépassé dans « reseau » — HA n a rien répondu', async () => {
    const cx = transport(() => { throw new RefusHA('delai_depasse', 'pas de réponse en 15 s'); });
    expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: false, panne: 'reseau' });
  });
});

describe('listerEcrans', () => {
  it('envoie home_desk/ecrans et rend les paires nom/titre', async () => {
    // `nom` (donnée saisie, clé primaire du transport) et `titre` (`ConfigSubentry.title`,
    // renommable indépendamment par le geste générique de HA) sont DEUX champs distincts.
    const liste = [{ nom: 'salon', titre: 'Salon' }, { nom: 'cuisine', titre: 'Cuisine' }];
    const cx = transport(() => liste);
    expect(await listerEcrans(cx)).toEqual({ ok: true, valeur: liste });
    expect(cx.envoyerCommande).toHaveBeenCalledWith({ type: 'home_desk/ecrans' });
  });

  it('rend une liste VIDE en succès, jamais une panne', async () => {
    // « HA joignable, aucun écran configuré » est une dégradation distincte de « HA
    // injoignable » : la première dit où aller configurer, la seconde parle de réseau. Les
    // confondre remplacerait un conseil juste par un conseil faux.
    const cx = transport(() => []);
    expect(await listerEcrans(cx)).toEqual({ ok: true, valeur: [] });
  });

  it('signale l intégration absente quand HA ne connaît pas la commande', async () => {
    const cx = transport(() => { throw new RefusHA('unknown_command', 'Unknown command.'); });
    expect(await listerEcrans(cx)).toEqual({ ok: false, panne: 'integrationAbsente' });
  });

  it('ignore une réponse qui n est pas un tableau plutôt que de la propager', async () => {
    const cx = transport(() => ({ pas: 'un tableau' }));
    expect(await listerEcrans(cx)).toEqual({ ok: false, panne: 'corrompu' });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm --prefix app test -- configuration`
Expected: FAIL — `Failed to resolve import "../src/configuration"`.

- [ ] **Step 3: Écrire `configuration.ts`**

```ts
/** Le client du transport websocket livré par le plan 3a (`custom_components/home_desk/
 *  websocket.py`). Il demande un écran ou la liste des écrans, et traduit tout refus en une
 *  PANNE NOMMÉE. Il ne rend rien et ne touche pas au DOM : c'est `rendu/repli.ts` qui sait
 *  quoi montrer pour chaque panne, et `demarrage.ts` qui câble les deux. */
import type { Ecran } from './ecran';
import { RefusHA } from './connexion';

/** Les cinq façons dont le chargement d'un écran peut échouer. Cinq, pas quatre : la spec
 *  d'origine n'en nommait que quatre et laissait « l'intégration n'est pas installée » tomber
 *  dans le message de panne réseau — qui dit à l'opérateur de déboguer son Wi-Fi alors que HA
 *  a répondu instantanément et correctement. */
export type Panne = 'introuvable' | 'version' | 'corrompu' | 'integrationAbsente' | 'reseau';

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; panne: Panne };

/** Une ligne de `home_desk/ecrans`. `nom` est la clé primaire du transport (donnée saisie) ;
 *  `titre` est `ConfigSubentry.title`, une propriété générique de Home Assistant que
 *  l'utilisateur peut renommer seule. Deux champs distincts, même s'ils sont maintenus
 *  synchronisés par le formulaire d'identité. */
export type EntreeListe = { nom: string; titre: string };

/** Ce que ce module attend d'une connexion : juste `envoyerCommande`. Ni la classe concrète
 *  `Connexion` (ses champs privés interdiraient un double de test léger), ni `ConnexionLike`
 *  de `demarrage.ts` (qui en demande cinq fois plus). */
export type TransportConfig = {
  envoyerCommande(payload: Record<string, unknown>): Promise<unknown>;
};

/** Les codes tels qu'ils circulent SUR LE FIL, écrits en dur.
 *
 *  `app/src/` est en TypeScript et ne peut pas importer `const.py` : ces quatre chaînes sont
 *  écrites en dur des deux côtés de la frontière de langage, et le test qui les épingle est le
 *  seul filet qui existe. Mesurées le 2026-09-13 sur le composant installé.
 *
 *  ⚠️ `not_found` et non `ecran_introuvable` : le composant réutilise délibérément
 *  `websocket_api.const.ERR_NOT_FOUND` de Home Assistant.
 *  `unknown_command` n'est PAS produit par ce dépôt : c'est le cœur de HA qui répond ça quand
 *  la commande n'est pas enregistrée, c'est-à-dire quand l'intégration n'est pas installée. */
const PANNE_PAR_CODE: Record<string, Panne> = {
  not_found: 'introuvable',
  version_inconnue: 'version',
  ecran_corrompu: 'corrompu',
  unknown_command: 'integrationAbsente',
};

/** Tout ce qui n'est pas un refus NOMMÉ de HA est un problème de liaison : websocket fermé,
 *  JSON illisible, délai dépassé (`delai_depasse`, posé par `connexion.ts` quand HA ne répond
 *  pas). « reseau » est donc aussi le repli, à dessein — un code inconnu veut dire que le
 *  composant a évolué sans ce client, et l'écran réseau est le seul qui reste vrai. */
function panneDe(erreur: unknown): Panne {
  if (erreur instanceof RefusHA) return PANNE_PAR_CODE[erreur.code] ?? 'reseau';
  return 'reseau';
}

/** Demande à Home Assistant l'écran nommé, RÉSOLU ET VALIDÉ par le composant. */
export async function chargerEcran(cx: TransportConfig, nom: string): Promise<Resultat<Ecran>> {
  try {
    const brut = await cx.envoyerCommande({ type: 'home_desk/ecran', nom });
    return { ok: true, valeur: brut as Ecran };
  } catch (erreur) {
    return { ok: false, panne: panneDe(erreur) };
  }
}

/** Demande la liste des écrans configurés, pour la première dégradation.
 *
 *  Le composant ne revalide PAS chaque écran ici, à dessein : un écran corrompu ne doit pas
 *  priver les tablettes du choix des autres. Une liste VIDE est donc un SUCCÈS — « HA joignable,
 *  aucun écran configuré » est une dégradation distincte de « HA injoignable », et les confondre
 *  remplacerait un conseil juste (« allez en créer un ») par un conseil faux (« vérifiez le
 *  réseau »). */
export async function listerEcrans(cx: TransportConfig): Promise<Resultat<EntreeListe[]>> {
  try {
    const brut = await cx.envoyerCommande({ type: 'home_desk/ecrans' });
    if (!Array.isArray(brut)) return { ok: false, panne: 'corrompu' };
    return { ok: true, valeur: brut as EntreeListe[] };
  } catch (erreur) {
    return { ok: false, panne: panneDe(erreur) };
  }
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm --prefix app test -- configuration`
Expected: PASS (13 tests).

Run: `npm --prefix app test`
Expected: 48 fichiers, **1070** tests, 0 échec.

- [ ] **Step 5: Jouer les mutations**

| Mutation | Test qui doit tomber |
|---|---|
| `not_found` → `ecran_introuvable` dans `PANNE_PAR_CODE` | « traduit le code « not_found » » |
| retirer l'entrée `unknown_command` | « traduit le code « unknown_command » » ET « signale l intégration absente » |
| `?? 'reseau'` → `?? 'corrompu'` | « range tout code inconnu dans « reseau » » |
| `if (!Array.isArray(brut))` retiré | « ignore une réponse qui n est pas un tableau » |
| `{ type: 'home_desk/ecran', nom }` → `{ type: 'home_desk/ecran' }` | « envoie home_desk/ecran avec le nom » |

- [ ] **Step 6: Vérifier le type et committer**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
npx --prefix app tsc --noEmit -p app/tsconfig.json
git add app/src/configuration.ts app/tests/configuration.test.ts
git commit -m "feat(app): configuration.ts traduit un refus HA en panne nommee

Client du transport livre par le plan 3a. Ne rend rien, ne touche pas au
DOM : il demande un ecran ou la liste, et rend une union discriminee.

Les quatre codes sont ecrits EN DUR des deux cotes de la frontiere de
langage -- app/src/ est en TypeScript et ne peut pas importer const.py,
donc un test qui comparerait a la constante serait tautologique. Ce test
est le seul filet qui existe la, et il epingle les valeurs LITTERALES.

ERREUR_ECRAN_INTROUVABLE vaut not_found, pas ecran_introuvable : le
composant reutilise deliberement ERR_NOT_FOUND de Home Assistant.

Une liste vide est un SUCCES, jamais une panne : HA joignable sans ecran
configure dit ou aller en creer un, HA injoignable parle de reseau, et
les confondre remplace un conseil juste par un conseil faux.

vitest 48 fichiers / 1070 tests.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Décision transversale : ce que porte `?ecran=`

**Mesuré le 2026-09-13, et il faut le savoir avant T3.** Le transport apparie sur le nom **EXACTEMENT** — `websocket.py:103-108`, `_trouver` fait `sous_entree.data.get("nom") == nom`, sans normalisation, sans insensibilité à la casse. Or dans `app/src/ecran.ts` :

| | Valeur |
|---|---|
| Clé de `ECRANS` (et `data-piece` des pages historiques) | `salon`, `bureau`, `cuisine` — **minuscules** |
| Champ `nom` de l'écran | `'Salon'`, `'Bureau'`, `'Cuisine'` — **capitalisés** |

**`?ecran=` porte le `nom`, pas la clé** : `/local/wallpanel/index.html?ecran=Salon`, URL-encodé (`?ecran=Salle%20de%20bain` pour un nom à espaces). Trois raisons :

1. `nom` **est** la clé primaire du transport — le composant le dit lui-même, et c'est ce que la garde d'unicité protège.
2. Zéro modification du composant. Normaliser dans `_trouver` toucherait du code livré par 3a et ouvrirait une collision neuve (`"Salon"` et `"salon"` deviendraient le même écran alors que la garde d'unicité les autorise tous les deux).
3. Ça garde la branche de transition franche : le chemin neuf lit `?ecran=Cuisine`, le chemin historique lit `data-piece="cuisine"` contre `ECRANS`. Deux espaces de noms distincts qui ne se confondent jamais.

**Conséquence pour 3c** : l'étape 5 repointe la cuisine sur `?ecran=Cuisine`, avec la majuscule. Repointer sur `?ecran=cuisine` donnerait un `not_found` et la première dégradation — pas un mur blanc, mais pas l'écran attendu non plus. C'est écrit ici parce que c'est exactement le genre de détail qui casse en silence une mise en production.

---

### Task 3: `rendu/repli.ts` — les neuf écrans qui ne laissent jamais `#app` vide

*Corrigé en relecture finale de branche : ce titre disait « sept ». Huit fonctions exportées
(`sessionAbsente`, `erreurDemarrage`, `ecranEnAttente`, `aucunEcranConfigure`, `choisirEcran`,
`versionRefusee`, `configIllisible`, `integrationAbsente`), plus un neuvième rendu en ligne dans
`ecranDeLaPanne` (le cas `'introuvable'`, « Écran inconnu ») — neuf, pas sept.*

**Files:**
- Create: `app/src/rendu/repli.ts`
- Modify: `app/src/demarrage.ts` — **retirer** `sessionAbsente` (l. 155-160) et `erreurDemarrage` (l. 162-172), les importer depuis `repli.ts`. Le fichier RÉTRÉCIT de ~18 lignes.
- Test: `app/tests/repli.test.ts`

**Interfaces:**
- Consumes: `Panne` et `EntreeListe` de `configuration.ts` (T2).
- Produces (toutes rendent un `TemplateResult`, aucune ne touche au DOM, aucune n'est câblée par cette tâche) :
  - `sessionAbsente()`, `erreurDemarrage()` — **déplacées**, texte INCHANGÉ
  - `ecranEnAttente(nom: string)`
  - `choisirEcran(entrees: EntreeListe[])`
  - `aucunEcranConfigure()`
  - `versionRefusee(nom: string)`
  - `configIllisible(nom: string)`
  - `integrationAbsente()`
  - `ecranDeLaPanne(panne: Panne, nom: string): TemplateResult` — la table qui associe une panne à son écran

**La règle de recevabilité de cette tâche :** chaque écran **nomme un geste**. Un écran qui décrit une panne sans dire quoi faire est un bouton mort en prose — ce que ce projet s'interdit. Les tests l'exigent.

- [ ] **Step 1: Écrire le test qui échoue**

Créez `app/tests/repli.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { render } from 'lit';
import {
  sessionAbsente, erreurDemarrage, ecranEnAttente, choisirEcran,
  aucunEcranConfigure, versionRefusee, configIllisible, integrationAbsente,
  ecranDeLaPanne,
} from '../src/rendu/repli';
import type { Panne } from '../src/configuration';

function texteDe(gabarit: ReturnType<typeof sessionAbsente>): string {
  const hote = document.createElement('div');
  render(gabarit, hote);
  return hote.textContent!.replace(/\s+/g, ' ').trim();
}

describe('les sept écrans de repli — chacun NOMME UN GESTE', () => {
  // Leçon 2 : un test qui épingle la moitié d'un message laisse l'autre moitié mentir. On
  // épingle donc la phrase RENDUE en entier, et on exige qu'elle dise quoi faire. Un écran
  // qui décrit une panne sans nommer de geste est un bouton mort en prose.
  it('session absente : dit d ouvrir HA et de recharger', () => {
    expect(texteDe(sessionAbsente())).toBe(
      'Session Ouvre Home Assistant sur cette tablette et connecte-toi, puis recharge cette page.');
  });

  it('erreur de démarrage : texte INCHANGÉ par le déménagement', () => {
    // Contre-épreuve du déplacement : cette phrase existait dans `demarrage.ts` avant cette
    // tâche. La déplacer ne doit pas la réécrire — sinon le déménagement change le
    // comportement en se faisant passer pour un rangement.
    expect(texteDe(erreurDemarrage())).toBe(
      "Connexion impossible L'écran n'arrive pas à joindre la maison. Ça peut venir du réseau "
      + 'ou de la session : une nouvelle tentative va avoir lieu automatiquement. Si ça persiste, '
      + 'réouvre Home Assistant sur cette tablette et reconnecte-toi.');
  });

  it('attente : nomme l écran demandé, pour qu on voie tout de suite si l URL est fausse', () => {
    expect(texteDe(ecranEnAttente('Cuisine'))).toBe(
      'Cuisine Chargement de la configuration depuis Home Assistant…');
  });

  it('aucun écran configuré : dit OÙ aller le créer', () => {
    expect(texteDe(aucunEcranConfigure())).toBe(
      'Aucun écran configuré Ouvre Home Assistant, puis Paramètres > Appareils et services > '
      + 'Tablettes murales, et ajoute un écran.');
  });

  it('version refusée : dit de mettre à jour l intégration', () => {
    expect(texteDe(versionRefusee('Salon'))).toBe(
      "Configuration illisible La configuration de « Salon » a été écrite par une autre version "
      + "de l'intégration Tablettes murales. Mets à jour l'intégration, ou recrée cet écran "
      + 'depuis Paramètres > Appareils et services > Tablettes murales.');
  });

  it('configuration corrompue : dit de corriger ou de restaurer', () => {
    expect(texteDe(configIllisible('Bureau'))).toBe(
      'Configuration invalide La configuration de « Bureau » ne respecte plus le contrat. '
      + 'Corrige-la depuis Paramètres > Appareils et services > Tablettes murales, ou restaure '
      + 'une sauvegarde antérieure.');
  });

  it('intégration absente : dit de l INSTALLER, jamais de vérifier le réseau', () => {
    // C'est la cinquième dégradation, et la raison d'être de tout ce lot. HA a répondu
    // `unknown_command` — instantanément, correctement. Renvoyer l'opérateur déboguer son
    // Wi-Fi serait un mensonge, et le bouton mort en prose sous sa forme la plus coûteuse.
    const texte = texteDe(integrationAbsente());
    expect(texte).toBe(
      "Intégration absente L'intégration Tablettes murales n'est pas installée sur ce Home "
      + 'Assistant. Installe-la, puis ajoute un écran depuis Paramètres > Appareils et '
      + 'services.');
    expect(texte).not.toMatch(/réseau|Wi-Fi|wifi/i);
  });
});

describe('choisirEcran — la première dégradation', () => {
  it('rend un lien tapable par écran, portant le NOM exact', () => {
    // `?ecran=` porte le `nom` (« Salon »), jamais la clé de `ECRANS` (« salon ») : le
    // transport apparie exactement (`websocket.py`, `_trouver`).
    const hote = document.createElement('div');
    render(choisirEcran([{ nom: 'Salon', titre: 'Salon' },
                         { nom: 'Salle de bain', titre: 'SdB' }]), hote);
    const liens = [...hote.querySelectorAll('a')];
    expect(liens.map((a) => a.getAttribute('href')))
      .toEqual(['?ecran=Salon', '?ecran=Salle%20de%20bain']);
    expect(liens.map((a) => a.textContent!.trim())).toEqual(['Salon', 'SdB']);
  });

  it('affiche le TITRE mais navigue vers le NOM — ce sont deux champs distincts', () => {
    // `titre` est `ConfigSubentry.title`, renommable seul par le geste générique de HA.
    // Confondre les deux enverrait vers un écran introuvable dès qu'ils divergent.
    const hote = document.createElement('div');
    render(choisirEcran([{ nom: 'Cuisine', titre: 'Le plan de travail' }]), hote);
    const lien = hote.querySelector('a')!;
    expect(lien.getAttribute('href')).toBe('?ecran=Cuisine');
    expect(lien.textContent!.trim()).toBe('Le plan de travail');
  });

  it('retombe sur « aucun écran configuré » quand la liste est vide', () => {
    expect(texteDe(choisirEcran([]))).toBe(texteDe(aucunEcranConfigure()));
  });
});

describe('ecranDeLaPanne — la table complète, décor à CINQ pannes', () => {
  // Leçon 3 : un décor trop pauvre rend le test aveugle. Avec une seule panne, une table qui
  // rendrait TOUJOURS le même écran passerait.
  const toutes: Panne[] = ['introuvable', 'version', 'corrompu', 'integrationAbsente', 'reseau'];

  it('rend un écran DIFFÉRENT pour chacune des cinq pannes', () => {
    const rendus = toutes.map((p) => texteDe(ecranDeLaPanne(p, 'Salon')));
    expect(new Set(rendus).size).toBe(5);
  });

  it('ne rend JAMAIS un gabarit vide, quelle que soit la panne', () => {
    // La règle posée par la ronde de correction 1 : aucune dégradation ne laisse `#app` vide.
    for (const p of toutes) {
      expect(texteDe(ecranDeLaPanne(p, 'Salon')).length).toBeGreaterThan(40);
    }
  });

  it('associe chaque panne à SON écran, pas à celui du voisin', () => {
    expect(texteDe(ecranDeLaPanne('version', 'Salon'))).toBe(texteDe(versionRefusee('Salon')));
    expect(texteDe(ecranDeLaPanne('corrompu', 'Salon'))).toBe(texteDe(configIllisible('Salon')));
    expect(texteDe(ecranDeLaPanne('integrationAbsente', 'Salon')))
      .toBe(texteDe(integrationAbsente()));
    expect(texteDe(ecranDeLaPanne('reseau', 'Salon'))).toBe(texteDe(erreurDemarrage()));
  });

  it('« introuvable » sans liste connue invite à choisir, pas à réparer', () => {
    // Leçon 2, jouée jusqu'au bout ici aussi : épingler la phrase ENTIÈRE, pas seulement la
    // moitié « description de la panne ». La moitié « geste » (vérifier l'adresse, ou créer
    // l'écran depuis Paramètres) doit être gardée au même titre que les six autres écrans.
    //
    // Corrigé le 2026-09-13 : la première version de ce test faisait
    // `toMatch(/n'est pas un écran configuré/)`. Mesuré en relecture — remplacer toute la
    // moitié geste par le mot « Dommage. » laissait les 14 tests VERTS. Le seul écran du
    // module dont l'action n'était gardée par rien, dans le module dont la docstring interdit
    // le bouton mort en prose.
    expect(texteDe(ecranDeLaPanne('introuvable', 'Inconnu'))).toBe(
      "Écran inconnu « Inconnu » n'est pas un écran configuré sur ce Home Assistant. "
      + "Vérifie l'adresse de cette tablette, ou crée cet écran depuis Paramètres > "
      + 'Appareils et services > Tablettes murales.');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm --prefix app test -- repli`
Expected: FAIL — `Failed to resolve import "../src/rendu/repli"`.

- [ ] **Step 3: Écrire `repli.ts`**

Créez `app/src/rendu/repli.ts` :

```ts
/** Les écrans que la tablette montre quand elle ne peut PAS montrer l'écran demandé.
 *
 *  Règle posée par la ronde de correction 1 et jamais relâchée depuis : aucune dégradation ne
 *  laisse `#app` vide. Un mur blanc sur un écran mural ne dit rien à qui passe devant, et ne
 *  laisse aucune prise pour comprendre.
 *
 *  Règle propre à ce module : CHAQUE écran de PANNE nomme un GESTE. Décrire une panne sans dire
 *  quoi faire est le « bouton mort en prose » que ce projet s'interdit — et son cas le plus
 *  coûteux est `integrationAbsente()` : avant qu'il existe, une installation neuve tombait sur
 *  `erreurDemarrage()`, qui envoyait déboguer le réseau alors que Home Assistant avait répondu
 *  instantanément et correctement.
 *
 *  Exception nommée, pas oubliée : `ecranEnAttente()` ne nomme aucun geste, à dessein. Ce n'est
 *  pas une panne mais un état transitoire qui se résout tout seul dès que la réponse de Home
 *  Assistant arrive — demander un geste à quelqu'un pendant qu'un chargement est en cours serait
 *  absurde. Une règle énoncée en absolu et fausse pour un cas sur sept serait elle-même une
 *  prose qui ment.
 *
 *  Ces fonctions sont PURES : elles rendent un gabarit, ne touchent pas au DOM, n'appellent
 *  aucun transport. `demarrage.ts` les câble. Deux d'entre elles (`sessionAbsente`,
 *  `erreurDemarrage`) viennent de `demarrage.ts` et arrivent ici AVEC LEUR TEXTE INTACT : un
 *  déménagement qui réécrit ce qu'il déplace est une modification déguisée en rangement. */
import { html, type TemplateResult } from 'lit';
import type { EntreeListe, Panne } from '../configuration';

/** Sans session HA ouverte sur la tablette, on explique plutôt que d'afficher du blanc. */
export function sessionAbsente(): TemplateResult {
  return html`<div class="cap"><div class="heure">Session</div>
    <div class="phrase">Ouvre Home Assistant sur cette tablette et connecte-toi,
    puis recharge cette page.</div></div>`;
}

/** `connecter()` peut échouer bien après « pas de jeton du tout » : `rafraichir()` lève si HA
 *  refuse le jeton de rafraîchissement (révoqué) ou si le réseau coupe au mauvais moment — ce
 *  qui arrive d'autant plus que le serveur HA est aussi le point d'accès Wi-Fi de la maison.
 *  Sans écran dédié, `render()` n'a jamais lieu et `#app` reste vide : un mur blanc, sans
 *  indice, pour qui passe devant. */
export function erreurDemarrage(): TemplateResult {
  return html`<div class="cap"><div class="heure">Connexion impossible</div>
    <div class="phrase">L'écran n'arrive pas à joindre la maison. Ça peut venir du réseau ou
    de la session : une nouvelle tentative va avoir lieu automatiquement. Si ça persiste,
    réouvre Home Assistant sur cette tablette et reconnecte-toi.</div></div>`;
}

/** L'écran d'attente FRANC de la décision 10 : la configuration arrive par le réseau, donc il
 *  y a un instant où l'on n'a rien à montrer. On le dit, on nomme l'écran demandé — qui rend
 *  visible tout de suite une URL fautive — et on ne cache rien derrière un cache local. */
export function ecranEnAttente(nom: string): TemplateResult {
  return html`<div class="cap"><div class="heure">${nom}</div>
    <div class="phrase">Chargement de la configuration depuis Home Assistant…</div></div>`;
}

/** Deuxième dégradation. Distincte de « HA injoignable » À DESSEIN : ici Home Assistant a
 *  répondu, il n'a simplement aucun écran. Parler de réseau serait un conseil faux. */
export function aucunEcranConfigure(): TemplateResult {
  return html`<div class="cap"><div class="heure">Aucun écran configuré</div>
    <div class="phrase">Ouvre Home Assistant, puis Paramètres &gt; Appareils et services &gt;
    Tablettes murales, et ajoute un écran.</div></div>`;
}

/** Première dégradation : `?ecran=` absent ou inconnu. Une liste TAPABLE, jamais un mur blanc
 *  ni un écran deviné.
 *
 *  Chaque entrée est un simple lien `?ecran=<nom>` : aucun JavaScript, donc rien qui puisse
 *  échouer sur la WebView d'une Fire 7, et une navigation que Fully Kiosk traite comme
 *  n'importe quelle autre.
 *
 *  `nom` et `titre` sont DEUX champs distincts : `nom` est la clé primaire du transport
 *  (appariée EXACTEMENT par `websocket.py`, `_trouver`), `titre` est `ConfigSubentry.title`,
 *  que l'utilisateur peut renommer seul depuis la page d'intégration. On NAVIGUE vers le nom et
 *  on AFFICHE le titre ; les confondre enverrait vers un écran introuvable dès qu'ils divergent.
 *
 *  Liste vide : on retombe sur la deuxième dégradation, qui dit où aller en créer un. Proposer
 *  « choisis » devant zéro choix serait un menu mort. */
export function choisirEcran(entrees: EntreeListe[]): TemplateResult {
  if (entrees.length === 0) return aucunEcranConfigure();
  return html`<div class="cap"><div class="heure">Quel écran ?</div>
    <div class="phrase">Touche le nom de cette tablette.</div>
    <ul class="choix">${entrees.map((e) => html`<li>
      <a href="?ecran=${encodeURIComponent(e.nom)}">${e.titre}</a></li>`)}</ul></div>`;
}

/** Quatrième dégradation, premier visage : la sous-entrée stockée porte une `version` que ce
 *  composant ne reconnaît pas, ou n'en porte aucune. Refus NET, jamais un rendu à moitié. */
export function versionRefusee(nom: string): TemplateResult {
  return html`<div class="cap"><div class="heure">Configuration illisible</div>
    <div class="phrase">La configuration de «&nbsp;${nom}&nbsp;» a été écrite par une autre
    version de l'intégration Tablettes murales. Mets à jour l'intégration, ou recrée cet écran
    depuis Paramètres &gt; Appareils et services &gt; Tablettes murales.</div></div>`;
}

/** Quatrième dégradation, second visage : la version est bonne mais le contenu ne respecte
 *  plus le contrat. Distinct du précédent — le geste n'est pas le même, et le composant a payé
 *  trois rondes pour que ces deux refus portent des codes différents. */
export function configIllisible(nom: string): TemplateResult {
  return html`<div class="cap"><div class="heure">Configuration invalide</div>
    <div class="phrase">La configuration de «&nbsp;${nom}&nbsp;» ne respecte plus le contrat.
    Corrige-la depuis Paramètres &gt; Appareils et services &gt; Tablettes murales, ou restaure
    une sauvegarde antérieure.</div></div>`;
}

/** CINQUIÈME dégradation, absente de la spec d'origine.
 *
 *  Quand l'intégration n'est pas installée, la commande n'est pas enregistrée et c'est le cœur
 *  de Home Assistant qui répond : `unknown_command`, message « Unknown command. », en anglais,
 *  que ni ce dépôt ni ses traductions ne contrôlent. Sans cet écran, l'application retombait
 *  sur `erreurDemarrage()` — « ça peut venir du réseau ou de la session » — ce qui est un
 *  MENSONGE : HA a répondu, instantanément, correctement. Et c'est le cas exact de la première
 *  régression nommée par la spec : une installation neuve n'affiche plus rien.
 *
 *  Ne parle donc JAMAIS de réseau, et un test l'exige. */
export function integrationAbsente(): TemplateResult {
  return html`<div class="cap"><div class="heure">Intégration absente</div>
    <div class="phrase">L'intégration Tablettes murales n'est pas installée sur ce Home
    Assistant. Installe-la, puis ajoute un écran depuis Paramètres &gt; Appareils et
    services.</div></div>`;
}

/** La table panne → écran.
 *
 *  Le cas `introuvable` sans liste connue est traité ici plutôt que par `choisirEcran` : quand
 *  on sait qu'un écran nommé n'existe pas MAIS qu'on n'a pas pu obtenir la liste, proposer un
 *  menu vide serait pire que dire lequel a été demandé. Quand la liste EST connue, c'est
 *  `demarrage.ts` qui appelle directement `choisirEcran` — il a l'information, cette table
 *  ne l'a pas. */
export function ecranDeLaPanne(panne: Panne, nom: string): TemplateResult {
  switch (panne) {
    case 'introuvable':
      return html`<div class="cap"><div class="heure">Écran inconnu</div>
        <div class="phrase">«&nbsp;${nom}&nbsp;» n'est pas un écran configuré sur ce Home
        Assistant. Vérifie l'adresse de cette tablette, ou crée cet écran depuis Paramètres
        &gt; Appareils et services &gt; Tablettes murales.</div></div>`;
    case 'version': return versionRefusee(nom);
    case 'corrompu': return configIllisible(nom);
    case 'integrationAbsente': return integrationAbsente();
    case 'reseau': return erreurDemarrage();
  }
}
```

- [ ] **Step 4: Retirer les deux fonctions déplacées de `demarrage.ts`**

Supprimez les lignes 155-172 de `app/src/demarrage.ts` (les deux fonctions **et** leurs docstrings, qui partent avec elles), et ajoutez l'import auprès des autres imports de rendu en tête de fichier :

```ts
import { sessionAbsente, erreurDemarrage } from './rendu/repli';
```

Ne touchez à RIEN d'autre dans ce fichier : les deux sites d'appel (`render(sessionAbsente(), racine)` l. 214 et `render(erreurDemarrage(), racine)` l. 1239) continuent de fonctionner tels quels.

- [ ] **Step 5: Lancer les tests**

Run: `npm --prefix app test -- repli`
Expected: PASS (13 tests).

Run: `npm --prefix app test`
Expected: 49 fichiers, **1083** tests, 0 échec. Les tests existants qui vérifient l'écran de session et l'écran d'erreur (`app/tests/demarrage.test.ts`, `app/tests/pannes.test.ts`) doivent passer **sans modification** — c'est la contre-épreuve du déménagement.

- [ ] **Step 6: Vérifier que `demarrage.ts` a bien RÉTRÉCI**

```bash
wc -l app/src/demarrage.ts
```
Expected: **moins de 1914** (environ 1897). Si le nombre a augmenté, du code neuf s'est glissé dans un fichier qui viole déjà le plafond de 500 lignes.

- [ ] **Step 7: Jouer les mutations**

| Mutation | Test qui doit tomber |
|---|---|
| dans `integrationAbsente`, remplacer la phrase par celle d'`erreurDemarrage` | « intégration absente : dit de l INSTALLER » (les deux assertions) |
| `href="?ecran=${encodeURIComponent(e.nom)}"` → `e.titre` | « affiche le TITRE mais navigue vers le NOM » |
| retirer `encodeURIComponent` | « rend un lien tapable par écran » (l'entrée à espace) |
| `if (entrees.length === 0)` retiré | « retombe sur « aucun écran configuré » » |
| dans `ecranDeLaPanne`, `case 'corrompu'` → `versionRefusee(nom)` | « associe chaque panne à SON écran » ET « rend un écran DIFFÉRENT pour chacune » |
| remplacer la moitié GESTE du cas `'introuvable'` par un mot quelconque | « « introuvable » sans liste connue invite à choisir » — **ajoutée le 2026-09-13** : sans cette ligne, le seul écran dont l'action n'était pas gardée est passé entre les mailles de la table ET de la relecture de tâche |

- [ ] **Step 8: Vérifier le type et committer**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
npx --prefix app tsc --noEmit -p app/tsconfig.json
git add app/src/rendu/repli.ts app/src/demarrage.ts app/tests/repli.test.ts
git commit -m "feat(app): les sept ecrans de repli, chacun nommant un geste

Aucune degradation ne laisse #app vide -- regle de la ronde de
correction 1. Et chaque ecran NOMME UN GESTE : decrire une panne sans
dire quoi faire est le bouton mort en prose que ce projet s interdit.

La cinquieme degradation est neuve et c est la raison d etre du lot.
Quand l integration n est pas installee, HA repond unknown_command /
« Unknown command. » en anglais, et l application retombait sur
erreurDemarrage() : « ca peut venir du reseau ou de la session ». C est
un MENSONGE -- HA a repondu instantanement et correctement -- et ca
envoie l operateur deboguer son Wi-Fi au lieu d installer l integration.
C est le cas exact de la premiere regression nommee par la spec. Un test
exige que cet ecran ne parle JAMAIS de reseau.

choisirEcran navigue vers le NOM et affiche le TITRE : deux champs
distincts, le titre etant renommable seul par le geste generique de HA.
Le transport apparie le nom EXACTEMENT (_trouver), donc ?ecran= porte
« Salon » et non la cle « salon » de ECRANS.

sessionAbsente et erreurDemarrage demenagent depuis demarrage.ts AVEC
LEUR TEXTE INTACT, et un test l epingle : un demenagement qui reecrit ce
qu il deplace est une modification deguisee en rangement. demarrage.ts
retrecit de 18 lignes -- il en fait 1914, presque quatre fois le plafond
de 500, et ce lot ne doit pas l aggraver.

vitest 49 fichiers / 1083 tests.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `demarrer(racine, nomEcran)` — la coquille qui résout l'écran

**Files:**
- Modify: `app/src/connexion.ts` — rendre `connecter()` IDEMPOTENTE (une garde, ~4 lignes)
- Modify: `app/src/demarrage.ts` — renommer `demarrer` en `demarrerAvecEcran` (**corps inchangé**), ajouter la nouvelle `demarrer`, étendre `ConnexionLike` et `DependancesDemarrage`
- Modify: `app/src/index.ts` — appeler `demarrerAvecEcran` (T6 le refera pour de bon)
- Modify: `app/tests/aides.ts` — `monterDemarrage` passe par la coquille
- Test: `app/tests/demarrage.test.ts` (étendu ; ses 3 appels directs à `demarrer` sont mis à jour)

**Interfaces:**
- Consumes: `chargerEcran`, `listerEcrans`, `Resultat`, `EntreeListe` (T2) ; les huit écrans de `rendu/repli.ts` (T3) ; `Connexion.prete()` (T1).
- Produces :
  - `export async function demarrerAvecEcran(racine: HTMLElement, piece: Ecran, deps?: Partial<DependancesDemarrage>): Promise<void>` — l'ancienne `demarrer`, corps INCHANGÉ
  - `export async function demarrer(racine: HTMLElement, nomEcran: string, deps?: Partial<DependancesDemarrage>): Promise<void>`
  - `DependancesDemarrage` gagne `chargerEcran` et `listerEcrans`
  - `ConnexionLike` gagne `prete(): Promise<void>`

**La contrainte qui décide de la forme :** `demarrage.ts` fait 1914 lignes et son corps est une fermeture géante où `tenter()` capture `piece`. Le découper est un chantier à part. **On ne le découpe donc pas** : on renomme l'entrée, on ajoute une coquille de ~60 lignes devant, et le corps ne change pas d'une ligne. C'est ce qui rend cette tâche relisable — un diff où le corps n'apparaît pas.

**Et la propriété qui rend 3c abordable :** les fichiers de tests qui lisent `ECRANS` ne voient **ni leurs assertions ni leur décor** réécrits. `monterDemarrage` absorbe le changement de signature pour tous ceux qui passent par lui, et il traverse désormais la coquille — donc chacun de ces tests exerce le chemin neuf sans le savoir.

> **Corrigé le 2026-09-13, après mesure.** Ce paragraphe disait « les 12 fichiers ne changent pas d'une ligne ». C'était **faux dès l'origine** : la liste des appelants de `demarrer()` avait été établie avec un `grep | head`, et deux fichiers étaient plus bas dans la sortie tronquée. `app/tests/navigation.test.ts` appelle `demarrer()` **treize fois directement**, `app/tests/pannes.test.ts` également — sans passer par `monterDemarrage`. Ces appels exigent un renommage mécanique en `demarrerAvecEcran`.
>
> Mesuré après exécution : sur les 13 fichiers de tests qui mentionnent `ECRANS`, **11 sont byte-identiques** (`md5sum` comparé avant/après). Les deux qui changent sont `demarrage.test.ts` — qui porte les tests de cette tâche, donc légitimement — et `navigation.test.ts`, dont le diff ne contient **rien** hors le renommage et l'ajout de `prete: () => Promise.resolve()` au double de connexion : zéro assertion, zéro décor, zéro littéral.
>
> L'invariant utile n'était donc pas « byte-identique » mais **« aucune assertion ni aucun décor à réécrire »** — et celui-là tient. Un renommage mécanique n'est pas une réécriture.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajoutez à `app/tests/demarrage.test.ts` :

```ts
describe('demarrer — la coquille résout l écran avant de déléguer', () => {
  // ⚠️ `ecranVide` est une CONSTANTE (`app/tests/aides.ts:14`), importée ici sous le nom
  // `piece`, pas une fabrique. On en dérive un écran nommé plutôt que de l'appeler.
  const ecranDeNom = (nom: string) => ({ ...piece, nom });

  function deps(sur: Record<string, unknown> = {}) {
    return {
      stockage: stockageAvecSession,
      creerConnexion: () => ({
        connecter: () => Promise.resolve(),
        prete: () => Promise.resolve(),
        surChangement: () => {}, surSilence: () => {},
        appelerService: vi.fn(), listerTaches: vi.fn(), envoyerCommande: vi.fn(),
      }),
      intervalFn: vi.fn() as any,
      minuteurFn: vi.fn() as any,
      maintenant: () => new Date(2026, 7, 1, 14, 0),
      ...sur,
    };
  }

  it('affiche l écran d attente AVANT que la configuration arrive', async () => {
    // Décision 10 : écran d'attente franc, pas de cache local. Il faut donc qu'il soit peint
    // avant l'aller-retour, pas après.
    const racine = document.createElement('div');
    let vuPendantLeChargement = '';
    await demarrer(racine, 'Cuisine', deps({
      chargerEcran: async () => {
        vuPendantLeChargement = racine.textContent!.replace(/\s+/g, ' ').trim();
        return { ok: true as const, valeur: ecranDeNom('Cuisine') };
      },
    }));
    expect(vuPendantLeChargement).toBe(
      'Cuisine Chargement de la configuration depuis Home Assistant…');
  });

  it('demande l écran par SON NOM, tel quel', async () => {
    const chargerEcran = vi.fn(async () => ({ ok: true as const, valeur: ecranDeNom('Salon') }));
    await demarrer(document.createElement('div'), 'Salon', deps({ chargerEcran }));
    expect(chargerEcran).toHaveBeenCalledWith(expect.anything(), 'Salon');
  });

  it('ne demande RIEN et propose la liste quand le nom est vide', async () => {
    // Première dégradation : `?ecran=` absent. Demander un écran nommé « » serait un
    // aller-retour dont on connaît déjà la réponse.
    const chargerEcran = vi.fn();
    const racine = document.createElement('div');
    await demarrer(racine, '', deps({
      chargerEcran,
      listerEcrans: async () => ({ ok: true as const, valeur: [{ nom: 'Salon', titre: 'Salon' }] }),
    }));
    expect(chargerEcran).not.toHaveBeenCalled();
    expect(racine.querySelector('a')!.getAttribute('href')).toBe('?ecran=Salon');
  });

  it('propose la liste quand l écran demandé est introuvable', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, 'Grenier', deps({
      chargerEcran: async () => ({ ok: false as const, panne: 'introuvable' as const }),
      listerEcrans: async () => ({
        ok: true as const,
        valeur: [{ nom: 'Salon', titre: 'Salon' }, { nom: 'Cuisine', titre: 'Cuisine' }],
      }),
    }));
    // Décor à DEUX écrans (leçon 3) : avec un seul, une implémentation qui n'en rendrait
    // qu'un passerait.
    expect([...racine.querySelectorAll('a')].map((a) => a.getAttribute('href')))
      .toEqual(['?ecran=Salon', '?ecran=Cuisine']);
  });

  it('dit « aucun écran configuré » quand HA répond une liste vide', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, '', deps({
      listerEcrans: async () => ({ ok: true as const, valeur: [] }),
    }));
    expect(racine.textContent).toMatch(/Aucun écran configuré/);
    expect(racine.textContent).not.toMatch(/réseau/);
  });

  it('affiche l écran de CHAQUE panne, et ne retente pas celles qui exigent un humain', async () => {
    for (const [panne, motif] of [
      ['version', /autre version de l'intégration/],
      ['corrompu', /ne respecte plus le contrat/],
      ['integrationAbsente', /n'est pas installée/],
    ] as const) {
      const racine = document.createElement('div');
      const minuteurFn = vi.fn();
      await demarrer(racine, 'Salon', deps({
        chargerEcran: async () => ({ ok: false as const, panne }),
        minuteurFn: minuteurFn as any,
      }));
      expect(racine.textContent).toMatch(motif);
      // Retenter une configuration illisible en boucle n'a jamais rien réparé : ces trois
      // pannes attendent un geste humain, et l'écran le nomme.
      expect(minuteurFn).not.toHaveBeenCalled();
    }
  });

  it('retente en repli exponentiel sur une panne réseau, et finit par afficher l écran', async () => {
    let appels = 0;
    const rappels: (() => void)[] = [];
    const minuteurFn = vi.fn((fn: () => void) => { rappels.push(fn); return 1 as any; });
    const racine = document.createElement('div');
    await demarrer(racine, 'Salon', deps({
      minuteurFn: minuteurFn as any,
      chargerEcran: async () => (++appels < 3
        ? { ok: false as const, panne: 'reseau' as const }
        : { ok: true as const, valeur: ecranDeNom('Salon') }),
    }));
    expect(racine.textContent).toMatch(/Connexion impossible/);
    expect(minuteurFn.mock.calls[0][1]).toBe(1000);

    await rappels[0]!();
    expect(minuteurFn.mock.calls[1][1]).toBe(2000);
    await rappels[1]!();
    expect(racine.textContent).not.toMatch(/Connexion impossible/);
  });

  it('affiche l écran de session AVANT tout aller-retour réseau', async () => {
    const chargerEcran = vi.fn();
    const racine = document.createElement('div');
    await demarrer(racine, 'Salon', deps({ stockage: stockageSansSession, chargerEcran }));
    expect(racine.textContent).toMatch(/Ouvre Home Assistant/);
    expect(chargerEcran).not.toHaveBeenCalled();
  });

  it('ne crée qu UNE SEULE connexion pour la résolution ET pour le corps', async () => {
    // Une seconde instance de `Connexion` poserait un second `setInterval` de surveillance du
    // silence, fermé sur une instance abandonnée — la fuite que la ronde de correction 2 a
    // fermée, rouverte par la coquille.
    const creerConnexion = vi.fn(() => ({
      connecter: () => Promise.resolve(), prete: () => Promise.resolve(),
      surChangement: () => {}, surSilence: () => {},
      appelerService: vi.fn(), listerTaches: vi.fn(), envoyerCommande: vi.fn(),
    }));
    await demarrer(document.createElement('div'), 'Salon', deps({
      creerConnexion,
      chargerEcran: async () => ({ ok: true as const, valeur: ecranDeNom('Salon') }),
    }));
    expect(creerConnexion).toHaveBeenCalledTimes(1);
  });
});

```

**Et dans `app/tests/connexion.test.ts`** — pas dans `demarrage.test.ts` : ce test a besoin de
`faux`, qui est une constante LOCALE à `connexion.test.ts` (l. 4), et de la classe concrète
`Connexion` avec un double de websocket portant `readyState`.

```ts
describe('Connexion.connecter est idempotente', () => {
  it('n ouvre PAS un second websocket quand la socket est déjà ouverte', async () => {
    // La coquille connecte, puis le corps rappelle `connecter()` sur la MÊME instance. Sans
    // cette garde, la seconde ouverture remplacerait `this.ws`, l'ancienne socket déclencherait
    // son `onclose`, et la boucle de reconnexion partirait sans raison.
    let ouvertures = 0;
    class Ws {
      readyState = 1;   // OPEN
      onmessage: ((ev: any) => void) | null = null;
      onclose: (() => void) | null = null;
      send() {}
      constructor(public url: string) { ouvertures++; }
    }
    const cx = new Connexion(
      { access_token: 'a', refresh_token: 'r', clientId: 'c', expires: Date.now() + 3_600_000 } as any,
      { origineWs: 'ws://test', WebSocketImpl: Ws as any, intervalFn: vi.fn() as any,
        minuteurFn: vi.fn() as any, stockage: faux(null) } as any,
    );
    await cx.connecter();
    await cx.connecter();
    expect(ouvertures).toBe(1);
  });
});
```

`piece` (c'est-à-dire `ecranVide`), `stockageAvecSession` et `stockageSansSession` sont déjà
importés en tête de `app/tests/demarrage.test.ts` (l. 15-18) : rien à ajouter, sauf `ECRANS`
qui y est aussi déjà.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm --prefix app test -- demarrage`
Expected: FAIL — `demarrer` reçoit un `Ecran` là où le test passe une chaîne, et `ouvertures` vaut 2.

- [ ] **Step 3: Rendre `connecter()` idempotente**

Dans `app/src/connexion.ts`, en tête de `connecter()`, juste après `armerSurveillanceSilence()` :

```ts
    // Idempotente à dessein : `demarrer()` connecte pour résoudre la configuration, puis passe
    // LA MÊME instance au corps, qui rappelle `connecter()`. Sans cette garde, la seconde
    // ouverture remplacerait `this.ws` ; l'ancienne socket déclencherait son `onclose`, donc
    // `reconnecter()`, et la page repartirait en boucle de reconnexion sans qu'aucune coupure
    // n'ait eu lieu.
    //
    // La garde ne gêne PAS la reconnexion réelle : quand `ws.onclose` rappelle `connecter()`,
    // `readyState` vaut CLOSED (3), jamais OPEN. Et un double de test sans `readyState`
    // (`undefined !== 1`) passe la garde comme avant.
    if (this.ws && this.ws.readyState === 1) return;
```

- [ ] **Step 4: Renommer l'entrée de `demarrage.ts`, sans toucher au corps**

Une seule ligne change dans les 1900 lignes existantes :

```ts
export async function demarrerAvecEcran(
  racine: HTMLElement, piece: Ecran, deps: Partial<DependancesDemarrage> = {},
): Promise<void> {
```

Adaptez sa docstring en tête (l. 174-183) en lui ajoutant cette phrase :

```
 *  Cette fonction reçoit un écran DÉJÀ RÉSOLU. C'est `demarrer()`, plus bas, qui l'obtient —
 *  depuis Home Assistant en usage normal, depuis le littéral `ECRANS` sur le chemin de
 *  transition (cf. `index.ts`). Séparer les deux garde ce corps-ci indifférent à la provenance
 *  de sa configuration, et c'est ce qui a permis de l'introduire sans toucher à ces 1900 lignes.
```

Étendez `ConnexionLike` (l. 122) :

```ts
  /** Résolue quand l'authentification websocket a abouti. Nécessaire à `demarrer()` : avant
   *  cette tâche, `connecter()` rendait la main AVANT `auth_ok`, donc la toute première commande
   *  websocket de l'application appelait `ws.send()` sur une socket en CONNECTING. */
  prete(): Promise<void>;
```

Et `DependancesDemarrage` (l. 147) :

```ts
export type DependancesDemarrage = {
  stockage: Storage;
  creerConnexion: (jetons: Jetons) => ConnexionLike;
  intervalFn: typeof setInterval;
  minuteurFn: typeof setTimeout;
  maintenant: () => Date;
  /** Injectables pour que les tests montent un écran sans transport — et pour que le chemin de
   *  transition (`index.ts`, `data-piece`) serve le littéral par la même porte. */
  chargerEcran: (cx: TransportConfig, nom: string) => Promise<Resultat<Ecran>>;
  listerEcrans: (cx: TransportConfig) => Promise<Resultat<EntreeListe[]>>;
};
```

Imports à ajouter en tête :

```ts
import {
  chargerEcran as chargerEcranHA, listerEcrans as listerEcransHA,
  type EntreeListe, type Resultat, type TransportConfig,
} from './configuration';
import {
  sessionAbsente, erreurDemarrage, ecranEnAttente, choisirEcran, ecranDeLaPanne,
} from './rendu/repli';
```

- [ ] **Step 5: Écrire la coquille**

Ajoutez à la FIN de `app/src/demarrage.ts` :

```ts
/** Démarre l'écran NOMMÉ dans `racine` : attente → chargement → rendu.
 *
 *  C'est le point d'entrée de l'application depuis que la configuration vit dans Home Assistant
 *  (spec du 2026-09-12). Il résout l'écran, puis délègue à `demarrerAvecEcran` qui n'a pas
 *  changé d'une ligne — c'est cette séparation qui a permis d'introduire le transport sans
 *  toucher aux 1900 lignes du corps, ni aux assertions des fichiers de tests qui le montent.
 *
 *  Ne lève jamais. Les cinq pannes se répartissent en trois familles, et le traitement DIFFÈRE :
 *   - `reseau` : on retente, en repli exponentiel, indéfiniment. C'est la seule que le temps
 *     répare, et c'est ce que promet le texte d'`erreurDemarrage()` — « une nouvelle tentative
 *     va avoir lieu automatiquement ».
 *   - `introuvable` : on propose la liste. Retenter ne changerait rien ; l'écran demandé
 *     n'existe pas, et le choix est immédiatement utile.
 *   - `version`, `corrompu`, `integrationAbsente` : on affiche, et on s'arrête. Ces trois-là
 *     attendent un geste HUMAIN, que l'écran nomme. Une boucle de retentative n'a jamais réparé
 *     une configuration illisible ; elle ne ferait que consommer le réseau d'une tablette à
 *     130 Mo de libre en cachant le vrai message derrière un clignotement. */
export async function demarrer(
  racine: HTMLElement, nomEcran: string, deps: Partial<DependancesDemarrage> = {},
): Promise<void> {
  // Même raison qu'au début de `demarrerAvecEcran` : les jetons de couleur sont scopés à `.m3`,
  // et les écrans de repli aussi profitent du bon fond.
  document.documentElement.classList.add('m3');

  const stockage = deps.stockage ?? localStorage;
  const minuteurFn = deps.minuteurFn ?? minuteurFnParDefaut;
  const chargerEcranFn = deps.chargerEcran ?? chargerEcranHA;
  const listerEcransFn = deps.listerEcrans ?? listerEcransHA;

  const jetons = lireJetons(stockage);
  if (!jetons) {
    // Avant tout aller-retour réseau : sans session, aucune commande ne partirait de toute façon.
    render(sessionAbsente(), racine);
    return;
  }

  render(ecranEnAttente(nomEcran), racine);

  // UNE SEULE instance pour la résolution ET pour le corps : une seconde poserait un second
  // minuteur de surveillance du silence, fermé sur une instance abandonnée — la fuite que la
  // ronde de correction 2 a fermée. `connecter()` est idempotente depuis cette tâche, donc le
  // corps peut la rappeler sans ouvrir un second websocket.
  const cx = (deps.creerConnexion ?? ((j: Jetons) => new Connexion(j)))(jetons);
  const depsDuCorps: Partial<DependancesDemarrage> = { ...deps, creerConnexion: () => cx };

  const proposerLaListe = async (): Promise<void> => {
    const liste = await listerEcransFn(cx);
    render(
      liste.ok ? choisirEcran(liste.valeur) : ecranDeLaPanne(liste.panne, nomEcran),
      racine,
    );
  };

  let essai = 0;
  const tenterChargement = async (): Promise<void> => {
    try {
      await cx.connecter();
      await cx.prete();

      // `?ecran=` absent : on connaît déjà la réponse, inutile de demander un écran nommé « ».
      if (nomEcran === '') { await proposerLaListe(); return; }

      const resultat = await chargerEcranFn(cx, nomEcran);
      if (resultat.ok) {
        await demarrerAvecEcran(racine, resultat.valeur, depsDuCorps);
        return;
      }
      if (resultat.panne === 'introuvable') { await proposerLaListe(); return; }
      if (resultat.panne === 'reseau') throw new Error('reseau');
      render(ecranDeLaPanne(resultat.panne, nomEcran), racine);
    } catch {
      render(erreurDemarrage(), racine);
      minuteurFn(() => void tenterChargement(), delaiReconnexion(essai++));
    }
  };

  await tenterChargement();
}
```

- [ ] **Step 6: Mettre à jour les quatre appelants**

`app/src/index.ts` — provisoire, T6 le refait :

```ts
void demarrerAvecEcran(racine, piece);
```
(et l'import correspondant)

`app/tests/aides.ts`, dans `monterDemarrage` — la coquille est traversée par les 292 références :

```ts
  await demarrer(racine, piece.nom, {
    stockage: options.stockage ?? stockageAvecSession,
    creerConnexion: () => ({
      connecter: () => Promise.resolve(),
      prete: () => Promise.resolve(),
      surChangement: (cb) => { emettre = cb; },
      appelerService,
      surSilence: (cb) => { silencer = cb; },
      listerTaches,
      envoyerCommande,
    }),
    // L'écran est fourni directement : ces tests montent un écran CONNU, ils n'ont rien à
    // apprendre du transport. Mais ils traversent quand même la coquille — écran d'attente,
    // résolution, délégation — donc chacun des 292 sites en est une épreuve de plus.
    chargerEcran: async () => ({ ok: true, valeur: piece }),
    intervalFn: intervalFn as any,
    minuteurFn: minuteurFn as any,
    maintenant: options.maintenant ?? (() => new Date(2026, 7, 1, 14, 0)),
  });
```

`app/tests/demarrage.test.ts` — les trois appels directs existants (l. 24, 35, 49) passent à `demarrerAvecEcran(racine, piece, {...})`, sans autre changement : ils testent le corps, pas la coquille.

- [ ] **Step 7: Lancer les tests**

Run: `npm --prefix app test`
Expected: 49 fichiers, **1092** tests, 0 échec.

**Les fichiers qui lisent `ECRANS` ne doivent voir ni assertion ni décor réécrits.** Deux
d'entre eux changent légitimement — `demarrage.test.ts` (il porte les tests de cette tâche) et
`navigation.test.ts` (13 appels directs à `demarrer()`, renommage mécanique). Vérifiez que les
autres sont intacts, et que le diff des deux exceptions ne contient QUE le renommage :

```bash
git diff --name-only | grep -E 'tests/(corps|ecran|orchestration|maison|modes|nuit|budget|agencement|cochage|navigation|contrat-schema)\.test\.ts' \
  && echo "ECHEC : un fichier qui lit ECRANS a ete modifie" || echo "OK : les references intactes"

# Et la contre-epreuve sur les deux exceptions : rien hors le renommage
git diff <BASE> app/tests/navigation.test.ts | grep -E '^[-+]' | grep -v '^[-+][-+][-+]' \
  | grep -vE "demarrer|demarrerAvecEcran|prete: \(\) => Promise.resolve\(\)," | wc -l
# attendu : 0
```

- [ ] **Step 8: Jouer les mutations**

| Mutation | Test qui doit tomber |
|---|---|
| déplacer `render(ecranEnAttente(...))` APRÈS `chargerEcranFn` | « affiche l écran d attente AVANT » |
| `if (nomEcran === '')` retiré | « ne demande RIEN et propose la liste » |
| `if (resultat.panne === 'introuvable')` → afficher `ecranDeLaPanne` | « propose la liste quand l écran demandé est introuvable » |
| `if (resultat.panne === 'reseau') throw` retiré | « retente en repli exponentiel » |
| `throw` ajouté aussi pour `version` | « ne retente pas celles qui exigent un humain » |
| `creerConnexion: () => cx` → `deps.creerConnexion` | « ne crée qu UNE SEULE connexion » |
| retirer la garde `readyState === 1` | « n ouvre PAS un second websocket » |

- [ ] **Step 9: Vérifier le type, la taille et committer**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
npx --prefix app tsc --noEmit -p app/tsconfig.json
wc -l app/src/demarrage.ts   # attendu : ~1960, et T6 n y ajoutera rien
git add app/src/connexion.ts app/src/demarrage.ts app/src/index.ts app/tests/aides.ts app/tests/demarrage.test.ts
git commit -m "feat(app): demarrer(racine, nomEcran) resout l ecran avant de deleguer

L ancienne demarrer devient demarrerAvecEcran, CORPS INCHANGE : une
seule ligne bouge dans les 1900 lignes existantes. La coquille de 60
lignes qui arrive devant fait attente -> chargement -> rendu, et delegue.
C est ce qui rend cette tache relisable, et c est ce qui garde intactes
les 292 references a ECRANS des douze fichiers de tests -- la propriete
qui rendra le plan 3c abordable.

monterDemarrage passe desormais PAR la coquille en fournissant l ecran :
chacun de ces 292 sites devient une epreuve de plus du chemin neuf, sans
qu aucun n ait ete touche.

Les cinq pannes ne se traitent pas pareil, et c est deliberе :
- reseau : on retente en repli exponentiel, c est la seule que le temps
  repare, et c est ce que le texte d erreurDemarrage() promet ;
- introuvable : on propose la liste, retenter ne changerait rien ;
- version / corrompu / integrationAbsente : on affiche et on s arrete.
  Une boucle n a jamais repare une configuration illisible ; elle
  consommerait le reseau en cachant le vrai message derriere un
  clignotement.

connecter() devient idempotente : la coquille connecte puis passe LA
MEME instance au corps, qui la rappelle. Sans la garde, la seconde
ouverture remplacait this.ws, l ancienne socket declenchait son onclose,
et la page repartait en reconnexion sans qu aucune coupure ait eu lieu.
Une seule instance aussi pour ne pas rouvrir la fuite de minuteur que la
ronde de correction 2 avait fermee.

vitest 49 fichiers / 1092 tests.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `rechargement.ts` — l'écran se remet à jour tout seul

**Files:**
- Create: `app/src/rechargement.ts`
- Modify: `app/src/demarrage.ts` — `ConnexionLike` gagne `surEvenement` ; la coquille arme l'abonnement (~4 lignes)
- Test: `app/tests/rechargement.test.ts`

**Interfaces:**
- Consumes: `Connexion.surEvenement` (T1), la coquille `demarrer` (T4).
- Produces: `export function armerRechargement(cx: AbonnableEvenements, nomEcran: string, recharger: () => void): void`

**C'est la promesse « édition vivante » de la spec**, et c'est la seule partie de 3b qui se prouve vraiment devant la tablette (étape 6 de la mise en production, plan 3c).

- [ ] **Step 1: Écrire le test qui échoue**

Créez `app/tests/rechargement.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { armerRechargement } from '../src/rechargement';

/** Un double qui capture les abonnements et permet de pousser un événement. */
function bus() {
  const abonnes = new Map<string, ((d: Record<string, unknown>) => void)[]>();
  return {
    surEvenement: vi.fn((type: string, cb: (d: Record<string, unknown>) => void) => {
      const l = abonnes.get(type);
      if (l) l.push(cb); else abonnes.set(type, [cb]);
    }),
    pousser(type: string, donnees: Record<string, unknown>) {
      for (const cb of abonnes.get(type) ?? []) cb(donnees);
    },
  };
}

describe('armerRechargement', () => {
  it("s abonne à home_desk_config_changed, en valeur littérale", () => {
    // Le nom de l'événement traverse la frontière de langage : `const.EVENEMENT_CHANGEMENT`
    // est calculé côté Python (`f"{DOMAIN}_config_changed"`) et ne peut pas être importé ici.
    const cx = bus();
    armerRechargement(cx, 'Cuisine', vi.fn());
    expect(cx.surEvenement).toHaveBeenCalledWith(
      'home_desk_config_changed', expect.any(Function));
  });

  it('recharge quand l événement porte le nom de CET écran', () => {
    const recharger = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', recharger);
    cx.pousser('home_desk_config_changed', { nom: 'Cuisine' });
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  it('ne recharge PAS sur l événement d un AUTRE écran — décor à deux écrans', () => {
    // Leçon 3, et elle a déjà coûté deux tests aveugles sur ce chantier : avec un seul écran
    // au décor, une implémentation qui rechargerait sur TOUT événement passerait le test
    // précédent sans qu'on s'en aperçoive. Les trois tablettes de cette maison écoutent le
    // MÊME bus : sans ce filtre, éditer le salon rechargerait la cuisine et le bureau.
    const rechargerCuisine = vi.fn();
    const rechargerSalon = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', rechargerCuisine);
    armerRechargement(cx, 'Salon', rechargerSalon);

    cx.pousser('home_desk_config_changed', { nom: 'Salon' });

    expect(rechargerCuisine).not.toHaveBeenCalled();
    expect(rechargerSalon).toHaveBeenCalledTimes(1);
  });

  it('ignore un événement sans nom plutôt que de recharger à l aveugle', () => {
    const recharger = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', recharger);
    cx.pousser('home_desk_config_changed', {});
    cx.pousser('home_desk_config_changed', { nom: 42 });
    expect(recharger).not.toHaveBeenCalled();
  });

  it('recharge à CHAQUE édition, pas seulement à la première', () => {
    const recharger = vi.fn();
    const cx = bus();
    armerRechargement(cx, 'Cuisine', recharger);
    cx.pousser('home_desk_config_changed', { nom: 'Cuisine' });
    cx.pousser('home_desk_config_changed', { nom: 'Cuisine' });
    expect(recharger).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm --prefix app test -- rechargement`
Expected: FAIL — `Failed to resolve import "../src/rechargement"`.

- [ ] **Step 3: Écrire `rechargement.ts`**

```ts
/** Le rechargement à chaud : éditer une tuile depuis Home Assistant fait se remettre à jour la
 *  tablette, sans qu'on la touche. C'est la promesse « édition vivante » de la spec — le second
 *  des deux objectifs, et le seul qui se vérifie devant le mur plutôt qu'en test.
 *
 *  Corrigé en relecture finale de branche : cette docstring attribuait l'émission de
 *  `home_desk_config_changed` à `garde_ecran.persister_si_valide`. `garde_ecran.py` ne contient
 *  aucun `async_fire` (mesuré). L'émetteur réel est l'ÉCOUTEUR DE MISE À JOUR DE L'ENTRÉE posé par
 *  `__init__.async_setup_entry` (`entry.add_update_listener`, voir `websocket.py:32-34`) : il
 *  émet à CHAQUE écriture — création, reconfiguration, suppression d'une sous-entrée, ou
 *  renommage du seul titre. Les TROIS tablettes de cette maison écoutent le même bus : le filtre
 *  par nom n'est donc pas une optimisation, c'est ce qui empêche d'éditer le salon de faire
 *  clignoter la cuisine et le bureau. */

/** Ce que ce module attend d'une connexion. Pas `ConnexionLike` (qui en demande sept fois plus),
 *  pas la classe concrète : juste de quoi s'abonner. */
export type AbonnableEvenements = {
  surEvenement(type: string, cb: (donnees: Record<string, unknown>) => void): void;
};

/** Le nom de l'événement, ÉCRIT EN DUR.
 *
 *  Côté Python il est CALCULÉ (`const.EVENEMENT_CHANGEMENT = f"{DOMAIN}_config_changed"`), donc
 *  il n'existe nulle part comme littéral à importer — et `app/src/` est en TypeScript de toute
 *  façon. Comme pour les quatre codes de refus, la valeur est écrite des deux côtés et c'est le
 *  test qui l'épingle qui tient la frontière. */
const EVENEMENT = 'home_desk_config_changed';

export function armerRechargement(
  cx: AbonnableEvenements, nomEcran: string, recharger: () => void,
): void {
  cx.surEvenement(EVENEMENT, (donnees) => {
    // Un événement sans nom exploitable est ignoré, jamais traité comme « recharge tout » :
    // trois tablettes qui rechargent ensemble sur une charge utile malformée feraient trois
    // allers-retours pour rien, et masqueraient le vrai défaut derrière un symptôme diffus.
    if (typeof donnees.nom !== 'string') return;
    if (donnees.nom !== nomEcran) return;
    recharger();
  });
}
```

- [ ] **Step 4: Armer l'abonnement dans la coquille**

Dans `app/src/demarrage.ts`, étendez `ConnexionLike` :

```ts
  /** Tâche 5 du plan 3b : le rechargement à chaud s'abonne par ici. */
  surEvenement(type: string, cb: (donnees: Record<string, unknown>) => void): void;
```

Puis, dans `demarrer()`, juste après la création de `cx` :

```ts
  // Armé AVANT `connecter()` : `surEvenement` mémorise l'abonnement et la souscription part au
  // premier `auth_ok`, puis est REJOUÉE à chaque reconnexion (cf. `connexion.ts`). Armé une
  // seule fois pour la durée de vie de la page, jamais à chaque tentative — même invariant que
  // `surChangement`/`surSilence`, et même raison : les tableaux de rappels de `Connexion`
  // grossiraient indéfiniment.
  //
  // Le rechargement passe par `location.reload()` plutôt que par un redessin interne : la
  // configuration touche TOUT (agencement, modes, budget, minuteurs, sources), et rejouer un
  // démarrage complet dans une page déjà montée demanderait de défaire proprement des minuteurs,
  // des abonnements et un moteur d'animation — beaucoup de code neuf, pour une page qui se
  // recharge en moins d'une seconde sur une Fire 7 et dont personne ne regarde l'état local.
  armerRechargement(cx, nomEcran, deps.recharger ?? (() => location.reload()));
```

Ajoutez `recharger?: () => void` à `DependancesDemarrage` (pour que les tests n'appellent pas `location.reload()`), et l'import :

```ts
import { armerRechargement } from './rechargement';
```

Enfin, complétez le double de `monterDemarrage` (`app/tests/aides.ts`) et celui de `demarrage.test.ts` avec `surEvenement: () => {}`.

- [ ] **Step 5: Lancer les tests**

Run: `npm --prefix app test`
Expected: 50 fichiers, **1097** tests, 0 échec.

- [ ] **Step 6: Jouer les mutations**

| Mutation | Test qui doit tomber |
|---|---|
| `if (donnees.nom !== nomEcran) return;` retiré | « ne recharge PAS sur l événement d un AUTRE écran » **et** « ignore un événement sans nom » — les deux, parce que c'est la même comparaison qui les couvre |
| ~~`typeof donnees.nom !== 'string'` retiré~~ | **LIGNE RETIRÉE le 2026-09-13.** Cette garde était structurellement MORTE : `nomEcran` est typé `string`, donc aucune valeur non textuelle ne peut lui être égale, et la comparaison suivante rejette déjà tout ce qu'elle rejetterait. **Aucun décor ne peut les distinguer.** La garde a été supprimée, et son commentaire — qui était vrai mais attribuait le comportement à la mauvaise ligne — déplacé sur celle qui le produit. |
| `'home_desk_config_changed'` → `'home_desk_changed'` | « s abonne à home_desk_config_changed » (et 3 autres en cascade) |
| se désabonner après le premier appel | « recharge à CHAQUE édition » |

**Et les trois mutations du CÂBLAGE, dans `app/src/demarrage.ts` — ajoutées le 2026-09-13,
après qu'une relecture a mesuré que leur absence laissait un trou béant :**

| Mutation | Test qui doit tomber |
|---|---|
| supprimer entièrement l'appel `armerRechargement(cx, nomEcran, …)` de `demarrer()` | le test d'intégration du câblage |
| `deps.recharger ?? (() => location.reload())` → `() => location.reload()` en dur | idem |
| passer une chaîne fixe à `armerRechargement` au lieu du paramètre `nomEcran` | idem |

> **Pourquoi ces trois lignes existent.** Avant elles, la table ne mutait que `rechargement.ts`.
> Mesuré en relecture : on pouvait **supprimer l'appel `armerRechargement(...)` de `demarrer()`**
> — c'est-à-dire la fonctionnalité que cette tâche livre — et les 1102 tests restaient **verts**.
> Le module était impeccablement gardé, son branchement ne l'était pas du tout. Les treize
> doubles de connexion complétés satisfaisaient le type (`surEvenement: () => {}`) sans qu'aucun
> ne capture le rappel ni ne pousse d'événement à travers `demarrer()`.
>
> **C'est la première leçon de ce dépôt montée d'un cran : un test qui garde un MODULE ne garde
> pas son BRANCHEMENT.** Toute tâche qui livre un module ET son câblage doit muter les deux.

**Le test d'intégration qui les ferme** (dans `app/tests/demarrage.test.ts`, pas dans
`rechargement.test.ts`) : monter `demarrer(...)` avec un double qui **capture** le rappel de
`surEvenement` — le patron existe déjà dans ce fichier avec `surChangement: (cb) => { emettre = cb; }` —,
injecter un `recharger` espion par `deps`, pousser un événement au nom de l'écran monté (l'espion
est appelé), puis au nom d'un **autre** écran (il ne l'est pas). Le décor à deux noms reste la
règle : le premier test prouve que le filtre marche *dans le module*, celui-ci qu'il marche *tel
que branché*.

- [ ] **Step 7: Committer**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
npx --prefix app tsc --noEmit -p app/tsconfig.json
git add app/src/rechargement.ts app/src/demarrage.ts app/tests/rechargement.test.ts app/tests/aides.ts app/tests/demarrage.test.ts
git commit -m "feat(app): rechargement a chaud sur home_desk_config_changed

La promesse « edition vivante » de la spec, et la seule partie de ce lot
qui se prouve devant le mur plutot qu en test.

Le filtre par nom n est PAS une optimisation : les trois tablettes de
cette maison ecoutent le meme bus, donc sans lui editer le salon ferait
clignoter la cuisine et le bureau. Le test qui le garde a un decor a DEUX
ecrans -- avec un seul, une implementation qui rechargerait sur TOUT
evenement passerait sans qu on s en apercoive, et ce decor trop pauvre a
deja rendu deux tests aveugles sur ce chantier.

Le nom de l evenement est ecrit EN DUR : cote Python il est CALCULE
(f\"{DOMAIN}_config_changed\"), donc il n existe nulle part comme
litteral a importer.

location.reload() plutot qu un redessin interne : la configuration
touche tout, et rejouer un demarrage dans une page deja montee
demanderait de defaire proprement minuteurs, abonnements et moteur
d animation -- beaucoup de code neuf pour une page qui se recharge en
moins d une seconde.

vitest 50 fichiers / 1097 tests.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `index.html` unique, `?ecran=`, et la branche de transition

**Files:**
- Create: `app/gabarits/index.html`
- Create: `app/src/page.ts` — la résolution, PURE et testable
- Modify: `app/src/index.ts` (10 lignes → 6)
- Modify: `app/scripts/generer-pages.mjs`
- Modify: `app/outils/verifier-rendu.mjs` — 5 sites d'URL
- Test: `app/tests/page.test.ts`

**Interfaces:**
- Consumes: `demarrer` et `demarrerAvecEcran` (T4).
- Produces: `export function demarrerPage(racine: HTMLElement, href: string, deps?: DependancesPage): Promise<void>`

**Pourquoi `page.ts` et pas directement `index.ts` :** `index.ts` s'exécute à l'import (il lit `document`, il appelle `demarrer`). Un module à effets de bord de premier niveau ne se teste pas — l'importer, c'est le lancer. La décision part donc dans une fonction pure, et `index.ts` redevient six lignes de câblage. C'est aussi ce qui permet d'épingler la branche de transition par un test, au lieu de l'espérer.

**`dist/` porte QUATRE HTML** pendant toute la migration : `index.html` plus les trois pages historiques. Il ne passe à un qu'à l'étape 8 du plan 3c. La spec d'origine croyait que les pages déjà en production survivraient d'elles-mêmes à la bascule — c'est faux, `replace_tree()` remplace `www/wallpanel/` en entier.

- [ ] **Step 1: Écrire le test qui échoue**

Créez `app/tests/page.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { demarrerPage } from '../src/page';
import { ECRANS } from '../src/ecran';

function racineAvec(dataset: Record<string, string> = {}) {
  const el = document.createElement('div');
  for (const [k, v] of Object.entries(dataset)) el.dataset[k] = v;
  return el;
}

describe('demarrerPage — le chemin NEUF', () => {
  it('passe le nom de ?ecran= au transport, décodé', () => {
    const demarrer = vi.fn(async () => {});
    const demarrerAvecEcran = vi.fn(async () => {});
    const racine = racineAvec();
    void demarrerPage(racine, 'https://ha/local/wallpanel/index.html?ecran=Salle%20de%20bain',
                      { demarrer, demarrerAvecEcran });
    expect(demarrer).toHaveBeenCalledWith(racine, 'Salle de bain');
    expect(demarrerAvecEcran).not.toHaveBeenCalled();
  });

  it('gagne sur data-piece quand les deux sont présents', () => {
    // Pendant la migration, une page historique repointée porte les DEUX : son `data-piece`
    // d'origine et le `?ecran=` neuf. Le transport doit gagner, sans quoi repointer une
    // tablette ne changerait rien et l'étape 5 de la mise en production serait un faux vert.
    const demarrer = vi.fn(async () => {});
    const demarrerAvecEcran = vi.fn(async () => {});
    void demarrerPage(racineAvec({ piece: 'salon' }),
                      'https://ha/local/wallpanel/salon.html?ecran=Cuisine',
                      { demarrer, demarrerAvecEcran });
    expect(demarrer).toHaveBeenCalledWith(expect.anything(), 'Cuisine');
    expect(demarrerAvecEcran).not.toHaveBeenCalled();
  });
});

describe('demarrerPage — la BRANCHE DE TRANSITION (retirée à l étape 8 du plan 3c)', () => {
  it('sert le littéral ECRANS depuis data-piece, sans aucun aller-retour', () => {
    // C'est CE chemin qui rend le retour arrière des étapes 5 à 7 réel : remettre l'ancienne
    // `startURL` fait charger la page historique, qui lit le littéral — le comportement
    // d'avant, octet pour octet, puisque c'est le même code.
    const demarrer = vi.fn(async () => {});
    const demarrerAvecEcran = vi.fn(async () => {});
    const racine = racineAvec({ piece: 'cuisine' });
    void demarrerPage(racine, 'https://ha/local/wallpanel/cuisine.html',
                      { demarrer, demarrerAvecEcran });
    expect(demarrerAvecEcran).toHaveBeenCalledWith(racine, ECRANS.cuisine);
    expect(demarrer).not.toHaveBeenCalled();
  });

  it('les trois clés historiques mènent aux trois écrans — décor à TROIS', () => {
    for (const cle of ['salon', 'bureau', 'cuisine'] as const) {
      const demarrerAvecEcran = vi.fn(async () => {});
      void demarrerPage(racineAvec({ piece: cle }), `https://ha/local/wallpanel/${cle}.html`,
                        { demarrer: vi.fn(async () => {}), demarrerAvecEcran });
      expect(demarrerAvecEcran.mock.calls[0][1]).toBe(ECRANS[cle]);
    }
  });

  it('ignore un data-piece qui ne nomme aucun écran connu', () => {
    const demarrer = vi.fn(async () => {});
    const demarrerAvecEcran = vi.fn(async () => {});
    void demarrerPage(racineAvec({ piece: 'grenier' }), 'https://ha/local/wallpanel/x.html',
                      { demarrer, demarrerAvecEcran });
    expect(demarrerAvecEcran).not.toHaveBeenCalled();
    expect(demarrer).toHaveBeenCalledWith(expect.anything(), '');
  });
});

describe('demarrerPage — ni l un ni l autre', () => {
  it('demande la liste quand rien n identifie l écran', () => {
    const demarrer = vi.fn(async () => {});
    void demarrerPage(racineAvec(), 'https://ha/local/wallpanel/index.html',
                      { demarrer, demarrerAvecEcran: vi.fn(async () => {}) });
    expect(demarrer).toHaveBeenCalledWith(expect.anything(), '');
  });

  it('traite ?ecran= vide comme absent', () => {
    const demarrer = vi.fn(async () => {});
    void demarrerPage(racineAvec(), 'https://ha/local/wallpanel/index.html?ecran=',
                      { demarrer, demarrerAvecEcran: vi.fn(async () => {}) });
    expect(demarrer).toHaveBeenCalledWith(expect.anything(), '');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm --prefix app test -- page`
Expected: FAIL — `Failed to resolve import "../src/page"`.

- [ ] **Step 3: Écrire `page.ts`**

```ts
/** Quel écran cette page doit-elle montrer ?
 *
 *  Séparé d'`index.ts` parce qu'`index.ts` s'exécute À L'IMPORT : l'importer, c'est le lancer.
 *  Une décision à trois branches dont l'une est TEMPORAIRE mérite mieux qu'un espoir. */
import { ECRANS } from './ecran';
import { demarrer as demarrerHA, demarrerAvecEcran as demarrerLitteral } from './demarrage';

export type DependancesPage = {
  demarrer: (racine: HTMLElement, nomEcran: string) => Promise<void>;
  demarrerAvecEcran: (racine: HTMLElement, piece: (typeof ECRANS)[keyof typeof ECRANS]) => Promise<void>;
};

/** Résout l'écran et démarre, dans cet ordre de priorité :
 *
 *  1. **`?ecran=<nom>`** → le transport websocket. C'est le chemin définitif. Le paramètre porte
 *     le `nom` de l'écran (« Cuisine »), que le composant apparie EXACTEMENT — jamais la clé de
 *     `ECRANS` (« cuisine »). Il gagne sur `data-piece` : pendant la migration, une page
 *     historique repointée porte les deux, et si le littéral gagnait, repointer une tablette ne
 *     changerait rien.
 *
 *  2. **`data-piece=<clé>` → `ECRANS[clé]`** — ⚠️ **BRANCHE DE TRANSITION, posée le 2026-09-13,
 *     à RETIRER à l'étape 8 de la mise en production (plan 3c), dans le même commit que les
 *     littéraux, l'outil d'export et les trois pages historiques.**
 *
 *     Elle existe pour une raison précise et mesurée : `hooks/install.py:107` remplace
 *     `www/wallpanel/` EN ENTIER et atomiquement (`replace_tree`), et les trois pages historiques
 *     chargent le MÊME `wallpanel.js`. Déposer le nouveau bundle bascule donc les trois tablettes
 *     d'un coup, quelle que soit leur URL — la granularité du retour arrière est le BUNDLE, pas
 *     la tablette. Sans cette branche, les étapes 5, 6 et 7 de la mise en production n'ont AUCUN
 *     retour arrière et la bascule devient unique.
 *
 *     Avec elle, remettre l'ancienne `startURL` fait charger la page historique, qui prend ce
 *     chemin-ci, qui lit le littéral : le comportement d'avant, octet pour octet, puisque c'est
 *     littéralement le même code.
 *
 *  3. **Rien** → la première dégradation : la liste des écrans configurés, tapable.
 */
export function demarrerPage(
  racine: HTMLElement, href: string, deps: Partial<DependancesPage> = {},
): Promise<void> {
  const demarrer = deps.demarrer ?? demarrerHA;
  const demarrerAvecEcran = deps.demarrerAvecEcran ?? demarrerLitteral;

  const nom = new URL(href).searchParams.get('ecran');
  if (nom) return demarrer(racine, nom);

  // --- BRANCHE DE TRANSITION, à retirer à l'étape 8 du plan 3c ---
  const cle = racine.dataset.piece as keyof typeof ECRANS | undefined;
  if (cle && cle in ECRANS) return demarrerAvecEcran(racine, ECRANS[cle]);
  // --- fin de la branche de transition ---

  return demarrer(racine, '');
}
```

- [ ] **Step 4: Réduire `index.ts`**

```ts
import './styles/jetons.css';
import './styles/base.css';
import { demarrerPage } from './page';

const racine = document.getElementById('app')!;

void demarrerPage(racine, location.href);
```

- [ ] **Step 5: Créer le gabarit de la page unique**

`app/gabarits/index.html` — **pas de `data-piece`** : l'identité vient de l'URL.

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Tablette murale</title>
<link rel="stylesheet" href="/local/wallpanel/wallpanel.css?v=@EMPREINTE@">
</head>
<body>
<div id="app" class="m3"></div>
<script src="/local/wallpanel/wallpanel.js?v=@EMPREINTE@"></script>
</body>
</html>
```

- [ ] **Step 6: Produire `index.html` en plus des trois pages**

Dans `app/scripts/generer-pages.mjs`, après la boucle existante (l. 32-37) — **ne touchez pas à la boucle** :

```js
/** La page unique de la spec du 2026-09-12 : l'identite vient de `?ecran=`, pas du fichier.
 *
 *  Produite EN PLUS des trois pages historiques, pas a leur place, pendant toute la duree de la
 *  migration : `hooks/install.py` remplace `www/wallpanel/` en entier, donc une page absente de
 *  `dist/` disparait de la cible au prochain depot. Les trois historiques ne partent qu a
 *  l'etape 8 de la mise en production (plan 3c), avec la branche de transition de `src/page.ts`.
 *
 *  Le nom de fichier est EXPLICITE, et ce n'est pas une coquetterie : `/local/wallpanel/`
 *  (le repertoire) rend 403. Home Assistant sert `/local/` par
 *  `CachingStaticResource`, qui sous-classe `StaticResource` d'aiohttp sans toucher au
 *  traitement des repertoires ; `show_index` vaut False par defaut et
 *  `_resolve_path_to_response` leve alors `HTTPForbidden`. aiohttp ne sert JAMAIS `index.html`
 *  implicitement. La `startURL` des tablettes est donc
 *  `/local/wallpanel/index.html?ecran=<nom>`.
 */
const GABARIT_UNIQUE = join(ICI, '..', 'gabarits', 'index.html');
writeFileSync(join(SORTIE, 'index.html'), readFileSync(GABARIT_UNIQUE, 'utf8'));
console.log(`page unique : index.html -> ${SORTIE}`);
```

`scripts/versionner.mjs` n'a **rien** à apprendre : il parcourt déjà tous les `.html` de `dist/` (`readdirSync(SORTIE).filter((x) => x.endsWith('.html'))`) et remplace `@EMPREINTE@`. Vérifiez-le après le build.

- [ ] **Step 7: Apprendre la nouvelle URL à `verifier-rendu.mjs`, SANS désapprendre l'ancienne**

Cinq sites de navigation, mesurés : **l. 1832, 2257-2258, 2779, 2971, 4116**. Ajoutez une aide près du haut du fichier et faites passer les cinq par elle :

```js
/** L'URL d'une piece. Deux formes coexistent pendant la migration (plan 3b/3c) :
 *   - historique : `/local/wallpanel/<cle>.html`, la page qui lit `data-piece` ;
 *   - neuve : `/local/wallpanel/index.html?ecran=<nom>`, celle qui interroge Home Assistant.
 *  Le verificateur doit savoir verifier LES DEUX tant que les deux sont servies — verifier
 *  seulement la neuve laisserait le retour arriere des etapes 5 a 7 sans controle, et c'est
 *  precisement ce retour arriere qui justifie la branche de transition. */
const FORME_URL = process.env.WALLPANEL_URL === 'ecran' ? 'ecran' : 'historique';
const NOM_ECRAN = { salon: 'Salon', bureau: 'Bureau', cuisine: 'Cuisine' };
function urlPiece(cle, requete = '') {
  if (FORME_URL === 'ecran') {
    const sep = requete.startsWith('?') ? '&' : requete ? '&' : '';
    return `${HA_URL}/local/wallpanel/index.html?ecran=${encodeURIComponent(NOM_ECRAN[cle] ?? cle)}`
      + (requete ? sep + requete.replace(/^\?/, '') : '');
  }
  return `${HA_URL}/local/wallpanel/${cle}.html${requete}`;
}
```

Remplacez les cinq navigations par `await page.goto(urlPiece(piece, `${essai}${vue.hash}`), …)` et équivalents. **Ne retirez aucune des formes existantes** : par défaut le comportement est identique à aujourd'hui, et `WALLPANEL_URL=ecran` bascule sur la forme neuve.

- [ ] **Step 8: Construire, lancer les suites, et committer AVANT `make test`**

⚠️ **Piège mesuré** : `tests/test_dist_a_jour.py` relance `npm run build` et compare à **HEAD commité**. Lancer `make test` sur un `dist/` reconstruit mais non committé le fait échouer.

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
npm --prefix app run build
ls dist/*.html                    # attendu : index.html, salon.html, bureau.html, cuisine.html
grep -c '@EMPREINTE@' dist/index.html   # attendu : 0 (versionner.mjs a fait son travail)
grep -c 'data-piece' dist/index.html    # attendu : 0
npm --prefix app test             # attendu : 51 fichiers, 1104 tests
npx --prefix app tsc --noEmit -p app/tsconfig.json
wc -l app/src/demarrage.ts        # attendu : inchangé depuis T5, et < 1914 + ce que T4/T5 ont ajouté
git add -A
git commit -m "feat(app): index.html unique avec ?ecran=, et la branche de transition datee

dist/ porte desormais QUATRE HTML : index.html plus les trois pages
historiques. Il ne passera a un qu a l etape 8 de la mise en production
(plan 3c). La spec d origine croyait que les pages deja en production
survivraient d elles-memes a la bascule : c est faux, replace_tree()
remplace www/wallpanel/ en entier.

L URL NOMME LE FICHIER -- /local/wallpanel/index.html?ecran=<nom> -- et
ce n est pas une coquetterie : /local/wallpanel/ rend 403. Mesure dans
les sources installees : HomeAssistantHTTP construit la ressource avec
(url_path, path) et rien d autre, show_index vaut False par defaut, et
StaticResource._resolve_path_to_response leve HTTPForbidden sur un
repertoire. aiohttp ne sert JAMAIS index.html implicitement, sur aucune
des versions presentes.

?ecran= porte le NOM (« Cuisine »), jamais la cle de ECRANS
(« cuisine ») : _trouver apparie exactement.

La branche data-piece est DATEE et son retrait est nomme dans sa propre
docstring. Elle existe pour rendre reel le retour arriere des etapes 5
a 7 : remettre l ancienne startURL fait charger la page historique, qui
lit le litteral -- le comportement d avant, octet pour octet, puisque
c est le meme code.

La resolution part dans src/page.ts parce qu index.ts s execute a
l import : un module a effets de bord de premier niveau ne se teste pas,
et une branche temporaire merite mieux qu un espoir.

verifier-rendu.mjs apprend la forme neuve SANS desapprendre l ancienne
(WALLPANEL_URL=ecran) : verifier seulement la neuve laisserait sans
controle le retour arriere qui justifie la branche.

vitest 51 fichiers / 1104 tests, make test 5/5.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
make test
```

`make test` doit rendre **5/5** — y compris `test_dist_a_jour`, puisque `dist/` est maintenant committé.

- [ ] **Step 9: Jouer les mutations**

| Mutation | Test qui doit tomber |
|---|---|
| inverser l'ordre : `data-piece` testé avant `?ecran=` | « gagne sur data-piece quand les deux sont présents » |
| `if (nom)` → `if (nom !== null)` | « traite ?ecran= vide comme absent » |
| `cle in ECRANS` retiré | « ignore un data-piece qui ne nomme aucun écran connu » |
| retirer la branche `data-piece` entière | les quatre tests de transition |

---

### Task 7: Les trois champs manquants, l'avertissement d'entité inconnue, et les seize relais

**Files:**
- Create: `custom_components/home_desk/registre.py`
- Modify: `custom_components/home_desk/config_flow.py` — **500/500 lignes, marge ZÉRO**
- Modify: `custom_components/home_desk/translations/fr.json` et `en.json`
- Test: `tests/composant/test_registre.py`, `tests/composant/test_config_flow.py` (étendu)

C'est la **seule tâche Python** du plan. Elle ne dépend d'aucune autre et pourrait être faite en premier.

**L'ordre à l'intérieur de la tâche est contraint :** `config_flow.py` est à **500 lignes sur 500**, et une section « liste » de plus coûte **exactement 10 lignes de relais → 501**. La généralisation des seize relais vient donc **avant** l'ajout des champs, dans la même tâche, sinon le fichier viole l'accord de travail en cours de route.

- [ ] **Step 1: Écrire le test des relais génériques**

Ajoutez à `tests/composant/test_config_flow.py` :

```python
def test_les_seize_relais_de_section_sont_rendus_generiquement():
    """Les 8 sections x 2 steps que `listes.SectionsListeMixin` exige.

    Home Assistant appelle un step PAR SON NOM (`getattr(flow,
    f"async_step_{step_id}")`), donc on ne peut pas s'en passer -- mais on
    peut les rendre generiques. Ce test garde la CAPACITE (« chaque section
    a ses deux steps, et ils delеguent au bon squelette »), jamais des noms
    de methode recopies : un test qui listerait seize noms passerait encore
    si les seize relais ne faisaient plus rien.
    """
    flow = EcranSubentryFlow()
    for section in SECTIONS:
        for suffixe in ("", "_element"):
            nom = f"async_step_{section}{suffixe}"
            assert hasattr(flow, nom), f"{nom} absent"
            assert callable(getattr(flow, nom))


def test_getattr_ne_fabrique_PAS_un_step_pour_n_importe_quoi():
    """LA garde de ce mecanisme, et la seule qui compte.

    `_raise_if_step_does_not_exist` de Home Assistant repose sur `hasattr`.
    Un `__getattr__` qui rendrait quelque chose pour tout nom ferait croire
    a HA que TOUS les steps existent : une faute de frappe dans un
    `async_step_id` ne leverait plus `UnknownStep` mais partirait dans un
    squelette de section inexistante, et le formulaire casserait plus loin,
    ailleurs, sans rapport visible avec la cause.
    """
    flow = EcranSubentryFlow()
    for absent in (
        "async_step_section_qui_n_existe_pas",
        "async_step_commandes_elementaire",
        "async_step_",
        "attribut_quelconque",
        "_async_step_section",     # existe deja : ne doit PAS passer par __getattr__
    ):
        if absent == "_async_step_section":
            assert hasattr(flow, absent)   # vrai attribut, resolu normalement
            continue
        assert not hasattr(flow, absent), f"{absent} ne devrait pas exister"


def test_un_relais_delegue_au_squelette_avec_SA_section(monkeypatch):
    """Capacite, pas nom : on verifie que `async_step_ambiances` passe bien
    « ambiances » et pas « commandes ». Decor a DEUX sections -- avec une
    seule, un relais qui passerait toujours la meme section passerait."""
    vus = []
    flow = EcranSubentryFlow()
    monkeypatch.setattr(
        EcranSubentryFlow, "_async_step_section",
        lambda self, section, user_input=None: vus.append(section),
    )
    flow.async_step_ambiances()
    flow.async_step_commandes()
    assert vus == ["ambiances", "commandes"]
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `make test-composant PYTHON=/root/.local/share/uv/python/cpython-3.14.3-linux-x86_64-gnu/bin/python3.14`
Expected: `test_getattr_ne_fabrique_PAS_un_step_pour_n_importe_quoi` échoue — pour l'instant `hasattr` rend déjà `False`, donc c'est le SEUL qui passe ; les deux autres passent aussi avec les relais écrits à la main. **C'est normal** : ce test-ci est un filet posé AVANT la refonte, pour prouver qu'elle ne casse rien. Notez le compte de départ : **212**.

- [ ] **Step 3: Remplacer les seize relais par un `__getattr__`**

Dans `config_flow.py`, supprimez les seize méthodes (l. 419-500) et le commentaire qui les introduit (l. 412-418), puis posez à leur place :

```python
    def __getattr__(self, nom: str) -> Any:
        """Les SEIZE relais (8 sections x 2 steps) qu'exige
        `listes.SectionsListeMixin`, rendus generiques.

        Home Assistant appelle un step PAR SON NOM
        (`getattr(flow, f"async_step_{step_id}")`, `data_entry_flow.py`) et
        verifie son existence par `hasattr` : il faut donc que ces noms
        repondent, mais rien n'oblige a les ECRIRE. Seize methodes d'un
        appel chacune coutaient 82 lignes dans un fichier qui plafonne a
        500, et toute section « liste » supplementaire en coutait dix de
        plus -- la neuvieme faisait franchir le plafond.

        `__getattr__` n'est appele QUE si la recherche normale echoue : les
        vraies methodes (`async_step_user`, `async_step_identite`,
        `_async_step_section`...) gagnent toujours.

        CE QUI COMPTE ICI, c'est le `raise AttributeError` final. Sans lui,
        `hasattr` rendrait vrai pour N'IMPORTE QUEL nom, et
        `_raise_if_step_does_not_exist` cesserait de proteger : une faute de
        frappe dans un identifiant de step ne leverait plus `UnknownStep`,
        elle partirait dans le squelette d'une section inexistante et
        casserait plus loin, ailleurs, sans rapport visible avec sa cause.
        """
        if nom.startswith("async_step_"):
            reste = nom.removeprefix("async_step_")
            if reste.endswith("_element"):
                section = reste.removesuffix("_element")
                if section in SECTIONS:
                    return partial(self._async_step_section_element, section)
            elif reste in SECTIONS:
                return partial(self._async_step_section, reste)
        raise AttributeError(nom)
```

Ajoutez `from functools import partial` aux imports.

- [ ] **Step 4: Vérifier que la refonte n'a rien cassé**

Run: `make test-composant PYTHON=/root/.local/share/uv/python/cpython-3.14.3-linux-x86_64-gnu/bin/python3.14`
Expected: **215 passed** (212 + 3). Aucun test existant ne tombe.

```bash
wc -l custom_components/home_desk/config_flow.py   # attendu : ~430, la marge est revenue
```

- [ ] **Step 5: Ajouter les trois champs de saisie**

Étendez `SCHEMA_IDENTITE` (l. 160-177) avec `aspirateur` et `delorean` :

```python
        # Plan 3b : deux des quatre champs racine qui n'avaient AUCUNE porte
        # de saisie (spec amendee du 2026-09-13). Les trois ecrans reels les
        # portent et ils survivaient a toute edition, mais on ne pouvait ni
        # les creer ni les modifier depuis Home Assistant -- une reponse
        # partielle a « parametrer l'affichage de chaque tablette depuis HA ».
        # Optionnels tous les deux : le contrat les porte `Optional`, et deux
        # des trois ecrans reels n'ont pas d'aspirateur.
        vol.Optional("aspirateur"): selector.EntitySelector(
            selector.EntitySelectorConfig()
        ),
        # `delorean` est `const: true` au contrat : une case a cocher, jamais
        # un champ libre. Decochee, la cle est RETIREE plutot qu'ecrite a
        # False -- `const: true` refuse False.
        vol.Optional("delorean"): bool,
```

Ajoutez `listesTachesExtra` à `listes_champs.SECTIONS`, sur le modèle **exact** de `ouvrants` (une liste d'entités). Grâce au `__getattr__`, **aucun relais à écrire**.

- [ ] **Step 6: Écrire `registre.py` et son test**

Créez `tests/composant/test_registre.py` :

```python
"""Le registre d'entites : ce que le formulaire sait dire d'une entite qu'il
ne connait pas."""
from homeassistant.helpers import entity_registry as er

from custom_components.home_desk.registre import entites_inconnues


async def test_une_entite_absente_du_registre_donne_un_AVERTISSEMENT_jamais_un_refus(hass):
    """Decision 7 de la spec, jamais tenue jusqu'ici.

    Mesure de la relecture finale du plan 3a : `light.nexiste_absolument_pas`
    etait accepte avec `errors={}` ET `description_placeholders={}` -- du
    SILENCE, pas un avertissement. Or une entite peut arriver plus tard
    (ampoule pas encore appairee), donc refuser serait faux ; ne rien dire
    laisse une faute de frappe produire une tuile morte que personne ne
    relie jamais a sa cause.
    """
    inconnues = entites_inconnues(hass, ["light.nexiste_absolument_pas"])
    assert inconnues == ["light.nexiste_absolument_pas"]


async def test_une_entite_presente_au_registre_ne_produit_aucun_avertissement(hass):
    # `tests/composant/conftest.py` n'offre AUCUNE fixture de registre (verifie) :
    # on passe par l'aide standard de Home Assistant.
    registre = er.async_get(hass)
    registre.async_get_or_create("light", "demo", "unique1",
                                 suggested_object_id="salon")
    assert entites_inconnues(hass, ["light.salon"]) == []


async def test_le_decor_a_DEUX_entites_distingue_la_connue_de_l_inconnue(hass):
    """Leçon 3 : avec une seule entite au decor, une implementation qui
    rendrait TOUJOURS la liste complete -- ou TOUJOURS vide -- passerait."""
    registre = er.async_get(hass)
    registre.async_get_or_create("light", "demo", "u1", suggested_object_id="salon")
    assert entites_inconnues(hass, ["light.salon", "light.grenier"]) == ["light.grenier"]


async def test_entites_inconnues_preserve_l_ordre_de_saisie(hass):
    """Le message les cite dans l'ordre ou l'utilisateur les a tapees, jamais
    dans un ordre de hachage qui changerait d'une saisie a l'autre -- un
    avertissement dont le texte bouge tout seul se fait ignorer."""
    entites = ["light.zzz", "light.aaa", "light.mmm"]
    assert entites_inconnues(hass, entites) == entites


async def test_une_entite_connue_de_l_ETAT_mais_absente_du_registre_n_avertit_pas(hass):
    """Un `input_*` cree en YAML ou une entite de template repond sans etre au
    registre. Avertir sur une entite qui repond DEJA serait un avertissement
    faux -- et un avertissement faux se fait ignorer, ce qui tue aussi les
    vrais."""
    hass.states.async_set("sensor.template_maison", "21.5")
    assert entites_inconnues(hass, ["sensor.template_maison"]) == []
```

Et dans `tests/composant/test_config_flow.py`, le test qui epingle la
difference LA OU ELLE SE JOUE — sur le patron exact des tests existants
(`test_un_ecran_qui_deborde_est_REFUSE_avec_son_chiffre`) :

```python
async def test_une_entite_inconnue_AVERTIT_au_lieu_de_REFUSER(hass, entree):
    """Decision 7 de la spec, jamais tenue avant ce plan.

    Mesure de la relecture finale du plan 3a :
    `light.nexiste_absolument_pas` etait accepte avec `errors={}` ET
    `description_placeholders={}` -- du SILENCE, pas un avertissement.

    Decor a DEUX entites (lecon 3) : une CONNUE du registre, une inconnue.
    Avec une seule, une implementation qui avertirait sur TOUT -- ou sur
    RIEN -- passerait sans qu'on s'en apercoive.
    """
    er.async_get(hass).async_get_or_create(
        "sensor", "demo", "u1", suggested_object_id="temperature_salon")

    flow = await hass.config_entries.subentries.async_init(
        (entree.entry_id, SOUS_ENTREE_ECRAN),
        context={"source": config_entries.SOURCE_USER})
    resultat = await hass.config_entries.subentries.async_configure(
        flow["flow_id"],
        {**IDENTITE_MINIMALE,
         "temperature": "sensor.temperature_salon",
         "aspirateur": "vacuum.nexiste_absolument_pas"})

    # ACCEPTE : le flow AVANCE. Une entite peut arriver plus tard -- une
    # ampoule pas encore appairee, une integration pas encore chargee --,
    # donc refuser interdirait de preparer un ecran avant son materiel.
    assert resultat["type"] is data_entry_flow.FlowResultType.MENU
    assert resultat.get("errors", {}) == {}

    # ET AVERTIT. La difference entre un avertissement et un refus ne se joue
    # PAS dans le texte mais ici, dans le couple (type de resultat, errors) :
    # un test qui ne regarderait que la phrase laisserait un refus passer
    # pour un avertissement.
    placeholders = str(resultat["description_placeholders"])
    assert "vacuum.nexiste_absolument_pas" in placeholders
    # Et il ne cite QUE l'inconnue : citer l'entite connue ferait du bruit
    # que personne ne lirait plus au bout de deux saisies.
    assert "sensor.temperature_salon" not in placeholders
```

Créez `custom_components/home_desk/registre.py` :

```python
"""Lecture du registre d'entites de Home Assistant.

Decision 7 de la spec : une entite inconnue du registre donne un
AVERTISSEMENT, jamais un refus -- elle peut arriver plus tard (une ampoule
pas encore appairee, un capteur dont l'integration n'est pas encore
chargee). Refuser interdirait de preparer un ecran avant que son materiel
existe ; ne rien dire laisse une faute de frappe produire une tuile morte
que personne ne relie jamais a sa cause.

Module a part, et pas une fonction de plus dans `config_flow.py` : c'est la
SEULE dependance de ce composant au registre d'entites, et `config_flow.py`
plafonne a 500 lignes.
"""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er


def entites_inconnues(hass: HomeAssistant, entites: list[str]) -> list[str]:
    """Celles des `entites` qu'aucune entree du registre ne porte.

    L'ordre d'entree est preserve : le message d'avertissement les cite dans
    l'ordre ou l'utilisateur les a saisies, jamais dans un ordre de hachage
    qui changerait d'une saisie a l'autre.

    Une entite peut exister dans l'ETAT sans etre au registre (un
    `input_*` cree en YAML, un template). On interroge donc AUSSI
    `hass.states` : avertir sur une entite qui repond deja serait un
    avertissement faux, et un avertissement faux se fait ignorer, ce qui tue
    aussi les vrais.
    """
    registre = er.async_get(hass)
    return [
        e for e in entites
        if registre.async_get(e) is None and hass.states.get(e) is None
    ]
```

Câblez-le dans `_valider_identite` et dans le squelette des sections : l'appel remplit `description_placeholders["entites_inconnues"]` et **ne touche jamais à `errors`**. Ajoutez la clé aux deux fichiers de traduction.

- [ ] **Step 7: Lancer les suites et committer**

Run: `make test-composant PYTHON=/root/.local/share/uv/python/cpython-3.14.3-linux-x86_64-gnu/bin/python3.14`
Expected: **~227 passed**.

Run: `make test` → 5/5. Run: `npm --prefix app test` → inchangé (aucune modification côté application).

```bash
wc -l custom_components/home_desk/config_flow.py   # attendu : < 500, avec de la marge
git add -A && git commit -m "feat(composant): trois champs de saisie, avertissement d entite inconnue, seize relais generiques

L ordre a l interieur de cette tache est CONTRAINT : config_flow.py etait
a 500 lignes sur 500, et une section « liste » de plus coute exactement
dix lignes de relais -> 501. La generalisation vient donc avant l ajout.

Les seize relais deviennent un __getattr__. Ce qui compte dans ce
mecanisme, c est le raise AttributeError final : sans lui hasattr rendrait
vrai pour n importe quel nom et _raise_if_step_does_not_exist cesserait de
proteger -- une faute de frappe dans un identifiant de step ne leverait
plus UnknownStep, elle partirait dans le squelette d une section
inexistante et casserait ailleurs, sans rapport visible avec sa cause.
C est cette CAPACITE que le test garde, jamais seize noms recopies.

aspirateur, delorean et listesTachesExtra gagnent une porte de saisie.
Trois des quatre champs racine qui n en avaient aucune : les ecrans reels
les portaient et ils survivaient a toute edition, mais on ne pouvait ni
les creer ni les modifier depuis HA. aspirateurMaison reste au plan 3c :
son vrai blocage est le litteral 'vacuum.aspirateur_cuisine' ecrit en dur
dans rendu/maison.ts, et le rendre editable avant de traiter ce litteral
livrerait un bouton a demi mort.

La decision 7 est enfin tenue. Mesure de la relecture finale du plan 3a :
light.nexiste_absolument_pas etait accepte avec errors={} ET
description_placeholders={} -- du SILENCE, pas un avertissement. Le test
epingle la difference LA OU ELLE SE JOUE : errors vide,
description_placeholders rempli. Un test qui ne regarderait que le texte
laisserait un refus passer pour un avertissement.

make test-composant 212 -> 227.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Mesurer les 49 ordres de zones — une dette qu'on chiffre, pas qu'on répare

**Files:**
- Test: `app/tests/zones-ordres.test.ts`

**La dette (plan 2, n°2) :** « le budget sait chiffrer un ordre de zones que le moteur d'animation n'a pas été mesuré pour rendre ». Comptés au schéma le 2026-09-13 : **49 ordres valides** (`uniqueItems`, `commandes` obligatoire — 1 à un élément, 6 à deux, 18 à trois, 24 à quatre). Les trois écrans réels en utilisent **un seul** : `['ambiances', 'commandes', 'blocCentral', 'synthese']`, identique pour les trois.

**Ce qu'on fait, et ce qu'on ne fait pas.** On **mesure** et on **rapporte**. On ne corrige que ce qui casse. Si rien ne casse, la dette se raye avec un chiffre. « Une lacune sans risque se nomme, elle ne se cloue pas. »

**Déviation assumée par rapport à la consigne d'origine**, qui disait de passer les 49 ordres dans `verifier-rendu.mjs` : cet outil fait 4621 lignes, exige Playwright et un Home Assistant joignable, et ne tourne pas en intégration continue. Un test vitest monte le vrai `demarrerAvecEcran` sur un DOM jsdom, traverse la table `ZONES` de `rendu/corps.ts` et le moteur de peinture — c'est-à-dire exactement le chemin que la dette met en doute — et il **reste** vert après le plan. `verifier-rendu.mjs` garde son rôle : le contrôle VISUEL de l'unique ordre réellement servi.

- [ ] **Step 1: Écrire la mesure**

Créez `app/tests/zones-ordres.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { monterDemarrage, ecranVide } from './aides';

// ⚠️ `ecranVide` est une CONSTANTE (`aides.ts:14`), pas une fabrique : on en dérive.
const avecZones = (zones: string[]) =>
  ({ ...ecranVide, agencement: { ...ecranVide.agencement, zones } });

/** Les 49 ordres que le contrat autorise : toute permutation non vide et sans répétition des
 *  quatre zones qui contient `commandes`. Générés, jamais recopiés — une liste écrite à la main
 *  finirait par diverger du schéma sans que rien ne le dise. */
function tousLesOrdres(): string[][] {
  const zones = ['synthese', 'blocCentral', 'ambiances', 'commandes'];
  const sortie: string[][] = [];
  const marcher = (choisis: string[], restants: string[]) => {
    if (choisis.length > 0 && choisis.includes('commandes')) sortie.push([...choisis]);
    for (let i = 0; i < restants.length; i++) {
      marcher([...choisis, restants[i]],
              [...restants.slice(0, i), ...restants.slice(i + 1)]);
    }
  };
  marcher([], zones);
  return sortie;
}

describe('les 49 ordres de zones que le contrat autorise', () => {
  it('en compte exactement 49 — le contrat n a pas bougé sous nos pieds', () => {
    expect(tousLesOrdres()).toHaveLength(49);
  });

  it('se rendent tous sans lever, et aucun ne laisse #app vide', async () => {
    // LA MESURE. Le budget sait chiffrer ces 49 ordres ; le moteur n'a jamais été mesuré
    // pour les rendre. Les trois écrans réels n'en utilisent qu'un — mais ils sont
    // désormais éditables depuis Home Assistant, donc les 48 autres sont ATTEIGNABLES.
    const echecs: { ordre: string[]; erreur: string }[] = [];
    for (const zones of tousLesOrdres()) {
      const ecran = avecZones(zones);
      try {
        const m = await monterDemarrage(ecran as any);
        if (m.racine.textContent!.trim() === '') {
          echecs.push({ ordre: zones, erreur: '#app vide' });
        }
      } catch (e) {
        echecs.push({ ordre: zones, erreur: String(e) });
      }
    }
    // Si ce tableau n'est pas vide, LISEZ-LE : il nomme exactement quels ordres cassent, et
    // c'est le rapport que cette tâche devait produire. Ne le neutralisez pas — corrigez ce
    // qui casse, ou déclarez la restriction DANS LE CONTRAT pour que le formulaire cesse de
    // l'offrir.
    expect(echecs).toEqual([]);
  });

  it("rend l'ordre des trois écrans réels, celui qui est réellement servi", async () => {
    const ecran = avecZones(['ambiances', 'commandes', 'blocCentral', 'synthese']);
    const m = await monterDemarrage(ecran as any);
    expect(m.racine.textContent!.trim()).not.toBe('');
  });
});
```

- [ ] **Step 2: Lancer la mesure et RAPPORTER**

Run: `npm --prefix app test -- zones-ordres`

**Deux issues, et les deux sont des succès de cette tâche :**

- **Tout passe** → la dette se raye avec un chiffre. Retirez-la du plan 2 et écrivez dans `CLAUDE.md` : « les 49 ordres de zones du contrat rendent tous, mesuré le \<date\>, gardé par `app/tests/zones-ordres.test.ts` ».
- **Certains cassent** → le tableau `echecs` les nomme. Corrigez **uniquement** ceux-là, ou restreignez le contrat pour que le formulaire cesse d'offrir un ordre irrendable. Dans les deux cas, dites lesquels et pourquoi dans le message de commit. **Ne neutralisez jamais l'assertion pour faire passer la suite** : ce serait transformer la mesure en décor.

- [ ] **Step 3: Committer**

```bash
cd /home/mallanic/Projects/Nivuus/packages/home-desk
git add app/tests/zones-ordres.test.ts CLAUDE.md docs/superpowers/plans/2026-09-12-agencement-donnee.md
git commit -m "test(app): les 49 ordres de zones du contrat sont mesures

Dette n.2 du plan 2 : « le budget sait chiffrer un ordre de zones que le
moteur d animation n a pas ete mesure pour rendre ». On MESURE, on ne
repare pas -- une lacune sans risque se nomme, elle ne se cloue pas.

49 ordres valides au contrat (uniqueItems, commandes obligatoire) ; les
trois ecrans reels en utilisent UN. Depuis que l agencement s edite
depuis Home Assistant, les 48 autres sont ATTEIGNABLES : c est ce qui
transforme une curiosite en dette.

Les ordres sont GENERES depuis les quatre zones, jamais recopies : une
liste ecrite a la main finirait par diverger du schema sans que rien ne
le dise.

Mesure faite par vitest et non par verifier-rendu.mjs : cet outil fait
4621 lignes, exige Playwright et un HA joignable, et ne tourne pas en
integration continue. Le test monte le vrai demarrerAvecEcran, traverse
la table ZONES de rendu/corps.ts et le moteur de peinture -- exactement
le chemin que la dette met en doute -- et il RESTE vert.
verifier-rendu.mjs garde le controle visuel de l unique ordre servi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Ce que 3b NE fait pas, et qui attend 3c

À relire avant d'ouvrir le plan suivant :

- **Les littéraux `ECRANS` restent dans le dépôt.** Leur retrait est la charge utile de l'étape 8 de la mise en production, jamais une tâche qu'on exécute avant d'avoir vécu avec le transport en production.
- **La branche de transition `data-piece` reste**, et son retrait est nommé dans sa propre docstring.
- **`aspirateurMaison` n'a toujours pas de porte de saisie** : son blocage est le littéral `'vacuum.aspirateur_cuisine'` de `rendu/maison.ts:79`, qui appartient au lot de portabilité de 3c.
- **Les quinze `entity_id` hors d'`ecran.ts` restent**, et aucune garde ne les cherche : `tests/test_dist_portable.py` ne scanne ni `app/`, ni les IP des tablettes.
- **`app/src/demarrage.ts` fait `wc -l` = 2022 lignes** (mesuré en relecture finale de branche ; base `main` = 1914), pour un plafond de 500. **Correction : l'affirmation « 3b ne l'a pas aggravé » était fausse des deux côtés** — 3b l'a fait grossir de **+108 lignes** (la nouvelle `demarrer()`, ~96 lignes), et ne lui a PAS retiré de fonctions. La couture existait bien dans la branche : la tâche 6 a créé `app/src/page.ts`, un module NEUF, pour la même préoccupation « résoudre quel écran montrer » — mais sans réduire `demarrage.ts` lui-même. La découpe de `demarrage.ts` reste un chantier à soi seul, et le bâcler en fin de plan serait la faute que ce dépôt a payée douze fois — ne pas le refactorer ici en fait partie.
- **`fully_kiosk.set_config` accepte-t-il la clé `startURL` sur cette instance ?** La spec l'affirme, mesuré le 2026-09-12, et **tout le retour arrière des étapes 5 et 7 en dépend**. C'est la première chose à re-mesurer quand 3c s'ouvrira.
- **`?ecran=` exige la CASSE EXACTE du nom de l'écran** (`websocket.py` apparie `data["nom"]` littéralement, sans normalisation) : `Salon`, `Bureau`, `Cuisine` — jamais `salon`/`bureau`/`cuisine` en minuscules, la casse que `app/src/ecran.ts` porte réellement. Une URL en minuscules rend `not_found` (pas `ecran_introuvable` — voir la spec, corrigée en relecture finale de branche) et la tablette affiche le sélecteur au lieu de l'écran visé. Ce piège n'était nommé qu'à la ligne ~860 de ce document avant cette ronde ; il l'est maintenant ici, dans la section que 3c lit en premier.
