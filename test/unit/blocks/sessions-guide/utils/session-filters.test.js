import { expect } from '@esm-bundle/chai';
import {
  sessionsForDay, groupByStartTime, groupByTrack,
  liveSessions, upcomingSessions, onDemandSessions,
} from '../../../../../event-libs/v1/blocks/sessions-guide/utils/session-filters.js';
import { getSessionDayKey } from '../../../../../event-libs/v1/blocks/sessions-guide/utils/time.js';

const TZ = 'America/Los_Angeles';

function h(offsetHours) {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

const LIVE = {
  id: 'live', track: 'Design',
  startTimeUtc: h(-0.5), endTimeUtc: h(1),
  mrStreamId: null,
};
const UPCOMING = {
  id: 'upcoming', track: 'Video',
  startTimeUtc: h(1), endTimeUtc: h(2),
  mrStreamId: null,
};
const PAST = {
  id: 'past', track: 'Design',
  startTimeUtc: h(-4), endTimeUtc: h(-3),
  mrStreamId: null,
};
const UPCOMING_2 = {
  id: 'upcoming-2', track: 'Video',
  startTimeUtc: h(1), endTimeUtc: h(2),
  mrStreamId: null,
};

// Derive day keys directly from session times so tests pass in any system timezone
const LIVE_DAY = getSessionDayKey(LIVE, TZ);
const UPCOMING_DAY = getSessionDayKey(UPCOMING, TZ);
const NOW = Date.now();

describe('session-filters/sessionsForDay', () => {
  it('returns sessions matching the active day', () => {
    const result = sessionsForDay([LIVE, PAST], LIVE_DAY, TZ);
    expect(result.map((s) => s.id)).to.include('live');
  });

  it('excludes sessions on a different day', () => {
    // Use two days out — none of our sessions (at most h(1)) can fall there
    const twoDaysOut = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
      .format(new Date(Date.now() + 2 * 86_400_000));
    const result = sessionsForDay([LIVE, PAST], twoDaysOut, TZ);
    expect(result.length).to.equal(0);
  });
});

describe('session-filters/groupByStartTime', () => {
  it('groups sessions with the same start time together', () => {
    const groups = groupByStartTime([UPCOMING, UPCOMING_2]);
    expect(groups.length).to.equal(1);
    expect(groups[0].length).to.equal(2);
  });

  it('produces separate groups for different start times', () => {
    const groups = groupByStartTime([LIVE, UPCOMING]);
    expect(groups.length).to.equal(2);
  });

  it('returns empty array for no sessions', () => {
    expect(groupByStartTime([])).to.deep.equal([]);
  });
});

describe('session-filters/groupByTrack', () => {
  it('groups sessions by track', () => {
    const groups = groupByTrack([LIVE, UPCOMING, PAST, UPCOMING_2]);
    const map = Object.fromEntries(groups);
    expect(map.Design.length).to.equal(2);
    expect(map.Video.length).to.equal(2);
  });

  it('returns array of [track, sessions] tuples', () => {
    const groups = groupByTrack([LIVE]);
    expect(groups[0][0]).to.equal('Design');
    expect(groups[0][1]).to.deep.equal([LIVE]);
  });
});

describe('session-filters/liveSessions', () => {
  it('returns sessions that are currently live and eligible', () => {
    const result = liveSessions([LIVE, UPCOMING, PAST], new Set(), LIVE_DAY, TZ, NOW);
    expect(result.map((s) => s.id)).to.deep.equal(['live']);
  });

});

describe('session-filters/upcomingSessions', () => {
  it('returns sessions starting in the future for the active day', () => {
    const result = upcomingSessions([LIVE, UPCOMING, PAST], new Set(), UPCOMING_DAY, TZ, NOW);
    expect(result.map((s) => s.id)).to.deep.equal(['upcoming']);
  });
});

describe('session-filters/onDemandSessions', () => {
  it('returns sessions that have ended', () => {
    const result = onDemandSessions([LIVE, UPCOMING, PAST], new Set(), NOW);
    expect(result.map((s) => s.id)).to.deep.equal(['past']);
  });
});
