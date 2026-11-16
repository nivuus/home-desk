// policy: allow-fr-file -- the French catalog.
/** French strings of the tablet. Same shape as `en.ts`, the reference catalog. */
import type { Messages } from './en';
import { capitalise, plural } from './locale';

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
  },
};
