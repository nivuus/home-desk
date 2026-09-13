/** Les écrans que la tablette montre quand elle ne peut PAS montrer l'écran demandé.
 *
 *  Règle posée par la ronde de correction 1 et jamais relâchée depuis : aucune dégradation ne
 *  laisse `#app` vide. Un mur blanc sur un écran mural ne dit rien à qui passe devant, et ne
 *  laisse aucune prise pour comprendre.
 *
 *  Règle propre à ce module : CHAQUE écran nomme un GESTE. Décrire une panne sans dire quoi
 *  faire est le « bouton mort en prose » que ce projet s'interdit — et son cas le plus coûteux
 *  est `integrationAbsente()` : avant qu'il existe, une installation neuve tombait sur
 *  `erreurDemarrage()`, qui envoyait déboguer le réseau alors que Home Assistant avait répondu
 *  instantanément et correctement.
 *
 *  Ces fonctions sont PURES : elles rendent un gabarit, ne touchent pas au DOM, n'appellent
 *  aucun transport. `demarrage.ts` les câble. Deux d'entre elles (`sessionAbsente`,
 *  `erreurDemarrage`) viennent de `demarrage.ts` et arrivent ici AVEC LEUR TEXTE INTACT : un
 *  déménagement qui réécrit ce qu'il déplace est une modification déguisée en rangement. */
import { html, type TemplateResult } from 'lit';
import type { EntreeListe, Panne } from '../configuration';

/** Sans session HA ouverte sur la tablette, on explique plutôt que d'afficher du blanc. */
export function sessionAbsente(): TemplateResult {
  return html`<div class="cap"><div class="heure">Session</div>
    <div class="phrase">Ouvre Home Assistant sur cette tablette et connecte-toi,
    puis recharge cette page.</div></div>`;
}

/** `connecter()` peut échouer bien après « pas de jeton du tout » : `rafraichir()` lève si HA
 *  refuse le jeton de rafraîchissement (révoqué) ou si le réseau coupe au mauvais moment — ce
 *  qui arrive d'autant plus que le serveur HA est aussi le point d'accès Wi-Fi de la maison.
 *  Sans écran dédié, `render()` n'a jamais lieu et `#app` reste vide : un mur blanc, sans
 *  indice, pour qui passe devant. */
export function erreurDemarrage(): TemplateResult {
  return html`<div class="cap"><div class="heure">Connexion impossible</div>
    <div class="phrase">L'écran n'arrive pas à joindre la maison. Ça peut venir du réseau ou
    de la session : une nouvelle tentative va avoir lieu automatiquement. Si ça persiste,
    réouvre Home Assistant sur cette tablette et reconnecte-toi.</div></div>`;
}

/** L'écran d'attente FRANC de la décision 10 : la configuration arrive par le réseau, donc il
 *  y a un instant où l'on n'a rien à montrer. On le dit, on nomme l'écran demandé — qui rend
 *  visible tout de suite une URL fautive — et on ne cache rien derrière un cache local. */
export function ecranEnAttente(nom: string): TemplateResult {
  return html`<div class="cap"><div class="heure">${nom}</div>
    <div class="phrase">Chargement de la configuration depuis Home Assistant…</div></div>`;
}

/** Deuxième dégradation. Distincte de « HA injoignable » À DESSEIN : ici Home Assistant a
 *  répondu, il n'a simplement aucun écran. Parler de réseau serait un conseil faux. */
export function aucunEcranConfigure(): TemplateResult {
  return html`<div class="cap"><div class="heure">Aucun écran configuré</div>
    <div class="phrase">Ouvre Home Assistant, puis Paramètres &gt; Appareils et services &gt;
    Tablettes murales, et ajoute un écran.</div></div>`;
}

/** Première dégradation : `?ecran=` absent ou inconnu. Une liste TAPABLE, jamais un mur blanc
 *  ni un écran deviné.
 *
 *  Chaque entrée est un simple lien `?ecran=<nom>` : aucun JavaScript, donc rien qui puisse
 *  échouer sur la WebView d'une Fire 7, et une navigation que Fully Kiosk traite comme
 *  n'importe quelle autre.
 *
 *  `nom` et `titre` sont DEUX champs distincts : `nom` est la clé primaire du transport
 *  (appariée EXACTEMENT par `websocket.py`, `_trouver`), `titre` est `ConfigSubentry.title`,
 *  que l'utilisateur peut renommer seul depuis la page d'intégration. On NAVIGUE vers le nom et
 *  on AFFICHE le titre ; les confondre enverrait vers un écran introuvable dès qu'ils divergent.
 *
 *  Liste vide : on retombe sur la deuxième dégradation, qui dit où aller en créer un. Proposer
 *  « choisis » devant zéro choix serait un menu mort. */
export function choisirEcran(entrees: EntreeListe[]): TemplateResult {
  if (entrees.length === 0) return aucunEcranConfigure();
  return html`<div class="cap"><div class="heure">Quel écran ?</div>
    <div class="phrase">Touche le nom de cette tablette.</div>
    <ul class="choix">${entrees.map((e) => html`<li>
      <a href="?ecran=${encodeURIComponent(e.nom)}">${e.titre}</a></li>`)}</ul></div>`;
}

/** Quatrième dégradation, premier visage : la sous-entrée stockée porte une `version` que ce
 *  composant ne reconnaît pas, ou n'en porte aucune. Refus NET, jamais un rendu à moitié. */
export function versionRefusee(nom: string): TemplateResult {
  return html`<div class="cap"><div class="heure">Configuration illisible</div>
    <div class="phrase">La configuration de «&nbsp;${nom}&nbsp;» a été écrite par une autre
    version de l'intégration Tablettes murales. Mets à jour l'intégration, ou recrée cet écran
    depuis Paramètres &gt; Appareils et services &gt; Tablettes murales.</div></div>`;
}

/** Quatrième dégradation, second visage : la version est bonne mais le contenu ne respecte
 *  plus le contrat. Distinct du précédent — le geste n'est pas le même, et le composant a payé
 *  trois rondes pour que ces deux refus portent des codes différents. */
export function configIllisible(nom: string): TemplateResult {
  return html`<div class="cap"><div class="heure">Configuration invalide</div>
    <div class="phrase">La configuration de «&nbsp;${nom}&nbsp;» ne respecte plus le contrat.
    Corrige-la depuis Paramètres &gt; Appareils et services &gt; Tablettes murales, ou restaure
    une sauvegarde antérieure.</div></div>`;
}

/** CINQUIÈME dégradation, absente de la spec d'origine.
 *
 *  Quand l'intégration n'est pas installée, la commande n'est pas enregistrée et c'est le cœur
 *  de Home Assistant qui répond : `unknown_command`, message « Unknown command. », en anglais,
 *  que ni ce dépôt ni ses traductions ne contrôlent. Sans cet écran, l'application retombait
 *  sur `erreurDemarrage()` — « ça peut venir du réseau ou de la session » — ce qui est un
 *  MENSONGE : HA a répondu, instantanément, correctement. Et c'est le cas exact de la première
 *  régression nommée par la spec : une installation neuve n'affiche plus rien.
 *
 *  Ne parle donc JAMAIS de réseau, et un test l'exige. */
export function integrationAbsente(): TemplateResult {
  return html`<div class="cap"><div class="heure">Intégration absente</div>
    <div class="phrase">L'intégration Tablettes murales n'est pas installée sur ce Home
    Assistant. Installe-la, puis ajoute un écran depuis Paramètres &gt; Appareils et
    services.</div></div>`;
}

/** La table panne → écran.
 *
 *  Le cas `introuvable` sans liste connue est traité ici plutôt que par `choisirEcran` : quand
 *  on sait qu'un écran nommé n'existe pas MAIS qu'on n'a pas pu obtenir la liste, proposer un
 *  menu vide serait pire que dire lequel a été demandé. Quand la liste EST connue, c'est
 *  `demarrage.ts` qui appelle directement `choisirEcran` — il a l'information, cette table
 *  ne l'a pas. */
export function ecranDeLaPanne(panne: Panne, nom: string): TemplateResult {
  switch (panne) {
    case 'introuvable':
      return html`<div class="cap"><div class="heure">Écran inconnu</div>
        <div class="phrase">«&nbsp;${nom}&nbsp;» n'est pas un écran configuré sur ce Home
        Assistant. Vérifie l'adresse de cette tablette, ou crée cet écran depuis Paramètres
        &gt; Appareils et services &gt; Tablettes murales.</div></div>`;
    case 'version': return versionRefusee(nom);
    case 'corrompu': return configIllisible(nom);
    case 'integrationAbsente': return integrationAbsente();
    case 'reseau': return erreurDemarrage();
  }
}
