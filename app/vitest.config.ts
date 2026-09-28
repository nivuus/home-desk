import { defineConfig } from 'vitest/config';

// `tests/setup-animate.ts`: a global stub of `Element.prototype.animate` (missing from jsdom), so
// that the suites that really mount `startScreen()` (hence the real motion engine factory,
// without an injected `animer`) no longer silently disable the motion engine from the first
// verdict played. See the setup file's docstring for the full mechanism.
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup-animate.ts'],
  },
});
