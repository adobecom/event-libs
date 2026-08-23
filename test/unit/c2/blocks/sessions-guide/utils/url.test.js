import { expect } from '@esm-bundle/chai';
import { isSamePage } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/url.js';

describe('sessions-guide/utils/url', () => {
  describe('isSamePage', () => {
    it('is false for an empty href', () => {
      expect(isSamePage('')).to.be.false;
    });

    it('is true for a root-relative href matching the current pathname', () => {
      expect(isSamePage(window.location.pathname)).to.be.true;
    });

    it('is true for an absolute href on the current origin with a matching pathname', () => {
      expect(isSamePage(`${window.location.origin}${window.location.pathname}`)).to.be.true;
    });

    it('is false for a different pathname', () => {
      expect(isSamePage('/some-other-page.html')).to.be.false;
    });

    it('ignores query/hash when comparing', () => {
      expect(isSamePage(`${window.location.pathname}?foo=bar#baz`)).to.be.true;
    });
  });
});
