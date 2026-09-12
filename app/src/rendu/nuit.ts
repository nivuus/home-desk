/** Écran de nuit (23 h → 5 h, cf. `momentDuJour` dans `contexte.ts`) : la tablette reste allumée
 *  dans une pièce sombre, quelqu'un peut la traverser en pleine nuit. Trois informations, aucune
 *  commande dans la maison, aucun blanc pur — `--md-surface-container-lowest` est la surface la
 *  plus sombre de la palette, jamais `#fff`. Une entrée manquante (température muette, serrure
 *  absente) disparaît simplement plutôt que d'afficher un état inventé.
 *
 *  Tâche 9, retour du coordinateur : le grisage `.muet` (posé sur `#app`, cf. `demarrage.ts`) ne
 *  suffit pas ici. D'abord parce que le signal est trop faible — cet écran est déjà sombre et peu
 *  contrasté par conception, la différence entre 100 % et 55 % d'opacité y passe facilement
 *  inaperçue. Ensuite et surtout parce que sans garde-fou, la température et le statut de la
 *  serrure continueraient d'afficher un chiffre précis et confiant (« 25,8° ») alors que la
 *  connexion est peut-être morte depuis des heures — exactement le mensonge silencieux visé par
 *  cette tâche, sur l'écran auquel une personne qui vient de se réveiller fait le plus confiance,
 *  sans le moindre repère pour le contredire. `horsLigne` REMPLACE donc ces deux blocs (les
 *  seules données de cet écran qui viennent de HA — l'heure vient de l'horloge de la tablette,
 *  jamais de HA, donc reste fiable) par une note unique, dans le même registre que `.on`
 *  (`--md-outline`, déjà l'élément le plus discret de cet écran) plutôt qu'un bandeau coloré façon
 *  `.hors-ligne` de l'écran du jour : « rien qui réveille » exclut tout ce qui attire l'œil la
 *  nuit.
 *
 *  Tâche 9 (réveil) : cet écran accepte maintenant EXACTEMENT un geste, `surReveil`, posé en
 *  `@pointerdown` (jamais `click`, comme toutes les commandes du projet) sur le conteneur ENTIER
 *  — « appui n'importe où », décision validée, on ne vise pas à 3 h du matin. Ce geste ne
 *  commande toujours rien ICI : il ne fait que prévenir `demarrage.ts`, qui décide seul de
 *  réveiller l'écran (rendu complet, palette soir, retour à 45 s). `rendreNuit` reste une pure
 *  fonction de présentation — aucun état de réveil n'est tenu ici. */
import { html, type TemplateResult } from 'lit';
import type { Etat } from '../etat';
import type { Ecran } from '../ecran';
import { icone } from './icones';

export function rendreNuit(
  etat: Etat, maintenant: Date, piece: Ecran, horsLigne = false,
  // Optionnel et en dernière position : aucun appelant existant à changer, un écran de nuit sans
  // réveil branché reste un écran de nuit valide (cf. « reste inerte quand aucun réveil n'est
  // branché », tests/nuit.test.ts).
  surReveil?: () => void,
): TemplateResult {
  const hh = String(maintenant.getHours()).padStart(2, '0');
  const mm = String(maintenant.getMinutes()).padStart(2, '0');
  // Mineur (revue finale) — deux clés DISTINCTES, detail:nuit-horsligne et detail:nuit-ferme,
  // là où les deux branches partageaient la même auparavant. Les branches restent exclusives
  // (jamais les deux en même temps), donc aucune collision au sens de comparer() : mais basculer
  // hors ligne pendant que l'écran de nuit est affiché fait DISPARAÎTRE detail:nuit-ferme et
  // APPARAÎTRE une nouvelle instance de la même clé, portant un texte différent — un remplacement
  // sec, sans le moindre verdict de comparer() pour l'accompagner (même clé avant/après = ni
  // entrée ni sortie, seulement une mutation si l'ETAT data-mvt-etat diffère, ce qui n'est pas le
  // cas ici). Deux clés distinctes redonnent à ce changement une vraie sortie + une vraie entrée.
  if (horsLigne) {
    return html`
      <div class="nuit" data-mvt="vue:nuit" @pointerdown=${() => surReveil?.()}>
        <div class="hn">${hh}:${mm}</div>
        <div class="on" data-mvt="detail:nuit-horsligne">${icone('horsligne')}Dernières données</div>
      </div>`;
  }
  const t = etat.estUtilisable(piece.temperature)
    ? Number(etat.lire(piece.temperature)!.etat).toFixed(1).replace('.', ',') : null;
  const ferme = etat.lire('lock.aqara_smart_lock_u200_lite')?.etat === 'locked';
  return html`
    <div class="nuit" data-mvt="vue:nuit" @pointerdown=${() => surReveil?.()}>
      <div class="hn">${hh}:${mm}</div>
      ${t ? html`<div class="tn" data-mvt="detail:nuit-temp">${t}° ${piece.nom.toLowerCase()}</div>` : ''}
      ${ferme ? html`<div class="on" data-mvt="detail:nuit-ferme">${icone('lock')}Tout est fermé</div>` : ''}
    </div>`;
}
