/** Fonctions pures, comme `contexte.ts` : rien du DOM, rien de Home Assistant, aucune horloge
 *  implicite (`maintenant` toujours reçu en paramètre). Alimente `alerteActive`/`Alerte` de
 *  `contexte.ts`, qui existent et sont testées depuis la tâche 2 mais n'étaient encore jamais
 *  appelées — ce fichier fournit ce qui manquait : QUELLES alertes collecter, et DEPUIS QUAND
 *  la maison est calme. */
import type { Etat } from './etat';
import type { Alerte } from './contexte';

/** Les six capteurs qui définissent « ça bouge dans la maison ». Écartés délibérément :
 *  `binary_sensor.radiateur_presence_state`, dérivé du VersatileThermostat, qui pourrait se
 *  nourrir de lui-même ; et les `binary_sensor.browser_mod_*`, fantômes désactivés (cf. mémoire
 *  projet « Nettoyage browser_mod »). */
export const CAPTEURS_MOUVEMENT = [
  'binary_sensor.tablette_salon_mouvement',
  'binary_sensor.tablette_bureau_mouvement',
  'binary_sensor.tablette_cuisine_mouvement',
  'binary_sensor.capteur_humain',   // cuisine
  'binary_sensor.capteur',          // salle de bain
  'binary_sensor.capteur_2',        // chambre
];

/** Le compte à rebours ne court que si TOUS sont à off ; n'importe quel « on » le réarme et
 *  rend l'instant présent (`Date.now()`), pas `changeLe` : un capteur qui vient de passer à
 *  `on` prouve un mouvement à l'instant T, indépendamment de la dernière fois où `Etat.appliquer`
 *  a horodaté ce même capteur. Sans capteur utilisable du tout (aucun état encore reçu), rend 0 :
 *  l'alerte se replie immédiatement plutôt que de rester bloquée au premier plan faute de preuve
 *  de mouvement (cf. `etat.appliquer`, qui horodate `changeLe` lui-même — HA ne le fournit pas
 *  ici sous une forme exploitable). */
export function dernierMouvement(etat: Etat): number {
  let plusRecent = 0;
  for (const id of CAPTEURS_MOUVEMENT) {
    if (!etat.estUtilisable(id)) continue;
    const e = etat.lire(id)!;
    if (e.etat === 'on') return Date.now();
    if (e.changeLe > plusRecent) plusRecent = e.changeLe;
  }
  return plusRecent;
}

/** Critère d'admission d'une règle ici (ronde de correction 1, posé après deux erreurs réelles) :
 *  une alerte signale une condition ANORMALE et TRAITABLE EN QUELQUES MINUTES depuis la maison.
 *  Les deux sont cumulatifs, et chacun a déjà été violé une fois :
 *  - ANORMALE exclut ce que l'installation provoque ELLE-MÊME. `fenetre` a été retirée ici pour
 *    cette raison — mais PAS parce qu'une automation ouvrirait la fenêtre (ronde de correction
 *    2 : cette justification-là était fausse, corrigée ci-dessous). Le vrai fait est plus
 *    modeste : l'automation « Aération - Opportunité ouvrir velux/fenêtre quand frais dehors »
 *    (`automations.yaml`, `auto_3a784b7f`) se contente de SUGGÉRER l'aération par notification
 *    quand il fait plus frais dehors que dedans (« formule-le comme une suggestion, PAS un
 *    ordre » dans le texte du message) — elle n'actionne rien : sa propre description dit
 *    « Velux/fenêtres manuelles → notif uniquement (pas pilotables) », et il n'existe d'ailleurs
 *    aucune entité d'ouvrant pour cette fenêtre (`binary_sensor.fenetre_c_ouverture` est un
 *    capteur IKEA PARASOLL, pas un moteur). C'est Maxime qui ouvre à la main, sur cette
 *    suggestion — l'état qui en résulte est donc voulu et peut durer des heures (vérifié :
 *    ouverte depuis 1h30 au moment de cette ronde) tout autant que si un automate l'avait fait.
 *    Elle reste dans `ligneSynthese` (`ecran.ts`/`rendu/corps.ts`), sa place : une information
 *    qu'on lit, pas un premier plan qui confisque l'écran.
 *  - TRAITABLE EN QUELQUES MINUTES exclut ce qui dure par nature (la batterie de la e208 —
 *    brancher une voiture ne se fait pas depuis la maison, et la recharge prend des heures — a
 *    confisqué les trois écrans une journée entière pour avoir enfreint ça). Ce qui dure se
 *    signale par une ligne, jamais par le premier plan.
 *  Une règle qui échoue à l'un des deux devient (ou reste) une ligne de `ligneSynthese`, jamais
 *  une entrée ici. `croquettes` visait à l'origine `..._alimentation`, qui est à `off` en
 *  fonctionnement normal (le moteur ne tourne que par à-coups) — donc une fausse alerte
 *  permanente, le même défaut que `fenetre` par la bande. Corrigé vers `..._probleme`
 *  (device_class `problem`), qui ne vaut `on` qu'en cas de panne réelle.
 *
 *  `sujet` (ronde de correction 2) : le mot affiché en première ligne par `rendreAlerte`
 *  (`rendu/corps.ts`) — court, lisible de loin, PAS le mot générique « Alerte » (la couleur du
 *  fond porte déjà cette information, cf. `commandeActive` dans `rendu/corps.ts` : « c'est la
 *  couleur qui porte l'information, jamais un code à retenir »). Porté par la règle elle-même,
 *  à côté de son `texte`, plutôt que déduit ailleurs (depuis `cle`, par exemple). */
const REGLES: { cle: string; entite: string; declenche: (e: string) => boolean; sujet: string; texte: string }[] = [
  { cle: 'croquettes', entite: 'binary_sensor.distributeur_de_croquettes_probleme',
    declenche: (e) => e === 'on', sujet: 'Croquettes', texte: 'Distributeur de croquettes en panne' },
  { cle: 'eau', entite: 'binary_sensor.eversweet_3_pro_uvc_niveau_d_eau',
    declenche: (e) => e === 'on', sujet: 'Fontaine', texte: 'Fontaine de Soraya à remplir' },
  { cle: 'serrure', entite: 'lock.aqara_smart_lock_u200_lite',
    declenche: (e) => e === 'unlocked', sujet: 'Porte', texte: 'Porte déverrouillée' },
];

export function collecterAlertes(etat: Etat, maintenant: number): Alerte[] {
  return REGLES
    .filter((r) => etat.estUtilisable(r.entite) && r.declenche(etat.lire(r.entite)!.etat))
    .map((r) => ({ cle: r.cle, sujet: r.sujet, texte: r.texte, depuis: maintenant }));
}
