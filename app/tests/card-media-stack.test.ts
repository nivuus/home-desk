// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { detect, frame } from '../src/cards/media';
import { mediaFrame } from '../src/rendu/media';
import { sourceKey } from '../src/media-choice';
import { frameWith, screenWith, source, T0 } from './card-aides';

const s = screenWith();
const music = source({ nom: 'Music', piece: 'Bedroom', titre: 'Song' });
const tv = source({ nom: 'TV', piece: 'Living', allumee: true, titre: 'Film' });

describe('media cards — detect', () => {
  it('a playing source is a rank-3 media card keyed by the source', () => {
    expect(detect(frameWith({ media: { source: music, remote: false } }), s))
      .toEqual([{ key: `media:${sourceKey(music)}`, type: 'media', rank: 3 }]);
  });
  it('a source whose screen is on is a rank-3 cinema card', () => {
    expect(detect(frameWith({ sources: [tv], media: { source: tv, remote: false } }), s))
      .toEqual([{ key: `cinema:${sourceKey(tv)}`, type: 'cinema', rank: 3 }]);
  });
  it('music and a film together are two cards', () => {
    const f = frameWith({ sources: [tv], media: { source: music, remote: false } });
    expect(detect(f, s).map((c) => c.type).sort()).toEqual(['cinema', 'media']);
  });
  it('nothing plays, no card', () => { expect(detect(frameWith(), s)).toEqual([]); });
});

describe('media cards — frame', () => {
  it('delegates to the existing media card, under the card key', () => {
    const f = frameWith({ media: { source: music, remote: true } });
    const c = detect(f, s)[0];
    expect(frame(c, f, s)).toEqual({ ...mediaFrame(music, T0, { status: 'pending' }, true), key: c.key });
  });
  it('a cinema card draws its own source, never the remote flag', () => {
    const f = frameWith({ sources: [tv], media: { source: music, remote: true } });
    const c = detect(f, s).find((x) => x.type === 'cinema')!;
    const fr = frame(c, f, s);
    expect(fr.title).toBe('Film');
    expect(fr.key).toBe(c.key);
  });
  it('refuses a card whose source is gone', () => {
    expect(() => frame({ key: 'media:["","x"]', type: 'media', rank: 3 }, frameWith(), s)).toThrow(/media/);
  });
});
