import { html, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Etat } from '../etat';
import type { Ecran, Bouton, EntreeSynthese } from '../ecran';
import type { Alerte } from '../contexte';
import { icone } from './icones';
import { ENTITE_ENTRETIEN } from './defaut';
import { descripteurJauge, fractionJauge } from '../jauge';
import { ordreCommandes, type ContexteModes } from '../modes';
import { AGENCEMENT_DEFAUT, type Agencement, type Zone } from '../agencement';

/** Tâche 8 bis : `alerteActive` (`contexte.ts`) existe et est testée depuis la tâche 2, mais rien
 *  ne l'appelait — cette fonction rend ce que `demarrage.ts` calcule dans le même gabarit `.t`/`.v`
 *  que `.demain` (`base.css` — la RÉFÉRENCE structurelle documentée ci-dessous, plus le contenu
 *  effectif de `rendreCorps` depuis la correction de tâche 9 qui suit) : elle REMPLACE la zone
 *  météo (prévisions) dans `rendreCorps`, jamais en plus, pour que la hauteur totale de l'écran
 *  (585px, marge nulle) ne bouge pas selon qu'une alerte est active ou non.
 *  (Tâche 6, 2026-08-02 : `mediaEnCours`/`rendreMedia`, mentionnés à l'origine ici, ont disparu —
 *  la résolution par source, `media.ts`, et la carte média, `rendu/media.ts`, les remplacent.)
 *
 *  Tâche 9, correction 1 (coordinateur, 2026-08-02) : « Demain » a disparu de `rendreCorps` —
 *  `.demain` n'y est plus jamais rendu, seul `base.css` garde encore la règle CSS comme gabarit de
 *  référence (`.t`/`.v`) pour `.alerte`/`.hors-ligne`, cf. le test de gabarit dans
 *  `tests/corps.test.ts`. La pastille du bandeau (`agenda.ts` → `pastilleBandeau`, tâche 8) est
 *  désormais seule propriétaire du texte « Demain » (même `phraseDemain`, même donnée) : sans ce
 *  retrait, une fois la tâche 12 câblée, « Demain — 35° et de la pluie » se serait affiché deux
 *  fois sur la même tablette (bandeau ET corps) dès que rien de particulier ne se passe — c'est-
 *  à-dire dans le cas le plus courant — ce que le projet interdit.
 *
 *  Ronde de correction 1 : « même gabarit » veut dire même STRUCTURE, pas seulement même
 *  conteneur (padding/`border-radius`) — la version initiale rendait `a.texte` dans un `<span>`
 *  unique (une ligne), alors que `.demain`/`.media` portent tous les deux une étiquette
 *  (`.t`) suivie d'une valeur (`.v`), deux lignes. Le conteneur seul matchait, la hauteur réelle
 *  non : ça ne se voyait pas dans les tests (jsdom ne calcule aucune vraie mise en page) ni à
 *  l'écran (`.xl`, le bouton du bas, absorbe l'écart via `margin-top: auto` sur `.corps` en
 *  `flex`), mais la hauteur cessait de dépendre uniquement des tailles de police déclarées.
 *  `rendreAlerte` reprend maintenant la même structure `.t`/`.v` que la carte média
 *  (`rendreCarteMedia`, `rendu/media.ts`).
 *
 *  Ronde de correction 2 : la première ligne portait le mot générique « Alerte », qui ne dit
 *  rien — le fond rouge (`--md-error-container`) porte déjà cette information, et l'icône est la
 *  même quelle que soit l'alerte. Contrairement à « Demain »/« En cours » (qui lèvent une
 *  ambiguïté réelle : sans eux, `.v` serait un texte nu sans contexte), « Alerte » répétait
 *  l'évidence sur un bloc déjà signalé par sa couleur — au mépris de la propre règle de ce
 *  fichier pour les commandes (`commandeActive` : « c'est la couleur qui porte l'information,
 *  jamais un code à retenir »). La première ligne porte maintenant `a.sujet` (« Croquettes »,
 *  « Fontaine », « Porte »... — porté par la règle elle-même dans `alertes.ts`, jamais déduit
 *  ici), lisible d'un coup d'œil depuis l'autre bout de la pièce ; la seconde garde la phrase
 *  complète (`a.texte`). */
export function rendreAlerte(a: Alerte): TemplateResult {
  return html`<div class="alerte" data-zone="blocCentral" data-mvt="bloc:alerte">${icone('lock')}
    <div><div class="t">${a.sujet}</div><div class="v">${a.texte}</div></div></div>`;
}

/** Tâche 9 : rendu quand `demarrage.ts` détecte plus de 30 s de silence websocket
 *  (`Connexion.surSilence`). Même gabarit `.t`/`.v` que `rendreAlerte`/la carte média
 *  (`rendreCarteMedia`, `rendu/media.ts`), dans le même emplacement — il les remplace, jamais en
 *  plus, pour que la hauteur de l'écran ne bouge pas (cf. `demarrage.ts`, où il prime sur les
 *  deux). Le reste de l'écran (bandeau, commandes,
 *  synthèse) continue d'afficher le dernier état connu, grisé par `.muet` sur `#app` : un écran
 *  qui se vide ou qui ment vaudrait pire qu'un écran éteint (cf. brief tâche 9). */
export function rendreHorsLigne(): TemplateResult {
  return html`<div class="hors-ligne" data-zone="blocCentral" data-mvt="bloc:hors-ligne">${icone('horsligne')}
    <div><div class="t">Hors ligne</div><div class="v">Dernières données connues</div></div></div>`;
}

/** Évalue une seule entrée déclarée, sans jamais regarder le domaine de l'entité (ronde de
 *  correction 1 : l'ancienne version dispatchait sur `id.startsWith('lock.'/'binary_sensor.'/…)`,
 *  ce qui laissait `cover.rideau_salon` et `sensor.purificateur_air_pm2_5` — déclarés mais
 *  reconnus par aucune branche — ne produire aucun écart, silencieusement, quel que soit leur
 *  état).
 *
 *  `<`/`>` sont traités en premier : l'union discriminée de `EntreeSynthese` (ronde de
 *  correction 2) garantit à la compilation que `entree.valeur` y est un `number`, donc pas
 *  besoin de `typeof` ici — un `<`/`>` sur une chaîne n'est plus une valeur représentable. Pour
 *  `==`/`!=`, comparaison numérique si `valeur` est un nombre (égalité numérique, ex. un futur
 *  compteur exact), textuelle sinon (les verrous/capteurs binaires actuels). */
function estEcart(etatBrut: string, entree: EntreeSynthese): boolean {
  if (entree.operateur === '<') return Number(etatBrut) < entree.valeur;
  if (entree.operateur === '>') return Number(etatBrut) > entree.valeur;
  if (typeof entree.valeur === 'number') {
    const n = Number(etatBrut);
    return entree.operateur === '!=' ? n !== entree.valeur : n === entree.valeur;
  }
  return entree.operateur === '!=' ? etatBrut !== entree.valeur : etatBrut === entree.valeur;
}

/** Résout les deux marqueurs génériques d'une entrée de synthèse : `{etat}` (déjà documenté sur
 *  `EntreeSynthese.texte`) puis `{s}`, la marque du pluriel français. `{s}` s'efface si le
 *  nombre extrait de l'état vaut 1 (ou -1), devient `s` sinon — le cas le plus courant du
 *  français (« tâche »/« tâches »), qui couvre tout compteur sans qu'aucun texte n'ait besoin
 *  d'écrire sa propre condition d'accord. Général et non un cas particulier de « tâches » :
 *  n'importe quelle future entrée à compteur peut réutiliser `{s}` sans toucher à cette fonction.
 *  Si l'état n'est pas numérique, `{s}` n'est jamais rencontré aujourd'hui (seules les entrées à
 *  compteur le portent) ; au cas où, on le retire sans rien pluraliser plutôt que de laisser le
 *  marqueur brut à l'écran. */
function formaterTexte(texte: string, etatBrut: string): string {
  const t = texte.replace('{etat}', etatBrut);
  const n = Number(etatBrut);
  return t.replace(/\{s\}/g, Number.isFinite(n) && Math.abs(n) === 1 ? '' : 's');
}

/** N'affiche que ce qui sort de l'ordinaire, mais reste PERMANENTE : un bloc qui disparaît
 *  laisserait un vide les jours où rien ne cloche. Se contente d'évaluer les entrées déclarées
 *  dans `piece.synthese` (voir `ecran.ts`) — aucune inférence ici. */
export function ligneSynthese(etat: Etat, entites: EntreeSynthese[]): { texte: string; ecarts: string[] } {
  const ecarts: string[] = [];
  for (const entree of entites) {
    if (!etat.estUtilisable(entree.entite)) {
      // Décision 8 : une entrée qui NOMME son absence la dit, au lieu d'être
      // sautée en silence. Cf. `absenceNommee` (`ecran.ts`).
      if (entree.absenceNommee) ecarts.push(entree.absenceNommee);
      continue;
    }
    const e = etat.lire(entree.entite)!;
    if (estEcart(e.etat, entree)) ecarts.push(formaterTexte(entree.texte, e.etat));
  }
  return { texte: ecarts.length ? 'Tout est fermé —' : 'Tout est fermé, rien à signaler', ecarts };
}

/** Une commande n'est colorée que si l'appareil est actif : c'est la couleur qui porte
 *  l'information, jamais un code à retenir. `climate.radiateur` (VersatileThermostat) n'a
 *  JAMAIS l'état `on` — ses seuls états possibles sont `heat`/`off` (vérifié dans
 *  `ha_sync/entities/climate.json`). Un simple `=== 'on'` laisserait donc la tuile
 *  « Chauffage » grise en permanence, même pendant une chauffe active : ce n'est pas un
 *  interrupteur, sa notion de marche/arrêt se lit sur `!== 'off'`. Les domaines sans notion
 *  marche/arrêt (`todo.*`, compteurs...) ne sont jamais colorés — cohérent avec la règle des
 *  tablettes murales : pas d'état actif/inactif possible → couleur inactive.
 */
/** Tâche 19 (2026-08-03) : `fan.` et `binary_sensor.` rejoignent la règle. Sans eux, les deux
 *  ventilateurs ajoutés restaient gris EN MARCHE et le Velux gris GRAND OUVERT — sur un écran
 *  mural, la couleur est la seule information lisible de loin, et elle aurait menti en permanence.
 *  Les deux entrent par le même `=== 'on'` que les lumières, parce que ce sont réellement leurs
 *  états HA (FanEntity et BinarySensorEntity ne connaissent que `on`/`off`).
 *  `vacuum.` reste délibérément DEHORS : « Aspirer ici » est un lanceur d'action, et la règle des
 *  tablettes murales (CLAUDE.md du dépôt HA) range explicitement les lanceurs d'aspirateur avec
 *  les scènes, en couleur inactive — l'état du robot, lui, est porté par le bloc central du mode
 *  `menage`, seul propriétaire de cette information. */
function commandeActive(id: string, etatBrut: string): boolean {
  if (id.startsWith('climate.')) return etatBrut !== 'off';
  if (id.startsWith('light.') || id.startsWith('switch.')
      || id.startsWith('fan.') || id.startsWith('binary_sensor.')) return etatBrut === 'on';
  return false;
}

const bouton = (etat: Etat, b: Bouton, actif: boolean, classe: string) => {
  // Tâche 13 : décidé PAR DOMAINE (`descripteurJauge`), jamais par le `Bouton` lui-même — une
  // commande « Chauffage » (`climate.radiateur`, sans `service`) obtient sa jauge exactement de
  // la même façon qu'une commande « Lumières » (`light.*`, avec `service: ['light','toggle']`) :
  // aucune donnée à ajouter à `ecran.ts` pour ça, cf. docstring de `jauge.ts`.
  const d = descripteurJauge(b.entite, etat);
  // Revue tâche 16 — COHÉRENCE TRANCHÉE : `jauge.ts` documente déjà, pour les lumières, qu'une
  // jauge ÉTEINTE se montre VIDE plutôt que de mentir sur un niveau qu'elle n'a plus. Le chauffage
  // ne suivait pas cette règle — capture réelle du salon/bureau : la tuile « Chauffage — Éteint »
  // portait une barre olive à moitié pleine, exactement l'incohérence visuelle que la règle des
  // lumières existe pour éviter. ALIGNÉ ici, mais volontairement PAS dans `descripteurChauffage`
  // (`jauge.ts`) : `d.valeur` y reste la VRAIE consigne, même à l'arrêt (contrairement à une
  // luminosité, une consigne de thermostat existe et reste réglable hors chauffe — cf. commentaire
  // de `descripteurChauffage`) — c'est cette valeur réelle, jamais une valeur maquillée à 0/16°,
  // que `geste.ts` relit à chaque `pointerdown` (`descripteurJauge` y est rappelé à neuf) pour
  // ancrer un glissement, y compris sur une tuile éteinte. Seul le REMPLISSAGE affiché est masqué
  // ici, exactement comme `commandeActive` juste au-dessus décide la couleur « actif » par domaine
  // au niveau du rendu plutôt que dans `jauge.ts` — même discipline, même fichier.
  const jaugeMasquee = b.entite.startsWith('climate.') && !actif;
  const fraction = d && !jaugeMasquee ? fractionJauge(d) : 0;
  // Tâche 19 — RÈGLE DU PROPRIÉTAIRE : une tuile qui ne déclenche rien ne donne aucun retour au
  // doigt ; une tuile qui agit, si. Ce que fait réellement un appui est déjà décidé ailleurs, et
  // cette ligne ne fait que le CONSTATER, sans rien ajouter à `ecran.ts` : `interaction.ts`
  // n'appelle aucun service et ne pose aucun optimisme sans `service` (et navigue avec `lien`), et
  // `geste.ts` n'entre dans sa machine à états que s'il y a une jauge à régler au glissement. Un
  // bouton sans les trois est donc inerte, et `base.css` lui retire alors la couche `:active` et
  // le resserrement d'angle — sinon il accuse réception d'une action qui n'a pas lieu, le « bouton
  // mort » que ce projet s'interdit (même traitement que `.ambiance.inactif` et
  // `.vt-bouton.vt-attente`). Aujourd'hui : le Velux du bureau, et lui seul. Le CHAUFFAGE en est la
  // contre-épreuve, et c'est pour lui que la condition regarde `d` plutôt que le seul `service` :
  // sans service non plus, mais réglable au glissement, donc il agit et garde son retour.
  // Tâche 6 (2026-08-17) : `vue` (navigation interne, ex. « Recette ») agit tout autant que `lien`
  // — `interaction.ts` la traite AVANT `lien`, elle pose un hash — donc `!b.vue` rejoint `!b.lien`
  // ici, sans quoi la tuile « Recette » accuserait faussement une action qui a bien lieu.
  // Décision 8 (2026-09-05) : une commande qui NOMME son absence traverse le
  // filtre avec une entité muette. Elle est inerte par construction — aucun
  // appui n'est câblé, `interaction.ts` retourne avant `vue`/`lien`/`service` —
  // et `base.css` lui retire alors son retour tactile : accuser réception d'une
  // action qui n'a pas lieu est le « bouton mort » que ce projet s'interdit.
  const absente = !etat.estUtilisable(b.entite);
  const inerte = absente || (!b.service && !b.lien && !b.vue && !d);
  return html`
  <div class="${classe} ${actif ? 'actif' : ''} ${d ? 'jauge' : ''} ${inerte ? 'inerte' : ''} ${absente ? 'absent' : ''}"
       data-mvt="tuile:${b.entite}"
       style="--jauge:${fraction}"
       @pointerdown=${(ev: PointerEvent) => geste(ev, b.entite, () => appuyer(etat, b))}>
    ${icone(b.icone)}
    <div><div class="t">${b.libelle}</div>
      <!-- Mineur (revue finale) — marque detail:etiq-<entité> retirée : c'était une marque MORTE.
           .s est rendue inconditionnellement (jamais absente/présente d'une peinture à l'autre),
           son offsetParent est la boîte interne de la tuile (jamais racine), et elle ne pose
           jamais data-mvt-etat — aucun de ses verdicts possibles (entrée/sortie, mutation) ne peut
           donc se produire. Elle ne coûtait pas rien pour autant : deux lectures de mise en page
           (offsetLeft/offsetWidth) par tuile et par peinture, pour un verdict qui ne vient jamais. -->
      <div class="s">${etiquette(etat, b)}</div></div>
  </div>`;
};

// Revue tâche 16 — DÉFAUT VISIBLE À L'ÉCRAN : `lock.`/`cover.` retombaient sur `return e.etat`,
// donc l'état brut de Home Assistant, EN ANGLAIS (« locked », « closed »…), capturé sur la vraie
// tablette du salon. La règle du commentaire ci-dessous (« jamais un jeton anglais brut, français
// partout à l'écran compris ») n'avait été écrite QUE pour `climate.` à la tâche 8/9 ; les deux
// domaines ajoutés bien plus tard par la tâche 5 (`lock.aqara_smart_lock_u200_lite`,
// `cover.rideau_salon`) ne l'avaient jamais rejointe. Largeur vérifiée dans un vrai navigateur
// (Chromium, police/poids/taille réels de `.commande .s`, tuile de 150,5 px — cf. rapport de
// tâche 16) : les libellés ci-dessous tiennent tous avec au moins 17 px de marge sur la tuile la
// plus étroite du parc ; aucun n'a donc besoin d'un raccourci plus agressif.
//
// Jamais un état inconnu deviné : les états HA de `lock.`/`cover.` forment une énumération fermée
// (`LockState`/`CoverState`) — tout ce qui en sort sur une entité par ailleurs utilisable
// (`Etat.estUtilisable` a déjà écarté `unavailable`/`unknown`/vide) est une vraie anomalie
// d'intégration, jamais une valeur à traduire au hasard. `ETAT_INCONNU` ci-dessous n'est ni un mot
// anglais ni une chaîne vide qui laisserait un blanc inexplicable sur un mur : c'est un aveu
// explicite, aussi lisible de loin qu'un état traduit.
const ETAT_INCONNU = 'État inconnu';

/** `lock.aqara_smart_lock_u200_lite` (Matter, capteur de porte intégré — d'où `open`/`opening`,
 *  qui décrivent le battant, pas seulement le pêne) : sept états HA possibles, cf. brief. */
function libelleSerrure(etatBrut: string): string {
  switch (etatBrut) {
    case 'locked': return 'Verrouillée';
    case 'unlocked': return 'Déverrouillée';
    case 'locking': return 'Verrouille…';
    case 'unlocking': return 'Déverrouille…';
    case 'jammed': return 'Bloquée';
    case 'open': return 'Ouverte';
    case 'opening': return 'Ouverture…';
    default: return ETAT_INCONNU;
  }
}

/** `cover.rideau_salon`/`cover.rideau_cuisine` : quatre états HA possibles. « Le rideau a une
 *  position » (brief tâche 16) — `current_position` (0-100, même attribut que `descripteurRideau`,
 *  `jauge.ts`, jamais recalculé autrement pour rester cohérent avec ce que le doigt y règle) est
 *  affiché tant qu'il n'est pas 100 : un rideau à moitié ouvert dit « Ouvert 42 % », pas juste
 *  « Ouvert », qui mentirait par omission sur un volet qui ne l'est qu'à demi. À 100 (ou attribut
 *  absent/non exploitable — un lecteur sans `SET_POSITION`), le pourcentage n'ajoute rien : simple
 *  « Ouvert ». */
function libelleRideau(e: { etat: string; attributs: Record<string, unknown> }): string {
  switch (e.etat) {
    case 'closed': return 'Fermé';
    case 'opening': return 'Ouverture…';
    case 'closing': return 'Fermeture…';
    case 'open': {
      const position = Number(e.attributs['current_position']);
      return Number.isFinite(position) && position < 100 ? `Ouvert ${Math.round(position)} %` : 'Ouvert';
    }
    default: return ETAT_INCONNU;
  }
}

/** Tâche 19 : les ouvrants déclarés comme COMMANDE (le Velux du bureau aujourd'hui). Décidé sur
 *  `device_class`, la seule chose que Home Assistant dise du SENS d'un capteur binaire — jamais
 *  sur le nom de l'entité, et jamais sur le seul domaine : `binary_sensor.` couvre aussi bien un
 *  battant qu'un détecteur de mouvement ou une alimentation en défaut, pour lesquels
 *  « Ouvert »/« Fermé » serait un contresens. Un capteur d'une autre classe (aucun n'est déclaré
 *  en commande aujourd'hui) retombe donc sur le repli générique plus bas, inchangé. */
const CLASSES_OUVRANT = new Set(['door', 'window', 'opening', 'garage_door']);

function libelleOuvrant(e: { etat: string; attributs: Record<string, unknown> }): string | null {
  if (!CLASSES_OUVRANT.has(String(e.attributs['device_class'] ?? ''))) return null;
  return e.etat === 'on' ? 'Ouvert' : 'Fermé';
}

export function etiquette(etat: Etat, b: Bouton): string {
  // Appelée INCONDITIONNELLEMENT depuis la tuile depuis le 2026-09-05 : tant
  // que le rendu n'appelait `etiquette` que si `estUtilisable`, un libellé
  // d'absence n'aurait jamais pu être rendu. C'est donc ici que le repli vit,
  // avant toute lecture d'état — `etat.lire` renvoie `undefined` sur une
  // entité muette, et la ligne suivante la déréférence.
  if (!etat.estUtilisable(b.entite)) return b.absenceNommee ?? '';
  const e = etat.lire(b.entite)!;
  // Tâche 19 — TROIS domaines qui n'avaient jamais atteint une rangée de commandes avant cette
  // tâche, et qui retombaient donc tous sur le repli générique de fin de fonction, écrit pour les
  // lumières. Même défaut, et même correctif, que `lock.`/`cover.` à la tâche 16 : le français
  // partout à l'écran n'est pas une préférence, c'est une contrainte du projet.
  //
  // `fan.` : un ventilateur ou un purificateur ne s'« allume » pas, il se met en marche. Aucun
  // pourcentage affiché bien que `percentage` existe sur les deux appareils : ces tuiles n'ont pas
  // de jauge (rien à régler au doigt, cf. `jauge.ts`), un chiffre qu'on ne peut pas toucher
  // n'apporterait qu'une ligne plus longue sur une tuile de 150,5 px.
  if (b.entite.startsWith('fan.')) return e.etat === 'on' ? 'En marche' : 'Arrêté';
  // `binary_sensor.` : un battant, quand HA le déclare comme tel (cf. `libelleOuvrant`).
  const ouvrant = b.entite.startsWith('binary_sensor.') ? libelleOuvrant(e) : null;
  if (ouvrant !== null) return ouvrant;
  // `vacuum.` : RIEN, volontairement — et c'est la seule étiquette vide de l'application.
  // « Aspirer ici » est un lanceur d'action, exactement comme la même tuile dans « Toute la
  // maison », qui n'a jamais affiché que son libellé. Deux raisons de ne rien écrire ici : les
  // états HA d'un aspirateur (`docked`, `cleaning`, `returning`…) sont des jetons anglais qui
  // fuiraient tels quels par le repli générique ; et pendant un nettoyage, le bloc central du mode
  // `menage` porte DÉJÀ cet état (« En cours · 100 % ») — l'écrire aussi sous la tuile mettrait la
  // même donnée deux fois sur la même tablette, ce que le projet interdit.
  if (b.entite.startsWith('vacuum.')) return '';
  // `climate.radiateur` : `heat`/`off` sont des jetons internes anglais de VersatileThermostat,
  // jamais un libellé à montrer tel quel (contrainte projet : français partout, à l'écran
  // compris). Seuls ces deux états existent pour ce thermostat.
  if (b.entite.startsWith('climate.')) return e.etat === 'off' ? 'Éteint' : 'Chauffe';
  if (b.entite.startsWith('lock.')) return libelleSerrure(e.etat);
  if (b.entite.startsWith('cover.')) return libelleRideau(e);
  if (e.etat === 'on') {
    const l = e.attributs['brightness'];
    return l ? `Allumées ${Math.round((Number(l) / 255) * 100)} %` : 'Allumé';
  }
  return e.etat === 'off' ? 'Éteint' : e.etat;
}

/** Rempli par la tâche 7 : le retour optimiste. */
let appuyer: (etat: Etat, b: Bouton) => void = () => {};
export function brancherAppui(fn: (etat: Etat, b: Bouton) => void) { appuyer = fn; }

// Tâche 13 : le dispatcher appui/glissement (`creerGeste`, `geste.ts`), branché par
// `demarrage.ts` comme `appuyer` ci-dessus (même raison : `etat`/`cx` n'existent que dans sa
// fermeture). Par défaut (non branché — ex. un test qui rend `rendreCorps` sans passer par
// `demarrer()`) : appelle `surBascule` immédiatement, exactement le comportement d'avant cette
// tâche — un test qui n'exerce pas la jauge n'a donc rien à changer pour rester vert.
let geste: (ev: PointerEvent, entite: string, surBascule: () => void) => void =
  (_ev, _entite, surBascule) => surBascule();
export function brancherGeste(fn: typeof geste) { geste = fn; }

/** `data-zone` — INERTE POUR LE RENDU, et lu par une seule machine : `outils/mesurer-hauteurs.mjs`,
 *  qui relève dans un vrai navigateur ce que chaque zone de l'écran coûte en pixels. Ces hauteurs
 *  vivent ensuite dans `contrat/budget.json` (clé `hauteurs`), d'où `combien()` (`src/modes.ts`)
 *  les relit pour CALCULER le nombre de commandes au lieu d'appliquer une table calibrée sur les
 *  585 px des Fire 7 — c'est ce qui permet à l'intégration Home Assistant de répondre « cet écran
 *  déborde de tant » pour une tablette quelconque.
 *
 *  Attribut SÉPARÉ de `data-mvt`, délibérément : `data-mvt` appartient au moteur de mouvement
 *  (`mouvement.ts`), qui nomme des RÔLES d'animation (`bloc:`, `ligne:`, `detail:`). Deux
 *  consommateurs sur un même attribut, c'est un couplage payé au premier changement d'animation.
 *
 *  Les zones nommées, et où elles sont posées :
 *    `bandeau`           — `.cap`, la racine du bandeau (`rendu/bandeau.ts`) ;
 *    `etiquetteAmbiance` — le titre « Ambiance », un enfant de `.corps` à part entière ;
 *    `rangeeAmbiance`    — le `.groupe` des tuiles d'ambiance ;
 *    `commandes`         — la grille `.commandes` ENTIÈRE (plusieurs rangées) — l'outil en
 *                          déduit le coût d'UNE rangée avec le `row-gap` réel de la grille ;
 *    `blocCentral`       — le bloc du mode, quel qu'il soit : `.mode-bloc` (repas/agenda/
 *                          entretien/ménage/aération/recette réduite), `.alerte`, `.hors-ligne`,
 *                          `.media`, `.voiture`, `.minuteurs`. Un seul NOM pour tous : c'est
 *                          l'outil qui sait quel mode il a posé, et ce fichier n'a pas à
 *                          connaître le vocabulaire du budget ;
 *    `synthese`          — la ligne de synthèse, permanente, plus bas dans ce fichier ;
 *    `touteLaMaison`     — le grand bouton `.xl` du pied, présent dans tous les modes. */
/** Une zone mobile, rendue. `undefined` = la zone n'a rien à montrer sur cet écran (le salon sans
 *  rangée d'ambiance, un mode sans bloc central) et disparaît COMPLÈTEMENT — pas un `.groupe`
 *  vide, qui resterait un enfant de la colonne flex et coûterait une gouttière de 8 px que le
 *  budget n'a pas. C'est la règle posée le 2026-08-29 pour la rangée d'ambiance, ici généralisée. */
type RenduZone = TemplateResult | undefined;

export function rendreCorps(
  etat: Etat, piece: Ecran,
  // Renommé depuis `enTete` (tâche 9, 2026-08-02) : ce bloc n'a jamais été un en-tête, c'est le
  // bloc CENTRAL de l'écran, celui que le mode principal occupe. Fourni par `demarrage.ts`, qui
  // seul connaît le mode — `rendreCorps` reste une fonction de présentation.
  //
  // Tâche 14 (2026-08-03) : `prev`/`maintenant` ont disparu de cette signature avec le mode
  // `previsions` — `rendreCorps` ne calcule plus jamais son propre bloc central par défaut,
  // `blocCentral` le porte désormais dans TOUS les cas (repas/agenda compris, cf.
  // `rendu/defaut.ts`, câblés par `demarrage.ts`), exactement comme il le fait déjà pour
  // alerte/média/ménage/aération/voiture depuis la tâche 8 bis. Un mode sans rien à montrer
  // (plan de repas vide, plus de rendez-vous aujourd'hui) transmet `undefined` — même contrat
  // qu'avant, seulement plus jamais de calcul interne à ce fichier pour le remplir tout seul.
  blocCentral?: TemplateResult,
  // Optionnel et en dernière position : sans lui, on garde exactement le comportement d'avant
  // (toutes les commandes utilisables, dans leur ordre déclaré) — c'est ce qui laisse les tests
  // existants verts sans les réécrire.
  ctx?: ContexteModes,
  // Tâche 3 : tuile d'entrée du minuteur, fournie par `demarrage.ts` (seul à connaître l'état du
  // réglage — cf. tâche 7). Rendue À LA SUITE des ambiances : la rangée du haut est la seule qui
  // puisse l'accueillir sans coûter une rangée de plus, et le budget de hauteur de l'accueil
  // cuisine est déjà saturé (585px, marge nulle). Optionnel et en dernière position, comme `ctx` :
  // le salon et le bureau ne le passent jamais et continuent de rendre exactement trois tuiles.
  tuileMinuteur?: TemplateResult,
  // Tâche 17 : le bloc central affiche À CET INSTANT le détail des tâches d'entretien
  // (`rendreEntretien`, `rendu/defaut.ts`) — la ligne de synthèse doit alors taire son
  // « 3 tâches d'entretien », sinon le même compte s'écrit deux fois sur la même tablette, ce que
  // le projet interdit. Même patron EXACT que `masquerRdv` (`pastilleBandeau`, `agenda.ts`,
  // tâche 14), et pour la même raison de préséance : c'est le petit emplacement qui cède, jamais
  // le bloc central — plus grand, plus lisible, et seul à porter le détail.
  //
  // Décidé par `demarrage.ts` sur ce qui est RÉELLEMENT rendu, jamais sur la pièce (contrairement
  // à `masquerRdv`, posé lui sur `agencement.blocDefaut === 'agenda'`) : un soir où un plat est planifié, ou
  // pendant qu'un mode prioritaire confisque le bloc, l'entretien n'est affiché nulle part et la
  // synthèse doit le reprendre. Optionnel et en dernière position comme `ctx`/`tuileMinuteur` :
  // sans lui, comportement d'avant cette tâche, à l'identique.
  masquerEntretien = false,
  // Tâche 6 (2026-08-17) : la tuile qui ouvre `#recette` n'a de sens que s'il y a une recette à
  // ouvrir. Décidé par `demarrage.ts` sur ce qui est RÉELLEMENT disponible (une note du plan de
  // repas n'a pas de recette), jamais sur la pièce — même patron que `masquerEntretien`.
  recetteOuvrable = false,
  // Tâche 3 du plan 2 : l'ORDRE des zones mobiles vient de l'agencement de l'écran. Facultatif et
  // en dernière position, comme `ctx`/`tuileMinuteur`/`masquerEntretien`/`recetteOuvrable` avant
  // lui : sans lui, l'ordre est celui d'`AGENCEMENT_DEFAUT`, c'est-à-dire exactement celui que ce
  // gabarit écrivait en dur. Les tests de rendu existants restent donc verts sans être réécrits.
  agencement?: Agencement,
): TemplateResult {
  // Modulateur `invites` : les écarts marqués `perso` (voiture, entretien) disparaissent — ils ne
  // regardent que Maxime. La porte déverrouillée, elle, reste : c'est une information de sécurité
  // qui concerne tout le monde dans la pièce, invités compris.
  const visibles = ctx?.modeInvites ? piece.synthese.filter((e) => !e.perso) : piece.synthese;
  const entrees = masquerEntretien
    ? visibles.filter((e) => e.entite !== ENTITE_ENTRETIEN) : visibles;
  const s = ligneSynthese(etat, entrees);
  // Une commande qui NOMME son absence n'est jamais filtrée : c'est tout
  // l'intérêt du champ (cf. `absenceNommee`, `ecran.ts`).
  const utilisables = piece.commandes.filter(
    (c) => etat.estUtilisable(c.entite) || c.absenceNommee !== undefined);
  // Le second filtre : la tuile `#recette` n'a de sens que s'il y a une recette
  // à ouvrir. `recetteOuvrable` vaut faux dans DEUX cas que rien ne distinguait
  // ici — le garde-manger répond mais n'a rien de planifié (la tuile doit bien
  // disparaître), et le garde-manger n'est pas installé du tout (elle doit
  // rester, pour nommer son absence). Sans cette seconde condition, ce filtre
  // reprenait exactement ce que le premier venait de laisser passer.
  const affichables = recetteOuvrable
    ? utilisables
    : utilisables.filter((c) => c.vue !== '#recette' || !etat.estUtilisable(c.entite));
  const commandes = ctx ? ordreCommandes(affichables, ctx) : affichables;

  // Les quatre zones mobiles, extraites du gabarit unique qu'elles formaient avant cette tâche —
  // chacune rend EXACTEMENT ce que ce gabarit rendait pour elle, commentaires HTML compris (ils
  // voyagent avec leur zone et disparaissent donc avec elle, cf. `RenduZone` ci-dessus). Le seul
  // déplacé qui ne l'est pas verbatim est `blocCentral` : voir son commentaire dans la table
  // `ZONES` plus bas — il n'a jamais eu de gabarit propre ici, seulement une place.
  const RENDU_AMBIANCES = html`
        <!-- 2026-08-29 : la rangée entière — étiquette comprise — disparaît quand la pièce n'a rien
             à y mettre (le salon, qui a rendu ses trois scènes pour financer ses quatre commandes
             permanentes, cf. ecran.ts). Le retrait doit être COMPLET, exactement pour la même
             raison que la rangée de commandes du mode minuteur juste en dessous : .corps est une
             colonne flex à gouttière de 8 px, donc un .groupe vide n'aurait aucune hauteur propre
             mais resterait un enfant à part entière — une gouttière de plus que rien ne comble,
             dans un budget qui n'a pas 8 px à perdre. Et une étiquette Ambiance seule au-dessus du
             vide serait un titre orphelin.
             La condition regarde AUSSI tuileMinuteur : une pièce sans ambiance déclarée à qui
             demarrage.ts passe quand même la tuile d'entrée du minuteur garde bien sa rangée.
             Aucune pièce n'est dans ce cas aujourd'hui — la condition le prévoit plutôt que de le
             laisser se découvrir un jour à l'écran.
             (Pas de guillemet oblique dans ce commentaire : il vit DANS un template literal.) -->
        <div class="etiquette" data-zone="etiquetteAmbiance">Ambiance</div>
        <!-- Tâche 3 : --ambiances porte le compte RÉEL de tuiles, la tuile minuteur comprise —
             c'est cette variable que .groupe (base.css) lit pour son nombre de colonnes
             (repeat(var(--ambiances, 3), …)). Le repli à 3 dans le CSS garde intact tout rendu
             qui ne publierait pas la variable (le bureau, qui ne passe jamais tuileMinuteur,
             et les anciens tests/pages en cache). -->
        <div class="groupe" data-zone="rangeeAmbiance" style="--ambiances: ${piece.ambiances.length + (tuileMinuteur ? 1 : 0)}">
          <!-- Tâche 13, décision délibérée : la rangée Ambiance ne passe JAMAIS par le
               dispatcher de geste, même quand une de ses entrées enveloppe un appareil réglable.
               Cette rangée est visuellement/sémantiquement une rangée de SCÈNES (tuiles étroites,
               ~100 px, coins arrondis en paire première/dernière) ; un appareil qui mérite une
               jauge est de toute façon réglable comme tuile normale sur la vue Toute la maison
               (TOUTE_LA_MAISON, rendu/maison.ts) — cf. rapport de tâche 13, réserves.
               2026-08-29 : c'est aussi ce qui a motivé la descente de la Hotte et du Rideau de
               cuisine vers les commandes — cette rangée ne rend NI état NI fond actif, elle ne
               pouvait donc pas répondre à « on ne voit pas l'état de la lumière hotte ».
               (Pas de guillemet oblique dans ce commentaire : il vit DANS un template literal.) -->
          ${piece.ambiances.map((a) => html`
            <div class="ambiance" data-mvt="tuile:amb-${a.entite}"
                 @pointerdown=${() => appuyer(etat, a)}>
              ${icone(a.icone)}<span>${a.libelle}</span></div>`)}
          ${tuileMinuteur ?? ''}
        </div>`;
  const RENDU_COMMANDES = html`
        <!-- repeat CLÉ PAR ENTITÉ, jamais un simple .map : sans clé, lit réutilise les nœuds DOM DANS
             L'ORDRE et se contente de réécrire leur contenu. Une tuile qui change de rang
             deviendrait alors un nœud qui change de texte — et le FLIP de mouvement.ts animerait
             un déplacement qui n'a pas eu lieu, en laissant le vrai changement se faire par un saut
             de contenu. Avec la clé, lit DÉPLACE le nœud, et FLIP a quelque chose de réel à animer.

             Tâche 10 bis : la rangée de commandes n'est rendue QUE si combien(mode) en laisse au
             moins une (mode minuteur, cf. modes.ts) — un conteneur vide n'aurait aucune hauteur
             propre, mais resterait un enfant à part entière de .corps en flex/gap 8px, ce qui
             ajouterait un intervalle de plus (8px) que rien ne viendrait combler : une rangée vide
             qui laisse un trou, exactement ce que ce budget de hauteur ne peut pas se permettre de
             gaspiller. -->
        <!-- C2 (revue finale) — role ligne:commandes, PAS bloc:commandes : le rôle bloc entre dans
             l'appariement du croisement de diff.ts (« un bloc central qui en remplace un autre »),
             à la seule condition de MÊME POSITION entre une sortie et une entrée. .corps est une
             colonne flex et .commandes précède immédiatement le bloc central : retirer un enfant
             d'une colonne flex donne à son successeur exactement son offsetTop — arithmétique, pas
             un cas rare. Résultat mesuré : bloc:commandes à [16, 202] avant un minuteur lancé en
             cuisine, bloc:minuteur-solo au MÊME [16, 202] après — comparer() les appariait donc en
             un seul croisement, fondant le clone de la rangée de commandes par-dessus le minuteur
             entrant pendant que le vrai bloc remplacé partait en sortie sèche à côté. Le rôle ligne
             a exactement le comportement voulu ici (entrée/sortie/déplacement, cf. jouer() dans
             moteur.ts) sans jamais entrer dans cet appariement, réservé au seul rôle bloc.
             (Note tâche 3 du plan 2 : cette mesure suppose l'agencement PAR DÉFAUT, où commandes
             précède effectivement blocCentral. Un agencement personnalisé qui inverserait les deux
             n'est pas revisité ici — hors périmètre de cette tâche.) -->
        <div class="commandes" data-zone="commandes" data-mvt="ligne:commandes">
          ${repeat(commandes, (c) => c.entite,
                   (c) => bouton(etat, c, etat.estUtilisable(c.entite)
                     && commandeActive(c.entite, etat.lire(c.entite)!.etat), 'commande'))}
        </div>`;
  const RENDU_SYNTHESE = html`
        <!-- Tâche 18 : la ligne de synthèse ouvre la vue Tâches (rendu/taches.ts) — demande
             explicite du propriétaire (« appuyer dessus pour voir la liste »). Toujours active,
             même quand aucun écart n'est affiché ou que l'écart montré n'est pas une tâche (porte
             déverrouillée, rideau ouvert...) : ce que ce tap ouvre, ce sont TOUJOURS les listes
             todo.* de la pièce (cf. listesTachesPiece, cochage.ts), jamais l'écart affiché au
             moment précis du contact — les trois pièces ont chacune au moins une liste, l'accès
             reste donc toujours pertinent.

             Ronde de correction 1 (tâche 10 bis) : le texte est maintenant enveloppé dans
             synthese-texte, borné à 2 lignes (-webkit-line-clamp, base.css) — sans lui, cette
             ligne grandit SANS PLAFOND avec le nombre d'écarts réellement actifs en même temps
             (porte déverrouillée, rideau ouvert, voiture à brancher, tâches d'entretien : jusqu'à
             quatre, un jour ordinaire de rideau ouvert et de liste d'entretien non vide) — mesuré à
             +16 px par ligne supplémentaire, largement responsable du dépassement du mode voiture
             découvert en relecture (574 → 590 px). .synthese elle-même reste la ligne tapable en
             flex (icône + bloc de texte), inchangée.

             Marques (2026-08-25) : ces deux éléments ne changent jamais de forme, mais ils
             CHANGENT DE PLACE — le bloc central au-dessus d'eux apparaît, disparaît et change de
             hauteur d'un mode à l'autre, ce qui les décale tous les deux. Sans marque, ce
             glissement était un saut sec, et verifier-rendu.mjs le signalait (8 éléments sur la
             page cuisine, en comptant les enfants de .synthese). Marquer .synthese couvre
             .synthese-texte et .ecart, qui sont ses descendants : la règle d'imbrication veut
             un ancêtre STRICT qui bouge dans la même différence, pas une marque sur chaque nœud. -->
        <div class="synthese" data-zone="synthese" data-mvt="ligne:synthese"
             @pointerdown=${() => (location.hash = '#taches')}>${icone('lock')}
          <div class="synthese-texte">${s.texte} <span class="ecart">${s.ecarts.join(', ')}</span></div>
        </div>`;

  // Table zone -> rendu, construite ICI pour capturer les variables locales ci-dessus (piece,
  // tuileMinuteur, commandes, blocCentral, RENDU_*). L'ORDRE d'itération vient de l'agencement,
  // jamais de l'ordre des clés de cet objet.
  const ZONES: Record<Zone, () => RenduZone> = {
    ambiances: () => (piece.ambiances.length || tuileMinuteur ? RENDU_AMBIANCES : undefined),
    // blocCentral n'a jamais eu de gabarit à LUI dans ce fichier : ce paramètre porte déjà son
    // propre data-zone="blocCentral" (media.ts, modes.ts, defaut.ts, minuteur.ts, voiture.ts, ce
    // fichier pour alerte/hors-ligne) depuis la tâche 14. Placé TEL QUEL, jamais enveloppé ni
    // remarqué — envelopper casserait le couplage data-zone/data-mvt que porte déjà chaque
    // gabarit de mode, et briserait l'appariement de mouvement.ts qui s'attend à ce marqueur en
    // position de racine du bloc. Absent (undefined) → rien ne s'affiche ici et l'écran se
    // resserre d'autant, exactement comme un mode sans rien à montrer ; fourni → il remplace,
    // jamais en plus, sinon le budget de hauteur saute.
    //
    // Tâche 9, correction 1 (coordinateur, 2026-08-02) : « Demain » n'a JAMAIS sa place ici — la
    // pastille du bandeau (agenda.ts, pastilleBandeau, tâche 8) retombe déjà sur « Demain » +
    // phraseDemain(demain) en permanence dès qu'il n'y a ni anniversaire ni rendez-vous proche.
    // Le corps ne connaît donc plus demain du tout : le bandeau en est seul propriétaire, jamais
    // deux fois la même donnée sur la même tablette.
    blocCentral: () => blocCentral,
    commandes: () => (commandes.length ? RENDU_COMMANDES : undefined),
    synthese: () => RENDU_SYNTHESE,
  };
  const zones = (agencement ?? AGENCEMENT_DEFAUT).zones;
  return html`
    <!-- La marque data-mvt="vue:accueil" N'EST PLUS ICI (2026-08-28) : elle vit sur .ecran
         (demarrage.ts), la racine qui contient le bandeau ET ce corps. Une traversée ne fait
         glisser que l'élément marqué et ne garde en fond que son clone — tant que la marque était
         posée sur .corps seul, le bandeau, son frère, était retiré sec par lit et l'heure
         disparaissait au premier quart de seconde de chaque ouverture de sous-vue.
         (Pas de guillemet oblique dans ce commentaire : il vit DANS un template literal.) -->
    <div class="corps">
      <!-- Tâche 3 du plan 2 : l'ORDRE de ces zones vient de agencement.zones, jamais plus écrit en
           dur ici. Le filter est INDISPENSABLE, pas cosmétique : lit rendrait un undefined comme
           un nœud vide, mais chaque enfant de cette colonne flex coûte une gouttière de 8 px
           (base.css), et le budget de hauteur n'a que 3 px de marge — cf. le commentaire du type
           RenduZone plus haut.
           CLÉ PAR NOM DE ZONE, pour la même raison que la rangée de commandes plus haut est clée
           par entité : lit apparie les entrées d'un tableau NON clé par leur index, donc la
           disparition d'une zone amont ferait glisser toutes les suivantes d'un cran et lit
           détruirait puis recréerait leur DOM. Avant cette tâche chaque zone occupait sa propre
           expression, donc un emplacement fixe, et le bloc central SURVIVAIT au retrait de la
           rangée de commandes. La clé rend cette propriété au tableau. Le rendu est le même ;
           c'est l'identité des nœuds qui était en jeu, et elle se perdait en silence.
           (Pas de guillemet oblique dans ce commentaire : il vit DANS un template literal.) -->
      ${repeat(
        zones.map((z) => [z, ZONES[z]()] as const).filter(([, t]) => t !== undefined),
        ([z]) => z,
        ([, t]) => t)}
      <div class="xl" data-zone="touteLaMaison" data-mvt="tuile:toute-la-maison"
           @pointerdown=${() => (location.href = '#maison')}>
        ${icone('home')}Toute la maison</div>
    </div>`;
}
