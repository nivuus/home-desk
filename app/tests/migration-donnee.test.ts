/** JETABLE — part à la tâche 10 du plan 3c, avec `ECRANS` et l'outil d'export.
 *
 *  Niveau 1 de la preuve de migration : ce que l'outil exporte ÉGALE ce que le code portait.
 *  L'égalité profonde ne suffit pas — elle manquerait un champ optionnel disparu DES DEUX CÔTÉS.
 *  Les deux dénombrements sont l'ancre extérieure.
 *
 *  RONDE DE CORRECTION 1 : cette suite appelait `ecransPourImport(ECRANS)` directement — le
 *  squelette du brief, exécuté fidèlement, mais faux. Ça ne produit QUE 3 `note` (les
 *  `agencement.note` déjà écrites dans `ecran.ts`), jamais les 143 que le registre attache : ce
 *  n'est pas le chemin réel de production (`exporter-ecrans.mjs`, CLI `--json`), qui attache
 *  D'ABORD les notes du registre (`attacherNotes`) avant de mettre en forme pour l'import
 *  (`ecransPourImport`). `exporterTout` (même fichier) est cette composition, extraite pour que
 *  le CLI et ces épreuves ne la recopient pas chacun de leur côté. */
import { describe, it, expect } from 'vitest';
import { ECRANS } from '../src/ecran';
import { exporterTout } from '../outils/exporter-ecrans.mjs';

const exportes = exporterTout(ECRANS);

/** Copie profonde de `x` dont toute clé `note` a été retirée, à toute profondeur — des deux
 *  côtés de la comparaison, donc les trois `note` qu'`ECRANS` portait déjà disparaissent aussi :
 *  c'est voulu, `migration-notes.test.ts` (tâche 12) garde qu'elles ne sont pas détruites, et
 *  c'est son travail, pas celui-ci. */
function sansNotes(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sansNotes);
  if (x && typeof x === 'object') {
    return Object.fromEntries(
      Object.entries(x).filter(([cle]) => cle !== 'note').map(([cle, v]) => [cle, sansNotes(v)]));
  }
  return x;
}

describe('niveau 1 — la donnée', () => {
  it('exporte exactement trois écrans, un par clé d’ECRANS', () => {
    expect(exportes.map((e) => e.nom).sort())
      .toEqual(Object.values(ECRANS).map((e) => e.nom).sort());
  });

  it.each(Object.entries(ECRANS))('%s : champ par champ, version comprise', (_cle, ecran) => {
    const exporte = exportes.find((e) => e.nom === ecran.nom)!;
    // `exporterTout` suit le chemin réel : `attacherNotes` ATTACHE les 143 commentaires classés
    // `attachee` en `note` (tâche 12) avant la mise en forme. L'égalité stricte est donc fausse
    // par construction — ce qu'il faut prouver, c'est que **rien d'AUTRE qu'une `note`** n'a
    // bougé. `sansNotes` retire récursivement toute clé `note` des deux côtés ; les notes
    // elles-mêmes sont gardées par `migration-notes.test.ts`, qui les compte contre le registre.
    expect(sansNotes(exporte)).toEqual(sansNotes({ titre: ecran.nom, version: 1, ...ecran }));
  });

  it('porte 54 entity_id distincts en 113 occurrences', () => {
    // Sur `sansNotes`, obligatoirement : les commentaires d'`ecran.ts` CITENT des entity_id en
    // prose, et `exporterTout` les attache réellement en `note` (tâche 12) — sans `sansNotes`
    // ici, ces 20 objets notés feraient monter les deux compteurs sans qu'aucune donnée n'ait
    // bougé. Les 54/113 mesurent la DONNÉE.
    const tous = JSON.stringify(exportes.map(sansNotes)).match(/"[a-z_]+\.[a-z0-9_]+"/g) ?? [];
    expect(tous.length).toBe(113);
    expect(new Set(tous).size).toBe(54);
  });

  it('les répartit par domaine comme la spec l’a mesuré', () => {
    const tous = JSON.stringify(exportes.map(sansNotes)).match(/"([a-z_]+)\.[a-z0-9_]+"/g) ?? [];
    const parDomaine: Record<string, number> = {};
    for (const d of new Set(tous)) {
      const domaine = d.slice(1).split('.')[0];
      parDomaine[domaine] = (parDomaine[domaine] ?? 0) + 1;
    }
    expect(parDomaine).toEqual({
      binary_sensor: 9, sensor: 7, media_player: 7, light: 7, todo: 4, script: 4,
      timer: 3, input_text: 3, vacuum: 2, fan: 2, cover: 2, button: 2, lock: 1, climate: 1,
    });
  });
});
