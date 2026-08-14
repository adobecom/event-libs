import { expect } from '@esm-bundle/chai';
import { resolveCardAction } from '../../../event-libs/v1/utils/session-routing.js';

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
});
