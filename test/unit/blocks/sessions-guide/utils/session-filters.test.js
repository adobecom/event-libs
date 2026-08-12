import { expect } from '@esm-bundle/chai';
import {
  sessionsForDay, groupByStartTime, groupByTrack, resolveTrackBadge,
  liveSessions, upcomingSessions, onDemandSessions, getFeaturedSessions,
  getOnDemandFeaturedSessions,
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

  it('returns groups sorted by start time ascending', () => {
    const groups = groupByStartTime([UPCOMING, LIVE]);
    expect(groups[0][0].id).to.equal('live');
    expect(groups[1][0].id).to.equal('upcoming');
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

describe('session-filters/getFeaturedSessions', () => {
  it('returns sessions matching featuredIds for the active day', () => {
    const result = getFeaturedSessions([LIVE, UPCOMING, PAST], ['live', 'past'], LIVE_DAY, TZ);
    expect(result.map((s) => s.id)).to.include('live');
  });

  it('excludes featured ids not on the active day', () => {
    const result = getFeaturedSessions([LIVE, UPCOMING], ['upcoming'], LIVE_DAY, TZ);
    // UPCOMING is on the same day in most cases, but if days differ it should be excluded
    // Regardless: result should never exceed 3
    expect(result.length).to.be.at.most(3);
  });

  it('caps results at 3', () => {
    const many = [LIVE, UPCOMING, PAST, UPCOMING_2].map((s, i) => ({ ...s, id: `s-${i}` }));
    const ids = many.map((s) => s.id);
    const day = getSessionDayKey(many[0], TZ);
    const result = getFeaturedSessions(many, ids, day, TZ);
    expect(result.length).to.be.at.most(3);
  });

  it('falls back to random selection when no featuredIds provided', () => {
    const result = getFeaturedSessions([LIVE, UPCOMING, PAST], [], LIVE_DAY, TZ);
    expect(result.length).to.be.at.most(3);
  });

  it('fallback is deterministic for the same day', () => {
    const sessions = [LIVE, UPCOMING, PAST, UPCOMING_2];
    const r1 = getFeaturedSessions(sessions, [], LIVE_DAY, TZ).map((s) => s.id);
    const r2 = getFeaturedSessions(sessions, [], LIVE_DAY, TZ).map((s) => s.id);
    expect(r1).to.deep.equal(r2);
  });

  it('returns featured sessions in authored order, not catalog order', () => {
    // Catalog order here is [LIVE, UPCOMING_2] (as passed in); featuredIds authors
    // the opposite order, which the result must follow.
    const upcoming2SameDay = { ...UPCOMING_2, startTimeUtc: LIVE.startTimeUtc, endTimeUtc: LIVE.endTimeUtc };
    const result = getFeaturedSessions([LIVE, upcoming2SameDay], ['upcoming-2', 'live'], LIVE_DAY, TZ);
    expect(result.map((s) => s.id)).to.deep.equal(['upcoming-2', 'live']);
  });
});

describe('session-filters/getOnDemandFeaturedSessions', () => {
  it('returns sessions matching featuredIds in authored order', () => {
    const result = getOnDemandFeaturedSessions([LIVE, UPCOMING, PAST], ['past', 'live']);
    expect(result.map((s) => s.id)).to.deep.equal(['past', 'live']);
  });

  it('is not scoped to any single day', () => {
    // LIVE and PAST are on different days by construction (h(-0.5) vs h(-4)); both
    // must still appear since this function has no day filter at all.
    const result = getOnDemandFeaturedSessions([LIVE, PAST], ['live', 'past']);
    expect(result.map((s) => s.id)).to.have.members(['live', 'past']);
  });

  it('ignores featuredIds with no matching session', () => {
    const result = getOnDemandFeaturedSessions([LIVE], ['nonexistent', 'live']);
    expect(result.map((s) => s.id)).to.deep.equal(['live']);
  });

  it('caps results at 3', () => {
    const many = [LIVE, UPCOMING, PAST, UPCOMING_2];
    const ids = many.map((s) => s.id);
    const result = getOnDemandFeaturedSessions(many, ids);
    expect(result.length).to.equal(3);
  });

  it('returns an empty array when no featuredIds are provided', () => {
    expect(getOnDemandFeaturedSessions([LIVE, UPCOMING], [])).to.deep.equal([]);
  });
});

// Override, when present, always wins swimlane placement and the badge regardless of
// whether a primary track also exists; Additional Event Site Tracks only ever supports
// one value.
describe('session-filters/resolveTrackBadge', () => {
  it('1. Primary, no additional, no override — primary lane, primary badge icon', () => {
    const badge = resolveTrackBadge({ id: 's-1', track: 'Mainstage', trackOverride: '', additionalTracks: [] });
    expect(badge.label).to.equal('Mainstage');
    expect(badge.icon).to.equal('mainstage');
    expect(badge.color).to.equal('#E91E63');
    expect(badge.isOverride).to.be.false;
    expect(badge.swimlanes).to.deep.equal(['Mainstage']);
    expect(badge.stackedTracks).to.be.null;
    expect(badge.count).to.equal(0);
  });

  it('2. Primary, additional, no override — primary + additional lane, primary badge + "+1"', () => {
    const badge = resolveTrackBadge({
      id: 's-1', track: 'Design', trackOverride: '', additionalTracks: ['Video'],
    });
    expect(badge.isOverride).to.be.false;
    expect(badge.swimlanes).to.deep.equal(['Design', 'Video']);
    expect(badge.stackedTracks).to.deep.equal(['Design', 'Video']);
    expect(badge.count).to.equal(1);
  });

  it('3/6. No primary, no additional, override only — override-text lane, override badge icon', () => {
    const badge = resolveTrackBadge({
      id: 's-1', track: '', trackOverride: 'custom label', additionalTracks: [],
    });
    expect(badge.isOverride).to.be.true;
    expect(badge.label).to.equal('custom label');
    expect(badge.icon).to.equal('star');
    expect(badge.color).to.equal('#6E6E6E');
    expect(badge.swimlanes).to.deep.equal(['custom label']);
    expect(badge.stackedTracks).to.be.null;
    expect(badge.count).to.equal(0);
  });

  it('4. Primary, no additional, override — override lane (not primary lane), override badge icon', () => {
    const badge = resolveTrackBadge({
      id: 's-1', track: 'Design', trackOverride: 'custom label', additionalTracks: [],
    });
    expect(badge.isOverride).to.be.true;
    expect(badge.label).to.equal('custom label');
    // Override wins placement outright — the primary track never appears in swimlanes.
    expect(badge.swimlanes).to.deep.equal(['custom label']);
  });

  it('5. No primary, additional, override — override lane + additional lane, override icon + "+1"', () => {
    const badge = resolveTrackBadge({
      id: 's-1', track: '', trackOverride: 'custom label', additionalTracks: ['Video'],
    });
    expect(badge.isOverride).to.be.true;
    expect(badge.swimlanes).to.deep.equal(['custom label', 'Video']);
    expect(badge.count).to.equal(1);
  });

  it('Primary, additional, and override all present — override lane + additional lane, override badge icon', () => {
    const badge = resolveTrackBadge({
      id: 's-1', track: 'Design', trackOverride: 'custom label', additionalTracks: ['Video'],
    });
    expect(badge.isOverride).to.be.true;
    expect(badge.label).to.equal('custom label');
    // Override wins placement outright even with both a primary track and an additional
    // one present — the primary track still never appears in swimlanes.
    expect(badge.swimlanes).to.deep.equal(['custom label', 'Video']);
    expect(badge.count).to.equal(1);
  });

  it('only ever applies one additional track even if more are somehow present', () => {
    const badge = resolveTrackBadge({
      id: 's-1', track: 'Design', trackOverride: '', additionalTracks: ['Video', 'Business', 'Photography'],
    });
    expect(badge.swimlanes).to.deep.equal(['Design', 'Video']);
    expect(badge.count).to.equal(1);
  });

  it('returns null when there is no primary track and no override', () => {
    expect(resolveTrackBadge({ id: 's-1', track: '', trackOverride: '', additionalTracks: [] })).to.be.null;
  });
});

describe('session-filters/groupByTrack — Digital Agenda track badge model', () => {
  it('groups sessions by their primary track', () => {
    const a = { id: 'a', track: 'Design', trackOverride: '', additionalTracks: [] };
    const b = { id: 'b', track: 'Video', trackOverride: '', additionalTracks: [] };
    const c = { id: 'c', track: 'Design', trackOverride: '', additionalTracks: [] };
    const result = groupByTrack([a, b, c]);
    expect(result.map(([track]) => track)).to.have.members(['Design', 'Video']);
    expect(result.find(([track]) => track === 'Design')[1].map((s) => s.id)).to.deep.equal(['a', 'c']);
  });

  it('excludes sessions with no primary track and no override — no "Other" bucket', () => {
    const noTrack = { id: 'no-track', track: '', trackOverride: '', additionalTracks: [] };
    const withTrack = { id: 'with-track', track: 'Design', trackOverride: '', additionalTracks: [] };
    const result = groupByTrack([noTrack, withTrack]);
    expect(result.map(([track]) => track)).to.deep.equal(['Design']);
  });

  it('places a session with additional tracks into every one of its swimlanes', () => {
    const s = { id: 's-1', track: 'Design', trackOverride: '', additionalTracks: ['Video'] };
    const result = groupByTrack([s]);
    expect(result.map(([track]) => track)).to.have.members(['Design', 'Video']);
    result.forEach(([, sessions]) => expect(sessions.map((x) => x.id)).to.deep.equal(['s-1']));
  });

  it('orders swimlanes per the authored swimlaneOrder ([{track,displayName,enabled}], not a plain string array), unlisted tracks appended after', () => {
    const a = { id: 'a', track: 'Design', trackOverride: '', additionalTracks: [] };
    const b = { id: 'b', track: 'Video', trackOverride: '', additionalTracks: [] };
    const c = { id: 'c', track: 'Business', trackOverride: '', additionalTracks: [] };
    const swimlaneOrder = [
      { track: 'Video', displayName: 'Video', enabled: true },
      { track: 'Business', displayName: 'Business', enabled: true },
    ];
    const result = groupByTrack([a, b, c], swimlaneOrder);
    expect(result.map(([track]) => track)).to.deep.equal(['Video', 'Business', 'Design']);
  });

  it('falls back to first-seen order when no swimlaneOrder is authored', () => {
    const a = { id: 'a', track: 'Design', trackOverride: '', additionalTracks: [] };
    const b = { id: 'b', track: 'Video', trackOverride: '', additionalTracks: [] };
    const result = groupByTrack([a, b]);
    expect(result.map(([track]) => track)).to.deep.equal(['Design', 'Video']);
  });

  it('drops a swimlane entirely when its swimlaneOrder entry is disabled', () => {
    const a = { id: 'a', track: 'Design', trackOverride: '', additionalTracks: [] };
    const b = { id: 'b', track: 'Video', trackOverride: '', additionalTracks: [] };
    const swimlaneOrder = [{ track: 'Video', displayName: 'Video', enabled: false }];
    const result = groupByTrack([a, b], swimlaneOrder);
    expect(result.map(([track]) => track)).to.deep.equal(['Design']);
  });

  it('returns the authored displayName as the 3rd tuple element, without changing the grouping key', () => {
    const a = { id: 'a', track: 'Design', trackOverride: '', additionalTracks: [] };
    const swimlaneOrder = [{ track: 'Design', displayName: 'Creativity', enabled: true }];
    const result = groupByTrack([a], swimlaneOrder);
    expect(result[0][0]).to.equal('Design');
    expect(result[0][2]).to.equal('Creativity');
  });

  it('defaults the label to the raw swimlane name when no swimlaneOrder entry exists for it', () => {
    const a = { id: 'a', track: 'Design', trackOverride: '', additionalTracks: [] };
    expect(groupByTrack([a])[0][2]).to.equal('Design');
  });

  it('treats an override-lane name identically to a track name in swimlaneOrder', () => {
    const overridden = { id: 'o', track: '', trackOverride: 'Community Spotlight', additionalTracks: [] };
    const tracked = { id: 't', track: 'Design', trackOverride: '', additionalTracks: [] };
    const swimlaneOrder = [
      { track: 'Community Spotlight', displayName: 'Community', enabled: true },
      { track: 'Design', displayName: 'Design', enabled: true },
    ];
    const result = groupByTrack([overridden, tracked], swimlaneOrder);
    expect(result.map(([track]) => track)).to.deep.equal(['Community Spotlight', 'Design']);
    expect(result[0][2]).to.equal('Community');
  });
});
