import { expect } from '@esm-bundle/chai';
import {
  adjacentCard,
  handOffArrowFocus,
  lastFullyVisible,
  maxPageOffset,
  measureCards,
  previousPageStart,
  scrollEdges,
  scrollToAdjacent,
  watchScrollEdges,
  widthTransitionRunning,
} from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/carousel-nav.js';

// 300px strip, 16px left padding, five 200px cards with 20px gaps: offsets 0, 220, 440, 660, 880.
function buildStrip(count = 5) {
  const strip = document.createElement('div');
  strip.style.cssText = 'display:flex;gap:20px;width:300px;padding-left:16px;overflow-x:auto;box-sizing:border-box;';
  for (let i = 0; i < count; i += 1) {
    const card = document.createElement('div');
    card.style.cssText = 'flex:0 0 200px;height:10px;';
    strip.appendChild(card);
  }
  document.body.appendChild(strip);
  return strip;
}

describe('sessions-guide/utils/carousel-nav', () => {
  let strip;

  afterEach(() => {
    strip?.remove();
    strip = null;
  });

  describe('adjacentCard', () => {
    it('returns null for a missing or empty strip', () => {
      expect(adjacentCard(null, 1)).to.equal(null);
      strip = buildStrip(0);
      expect(adjacentCard(strip, 1)).to.equal(null);
    });

    it('steps to the next card start', () => {
      strip = buildStrip();
      expect(adjacentCard(strip, 1)).to.deep.equal({ index: 1, left: 220 });
      strip.scrollLeft = 220;
      expect(adjacentCard(strip, 1)).to.deep.equal({ index: 2, left: 440 });
    });

    it('steps from a mid-card position to the next and previous card starts', () => {
      strip = buildStrip();
      strip.scrollLeft = 300;
      expect(adjacentCard(strip, 1).index).to.equal(2);
      expect(adjacentCard(strip, -1)).to.deep.equal({ index: 1, left: 220 });
    });

    it('returns null for previous at the start', () => {
      strip = buildStrip();
      expect(adjacentCard(strip, -1)).to.equal(null);
    });

    it('clamps the target to the max scroll position', () => {
      strip = buildStrip();
      const maxScroll = strip.scrollWidth - strip.clientWidth;
      strip.scrollLeft = 660;
      expect(adjacentCard(strip, 1)).to.deep.equal({ index: 4, left: maxScroll });
    });

    it('returns null for next when no card starts ahead', () => {
      strip = buildStrip(1);
      expect(adjacentCard(strip, 1)).to.equal(null);
    });

    it('steps from an explicit position instead of scrollLeft', () => {
      strip = buildStrip();
      expect(adjacentCard(strip, 1, 220)).to.deep.equal({ index: 2, left: 440 });
      expect(adjacentCard(strip, -1, 440)).to.deep.equal({ index: 1, left: 220 });
    });
  });

  describe('scrollToAdjacent', () => {
    let calls;

    beforeEach(() => {
      strip = buildStrip();
      calls = [];
      strip.scrollTo = (opts) => calls.push(opts.left);
    });

    it('returns null for a missing strip or at an end', () => {
      expect(scrollToAdjacent(null, 1, { current: null })).to.equal(null);
      expect(scrollToAdjacent(strip, -1, { current: null })).to.equal(null);
      expect(calls).to.have.length(0);
    });

    it('scrolls to the adjacent card and records it as pending', () => {
      const pendingRef = { current: null };
      expect(scrollToAdjacent(strip, 1, pendingRef)).to.deep.equal({ index: 1, left: 220 });
      expect(calls).to.deep.equal([220]);
      expect(pendingRef.current.left).to.equal(220);
    });

    it('steps from the pending target while a smooth scroll is still running', () => {
      const pendingRef = { current: null };
      scrollToAdjacent(strip, 1, pendingRef);
      // scrollTo is stubbed, so scrollLeft stays at 0, as if mid-animation.
      expect(scrollToAdjacent(strip, 1, pendingRef).index).to.equal(2);
      expect(calls).to.deep.equal([220, 440]);
    });

    it('ignores a pending target that is expired or already reached', () => {
      const expired = { current: { from: 0, left: 440, until: performance.now() - 1 } };
      expect(scrollToAdjacent(strip, 1, expired).index).to.equal(1);
      strip.scrollLeft = 220;
      const reached = { current: { from: 0, left: 220, until: performance.now() + 1000 } };
      expect(scrollToAdjacent(strip, 1, reached).index).to.equal(2);
    });

    it('ignores a pending target once a swipe moves outside the start-to-target range', () => {
      strip.scrollLeft = 220;
      const pendingRef = { current: null };
      scrollToAdjacent(strip, 1, pendingRef); // from 220 toward 440
      strip.scrollLeft = 0; // user swipes back past the start
      expect(scrollToAdjacent(strip, 1, pendingRef).index).to.equal(1);
    });
  });

  describe('handOffArrowFocus', () => {
    let nav;
    let prev;
    let next;
    const pressOf = (button, at = performance.now()) => ({ current: { button, at } });

    beforeEach(() => {
      nav = document.createElement('div');
      prev = document.createElement('button');
      next = document.createElement('button');
      nav.append(prev, document.createElement('div'), next);
      document.body.appendChild(nav);
    });

    afterEach(() => nav.remove());

    it('moves focus to the other arrow when the pressed, focused one is disabled, then forgets the press', () => {
      next.focus();
      next.disabled = true;
      const ref = pressOf(next);
      handOffArrowFocus(ref);
      expect(document.activeElement).to.equal(prev);
      expect(ref.current).to.equal(null);
    });

    it('keeps the press while the arrow is still enabled', () => {
      next.focus();
      const ref = pressOf(next);
      handOffArrowFocus(ref);
      expect(document.activeElement).to.equal(next);
      expect(ref.current).to.not.equal(null);
    });

    it('does not steal focus that moved elsewhere', () => {
      const other = document.createElement('input');
      document.body.appendChild(other);
      other.focus();
      next.disabled = true;
      handOffArrowFocus(pressOf(next));
      expect(document.activeElement).to.equal(other);
      other.remove();
    });

    it('ignores and clears an expired press', () => {
      next.focus();
      next.disabled = true;
      const ref = pressOf(next, performance.now() - 5000);
      handOffArrowFocus(ref);
      expect(document.activeElement).to.not.equal(prev);
      expect(ref.current).to.equal(null);
    });

    it('does nothing when the other arrow is disabled too, or there is no press', () => {
      next.focus();
      next.disabled = true;
      prev.disabled = true;
      handOffArrowFocus(pressOf(next));
      expect(document.activeElement).to.not.equal(prev);
      expect(() => handOffArrowFocus({ current: null })).to.not.throw();
    });
  });

  describe('scrollEdges', () => {
    it('treats a missing strip as both ends', () => {
      expect(scrollEdges(null)).to.deep.equal({ atStart: true, atEnd: true });
    });

    it('reports start, middle and end', () => {
      strip = buildStrip();
      expect(scrollEdges(strip)).to.deep.equal({ atStart: true, atEnd: false });
      strip.scrollLeft = 300;
      expect(scrollEdges(strip)).to.deep.equal({ atStart: false, atEnd: false });
      strip.scrollLeft = strip.scrollWidth;
      expect(scrollEdges(strip)).to.deep.equal({ atStart: false, atEnd: true });
    });

    it('reports both ends when content fits', () => {
      strip = buildStrip(1);
      expect(scrollEdges(strip)).to.deep.equal({ atStart: true, atEnd: true });
    });
  });

  describe('watchScrollEdges', () => {
    let OriginalRO;
    let observers;

    beforeEach(() => {
      OriginalRO = window.ResizeObserver;
      observers = [];
      window.ResizeObserver = class {
        constructor(cb) {
          this.cb = cb;
          this.targets = [];
          this.disconnected = false;
          observers.push(this);
        }

        observe(el) { this.targets.push(el); }

        disconnect() { this.disconnected = true; }
      };
    });

    afterEach(() => {
      window.ResizeObserver = OriginalRO;
    });

    it('returns a no-op cleanup for a missing strip', () => {
      const calls = [];
      const cleanup = watchScrollEdges(null, (e) => calls.push(e));
      expect(cleanup).to.be.a('function');
      cleanup();
      expect(calls).to.have.length(0);
    });

    it('reports immediately, on scroll and on resize, then stops after cleanup', () => {
      strip = buildStrip();
      const calls = [];
      const cleanup = watchScrollEdges(strip, (e) => calls.push(e));
      expect(calls).to.deep.equal([{ atStart: true, atEnd: false }]);
      expect(observers[0].targets).to.have.length(6);

      strip.scrollLeft = strip.scrollWidth;
      strip.dispatchEvent(new Event('scroll'));
      expect(calls.at(-1)).to.deep.equal({ atStart: false, atEnd: true });

      observers[0].cb();
      expect(calls).to.have.length(3);

      cleanup();
      expect(observers[0].disconnected).to.equal(true);
      strip.dispatchEvent(new Event('scroll'));
      expect(calls).to.have.length(3);
    });
  });

  // Mixed widths 427, 379, 379, 427, 379 with 16px gaps -> starts 0, 443, 838, 1233, 1676.
  describe('paged geometry', () => {
    let wrap;
    let layout;
    const WIDTHS = [427, 379, 379, 427, 379];

    beforeEach(() => {
      wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:16px;width:4000px;transform:translateX(-500px);';
      WIDTHS.forEach((w) => {
        const card = document.createElement('div');
        card.style.cssText = `flex:0 0 ${w}px;height:10px;`;
        wrap.appendChild(card);
      });
      document.body.appendChild(wrap);
      layout = measureCards([...wrap.children]);
    });

    afterEach(() => wrap.remove());

    it('measures resting starts/ends relative to the first card, ignoring the transform', () => {
      expect(layout.starts).to.deep.equal([0, 443, 838, 1233, 1676]);
      expect(layout.ends).to.deep.equal([427, 822, 1217, 1660, 2055]);
    });

    it('finds the last fully visible card from any start', () => {
      expect(lastFullyVisible(layout, 0, 1246)).to.equal(2); // 0..1217 fits in 1246
      expect(lastFullyVisible(layout, 0, 1200)).to.equal(1); // card 2 would end at 1217
      expect(lastFullyVisible(layout, 2, 1246)).to.equal(4); // 838..2055 = 1217
      expect(lastFullyVisible(layout, 4, 100)).to.equal(4); // a too-wide card still counts as itself
    });

    it('finds the smallest start from which all remaining cards fit', () => {
      expect(maxPageOffset(layout, 1246)).to.equal(2);
      expect(maxPageOffset(layout, 5000)).to.equal(0);
      expect(maxPageOffset(layout, 100)).to.equal(4);
      expect(maxPageOffset({ starts: [], ends: [] }, 100)).to.equal(0);
    });

    it('finds the previous page start that ends right before the current one', () => {
      expect(previousPageStart(layout, 3, 1246)).to.equal(0); // cards 0..2 end at 1217
      expect(previousPageStart(layout, 4, 900)).to.equal(2); // cards 2..3 span 838..1660 = 822
      expect(previousPageStart(layout, 0, 1246)).to.equal(0);
    });
  });

  describe('widthTransitionRunning', () => {
    it('is true only while a width transition runs inside the element', () => {
      const wrap = document.createElement('div');
      const card = document.createElement('div');
      card.style.cssText = 'width:100px;height:10px;transition:width 300ms linear;';
      wrap.appendChild(card);
      document.body.appendChild(wrap);
      expect(widthTransitionRunning(wrap)).to.equal(false);
      // eslint-disable-next-line no-unused-expressions
      card.offsetWidth; // commit the start width so the change below transitions
      card.style.width = '200px';
      expect(widthTransitionRunning(wrap)).to.equal(true);
      card.style.transition = 'none';
      expect(widthTransitionRunning(wrap)).to.equal(false);
      wrap.remove();
      expect(widthTransitionRunning(null)).to.equal(false);
    });
  });
});
