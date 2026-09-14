/** Le rechargement à chaud : éditer une tuile depuis Home Assistant fait se remettre à jour la
 *  tablette, sans qu'on la touche. C'est la promesse « édition vivante » de la spec — le second
 *  des deux objectifs, et le seul qui se vérifie devant le mur plutôt qu'en test.
 *
 *  Corrigé en relecture finale de branche : ce module attribuait l'émission de
 *  `home_desk_config_changed` à `garde_ecran.persister_si_valide`. `garde_ecran.py` ne contient
 *  aucun `async_fire` (mesuré : `grep -rn "async_fire" custom_components/` ne rend que
 *  `__init__.py:127,138,139`). L'émetteur réel est l'ÉCOUTEUR DE MISE À JOUR DE L'ENTRÉE posé par
 *  `__init__.async_setup_entry` (`entry.add_update_listener`, voir `websocket.py:32-34`, qui le
 *  disait déjà) : il compare l'état de chaque sous-entrée à un instantané et émet à CHAQUE
 *  écriture qui passe par `async_update_entry`/`async_update_subentry`/`async_add_subentry` —
 *  donc aussi bien la création d'un écran que sa reconfiguration (`persister_si_valide`), mais
 *  aussi la suppression d'une sous-entrée et un renommage du seul titre, que `persister_si_valide`
 *  seul ne couvrirait pas. Les TROIS tablettes de cette maison écoutent le même bus : le filtre
 *  par nom n'est donc pas une optimisation, c'est ce qui empêche d'éditer le salon de faire
 *  clignoter la cuisine et le bureau. */

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
    // `nomEcran` est une chaîne : une charge utile dont `nom` est absent ou non textuel ne peut
    // jamais lui être égale, donc cette même comparaison l'écarte — pas besoin d'une garde de
    // type séparée. L'écarter plutôt que de recharger à l'aveugle est délibéré : trois tablettes
    // qui rechargeraient ensemble sur une charge malformée feraient trois allers-retours pour
    // rien, et masqueraient le vrai défaut derrière un symptôme diffus.
    if (donnees.nom !== nomEcran) return;
    recharger();
  });
}
