/** Le rechargement à chaud : éditer une tuile depuis Home Assistant fait se remettre à jour la
 *  tablette, sans qu'on la touche. C'est la promesse « édition vivante » de la spec — le second
 *  des deux objectifs, et le seul qui se vérifie devant le mur plutôt qu'en test.
 *
 *  `garde_ecran.persister_si_valide` émet `home_desk_config_changed` avec le nom de l'écran à
 *  chaque écriture d'une sous-entrée. Les TROIS tablettes de cette maison écoutent le même bus :
 *  le filtre par nom n'est donc pas une optimisation, c'est ce qui empêche d'éditer le salon de
 *  faire clignoter la cuisine et le bureau. */

/** Ce que ce module attend d'une connexion. Pas `ConnexionLike` (qui en demande sept fois plus),
 *  pas la classe concrète : juste de quoi s'abonner. */
export type AbonnableEvenements = {
  surEvenement(type: string, cb: (donnees: Record<string, unknown>) => void): void;
};

/** Le nom de l'événement, ÉCRIT EN DUR.
 *
 *  Côté Python il est CALCULÉ (`const.EVENEMENT_CHANGEMENT = f"{DOMAIN}_config_changed"`), donc
 *  il n'existe nulle part comme littéral à importer — et `app/src/` est en TypeScript de toute
 *  façon. Comme pour les quatre codes de refus, la valeur est écrite des deux côtés et c'est le
 *  test qui l'épingle qui tient la frontière. */
const EVENEMENT = 'home_desk_config_changed';

export function armerRechargement(
  cx: AbonnableEvenements, nomEcran: string, recharger: () => void,
): void {
  cx.surEvenement(EVENEMENT, (donnees) => {
    // Un événement sans nom exploitable est ignoré, jamais traité comme « recharge tout » :
    // trois tablettes qui rechargent ensemble sur une charge utile malformée feraient trois
    // allers-retours pour rien, et masqueraient le vrai défaut derrière un symptôme diffus.
    if (typeof donnees.nom !== 'string') return;
    if (donnees.nom !== nomEcran) return;
    recharger();
  });
}
