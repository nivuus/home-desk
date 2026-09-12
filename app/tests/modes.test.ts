import { describe, it, expect } from 'vitest';
import { modePrincipal, modulateursActifs, ordreCommandes, CONDITIONS,
  type ContexteModes, type ModePrincipal } from '../src/modes';
import { ECRANS, type Bouton } from '../src/ecran';
import { AGENCEMENT_DEFAUT } from '../src/agencement';
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

  it('le ménage prime sur le cinéma', () => {
    expect(modePrincipal({ ...CALME, aspirateurEnMarche: true, ecranAllume: true })).toBe('menage');
  });

  it('le cinéma prime sur le média', () => {
    expect(modePrincipal({ ...CALME, ecranAllume: true, sourceJoue: true })).toBe('cinema');
  });

  it('un écran allumé sans lecture donne quand même le mode cinéma', () => {
    expect(modePrincipal({ ...CALME, ecranAllume: true })).toBe('cinema');
  });

  it('une source qui joue sans écran allumé donne le mode média', () => {
    expect(modePrincipal({ ...CALME, sourceJoue: true })).toBe('media');
  });

  it('aération : ouvrant ouvert depuis plus de 10 min ET chauffage en marche', () => {
    expect(modePrincipal({ ...CALME, ouvrantOuvertDepuisMs: 11 * 60_000, chauffageEnMarche: true }))
      .toBe('aeration');
  });

  it('aération : ouvrant ouvert depuis plus de 10 min ET pluie', () => {
    expect(modePrincipal({ ...CALME, ouvrantOuvertDepuisMs: 11 * 60_000, ilPleut: true }))
      .toBe('aeration');
  });

  it('pas d\'aération sous 10 minutes, même avec le chauffage', () => {
    expect(modePrincipal({ ...CALME, ouvrantOuvertDepuisMs: 9 * 60_000, chauffageEnMarche: true }))
      .toBe('defaut');
  });

  it('pas d\'aération sur un ouvrant ouvert par beau temps sans chauffage', () => {
    expect(modePrincipal({ ...CALME, ouvrantOuvertDepuisMs: 3 * 3_600_000 })).toBe('defaut');
  });
});

describe('mode minuteur', () => {
  it('passe devant le ménage, le cinéma, le média et l\'aération', () => {
    // L'aération n'est atteignable que si `ouvrantOuvertDepuisMs > AERATION_MS` (10 min) ET
    // (`chauffageEnMarche` OU `ilPleut`) : sans ces deux champs, la condition d'aération est
    // fausse quoi qu'il arrive et le test ne prouverait le rang que face à menage/cinema/media.
    expect(modePrincipal(ctx({
      minuteurEnCours: true, aspirateurEnMarche: true, ecranAllume: true, sourceJoue: true,
      ouvrantOuvertDepuisMs: 11 * 60_000, chauffageEnMarche: true,
    }))).toBe('minuteur');
  });

  it('cède devant une alerte', () => {
    expect(modePrincipal(ctx({ minuteurEnCours: true, alerte: true }))).toBe('alerte');
  });

  it('rend la main quand plus aucun minuteur ne tourne', () => {
    expect(modePrincipal(ctx({ minuteurEnCours: false }))).toBe('defaut');
  });

  // Tâche 10 bis (arbitrage du propriétaire, 2026-08-03) : le réglage est devenu une sous-vue
  // plein écran, et la LISTE des minuteurs, mesurée en tâche 10, dépassait encore de 45 px à
  // deux commandes (630 px). Trois lignes de 62 px ne laissent la place à AUCUNE commande —
  // elles restent à un appui dans « Toute la maison ».
  it('n\'affiche aucune commande pendant un minuteur — trois lignes de 62 px ne laissent pas la place', () => {
    const commandes = [
      { libelle: 'A', icone: 'sofa', entite: 'light.a' },
      { libelle: 'B', icone: 'sofa', entite: 'light.b' },
    ];
    expect(ordreCommandes(commandes, ctx({ minuteurEnCours: true }))).toEqual([]);
  });
});

describe('mode voiture', () => {
  it('occupe son propre mode quand la pièce déclare blocDefaut: voiture', () => {
    expect(modePrincipal(ctx({ blocDefaut: 'voiture' }))).toBe('voiture');
  });

  it('retombe sur defaut sans voiture déclarée', () => {
    expect(modePrincipal(ctx({ blocDefaut: undefined }))).toBe('defaut');
  });

  it('cède devant tout mode plus urgent, y compris l\'aération', () => {
    expect(modePrincipal(ctx({
      blocDefaut: 'voiture', ouvrantOuvertDepuisMs: 11 * 60_000, chauffageEnMarche: true,
    }))).toBe('aeration');
    expect(modePrincipal(ctx({ blocDefaut: 'voiture', minuteurEnCours: true }))).toBe('minuteur');
  });

  // Tâche 10 bis, MESURÉ (tâche 10) : le bloc voiture fait 648 px, 63 px au-delà du budget — plus
  // haut que les prévisions à quatre commandes qu'il remplace. Il rejoint donc `media`/`cinema`
  // à deux commandes, comme tout bloc central plus haut que la normale.
  it('n\'en laisse que deux en mode voiture, comme les modes à bloc haut', () => {
    expect(ordreCommandes(QUATRE, ctx({ blocDefaut: 'voiture' }))).toHaveLength(2);
  });
});

/** 2026-08-29 : le nombre de commandes n'est plus une propriété du seul MODE — il dépend aussi de
 *  ce que la pièce dépense ailleurs. Une pièce qui a renoncé à sa rangée « Ambiance » (le salon
 *  depuis cette date) rend ~100 px au budget : 72 px de tuiles, l'étiquette et la gouttière, soit
 *  très exactement la deuxième rangée de commandes (64 + 10 px). Les modes à bloc central haut
 *  (media/cinema/voiture), seuls à descendre à deux, retrouvent donc leurs quatre places chez
 *  elle — et c'est ce qui permet d'y afficher Lumières, Porte, Rideau et Chauffage en même temps.
 *
 *  `rangeeAmbiance` est FACULTATIF et vaut « oui » quand il est absent : toutes les suites
 *  existantes (et la cuisine, et le bureau, qui gardent leur rangée) décrivent le même
 *  comportement qu'avant sans une ligne à changer. */
describe('rangeeAmbiance — le budget rendu par la rangée « Ambiance » supprimée', () => {
  it('sans rangée Ambiance, les modes à bloc haut retrouvent quatre commandes', () => {
    for (const mode of [ctx({ blocDefaut: 'voiture' }), ctx({ sourceJoue: true }),
                        ctx({ ecranAllume: true })]) {
      expect(ordreCommandes(QUATRE, { ...mode, rangeeAmbiance: false })).toHaveLength(4);
    }
  });

  it('avec rangée Ambiance (défaut, et champ absent), rien ne change', () => {
    expect(ordreCommandes(QUATRE, ctx({ sourceJoue: true }))).toHaveLength(2);
    expect(ordreCommandes(QUATRE, { ...ctx({ sourceJoue: true }), rangeeAmbiance: true }))
      .toHaveLength(2);
  });

  it('ne touche pas aux modes déjà à quatre ; le minuteur, lui, paie son coût', () => {
    // Le budget rendu paie une rangée, jamais deux : un mode à quatre places n'en gagne pas une
    // cinquième.
    expect(ordreCommandes(QUATRE, { ...CALME, rangeeAmbiance: false })).toHaveLength(4);
    // 2026-09-12 (plan 2, tâche 5) : `minuteur` ne reste plus à zéro « quoi qu'il arrive ». Sans
    // rangée Ambiance, son bloc (206 px) plus une rangée de commandes coûte 533 px — sous les
    // 585 : ça tient, donc 2. La croyance d'un zéro inconditionnel venait du court-circuit que
    // cette tâche a retiré (`combien` rendait 0 pour `minuteur` avant tout calcul), jamais d'une
    // vraie mesure de ce cas — `mesures.ecranModeMinuteur` (`contrat/budget.json`, 630 px) mesure
    // le cas AVEC rangée Ambiance — celui du `describe('mode minuteur')` plus haut dans ce
    // fichier, qui reste à 0. (Le test juste au-dessus porte sur `sourceJoue`, pas sur minuteur.)
    expect(ordreCommandes(QUATRE, { ...ctx({ minuteurEnCours: true }), rangeeAmbiance: false }))
      .toHaveLength(2);
  });
});

// Ronde de correction 1 (relecture, tâche 14) : sorti de `describe('mode voiture')`, où il
// n'avait rien à faire — ce test ne porte pas sur la voiture mais sur repas/agenda.
describe('mode defaut (repas/agenda)', () => {
  // Tâche 14 (2026-08-03) : `'repas'` (cuisine) et `'agenda'` (bureau) partagent le mode
  // `defaut` — seule `'voiture'` a un gabarit assez haut pour mériter son propre mode (cf.
  // `combien`, `modes.ts`). C'est `demarrage.ts`, pas `modePrincipal`, qui choisit ensuite le
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

  it('cumule invités, chaleur et DeLorean', () => {
    const m = modulateursActifs({
      ...CALME, modeInvites: true, temperatureExterieure: 35, instantDelorean: true });
    expect(m.sort()).toEqual(['chaleur', 'delorean', 'invites']);
  });
});

describe('ordreCommandes', () => {
  const noms = (b: Bouton[]) => b.map((x) => x.libelle);

  it('ordre par défaut : les quatre premières déclarées, Ambilight exclu', () => {
    expect(noms(ordreCommandes(COMMANDES, CALME))).toEqual(['Lumières', 'Chauffage', 'Porte', 'Rideau']);
  });

  it('chaleur : le rideau passe premier et son libellé devient une consigne', () => {
    expect(noms(ordreCommandes(COMMANDES, { ...CALME, temperatureExterieure: 35 })))
      .toEqual(['Fermer', 'Lumières', 'Chauffage', 'Porte']);
  });

  it('le libellé « Fermer » ne survit pas à la fin de la chaleur', () => {
    // Écart assumé par rapport au spec, qui écrivait « Fermer · 35° dehors » : la tuile fait
    // ~160 px de large et `.commande .t` est en 14 px — dix-neuf caractères y débordent. La
    // température est de toute façon déjà dans le bandeau, et le projet interdit la même donnée
    // deux fois sur une même tablette.
    expect(noms(ordreCommandes(COMMANDES, CALME))).toContain('Rideau');
  });

  it('serrure déverrouillée : la porte passe première', () => {
    expect(noms(ordreCommandes(COMMANDES, { ...CALME, serrureDeverrouillee: true })))
      .toEqual(['Porte', 'Lumières', 'Chauffage', 'Rideau']);
  });

  // Deux commandes, et la seconde revient TOUJOURS à la commande épinglée (« Porte », demande du
  // propriétaire du 2026-08-04) : c'est « Lumières » qui cède en cinéma — arbitrage explicite,
  // l'Ambilight est le réglage qu'on cherche pendant un film.
  it('cinéma : deux commandes seulement, Ambilight puis Porte', () => {
    expect(noms(ordreCommandes(COMMANDES, { ...CALME, ecranAllume: true })))
      .toEqual(['Ambilight', 'Porte']);
  });

  it('média : deux commandes seulement, Lumières puis Porte', () => {
    expect(noms(ordreCommandes(COMMANDES, { ...CALME, sourceJoue: true })))
      .toEqual(['Lumières', 'Porte']);
  });

  it('la chaleur prime sur la serrure quand les deux sont vraies', () => {
    expect(noms(ordreCommandes(COMMANDES, {
      ...CALME, temperatureExterieure: 35, serrureDeverrouillee: true }))[0]).toBe('Fermer');
  });

  it('n\'invente jamais une commande absente de la déclaration', () => {
    const deux = COMMANDES.slice(0, 2);
    expect(noms(ordreCommandes(deux, CALME))).toEqual(['Lumières', 'Chauffage']);
  });

  it('chaleur avec tableau incomplet : ignore le Rideau absent sans inventer undefined', () => {
    // Contexte chaleur + tableau sans Rideau → remonter() cherche 'Rideau', ne le trouve pas,
    // le filtre l'écarte. Résultat : commandes présentes dans leur ordre, pas d'undefined.
    const sansRideau = COMMANDES.filter((b) => b.libelle !== 'Rideau');
    const résultat = ordreCommandes(sansRideau, { ...CALME, temperatureExterieure: 35 });
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
    expect(noms(ordreCommandes(ECRANS.cuisine.commandes, CALME)))
      .toEqual(['Hotte', 'Rideau', 'Courses', 'Recette']);
  });

  it('bureau, mode courant : les quatre déclarées, dans leur ordre', () => {
    expect(noms(ordreCommandes(ECRANS.bureau.commandes, CALME)))
      .toEqual(['Chauffage', 'Chambre', 'Ventilateur', 'Velux']);
  });

  // Le seul mode qui réordonne réellement l'une de ces deux pièces : `media` remonte
  // « Chauffage », déclaré en tête au bureau. Il reste donc premier, et « Chambre » garde la
  // seconde place — les deux nouvelles cèdent la place, exactement comme avant cette tâche.
  it('bureau, mode média : Chauffage puis Chambre — résultat identique à avant la tâche 19', () => {
    expect(noms(ordreCommandes(ECRANS.bureau.commandes, { ...CALME, sourceJoue: true })))
      .toEqual(['Chauffage', 'Chambre']);
  });

  // 2026-08-29 : la coupe à deux rend maintenant la Hotte et le Rideau, les deux premières
  // déclarées. C'est le corollaire assumé de leur remontée en tête — sur une tablette de cuisine
  // où de la musique joue, ce sont aussi les deux commandes qu'on cherche le plus. Courses et
  // Recette restent à un appui : la ligne de synthèse ouvre la vue Tâches, et le bloc central du
  // mode média n'a de toute façon pas la place pour quatre tuiles.
  it('cuisine, mode média : les deux premières déclarées, Hotte et Rideau', () => {
    expect(noms(ordreCommandes(ECRANS.cuisine.commandes, { ...CALME, sourceJoue: true })))
      .toEqual(['Hotte', 'Rideau']);
  });

  // Le bureau ne déclare ni « Rideau » ni « Porte » : `remonter` ignore un libellé absent, son
  // ordre déclaré est donc conservé intact sous les deux modulateurs.
  it('bureau : ni la chaleur ni la serrure ne délogent rien, aucun des deux libellés n\'y figure', () => {
    for (const c of [{ ...CALME, temperatureExterieure: 35 },
                     { ...CALME, serrureDeverrouillee: true }]) {
      expect(noms(ordreCommandes(ECRANS.bureau.commandes, c)))
        .toEqual(noms(ECRANS.bureau.commandes));
    }
  });

  // La cuisine, elle, DÉCLARE un rideau depuis le 2026-08-29 : le modulateur `chaleur` s'y
  // applique donc pour de bon, et c'est exactement ce pour quoi il existe — « ferme les rideaux »
  // vaut autant derrière la fenêtre de la cuisine que derrière la baie du salon. Le libellé
  // devient la consigne, comme au salon, et aucune tuile ne tombe : quatre déclarées, quatre
  // places.
  it('cuisine, chaleur : le rideau passe premier et devient la consigne « Fermer »', () => {
    expect(noms(ordreCommandes(ECRANS.cuisine.commandes, { ...CALME, temperatureExterieure: 35 })))
      .toEqual(['Fermer', 'Hotte', 'Courses', 'Recette']);
  });

  it('cuisine : la serrure déverrouillée n\'y déloge rien, « Porte » n\'y est pas déclarée', () => {
    expect(noms(ordreCommandes(ECRANS.cuisine.commandes, { ...CALME, serrureDeverrouillee: true })))
      .toEqual(noms(ECRANS.cuisine.commandes));
  });

  // Le mode `minuteur` (cuisine) ne rend AUCUNE commande : la rangée entière disparaît, quatre
  // déclarées ou deux. Sa hauteur ne doit donc pas bouger d'un pixel avec cette tâche.
  it('le mode minuteur ne rend toujours aucune commande, quel que soit le nombre déclaré', () => {
    expect(ordreCommandes(ECRANS.cuisine.commandes, ctx({ minuteurEnCours: true }))).toEqual([]);
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

  it('mode courant : les quatre premières déclarées, la porte comprise — inchangé', () => {
    expect(noms(ordreCommandes(salon, SALON)))
      .toEqual(['Lumières', 'Chauffage', 'Porte', 'Rideau']);
  });

  // 2026-08-29 : le salon n'a plus de rangée « Ambiance », donc plus de mode à deux commandes —
  // ses quatre places tiennent dans tous les modes du jour (cf. `rangeeAmbiance` plus haut). Ce
  // que ce test exigeait (« la porte survit ») est donc élargi à ce que le propriétaire a
  // demandé : la porte ET le rideau, dans TOUS les modes, y compris ceux à bloc central haut.
  it('la porte ET le rideau survivent à tous les modes du jour', () => {
    const modes: Array<[string, ContexteModes]> = [
      ['defaut', SALON],
      ['cinema', { ...SALON, ecranAllume: true }],
      ['media', { ...SALON, sourceJoue: true }],
      ['voiture', { ...SALON, blocDefaut: 'voiture' }],
      ['menage', { ...SALON, aspirateurEnMarche: true }],
      ['alerte', { ...SALON, alerte: true }],
      ['aeration', { ...SALON, ouvrantOuvertDepuisMs: 20 * 60_000, chauffageEnMarche: true }],
    ];
    for (const [mode, c] of modes) {
      const resultat = noms(ordreCommandes(salon, c));
      expect(resultat, mode).toHaveLength(4);
      expect(resultat, mode).toContain('Porte');
      expect(resultat, mode).toContain('Rideau');
    }
  });

  // C'est le CHAUFFAGE qui cède, jamais une des deux épinglées : la première place reste au
  // réordonnancement du mode (l'Ambilight pendant un film), les deux dernières aux épingles.
  it('cinéma : Ambilight garde la première place, Porte et Rideau prennent les dernières', () => {
    expect(noms(ordreCommandes(salon, { ...SALON, ecranAllume: true })))
      .toEqual(['Ambilight', 'Lumières', 'Porte', 'Rideau']);
  });

  it('média et voiture : l\'ordre déclaré suffit, aucune épingle n\'a à intervenir', () => {
    expect(noms(ordreCommandes(salon, { ...SALON, sourceJoue: true })))
      .toEqual(['Lumières', 'Chauffage', 'Porte', 'Rideau']);
    expect(noms(ordreCommandes(salon, { ...SALON, blocDefaut: 'voiture' })))
      .toEqual(['Lumières', 'Chauffage', 'Porte', 'Rideau']);
  });

  // Le cas que `DEUX_EPINGLES` couvre et que le salon ne rencontre plus : deux épingles pour deux
  // places. Elles les prennent toutes les deux — une épingle est une SOUSTRACTION sur le budget
  // du mode, jamais une rangée de plus.
  it('deux épingles pour deux places : elles prennent les deux, dans l\'ordre déclaré', () => {
    expect(noms(ordreCommandes(DEUX_EPINGLES, ctx({ sourceJoue: true }))))
      .toEqual(['Porte', 'Rideau']);
  });

  // Les modulateurs ne doivent pas rouvrir la brèche que cette tâche ferme : la chaleur remonte
  // « Rideau » (renommé « Fermer ») et la serrure déverrouillée remonte « Porte ». Aucun des deux
  // ne peut faire retomber la porte hors de la coupe, dans aucun mode.
  it('ni la chaleur ni la serrure déverrouillée ne délogent la porte ou le rideau', () => {
    const contextes = [
      { ...SALON, temperatureExterieure: 35 },
      { ...SALON, serrureDeverrouillee: true },
      { ...SALON, temperatureExterieure: 35, sourceJoue: true },
      { ...SALON, temperatureExterieure: 35, ecranAllume: true },
      { ...SALON, temperatureExterieure: 35, blocDefaut: 'voiture' as const },
      { ...SALON, serrureDeverrouillee: true, ecranAllume: true },
      { ...SALON, alerte: true },
      { ...SALON, aspirateurEnMarche: true },
      { ...SALON, ouvrantOuvertDepuisMs: 20 * 60_000, chauffageEnMarche: true },
    ];
    for (const c of contextes) {
      const resultat = noms(ordreCommandes(salon, c));
      expect(resultat, JSON.stringify(c)).toContain('Porte');
      // Sous chaleur, « Rideau » est renommé « Fermer » : c'est la même tuile, et la consigne est
      // justement ce qu'on veut lire ce jour-là.
      expect(resultat.includes('Rideau') || resultat.includes('Fermer'), JSON.stringify(c))
        .toBe(true);
    }
  });

  // Même discipline que `remonter` : une commande citée mais absente n'est jamais inventée. La
  // serrure muette (`Etat.estUtilisable` faux, `rendu/corps.ts` filtre en amont) ne doit pas
  // faire apparaître une tuile morte, ni un trou dans la rangée.
  it('serrure indisponible : rien n\'est inventé, la coupe reste pleine', () => {
    const sansPorte = salon.filter((b) => b.libelle !== 'Porte');
    // Le rideau reste épinglé : c'est lui, et lui seul, qui occupe alors la dernière place.
    expect(noms(ordreCommandes(sansPorte, { ...SALON, ecranAllume: true })))
      .toEqual(['Ambilight', 'Lumières', 'Chauffage', 'Rideau']);
    expect(noms(ordreCommandes(sansPorte, { ...SALON, sourceJoue: true })))
      .toEqual(['Lumières', 'Chauffage', 'Rideau', 'Ambilight']);
    expect(noms(ordreCommandes(sansPorte, SALON)))
      .toEqual(['Lumières', 'Chauffage', 'Rideau', 'Ambilight']);
  });

  // Garde-fou pour la cuisine : un mode à zéro commande reste à zéro. Un épinglage ne crée jamais
  // une rangée — le budget de hauteur du bloc minuteur (630 px mesurés sur 585) ne le permet pas.
  // Le salon ne déclare pas de minuteurs, donc ce mode ne l'atteint jamais ; le test le prouve
  // quand même sur ses propres commandes, épinglage compris.
  it('un mode à zéro commande le reste, épinglage compris', () => {
    expect(ordreCommandes(salon, ctx({ minuteurEnCours: true }))).toEqual([]);
  });

  it('aucune commande épinglée en cuisine ni au bureau : leur ordre ne bouge pas', () => {
    for (const piece of [ECRANS.cuisine, ECRANS.bureau]) {
      expect(piece.commandes.some((b) => b.epingle)).toBe(false);
      expect(noms(ordreCommandes(piece.commandes, ctx({ sourceJoue: true })))).toHaveLength(2);
    }
  });
});

// Tâche 6 (2026-08-17) : le mode `recette` garde un point de reprise sur l'accueil quand une
// recette est réduite pendant la cuisson. Contexte local à ce bloc plutôt que dérivé de `CALME` :
// verbatim du brief, il n'y a rien à réconcilier.
const CTX: ContexteModes = {
  alerte: false, aspirateurEnMarche: false, ecranAllume: false, sourceJoue: false,
  ouvrantOuvertDepuisMs: 0, chauffageEnMarche: false, ilPleut: false,
  serrureDeverrouillee: false, temperatureExterieure: 20, soleilLeve: true,
  modeInvites: false, instantDelorean: false, minuteurEnCours: false,
  recetteEnCours: false, blocDefaut: 'repas',
};

describe('mode recette', () => {
  it('prime sur le minuteur, le média et le cinéma', () => {
    expect(modePrincipal({ ...CTX, recetteEnCours: true, minuteurEnCours: true })).toBe('recette');
    expect(modePrincipal({ ...CTX, recetteEnCours: true, sourceJoue: true })).toBe('recette');
    expect(modePrincipal({ ...CTX, recetteEnCours: true, ecranAllume: true })).toBe('recette');
  });

  it('cède devant une alerte : la sécurité passe devant la cuisine', () => {
    expect(modePrincipal({ ...CTX, recetteEnCours: true, alerte: true })).toBe('alerte');
  });

  it('laisse quatre commandes, comme le mode defaut', () => {
    const boutons = [1, 2, 3, 4, 5].map((n) => ({
      libelle: `B${n}`, icone: 'bulb', entite: `light.b${n}`,
    }));
    expect(ordreCommandes(boutons, { ...CTX, recetteEnCours: true })).toHaveLength(4);
  });
});

describe('modePrincipal — la hierarchie devient une liste', () => {
  /** Les neuf modes, chacun avec un contexte qui NE DECLENCHE QUE LUI, du plus prioritaire au
   *  moins. Relevé sur la cascade de `if` d'avant cette tâche : c'est la table de vérité à ne pas
   *  bouger. */
  const DECLENCHEURS: [string, Partial<ContexteModes>][] = [
    ['alerte', { alerte: true }],
    ['recette', { recetteEnCours: true }],
    ['minuteur', { minuteurEnCours: true }],
    ['menage', { aspirateurEnMarche: true }],
    ['cinema', { ecranAllume: true }],
    ['media', { sourceJoue: true }],
    ['aeration', { ouvrantOuvertDepuisMs: 40 * 60_000, chauffageEnMarche: true }],
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
    const sansMinuteur = AGENCEMENT_DEFAUT.modes.filter((m) => m !== 'minuteur');
    expect(modePrincipal(ctx({ minuteurEnCours: true, modes: sansMinuteur }))).toBe('defaut');
  });

  it('l ordre declare prime sur l ordre par defaut', () => {
    // Média devant le ménage, l'inverse du défaut.
    const inverse: ModePrincipal[] = ['media', 'menage', 'defaut'];
    expect(modePrincipal(ctx({ aspirateurEnMarche: true, sourceJoue: true, modes: inverse })))
      .toBe('media');
  });

  it('CONDITIONS couvre les neuf modes', () => {
    expect(Object.keys(CONDITIONS).sort()).toEqual([...AGENCEMENT_DEFAUT.modes].sort());
  });
});
