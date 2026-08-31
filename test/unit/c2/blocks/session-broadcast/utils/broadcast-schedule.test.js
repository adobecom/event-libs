import { expect } from '@esm-bundle/chai';
import {
  UP_NEXT_CAP,
  getLiveSessions,
  getUpNextSessions,
  getBroadcastSchedule,
  hasPlayableVideoSource,
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
    ...overrides,
  };
}

describe('broadcast-schedule', () => {
  const nowMs = Date.now();
  const liveStreamActiveIds = new Set();

  describe('getLiveSessions', () => {
    it('returns only currently-live sessions, sorted earliest-start first', () => {
      const s1 = session('a', -10, 10);
      const s2 = session('b', -20, 5); // started earlier, still live
      const upcoming = session('c', 10, 20);
      const ended = session('d', -30, -10);
      const result = getLiveSessions([s1, s2, upcoming, ended], liveStreamActiveIds, nowMs);
      expect(result.map((s) => s.id)).to.deep.equal(['b', 'a']);
    });

    it('supports 6 concurrent live sessions with no artificial cap', () => {
      const sessionList = Array.from({ length: 6 }, (_, i) => session(`s${i}`, -5, 10));
      expect(getLiveSessions(sessionList, liveStreamActiveIds, nowMs)).to.have.length(6);
    });

    it('returns an empty array when nothing is live', () => {
      const sessionList = [session('a', 10, 20), session('b', -30, -10)];
      expect(getLiveSessions(sessionList, liveStreamActiveIds, nowMs)).to.deep.equal([]);
    });

    // Mainstage/keynote sessions belong on the homepage (getWatchDestination routes them
    // there), not Broadcast — ticket: "Keynote/sneaks will be on homepage main player" is
    // explicitly out of scope here, regardless of the session otherwise being live.
    it('excludes a live mainstage/keynote session (isLivestreamed), even if also marked isOnline', () => {
      const keynote = session('keynote', -10, 10, { isLivestreamed: true, isOnline: true });
      const breakout = session('breakout', -10, 10);
      const result = getLiveSessions([keynote, breakout], liveStreamActiveIds, nowMs);
      expect(result.map((s) => s.id)).to.deep.equal(['breakout']);
    });

    it('excludes a live session that is neither online nor livestreamed (e.g. in-person only)', () => {
      const inPersonOnly = session('in-person', -10, 10, { isOnline: false });
      expect(getLiveSessions([inPersonOnly], liveStreamActiveIds, nowMs)).to.deep.equal([]);
    });

    // Defensive precaution against an authoring gap: an otherwise-eligible session with no
    // player ID configured has nothing to actually play — better to never list it at all than
    // let a viewer click into a session with no video behind it.
    it('excludes a live, otherwise-eligible session with no video source configured', () => {
      const noVideo = session('no-video', -10, 10, { youTubeId: '', mpcId: '', mrStreamId: null });
      const withVideo = session('with-video', -10, 10);
      const result = getLiveSessions([noVideo, withVideo], liveStreamActiveIds, nowMs);
      expect(result.map((s) => s.id)).to.deep.equal(['with-video']);
    });

    it('includes a live session whose only video source is mpcId', () => {
      const mpcOnly = session('mpc-only', -10, 10, { youTubeId: '', mpcId: '3458902' });
      expect(getLiveSessions([mpcOnly], liveStreamActiveIds, nowMs).map((s) => s.id)).to.deep.equal(['mpc-only']);
    });

    it('includes a live session whose only video source is mrStreamId', () => {
      // mrStreamId sessions derive live state from the MR poll set, not pure time (see
      // deriveSessionState) — needs its stream id present in liveStreamActiveIds to read as live.
      const mrOnly = session('mr-only', -10, 10, { youTubeId: '', mpcId: '', mrStreamId: 'mr-1' });
      const activeIds = new Set(['mr-1']);
      expect(getLiveSessions([mrOnly], activeIds, nowMs).map((s) => s.id)).to.deep.equal(['mr-only']);
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

    // PRD: "Auto-switching - no sessions should auto transition a user without their action"
    // is explicitly Out of Scope — a committed session that ends must never be silently
    // replaced by a different live session. The caller (BroadcastApp/EndedState) is the one
    // that decides what to show instead, using activeSession: null + endedSession.
    it('does not fall back to a different live session once the committed one ends — surfaces endedSession instead', () => {
      const s1 = session('a', -10, 10); // still live, earliest — must NOT be auto-picked
      const ended = session('b', -30, -10); // the committed session, no longer live
      const result = getBroadcastSchedule([s1, ended], liveStreamActiveIds, nowMs, { activeSessionId: 'b' });
      expect(result.activeSession).to.equal(null);
      expect(result.endedSession.id).to.equal('b');
      // Every currently-live session becomes a join candidate once none of them is "active".
      expect(result.alsoLive.map((s) => s.id)).to.deep.equal(['a']);
    });

    it('only auto-picks a default when activeSessionId was never committed (initial load)', () => {
      const s1 = session('a', -10, 10);
      const s2 = session('b', -20, 5); // started earlier
      const result = getBroadcastSchedule([s1, s2], liveStreamActiveIds, nowMs, {});
      expect(result.activeSession.id).to.equal('b');
      expect(result.endedSession).to.equal(null);
    });

    it('returns a null activeSession and empty alsoLive when nothing is live and nothing was ever committed', () => {
      const result = getBroadcastSchedule([session('a', 10, 20)], liveStreamActiveIds, nowMs, {});
      expect(result.activeSession).to.equal(null);
      expect(result.alsoLive).to.deep.equal([]);
      expect(result.endedSession).to.equal(null);
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
