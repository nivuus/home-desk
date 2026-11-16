// policy: allow-fr-file -- the French catalog.
/** French strings of the tablet. Same shape as `en.ts`, the reference catalog. */
import type { Messages } from './en';
import { capitalise, plural } from './locale';
import { frCards } from './fr-cards';
import { frSetup } from './fr-setup';

const MEAL_SLOTS_INLINE: Record<string, string> = {
  breakfast: 'petit-déjeuner', lunch: 'déjeuner', dinner: 'dîner', snack: 'collation',
};

/** "de Yaourt", "d’Abricots": French elides "de" before a vowel. Not before a y ("de yaourt")
 *  nor an h, which may be aspirated ("de haricots") — no elision is the safe default. */
function ofProduct(name: string): string {
  return /^[aeiouàâäéèêëîïôöùûüœæ]/i.test(name) ? `d’${name}` : `de ${name}`;
}

export const fr: Messages = {
  separator: ' · ',
  offline: 'Hors ligne',
  back: 'Retour',

  pantry: {
    title: 'Garde-manger',
    noAisle: 'Sans rayon',
    batches: (count, shown) => (count === 0 ? 'Vide'
      : plural(count, { one: `${shown} lot`, other: `${shown} lots` })),
    more: (shown) => `Suite › (${shown})`,
    soon: 'À consommer vite',
    soonCount: (shown) => `À consommer vite (${shown})`,
    soonUnavailable: 'À consommer vite — indisponible',
    unavailable: 'Garde-manger indisponible',
    empty: 'Rien en stock',
    loading: 'Chargement…',
    retry: 'Réessayer',
    all: 'Tout',
    left: (quantity) => `Reste ${quantity}`,
    bestBefore: (date) => `DLC ${date}`,
    takeOut: 'Sortir du stock',
    confirm: 'Confirmer — non réversible',
    touchToConfirm: 'Toucher pour confirmer',
    takingOut: (quantity, remaining) => `Sortir ${quantity} · il restera ${remaining}`,
    reasons: { consumption: 'Mangé', discard: 'Jeté', expired: 'Périmé' },
    removed: (reason, quantity, product) => `${reason} : ${quantity} ${ofProduct(product)}`,
    noAnswer: 'home-stock ne répond pas — retrait incertain',
    refused: 'home-stock a refusé — rien n’a été retiré',
    pieces: (count, shown) => plural(count, { one: `${shown} pièce`, other: `${shown} pièces` }),
  },

  night: {
    lastData: 'Dernières données',
    allLocked: 'Tout est fermé',
    temperature: (degrees, room) => `${degrees}° ${room}`,
  },

  meal: {
    slots: { breakfast: 'Petit-déjeuner', lunch: 'Déjeuner', dinner: 'Dîner', snack: 'Collation' },
    fallback: 'Repas',
    tomorrow: (slot) => `Demain, ${MEAL_SLOTS_INLINE[slot]}`,
    // `Intl` writes French weekdays in lower case ("lundi"); the label starts with it.
    onDay: (weekday, slot) => `${capitalise(weekday)}, ${MEAL_SLOTS_INLINE[slot]}`,
  },

  agenda: {
    today: 'Aujourd\'hui',
    tomorrow: 'Demain',
    appointment: 'Rendez-vous',
    appointmentLine: (time, summary) => `${time} — ${summary}`,
  },

  weather: {
    rain: (temperature) => `${temperature} et de la pluie`,
    storm: (temperature) => `${temperature} et de l'orage`,
    snow: (temperature) => `${temperature} et de la neige`,
    sun: (temperature) => `${temperature} et du soleil`,
    someClouds: (temperature) => `${temperature} et des passages nuageux`,
    clouds: (temperature) => `${temperature} et des nuages`,
    fog: (temperature) => `${temperature} et du brouillard`,
    wind: (temperature) => `${temperature} et du vent`,
    overcast: (temperature) => `${temperature} et du temps couvert`,
  },

  band: {
    inside: (value) => ['Il fait ', value, ' ici.'],
  },

  home: {
    wholeHouse: 'Toute la maison',
    ambience: 'Ambiance',
    lastKnownData: 'Dernières données connues',
    allClosedBut: 'Tout est fermé —',
    allClosed: 'Tout est fermé, rien à signaler',
    maintenance: (count, shown) =>
      plural(count, { one: `Entretien — ${shown} tâche`, other: `Entretien — ${shown} tâches` }),
  },

  tiles: {
    unknownState: 'État inconnu',
    lock: { locked: 'Verrouillée', unlocked: 'Déverrouillée', locking: 'Verrouille…',
      unlocking: 'Déverrouille…', jammed: 'Bloquée', open: 'Ouverte', opening: 'Ouverture…' },
    cover: { closed: 'Fermé', opening: 'Ouverture…', closing: 'Fermeture…', open: 'Ouvert' },
    openAt: (percent) => `Ouvert ${percent}`,
    opened: 'Ouvert',
    closed: 'Fermé',
    running: 'En marche',
    stopped: 'Arrêté',
    off: 'Éteint',
    heating: 'Chauffe',
    on: 'Allumé',
    onAt: (percent) => `Allumées ${percent}`,
    closeCurtain: 'Fermer',
  },

  car: {
    climOn: 'Clim en marche',
    charging: 'En charge',
    pluggedIn: 'Branchée',
    unplugged: 'Débranchée',
    starting: 'Démarrage…',
    stopping: 'Arrêt…',
    climStart: 'Lancer la clim',
    climStop: 'Arrêter la clim',
  },

  timer: {
    title: 'Minuteur',
    start: 'Démarrer',
  },

  tasks: {
    title: 'Tâches',
    empty: 'Aucune tâche',
    touchToConfirm: 'Toucher pour confirmer',
    more: (count, shown) => plural(count, { one: `+${shown} tâche`, other: `+${shown} tâches` }),
    seeHomeAssistant: 'Voir Home Assistant pour la suite',
  },

  recipe: {
    step: (n, title) => (title === undefined ? `Étape ${n}` : `Étape ${n} — ${title}`),
    noIngredients: 'Aucun ingrédient',
    missing: 'manquant',
    pages: (n, total) => `${n}/${total}`,
    close: 'Fermer',
    ingredients: 'Ingrédients',
    collapse: 'Réduire',
    finish: 'Terminer',
    confirm: 'Confirmer',
    finishArmed: 'Terminer — le stock sera décrémenté',
    ingredientFallback: 'Ingrédient',
    notPlanned: 'Ce repas n\'est plus au plan.',
    refused: 'La validation a été refusée.',
  },

  vacuum: {
    title: 'Aspirer',
    passes: 'Passages',
    singlePass: 'Un seul passage : le robot n’a pas donné ses limites.',
    readingRooms: 'Lecture des pièces…',
    noRooms: 'Aucune pièce n’est associée à un aspirateur dans Home Assistant (réglages de '
      + 'l’aspirateur, « associer les segments aux pièces »).',
    sending: 'Envoi…',
    launch: 'Lancer',
    loadFailed: 'Impossible de lire les pièces des aspirateurs.',
    launchFailed: (reason) => `Le ménage n’a pas démarré : ${reason}`,
    reasons: {
      robot_injoignable: 'le robot ne répond pas.',
      passages_hors_bornes: 'le robot refuse ce nombre de passages.',
      pieces_non_cartographiees: 'une pièce n’est plus associée à ce robot.',
      aspirateur_inconnu: 'cet aspirateur n’existe plus dans Home Assistant.',
      nettoyage_refuse: 'Home Assistant a refusé la commande.',
    },
    noAnswer: 'la maison ne répond pas.',
  },

  alerts: {
    feeder: { subject: 'Croquettes', text: 'Distributeur de croquettes en panne' },
    fountain: { subject: 'Fontaine', text: (pet) => `Fontaine de ${pet} à remplir` },
    door: { subject: 'Porte', text: 'Porte déverrouillée' },
  },

  cards: frCards,
  setup: frSetup,
};
