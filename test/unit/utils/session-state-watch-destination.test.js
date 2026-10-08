import { expect } from '@esm-bundle/chai';
import { getWatchDestination } from '../../../event-libs/v1/utils/session-state.js';
import { initTierOneEventConfig } from '../../../event-libs/v1/utils/tier-1-event-config.js';

// tier-1-event-config.js is a module-level singleton, so the unauthored fallback needs its
// own file (session-state-watch-destination-defaults.test.js) to get a fresh instance.
const CONFIG = {
  homepagePath: '/summit.html',
  broadcastPath: '/summit/broadcast.html',
};

function session(overrides = {}) {
  return {
    id: 's1',
    startTimeUtc: '2026-01-01T10:00:00.000Z',
    endTimeUtc: '2026-01-01T11:00:00.000Z',
    ...overrides,
  };
}

describe('getWatchDestination — authored event pages', () => {
  const originalUrl = window.location.href;

  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify(CONFIG);
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  afterEach(() => history.replaceState(null, '', originalUrl));

  // Authored with .html; the test page is extensionless (like aem.page), so toPagePath drops it.
  it('sends a live livestreamed session to the authored homepage path', () => {
    expect(getWatchDestination(session({ isLivestreamed: true }), 'live')).to.equal('/summit');
  });

  it('sends a live online-only session to the authored broadcast path, carrying ?watch=<id>', () => {
    expect(getWatchDestination(session({ isOnline: true }), 'live')).to.equal('/summit/broadcast?watch=s1');
  });

  it('prefers the homepage path when a session is both livestreamed and online', () => {
    const both = session({ isLivestreamed: true, isOnline: true });
    expect(getWatchDestination(both, 'live')).to.equal('/summit');
  });

  it('sends an on-demand session to its own session page, not an event page', () => {
    const onDemand = session({ isLivestreamed: true, sessionPageUrl: '/sessions/s1' });
    expect(getWatchDestination(onDemand, 'on-demand')).to.equal('/sessions/s1');
  });

  it('returns empty for an on-demand session with no session page of its own', () => {
    expect(getWatchDestination(session({ isLivestreamed: true }), 'on-demand')).to.equal('');
  });

  it('returns empty for an upcoming session — nothing to watch yet', () => {
    expect(getWatchDestination(session({ isLivestreamed: true }), 'upcoming')).to.equal('');
  });

  it('returns empty for a live session that is neither livestreamed nor online', () => {
    expect(getWatchDestination(session(), 'live')).to.equal('');
  });

  describe('serverTime navigation', () => {
    const nowMs = 1_794_339_070_000;

    beforeEach(() => {
      history.replaceState(null, '', '/summit?serverTime=1794339000000&sessions=&campaign=test');
    });

    it('carries the homepage serverTime to broadcast with the selected session id', () => {
      expect(getWatchDestination(session({ isOnline: true }), 'live', nowMs))
        .to.equal('/summit/broadcast?watch=s1&serverTime=1794339070000');
    });

    it('carries serverTime back to the homepage for livestreamed sessions', () => {
      history.replaceState(null, '', '/summit/broadcast?serverTime=1794339000000&session=s1');
      expect(getWatchDestination(session({ isLivestreamed: true }), 'live', nowMs))
        .to.equal('/summit?serverTime=1794339070000');
    });

    it('preserves an on-demand destination query and hash without copying guide params', () => {
      const onDemand = session({ sessionPageUrl: '/sessions/s1?lang=en#player' });
      expect(getWatchDestination(onDemand, 'on-demand', nowMs))
        .to.equal('/sessions/s1?lang=en&serverTime=1794339070000#player');
    });

    it('uses the current page override rather than a stale destination serverTime', () => {
      const onDemand = session({ sessionPageUrl: '/sessions/s1?serverTime=1000#player' });
      expect(getWatchDestination(onDemand, 'on-demand', nowMs))
        .to.equal('/sessions/s1?serverTime=1794339070000#player');
    });

    it('only propagates the current clock while the URL has a non-empty override', () => {
      history.replaceState(null, '', '/summit?serverTime=2000');
      expect(getWatchDestination(session({ isOnline: true }), 'live', 3000))
        .to.equal('/summit/broadcast?watch=s1&serverTime=3000');
      history.replaceState(null, '', '/summit');
      expect(getWatchDestination(session({ isOnline: true }), 'live'))
        .to.equal('/summit/broadcast?watch=s1');
    });

    it('preserves a zero timestamp and encodes the selected session id', () => {
      history.replaceState(null, '', '/summit?serverTime=0');
      expect(getWatchDestination(session({ isOnline: true, id: 's 1&2' }), 'live', 0))
        .to.equal('/summit/broadcast?watch=s+1%262&serverTime=0');
    });

    it('does not turn an absent destination into a serverTime-only link', () => {
      expect(getWatchDestination(session(), 'live')).to.equal('');
      expect(getWatchDestination(session({ isOnline: true }), 'upcoming')).to.equal('');
      expect(getWatchDestination(session(), 'on-demand')).to.equal('');
    });

    it('does not copy an empty serverTime override', () => {
      history.replaceState(null, '', '/summit?serverTime=');
      expect(getWatchDestination(session({ isOnline: true }), 'live'))
        .to.equal('/summit/broadcast?watch=s1');
    });
  });
});
