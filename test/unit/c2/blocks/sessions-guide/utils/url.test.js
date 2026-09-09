import { expect } from '@esm-bundle/chai';
import { isSamePage, sessionUrlSlug, sessionParamValue, findSessionByParam } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/url.js';

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

    it('is true for a different pathname when ?pretend-broadcast=true is set', () => {
      const basePath = window.location.pathname;
      history.replaceState(null, '', `${basePath}?pretend-broadcast=true`);
      expect(isSamePage('/some-other-page.html')).to.be.true;
      history.replaceState(null, '', basePath);
    });
  });

  // ?session= carries the last path segment of the session's own page url, which the
  // catalog has already slugified from enTitle + sessionCode -- so there is no second slug
  // to keep in step with it.
  describe('sessionUrlSlug', () => {
    it('takes the last path segment of an absolute catalog url', () => {
      expect(sessionUrlSlug('https://www.adobe.com/max/2026/sessions/acom-ipod-test-session-no-mpc-1003-1'))
        .to.equal('acom-ipod-test-session-no-mpc-1003-1');
    });

    it('is unaffected by the per-env host rewrite', () => {
      expect(sessionUrlSlug('https://www.stage.adobe.com/max/2026/sessions/chop-it-up-os300'))
        .to.equal('chop-it-up-os300');
    });

    it('handles a root-relative authored url', () => {
      expect(sessionUrlSlug('/sessions/building-with-ai')).to.equal('building-with-ai');
    });

    it('strips a trailing .html', () => {
      expect(sessionUrlSlug('https://www.adobe.com/max/2026/sessions/already-html-s004.html'))
        .to.equal('already-html-s004');
    });

    it('ignores query and hash', () => {
      expect(sessionUrlSlug('/sessions/max-keynote?foo=bar#baz')).to.equal('max-keynote');
    });

    it('never mistakes the host for a segment when there is no path', () => {
      expect(sessionUrlSlug('https://www.adobe.com/')).to.equal('');
      expect(sessionUrlSlug('https://www.adobe.com')).to.equal('');
    });

    it('resolves a trailing slash to the segment before it', () => {
      expect(sessionUrlSlug('https://www.adobe.com/max/2026/sessions/acom-1003-1/')).to.equal('acom-1003-1');
    });

    it('is empty for an absent url', () => {
      expect(sessionUrlSlug('')).to.equal('');
      expect(sessionUrlSlug(undefined)).to.equal('');
    });
  });

  describe('sessionParamValue / findSessionByParam round trip', () => {
    const withUrl = {
      id: '001a8052-454d-484a-9f9f-ac4af2fbdc00',
      sessionPageUrl: 'https://www.adobe.com/max/2026/sessions/acom-ipod-test-session-no-mpc-1003-1',
    };
    // Mock fixtures and hand-authored rows can arrive with no url at all.
    const noUrl = { id: 'ecee71d7-a72c-4974-a8ec-d15402189763', sessionPageUrl: '' };
    const all = [withUrl, noUrl];

    it('is the url slug', () => {
      expect(sessionParamValue(withUrl)).to.equal('acom-ipod-test-session-no-mpc-1003-1');
    });

    it('falls back to the session id when there is no url', () => {
      expect(sessionParamValue(noUrl)).to.equal(noUrl.id);
    });

    it('is empty for a session with neither', () => {
      expect(sessionParamValue({})).to.equal('');
    });

    it('resolves a session written by url slug', () => {
      expect(findSessionByParam(all, sessionParamValue(withUrl))).to.equal(withUrl);
    });

    it('resolves a session written by id, dashes and all', () => {
      expect(findSessionByParam(all, sessionParamValue(noUrl))).to.equal(noUrl);
    });

    it('resolves a bare session id, so an id-shaped param still opens', () => {
      expect(findSessionByParam(all, withUrl.id)).to.equal(withUrl);
    });

    it('does not match a url-less session against a partial param', () => {
      expect(findSessionByParam(all, 'ac4af2fbdc00')).to.be.null;
      expect(findSessionByParam(all, '')).to.be.null;
    });

    it('is null when nothing matches', () => {
      expect(findSessionByParam(all, 'no-such-session')).to.be.null;
    });
  });
});
