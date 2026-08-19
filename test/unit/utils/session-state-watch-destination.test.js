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
    startTimeUtc: '2026-01-01T10:00:00.000Z',
    endTimeUtc: '2026-01-01T11:00:00.000Z',
    ...overrides,
  };
}

describe('getWatchDestination — authored event pages', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify(CONFIG);
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  it('sends a live livestreamed session to the authored homepage path', () => {
    expect(getWatchDestination(session({ isLivestreamed: true }), 'live')).to.equal('/summit.html');
  });

  it('sends a live online-only session to the authored broadcast path', () => {
    expect(getWatchDestination(session({ isOnline: true }), 'live')).to.equal('/summit/broadcast.html');
  });

  it('prefers the homepage path when a session is both livestreamed and online', () => {
    const both = session({ isLivestreamed: true, isOnline: true });
    expect(getWatchDestination(both, 'live')).to.equal('/summit.html');
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
});
