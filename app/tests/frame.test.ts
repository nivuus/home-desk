import { describe, it, expect } from 'vitest';
import { computeFrame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { resoudreAgencement } from '../src/agencement';
import { Etat } from '../src/etat';
import type { Ecran } from '../src/ecran';
import type { DeclarationSource } from '../src/media';
import { ecranVide } from './aides';

function decl(nom: string, entite: string, extra: Partial<DeclarationSource> = {}): DeclarationSource {
  return { nom, titre: [entite], sousTitre: [], affiche: [], progression: [entite],
           transport: [entite], volume: [], ...extra };
}

const music = decl('Music', 'media_player.music_bedroom', { piece: 'Chambre' });
const tv = decl('TV', 'media_player.tv_bedroom', {
  piece: 'Chambre', allumee: { entite: 'media_player.tv_bedroom', etats: ['on', 'playing', 'paused'] },
});

/** Just what `computeFrame` reads from a mounted screen, at 14:00 (never the night screen). */
function frameOf(states: [string, string][], opts: {
  own?: DeclarationSource[]; house?: DeclarationSource[]; pinned?: string;
} = {}) {
  const etat = new Etat();
  for (const [entity_id, state] of states) etat.appliquer({ entity_id, state, attributes: {} });
  const piece: Ecran = { ...ecranVide, sources: opts.own ?? [] };
  const s = {
    etat, piece, agencement: resoudreAgencement(piece), recetteUid: null,
    d: { maintenant: () => new Date(2026, 7, 1, 14, 0) },
    house: opts.house ?? [], pinnedMedia: opts.pinned,
  } as unknown as ScreenState;
  return computeFrame(s);
}

describe('computeFrame — what plays elsewhere', () => {
  it('frame enters media mode for a remote playing source', () => {
    const f = frameOf([['media_player.music_bedroom', 'playing']], { house: [music] });
    expect(f.mode).toBe('media');
    expect(f.ctx.sourceJoue).toBe(true);
    expect(f.media.remote).toBe(true);
    expect(f.media.source?.nom).toBe('Music');
    expect(f.media.source?.piece).toBe('Chambre');
  });

  it('a remote source that is only paused does not take over the tablet', () => {
    const f = frameOf([['media_player.music_bedroom', 'paused']], { house: [music] });
    expect(f.mode).not.toBe('media');
    expect(f.media.source).toBeUndefined();
  });

  it('frame does not enter cinema for a remote TV that is only on', () => {
    const f = frameOf([['media_player.tv_bedroom', 'on']], { house: [tv] });
    expect(f.ctx.ecranAllume).toBe(false);
    expect(f.mode).not.toBe('cinema');
    // Control: the very same TV declared as the screen's OWN source does enter cinema.
    expect(frameOf([['media_player.tv_bedroom', 'on']], { own: [tv] }).mode).toBe('cinema');
  });

  it('frame keeps media mode on the tablet that paused a remote source', () => {
    const f = frameOf([['media_player.music_bedroom', 'paused']], { house: [music], pinned: 'Music' });
    expect(f.mode).toBe('media');
    expect(f.media).toMatchObject({ remote: true, source: { nom: 'Music' } });
  });

  it('an own playing source wins over a remote one, and is not remote', () => {
    const own = decl('Living', 'media_player.music_living');
    const f = frameOf(
      [['media_player.music_living', 'playing'], ['media_player.music_bedroom', 'playing']],
      { own: [own], house: [music] },
    );
    expect(f.media).toMatchObject({ remote: false, source: { nom: 'Living' } });
  });

  it('a house source that shares an entity with an own source is not followed twice', () => {
    const own = decl('Living', 'media_player.music_bedroom');
    const f = frameOf([['media_player.music_bedroom', 'paused']], { own: [own], house: [music] });
    // Paused own source still counts (ETATS_ACTIFS), and it is the own declaration that shows.
    expect(f.media).toMatchObject({ remote: false, source: { nom: 'Living' } });
  });
});
