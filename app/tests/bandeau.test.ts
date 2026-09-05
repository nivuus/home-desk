// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'lit';
import { Etat } from '../src/etat';
import { rendreBandeau } from '../src/rendu/bandeau';

let hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });

function etatMeteo(): Etat {
  const e = new Etat();
  e.appliquer({ entity_id: 'weather.maison', state: 'cloudy', attributes: { temperature: 29 } });
  e.appliquer({ entity_id: 'sensor.temp', state: '26.7', attributes: {} });
  return e;
}

describe('bandeau', () => {
  it('rend la pastille sous la température extérieure', () => {
    render(rendreBandeau(etatMeteo(), 'jour', new Date('2026-08-02T19:59:00'), 'sensor.temp',
                         { etiquette: 'Demain', valeur: '35° et de la pluie' }), hote);
    const p = hote.querySelector('.pastille')!;
    expect(p.querySelector('.pt')!.textContent).toBe('Demain');
    expect(p.querySelector('.pv')!.textContent).toBe('35° et de la pluie');
  });

  it('la pastille vit dans la colonne droite, sous la température', () => {
    // C'est tout l'objet de cette tâche : combler le vide sous les 29°. Une pastille rendue
    // ailleurs (sous la phrase, en pleine largeur) laisserait le vide intact.
    render(rendreBandeau(etatMeteo(), 'jour', new Date(), 'sensor.temp',
                         { etiquette: 'Demain', valeur: '35°' }), hote);
    expect(hote.querySelector('.droite .dehors')).not.toBeNull();
    expect(hote.querySelector('.droite .pastille')).not.toBeNull();
  });

  it('sans pastille, le bandeau reste valide', () => {
    render(rendreBandeau(etatMeteo(), 'jour', new Date(), 'sensor.temp'), hote);
    expect(hote.querySelector('.pastille')).toBeNull();
    expect(hote.querySelector('.heure')).not.toBeNull();
  });

  // `weather.maison` tombe RÉGULIÈREMENT en `unavailable` sur cette installation (CLAUDE.md,
  // et la « Ronde de correction 1 » de `rendu/bandeau.ts`) : c'est un état NORMAL, pas un cas
  // limite à peine géré. Aucun test existant ne le couvrait — tous construisent leur état avec
  // `weather.maison` présent et exploitable (`etatMeteo()`).
  it('météo indisponible : .dehors disparaît, le reste du bandeau survit', () => {
    const e = new Etat();
    // L'attribut `temperature` traîne volontairement, périmé — exactement le cas que
    // `estUtilisable` doit filtrer plutôt qu'un simple test de présence de l'attribut.
    e.appliquer({ entity_id: 'weather.maison', state: 'unavailable', attributes: { temperature: 29 } });
    e.appliquer({ entity_id: 'sensor.temp', state: '26.7', attributes: {} });
    render(rendreBandeau(e, 'jour', new Date('2026-08-02T19:59:00'), 'sensor.temp'), hote);
    expect(hote.querySelector('.dehors')).toBeNull();
    expect(hote.querySelector('.dehors .val')).toBeNull();
    expect(hote.querySelector('.heure')!.textContent).toBe('19:59');
    expect(hote.querySelector('.date')!.textContent).toContain('août');
    expect(hote.querySelector('.phrase')!.textContent).toContain('26,7');
  });

  it('émet l\'heure caractère par caractère, clé par position', () => {
    render(rendreBandeau(new Etat(), 'jour', new Date(2026, 7, 6, 19, 42), 'sensor.t'), hote);
    expect(hote.querySelector('.heure')!.textContent).toBe('19:42');
    expect(Array.from(hote.querySelectorAll('.heure [data-mvt]'))
      .map((e) => e.getAttribute('data-mvt')))
      .toEqual(['chiffre:0', 'chiffre:1', 'chiffre:2', 'chiffre:3', 'chiffre:4']);
  });

  it('garde l\'heure, la date et la température intérieure', () => {
    render(rendreBandeau(etatMeteo(), 'jour', new Date('2026-08-02T19:59:00'), 'sensor.temp',
                         { etiquette: 'Demain', valeur: '35°' }), hote);
    expect(hote.querySelector('.heure')!.textContent).toBe('19:59');
    expect(hote.querySelector('.date')!.textContent).toContain('août');
    expect(hote.querySelector('.phrase')!.textContent).toContain('26,7');
  });

  it('la phrase reste dans la colonne gauche, à côté de la pastille, pas empilée dessous', () => {
    // Correction (2026-08-02) : .cap est une grille à deux colonnes. .gauche (heure, date,
    // phrase) et .droite (température, pastille) sont deux frères directs de .cap — sinon on
    // retombe sur l'ancien empilement (.ligne puis .phrase en pleine largeur en dessous), qui
    // faisait grandir le bandeau dès que la pastille passait sur deux lignes. Une pastille sur
    // deux lignes (cas nominal, pas un cas limite) doit laisser ce test vert.
    render(rendreBandeau(etatMeteo(), 'jour', new Date('2026-08-02T19:59:00'), 'sensor.temp',
                         { etiquette: 'Demain', valeur: '29° et des passages nuageux' }), hote);
    const gauche = hote.querySelector('.cap > .gauche');
    const droite = hote.querySelector('.cap > .droite');
    expect(gauche).not.toBeNull();
    expect(droite).not.toBeNull();
    expect(gauche!.contains(hote.querySelector('.heure'))).toBe(true);
    expect(gauche!.contains(hote.querySelector('.phrase'))).toBe(true);
    // La phrase n'est ni un frère de .gauche sous .cap, ni à l'intérieur de .droite.
    expect(hote.querySelector('.cap > .phrase')).toBeNull();
    expect(droite!.contains(hote.querySelector('.phrase'))).toBe(false);
  });

  it('groupe l\'heure et la date, pour que la colonne gauche n\'ait que deux enfants', () => {
    // `space-between` (base.css) répartit TOUS les enfants : avec trois enfants, la date
    // flotterait au milieu de la colonne au lieu de rester sous l'heure. jsdom ne peut pas voir
    // ça — seule la structure est testable ici, la mise en page relève de verifier-rendu.mjs.
    render(rendreBandeau(etatMeteo(), 'jour', new Date('2026-08-02T19:59:00'), 'sensor.temp',
                         { etiquette: 'Demain', valeur: '35°' }), hote);
    const gauche = hote.querySelector('.cap > .gauche')!;
    expect(gauche.children.length).toBe(2);
    const bloc = gauche.querySelector('.bloc-heure')!;
    expect(bloc.contains(hote.querySelector('.heure'))).toBe(true);
    expect(bloc.contains(hote.querySelector('.date'))).toBe(true);
    expect(gauche.children[1].classList.contains('phrase')).toBe(true);
  });

  it('sans température intérieure, la colonne gauche n\'a qu\'un enfant', () => {
    // Capteur muet : `.phrase` n'est pas rendue. Un enfant unique en `space-between` reste en
    // haut — le bandeau rétrécit, il ne laisse pas de bloc flottant.
    const e = new Etat();
    e.appliquer({ entity_id: 'weather.maison', state: 'cloudy', attributes: { temperature: 29 } });
    render(rendreBandeau(e, 'jour', new Date(), 'sensor.absent'), hote);
    const gauche = hote.querySelector('.cap > .gauche')!;
    expect(gauche.children.length).toBe(1);
    expect(hote.querySelector('.phrase')).toBeNull();
  });

  it('colore les trois températures, et rien d\'autre', () => {
    render(rendreBandeau(etatMeteo(), 'jour', new Date(), 'sensor.temp',
                         { etiquette: 'Demain', valeur: '35° et de la pluie', accent: '35°' }), hote);
    expect(hote.querySelector('.dehors .val')!.textContent).toBe('29°');
    expect(hote.querySelector('.phrase .val')!.textContent).toBe('26,7°');
    expect(hote.querySelector('.pastille .val')!.textContent).toBe('35°');
    // Le texte affiché est INCHANGÉ : le découpage colore, il n'ajoute et ne retire rien.
    expect(hote.querySelector('.pastille .pv')!.textContent).toBe('35° et de la pluie');
    // L'icône météo n'est pas colorée — elle est frère du `.val`, pas dedans.
    expect(hote.querySelector('.dehors svg')!.closest('.val')).toBeNull();
  });

  it('ne colore rien dans une pastille sans température', () => {
    render(rendreBandeau(etatMeteo(), 'jour', new Date(), 'sensor.temp',
                         { etiquette: 'Aujourd\'hui', valeur: 'Anniversaire de Julie' }), hote);
    expect(hote.querySelector('.pastille .val')).toBeNull();
    expect(hote.querySelector('.pastille .pv')!.textContent).toBe('Anniversaire de Julie');
  });

  it('ne coupe JAMAIS la valeur quand l\'accent n\'en est pas le préfixe', () => {
    // Garde-fou : si `agenda.ts` et `meteo.ts` divergeaient un jour, on veut du texte non coloré,
    // jamais un texte amputé sur le mur.
    render(rendreBandeau(etatMeteo(), 'jour', new Date(), 'sensor.temp',
                         { etiquette: 'Demain', valeur: 'Anniversaire', accent: '35°' }), hote);
    expect(hote.querySelector('.pastille .val')).toBeNull();
    expect(hote.querySelector('.pastille .pv')!.textContent).toBe('Anniversaire');
  });

  // Tâche 7 (mouvement, 2026-08-22) : couverture — la phrase intérieure, la température
  // extérieure et la pastille portent chacune leur marque, pour que le moteur anime leur
  // apparition/disparition plutôt que de les faire sauter sec.
  it('la phrase, la température extérieure et la pastille portent chacune une marque de mouvement', () => {
    render(rendreBandeau(etatMeteo(), 'jour', new Date('2026-08-02T19:59:00'), 'sensor.temp',
                         { etiquette: 'Demain', valeur: '35°' }), hote);
    expect(hote.querySelector('.phrase')?.getAttribute('data-mvt')).toBe('detail:dedans');
    expect(hote.querySelector('.dehors')?.getAttribute('data-mvt')).toBe('detail:dehors');
    expect(hote.querySelector('.pastille')?.getAttribute('data-mvt')).toBe('detail:pastille');
  });

  // La décimale de la température INTÉRIEURE ne s'élide jamais, même sur un nombre rond :
  // c'est elle qui distingue à l'œil une mesure directe (une décimale, toujours) d'une valeur
  // arrondie (extérieur, prévision). Aucun test ne le couvrait — celui de la ligne 54 utilise
  // 26.7, déjà non rond. Contre-épreuve : retirer `.toFixed(1)` de bandeau.ts doit faire rougir
  // CE test et lui seul.
  it('garde la décimale d\'une température intérieure ronde', () => {
    const e = new Etat();
    e.appliquer({ entity_id: 'sensor.temp', state: '28', attributes: {} });
    render(rendreBandeau(e, 'jour', new Date(), 'sensor.temp'), hote);
    expect(hote.querySelector('.phrase')!.textContent).toContain('28,0');
  });
});
