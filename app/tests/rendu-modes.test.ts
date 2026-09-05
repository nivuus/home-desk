// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'lit';
import { Etat } from '../src/etat';
import { rendreMenage, rendreAeration } from '../src/rendu/modes';

let hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });

function etatAvec(entites: Record<string, { etat: string; attributs?: Record<string, unknown> }>): Etat {
  const e = new Etat();
  for (const [id, v] of Object.entries(entites)) {
    e.appliquer({ entity_id: id, state: v.etat, attributes: v.attributs ?? {} });
  }
  return e;
}

describe('bloc ménage', () => {
  it('affiche l\'état de l\'aspirateur et un bouton de retour à la base', () => {
    const etat = etatAvec({ 'vacuum.rdc': { etat: 'cleaning', attributs: { battery_level: 62 } } });
    render(rendreMenage(etat, 'vacuum.rdc'), hote);
    // Tâche 13 : libellés raccourcis (mesurés — cf. `ETATS_VACUUM`, `rendu/modes.ts`), le cas
    // nominal était coupé par l'ellipsis de `.mode-bloc .v`.
    expect(hote.querySelector('.mode-bloc .v')!.textContent).toContain('En cours');
    expect(hote.querySelector('.mode-action')!.textContent).toContain('Ranger');
  });

  it('même gabarit .t/.v que .demain et .alerte', () => {
    const etat = etatAvec({ 'vacuum.rdc': { etat: 'cleaning' } });
    render(rendreMenage(etat, 'vacuum.rdc'), hote);
    expect(hote.querySelector('.mode-bloc .t')).not.toBeNull();
    expect(hote.querySelector('.mode-bloc .v')).not.toBeNull();
  });
});

describe('bloc aération', () => {
  it('nomme l\'ouvrant réellement ouvert', () => {
    const etat = etatAvec({
      'binary_sensor.porte_balcon_s_ouverture': { etat: 'on', attributs: { friendly_name: 'Porte balcon (S) Ouverture' } },
      'binary_sensor.porte_entree_s_ouverture': { etat: 'off', attributs: { friendly_name: 'Porte entrée (S) Ouverture' } },
    });
    render(rendreAeration(etat, ['binary_sensor.porte_entree_s_ouverture', 'binary_sensor.porte_balcon_s_ouverture']), hote);
    expect(hote.querySelector('.mode-bloc .v')!.textContent).toContain('Porte balcon');
  });

  it('liste les deux quand deux ouvrants sont ouverts', () => {
    const etat = etatAvec({
      'binary_sensor.a': { etat: 'on', attributs: { friendly_name: 'Fenêtre (C) Ouverture' } },
      'binary_sensor.b': { etat: 'on', attributs: { friendly_name: 'Velux (CH) Ouverture' } },
    });
    render(rendreAeration(etat, ['binary_sensor.a', 'binary_sensor.b']), hote);
    const v = hote.querySelector('.mode-bloc .v')!.textContent!;
    expect(v).toContain('Fenêtre');
    expect(v).toContain('Velux');
  });

  it('n\'utilise jamais la couleur d\'erreur : ce n\'est pas une alerte', () => {
    const etat = etatAvec({ 'binary_sensor.a': { etat: 'on', attributs: { friendly_name: 'Fenêtre (C) Ouverture' } } });
    render(rendreAeration(etat, ['binary_sensor.a']), hote);
    expect(hote.querySelector('.alerte')).toBeNull();
    expect(hote.querySelector('.mode-bloc')).not.toBeNull();
  });
});
