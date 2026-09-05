export type Prevision = {
  datetime: string; condition: string; temperature: number; precipitation?: number;
};

// Tâche 14 (2026-08-03) : `prochainesHeures` (les six prochaines heures, seul appelant
// `rendu/corps.ts`) est retirée d'ici — le mode `previsions` qu'elle alimentait a disparu,
// remplacé par `defaut` (repas en cuisine, agenda au bureau, cf. `modes.ts`/`rendu/defaut.ts`).
// Plus aucun appelant : la garder aurait laissé une fonction pure mais morte, cf. la même
// discipline déjà appliquée aux icônes orphelines (`rendu/icones.ts`, revue tâche 15).
const TEMPS: Record<string, string> = {
  rainy: 'de la pluie', pouring: 'de la pluie', lightning: 'de l\'orage',
  'lightning-rainy': 'de l\'orage', snowy: 'de la neige', sunny: 'du soleil',
  clear: 'du soleil', partlycloudy: 'des passages nuageux', cloudy: 'des nuages',
  fog: 'du brouillard', windy: 'du vent',
};

/** Traduit une condition Home Assistant brute en trois mots de temps en français. Extrait de
 *  `phraseDemain` (tâche 13) pour que `prochainChangement` (`agenda.ts`) puisse former la même
 *  phrase à partir d'une condition/température seules, sans avoir la précipitation du jour
 *  annoncé — seule `phraseDemain` a besoin de la priorité pluie/condition ci-dessous. */
export function texteCondition(condition: string): string {
  return TEMPS[condition] ?? 'du temps couvert';
}

/** Le format d'affichage d'une température, à un seul endroit — mais plus à un seul APPELANT :
 *  `phraseDemain` ci-dessous, les deux branches météo de `pastilleBandeau` (`agenda.ts`) et
 *  l'affichage de la température extérieure (`rendu/bandeau.ts`) le partagent tous les trois.
 *  C'est ce partage, et lui seul, qui garantit que `Pastille.accent` est le préfixe EXACT de
 *  `Pastille.valeur`, jamais par coïncidence de formatage — et que les trois températures groupées
 *  sous le même accent de couleur (`.cap .val`) affichent bien le même format. Prend un `number` et
 *  non une `Prevision` : `prochainChangement` (`agenda.ts`) ne rend que
 *  `{ jour, condition, temperature }` et devrait sinon fabriquer une fausse prévision pour appeler
 *  cette fonction. */
export function temperatureCourte(temperature: number): string {
  return `${Math.round(temperature)}°`;
}

export function phraseDemain(p: Prevision | undefined): string {
  if (!p) return '';
  const quoi = (p.precipitation ?? 0) > 0.2 ? 'de la pluie' : texteCondition(p.condition);
  return `${temperatureCourte(p.temperature)} et ${quoi}`;
}
