import { FANTOMES_MAX } from './grammaire';
import type { Marque } from './marques';

export type Calque = {
  /** Clone le nœud sortant et le pose à sa place d'avant. Rend `null` quand le plafond est
   *  atteint : la sortie redevient alors sèche, ce qui est un désagrément, jamais une panne. */
  fantomer: (m: Marque) => HTMLElement | null;
  relacher: (f: HTMLElement) => void;
  nombre: () => number;
  vide: () => boolean;
};

/** Le calque vit SOUS le survol DeLorean et ne reçoit aucun contact : un clone n'est pas un
 *  bouton. `position: absolute` sur chaque fantôme — la mise en page réelle, elle, s'est déjà
 *  refermée, et c'est ce qui garantit que la hauteur du cadre 343 × 585 ne bouge jamais. */
export function creerCalque(hote: HTMLElement): Calque {
  const vivants = new Set<HTMLElement>();

  return {
    fantomer(m) {
      if (vivants.size >= FANTOMES_MAX) return null;
      // `m.copie ?? m.el` : pour les rôles qui en posent une (`chiffre`…), la copie a été prise
      // AU RELEVÉ, avant que `lit` ne réécrive `m.el` en place à un rendu ultérieur — cloner `m.el`
      // directement à cet instant clonerait alors la valeur NEUVE, pas celle que ce fantôme est
      // censé montrer (cf. `Marque.copie`, `marques.ts`).
      const f = (m.copie ?? m.el).cloneNode(true) as HTMLElement;
      // Le clone n'est plus une marque : sans ça, le relevé suivant le compterait comme un
      // élément réel et le diff s'emballerait sur des clés fantômes.
      f.removeAttribute('data-mvt');
      f.removeAttribute('data-mvt-etat');
      f.querySelectorAll('[data-mvt]').forEach((e) => {
        e.removeAttribute('data-mvt'); e.removeAttribute('data-mvt-etat');
      });
      f.style.position = 'absolute';
      f.style.left = `${m.position[0]}px`;
      f.style.top = `${m.position[1]}px`;
      // `m.taille`, JAMAIS `m.el.offsetWidth/offsetHeight` (ronde de correction 1) : au moment où
      // une sortie est jouée, `m.el` est le nœud du relevé « avant », que `rendre()` a déjà
      // détaché du DOM — un élément détaché mesure 0×0 dans un vrai navigateur. `taille` est
      // capturée par `lireMarques` PENDANT que le nœud était encore vivant, exactement comme
      // `position`.
      // Revue finale — CRITIQUE, MESURÉ dans un vrai Chromium : `taille` vient d'`offsetWidth`/
      // `offsetHeight`, qui sont des BORDER-box ; `width`/`height` sont en CONTENT-box dans ce
      // projet (aucune remise à zéro globale de `box-sizing`, cf. `base.css` — seul `.media` opte
      // pour `border-box`). Sans cette ligne, tout fantôme d'un élément padé sortait trop grand de
      // la somme de ses paddings : un `.corps` de 343×585 devenait 375×609, une `.commande` de
      // 151 px passait à 181. Sur le mur : un clone 30 px trop large par-dessus la colonne voisine
      // à chaque sortie de tuile, une ligne qui déborde à chaque cochage de tâche — l'interaction
      // la plus fréquente de ces écrans — et une vue sortante poussée au mauvais format, rognée
      // par l'`overflow: hidden` du calque.
      //
      // POSÉ ICI, EN LIGNE, et non dans une règle `#mvt-fantomes > *` de `base.css` : le modèle de
      // boîte n'a de sens qu'à côté de la mesure qu'il interprète — les trois lignes suivantes.
      // Une règle CSS l'en séparerait de 700 lignes, resterait muette au prochain lecteur de ce
      // fichier, et laisserait les fantômes à la merci d'une feuille pas encore chargée ou d'un
      // calque déplacé. C'est la même famille de défaut que « fantômes à taille nulle », rattrapé
      // à la ronde de correction 1 de la tâche 2 : cette correction-là avait rétabli la MESURE,
      // jamais le modèle de boîte dans lequel elle est réinjectée.
      f.style.boxSizing = 'border-box';
      f.style.width = `${m.taille[0]}px`;
      f.style.height = `${m.taille[1]}px`;
      f.style.margin = '0';
      vivants.add(f);
      hote.appendChild(f);
      return f;
    },
    relacher(f) {
      if (!vivants.delete(f)) return;
      f.remove();
    },
    nombre: () => vivants.size,
    vide: () => vivants.size === 0,
  };
}
