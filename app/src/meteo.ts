import { numberFormat, t, type Messages } from './i18n';

export type Prevision = {
  datetime: string; condition: string; temperature: number; precipitation?: number;
};

// Tâche 14 (2026-08-03) : `prochainesHeures` (les six prochaines heures, seul appelant
// `rendu/corps.ts`) est retirée d'ici — le mode `previsions` qu'elle alimentait a disparu,
// remplacé par `defaut` (repas en cuisine, agenda au bureau, cf. `modes.ts`/`rendu/defaut.ts`).
// Plus aucun appelant : la garder aurait laissé une fonction pure mais morte, cf. la même
// discipline déjà appliquée aux icônes orphelines (`rendu/icones.ts`, revue tâche 15).
/** Home Assistant's weather conditions, mapped onto the kinds of weather the catalogs word as
 *  whole sentences (`weather` in `i18n/en.ts`). A mapping of data, not of words: each catalog
 *  writes its own sentence for each kind, in its own word order and agreement. Any other
 *  condition (`exceptional`, `hail`, `clear-night`...) is said as overcast, as before. */
type Weather = keyof Messages['weather'];
const KINDS: Readonly<Record<string, Weather>> = {
  rainy: 'rain', pouring: 'rain', lightning: 'storm', 'lightning-rainy': 'storm', snowy: 'snow',
  sunny: 'sun', clear: 'sun', partlycloudy: 'someClouds', cloudy: 'clouds', fog: 'fog', windy: 'wind',
};

/** A day's weather as one sentence of the catalog: its temperature (`temperatureCourte`) and its
 *  kind of weather. Used by `phraseDemain` and by the band's next change (`agenda.ts`). */
export function phraseMeteo(condition: string, temperature: number): string {
  return t().weather[KINDS[condition] ?? 'overcast'](temperatureCourte(temperature));
}

/** The display format of a temperature, in one place — and shared by several callers:
 *  `phraseMeteo` below, the two weather branches of `pastilleBandeau` (`agenda.ts`) and the
 *  outdoor temperature (`rendu/bandeau.ts`). That sharing, and it alone, guarantees that
 *  `Pastille.accent` is EXACTLY the text of the temperature inside `Pastille.valeur`, never by
 *  coincidence of formatting. The number goes through `Intl` in the person's number format; a
 *  rounded `-0` is written `0`. */
export function temperatureCourte(temperature: number): string {
  return `${numberFormat({ maximumFractionDigits: 0 }).format(Math.round(temperature) || 0)}°`;
}

/** Tomorrow's weather: rain wins over the condition as soon as some is forecast. */
export function phraseDemain(p: Prevision | undefined): string {
  if (!p) return '';
  return phraseMeteo((p.precipitation ?? 0) > 0.2 ? 'rainy' : p.condition, p.temperature);
}
