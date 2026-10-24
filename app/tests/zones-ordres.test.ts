// @vitest-environment jsdom
//
// `startScreen()` appelle `render()` (lit) sur un element reel et bascule des classes CSS dessus --
// meme regle que `tests/demarrage.test.ts`, le seul autre fichier de la suite a en avoir besoin.
import { describe, it, expect } from 'vitest';
import { monterDemarrage, ecranVide } from './aides';
import SCHEMA from '../../contrat/ecran.schema.json';

/** Ruling 21 du supplement de la tache 8 : les deux regles ci-dessous DERIVENT du contrat,
 *  jamais d'une liste ecrite a la main -- sinon le premier test ne garde rien : une cinquieme
 *  zone au schema laisserait `tousLesOrdres()` rendre toujours 49 et le test passerait au vert
 *  en mentant. C'est la lecon n.1 de ce depot : un test qui nomme un identifiant ne garde pas
 *  une capacite. */
const ZONES: readonly string[] = (SCHEMA as any).$defs.agencement.properties.zones.items.enum;
const ZONE_OBLIGATOIRE: string = (SCHEMA as any).$defs.agencement.properties.zones.contains.const;

/** `ecranVide` (`aides.ts:14`) ne porte aucune cle `agencement` : ce spread produit donc un
 *  agencement PARTIEL, seulement `{ zones }`, sans `modes` ni `modulateurs`. Ce n'est PAS un
 *  oubli -- `resoudreAgencement` (`app/src/agencement.ts:115-121`) replie PAR CHAMP et non par
 *  objet, donc `modes` et `modulateurs` absents retombent sur `AGENCEMENT_DEFAUT` : les zones
 *  restent la SEULE variable de cette mesure. */
const avecZones = (zones: string[]) =>
  ({ ...ecranVide, agencement: { ...ecranVide.agencement, zones } });

/** Tous les ordres que le contrat autorise : toute permutation non vide et sans repetition des
 *  zones du schema qui contient la zone obligatoire du schema. Generes, jamais recopies -- une
 *  liste ecrite a la main finirait par diverger du schema sans que rien ne le dise. */
function tousLesOrdres(): string[][] {
  const sortie: string[][] = [];
  const marcher = (choisis: string[], restants: string[]) => {
    if (choisis.length > 0 && choisis.includes(ZONE_OBLIGATOIRE)) sortie.push([...choisis]);
    for (let i = 0; i < restants.length; i++) {
      marcher([...choisis, restants[i]],
              [...restants.slice(0, i), ...restants.slice(i + 1)]);
    }
  };
  marcher([], [...ZONES]);
  return sortie;
}

describe('les 49 ordres de zones que le contrat autorise', () => {
  it('en compte exactement 49 -- le contrat n a pas bouge sous nos pieds', () => {
    expect(tousLesOrdres()).toHaveLength(49);
  });

  it('se rendent tous sans lever, et aucun ne laisse #app vide', async () => {
    // LA MESURE. Le budget sait chiffrer ces 49 ordres ; le moteur n'a jamais ete mesure
    // pour les rendre. Les trois ecrans reels n'en utilisent qu'un -- mais ils sont
    // desormais editables depuis Home Assistant, donc les 48 autres sont ATTEIGNABLES.
    const echecs: { ordre: string[]; erreur: string }[] = [];
    for (const zones of tousLesOrdres()) {
      const ecran = avecZones(zones);
      try {
        const m = await monterDemarrage(ecran as any);
        if (m.racine.textContent!.trim() === '') {
          echecs.push({ ordre: zones, erreur: '#app vide' });
        }
      } catch (e) {
        echecs.push({ ordre: zones, erreur: String(e) });
      }
    }
    // Si ce tableau n'est pas vide, LISEZ-LE : il nomme exactement quels ordres cassent, et
    // c'est le rapport que cette tache devait produire. Ne le neutralisez pas -- corrigez ce
    // qui casse, ou declarez la restriction DANS LE CONTRAT pour que le formulaire cesse de
    // l'offrir.
    expect(echecs).toEqual([]);
  });

  it("rend l'ordre des trois ecrans reels, celui qui est reellement servi", async () => {
    const ecran = avecZones(['ambiances', 'commandes', 'blocCentral', 'synthese']);
    const m = await monterDemarrage(ecran as any);
    expect(m.racine.textContent!.trim()).not.toBe('');
  });
});
