import { expect } from '@esm-bundle/chai';
import { getWatchDestination } from '../../../event-libs/v1/utils/session-state.js';

// No tier-1-event-config metadata at all, so nothing authored the event's pages — MAX's
// paths stand in, keeping "Watch now" working on configs that predate those fields.
function session(overrides = {}) {
  return {
    startTimeUtc: '2026-01-01T10:00:00.000Z',
    endTimeUtc: '2026-01-01T11:00:00.000Z',
    ...overrides,
  };
}

describe('getWatchDestination — unauthored event pages', () => {
  it('falls back to MAX\'s homepage for a live livestreamed session', () => {
    expect(getWatchDestination(session({ isLivestreamed: true }), 'live')).to.equal('/max.html');
  });

  it('falls back to MAX\'s broadcast page for a live online-only session', () => {
    expect(getWatchDestination(session({ isOnline: true }), 'live')).to.equal('/max/2026/broadcast.html');
  });

  it('still returns empty for a live session that is neither livestreamed nor online', () => {
    expect(getWatchDestination(session(), 'live')).to.equal('');
  });
});
