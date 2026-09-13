import { describe, it, expect, vi } from 'vitest';
import { chargerEcran, listerEcrans } from '../src/configuration';
import { RefusHA } from '../src/connexion';

/** Un transport doublé : rend ce qu'on lui dit, ou lève le refus qu'on lui donne. */
function transport(reponse: (p: Record<string, unknown>) => unknown) {
  return { envoyerCommande: vi.fn(async (p: Record<string, unknown>) => reponse(p)) };
}

describe('chargerEcran — la commande envoyée', () => {
  it('envoie home_desk/ecran avec le nom, et rien d autre', async () => {
    const cx = transport(() => ({ nom: 'cuisine', version: 1 }));
    await chargerEcran(cx, 'cuisine');
    expect(cx.envoyerCommande).toHaveBeenCalledTimes(1);
    expect(cx.envoyerCommande).toHaveBeenCalledWith({ type: 'home_desk/ecran', nom: 'cuisine' });
  });

  it('rend l écran tel que HA l a résolu et validé', async () => {
    const ecran = { nom: 'cuisine', version: 1, hauteurUtile: 585 };
    const cx = transport(() => ecran);
    expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: true, valeur: ecran });
  });
});

describe('chargerEcran — les quatre codes du fil, en VALEUR LITTÉRALE', () => {
  // `app/src/` est en TypeScript et ne peut pas importer `const.py` : un test qui comparerait
  // à la constante serait tautologique. Ces quatre chaînes sont écrites en dur des DEUX côtés,
  // et ce test est le seul filet à la frontière de langage. Mesurées le 2026-09-13 —
  // ERREUR_ECRAN_INTROUVABLE vaut `not_found` (c'est ERR_NOT_FOUND de HA, réutilisé), PAS
  // `ecran_introuvable`.
  const cas: [string, string][] = [
    ['not_found', 'introuvable'],
    ['version_inconnue', 'version'],
    ['ecran_corrompu', 'corrompu'],
    ['unknown_command', 'integrationAbsente'],
  ];

  for (const [code, panne] of cas) {
    it(`traduit le code « ${code} » en panne « ${panne} »`, async () => {
      const cx = transport(() => { throw new RefusHA(code, 'message python sans accents'); });
      expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: false, panne });
    });
  }

  it('range tout code inconnu dans « reseau » plutôt que de lever', async () => {
    const cx = transport(() => { throw new RefusHA('code_jamais_vu', 'x'); });
    expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: false, panne: 'reseau' });
  });

  it('range une erreur qui n est PAS un refus HA dans « reseau »', async () => {
    // Websocket fermé, JSON illisible, délai dépassé côté appelant : tout ce qui n'est pas un
    // refus de HA est un problème de liaison.
    const cx = transport(() => { throw new Error('websocket indisponible'); });
    expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: false, panne: 'reseau' });
  });

  it('range un délai dépassé dans « reseau » — HA n a rien répondu', async () => {
    const cx = transport(() => { throw new RefusHA('delai_depasse', 'pas de réponse en 15 s'); });
    expect(await chargerEcran(cx, 'cuisine')).toEqual({ ok: false, panne: 'reseau' });
  });
});

describe('listerEcrans', () => {
  it('envoie home_desk/ecrans et rend les paires nom/titre', async () => {
    // `nom` (donnée saisie, clé primaire du transport) et `titre` (`ConfigSubentry.title`,
    // renommable indépendamment par le geste générique de HA) sont DEUX champs distincts.
    const liste = [{ nom: 'salon', titre: 'Salon' }, { nom: 'cuisine', titre: 'Cuisine' }];
    const cx = transport(() => liste);
    expect(await listerEcrans(cx)).toEqual({ ok: true, valeur: liste });
    expect(cx.envoyerCommande).toHaveBeenCalledWith({ type: 'home_desk/ecrans' });
  });

  it('rend une liste VIDE en succès, jamais une panne', async () => {
    // « HA joignable, aucun écran configuré » est une dégradation distincte de « HA
    // injoignable » : la première dit où aller configurer, la seconde parle de réseau. Les
    // confondre remplacerait un conseil juste par un conseil faux.
    const cx = transport(() => []);
    expect(await listerEcrans(cx)).toEqual({ ok: true, valeur: [] });
  });

  it('signale l intégration absente quand HA ne connaît pas la commande', async () => {
    const cx = transport(() => { throw new RefusHA('unknown_command', 'Unknown command.'); });
    expect(await listerEcrans(cx)).toEqual({ ok: false, panne: 'integrationAbsente' });
  });

  it('ignore une réponse qui n est pas un tableau plutôt que de la propager', async () => {
    const cx = transport(() => ({ pas: 'un tableau' }));
    expect(await listerEcrans(cx)).toEqual({ ok: false, panne: 'corrompu' });
  });
});
