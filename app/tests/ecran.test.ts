import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ECRANS, type Ecran, type Bouton } from '../src/ecran';

/** Tous les fichiers de `src/`, récursivement. Une assertion sur le RÉPERTOIRE, pas sur une liste
 *  de fichiers : une liste de fichiers ne voit pas celui qu'on a oublié d'y mettre. */
function* parcourir(dossier: string): Generator<string> {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* parcourir(chemin);
    else yield chemin;
  }
}

// LE GARDIEN DU LOT 6, en tête de fichier pour qu'il soit facile à trouver. La tablette a changé
// de source ; laisser cohabiter l'ancienne donnerait deux plans de repas et deux listes de courses
// sur la même dalle — précisément la règle « pas de donnée en double sur la même tablette » que ce
// projet applique sans exception. Et un commentaire qui parle d'une source morte est pire
// qu'absent : il envoie la prochaine personne lire un fichier qui n'existe plus.
describe('le lot 6 a fini son travail', () => {
  it("aucune chaîne 'grocy' ne subsiste dans src/", () => {
    // Insensible à la casse : « Grocy », « grocy_shopping_list », « GrocyPlan ».
    const fautifs: string[] = [];
    for (const fichier of parcourir('src')) {
      if (/grocy/i.test(readFileSync(fichier, 'utf8'))) fautifs.push(fichier);
    }
    expect(fautifs).toEqual([]);
  });
});


describe('déclarations des pièces', () => {
  it('le salon déclare cinq commandes, dont Porte, Rideau et Ambilight', () => {
    const libelles = ECRANS.salon.commandes.map((c) => c.libelle);
    expect(libelles).toEqual(['Lumières', 'Chauffage', 'Porte', 'Rideau', 'Ambilight']);
  });

  // 2026-08-29, demande du propriétaire : la rangée « Ambiance » du salon (Clair/Chill/Cinéma)
  // disparaît. Ce n'est pas un simple retrait — c'est ce qui FINANCE les quatre commandes
  // permanentes : ~100 px (72 px de tuiles + l'étiquette + la gouttière) rendus au budget, soit
  // exactement la deuxième rangée de commandes. Les trois scènes restent dans Home Assistant,
  // elles ne sont plus sur la tablette. Le corollaire est vérifié dans `tests/corps.test.ts` :
  // une pièce sans ambiance ne rend NI l'étiquette NI le groupe (pas de rangée vide qui
  // laisserait un trou de gouttière).
  it('le salon ne déclare plus aucune ambiance : la rangée a cédé sa place aux commandes', () => {
    expect(ECRANS.salon.ambiances).toEqual([]);
  });

  // Le besoin exprimé est « rideau et ouverture/fermeture porte tout le temps affichés ». Une
  // seule épingle ne suffisait pas : en cinéma, la coupe rendait `[Ambilight, Lumières, Chauffage,
  // Porte]` et le Rideau tombait. DEUX épingles réservent les deux DERNIÈRES places visibles,
  // jamais une rangée de plus — c'est le Chauffage qui cède, cf. `tests/modes.test.ts`.
  it('Porte ET Rideau sont épinglés, dans cet ordre', () => {
    expect(ECRANS.salon.commandes.filter((c) => c.epingle).map((c) => c.libelle))
      .toEqual(['Porte', 'Rideau']);
  });

  it('Porte et Rideau passent par les scripts existants, jamais par lock/cover en direct', () => {
    const porte = ECRANS.salon.commandes.find((c) => c.libelle === 'Porte')!;
    const rideau = ECRANS.salon.commandes.find((c) => c.libelle === 'Rideau')!;
    expect(porte.service).toEqual(['script', 'turn_on']);
    expect(porte.cible).toBe('script.serrure_tap_ouvrir_ou_verrouiller');
    expect(rideau.service).toEqual(['script', 'turn_on']);
    expect(rideau.cible).toBe('script.toggle_rideau_salon');
  });

  it('la source Télévision déclare les quatre entités aux bons rôles', () => {
    const tv = ECRANS.salon.sources.find((s) => s.nom === 'Télévision')!;
    expect(tv.allumee!.entite).toBe('media_player.televiseur_salon_3');
    expect(tv.affiche).toContain('media_player.plex_plex_for_android_tv_uhd_google_tv_stick');
    expect(tv.volume[0]).toBe('media_player.televiseur_salon');
    expect(tv.transport[0]).toBe('media_player.televiseur_salon_3');
  });

  it('la source Musique pointe partout vers la même entité', () => {
    const m = ECRANS.salon.sources.find((s) => s.nom === 'Musique')!;
    const unique = 'media_player.musique_salon';
    for (const champ of [m.titre, m.sousTitre, m.affiche, m.progression, m.transport, m.volume]) {
      expect(champ).toEqual([unique]);
    }
  });

  it('les trois pièces déclarent leurs ouvrants et leur aspirateur', () => {
    expect(ECRANS.salon.ouvrants).toContain('binary_sensor.porte_balcon_s_ouverture');
    expect(ECRANS.salon.aspirateur).toBe('vacuum.aspirateur_cuisine');
    expect(ECRANS.cuisine.ouvrants).toContain('binary_sensor.fenetre_c_ouverture');
  });

  it('la voiture et l\'entretien sont marqués perso, jamais la porte', () => {
    const par = (e: string) => ECRANS.salon.synthese.find((s) => s.entite === e)!;
    expect(par('sensor.peugeot_e208_batterie_niveau').perso).toBe(true);
    expect(par('todo.maintenance').perso).toBe(true);
    expect(par('lock.aqara_smart_lock_u200_lite').perso).toBeUndefined();
  });

  // Tâche 12, arbitrage du propriétaire (2026-08-03) : la vue « Toute la maison » de la cuisine
  // était déjà pleine à 10/10 tuiles (budget 585px, cf. rapport de tâche 12) — la demande
  // « aspirateur sur la cuisine » est donc résolue en REMPLAÇANT la tuile commune (nettoyage
  // complet du RDC, `vacuum.start`) plutôt qu'en en ajoutant une : zéro tuile de plus. Le salon et
  // le bureau ne déclarent rien, donc gardent l'entrée commune telle quelle.
  it('la cuisine remplace la tuile aspirateur commune par le script du segment cuisine (19), jamais vacuum.start', () => {
    const a = ECRANS.cuisine.aspirateurMaison!;
    expect(a).toBeDefined();
    expect(a.entite).toBe('vacuum.aspirateur_cuisine');
    expect(a.service).toEqual(['script', 'turn_on']);
    expect(a.cible).toBe('script.aspirateur_cuisine');
    expect(ECRANS.salon.aspirateurMaison).toBeUndefined();
    expect(ECRANS.bureau.aspirateurMaison).toBeUndefined();
  });

  // Tâche 14 (2026-08-03) : `blocDefaut` est la SEULE façon de déclarer quel bloc central occupe
  // une pièce par défaut — le salon garde son objet `voiture` (la donnée), mais c'est bien
  // `blocDefaut: 'voiture'` qui décide du mode (`modes.ts`), jamais la simple présence de
  // `piece.voiture`. Un mécanisme, jamais deux en parallèle pour la même décision.
  it('chaque pièce déclare exactement le bloc par défaut attendu', () => {
    expect(ECRANS.salon.blocDefaut).toBe('voiture');
    expect(ECRANS.salon.voiture).toBeDefined();
    expect(ECRANS.cuisine.blocDefaut).toBe('repas');
    expect(ECRANS.bureau.blocDefaut).toBe('agenda');
  });
});

/** Tâche 19 (2026-08-03, choix du propriétaire) : la cuisine et le bureau ne déclaraient que DEUX
 *  commandes là où `combien()` (`modes.ts`) en affiche quatre en mode `defaut` — une seule rangée
 *  rendue au lieu des deux du salon, soit les ~93 px de jeu mesurés au milieu de ces deux écrans à
 *  la tâche 18 (74 px de rangée + la gouttière). Deux tuiles de plus par pièce comblent EXACTEMENT
 *  cette rangée manquante : la hauteur de leurs modes `defaut`/`entretien`/`agenda` passe de 500 à
 *  574 px, la valeur que le projet sert déjà à `voiture` et `menage` sur un budget dur de 585 px. */
describe('tâche 19 — les quatre commandes ajoutées à la cuisine et au bureau', () => {
  // 2026-08-29, demande du propriétaire : « on ne voit pas l'état de la lumière hotte ». La
  // rangée « Ambiance » n'affiche QUE l'icône et le libellé (c'est une rangée de scènes, cf.
  // `rendu/corps.ts`) : une hotte et un rideau y étaient muets. Ils rejoignent donc les
  // commandes, seules tuiles à appeler `etiquette()` (« Allumé », « Fermé », « Ouvert 42 % ») et
  // à porter le fond `actif`. En TÊTE : les quatre places de `combien('defaut')` sont prises par
  // l'ordre déclaré, ce qui garantit les deux tuiles demandées sans toucher à `modes.ts`.
  it('la cuisine déclare quatre commandes, Hotte et Rideau en tête', () => {
    expect(ECRANS.cuisine.commandes.map((c) => c.libelle))
      .toEqual(['Hotte', 'Rideau', 'Courses', 'Recette']);
  });

  // Le rideau de cuisine appelait `cover.toggle` — donc `open_cover`/`close_cover`, que ces
  // moteurs Zigbee n'exécutent PAS jusqu'au bout (mesuré le 2026-08-29 sur l'installation :
  // `open_cover` s'arrête à mi-course). Toute l'installation les contourne par
  // `set_cover_position`, et c'est ce que porte `script.toggle_rideau_cuisine`. Même patron que
  // Porte/Rideau du salon : la logique de bascule reste à UN seul endroit, celui qui la porte
  // déjà pour les automatisations.
  it('le rideau de cuisine passe par son script, jamais par cover.toggle', () => {
    const rideau = ECRANS.cuisine.commandes.find((c) => c.libelle === 'Rideau')!;
    expect(rideau.entite).toBe('cover.rideau_cuisine');
    expect(rideau.service).toEqual(['script', 'turn_on']);
    expect(rideau.cible).toBe('script.toggle_rideau_cuisine');
  });

  it('la hotte reste un simple light.toggle : aucun script ne porte de logique pour elle', () => {
    const hotte = ECRANS.cuisine.commandes.find((c) => c.libelle === 'Hotte')!;
    expect(hotte.entite).toBe('light.hotte');
    expect(hotte.service).toEqual(['light', 'toggle']);
    expect(hotte.cible).toBeUndefined();
  });

  // Ce qui descend en échange, et pourquoi la vue « Toute la maison » n'était PAS la solution :
  // elle est déjà pleine à 10/10 tuiles pour la cuisine (9 communes + le scanner, budget 585 px,
  // cf. tâche 12) — y ajouter le purificateur aurait ajouté une rangée entière. La rangée
  // « Ambiance » de la cuisine, elle, garde exactement trois tuiles : hauteur inchangée.
  // Le purificateur y perd son étiquette « Arrêté » ; c'est le prix, assumé et signalé.
  it('la rangée du haut de la cuisine reprend la lumière, le purificateur et l\'aspirateur', () => {
    expect(ECRANS.cuisine.ambiances.map((a) => a.libelle))
      .toEqual(['Cuisine', 'Purificateur', 'Aspirer ici']);
  });

  it('le bureau déclare quatre commandes, dans l\'ordre voulu', () => {
    expect(ECRANS.bureau.commandes.map((c) => c.libelle))
      .toEqual(['Chauffage', 'Chambre', 'Ventilateur', 'Velux']);
  });

  it('la cuisine ouvre la vue recette, jamais une page autonome', () => {
    const b = ECRANS.cuisine.commandes.find((c) => c.libelle === 'Recette');
    expect(b?.vue).toBe('#recette');
    expect(b?.lien).toBeUndefined();
  });

  // --- Lot 6 : le garde-manger vient de `home_stock` ---

  it('la cuisine déclare todo.home_stock_shopping et plus aucune entité grocy', () => {
    expect(ECRANS.cuisine.listesTachesExtra).toEqual(['todo.home_stock_shopping']);
    expect(JSON.stringify(ECRANS.cuisine)).not.toMatch(/grocy/i);
  });

  it('la commande « Courses » ouvre la vue Tâches', () => {
    // Avant ce lot, la tuile affichait un compte sur lequel on ne pouvait RIEN faire : la vue
    // « Tâches » ne s'atteignait qu'en touchant la ligne de synthèse. Une navigation interne ne
    // coûte aucun appel HA et supprime un cul-de-sac.
    const b = ECRANS.cuisine.commandes.find((c) => c.libelle === 'Courses')!;
    expect(b.entite).toBe('todo.home_stock_shopping');
    expect(b.vue).toBe('#taches');
    expect(b.service).toBeUndefined();
  });

  it('« Recette » garde son indicateur de disponibilité', () => {
    // Muette, la tuile se masque par le filtre générique de `rendu/corps.ts`. Sans entité, elle
    // resterait affichée et ne ferait rien.
    const b = ECRANS.cuisine.commandes.find((c) => c.libelle === 'Recette')!;
    expect(b.entite).toBe('sensor.home_stock_next_meal');
  });

  it('la cuisine a toujours QUATRE commandes', () => {
    // 574 px mesurés sur un budget de 585 : une rangée de plus déborde. Le remaniement du
    // 2026-08-29 est un ÉCHANGE à nombre de tuiles constant (Hotte/Rideau montent,
    // Purificateur/Aspirer ici descendent), jamais un ajout : le budget est inchangé.
    expect(ECRANS.cuisine.commandes).toHaveLength(4);
    expect(ECRANS.cuisine.ambiances).toHaveLength(3);
  });

  it('la cuisine porte la ligne DLC, en CINQUIÈME position', () => {
    // L'ordre compte deux fois : la ligne de synthèse n'affiche qu'un nombre borné d'écarts, et
    // `listesTachesPiece` reprend cet ordre pour la vue « Tâches ». Déclarée APRÈS
    // `todo.maintenance`, la DLC passe donc après l'entretien et avant les courses.
    const s = ECRANS.cuisine.synthese;
    expect(s).toHaveLength(5);
    expect(s[4]).toEqual({
      entite: 'todo.home_stock_expirations', operateur: '>', valeur: 0,
      texte: '{etat} produit{s} à consommer', perso: true,
    });
  });

  it("le salon a la ligne DLC et RIEN d'autre du garde-manger", () => {
    // La tablette du salon est à l'entrée : « 3 produits à consommer » y est utile au moment
    // précis où l'on part faire les courses. La répétition ENTRE tablettes est permise ; la règle
    // « pas de donnée en double » s'applique par tablette.
    const dlc = ECRANS.salon.synthese.find((e) => e.entite === 'todo.home_stock_expirations');
    expect(dlc).toBeDefined();
    expect(dlc!.horsTaches).toBe(true);
    expect(ECRANS.salon.listesTachesExtra).toEqual([]);
    expect(ECRANS.salon.commandes.map((c) => c.entite))
      .not.toContain('sensor.home_stock_next_meal');
    expect(ECRANS.salon.blocDefaut).toBe('voiture');
  });

  it("le bureau n'a aucune entité home_stock", () => {
    // Le refus le plus facile du lot, et il faut le tenir : un lot « surfaces » a une pente
    // naturelle vers « mettons-le partout ».
    expect(JSON.stringify(ECRANS.bureau)).not.toContain('home_stock');
  });

  // Une seule logique de nettoyage du segment cuisine dans toute l'application : la tuile de
  // l'accueil et celle de « Toute la maison » sont le MÊME bouton, câblé une fois (affiche
  // l'aspirateur, appelle le script HA existant). Comparées l'une à l'autre plutôt qu'à des
  // valeurs recopiées : si un jour `aspirateurMaison` change de cible, ce test le dit.
  it('« Aspirer ici » de l\'accueil est câblée EXACTEMENT comme celle de « Toute la maison »', () => {
    const accueil = ECRANS.cuisine.ambiances.find((c) => c.libelle === 'Aspirer ici')!;
    const maison = ECRANS.cuisine.aspirateurMaison!;
    expect(accueil.entite).toBe(maison.entite);
    expect(accueil.service).toEqual(maison.service);
    expect(accueil.cible).toBe(maison.cible);
    // Le couple exact, écrit ici une fois : jamais `vacuum.start` (qui nettoierait tout le RDC).
    expect(accueil.entite).toBe('vacuum.aspirateur_cuisine');
    expect(accueil.service).toEqual(['script', 'turn_on']);
    expect(accueil.cible).toBe('script.aspirateur_cuisine');
  });

  it('purificateur et ventilateur basculent par fan.toggle, sans cible détournée', () => {
    const purificateur = ECRANS.cuisine.ambiances.find((c) => c.libelle === 'Purificateur')!;
    const ventilateur = ECRANS.bureau.commandes.find((c) => c.libelle === 'Ventilateur')!;
    expect(purificateur.entite).toBe('fan.purificateur_air');
    expect(ventilateur.entite).toBe('fan.chambre_ventilateur_tour');
    for (const b of [purificateur, ventilateur]) {
      expect(b.service).toEqual(['fan', 'toggle']);
      expect(b.cible).toBeUndefined();
      expect(b.lien).toBeUndefined();
    }
  });

  // Le Velux est une fenêtre de toit MANUELLE : il n'existe aucun actionneur dans l'installation,
  // donc aucun service à appeler. `Bouton.service` est facultatif — cette tuile ne fait que dire
  // s'il est ouvert. Son corollaire visuel (aucun retour au doigt) est vérifié dans
  // `tests/corps.test.ts` : une tuile qui ne déclenche rien ne doit rien accuser.
  it('le Velux est une tuile d\'état pure : ni service, ni cible, ni lien', () => {
    const velux = ECRANS.bureau.commandes.find((c) => c.libelle === 'Velux')!;
    expect(velux.entite).toBe('binary_sensor.velux_ch_ouverture');
    expect(velux.service).toBeUndefined();
    expect(velux.cible).toBeUndefined();
    expect(velux.lien).toBeUndefined();
  });

  // Règle absolue du projet : jamais la même donnée deux fois sur une même tablette (la
  // répétition d'une tablette à l'autre est permise, et c'est bien ce qui autorise le chauffage
  // au salon ET au bureau). Vérifié STRUCTURELLEMENT plutôt qu'en relisant les déclarations :
  // aucune entité ne peut être déclarée deux fois dans les commandes d'une pièce, ni partagée
  // entre sa rangée « Ambiance » et sa rangée de commandes — les deux sont visibles EN MÊME TEMPS
  // sur le même écran. La ligne de synthèse est délibérément hors de ce contrôle : le salon y
  // porte déjà `lock.`/`cover.` en même temps que ses tuiles Porte/Rideau (état d'avant cette
  // tâche, assumé — un écart y est une phrase d'alerte, pas la redite d'une tuile).
  it('aucune pièce n\'affiche deux fois la même entité dans ses tuiles (commandes et ambiances)', () => {
    for (const [nom, piece] of Object.entries(ECRANS) as [string, Ecran][]) {
      const tuiles = [...piece.ambiances, ...piece.commandes].map((b) => b.entite);
      const doublons = tuiles.filter((e, i) => tuiles.indexOf(e) !== i);
      // `light.bureau` est déclaré deux fois dans les AMBIANCES du bureau (« Travail » l'allume,
      // « Éteindre » l'éteint) : deux actions opposées sur un même groupe, jamais deux fois la
      // même donnée. C'est la seule exemption, nommée, et elle date d'avant cette tâche.
      const attendus = nom === 'bureau' ? ['light.bureau'] : [];
      expect(doublons, `${nom} : entité(s) affichée(s) deux fois sur le même écran`).toEqual(attendus);
    }
  });

  it('aucune des quatre nouvelles entités n\'est déjà surveillée ailleurs sur SA tablette', () => {
    const ailleurs = (p: Ecran) => [
      ...p.ambiances.map((b) => b.entite),
      ...p.synthese.map((e) => e.entite),
      ...p.ouvrants, p.temperature,
      ...(p.aspirateur ? [p.aspirateur] : []),
    ];
    // La cuisine surveille bien `vacuum.aspirateur_cuisine` comme aspirateur de la pièce (mode
    // `menage`) : c'est le SEUL recoupement des quatre, et il ne produit pas deux fois la même
    // donnée à l'écran — la tuile « Aspirer ici » n'affiche aucun état (cf. `etiquette`,
    // `rendu/corps.ts`), c'est un lanceur d'action, le bloc central du mode `menage` étant seul
    // propriétaire de l'état de l'aspirateur.
    // Le purificateur a quitté les commandes pour la rangée du haut le 2026-08-29 : il est donc
    // désormais DANS `ambiances`, et ce n'est plus lui que cette règle doit surveiller côté
    // cuisine mais les deux tuiles qui l'ont remplacé. La hotte et le rideau ne sont surveillés
    // nulle part ailleurs sur cette tablette — la synthèse cuisine parle de la fenêtre, du
    // distributeur, de la fontaine et de deux listes, jamais d'eux.
    const ambiancesCuisine = ECRANS.cuisine.ambiances.map((b) => b.entite);
    expect(ambiancesCuisine).toContain('fan.purificateur_air');
    const horsAmbiances = (p: Ecran) => [
      ...p.synthese.map((e) => e.entite), ...p.ouvrants, p.temperature,
      ...(p.aspirateur ? [p.aspirateur] : []),
    ];
    expect(horsAmbiances(ECRANS.cuisine)).not.toContain('fan.purificateur_air');
    expect(horsAmbiances(ECRANS.cuisine)).not.toContain('light.hotte');
    expect(horsAmbiances(ECRANS.cuisine)).not.toContain('cover.rideau_cuisine');
    expect(ailleurs(ECRANS.bureau)).not.toContain('fan.chambre_ventilateur_tour');
    expect(ailleurs(ECRANS.bureau)).not.toContain('binary_sensor.velux_ch_ouverture');
    // Le bureau ne surveille AUCUN ouvrant (`ouvrants: []`) : le Velux n'y a donc aucun doublon,
    // et il ne déclenche pas non plus le mode `aeration` — le vérifier ici évite qu'un ajout
    // futur d'ouvrant au bureau passe inaperçu.
    expect(ECRANS.bureau.ouvrants).toEqual([]);
  });
});

describe('les champs ouverts par la configuration', () => {
  it('accepte une note sur un écran, un bouton et une entrée de synthèse', () => {
    const e: Ecran = {
      ...ECRANS.salon,
      note: 'écran d\'entrée : la porte y est épinglée',
      hauteurUtile: 585,
    };
    const b: Bouton = { libelle: 'X', icone: 'bulb', entite: 'light.x', note: 'pourquoi X' };
    expect(e.note).toContain('épinglée');
    expect(e.hauteurUtile).toBe(585);
    expect(b.note).toBe('pourquoi X');
  });

  it('laisse les trois écrans actuels sans note ni hauteur — les deux champs sont facultatifs',
    () => {
      for (const e of Object.values(ECRANS)) {
        expect(e.note).toBeUndefined();
        expect(e.hauteurUtile).toBeUndefined();
      }
    });
});
