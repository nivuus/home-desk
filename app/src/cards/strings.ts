/** Every interface string of the stack cards, in one module: state labels, button names (read
 *  by assistive technology only — a card button shows an icon, never text), units. Text that
 *  comes from Home Assistant (titles, room names) never lives here. Each card adds its own. */
export const S = {
  /** Between a state label and the room it applies to: `EN COURS · Chambre`. */
  separator: ' · ',
  /** The button that hides a card on every tablet for two hours. */
  later: 'Plus tard',
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
  printer: 'Imprimante 3D',
  /** `print_status` values of ha-bambulab (`cards/printer.ts`); any other has no card. */
  printerStates: { running: 'Impression', prepare: 'Préparation', slicing: 'Découpage',
    pause: 'En pause', finish: 'Terminée', failed: 'Échec' } as Record<string, string>,
  printerError: 'Erreur',
  printerCamera: 'Caméra',
  printerResume: "Reprendre l'impression",
  printerStop: "Arrêter l'impression",
  /** The end of the print, already formatted with `Intl` by the caller. */
  printEnds: (time: string) => `Fin à ${time}`,
  /** The layer and the layer count, already formatted with `Intl` by the caller. */
  layer: (n: string, total?: string) => (total === undefined ? `Couche ${n}` : `Couche ${n} / ${total}`),
  airing: 'À faire',
  /** How long it has been open, already formatted with `Intl` by the caller. */
  openSince: (duration: string) => `Ouvert depuis ${duration}`,
  /** The label of a soft reminder card that lists what is left to do. */
  todo: 'À faire',
  /** The button that clears a card by hand: it hides the card like "later" when nothing else can. */
  done: "C'est fait",
  pets: 'Animaux',
  petsFeed: 'Nourrir',
  petsFountainEmpty: "Plus d'eau",
  petsFilter: 'Filtre à changer',
  petsFountainFault: 'Panne de la fontaine',
  petsFeederFault: 'Panne du distributeur',
  /** Days of filter life left, already formatted with `Intl` by the caller. */
  petsFilterLeft: (days: string) => `Reste ${days}`,
  plants: 'Plantes',
  plantsWatered: 'Arrosée',
  plantsDetails: 'Détails',
  /** More dry plants than the card has room for, the count already formatted with `Intl`. */
  plantsMore: (n: string) => `et ${n} autres`,
  treadmill: 'Tapis de marche',
  treadmillWalking: 'EN MARCHE',
  treadmillSlower: 'Ralentir',
  treadmillFaster: 'Accélérer',
  treadmillStop: 'Arrêter le tapis',
  air: "Qualité de l'air",
  airLabel: 'PM2,5',
  airOn: 'Allumer le purificateur',
  airOff: 'Éteindre le purificateur',
  airFavourite: 'Mode favori',
  /** The purifier's motor speed, already formatted with `Intl` by the caller. */
  airMotor: (speed: string) => `Moteur ${speed}`,
  ink: "Niveaux d'encre",
  inkLabel: 'ENCRE BASSE',
  /** More cartridges than the card has room for, the count already formatted with `Intl`. */
  inkMore: (n: string) => `et ${n} autres`,
  meal: 'REPAS',
  mealOpenRecipe: 'Ouvrir la recette',
  mealValidate: 'Valider le repas',
  shopping: 'Courses',
  /** Ingredients missing from the stock, the count already formatted with `Intl`. */
  mealMissing: (n: string) => `Manquants : ${n}`,
  pantry: 'Garde-manger',
  pantryLabel: 'À CONSOMMER',
  pantryOpen: 'Ouvrir le garde-manger',
  /** More products than the card lists, the count already formatted with `Intl`. */
  pantryMore: (n: string) => `et ${n} autres`,
  alarm: 'Alarme',
  alarmLabel: 'ARMÉE',
  /** More armed zones than the card lists, the count already formatted with `Intl`. */
  alarmMore: (n: string) => `et ${n} autres`,
  alarmDisarm: 'Désarmer',
  /** The middle line of an armed zone that asks for a code: the card has no keypad. */
  alarmCode: 'Un code est demandé : désarmer depuis le panneau de l’alarme',
} as const;
