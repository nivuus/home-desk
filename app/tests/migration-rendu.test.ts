// @vitest-environment jsdom
//
/** JETABLE — part à la tâche 10 du plan 3c.
 *
 *  Niveau 3, l'épreuve qui compte : ni la donnée ni les notes ne disent ce que la tablette
 *  AFFICHE. Chaque écran est monté DEUX FOIS — une fois depuis `ECRANS`, une fois depuis le
 *  transport alimenté par ce que l'outil exporte — et les deux DOM sont comparés.
 *
 *  L'accueil seul ne suffit pas (leçon n°2 du chantier) : quatre champs d'`Ecran` ne se rendent
 *  JAMAIS sur l'accueil — `extrasMaison` (« Toute la maison » seulement, `rendu/maison.ts`),
 *  `listesTachesExtra` (« Tâches » seulement, `cochage.ts`), et `minuteurs`/`etiquettesMinuteur`
 *  (réglage du minuteur et vue « Recette », cuisine seule — la seule pièce qui les déclare). Un
 *  décor limité à l'accueil laisserait ces quatre champs sans épreuve de rendu, exactement le
 *  trou que `absenceNommee` a déjà payé cinq fois dans ce dépôt (cf. CLAUDE.md du paquet). Les
 *  sous-vues partagées (« Toute la maison », « Tâches ») sont donc montées pour les trois écrans ;
 *  le réglage du minuteur et la vue « Recette », propres à la cuisine, ne le sont que pour elle.
 *
 *  RONDE DE CORRECTION 1 : cette suite appelait `ecransPourImport(ECRANS)` directement, ce qui
 *  contourne `attacherNotes` — pas le chemin réel de production (le CLI `--json` d'`exporter-
 *  ecrans.mjs` attache D'ABORD les notes du registre, puis met en forme). `exporterTout` (même
 *  outil) est cette composition réelle, désormais utilisée ici comme dans `migration-donnee.test.ts`.
 *  Sans effet observable sur ce niveau : `note` n'est « JAMAIS rendu » (cf. `Ecran.note` dans
 *  `ecran.ts`), donc l'attacher ou non ne pouvait déjà rien changer au DOM — mais l'ancien appel
 *  restait faux à documenter comme « ce que l'outil exporte », et une régression future
 *  d'`attacherNotes` qui romprait le pipeline (chemin invalide, contrat refusé) devait pouvoir
 *  se voir ICI, pas seulement dans `migration-notes.test.ts`, qui ne teste que les notes elles-
 *  mêmes, jamais que le reste de l'export survit à leur attachement. */
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { TextEncoder as TextEncoderNode, TextDecoder as TextDecoderNode } from 'node:util';
import { ECRANS } from '../src/ecran';
import { monterDemarrage, vider, type Montage, type OptionsMontage } from './aides';

// RÉPARATION D'ENVIRONNEMENT, PAS UN CONTOURNEMENT DE TEST : sous `@vitest-environment jsdom`,
// `TextEncoder`/`Uint8Array` vivent dans le realm vm séparé que jsdom construit pour la fenêtre —
// `new TextEncoder().encode('') instanceof Uint8Array` y est FAUX, alors que les deux viennent du
// même module `node:util`/global standard. `esbuild` (importé par `exporter-ecrans.mjs`, jamais
// directement ici) vérifie exactement cet invariant À L'IMPORT et refuse de charger si jsdom l'a
// cassé (`node_modules/esbuild/lib/main.js`). C'est jsdom qui rompt l'identité d'un objet
// standard, pas ce test qui triche pour passer — mesuré : sans ce correctif, TOUT import (même
// dynamique) d'`esbuild` lève sous cet environnement, avec Node 24 / jsdom 29 / esbuild 0.25.
// Restaurer les classes réelles de Node AVANT le premier import d'`esbuild` suffit ; `Uint8Array`
// vient de `Buffer`, jamais touché par jsdom, plutôt que d'un import qui n'existe pas en ESM.
(globalThis as any).TextEncoder = TextEncoderNode;
(globalThis as any).TextDecoder = TextDecoderNode;
(globalThis as any).Uint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;

// Importé DYNAMIQUEMENT, jamais en import statique : les imports statiques sont hoistés au-dessus
// de TOUT le reste du module (y compris les trois lignes ci-dessus), donc un `import … from
// '../outils/exporter-ecrans.mjs'` en tête de fichier chargerait `esbuild` — et casserait —
// AVANT que le correctif n'ait eu la moindre chance de s'appliquer.
let exporterTout: (ecrans: typeof ECRANS) => any[];
beforeAll(async () => {
  ({ exporterTout } = await import('../outils/exporter-ecrans.mjs'));
});

afterEach(async () => {
  location.hash = '';
  await vider();
});

/** Va sur une sous-vue accessible par hash et laisse le chargement éventuel (« Tâches » interroge
 *  `listerTaches`) se stabiliser avant que le DOM ne soit lu. */
async function allerSur(hash: string): Promise<void> {
  location.hash = hash;
  window.dispatchEvent(new Event('hashchange'));
  await vider();
}

/** Monte `ecran`, applique `apres` (une navigation éventuelle, identique des deux côtés) et rend
 *  le HTML final — puis referme la sous-vue pour ne rien laisser fuiter sur le montage suivant. */
async function rendre(
  ecran: Parameters<typeof monterDemarrage>[0],
  options: OptionsMontage,
  apres: (m: Montage) => Promise<void>,
): Promise<string> {
  const m = await monterDemarrage(ecran, options);
  await apres(m);
  const dom = m.racine.innerHTML;
  await allerSur('');
  return dom;
}

/** Compare les deux côtés (littéral / exporté-réimporté) pour un écran donné, sur une navigation
 *  `apres` commune aux deux montages (par défaut : rien, donc l'accueil). */
async function comparerCotes(
  ecran: (typeof ECRANS)[keyof typeof ECRANS],
  options: OptionsMontage = {},
  apres: (m: Montage) => Promise<void> = async () => {},
): Promise<void> {
  const exporte = exporterTout(ECRANS).find((e) => e.nom === ecran.nom)!;
  const { titre: _t, version: _v, ...depuisTransport } = exporte;

  const domLitteral = await rendre(ecran, options, apres);
  const domTransport = await rendre(depuisTransport as typeof ecran, options, apres);
  expect(domTransport).toBe(domLitteral);
}

describe('niveau 3 — le rendu', () => {
  it.each(Object.entries(ECRANS))('%s rend le même DOM des deux côtés (accueil)', async (_cle, ecran) => {
    await comparerCotes(ecran);
  });

  // RONDE DE CORRECTION 1 (Important) : trois modes de `agencement.modes` (ecran.ts:312/388/543)
  // déclenchés par un ÉTAT réel, pas par un champ de configuration — mais chacun rend un champ
  // qu'aucune des vues ci-dessus n'exerce : `piece.aspirateur` (menage, demarrage.ts:1803),
  // `piece.sources` (cinema/media, :1804), `piece.ouvrants` (aération, :1805). Les trois sont
  // OBLIGATOIRES sur `Ecran` : une perte de champ est déjà attrapée par l'égalité du niveau 1. Ce
  // que ces trois DOM comparés ajoutent, c'est le CHEMIN DE RENDU — la preuve qu'aucune fonction
  // ne traite l'objet reconstruit autrement que le littéral malgré une égalité de valeur.

  // Ménage : les trois écrans déclarent `aspirateur` (aucun n'a `undefined` ici).
  it.each(Object.entries(ECRANS))('%s rend le même DOM des deux côtés (ménage)', async (_cle, ecran) => {
    await comparerCotes(ecran, {}, async (m) => {
      await m.pousser(ecran.aspirateur!, 'cleaning', { battery_level: 80 });
      expect(m.racine.querySelector('[data-mvt="bloc:menage"]')).not.toBeNull();
    });
  });

  // Média/cinéma : la première source déclarée par chaque écran, poussée en lecture — repris du
  // patron de `tests/demarrage.test.ts > pousserLectureEnCours`.
  it.each(Object.entries(ECRANS))('%s rend le même DOM des deux côtés (média)', async (_cle, ecran) => {
    const entite = ecran.sources[0].titre[0];
    await comparerCotes(ecran, {}, async (m) => {
      await m.pousser(entite, 'playing', { media_title: 'Blinding Lights', supported_features: 1 });
      expect(m.racine.querySelector('.media')).not.toBeNull();
    });
  });

  // Aération : seuls salon et cuisine déclarent des `ouvrants` non vides — bureau (`ouvrants: []`)
  // exclut d'ailleurs `aeration` de son `agencement.modes` (ecran.ts). Horloge figée : le mode
  // n'existe qu'au-delà de DIX MINUTES d'ouvrant ouvert (`AERATION_MS`, `modes.ts`) — `Etat.appliquer`
  // horodate `changeLe` avec `Date.now()`, jamais le `maintenant` injecté, donc les deux horloges
  // doivent être LA MÊME (`vi.setSystemTime` + `maintenant: () => new Date()`). Patron repris de
  // `tests/orchestration.test.ts > rend le bloc aération quand un ouvrant est ouvert...`.
  it.each([['salon', ECRANS.salon], ['cuisine', ECRANS.cuisine]] as const)(
    '%s rend le même DOM des deux côtés (aération)', async (_cle, ecran) => {
    vi.useFakeTimers();
    try {
      await comparerCotes(ecran, { maintenant: () => new Date() }, async (m) => {
        vi.setSystemTime(new Date(2026, 7, 1, 14, 0));
        await m.pousser(ecran.ouvrants[0], 'on', {});
        vi.setSystemTime(new Date(2026, 7, 1, 14, 11));
        await m.pousser('climate.radiateur', 'heat', {});
        expect(m.racine.querySelector('[data-mvt="bloc:aeration"]')).not.toBeNull();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // « Toute la maison » : partagée par les trois tablettes, atteinte par hash sans rien pousser.
  // Rend `extrasMaison` (la tuile « Scanner » en cuisine, vide ailleurs) à la suite de la liste
  // commune `TOUTE_LA_MAISON`.
  it.each(Object.entries(ECRANS))('%s rend le même DOM des deux côtés (Toute la maison)', async (_cle, ecran) => {
    await comparerCotes(ecran, {}, async (m) => {
      await allerSur('#maison');
      expect(m.racine.querySelector('[data-mvt="vue:maison"]')).not.toBeNull();
    });
  });

  // « Tâches » : partagée elle aussi. Rend `listesTachesExtra` (la liste de courses, cuisine
  // seule) à la suite des listes déjà déduites de `synthese`.
  it.each(Object.entries(ECRANS))('%s rend le même DOM des deux côtés (Tâches)', async (_cle, ecran) => {
    await comparerCotes(ecran, {}, async (m) => {
      await allerSur('#taches');
      expect(m.racine.querySelector('[data-mvt="vue:taches"]')).not.toBeNull();
    });
  });

  // Réglage du minuteur : seule la cuisine déclare `minuteurs`/`etiquettesMinuteur`, et cette
  // sous-vue est la seule à rendre `etiquettesMinuteur` brut (les étiquettes proposées en un
  // appui au lancement).
  it('cuisine rend le même DOM des deux côtés (réglage du minuteur)', async () => {
    await comparerCotes(ECRANS.cuisine, {}, async (m) => {
      await allerSur('#minuteur');
      expect(m.racine.querySelector('[data-mvt="vue:minuteur"]')).not.toBeNull();
    });
  });

  // Vue « Recette » : la seule à combiner `piece.minuteurs` à un repas réel (les minuteurs
  // inline de la cuisson, `vuesMinuteurs`) — surface que le réglage brut du minuteur, ci-dessus,
  // n'exerce pas. Repris du patron de `tests/navigation.test.ts > vue recette (#recette)`.
  it('cuisine rend le même DOM des deux côtés (vue Recette)', async () => {
    const midi = () => new Date(2026, 7, 17, 14, 0);
    const repas: OptionsMontage['etats'] = [[
      'sensor.home_stock_next_meal', 'Bol lentilles',
      { day: '2026-08-17', slot: 'dinner', recipe_id: 76, meal_id: 139, missing_ingredients: 0 },
    ]];
    const recette = {
      recipe: { id: 76, name: 'Bol lentilles', servings: 2 },
      steps: [
        { position: 1, title: 'Préparer', image_url: null,
          instructions: [{ text: 'Mélanger', timer_label: null, timer_seconds: null }] },
        { position: 2, title: 'Servir', image_url: null,
          instructions: [{ text: 'Dresser', timer_label: null, timer_seconds: null }] },
      ],
      ingredients: [],
    };
    const apercu = {
      meal_id: 139, day: '2026-08-17', slot_key: 'dinner',
      recipe: { id: 76, name: 'Bol lentilles', servings: 2 },
      servings: 2, factor: 1, lines: [], by_hand: [], dish: null, blocking: [],
    };
    const options: OptionsMontage = {
      maintenant: midi, etats: repas,
      commandes: {
        'home_stock/recipe/get': () => recette,
        'home_stock/meal/preview': () => apercu,
        'home_stock/meal/validate': () => ({ meal_id: 139 }),
      },
    };
    await comparerCotes(ECRANS.cuisine, options, async (m) => {
      await allerSur('#recette');
      expect(m.racine.querySelector('[data-mvt="vue:recette"]')).not.toBeNull();
    });
  });
});
