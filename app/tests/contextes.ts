/** Contextes `ContexteModes` partagés par les suites qui exercent `src/modes.ts`
 *  (`tests/modes.test.ts`, `tests/budget.test.ts`).
 *
 *  Ce fichier ne contient AUCUN test : nommé `contextes.ts` et non `contextes.test.ts`, même
 *  règle que `aides.ts` (cf. son en-tête) — pour que vitest ne le ramasse pas comme une suite
 *  vide. Séparé d'`aides.ts` plutôt qu'ajouté dedans : `aides.ts` importe `demarrer()` (donc
 *  l'application entière, plus `connexion` et `meteo`), qu'un test de `modes.ts` n'a aucune
 *  raison de charger pour obtenir un simple objet de contexte. */
import type { ContexteModes } from '../src/modes';

/** Contexte « rien de particulier » : aucun mode, aucun modulateur. Chaque test ne modifie que
 *  le champ qu'il exerce, pour qu'un échec désigne sans ambiguïté la règle fautive. */
export const CALME: ContexteModes = {
  alerte: false,
  aspirateurEnMarche: false,
  ecranAllume: false,
  sourceJoue: false,
  ouvrantOuvertDepuisMs: 0,
  chauffageEnMarche: false,
  ilPleut: false,
  serrureDeverrouillee: false,
  temperatureExterieure: 18,
  soleilLeve: true,
  modeInvites: false,
  instantDelorean: false,
  minuteurEnCours: false,
  recetteEnCours: false,
  blocDefaut: undefined,
};
