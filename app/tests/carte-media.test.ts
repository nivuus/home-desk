// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'lit';
import { rendreCarteMedia, urlSure, brancherMedia, writeProgress, formatMediaTime }
  from '../src/rendu/media';
import { sourceKey } from '../src/media-choice';
import type { SourceResolue } from '../src/media';
import type { ToneState } from '../src/rendu/poster-sampler';
import type { CardTones } from '../src/tones';
import { PENDING_MS } from '../src/rendu/media-volume';

const BASE: SourceResolue = {
  nom: 'Télévision', piece: 'Chambre', joue: true, active: true, allumee: true,
  titre: 'Les trois Mousquetaires', sousTitre: 'Ash vs Evil Dead',
  affiche: '/api/vignette?url=abc',
  // Without `majLe`, no catch-up: the card sits exactly on the raw position.
  progression: { position: 300, duree: 1200, avance: true },
  transport: { entite: 'media_player.tv', peutPause: true, peutLecture: true, peutPrecedent: true,
               peutSuivant: true, enLecture: true },
  volume: { entite: 'media_player.philips', niveau: 0.4, parPas: false },
};

const TONES: CardTones = {
  text: '#101010', primary: '#303030', onPrimary: '#fafafa', secondary: '#e0e0e0',
  onSecondary: '#101010', worstContrast: 7,
};
const READY: ToneState = { status: 'ready', tones: TONES };
const PENDING: ToneState = { status: 'pending' };

let hote: HTMLElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); });

function rendre(s: SourceResolue, tones: ToneState = READY, remote = false, maintenantMs = 0) {
  render(rendreCarteMedia(s, maintenantMs, tones, remote), hote);
  return hote.querySelector<HTMLElement>('.media')!;
}

describe('media card — layout', () => {
  it('label names the room of a remote source', () => {
    expect(rendre(BASE).querySelector('.t')!.textContent).toBe('EN COURS · Chambre');
  });

  it('label is EN COURS alone without a room', () => {
    expect(rendre({ ...BASE, piece: undefined }).querySelector('.t')!.textContent).toBe('EN COURS');
  });

  it('keeps the two-line clamp on the title', () => {
    expect(rendre(BASE).querySelector('.v')!.classList.contains('deux-lignes')).toBe(true);
  });

  it('keeps the zone and the motion key of the block', () => {
    const c = rendre(BASE);
    expect(c.dataset.zone).toBe('blocCentral');
    expect(c.dataset.mvt).toBe('bloc:media');
    expect(c.dataset.mvtEtat).toBe('Les trois Mousquetaires');
  });

  it('no progress row without progression', () => {
    const c = rendre({ ...BASE, progression: undefined });
    expect(c.querySelector('.media-progression')).toBeNull();
    expect(c.querySelector('.media-ecoule')).toBeNull();
  });

  it('no transport row without transport', () => {
    expect(rendre({ ...BASE, transport: undefined }).querySelector('.media-transport')).toBeNull();
  });

  it('no transport row when the player can do nothing of what the row offers', () => {
    const c = rendre({ ...BASE, transport: { ...BASE.transport!, enLecture: false,
      peutLecture: false, peutPrecedent: false, peutSuivant: false } });
    expect(c.querySelector('.media-transport')).toBeNull();
  });

  it('shows the three transport buttons, play/pause as the primary disc', () => {
    const boutons = Array.from(rendre(BASE).querySelectorAll('.media-bouton'));
    expect(boutons.map((b) => b.getAttribute('data-mvt')))
      .toEqual(['detail:tr-precedent', 'detail:tr-pause', 'detail:tr-suivant']);
    expect(boutons.map((b) => b.classList.contains('principal'))).toEqual([false, true, false]);
  });

  it('no dead button: no play when the player cannot play', () => {
    const c = rendre({ ...BASE, transport: { ...BASE.transport!, enLecture: false, peutLecture: false } });
    expect(c.querySelectorAll('.media-bouton').length).toBe(2);
  });

  it('no volume row without volume', () => {
    expect(rendre({ ...BASE, volume: undefined }).querySelector('.media-volume')).toBeNull();
  });

  it('no volume row for a settable player that publishes no level', () => {
    // Stepping from an unknown level would invent one.
    const c = rendre({ ...BASE, volume: { entite: 'media_player.philips', parPas: false } });
    expect(c.querySelector('.media-volume')).toBeNull();
  });

  it('step-only volume shows no level', () => {
    const c = rendre({ ...BASE, volume: { entite: 'media_player.tv', parPas: true } });
    expect(c.querySelector('.media-niveau')).toBeNull();
    expect(c.querySelector('.media-jauge')).toBeNull();
    expect(Array.from(c.querySelectorAll('.media-pas')).map((p) => p.getAttribute('data-mvt')))
      .toEqual(['detail:volume-moins', 'detail:volume-plus']);
  });

  it('a known level is written large over its gauge', () => {
    const c = rendre(BASE);
    expect(c.querySelector('.media-niveau-texte')!.textContent).toBe('40 %');
    expect(c.querySelector<HTMLElement>('.media-volume')!.style.getPropertyValue('--niveau')).toBe('0.4');
  });

  it('every text carries a tone box', () => {
    const boites = Array.from(rendre(BASE).querySelectorAll('[data-tone-box]'))
      .map((e) => e.className.split(' ')[0]);
    expect(boites).toEqual(['t', 'v', 'media-sous', 'media-ecoule', 'media-reste', 'media-niveau-texte']);
  });

  it('the plate is always there, on every text box', () => {
    for (const tones of [READY, PENDING]) {
      for (const el of Array.from(rendre(BASE, tones).querySelectorAll('[data-tone-box]'))) {
        expect(el.classList.contains('plaque')).toBe(true);
      }
    }
  });
});

describe('media card — poster tones', () => {
  it('poster layer only when tones are ready', () => {
    expect(rendre(BASE, READY).querySelector('.media-affiche')).not.toBeNull();
    expect(rendre(BASE, PENDING).querySelector('.media-affiche')).toBeNull();
    expect(rendre(BASE, { status: 'unreadable' }).querySelector('.media-affiche')).toBeNull();
    expect(rendre({ ...BASE, affiche: undefined }, READY).querySelector('.media-affiche')).toBeNull();
  });

  it('the poster is a background layer, never an <img>', () => {
    const c = rendre(BASE);
    expect((c.querySelector('.media-affiche') as HTMLElement).style.backgroundImage)
      .toContain('/api/vignette?url=abc');
    expect(c.querySelector('img')).toBeNull();
  });

  it('the tones drive the colours; none are set without them', () => {
    const c = rendre(BASE, READY);
    expect(c.style.getPropertyValue('--mc-text')).toBe('#101010');
    expect(c.style.getPropertyValue('--mc-primary')).toBe('#303030');
    expect(c.style.getPropertyValue('--mc-on-secondary')).toBe('#101010');
    const sans = rendre(BASE, PENDING);
    expect(sans.style.getPropertyValue('--mc-text')).toBe('');
    expect(sans.style.getPropertyValue('--mc-primary')).toBe('');
  });

  it('plate background only when tones carry a plate', () => {
    expect(rendre(BASE, READY).style.getPropertyValue('--mc-plate')).toBe('');
    const c = rendre(BASE, { status: 'ready', tones: { ...TONES, plate: '#eeeeee' } });
    expect(c.style.getPropertyValue('--mc-plate')).toBe('#eeeeee');
  });

  it('the plate rule reads --mc-plate and is transparent by default, the padding unconditional', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/media.css'), 'utf8');
    const regle = /\.media \.plaque\s*\{([^}]*)\}/.exec(css);
    expect(regle, '.media .plaque rule').not.toBeNull();
    expect(regle![1]).toMatch(/background:\s*var\(--mc-plate,\s*transparent\)/);
    expect(regle![1]).toMatch(/padding:/);
  });

  it('no gradient, no opacity on the poster, no veil', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/media.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/gradient\(/);
    const affiche = /\.media-affiche\s*\{([^}]*)\}/.exec(css)![1];
    expect(affiche).not.toMatch(/opacity/);
  });

  it('every .media rule left base.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\.media[\s.:,{-]/);
  });
});

describe('media card — progress', () => {
  it('remaining time is written with a minus sign', () => {
    const c = rendre(BASE);
    expect(c.querySelector('.media-ecoule')!.textContent).toBe('5:00');
    expect(c.querySelector('.media-reste')!.textContent).toBe('−15:00');
  });

  it('formats m:ss, and h:mm:ss beyond an hour', () => {
    expect(formatMediaTime(0)).toBe('0:00');
    expect(formatMediaTime(71.9)).toBe('1:11');
    expect(formatMediaTime(3599)).toBe('59:59');
    expect(formatMediaTime(3600)).toBe('1:00:00');
    expect(formatMediaTime(3725)).toBe('1:02:05');
  });

  it('the first paint already catches up with the time since HA read the position', () => {
    const c = rendre({ ...BASE, progression: { position: 300, duree: 1200, majLe: 1_000_000, avance: true } },
      READY, false, 1_000_000 + 300_000);
    expect(c.style.getPropertyValue('--progression')).toBe('0.5');
    expect(c.querySelector('.media-ecoule')!.textContent).toBe('10:00');
  });

  it('elapsed and remaining follow the progress tick', () => {
    const c = rendre(BASE);
    const ancre = { secondes: 300, duree: 1200, avance: true, ancreMs: 10_000 };
    writeProgress(c, ancre, 10_000 + 61_000, true);
    expect(c.style.getPropertyValue('--progression')).toBe(String(361 / 1200));
    expect(c.querySelector('.media-ecoule')!.textContent).toBe('6:01');
    expect(c.querySelector('.media-reste')!.textContent).toBe('−13:59');
    // lit still owns the text node: the next render (new position from HA) rewrites it.
    render(rendreCarteMedia({ ...BASE, progression: { position: 400, duree: 1200, avance: true } },
      0, READY), hote);
    expect(c.querySelector('.media-ecoule')!.textContent).toBe('6:40');
  });

  it('the tick can write the times without moving the rail', () => {
    const c = rendre(BASE);
    writeProgress(c, { secondes: 300, duree: 1200, avance: true, ancreMs: 0 }, 61_000, false);
    expect(c.style.getPropertyValue('--progression')).toBe('0.25');
    expect(c.querySelector('.media-ecoule')!.textContent).toBe('6:01');
  });
});

describe('media card — actions', () => {
  it('pause on a remote source pins it', () => {
    const act = vi.fn();
    const pin = vi.fn();
    brancherMedia(act, pin);
    const c = rendre(BASE, READY, true);
    c.querySelector('[data-mvt="detail:tr-pause"]')!.dispatchEvent(new Event('pointerdown'));
    expect(pin).toHaveBeenCalledWith(sourceKey(BASE));
    expect(act).toHaveBeenCalledWith('media_player', 'media_pause', 'media_player.tv');
  });

  it('pause on an own source pins nothing', () => {
    const pin = vi.fn();
    brancherMedia(vi.fn(), pin);
    const c = rendre(BASE, READY, false);
    c.querySelector('[data-mvt="detail:tr-pause"]')!.dispatchEvent(new Event('pointerdown'));
    expect(pin).not.toHaveBeenCalled();
  });

  it('+ sets the volume 5 % higher and shows it at once', () => {
    vi.useFakeTimers();
    const act = vi.fn();
    brancherMedia(act, vi.fn(), () => rendre(BASE));
    const c = rendre(BASE);
    const plus = c.querySelector('[data-mvt="detail:volume-plus"]')!;
    plus.dispatchEvent(new Event('pointerdown'));
    plus.dispatchEvent(new Event('pointerup'));
    expect(act).toHaveBeenCalledWith('media_player', 'volume_set', 'media_player.philips',
      { volume_level: 0.45 });
    expect(c.querySelector('.media-niveau-texte')!.textContent).toBe('45 %');
    expect(c.querySelector<HTMLElement>('.media-volume')!.style.getPropertyValue('--niveau')).toBe('0.45');
    // A second press steps from the optimistic level, not from the stale HA one.
    plus.dispatchEvent(new Event('pointerdown'));
    plus.dispatchEvent(new Event('pointerup'));
    expect(act).toHaveBeenLastCalledWith('media_player', 'volume_set', 'media_player.philips',
      { volume_level: 0.5 });
    vi.advanceTimersByTime(PENDING_MS);   // let the optimistic level expire for the other tests
    vi.useRealTimers();
  });

  it('step-only volume calls volume_up / volume_down', () => {
    const act = vi.fn();
    brancherMedia(act, vi.fn());
    const c = rendre({ ...BASE, volume: { entite: 'media_player.tv', parPas: true } });
    c.querySelector('[data-mvt="detail:volume-moins"]')!.dispatchEvent(new Event('pointerdown'));
    expect(act).toHaveBeenCalledWith('media_player', 'volume_down', 'media_player.tv');
  });
});

describe('urlSure (poster hardening)', () => {
  it('neutralises the characters that close url(\'…\')', () => {
    for (const c of ["'", '"', '(', ')']) expect(urlSure(`/a${c}b.png`), c).not.toContain(c);
  });

  it('leaves a normal URL and an already percent-encoded one alone', () => {
    expect(urlSure('/api/media_player_proxy/plex?token=abc&x=1'))
      .toBe('/api/media_player_proxy/plex?token=abc&x=1');
    expect(urlSure('/local/Mon%20affiche.png')).toBe('/local/Mon%20affiche.png');
  });

  it('the rendered attribute cannot leave its CSS declaration', () => {
    const couche = rendre({ ...BASE, affiche: "/x.png');opacity:0;--y:('" })
      .querySelector('.media-affiche') as HTMLElement;
    expect(couche.style.opacity).toBe('');
    expect(couche.style.length, `declarations: ${couche.getAttribute('style')}`).toBe(1);
  });
});
