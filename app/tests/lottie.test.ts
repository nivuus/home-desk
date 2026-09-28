// @vitest-environment jsdom
//
/** The lazy loader of the Lottie player (`src/lottie.ts`): ONE `<script>` for the lifetime of the
 *  page, the WASM pointed at the local copy before any player exists, and a failed load that can
 *  be retried by the next animation. jsdom never fetches the script: each test plays the part of
 *  the browser by setting `window.WallpanelLottie` and dispatching `load` or `error` itself. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Module = typeof import('../src/lottie');
let lottie: Module;

const ICI = dirname(fileURLToPath(import.meta.url));

/** The double of the second bundle's export: only `setWasmUrl` is observed here. */
function faireDotLottie() {
  return class { static setWasmUrl = vi.fn(); };
}

const scripts = () => Array.from(document.querySelectorAll<HTMLScriptElement>('script'));

beforeEach(async () => {
  // The memo lives in the module: a fresh module per test, as a fresh page would have.
  vi.resetModules();
  lottie = await import('../src/lottie');
});
afterEach(() => {
  for (const s of scripts()) s.remove();
  delete (window as { WallpanelLottie?: unknown }).WallpanelLottie;
});

describe('chargerLottie', () => {
  it('injects the local bundle, pinned to the installed version', () => {
    void lottie.chargerLottie();
    expect(scripts().map((s) => s.getAttribute('src')))
      .toEqual(['/local/wallpanel/dotlottie.js?v=0.80.0']);
  });

  it('pins the version the package lock actually installs', () => {
    const installe = JSON.parse(readFileSync(
      join(ICI, '..', 'node_modules', '@lottiefiles', 'dotlottie-web', 'package.json'), 'utf8'));
    const declare = JSON.parse(readFileSync(join(ICI, '..', 'package.json'), 'utf8'));
    expect(lottie.VERSION_LOTTIE).toBe(installe.version);
    expect(lottie.VERSION_LOTTIE).toBe(declare.dependencies['@lottiefiles/dotlottie-web']);
  });

  it('two calls inject ONE script and resolve the same player class', async () => {
    const DotLottie = faireDotLottie();
    const a = lottie.chargerLottie();
    const b = lottie.chargerLottie();
    expect(scripts()).toHaveLength(1);

    (window as { WallpanelLottie?: unknown }).WallpanelLottie = { DotLottie };
    scripts()[0]!.dispatchEvent(new Event('load'));
    expect(await a).toBe(DotLottie);
    expect(await b).toBe(DotLottie);
    expect(await lottie.chargerLottie()).toBe(DotLottie);
    expect(scripts()).toHaveLength(1);
  });

  it('points the WASM at the local copy once, before resolving', async () => {
    const DotLottie = faireDotLottie();
    const charge = lottie.chargerLottie();
    (window as { WallpanelLottie?: unknown }).WallpanelLottie = { DotLottie };
    scripts()[0]!.dispatchEvent(new Event('load'));
    const resolu = await charge;
    expect(resolu.setWasmUrl).toHaveBeenCalledTimes(1);
    expect(resolu.setWasmUrl).toHaveBeenCalledWith('/local/wallpanel/assets/dotlottie-player.wasm');

    await lottie.chargerLottie();
    expect(DotLottie.setWasmUrl).toHaveBeenCalledTimes(1);
  });

  it('a script error rejects, and the next call injects again', async () => {
    const premier = lottie.chargerLottie();
    scripts()[0]!.dispatchEvent(new Event('error'));
    await expect(premier).rejects.toThrow();
    // The failed tag does not stay behind: exactly one script per attempt in flight.
    expect(scripts()).toHaveLength(0);

    const DotLottie = faireDotLottie();
    const second = lottie.chargerLottie();
    expect(scripts()).toHaveLength(1);
    (window as { WallpanelLottie?: unknown }).WallpanelLottie = { DotLottie };
    scripts()[0]!.dispatchEvent(new Event('load'));
    expect(await second).toBe(DotLottie);
  });

  it('a script that loads without exposing the player rejects, and can be retried', async () => {
    const premier = lottie.chargerLottie();
    scripts()[0]!.dispatchEvent(new Event('load'));
    await expect(premier).rejects.toThrow();
    expect(scripts()).toHaveLength(0);
    void lottie.chargerLottie();
    expect(scripts()).toHaveLength(1);
  });
});
