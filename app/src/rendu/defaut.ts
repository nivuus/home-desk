/** Les deux blocs par défaut de la cuisine et du bureau, à la place des six prochaines heures
 *  (demande du propriétaire, 2026-08-03 — le salon les avait déjà perdues au profit de la voiture
 *  à la tâche 9 bis). Quelle pièce reçoit quel bloc est écrit une seule fois, sur `Ecran.blocDefaut`
 *  (`ecran.ts`) ; ces deux fonctions n'en savent rien, elles reçoivent leurs données déjà
 *  choisies par `demarrage.ts`, exactement comme `rendreVoiture` (`rendu/voiture.ts`) qu'elles
 *  rejoignent au même emplacement (le bloc central du mode `defaut`, `modes.ts`).
 *
 *  Même gabarit que `rendu/modes.ts` (ménage, aération) : `.mode-bloc`/`.mode-texte`/`.t`/`.v`,
 *  couleur neutre — ni l'un ni l'autre n'est une alerte. Aucun `.mode-action` : ni le repas ni le
 *  rendez-vous ne proposent de geste, contrairement au ménage (« Ranger »).
 *
 *  `.v` seul, ailleurs dans `rendu/modes.ts`, tient sur une ligne (nowrap + ellipse) : son
 *  vocabulaire est FIXE et court (« Ménage », « Ouvert »). Ici, le nom du plat et le résumé du
 *  rendez-vous viennent d'une source EXTERNE (`home_stock`, calendrier) dont la longueur n'est pas
 *  maîtrisée par ce projet — `.v.deux-lignes` (`base.css`, même mécanisme que `.media
 *  .v.deux-lignes`) clampe à 2 lignes plutôt que de couper silencieusement un nom au milieu d'un
 *  mot (relevé par `outils/verifier-rendu.mjs`, qui a mesuré la troncature sur le pire cas
 *  atteignable avant ce correctif).
 *
 *  Fonctions de présentation PURES, sans horloge ni état implicite : `maintenant` est toujours
 *  reçu en paramètre (même discipline que `contexte.ts`/`modes.ts`/`agenda.ts`).
 *
 *  Règle commune aux deux : rien à montrer → `undefined`, jamais un bloc vide. Un `.mode-bloc`
 *  vide occuperait quand même sa hauteur (`rendreCorps` ne rend `blocCentral` que s'il existe,
 *  cf. son commentaire) — l'écran doit se resserrer, pas afficher un cadre creux. */
import { html, type TemplateResult } from 'lit';
import { estCeJour, heureCourte, type Evenement } from '../agenda';
import { formaterRestant } from '../minuteur';
import type { RepasSuivant } from '../garde-manger';
import { icone } from './icones';

/** Cuisine : le repas SUIVANT, lu dans les attributs de `sensor.home_stock_next_meal`
 *  (`repasSuivant`, `src/garde-manger.ts`). `.t` porte l'étiquette du créneau, `.v` le plat sur
 *  deux lignes.
 *
 *  Lot 6 (2026-08-21) : la SOURCE a changé, le gabarit PAS D'UN PIXEL. Avant, `demarrage.ts`
 *  téléchargeait le plan de repas d'une source tierce toutes les 15 minutes et résolvait le repas suivant
 *  lui-même (`resoudreRepasSuivant`) ; `home_stock` a déjà fait ce travail et le publie. Ce rendu
 *  n'a pas bougé : même `.mode-bloc`, même `.mode-texte`, même `.v.deux-lignes` — effet sur la
 *  hauteur : 0.
 *
 *  TOUCHABLE quand il y a une recette à ouvrir — comme `.synthese` (`rendu/corps.ts`) ouvre déjà la
 *  vue « Tâches » : on touche ce qu'on vient de lire, sans chevron ni décoration, l'affordance
 *  étant portée par la tuile « Recette » de la grille. Une NOTE (« Reste quinoa + légumes ») ou un
 *  simple produit n'a pas de recette : le bloc l'affiche mais reste inerte — un bloc qui répond au
 *  contact sans rien ouvrir serait le bouton mort que ce projet traque partout. */
export function rendreRepasSuivant(r: RepasSuivant | undefined): TemplateResult | undefined {
  if (!r || r.plat.trim() === '') return undefined;
  const ouvrable = r.recetteId !== null;
  return html`
    <div class="mode-bloc" data-zone="blocCentral" data-mvt="bloc:repas"
         @pointerdown=${ouvrable ? () => { location.hash = '#recette'; } : null}>
      ${icone('repas')}
      <div class="mode-texte">
        <div class="t">${r.etiquette}</div>
        <div class="v deux-lignes">${r.plat}</div>
      </div>
    </div>`;
}

/** La recette RÉDUITE : le point de reprise pendant la cuisson (mode `recette`, `modes.ts`). Même
 *  gabarit `.mode-bloc` que tous les autres blocs centraux — c'est ce qui garantit que le budget de
 *  hauteur ne bouge pas quand ce mode prend la place du mode `minuteur`.
 *
 *  Le décompte du minuteur le plus urgent vit dans `.t`, à côté de l'étape, JAMAIS sur une ligne à
 *  lui : une ligne de plus ferait grandir le bloc, donc coûterait une commande de la grille
 *  (`combien`, `modes.ts`). Aucun doublon avec la tuile « Minuteur », qui n'affiche que son libellé
 *  (`tuileMinuteur`, `rendu/minuteur.ts`). */
export function rendreRecetteReduite(
  v: { etape: number; total: number; plat: string; restantS?: number },
): TemplateResult {
  const decompte = v.restantS === undefined ? '' : ` · ${formaterRestant(v.restantS)}`;
  return html`
    <div class="mode-bloc" data-zone="blocCentral" data-mvt="bloc:recette"
         @pointerdown=${() => { location.hash = '#recette'; }}>
      ${icone('book')}
      <div class="mode-texte">
        <div class="t">Étape ${v.etape}/${v.total}${decompte}</div>
        <div class="v deux-lignes">${v.plat}</div>
      </div>
    </div>`;
}

/** Bureau : le prochain rendez-vous du jour, parmi les mêmes calendriers que la pastille du
 *  bandeau (`evenements`, chargé par `chargerAgenda`, `demarrage.ts` — un seul chargement, jamais
 *  un second appel réseau propre à ce bloc).
 *
 *  Un anniversaire est un événement de la journée entière, sans heure : ce bloc promet « l'heure
 *  et le résumé » (brief de tâche 14), donc il l'écarte — même choix que `pastilleBandeau`
 *  (`agenda.ts`) pour sa propre fenêtre de rendez-vous proches, jamais une seconde règle qui
 *  pourrait diverger. Pas de fenêtre de 3 h contrairement à la pastille (`FENETRE_MS`) : ce bloc
 *  occupe tout un bloc central, la pastille non — un rendez-vous à 5 h d'ici y a toujours sa
 *  place, ce que la pastille (un simple repli de coin de bandeau) n'a pas la place de promettre.
 *
 *  Aucun rendez-vous restant AUJOURD'HUI (tous passés, ou le seul à venir est demain) OU agenda
 *  hors ligne (`evenements` vide, `chargerAgenda` garde alors le dernier tableau connu) →
 *  `undefined`, même règle que `rendreRepasSuivant`. */
/** L'entité de la liste d'entretien — écrite ICI, une seule fois, parce que trois fichiers en
 *  dépendent désormais et qu'ils doivent parler de la MÊME liste : `demarrage.ts` y lit le cache
 *  de `chargerTaches` pour remplir le bloc ci-dessous, et `rendu/corps.ts` retire l'entrée de
 *  synthèse qui porte cette même entité quand le bloc l'affiche (`masquerEntretien`). Trois
 *  littéraux `'todo.maintenance'` disséminés se seraient désynchronisés au premier renommage, et
 *  le seul symptôme aurait été un doublon silencieux à l'écran. `ecran.ts` garde le sien : c'est
 *  la DÉCLARATION de la ligne de synthèse (une donnée de configuration de pièce), pas une
 *  référence à cette liste-ci. */
export const ENTITE_ENTRETIEN = 'todo.maintenance';

/** Tâche 17 (2026-08-03) : le REPLI des deux blocs ci-dessus, en cuisine comme au bureau.
 *
 *  Pourquoi : capture des trois tablettes réelles à 21 h 07, aucun plat planifié et
 *  aucun rendez-vous restant ce soir-là — la cuisine montrait ~185 px de fond nu, le bureau
 *  ~175 px. Ces deux blocs rendent `undefined` PLUS SOUVENT qu'ils ne rendent quelque chose (un
 *  plan de repas vide est l'état ORDINAIRE de cette installation) : leur
 *  absence n'est donc pas un cas limite à tolérer, c'est le cas courant. Arbitrage du
 *  propriétaire : les tâches d'entretien prennent la place.
 *
 *  Source : `taches['todo.maintenance']`, déjà rempli par `chargerTaches` (`demarrage.ts`) —
 *  `todo.maintenance` est déclaré dans la `synthese` des trois pièces (`ecran.ts`), donc déjà
 *  présent dans `listesTachesPiece` (`cochage.ts`). Aucun second chemin de lecture, exactement
 *  comme `rendreRepasSuivant` reçoit le repas déjà choisi plutôt que de le déduire lui-même.
 *
 *  LE TITRE PORTE LE COMPTE, et ce n'est pas décoratif : quand ce bloc s'affiche, la ligne de
 *  synthèse cesse d'annoncer « 3 tâches d'entretien » (`masquerEntretien`, `rendu/corps.ts` — la
 *  règle « jamais la même donnée deux fois sur une tablette »). Sans le compte ici, le repli
 *  ferait donc DISPARAÎTRE le nombre de l'écran au lieu de le déplacer.
 *
 *  Libellés joints par « · » et bornés à 2 lignes (`.v.deux-lignes`), comme les blocs ci-dessus — jamais
 *  empilés sur des lignes supplémentaires, qui feraient grandir le bloc sans plafond avec le
 *  nombre de tâches (et coûteraient une commande de la grille, cf. `combien`, `modes.ts`). C'est
 *  la SEULE façon de garantir que ce repli tienne exactement la même hauteur que les deux blocs
 *  qu'il remplace, quel que soit le contenu de la liste.
 *
 *  MESURE, contre l'intuition du brief : ces résumés ne sont PAS courts. Ils viennent de la macro
 *  `maintenance_plan()` (`config/custom_templates/maintenance.jinja`) et font 25 à 46 caractères
 *  (« Aspirateur RDC — brosse principale à remplacer », « Mises à jour manuelles à installer ») ;
 *  le pourcentage restant vit dans la DESCRIPTION de la tâche, que `listerTaches` ne rapporte même
 *  pas (`connexion.ts` ne garde que `summary`). Deux lignes de `.mode-bloc .v` en tiennent une
 *  trentaine chacune : au-delà de deux tâches, le clamp coupe réellement — d'où le compte au
 *  titre, et le détail complet à un appui de là (la ligne de synthèse ouvre la vue « Tâches »).
 *
 *  Liste vide, ou tous les libellés vides → `undefined`, même règle que `rendreRepasSuivant` : jamais un
 *  cadre creux. Le compte annoncé est celui des tâches RETENUES, jamais du tableau brut. */
export function rendreEntretien(items: { uid: string; texte: string }[]): TemplateResult | undefined {
  const nommees = items.filter((i) => i.texte.trim() !== '');
  if (nommees.length === 0) return undefined;
  return html`
    <div class="mode-bloc" data-zone="blocCentral" data-mvt="bloc:entretien">${icone('entretien')}
      <div class="mode-texte">
        <div class="t">Entretien — ${nommees.length} tâche${nommees.length > 1 ? 's' : ''}</div>
        <div class="v deux-lignes">${nommees.map((i) => i.texte).join(' · ')}</div>
      </div>
    </div>`;
}

export function rendreProchainRdv(evenements: Evenement[], maintenant: Date): TemplateResult | undefined {
  const t = maintenant.getTime();
  const prochain = evenements
    .filter((e) => !e.estAnniversaire && estCeJour(e.debut, maintenant))
    .map((e) => ({ e, quand: new Date(e.debut).getTime() }))
    .filter(({ quand }) => quand > t)
    .sort((a, b) => a.quand - b.quand)[0];
  if (!prochain) return undefined;
  return html`
    <div class="mode-bloc" data-zone="blocCentral" data-mvt="bloc:agenda">${icone('agenda')}
      <div class="mode-texte">
        <div class="t">Rendez-vous</div>
        <div class="v deux-lignes">${heureCourte(prochain.e.debut)} — ${prochain.e.resume}</div>
      </div>
    </div>`;
}
