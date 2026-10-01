import { expect } from '@esm-bundle/chai';
import { toPagePath, MAX_EVENT_PAGES } from '../../../event-libs/v1/utils/constances.js';

// adobe.com serves pages at `.html`; aem.page/aem.live 404 on it. Paths follow whichever form
// the current page was served with.
describe('utils/constances toPagePath', () => {
  const original = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const servedAt = (path) => window.history.replaceState(null, '', path);
  afterEach(() => servedAt(original));

  describe('on an extensionless page (aem.page / aem.live)', () => {
    beforeEach(() => servedAt('/max/2026/sessions'));

    it('strips an authored .html', () => {
      expect(toPagePath('/summit/broadcast.html')).to.equal('/summit/broadcast');
    });

    it('keeps an extensionless path as-is', () => {
      expect(toPagePath('/summit/broadcast')).to.equal('/summit/broadcast');
    });

    it('preserves query and hash', () => {
      expect(toPagePath('/summit.html?watch=s1#live')).to.equal('/summit?watch=s1#live');
    });

    it('resolves MAX defaults without .html', () => {
      expect(MAX_EVENT_PAGES.homepage).to.equal('/max');
      expect(MAX_EVENT_PAGES.broadcast).to.equal('/max/2026/broadcast');
      expect(MAX_EVENT_PAGES.sessionGuide).to.equal('/max/2026/sessions');
    });
  });

  describe('on a page served with .html (adobe.com)', () => {
    beforeEach(() => servedAt('/max/2026/sessions.html'));

    it('appends .html to an extensionless path', () => {
      expect(toPagePath('/summit/broadcast')).to.equal('/summit/broadcast.html');
    });

    it('does not double an authored .html', () => {
      expect(toPagePath('/summit/broadcast.html')).to.equal('/summit/broadcast.html');
    });

    it('rewrites a same-origin absolute URL, keeping it absolute', () => {
      expect(toPagePath(`${window.location.origin}/summit?a=1`)).to.equal(`${window.location.origin}/summit.html?a=1`);
    });

    it('resolves MAX defaults with .html', () => {
      expect(MAX_EVENT_PAGES.homepage).to.equal('/max.html');
      expect(MAX_EVENT_PAGES.broadcast).to.equal('/max/2026/broadcast.html');
      expect(MAX_EVENT_PAGES.sessionGuide).to.equal('/max/2026/sessions.html');
    });

    it('leaves cross-origin URLs, folders, other extensions and empty values untouched', () => {
      expect(toPagePath('https://www.adobe.com/max')).to.equal('https://www.adobe.com/max');
      expect(toPagePath('/max/2026/')).to.equal('/max/2026/');
      expect(toPagePath('/files/guide.pdf')).to.equal('/files/guide.pdf');
      expect(toPagePath('summit')).to.equal('summit');
      expect(toPagePath('')).to.equal('');
      expect(toPagePath(undefined)).to.equal(undefined);
    });
  });
});
