/** Le client du transport websocket livré par le plan 3a (`custom_components/home_desk/
 *  websocket.py`). Il demande un écran ou la liste des écrans, et traduit tout refus en une
 *  PANNE NOMMÉE. Il ne rend rien et ne touche pas au DOM : c'est `rendu/repli.ts` qui sait
 *  quoi montrer pour chaque panne, et `demarrage.ts` qui câble les deux. */
import type { Ecran } from './ecran';
import { RefusHA } from './connexion';

/** Les cinq façons dont le chargement d'un écran peut échouer. Cinq, pas quatre : la spec
 *  d'origine n'en nommait que quatre et laissait « l'intégration n'est pas installée » tomber
 *  dans le message de panne réseau — qui dit à l'opérateur de déboguer son Wi-Fi alors que HA
 *  a répondu instantanément et correctement. */
export type Panne = 'introuvable' | 'version' | 'corrompu' | 'integrationAbsente' | 'reseau';

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; panne: Panne };

/** Une ligne de `home_desk/ecrans`. `nom` est la clé primaire du transport (donnée saisie) ;
 *  `titre` est `ConfigSubentry.title`, une propriété générique de Home Assistant que
 *  l'utilisateur peut renommer seule. Deux champs distincts, même s'ils sont maintenus
 *  synchronisés par le formulaire d'identité. */
export type EntreeListe = { nom: string; titre: string };

/** Ce que ce module attend d'une connexion : juste `envoyerCommande`. Ni la classe concrète
 *  `Connexion` (ses champs privés interdiraient un double de test léger), ni `ConnexionLike`
 *  de `demarrage.ts` (qui en demande cinq fois plus). */
export type TransportConfig = {
  envoyerCommande(payload: Record<string, unknown>): Promise<unknown>;
};

/** Les codes tels qu'ils circulent SUR LE FIL, écrits en dur.
 *
 *  `app/src/` est en TypeScript et ne peut pas importer `const.py` : ces quatre chaînes sont
 *  écrites en dur des deux côtés de la frontière de langage, et le test qui les épingle est le
 *  seul filet qui existe. Mesurées le 2026-09-13 sur le composant installé.
 *
 *  ⚠️ `not_found` et non `ecran_introuvable` : le composant réutilise délibérément
 *  `websocket_api.const.ERR_NOT_FOUND` de Home Assistant.
 *  `unknown_command` n'est PAS produit par ce dépôt : c'est le cœur de HA qui répond ça quand
 *  la commande n'est pas enregistrée, c'est-à-dire quand l'intégration n'est pas installée. */
const PANNE_PAR_CODE: Record<string, Panne> = {
  not_found: 'introuvable',
  version_inconnue: 'version',
  ecran_corrompu: 'corrompu',
  unknown_command: 'integrationAbsente',
};

/** Tout ce qui n'est pas un refus NOMMÉ de HA est un problème de liaison : websocket fermé,
 *  JSON illisible, délai dépassé (`delai_depasse`, posé par `connexion.ts` quand HA ne répond
 *  pas). « reseau » est donc aussi le repli, à dessein — un code inconnu veut dire que le
 *  composant a évolué sans ce client, et l'écran réseau est le seul qui reste vrai. */
function panneDe(erreur: unknown): Panne {
  if (erreur instanceof RefusHA) return PANNE_PAR_CODE[erreur.code] ?? 'reseau';
  return 'reseau';
}

/** Demande à Home Assistant l'écran nommé, RÉSOLU ET VALIDÉ par le composant. */
export async function chargerEcran(cx: TransportConfig, nom: string): Promise<Resultat<Ecran>> {
  try {
    const brut = await cx.envoyerCommande({ type: 'home_desk/ecran', nom });
    return { ok: true, valeur: brut as Ecran };
  } catch (erreur) {
    return { ok: false, panne: panneDe(erreur) };
  }
}

/** Demande la liste des écrans configurés, pour la première dégradation.
 *
 *  Le composant ne revalide PAS chaque écran ici, à dessein : un écran corrompu ne doit pas
 *  priver les tablettes du choix des autres. Une liste VIDE est donc un SUCCÈS — « HA joignable,
 *  aucun écran configuré » est une dégradation distincte de « HA injoignable », et les confondre
 *  remplacerait un conseil juste (« allez en créer un ») par un conseil faux (« vérifiez le
 *  réseau »). */
export async function listerEcrans(cx: TransportConfig): Promise<Resultat<EntreeListe[]>> {
  try {
    const brut = await cx.envoyerCommande({ type: 'home_desk/ecrans' });
    if (!Array.isArray(brut)) return { ok: false, panne: 'corrompu' };
    return { ok: true, valeur: brut as EntreeListe[] };
  } catch (erreur) {
    return { ok: false, panne: panneDe(erreur) };
  }
}
