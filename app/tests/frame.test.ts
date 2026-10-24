import { describe, it, expect } from 'vitest';
import { computeFrame } from '../src/boot/frame';
import type { ScreenState } from '../src/boot/state';
import { resoudreAgencement } from '../src/agencement';
import { Etat } from '../src/etat';
import type { Ecran } from '../src/ecran';
import type { DeclarationSource } from '../src/media';
import { sourceKey } from '../src/media-choice';
import { detect as detectMedia } from '../src/cards/media';
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
    house: { sources: opts.house ?? [], appareils: [] },
    pinnedMedia: opts.pinned === undefined ? undefined : { key: opts.pinned, paused: true },
  } as unknown as ScreenState;
  return computeFrame(s);
}

/** The media cards this frame stacks: media and cinema left the modes for the stack (card-stack
 *  task 6), and the media module reads only the frame. */
const cardTypes = (f: ReturnType<typeof frameOf>) =>
  detectMedia(f, {} as ScreenState).map((c) => c.type);

describe('computeFrame — what plays elsewhere', () => {
  it('frame stacks a media card for a remote playing source', () => {
    const f = frameOf([['media_player.music_bedroom', 'playing']], { house: [music] });
    expect(cardTypes(f)).toEqual(['media']);
    expect(f.mode).toBe('defaut');
    expect(f.ctx.sourceJoue).toBe(true);
    expect(f.media.remote).toBe(true);
    expect(f.media.source?.nom).toBe('Music');
    expect(f.media.source?.piece).toBe('Chambre');
  });

  it('a remote source that is only paused does not take over the tablet', () => {
    const f = frameOf([['media_player.music_bedroom', 'paused']], { house: [music] });
    expect(cardTypes(f)).toEqual([]);
    expect(f.media.source).toBeUndefined();
  });

  it('frame stacks no cinema card for a remote TV that is only on', () => {
    const f = frameOf([['media_player.tv_bedroom', 'on']], { house: [tv] });
    expect(f.ctx.ecranAllume).toBe(false);
    expect(cardTypes(f)).not.toContain('cinema');
    // Control: the very same TV declared as the screen's OWN source does stack a cinema card.
    expect(cardTypes(frameOf([['media_player.tv_bedroom', 'on']], { own: [tv] }))).toContain('cinema');
  });

  it('frame keeps the media card on the tablet that paused a remote source', () => {
    const f = frameOf([['media_player.music_bedroom', 'paused']], { house: [music], pinned: sourceKey(music) });
    expect(cardTypes(f)).toEqual(['media']);
    expect(f.media).toMatchObject({ remote: true, source: { nom: 'Music' } });
  });

  it('the pinned paused source stays shown while another room plays', () => {
    // Bathroom listed first in the house and playing; the bedroom was paused from here.
    const bathroom = decl('Music', 'media_player.music_bathroom', { piece: 'Salle de bain' });
    const f = frameOf(
      [['media_player.music_bathroom', 'playing'], ['media_player.music_bedroom', 'paused']],
      { house: [bathroom, music], pinned: sourceKey(music) },
    );
    expect(f.media).toMatchObject({ remote: true, source: { piece: 'Chambre' } });
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
