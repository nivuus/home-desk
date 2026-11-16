/** English strings of the screens the tablet shows when it can NOT show the requested screen
 *  (`rendu/repli.ts`). Every failure screen names an action; see that module for why.
 *
 *  `integration` is the integration's name as Home Assistant lists it (its manifest `name`, the
 *  same in every language); `screen` is the requested screen's name. */
export const enSetup = {
  session: {
    title: 'Session',
    text: 'Open Home Assistant on this tablet and sign in, then reload this page.',
  },
  unreachable: {
    title: 'Cannot connect',
    text: 'The screen cannot reach the house. It may be the network or the session: it will try '
      + 'again by itself. If it keeps failing, open Home Assistant on this tablet again and sign in.',
  },
  loading: 'Loading the configuration from Home Assistant…',
  noScreen: {
    title: 'No screen configured',
    text: (integration: string): string =>
      `Open Home Assistant, then Settings > Devices & services > ${integration}, and add a screen.`,
  },
  choose: {
    title: 'Which screen?',
    text: 'Touch the name of this tablet.',
  },
  version: {
    title: 'Unreadable configuration',
    text: (screen: string, integration: string): string =>
      `The configuration of “${screen}” was written by another version of the ${integration} `
      + `integration. Update the integration, or create this screen again from Settings > `
      + `Devices & services > ${integration}.`,
  },
  invalid: {
    title: 'Invalid configuration',
    text: (screen: string, integration: string): string =>
      `The configuration of “${screen}” no longer follows the contract. Fix it from Settings > `
      + `Devices & services > ${integration}, or restore an earlier backup.`,
  },
  integrationMissing: {
    title: 'Integration missing',
    text: (integration: string): string =>
      `The ${integration} integration is not installed on this Home Assistant. Install it, then `
      + 'add a screen from Settings > Devices & services.',
  },
  unknownScreen: {
    title: 'Unknown screen',
    text: (screen: string, integration: string): string =>
      `“${screen}” is not a screen configured on this Home Assistant. Check this tablet’s address, `
      + `or create this screen from Settings > Devices & services > ${integration}.`,
  },
};

export type SetupMessages = typeof enSetup;
