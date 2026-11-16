/** The vacuum choice (`#aspirer`): which rooms, how many passes. Opened by a long press on any
 *  vacuum tile (`long-press.ts`); a short press keeps doing what the screen configuration says.
 *
 *  Nothing here knows the house. The rooms are the Home Assistant areas each robot's segments
 *  are mapped to, and the pass bounds are the robot's own — both answered by the integration
 *  (`home_desk/aspirateurs`, `custom_components/home_desk/aspirateurs.py`). A room is launched
 *  with the robot that maps it: choosing rooms of two robots starts both. */
import { RefusHA } from '../connexion';
import { wireVacuum } from '../rendu/vacuum-choice';
import type { ScreenState } from './state';

export type VacuumRoom = { zone: string; nom: string };
export type VacuumRobot = {
  entite: string;
  nom: string;
  pieces: VacuumRoom[];
  /** `raison`: the robot could do several passes, but its bounds could not be read. */
  passages: { min: number; max: number; raison?: string };
};
export type Chosen = { entite: string; zone: string };

export type VacuumState = {
  status: 'idle' | 'loading' | 'ready' | 'sending' | 'failed';
  robots: VacuumRobot[];
  /** In the order they were tapped: the robot cleans them in that order. */
  chosen: Chosen[];
  passes: number;
  /** What went wrong, kept as a fact and worded when the view renders (`rendu/vacuum-choice.ts`),
   *  in the language of that render. */
  message: VacuumProblem | null;
};

/** Reading the rooms failed, or starting the cleaning did: `code` is the integration's refusal
 *  code (`aspirateurs.py`), `null` when the connection failed (a timeout, a closed socket). */
export type VacuumProblem = { kind: 'load' } | { kind: 'launch'; code: string | null };


export const newVacuumState = (): VacuumState =>
  ({ status: 'idle', robots: [], chosen: [], passes: 1, message: null });

/** The tiles that answer a long press with this choice. */
export const offersVacuumChoice = (entite: string): boolean => entite.startsWith('vacuum.');

/** The robots concerned by the selection, or all of them before any. */
function concerned(v: VacuumState): VacuumRobot[] {
  const ids = new Set(v.chosen.map((c) => c.entite));
  return ids.size ? v.robots.filter((r) => ids.has(r.entite)) : v.robots;
}

/** The pass range every concerned robot accepts — one launch, one number of passes. */
export function passRange(v: VacuumState): { min: number; max: number } {
  const robots = concerned(v);
  if (!robots.length) return { min: 1, max: 1 };
  return {
    min: Math.max(...robots.map((r) => r.passages.min)),
    max: Math.min(...robots.map((r) => r.passages.max)),
  };
}

/** Why a concerned robot is held to one pass, when it is held for a reason. */
export function singlePassReason(v: VacuumState): string | undefined {
  return concerned(v).find((r) => r.passages.raison !== undefined)?.passages.raison;
}

export function openVacuumChoice(s: ScreenState, entite: string): void {
  s.vacuum = { ...newVacuumState(), status: 'loading' };
  s.vacuumOrigin = entite;
  location.hash = '#aspirer';
  void loadRobots(s);
}

async function loadRobots(s: ScreenState): Promise<void> {
  const v = s.vacuum;
  try {
    const raw = await s.cx.envoyerCommande({ type: 'home_desk/aspirateurs' });
    if (s.vacuum !== v) return;
    if (!Array.isArray(raw)) throw new Error('home_desk/aspirateurs: not a list');
    const robots = raw as VacuumRobot[];
    // The robot of the tile that was held comes first: it is the one the person had in mind.
    v.robots = [...robots.filter((r) => r.entite === s.vacuumOrigin),
                ...robots.filter((r) => r.entite !== s.vacuumOrigin)];
    v.status = 'ready';
  } catch {
    if (s.vacuum !== v) return;
    v.status = 'failed';
    v.message = { kind: 'load' };
  }
  s.dessiner();
}

function toggleRoom(s: ScreenState, entite: string, zone: string): void {
  const v = s.vacuum;
  if (v.status !== 'ready' && v.status !== 'failed') return;
  const i = v.chosen.findIndex((c) => c.entite === entite && c.zone === zone);
  if (i >= 0) v.chosen.splice(i, 1);
  else v.chosen.push({ entite, zone });
  const { min, max } = passRange(v);
  v.passes = Math.min(Math.max(v.passes, min), max);
  v.message = null;
  s.dessiner();
}

function choosePasses(s: ScreenState, n: number): void {
  s.vacuum.passes = n;
  s.dessiner();
}

async function launch(s: ScreenState): Promise<void> {
  const v = s.vacuum;
  if (s.horsLigne || !v.chosen.length || v.status === 'sending' || v.status === 'loading') return;
  v.status = 'sending';
  v.message = null;
  s.dessiner();
  const parRobot = new Map<string, string[]>();
  for (const c of v.chosen) parRobot.set(c.entite, [...(parRobot.get(c.entite) ?? []), c.zone]);
  try {
    for (const [entite, zones] of parRobot) {
      await s.cx.envoyerCommande({ type: 'home_desk/aspirer', entite, zones, passages: v.passes });
    }
  } catch (error) {
    if (s.vacuum !== v) return;
    v.status = 'failed';
    v.message = { kind: 'launch', code: error instanceof RefusHA ? error.code : null };
    s.dessiner();
    return;
  }
  if (s.vacuum === v) location.hash = '';
}

export function wireVacuumView(s: ScreenState): void {
  wireVacuum({
    toggle: (entite, zone) => toggleRoom(s, entite, zone),
    passes: (n) => choosePasses(s, n),
    launch: () => { void launch(s); },
    retry: () => { s.vacuum = { ...newVacuumState(), status: 'loading' }; void loadRobots(s); s.dessiner(); },
    close: () => { location.hash = ''; },
  });
}
