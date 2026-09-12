import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject } from 'ajv';
import { ECRANS } from '../src/ecran';
import SCHEMA from '../../contrat/ecran.schema.json';

const valider = new Ajv2020({ allErrors: true, strict: false }).compile(SCHEMA);

/** Un `toBe(false)` seul ne prouve rien : le schéma peut refuser une donnée pour n'importe quel
 *  motif sans rapport avec celui qu'un test veut exercer (ex. un champ inconnu ailleurs dans le
 *  même objet). Cette aide exige, en plus du refus, la présence d'une erreur `ajv` précise —
 *  `instancePath` et `keyword`, et au besoin certaines clés de `params` — parmi `valider.errors`.
 *  Le message d'échec porte les deux : ce qu'on attendait, ce qu'ajv a répondu. */
function refusePour(
  valeur: unknown,
  attendu: { instancePath: string; keyword: string; params?: Record<string, unknown> },
): void {
  const ok = valider(valeur);
  const motif = (valider.errors ?? []).find((e: ErrorObject) =>
    e.instancePath === attendu.instancePath
    && e.keyword === attendu.keyword
    && (attendu.params === undefined || Object.entries(attendu.params).every(
      ([cle, val]) => JSON.stringify((e.params as Record<string, unknown>)[cle]) === JSON.stringify(val),
    )));
  expect(ok, `attendu un refus, valider() a accepté : ${JSON.stringify(valeur)}`).toBe(false);
  expect(motif,
    `attendu une erreur ${JSON.stringify(attendu)} parmi ${JSON.stringify(valider.errors, null, 2)}`,
  ).toBeDefined();
}

describe('contrat/ecran.schema.json', () => {
  it('accepte les trois ecrans reels', () => {
    for (const [nom, ecran] of Object.entries(ECRANS)) {
      const ok = valider(ecran);
      expect(ok, `${nom} : ${JSON.stringify(valider.errors)}`).toBe(true);
    }
  });

  it('refuse un seuil chaine sous un operateur d\'ordre', () => {
    const casse = {
      ...ECRANS.bureau,
      synthese: [{ entite: 'sensor.x', operateur: '<', valeur: '35', texte: 'x' }],
    };
    refusePour(casse, { instancePath: '/synthese/0/valeur', keyword: 'type', params: { type: 'number' } });
  });

  it('refuse une hauteur utile absurde', () => {
    refusePour({ ...ECRANS.salon, hauteurUtile: 12 },
      { instancePath: '/hauteurUtile', keyword: 'minimum', params: { limit: 320 } });
  });

  it('accepte une note sur l\'ecran et sur un bouton', () => {
    const annote = {
      ...ECRANS.salon,
      note: 'ecran d\'entree',
      commandes: ECRANS.salon.commandes.map((b, i) =>
        i === 0 ? { ...b, note: 'pourquoi celle-ci' } : b),
    };
    expect(valider(annote), JSON.stringify(valider.errors)).toBe(true);
  });

  it('refuse une entite qui n\'a pas la forme domaine.objet', () => {
    refusePour({ ...ECRANS.salon, temperature: 'pas_un_entity_id' },
      { instancePath: '/temperature', keyword: 'pattern' });
  });

  it('accepte absenceNommee sur une entree de synthese', () => {
    const annote = {
      ...ECRANS.salon,
      synthese: [
        { entite: 'sensor.x', texte: 'y', operateur: '>', valeur: 0,
          absenceNommee: 'Non installé' },
      ],
    };
    expect(valider(annote), JSON.stringify(valider.errors)).toBe(true);
  });

  it('refuse un champ inconnu sur un bouton', () => {
    const casse = {
      ...ECRANS.salon,
      commandes: [{ ...ECRANS.salon.commandes[0], couleur: 'rouge' }],
    };
    refusePour(casse,
      { instancePath: '/commandes/0', keyword: 'additionalProperties', params: { additionalProperty: 'couleur' } });
  });

  it('refuse une icone hors vocabulaire (correction A : icone: "frigo" ne retombe plus en silence sur cloudy)', () => {
    const casse = {
      ...ECRANS.salon,
      commandes: [{ ...ECRANS.salon.commandes[0], icone: 'frigo' }],
    };
    refusePour(casse, { instancePath: '/commandes/0/icone', keyword: 'enum' });
  });

  // Tâche 3 du plan 2 (2026-09-12) : `blocDefaut` n'existe plus DU TOUT à la racine — la tâche 1
  // avait prouvé l'équivalence avec `agencement.blocDefaut`, ce qui a permis à cette tâche de
  // retirer la copie racine (schéma compris). Un `blocDefaut` posé à la racine est donc désormais
  // un champ INCONNU, refusé par `additionalProperties: false` au même titre que n'importe quel
  // autre — plus par son `enum`, qui a disparu avec la propriété elle-même.
  it('refuse blocDefaut a la racine — le champ n\'existe plus que dans agencement', () => {
    refusePour({ ...ECRANS.salon, blocDefaut: 'voiture' },
      { instancePath: '', keyword: 'additionalProperties', params: { additionalProperty: 'blocDefaut' } });
  });

  // Symétrique du test précédent : l'absence de `blocDefaut` à la racine ne doit pas déteindre sur
  // `agencement.blocDefaut`, qui reste bien réel. Sans ce test, quelqu'un retirant `blocDefaut` de
  // `$defs/agencement` par erreur en même temps que la racine casserait exactement ce que la
  // correction ci-dessus visait à garantir, et rien ne le verrait.
  //
  // Relecture finale du plan 2 (I2) : ce test passait un agencement PARTIEL
  // (`{ blocDefaut: 'agenda' }`), c'est-à-dire précisément la donnée que `$defs/agencement`
  // déclarait valide et qui faisait lever `rendreCorps`. Il reprend maintenant l'agencement
  // COMPLET du salon et n'y remplace que `blocDefaut` — la seule chose qu'il a jamais voulu dire.
  it('accepte un blocDefaut valide dans agencement, distinct de la racine', () => {
    const annote = { ...ECRANS.salon,
                     agencement: { ...ECRANS.salon.agencement!, blocDefaut: 'agenda' } };
    expect(valider(annote), JSON.stringify(valider.errors)).toBe(true);
  });

  // Relecture finale du plan 2 (I2). Le type `Agencement` (`src/agencement.ts`) rend `zones`,
  // `modes` et `modulateurs` OBLIGATOIRES ; le schéma, lui, n'exigeait rien. Il déclarait donc
  // valide ce que le type interdit — et le rendu le payait : `rendreCorps` retombait par OBJET,
  // pas par champ, et `{ blocDefaut: 'agenda' }` lui faisait lever `TypeError` sur `zones.map`.
  // Le rendu dégrade désormais (cf. `rendu/corps.ts`), et le contrat que le formulaire du plan 3
  // fera respecter dit enfin la même chose que le type.
  it('refuse un agencement incomplet — le schema dit ce que le type exige', () => {
    refusePour({ ...ECRANS.salon, agencement: { blocDefaut: 'agenda' } },
      { instancePath: '/agencement', keyword: 'required', params: { missingProperty: 'zones' } });
  });

  // Relecture de la tâche 6. Cet `enum` portait CINQ valeurs contre TROIS au type `BlocDefaut`
  // (`src/agencement.ts`), et un test entérinait l'écart en le disant « prospectif ». Il ne l'était
  // pas : `previsions` est un mode SUPPRIMÉ, et `entretien` n'est câblé que comme repli de
  // `repas`/`agenda`, jamais comme bloc par défaut. Les deux retombaient sur `undefined` dans le
  // ternaire de `demarrage.ts` — soit un bloc central silencieusement vide, offert au menu
  // déroulant du formulaire que le plan 3 fera valider par ce schéma.
  it('refuse un blocDefaut que le rendu ne sait pas produire', () => {
    for (const mort of ['entretien', 'previsions']) {
      refusePour({ ...ECRANS.salon, agencement: { blocDefaut: mort } },
        { instancePath: '/agencement/blocDefaut', keyword: 'enum' });
    }
  });

  // Relecture finale du plan 2 (M10). Les DEUX `contains` de `$defs/agencement` n'etaient gardes
  // par personne : les retirer du schema laissait les suites entierement vertes. Ce sont pourtant
  // les deux invariants les plus fondamentaux de l'agencement, ceux que le type ne peut pas dire
  // (un `Zone[]` ne sait pas exiger un element precis) et que le docstring d'`Agencement` promet
  // en toutes lettres : « `commandes` est obligatoire — un ecran sans commande n'est plus une
  // tablette de commande » et « `defaut` est le repli et doit y figurer ».
  //
  // Les deux assertent le MOTIF (`keyword: 'contains'`), pas seulement le refus : sans lui,
  // n'importe quelle autre erreur du meme objet ferait passer le test pour la mauvaise raison —
  // c'est le ruling 10 de la tache 6, et c'est exactement le piege ici, puisque `zones` et `modes`
  // sont desormais REQUIS et qu'une donnee mal formee produit plusieurs erreurs a la fois.
  it('refuse un agencement dont les zones omettent les commandes', () => {
    refusePour({ ...ECRANS.salon,
                 agencement: { ...ECRANS.salon.agencement!,
                               zones: ['ambiances', 'blocCentral', 'synthese'] } },
               { instancePath: '/agencement/zones', keyword: 'contains' });
  });

  // Sans `defaut` dans la liste, `modePrincipal` n'a plus de repli DECLARE : il retombe sur le
  // `?? 'defaut'` de sa derniere ligne (`modes.ts`), c'est-a-dire sur un mode que l'ecran a
  // justement dit ne pas vouloir. La liste mentirait sur ce que l'ecran affiche.
  it('refuse un agencement dont les modes omettent le repli defaut', () => {
    refusePour({ ...ECRANS.salon,
                 agencement: { ...ECRANS.salon.agencement!,
                               modes: ['alerte', 'menage', 'cinema', 'media', 'voiture'] } },
               { instancePath: '/agencement/modes', keyword: 'contains' });
  });

  describe('les invariants croises', () => {
    it('refuse blocDefaut voiture sans l objet voiture', () => {
      const { voiture, ...sansVoiture } = ECRANS.salon;
      refusePour({ ...sansVoiture,
                   agencement: { ...ECRANS.salon.agencement!, blocDefaut: 'voiture' } },
                 { instancePath: '', keyword: 'required', params: { missingProperty: 'voiture' } });
    });

    it('accepte blocDefaut voiture quand l objet voiture est la', () => {
      expect(valider(ECRANS.salon), JSON.stringify(valider.errors)).toBe(true);
    });

    it('refuse le mode minuteur sans slots de minuteur', () => {
      const { minuteurs, ...sansSlots } = ECRANS.cuisine;
      refusePour(sansSlots,
        { instancePath: '', keyword: 'required', params: { missingProperty: 'minuteurs' } });
    });

    it('refuse le mode minuteur avec des slots vides', () => {
      refusePour({ ...ECRANS.cuisine, minuteurs: [] },
        { instancePath: '/minuteurs', keyword: 'minItems' });
    });

    it('accepte le mode minuteur quand les slots sont la', () => {
      expect(valider(ECRANS.cuisine), JSON.stringify(valider.errors)).toBe(true);
    });

    it('accepte un ecran sans agencement du tout, et sans voiture', () => {
      const { agencement, voiture, ...reste } = ECRANS.salon;
      expect(valider(reste), JSON.stringify(valider.errors)).toBe(true);
    });
  });
});
