/** Distinction appui / glissement sur les tuiles à jauge (tâche 13). Complète `interaction.ts`
 *  (le tap optimiste) SANS y toucher : `creerGeste` se place EN AMONT de la bascule, uniquement
 *  sur les tuiles qui exposent une jauge (`descripteurJauge`, `jauge.ts`) — luminosité, consigne
 *  de chauffage, position de rideau, volume média — et retarde ou annule l'appel de bascule selon
 *  que le doigt a glissé ou non.
 *
 *  POURQUOI l'action attend le relâchement ICI, alors qu'elle reste immédiate PARTOUT ailleurs
 *  (`interaction.ts`, toute tuile sans jauge) — le compromis central de cette tâche, à comprendre
 *  avant de toucher à ce fichier :
 *
 *  Ce projet existe parce que le navigateur attendait de savoir si un appui allait glisser avant
 *  de le valider ; supprimé en agissant dès le contact (`pointerdown`, cf. docstring
 *  `interaction.ts`) — la tablette répond enfin bien. Ajouter un glissement À RÉGLER rouvre
 *  exactement cette question, à l'envers : si la bascule partait dès `pointerdown` comme avant,
 *  TOUT glissement destiné à régler une valeur ferait D'ABORD basculer la lumière/le rideau
 *  (l'ancien comportement de toggle), avant même que le doigt n'ait bougé assez pour qu'on sache
 *  qu'il visait un réglage plutôt qu'un appui. La seule façon de ne PAS agir à tort est de savoir
 *  — ce qui n'est prouvé qu'après un déplacement suffisant, ou au relâchement s'il n'y en a jamais
 *  eu.
 *
 *  Le compromis retenu sépare deux choses qui étaient confondues avant cette tâche : la COUCHE
 *  VISUELLE (`:active`, `base.css`) reste peinte par le moteur de rendu dès le contact, EXACTEMENT
 *  comme avant — c'est du CSS pur, ce fichier ne la touche ni ne peut la retarder — c'est elle qui
 *  fait *sentir* la tuile réagir instantanément. Mais la BASCULE (l'appel de service `toggle`)
 *  n'est postée qu'au relâchement, et seulement si le doigt n'a jamais dépassé le seuil de
 *  glissement entre-temps. Un doigt qui tremble de quelques pixels reste un appui ; un doigt qui
 *  glisse de plus de quelques millimètres devient un réglage, définitivement, pour tout le reste
 *  du geste.
 *
 *  Une tuile SANS jauge (`descripteurJauge` rend `null`) n'a rien à distinguer : elle garde le
 *  comportement d'origine, bascule dès `pointerdown`, sans jamais entrer dans la machine à états
 *  ci-dessous — c'est ce qui rend cette tâche sans risque pour les tuiles qui n'ont pas de jauge
 *  (scènes, verrou, aspirateur, liens externes...), qui composent la grande majorité des tuiles de
 *  l'app. */
import type { Etat } from './etat';
import type { ConnexionAppelable } from './interaction';
import { descripteurJauge, valeurDepuisDeplacement, fractionJauge, type DescripteurJauge } from './jauge';
import { minuteurFnParDefaut } from './minuteurs';

// 1 px CSS ≈ 1/96 pouce (0,2646 mm) — définition du « pixel de référence » CSS (device-
// independent pixel), ancrée sur une distance de lecture de référence, PAS sur la densité
// physique réelle d'un écran donné : c'est justement le rôle de `devicePixelRatio` (calculé par
// le moteur de rendu à partir de la densité réelle du panneau) de maintenir cette équivalence,
// quel que soit l'appareil. Un seuil exprimé en mm se convertit donc en px CSS SANS avoir besoin
// de connaître le DPI physique de cette tablette précise — jamais mesuré sur le terrain, et pas
// mesurable à distance — le calcul est correct par construction du standard CSS, pas par une
// mesure de ce matériel.
//
// 8 mm : nettement plus qu'un tremblement de doigt sur une dalle murale tenue à distance
// (quelques pixels de bruit), mais une fraction seulement de la largeur d'une tuile — un geste
// qui VISE un réglage franchit ce seuil dans le premier centimètre de son mouvement, sans délai
// perceptible pour qui glisse franchement.
// 3 mm : franchement au-dessus du tremblement d'un doigt posé, mais atteignable sans un grand
// geste. 8 mm (valeur d'origine) faisait ~30 px CSS, soit près de 20 % de la largeur d'une tuile :
// sur la tablette réelle, le seuil n'était quasiment jamais franchi et TOUT geste retombait en
// simple appui — la lampe s'allumait à 100 % puis s'éteignait au geste suivant (retour du
// propriétaire, 2026-08-02).
const SEUIL_MM = 3;
export const SEUIL_PX = Math.round(SEUIL_MM / 0.2646);

// Fréquence maximale d'appel de service PENDANT un glissement (l'envoi final au relâchement,
// `relacher()` ci-dessous, est TOUJOURS garanti, throttle ou pas). `pointermove` part au rythme
// de rafraîchissement de la dalle (jusqu'à ~60/s) : envoyer un appel de service HA à cette cadence
// saturerait Zigbee/Matter pour un simple réglage un peu rapide — la même classe de panne que
// « SRSP - AF - dataRequest after 6000ms » déjà vue sur ce coordinateur pendant un OTA (cf.
// CLAUDE.md du dépôt HA). Débit limité par comparaison d'horodatages, PAS par minuteur : ce
// throttle-là n'arme lui-même aucun `setTimeout`/`setInterval` — contrainte explicite du brief,
// prouvée par `tests/geste.test.ts` (compte de minuteurs vivants avant/après un glissement long).
// (Le verrou par tuile ci-dessous, lui, pose un minuteur de secours distinct — cf. `DELAI_SECOURS_MS`
// — mais un seul à la fois par geste, toujours nettoyé, jamais empilé : mêmes tests.)
const INTERVALLE_MIN_MS = 150;

// Ronde de correction 4 (relecture de rattrapage, 2026-08-02) : filet de sécurité pour le verrou
// par tuile (cf. `gestesActifs` plus bas). Un `pointerup`/`pointercancel` peut ne jamais arriver
// — doigt qui sort par le bord de l'écran, évènement perdu par le WebView, page redessinée
// pendant le mouvement — auquel cas rien ne nettoierait jamais le verrou de CETTE tuile sans ce
// minuteur : elle resterait bloquée jusqu'au rechargement de la page (elle seule avec le verrou
// par tuile ; avec l'ancien verrou global, c'était TOUTE l'application qui gelait). 5 s : trois
// fois la tolérance de confirmation HA (`TOLERANCE_MS`, `interaction.ts`) — largement au-delà de
// la durée d'un vrai geste de réglage au doigt, donc jamais atteint pendant un glissement normal,
// mais pas si long qu'une tuile réellement coincée reste inutilisable une minute.
export const DELAI_SECOURS_MS = 5_000;

/** Fabrique le dispatcher partagé par les trois points d'attache (`rendu/corps.ts` pour les
 *  commandes ET le bloc média, `rendu/maison.ts` pour la vue « Toute la maison ») — une seule
 *  instance, comme `creerAppui` (même raison : pas de table de minuteurs/throttle dédoublée pour
 *  une même entité visible sur deux écrans). `surBascule` est la bascule déjà construite par
 *  l'appelant (typiquement `() => appuyer(etat, b)`, où `appuyer` est le retour de `creerAppui`) —
 *  ce fichier ne sait rien de `Bouton` ni de `etatVise`, il décide seulement QUAND l'appeler. */
export function creerGeste(
  etat: Etat, cx: ConnexionAppelable, estHorsLigne: () => boolean,
  // Horloge injectable : par défaut `Date.now`, jamais un minuteur — cf. docstring `INTERVALLE_MIN_MS`.
  maintenant: () => number = Date.now,
  // Minuteur injectable pour le filet de sécurité ci-dessous (`DELAI_SECOURS_MS`) — même patron
  // que `d.minuteurFn` dans `demarrage.ts`/`creerAppui` (`interaction.ts`) : par défaut
  // l'enveloppe qui appelle `setTimeout` en appel nu (cf. docstring `minuteurs.ts`), jamais un
  // `setTimeout` capturé ailleurs. `clearTimeout`, lui, n'a pas ce piège de récepteur (vérifié
  // contre Chromium, cf. `minuteurs.ts`) : appelé nu directement plus bas, comme partout ailleurs
  // dans ce projet (`interaction.ts`, `demarrage.ts`).
  minuteurFn: typeof setTimeout = minuteurFnParDefaut,
): (ev: PointerEvent, entite: string, surBascule: () => void) => void {
  // Ronde de correction 4 (relecture de rattrapage) : verrou PAR TUILE, plus un booléen unique
  // partagé par toute l'application. `creerGeste` n'est instancié qu'une seule fois pour tout le
  // programme (`demarrage.ts`, branché à la fois sur l'écran de pièce et sur « Toute la maison »)
  // : un simple booléen dans cette fermeture était donc UN SEUL verrou pour toutes les tuiles à
  // jauge de l'app entière. Preuve du relecteur : un geste démarré sur une tuile qui ne reçoit
  // jamais son relâchement (doigt sorti par le bord, évènement perdu, page redessinée pendant le
  // mouvement) bloquait ensuite TOUT `pointerdown` sur N'IMPORTE QUELLE AUTRE tuile, indéfiniment,
  // jusqu'au rechargement de la page — aucun filet de récupération n'existait. Une clé sur
  // l'élément DOM seul (→ minuteur de secours vivant) confine désormais un geste bloqué à SA SEULE
  // tuile ; combinée au minuteur de secours (`DELAI_SECOURS_MS`) posé plus bas, même cette
  // tuile-là se libère toute seule au bout de quelques secondes plutôt que de rester verrouillée
  // à vie.
  //
  // Ronde de correction 5 (2026-08-02) : la clé a d'abord été composée élément → pointerId, sur
  // la même relecture — erreur corrigée ici. Le WebView de ces tablettes n'émet pas seulement
  // plusieurs `pointerdown` pour un même contact physique, il le fait en réalité via un contact
  // FANTÔME parasite qui porte son PROPRE identifiant de pointeur, distinct de celui du doigt réel
  // (constaté avec `outils/verifier-rendu.mjs --auto-test`, injection d'un contact fantôme via
  // CDP à quelques pixels du contact réel — cf. `glisserAvecFantome`). Un verrou composé avec le
  // pointerId ne bloquait donc PAS ce fantôme : celui-ci ouvrait son propre geste, avec son propre
  // point de référence (`xDepart`/`valeurDepart`) et ses propres écouteurs, tous deux vivants et
  // concurrents sur la même tuile — le doigt réel envoyait la bonne valeur, puis le geste fantôme,
  // reparti de zéro, l'écrasait avec la sienne. La clé porte donc SEULEMENT l'élément : un
  // `pointerdown` supplémentaire sur une tuile où un geste est déjà en cours est ignoré quel que
  // soit son identifiant de pointeur — un seul geste actif par tuile, point.
  const gestesActifs = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  return (ev, entite, surBascule) => {
    const d = descripteurJauge(entite, etat);
    // Pas de jauge sur cette entité (domaine non concerné, entité muette, ou appareil qui ne
    // supporte pas le réglage, cf. `jauge.ts`) : comportement D'ORIGINE, inchangé — la bascule
    // part immédiatement au contact, comme avant cette tâche. La distinction appui/glissement
    // n'a aucun sens sans jauge à régler ; ne pas la faire ici est ce qui garde ce changement
    // sans risque pour toutes les tuiles qui n'en ont pas.
    if (!d) { surBascule(); return; }
    // TypeScript ne propage pas le rétrécissement de type de la garde ci-dessus jusque dans les
    // fermetures définies plus bas (limitation connue de l'analyse de flux à travers les
    // frontières de fonction, même piège que `jetons`/`tenter()` dans `demarrage.ts`) : `desc`
    // capture la valeur déjà garantie non nulle dans une constante à part.
    const desc: DescripteurJauge = d;
    // Même garde que `creerAppui` (`interaction.ts`) pour tout ce qui est un VRAI appel de
    // service : un glissement en est un au même titre qu'un appui, et doit être bloqué de la
    // même façon pendant une panne de connexion silencieuse — pas seulement l'appui simple. On
    // s'arrête ici, avant même `setPointerCapture`/l'armement des écouteurs : ni la couche
    // visuelle spécifique à la jauge, ni aucun appel réseau, ne doivent avoir lieu hors ligne.
    // (La couche `:active` générique, CSS pure, continue de réagir — ce fichier ne la commande
    // pas et ne peut donc pas la bloquer, ce qui est très exactement voulu : le contact reste
    // senti, seule l'action est empêchée.)
    if (estHorsLigne()) return;

    const cibleEl = ev.currentTarget as HTMLElement | null;
    if (!cibleEl) return;
    const el: HTMLElement = cibleEl;   // même raison que `desc` ci-dessus

    // Un `pointerdown` qui survient alors qu'un geste est DÉJÀ en cours SUR CETTE TUILE — quel
    // que soit son identifiant de pointeur, cf. ronde de correction 5 dans la docstring de tête
    // sur `gestesActifs` — est ignoré. Sans cette garde, chaque contact supplémentaire
    // réinitialisait le point de référence (`xDepart`), si bien que le déplacement mesuré restait
    // toujours proche de zéro : la valeur oscillait autour de son point de départ au lieu de
    // suivre le doigt, et une lampe réglée ainsi vers 10 % semblait clignoter. Constaté sur la
    // tablette réelle (relevé des appels de service, 2026-08-02) : le WebView émet plusieurs
    // `pointerdown` au cours d'un même glissement, dont un contact fantôme à identifiant de
    // pointeur DIFFÉRENT — d'où la clé sur l'élément seul, jamais un booléen partagé (global) ni
    // composée avec le pointerId (ne bloquerait pas le fantôme).
    if (gestesActifs.has(el)) return;

    const rect = el.getBoundingClientRect();
    const xDepart = ev.clientX;
    const yDepart = ev.clientY;
    let enReglage = false;
    let valeurDepart = desc.valeur;
    // Initialisé à MAINTENANT (pas 0) : le tout premier mouvement qui franchit le seuil compte
    // déjà comme un envoi potentiel du point de vue du throttle — sans ça, le passage sous 0
    // (une horloge réelle vaut ~1,7×10¹² ms) ferait toujours paraître « une éternité » s'être
    // écoulée depuis un `dernierEnvoi` à 0, et enverrait donc TOUJOURS immédiatement dès le
    // franchissement du seuil, quelle que soit la fréquence réelle des mouvements suivants —
    // exactement l'inverse d'un throttle. Faire partir la fenêtre du début du geste lisse aussi
    // le cas contraire : un simple contact qui franchit le seuil puis se fait immédiatement
    // interrompre (`pointercancel`, ex. un appel entrant) n'a pas le temps d'émettre quoi que ce
    // soit avant l'annulation, cf. `tests/geste.test.ts`.
    let dernierEnvoi = maintenant();
    // Mise à jour à CHAQUE mouvement (throttlé ou non) — jamais seulement dans `envoyer()`, qui
    // peut légitimement sauter un appel de service. Sans cette distinction, un envoi final
    // « garanti » au relâchement pouvait renvoyer une valeur PÉRIMÉE (celle du tout début du
    // geste, jamais mise à jour si tous les envois intermédiaires avaient été throttlés) plutôt
    // que la dernière position réellement choisie par le doigt — piège trouvé par
    // `tests/geste.test.ts` (« throttle... mais garantit toujours l'envoi final »).
    let derniereValeur = desc.valeur;

    // Filet de sécurité (cf. docstring `DELAI_SECOURS_MS`) : si aucun `pointerup`/`pointercancel`
    // n'arrive avant l'échéance, `annuler()` (définie plus bas, jamais d'envoi) est appelée comme
    // si le geste avait été annulé — elle nettoie aussi CE minuteur (voir `nettoyer()`), donc pas
    // de risque qu'il se redéclenche ni qu'il reste vivant après coup.
    const minuteurSecours = minuteurFn(() => annuler(), DELAI_SECOURS_MS);
    gestesActifs.set(el, minuteurSecours);

    const envoyer = (v: number, forcer: boolean) => {
      if (!forcer && maintenant() - dernierEnvoi < INTERVALLE_MIN_MS) return;
      dernierEnvoi = maintenant();
      const [domaine, service, donnees] = desc.appliquer(v);
      cx.appelerService(domaine, service, { entity_id: entite, ...donnees });
    };

    const peindre = (v: number) => {
      // Remplissage de fond direct (via la variable CSS `--jauge`, lue par `.jauge` dans
      // `base.css`) plutôt qu'un redessin complet de la page : un `pointermove` peut arriver
      // jusqu'à ~60 fois par seconde, largement plus vite que ce qu'un cycle de rendu complet de
      // toute la page devrait absorber sur une dalle/mémoire de tablette murale limitée. Le
      // prochain rendu complet (déclenché par une vraie confirmation HA, l'horloge des 20 s...)
      // recalculera `--jauge` depuis l'état réel et reprendra la main normalement.
      el.style.setProperty('--jauge', String(fractionJauge({ valeur: v, min: desc.min, max: desc.max })));
    };

    function deplacer(e: PointerEvent) {
      const dx = e.clientX - xDepart;
      const dy = e.clientY - yDepart;
      if (!enReglage) {
        // Sous le seuil : un tremblement de doigt ne fait pas basculer une tuile en mode
        // réglage — condition non négociable du brief. Distance euclidienne (pas seulement
        // horizontale) : un doigt qui tremble ne tremble pas forcément à l'horizontale.
        if (Math.hypot(dx, dy) < SEUIL_PX) return;
        // Bascule DÉFINITIVEMENT annulée pour ce geste, même si le doigt revient ensuite près de
        // son point de départ — une fois qu'on sait que c'est un réglage, ça le reste jusqu'au
        // relâchement (cf. docstring de tête : « pour tout le reste du geste »).
        enReglage = true;
        // Point de référence du déplacement relatif : RELU depuis l'état réel à l'instant du
        // franchissement, PAS `desc.valeur` (l'instantané figé au contact initial, capturé une
        // fois pour toutes ligne 130 et jamais rafraîchi depuis). Une écriture qui relisait
        // `desc.valeur` ici était un no-op qui donnait l'illusion d'un réancrage — la valeur
        // restait en réalité celle du tout premier contact. Ça compte : une automatisation peut
        // avoir changé la lampe entre le contact et le franchissement du seuil (l'éclairage
        // adaptatif touche les lampes dans cette maison, cf. CLAUDE.md), et le geste doit alors
        // partir de la valeur ACTUELLE, pas de celle d'il y a plusieurs centaines de millisecondes.
        // Exemple mesuré par le relecteur : lampe à 20 % au contact, montée à 90 % par
        // l'automatisation avant que le doigt n'ait bougé, puis +50 points de glissement — sans ce
        // rafraîchissement, la commande finale vaudrait 70 % (20+50) au lieu des 100 % (90+50,
        // borné au maximum) qu'un réglage parti de l'état réel doit produire.
        // `desc.min`/`desc.max`/`desc.pas`/`desc.appliquer` restent ceux du contact initial : ce
        // sont des constantes du domaine (ex. la plage 16-24 °C du chauffage), jamais des valeurs
        // d'instant qui pourraient se périmer de la même façon.
        // Repli sur `desc` si l'entité est devenue inexploitable entre-temps (indisponible,
        // supprimée) : `descripteurJauge` rend alors `null`, et il vaut mieux continuer sur la
        // dernière valeur connue que de casser le geste en cours.
        valeurDepart = (descripteurJauge(entite, etat) ?? desc).valeur;
      }
      // Réglage RELATIF au point de contact, jamais absolu : la tuile n'est pas un curseur
      // dédié qu'on vise, c'est un bouton qu'on touche n'importe où. En absolu, poser le doigt
      // à droite d'une tuile puis bouger un peu faisait sauter la valeur à ~100 % — le doigt
      // n'ajustait pas, il téléportait (retour du propriétaire, 2026-08-02). En relatif, la
      // valeur part de celle qu'affichait la tuile et suit le déplacement : traverser toute la
      // largeur parcourt toute la plage.
      const v = rect.width > 0
        ? valeurDepuisDeplacement(desc, valeurDepart, dx, rect.width)
        : desc.valeur;
      derniereValeur = v;
      peindre(v);
      envoyer(v, false);
    }

    function nettoyer() {
      // `clearTimeout` en appel nu, jamais via une propriété injectée : aucun piège de récepteur
      // sur cette fonction contrairement à `setTimeout`/`setInterval` (cf. docstring
      // `minuteurFn` ci-dessus et `minuteurs.ts`), et c'est déjà comme ça que `interaction.ts`/
      // `demarrage.ts` l'appellent. Toujours nettoyé ici, sur TOUS les chemins de sortie du geste
      // (`relacher`, `annuler`, et l'expiration du minuteur lui-même via `annuler()`) : jamais de
      // minuteur de secours qui survivrait à son geste.
      clearTimeout(minuteurSecours);
      // Libère le verrou de CETTE tuile (cf. docstring `gestesActifs` en tête de fonction) —
      // jamais un booléen global qui aurait gelé toutes les autres, et jamais composé avec le
      // pointerId (ronde de correction 5 : ne bloquerait pas un contact fantôme à identifiant
      // différent).
      gestesActifs.delete(el);
      el.releasePointerCapture?.(ev.pointerId);
      el.removeEventListener('pointermove', deplacer);
      el.removeEventListener('pointerup', relacher);
      el.removeEventListener('pointercancel', annuler);
    }

    function relacher(_e: PointerEvent) {
      nettoyer();
      if (!enReglage) { surBascule(); return; }   // resté sous le seuil : un simple appui
      envoyer(derniereValeur, true);               // envoi final garanti, même si throttlé juste avant
    }

    function annuler() {
      nettoyer();
      // pointercancel (appel entrant, changement d'orientation, geste système...) : ni la
      // bascule ni le réglage ne sont conclus — mieux vaut une valeur qui ne bouge pas qu'une
      // action que personne n'a choisi de valider en relâchant. Le prochain rendu complet
      // effacera de toute façon le remplissage imprévu posé par `peindre()` pendant le geste.
    }

    // Capture de pointeur : continue de suivre le doigt même s'il sort du cadre de la tuile
    // pendant le glissement (règle explicite du brief). `?.` : jsdom (utilisé par les tests
    // unitaires de ce projet) n'implémente pas cette API — absente, jamais une erreur qui lève,
    // le geste reste fonctionnel en test via les écouteurs posés directement sur l'élément
    // (suffisant tant que le test dispatche ses événements sur ce même élément).
    el.setPointerCapture?.(ev.pointerId);
    el.addEventListener('pointermove', deplacer);
    el.addEventListener('pointerup', relacher);
    el.addEventListener('pointercancel', annuler);
  };
}
