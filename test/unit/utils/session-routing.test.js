import { expect } from '@esm-bundle/chai';
import attachSessionRouting, { resolveCardAction } from '../../../event-libs/v1/utils/session-routing.js';
import { sessionGuideRequest } from '../../../event-libs/v1/utils/session-store.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-07-21T10:00:00.000Z');

const iso = (ms) => new Date(ms).toISOString();

describe('event-card session routing', () => {
  describe('resolveCardAction', () => {
    it('routes an upcoming session to the Session Guide modal', () => {
      const action = resolveCardAction({
        sessionId: 'sess-1',
        sessionUrl: 'https://adobe.com/sessions/s1',
        watchUrl: 'https://adobe.com/watch/s1',
        startTimeUtc: iso(NOW + HOUR),
        endTimeUtc: iso(NOW + 2 * HOUR),
      }, NOW);
      expect(action).to.deep.equal({ type: 'session-guide', sessionId: 'sess-1' });
    });

    it('routes a live session to its watch URL', () => {
      const action = resolveCardAction({
        sessionId: 'sess-1',
        sessionUrl: 'https://adobe.com/sessions/s1',
        watchUrl: 'https://adobe.com/watch/s1',
        startTimeUtc: iso(NOW - HOUR),
        endTimeUtc: iso(NOW + HOUR),
      }, NOW);
      expect(action).to.deep.equal({ type: 'navigate', url: 'https://adobe.com/watch/s1' });
    });

    it('falls back to the session URL for a live session without a watch URL', () => {
      const action = resolveCardAction({
        sessionId: 'sess-1',
        sessionUrl: 'https://adobe.com/sessions/s1',
        startTimeUtc: iso(NOW - HOUR),
        endTimeUtc: iso(NOW + HOUR),
      }, NOW);
      expect(action).to.deep.equal({ type: 'navigate', url: 'https://adobe.com/sessions/s1' });
    });

    it('routes an on-demand session to its session page', () => {
      const action = resolveCardAction({
        sessionId: 'sess-1',
        sessionUrl: 'https://adobe.com/sessions/s1',
        watchUrl: 'https://adobe.com/watch/s1',
        startTimeUtc: iso(NOW - 2 * HOUR),
        endTimeUtc: iso(NOW - HOUR),
      }, NOW);
      expect(action).to.deep.equal({ type: 'navigate', url: 'https://adobe.com/sessions/s1' });
    });

    it('resolves to no action for an unsafe (javascript:) URL', () => {
      const action = resolveCardAction({
        sessionId: 'sess-1',
        sessionUrl: 'javascript:alert(1)', // eslint-disable-line no-script-url
        startTimeUtc: iso(NOW - 2 * HOUR),
        endTimeUtc: iso(NOW - HOUR),
      }, NOW);
      expect(action).to.deep.equal({ type: 'none' });
    });

    it('routes an MR session in-window but not in the active poll set to on-demand, not live', () => {
      const action = resolveCardAction({
        sessionId: 'sess-1',
        sessionUrl: 'https://adobe.com/sessions/s1',
        watchUrl: 'https://adobe.com/watch/s1',
        mrStreamId: 'mr-1',
        startTimeUtc: iso(NOW - HOUR),
        endTimeUtc: iso(NOW + HOUR),
      }, NOW, new Set());
      expect(action).to.deep.equal({ type: 'navigate', url: 'https://adobe.com/sessions/s1' });
    });

    it('routes an MR session that is active in the poll set to its watch URL (live)', () => {
      const action = resolveCardAction({
        sessionId: 'sess-1',
        sessionUrl: 'https://adobe.com/sessions/s1',
        watchUrl: 'https://adobe.com/watch/s1',
        mrStreamId: 'mr-1',
        startTimeUtc: iso(NOW - HOUR),
        endTimeUtc: iso(NOW + HOUR),
      }, NOW, new Set(['mr-1']));
      expect(action).to.deep.equal({ type: 'navigate', url: 'https://adobe.com/watch/s1' });
    });

    it('resolves to no action for an upcoming session missing a sessionId', () => {
      const action = resolveCardAction({
        sessionUrl: 'https://adobe.com/sessions/s1',
        startTimeUtc: iso(NOW + HOUR),
        endTimeUtc: iso(NOW + 2 * HOUR),
      }, NOW);
      expect(action).to.deep.equal({ type: 'none' });
    });
  });

  describe('attachSessionRouting', () => {
    // attachSessionRouting's activate() calls resolveCardAction with the real clock
    // (no injectable nowMs), so these use Date.now() rather than the fixed NOW above.
    // window.location.assign is locked down (non-configurable) inside the WTR test
    // iframe, so the live/on-demand cases below only assert what they *don't* do
    // (open the Session Guide) rather than the exact navigate target — that exact
    // URL-per-state behavior is already covered by the resolveCardAction unit tests.
    const realNow = Date.now();

    beforeEach(() => {
      document.body.innerHTML = '';
      sessionGuideRequest.value = null;
    });

    function buildCard({ startTimeUtc, endTimeUtc, sessionUrl, watchUrl }) {
      const card = document.createElement('div');
      card.dataset.sessionId = 'sess-1';
      card.dataset.startTimeUtc = startTimeUtc;
      card.dataset.endTimeUtc = endTimeUtc;
      if (sessionUrl) card.dataset.sessionUrl = sessionUrl;
      if (watchUrl) card.dataset.watchUrl = watchUrl;
      const cta = document.createElement('a');
      cta.className = 'card-cta';
      cta.href = sessionUrl || watchUrl || '#';
      card.append(cta);
      document.body.append(card);
      attachSessionRouting(card);
      return { card, cta };
    }

    it('opens the Session Guide when the CTA link is clicked on an upcoming session', () => {
      const { cta } = buildCard({
        startTimeUtc: iso(realNow + HOUR),
        endTimeUtc: iso(realNow + 2 * HOUR),
        sessionUrl: 'https://adobe.com/sessions/s1',
      });
      cta.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(sessionGuideRequest.value).to.deep.equal({ sessionId: 'sess-1' });
    });

    it('opens the Session Guide when clicking the card body (not the CTA) on an upcoming session', () => {
      const { card } = buildCard({
        startTimeUtc: iso(realNow + HOUR),
        endTimeUtc: iso(realNow + 2 * HOUR),
        sessionUrl: 'https://adobe.com/sessions/s1',
      });
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(sessionGuideRequest.value).to.deep.equal({ sessionId: 'sess-1' });
    });

    it('does not open the Session Guide when the CTA link is clicked on a live session', () => {
      const { cta } = buildCard({
        startTimeUtc: iso(realNow - HOUR),
        endTimeUtc: iso(realNow + HOUR),
        sessionUrl: 'https://adobe.com/sessions/s1',
        watchUrl: 'https://adobe.com/watch/s1',
      });
      cta.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(sessionGuideRequest.value).to.equal(null);
    });

    it('does not open the Session Guide when the whole card is clicked on an on-demand session', () => {
      const { card } = buildCard({
        startTimeUtc: iso(realNow - 2 * HOUR),
        endTimeUtc: iso(realNow - HOUR),
        sessionUrl: 'https://adobe.com/sessions/s1',
        watchUrl: 'https://adobe.com/watch/s1',
      });
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(sessionGuideRequest.value).to.equal(null);
    });
  });
});
