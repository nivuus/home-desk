import { describe, it, expect } from 'vitest';
import { modePrincipal, modulateursActifs, ordreCommandes, CONDITIONS,
  type ContexteModes, type ModePrincipal } from '../src/modes';
import { ECRANS, type Bouton } from '../src/ecran';
import { AGENCEMENT_DEFAUT } from '../src/agencement';
import type { CardType } from '../src/stack/types';
import { CALME } from './contextes';

/** Fabrique dérivée de `CALME` : chaque test du mode minuteur ne cite que le(s) champ(s) qu'il
 *  exerce, sans reconstruire un `ContexteModes` complet à la main. Cohabite volontairement avec
 *  les `{ ...CALME, ... }` écrits en clair dans les tests préexistants du fichier (ci-dessous et
 *  dans `ordreCommandes`) : les deux motifs partent de la même base `CALME`, il n'y a donc rien à
 *  réconcilier — seuls les nouveaux tests du mode minuteur passent par `ctx()`. */
const ctx = (overrides: Partial<ContexteModes> = {}): ContexteModes => ({ ...CALME, ...overrides });

const COMMANDES: Bouton[] = [
  { libelle: 'Lumières', icone: 'bulb', entite: 'light.lumiere_salon', service: ['light', 'toggle'] },
  { libelle: 'Chauffage', icone: 'flame', entite: 'climate.radiateur' },
  // `epingle` comme dans la déclaration réelle du salon (`ecran.ts`) : ce tableau de laboratoire
  // sert justement à exercer les modes du salon, il doit porter la même marque.
  { libelle: 'Porte', icone: 'porte', entite: 'lock.serrure', service: ['script', 'turn_on'],
    epingle: true },
  { libelle: 'Rideau', icone: 'rideau', entite: 'cover.rideau_salon', service: ['script', 'turn_on'] },
  { libelle: 'Ambilight', icone: 'bulb', entite: 'light.televiseur_ambilight', service: ['light', 'toggle'] },
];

/** Le même tableau, mais avec les DEUX épingles du salon depuis le 2026-08-29 (Porte ET Rideau).
 *  Séparé de `COMMANDES` à dessein : le cas « une seule épinglée » reste un comportement supporté
 *  — le bureau et la cuisine n'en déclarent aucune, une pièce future pourrait n'en avoir qu'une —
 *  et les tests d'origine doivent continuer de le décrire sans être réécrits. */
const DEUX_EPINGLES: Bouton[] = COMMANDES.map(
  (b) => (b.libelle === 'Rideau' ? { ...b, epingle: true as const } : b),
);

/** Quatre commandes anonymes : sert aux tests qui ne comptent QUE le nombre de places rendues
 *  par un mode, sans rien attendre des libellés (aucune n'est épinglée, aucune n'est citée par un
 *  réordonnancement). */
const QUATRE: Bouton[] = [
  { libelle: 'A', icone: 'sofa', entite: 'light.a' },
  { libelle: 'B', icone: 'sofa', entite: 'light.b' },
  { libelle: 'C', icone: 'sofa', entite: 'light.c' },
  { libelle: 'D', icone: 'sofa', entite: 'light.d' },
];

describe('modePrincipal', () => {
  it('rend defaut quand rien ne se passe', () => {
    expect(modePrincipal(CALME)).toBe('defaut');
  });

  it('une alerte prime sur tout le reste', () => {
    expect(modePrincipal({ ...CALME, alerte: true, aspirateurEnMarche: true, ecranAllume: true }))
      .toBe('alerte');
  });

  // Card-stack plan, task 6 (2026-10-24): the timer, the recipe, the vacuum, the media and the
  // airing are stack cards (`stack/collect.ts`); they never take the block as a mode again.
  it('a mode that became a card never takes the block', () => {
    for (const sur of [{ minuteurEnCours: true }, { recetteEnCours: true }, { aspirateurEnMarche: true },
      { ecranAllume: true }, { sourceJoue: true },
      { ouvrantOuvertDepuisMs: 11 * 60_000, chauffageEnMarche: true }]) {
      expect(modePrincipal(ctx(sur)), JSON.stringify(sur)).toBe('defaut');
    }
  });
});

/** The airing card (`cards/airing.ts`) reads this condition as it is. */
describe('CONDITIONS.aeration', () => {
  it('ouvrant ouvert depuis plus de 10 min ET chauffage en marche, ou pluie', () => {
    expect(CONDITIONS.aeration(ctx({ ouvrantOuvertDepuisMs: 11 * 60_000, chauffageEnMarche: true }))).toBe(true);
    expect(CONDITIONS.aeration(ctx({ ouvrantOuvertDepuisMs: 11 * 60_000, ilPleut: true }))).toBe(true);
  });

  it('pas d\'aération sous 10 minutes, même avec le chauffage', () => {
    expect(CONDITIONS.aeration(ctx({ ouvrantOuvertDepuisMs: 9 * 60_000, chauffageEnMarche: true }))).toBe(false);
  });

  it('pas d\'aération sur un ouvrant ouvert par beau temps sans chauffage', () => {
    expect(CONDITIONS.aeration(ctx({ ouvrantOuvertDepuisMs: 3 * 3_600_000 }))).toBe(false);
  });
});

describe('sous une carte', () => {
  // Card-stack plan, task 1: a card (264 px) climbs the ladder (`arrangement`,
  // `screen-budget.ts`): reduced synthèse, no Ambiance row, one row of two controls.
  it('affiche deux commandes sous n\'importe quelle carte — la carte gravit l\'échelle', () => {
    const heads: CardType[] = ['minuteur', 'recette', 'aspirateur', 'aeration', 'voiture', 'media', 'cinema'];
    for (const head of heads) expect(ordreCommandes(QUATRE, CALME, head), head).toHaveLength(2);
  });

  it('a place reserved for the timer tile is a control less, never a row more', () => {
    expect(ordreCommandes(QUATRE, CALME, 'media', 1).map((b) => b.libelle)).toEqual(['A']);
    expect(ordreCommandes(QUATRE, CALME, null, 1)).toHaveLength(3);
  });
});

describe('mode voiture', () => {
  it('occupe son propre mode quand la pièce déclare blocDefaut: voiture', () => {
    expect(modePrincipal(ctx({ blocDefaut: 'voiture' }))).toBe('voiture');
  });

  it('retombe sur defaut sans voiture déclarée', () => {
    expect(modePrincipal(ctx({ blocDefaut: undefined }))).toBe('defaut');
  });

  // The cards are above the block now: the car block is the stack's EMPTY state, and only the
  // alert takes its place as a mode.
  it('ne cède qu\'à l\'alerte', () => {
    expect(modePrincipal(ctx({ blocDefaut: 'voiture', alerte: true }))).toBe('alerte');
    expect(modePrincipal(ctx({ blocDefaut: 'voiture', minuteurEnCours: true }))).toBe('voiture');
  });

  // Tâche 10 bis, MESURÉ (tâche 10) : le bloc voiture fait 648 px, 63 px au-delà du budget — plus
  // haut que les prévisions à quatre commandes qu'il remplace. Il rejoint donc `media`/`cinema`
  // à deux commandes, comme tout bloc central plus haut que la normale.
  it('n\'en laisse que deux en mode voiture, comme les modes à bloc haut', () => {
    expect(ordreCommandes(QUATRE, ctx({ blocDefaut: 'voiture' }), null)).toHaveLength(2);
  });

  it('under an alert the car block is not drawn: the small block\'s budget', () => {
    expect(ordreCommandes(QUATRE, ctx({ blocDefaut: 'voiture', alerte: true }), null)).toHaveLength(4);
  });
});

/** 2026-08-29 : le nombre de commandes n'est plus une propriété du seul MODE — il dépend aussi de
 *  ce que la pièce dépense ailleurs. Une pièce qui a renoncé à sa rangée « Ambiance » (le salon
 *  depuis cette date) rend ~100 px au budget : 72 px de tuiles, l'étiquette et la gouttière, soit
 *  très exactement la deuxième rangée de commandes (64 + 10 px). Les modes à bloc central haut
 *  (media/cinema/voiture), seuls à descendre à deux, retrouvent donc leurs quatre places chez
 *  elle — et c'est ce qui permet d'y afficher Lumières, Porte, Rideau et Chauffage en même temps.
 *  2026-10-24: no longer media/cinema, whose redesigned card outgrows that row (see below).
 *
 *  `rangeeAmbiance` est FACULTATIF et vaut « oui » quand il est absent : toutes les suites
 *  existantes (et la cuisine, et le bureau, qui gardent leur rangée) décrivent le même
 *  comportement qu'avant sans une ligne à changer. */
describe('rangeeAmbiance — le budget rendu par la rangée « Ambiance » supprimée', () => {
  // 2026-10-24: `media` and `cinema` left this test. The redesigned media card (264 px,
  // `blocCarte`) costs more than the Ambiance row gives back: their ladder (`arrangement`,
  // `screen-budget.ts`) ends on ONE row with or without the Ambiance row.
  it('sans rangée Ambiance, le bloc haut (voiture) retrouve quatre commandes', () => {
    expect(ordreCommandes(QUATRE, { ...ctx({ blocDefaut: 'voiture' }), rangeeAmbiance: false }, null))
      .toHaveLength(4);
    for (const head of ['media', 'cinema'] as const) {
      expect(ordreCommandes(QUATRE, { ...CALME, rangeeAmbiance: false }, head)).toHaveLength(2);
    }
  });

  it('avec rangée Ambiance (défaut, et champ absent), rien ne change', () => {
    expect(ordreCommandes(QUATRE, CALME, 'media')).toHaveLength(2);
    expect(ordreCommandes(QUATRE, { ...CALME, rangeeAmbiance: true }, 'media')).toHaveLength(2);
  });

  it('ne touche pas aux pièces déjà à quatre ; une carte, elle, paie son coût', () => {
    // Le budget rendu paie une rangée, jamais deux : un bloc à quatre places n'en gagne pas une
    // cinquième.
    expect(ordreCommandes(QUATRE, { ...CALME, rangeeAmbiance: false }, null)).toHaveLength(4);
    expect(ordreCommandes(QUATRE, { ...CALME, rangeeAmbiance: false }, 'minuteur')).toHaveLength(2);
  });
});

// Ronde de correction 1 (relecture, tâche 14) : sorti de `describe('mode voiture')`, où il
// n'avait rien à faire — ce test ne porte pas sur la voiture mais sur repas/agenda.
describe('mode defaut (repas/agenda)', () => {
  // Tâche 14 (2026-08-03) : `'repas'` (cuisine) et `'agenda'` (bureau) partagent le mode
  // `defaut` — seule `'voiture'` a un gabarit assez haut pour mériter son propre mode (cf.
  // `combien`, `screen-budget.ts`). C'est `demarrage.ts`, pas `modePrincipal`, qui choisit ensuite le
  // contenu (repas/agenda/rien) affiché dans ce bloc.
  it('repas et agenda partagent le mode defaut, pas un mode dédié', () => {
    expect(modePrincipal(ctx({ blocDefaut: 'repas' }))).toBe('defaut');
    expect(modePrincipal(ctx({ blocDefaut: 'agenda' }))).toBe('defaut');
  });
});

describe('modulateursActifs', () => {
  it('n\'en rend aucun au calme', () => {
    expect(modulateursActifs(CALME)).toEqual([]);
  });

  it('chaleur au-delà de 28 degrés et soleil levé', () => {
    expect(modulateursActifs({ ...CALME, temperatureExterieure: 29 })).toEqual(['chaleur']);
  });

  it('pas de chaleur à 29 degrés si le soleil est couché', () => {
    expect(modulateursActifs({ ...CALME, temperatureExterieure: 29, soleilLeve: false })).toEqual([]);
  });

  it('pas de chaleur à exactement 28 degrés — le seuil est strict', () => {
    expect(modulateursActifs({ ...CALME, temperatureExterieure: 28 })).toEqual([]);
  });

  it('cumule invités et chaleur', () => {
    const m = modulateursActifs({ ...CALME, modeInvites: true, temperatureExterieure: 35 });
    expect(m.sort()).toEqual(['chaleur', 'invites']);
  });
});

describe('ordreCommandes', () => {
  const noms = (b: Bouton[]) => b.map((x) => x.libelle);

  it('ordre par défaut : les quatre premières déclarées, Ambilight exclu', () => {
    expect(noms(ordreCommandes(COMMANDES, CALME, null))).toEqual(['Lumières', 'Chauffage', 'Porte', 'Rideau']);
  });

  it('chaleur : le rideau passe premier et son libellé devient une consigne', () => {
    expect(noms(ordreCommandes(COMMANDES, { ...CALME, temperatureExterieure: 35 }, null)))
      .toEqual(['Fermer', 'Lumières', 'Chauffage', 'Porte']);
  });

  it('le libellé « Fermer » ne survit pas à la fin de la chaleur', () => {
    // Écart assumé par rapport au spec, qui écrivait « Fermer · 35° dehors » : la tuile fait
    // ~160 px de large et `.commande .t` est en 14 px — dix-neuf caractères y débordent. La
    // température est de toute façon déjà dans le bandeau, et le projet interdit la même donnée
    // deux fois sur une même tablette.
    expect(noms(ordreCommandes(COMMANDES, CALME, null))).toContain('Rideau');
  });

  it('serrure déverrouillée : la porte passe première', () => {
    expect(noms(ordreCommandes(COMMANDES, { ...CALME, serrureDeverrouillee: true }, null)))
      .toEqual(['Porte', 'Lumières', 'Chauffage', 'Rideau']);
  });

  // Deux commandes, et la seconde revient TOUJOURS à la commande épinglée (« Porte », demande du
  // propriétaire du 2026-08-04) : c'est « Lumières » qui cède en cinéma — arbitrage explicite,
  // l'Ambilight est le réglage qu'on cherche pendant un film.
  it('cinéma : deux commandes seulement, Ambilight puis Porte', () => {
    expect(noms(ordreCommandes(COMMANDES, CALME, 'cinema'))).toEqual(['Ambilight', 'Porte']);
  });

  it('média : deux commandes seulement, Lumières puis Porte', () => {
    expect(noms(ordreCommandes(COMMANDES, CALME, 'media'))).toEqual(['Lumières', 'Porte']);
  });

  // The promotions follow the stack's HEAD card, whatever the context says (spec 2026-10-24).
  it('the promotions are keyed by the head card, never by the context', () => {
    expect(noms(ordreCommandes(COMMANDES, { ...CALME, ecranAllume: true }, 'aspirateur')))
      .toEqual(['Lumières', 'Porte']);
    expect(noms(ordreCommandes(COMMANDES, { ...CALME, ecranAllume: true }, null)))
      .toEqual(['Lumières', 'Chauffage', 'Porte', 'Rideau']);
  });

  it('la chaleur prime sur la serrure quand les deux sont vraies', () => {
    expect(noms(ordreCommandes(COMMANDES, {
      ...CALME, temperatureExterieure: 35, serrureDeverrouillee: true }, null))[0]).toBe('Fermer');
  });

  it('n\'invente jamais une commande absente de la déclaration', () => {
    const deux = COMMANDES.slice(0, 2);
    expect(noms(ordreCommandes(deux, CALME, null))).toEqual(['Lumières', 'Chauffage']);
  });

  it('chaleur avec tableau incomplet : ignore le Rideau absent sans inventer undefined', () => {
    // Contexte chaleur + tableau sans Rideau → remonter() cherche 'Rideau', ne le trouve pas,
    // le filtre l'écarte. Résultat : commandes présentes dans leur ordre, pas d'undefined.
    const sansRideau = COMMANDES.filter((b) => b.libelle !== 'Rideau');
    const résultat = ordreCommandes(sansRideau, { ...CALME, temperatureExterieure: 35 }, null);
    // Sans Rideau, remonter() écarte le 'Rideau' manquant et retourne les 4 commandes restantes.
    expect(noms(résultat)).toEqual(['Lumières', 'Chauffage', 'Porte', 'Ambilight']);
    // Garantie structurelle : aucun undefined dans le résultat.
    expect(résultat.every((b) => b !== undefined)).toBe(true);
  });
});

/** Tâche 19 (2026-08-03) : la cuisine et le bureau passent de deux à quatre commandes déclarées.
 *  `ordreCommandes` coupe à `combien(mode)` APRÈS avoir remonté certains libellés : le risque
 *  n'est donc pas la tuile ajoutée, c'est celle qui pourrait tomber hors coupe à cause d'elle,
 *  dans les modes à deux commandes. Exercé sur les VRAIES déclarations (`ECRANS`) et non sur un
 *  tableau de laboratoire : c'est le contenu réel de `ecran.ts` qui décide ici. */
describe('ordreCommandes — cuisine et bureau à quatre commandes (tâche 19)', () => {
  const noms = (b: Bouton[]) => b.map((x) => x.libelle);

  it('cuisine, mode courant : les quatre déclarées, dans leur ordre', () => {
    expect(noms(ordreCommandes(ECRANS.cuisine.commandes, CALME, null)))
      .toEqual(['Hotte', 'Rideau', 'Garde-manger', 'Recette']);
  });

  it('bureau, mode courant : les quatre déclarées, dans leur ordre', () => {
    expect(noms(ordreCommandes(ECRANS.bureau.commandes, CALME, null)))
      .toEqual(['Chauffage', 'Chambre', 'Ventilateur', 'Velux']);
  });

  // Le seul mode qui réordonne réellement l'une de ces deux pièces : `media` remonte
  // « Chauffage », déclaré en tête au bureau. Il reste donc premier, et « Chambre » garde la
  // seconde place — les deux nouvelles cèdent la place, exactement comme avant cette tâche.
  it('bureau, mode média : Chauffage puis Chambre — résultat identique à avant la tâche 19', () => {
    expect(noms(ordreCommandes(ECRANS.bureau.commandes, CALME, 'media')))
      .toEqual(['Chauffage', 'Chambre']);
  });

  // 2026-08-29 : la coupe à deux rend maintenant la Hotte et le Rideau, les deux premières
  // déclarées. C'est le corollaire assumé de leur remontée en tête — sur une tablette de cuisine
  // où de la musique joue, ce sont aussi les deux commandes qu'on cherche le plus. Courses et
  // Recette restent à un appui : la ligne de synthèse ouvre la vue Tâches, et le bloc central du
  // mode média n'a de toute façon pas la place pour quatre tuiles.
  it('cuisine, mode média : les deux premières déclarées, Hotte et Rideau', () => {
    expect(noms(ordreCommandes(ECRANS.cuisine.commandes, CALME, 'media')))
      .toEqual(['Hotte', 'Rideau']);
  });

  // Le bureau ne déclare ni « Rideau » ni « Porte » : `remonter` ignore un libellé absent, son
  // ordre déclaré est donc conservé intact sous les deux modulateurs.
  it('bureau : ni la chaleur ni la serrure ne délogent rien, aucun des deux libellés n\'y figure', () => {
    for (const c of [{ ...CALME, temperatureExterieure: 35 },
                     { ...CALME, serrureDeverrouillee: true }]) {
      expect(noms(ordreCommandes(ECRANS.bureau.commandes, c, null)))
        .toEqual(noms(ECRANS.bureau.commandes));
    }
  });

  // La cuisine, elle, DÉCLARE un rideau depuis le 2026-08-29 : le modulateur `chaleur` s'y
  // applique donc pour de bon, et c'est exactement ce pour quoi il existe — « ferme les rideaux »
  // vaut autant derrière la fenêtre de la cuisine que derrière la baie du salon. Le libellé
  // devient la consigne, comme au salon, et aucune tuile ne tombe : quatre déclarées, quatre
  // places.
  it('cuisine, chaleur : le rideau passe premier et devient la consigne « Fermer »', () => {
    expect(noms(ordreCommandes(ECRANS.cuisine.commandes, { ...CALME, temperatureExterieure: 35 }, null)))
      .toEqual(['Fermer', 'Hotte', 'Garde-manger', 'Recette']);
  });

  it('cuisine : la serrure déverrouillée n\'y déloge rien, « Porte » n\'y est pas déclarée', () => {
    expect(noms(ordreCommandes(ECRANS.cuisine.commandes, { ...CALME, serrureDeverrouillee: true }, null)))
      .toEqual(noms(ECRANS.cuisine.commandes));
  });

  // Le mode `minuteur` (cuisine) est une carte : une rangée de deux commandes, quatre déclarées ou
  // deux — la grille ne grandit jamais avec le nombre déclaré.
  it('le mode minuteur rend deux commandes, quel que soit le nombre déclaré', () => {
    expect(ordreCommandes(ECRANS.cuisine.commandes, CALME, 'minuteur')).toHaveLength(2);
  });
});

/** Commande épinglée (2026-08-04, demande du propriétaire) : « la porte doit rester affichée tout
 *  le temps, à part la nuit » sur la tablette salon. La nuit n'a rien à exercer ici — l'écran de
 *  nuit ne rend aucune commande, `rendreNuit` ne consulte même pas `ordreCommandes` — donc les
 *  tests portent sur les modes du jour, ceux qui coupaient la porte hors de la vue.
 *  Exercé sur les VRAIES déclarations (`ECRANS.salon`) : c'est `ecran.ts` qui décide quelle
 *  commande est épinglée, ce fichier ne fait que vérifier la conséquence. */
describe('ordreCommandes — commande épinglée (salon, 2026-08-04)', () => {
  const noms = (b: Bouton[]) => b.map((x) => x.libelle);
  const salon = ECRANS.salon.commandes;
  /** Le contexte tel que `demarrage.ts` le construit VRAIMENT pour cette pièce : elle ne déclare
   *  plus aucune ambiance depuis le 2026-08-29, donc `rangeeAmbiance: false`. Exercer le salon
   *  avec `CALME` (rangée présente) décrirait une pièce qui n'existe pas. */
  const SALON: ContexteModes = { ...CALME, rangeeAmbiance: false };

  // 2026-10-11: the door is TALL (two places, `Bouton.haute`) — the Heating, last unpinned tile
  // of the cut, gives it its place.
  it('default mode: Lights, the tall door and the curtain', () => {
    expect(noms(ordreCommandes(salon, SALON, null)))
      .toEqual(['Lumières', 'Porte', 'Rideau']);
  });

  // 2026-08-29 : le salon n'a plus de rangée « Ambiance », donc plus de mode à deux commandes —
  // ses quatre places tiennent dans tous les modes du jour (cf. `rangeeAmbiance` plus haut). Ce
  // que ce test exigeait (« la porte survit ») est donc élargi à ce que le propriétaire a
  // demandé : la porte ET le rideau, dans TOUS les modes, y compris ceux à bloc central haut.
  it('la porte ET le rideau survivent à tous les modes du jour', () => {
    const cas: Array<[string, ContexteModes, CardType | null]> = [
      ['defaut', SALON, null],
      ['cinema', SALON, 'cinema'],
      ['media', SALON, 'media'],
      ['voiture', { ...SALON, blocDefaut: 'voiture' }, null],
      ['aspirateur', SALON, 'aspirateur'],
      ['alerte', { ...SALON, alerte: true }, null],
      ['aeration', SALON, 'aeration'],
    ];
    for (const [nom, c, head] of cas) {
      const resultat = noms(ordreCommandes(salon, c, head));
      // One row under a card (`arrangement`), the two pins fill it.
      expect(resultat, nom).toHaveLength(head !== null ? 2 : 3);
      expect(resultat, nom).toContain('Porte');
      expect(resultat, nom).toContain('Rideau');
    }
  });

  // 2026-10-24: under the redesigned media card the living room has two places (`arrangement`,
  // `screen-budget.ts`), and the two pins take them: Ambilight in cinema and Lights in media give
  // way. Until then (four places) Ambilight kept the first place and the Heating gave way.
  it('cinéma et média : deux places, les deux épingles les prennent', () => {
    expect(noms(ordreCommandes(salon, SALON, 'cinema'))).toEqual(['Porte', 'Rideau']);
    expect(noms(ordreCommandes(salon, SALON, 'media'))).toEqual(['Porte', 'Rideau']);
  });

  it('voiture : l\'ordre déclaré suffit, aucune épingle n\'a à intervenir', () => {
    expect(noms(ordreCommandes(salon, { ...SALON, blocDefaut: 'voiture' }, null)))
      .toEqual(['Lumières', 'Porte', 'Rideau']);
  });

  // Le cas que `DEUX_EPINGLES` couvre et que le salon ne rencontre plus : deux épingles pour deux
  // places. Elles les prennent toutes les deux — une épingle est une SOUSTRACTION sur le budget
  // du mode, jamais une rangée de plus.
  it('deux épingles pour deux places : elles prennent les deux, dans l\'ordre déclaré', () => {
    expect(noms(ordreCommandes(DEUX_EPINGLES, CALME, 'media')))
      .toEqual(['Porte', 'Rideau']);
  });

  // Les modulateurs ne doivent pas rouvrir la brèche que cette tâche ferme : la chaleur remonte
  // « Rideau » (renommé « Fermer ») et la serrure déverrouillée remonte « Porte ». Aucun des deux
  // ne peut faire retomber la porte hors de la coupe, dans aucun mode.
  it('ni la chaleur ni la serrure déverrouillée ne délogent la porte ou le rideau', () => {
    const contextes: Array<[ContexteModes, CardType | null]> = [
      [{ ...SALON, temperatureExterieure: 35 }, null],
      [{ ...SALON, serrureDeverrouillee: true }, null],
      [{ ...SALON, temperatureExterieure: 35 }, 'media'],
      [{ ...SALON, temperatureExterieure: 35 }, 'cinema'],
      [{ ...SALON, temperatureExterieure: 35, blocDefaut: 'voiture' }, null],
      [{ ...SALON, serrureDeverrouillee: true }, 'cinema'],
      [{ ...SALON, alerte: true }, null],
      [SALON, 'aspirateur'],
      [SALON, 'aeration'],
    ];
    for (const [c, head] of contextes) {
      const resultat = noms(ordreCommandes(salon, c, head));
      const cle = `${JSON.stringify(c)} ${head}`;
      expect(resultat, cle).toContain('Porte');
      // Sous chaleur, « Rideau » est renommé « Fermer » : c'est la même tuile, et la consigne est
      // justement ce qu'on veut lire ce jour-là.
      expect(resultat.includes('Rideau') || resultat.includes('Fermer'), cle).toBe(true);
    }
  });

  // Même discipline que `remonter` : une commande citée mais absente n'est jamais inventée. La
  // serrure muette (`Etat.estUtilisable` faux, `rendu/corps.ts` filtre en amont) ne doit pas
  // faire apparaître une tuile morte, ni un trou dans la rangée.
  it('serrure indisponible : rien n\'est inventé, la coupe reste pleine', () => {
    const sansPorte = salon.filter((b) => b.libelle !== 'Porte');
    // Le rideau reste épinglé : c'est lui, et lui seul, qui occupe alors la dernière place.
    // Two places under the media card (2026-10-24): the mode's first tile, then the curtain.
    expect(noms(ordreCommandes(sansPorte, SALON, 'cinema'))).toEqual(['Ambilight', 'Rideau']);
    expect(noms(ordreCommandes(sansPorte, SALON, 'media'))).toEqual(['Lumières', 'Rideau']);
    expect(noms(ordreCommandes(sansPorte, SALON, null)))
      .toEqual(['Lumières', 'Chauffage', 'Rideau', 'Ambilight']);
  });

  // Garde-fou : un épinglage ne crée jamais une rangée. Sous une carte (minuteur), le budget laisse
  // deux places et les deux épingles du salon les prennent, pas une de plus.
  it('sous une carte, les épingles prennent les deux places et pas une de plus', () => {
    expect(noms(ordreCommandes(salon, CALME, 'minuteur'))).toEqual(['Porte', 'Rideau']);
  });

  it('aucune commande épinglée en cuisine ni au bureau : leur ordre ne bouge pas', () => {
    for (const piece of [ECRANS.cuisine, ECRANS.bureau]) {
      expect(piece.commandes.some((b) => b.epingle)).toBe(false);
      expect(noms(ordreCommandes(piece.commandes, CALME, 'media'))).toHaveLength(2);
    }
  });
});

describe('modePrincipal — la hierarchie devient une liste', () => {
  /** The block modes, each with a context that triggers it alone, from the first to the last of
   *  the default list. The other six became stack cards (task 6). */
  const DECLENCHEURS: [string, Partial<ContexteModes>][] = [
    ['alerte', { alerte: true }],
    ['voiture', { blocDefaut: 'voiture' }],
    ['defaut', {}],
  ];

  it('chaque mode se declenche seul sur son contexte', () => {
    for (const [mode, sur] of DECLENCHEURS) {
      expect(modePrincipal(ctx(sur)), mode).toBe(mode);
    }
  });

  it('la priorite est celle de la liste : un contexte qui declenche TOUT rend le premier', () => {
    const tout = ctx(Object.assign({}, ...DECLENCHEURS.map(([, s]) => s)));
    expect(modePrincipal(tout)).toBe('alerte');
  });

  it('un mode absent de la liste ne se declenche jamais, meme si sa condition est vraie', () => {
    const sansAlerte = AGENCEMENT_DEFAUT.modes.filter((m) => m !== 'alerte');
    expect(modePrincipal(ctx({ alerte: true, modes: sansAlerte }))).toBe('defaut');
  });

  it('l ordre declare prime sur l ordre par defaut', () => {
    const inverse: ModePrincipal[] = ['voiture', 'alerte', 'defaut'];
    expect(modePrincipal(ctx({ alerte: true, blocDefaut: 'voiture', modes: inverse }))).toBe('voiture');
  });

  it('CONDITIONS couvre les neuf modes', () => {
    expect(Object.keys(CONDITIONS).sort()).toEqual([...AGENCEMENT_DEFAUT.modes].sort());
  });
});
