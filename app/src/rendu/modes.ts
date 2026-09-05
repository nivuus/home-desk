/** Les deux modes principaux qui ne sont ni une alerte, ni un média, ni les prévisions.
 *
 *  Tous deux reprennent le gabarit `.t`/`.v` de `.demain`/`.alerte`/`.media` (règle 1 de
 *  cohérence) — et tous deux utilisent une couleur NEUTRE : ni l'un ni l'autre n'est une alerte.
 *  `aeration` en particulier : `alertes.ts` a délibérément retiré la fenêtre du rang d'alerte, et
 *  ce mode ne l'y remet pas. Il occupe le bloc d'information central, sans confisquer l'écran. */
import { html, type TemplateResult } from 'lit';
import type { Etat } from '../etat';
import { icone } from './icones';

let agir: (domaine: string, service: string, entite: string) => void = () => {};
export function brancherModes(fn: typeof agir) { agir = fn; }

/** « Porte balcon (S) Ouverture » → « Porte balcon ». Le suffixe de capteur et le code de pièce
 *  entre parenthèses sont du vocabulaire d'installateur : personne ne lit « (S) Ouverture » sur
 *  un mur. Repli sur l'`entity_id` si aucun nom convivial n'est publié — jamais une chaîne vide,
 *  qui laisserait un blanc inexplicable au milieu d'une phrase. */
function nomOuvrant(etat: Etat, id: string): string {
  const brut = String(etat.lire(id)?.attributs['friendly_name'] ?? '');
  const propre = brut.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s*Ouverture\s*$/i, '').trim();
  return propre || id;
}

/** Tâche 13 (2026-08-03) — libellés RACCOURCIS, sur mesure et non sur intuition. `.mode-bloc .v`
 *  est en `white-space: nowrap; text-overflow: ellipsis` (`base.css`) : ce qui ne tient pas est
 *  coupé en silence. Le contrôle de texte tronqué de `outils/verifier-rendu.mjs`, une fois le
 *  mode `menage` réellement rendu et mesuré, a montré que le cas NOMINAL était coupé —
 *  « Nettoyage en cours · 62 % » demande 223px et n'en avait que 108, donc l'écran affichait
 *  « Nettoyage e… » et le niveau de batterie disparaissait purement et simplement.
 *
 *  Largeur disponible = 279px (bloc) − 24 (icône) − 26 (deux gouttières) − la largeur du bouton
 *  « Retour base ». Ce bouton est la seule cible tactile du bloc : le raccourcir rend sa largeur
 *  au texte sans jamais toucher à sa hauteur de 62px — la règle des cibles tactiles porte sur la
 *  hauteur, pas sur la largeur.
 *
 *  Ronde de correction 1 (relecteur) : « Base » avait d'abord été retenu. « Ranger » tient dans
 *  le même budget et c'est un VERBE, sur un bouton dont tout l'intérêt est d'être une action —
 *  sur un mur, à côté d'une icône d'aspirateur, un substantif seul ne dit pas qu'on peut appuyer.
 *  Mesuré : bouton 84,6px, donc 144px pour `.v` ; pire libellé ATTEIGNABLE « En cours · 100 % »
 *  à 140,1px, soit 3,9px de marge. Mince, mais c'est un plancher : la machine de vérification
 *  n'a pas Roboto et retombe sur DejaVu Sans, plus large. Et `.mode-bloc .v` étant en `nowrap`,
 *  tout dépassement futur devient une faute dure de `outils/verifier-rendu.mjs`, jamais un texte
 *  silencieusement rogné.
 *
 *  Correction de la même ronde : « En pause · 100 % » avait été cité comme pire cas, à tort —
 *  `paused` N'ATTEINT JAMAIS ce bloc, `demarrage.ts` n'allume le mode `menage` que sur
 *  `cleaning`, `returning` et `error`. Les deux autres entrées restent déclarées ici pour que le
 *  jour où cette liste s'élargirait, le libellé existe déjà plutôt que de retomber sur
 *  « En marche ». */
const ETATS_VACUUM: Record<string, string> = {
  cleaning: 'En cours',
  returning: 'Retour',
  paused: 'En pause',
  error: 'Bloqué',
};

export function rendreMenage(etat: Etat, aspirateur: string): TemplateResult {
  const e = etat.lire(aspirateur);
  const batterie = Number(e?.attributs['battery_level']);
  const detail = ETATS_VACUUM[e?.etat ?? ''] ?? 'En marche';
  return html`
    <div class="mode-bloc" data-mvt="bloc:menage">${icone('aspirateur')}
      <div class="mode-texte">
        <div class="t">Ménage</div>
        <div class="v">${detail}${Number.isFinite(batterie)
          ? html` · <span class="chiffre" data-mvt="chiffre:${aspirateur}"
                          data-mvt-etat=${String(Math.round(batterie))}
                    >${Math.round(batterie)} %</span>` : ''}</div>
      </div>
      <!-- « Ranger » et non « Retour base » : cf. le commentaire d'ETATS_VACUUM ci-dessus. Un
           verbe, parce que c'est un bouton ; la destination (la base de charge) est déjà dite par
           l'icône d'aspirateur à gauche du bloc. -->
      <!-- Marque (2026-08-25) : le .mode-bloc au-dessus est bien marqué, mais il ne COUVRE PAS ce
           bouton — sa signature (chemin + classes) est identique d'un mode à l'autre, seule sa
           clé change, donc il ne figure ni parmi les entrants ni parmi les sortants de la
           différence. Ce bouton, lui, n'existe QUE dans le mode ménage : il apparaît et disparaît
           pour de bon, et doit donc porter sa propre marque. -->
      <div class="mode-action" data-mvt="detail:menage-ranger"
           @pointerdown=${() => agir('vacuum', 'return_to_base', aspirateur)}>
        Ranger</div>
    </div>`;
}

export function rendreAeration(etat: Etat, ouvrants: string[]): TemplateResult {
  const ouverts = ouvrants
    .filter((id) => etat.estUtilisable(id) && etat.lire(id)!.etat === 'on')
    .map((id) => nomOuvrant(etat, id));
  return html`
    <div class="mode-bloc" data-mvt="bloc:aeration">${icone('fenetre')}
      <div class="mode-texte">
        <div class="t">Ouvert</div>
        <div class="v">${ouverts.join(', ')}</div>
      </div>
    </div>`;
}
