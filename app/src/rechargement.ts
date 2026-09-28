/** Hot reload: editing a tile from Home Assistant makes the tablet update itself, without anyone
 *  touching it. This is the spec's "live editing" promise — the second of the two goals, and the
 *  only one that is checked in front of the wall rather than in a test.
 *
 *  Corrected in the final branch review: this module attributed the emission of
 *  `home_desk_config_changed` to `garde_ecran.persister_si_valide`. `garde_ecran.py` contains no
 *  `async_fire` (measured: `grep -rn "async_fire" custom_components/` only returns
 *  `__init__.py:127,138,139`). The real emitter is the ENTRY UPDATE LISTENER registered by
 *  `__init__.async_setup_entry` (`entry.add_update_listener`, see `websocket.py:32-34`, which
 *  already said so): it compares the state of each subentry with a snapshot and emits on EVERY
 *  write that goes through `async_update_entry`/`async_update_subentry`/`async_add_subentry` —
 *  so the creation of a screen as well as its reconfiguration (`persister_si_valide`), but also
 *  the removal of a subentry and a rename of the title alone, which `persister_si_valide` alone
 *  would not cover. The THREE tablets of this house listen to the same bus: the filter by name
 *  is therefore not an optimisation, it is what keeps editing the living room from making the
 *  kitchen and the office flicker. */

/** What this module expects from a connection. Not `ConnexionLike` (which asks for seven times
 *  more), not the concrete class: just enough to subscribe. */
export type AbonnableEvenements = {
  surEvenement(type: string, cb: (data: Record<string, unknown>) => void): void;
};

/** The event name, HARDCODED.
 *
 *  On the Python side it is COMPUTED (`const.EVENEMENT_CHANGEMENT = f"{DOMAIN}_config_changed"`),
 *  so it exists nowhere as a literal to import — and `app/src/` is TypeScript anyway. As for the
 *  four refusal codes, the value is written on both sides and it is the test that pins it that
 *  holds the boundary. */
const EVENEMENT = 'home_desk_config_changed';

export function armerRechargement(
  cx: AbonnableEvenements, nomEcran: string, recharger: () => void,
): void {
  cx.surEvenement(EVENEMENT, (data) => {
    // `nomEcran` is a string: a payload whose `nom` is missing or not textual can never equal
    // it, so this same comparison discards it — no need for a separate type guard. Discarding it
    // rather than reloading blindly is deliberate: three tablets reloading together on a
    // malformed payload would make three round trips for nothing, and would hide the real
    // defect behind a diffuse symptom.
    if (data.nom !== nomEcran) return;
    recharger();
  });
}
