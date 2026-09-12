import { html, type TemplateResult } from 'lit';
import type { Etat } from '../etat';
import type { Moment } from '../contexte';
import type { Pastille } from '../agenda';
import { temperatureCourte } from '../meteo';
import { icone } from './icones';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
              'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Colore le seul préfixe que la donnée déclare comme étant une température (`Pastille.accent`,
 *  posé par `agenda.ts`). Le `startsWith` est un GARDE, pas une politesse : si `agenda.ts` et
 *  `meteo.ts` divergeaient un jour sur le format, on retombe sur du texte non coloré — jamais sur
 *  un texte amputé au mauvais endroit sur un mur. */
function valeurPastille(p: Pastille) {
  return p.accent && p.valeur.startsWith(p.accent)
    ? html`<span class="val">${p.accent}</span>${p.valeur.slice(p.accent.length)}`
    : p.valeur;
}

export function rendreBandeau(
  etat: Etat, moment: Moment, maintenant: Date, capteurTemp: string,
  // Tâche 8 (2026-08-02) : optionnel et en dernière position — aucun appelant existant à changer,
  // et un bandeau sans pastille reste un bandeau valide (météo indisponible, cas normal ici).
  pastille?: Pastille | null,
): TemplateResult {
  const hh = String(maintenant.getHours()).padStart(2, '0');
  const mm = String(maintenant.getMinutes()).padStart(2, '0');
  const date = `${JOURS[maintenant.getDay()]} ${maintenant.getDate()} ${MOIS[maintenant.getMonth()]}`;

  // Ronde de correction 1 : `weather.maison` tombe régulièrement en `unavailable` sur cette
  // installation. Un attribut `temperature` peut alors traîner, périmé, dans l'état résiduel
  // — d'où le passage par `estUtilisable`, exactement comme pour le capteur intérieur juste
  // en dessous, plutôt qu'un simple test de présence de l'attribut.
  const meteo = etat.estUtilisable('weather.maison') ? etat.lire('weather.maison') : undefined;
  const dehors = meteo?.attributs['temperature'];
  const dedans = etat.estUtilisable(capteurTemp)
    ? Number(etat.lire(capteurTemp)!.etat).toFixed(1).replace('.', ',')
    : null;

  return html`
    <div class="cap" data-zone="bandeau">
      <!-- Correction (2026-08-02) : .cap est une grille à deux colonnes, pas une ligne suivie
           d'une phrase empilée dessous sur toute la largeur — ce découpage-là forçait la hauteur
           du bandeau à grandir dès que la pastille passait sur deux lignes, alors que c'est le
           cas nominal (pastilleBandeau retombe en permanence sur « Demain » + phraseDemain, qui
           dépasse presque toujours une ligne à 13px/176px). .gauche porte l'heure, la date ET la
           phrase : c'est elle qui domine la hauteur dans tous les cas courants, donc c'est elle
           qui fixe la hauteur du bandeau — insensible au nombre de lignes de la pastille en face,
           qui a désormais de la place jusqu'en bas de .cap, exactement là où le vide sous la
           phrase existait avant. -->
      <div class="gauche">
        <!-- .bloc-heure n'est pas décoratif : .gauche est réparti en space-between
             (base.css), qui écarte TOUS ses enfants. Sans ce groupe, la date se retrouverait
             au milieu de la colonne au lieu de rester sous l'heure. -->
        <div class="bloc-heure">
          <div class="heure">${
            [...`${hh}:${mm}`].map((c, i) => html`<span
              class="chiffre" data-mvt="chiffre:${i}" data-mvt-etat=${c}>${c}</span>`)
          }</div>
          <div class="date">${date}</div>
        </div>
        ${dedans ? html`<div class="phrase" data-mvt="detail:dedans">Il fait
          <b class="val">${dedans}°</b> ici.</div>` : ''}
      </div>
      <!-- Colonne droite : c'est ELLE qui était vide sous la température. La pastille s'y
           range, jamais en pleine largeur sous la phrase — sinon le vide reste. -->
      <div class="droite">
        <!--
          data-mvt-etat reste le nombre nu (jamais passé par temperatureCourte, qui suffixe le
          degré) : le moteur de mouvement compare cette valeur d'une peinture à l'autre pour
          décider quels chiffres rejouer (src/mouvement/moteur.ts), et un degré en plus y
          changerait la clé de comparaison sans rien apporter. Seul le TEXTE affiché passe par
          temperatureCourte, pour le même format que les deux autres températures du bandeau
          (meteo.ts).
        -->
        ${dehors !== undefined ? html`
          <div class="dehors" data-mvt="detail:dehors">${icone(String(meteo!.etat))}
            <span class="chiffre val" data-mvt="chiffre:dehors"
                  data-mvt-etat=${String(Math.round(Number(dehors)))}
            >${temperatureCourte(Number(dehors))}</span></div>` : ''}
        ${pastille ? html`
          <div class="pastille" data-mvt="detail:pastille">
            <div class="pt">${pastille.etiquette}</div>
            <div class="pv">${valeurPastille(pastille)}</div>
          </div>` : ''}
      </div>
    </div>`;
}
