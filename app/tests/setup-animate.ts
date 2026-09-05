/** Stub global de `Element.prototype.animate`, que jsdom n'implémente pas.
 *
 *  `tests/moteur.test.ts` (tests unitaires du moteur) injecte son PROPRE double d'`animer` à
 *  chaque `creerMoteur(...)` et n'a besoin de rien ici — ce stub ne prend le relais que là où rien
 *  n'est injecté.
 *
 *  C'est le cas des suites qui montent RÉELLEMENT `demarrer()` (`tests/orchestration.test.ts`,
 *  `tests/demarrage.test.ts`…, via `tests/aides.ts`) : elles passent par le VRAI
 *  `creerMoteur(racine)` de `demarrage.ts`, sans option `animer`. Sans ce stub, le premier verdict
 *  joué (déplacement, entrée ou sortie) lève `TypeError: el.animate is not a function` — rattrapée
 *  par le `try/catch` du relevé « après » de `peindre()` (`src/mouvement/moteur.ts`), qui
 *  désactive le moteur DÉFINITIVEMENT (`actif = false`) pour le reste de la vie de cette instance.
 *  Ces suites cessaient alors d'exercer la moindre animation du moteur pour le reste du test — en
 *  plus de cracher une pile d'exception à chaque changement d'état poussé. Ronde de correction 1.
 *
 *  Objet minimal (`finished`/`cancel`), tout ce que `AnimationLike` (`moteur.ts`) exige — pas une
 *  fausse `Animation` complète, dont ce projet n'a besoin nulle part dans ses tests.
 *
 *  `Element` n'existe qu'en environnement jsdom (`// @vitest-environment jsdom` en tête de
 *  fichier) : les suites en environnement `node` n'ont rien à patcher, d'où la garde. Et on ne
 *  remplace `animate` que s'il est VRAIMENT absent — jamais écraser une implémentation réelle. */
if (typeof Element !== 'undefined' && typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function animateFactice() {
    return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
  };
}
