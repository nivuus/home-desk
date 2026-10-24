export type CardType = 'recette' | 'minuteur' | 'media' | 'cinema' | 'aspirateur' | 'voiture'
  | 'aeration' | 'imprimante' | 'animaux' | 'plantes' | 'tapis' | 'repas' | 'garde-manger'
  | 'air' | 'alarme' | 'encre';
export type Rank = 0 | 1 | 2 | 3 | 4 | 5;
/** `key` is stable across tablets: `${type}:${main entity}`. It is what "plus tard" snoozes. */
export type Card = { key: string; type: CardType; rank: Rank };
export type StackView = { displayedKey: string | null; lastTouchMs: number | null; known: string[] };
