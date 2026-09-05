# Bandeau — mise en page et hiérarchie : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supprimer le décalage en « L » du bandeau des tablettes murales en alignant le pied de ses deux colonnes, et introduire un accent de couleur sur les trois températures affichées.

**Architecture:** Le rendu (`src/rendu/bandeau.ts`) regroupe heure et date dans un conteneur pour que chaque colonne n'ait plus que deux enfants ; `base.css` étire les colonnes et les répartit en `space-between`, ce qui aligne leurs pieds sans toucher à une seule taille de texte. L'accent est un jeton CSS local à `.cap`, inversé entre palette claire et sombre. Le fragment coloré de la pastille est **porté par la donnée** (`Pastille.accent`, posé par `agenda.ts`) et jamais déduit d'une forme au rendu.

**Tech Stack:** TypeScript, `lit` (templates `html`), CSS pur, vitest + jsdom, rollup. Vérificateur maison Playwright (`outils/verifier-rendu.mjs`).

**Spec:** `docs/superpowers/specs/2026-08-06-bandeau-mise-en-page-design.md`

## Global Constraints

- **Toujours travailler depuis `tools/wallpanel-app`**, jamais depuis la racine du dépôt HA.
- **Français partout à l'écran** — aucun jeton anglais brut visible.
- **Cadre 343 × 585 px, marge nulle.** La hauteur totale ne doit jamais dépasser 585 px.
- **Cibles tactiles ≥ 62 px, contraste texte/fond ≥ 5:1** — vérifiés automatiquement par `outils/verifier-rendu.mjs`.
- **Jamais de couleur en dur** : uniquement les jetons `--md-*` de `src/styles/jetons.css`.
- **Moteur des tablettes Fire = Chrome 100** : pas de `dvh`, pas de syntaxe CSS récente.
- **`npm run build` DÉPLOIE en production** (écrit dans `config/www/wallpanel/`). Ne jamais le lancer avant que `npm test` et `outils/verifier-rendu.mjs` soient verts.
- **jsdom ne calcule aucune mise en page** : aucun test unitaire ne peut valider une hauteur, un alignement ou un contraste. Ces trois points relèvent exclusivement du vérificateur.
- Commandes shell : ce serveur a un profil zsh cassé — préfixer par `/bin/bash -c "…"`.

---

### Task 1: `temperatureCourte` — une source unique pour le format de température

Ce format est aujourd'hui écrit deux fois (`meteo.ts:27` et `agenda.ts:131`). Les tâches suivantes ont besoin que le préfixe coloré soit **exactement** le début de la valeur affichée ; l'extraire ici rend cette égalité vraie par construction.

**Files:**
- Modify: `src/meteo.ts:25-30`
- Test: `tests/meteo.test.ts`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: `export function temperatureCourte(temperature: number): string` — rend `` `${Math.round(temperature)}°` ``. Consommée par la tâche 2 (`agenda.ts`).

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `tests/meteo.test.ts`, et compléter l'import de la première ligne d'import :

```ts
import { phraseDemain, temperatureCourte } from '../src/meteo';
```

```ts
describe('temperatureCourte', () => {
  it('arrondit au plus proche et suffixe le degré', () => {
    expect(temperatureCourte(29.9)).toBe('30°');
    expect(temperatureCourte(29.4)).toBe('29°');
    expect(temperatureCourte(-3.6)).toBe('-4°');
  });

  // `Math.round(-0.4)` vaut `-0` en JavaScript. Sans ce cas, un futur passage par un formateur
  // qui distingue -0 de 0 afficherait « -0° » sur le mur sans que rien ne rougisse.
  it('n\'affiche jamais un zéro négatif', () => {
    expect(temperatureCourte(-0.4)).toBe('0°');
  });

  // LE CONTRAT dont dépend l'accent coloré de la pastille (`Pastille.accent`, tâche 2, puis le
  // garde `startsWith` de `bandeau.ts`, tâche 5) : si `phraseDemain` cessait un jour de commencer
  // par cette température, l'accent serait posé sur le mauvais fragment. Ce test est le seul
  // endroit où cette dépendance est vérifiée.
  it('est le préfixe exact de phraseDemain', () => {
    const prev = p('00', 'sunny', 29.9, 0) as any;
    expect(phraseDemain(prev).startsWith(temperatureCourte(prev.temperature))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/bin/bash -c "npm test -- meteo"`
Expected: FAIL — `temperatureCourte is not a function` (ou une erreur de compilation TypeScript sur l'import).

- [ ] **Step 3: Write minimal implementation**

Dans `src/meteo.ts`, remplacer le bloc `phraseDemain` (lignes 25-30) par :

```ts
/** Le format d'affichage d'une température, à un seul endroit. `phraseDemain` ci-dessous et les
 *  deux branches météo de `pastilleBandeau` (`agenda.ts`) le partagent — c'est ce partage, et lui
 *  seul, qui garantit que `Pastille.accent` est le préfixe EXACT de `Pastille.valeur`, jamais par
 *  coïncidence de formatage. Prend un `number` et non une `Prevision` : `prochainChangement`
 *  (`agenda.ts`) ne rend que `{ jour, condition, temperature }` et devrait sinon fabriquer une
 *  fausse prévision pour appeler cette fonction. */
export function temperatureCourte(temperature: number): string {
  return `${Math.round(temperature)}°`;
}

export function phraseDemain(p: Prevision | undefined): string {
  if (!p) return '';
  const quoi = (p.precipitation ?? 0) > 0.2 ? 'de la pluie' : texteCondition(p.condition);
  return `${temperatureCourte(p.temperature)} et ${quoi}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/bin/bash -c "npm test -- meteo"`
Expected: PASS — y compris les tests `phraseDemain` préexistants, inchangés.

- [ ] **Step 5: Commit**

```bash
/bin/bash -c "git add src/meteo.ts tests/meteo.test.ts && git commit -m 'Extrait temperatureCourte : une seule source pour le format de température'"
```

---

### Task 2: `Pastille.accent` — le fragment à colorer, porté par la donnée

`pastilleBandeau` a quatre branches ; deux seulement contiennent une température. Le rendu ne doit jamais deviner laquelle par la forme du texte.

**Files:**
- Modify: `src/agenda.ts:16` (le type), `src/agenda.ts:127-141` (les deux branches météo), et l'import de `./meteo` en tête de fichier
- Test: `tests/agenda.test.ts`

**Interfaces:**
- Consumes: `temperatureCourte(temperature: number): string` de la tâche 1.
- Produces: `export type Pastille = { etiquette: string; valeur: string; accent?: string }`. Le champ `accent` est **absent** pour les branches anniversaire et rendez-vous. Consommé par la tâche 5 (`bandeau.ts`).

- [ ] **Step 1: Write the failing test**

Ajouter dans `tests/agenda.test.ts`, à l'intérieur du `describe('pastilleBandeau', …)` existant (ou en fin de fichier dans son propre `describe` si le regroupement diffère) :

```ts
describe('pastilleBandeau — accent coloré', () => {
  it('marque la température du repli « Demain »', () => {
    const p = pastilleBandeau([], JOURS_SANS_AUJOURDHUI, MAINTENANT, false)!;
    expect(p.valeur).toBe('35° et de la pluie');
    expect(p.accent).toBe('35°');
    // L'invariant sur lequel `bandeau.ts` s'appuie pour découper sans jamais tronquer.
    expect(p.valeur.startsWith(p.accent!)).toBe(true);
  });

  it('marque la température d\'un changement de temps annoncé', () => {
    const jours: Prevision[] = [
      { datetime: '2026-08-02T12:00:00', condition: 'sunny', temperature: 30 },
      { datetime: '2026-08-04T12:00:00', condition: 'rainy', temperature: 21.6 },
    ];
    const p = pastilleBandeau([], jours, MAINTENANT, false)!;
    expect(p.accent).toBe('22°');
    expect(p.valeur.startsWith(p.accent!)).toBe(true);
  });

  it('ne marque RIEN sur un anniversaire — il n\'y a aucune température à colorer', () => {
    const p = pastilleBandeau([anniv], JOURS_SANS_AUJOURDHUI, MAINTENANT, false)!;
    expect(p.valeur).toBe('Anniversaire de Julie');
    expect(p.accent).toBeUndefined();
  });

  it('ne marque RIEN sur un rendez-vous proche', () => {
    const p = pastilleBandeau([bientot], JOURS_SANS_AUJOURDHUI, MAINTENANT, false)!;
    expect(p.valeur).toBe('Dentiste');
    expect(p.accent).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/bin/bash -c "npm test -- agenda"`
Expected: FAIL — `expected undefined to be '35°'` sur le premier cas.

- [ ] **Step 3: Write minimal implementation**

Dans `src/agenda.ts` — l'import de `./meteo` (ligne 7) gagne `temperatureCourte` :

```ts
import { phraseDemain, temperatureCourte, texteCondition, type Prevision } from './meteo';
```

Le type (ligne 16) :

```ts
/** `accent` : le préfixe EXACT de `valeur` que le bandeau colore (`rendu/bandeau.ts`). Posé ici,
 *  jamais déduit au rendu — deux des quatre branches de `pastilleBandeau` n'ont aucune température
 *  (un anniversaire, un rendez-vous), et une regex sur `^\d+°` reviendrait à deviner le sens depuis
 *  la forme. Son ABSENCE est le cas normal de ces deux branches, jamais une anomalie. */
export type Pastille = { etiquette: string; valeur: string; accent?: string };
```

La branche « changement » (lignes 128-133) :

```ts
  if (changement) {
    const accent = temperatureCourte(changement.temperature);
    return {
      etiquette: changement.jour,
      valeur: `${accent} et ${texteCondition(changement.condition)}`,
      accent,
    };
  }
```

La branche « demain » (ligne 141) :

```ts
  return {
    etiquette: 'Demain',
    valeur: phraseDemain(demain),
    accent: temperatureCourte(demain.temperature),
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/bin/bash -c "npm test -- agenda"`
Expected: PASS — les tests `pastilleBandeau` préexistants restent verts (`valeur` est inchangée dans toutes les branches).

- [ ] **Step 5: Commit**

```bash
/bin/bash -c "git add src/agenda.ts tests/agenda.test.ts && git commit -m 'Pastille.accent : le fragment coloré est porté par la donnée, jamais deviné'"
```

---

### Task 3: Regrouper heure et date dans la colonne gauche

`space-between` répartit **tous** les enfants d'un conteneur. Sans ce regroupement, la date flotterait au milieu de la colonne au lieu de rester collée sous l'heure. Cette tâche ne change encore rien à l'écran — elle prépare la tâche 4.

**Files:**
- Modify: `src/rendu/bandeau.ts:42-49`
- Test: `tests/bandeau.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `.cap > .gauche` contient exactement deux enfants quand la température intérieure est disponible : `.bloc-heure` (qui contient `.heure` et `.date`) puis `.phrase`. Consommé par la tâche 4 (CSS).

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/bandeau.test.ts`, dans le `describe('bandeau', …)` :

```ts
  it('groupe l\'heure et la date, pour que la colonne gauche n\'ait que deux enfants', () => {
    // `space-between` (base.css) répartit TOUS les enfants : avec trois enfants, la date
    // flotterait au milieu de la colonne au lieu de rester sous l'heure. jsdom ne peut pas voir
    // ça — seule la structure est testable ici, la mise en page relève de verifier-rendu.mjs.
    render(rendreBandeau(etatMeteo(), 'jour', new Date('2026-08-02T19:59:00'), 'sensor.temp',
                         { etiquette: 'Demain', valeur: '35°' }), hote);
    const gauche = hote.querySelector('.cap > .gauche')!;
    expect(gauche.children.length).toBe(2);
    const bloc = gauche.querySelector('.bloc-heure')!;
    expect(bloc.contains(hote.querySelector('.heure'))).toBe(true);
    expect(bloc.contains(hote.querySelector('.date'))).toBe(true);
    expect(gauche.children[1].classList.contains('phrase')).toBe(true);
  });

  it('sans température intérieure, la colonne gauche n\'a qu\'un enfant', () => {
    // Capteur muet : `.phrase` n'est pas rendue. Un enfant unique en `space-between` reste en
    // haut — le bandeau rétrécit, il ne laisse pas de bloc flottant.
    const e = new Etat();
    e.appliquer({ entity_id: 'weather.maison', state: 'cloudy', attributes: { temperature: 29 } });
    render(rendreBandeau(e, 'jour', new Date(), 'sensor.absent'), hote);
    const gauche = hote.querySelector('.cap > .gauche')!;
    expect(gauche.children.length).toBe(1);
    expect(hote.querySelector('.phrase')).toBeNull();
  });

  // La décimale de la température INTÉRIEURE ne s'élide jamais, même sur un nombre rond :
  // c'est elle qui distingue à l'œil une mesure directe (une décimale, toujours) d'une valeur
  // arrondie (extérieur, prévision). Aucun test ne le couvrait — celui de la ligne 54 utilise
  // 26.7, déjà non rond. Contre-épreuve : retirer `.toFixed(1)` de bandeau.ts doit faire rougir
  // CE test et lui seul.
  it('garde la décimale d\'une température intérieure ronde', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'sensor.temp', state: '28', attributes: {} });
    render(rendreBandeau(e, 'jour', new Date(), 'sensor.temp'), hote);
    expect(hote.querySelector('.phrase')!.textContent).toContain('28,0');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/bin/bash -c "npm test -- bandeau"`
Expected: FAIL — `expected 3 to be 2` sur le premier des trois nouveaux tests. Les deux autres passent déjà (`.phrase` conditionnelle et `toFixed(1)` existent) : ce sont des tests de caractérisation, ils verrouillent un comportement correct mais non protégé.

- [ ] **Step 3: Write minimal implementation**

Dans `src/rendu/bandeau.ts`, remplacer le contenu de `<div class="gauche">` (lignes 42-49) par :

```ts
      <div class="gauche">
        <!-- `.bloc-heure` n'est pas décoratif : `.gauche` est réparti en `space-between`
             (base.css), qui écarte TOUS ses enfants. Sans ce groupe, la date se retrouverait
             au milieu de la colonne au lieu de rester sous l'heure. -->
        <div class="bloc-heure">
          <div class="heure">${
            [...`${hh}:${mm}`].map((c, i) => html`<span
              class="chiffre" data-mvt="chiffre:${i}" data-mvt-etat=${c}>${c}</span>`)
          }</div>
          <div class="date">${date}</div>
        </div>
        ${dedans ? html`<div class="phrase">Il fait <b>${dedans}°</b> ici.</div>` : ''}
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/bin/bash -c "npm test -- bandeau"`
Expected: PASS — les six tests préexistants restent verts (`.heure`, `.date` et `.phrase` sont toujours dans `.gauche`, seule la profondeur change ; les tests existants utilisent `contains`, pas `children`).

- [ ] **Step 5: Commit**

```bash
/bin/bash -c "git add src/rendu/bandeau.ts tests/bandeau.test.ts && git commit -m 'Groupe heure et date, et verrouille la décimale de la température intérieure'"
```

---

### Task 4: Étirer les colonnes pour aligner leurs pieds

C'est le correctif de mise en page lui-même. **Aucun test unitaire n'est possible** — jsdom ne calcule aucune mise en page. La preuve est apportée par le vérificateur, dans un vrai navigateur au format exact de la dalle.

**Files:**
- Modify: `src/styles/base.css:89-100` (`.cap`), `:102` (`.gauche`), `:136` (`.phrase`), `:728-729` (`.droite`)

**Interfaces:**
- Consumes: la structure de la tâche 3 (`.gauche` à deux enfants, `.bloc-heure`).
- Produces: aucune interface de code — un comportement visuel.

- [ ] **Step 1: Remplacer le commentaire et la règle `.cap`**

Remplacer les lignes 89-102 de `src/styles/base.css` (le bloc de commentaire « Correction (2026-08-02) » et les trois règles qui suivent) par :

> **Correction post-mesure (2026-08-07).** Le bloc ci-dessous annonçait à l'origine « 112 px contre
> 122 px avant » et une piste droite élargie à `46%` — deux chiffres venus d'une maquette de
> navigateur, jamais de la vraie page, et que le propriétaire a réfutés à l'exécution (deux fois :
> une première fois sur la largeur de piste, une seconde sur la hauteur). Mesuré sur la vraie
> page : la hauteur du bandeau ne bouge pas (**121 px avant, 121 px après**, cf. commit
> `e618ec3`), et la piste droite **reste à `44%`** — la piste gauche étant `1fr`, tout pourcentage
> gagné à droite est mécaniquement perdu par la gauche, ce qui entamait les 1,6 px de marge de
> `.date` (pire cas « dimanche 13 septembre »). Le bloc qui suit reflète maintenant le commentaire
> et la règle réellement livrés, pas l'intention initiale.

```css
/* Refonte 2026-08-06 — LES DEUX COLONNES SE TERMINENT ENSEMBLE. La version 2026-08-02 posait
   `align-items: start` : la colonne gauche (heure, date, phrase) descendait plus bas que la
   droite, la phrase « Il fait … ici » pendait seule en bas à gauche avec du vide à sa droite, et
   l'ensemble dessinait un « L ». `stretch` donne aux deux colonnes la même hauteur, et
   `space-between` sur chacune pousse leur second enfant contre le pied : les pieds s'alignent
   sans qu'AUCUNE taille de texte ne change.

   Hauteur du bandeau MESURÉE inchangée : 121 px avant cette refonte, 121 px après (une estimation
   de maquette plus optimiste a traîné ici un temps sans avoir jamais été confirmée sur la vraie
   page — ne JAMAIS créditer un chiffre de hauteur qui ne vient pas de `verifier-rendu.mjs`).
   C'est le résultat voulu, pas un raté : la consigne du propriétaire est « identique, ni plus ni
   moins » — cette refonte réaligne les pieds des deux colonnes, elle ne réduit l'encombrement de
   personne. La hauteur de la ligne de grille reste celle de sa colonne la plus haute (en général
   la gauche, avec `.phrase`) ; `stretch`/`space-between` ne fait que redistribuer l'espace déjà
   présent À L'INTÉRIEUR de cette hauteur-là, jamais la réduire.

   PIÈGE — NE PAS ÉLARGIR LA PISTE DROITE. Une première version de cette refonte l'avait portée de
   44% à 46%, au prétexte que la pastille, ne partant plus du haut, pourrait profiter d'un peu plus
   de largeur. C'était une erreur de conception : la piste gauche est `1fr`, donc tout pourcentage
   gagné par la piste droite (`minmax(0, …%)`) est mécaniquement perdu par la gauche — `1fr` ne
   reçoit que ce qu'il reste une fois l'autre piste montée à son maximum. Mesuré : passer à 46%
   faisait chuter la boîte de `.date` de 160px à 154px, et sa marge de sécurité (pire cas
   « dimanche 13 septembre », dérivé à chaque exécution de `verifier-rendu.mjs`) de +1,6px à
   -4,4px — donc en dépassement. Cette marge est une garantie MESURÉE qui prime sur le confort de
   largeur de la pastille, laquelle n'a jamais manqué de place à 44%. LA PISTE DROITE RESTE À 44%. */
.cap { background: var(--md-primary); color: var(--md-on-primary);
       border-radius: 0 0 var(--sh-xl) var(--sh-xl); padding: 16px 20px 15px; flex: none;
       display: grid; grid-template-columns: 1fr minmax(0, 44%); column-gap: 10px;
       align-items: stretch; }
.sombre .cap { background: var(--md-surface-container-high); color: var(--md-on-surface); }
/* `gap: 9px` reprend l'ancien `margin-top` de `.phrase` (retiré plus bas) : avec `space-between`
   une marge s'ADDITIONNERAIT à la répartition, alors qu'un `gap` n'agit que comme plancher quand
   la colonne est trop courte pour écarter ses deux blocs. */
.cap .gauche { min-width: 0; display: flex; flex-direction: column;
               justify-content: space-between; gap: 9px; }
```

- [ ] **Step 2: Retirer la marge de `.phrase`**

Ligne 136 : `.phrase` perd son `margin-top`, désormais porté par le `gap` de `.gauche`.

```css
.phrase { font-size: 14px; line-height: 1.35; }
```

- [ ] **Step 3: Répartir la colonne droite**

Remplacer la règle `.cap .droite` (lignes 728-729) par :

```css
.cap .droite { display: flex; flex-direction: column; justify-content: space-between;
  align-items: flex-end; gap: 6px; min-width: 0; text-align: right; }
```

Le `gap: 6px` est conservé : comme à gauche, il ne sert plus qu'de plancher quand la colonne est courte (pastille absente, ou colonne gauche réduite parce que le capteur intérieur est muet).

- [ ] **Step 4: Vérifier dans un vrai navigateur**

Run: `/bin/bash -c "node outils/verifier-rendu.mjs"`
Expected: PASS sur les trois pièces et tous les modes — aucun débordement, aucune cible sous 62 px, aucun contraste sous 5:1, aucun texte tronqué. Le contrôle de troncature de `.date` (marge de 1,6 px) doit rester vert : la piste gauche est inchangée.

Si le vérificateur signale une régression, ne pas passer à la suite — la corriger d'abord.

- [ ] **Step 5: Vérifier que les tests unitaires restent verts**

Run: `/bin/bash -c "npm test"`
Expected: PASS — aucun test ne lit le CSS, mais la suite complète confirme qu'aucun sélecteur attendu n'a disparu.

- [ ] **Step 6: Commit**

```bash
/bin/bash -c "git add src/styles/base.css && git commit -m 'Colonnes du bandeau étirées et réparties : les pieds sont alignés, le « L » disparaît'"
```

---

### Task 5: L'accent de couleur sur les trois températures

**Files:**
- Modify: `src/rendu/bandeau.ts` (les trois emplacements + une fonction locale), `src/styles/base.css` (jeton `--cap-accent`, règle `.cap .val`, et la règle `.pastille .pv` ligne 732)
- Test: `tests/bandeau.test.ts`

**Interfaces:**
- Consumes: `Pastille.accent` de la tâche 2, la structure de la tâche 3.
- Produces: trois éléments portant la classe `.val` dans `.cap` — dans `.dehors`, dans `.phrase`, et en préfixe de `.pastille .pv` (ce dernier seulement si `accent` est présent et est bien un préfixe de `valeur`).

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/bandeau.test.ts` :

```ts
  it('colore les trois températures, et rien d\'autre', () => {
    render(rendreBandeau(etatMeteo(), 'jour', new Date(), 'sensor.temp',
                         { etiquette: 'Demain', valeur: '35° et de la pluie', accent: '35°' }), hote);
    expect(hote.querySelector('.dehors .val')!.textContent).toBe('29°');
    expect(hote.querySelector('.phrase .val')!.textContent).toBe('26,7°');
    expect(hote.querySelector('.pastille .val')!.textContent).toBe('35°');
    // Le texte affiché est INCHANGÉ : le découpage colore, il n'ajoute et ne retire rien.
    expect(hote.querySelector('.pastille .pv')!.textContent).toBe('35° et de la pluie');
    // L'icône météo n'est pas colorée — elle est frère du `.val`, pas dedans.
    expect(hote.querySelector('.dehors svg')!.closest('.val')).toBeNull();
  });

  it('ne colore rien dans une pastille sans température', () => {
    render(rendreBandeau(etatMeteo(), 'jour', new Date(), 'sensor.temp',
                         { etiquette: 'Aujourd\'hui', valeur: 'Anniversaire de Julie' }), hote);
    expect(hote.querySelector('.pastille .val')).toBeNull();
    expect(hote.querySelector('.pastille .pv')!.textContent).toBe('Anniversaire de Julie');
  });

  it('ne coupe JAMAIS la valeur quand l\'accent n\'en est pas le préfixe', () => {
    // Garde-fou : si `agenda.ts` et `meteo.ts` divergeaient un jour, on veut du texte non coloré,
    // jamais un texte amputé sur le mur.
    render(rendreBandeau(etatMeteo(), 'jour', new Date(), 'sensor.temp',
                         { etiquette: 'Demain', valeur: 'Anniversaire', accent: '35°' }), hote);
    expect(hote.querySelector('.pastille .val')).toBeNull();
    expect(hote.querySelector('.pastille .pv')!.textContent).toBe('Anniversaire');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/bin/bash -c "npm test -- bandeau"`
Expected: FAIL — `Cannot read properties of null (reading 'textContent')` sur `.dehors .val`.

- [ ] **Step 3: Write minimal implementation**

Dans `src/rendu/bandeau.ts`, ajouter avant `rendreBandeau` :

```ts
/** Colore le seul préfixe que la donnée déclare comme étant une température (`Pastille.accent`,
 *  posé par `agenda.ts`). Le `startsWith` est un GARDE, pas une politesse : si `agenda.ts` et
 *  `meteo.ts` divergeaient un jour sur le format, on retombe sur du texte non coloré — jamais sur
 *  un texte amputé au mauvais endroit sur un mur. */
function valeurPastille(p: Pastille) {
  return p.accent && p.valeur.startsWith(p.accent)
    ? html`<span class="val">${p.accent}</span>${p.valeur.slice(p.accent.length)}`
    : p.valeur;
}
```

Les trois emplacements. Dans la phrase :

```ts
        ${dedans ? html`<div class="phrase">Il fait <b class="val">${dedans}°</b> ici.</div>` : ''}
```

Dans `.dehors` — la classe s'ajoute au `<span>` intérieur, jamais à `.dehors` lui-même, sinon l'icône serait colorée avec (elle hérite de `currentColor` du parent). Le ternaire qui l'entoure est inchangé, seul `class="chiffre"` devient `class="chiffre val"` :

```ts
        ${dehors !== undefined ? html`
          <div class="dehors">${icone(String(meteo!.etat))}
            <span class="chiffre val" data-mvt="chiffre:dehors"
                  data-mvt-etat=${String(Math.round(Number(dehors)))}
            >${Math.round(Number(dehors))}°</span></div>` : ''}
```

Dans la pastille :

```ts
            <div class="pv">${valeurPastille(pastille)}</div>
```

- [ ] **Step 4: Write the CSS**

Dans `src/styles/base.css`, ajouter juste après la règle `.sombre .cap` :

```css
/* L'accent des températures. DEUX jetons, pas un : de jour `.cap` a `--md-primary` (#003c48) POUR
   FOND — un accent `--md-primary` y serait littéralement invisible, même couleur que son support.
   Dans les deux palettes c'est « le cyan clair » de la graine, et le contraste tient largement :
   7,1:1 de jour (#78d3ec sur #003c48), 9,3:1 de nuit (#99e8ff sur #2e3335), pour un seuil de 5:1
   vérifié sur le rendu peint par `outils/verifier-rendu.mjs`.

   Ce que l'accent couvre : les trois températures affichées, et rien d'autre — l'icône météo reste
   dans la couleur du texte (elle hérite de `currentColor` de `.dehors`, hors du `.val`). La règle
   que l'œil apprend est donc unique et sans exception : ce qui est coloré ici est une température. */
.cap { --cap-accent: var(--md-inverse-primary); }
.sombre .cap { --cap-accent: var(--md-primary); }
.cap .val { color: var(--cap-accent); }
```

**Attention** : `.cap { --cap-accent: … }` doit être une règle **séparée** de la règle `.cap` principale et placée après elle, ou bien la déclaration doit être ajoutée dans la règle `.cap` existante. Ne pas la placer avant `.sombre .cap`, dont la spécificité (0,2,0) l'emporte de toute façon sur `.cap` (0,1,0).

- [ ] **Step 5: Run tests to verify they pass**

Run: `/bin/bash -c "npm test -- bandeau"`
Expected: PASS — les tests préexistants restent verts. En particulier `tests/bandeau.test.ts:23` (`.pv` vaut `'35° et de la pluie'`) : la pastille y est passée **sans** `accent`, donc `valeurPastille` retombe sur la chaîne brute.

- [ ] **Step 6: Vérifier le contraste peint dans un vrai navigateur**

Run: `/bin/bash -c "node outils/verifier-rendu.mjs"`
Expected: PASS. Le vérificateur échantillonne les couleurs **réellement peintes** : c'est lui qui prouve les 7,1:1 et 9,3:1 calculés, sur les deux palettes. Le clamp de `.pastille .pv` (déclaré dans `CLAMPS_VOULUS`) doit rester actif malgré le `<span>` inline ajouté à l'intérieur.

- [ ] **Step 7: Commit**

```bash
/bin/bash -c "git add src/rendu/bandeau.ts src/styles/base.css tests/bandeau.test.ts && git commit -m 'Accent de couleur sur les trois températures du bandeau, jeton inversé jour/nuit'"
```

---

### Task 6: Vérification complète, déploiement et contrôle sur les tablettes

**`npm run build` écrit dans `config/www/wallpanel/` : c'est un déploiement en production sur les trois tablettes murales.** Ne rien lancer ici tant que les tâches 1 à 5 ne sont pas toutes vertes.

**Files:**
- Modify: `config/www/wallpanel/*` (artefacts de build — jamais édités à la main)

**Interfaces:**
- Consumes: tout le travail des tâches 1 à 5.
- Produces: le bundle déployé.

- [ ] **Step 1: Suite complète**

Run: `/bin/bash -c "npm test"`
Expected: PASS — l'intégralité des fichiers de tests, pas seulement ceux touchés.

- [ ] **Step 2: Vérificateur complet**

Run: `/bin/bash -c "node outils/verifier-rendu.mjs"`
Expected: PASS sur les trois pièces et tous les modes principaux. Relever la hauteur mesurée du bandeau : elle doit valoir **121 px, inchangée** par rapport à l'avant-refonte (cf. commentaire de `.cap`, `src/styles/base.css`) — c'est le résultat VOULU, pas un défaut à corriger. Une version antérieure de ce plan attendait 112 px (contre 122 px avant), un chiffre de maquette jamais confirmé sur la vraie page ; ne pas le ressusciter. Ce que cette refonte change, c'est l'alignement du pied des deux colonnes, jamais l'encombrement du bandeau — un écart par rapport à 121 px serait le signal d'alarme, pas une valeur proche de 112 px.

- [ ] **Step 3: Déployer**

Run: `/bin/bash -c "npm run build"`
Expected: succès, et le `?v=` des pages de `config/www/wallpanel/` est incrémenté.

- [ ] **Step 4: Forcer le rechargement des trois tablettes**

La WebView Fully peut continuer à servir l'ancien bundle. Pour chaque pièce (`salon`, `bureau`, `cuisine`), appuyer les deux boutons **dans cet ordre**, en laissant ~3 s entre les deux.

Les identifiants HA sont dans `/opt/nivuus/HomeAssistant/data/.mcp.json` (clés `HA_URL` et `HA_TOKEN`) :

```bash
/bin/bash -c '
HA_URL=$(python3 -c "import json;print(json.load(open(\"/opt/nivuus/HomeAssistant/data/.mcp.json\"))[\"mcpServers\"][\"homeassistant\"][\"env\"][\"HA_URL\"])")
HA_TOKEN=$(python3 -c "import json;print(json.load(open(\"/opt/nivuus/HomeAssistant/data/.mcp.json\"))[\"mcpServers\"][\"homeassistant\"][\"env\"][\"HA_TOKEN\"])")
for p in salon bureau cuisine; do
  for b in vider_le_cache_du_navigateur load_start_url; do
    curl -s -X POST "$HA_URL/api/services/button/press" \
      -H "Authorization: Bearer $HA_TOKEN" -H "Content-Type: application/json" \
      -d "{\"entity_id\":\"button.tablette_${p}_${b}\"}" > /dev/null
    sleep 3
  done
done'
```

Si le chemin des clés dans `.mcp.json` diffère, le lire d'abord plutôt que de deviner. L'alternative est d'appeler `button.press` via les outils MCP `mcp__homeassistant__*`, une entité à la fois.

- [ ] **Step 5: Contrôle visuel de NUIT**

Lire `image.tablette_salon_capture_d_ecran` (ou `http://192.168.0.218:2323/?cmd=getScreenshot&password=1234`, qui fonctionne même écran éteint).

Vérifier : les pieds des deux colonnes s'alignent ; les trois températures sont cyan ; l'icône météo ne l'est pas ; la date tient sur une ligne.

Après un rechargement la tablette met plusieurs secondes à peindre — se fier à l'heure affichée par l'horloge, jamais à `frame_timestamp`.

- [ ] **Step 6: Contrôle visuel de JOUR — étape obligatoire, nécessairement différée**

Toute cette conception a été menée de nuit. **Le rendu de jour n'a jamais été observé sur la vraie dalle**, alors que le fond canard `#003c48` est le contexte le plus exigeant pour l'accent : c'est là que le jeton `--md-inverse-primary` remplace `--md-primary`, et là que le bouton « Toute la maison » porte exactement la couleur du fond du bandeau.

Reprendre la même capture après le lever du soleil (`moment === 'jour'`, cf. `src/contexte.ts`) et confirmer que l'accent se détache nettement. **Ne pas considérer le lot terminé avant ce contrôle.**

- [ ] **Step 7: Commit final**

```bash
/bin/bash -c "git add -A config/www/wallpanel && git commit -m 'Déploie le bandeau refondu sur les trois tablettes'"
```

---

## Récapitulatif des fichiers

| Fichier | Rôle dans ce lot |
|---|---|
| `src/meteo.ts` | Source unique du format `«&nbsp;NN°&nbsp;»` (tâche 1) |
| `src/agenda.ts` | Décide quel fragment est une température (tâche 2) |
| `src/rendu/bandeau.ts` | Structure des colonnes (tâche 3) et pose de `.val` (tâche 5) |
| `src/styles/base.css` | Alignement des pieds (tâche 4) et jeton d'accent (tâche 5) |
| `tests/meteo.test.ts` | Contrat `temperatureCourte` ↔ `phraseDemain` |
| `tests/agenda.test.ts` | Présence/absence d'`accent` sur les quatre branches |
| `tests/bandeau.test.ts` | Structure, invariant de la décimale, pose de l'accent, garde `startsWith` |
| `outils/verifier-rendu.mjs` | **Non modifié** — seul juge de la hauteur, de l'alignement et des contrastes |
