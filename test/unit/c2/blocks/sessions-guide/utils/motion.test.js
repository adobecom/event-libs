import { expect } from '@esm-bundle/chai';
import { prefersReducedMotion, scrollBehavior } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/motion.js';

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
});
