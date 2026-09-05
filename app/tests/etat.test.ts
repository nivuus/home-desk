import { describe, it, expect, vi } from 'vitest';
import { Etat } from '../src/etat';

const ev = (id: string, etat: string) => ({ entity_id: id, state: etat, attributes: {} });

describe('Etat', () => {
  // La donnée est appliquée sur-le-champ ; c'est le REDESSIN qui attend la fin de la tâche
  // courante (cf. `notifier`, `src/etat.ts`) — d'où le `await` avant de vérifier le rappel.
  it('mémorise les entités et notifie', async () => {
    const e = new Etat();
    const cb = vi.fn();
    e.surMaj(cb);
    e.appliquer(ev('light.salon', 'on'));
    expect(e.lire('light.salon')?.etat).toBe('on');
    await Promise.resolve();
    expect(cb).toHaveBeenCalled();
  });

  it('considère unavailable et unknown comme inutilisables', () => {
    const e = new Etat();
    e.appliquer(ev('lock.porte', 'unavailable'));
    e.appliquer(ev('cover.rideau', 'unknown'));
    e.appliquer(ev('light.salon', 'off'));
    expect(e.estUtilisable('lock.porte')).toBe(false);
    expect(e.estUtilisable('cover.rideau')).toBe(false);
    expect(e.estUtilisable('light.salon')).toBe(true);
    expect(e.estUtilisable('sensor.inexistant')).toBe(false);
  });

  it('accepte un état optimiste et le marque', () => {
    const e = new Etat();
    e.appliquer(ev('light.salon', 'off'));
    e.optimiste('light.salon', 'on');
    expect(e.lire('light.salon')?.etat).toBe('on');
    expect(e.confirme('light.salon')).toBe(false);
  });

  it('un état confirmé écrase toujours un état optimiste', () => {
    const e = new Etat();
    e.optimiste('light.salon', 'on');
    e.appliquer(ev('light.salon', 'off'));
    expect(e.lire('light.salon')?.etat).toBe('off');
    expect(e.confirme('light.salon')).toBe(true);
  });

  // Cas ajouté (non fourni par le brief) : `changeLe` ne doit se ré-horodater que si l'état
  // change réellement. Sans cette précaution, la salve `get_states` envoyée après chaque
  // reconnexion ferait croire que toute la maison vient de bouger, et remettrait au premier
  // plan des alertes qui devaient rester repliées.
  it('ne ré-horodate pas changeLe quand un événement répète le même état (salve de reconnexion)', () => {
    const e = new Etat();
    let maintenant = 1_000_000;
    const reel = Date.now;
    Date.now = () => maintenant;
    try {
      e.appliquer(ev('light.salon', 'on'));
      const changeLeInitial = e.lire('light.salon')?.changeLe;

      // La maison ne bouge pas, mais la reconnexion renvoie quand même un `get_states`
      // avec le même état, dix minutes plus tard.
      maintenant += 10 * 60_000;
      e.appliquer(ev('light.salon', 'on'));

      expect(e.lire('light.salon')?.changeLe).toBe(changeLeInitial);

      // En revanche, un vrai changement d'état doit bien ré-horodater.
      maintenant += 1000;
      e.appliquer(ev('light.salon', 'off'));
      expect(e.lire('light.salon')?.changeLe).toBe(maintenant);
    } finally {
      Date.now = reel;
    }
  });

  // Cas ajouté : un état optimiste en cours (pas encore confirmé) doit être ré-horodaté par
  // la confirmation qui suit, même si HA renvoie littéralement le même texte d'état que celui
  // qu'on avait affiché de manière optimiste — c'est la confirmation elle-même qui est
  // l'information neuve, pas seulement le texte.
  it('ré-horodate changeLe quand une confirmation HA suit un état optimiste identique', () => {
    const e = new Etat();
    let maintenant = 1_000_000;
    const reel = Date.now;
    Date.now = () => maintenant;
    try {
      e.appliquer(ev('light.salon', 'off'));
      const changeLeInitial = e.lire('light.salon')?.changeLe;

      maintenant += 500;
      e.optimiste('light.salon', 'on');

      maintenant += 500;
      e.appliquer(ev('light.salon', 'on'));   // HA confirme, même texte que l'optimiste

      expect(e.lire('light.salon')?.changeLe).not.toBe(changeLeInitial);
      expect(e.lire('light.salon')?.changeLe).toBe(maintenant);
      expect(e.confirme('light.salon')).toBe(true);
    } finally {
      Date.now = reel;
    }
  });

  /** Root cause de la panne « Fully redémarre en boucle » (2026-08-20). `Etat.appliquer` était
   *  rappelé pour CHAQUE état poussé, et notifiait sur-le-champ — donc `dessiner()` redessinait
   *  l'écran entier une fois par entité. À chaque connexion websocket, `get_states` republie les
   *  1708 entités de l'installation dans un SEUL message : mesuré dans un vrai navigateur
   *  (`outils/mesurer-salve.mjs`), cela faisait 1712 recalculs de style, 1712 mises en page et
   *  28 149 nœuds DOM créés en une seconde, pour 2,44 s de temps de script sur un x86 moderne —
   *  soit des dizaines de secondes sur les Fire 7 des tablettes, qui se faisaient tuer par
   *  Android pendant cette rafale, redémarraient, et repartaient pour une salve.
   *
   *  La règle : plusieurs états appliqués dans la même tâche ne valent qu'UN redessin. */
  it('ne redessine qu\'une fois pour une salve d\'états reçue d\'un bloc (get_states)', async () => {
    const e = new Etat();
    const cb = vi.fn();
    e.surMaj(cb);

    for (let i = 0; i < 1708; i++) e.appliquer(ev(`sensor.entite_${i}`, 'ok'));

    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
    // La salve reste intégralement appliquée : c'est le rendu qu'on coalesce, jamais la donnée.
    expect(e.lire('sensor.entite_1707')?.etat).toBe('ok');
  });

  it('redessine de nouveau pour un état reçu dans une tâche ultérieure', async () => {
    const e = new Etat();
    const cb = vi.fn();
    e.surMaj(cb);

    e.appliquer(ev('light.salon', 'on'));
    await Promise.resolve();
    e.appliquer(ev('light.salon', 'off'));
    await Promise.resolve();

    expect(cb).toHaveBeenCalledTimes(2);
  });

  /** Le retour tactile optimiste (`interaction.ts`) doit rester perceptiblement immédiat : la
   *  coalescence passe par une microtâche, donc le redessin a lieu avant que le navigateur ne
   *  peigne la frame suivante — jamais au tic suivant d'un minuteur. */
  it('notifie aussi pour un état optimiste, dans la même microtâche', async () => {
    const e = new Etat();
    const cb = vi.fn();
    e.surMaj(cb);

    e.optimiste('light.salon', 'on');
    expect(cb).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
