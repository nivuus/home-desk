/** The screens the tablet shows when it can NOT show the requested screen.
 *
 *  policy: allow-fr-file — this module is the tablet's user-facing French copy: its screens are
 *  multi-line French template literals rendered verbatim on the wall, which the English checker
 *  cannot recognise as strings. Every comment and identifier here is nonetheless in English.
 *
 *  Rule set by correction round 1 and never relaxed since: no degradation ever leaves `#app`
 *  empty. A blank wall on a wall screen tells nothing to whoever walks by, and gives no handle
 *  for understanding.
 *
 *  Rule specific to this module: EVERY FAILURE screen names an ACTION. Describing a failure
 *  without saying what to do is the "dead button in prose" this project forbids itself — and its
 *  most costly case is `integrationAbsente()`: before it existed, a fresh install fell onto
 *  `startupError()`, which sent the user off to debug the network when Home Assistant had
 *  answered instantly and correctly.
 *
 *  A named exception, not a forgotten one: `ecranEnAttente()` names no action, on purpose. It
 *  is not a failure but a transient state that resolves by itself as soon as Home Assistant's
 *  answer arrives — asking someone for an action while a load is in progress would be absurd. A
 *  rule stated as absolute and false for one case out of NINE would itself be prose that lies —
 *  corrected in the final branch review: this module exports EIGHT screen functions
 *  (`sessionAbsente`, `startupError`, `ecranEnAttente`, `aucunEcranConfigure`, `choisirEcran`,
 *  `versionRefusee`, `configIllisible`, `integrationAbsente`), plus a NINTH one rendered INLINE
 *  in `ecranDeLaPanne` (the `'introuvable'` case, "Écran inconnu") — nine fallback screens in
 *  all, not seven.
 *
 *  These functions are PURE: they return a template, do not touch the DOM, call no transport.
 *  `demarrage.ts` wires them. Two of them (`sessionAbsente`, `startupError`) come from
 *  `demarrage.ts` and arrive here WITH THEIR TEXT INTACT: a move that rewrites what it moves is
 *  a modification disguised as tidying up. */
import { html, type TemplateResult } from 'lit';
import type { ListEntry, Panne } from '../configuration';

/** With no HA session open on the tablet, we explain rather than display blank. */
export function sessionAbsente(): TemplateResult {
  return html`<div class="cap"><div class="heure">Session</div>
    <div class="phrase">Ouvre Home Assistant sur cette tablette et connecte-toi,
    puis recharge cette page.</div></div>`;
}

/** `connecter()` can fail well after "no token at all": `rafraichir()` throws if HA refuses the
 *  refresh token (revoked) or if the network drops at the wrong moment — which happens all the
 *  more since the HA server is also the house's Wi-Fi access point. Without a dedicated screen,
 *  `render()` never happens and `#app` stays empty: a blank wall, without any clue, for whoever
 *  walks by. */
export function startupError(): TemplateResult {
  return html`<div class="cap"><div class="heure">Connexion impossible</div>
    <div class="phrase">L'écran n'arrive pas à joindre la maison. Ça peut venir du réseau ou
    de la session : une nouvelle tentative va avoir lieu automatiquement. Si ça persiste,
    réouvre Home Assistant sur cette tablette et reconnecte-toi.</div></div>`;
}

/** The HONEST waiting screen of decision 10: the configuration arrives over the network, so
 *  there is a moment when we have nothing to show. We say so, we name the requested screen —
 *  which makes a wrong URL visible right away — and we hide nothing behind a local cache. */
export function ecranEnAttente(nom: string): TemplateResult {
  return html`<div class="cap"><div class="heure">${nom}</div>
    <div class="phrase">Chargement de la configuration depuis Home Assistant…</div></div>`;
}

/** Second degradation. Distinct from "HA unreachable" ON PURPOSE: here Home Assistant did
 *  answer, it simply has no screen. Talking about the network would be wrong advice. */
export function aucunEcranConfigure(): TemplateResult {
  return html`<div class="cap"><div class="heure">Aucun écran configuré</div>
    <div class="phrase">Ouvre Home Assistant, puis Paramètres &gt; Appareils et services &gt;
    Tablettes murales, et ajoute un écran.</div></div>`;
}

/** First degradation: `?ecran=` missing or unknown. A TAPPABLE list, never a blank wall nor a
 *  guessed screen.
 *
 *  Each entry is a plain `?ecran=<nom>` link: no JavaScript, so nothing that can fail on a
 *  Fire 7's WebView, and a navigation that Fully Kiosk handles like any other.
 *
 *  `nom` and `titre` are TWO distinct fields: `nom` is the transport's primary key (matched
 *  EXACTLY by `websocket.py`, `_trouver`), `titre` is `ConfigSubentry.title`, which the user
 *  can rename on their own from the integration page. We NAVIGATE to the name and DISPLAY the
 *  title; mixing them up would send to a screen that cannot be found as soon as they diverge.
 *
 *  Empty list: we fall back to the second degradation, which says where to go to create one.
 *  Offering "choose" in front of zero choices would be a dead menu. */
export function choisirEcran(entrees: ListEntry[]): TemplateResult {
  if (entrees.length === 0) return aucunEcranConfigure();
  return html`<div class="cap"><div class="heure">Quel écran ?</div>
    <div class="phrase">Touche le nom de cette tablette.</div>
    <ul class="choix">${entrees.map((e) => html`<li>
      <a href="?ecran=${encodeURIComponent(e.nom)}">${e.titre}</a></li>`)}</ul></div>`;
}

/** Fourth degradation, first face: the stored subentry carries a `version` this component does
 *  not recognise, or carries none. A CLEAN refusal, never a half-done render. */
export function versionRefusee(nom: string): TemplateResult {
  return html`<div class="cap"><div class="heure">Configuration illisible</div>
    <div class="phrase">La configuration de «&nbsp;${nom}&nbsp;» a été écrite par une autre
    version de l'intégration Tablettes murales. Mets à jour l'intégration, ou recrée cet écran
    depuis Paramètres &gt; Appareils et services &gt; Tablettes murales.</div></div>`;
}

/** Fourth degradation, second face: the version is right but the content no longer honours the
 *  contract. Distinct from the previous one — the action is not the same, and the component
 *  paid three rounds for these two refusals to carry different codes. */
export function configIllisible(nom: string): TemplateResult {
  return html`<div class="cap"><div class="heure">Configuration invalide</div>
    <div class="phrase">La configuration de «&nbsp;${nom}&nbsp;» ne respecte plus le contrat.
    Corrige-la depuis Paramètres &gt; Appareils et services &gt; Tablettes murales, ou restaure
    une sauvegarde antérieure.</div></div>`;
}

/** FIFTH degradation, missing from the original spec.
 *
 *  When the integration is not installed, the command is not registered and it is Home
 *  Assistant's core that answers: `unknown_command`, message "Unknown command.", in English,
 *  which neither this repository nor its translations control. Without this screen, the app
 *  fell back onto `startupError()` — "it may come from the network or the session" — which is a
 *  LIE: HA answered, instantly, correctly. And it is the exact case of the first regression
 *  named by the spec: a fresh install no longer displays anything.
 *
 *  So it NEVER talks about the network, and a test demands it. */
export function integrationAbsente(): TemplateResult {
  return html`<div class="cap"><div class="heure">Intégration absente</div>
    <div class="phrase">L'intégration Tablettes murales n'est pas installée sur ce Home
    Assistant. Installe-la, puis ajoute un écran depuis Paramètres &gt; Appareils et
    services.</div></div>`;
}

/** The failure → screen table.
 *
 *  The `introuvable` case without a known list is handled here rather than by `choisirEcran`:
 *  when we know a named screen does not exist BUT could not get the list, offering an empty
 *  menu would be worse than saying which one was requested. When the list IS known, it is
 *  `demarrage.ts` that calls `choisirEcran` directly — it has the information, this table does
 *  not. */
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
    case 'reseau': return startupError();
  }
}
