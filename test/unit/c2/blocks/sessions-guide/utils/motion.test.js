import { expect } from '@esm-bundle/chai';
import {
  PAGE_SCROLL_DURATION_S, prefersReducedMotion, scrollBehavior, scrollPageToTop,
} from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/motion.js';

describe('sessions-guide/utils/motion', () => {
  let originalMatchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function stubReduceMotion(matches) {
    window.matchMedia = (query) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
    });
  }

  it('reports the reduce preference when the query matches', () => {
    stubReduceMotion(true);
    expect(prefersReducedMotion()).to.equal(true);
    expect(scrollBehavior()).to.equal('auto');
  });

  it('reports no preference when the query does not match', () => {
    stubReduceMotion(false);
    expect(prefersReducedMotion()).to.equal(false);
    expect(scrollBehavior()).to.equal('smooth');
  });

  it('falls back to animating when matchMedia is unavailable', () => {
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).to.equal(false);
    expect(scrollBehavior()).to.equal('smooth');
  });

  describe('scrollPageToTop', () => {
    let originalScrollTo;
    let calls;

    beforeEach(() => {
      originalScrollTo = window.scrollTo;
      calls = [];
      window.scrollTo = (opts) => calls.push(['window', opts]);
    });

    afterEach(() => {
      window.scrollTo = originalScrollTo;
      delete window.lenis;
    });

    it('uses native window.scrollTo when Lenis is not on the page', () => {
      stubReduceMotion(false);
      scrollPageToTop();
      expect(calls).to.deep.equal([['window', { top: 0, behavior: 'smooth' }]]);
    });

    // A native scrollTo is overridden by Lenis on its next frame while it eases a wheel scroll.
    it('routes through Lenis when present so its momentum cannot cancel the jump', () => {
      stubReduceMotion(false);
      window.lenis = { scrollTo: (target, opts) => calls.push(['lenis', target, opts]) };
      scrollPageToTop();
      expect(calls).to.deep.equal([['lenis', 0, { immediate: false, duration: PAGE_SCROLL_DURATION_S, force: true }]]);
    });

    it('jumps immediately through Lenis under reduced motion', () => {
      stubReduceMotion(true);
      window.lenis = { scrollTo: (target, opts) => calls.push(['lenis', target, opts]) };
      scrollPageToTop();
      expect(calls).to.deep.equal([['lenis', 0, { immediate: true, duration: PAGE_SCROLL_DURATION_S, force: true }]]);
    });
  });
});
