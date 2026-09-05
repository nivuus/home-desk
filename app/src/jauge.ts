/** Jauges à glissement (tâche 13) : luminosité des lumières, consigne du chauffage, position des
 *  rideaux, volume du média en cours. Fonctions PURES — aucune dépendance au DOM, au pointeur ni
 *  à la connexion HA — qui déterminent, à partir du domaine d'une entité et de son état/attributs
 *  *seuls* (jamais du `Bouton` qui la porte), si une tuile doit afficher une jauge, quelle valeur
 *  y montrer, et quel appel de service produire pour une nouvelle valeur choisie au doigt. Même
 *  discipline que `commandeActive` (`rendu/corps.ts`) : une décision par domaine, pas par entité
 *  nommée, pour qu'une future lumière/rideau branché sans y penser hérite du bon comportement.
 *
 *  `descripteurJauge` rend `null` dans TOUS les cas où une tuile ne doit montrer aucune jauge :
 *  domaine non concerné (scène, verrou, aspirateur, todo...), entité muette/indisponible
 *  (`Etat.estUtilisable`), ou appareil qui ne supporte matériellement pas le réglage (lumière
 *  onoff pure, volet sans `SET_POSITION`, media sans volume exposé) — règle 4 du brief : « une
 *  entité muette ou qui ne supporte pas le réglage ne doit pas afficher de jauge ». */
import type { Etat } from './etat';

export type DescripteurJauge = {
  /** Valeur actuelle, déjà bornée à [min, max]. */
  valeur: number;
  min: number;
  max: number;
  pas: number;
  /** Construit l'appel de service HA pour une nouvelle valeur (déjà bornée/arrondie par
   *  `valeurDepuisPosition` — jamais recalculée ici). `entity_id` n'est PAS inclus : c'est
   *  l'appelant (`geste.ts`) qui le connaît et le fusionne dans les données envoyées. */
  appliquer(nouvelleValeur: number): [domaine: string, service: string, donnees: Record<string, unknown>];
};

// --- Chauffage : plage utile restreinte -------------------------------------------------------
//
// `climate.radiateur` (VersatileThermostat) accepte 7 à 35 °C par pas de 0,1 °C — au doigt, sur
// une tuile de ~160 px de large, ça fait un degré tous les six pixels : impossible à viser
// fiablement (brief). Restreint à 16–24 °C par pas de 0,5 °C :
//   - la plage encadre les DEUX préréglages réels qui vivent dans cette plage — éco 19°, confort
//     21°, boost 23° — avec une marge de part et d'autre (16 en bas, 24 en haut) pour couvrir tout
//     réglage fin autour d'eux, sans viser une plage arbitraire ;
//   - le pas de 0,5 °C donne 16 crans sur la largeur d'une tuile de commande, largement descendable
//     au doigt sur une dalle murale (contre 180 crans pour la plage native à 0,1 °C) ;
//   - le hors-gel (7 °C) est volontairement HORS plage : un réglage aussi rare (on part en vacances
//     en hiver) ne mérite pas de sacrifier la précision du réglage quotidien qui, lui, se fait
//     plusieurs fois par semaine. Il reste accessible directement depuis Home Assistant — cette
//     app ne prétend pas remplacer l'admin HA, seulement l'usage courant au doigt sur le mur.
const CLIMATE_MIN = 16;
const CLIMATE_MAX = 24;
const CLIMATE_PAS = 0.5;

// SET_POSITION (CoverEntityFeature, HA) : bit 4 du masque `supported_features`. Vérifié contre
// les valeurs réelles du brief : `cover.rideau_salon`/`cover.rideau_cuisine` valent 15
// (OPEN=1 + CLOSE=2 + SET_POSITION=4 + STOP=8), donc le bit y est bien présent.
const COVER_SET_POSITION = 4;

function descripteurLumiere(id: string, etat: Etat): DescripteurJauge | null {
  if (!id.startsWith('light.') || !etat.estUtilisable(id)) return null;
  const e = etat.lire(id)!;
  const modes = e.attributs['supported_color_modes'];
  // Une lumière STRICTEMENT onoff (aucun mode de couleur autre que 'onoff') n'a pas de
  // luminosité à montrer ni à régler — seul cas RÉELLEMENT hors de portée d'une jauge dans ce
  // parc (Yeelight/IKEA KAJPLATS/Meross sont toutes `color_temp`/`hs`/`rgb`, cf. brief : ce garde
  // ne rejette donc rien aujourd'hui, mais protège une future lumière onoff-only branchée sans
  // qu'on y pense). Attribut absent (jamais le cas sur une vraie entité HA, mais un état de test
  // minimal peut l'omettre) : on ne présume pas l'exclusion, on montre la jauge par défaut.
  if (Array.isArray(modes) && modes.length > 0 && modes.every((m) => m === 'onoff')) return null;
  // Une lumière ÉTEINTE n'a pas de luminosité : la jauge se montre VIDE (0 %) plutôt que de
  // mentir sur un niveau qu'elle n'a plus — jamais le dernier niveau connu, qui laisserait croire
  // qu'elle brille encore alors qu'elle est noire. Glisser dessus reste utile : HA applique
  // `brightness_pct` même sur une lumière éteinte (elle s'allume à ce niveau) — le geste n'est
  // donc jamais mort sous le doigt, contrairement à une jauge qui refuserait tout en dessous.
  const brillance = e.etat === 'on' ? Number(e.attributs['brightness'] ?? 0) : 0;
  const valeur = Math.round((brillance / 255) * 100);
  return {
    // Borne basse à 1 %, jamais 0 : `brightness_pct: 0` est interprété par Home Assistant comme
    // une EXTINCTION. Avec un minimum à 0, glisser jusqu'au bord gauche éteignait la lampe, et
    // remonter la rallumait — d'où un clignotement pendant le geste (retour du propriétaire,
    // 2026-08-02). Une jauge de luminosité règle une intensité ; pour éteindre, on appuie.
    // `valeur` peut valoir 0 (lampe éteinte) et reste donc sous ce minimum : c'est voulu, la
    // jauge s'affiche alors vide, et `fractionJauge` borne le rendu.
    valeur, min: 1, max: 100, pas: 1,
    // 0 % : on éteint plutôt que d'envoyer un `brightness_pct: 0` qui n'a pas de sens univoque
    // pour toutes les lumières (certaines l'ignorent, d'autres restent allumées au minimum).
    appliquer: (v) => (v <= 0 ? ['light', 'turn_off', {}] : ['light', 'turn_on', { brightness_pct: v }]),
  };
}

// Revue tâche 16 — QUESTION DE COHÉRENCE TRANCHÉE avec la règle ci-dessus (« une lumière ÉTEINTE
// se montre VIDE »). `valeur` ci-dessous reste TOUJOURS la vraie consigne, MÊME quand
// `climate.radiateur` est à l'arrêt — délibérément différent de la lumière, où `valeur` tombe à 0
// hors tension. Une luminosité hors tension n'existe plus (il n'y a rien de vrai à montrer :
// `brightness` d'une lampe éteinte ne veut rien dire) ; une consigne de thermostat, elle, reste un
// réglage RÉEL et EXPLOITABLE même chauffage à l'arrêt — VersatileThermostat la garde, et
// `geste.ts` en a besoin intacte comme point de départ d'un glissement (`valeurDepuisDeplacement`
// est RELATIF à `d.valeur` : la maquiller à 16 °C ferait démarrer tout réglage hors chauffe sur un
// écart au vrai point de consigne, alors que déclarer une lumière hors tension à 0 % ne perd
// aucune information, puisqu'il n'y en avait pas). Le masquage visuel demandé par la capture
// réelle (tuile « Chauffage — Éteint » avec une jauge à moitié pleine) est donc appliqué au RENDU,
// pas ici : cf. `jaugeMasquee` dans `bouton()` (`rendu/corps.ts`), même endroit et même discipline
// que `commandeActive`, qui décide déjà la couleur « actif » du chauffage par domaine à ce niveau
// plutôt que dans ce fichier.
function descripteurChauffage(id: string, etat: Etat): DescripteurJauge | null {
  if (!id.startsWith('climate.') || !etat.estUtilisable(id)) return null;
  const e = etat.lire(id)!;
  const cible = Number(e.attributs['temperature']);
  if (!Number.isFinite(cible)) return null;   // pas de consigne exploitable
  // Une consigne réelle hors de la plage utile (le hors-gel à 7 °C, cf. commentaire des
  // constantes ci-dessus) est affichée à l'extrémité la plus proche plutôt que hors du cadre —
  // la jauge ne peut matériellement pas pointer en dehors de la tuile qui la porte. Un
  // glissement la ramène dans tous les cas dans la plage 16–24 °C.
  const valeur = Math.min(CLIMATE_MAX, Math.max(CLIMATE_MIN, cible));
  return {
    valeur, min: CLIMATE_MIN, max: CLIMATE_MAX, pas: CLIMATE_PAS,
    appliquer: (v) => ['climate', 'set_temperature', { temperature: v }],
  };
}

function descripteurRideau(id: string, etat: Etat): DescripteurJauge | null {
  if (!id.startsWith('cover.') || !etat.estUtilisable(id)) return null;
  const e = etat.lire(id)!;
  const supporte = (Number(e.attributs['supported_features'] ?? 0) & COVER_SET_POSITION) !== 0;
  const position = Number(e.attributs['current_position']);
  if (!supporte || !Number.isFinite(position)) return null;
  return {
    valeur: position, min: 0, max: 100, pas: 1,
    appliquer: (v) => ['cover', 'set_cover_position', { position: v }],
  };
}

/** Point d'entrée unique : essaie chaque domaine reconnu — les préfixes d'entité HA sont
 *  mutuellement exclusifs, donc au plus une de ces fonctions rend un résultat non nul.
 *  `media_player.*` n'y figure plus (tâche 6, 2026-08-02) : la carte média porte désormais son
 *  propre contrôle de volume (rail ou boutons − / +, cf. `rendu/media.ts`) — un glissement pleine
 *  surface par-dessus ses trois boutons de transport serait une collision d'intentions. */
export function descripteurJauge(id: string, etat: Etat): DescripteurJauge | null {
  return descripteurLumiere(id, etat)
    ?? descripteurChauffage(id, etat)
    ?? descripteurRideau(id, etat);
}

/** Convertit une position horizontale du doigt (px depuis le bord gauche de la tuile) en valeur
 *  de jauge : clampée à [min, max] puis arrondie au pas. Fonction pure, testable sans DOM ni
 *  pointeur réel. `largeurPx <= 0` (tuile non mise en page, ex. jsdom en test) : rend la valeur
 *  actuelle inchangée plutôt qu'une division par zéro. */
export function valeurDepuisPosition(d: DescripteurJauge, xPx: number, largeurPx: number): number {
  if (largeurPx <= 0) return d.valeur;
  const fraction = Math.min(1, Math.max(0, xPx / largeurPx));
  const brut = d.min + fraction * (d.max - d.min);
  const arrondi = Math.round(brut / d.pas) * d.pas;
  // Erreurs d'arrondi flottant (0.1 + 0.2 !== 0.3 en JS) : un pas de 0,5 °C doit rendre
  // exactement 16.5, jamais 16.499999999999998, qui afficherait un chiffre absurde à l'écran.
  const decimales = d.pas.toString().split('.')[1]?.length ?? 0;
  const arrondiPropre = Number(arrondi.toFixed(decimales));
  return Math.min(d.max, Math.max(d.min, arrondiPropre));
}

/** Fraction [0, 1] de la jauge — ce que le remplissage de fond (`--jauge`, `base.css`) affiche. */
export function fractionJauge(d: Pick<DescripteurJauge, 'valeur' | 'min' | 'max'>): number {
  if (d.max === d.min) return 0;
  // Bornée à [0, 1] : une valeur réelle peut légitimement sortir de la plage réglable — une
  // lampe éteinte vaut 0 alors que le minimum réglable est 1, et une consigne de hors-gel à 7 °C
  // est sous les 16 °C de la plage utile. Sans ce bornage, le remplissage deviendrait négatif.
  return Math.min(1, Math.max(0, (d.valeur - d.min) / (d.max - d.min)));
}

/** Valeur obtenue en déplaçant le doigt de `dxPx` depuis un point de départ, rapportée à la
 *  largeur de la tuile : traverser toute la largeur parcourt toute la plage. Relatif et non
 *  absolu — voir le commentaire de `deplacer()` dans `geste.ts`. */
export function valeurDepuisDeplacement(
  d: DescripteurJauge, valeurDepart: number, dxPx: number, largeurPx: number,
): number {
  if (largeurPx <= 0) return d.valeur;
  const brut = valeurDepart + (dxPx / largeurPx) * (d.max - d.min);
  const borne = Math.min(d.max, Math.max(d.min, brut));
  const arrondi = Math.round(borne / d.pas) * d.pas;
  return Math.min(d.max, Math.max(d.min, Number(arrondi.toFixed(4))));
}
