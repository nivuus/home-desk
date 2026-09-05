// Tâche 18 : logique pure de la vue « Tâches » — quelles listes afficher (`listesTachesPiece`),
// comment répartir une liste non bornée sur un budget fixe (`repartirTaches`), et comment armer
// puis confirmer un cochage sans jamais recourir à un appui long (`creerArmement`/`creerCochage`).
// Même patron que `tests/interaction.test.ts`/`tests/geste.test.ts` : ces fabriques sont testées
// isolément, sans DOM, avec un minuteur factice injecté.
import { describe, it, expect, vi } from 'vitest';
import { PIECES, type Piece } from '../src/pieces';
import {
  listesTachesPiece, libelleListe, aplatirTaches, repartirTaches, MAX_LIGNES_TACHES,
  creerArmement, creerCochage,
} from '../src/cochage';

describe('listesTachesPiece', () => {
  it('salon : seule todo.maintenance (synthese), aucun extra', () => {
    expect(listesTachesPiece(PIECES.salon)).toEqual(['todo.maintenance']);
  });

  it('bureau : todo.travail et todo.maintenance, dans l ordre de synthese', () => {
    expect(listesTachesPiece(PIECES.bureau)).toEqual(['todo.travail', 'todo.maintenance']);
  });

  it("cuisine : trois listes, dans l'ordre entretien, DLC, courses", () => {
    // L'ordre est une DÉCISION : une DLC passe avant une course, parce que l'une a une échéance et
    // l'autre non. `listesTachesPiece` respecte l'ordre de `synthese` puis celui de
    // `listesTachesExtra` — déclarer la ligne DLC après `todo.maintenance` suffit.
    expect(listesTachesPiece(PIECES.cuisine)).toEqual([
      'todo.maintenance', 'todo.home_stock_expirations', 'todo.home_stock_shopping',
    ]);
  });

  it('salon : ne rend PAS la liste des DLC malgré sa ligne de synthèse', () => {
    // `listesTachesPiece` collecte automatiquement toute entité `todo.` de `synthese` — déclarer
    // la ligne au salon y ferait donc aussi apparaître la liste des DLC dans sa vue « Tâches », ce
    // que la spec refuse : sa vue Tâches n'a pas à porter une liste qu'on ne coche pas d'un canapé.
    // D'où `horsTaches`, posé UNIQUEMENT sur cette ligne-là.
    expect(listesTachesPiece(PIECES.salon)).toEqual(['todo.maintenance']);
  });

  it('dedoublonne une entite presente a la fois dans synthese et listesTachesExtra', () => {
    const piece: Piece = {
      nom: 'Test', temperature: 'sensor.x', ambiances: [], commandes: [], extrasMaison: [],
      synthese: [{ entite: 'todo.maintenance', operateur: '>', valeur: 0, texte: '{etat} tâche{s}' }],
      listesTachesExtra: ['todo.maintenance'],
      sources: [], ouvrants: [],
    };
    expect(listesTachesPiece(piece)).toEqual(['todo.maintenance']);
  });

  it('une piece sans aucune liste todo.* rend un tableau vide, sans lever', () => {
    const piece: Piece = {
      nom: 'Test', temperature: 'sensor.x', ambiances: [], commandes: [], synthese: [], extrasMaison: [],
      sources: [], ouvrants: [],
    };
    expect(listesTachesPiece(piece)).toEqual([]);
  });
});

describe('libelleListe', () => {
  it('connait les trois listes reelles du parc', () => {
    expect(libelleListe('todo.maintenance')).toBe('Entretien');
    expect(libelleListe('todo.travail')).toBe('Travail');
    expect(libelleListe('todo.home_stock_shopping')).toBe('Courses');
    expect(libelleListe('todo.home_stock_expirations')).toBe('À consommer');
  });

  it('replie sur le nom brut (sans le prefixe todo.) pour une liste non prevue, jamais un texte vide', () => {
    expect(libelleListe('todo.futureliste')).toBe('futureliste');
  });
});

describe('aplatirTaches', () => {
  it('aplatit plusieurs listes, dans l ordre des entites fournies, avec le bon libelle', () => {
    const parListe = {
      'todo.travail': [{ uid: 'a', texte: 'Rapport' }],
      'todo.maintenance': [{ uid: 'b', texte: 'Changer une pile' }, { uid: 'c', texte: 'Vider le bac' }],
    };
    const r = aplatirTaches(parListe, ['todo.travail', 'todo.maintenance']);
    expect(r).toEqual([
      { entite: 'todo.travail', uid: 'a', texte: 'Rapport', liste: 'Travail' },
      { entite: 'todo.maintenance', uid: 'b', texte: 'Changer une pile', liste: 'Entretien' },
      { entite: 'todo.maintenance', uid: 'c', texte: 'Vider le bac', liste: 'Entretien' },
    ]);
  });

  it('une liste absente du cache (pas encore chargee) ne fait pas lever, rend un tableau vide pour elle', () => {
    expect(aplatirTaches({}, ['todo.maintenance'])).toEqual([]);
  });

  it('exclut une tache masquee (cochage local), sans toucher aux autres', () => {
    const parListe = { 'todo.maintenance': [{ uid: 'a', texte: 'X' }, { uid: 'b', texte: 'Y' }] };
    const r = aplatirTaches(parListe, ['todo.maintenance'], (_e, uid) => uid === 'a');
    expect(r.map((t) => t.uid)).toEqual(['b']);
  });
});

describe('repartirTaches', () => {
  it('en dessous du maximum, rend toutes les taches, aucun reste', () => {
    const taches = Array.from({ length: MAX_LIGNES_TACHES }, (_, i) =>
      ({ entite: 'todo.maintenance', uid: String(i), texte: `t${i}`, liste: 'Entretien' }));
    const r = repartirTaches(taches);
    expect(r.visibles).toHaveLength(MAX_LIGNES_TACHES);
    expect(r.reste).toBe(0);
  });

  // Contrairement à TOUTE_LA_MAISON (tableau fixe), une liste todo.* n'est pas bornée à la
  // compilation : ce test prouve qu'un dépassement ne coupe JAMAIS silencieusement la dernière
  // tâche — la dernière ligne visible devient un compte-rendu du nombre exact de tâches non
  // montrées, jamais une tâche qui disparaît sans un mot.
  it('au-dessus du maximum, reserve la derniere ligne a un compte-rendu du reste EXACT', () => {
    const taches = Array.from({ length: MAX_LIGNES_TACHES + 3 }, (_, i) =>
      ({ entite: 'todo.maintenance', uid: String(i), texte: `t${i}`, liste: 'Entretien' }));
    const r = repartirTaches(taches);
    expect(r.visibles).toHaveLength(MAX_LIGNES_TACHES - 1);
    expect(r.reste).toBe(4);   // (N+3) - (MAX-1) = 4 tâches non montrées
    // Aucune tâche visible n'est perdue ni dupliquée : ce sont bien les MAX-1 premières.
    expect(r.visibles.map((t) => t.uid)).toEqual(taches.slice(0, MAX_LIGNES_TACHES - 1).map((t) => t.uid));
  });

  it('exactement un de plus que le maximum : une seule tache masquee par le compte-rendu', () => {
    const taches = Array.from({ length: MAX_LIGNES_TACHES + 1 }, (_, i) =>
      ({ entite: 'todo.maintenance', uid: String(i), texte: `t${i}`, liste: 'Entretien' }));
    const r = repartirTaches(taches);
    expect(r.reste).toBe(2);
  });
});

describe('creerArmement', () => {
  it('arme une cle, la desarme apres le delai, sans qu on ait rien confirme', () => {
    vi.useFakeTimers();
    try {
      const armement = creerArmement(setTimeout, 3000);
      const surExpiration = vi.fn();
      armement.armer('x', surExpiration);
      expect(armement.estArmee('x')).toBe(true);
      vi.advanceTimersByTime(3100);
      expect(armement.estArmee('x')).toBe(false);
      expect(surExpiration).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  // Piège déjà payé trois fois dans ce projet (interaction.ts, demarrage.ts) : armer une nouvelle
  // clé doit annuler le minuteur de la précédente, jamais en empiler un second.
  it('armer une nouvelle cle desarme la precedente et n empile jamais de second minuteur', () => {
    vi.useFakeTimers();
    try {
      const avant = vi.getTimerCount();
      const armement = creerArmement(setTimeout, 3000);
      armement.armer('a', vi.fn());
      expect(vi.getTimerCount()).toBe(avant + 1);
      armement.armer('b', vi.fn());
      expect(vi.getTimerCount()).toBe(avant + 1);   // toujours un seul, pas deux
      expect(armement.estArmee('a')).toBe(false);
      expect(armement.estArmee('b')).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('desarmer manuellement annule le minuteur, sans fuite', () => {
    vi.useFakeTimers();
    try {
      const avant = vi.getTimerCount();
      const armement = creerArmement(setTimeout, 3000);
      armement.armer('a', vi.fn());
      armement.desarmer();
      expect(vi.getTimerCount()).toBe(avant);
      expect(armement.estArmee('a')).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('dix armements rapproches sur des cles differentes ne laissent jamais plus d un minuteur vivant', () => {
    vi.useFakeTimers();
    try {
      const avant = vi.getTimerCount();
      const armement = creerArmement(setTimeout, 3000);
      for (let i = 0; i < 10; i++) armement.armer(`cle-${i}`, vi.fn());
      expect(vi.getTimerCount()).toBe(avant + 1);
      expect(armement.estArmee('cle-9')).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});

describe('creerCochage', () => {
  const deps = (surChangement = vi.fn()) => ({
    cx: { appelerService: vi.fn() },
    estHorsLigne: () => false,
    minuteurFn: setTimeout,
    surChangement,
  });

  it('premier appui : arme la ligne, n appelle aucun service, previent surChangement', () => {
    const d = deps();
    const cochage = creerCochage(d);
    cochage.cocher('todo.maintenance', 'a');
    expect(cochage.estArmee('todo.maintenance', 'a')).toBe(true);
    expect(d.cx.appelerService).not.toHaveBeenCalled();
    expect(d.surChangement).toHaveBeenCalled();
  });

  it('second appui sur la MEME ligne : confirme, appelle todo.update_item, masque localement', () => {
    const d = deps();
    const cochage = creerCochage(d);
    cochage.cocher('todo.maintenance', 'a');
    cochage.cocher('todo.maintenance', 'a');
    expect(d.cx.appelerService).toHaveBeenCalledWith(
      'todo', 'update_item', { entity_id: 'todo.maintenance', item: 'a', status: 'completed' },
    );
    expect(cochage.estMasquee('todo.maintenance', 'a')).toBe(true);
    expect(cochage.estArmee('todo.maintenance', 'a')).toBe(false);   // désarmée après confirmation
  });

  it('un appui sur une AUTRE ligne pendant qu une premiere est armee desarme la premiere', () => {
    const d = deps();
    const cochage = creerCochage(d);
    cochage.cocher('todo.maintenance', 'a');
    cochage.cocher('todo.maintenance', 'b');
    expect(cochage.estArmee('todo.maintenance', 'a')).toBe(false);
    expect(cochage.estArmee('todo.maintenance', 'b')).toBe(true);
    expect(d.cx.appelerService).not.toHaveBeenCalled();   // ni l une ni l autre confirmée
  });

  it('apres expiration de l armement (pas de confirmation), un nouvel appui rearme depuis zero', () => {
    vi.useFakeTimers();
    try {
      const d = deps();
      const cochage = creerCochage(d);
      cochage.cocher('todo.maintenance', 'a');
      vi.advanceTimersByTime(3100);
      expect(cochage.estArmee('todo.maintenance', 'a')).toBe(false);
      cochage.cocher('todo.maintenance', 'a');   // repart à zéro : un simple armement, pas un cochage
      expect(cochage.estArmee('todo.maintenance', 'a')).toBe(true);
      expect(d.cx.appelerService).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  // Règle non négociable du projet : le mode hors ligne bloque les commandes, cocher une tâche en
  // est une (appel `todo.update_item`). Ni l armement ni la confirmation ne doivent avoir lieu.
  it('hors ligne : ni armement ni confirmation, aucun appel de service', () => {
    const cx = { appelerService: vi.fn() };
    const surChangement = vi.fn();
    const cochage = creerCochage({ cx, estHorsLigne: () => true, minuteurFn: setTimeout, surChangement });
    cochage.cocher('todo.maintenance', 'a');
    expect(cochage.estArmee('todo.maintenance', 'a')).toBe(false);
    expect(cx.appelerService).not.toHaveBeenCalled();
    expect(surChangement).not.toHaveBeenCalled();

    // Preuve que l'armement précédent (posé hors ligne) n'a pas non plus été silencieusement créé
    // puis confirmé par un second appui hors ligne.
    cochage.cocher('todo.maintenance', 'a');
    expect(cx.appelerService).not.toHaveBeenCalled();
  });

  // Contrainte explicite du brief (« pas d'empilement de minuteurs ») : dix appuis rapprochés sur
  // des lignes différentes ne doivent jamais laisser plus d'un minuteur d'armement vivant.
  it('dix cochages rapproches sur des lignes differentes n arment jamais plus d un minuteur a la fois', () => {
    vi.useFakeTimers();
    try {
      const avant = vi.getTimerCount();
      const cochage = creerCochage(deps());
      for (let i = 0; i < 10; i++) cochage.cocher('todo.maintenance', `uid-${i}`);
      expect(vi.getTimerCount()).toBe(avant + 1);
    } finally { vi.useRealTimers(); }
  });
});
