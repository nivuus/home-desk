// @vitest-environment jsdom
//
// Non demandé par le brief de la tâche 6 (seul `tests/meteo.test.ts` y figure), ajouté après
// avoir prouvé par le rendu réel (lit + DOM) un défaut que la seule lecture du code verbatim du
// brief ne pouvait pas révéler : `commande.actif` posé sur `etat === 'on'` ne s'allume jamais
// pour `climate.radiateur` (VersatileThermostat, états `heat`/`off` — jamais `on`, vérifié dans
// `ha_sync/entities/climate.json`), ce qui viole la règle « une commande n'est colorée que si
// l'appareil est actif ». Garde-fou de non-régression pour ce correctif et pour la permanence
// de `ligneSynthese`.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, html } from 'lit';
import { Etat } from '../src/etat';
import { ECRANS, type EntreeSynthese } from '../src/ecran';
import { rendreCorps, ligneSynthese, rendreAlerte, etiquette } from '../src/rendu/corps';
import { rendreMaison } from '../src/rendu/maison';
import type { Alerte } from '../src/contexte';
import type { ContexteModes } from '../src/modes';
import { AGENCEMENT_DEFAUT, type Agencement, type Zone } from '../src/agencement';
import type { Ecran } from '../src/ecran';

const ev = (id: string, etat: string, attributes: Record<string, unknown> = {}) =>
  ({ entity_id: id, state: etat, attributes });

/** Un bloc central minimal, marqué comme le sont tous les vrais gabarits de mode (media.ts,
 *  modes.ts, defaut.ts, minuteur.ts, voiture.ts, corps.ts) — cf. correction 3 de la tâche 3 du
 *  plan 2 (« les blocs centraux portent déjà leur marqueur », rendreCorps ne l'ajoute pas). Sert
 *  aux tests d'assembleur ci-dessous : sans lui, `rendreCorps` ne recevant jamais de bloc central
 *  de sa propre initiative (il est toujours fourni par `demarrage.ts`), la zone `blocCentral`
 *  resterait `undefined` et disparaîtrait du DOM comme n'importe quelle zone sans rien à montrer
 *  — ce qui rendrait le premier test ci-dessous incapable de vérifier l'ordre à quatre zones
 *  qu'il annonce. Seul son marqueur data-zone compte ici, jamais son contenu. */
const BLOC_CENTRAL_FACTICE = html`<div class="mode-bloc" data-zone="blocCentral"></div>`;

/** Tâche 3 du plan 2 : monte `rendreCorps` avec un état vide et sans contexte de mode, pour la
 *  seule chose que les tests d'assembleur ci-dessous vérifient — la PRÉSENCE et l'ORDRE des
 *  `data-zone`, pas les libellés ni les états des commandes. Reprend le patron déjà utilisé
 *  partout dans ce fichier (`new Etat()` + `render(rendreCorps(...), div)`), sans en inventer un
 *  second. */
function rendreDans(ecran: Ecran, agencement?: Agencement): HTMLElement {
  const racine = document.createElement('div');
  render(rendreCorps(new Etat(), ecran, BLOC_CENTRAL_FACTICE, undefined, undefined, false, false,
                     agencement), racine);
  return racine;
}

/** État où les cinq commandes déclarées au salon (`ECRANS.salon.commandes`, cf. `ecran.ts`) sont
 *  toutes utilisables — sert les tests de rangée de commandes (tâche 9) ci-dessous, qui ont
 *  besoin des cinq pour distinguer un filtrage par `ordreCommandes` (`modes.ts`) d'un simple
 *  manque de données (`Etat.estUtilisable`). */
function etatSalonComplet(): Etat {
  const etat = new Etat();
  etat.appliquer(ev('light.lumiere_salon', 'off'));
  etat.appliquer(ev('climate.radiateur', 'off'));
  etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'locked'));
  etat.appliquer(ev('cover.rideau_salon', 'closed'));
  etat.appliquer(ev('light.televiseur_ambilight', 'off'));
  return etat;
}

let hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });

/** Tâche 9 : contexte neutre — aucun mode ni modulateur actif, `modePrincipal` y retombe sur
 *  `defaut` et `ordreCommandes` laisse les commandes dans leur ordre déclaré (4, la coupe par
 *  défaut). Point de départ commun à tous les tests de rangées ci-dessous, chacun n'y changeant
 *  que le champ qu'il exerce (`{ ...CTX_CALME, … }`). */
const CTX_CALME: ContexteModes = {
  alerte: false, aspirateurEnMarche: false, ecranAllume: false, sourceJoue: false,
  ouvrantOuvertDepuisMs: 0, chauffageEnMarche: false, ilPleut: false, serrureDeverrouillee: false,
  temperatureExterieure: 18, soleilLeve: true, modeInvites: false, instantDelorean: false,
  // Tâche 7 alimentera ce champ pour de bon (branchement de `listerMinuteurs`) ; ici, contexte
  // neutre, donc au repos.
  minuteurEnCours: false,
  // Tâche 6 (2026-08-17) : contexte neutre, aucune recette réduite dans ce fichier.
  recetteEnCours: false,
  // Tâche 9 bis / 14 : contexte neutre, aucune pièce de ce fichier ne déclare de bloc par défaut.
  blocDefaut: undefined,
};

/** Le contexte du SALON tel que `demarrage.ts` le construit vraiment depuis le 2026-08-29 : cette
 *  pièce ne déclare plus aucune ambiance, elle a donc quatre places de commandes dans tous ses
 *  modes (cf. `rangeeAmbiance`, `modes.ts`). `CTX_CALME` reste le contexte d'une pièce qui GARDE
 *  sa rangée — c'est celui de la cuisine et du bureau, et le comportement d'avant cette date. */
const CTX_SALON: ContexteModes = { ...CTX_CALME, rangeeAmbiance: false };

/** Construit un état qui satisfait la condition d'une entrée déclarée, sans rien savoir de son
 *  domaine ni de son sens — seulement de `operateur`/`valeur`. Prend l'entrée entière (pas
 *  `operateur`/`valeur` séparés) pour que la corrélation imposée par l'union discriminée de
 *  `EntreeSynthese` (voir `ecran.ts`, ronde de correction 2) reste visible ici aussi : dans la
 *  branche `<`/`>`, TypeScript garantit que `entree.valeur` est un `number`, sans `typeof`.
 *
 *  Ronde de correction 2, angle mort n°1 : l'ancienne version calculait toujours `valeur + 1`
 *  pour tout ce qui n'était pas `<`, y compris `==` — une égalité numérique future
 *  (`{ operateur: '==', valeur: 1 }`) aurait donc reçu un déclencheur qui ne l'égale jamais,
 *  faisant rougir le test à tort sur du code par ailleurs correct. `==` numérique rend
 *  maintenant très exactement `valeur`. */
function declencheur(entree: EntreeSynthese): string {
  if (entree.operateur === '<') return String(entree.valeur - 1);
  if (entree.operateur === '>') return String(entree.valeur + 1);
  if (typeof entree.valeur === 'number') {
    return entree.operateur === '!=' ? String(entree.valeur + 1) : String(entree.valeur);
  }
  return entree.operateur === '!=' ? `${entree.valeur}-autre-etat` : String(entree.valeur);
}

// Ronde de correction 2, angle mort n°2 : `<`/`>` sur une `valeur` textuelle (le seuil entre
// guillemets) ne provoquait auparavant aucune erreur — `estEcart` retombait silencieusement sur
// une égalité stricte, et `declencheur` empruntait la même bifurcation, donc le test s'auto-
// satisfaisait sans jamais rien détecter. Fermé par le typage plutôt que par un test (demande
// explicite du coordinateur : « le typage est préférable s'il peut le faire, parce qu'il agit
// avant même l'exécution ») : l'union discriminée de `EntreeSynthese` n'accepte `valeur: number`
// que pour `<`/`>`. `@ts-expect-error` transforme ça en garde-fou vérifié par `npx tsc --noEmit`
// (donc par `npm run build`, qui type-vérifie aussi les tests) : si ce littéral redevenait valide
// un jour — type relâché par erreur — la directive elle-même deviendrait « inutilisée » et ferait
// échouer la compilation.
// @ts-expect-error : `<` exige `valeur: number` ; une chaîne n'est pas assignable ici.
const _operateurIncoherent: EntreeSynthese = { entite: 'sensor.x', operateur: '<', valeur: '35', texte: 't' };
void _operateurIncoherent;

describe('smoke rendreCorps', () => {
  it('colore la commande chauffage quand climate.radiateur est en chauffe (heat), pas seulement on', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat'));
    etat.appliquer(ev('light.lumiere_salon', 'off'));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const commandes = Array.from(div.querySelectorAll('.commande'));
    expect(commandes).toHaveLength(2);
    const chauffage = commandes.find((c) => c.textContent?.includes('Chauffage'))!;
    expect(chauffage.className).toContain('actif');
    expect(chauffage.textContent).toContain('Chauffe');
    const lumieres = commandes.find((c) => c.textContent?.includes('Lumières'))!;
    expect(lumieres.className).not.toContain('actif');
  });

  it('ne colore pas le chauffage quand climate.radiateur est off', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'off'));
    etat.appliquer(ev('light.lumiere_salon', 'on'));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const commandes = Array.from(div.querySelectorAll('.commande'));
    const chauffage = commandes.find((c) => c.textContent?.includes('Chauffage'))!;
    expect(chauffage.className).not.toContain('actif');
    expect(chauffage.textContent).toContain('Éteint');
  });

  it('masque une commande dont l entité est unavailable, sans lever', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'unavailable'));
    etat.appliquer(ev('light.lumiere_salon', 'on'));
    const div = document.createElement('div');
    expect(() => render(
      rendreCorps(etat, ECRANS.salon), div,
    )).not.toThrow();
    const commandes = Array.from(div.querySelectorAll('.commande'));
    expect(commandes).toHaveLength(1);   // seule light.lumiere_salon reste
  });

  // Tâche 3 (mouvement, 2026-08-22) — LE BALAYAGE A DISPARU. `data-mvt-etat` sur la tuile n'avait
  // plus qu'un seul lecteur (`moteur.ts`, pour NOMMER les deux couches du balayage) : leur
  // suppression rend cet attribut mort sur la tuile, jamais recopié à tort par un futur ajout de
  // rôle qui en aurait encore besoin (`chiffre`/`bloc`, eux, le posent toujours ailleurs).
  //
  // I3 (revue finale) — DÉSARMÉ EN SILENCE avec `[data-mvt^="tuile:"]` seul : depuis le marquage
  // des ambiances (tâche 7), la PREMIÈRE tuile en ordre document est une tuile d'ambiance
  // (`tuile:amb-<entité>`, `corps.ts`), qui n'a JAMAIS porté `data-mvt-etat` — l'assertion restait
  // donc vraie quelle que soit l'implémentation de la tuile de commande, la seule que ce test
  // prétend couvrir. `.commande[data-mvt^="tuile:"]` ancre le sélecteur sur la classe de
  // l'élément visé, pas sur le premier `tuile:` rencontré dans le document.
  it('une tuile de commande ne porte plus d\'état de mouvement — le balayage a disparu', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'on'));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const tuile = div.querySelector('.commande[data-mvt^="tuile:"]') as HTMLElement;
    expect(tuile).not.toBeNull();
    expect(tuile.dataset.mvtEtat).toBeUndefined();
  });

  it('ligneSynthese reste permanente (texte non vide) même sans aucune entité', () => {
    const etat = new Etat();
    const s = ligneSynthese(etat, ECRANS.salon.synthese);
    expect(s.texte.length).toBeGreaterThan(0);
    expect(s.ecarts).toEqual([]);
  });

  it('ligneSynthese detecte les ecarts, y compris le rideau (ronde 1 : etait silencieux)', () => {
    const etat = new Etat();
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'unlocked'));
    etat.appliquer(ev('cover.rideau_salon', 'open'));
    etat.appliquer(ev('sensor.peugeot_e208_batterie_niveau', '12'));
    etat.appliquer(ev('todo.maintenance', '2'));
    const s = ligneSynthese(etat, ECRANS.salon.synthese);
    expect(s.ecarts).toContain('porte déverrouillée');
    expect(s.ecarts).toContain('rideau ouvert');
    expect(s.ecarts).toContain('voiture à brancher');
    expect(s.ecarts).toContain('2 tâches d\'entretien');
    expect(s.texte).toBe('Tout est fermé —');
  });

  it('bureau : l air pollue produit son propre ecart (ronde 1 : etait silencieux)', () => {
    const etat = new Etat();
    etat.appliquer(ev('sensor.purificateur_air_pm2_5', '42'));
    const s = ligneSynthese(etat, ECRANS.bureau.synthese);
    expect(s.ecarts).toContain('air à surveiller au-delà de 35 µg/m³ de particules fines');
  });

  // Défaut vu à l'écran (tâche 12) : `todo.travail` et `todo.maintenance` partageaient le même
  // texte « {etat} tâches » — indiscernables l'un de l'autre sur le bureau, seul écran qui
  // affiche les deux à la fois — et l'accord ne suivait jamais le nombre (« 1 tâches »). Les deux
  // angles morts, prouvés séparément : le sujet distingue les deux compteurs, l'accord suit `n`.
  it('bureau : todo.travail et todo.maintenance restent distinguables l un de l autre', () => {
    const etat = new Etat();
    etat.appliquer(ev('todo.travail', '4'));
    etat.appliquer(ev('todo.maintenance', '3'));
    const s = ligneSynthese(etat, ECRANS.bureau.synthese);
    expect(s.ecarts).toContain('4 tâches de travail');
    expect(s.ecarts).toContain('3 tâches d\'entretien');
  });

  it('le marqueur {s} accorde correctement le singulier et le pluriel', () => {
    const singulier = new Etat();
    singulier.appliquer(ev('todo.maintenance', '1'));
    expect(ligneSynthese(singulier, ECRANS.salon.synthese).ecarts).toContain('1 tâche d\'entretien');
    expect(ligneSynthese(singulier, ECRANS.salon.synthese).ecarts).not.toContain('1 tâches d\'entretien');

    const pluriel = new Etat();
    pluriel.appliquer(ev('todo.maintenance', '4'));
    expect(ligneSynthese(pluriel, ECRANS.salon.synthese).ecarts).toContain('4 tâches d\'entretien');
  });

  // Tâche 17 : quand le bloc central affiche le DÉTAIL des tâches d'entretien (`rendreEntretien`,
  // `rendu/defaut.ts`, le repli du repas/du rendez-vous), la ligne de synthèse ne doit plus
  // annoncer « 3 tâches d'entretien » — la même donnée deux fois sur la même tablette est
  // interdite par le projet. Même patron exactement que `masquerRdv` (`pastilleBandeau`,
  // `agenda.ts`, tâche 14) : c'est le petit emplacement qui cède, jamais le bloc central.
  it('masquerEntretien retire le seul ecart d entretien de la synthese', () => {
    const etat = new Etat();
    etat.appliquer(ev('todo.travail', '4'));
    etat.appliquer(ev('todo.maintenance', '3'));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.bureau, undefined, undefined, undefined, true), div);
    const ecart = div.querySelector('.synthese .ecart')!.textContent!;
    expect(ecart).not.toContain('entretien');
    // Contre-épreuve dans le même rendu : le masquage ne coupe pas plus large que sa donnée —
    // `todo.travail` est un AUTRE compteur de tâches, sur la même tablette, et il reste.
    expect(ecart).toContain('4 tâches de travail');
  });

  it('sans masquerEntretien, la synthese garde sa mention d entretien (defaut inchange)', () => {
    const etat = new Etat();
    etat.appliquer(ev('todo.maintenance', '3'));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.bureau), div);
    expect(div.querySelector('.synthese .ecart')!.textContent).toContain('3 tâches d\'entretien');
  });

  it('cuisine : distributeur et fontaine ont leur propre libelle, pas le "ouvert" generique', () => {
    const etat = new Etat();
    etat.appliquer(ev('binary_sensor.distributeur_de_croquettes_alimentation', 'on'));
    etat.appliquer(ev('binary_sensor.eversweet_3_pro_uvc_niveau_d_eau', 'on'));
    const s = ligneSynthese(etat, ECRANS.cuisine.synthese);
    expect(s.ecarts).toContain('distributeur en défaut');
    expect(s.ecarts).toContain('fontaine à remplir');
    expect(s.ecarts).not.toContain('ouvert');
  });

  // Tâche 18 : un appui sur la ligne de synthèse ouvre la vue « Tâches » — demande explicite du
  // propriétaire (« appuyer dessus pour voir la liste »). Toujours actif, même quand l'écart
  // affiché au moment du contact n'est pas une tâche (ex. « porte déverrouillée » ici) : ce que ce
  // tap ouvre, ce sont les listes todo.* de la pièce, jamais l'écart précis affiché à l'écran.
  it('un appui sur la ligne de synthese ouvre la vue Taches (hash #taches)', () => {
    location.hash = '';
    const etat = new Etat();
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'unlocked'));   // écart affiché n'est pas une tâche
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);

    div.querySelector('.synthese')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(location.hash).toBe('#taches');
  });

  // Ronde de correction 1 (le point le plus important, dixit le coordinateur) : rend
  // structurellement impossible qu'une entrée déclarée dans `ecran.ts` ne soit reconnue par
  // personne. Parcourt les 3 pièces, et pour CHAQUE entrée déclarée, construit un état qui
  // satisfait sa propre condition (`operateur`/`valeur`) — sans connaître ni son domaine ni sa
  // signification — puis vérifie qu'un écart en sort. Une entrée mal câblée (condition
  // inatteignable, faute de frappe sur l'entité) ferait rougir ce test ; une entrée simplement
  // *oubliée* dans `ligneSynthese` ne peut plus exister, puisque la fonction n'a plus de liste
  // de domaines à jour à oublier.
  it('aucune entree declaree dans synthese, sur aucune piece, ne reste muette', () => {
    for (const piece of Object.values(ECRANS)) {
      for (const entree of piece.synthese) {
        const etat = new Etat();
        const etatDeclencheur = declencheur(entree);
        etat.appliquer(ev(entree.entite, etatDeclencheur));
        const s = ligneSynthese(etat, piece.synthese);
        expect(
          s.ecarts.length,
          `${piece.nom} / ${entree.entite} (état déclencheur '${etatDeclencheur}') n'a produit aucun écart`,
        ).toBeGreaterThan(0);
      }
    }
  });

  // Ronde de correction 2, angle mort n°1 (preuve directe, indépendante des 12 entrées réelles
  // de `ecran.ts` — celles-ci n'emploient encore aucune égalité numérique, la tâche suivante en
  // ajoutera). Les 6 combinaisons `operateur` × type de `valeur` structurellement possibles
  // (`<`/`>` sont forcément numériques désormais, `==`/`!=` peuvent être numériques ou textuels).
  it('declencheur() couvre les 6 combinaisons operateur x type de valeur, egalite numerique comprise', () => {
    const echantillon: EntreeSynthese[] = [
      { entite: 'sensor.echantillon_lt', operateur: '<', valeur: 10, texte: 'lt' },
      { entite: 'sensor.echantillon_gt', operateur: '>', valeur: 10, texte: 'gt' },
      { entite: 'sensor.echantillon_eq_num', operateur: '==', valeur: 10, texte: 'eq-num' },
      { entite: 'sensor.echantillon_ne_num', operateur: '!=', valeur: 10, texte: 'ne-num' },
      { entite: 'sensor.echantillon_eq_str', operateur: '==', valeur: 'ouvert', texte: 'eq-str' },
      { entite: 'sensor.echantillon_ne_str', operateur: '!=', valeur: 'ouvert', texte: 'ne-str' },
    ];
    for (const entree of echantillon) {
      const etat = new Etat();
      const etatDeclencheur = declencheur(entree);
      etat.appliquer(ev(entree.entite, etatDeclencheur));
      const s = ligneSynthese(etat, [entree]);
      expect(
        s.ecarts,
        `${entree.entite} (${entree.operateur} ${entree.valeur}, déclencheur '${etatDeclencheur}') n'a pas produit '${entree.texte}'`,
      ).toContain(entree.texte);
    }
  });

  // Tâche 9, correction 1 (coordinateur, 2026-08-02) : s'appelait « ... avec previsions et
  // demain » — `demain` a disparu de la signature de `rendreCorps` (« Demain » est désormais
  // rendu exclusivement par la pastille du bandeau, `agenda.ts` → `pastilleBandeau`, pour ne
  // jamais dupliquer la même donnée sur la même tablette, cf. `rendu/corps.ts`). L'intention
  // originale du test — le corps se rend complètement, sans exception, pour les 3 pièces — reste
  // utile et est conservée.
  // Tâche 14 (2026-08-03) : `prev`/`.heure-prev` ont disparu avec le mode `previsions` —
  // `rendreCorps` ne calcule plus aucun bloc central par défaut lui-même (cf. son docstring), donc
  // ce test n'a plus de prévisions à fournir ni à compter ; l'absence de `.demain` reste vérifiée.
  it('rend le corps complet des 3 pieces sans exception, sans blocCentral', () => {
    for (const piece of Object.values(ECRANS)) {
      const etat = new Etat();
      const div = document.createElement('div');
      expect(() => render(rendreCorps(etat, piece), div)).not.toThrow();
      expect(div.querySelector('.demain')).toBeNull();
    }
  });
});

// Tâche 8 bis : `alerteActive` (`contexte.ts`) existait et était testée depuis la tâche 2 sans
// jamais être appelée. `rendreAlerte` (produite par cette tâche dans `rendu/corps.ts`) est la
// fonction de rendu qui la branche ; la priorité elle-même (alerte > le reste) est calculée
// dans `demarrage.ts` (cf. `tests/navigation.test.ts` pour la preuve de bout en bout à travers
// `demarrer()`) — ici, on prouve seulement que `rendreCorps` REMPLACE tout bloc central par défaut
// par `blocCentral` quand il est fourni, jamais en plus.
// Tâche 6 (2026-08-02) : `rendreMedia`, mentionnée à l'origine dans le titre de ce describe et
// dans plusieurs tests ci-dessous, a disparu — la carte média (`rendreCarteMedia`,
// `rendu/media.ts`, cf. `tests/carte-media.test.ts`) la remplace intégralement.
// Tâche 9 (2026-08-02) : le paramètre s'appelait `enTete` — renommé `blocCentral` (même rôle,
// nom plus juste, cf. `rendu/corps.ts`). Le nom du describe et des `it` ci-dessous suit.
// Tâche 9, correction 1 (coordinateur, 2026-08-02) : les tests ci-dessous vérifiaient à l'origine
// que `blocCentral` remplaçait `.demain` — `.demain` a depuis quitté `rendreCorps` pour de bon
// (« Demain » est désormais la seule responsabilité de la pastille du bandeau, cf.
// `rendu/corps.ts`), donc c'était ensuite `.prevision` que `blocCentral` remplaçait.
// Tâche 14 (2026-08-03) : `.prevision` a disparu à son tour avec le mode `previsions` —
// `rendreCorps` ne rend PLUS RIEN au centre en l'absence de `blocCentral` (cf. son docstring) ;
// les tests ci-dessous vérifient donc l'absence de tout bloc, pas son remplacement.
describe('rendreAlerte / blocCentral (tâche 8 bis)', () => {
  // `cle`/`sujet`/`texte` d'une règle réelle (`alertes.ts`) plutôt qu'un exemple inventé :
  // `rendreAlerte` ne dépend d'aucune de ces valeurs pour fonctionner (ce test n'exerce que le
  // rendu, pas `collecterAlertes`), mais garder un exemple qui correspond à une vraie règle évite
  // toute confusion pour un futur lecteur qui chercherait « Fenêtre » dans `REGLES` et ne l'y
  // trouverait plus (ronde de correction 1 : la règle fenêtre a été retirée, cf. `alertes.ts`).
  const alerte: Alerte = { cle: 'serrure', sujet: 'Porte', texte: 'Porte déverrouillée', depuis: 0 };

  // Ronde de correction 2 : `.alerte .t` portait le mot générique « Alerte » (la couleur du fond
  // porte déjà cette information) — corrigé pour porter `a.sujet`, le sujet court de l'alerte
  // (« Porte », « Croquettes », « Fontaine »...), porté par la règle elle-même dans `alertes.ts`.
  it('rendreAlerte affiche le sujet dans .alerte .t et la phrase dans .alerte .v (structure a deux lignes)', () => {
    const div = document.createElement('div');
    render(rendreAlerte(alerte), div);
    expect(div.querySelector('.alerte .t')?.textContent).toBe('Porte');
    expect(div.querySelector('.alerte .v')?.textContent).toBe('Porte déverrouillée');
  });

  // Tâche 14 : sans `blocCentral`, `rendreCorps` ne rend RIEN au centre (plus de repli
  // « prévisions » à afficher, cf. son docstring) — l'écran se resserre d'autant, exactement le
  // même sort qu'un repas/agenda vide (`rendu/defaut.ts`).
  it('sans blocCentral, rendreCorps ne rend rien au centre (l\'écran se resserre)', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    expect(div.querySelector('.prevision')).toBeNull();
    expect(div.querySelector('.mode-bloc')).toBeNull();
    expect(div.querySelector('.alerte')).toBeNull();
    expect(div.querySelector('.media')).toBeNull();
    expect(div.querySelector('.demain')).toBeNull();
  });

  it('blocCentral REMPLACE tout bloc par défaut, jamais les deux à la fois (règle 6 du brief : hauteur d écran inchangée)', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon, rendreAlerte(alerte)), div);
    expect(div.querySelector('.alerte')).not.toBeNull();
    expect(div.querySelector('.prevision')).toBeNull();
    // Un seul bloc de tête, jamais deux empilés (ce qui ferait déborder l'écran de 585px).
    expect(div.querySelectorAll('.alerte, .media, .mode-bloc')).toHaveLength(1);
    expect(div.querySelector('.alerte .v')?.textContent).toBe('Porte déverrouillée');
  });

  // Règle 6 du contexte : « vérifie plutôt que de supposer » que les trois blocs partagent le
  // même gabarit — lu directement dans `base.css`, pas mesuré (jsdom ne fait aucune vraie mise
  // en page, cf. les tests de budget de hauteur de `tests/maison.test.ts`).
  //
  // Ronde de correction 1 (MINEUR mais réel, relecteur) : la première version de ce test ne
  // comparait que le conteneur (`padding`/`border-radius`), ce qui a laissé passer un vrai écart
  // de gabarit — `.alerte` rendait `a.texte` dans un `<span>` unique (une ligne) quand `.demain`/
  // `.media` portent tous les deux une étiquette (`.t`) suivie d'une valeur (`.v`), deux lignes.
  // « Vérifié, pas supposé » n'était donc vrai que pour le conteneur, pas pour la structure
  // interne qui détermine la hauteur réelle. Corrigé des deux côtés : `rendreAlerte` reprend la
  // structure `.t`/`.v` (cf. `rendu/corps.ts`), et ce test compare maintenant aussi les règles
  // `.t`/`.v` des trois blocs, pas seulement leur conteneur.
  //
  // Tâche 9, ronde de correction 1 (relecteur, IMPORTANT) : `.hors-ligne` (ajouté par la tâche 9
  // pour le bandeau de silence websocket, cf. `rendu/corps.ts`) n'avait aucun filet de ce genre —
  // le relecteur a multiplié ses dimensions par près de quatre dans `base.css` sans qu'aucun des
  // 118 tests d'alors ne rougisse. Il rejoint donc la comparaison ci-dessous, exactement au même
  // titre que `.alerte` : c'est précisément un bloc qui apparaît dans les circonstances où
  // personne ne regarde l'écran, donc où une dérive de gabarit passerait inaperçue le plus
  // longtemps.
  // Tâche 6 (2026-08-02) : `.media` sort de cette comparaison — la carte média a désormais son
  // propre gabarit (affiche, transport, volume, progression en fond), délibérément différent du
  // simple `.t`/`.v` que partagent encore `.alerte`/`.hors-ligne`/`.demain`. Sa propre cohérence
  // structurelle (avec/sans affiche) est vérifiée à part, dans `tests/carte-media.test.ts`.
  it('.alerte et .hors-ligne partagent le meme gabarit que .demain : conteneur ET structure a deux lignes', () => {
    // `new URL('...css', import.meta.url)` (le motif utilisé dans tests/jetons.test.ts) échoue
    // ICI : sous `@vitest-environment jsdom` (ce fichier), Vite traite ce motif comme une URL
    // d'asset servie par son serveur de dev (`http://localhost:3000/...`) plutôt que comme une
    // vraie URL `file:` — `readFileSync` refuse alors avec « The URL must be of scheme file ».
    // `jetons.test.ts` n'a jamais ce problème : il tourne en environnement `node` par défaut, où
    // Vite ne réécrit pas ce motif. `process.cwd()` (racine du projet, d'où `npm test` s'exécute
    // toujours) contourne la réécriture en évitant `import.meta.url` entièrement.
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    // `selecteur` : classes séparées par un espace, SANS le point (ex. 'demain', 'demain t').
    const regleDe = (selecteur: string) => {
      const echappe = selecteur.split(' ').map((c) => `\\.${c}`).join(' ');
      const m = css.match(new RegExp(`${echappe} \\{([^}]*)\\}`));
      if (!m) throw new Error(`règle .${selecteur.replace(' ', ' .')} introuvable dans base.css`);
      return m[1];
    };
    const gabaritConteneur = (regle: string) => ({
      padding: regle.match(/padding:\s*([^;]+);/)?.[1],
      rayon: regle.match(/border-radius:\s*([^;]+);/)?.[1],
    });
    const gabaritTexte = (regle: string) => ({
      taille: regle.match(/font-size:\s*([^;]+);/)?.[1],
      graisse: regle.match(/font-weight:\s*([^;]+);/)?.[1],
    });

    const conteneurDemain = gabaritConteneur(regleDe('demain'));
    expect(gabaritConteneur(regleDe('alerte'))).toEqual(conteneurDemain);
    expect(gabaritConteneur(regleDe('hors-ligne'))).toEqual(conteneurDemain);

    const tDemain = gabaritTexte(regleDe('demain t'));
    const vDemain = gabaritTexte(regleDe('demain v'));
    expect(gabaritTexte(regleDe('alerte t'))).toEqual(tDemain);
    expect(gabaritTexte(regleDe('alerte v'))).toEqual(vDemain);
    expect(gabaritTexte(regleDe('hors-ligne t'))).toEqual(tDemain);
    expect(gabaritTexte(regleDe('hors-ligne v'))).toEqual(vDemain);
  });

  // Tâche 9, ronde de correction 1 (relecteur, IMPORTANT) : la contrainte globale du projet
  // (« aucune opacité sous 0,75 sur du texte ») était encore une intention en prose, jamais une
  // contrainte vérifiée — `.muet` la violait (0,55) sans qu'aucun test ne le voie. La rend
  // vérifiable plutôt que suggérée, dans le même esprit que le test de gabarit ci-dessus (lu
  // directement dans `base.css`, pas mesuré).
  it('.muet ne descend jamais sous le seuil global de 0,75 d opacite sur du texte', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    const m = css.match(/\.muet\s*\{([^}]*)\}/);
    if (!m) throw new Error('règle .muet introuvable dans base.css');
    const opacite = m[1].match(/opacity:\s*([\d.]+);/)?.[1];
    expect(opacite, '.muet devrait déclarer `opacity`').toBeDefined();
    expect(Number(opacite)).toBeGreaterThanOrEqual(0.75);
  });

  // Tâche 8 bis, demande explicite du propriétaire (« non négociable », rappel du coordinateur) :
  // vérifie la donnée déclarée elle-même, pas seulement le mécanisme générique `lien` (déjà
  // couvert par tests/interaction.test.ts avec un bouton synthétique). Une faute de frappe dans
  // l'URL ici serait invisible à tout autre test de ce projet.
  // La commande cuisine ouvre la sous-vue interne `#recette` (navigation par vue) — la page
  // autonome ne concerne plus que le scanner (`extrasMaison`), qui vise le panneau `home_stock`.
  it('la cuisine donne accès aux recettes par la vue interne de la commande Recette', () => {
    const recette = ECRANS.cuisine.commandes.find((c) => c.libelle === 'Recette');
    expect(recette?.vue).toBe('#recette');
    expect(recette?.lien).toBeUndefined();
    // Masquée par le filtre générique si `home_stock` n'est pas chargé.
    expect(recette?.entite).toBe('sensor.home_stock_next_meal');
    const courses = ECRANS.cuisine.commandes.find((c) => c.libelle === 'Courses');
    expect(courses?.lien).toBeUndefined();   // Courses navigue en interne, ce n'est pas un lien
  });

  // Tâche 6 : `recetteOuvrable` (7e paramètre de `rendreCorps`) décide seul si la tuile
  // « Recette » a un sens à afficher — décidé par `demarrage.ts` sur ce qui est RÉELLEMENT
  // disponible (une NOTE du plan de repas n'a pas de recette), jamais sur la pièce, même patron
  // que `masquerEntretien`. Par défaut `false` : sans lui, la tuile reste absente, comme avant
  // cette tâche pour le salon et le bureau.
  it('masque la tuile Recette quand il n_y a pas de recette ouvrable', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'sensor.home_stock_next_meal', state: '1', attributes: {} });
    const hote = document.createElement('div');
    render(rendreCorps(etat, ECRANS.cuisine, undefined, undefined, undefined, false, false), hote);
    const libelles = Array.from(hote.querySelectorAll('.commande .t')).map((e) => e.textContent);
    expect(libelles).not.toContain('Recette');
  });

  it('affiche la tuile Recette quand une recette est ouvrable', () => {
    const etat = new Etat();
    etat.appliquer({ entity_id: 'sensor.home_stock_next_meal', state: '1', attributes: {} });
    const hote = document.createElement('div');
    render(rendreCorps(etat, ECRANS.cuisine, undefined, undefined, undefined, false, true), hote);
    const libelles = Array.from(hote.querySelectorAll('.commande .t')).map((e) => e.textContent);
    expect(libelles).toContain('Recette');
  });

  it('le scanner (extra propre a la cuisine) pointe vers le panneau home_stock', () => {
    const scanner = ECRANS.cuisine.extrasMaison.find((b) => b.libelle === 'Scanner');
    expect(scanner?.lien).toBe('/home-stock');
    expect(ECRANS.salon.extrasMaison).toEqual([]);
    expect(ECRANS.bureau.extrasMaison).toEqual([]);
  });
});

// Tâche 13 : jauges à glissement. Ces tests ne dispatchent aucun événement pointeur (couvert par
// `tests/geste.test.ts`, isolé) — ils prouvent seulement le RENDU : la classe `jauge` et la
// variable `--jauge` posées sur la bonne tuile, avec la bonne valeur, jamais sur une tuile qui ne
// supporte pas le réglage.
describe('jauges a glissement — rendu (tache 13)', () => {
  it('la commande Lumieres (light.*, allumee) porte la classe jauge et la fraction --jauge', () => {
    const etat = new Etat();
    etat.appliquer(ev('light.lumiere_salon', 'on', { brightness: 128, supported_color_modes: ['hs'] }));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const lumieres = Array.from(div.querySelectorAll('.commande'))
      .find((c) => c.textContent?.includes('Lumières'))!;
    expect(lumieres.className).toContain('jauge');
    const style = lumieres.getAttribute('style') ?? '';
    // Fraction rapportée à la plage RÉGLABLE (1–100), pas à 0–100 : la borne basse est à 1 %
    // depuis qu'un `brightness_pct: 0` s'est révélé éteindre la lampe pendant un glissement.
    const pct = Math.round((128 / 255) * 100);
    expect(style).toContain(`--jauge:${(pct - 1) / 99}`);
  });

  it('la commande Chauffage (climate.radiateur, consigne exploitable) porte la classe jauge', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat', { temperature: 21 }));
    etat.appliquer(ev('light.lumiere_salon', 'off', { supported_color_modes: ['hs'] }));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const chauffage = Array.from(div.querySelectorAll('.commande'))
      .find((c) => c.textContent?.includes('Chauffage'))!;
    expect(chauffage.className).toContain('jauge');
  });

  // Règle 4 du brief : une entité qui ne supporte pas le réglage (ici, `climate.radiateur` sans
  // attribut `temperature` exploitable) ne doit afficher aucune jauge.
  it('une commande sans consigne exploitable ne porte jamais la classe jauge', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat', {}));   // pas de `temperature`
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const chauffage = Array.from(div.querySelectorAll('.commande'))
      .find((c) => c.textContent?.includes('Chauffage'))!;
    expect(chauffage.className).not.toContain('jauge');
  });

  // Revue tâche 16 — chauffage à l'arrêt : jauge alignée sur la règle des lumières (`jauge.ts`,
  // `descripteurLumiere`) : une lumière ÉTEINTE se montre VIDE plutôt que de mentir sur un niveau
  // qu'elle n'a plus. Capture réelle du salon/bureau : la tuile « Chauffage — Éteint » portait une
  // barre olive à moitié pleine — la jauge continuait de montrer la consigne comme si le radiateur
  // chauffait déjà à ce niveau. `d.valeur` (donc l'interaction, `geste.ts`) reste la vraie consigne
  // (cf. commentaire de `descripteurChauffage`, `jauge.ts`) : seul le REMPLISSAGE affiché change.
  it('chauffage a l arret : jauge vide (alignee sur la regle des lumieres), meme avec une consigne', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'off', { temperature: 21 }));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const chauffage = Array.from(div.querySelectorAll('.commande'))
      .find((c) => c.textContent?.includes('Chauffage'))!;
    // La classe reste : la tuile est toujours réglable au doigt même à l'arrêt (`descripteurJauge`
    // rend un descripteur non nul), seul son remplissage visuel change.
    expect(chauffage.className).toContain('jauge');
    expect(chauffage.getAttribute('style')).toContain('--jauge:0');
  });

  it('chauffage en chauffe : la jauge montre bien la consigne (contre-epreuve du test precedent)', () => {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'heat', { temperature: 21 }));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const chauffage = Array.from(div.querySelectorAll('.commande'))
      .find((c) => c.textContent?.includes('Chauffage'))!;
    const style = chauffage.getAttribute('style') ?? '';
    // (21 - 16) / (24 - 16) = 0.625, cf. `descripteurChauffage` (`jauge.ts`). Comparaison
    // stricte de la valeur entière, jamais `toContain('--jauge:0.625')` seul : ce test existe
    // pour distinguer une jauge PLEINE d'une jauge VIDE, et « --jauge:0 » est un préfixe littéral
    // de « --jauge:0.625 » — un `not.toContain('--jauge:0')` naïf rougirait ici à tort.
    expect(style).toMatch(/--jauge:0\.625(?:[^0-9]|$)/);
  });
});

// Revue tâche 16 — DÉFAUT VISIBLE À L'ÉCRAN : capture réelle de la tablette du salon, `lock.` et
// `cover.` retombaient sur `return e.etat` dans `etiquette()` (`rendu/corps.ts`) — l'état HA brut,
// en anglais (« locked », « closed »…), affiché tel quel sur un mur où « français partout, à
// l'écran compris » est une contrainte du projet depuis la tâche 8/9 pour `climate.`, jamais
// étendue à `lock.`/`cover.` quand la tâche 5 les a ajoutés bien plus tard.
//
// PROUVÉ ROUGE avant correction (voir rapport de tâche 16 pour la sortie complète de
// `npx vitest run tests/corps.test.ts` sur le code d'avant ce correctif) : chacun des cas
// ci-dessous affichait l'état brut anglais (ou, pour le cas « état inconnu », le jeton fantaisiste
// injecté tel quel) au lieu du libellé français attendu.
describe('etiquette des commandes serrure et rideau — francais partout, jamais un jeton anglais brut', () => {
  type Cas = [entite: string, etatBrut: string, attributs: Record<string, unknown> | undefined, attendu: string];
  const cas: Cas[] = [
    ['lock.aqara_smart_lock_u200_lite', 'locked', undefined, 'Verrouillée'],
    ['lock.aqara_smart_lock_u200_lite', 'unlocked', undefined, 'Déverrouillée'],
    ['lock.aqara_smart_lock_u200_lite', 'locking', undefined, 'Verrouille…'],
    ['lock.aqara_smart_lock_u200_lite', 'unlocking', undefined, 'Déverrouille…'],
    ['lock.aqara_smart_lock_u200_lite', 'jammed', undefined, 'Bloquée'],
    ['lock.aqara_smart_lock_u200_lite', 'open', undefined, 'Ouverte'],
    ['lock.aqara_smart_lock_u200_lite', 'opening', undefined, 'Ouverture…'],
    // État jamais documenté par HA pour ce domaine : ne devine jamais, n'affiche jamais le jeton
    // brut ni un blanc — cf. `ETAT_INCONNU` (`rendu/corps.ts`).
    ['lock.aqara_smart_lock_u200_lite', 'un-jeton-jamais-vu', undefined, 'État inconnu'],
    ['cover.rideau_salon', 'closed', undefined, 'Fermé'],
    ['cover.rideau_salon', 'opening', undefined, 'Ouverture…'],
    ['cover.rideau_salon', 'closing', undefined, 'Fermeture…'],
    // Rideau ouvert à 100 % : le pourcentage n'ajoute rien, simple « Ouvert ».
    ['cover.rideau_salon', 'open', { current_position: 100 }, 'Ouvert'],
    // Rideau à moitié ouvert : « Ouvert 42 % », pas juste « Ouvert » (le brief : « un rideau à
    // moitié ouvert mérite mieux que "Ouvert" ») — même attribut que `descripteurRideau` (jauge.ts).
    ['cover.rideau_salon', 'open', { current_position: 42 }, 'Ouvert 42 %'],
    // `current_position` absent (volet sans SET_POSITION) : pas de pourcentage à inventer.
    ['cover.rideau_salon', 'open', {}, 'Ouvert'],
    ['cover.rideau_salon', 'un-jeton-jamais-vu', undefined, 'État inconnu'],
  ];

  it.each(cas)('%s en "%s" affiche "%s"', (entite, etatBrut, attributs, attendu) => {
    const etat = new Etat();
    etat.appliquer(ev(entite, etatBrut, attributs ?? {}));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const libelleCible = entite.startsWith('lock.') ? 'Porte' : 'Rideau';
    const tuile = Array.from(div.querySelectorAll('.commande'))
      .find((c) => c.querySelector('.t')?.textContent === libelleCible)!;
    expect(tuile, `tuile « ${libelleCible} » introuvable pour ${entite}=${etatBrut}`).toBeDefined();
    expect(tuile.querySelector('.s')?.textContent).toBe(attendu);
  });

  // Jamais un mot anglais brut, quel que soit l'état — y compris le cas « état inconnu » : un
  // jeton fantaisiste NE DOIT PAS remonter tel quel à l'écran (règle du brief : « ne devine jamais
  // un état inconnu... ni un mot anglais, ni une chaîne vide »).
  it('aucun etat de lock./cover. ne fuit jamais un jeton anglais brut a l ecran', () => {
    const etat = new Etat();
    etat.appliquer(ev('lock.aqara_smart_lock_u200_lite', 'locked'));
    etat.appliquer(ev('cover.rideau_salon', 'closed'));
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.salon), div);
    const texte = div.textContent ?? '';
    for (const motAnglais of ['locked', 'unlocked', 'locking', 'unlocking', 'jammed',
                               'closed', 'opening', 'closing']) {
      expect(texte).not.toContain(motAnglais);
    }
  });
});

// Tâche 9 : `rendreCorps` ne décide plus lui-même de la rangée de commandes — c'est
// `ordreCommandes` (`modes.ts`) qui tranche combien (2 ou 4) et dans quel ordre, selon le
// `ContexteModes` reçu. Sans `ctx`, comportement d'avant (toutes les commandes utilisables, dans
// leur ordre déclaré) : c'est ce qui laisse les tests ci-dessus verts sans y toucher.
describe('rangées de commandes selon le mode', () => {
  it('affiche quatre commandes en mode courant', () => {
    const etat = etatSalonComplet();     // fabrique déjà présente dans ce fichier
    render(rendreCorps(etat, ECRANS.salon, undefined, CTX_SALON), hote);
    expect(hote.querySelectorAll('.commande').length).toBe(4);
  });

  // 2026-08-29 : le salon garde ses quatre commandes MÊME en média — c'est précisément ce que la
  // rangée « Ambiance » supprimée finance (cf. `rangeeAmbiance`, `modes.ts`). Une pièce qui garde
  // sa rangée, elle, retombe bien à deux : vérifié juste en dessous sur la cuisine, pour que la
  // règle reste couverte des deux côtés.
  it('garde quatre commandes en mode média, la rangée Ambiance ayant payé la seconde', () => {
    const etat = etatSalonComplet();
    render(rendreCorps(etat, ECRANS.salon, undefined,
                       { ...CTX_SALON, sourceJoue: true }), hote);
    expect(hote.querySelectorAll('.commande').length).toBe(4);
  });

  it('une pièce qui garde sa rangée Ambiance retombe à deux commandes en mode média', () => {
    const etat = new Etat();
    for (const [id, v, attrs] of [
      ['light.hotte', 'off', {}],
      ['cover.rideau_cuisine', 'closed', { current_position: 0 }],
      ['todo.home_stock_shopping', '5', {}],
      ['sensor.home_stock_next_meal', '2', {}],
    ] as const) etat.appliquer(ev(id, v, attrs));
    render(rendreCorps(etat, ECRANS.cuisine, undefined,
                       { ...CTX_CALME, sourceJoue: true }), hote);
    expect(hote.querySelectorAll('.commande').length).toBe(2);
  });

  it('n\'affiche jamais Ambilight hors du mode cinéma', () => {
    const etat = etatSalonComplet();
    render(rendreCorps(etat, ECRANS.salon, undefined, CTX_SALON), hote);
    const libelles = Array.from(hote.querySelectorAll('.commande .t')).map((e) => e.textContent);
    expect(libelles).not.toContain('Ambilight');
  });

  it('affiche Ambilight en mode cinéma, sans déloger la Porte ni le Rideau', () => {
    const etat = etatSalonComplet();
    render(rendreCorps(etat, ECRANS.salon, undefined,
                       { ...CTX_SALON, ecranAllume: true }), hote);
    const libelles = Array.from(hote.querySelectorAll('.commande .t')).map((e) => e.textContent);
    expect(libelles).toEqual(['Ambilight', 'Lumières', 'Porte', 'Rideau']);
  });

  // Épinglage de la porte (2026-08-04) vérifié sur le rendu réel, pas seulement sur l'ordre :
  // c'est une tuile PEINTE que le propriétaire attend au salon, dans tous les modes du jour, et
  // sans rangée supplémentaire (le nombre de tuiles ne bouge pas d'un mode à l'autre).
  it('la porte ET le rideau sont peints dans tous les modes du jour, sans rangée en plus', () => {
    const modes = [
      ['courant', CTX_SALON],
      ['média', { ...CTX_SALON, sourceJoue: true }],
      ['cinéma', { ...CTX_SALON, ecranAllume: true }],
      ['voiture', { ...CTX_SALON, blocDefaut: 'voiture' as const }],
      ['ménage', { ...CTX_SALON, aspirateurEnMarche: true }],
      ['chaleur', { ...CTX_SALON, temperatureExterieure: 35 }],
    ] as const;
    for (const [nom, ctx] of modes) {
      const etat = etatSalonComplet();
      render(rendreCorps(etat, ECRANS.salon, undefined, ctx), hote);
      const libelles = Array.from(hote.querySelectorAll('.commande .t')).map((e) => e.textContent);
      expect(libelles, nom).toContain('Porte');
      // Sous chaleur, la même tuile s'appelle « Fermer » : c'est la consigne du jour, pas un objet.
      expect(libelles.includes('Rideau') || libelles.includes('Fermer'), nom).toBe(true);
      // Quatre tuiles dans TOUS les modes : le nombre ne bouge plus d'un mode à l'autre, c'est
      // ce que la rangée « Ambiance » rendue au budget achète.
      expect(libelles.length, nom).toBe(4);
    }
  });

  it('rend le bloc central fourni, jamais de bloc .prevision (disparu à la tâche 14)', () => {
    const etat = etatSalonComplet();
    render(rendreCorps(etat, ECRANS.salon, html`<div class="faux-bloc"></div>`, CTX_CALME), hote);
    expect(hote.querySelector('.prevision')).toBeNull();
    expect(hote.querySelector('.faux-bloc')).not.toBeNull();
  });

  it('sans contexte, garde le comportement d\'avant : toutes les commandes utilisables', () => {
    const etat = etatSalonComplet();
    render(rendreCorps(etat, ECRANS.salon), hote);
    expect(hote.querySelectorAll('.commande').length).toBe(5);
  });

  it('le mode invités masque les écarts perso, jamais la porte', () => {
    const etat = etatSalonComplet();
    etat.appliquer({ entity_id: 'lock.aqara_smart_lock_u200_lite', state: 'unlocked', attributes: {} });
    etat.appliquer({ entity_id: 'sensor.peugeot_e208_batterie_niveau', state: '21', attributes: {} });
    etat.appliquer({ entity_id: 'todo.maintenance', state: '4', attributes: {} });
    render(rendreCorps(etat, ECRANS.salon, undefined,
                       { ...CTX_CALME, modeInvites: true }), hote);
    const ecart = hote.querySelector('.synthese .ecart')!.textContent!;
    expect(ecart).toContain('porte déverrouillée');
    expect(ecart).not.toContain('voiture');
    expect(ecart).not.toContain('entretien');
  });

  it('sans le mode invités, tous les écarts sont affichés', () => {
    const etat = etatSalonComplet();
    etat.appliquer({ entity_id: 'sensor.peugeot_e208_batterie_niveau', state: '21', attributes: {} });
    render(rendreCorps(etat, ECRANS.salon, undefined, CTX_CALME), hote);
    expect(hote.querySelector('.synthese .ecart')!.textContent).toContain('voiture');
  });
});

// Tâche 3 : la rangée « Ambiance » est partagée par les trois tablettes (salon, bureau, cuisine).
// Seule la cuisine reçoit une 4e tuile (le minuteur, rendue par `demarrage.ts`/`rendu/minuteur.ts`
// à la tâche 4) — `--ambiances` doit donc porter le compte RÉEL, tuile comprise, pour que la
// grille CSS (`--ambiances`, `base.css`) s'ajuste sans jamais coûter au salon/bureau, qui ne
// passent jamais de 7e paramètre et doivent donc rester à 3 colonnes (repli `var(--ambiances, 3)`).
// Tâche 7 (mouvement, 2026-08-22) : couverture — le conteneur des commandes, chaque tuile
// d'ambiance et l'étiquette d'état d'une tuile de commande portent leur marque, pour que le
// moteur (`src/mouvement/moteur.ts`) les anime plutôt que de les faire sauter sec. `.commande`
// (`tuile:<entité>`) est déjà marquée depuis une tâche antérieure (cf. plus haut) — non retestée
// ici.
describe('marques de mouvement (tâche 7)', () => {
  // C2 (revue finale) — `ligne:commandes`, PAS `bloc:commandes` : le rôle `bloc` entrerait dans
  // l'appariement du croisement de `diff.ts` dès qu'un minuteur (aussi `bloc:*`) prend exactement
  // sa place d'ancien voisin de flex (cf. le commentaire au-dessus de `.commandes`, `corps.ts`).
  it('le conteneur des commandes porte une marque de ligne, jamais de bloc', () => {
    const div = document.createElement('div');
    render(rendreCorps(etatSalonComplet(), ECRANS.salon), div);
    expect(div.querySelector('.commandes')?.getAttribute('data-mvt')).toBe('ligne:commandes');
  });

  // Exercé sur la CUISINE depuis le 2026-08-29 : le salon ne déclare plus aucune ambiance, un
  // test qui comparerait deux tableaux vides passerait toujours sans rien prouver.
  it('chaque tuile d\'ambiance est marquée par l\'entité de sa scène, pas par son rang', () => {
    const div = document.createElement('div');
    render(rendreCorps(new Etat(), ECRANS.cuisine), div);
    const tuiles = Array.from(div.querySelectorAll('.groupe > .ambiance'));
    expect(tuiles).not.toHaveLength(0);
    expect(tuiles.map((t) => t.getAttribute('data-mvt'))).toEqual(
      ECRANS.cuisine.ambiances.map((a) => `tuile:amb-${a.entite}`),
    );
  });

  // Mineur (revue finale) — la marque detail:etiq-<entité> a été RETIRÉE : .s est rendue
  // inconditionnellement, son offsetParent est la boîte interne de la tuile (pas racine), et elle
  // ne pose jamais data-mvt-etat — elle ne produisait donc aucun verdict, jamais, pour le coût de
  // deux lectures de mise en page par tuile et par peinture. cf. corps.ts pour le détail.
  it('l\'étiquette d\'état d\'une tuile de commande ne porte plus de marque de détail (marque morte retirée)',
    () => {
      const div = document.createElement('div');
      render(rendreCorps(etatSalonComplet(), ECRANS.salon), div);
      const chauffage = Array.from(div.querySelectorAll('.commande'))
        .find((c) => c.textContent?.includes('Chauffage'))!;
      expect(chauffage.querySelector('.s')?.hasAttribute('data-mvt')).toBe(false);
    });
});

/** 2026-08-29 : le salon abandonne sa rangée « Ambiance » pour financer ses quatre commandes
 *  permanentes. Le retrait doit être COMPLET — étiquette comprise. `.corps` est une colonne flex
 *  à gouttière de 8 px : un `.groupe` vide n'aurait aucune hauteur propre mais resterait un
 *  enfant, donc une gouttière de plus que rien ne comble ; et une étiquette « Ambiance » sans
 *  rangée sous elle serait un titre orphelin. Même raisonnement, et même remède, que la rangée de
 *  commandes du mode minuteur (cf. le commentaire de `.commandes`, `rendu/corps.ts`). */
describe('rangée Ambiance — absente quand la pièce n\'en déclare aucune', () => {
  it('ni étiquette ni groupe pour le salon', () => {
    const div = document.createElement('div');
    render(rendreCorps(etatSalonComplet(), ECRANS.salon), div);
    expect(div.querySelector('.groupe')).toBeNull();
    expect(Array.from(div.querySelectorAll('.etiquette')).map((e) => e.textContent))
      .not.toContain('Ambiance');
  });

  it('le reste de l\'écran est intact : commandes, synthèse et « Toute la maison »', () => {
    const div = document.createElement('div');
    render(rendreCorps(etatSalonComplet(), ECRANS.salon), div);
    expect(div.querySelector('.commandes')).not.toBeNull();
    expect(div.querySelector('.synthese')).not.toBeNull();
    expect(div.querySelector('.xl')?.textContent).toContain('Toute la maison');
  });

  // Le cas limite qui décide entre « pas d'ambiance » et « rien à rendre » : une pièce sans
  // ambiance DÉCLARÉE mais à qui `demarrage.ts` passe la tuile minuteur garde bien sa rangée.
  // Aucune pièce n'est dans ce cas aujourd'hui — c'est justement pourquoi il se teste ici plutôt
  // que de se découvrir un jour à l'écran.
  it('une tuile minuteur seule suffit à garder la rangée', () => {
    const div = document.createElement('div');
    const tuile = html`<div class="ambiance" data-minuteur-entree>Minuteur</div>`;
    render(rendreCorps(etatSalonComplet(), ECRANS.salon, undefined, undefined, tuile), div);
    const groupe = div.querySelector<HTMLElement>('.groupe')!;
    expect(groupe).not.toBeNull();
    expect(groupe.style.getPropertyValue('--ambiances')).toBe('1');
  });
});

describe('rangée Ambiance — 4e tuile', () => {
  it('publie le nombre de tuiles pour la grille', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreCorps(etat, ECRANS.cuisine), div);
    const groupe = div.querySelector<HTMLElement>('.groupe')!;
    expect(groupe.style.getPropertyValue('--ambiances')).toBe('3');
  });

  it('ajoute la tuile fournie et l\'inclut dans le compte', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    const tuile = html`<div class="ambiance" data-minuteur-entree>Minuteur</div>`;
    render(
      rendreCorps(etat, ECRANS.cuisine, undefined, undefined, tuile),
      div,
    );
    const groupe = div.querySelector<HTMLElement>('.groupe')!;
    expect(groupe.style.getPropertyValue('--ambiances')).toBe('4');
    expect(groupe.querySelectorAll('.ambiance')).toHaveLength(4);
    expect(div.querySelector('[data-minuteur-entree]')).not.toBeNull();
  });
});

// Tâche 18 — LE CADRE DOIT AVOIR UNE HAUTEUR DANS LE MOTEUR DES TROIS TABLETTES, PAS DU SEUL
// BUREAU. Relevé en lecture seule sur l'API Fully (`?cmd=deviceInfo`, 2026-08-03) : cuisine et
// salon rendent en Chrome 100, bureau en Chrome 119. Les unités de viewport dynamique (`dvh` et
// consorts) n'existent qu'à partir de Chrome 108 : sur deux écrans sur trois, `#app
// { height: 100dvh }` déclaré SEUL était jeté au parsing, `height` retombait à `auto`, et le
// bouton `.xl { margin-top: auto }` flottait au milieu de l'écran faute d'espace à absorber.
//
// Ce test lit `base.css` (jsdom ne calcule aucune mise en page, cf. les tests de gabarit
// ci-dessus) et se contente de la question qu'un fichier texte peut trancher : après avoir écarté
// tout ce qu'un Chrome 100 jette, `#app` a-t-il ENCORE une hauteur, et cette hauteur est-elle
// réellement résoluble ? Il rougit en une seconde, sans navigateur. La preuve dans un vrai moteur
// de rendu — la mise en page réellement obtenue, dans les DEUX moteurs — est faite par
// `outils/verifier-rendu.mjs` (`autoTestCadre` et la passe « Cadre en moteur SANS `dvh` »), qui
// va jusqu'à vérifier que `.xl` retombe bien au pied de l'écran.
describe('hauteur du cadre #app (tache 18)', () => {
  // Ajoutées à Chrome 108, donc INCONNUES des WebView de la cuisine et du salon : toute
  // déclaration qui en contient une y est invalide, donc inexistante.
  const UNITES_APRES_CHROME_100 = /\d(dvh|dvw|dvmin|dvmax|svh|svw|lvh|lvw)\b/;

  const regleDe = (css: string, selecteur: string) => {
    const m = css.match(new RegExp(`(^|\\})\\s*${selecteur}\\s*\\{([^}]*)\\}`, 'm'));
    if (!m) throw new Error(`règle ${selecteur} introuvable dans base.css`);
    return m[2];
  };
  // La dernière déclaration `height` qui SURVIT au parsing d'un moteur sans `dvh` : la cascade
  // garde la dernière valide, exactement comme le ferait le moteur.
  const hauteurSurvivante = (regle: string) => [...regle.matchAll(/height:\s*([^;]+);/g)]
    .map((m) => m[1].trim())
    .filter((v) => !UNITES_APRES_CHROME_100.test(v))
    .pop();

  it('#app garde une hauteur dans un moteur qui ignore dvh', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    const hauteur = hauteurSurvivante(regleDe(css, '#app'));
    expect(hauteur, '#app doit déclarer une hauteur sans unité de viewport dynamique, '
      + 'sinon elle retombe à `auto` sur la cuisine et le salon').toBeDefined();
  });

  it('une hauteur de #app en pourcentage est bien resoluble : html et body la portent aussi', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    const hauteur = hauteurSurvivante(regleDe(css, '#app'));
    if (!hauteur?.endsWith('%')) return;   // un jour en unité absolue : rien à chaîner
    // Un pourcentage se résout contre le bloc conteneur ; si `html`/`body` n'ont pas de hauteur
    // définie, il retombe sur `auto` — le défaut d'origine, à l'identique et tout aussi muet.
    const chaine = hauteurSurvivante(regleDe(css, 'html, body'));
    expect(chaine, 'html, body doivent déclarer `height` pour qu\'un pourcentage sur #app '
      + 'se résolve autrement qu\'en `auto`').toBe('100%');
  });
});

// Tâche 19 (2026-08-03) : les quatre tuiles ajoutées à la cuisine et au bureau (cf.
// `tests/pieces.test.ts` pour leur déclaration). Trois domaines n'avaient jamais atteint une
// rangée de commandes jusqu'ici — `fan.`, `binary_sensor.` et `vacuum.` — et retombaient donc tous
// les trois sur le repli générique d'`etiquette` (`rendu/corps.ts`), écrit pour les lumières : un
// ventilateur en marche s'y annonçait « Allumé », un Velux ouvert « Allumé », et un aspirateur à
// sa base « docked », c'est-à-dire un jeton anglais brut à l'écran — très exactement le défaut que
// la tâche 16 avait corrigé pour `lock.`/`cover.` et que ces trois domaines rouvraient.
describe('tâche 19 — étiquette, couleur et retour au doigt des nouvelles commandes', () => {
  /** État minimal où les quatre commandes d'une pièce sont utilisables — sans lui, `rendreCorps`
   *  écarte les tuiles muettes (`Etat.estUtilisable`) et un test « la tuile n'est pas colorée »
   *  passerait au vert parce qu'elle n'existe pas. */
  function etatCuisine(purificateur = 'on', aspirateur = 'docked'): Etat {
    const etat = new Etat();
    etat.appliquer(ev('todo.home_stock_shopping', '5'));
    etat.appliquer(ev('sensor.home_stock_next_meal', '2'));
    etat.appliquer(ev('vacuum.aspirateur_cuisine', aspirateur, { battery_level: 100 }));
    etat.appliquer(ev('fan.purificateur_air', purificateur, { percentage: 4 }));
    // Arrivées en commandes le 2026-08-29 : sans état posé, `Etat.estUtilisable` les écarte du
    // rendu et un test « cette tuile n'est pas inerte » passerait au vert faute de tuile.
    etat.appliquer(ev('light.hotte', 'off'));
    etat.appliquer(ev('cover.rideau_cuisine', 'closed', { current_position: 0 }));
    return etat;
  }

  function etatBureau(ventilateur = 'on', velux = 'on'): Etat {
    const etat = new Etat();
    etat.appliquer(ev('climate.radiateur', 'off', { temperature: 21 }));
    etat.appliquer(ev('light.lumiere_chambre', 'off'));
    etat.appliquer(ev('fan.chambre_ventilateur_tour', ventilateur, { percentage: 33 }));
    etat.appliquer(ev('binary_sensor.velux_ch_ouverture', velux, { device_class: 'door' }));
    return etat;
  }

  const tuile = (racine: HTMLElement, libelle: string) =>
    Array.from(racine.querySelectorAll('.commande'))
      .find((c) => c.querySelector('.t')?.textContent === libelle)!;

  it('un ventilateur dit « En marche » / « Arrêté », jamais « Allumé » (ce n\'est pas une lampe)', () => {
    render(rendreCorps(etatBureau('on'), ECRANS.bureau), hote);
    expect(tuile(hote, 'Ventilateur').querySelector('.s')?.textContent).toBe('En marche');
    render(rendreCorps(etatBureau('off'), ECRANS.bureau), hote);
    expect(tuile(hote, 'Ventilateur').querySelector('.s')?.textContent).toBe('Arrêté');
  });

  // 2026-08-29 — RÉGRESSION ASSUMÉE, écrite ici pour qu'elle ne se redécouvre pas à l'écran : le
  // purificateur a quitté les commandes pour la rangée du haut, qui ne rend NI étiquette d'état NI
  // fond actif. Il y perd son « En marche » / « Arrêté ». C'est le prix de la place rendue à la
  // Hotte et au Rideau, que le propriétaire a demandés (2026-08-29) — et la vue « Toute la
  // maison » ne pouvait pas l'accueillir, déjà pleine à 10/10 tuiles pour la cuisine.
  // La RÈGLE elle-même (`fan.` → « En marche »/« Arrêté », décidée par domaine et non par entité)
  // n'a pas changé et reste couverte par le Ventilateur du bureau, juste au-dessus.
  it('le purificateur est passé en rangée du haut : plus d\'étiquette d\'état, par construction', () => {
    render(rendreCorps(etatCuisine('on'), ECRANS.cuisine), hote);
    expect(tuile(hote, 'Purificateur')).toBeUndefined();
    const ambiance = Array.from(hote.querySelectorAll('.ambiance'))
      .find((a) => a.textContent?.includes('Purificateur'))!;
    expect(ambiance).toBeDefined();
    expect(ambiance.querySelector('.s')).toBeNull();
  });

  it('un ouvrant dit « Ouvert » / « Fermé », jamais « Allumé »', () => {
    render(rendreCorps(etatBureau('on', 'on'), ECRANS.bureau), hote);
    expect(tuile(hote, 'Velux').querySelector('.s')?.textContent).toBe('Ouvert');
    render(rendreCorps(etatBureau('on', 'off'), ECRANS.bureau), hote);
    expect(tuile(hote, 'Velux').querySelector('.s')?.textContent).toBe('Fermé');
  });

  // « Aspirer ici » est un LANCEUR d'action, pas un afficheur d'état — exactement comme la même
  // tuile dans « Toute la maison », qui n'a jamais montré que son libellé. Deux raisons de ne rien
  // écrire sous le libellé : aucun jeton anglais (`docked`, `cleaning`…) ne peut fuir à l'écran,
  // et pendant un nettoyage le bloc central du mode `menage` est SEUL à porter l'état de
  // l'aspirateur — sinon la même donnée s'écrirait deux fois sur la même tablette.
  // « Aspirer ici » a suivi le purificateur dans la rangée du haut le 2026-08-29 — et n'y perd
  // RIEN : lanceur d'action, elle n'a jamais affiché d'état, c'était même l'unique étiquette vide
  // de l'application. La garantie qui compte reste la même et se vérifie toujours : aucun jeton
  // anglais (`docked`, `cleaning`…) ne peut fuir sous son libellé, quel que soit l'état du robot.
  it('« Aspirer ici » n\'affiche aucun état, à sa base comme en plein nettoyage', () => {
    for (const etatVacuum of ['docked', 'cleaning', 'returning', 'error']) {
      render(rendreCorps(etatCuisine('on', etatVacuum), ECRANS.cuisine), hote);
      const tuileAspi = Array.from(hote.querySelectorAll('.ambiance'))
        .find((a) => a.textContent?.includes('Aspirer ici'))!;
      expect(tuileAspi, `état ${etatVacuum}`).toBeDefined();
      expect(tuileAspi.textContent?.trim(), `état ${etatVacuum}`).toBe('Aspirer ici');
    }
  });

  // Le repli générique d'`etiquette` rend l'état BRUT (`return e.etat`) pour tout ce qu'aucune
  // branche ne reconnaît : c'est par là que « docked » est arrivé à l'écran. Contrôle exhaustif
  // sur les états réellement possibles de ces trois domaines, sur les deux pièces concernées —
  // aucun ne doit ressortir tel quel sous un libellé de tuile.
  it('aucun jeton d\'état brut de fan./binary_sensor./vacuum. ne ressort tel quel', () => {
    const bruts = ['docked', 'cleaning', 'returning', 'idle', 'paused', 'error', 'on', 'off'];
    const sousTitres = (r: HTMLElement) =>
      Array.from(r.querySelectorAll('.commande .s')).map((e) => e.textContent ?? '');
    for (const etatVacuum of ['docked', 'cleaning', 'returning', 'paused', 'idle', 'error']) {
      render(rendreCorps(etatCuisine('on', etatVacuum), ECRANS.cuisine), hote);
      for (const s of sousTitres(hote)) expect(bruts, `« ${s} »`).not.toContain(s);
    }
    for (const marche of ['on', 'off']) {
      for (const ouvert of ['on', 'off']) {
        render(rendreCorps(etatBureau(marche, ouvert), ECRANS.bureau), hote);
        for (const s of sousTitres(hote)) expect(bruts, `« ${s} »`).not.toContain(s);
      }
    }
  });

  // Règle des tablettes murales : « actif » = en marche / ouvert. Sans branche de domaine, un
  // purificateur en marche et un Velux ouvert restaient gris en permanence — la couleur, qui est
  // la seule information lisible de loin, mentait.
  it('un ventilateur en marche et un ouvrant ouvert sont colorés ; à l\'arrêt/fermés, non', () => {
    render(rendreCorps(etatBureau('on', 'on'), ECRANS.bureau), hote);
    expect(tuile(hote, 'Ventilateur').classList.contains('actif')).toBe(true);
    expect(tuile(hote, 'Velux').classList.contains('actif')).toBe(true);
    render(rendreCorps(etatBureau('off', 'off'), ECRANS.bureau), hote);
    expect(tuile(hote, 'Ventilateur').classList.contains('actif')).toBe(false);
    expect(tuile(hote, 'Velux').classList.contains('actif')).toBe(false);
  });

  // Contre-épreuve : un lanceur d'action n'a pas d'état actif/inactif à porter (règle des
  // tablettes murales, CLAUDE.md du dépôt HA : scènes et lanceurs d'aspirateur restent en couleur
  // inactive). La tuile reste grise même pendant que l'aspirateur nettoie.
  it('« Aspirer ici » n\'est jamais colorée, même pendant le nettoyage', () => {
    render(rendreCorps(etatCuisine('on', 'cleaning'), ECRANS.cuisine), hote);
    const tuileAspi = Array.from(hote.querySelectorAll('.ambiance'))
      .find((a) => a.textContent?.includes('Aspirer ici'))!;
    // La rangée du haut ne porte aucun fond « actif » : la garantie est désormais structurelle
    // plutôt que conditionnelle — c'est un renforcement, pas un affaiblissement.
    expect(tuileAspi.classList.contains('actif')).toBe(false);
  });

  // Règle du propriétaire : une tuile qui ne déclenche RIEN ne donne aucun retour au doigt ; une
  // tuile qui agit, si. `interaction.ts` ne fait rien d'un appui sans `service` (aucun optimisme,
  // aucun appel), et `geste.ts` n'entre même pas dans sa machine à états sans jauge : le Velux est
  // donc la première tuile réellement inerte de l'application. « Chauffage » est la contre-épreuve
  // qui compte : sans `service` lui non plus, mais réglable au GLISSEMENT (jauge `climate.`), donc
  // il agit et doit garder son accusé de réception.
  it('la tuile inerte (Velux) porte la classe inerte ; celles qui agissent, jamais', () => {
    render(rendreCorps(etatBureau(), ECRANS.bureau), hote);
    expect(tuile(hote, 'Velux').classList.contains('inerte')).toBe(true);
    expect(tuile(hote, 'Chauffage').classList.contains('inerte')).toBe(false);
    expect(tuile(hote, 'Ventilateur').classList.contains('inerte')).toBe(false);
    // Tâche 6 : la tuile « Recette » n'est rendue que si `recetteOuvrable` vaut `true` (7e
    // paramètre) — sans lui, elle est absente du DOM, pas seulement masquée, donc `tuile()`
    // échouerait à la trouver et ce test perdrait son sens sur cette commande précise.
    render(rendreCorps(etatCuisine(), ECRANS.cuisine, undefined, undefined, undefined, false, true), hote);
    // « Recette » n'a pas de service mais ouvre une vue interne (`vue`) : elle agit, elle accuse.
    expect(tuile(hote, 'Recette').classList.contains('inerte')).toBe(false);
    // La Hotte et le Rideau, arrivés en commandes le 2026-08-29, agissent tous les deux : la
    // première par `light.toggle`, le second par son script (et il porte en plus une jauge).
    expect(tuile(hote, 'Hotte').classList.contains('inerte')).toBe(false);
    expect(tuile(hote, 'Rideau').classList.contains('inerte')).toBe(false);
  });

  it('base.css désarme réellement le retour au doigt d\'une commande inerte', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8');
    // `content: none` supprime la génération même de la boîte `::after` (jamais seulement son
    // opacité), même patron que `.ambiance.inactif` et `.vt-bouton.vt-attente`.
    expect(css).toMatch(/\.commande\.inerte::after\s*\{\s*content:\s*none;\s*\}/);
    // Et le rayon d'angle ne se resserre plus au contact : il est réaffirmé à sa valeur de repos.
    expect(css).toMatch(/\.commande\.inerte:active\s*\{[^}]*border-radius:\s*var\(--sh-xl\)/);
  });
});

// ── Décision 8 de la spec home-desk (2026-09-04) ─────────────────────────────
// `home-desk` ne déclare pas `home-stock` dans `requires.packages` : la
// dépendance passe par le bus, jamais par un import. Le défaut de ce choix
// n'était pas l'absence, c'était le SILENCE — `home_stock` non chargé ⇒ le
// capteur passe `unavailable` ⇒ le masquage générique ci-dessus filtre la
// tuile ⇒ elle disparaît de l'écran de la cuisine sans un mot.
describe('absence nommée', () => {
  const CUISINE = ECRANS.cuisine;

  /** Une pièce d'essai qui ne porte QUE les commandes fournies — la cuisine
   *  réelle en déclare cinq, dont trois qui n'ont rien à voir avec le
   *  garde-manger et brouilleraient les comptes. */
  const pieceAvec = (commandes: typeof CUISINE.commandes) =>
    ({ ...CUISINE, ambiances: [], commandes, synthese: [], extrasMaison: [] });

  const RECETTE = {
    libelle: 'Recette', icone: 'book', entite: 'sensor.home_stock_next_meal',
    vue: '#recette', absenceNommee: 'Garde-manger non installé',
  } as const;

  it('filtre une commande dont l\'entité est indisponible et qui ne nomme pas son absence', () => {
    const etat = new Etat();   // aucune entité connue
    const div = document.createElement('div');
    render(rendreCorps(etat, pieceAvec([
      { libelle: 'Recette', icone: 'book', entite: 'sensor.home_stock_next_meal', vue: '#recette' },
    ])), div);
    expect(div.querySelectorAll('.commande')).toHaveLength(0);
  });

  it('CONSERVE une commande qui porte absenceNommee, et la rend inerte', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreCorps(etat, pieceAvec([RECETTE])), div);
    const commandes = Array.from(div.querySelectorAll('.commande'));
    expect(commandes).toHaveLength(1);
    expect(commandes[0].textContent).toContain('Recette');
    expect(commandes[0].className).not.toContain('actif');
  });

  it('rend le libellé d\'absence en sous-titre, pas un vide', () => {
    const etat = new Etat();
    expect(etiquette(etat, RECETTE)).toBe('Garde-manger non installé');
    const div = document.createElement('div');
    render(rendreCorps(etat, pieceAvec([RECETTE])), div);
    expect(div.querySelector('.commande .s')!.textContent)
      .toBe('Garde-manger non installé');
  });

  it('ignore absenceNommee dès que l\'entité redevient utilisable', () => {
    const etat = new Etat();
    etat.appliquer(ev('sensor.home_stock_next_meal', 'Gratin'));
    expect(etiquette(etat, RECETTE)).not.toBe('Garde-manger non installé');
  });

  it('garde la tuile Recette hors ligne même quand aucune recette n\'est ouvrable', () => {
    // `recetteOuvrable` vaut faux quand le garde-manger est absent (aucun
    // `recipe_id` à lire) : sans traitement, le SECOND filtre reprenait la
    // tuile que le premier venait de laisser passer.
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreCorps(etat, pieceAvec([RECETTE]), undefined, undefined, undefined,
                       false, /* recetteOuvrable */ false), div);
    expect(div.querySelectorAll('.commande')).toHaveLength(1);
  });

  it('garde la tuile Recette masquée quand le garde-manger RÉPOND mais n\'a pas de recette', () => {
    // Le comportement d'avant, qui ne doit pas régresser : l'entité est
    // utilisable, il n'y a simplement rien à ouvrir.
    const etat = new Etat();
    etat.appliquer(ev('sensor.home_stock_next_meal', 'Gratin'));
    const div = document.createElement('div');
    render(rendreCorps(etat, pieceAvec([RECETTE]), undefined, undefined, undefined,
                       false, /* recetteOuvrable */ false), div);
    expect(div.querySelectorAll('.commande')).toHaveLength(0);
  });

  it('nomme aussi l\'absence dans la vue « Toute la maison » (tuile Scanner)', () => {
    const etat = new Etat();
    const div = document.createElement('div');
    render(rendreMaison(etat, { ...CUISINE, extrasMaison: [
      { libelle: 'Scanner', icone: 'scan', entite: 'sensor.home_stock_next_meal',
        lien: '/home-stock', absenceNommee: 'Garde-manger non installé' },
    ] }), div);
    const scanner = Array.from(div.querySelectorAll('.tuile'))
      .find((c) => c.textContent?.includes('Scanner'));
    expect(scanner).toBeDefined();
    expect(scanner!.textContent).toContain('Garde-manger non installé');
  });

  it('nomme l\'absence dans la ligne de synthèse au lieu de la sauter', () => {
    const etat = new Etat();
    const s = ligneSynthese(etat, [
      { entite: 'sensor.home_stock_next_meal', texte: '{etat}', operateur: '!=', valeur: '',
        absenceNommee: 'Garde-manger non installé' } as EntreeSynthese,
    ]);
    expect(s.ecarts).toContain('Garde-manger non installé');
  });
});

/** Lit l'ordre des zones REELLEMENT rendues dans le DOM, par leur attribut `data-zone`.
 *  On ignore `bandeau` (rendu ailleurs), `etiquetteAmbiance` (titre de la zone `ambiances`,
 *  qui voyage avec elle) et `touteLaMaison` (fixe en bas, collée par `margin-top: auto`). */
function zonesRendues(racine: HTMLElement): string[] {
  const mobiles = ['synthese', 'blocCentral', 'ambiances', 'commandes'];
  return Array.from(racine.querySelectorAll('[data-zone]'))
    .map((e) => e.getAttribute('data-zone')!)
    .map((z) => (z === 'rangeeAmbiance' ? 'ambiances' : z))
    .filter((z) => mobiles.includes(z));
}

describe('rendreCorps — assembleur de zones', () => {
  it('rend les zones dans l ordre du defaut quand rien n est declare', () => {
    // La cuisine rend les quatre zones mobiles : trois ambiances, un bloc central (repas),
    // quatre commandes, une synthèse à cinq entrées. Ordre vérifié dans le gabarit (`corps.ts`,
    // 2026-09-12) : ambiances, PUIS commandes, PUIS le bloc central, PUIS la synthèse — pas
    // l'ordre qu'une première lecture du brief de cette tâche annonçait.
    expect(zonesRendues(rendreDans(ECRANS.cuisine)))
      .toEqual(['ambiances', 'commandes', 'blocCentral', 'synthese']);
  });

  it('rend la synthese EN TETE quand l agencement le demande', () => {
    const racine = rendreDans(ECRANS.cuisine,
      { ...AGENCEMENT_DEFAUT, zones: ['synthese', 'ambiances', 'blocCentral', 'commandes'] });
    expect(zonesRendues(racine)[0]).toBe('synthese');
  });

  it('omet entierement une zone absente de la liste', () => {
    const racine = rendreDans(ECRANS.cuisine,
      { ...AGENCEMENT_DEFAUT, zones: ['blocCentral', 'commandes'] });
    expect(zonesRendues(racine)).not.toContain('synthese');
    expect(zonesRendues(racine)).not.toContain('ambiances');
  });

  it('garde le bandeau et Toute la maison hors de l ordre reglable', () => {
    const racine = rendreDans(ECRANS.cuisine, { ...AGENCEMENT_DEFAUT, zones: ['commandes'] });
    expect(racine.querySelector('[data-zone="touteLaMaison"]')).not.toBeNull();
  });

  /** Ronde de correction (relecture de la tâche 3) : l'assembleur clé ses zones PAR NOM. Sans clé,
   *  lit apparie les entrées d'un tableau par leur INDEX — le retrait d'une zone amont ferait
   *  glisser les suivantes d'un cran, et lit détruirait puis recréerait leur DOM. Avant cette
   *  tâche chaque zone occupait sa propre expression dans le gabarit, donc un emplacement fixe, et
   *  le bloc central SURVIVAIT au retrait de la rangée de commandes. Le rendu est le même dans les
   *  deux cas : c'est l'IDENTITÉ des nœuds qui était en jeu, et elle se perdait sans qu'aucun
   *  rendu ne la trahisse. Ce test la rend observable. */
  /** Relecture finale du plan 2 (I2). `rendreCorps` retombait sur le défaut PAR OBJET
   *  (`(agencement ?? AGENCEMENT_DEFAUT).zones`) : un agencement PARTIEL n'est pas `undefined`,
   *  donc `zones` l'était, et le `.map` levait `TypeError: Cannot read properties of undefined`.
   *  Le schéma déclarait cette donnée VALIDE (`$defs/agencement` n'avait aucun `required`) — elle
   *  ne l'est plus, mais le rendu doit dégrader quand même : c'est la règle que la tâche 4 a posée
   *  sur `combien` (le moteur de rendu ne fait pas d'écran blanc), et `modePrincipal` /
   *  `modulateursActifs` retombent déjà par champ. Le `as unknown as Agencement` est délibéré :
   *  le TYPE exige les trois champs — ce cas n'existe QUE si la donnée entre par une autre porte
   *  que TypeScript, c'est-à-dire par l'intégration du plan 3.
   *  Un `not.toThrow()` seul n'affirmerait rien (leçon de la relecture de la tâche 4) : la
   *  seconde assertion dit QUEL agencement a pris le relais. */
  it('degrade sur les zones du defaut quand l agencement en omet le champ, au lieu de lever', () => {
    const partiel = { blocDefaut: 'agenda' } as unknown as Agencement;
    expect(() => rendreDans(ECRANS.cuisine, partiel)).not.toThrow();
    expect(zonesRendues(rendreDans(ECRANS.cuisine, partiel))).toEqual(AGENCEMENT_DEFAUT.zones);
  });

  it('garde le meme noeud de bloc central quand une zone amont disparait', () => {
    const racine = document.createElement('div');
    const rendre = (zones: Zone[]) => render(
      rendreCorps(new Etat(), ECRANS.cuisine, BLOC_CENTRAL_FACTICE, undefined, undefined,
                  false, false, { ...AGENCEMENT_DEFAUT, zones }), racine);
    rendre(['commandes', 'blocCentral']);
    const avant = racine.querySelector('[data-zone="blocCentral"]');
    expect(avant).not.toBeNull();
    rendre(['blocCentral']);
    expect(racine.querySelector('[data-zone="blocCentral"]')).toBe(avant);
  });
});
