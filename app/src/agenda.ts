/** Ce qui remplit la colonne droite du bandeau, sous la température extérieure — l'espace qui
 *  était vide jusqu'ici. Trois candidats, par priorité, et un repli qui existe toujours : la
 *  pastille n'est jamais vide sans raison, donc le vide ne peut pas revenir.
 *
 *  Fonctions pures : `maintenant` est toujours reçu en paramètre, jamais lu d'une horloge
 *  implicite — même discipline que `contexte.ts` et `modes.ts`. */
import { phraseDemain, temperatureCourte, texteCondition, type Prevision } from './meteo';

export type Evenement = {
  resume: string;
  /** ISO 8601 local, tel que HA le rend dans `calendar/event/list`. */
  debut: string;
  estAnniversaire: boolean;
};

/** `accent` : le préfixe EXACT de `valeur` que le bandeau colore (`rendu/bandeau.ts`). Posé ici,
 *  jamais déduit au rendu — deux des quatre branches de `pastilleBandeau` n'ont aucune température
 *  (un anniversaire, un rendez-vous), et une regex sur `^\d+°` reviendrait à deviner le sens depuis
 *  la forme. Son ABSENCE est le cas normal de ces deux branches, jamais une anomalie. */
export type Pastille = { etiquette: string; valeur: string; accent?: string };

/** Trois heures : au-delà, un rendez-vous n'aide plus à décider quoi faire maintenant — il
 *  encombre. En deçà, c'est l'information la plus utile de l'écran. */
const FENETRE_MS = 3 * 3_600_000;

/** La date locale de `maintenant`, au format `AAAA-MM-JJ`. Le format ISO est fait pour se
 *  comparer TEXTUELLEMENT : deux dates de cette forme se trient dans l'ordre chronologique, ce
 *  dont `estCeJour` et le choix de la prévision du lendemain (`demarrage.ts`) se servent tous
 *  les deux. */
export function jourDe(maintenant: Date): string {
  return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`
    + `-${String(maintenant.getDate()).padStart(2, '0')}`;
}

/** Vrai si cet horodatage tombe le jour de `maintenant`.
 *
 *  Comparaison textuelle des dix premiers caractères, JAMAIS via `new Date` : un événement d'une
 *  journée entière — la forme de tout anniversaire Home Assistant — est rendu `start.date` nu
 *  (`2026-08-01`, dix caractères), que `new Date` interprète en UTC ; sous un fuseau négatif,
 *  l'anniversaire reculerait d'un jour, exactement le décalage que ce filtre existe pour éviter.
 *  Un `start.dateTime` (`2026-08-01T15:30:00+02:00`) porte déjà sa date locale en tête : les dix
 *  premiers caractères sont bons dans les deux formes. */
export function estCeJour(debut: string, maintenant: Date): boolean {
  return debut.slice(0, 10) === jourDe(maintenant);
}

// Tâche 14 : exportée pour `rendu/defaut.ts` (« Rendez-vous » du bureau) — même formatage que la
// pastille du bandeau, jamais une seconde fonction qui dirait la même chose.
export function heureCourte(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Au-delà, on ne promet rien : la fenêtre `daily` de cette installation en porte 7 (aujourd'hui
 *  + 6), donc au plus 6 jours à examiner après aujourd'hui. */
const HORIZON_JOURS = 6;

/** Le premier jour à venir dont la condition dominante diffère de celle d'aujourd'hui — demande du
 *  propriétaire (2026-08-03) : « tout changement de condition dominante compte », pas seulement
 *  l'arrivée de la pluie, même si ça fait parler la pastille souvent. La température n'entre pas
 *  dans la comparaison, seule la `condition`.
 *
 *  PURE : `maintenant` est reçu en paramètre, jamais lu d'une horloge implicite (même discipline
 *  que le reste du fichier).
 *
 *  Le jour de référence est trouvé par sa DATE (`jourDe(maintenant)`), jamais par `jours[0]` : rien
 *  ne garantit que la fenêtre `daily` commence par aujourd'hui (cf. le commentaire équivalent sur
 *  `demain` dans `demarrage.ts`, `chargerMeteo`) — si l'entrée d'aujourd'hui est absente, on
 *  n'invente pas de repère et on rend `null` plutôt qu'une comparaison contre le mauvais jour. */
export function prochainChangement(
  jours: Prevision[], maintenant: Date,
): { jour: string; condition: string; temperature: number } | null {
  const aujourdHui = jourDe(maintenant);
  const refAujourdHui = jours.find((p) => String(p?.datetime ?? '').slice(0, 10) === aujourdHui);
  if (!refAujourdHui) return null;

  const demainDate = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1);
  const demainStr = jourDe(demainDate);

  const futurs = jours
    .filter((p) => String(p?.datetime ?? '').slice(0, 10) > aujourdHui)
    .slice(0, HORIZON_JOURS);
  const change = futurs.find((p) => p.condition !== refAujourdHui.condition);
  if (!change) return null;

  const jourStr = String(change.datetime).slice(0, 10);
  const jour = jourStr === demainStr
    ? 'Demain'
    : new Date(change.datetime).toLocaleDateString('fr-FR', { weekday: 'long' });

  return { jour, condition: change.condition, temperature: change.temperature };
}

export function pastilleBandeau(
  evenements: Evenement[], jours: Prevision[], maintenant: Date, masquerPerso: boolean,
  // Tâche 14, ronde de correction 1 (coordinateur) : le bureau montre désormais le prochain
  // rendez-vous du jour dans son bloc central (`rendreProchainRdv`, `rendu/defaut.ts`) — sans ce
  // paramètre, un rendez-vous à moins de trois heures (`FENETRE_MS` ci-dessous, un cas COURANT,
  // pas limite) s'affichait EN MÊME TEMPS ici et là-bas, la même donnée deux fois sur le même
  // écran, exactement ce que ce fichier interdit déjà pour « Demain » (cf. `rendu/corps.ts`).
  // C'est la PASTILLE qui cède, jamais le bloc central : le bloc est plus grand, plus lisible, et
  // dédié à cette information — répéter dans un coin ce qui est déjà écrit en grand n'ajoute rien.
  // L'ANNIVERSAIRE DU JOUR N'EST PAS COUPÉ : ce paramètre ne masque QUE les rendez-vous horaires
  // (« proches » ci-dessous), jamais l'anniversaire, que `rendreProchainRdv` ne montre pas (un
  // anniversaire n'a pas d'heure, cf. son docstring) — pas de duplication à éviter de ce côté.
  masquerRdv = false,
): Pastille | null {
  // `masquerPerso` = modulateur `invites` : un anniversaire ou un rendez-vous professionnel ne
  // regarde que Maxime. On retombe sur « Demain », qui ne dit rien de personne.
  if (!masquerPerso) {
    const anniversaire = evenements.find((e) => e.estAnniversaire);
    if (anniversaire) return { etiquette: 'Aujourd\'hui', valeur: anniversaire.resume };

    if (!masquerRdv) {
      const t = maintenant.getTime();
      const proches = evenements
        .filter((e) => !e.estAnniversaire)
        .map((e) => ({ e, quand: new Date(e.debut).getTime() }))
        .filter(({ quand }) => quand > t && quand - t <= FENETRE_MS)
        .sort((a, b) => a.quand - b.quand);
      if (proches.length) {
        return { etiquette: heureCourte(proches[0].e.debut), valeur: proches[0].e.resume };
      }
    }
  }
  // Repli permanent (tâche 13) : le premier jour dont la condition dominante diffère de celle
  // d'aujourd'hui prime sur « Demain » — demande du propriétaire, cf. `prochainChangement`
  // ci-dessus. `texteCondition` (pas `phraseDemain`) : `prochainChangement` ne rend que
  // condition/température, jamais la précipitation du jour annoncé, qui ne sert qu'à la priorité
  // pluie/condition de `phraseDemain` pour le lendemain immédiat ci-dessous.
  const changement = prochainChangement(jours, maintenant);
  if (changement) {
    const accent = temperatureCourte(changement.temperature);
    return {
      etiquette: changement.jour,
      valeur: `${accent} et ${texteCondition(changement.condition)}`,
      accent,
    };
  }

  // Aucun changement dans la fenêtre : on garde l'ancien repli plutôt que de laisser un vide dans
  // le bandeau (tâche 8 du plan précédent). `null` seulement si même la météo est indisponible
  // (`weather.maison` tombe régulièrement en `unavailable` sur cette installation, cas normal).
  const aujourdHui = jourDe(maintenant);
  const demain = jours.find((p) => String(p?.datetime ?? '').slice(0, 10) > aujourdHui);
  if (!demain) return null;
  return {
    etiquette: 'Demain',
    valeur: phraseDemain(demain),
    accent: temperatureCourte(demain.temperature),
  };
}
