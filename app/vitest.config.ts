import { defineConfig } from 'vitest/config';

// `tests/setup-animate.ts` : stub global de `Element.prototype.animate` (absent de jsdom), pour
// que les suites qui montent réellement `demarrer()` (donc le vrai `creerMoteur(racine)`, sans
// `animer` injecté) ne désactivent plus silencieusement le moteur de mouvement dès le premier
// verdict joué. Cf. le docstring du fichier de setup pour le mécanisme complet.
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup-animate.ts'],
  },
});
