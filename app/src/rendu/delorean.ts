/** Le seul élément purement décoratif de l'application, et c'est assumé.
 *
 *  Quatre rendez-vous par an et par jour : 22 h 04 (la foudre sur la tour de l'horloge),
 *  01 h 21 (les gigawatts), le 21 octobre (l'arrivée en 2015) et le 5 novembre (le jour où Doc
 *  invente le convecteur temporel). Le modèle réduit DeLorean du salon joue sa scène au même
 *  instant, piloté par ses propres automations (`select.delorean_mode`, cf. la spec du
 *  2026-08-21) ; l'écran mural fait le même clin d'œil, puis redevient normal.
 *
 *  Calculé sur l'horloge locale du navigateur : aucune dépendance à Home Assistant, donc le clin
 *  d'œil marche même pendant une coupure — c'est aussi pourquoi les cadrans du saut sont écrits
 *  en dur plutôt que déduits d'une entité. Il PASSE PAR-DESSUS et ne remplace aucune commande :
 *  `pointer-events: none` en CSS garantit qu'il ne vole jamais un contact, et `demarrage.ts`
 *  coupe la scène au premier contact pour qu'on ne tape jamais à l'aveugle.
 *
 *  SALON UNIQUEMENT — décision du propriétaire (2026-08-21) : l'effet reste attaché à la pièce où
 *  la voiture est posée. La portée est déclarée par `Ecran.delorean` (`pieces.ts`), jamais par un
 *  test sur le nom de la pièce. */
import { html, type TemplateResult } from 'lit';

/** Les trois scènes possibles. `saut` est réservée aux deux grandes dates. */
export type VarianteDelorean = 'foudre' | 'voyage' | 'saut';

/** Durées EN MILLISECONDES, une par variante. Elles sont ici et pas dans `demarrage.ts` : c'est
 *  ce fichier qui sait combien de temps sa scène dure, et les animations CSS de `base.css` sont
 *  calées sur ces mêmes valeurs (`--delorean-duree`, posée à la racine du survol). */
export const DUREES_DELOREAN: Record<VarianteDelorean, number> = {
  foudre: 4_000,
  voyage: 6_500,
  saut: 8_000,
};

/** Les cadrans du tableau de bord, figés sur les valeurs des films — décision du propriétaire
 *  (2026-08-21) : aucune date réelle, rien à calculer, rien à mémoriser. Le 21 octobre montre le
 *  départ de 1985 vers 2015 ; le 5 novembre montre le premier voyage. Les deux jeux contiennent
 *  au passage les deux rendez-vous quotidiens de la maison, 22 h 04 et 01 h 21. */
const CADRANS: Record<'octobre' | 'novembre', Array<[string, string, string, string, string]>> = {
  octobre: [
    ['DESTINATION TIME', 'OCT', '21', '2015', '16:29'],
    ['PRESENT TIME', 'OCT', '26', '1985', '01:24'],
    ['LAST TIME DEPARTED', 'NOV', '12', '1955', '22:04'],
  ],
  novembre: [
    ['DESTINATION TIME', 'NOV', '05', '1955', '06:00'],
    ['PRESENT TIME', 'OCT', '26', '1985', '01:21'],
    ['LAST TIME DEPARTED', 'OCT', '26', '1985', '01:20'],
  ],
};

const CLASSES_CADRAN = ['destination', 'present', 'depart'];

/** Quelle scène jouer à cet instant, ou `null` s'il ne s'en passe aucune. Remplace l'ancien
 *  booléen : les deux grandes dates n'ont jamais mérité la même scène que les rendez-vous
 *  quotidiens, et un booléen ne pouvait pas le dire. */
export function varianteDelorean(maintenant: Date): VarianteDelorean | null {
  const mois = maintenant.getMonth() + 1;
  const jour = maintenant.getDate();
  if (mois === 10 && jour === 21) return 'saut';   // arrivée en 2015
  if (mois === 11 && jour === 5) return 'saut';    // le convecteur temporel
  const h = maintenant.getHours();
  const m = maintenant.getMinutes();
  if (h === 22 && m === 4) return 'foudre';
  if (h === 1 && m === 21) return 'voyage';
  return null;
}

/** Conservé : `modes.ts` ne veut savoir que si l'instant existe, pas laquelle des trois scènes
 *  il déclenche. */
export function estInstantDelorean(maintenant: Date): boolean {
  return varianteDelorean(maintenant) !== null;
}

/** Le compteur monte de 0 à 88 pendant que la traînée s'installe. Progression volontairement
 *  ralentie sur la fin (exposant > 1 appliqué au complément) : une voiture pousse moins fort en
 *  haut du compte, et les deux derniers miles à l'heure doivent se faire attendre — c'est tout
 *  l'intérêt de la scène. Pure fonction du temps écoulé, donc testable sans horloge. */
export function vitesseDelorean(ecouleMs: number): number {
  const MONTEE_MS = 3_100;
  const p = Math.min(Math.max(ecouleMs, 0) / MONTEE_MS, 1);
  return Math.round((1 - Math.pow(1 - p, 2.4)) * 88);
}

const BASE = '/local/wallpanel/assets';

/** Le voile noir n'est pas un choix esthétique : l'écran de la tablette est CLAIR, une traînée de
 *  feu posée dessus ne se verrait pas. Il passe au noir plein, et il y va comme un tube
 *  cathodique s'éteint — le noir jaillit d'une ligne au centre puis s'y rétracte à la fin, un
 *  flash blanc-bleu couvrant chacune des deux coupes (`base.css`). Ni fondu (mou, lu comme un
 *  bug d'affichage), ni coupe sèche (brutale) : les deux ont été essayés et rejetés. */
export function rendreDelorean(variante: VarianteDelorean, vitesse = 0): TemplateResult {
  const duree = DUREES_DELOREAN[variante];
  const style = `--delorean-duree:${duree}ms`;

  if (variante === 'foudre') {
    return html`
      <div class="delorean" data-scene="foudre" style=${style}>
        <div class="delorean-voile"></div>
        <img class="delorean-eclair" src="${BASE}/eclair.webp" alt="">
        <div class="delorean-flash"></div>
        <div class="delorean-coupe"></div>
      </div>`;
  }

  if (variante === 'voyage') {
    return html`
      <div class="delorean" data-scene="voyage" style=${style}>
        <div class="delorean-voile"></div>
        <div class="delorean-compteur">
          <span class="delorean-nombre">${vitesse}</span>
          <span class="delorean-unite">MPH</span>
        </div>
        <video class="delorean-feu" src="${BASE}/firepath_384.webm" autoplay muted playsinline></video>
        <div class="delorean-bleu"></div>
        <div class="delorean-coupe"></div>
      </div>`;
  }

  // Le mois décide du jeu de cadrans : le 21 octobre et le 5 novembre sont les deux seules dates
  // qui mènent ici (cf. `varianteDelorean`), donc pas de troisième cas à traiter.
  const jeu = new Date().getMonth() + 1 === 10 ? CADRANS.octobre : CADRANS.novembre;
  return html`
    <div class="delorean" data-scene="saut" style=${style}>
      <div class="delorean-voile"></div>
      <video class="delorean-flux" src="${BASE}/flux_264.webm" autoplay muted playsinline></video>
      <div class="delorean-circuits">
        ${jeu.map(([etiquette, mois, jour, annee, heure], i) => html`
          <div class="delorean-rangee ${CLASSES_CADRAN[i]}">
            <span class="delorean-etiquette">${etiquette}</span>
            <span class="delorean-valeur">
              <span class="delorean-mois">${mois}</span>
              <span class="delorean-num" data-fantome="88">${jour}</span>
              <span class="delorean-num" data-fantome="8888">${annee}</span>
              <span class="delorean-num" data-fantome="88:88">${heure}</span>
            </span>
          </div>`)}
      </div>
      <div class="delorean-coupe"></div>
    </div>`;
}
