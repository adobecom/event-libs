import { expect } from '@esm-bundle/chai';
import {
  trackBroadcastEvent,
  getEntryPoint,
} from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/utils/broadcast-analytics.js';

describe('broadcast-analytics', () => {
  describe('getEntryPoint', () => {
    const originalReferrer = document.referrer;

    afterEach(() => {
      Object.defineProperty(document, 'referrer', { value: originalReferrer, configurable: true });
    });

    it('returns "direct" when there is no referrer', () => {
      Object.defineProperty(document, 'referrer', { value: '', configurable: true });
      expect(getEntryPoint()).to.equal('direct');
    });

    it('returns "external" for a cross-origin referrer', () => {
      Object.defineProperty(document, 'referrer', { value: 'https://example.com/somewhere', configurable: true });
      expect(getEntryPoint()).to.equal('external');
    });

    it('returns "session-guide" for a same-origin referrer path mentioning session', () => {
      Object.defineProperty(document, 'referrer', {
        value: `${window.location.origin}/max/2026/sessions.html`,
        configurable: true,
      });
      expect(getEntryPoint()).to.equal('session-guide');
    });

    it('returns "homepage" for any other same-origin referrer', () => {
      Object.defineProperty(document, 'referrer', {
        value: `${window.location.origin}/max/2026/`,
        configurable: true,
      });
      expect(getEntryPoint()).to.equal('homepage');
    });
  });

  describe('trackBroadcastEvent', () => {
    // No mocked sendAnalytics exists at test time — the dynamic import of Milo's modal.js
    // rejects (network access is restricted to localhost in this harness), which the
    // function swallows and logs via window.lana?.log. This only guards the call contract:
    // it never throws synchronously regardless of how the async import resolves.
    it('never throws synchronously, even though the analytics import will fail under test', () => {
      expect(() => trackBroadcastEvent('Test-Event')).to.not.throw();
    });
  });
});
