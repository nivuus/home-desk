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
} as const;
