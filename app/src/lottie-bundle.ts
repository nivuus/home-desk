/** Entry of the SECOND bundle, `dist/dotlottie.js` (see `rollup.config.js`): the Lottie player
 *  alone, exposed as `window.WallpanelLottie.DotLottie` and loaded on demand by `lottie.ts`. The
 *  app bundle never imports this file — only the player's TYPE, which leaves no code behind. */
export { DotLottie } from '@lottiefiles/dotlottie-web';
