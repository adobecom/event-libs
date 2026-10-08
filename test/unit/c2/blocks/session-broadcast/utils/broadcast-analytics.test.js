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
    let calls;
    let originalSatellite;

    beforeEach(() => {
      calls = [];
      // eslint-disable-next-line no-underscore-dangle
      originalSatellite = window._satellite;
    });

    afterEach(() => {
      // eslint-disable-next-line no-underscore-dangle
      window._satellite = originalSatellite;
    });

    it('sends the same payload shape as Milo modal.js sendAnalytics', () => {
      // eslint-disable-next-line no-underscore-dangle
      window._satellite = { track: (...args) => calls.push(args) };
      trackBroadcastEvent('Broadcast-Page-View | direct');
      expect(calls).to.deep.equal([['event', {
        xdm: {},
        data: { web: { webInteraction: { name: 'Broadcast-Page-View | direct' } } },
      }]]);
    });

    it('waits for alloy_sendEvent when Launch is not ready yet', () => {
      // eslint-disable-next-line no-underscore-dangle
      window._satellite = undefined;
      trackBroadcastEvent('Broadcast-Play-Start | s-1');
      expect(calls).to.have.length(0);

      // eslint-disable-next-line no-underscore-dangle
      window._satellite = { track: (...args) => calls.push(args) };
      window.dispatchEvent(new Event('alloy_sendEvent'));
      window.dispatchEvent(new Event('alloy_sendEvent'));
      expect(calls).to.have.length(1);
      expect(calls[0][1].data.web.webInteraction.name).to.equal('Broadcast-Play-Start | s-1');
    });

    // Regression (MWPW-210384): Milo's classic modal.js registers a page-wide hashchange
    // handler on import, which doubled every modal on C2 pages and leaked a scroll lock.
    it('never loads Milo\'s classic modal module', () => {
      // eslint-disable-next-line no-underscore-dangle
      window._satellite = { track: () => {} };
      trackBroadcastEvent('Test-Event');
      const loaded = performance.getEntriesByType('resource').map((e) => e.name);
      expect(loaded.some((n) => n.includes('/blocks/modal/modal.js'))).to.be.false;
    });

    it('never throws, even if tracking fails', () => {
      // eslint-disable-next-line no-underscore-dangle
      window._satellite = { track: () => { throw new Error('boom'); } };
      expect(() => trackBroadcastEvent('Test-Event')).to.not.throw();
    });
  });
});
