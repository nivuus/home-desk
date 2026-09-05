/** Retour tactile au contact. Ces tablettes (Amazon Fire 7) n'ont aucun moteur de vibration —
 *  vérifié — donc le seul accusé de réception possible à un appui est visuel, et il doit être
 *  immédiat : sur Zigbee ou Matter, Home Assistant met une à trois secondes à confirmer un
 *  changement d'état, ce qui se lit sinon comme un appui raté et pousse à réappuyer, parfois en
 *  annulant ce qu'on venait de faire. La tuile prend donc l'état visé *avant* toute réponse de
 *  HA (`etat.optimiste`) ; si rien ne confirme au bout de trois secondes, elle revient à l'état
 *  réel (`etat.confirme`, qui rend toujours la main à un état venu de HA — cf. `etat.ts`). */
import type { Etat } from './etat';
import type { Bouton } from './pieces';

/** On ne dépend que de ce dont on a besoin (`appelerService`), jamais de la classe concrète
 *  `Connexion` : ses champs privés la rendraient impossible à satisfaire par un double de test
 *  léger (`{ appelerService: vi.fn() }`), ou par `ConnexionLike` (l'interface plus restreinte
 *  que `demarrage.ts` utilise pour ne pas dépendre d'un vrai WebSocket) tant qu'elle n'exposait
 *  pas ce membre — c'est d'ailleurs elle qui étend ce type pour l'exposer. */
export type ConnexionAppelable = {
  appelerService(domaine: string, service: string, donnees: Record<string, unknown>): void;
};

const TOLERANCE_MS = 3000;

/** Domaines qui ont réellement une notion binaire marche/arrêt, avec le vocabulaire `on`/`off` —
 *  seuls domaines dont `turn_on`/`turn_off`/`toggle` visent un état représentable. Ronde de
 *  correction 1 : la première version énumérait l'inverse (les domaines SANS état marche/arrêt,
 *  scène en tête) et laissait tout le reste — y compris `cover`, dont les états sont
 *  `open`/`closed`/`opening`/`closing`, jamais `on`/`off` — retomber sur le traitement
 *  générique, qui lui aurait donc visé `'on'` pour `cover.rideau_cuisine`, une valeur qu'aucun
 *  volet ne prend jamais. Énumérer ce qui EST sûr, plutôt que ce qui ne l'est pas, rend un
 *  domaine oublié neutre par défaut (aucun état visé) au lieu d'inventé. */
// Tâche 19 (2026-08-03) : `fan` rejoint la liste, avec les deux tuiles de ventilation ajoutées à
// la cuisine et au bureau. Un `fan.*` de Home Assistant est bien `on`/`off` (FanEntity, vérifié
// sur `fan.purificateur_air` et `fan.chambre_ventilateur_tour` par lecture de l'API) : un `toggle`
// y vise donc un état réellement représentable. Sans cette entrée, ces deux tuiles auraient basculé
// sans AUCUN retour optimiste — le libellé serait resté sur l'ancien état une à trois secondes, le
// temps que HA confirme, c'est-à-dire l'appui qui semble ignoré que ce projet existe pour supprimer.
const DOMAINES_MARCHE_ARRET = new Set(['light', 'switch', 'fan']);

/** L'état visé par un appui, déduit du couple [domaine, service] du bouton — jamais de son
 *  entité seule. Le domaine compte autant que le service : un `turn_on` sur `light` vise `on`,
 *  mais le même `turn_on` sur un domaine absent de `DOMAINES_MARCHE_ARRET` (scène, volet...) ne
 *  vise rien. */
export function etatVise(actuel: string, service?: [string, string]): string {
  if (!service) return actuel;
  const [domaine, action] = service;
  if (!DOMAINES_MARCHE_ARRET.has(domaine)) return actuel;
  if (action === 'turn_on') return 'on';
  if (action === 'turn_off') return 'off';
  if (action === 'toggle') return actuel === 'on' ? 'off' : 'on';
  return actuel;
}

export function creerAppui(
  etat: Etat, cx: ConnexionAppelable, minuteur: typeof setTimeout,
  // Tâche 9, ronde de correction 1 (retour du coordinateur, IMPORTANT) : sans ce garde, un appui
  // sur une commande — au premier chef « Serrure » dans la vue « Toute la maison », l'écran qui
  // en propose neuf — pendant une panne de connexion silencieuse (`horsLigne`, cf.
  // `demarrage.ts`) posait quand même l'état optimiste. La tuile passait à « verrouillée »
  // immédiatement (c'est tout le sens de la tâche 7), alors que rien n'était parti vers HA ;
  // trois secondes plus tard elle revenait en arrière, sur un écran que la personne aura déjà
  // quitté en croyant sa porte fermée. Le retour optimiste — construit pour rassurer — jouait
  // alors contre nous. Choix : EMPÊCHER (aucun optimisme, aucun appel de service) ET SIGNALER
  // (bandeau/étiquette « hors ligne » sur les trois écrans, cf. `rendu/corps.ts`,
  // `rendu/nuit.ts`, `rendu/maison.ts`) plutôt que l'un seul des deux — empêcher élimine le
  // danger même si personne ne lit le bandeau (l'écran est mural, peu regardé) ; signaler évite
  // qu'un écran qui refuse tout sans un mot passe pour un écran cassé. Par défaut toujours
  // `false` (jamais hors ligne) : seul `demarrage.ts` construit la vraie fermeture vivante sur
  // son état `horsLigne`, les autres appelants (tests, `Toute la maison` isolée) restent
  // inchangés.
  estHorsLigne: () => boolean = () => false,
): (etat: Etat, b: Bouton) => void {
  // Un minuteur de retour arrière en attente, par entité. Ronde de correction 1 (troisième
  // récidive de ce type de bug dans ce projet, à chaque fois par une porte différente) : sans
  // cette table, des appuis rapprochés sur la MÊME entité — l'utilisateur qui réappuie parce que
  // rien ne semblait avoir bougé, exactement le symptôme que cette tâche corrige — empilaient un
  // minuteur par appui, aucun n'annulant le précédent. Sans confirmation HA (coordinateur
  // Zigbee muet, ce qui arrive dans cette maison), chacun s'exécutait à son tour, chacun reposant
  // un état optimiste qui rendait le suivant « non confirmé » à son tour : la tuile pouvait
  // basculer plusieurs fois, toute seule, dans les secondes suivant le dernier appui. Annuler
  // systématiquement le minuteur précédent pour la même entité avant d'en armer un nouveau
  // garantit qu'au plus un seul reste vivant à tout instant — celui du dernier appui.
  const enAttente = new Map<string, ReturnType<typeof setTimeout>>();

  return (_etatAuMomentDuBranchement, b) => {
    // Tâche 6 (2026-08-17) : navigation interne (« Recette ») — AVANT `lien` et avant tout
    // `service` : aucun appel HA, aucun optimisme, aucun garde hors ligne. Consulter une recette
    // reste possible quand la maison ne répond plus, contrairement à une vraie commande.
    // Décision 8 (2026-09-05) : une commande qui NOMME son absence est rendue
    // INERTE tant que son entité est muette. Elle est visible pour DIRE qu'une
    // fonction manque ; l'ouvrir mènerait à une sous-vue vide, ce qui serait un
    // cul-de-sac de plus, pas une information. Placé avant `vue`/`lien`/`service`
    // : c'est le seul point de passage de tout appui.
    if (b.absenceNommee !== undefined && !etat.estUtilisable(b.entite)) return;

    if (b.vue) { location.hash = b.vue; return; }

    // Tâche 8 bis : un bouton `lien` (le panneau `home_stock`...) ouvre une page autonome plutôt
    // que d'appeler HA — traité avant tout le reste, avec un retour immédiat. Il n'y a jamais
    // rien à rendre optimiste ni à confirmer pour une simple navigation : ces boutons n'ont
    // d'ailleurs pas de `service` (cf. `pieces.ts`), donc rien ne serait armé de toute façon,
    // mais le retour anticipé le dit explicitement plutôt que de compter sur cette coïncidence.
    if (b.lien) { location.href = b.lien; return; }

    // Une tuile purement informative (pas de `service`, ex. le statut chauffage) n'agit sur
    // rien : rien à empêcher, elle reste consultable hors ligne. Seules les actions réelles sont
    // refusées — `Connexion.appelerService` les aurait de toute façon avalées en silence sur un
    // websocket fermé (cf. `connexion.ts`), mais s'y risquer donnerait à tort l'impression
    // qu'une tentative a eu lieu, et poserait un optimisme qui reviendrait en arrière tout seul.
    if (b.service && estHorsLigne()) return;

    const avant = etat.lire(b.entite)?.etat ?? 'unknown';
    const vise = etatVise(avant, b.service);
    if (vise !== avant) etat.optimiste(b.entite, vise);
    // `cible` (tâche 5, 2026-08-02) : Porte et Rideau du salon AFFICHENT l'état de
    // `lock.*`/`cover.*` mais APPELLENT un script. L'optimisme, lui, continue de porter sur
    // `b.entite` — un `script.turn_on` n'a pas d'état exploitable, et c'est bien la serrure
    // qu'on veut voir changer sous le doigt.
    if (b.service) cx.appelerService(b.service[0], b.service[1], { entity_id: b.cible ?? b.entite });

    const precedent = enAttente.get(b.entite);
    if (precedent !== undefined) { clearTimeout(precedent); enAttente.delete(b.entite); }

    // Rien à confirmer : soit le bouton n'a pas de service (tuile informative), soit son
    // domaine n'a pas d'état marche/arrêt (une scène, un volet...). Armer un minuteur ici ne
    // changerait jamais rien (`etat.confirme` rendrait toujours vrai, faute d'optimisme posé),
    // mais laisserait tourner un minuteur pour rien sur un écran qui en pose déjà beaucoup.
    if (vise === avant) return;

    const idMinuteur = minuteur(() => {
      enAttente.delete(b.entite);
      // Un état confirmé entre-temps a effacé la marque d'optimisme : on ne touche à rien.
      if (!etat.confirme(b.entite)) etat.optimiste(b.entite, avant);
    }, TOLERANCE_MS);
    enAttente.set(b.entite, idMinuteur);
  };
}
