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
 *  would not cover. The THREE tablets of this house share that one event: the filter by name,
 *  done by `home_desk/abonner` on the server, is therefore not an optimisation, it is what keeps
 *  editing the living room from making the kitchen and the office flicker. */

/** What this module expects from a connection. Not `ConnexionLike` (which asks for seven times
 *  more), not the concrete class: just enough to subscribe. */
export type AbonnableEvenements = {
  abonner(commande: Record<string, unknown>, cb: (evenement: Record<string, unknown>) => void): void;
};

/** The integration's subscription command, HARDCODED.
 *
 *  Not `subscribe_events` on `home_desk_config_changed`: Home Assistant refuses a NON-ADMIN user
 *  any bus event outside its allowlist, and the tablets log in as such a user (measured on
 *  2026-09-28 — the live editing never reached the wall). `home_desk/abonner` relays that event
 *  for ONE screen. On the Python side the command name is COMPUTED (`const.WS_ABONNER =
 *  f"{DOMAIN}/abonner"`), so it exists nowhere as a literal to import: as for the refusal codes,
 *  the value is written on both sides and it is the test that pins it that holds the boundary. */
const COMMANDE = 'home_desk/abonner';

export function armerRechargement(
  cx: AbonnableEvenements, nomEcran: string, recharger: () => void,
): void {
  cx.abonner({ type: COMMANDE, nom: nomEcran }, (evenement) => {
    // The server already filters by name. This comparison stays as the check of the payload
    // itself: an event whose `nom` is missing, not textual or another screen's is discarded
    // rather than reloaded blindly — three tablets reloading on a malformed payload would hide
    // the real defect behind a diffuse symptom.
    if (evenement.nom !== nomEcran) return;
    recharger();
  });
}
