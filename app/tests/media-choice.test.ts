import { describe, it, expect } from 'vitest';
import { pickSource, sourcesElsewhere } from '../src/media-choice';
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
    const r = pickSource([], [src('far', true, false)], 'far');
    expect(r.source?.nom).toBe('far');
    expect(r.remote).toBe(true);
  });

  it('pin is ignored once the pinned source is idle', () => {
    expect(pickSource([], [src('far', false, false)], 'far').source).toBeUndefined();
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
