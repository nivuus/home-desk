/** La carte média : le seul élément photographique de toute l'application (règle 2 de cohérence
 *  du spec — une seule image à l'écran, jamais deux, c'est ce qui en fait un point focal au lieu
 *  d'un bruit).
 *
 *  Deux textures, UN seul gabarit. L'affiche est un BONUS, pas la norme : YouTube n'en fournit
 *  aucune et c'est le cas le plus fréquent sur cette installation. Sans affiche, c'est la
 *  progression qui donne sa vie au bloc. La structure ne change pas d'un cas à l'autre — sinon la
 *  hauteur du bloc dépendrait de la source, ce que le budget de 585 px interdit. */
import { html, type TemplateResult } from 'lit';
import type { SourceResolue } from '../media';
import { fractionProgression } from '../progression';
import { icone } from './icones';

/** Rempli par la tâche 12 (`demarrage.ts`), même mécanique que `brancherAppui`
 *  (`rendu/corps.ts`) : `etat`/`cx` n'existent que dans la fermeture de `demarrer()`. */
let agir: (domaine: string, service: string, entite: string, donnees?: Record<string, unknown>) => void =
  () => {};
export function brancherMedia(fn: typeof agir) { agir = fn; }

function boutonTransport(nom: string, entite: string, service: string): TemplateResult {
  // `nom` (« precedent »/« pause »/« lecture »/« suivant ») est le nom de l'ICÔNE, donc déjà
  // l'identifiant fonctionnel du bouton — jamais deux boutons de transport ne portent le même
  // `nom` dans le même rendu (pause et lecture sont mutuellement exclusifs, cf. leur appelant),
  // et il ne dépend d'aucun index de tableau.
  return html`<div class="media-bouton" data-mvt="detail:tr-${nom}"
    @pointerdown=${() => agir('media_player', service, entite)}>${icone(nom)}</div>`;
}

/** Revue tâche 15, mineur M3 — INJECTION CSS. `entity_picture` vient de Home Assistant et
 *  atterrissait tel quel dans `style="background-image:url('…')"` : une simple apostrophe dans
 *  l'URL refermait la chaîne et laissait écrire n'importe quelle déclaration CSS derrière
 *  (`');opacity:0;--x:('`). `lit` n'échappe RIEN dans un attribut — il n'y a que de la
 *  concaténation de texte à cet endroit — et la valeur n'est pas maîtrisée : elle peut venir
 *  d'une intégration tierce, d'un nom de fichier d'affiche, d'un `media_content_id`.
 *
 *  `encodeURI` a été essayé et ÉCARTÉ, défaut trouvé par le test et non supposé : il encode `%`
 *  en `%25`, donc il abîme toute URL déjà percent-encodée — `/local/Mon%20affiche.png` devenait
 *  `/local/Mon%2520affiche.png`, une affiche qui ne charge plus. C'est exactement le genre de
 *  durcissement qui casse en silence ce qu'il prétend protéger.
 *
 *  On encode donc UNIQUEMENT ce qui peut sortir de `url('…')` dans un attribut `style` : les deux
 *  guillemets, les parenthèses, la contre-oblique (l'échappement CSS, qui neutraliserait le
 *  suivant) et tout caractère blanc — un saut de ligne coupe une chaîne CSS aussi sûrement qu'une
 *  apostrophe. Le reste est laissé intact (`%`, `&`, `?`, `=`, `/`, les accents) : l'URL reste
 *  valide, et une URL déjà percent-encodée n'est pas ré-encodée. Le percent-encodage produit est
 *  relu par le serveur comme le caractère d'origine, donc une affiche dont le nom contient une
 *  apostrophe continue de charger — on durcit sans casser. */
export function urlSure(u: string): string {
  return String(u).replace(/['"()\\]|\s/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

export function rendreCarteMedia(
  s: SourceResolue,
  // Revue tâche 15 (I1) : l'horloge murale, reçue en paramètre et jamais lue implicitement (même
  // discipline que `rendreBandeau`). Elle sert à rattraper le temps écoulé depuis le relevé de
  // `media_position` par Home Assistant, pour que le PREMIER coup de peinture soit déjà juste ;
  // c'est ensuite `demarrage.ts` qui fait avancer `--progression` seconde par seconde, sur
  // l'horloge monotone (cf. `progression.ts`). Valeur par défaut pour ne pas casser les appelants
  // existants — seul `demarrage.ts` la fournit réellement.
  maintenantMs: number = Date.now(),
): TemplateResult {
  const fraction = fractionProgression(s.progression, maintenantMs);
  const t = s.transport;
  const v = s.volume;
  // Tâche 7 (moteur de mouvement) : le bloc entier est marqué `bloc:media`, clé fixe — c'est un
  // CHANGEMENT DE CONTENU sous la même clé (mutation) que le moteur doit croiser, jamais une
  // sortie suivie d'une entrée (cf. `comparer()`, `diff.ts`). `data-mvt-etat` porte le titre
  // affiché : c'est lui qui change d'un morceau à l'autre. `s.titre` reste vide pour un lecteur
  // qui ne publie aucune métadonnée (cf. `media.ts`) — replié sur `s.nom`, la source déclarée
  // (stable), pour qu'un changement DE SOURCE sans titre (ex. TV allumée sans musique) compte
  // quand même comme un changement d'état plutôt que de rester figé sur une chaîne vide.
  return html`
    <div class="media ${s.affiche ? 'avec-affiche' : ''}" style="--progression:${fraction}"
      data-zone="blocCentral" data-mvt="bloc:media" data-mvt-etat=${s.titre || s.nom}>
      ${s.affiche
        // Couche de fond, jamais un <img> dans le flux : un élément remplacé participerait à la
        // mise en page et ferait varier la hauteur du bloc avec les proportions de l'affiche.
        // `background-size: cover` est posé en CSS, pas ici.
        ? html`<div class="media-affiche" style="background-image:url('${urlSure(s.affiche)}')"></div>`
        : ''}
      <div class="media-texte">
        <div class="t">EN COURS</div>
        <div class="v deux-lignes">${s.titre}</div>
        ${s.sousTitre
          ? html`<div class="media-sous" data-mvt="detail:media-sous">${s.sousTitre}</div>` : ''}
      </div>
      <div class="media-rangee">
        <div class="media-transport">
          ${t?.peutPrecedent ? boutonTransport('precedent', t.entite, 'media_previous_track') : ''}
          <!-- Correctif important (revue tâche 6) : PAUSE et PLAY sont deux bits distincts (cf.
               CAP, media.ts) — un lecteur peut déclarer l'un sans l'autre. Le bouton « pause »
               n'apparaît qu'en lecture ET si peutPause, le bouton « lecture » qu'à l'arrêt ET si
               peutLecture : jamais un bouton posé sur la seule autre capacité. -->
          ${t?.enLecture && t.peutPause ? boutonTransport('pause', t.entite, 'media_pause')
            : t && !t.enLecture && t.peutLecture ? boutonTransport('lecture', t.entite, 'media_play')
            : ''}
          ${t?.peutSuivant ? boutonTransport('suivant', t.entite, 'media_next_track') : ''}
        </div>
        <div class="media-volume">
          ${v && !v.parPas
            // Niveau connu : un rail réglable. `--niveau` pilote le remplissage en CSS, sans
            // recalcul de mise en page.
            ? html`<div class="media-rail" data-mvt="detail:volume-rail"
                     style="--niveau:${v.niveau ?? 0}"
                     @pointerdown=${(ev: PointerEvent) => {
                       const el = ev.currentTarget as HTMLElement;
                       const r = el.getBoundingClientRect();
                       const n = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
                       // Retour optimiste (correctif revue tâche 6, même principe que
                       // `interaction.ts`/`geste.ts` ailleurs dans le projet) : `--niveau` est
                       // réécrit sur l'élément IMMÉDIATEMENT, avant l'appel de service — sans ça,
                       // rien ne bouge à l'écran tant que Home Assistant n'a pas répondu. Un
                       // simple `pointerdown` suffit ici (pas de suivi de glissement complet, le
                       // brief ne le prévoyait pas).
                       el.style.setProperty('--niveau', String(n));
                       agir('media_player', 'volume_set', v.entite, { volume_level: n });
                     }}></div>`
            : v
            // Niveau inconnu : deux boutons. JAMAIS une jauge remplie à une valeur inventée — la
            // même règle que `jauge.ts` applique pour une lumière éteinte (jauge vide plutôt que
            // le dernier niveau connu).
            ? html`
              <div class="media-pas" data-mvt="detail:volume-moins"
                   @pointerdown=${() => agir('media_player', 'volume_down', v.entite)}>−</div>
              <div class="media-pas" data-mvt="detail:volume-plus"
                   @pointerdown=${() => agir('media_player', 'volume_up', v.entite)}>+</div>`
            : ''}
        </div>
      </div>
    </div>`;
}
