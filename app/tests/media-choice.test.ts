import { describe, it, expect } from 'vitest';
import { pickSource, settlePin, sourceKey, sourcesElsewhere } from '../src/media-choice';
import type { DeclarationSource, SourceResolue } from '../src/media';

function decl(nom: string, ...entites: string[]): DeclarationSource {
  return { nom, titre: entites, sousTitre: [], affiche: [], progression: [], transport: [], volume: [] };
}

function src(nom: string, joue: boolean, active: boolean): SourceResolue {
  return { nom, joue, active, allumee: false, titre: nom, sousTitre: '' };
}

describe('pickSource', () => {
  it('own playing source wins over a remote playing one', () => {
    const r = pickSource([src('own', true, true)], [src('far', true, true)]);
    expect(r.source?.nom).toBe('own');
    expect(r.remote).toBe(false);
  });

  it('a remote playing source is picked when no own source plays', () => {
    const r = pickSource([src('own', false, false)], [src('far', true, true)]);
    expect(r.source?.nom).toBe('far');
    expect(r.remote).toBe(true);
  });

  it('a remote paused source does not count as playing', () => {
    expect(pickSource([], [src('far', true, false)]).source).toBeUndefined();
  });

  it('a remote paused source stays shown when pinned', () => {
    const r = pickSource([], [src('far', true, false)], sourceKey(src('far', true, false)));
    expect(r.source?.nom).toBe('far');
    expect(r.remote).toBe(true);
  });

  it('pin is ignored once the pinned source is idle', () => {
    expect(pickSource([], [src('far', false, false)], sourceKey(src('far', false, false))).source).toBeUndefined();
  });

  it('a pinned paused remote source beats another remote source that plays', () => {
    // Pausing the bedroom from here while the bathroom plays: the play button must stay under
    // the finger, so the pin outranks the first active remote source.
    const bathroom = { ...src('Musique', true, true), piece: 'Salle de bain' };
    const bedroom = { ...src('Musique', true, false), piece: 'Chambre' };
    const r = pickSource([], [bathroom, bedroom], sourceKey(bedroom));
    expect(r.source?.piece).toBe('Chambre');
    expect(r.remote).toBe(true);
  });

  it('an own paused source beats a remote playing one and a pinned one', () => {
    const far = src('far', true, false);
    const r = pickSource([src('own', true, false)], [src('loud', true, true), far], sourceKey(far));
    expect(r.source?.nom).toBe('own');
    expect(r.remote).toBe(false);
  });

  it('declared house order breaks ties between remote sources', () => {
    const r = pickSource([], [src('a', true, true), src('b', true, true)]);
    expect(r.source?.nom).toBe('a');
  });
});

describe('sourcesElsewhere', () => {
  it('an entity already among own sources is excluded from elsewhere', () => {
    const own = [decl('tv', 'media_player.tv')];
    const house = [decl('tv again', 'media_player.x', 'media_player.tv'), decl('kitchen', 'media_player.k')];
    expect(sourcesElsewhere(house, own).map((d) => d.nom)).toEqual(['kitchen']);
  });
});

describe('settlePin', () => {
  const far = (active: boolean) => src('far', true, active);
  const key = sourceKey(far(false));

  it('keeps the pin, marked paused, while the pinned remote source is shown paused', () => {
    expect(settlePin({ source: far(false), remote: true }, { key, paused: false }))
      .toEqual({ key, paused: true });
  });

  it('keeps the pin while the pause has not landed yet (the source still plays)', () => {
    // A frame painted between the tap and Home Assistant's `paused` must not drop the pin.
    expect(settlePin({ source: far(true), remote: true }, { key, paused: false }))
      .toEqual({ key, paused: false });
  });

  it('drops the pin once the pinned source plays again after its pause', () => {
    // The pin was set for one pause; once that source is active again it needs none.
    expect(settlePin({ source: far(true), remote: true }, { key, paused: true })).toBeUndefined();
  });

  it('drops the pin once nothing is shown', () => {
    expect(settlePin({ remote: false }, { key, paused: true })).toBeUndefined();
  });

  it('drops the pin once an own source plays', () => {
    expect(settlePin({ source: src('mine', true, true), remote: false }, { key, paused: true }))
      .toBeUndefined();
  });

  it('drops the pin once another remote source is shown', () => {
    expect(settlePin({ source: src('other', true, true), remote: true }, { key, paused: true }))
      .toBeUndefined();
  });
});

describe('sourceKey — a pin names a source in its room, not just by name', () => {
  it('two paused remote sources with the same nom: the pinned room is shown and stays pinned', () => {
    const office = { ...src('TV', true, false), piece: 'Bureau' };
    const bedroom = { ...src('TV', true, false), piece: 'Chambre' };
    const pin = sourceKey(bedroom);
    const shown = pickSource([], [office, bedroom], pin);
    expect(shown.source?.piece).toBe('Chambre');
    expect(settlePin(shown, { key: pin, paused: true })).toEqual({ key: pin, paused: true });
    // The office TV shown instead would drop the bedroom pin.
    expect(settlePin({ source: office, remote: true }, { key: pin, paused: true })).toBeUndefined();
  });
});
