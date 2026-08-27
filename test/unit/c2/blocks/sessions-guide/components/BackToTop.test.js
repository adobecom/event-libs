import { expect } from '@esm-bundle/chai';
import { BackToTop, shouldShowBackToTop, scrollToTop } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/BackToTop.js';

describe('BackToTop', () => {
  describe('shouldShowBackToTop', () => {
    it('stays hidden at the top of the list', () => {
      expect(shouldShowBackToTop(0, 900)).to.equal(false);
    });

    it('shows after half a screen of scrolling', () => {
      expect(shouldShowBackToTop(449, 900)).to.equal(false);
      expect(shouldShowBackToTop(451, 900)).to.equal(true);
    });

    it('applies a 240px floor so a short scroller does not reveal it immediately', () => {
      expect(shouldShowBackToTop(200, 300)).to.equal(false);
      expect(shouldShowBackToTop(241, 300)).to.equal(true);
    });

    it('treats a missing viewport height as the floor rather than throwing', () => {
      expect(shouldShowBackToTop(100, undefined)).to.equal(false);
      expect(shouldShowBackToTop(300, undefined)).to.equal(true);
    });
  });

  describe('scrollToTop', () => {
    let originalMatchMedia;

    beforeEach(() => {
      originalMatchMedia = window.matchMedia;
      window.matchMedia = (query) => ({ matches: false, media: query });
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it('scrolls the given scroller to the top, smoothly', () => {
      const calls = [];
      scrollToTop({ scrollTo: (opts) => calls.push(opts) });
      expect(calls).to.deep.equal([{ top: 0, behavior: 'smooth' }]);
    });

    it('honours the reduced-motion preference', () => {
      window.matchMedia = (query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
      });
      const calls = [];
      scrollToTop({ scrollTo: (opts) => calls.push(opts) });
      expect(calls[0].behavior).to.equal('auto');
    });

    it('falls back to the window when no scroller is given', () => {
      const originalScrollTo = window.scrollTo;
      const calls = [];
      window.scrollTo = (opts) => calls.push(opts);
      try {
        scrollToTop(undefined);
      } finally {
        window.scrollTo = originalScrollTo;
      }
      expect(calls).to.deep.equal([{ top: 0, behavior: 'smooth' }]);
    });
  });

  describe('markup', () => {
    it('renders the arrow, the label and the analytics hook', () => {
      const out = BackToTop({});
      expect(out).to.include('sg-back-to-top');
      expect(out).to.include('sg-back-to-top__arrow');
      expect(out).to.include('Back to top');
      expect(out).to.include('daa-ll="Session-Guide-Back-To-Top"');
    });

    it('starts faded out and inert, so it is neither focusable nor announced', () => {
      const out = BackToTop({});
      expect(out).to.not.include('sg-back-to-top--visible');
      expect(out).to.include('inert');
    });

    it('adds the fixed modifier for the full-page surface only', () => {
      expect(BackToTop({ fixed: true })).to.include('sg-back-to-top--fixed');
      expect(BackToTop({})).to.not.include('sg-back-to-top--fixed');
    });
  });
});
