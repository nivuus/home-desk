import { html, type TemplateResult } from 'lit';
import type { Etat } from '../etat';
import type { Moment } from '../contexte';
import type { Pastille } from '../agenda';
import { temperatureCourte } from '../meteo';
import { icone } from './icones';
import { dateTimeFormat, numberFormat, t } from '../i18n';

/** Colours the one fragment the data declares as a temperature (`Pastille.accent`, set by
 *  `agenda.ts`), wherever the catalog's sentence puts it. The search is a GUARD: if `agenda.ts`
 *  and `meteo.ts` ever diverged on the format, the text stays uncoloured — never cut at the wrong
 *  place on a wall. */
function valeurPastille(p: Pastille) {
  // Wherever the language puts the temperature in its sentence: first, last or in the middle.
  const at = p.accent ? p.valeur.indexOf(p.accent) : -1;   // policy: allow-fr (`Pastille` field names)
  return p.accent && at >= 0
    ? html`${p.valeur.slice(0, at)}<span class="val">${p.accent}</span>${p.valeur.slice(at + p.accent.length)}`
    : p.valeur;
}

export function rendreBandeau(
  etat: Etat, moment: Moment, maintenant: Date, capteurTemp: string,
  // Tâche 8 (2026-08-02) : optionnel et en dernière position — aucun appelant existant à changer,
  // et un bandeau sans pastille reste un bandeau valide (météo indisponible, cas normal ici).
  pastille?: Pastille | null,
): TemplateResult {
  // The clock and the date in the person's locale and clock (12 or 24 h): each character of the
  // time is its own span, which the motion engine replays when it changes.
  const heure = dateTimeFormat({ hour: '2-digit', minute: '2-digit' }).format(maintenant);
  const date = dateTimeFormat({ weekday: 'long', day: 'numeric', month: 'long' }).format(maintenant);

  // Ronde de correction 1 : `weather.maison` tombe régulièrement en `unavailable` sur cette
  // installation. Un attribut `temperature` peut alors traîner, périmé, dans l'état résiduel
  // — d'où le passage par `estUtilisable`, exactement comme pour le capteur intérieur juste
  // en dessous, plutôt qu'un simple test de présence de l'attribut.
  const meteo = etat.estUtilisable('weather.maison') ? etat.lire('weather.maison') : undefined;
  const dehors = meteo?.attributs['temperature'];
  const dedans = etat.estUtilisable(capteurTemp)
    ? numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(etat.lire(capteurTemp)!.etat))
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
            [...heure].map((c, i) => html`<span
              class="chiffre" data-mvt="chiffre:${i}" data-mvt-etat=${c}>${c}</span>`)
          }</div>
          <div class="date">${date}</div>
        </div>
        ${dedans ? html`<div class="phrase" data-mvt="detail:dedans">${t().band.inside(
          html`<b class="val chiffre" data-mvt="chiffre:dedans" data-mvt-etat=${dedans}>${dedans}°</b>`)}</div>` : ''}
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
