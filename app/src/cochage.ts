/** Logique de la vue « Tâches » (tâche 18) : quelles listes `todo.*` afficher pour une pièce,
 *  comment armer/confirmer un cochage sans jamais recourir à un appui long, et comment répartir
 *  une liste dont la longueur n'est PAS bornée à la compilation — contrairement à
 *  `TOUTE_LA_MAISON` (`rendu/maison.ts`), un tableau fixe, une vraie liste `todo.*` compte autant
 *  de tâches que son propriétaire en ajoute — sur un budget de hauteur fixe (585 px, marge
 *  nulle). Fonctions et fabriques PURES, aucune dépendance au DOM ni à Home Assistant : même
 *  discipline que `contexte.ts`/`jauge.ts`, testables sans navigateur. Câblé par `demarrage.ts`
 *  (seul endroit qui connaît à la fois `Etat`/`Connexion` et l'horloge de la page) et rendu par
 *  `rendu/taches.ts`. */
import type { Piece } from './pieces';

/** Entités `todo.*` à afficher sur la vue « Tâches » de cette pièce : celles déjà déclarées dans
 *  `piece.synthese` (`todo.maintenance` partout, `todo.travail` au bureau, les DLC en cuisine —
 *  jamais dupliquées avec la ligne de synthèse, c'est la MÊME source, cf. `pieces.ts`) suivies de
 *  `piece.listesTachesExtra` (vide partout sauf en cuisine, où la liste de courses n'a pas sa place
 *  dans `synthese` — ce n'est pas un écart à signaler, cf. docstring de `Piece.listesTachesExtra`).
 *
 *  `horsTaches` : la seule échappatoire à la collecte automatique, et elle n'est posée qu'une fois
 *  (la ligne DLC du SALON, cf. son docstring dans `pieces.ts`). Sans elle, déclarer un compte de
 *  DLC à l'entrée y ferait aussi apparaître la liste, qu'on ne coche pas d'un canapé.
 *
 *  L'ORDRE est une décision : `synthese` d'abord, dans son ordre de déclaration, puis les extras.
 *  En cuisine, cela range entretien, puis DLC, puis courses — une DLC passe avant une course,
 *  parce que l'une a une échéance et l'autre non.
 *
 *  `Set` : une même entité déclarée deux fois (ne devrait jamais arriver, mais une pièce mal
 *  renseignée demain ne doit pas afficher deux fois la même liste). */
export function listesTachesPiece(piece: Piece): string[] {
  const deSynthese = piece.synthese
    .filter((s) => !s.horsTaches)
    .map((s) => s.entite)
    .filter((id) => id.startsWith('todo.'));
  return Array.from(new Set([...deSynthese, ...(piece.listesTachesExtra ?? [])]));
}

/** Nom court affiché en sous-titre de chaque ligne (cf. `TacheAffichee.liste`) — sans lui, deux
 *  tâches de listes différentes seraient indiscernables à l'écran, exactement le défaut déjà
 *  corrigé une fois sur la ligne de synthèse elle-même (todo.maintenance vs todo.travail,
 *  « indiscernables avant ce correctif », cf. `pieces.ts`). Repli sur le nom brut de l'entité
 *  (sans le préfixe `todo.`) pour une liste non prévue ici — jamais un sous-titre vide qui
 *  masquerait la provenance de la tâche. */
const LIBELLES_LISTE: Record<string, string> = {
  'todo.maintenance': 'Entretien',
  'todo.travail': 'Travail',
  'todo.home_stock_shopping': 'Courses',
  'todo.home_stock_expirations': 'À consommer',
};

export function libelleListe(entite: string): string {
  return LIBELLES_LISTE[entite] ?? entite.replace(/^todo\./, '');
}

export type TacheAffichee = { entite: string; uid: string; texte: string; liste: string };

/** Aplatit le cache brut (une entrée par liste `todo.*`, alimenté par `Connexion.listerTaches`
 *  via `demarrage.ts`) en une liste ordonnée, prête à répartir puis à rendre. `estMasquee` :
 *  exclut une tâche déjà cochée localement (retrait optimiste, cf. `creerCochage` ci-dessous) —
 *  sans ce filtre, une tâche confirmée resterait visible jusqu'au prochain rechargement complet
 *  de la liste, ce qui contredirait le retrait immédiat que l'optimisme existe pour donner. */
export function aplatirTaches(
  parListe: Record<string, { uid: string; texte: string }[]>,
  entites: string[],
  estMasquee: (entite: string, uid: string) => boolean = () => false,
): TacheAffichee[] {
  const resultat: TacheAffichee[] = [];
  for (const entite of entites) {
    for (const item of parListe[entite] ?? []) {
      if (estMasquee(entite, item.uid)) continue;
      resultat.push({ entite, uid: item.uid, texte: item.texte, liste: libelleListe(entite) });
    }
  }
  return resultat;
}

/** Combien de lignes tiennent dans le budget de la vue : `.ligne-tache` fait 64 px (même hauteur
 *  que `.commande`, cf. `base.css`), séparées par un intervalle de 8 px (même jeton que le `gap`
 *  de `.corps`) ; le reste de l'écran (padding, étiquette, bouton Retour) prend 112 px, EXACTEMENT
 *  comme la vue « Toute la maison » (même composition : étiquette + contenu + `.xl`, cf.
 *  `tests/maison.test.ts`). 6 lignes : 6×64 + 5×8 = 424, + 112 = 536 ≤ 585, avec 49 px de marge —
 *  volontairement plus large que le calcul au plus juste de « Toute la maison » (3 px de marge),
 *  cette vue affichant un contenu réel et non un tableau figé : une petite variation de rendu
 *  (métriques de police, arrondis) ne doit pas suffire à faire déborder une vraie liste de
 *  tâches. Vérifié arithmétiquement par `tests/taches.test.ts`, jamais mesuré (jsdom ne calcule
 *  aucune vraie mise en page). */
export const MAX_LIGNES_TACHES = 6;

/** Contrairement à `TOUTE_LA_MAISON` (tableau fixe, borné par construction), une liste `todo.*`
 *  compte autant de tâches que son propriétaire en ajoute — rien ne la limite à la compilation.
 *  Sans cette fonction, dépasser `MAX_LIGNES_TACHES` couperait silencieusement la ou les
 *  dernières tâches (exactement le débordement silencieux que ce projet refuse) : elle réserve
 *  donc systématiquement la DERNIÈRE ligne visible à un compte-rendu (« +N tâches ») dès que tout
 *  ne tient pas, plutôt que de laisser une tâche disparaître sans un mot. */
export function repartirTaches(
  taches: TacheAffichee[], maxLignes = MAX_LIGNES_TACHES,
): { visibles: TacheAffichee[]; reste: number } {
  if (taches.length <= maxLignes) return { visibles: taches, reste: 0 };
  const visibles = taches.slice(0, maxLignes - 1);
  return { visibles, reste: taches.length - visibles.length };
}

/** Arme un emplacement UNIQUE de confirmation (« toucher pour confirmer ») — jamais un appui
 *  long, contrainte explicite et non négociable du propriétaire (c'est le geste le plus coûteux
 *  sur ces dalles, cf. brief). Armer une nouvelle clé désarme systématiquement la précédente : au
 *  plus un minuteur vivant à la fois, quel que soit le nombre de lignes touchées — même
 *  discipline que le retour arrière optimiste (`interaction.ts`) et le retour automatique à
 *  l'accueil (`demarrage.ts`), un piège déjà payé trois fois dans ce projet, à chaque fois par une
 *  porte différente. */
export function creerArmement(minuteurFn: typeof setTimeout, delaiMs = 3000) {
  let cleArmee: string | null = null;
  let minuteur: ReturnType<typeof setTimeout> | undefined;

  function desarmer() {
    clearTimeout(minuteur);
    minuteur = undefined;
    cleArmee = null;
  }

  return {
    estArmee: (cle: string) => cleArmee === cle,
    /** Arme `cle` ; si `cle` n'a pas été confirmée avant `delaiMs`, `surExpiration` est appelé
     *  (en usage réel : `dessiner()`, pour repeindre la ligne en revenant à son état normal). */
    armer(cle: string, surExpiration: () => void) {
      clearTimeout(minuteur);   // au plus un minuteur vivant, cf. docstring de tête
      cleArmee = cle;
      minuteur = minuteurFn(() => { desarmer(); surExpiration(); }, delaiMs);
    },
    desarmer,
  };
}

export type ConnexionAppelable = {
  appelerService(domaine: string, service: string, donnees: Record<string, unknown>): void;
};

export type DependancesCochage = {
  cx: ConnexionAppelable;
  /** Même garde que `creerAppui`/`creerGeste` : cocher une tâche est une commande HA
   *  (`todo.update_item`), donc soumise à la même règle « le mode hors ligne bloque les
   *  commandes » — jamais d'exception pour cette vue. */
  estHorsLigne: () => boolean;
  minuteurFn: typeof setTimeout;
  /** Rappelé après tout changement visuel (armement posé/levé/expiré, tâche masquée) — c'est
   *  `dessiner()` en usage réel (`demarrage.ts`) ; ce module ne connaît rien au DOM. */
  surChangement: () => void;
};

function cleTache(entite: string, uid: string): string {
  return `${entite} ${uid}`;
}

/** Fabrique le dispatcher de cochage — une seule instance partagée par la vue, câblée une seule
 *  fois par `demarrage.ts` (même discipline que `creerAppui`/`creerGeste`, cf. leurs docstrings :
 *  une deuxième instance dédoublerait l'armement/le retrait optimiste). Premier appui sur une
 *  ligne : l'arme (aucun appel HA). Deuxième appui sur la MÊME ligne, dans la fenêtre de
 *  confirmation : coche réellement, et la retire localement (retrait optimiste — cf.
 *  `aplatirTaches`). Un appui sur une AUTRE ligne pendant qu'une première est armée désarme la
 *  première et arme la seconde (un seul emplacement armé à la fois, jamais deux lignes en attente
 *  de confirmation en même temps). */
export function creerCochage(deps: DependancesCochage) {
  const armement = creerArmement(deps.minuteurFn);
  const masquees = new Set<string>();

  return {
    estArmee: (entite: string, uid: string) => armement.estArmee(cleTache(entite, uid)),
    estMasquee: (entite: string, uid: string) => masquees.has(cleTache(entite, uid)),
    cocher(entite: string, uid: string) {
      // Posée avant tout effet de bord, comme `creerAppui`/`creerGeste` : ni armement ni
      // confirmation pendant une panne silencieuse — jamais un armement fantôme qui survivrait à
      // la connexion, jamais une commande envoyée dans le vide.
      if (deps.estHorsLigne()) return;
      const k = cleTache(entite, uid);
      if (!armement.estArmee(k)) {
        armement.armer(k, deps.surChangement);
        deps.surChangement();
        return;
      }
      armement.desarmer();
      masquees.add(k);
      deps.cx.appelerService('todo', 'update_item', { entity_id: entite, item: uid, status: 'completed' });
      deps.surChangement();
    },
  };
}
