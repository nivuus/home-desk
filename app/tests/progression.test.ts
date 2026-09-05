import { describe, it, expect } from 'vitest';
import { ancrerProgression, fractionAncree, fractionProgression } from '../src/progression';

// Revue tâche 15, constat I1 : le rail de progression média « avance en continu » selon le spec,
// qui l'exige DEUX FOIS — et il ne bougeait qu'au redessin, à partir d'une position que Home
// Assistant ne republie pas en continu. Sans affiche (le cas YouTube, le plus fréquent ici),
// c'est ce rail et lui seul qui donne sa vie au bloc.

const P = { position: 60, duree: 240, majLe: 1_000_000, avance: true };

describe('ancrerProgression', () => {
  it('rattrape le temps écoulé depuis le relevé de Home Assistant', () => {
    // HA a dit « 60 s » il y a 30 s : on en est à 90 s, pas à 60.
    const a = ancrerProgression(P, 1_030_000, 5_000)!;
    expect(a.secondes).toBe(90);
    expect(a.duree).toBe(240);
    expect(a.ancreMs).toBe(5_000);
  });

  it('ne rattrape rien quand le lecteur est en pause', () => {
    // Demande explicite de la revue : l'extrapolation s'arrête en pause. Un rail qui continue
    // d'avancer pendant une pause ment sur ce que fait le lecteur.
    const a = ancrerProgression({ ...P, avance: false }, 1_030_000, 0)!;
    expect(a.secondes).toBe(60);
  });

  it('ne rattrape rien sans media_position_updated_at', () => {
    // Un lecteur qui ne publie pas l'instant du relevé n'offre aucune origine : on se pose sur la
    // position brute, exactement le comportement d'avant cette correction, plutôt que d'inventer.
    const a = ancrerProgression({ position: 60, duree: 240, avance: true }, 1_030_000, 0)!;
    expect(a.secondes).toBe(60);
  });

  it('ne fait jamais RECULER le rail si l\'horloge de la tablette est en avance', () => {
    // Le serveur HA est aussi le routeur de la maison, mais rien ne garantit que les horloges
    // coïncident à la seconde près. Un retard négatif reculerait le rail à chaque redessin.
    const a = ancrerProgression(P, 999_000, 0)!;
    expect(a.secondes).toBe(60);
  });

  it('plafonne un rattrapage absurde plutôt que d\'envoyer le rail au bout', () => {
    // `media_position_updated_at` d'une session terminée restée dans les attributs, ou page
    // réveillée après une nuit d'écran éteint : l'écart ne décrit plus une lecture en cours.
    const a = ancrerProgression(P, 1_000_000 + 86_400_000, 0)!;
    expect(a.secondes).toBe(60 + 3600);
  });

  it('rend null quand il n\'y a rien à montrer', () => {
    expect(ancrerProgression(undefined, 0, 0)).toBeNull();
    expect(ancrerProgression({ position: 10, duree: 0, avance: true }, 0, 0)).toBeNull();
    expect(ancrerProgression({ position: 10, duree: -5, avance: true }, 0, 0)).toBeNull();
    expect(ancrerProgression({ position: NaN, duree: 240, avance: true }, 0, 0)).toBeNull();
  });
});

describe('fractionAncree', () => {
  it('AVANCE avec l\'horloge monotone, sans nouvel état de Home Assistant', () => {
    // Le cœur du constat I1 : entre deux `media_position`, c'est le navigateur qui décompte.
    const a = ancrerProgression(P, 1_000_000, 10_000)!;
    expect(fractionAncree(a, 10_000)).toBeCloseTo(60 / 240, 5);
    expect(fractionAncree(a, 70_000)).toBeCloseTo(120 / 240, 5);   // 60 s plus tard
    expect(fractionAncree(a, 130_000)).toBeCloseTo(180 / 240, 5);
  });

  it('se fige quand le lecteur est en pause, quelle que soit l\'horloge', () => {
    const a = ancrerProgression({ ...P, avance: false }, 1_000_000, 0)!;
    expect(fractionAncree(a, 0)).toBeCloseTo(0.25, 5);
    expect(fractionAncree(a, 600_000)).toBeCloseTo(0.25, 5);
  });

  it('reste borné à 1 quand la lecture dépasse la durée annoncée', () => {
    // `calc(var(--progression) * 100%)` (`base.css`) : au-delà de 1, le rail déborderait de son
    // bloc. Un morceau fini dont HA n'a pas encore publié la fin est un cas courant.
    const a = ancrerProgression(P, 1_000_000, 0)!;
    expect(fractionAncree(a, 10_000_000)).toBe(1);
  });

  it('rend 0 sans ancre, jamais NaN', () => {
    expect(fractionAncree(null, 12_345)).toBe(0);
  });
});

describe('fractionProgression (chemin du rendu)', () => {
  it('donne déjà la bonne valeur au PREMIER coup de peinture', () => {
    // Sans ça, le rail se poserait sur la position périmée de HA puis bondirait à la seconde
    // suivante quand le tic reprend la main.
    expect(fractionProgression(P, 1_060_000)).toBeCloseTo(120 / 240, 5);
  });

  it('rend 0 sans progression', () => {
    expect(fractionProgression(undefined, 0)).toBe(0);
  });
});
