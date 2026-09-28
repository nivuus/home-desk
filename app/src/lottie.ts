/** Loads the Lottie player (`@lottiefiles/dotlottie-web`) ON DEMAND, the first time a Lottie
 *  animation is pushed to this screen.
 *
 *  Why a second bundle and a `<script>` rather than `import()`: the app ships as ONE IIFE
 *  (`dist/wallpanel.js`), and rollup inlines a dynamic import into an IIFE — the player's ~61 KB
 *  (minified, 0.80.0) would then be downloaded by the three tablets on every release, whether they ever play a
 *  Lottie or not. The player is therefore its own IIFE, `dist/dotlottie.js` (entry
 *  `lottie-bundle.ts`, global `WallpanelLottie`), injected here once.
 *
 *  Never a CDN: the bundle and its WASM are served by Home Assistant next to the app, so a tablet
 *  plays Lottie without internet. `setWasmUrl` with an explicit URL also disables the player's
 *  built-in jsdelivr/unpkg fallback (its own documentation): a missing WASM surfaces as a
 *  `loadError`, never as a silent download from elsewhere. */
import type { DotLottie } from '@lottiefiles/dotlottie-web';

/** The pinned version of `@lottiefiles/dotlottie-web` (`package.json`, exact pin). It versions
 *  BOTH URLs below: Home Assistant serves `/local/` with a 31-day cache, so an upgrade must change
 *  them to reach the tablets — and together, since the WASM must match the JS glue of the same
 *  release (a new `dotlottie.js` with a cached old WASM would fail every Lottie).
 *  `tests/lottie.test.ts` fails if it drifts from the installed package. */
export const VERSION_LOTTIE = '0.80.0';

const URL_BUNDLE = `/local/wallpanel/dotlottie.js?v=${VERSION_LOTTIE}`;
const URL_WASM = `/local/wallpanel/assets/dotlottie-player.wasm?v=${VERSION_LOTTIE}`;

/** What the second bundle's IIFE assigns to `window` (rollup `name: 'WallpanelLottie'`). */
type GlobalLottie = { WallpanelLottie?: { DotLottie?: typeof DotLottie } };

/** The load in flight or done, shared by every caller: ONE `<script>` for the page's lifetime.
 *  Cleared on failure, so that the next animation tries again rather than inheriting a rejection
 *  forever (a tablet that lost Wi-Fi at the wrong moment must not lose Lottie until a reload). */
let chargement: Promise<typeof DotLottie> | null = null;

/** Resolves the player class, loading its bundle on the first call only. */
export function chargerLottie(doc: Document = document): Promise<typeof DotLottie> {
  chargement ??= injecter(doc).catch((err: unknown) => {
    chargement = null;
    throw err;
  });
  return chargement;
}

function injecter(doc: Document): Promise<typeof DotLottie> {
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    const echouer = (message: string) => {
      // The failed tag goes too: a retry injects a fresh one, never next to a dead one.
      script.remove();
      reject(new Error(message));
    };
    script.addEventListener('load', () => {
      const DotLottie = (doc.defaultView as GlobalLottie | null)?.WallpanelLottie?.DotLottie;
      if (!DotLottie) {
        echouer(`${URL_BUNDLE} loaded without exposing WallpanelLottie.DotLottie`);
        return;
      }
      // Before any player exists: the player reads it when its first instance loads the WASM.
      DotLottie.setWasmUrl(URL_WASM);
      resolve(DotLottie);
    });
    script.addEventListener('error', () => echouer(`${URL_BUNDLE} could not be loaded`));
    script.src = URL_BUNDLE;
    doc.head.append(script);
  });
}
