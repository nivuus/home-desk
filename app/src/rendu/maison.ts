/** Vue « Toute la maison » : seul niveau de profondeur de l'application (contrainte tactile du
 *  propriétaire — jamais de geste, tout par un bouton). Récupère ce que la refonte Lovelace
 *  précédente avait fait perdre : les lumières des autres pièces, les rideaux, la serrure,
 *  l'aspirateur. Réutilise `creerAppui` (retour optimiste, `interaction.ts`) via
 *  `brancherAppuiMaison`, brancher par `demarrage.ts` — même raison que `brancherAppui` dans
 *  `rendu/corps.ts` : `etat`/`cx` n'existent que dans la fermeture de `demarrer()`.
 *
 *  Tâche 8 bis (arbitrage du coordinateur) : le brief parlait d'une « vue Toute la maison de la
 *  cuisine », qui n'existait pas — une seule vue, partagée par les 3 tablettes. Pour donner à la
 *  cuisine son accès au scanner sans l'imposer au salon/bureau (aucun sens d'un scanner de codes-
 *  barres alimentaires ailleurs qu'en cuisine) ni faire déborder l'accueil (déjà à budget
 *  serré), la vue reçoit maintenant la pièce en paramètre et affiche la liste commune
 *  `TOUTE_LA_MAISON` SUIVIE des entrées propres à cette pièce (`piece.extrasMaison`, vide
 *  partout sauf en cuisine). `brancherAppuiMaison` reste la SEULE fonction d'appui de cette vue,
 *  partagée avec `demarrage.ts` (une seule instance de `creerAppui` pour toute la page, cf.
 *  rapport de tâche 8) : ce paramètre ne change que la liste rendue, jamais le mécanisme
 *  d'appui — une deuxième instance dédoublerait les minuteurs de retour arrière pour une même
 *  entité visible sur les deux écrans, piège déjà payé dans ce projet. */
import { html, type TemplateResult } from 'lit';
import type { Etat } from '../etat';
import type { Bouton, Piece } from '../pieces';
import { icone } from './icones';
import { descripteurJauge, fractionJauge } from '../jauge';

export const TOUTE_LA_MAISON: Bouton[] = [
  { libelle: 'Salon', icone: 'bulb', entite: 'light.lumiere_salon', service: ['light', 'toggle'] },
  { libelle: 'Cuisine', icone: 'bulb', entite: 'light.lumiere_cuisine', service: ['light', 'toggle'] },
  { libelle: 'Chambre', icone: 'bulb', entite: 'light.lumiere_chambre', service: ['light', 'toggle'] },
  { libelle: 'Bureau', icone: 'bulb', entite: 'light.bureau', service: ['light', 'toggle'] },
  // 2026-08-29 : `cover.toggle` remplacé par les scripts, comme sur l'accueil des deux pièces.
  // `cover.toggle` se résout en `open_cover`/`close_cover`, que ces moteurs Zigbee n'exécutent PAS
  // jusqu'au bout — mesuré sur l'installation : `open_cover` s'arrête à mi-course et y reste, si
  // bien que l'appui suivant repart dans l'autre sens depuis une position intermédiaire. Toute
  // l'installation les contourne par `set_cover_position` (les automatisations portent la note
  // « workaround bug ZHA open_cover »), et c'est ce que font `script.toggle_rideau_*`.
  // `entite` reste le volet : c'est son état et sa position qu'on lit et qu'on règle au doigt.
  // Le GLISSEMENT n'a jamais eu ce défaut — `descripteurRideau` (`src/jauge.ts`) appelle déjà
  // `cover.set_cover_position` — c'est uniquement l'appui simple qui était câblé de travers.
  { libelle: 'Rideau salon', icone: 'rideau', entite: 'cover.rideau_salon',
    service: ['script', 'turn_on'], cible: 'script.toggle_rideau_salon' },
  { libelle: 'Rideau cuisine', icone: 'rideau', entite: 'cover.rideau_cuisine',
    service: ['script', 'turn_on'], cible: 'script.toggle_rideau_cuisine' },
  { libelle: 'Chauffage', icone: 'flame', entite: 'climate.radiateur' },
  { libelle: 'Serrure', icone: 'lock', entite: 'lock.aqara_smart_lock_u200_lite', service: ['lock', 'unlock'] },
  { libelle: 'Aspirateur', icone: 'home', entite: 'vacuum.aspirateur_cuisine', service: ['vacuum', 'start'] },
];

let appuyer: (etat: Etat, b: Bouton) => void = () => {};
export function brancherAppuiMaison(fn: (etat: Etat, b: Bouton) => void) { appuyer = fn; }

// Tâche 13 : dispatcher appui/glissement, même invariant « une seule instance partagée avec
// l'écran de pièce » que `brancherAppuiMaison` ci-dessus (cf. docstring de tête : une deuxième
// instance dédoublerait le throttle d'appels de service pour une même entité visible sur les
// deux écrans, ex. `light.lumiere_salon`). Défaut non branché = appelle `surBascule`
// immédiatement, comportement d'avant cette tâche (cf. `rendu/corps.ts`, même choix).
let geste: (ev: PointerEvent, entite: string, surBascule: () => void) => void =
  (_ev, _entite, surBascule) => surBascule();
export function brancherGesteMaison(fn: typeof geste) { geste = fn; }

// Tâche 9, ronde de correction 1 (retour du coordinateur, IMPORTANT) : cette vue est le pire des
// trois écrans pour une panne silencieuse — elle ne montre pas de l'information, elle propose
// neuf actions (lumières, rideaux, chauffage, SERRURE, aspirateur). Le remède principal est
// `creerAppui`/`estHorsLigne` (`interaction.ts`), qui empêche l'optimisme trompeur quelle que
// soit la pièce ou la vue ; celui-ci en est le complément « signaler ». Pas de nouveau bandeau
// (`.hors-ligne`, `rendu/corps.ts`) : le budget de hauteur de cette vue est déjà serré (marge de
// 53 px pour la pièce la plus chargée, cf. `tests/maison.test.ts`), un bloc de plus au gabarit de
// `.alerte`/`.media` (~50-60 px) risquerait de dépasser silencieusement (`#app` en
// `overflow: hidden`, sans défilement). L'étiquette existe déjà sur cette vue, occupe déjà une
// ligne quel que soit son texte : la remplacer par « Hors ligne » (plus courte que « Toute la
// maison », donc jamais de retour à la ligne inattendu) coûte zéro hauteur supplémentaire. Le
// grisage `.muet` (universel, posé sur `#app` par `demarrage.ts`) reste le renfort ambiant sur
// cette vue comme sur les deux autres.
export function rendreMaison(etat: Etat, piece: Piece, horsLigne = false): TemplateResult {
  // Tâche 12, arbitrage du propriétaire (2026-08-03) : `piece.aspirateurMaison`, quand déclaré,
  // REMPLACE l'entrée commune dont l'entité vaut `vacuum.aspirateur_cuisine` (la tuile générique
  // « Aspirateur », nettoyage complet du RDC) — jamais une tuile de plus (budget de 585px déjà
  // plein en cuisine, cf. rapport de tâche 12). Absent partout ailleurs : aucun changement.
  const boutons = [
    ...TOUTE_LA_MAISON.map((b) => (b.entite === 'vacuum.aspirateur_cuisine' && piece.aspirateurMaison)
      ? piece.aspirateurMaison : b),
    ...piece.extrasMaison,
  ];
  return html`
    <div class="corps" data-mvt="vue:maison">
      <div class="etiquette ${horsLigne ? 'hl' : ''}">${horsLigne ? 'Hors ligne' : 'Toute la maison'}</div>
      <div class="grille">
        ${boutons
          // Même règle qu'en `rendu/corps.ts` : ce qui nomme son absence n'est
          // jamais filtré. La tuile « Scanner » de la cuisine ne vit QUE ici.
          .filter((b) => etat.estUtilisable(b.entite) || b.absenceNommee !== undefined)
          .map((b) => {
            // Tâche 13, même décision par domaine qu'en `rendu/corps.ts` : « Chauffage » (sans
            // `service`), « Serrure »/« Aspirateur » (jamais de jauge) et les 6 lumières/rideaux
            // (jauge) sont tous traités par la même règle, sans rien ajouter à `TOUTE_LA_MAISON`.
            const d = descripteurJauge(b.entite, etat);
            const fraction = d ? fractionJauge(d) : 0;
            // Une tuile qui NOMME son absence traverse le filtre ci-dessus avec une
            // entité muette : `etat.lire` rend alors `undefined`, et le `!` d'avant
            // le 2026-09-05 aurait levé au premier rendu. Elle est inerte (aucun
            // appui n'est câblé) et porte son libellé d'absence sous son nom.
            const absente = !etat.estUtilisable(b.entite);
            return html`
            <div class="tuile ${!absente && etat.lire(b.entite)!.etat === 'on' ? 'actif' : ''} ${d ? 'jauge' : ''} ${absente ? 'absent' : ''}"
                 style="--jauge:${fraction}"
                 @pointerdown=${(ev: PointerEvent) => (absente ? undefined
                    : geste(ev, b.entite, () => appuyer(etat, b)))}>
              ${icone(b.icone)}<span>${b.libelle}</span>${
                absente ? html`<span class="abs">${b.absenceNommee}</span>` : ''}</div>`;
          })}
      </div>
      <div class="xl" @pointerdown=${() => (location.hash = '')}>${icone('home')}Retour</div>
    </div>`;
}
