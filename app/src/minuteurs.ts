/** Source UNIQUE des valeurs par défaut de `intervalFn`/`minuteurFn` injectées dans `Connexion`
 *  (`connexion.ts`) et `demarrer()` (`demarrage.ts`).
 *
 *  Ronde de correction 2 (relecteur) : avant ce module, `.bind(globalThis)` était recopié à trois
 *  endroits indépendants (`connexion.ts` une fois, `demarrage.ts` deux fois) — trois points de
 *  défaillance pour un seul et même invariant. Le relecteur a montré que casser UN SEUL de ces
 *  trois sites produit trois comportements différents et surtout PAS le même défaut : retirer le
 *  bind sur `connexion.ts` seul se corrige tout seul en ~1 s (`demarrage.ts` reprogramme une
 *  tentative avant que `surSilence` n'ait eu besoin de se réarmer, cf. « Ronde de correction 1 »
 *  du rapport de tâche 11 pour le mécanisme précis) ; retirer un des deux binds de `demarrage.ts`
 *  seul ne casse rien tant que `connexion.ts` reste correct (ses sites à risque, `armerRetour` et
 *  le retry du `catch`, ne sont jamais exercés si la connexion réussit du premier coup) — deux
 *  angles morts sur trois, silencieux. En centralisant les trois usages sur CES DEUX fonctions,
 *  une régression future casse soit les trois appels d'un coup (détecté à coup sûr, cf. la preuve
 *  de la ronde de correction 1 : il faut casser les DEUX sites en même temps pour que le
 *  vérificateur rougisse), soit rien — plus d'entre-deux invisible.
 *
 *  Le problème d'origine (`WindowOrWorkerGlobalScope.setInterval`/`setTimeout` vérifient leur
 *  récepteur) n'est PAS réglé ici par `.bind(globalThis)` mais par une fonction d'enveloppe qui
 *  appelle `setInterval`/`setTimeout` EN APPEL NU (identifiant global, jamais un accès propriété)
 *  — vérifié directement contre un vrai Chromium (playwright-core), trois cas : référence nue
 *  stockée puis appelée via accès propriété (`o.f = setInterval; o.f(...)`) ÉCHOUE bien
 *  (`Illegal invocation`, receveur = `o`) ; cette enveloppe, appelée de la même façon
 *  (`o.f = intervalFnParDefaut; o.f(...)`), RÉUSSIT, exactement comme `.bind(globalThis)`.
 *
 *  Pourquoi une enveloppe plutôt qu'un `.bind(globalThis)` calculé une fois ici, au chargement du
 *  module : `.bind` fige IMMÉDIATEMENT la fonction native alors en place derrière l'identifiant
 *  `setInterval`. Piégé en écrivant cette centralisation elle-même — `tests/pannes.test.ts`
 *  (« reconnexion interne cassée ») construit un `Connexion` réel SANS lui injecter `intervalFn`
 *  APRÈS avoir appelé `vi.useFakeTimers()` : avec un bind figé au chargement du module (donc avant
 *  que Vitest ne remplace les globales), l'objet lié pointait pour de bon vers le VRAI
 *  `setInterval` du moteur, jamais vers l'horloge truquée du test — `vi.advanceTimersByTimeAsync`
 *  n'avait alors plus aucune prise sur ce minuteur, un test qui passait avant la centralisation se
 *  mettait à échouer. Une fonction d'enveloppe résout `setInterval`/`setTimeout` sur son
 *  identifiant global à CHAQUE appel (résolution de portée JS standard, pas une valeur capturée) :
 *  elle voit donc toujours l'implémentation courante, réelle ou truquée, exactement comme le
 *  faisait l'ancien `setInterval.bind(globalThis)` inline (évalué à chaque construction, pas une
 *  seule fois pour tout le programme). */
// `as typeof setInterval`/`as typeof setTimeout` : ce projet mélange les types DOM (lib.dom,
// retour `number`) et Node (`@types/node`, retour `NodeJS.Timeout`) sur ces globales, dont le
// type fusionné est un ensemble de surcharges qu'une simple fonction à arguments variables ne
// matche jamais structurellement — `setInterval.bind(globalThis)` y échappait uniquement parce
// que le typage de `Function.prototype.bind` recopie tel quel le type de la fonction d'origine.
// L'enveloppe ci-dessous transmet ses arguments sans y toucher : le fonctionnement réel n'est pas
// affecté par cette annotation de type, qui ne change rien à l'exécution.
export const intervalFnParDefaut = ((...args: Parameters<typeof setInterval>) =>
  setInterval(...args)) as typeof setInterval;

export const minuteurFnParDefaut = ((...args: Parameters<typeof setTimeout>) =>
  setTimeout(...args)) as typeof setTimeout;
