/** Every interface string of the stack cards, in one module: state labels, button names (read
 *  by assistive technology only — a card button shows an icon, never text), units. Text that
 *  comes from Home Assistant (titles, room names) never lives here. Each card adds its own. */
export const S = {
  /** Between a state label and the room it applies to: `EN COURS · Chambre`. */
  separator: ' · ',
  mediaPlaying: 'EN COURS',
  previous: 'Piste précédente',
  pause: 'Pause',
  play: 'Lecture',
  next: 'Piste suivante',
  timer: 'MINUTEUR',
  timerAddMinute: 'Ajouter une minute',
  timerStop: 'Arrêter le minuteur',
  /** The ring time, already formatted with `Intl` by the caller. */
  rings: (time: string) => `Sonne à ${time}`,
  recipe: 'RECETTE',
  recipeFallback: 'Recette',
  recipeOpen: 'Rouvrir la recette',
  step: (n: number, total: number) => `Étape ${n}/${total}`,
  vacuum: 'Aspirateur',
  /** Vacuum states as Home Assistant names them; an unknown state falls back on `vacuumBusy`. */
  vacuumStates: { cleaning: 'En cours', returning: 'Retour', paused: 'En pause', error: 'Bloqué' } as Record<string, string>,
  vacuumBusy: 'En marche',
  vacuumBase: 'Retour à la base',
  vacuumRooms: 'Choisir les pièces',
  car: 'Voiture',
  carCharging: 'En charge',
  carPlugIn: 'À brancher',
  carLimit: 'Limite de charge',
  carStart: 'Démarrer la charge',
  carStop: 'Arrêter la charge',
  carClimStart: 'Lancer la clim',
  carClimStop: 'Arrêter la clim',
  /** The end time and the limit, already formatted with `Intl` by the caller. */
  chargeEnds: (time: string) => `Fin à ${time}`,
  chargeLimit: (pct: string) => `Limite ${pct}`,
  airing: 'À faire',
  /** How long it has been open, already formatted with `Intl` by the caller. */
  openSince: (duration: string) => `Ouvert depuis ${duration}`,
} as const;
