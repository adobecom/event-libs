import { expect } from '@esm-bundle/chai';
import {
  UP_NEXT_CAP,
  getUpNextSessions,
  getBroadcastSchedule,
  hasPlayableVideoSource,
  getSessionBucket,
  parseVideoDurationMs,
  isSessionLiveNow,
  resolveBucketSchedule,
} from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/utils/broadcast-schedule.js';

const MIN = 60_000;

// isOnline: true, youTubeId set by default — a plain broadcast-eligible, video-having session,
// per isBroadcastEligible()/hasPlayableVideoSource() (session-state.js / this module). Tests
// below that specifically exercise the mainstage/keynote or missing-video exclusions override
// isLivestreamed/isOnline/youTubeId explicitly.
function session(id, startOffsetMin, endOffsetMin, overrides = {}) {
  const now = Date.now();
  return {
    id,
    startTimeUtc: new Date(now + startOffsetMin * MIN).toISOString(),
    endTimeUtc: new Date(now + endOffsetMin * MIN).toISOString(),
    hasOnDemandFormat: false,
    mrStreamId: null,
    isOnline: true,
    isLivestreamed: false,
    youTubeId: 'yt-default',
    mpcId: '',
    videoDuration: '',
    ...overrides,
  };
}

// "00:MM:00" — the middle field is allowed to exceed 59 (real RF data has been seen this way for
// a 60-minute session), so parseVideoDurationMs sums weighted parts rather than validating a
// strict HH:MM:SS range.
function minutesToDuration(mins) {
  return `00:${mins}:00`;
}

// MPC's own "on screen until" is start + videoDuration, not endTimeUtc — endOffsetMin is set to
// something clearly different so a test can tell which one the code actually used.
function mpcSession(id, startOffsetMin, durationMin, overrides = {}) {
  return session(id, startOffsetMin, startOffsetMin + 9999, {
    youTubeId: '',
    mpcId: `mpc-${id}`,
    videoDuration: minutesToDuration(durationMin),
    ...overrides,
  });
}

function ytSession(id, startOffsetMin, endOffsetMin, overrides = {}) {
  return session(id, startOffsetMin, endOffsetMin, { youTubeId: `yt-${id}`, mpcId: '', ...overrides });
}

describe('broadcast-schedule', () => {
  const nowMs = Date.now();
  const liveStreamActiveIds = new Set();

  describe('getSessionBucket', () => {
    it('is "mpc" when mpcId is set', () => {
      expect(getSessionBucket({ mpcId: '123', youTubeId: '' })).to.equal('mpc');
    });

    it('is "youtube" when youTubeId is set', () => {
      expect(getSessionBucket({ mpcId: '', youTubeId: 'abc' })).to.equal('youtube');
    });

    it('is null for a MobileRider-only or player-less session', () => {
      expect(getSessionBucket({ mpcId: '', youTubeId: '', mrStreamId: 'mr-1' })).to.equal(null);
      expect(getSessionBucket({})).to.equal(null);
    });
  });

  describe('parseVideoDurationMs', () => {
    it('parses "HH:MM:SS" into milliseconds', () => {
      expect(parseVideoDurationMs('01:30:00')).to.equal((90 * 60) * 1000);
    });

    it('sums weighted parts even when the minutes field exceeds 59', () => {
      expect(parseVideoDurationMs('00:60:00')).to.equal(60 * 60 * 1000);
    });

    it('returns null for missing or unparseable values', () => {
      expect(parseVideoDurationMs('')).to.equal(null);
      expect(parseVideoDurationMs(null)).to.equal(null);
      expect(parseVideoDurationMs('not-a-duration')).to.equal(null);
    });
  });

  describe('isSessionLiveNow', () => {
    it('is true for a plain (YouTube-style) session within its start/end window', () => {
      const s = ytSession('a', -10, 10);
      expect(isSessionLiveNow(s, liveStreamActiveIds, nowMs)).to.be.true;
    });

    it('is false before start and after end', () => {
      expect(isSessionLiveNow(ytSession('a', 10, 20), liveStreamActiveIds, nowMs)).to.be.false;
      expect(isSessionLiveNow(ytSession('a', -30, -10), liveStreamActiveIds, nowMs)).to.be.false;
    });

    it('is false for hasOnDemandFormat regardless of time window, mirroring deriveSessionState', () => {
      const s = ytSession('a', -10, 10, { hasOnDemandFormat: true });
      expect(isSessionLiveNow(s, liveStreamActiveIds, nowMs)).to.be.false;
    });

    it('for MPC, uses start + videoDuration, not endTimeUtc', () => {
      // endTimeUtc is 9999 minutes out (see mpcSession) — only reachable via videoDuration.
      const stillPlaying = mpcSession('a', -10, 30); // 30-min duration, 10 min in — still live
      const alreadyDone = mpcSession('b', -40, 30); // 30-min duration, 40 min in — done
      expect(isSessionLiveNow(stillPlaying, liveStreamActiveIds, nowMs)).to.be.true;
      expect(isSessionLiveNow(alreadyDone, liveStreamActiveIds, nowMs)).to.be.false;
    });

    it('for MPC, falls back to the authored start/end window when videoDuration is missing', () => {
      const s = session('a', -10, 10, { mpcId: 'mpc-a', youTubeId: '', videoDuration: '' });
      expect(isSessionLiveNow(s, liveStreamActiveIds, nowMs)).to.be.true;
    });

    it('for MobileRider sessions, defers to deriveSessionState (poll-driven, ignores endTimeUtc)', () => {
      const s = session('a', -10, 10, { youTubeId: '', mpcId: '', mrStreamId: 'mr-1' });
      expect(isSessionLiveNow(s, new Set(), nowMs)).to.be.false; // not in the active-poll set
      expect(isSessionLiveNow(s, new Set(['mr-1']), nowMs)).to.be.true;
    });
  });

  describe('resolveBucketSchedule', () => {
    it('keeps the committed session active while it is still live — no re-roll', () => {
      const committed = ytSession('a', -10, 10);
      const sibling = ytSession('b', -10, 10); // same group, also live
      const result = resolveBucketSchedule([committed, sibling], committed, nowMs, liveStreamActiveIds);
      expect(result.activeSession.id).to.equal('a');
      expect(result.pendingCandidates).to.equal(null);
      expect(result.endedSession).to.equal(null);
    });

    it('with nothing committed, offers every currently-live member of the live group as candidates', () => {
      const a = ytSession('a', -10, 10);
      const b = ytSession('b', -10, 10); // same start time — same group
      const upcoming = ytSession('c', 10, 20);
      const result = resolveBucketSchedule([a, b, upcoming], null, nowMs, liveStreamActiveIds);
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates.map((s) => s.id).sort()).to.deep.equal(['a', 'b']);
    });

    it('with nothing committed and nothing live, resolves to all-null (no crash)', () => {
      const result = resolveBucketSchedule([ytSession('a', 10, 20)], null, nowMs, liveStreamActiveIds);
      expect(result).to.deep.equal({ activeSession: null, pendingCandidates: null, endedSession: null });
    });

    // The explicit product rule: once a session ends, automatic advancement must NEVER fall back
    // to a still-live sibling in its own group — only the next group, or ended state.
    it('never falls back to a still-live sibling in the committed session\'s own group', () => {
      const committed = ytSession('ended', -20, -10); // ended 10 min ago
      const sibling = ytSession('sibling', -20, 20); // same start time, still live
      const result = resolveBucketSchedule([committed, sibling], committed, nowMs, liveStreamActiveIds);
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
      expect(result.endedSession.id).to.equal('ended');
    });

    it('waits in ended state when the next group has not started yet (a real gap)', () => {
      const committed = ytSession('a', -20, -10); // ended
      const next = ytSession('b', 10, 20); // starts in the future
      const result = resolveBucketSchedule([committed, next], committed, nowMs, liveStreamActiveIds);
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
      expect(result.endedSession.id).to.equal('a');
    });

    it('auto-transitions to the next group once its start has been reached or passed', () => {
      const committed = ytSession('a', -20, -10); // ended
      const next = ytSession('b', -5, 20); // started 5 min ago, still live
      const result = resolveBucketSchedule([committed, next], committed, nowMs, liveStreamActiveIds);
      expect(result.activeSession).to.equal(null);
      expect(result.endedSession).to.equal(null);
      expect(result.pendingCandidates.map((s) => s.id)).to.deep.equal(['b']);
    });

    it('stays ended permanently when no next group exists', () => {
      const committed = ytSession('a', -20, -10);
      const result = resolveBucketSchedule([committed], committed, nowMs, liveStreamActiveIds);
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
      expect(result.endedSession.id).to.equal('a');
    });

    // Not just a single boundary crossing: a backgrounded/suspended tab (or ?serverTime= jumping
    // further ahead than one group in local testing) can resume after MULTIPLE later groups have
    // already both started and ended. The immediate "next" group is stale too — advancement must
    // keep walking forward to whichever later group is actually live now, not get stuck showing
    // the original committed session as ended just because the very next group also already aired.
    it('walks forward past multiple already-elapsed groups to find the one actually live now', () => {
      const committed = ytSession('a', -60, -50); // ended long ago
      const alsoElapsed1 = ytSession('b', -40, -30); // next group, also already over
      const alsoElapsed2 = ytSession('c', -20, -10); // group after that, also already over
      const currentlyLive = ytSession('d', -5, 20); // the group that's actually live right now
      const result = resolveBucketSchedule(
        [committed, alsoElapsed1, alsoElapsed2, currentlyLive],
        committed,
        nowMs,
        liveStreamActiveIds,
      );
      expect(result.activeSession).to.equal(null);
      expect(result.endedSession).to.equal(null);
      expect(result.pendingCandidates.map((s) => s.id)).to.deep.equal(['d']);
    });

    // Deep-stale resume where NOTHING later is currently live either (unlike the test above) —
    // one or more later groups have already both started and ended without ever being shown.
    // Must catch up to the most recently aired one instead of perpetually re-showing the
    // original stale commitment, no matter how much further time moves on.
    it('catches up to the most recently aired later group when nothing later is currently live', () => {
      const committed = ytSession('a', -300, -290); // ended a long time ago
      const alsoElapsed = ytSession('b', -200, -190); // also already over, closer to now
      const mostRecent = ytSession('c', -20, -10); // the most recently aired group
      const result = resolveBucketSchedule(
        [committed, alsoElapsed, mostRecent],
        committed,
        nowMs,
        liveStreamActiveIds,
      );
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
      expect(result.endedSession.id).to.equal('c');
    });

    // Only reachable via non-monotonic nowMs (e.g. local testing with ?serverTime= jumping
    // backward while a later commitment is still in sessionStorage/history.state — never happens
    // in production, where time only moves forward). A committed session that hasn't started yet
    // must not be treated as ended.
    it('does not treat a committed session that has not started yet as ended', () => {
      const committed = ytSession('future', 20, 40); // starts in 20 min, relative to nowMs
      const result = resolveBucketSchedule([committed], committed, nowMs, liveStreamActiveIds);
      expect(result.activeSession).to.equal(null);
      expect(result.endedSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
    });

    it('offers a currently-live session as a candidate when the committed one has not started yet', () => {
      const committed = ytSession('future', 20, 40);
      const live = ytSession('live-now', -10, 10);
      const result = resolveBucketSchedule([committed, live], committed, nowMs, liveStreamActiveIds);
      expect(result.endedSession).to.equal(null);
      expect(result.pendingCandidates.map((s) => s.id)).to.deep.equal(['live-now']);
    });

    // A genuine first-time visitor (nothing ever committed) landing in a gap where nothing's
    // live should still get an ended-state anchor — the most recently aired group — rather than
    // a bare page. This must resolve into the SAME walk-forward-to-next-group behavior as a real
    // prior commitment once time passes (covered by the "auto-transitions" test above; this test
    // only checks the initial synthesis).
    it('surfaces the most recently aired group as endedSession for a first-time visitor', () => {
      const oldest = ytSession('oldest', -60, -50);
      const mostRecent = ytSession('most-recent', -20, -10); // the last group that already aired
      const result = resolveBucketSchedule([oldest, mostRecent], null, nowMs, liveStreamActiveIds);
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
      expect(result.endedSession.id).to.equal('most-recent');
    });

    it('does not synthesize an endedSession when nothing has aired yet at all', () => {
      const upcoming = ytSession('upcoming', 10, 20);
      const result = resolveBucketSchedule([upcoming], null, nowMs, liveStreamActiveIds);
      expect(result).to.deep.equal({ activeSession: null, pendingCandidates: null, endedSession: null });
    });

    it('does not synthesize an endedSession for the backward-time-travel not-yet-started case', () => {
      const committed = ytSession('future', 20, 40); // has a real, later commitment already
      const pastGroup = ytSession('past', -60, -50); // an unrelated group that already aired
      const result = resolveBucketSchedule([committed, pastGroup], committed, nowMs, liveStreamActiveIds);
      expect(result.endedSession).to.equal(null); // stays null, not the unrelated past group
      expect(result.pendingCandidates).to.equal(null);
    });
  });

  describe('getUpNextSessions', () => {
    it('returns only upcoming sessions, chronological by start time', () => {
      const s1 = session('a', 30, 40);
      const s2 = session('b', 10, 20);
      const live = session('c', -5, 10);
      const result = getUpNextSessions([s1, s2, live], liveStreamActiveIds, nowMs);
      expect(result.map((s) => s.id)).to.deep.equal(['b', 'a']);
    });

    it('excludes an upcoming mainstage/keynote session — it belongs on the homepage, not here', () => {
      const keynote = session('keynote', 10, 20, { isLivestreamed: true, isOnline: true });
      const breakout = session('breakout', 10, 20);
      const result = getUpNextSessions([keynote, breakout], liveStreamActiveIds, nowMs);
      expect(result.map((s) => s.id)).to.deep.equal(['breakout']);
    });

    it('excludes an upcoming, otherwise-eligible session with no video source configured', () => {
      const noVideo = session('no-video', 10, 20, { youTubeId: '', mpcId: '', mrStreamId: null });
      const withVideo = session('with-video', 10, 20);
      const result = getUpNextSessions([noVideo, withVideo], liveStreamActiveIds, nowMs);
      expect(result.map((s) => s.id)).to.deep.equal(['with-video']);
    });

    it(`caps the list at ${UP_NEXT_CAP} by default`, () => {
      const sessionList = Array.from(
        { length: UP_NEXT_CAP + 5 },
        (_, i) => session(`s${i}`, i + 1, i + 10),
      );
      expect(getUpNextSessions(sessionList, liveStreamActiveIds, nowMs)).to.have.length(UP_NEXT_CAP);
    });

    it('returns fewer than the cap when fewer sessions remain (backfilling naturally supported)', () => {
      const sessionList = [session('a', 10, 20), session('b', 20, 30)];
      expect(getUpNextSessions(sessionList, liveStreamActiveIds, nowMs)).to.have.length(2);
    });

    it('breaks ties between same-start-time sessions using the injected random function', () => {
      const s1 = session('a', 10, 20);
      const s2 = session('b', 10, 20); // identical start time
      let calls = 0;
      // First call (for s1) returns 0.9, second (for s2) returns 0.1 — s2 should sort first.
      const random = () => { calls += 1; return calls === 1 ? 0.9 : 0.1; };
      const result = getUpNextSessions([s1, s2], liveStreamActiveIds, nowMs, { random });
      expect(result.map((s) => s.id)).to.deep.equal(['b', 'a']);
    });

    it('accepts a custom cap', () => {
      const sessionList = Array.from({ length: 5 }, (_, i) => session(`s${i}`, i + 1, i + 10));
      expect(getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, { cap: 3 })).to.have.length(3);
    });
  });

  describe('getBroadcastSchedule', () => {
    it('combines active/alsoLive/upNext into one shape', () => {
      const active = session('a', -10, 10);
      const other = session('b', -5, 15);
      const upcoming = session('c', 10, 20);
      const result = getBroadcastSchedule(
        [active, other, upcoming],
        liveStreamActiveIds,
        nowMs,
        { activeSessionId: 'a' },
      );
      expect(result.activeSession.id).to.equal('a');
      expect(result.alsoLive.map((s) => s.id)).to.deep.equal(['b']);
      expect(result.upNext.map((s) => s.id)).to.deep.equal(['c']);
    });

    it('offers pendingCandidates instead of auto-picking, leaving the caller to commit one', () => {
      const a = session('a', -10, 10);
      const b = session('b', -20, 5); // started earlier, same bucket (both default youTubeId)
      const result = getBroadcastSchedule([a, b], liveStreamActiveIds, nowMs, {});
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates.map((s) => s.id).sort()).to.deep.equal(['a', 'b']);
      expect(result.endedSession).to.equal(null);
    });

    it('returns null activeSession/pendingCandidates when nothing is live and nothing was ever committed', () => {
      const result = getBroadcastSchedule([session('a', 10, 20)], liveStreamActiveIds, nowMs, {});
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
      expect(result.alsoLive).to.deep.equal([]);
      expect(result.endedSession).to.equal(null);
    });

    it('never crosses buckets automatically — an ended MPC session waits/ends even while YouTube is live', () => {
      const endedMpc = mpcSession('m', -60, 30); // ended 30 min ago, no next MPC group
      const liveYt = ytSession('y', -5, 20); // a different bucket, currently live
      const result = getBroadcastSchedule([endedMpc, liveYt], liveStreamActiveIds, nowMs, { activeSessionId: 'm' });
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
      expect(result.endedSession.id).to.equal('m');
      // Also-Live stays cross-bucket — the still-live YouTube session is a valid manual pick.
      expect(result.alsoLive.map((s) => s.id)).to.deep.equal(['y']);
    });

    it('auto-advances within a bucket to the next group once its start is reached', () => {
      const endedMpc = mpcSession('m1', -60, 30); // ended 30 min ago
      const nextGroupMpc = mpcSession('m2', -10, 30); // started 10 min ago, still live
      const result = getBroadcastSchedule(
        [endedMpc, nextGroupMpc],
        liveStreamActiveIds,
        nowMs,
        { activeSessionId: 'm1' },
      );
      expect(result.activeSession).to.equal(null);
      expect(result.endedSession).to.equal(null);
      expect(result.pendingCandidates.map((s) => s.id)).to.deep.equal(['m2']);
    });

    // A cancelled session typically flips isOnline (dropping it from eligibility) while keeping
    // its player-id field — bucket resolution must still work off the raw session, not the
    // eligibility-filtered list, so cancellation gets the same in-bucket handling as a normal end.
    it('keeps in-bucket handling for a committed session that becomes ineligible (e.g. cancelled)', () => {
      const cancelled = ytSession('c', -60, -30, { isOnline: false }); // no longer eligible at all
      const nextGroup = ytSession('n', -5, 20); // still eligible, later group, already started
      const result = getBroadcastSchedule(
        [cancelled, nextGroup],
        liveStreamActiveIds,
        nowMs,
        { activeSessionId: 'c' },
      );
      expect(result.pendingCandidates.map((s) => s.id)).to.deep.equal(['n']);
    });

    it('ignores sessions with an unparseable startTimeUtc instead of crashing or grouping them together', () => {
      const broken1 = session('broken1', 0, 10, { startTimeUtc: 'not-a-date' });
      const broken2 = session('broken2', 0, 10, { startTimeUtc: 'also-not-a-date' });
      const fine = session('fine', -10, 10);
      const result = getBroadcastSchedule([broken1, broken2, fine], liveStreamActiveIds, nowMs, {});
      expect(result.pendingCandidates.map((s) => s.id)).to.deep.equal(['fine']);
    });

    it('excludes a currently-time-windowed session flagged hasOnDemandFormat from alsoLive', () => {
      const onDemand = session('od', -10, 10, { hasOnDemandFormat: true });
      const live = session('live', -10, 10);
      const result = getBroadcastSchedule([onDemand, live], liveStreamActiveIds, nowMs, { activeSessionId: 'live' });
      expect(result.alsoLive).to.deep.equal([]);
    });

    // A first-time visitor (no activeSessionId at all) landing on a gap where nothing is live in
    // either bucket should still get an ended-state anchor instead of a bare page.
    it('surfaces an ended session for a first-time visitor landing on a gap', () => {
      const ended = ytSession('ended', -60, -50);
      const result = getBroadcastSchedule([ended], liveStreamActiveIds, nowMs, {});
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
      expect(result.endedSession.id).to.equal('ended');
    });

    it('prefers whichever bucket aired more recently when both have an ended group to offer', () => {
      const olderMpc = mpcSession('older-mpc', -60, 5); // ended ~55 min ago
      const recentYt = ytSession('recent-yt', -20, -10); // ended ~10 min ago
      const result = getBroadcastSchedule([olderMpc, recentYt], liveStreamActiveIds, nowMs, {});
      expect(result.endedSession.id).to.equal('recent-yt');
    });

    it('does not synthesize an ended session when nothing has ever aired at all', () => {
      const upcoming = ytSession('upcoming', 10, 20);
      const result = getBroadcastSchedule([upcoming], liveStreamActiveIds, nowMs, {});
      expect(result.activeSession).to.equal(null);
      expect(result.pendingCandidates).to.equal(null);
      expect(result.endedSession).to.equal(null);
    });

    // Partial support for a future bucket-less player type (MobileRider today — real playback
    // isn't wired up for MAX26, but the schedule-layer commitment must not be discarded just
    // because there's no bucket/group model for it).
    describe('bucket-less commitments (MobileRider today)', () => {
      it('keeps a still-live bucket-less commitment as the active session', () => {
        const mrLive = session('mr-1', -10, 10, { youTubeId: '', mpcId: '', mrStreamId: 'mr-1' });
        const activeIds = new Set(['mr-1']);
        const result = getBroadcastSchedule([mrLive], activeIds, nowMs, { activeSessionId: 'mr-1' });
        expect(result.activeSession?.id).to.equal('mr-1');
        expect(result.endedSession).to.equal(null);
      });

      it('does not let a live YouTube/MPC session silently replace a still-live bucket-less commitment', () => {
        const mrLive = session('mr-1', -10, 10, { youTubeId: '', mpcId: '', mrStreamId: 'mr-1' });
        const liveYt = ytSession('yt-1', -5, 20);
        const activeIds = new Set(['mr-1']);
        const result = getBroadcastSchedule([mrLive, liveYt], activeIds, nowMs, { activeSessionId: 'mr-1' });
        expect(result.activeSession?.id).to.equal('mr-1');
        // The other live session still surfaces as a manual option, same as any other bucket.
        expect(result.alsoLive.map((s) => s.id)).to.deep.equal(['yt-1']);
      });

      it('falls through to the ordinary bootstrap once a bucket-less commitment stops being live', () => {
        const mrEnded = session('mr-1', -20, -10, { youTubeId: '', mpcId: '', mrStreamId: 'mr-1' });
        const liveYt = ytSession('yt-1', -5, 20);
        const result = getBroadcastSchedule([mrEnded, liveYt], liveStreamActiveIds, nowMs, { activeSessionId: 'mr-1' });
        expect(result.pendingCandidates.map((s) => s.id)).to.deep.equal(['yt-1']);
      });
    });
  });

  describe('hasPlayableVideoSource', () => {
    it('is true when youTubeId is set', () => {
      expect(hasPlayableVideoSource({ youTubeId: 'abc', mpcId: '', mrStreamId: null })).to.be.true;
    });

    it('is true when mpcId is set', () => {
      expect(hasPlayableVideoSource({ youTubeId: '', mpcId: '3458902', mrStreamId: null })).to.be.true;
    });

    it('is true when mrStreamId is set', () => {
      expect(hasPlayableVideoSource({ youTubeId: '', mpcId: '', mrStreamId: 'mr-1' })).to.be.true;
    });

    it('is false when no video source field is set', () => {
      expect(hasPlayableVideoSource({ youTubeId: '', mpcId: '', mrStreamId: null })).to.be.false;
    });

    it('is false for an empty session object (missing fields entirely)', () => {
      expect(hasPlayableVideoSource({})).to.be.false;
    });
  });
});
