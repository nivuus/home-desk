/** Logic of the "Tâches" view (task 18): which `todo.*` lists to display for a room, how to
 *  arm/confirm a check-off without ever resorting to a long press, and how to lay out a list
 *  whose length is NOT bounded at compile time — unlike `TOUTE_LA_MAISON` (`rendu/maison.ts`), a
 *  fixed array, a real `todo.*` list holds as many tasks as its owner adds — on a fixed height
 *  budget (585 px, zero margin). PURE functions and factories, no dependency on the DOM or on
 *  Home Assistant: same discipline as `contexte.ts`/`jauge.ts`, testable without a browser.
 *  Wired by `demarrage.ts` (the only place that knows both `Etat`/`Connexion` and the page's
 *  clock) and rendered by `rendu/taches.ts`. */
import type { Ecran } from './ecran';

/** `todo.*` entities to display on this room's "Tâches" view: those already declared in
 *  `piece.synthese` (`todo.maintenance` everywhere, `todo.travail` in the office, the expiry
 *  dates in the kitchen — never duplicated with the summary line, it is the SAME source, see
 *  `ecran.ts`) followed by the room's extra task lists (empty everywhere except in the kitchen,
 *  where the shopping list has no place in `synthese` — it is not a deviation to report, see the
 *  docstring of that extra-lists field of `Ecran`).
 *
 *  `horsTaches`: the only escape hatch from the automatic collection, and it is set only once
 *  (the expiry-date line of the LIVING ROOM, see its docstring in `ecran.ts`). Without it,
 *  declaring an expiry-date count at the entrance would also make the list appear there, which
 *  nobody checks off from a sofa.
 *
 *  The ORDER is a decision: `synthese` first, in its declaration order, then the extras. In the
 *  kitchen, that sorts upkeep, then expiry dates, then shopping — an expiry date comes before a
 *  purchase, because one has a deadline and the other does not.
 *
 *  `Set`: the same entity declared twice (should never happen, but a room badly filled in
 *  tomorrow must not display the same list twice). */
export function roomTodoLists(piece: Ecran): string[] {
  const deSynthese = piece.synthese
    .filter((s) => !s.horsTaches)
    .map((s) => s.entite)
    .filter((id) => id.startsWith('todo.'));
  // The extra-lists field keeps its French name: it is a wire-contract key
  // (`contrat/ecran.schema.json`), shared with the Python component and stored configs.
  return Array.from(new Set([...deSynthese, ...(piece.listesTachesExtra ?? [])]));   // policy: allow-fr
}

/** Short name displayed as the subtitle of each row (see `TacheAffichee.list`) — without it, two
 *  tasks from different lists would be indistinguishable on screen, exactly the defect already
 *  fixed once on the summary line itself (todo.maintenance vs todo.travail, "indistinguishable
 *  before this fix", see `ecran.ts`). Falls back to the raw entity name (without the `todo.`
 *  prefix) for a list not foreseen here — never an empty subtitle that would hide where the task
 *  comes from. */
const LIST_LABELS: Record<string, string> = {
  'todo.maintenance': 'Entretien',
  'todo.travail': 'Travail',
  'todo.home_stock_shopping': 'Courses',
  'todo.home_stock_expirations': 'À consommer',
};

export function listLabel(entite: string): string {
  return LIST_LABELS[entite] ?? entite.replace(/^todo\./, '');
}

export type TacheAffichee = { entite: string; uid: string; texte: string; list: string };

/** Flattens the raw cache (one entry per `todo.*` list, fed by `Connexion.listerTaches` via
 *  `demarrage.ts`) into an ordered list, ready to be laid out then rendered. `estMasquee`:
 *  excludes a task already checked off locally (optimistic removal, see `createTaskCheck` below)
 *  — without this filter, a confirmed task would stay visible until the next full reload of the
 *  list, which would contradict the immediate removal that optimism exists to give. */
export function aplatirTaches(
  byList: Record<string, { uid: string; texte: string }[]>,
  entites: string[],
  estMasquee: (entite: string, uid: string) => boolean = () => false,
): TacheAffichee[] {
  const result: TacheAffichee[] = [];
  for (const entite of entites) {
    for (const item of byList[entite] ?? []) {
      if (estMasquee(entite, item.uid)) continue;
      result.push({ entite, uid: item.uid, texte: item.texte, list: listLabel(entite) });
    }
  }
  return result;
}

/** How many rows fit in the view's budget: `.ligne-tache` is 64 px tall (same height as
 *  `.commande`, see `base.css`), separated by an 8 px gap (same token as the `gap` of `.corps`);
 *  the rest of the screen (padding, label, Back button) takes 112 px, EXACTLY like the "Toute la
 *  maison" view (same composition: label + content + `.xl`, see `tests/maison.test.ts`). 6 rows:
 *  6×64 + 5×8 = 424, + 112 = 536 ≤ 585, with 49 px of margin — deliberately wider than the
 *  tightest-fit calculation of "Toute la maison" (3 px of margin), since this view displays real
 *  content and not a frozen array: a small rendering variation (font metrics, rounding) must not
 *  be enough to make a real task list overflow. Checked arithmetically by
 *  `tests/taches.test.ts`, never measured (jsdom computes no real layout). */
export const MAX_LIGNES_TACHES = 6;

/** Unlike `TOUTE_LA_MAISON` (a fixed array, bounded by construction), a `todo.*` list holds as
 *  many tasks as its owner adds — nothing limits it at compile time. Without this function,
 *  exceeding `MAX_LIGNES_TACHES` would silently cut off the last task or tasks (exactly the
 *  silent overflow this project refuses): so it systematically reserves the LAST visible row
 *  for a summary ("+N tâches") as soon as everything does not fit, rather than letting a task
 *  disappear without a word. */
export function repartirTaches(
  taches: TacheAffichee[], maxLignes = MAX_LIGNES_TACHES,
): { visibles: TacheAffichee[]; reste: number } {
  if (taches.length <= maxLignes) return { visibles: taches, reste: 0 };
  const visibles = taches.slice(0, maxLignes - 1);
  return { visibles, reste: taches.length - visibles.length };
}

/** Arms a SINGLE confirmation slot ("touch to confirm") — never a long press, an explicit and
 *  non-negotiable constraint of the owner (it is the most costly gesture on these panels, see
 *  the brief). Arming a new key systematically disarms the previous one: at most one live timer
 *  at a time, whatever the number of rows touched — same discipline as the optimistic rollback
 *  (`interaction.ts`) and the automatic return to the home screen (`demarrage.ts`), a trap
 *  already paid for three times in this project, each time through a different door. */
export function createArming(minuteurFn: typeof setTimeout, delaiMs = 3000) {
  let cleArmee: string | null = null;
  let minuteur: ReturnType<typeof setTimeout> | undefined;

  function desarmer() {
    clearTimeout(minuteur);
    minuteur = undefined;
    cleArmee = null;
  }

  return {
    estArmee: (cle: string) => cleArmee === cle,
    /** Arms `cle`; if `cle` has not been confirmed before `delaiMs`, `surExpiration` is called
     *  (in real use: `dessiner()`, to repaint the row back to its normal state). */
    armer(cle: string, surExpiration: () => void) {
      clearTimeout(minuteur);   // at most one live timer, see the header docstring
      cleArmee = cle;
      minuteur = minuteurFn(() => { desarmer(); surExpiration(); }, delaiMs);
    },
    desarmer,
  };
}

export type ConnexionAppelable = {
  appelerService(domaine: string, service: string, data: Record<string, unknown>): void;
};

export type DependancesCochage = {
  cx: ConnexionAppelable;
  /** Same guard as `createPress`/`createGesture`: checking off a task is an HA command
   *  (`todo.update_item`), hence subject to the same "offline mode blocks commands" rule —
   *  never an exception for this view. */
  estHorsLigne: () => boolean;
  minuteurFn: typeof setTimeout;
  /** Called back after any visual change (arming set/lifted/expired, task hidden) — it is
   *  `dessiner()` in real use (`demarrage.ts`); this module knows nothing about the DOM. */
  surChangement: () => void;
};

function cleTache(entite: string, uid: string): string {
  return `${entite} ${uid}`;
}

/** Builds the check-off dispatcher — a single instance shared by the view, wired only once by
 *  `demarrage.ts` (same discipline as `createPress`/`createGesture`, see their docstrings: a
 *  second instance would duplicate the arming/the optimistic removal). First press on a row:
 *  arms it (no HA call). Second press on the SAME row, within the confirmation window: really
 *  checks it off, and removes it locally (optimistic removal — see `aplatirTaches`). A press on
 *  ANOTHER row while a first one is armed disarms the first and arms the second (a single armed
 *  slot at a time, never two rows awaiting confirmation at the same time). */
export function createTaskCheck(deps: DependancesCochage) {
  const armement = createArming(deps.minuteurFn);
  const masquees = new Set<string>();

  return {
    estArmee: (entite: string, uid: string) => armement.estArmee(cleTache(entite, uid)),
    estMasquee: (entite: string, uid: string) => masquees.has(cleTache(entite, uid)),
    cocher(entite: string, uid: string) {
      // Set before any side effect, like `createPress`/`createGesture`: neither arming nor
      // confirmation during a silent outage — never a ghost arming that would outlive the
      // connection, never a command sent into the void.
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
