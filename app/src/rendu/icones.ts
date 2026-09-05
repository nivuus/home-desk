import { html, svg, type TemplateResult } from 'lit';

export const CHEMINS: Record<string, TemplateResult> = {
  sunny: svg`<circle cx="9" cy="9" r="3.3"/><path d="M9 2.6v1.6M9 13.8v1.6M2.6 9h1.6M13.8 9h1.6"/><path d="M8.6 20.5h9.2a3.4 3.4 0 0 0 .3-6.8 4.7 4.7 0 0 0-8.6-1.4"/>`,
  partlycloudy: svg`<circle cx="8" cy="8" r="3"/><path d="M7 19h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.4-1.2A3.6 3.6 0 0 0 7 19z"/>`,
  cloudy: svg`<path d="M7 19h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.4-1.2A3.6 3.6 0 0 0 7 19z"/>`,
  rainy: svg`<path d="M7 15h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.4-1.2A3.6 3.6 0 0 0 7 15z"/><path d="M8.5 18.2l-1 2.6M12 18.2l-1 2.6M15.5 18.2l-1 2.6"/>`,
  bulb: svg`<path d="M9.2 18h5.6M10.2 21h3.6M12 3a6.2 6.2 0 0 0-3.7 11.2V16h7.4v-1.8A6.2 6.2 0 0 0 12 3z"/>`,
  flame: svg`<path d="M12 2.5c1.2 4.2 5.2 5.4 5.2 9.5a5.2 5.2 0 0 1-10.4 0c0-3 2.8-4.3 5.2-9.5z"/>`,
  sofa: svg`<path d="M4.5 12.5V10a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2.5"/><path d="M3 15a2 2 0 0 1 2-2 2 2 0 0 1 2 2v1.5h10V15a2 2 0 0 1 2-2 2 2 0 0 1 2 2v4.5H3z"/>`,
  moon: svg`<path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11z"/>`,
  film: svg`<rect x="3" y="4.5" width="18" height="15" rx="2.4"/><path d="M8 4.5v15M16 4.5v15"/>`,
  lock: svg`<rect x="4.5" y="10.5" width="15" height="10" rx="2.4"/><path d="M8.2 10.5V7.3a3.8 3.8 0 0 1 7.6 0v3.2"/>`,
  home: svg`<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.6 10v9.5h12.8V10"/>`,
  list: svg`<path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h6.5"/><path d="M4 6.2l1.2 1.2L7.4 5"/>`,
  book: svg`<path d="M4 5.5A2 2 0 0 1 6 3.5h13v14H6a2 2 0 0 0-2 2z"/><path d="M4 19.5h15"/>`,
  // Tâche 8 bis : viseur de scanner (4 coins) + trait de balayage central — pas dans le brief
  // (qui ne modifiait pas ce fichier), ajouté pour le bouton « Scanner » cuisine plutôt que de
  // le laisser retomber sur `cloudy` (repli par défaut de `icone()` ci-dessous), trompeur pour
  // un scanner de codes-barres.
  scan: svg`<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>`,
  // Tâche 9 : signal coupé (arcs wifi barrés + point) pour le bandeau `.hors-ligne` — pas dans
  // le brief (qui ne modifiait pas ce fichier), ajouté pour ne pas retomber sur `cloudy` (repli
  // par défaut de `icone()` ci-dessous), trompeur pour une perte de connexion.
  horsligne: svg`<path d="M3.5 3.5l17 17"/><path d="M6 8.3a10 10 0 0 1 3.8-2M18 8.3a10 10 0 0 1 2.1 1.4M9 12a5.3 5.3 0 0 1 2.6-1.3M15 12a5.3 5.3 0 0 1 1 .5"/><circle cx="12" cy="17.3" r="1"/>`,
  // Tâche 18 : case à cocher vide, pour une ligne de la vue « Tâches » pas encore armée — pas
  // dans le brief (qui ne modifiait pas ce fichier), ajoutée pour ne pas retomber sur `cloudy`
  // (repli par défaut de `icone()` ci-dessous), trompeur pour une tâche à cocher.
  case: svg`<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/>`,
  // Case cochée : même contour que `case` ci-dessus + coche, pour qu'une ligne armée (« toucher
  // pour confirmer ») se distingue d'un coup d'œil d'une ligne encore à cocher.
  coche: svg`<rect x="4.5" y="4.5" width="15" height="15" rx="3.5"/><path d="M8.3 12.3l2.5 2.5 4.9-5.6"/>`,
  // Tâche 4 (2026-08-02) : transport média, ouvrants, et les trois icônes des modes secondaires.
  // Dessinées sur la même grille que les seize précédentes (24×24, trait 1.9, bouts ronds, aucun
  // remplissage) — un jeu importé, ou une icône pleine au milieu d'icônes en trait, se verrait
  // immédiatement (règle 3 de cohérence du spec).
  pause: svg`<path d="M9.3 5.5v13M14.7 5.5v13"/>`,
  lecture: svg`<path d="M7.8 5.2l10.4 6.8-10.4 6.8z"/>`,
  precedent: svg`<path d="M17.5 6.2v11.6L8.7 12z"/><path d="M6.5 5.8v12.4"/>`,
  suivant: svg`<path d="M6.5 6.2v11.6L15.3 12z"/><path d="M17.5 5.8v12.4"/>`,
  porte: svg`<path d="M6 20.5h12M8 20.5V4.5h8v16"/><circle cx="13.3" cy="12.4" r="1"/>`,
  rideau: svg`<path d="M3.5 4h17"/><path d="M6.5 4v16c2.6-1 4.2-4.2 4.2-8S9.1 5 6.5 4z"/><path d="M17.5 4v16c-2.6-1-4.2-4.2-4.2-8s1.6-7 4.2-8z"/>`,
  aspirateur: svg`<circle cx="12" cy="12.5" r="7.5"/><circle cx="12" cy="12.5" r="2.8"/><path d="M12 5v2"/>`,
  fenetre: svg`<rect x="4.5" y="4" width="15" height="16" rx="1.6"/><path d="M12 4v16M4.5 12h15"/>`,
  // Tâche 4 (minuteurs-cuisine, 2026-08-03) : `pause`/`lecture` existent déjà ci-dessus (réutilisées
  // telles quelles pour les boutons marche/pause du bloc minuteur). `croix` (annuler un minuteur) et
  // `plus` (« + 5 » du réglage fin ET tuile « Nouveau ») manquaient encore ; `minuteur` reprend le
  // tracé proposé par la tâche 3 (cercle + aiguilles), délibérément non ajouté alors — son seul
  // appelant, `tuileMinuteur`, arrive avec ce fichier (cf. `rendu/minuteur.ts`).
  croix: svg`<path d="M6 6l12 12M18 6L6 18"/>`,
  plus: svg`<path d="M12 5v14M5 12h14"/>`,
  minuteur: svg`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>`,
  // Tâche 9 bis (voiture, 2026-08-03) : bloc de climatisation (caisson + trois flux d'air) — pas
  // dans le brief d'icônes d'origine (qui ne modifiait pas ce fichier), ajoutée pour le bouton de
  // clim de la voiture plutôt que de le laisser retomber sur `cloudy` (repli par défaut d'`icone()`
  // ci-dessous), trompeur pour une clim.
  clim: svg`<rect x="4" y="5" width="16" height="6" rx="2"/><path d="M6.5 14.5q1.5 2 3 0t3 0 3 0 3 0"/><path d="M6.5 18.5q1.5 2 3 0t3 0 3 0 3 0"/>`,
  // Tâche 14 (2026-08-03) : les six heures disparaissent, remplacées par « ce qui est prévu à
  // manger » (cuisine) et « le prochain rendez-vous » (bureau) — pas dans le brief d'icônes
  // d'origine (qui listait `minuteur`/`pause`/`lecture`/`croix`/`plus`, tâche 4 du plan
  // minuteurs-cuisine), ajoutées pour ne pas laisser `rendreRepasSuivant`/`rendreProchainRdv`
  // (`rendu/defaut.ts`) retomber sur `cloudy` (repli par défaut d'`icone()`).
  // `repas` : fourchette (trois dents fusionnant en un manche) à gauche, couteau à droite.
  repas: svg`<path d="M7 3v5M9 3v5M11 3v5M9 8v13"/><path d="M16 3c-1.8.6-2.6 2-2.6 4s.8 3.4 2.6 4v10"/>`,
  // `agenda` : même grammaire que `fenetre` (rect + traits) — un calendrier mural, deux attaches.
  agenda: svg`<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9.5h16M8 3v4M16 3v4"/>`,
  // Tâche 17 (2026-08-03) : le bloc de repli « Entretien » (`rendreEntretien`, `rendu/defaut.ts`),
  // qui prend la place du repas/du rendez-vous quand ils n'ont rien à dire. Une clé plate, SANS
  // cadran — corrigé à la relecture, la version précédente de ce commentaire annonçait « le même
  // objet » que le `mdi:wrench-clock` que le registre HA donne effectivement à `todo.maintenance`
  // (vérifié : `attributes.icon`), alors que le cadran d'horloge n'est pas dessiné. C'est la CLÉ
  // de cette icône, pas l'icône entière : à 24 px de grille et 1,9 px de trait, un cadran greffé
  // sur le manche ne rend qu'une tache, et la grammaire de ce jeu ne superpose jamais deux objets
  // dans une même case (cf. `case`/`agenda`/`scan`). Le rendu est validé visuellement ; ce qui est
  // corrigé ici est l'affirmation, pas le dessin. Ajoutée plutôt que de laisser
  // `icone('entretien')` retomber sur `cloudy` (repli par défaut d'`icone()` plus bas), qui aurait
  // mis un nuage sur une liste de piles à changer sans qu'aucun test ne rougisse.
  entretien: svg`<path d="M20.9 18.6 11.8 9.5a5.2 5.2 0 0 0-6.9-6.6L8.3 6.3 6.3 8.3 2.9 4.9a5.2 5.2 0 0 0 6.6 6.9l9.1 9.1a1 1 0 0 0 1.4 0l.9-.9a1 1 0 0 0 0-1.4z"/>`,
  // Tâche 19 (2026-08-03) : les deux tuiles de ventilation ajoutées au bureau et à la cuisine.
  // Aucune icône existante ne convenait (`clim` dessine un caisson de climatisation, `aspirateur`
  // un robot vu de dessus) et le repli par défaut d'`icone()` est `cloudy` — un nuage sur un
  // ventilateur. Le Velux, lui, n'a rien reçu : il réutilise `fenetre` ci-dessus, un Velux ÉTANT
  // une fenêtre. Toutes deux dessinées sur la grille commune (24×24, trait 1,9 porté par
  // l'enveloppe, aucun remplissage) et vérifiées au rendu réel dans un navigateur, à 120 px et à
  // 24 px — la taille à laquelle elles vivent réellement sur les tuiles.
  //
  // `ventilateur` : une hélice à trois pales — un moyeu (cercle central) et trois pétales
  // identiques répartis à 120°, chacun partant du moyeu et y revenant. Rien d'autre n'est dessiné
  // (ni grille, ni pied, ni flèches) et rien ne se superpose : les pales touchent le moyeu, elles
  // ne passent pas par-dessus.
  ventilateur: svg`<circle cx="12" cy="12" r="2.2"/><path d="M13.4 10.3C16 3.7 8 3.7 10.6 10.3M9.8 11.6C2.8 12.6 6.9 19.6 11.2 14.1M12.8 14.1C17.1 19.6 21.2 12.6 14.2 11.6"/>`,
  // `purificateur` : trois filets d'air seuls — trois traits horizontaux de longueurs
  // différentes, chacun terminé par une boucle enroulée. AUCUN appareil n'est dessiné (ni colonne,
  // ni filtre, ni caisson) : c'est l'air en mouvement, et c'est délibéré. Une colonne + des ondes
  // aurait donné, à 24 px et 1,9 px de trait, une silhouette quasi identique à `clim` (caisson +
  // flux) déjà dans ce jeu ; les filets seuls restent lisibles de loin et ne peuvent se confondre
  // avec l'hélice ci-dessus.
  purificateur: svg`<path d="M3.5 7.5h9.8a2.6 2.6 0 1 0-2.6-2.6"/><path d="M3.5 12h12.4a2.8 2.8 0 1 1-2.8 2.8"/><path d="M3.5 16.5h7.6a2.4 2.4 0 1 1-2.4 2.4"/>`,
  // Revue tâche 15, mineur M2 — `soleil` et `gateau` ONT ÉTÉ RETIRÉS D'ICI. Toutes deux avaient
  // été dessinées à la tâche 4, testées par `tests/icones.test.ts` (existence, grille, trait)…
  // et rendues par PERSONNE : aucun appelant, ni littéral ni dynamique. Trois tests verts sur du
  // code mort, exactement le genre de couverture rassurante que ce projet s'interdit.
  // `soleil` n'est le nom d'aucune condition de `weather.*` (HA dit `sunny`, déjà déclarée) ;
  // `gateau` visait la pastille d'anniversaire, qui n'a jamais eu d'icône — et ne peut pas en
  // recevoir une sans revoir sa géométrie (`.pastille` fait 133 px de large, `.pt` 10 px de haut,
  // et la hauteur du bandeau est un invariant mesuré). L'y brancher est une décision de design à
  // prendre et à MESURER, pas un raccroc de revue à 3 h du matin. Le nouveau test « toute icône
  // déclarée est référencée » interdit désormais qu'une icône reprenne cette place sans appelant.
};

export function icone(nom: string) {
  const d = CHEMINS[nom] ?? CHEMINS.cloudy;
  return html`<svg viewBox="0 0 24 24" width="24" height="24" fill="none"
    stroke="currentColor" stroke-width="1.9" stroke-linecap="round"
    stroke-linejoin="round">${d}</svg>`;
}
