import { expect } from '@esm-bundle/chai';
import {
  rectsOverlap, isOverPlayer, watchPlayerOverlap,
} from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/use-player-overlap.js';

describe('sessions-guide/utils/use-player-overlap', () => {
  let originalMatchMedia;
  let fab;
  let player;

  function stubDesktop(matches) {
    window.matchMedia = (query) => ({ matches: query === '(min-width: 1280px)' ? matches : false, media: query });
  }

  function place(el, { top, height }) {
    Object.assign(el.style, {
      position: 'fixed', left: '0px', width: '200px', top: `${top}px`, height: `${height}px`,
    });
  }

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    document.body.innerHTML = '<div class="sb-player__mount"></div><button class="sg-cta-btn"></button>';
    player = document.querySelector('.sb-player__mount');
    fab = document.querySelector('.sg-cta-btn');
    place(player, { top: 0, height: 400 });
    place(fab, { top: 380, height: 50 });
    stubDesktop(true);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = '';
  });

  describe('rectsOverlap', () => {
    const box = (top, bottom, left = 0, right = 100) => ({
      top, bottom, left, right,
    });

    it('detects intersecting rects', () => {
      expect(rectsOverlap(box(0, 100), box(90, 140))).to.equal(true);
    });

    it('treats touching edges as not overlapping', () => {
      expect(rectsOverlap(box(0, 100), box(100, 140))).to.equal(false);
    });

    it('requires horizontal overlap too', () => {
      expect(rectsOverlap(box(0, 100), box(50, 140, 100, 200))).to.equal(false);
    });
  });

  describe('isOverPlayer', () => {
    [
      '<div class="sb-player__mount"></div>',
      '<div class="session-video-player"></div>',
      '<div class="milo-video"></div>',
      '<div class="embed-vimeo"></div>',
      '<div class="youtube-stream"></div>',
      '<div class="youtube-video-container"></div>',
      '<div class="mobile-rider-player"></div>',
      '<video controls></video>',
    ].forEach((markup) => {
      it(`detects ${markup}`, () => {
        player.remove();
        document.body.insertAdjacentHTML('afterbegin', markup);
        place(document.body.firstElementChild, { top: 0, height: 400 });
        expect(isOverPlayer(fab)).to.equal(true);
      });
    });

    it('ignores background videos without controls and hidden players', () => {
      player.remove();
      document.body.insertAdjacentHTML('afterbegin', '<video autoplay muted loop></video><div class="mobile-rider-player" style="display:none"></div>');
      place(document.querySelector('video'), { top: 0, height: 400 });
      expect(isOverPlayer(fab)).to.equal(false);
    });

    it('is true on desktop when the FAB sits over a player', () => {
      expect(isOverPlayer(fab)).to.equal(true);
    });

    it('is false once the player is clear of the FAB', () => {
      place(player, { top: 0, height: 380 });
      expect(isOverPlayer(fab)).to.equal(false);
    });

    it('is false below the desktop breakpoint even when overlapping', () => {
      stubDesktop(false);
      expect(isOverPlayer(fab)).to.equal(false);
    });

    it('is false with no player on the page or no FAB element', () => {
      player.remove();
      expect(isOverPlayer(fab)).to.equal(false);
      expect(isOverPlayer(null)).to.equal(false);
    });
  });

  // rAF and ResizeObserver don't fire reliably in background tabs of the concurrent run,
  // so both are replaced with manually flushed fakes.
  describe('watchPlayerOverlap', () => {
    let originalRaf;
    let originalCaf;
    let originalRO;
    let frames;
    let resizeCallbacks;

    const flushFrames = () => {
      const pending = frames;
      frames = [];
      pending.forEach((cb) => cb());
    };

    beforeEach(() => {
      originalRaf = window.requestAnimationFrame;
      originalCaf = window.cancelAnimationFrame;
      originalRO = window.ResizeObserver;
      frames = [];
      resizeCallbacks = [];
      window.requestAnimationFrame = (cb) => frames.push(cb);
      window.cancelAnimationFrame = () => {};
      window.ResizeObserver = class {
        constructor(cb) { this.cb = cb; }

        observe() { resizeCallbacks.push(this.cb); }

        disconnect() { resizeCallbacks = resizeCallbacks.filter((c) => c !== this.cb); }
      };
    });

    afterEach(() => {
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCaf;
      window.ResizeObserver = originalRO;
    });

    it('reports immediately, then re-checks on scroll and stops after cleanup', () => {
      const calls = [];
      const cleanup = watchPlayerOverlap(() => fab, (v) => calls.push(v));
      expect(calls).to.deep.equal([true]);

      place(player, { top: 0, height: 300 });
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
      expect(frames.length).to.equal(1);
      flushFrames();
      expect(calls).to.deep.equal([true, false]);

      cleanup();
      window.dispatchEvent(new Event('scroll'));
      expect(frames.length).to.equal(0);
      expect(resizeCallbacks.length).to.equal(0);
    });

    it('re-checks when the page layout resizes (player mounting late)', () => {
      player.remove();
      const calls = [];
      const cleanup = watchPlayerOverlap(() => fab, (v) => calls.push(v));
      expect(calls).to.deep.equal([false]);

      const late = document.createElement('div');
      late.className = 'milo-video';
      place(late, { top: 0, height: 420 });
      document.body.append(late);
      resizeCallbacks.forEach((cb) => cb());
      flushFrames();
      expect(calls.at(-1)).to.equal(true);
      cleanup();
    });
  });
});
