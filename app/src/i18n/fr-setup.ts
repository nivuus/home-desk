// policy: allow-fr-file -- the French catalog of the fallback screens.
/** French strings of the fallback screens. Same shape as `en-setup.ts`, the reference. */
import type { SetupMessages } from './en-setup';

export const frSetup: SetupMessages = {
  session: {
    title: 'Session',
    text: 'Ouvre Home Assistant sur cette tablette et connecte-toi, puis recharge cette page.',
  },
  unreachable: {
    title: 'Connexion impossible',
    text: 'L\'écran n\'arrive pas à joindre la maison. Ça peut venir du réseau ou de la session : '
      + 'une nouvelle tentative va avoir lieu automatiquement. Si ça persiste, réouvre Home '
      + 'Assistant sur cette tablette et reconnecte-toi.',
  },
  loading: 'Chargement de la configuration depuis Home Assistant…',
  noScreen: {
    title: 'Aucun écran configuré',
    text: (integration) =>
      `Ouvre Home Assistant, puis Paramètres > Appareils et services > ${integration}, et ajoute un écran.`,
  },
  choose: {
    title: 'Quel écran ?',
    text: 'Touche le nom de cette tablette.',
  },
  version: {
    title: 'Configuration illisible',
    text: (screen, integration) =>
      `La configuration de «\u00a0${screen}\u00a0» a été écrite par une autre version de l'intégration `
      + `${integration}. Mets à jour l'intégration, ou recrée cet écran depuis Paramètres > `
      + `Appareils et services > ${integration}.`,
  },
  invalid: {
    title: 'Configuration invalide',
    text: (screen, integration) =>
      `La configuration de «\u00a0${screen}\u00a0» ne respecte plus le contrat. Corrige-la depuis `
      + `Paramètres > Appareils et services > ${integration}, ou restaure une sauvegarde antérieure.`,
  },
  integrationMissing: {
    title: 'Intégration absente',
    text: (integration) =>
      `L'intégration ${integration} n'est pas installée sur ce Home Assistant. Installe-la, puis `
      + 'ajoute un écran depuis Paramètres > Appareils et services.',
  },
  unknownScreen: {
    title: 'Écran inconnu',
    text: (screen, integration) =>
      `«\u00a0${screen}\u00a0» n'est pas un écran configuré sur ce Home Assistant. Vérifie l'adresse de `
      + `cette tablette, ou crée cet écran depuis Paramètres > Appareils et services > ${integration}.`,
  },
};
