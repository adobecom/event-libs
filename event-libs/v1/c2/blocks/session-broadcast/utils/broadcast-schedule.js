import { deriveSessionState, isBroadcastEligible } from '../../../../utils/session-state.js';

// Ticket says 15, the PRD says 30 — shipping 15 for this iteration (see plan's Up Next cap
// note); a single named constant so the real number is a one-line change once confirmed.
export const UP_NEXT_CAP = 15;

// A session can pass isBroadcastEligible (right type — online, not a mainstage/keynote) and
// still have nothing to actually play if authoring never set a player ID for it — PlayerHost
// would fall back to its "isn't supported yet" message, exposing a session with no video
// behind it. This is a defensive precaution against exactly that authoring gap, not a product
// requirement: better to simply never list a session on the page than let a viewer click into
// one with nothing to watch. Checks all three recognized video-source fields, not just the
// ones with a built adapter today, so MobileRider sessions start showing for free once that
// adapter ships, with no change needed here.
export function hasPlayableVideoSource(session) {
  return !!(session.youTubeId || session.mpcId || session.mrStreamId);
}

// isBroadcastEligible excludes mainstage/keynote sessions (isLivestreamed) — those belong on
// the homepage per the ticket, not here, regardless of whether they're live or upcoming. Every
// function below filters through both this and hasPlayableVideoSource so the session pool this
// page ever shows or plays from is never contaminated by homepage-only content or by a session
// with no configured video source.
function isLive(session, liveStreamActiveIds, nowMs) {
  return isBroadcastEligible(session)
    && hasPlayableVideoSource(session)
    && deriveSessionState(session, liveStreamActiveIds, nowMs) === 'live';
}

function isUpcoming(session, liveStreamActiveIds, nowMs) {
  return isBroadcastEligible(session)
    && hasPlayableVideoSource(session)
    && deriveSessionState(session, liveStreamActiveIds, nowMs) === 'upcoming';
}

function byStartTimeAsc(a, b) {
  return Date.parse(a.startTimeUtc) - Date.parse(b.startTimeUtc);
}

// Every currently-live session, sorted earliest-first — the deterministic order the primary
// player and Also Live carousel are both derived from. Naturally supports the ticket's
// "up to 5-6 concurrent" case with no hardcoded limit on how many can be live at once.
export function getLiveSessions(sessionList, liveStreamActiveIds, nowMs) {
  return sessionList
    .filter((s) => isLive(s, liveStreamActiveIds, nowMs))
    .sort(byStartTimeAsc);
}

// Upcoming sessions, capped at `cap`, chronological by start time with a random tiebreak for
// sessions sharing the same start time (ticket AC). Backfilling across day boundaries falls
// out for free: this recomputes from live state on every ticker tick, so a session simply
// stops appearing once it transitions out of 'upcoming'. `random` is injectable so tests can
// assert on a fixed tiebreak order.
export function getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, {
  cap = UP_NEXT_CAP, random = Math.random,
} = {}) {
  return sessionList
    .filter((s) => isUpcoming(s, liveStreamActiveIds, nowMs))
    .map((session) => ({ session, tiebreak: random() }))
    .sort((a, b) => byStartTimeAsc(a.session, b.session) || (a.tiebreak - b.tiebreak))
    .slice(0, cap)
    .map(({ session }) => session);
}

// Single entry point BroadcastApp calls on every ticker tick: the primary session, everyone
// else live, the capped/sorted upcoming list, and — see `endedSession` below — whichever
// session just stopped being the primary session, if any.
//
// `activeSessionId` is a *commitment*, not a preference: once a session has been chosen (by
// the one-time initial default pick, a manual "Watch Live" click, or the entry `?watch=`
// param), it stays the reference point until it stops being live — it is never silently
// swapped out for a different live session on its own. The PRD is explicit about this
// ("Auto-switching - no sessions should auto transition a user without their action" is listed
// under Out of Scope), so when the committed session ends, this returns `activeSession: null`
// and surfaces it as `endedSession` instead of quietly picking a new default — the caller
// (BroadcastApp/EndedState) renders the ended-state interstitial and waits for the viewer to
// pick something from `alsoLive` (which becomes every currently-live session in this case,
// since none of them is "active") or `upNext`.
//
// The *only* time an automatic pick happens is when `activeSessionId` is null/undefined —
// i.e. nothing has ever been committed yet, matching the ticket's initial-load behavior
// ("the first session in the current time block").
export function getBroadcastSchedule(sessionList, liveStreamActiveIds, nowMs, {
  activeSessionId, cap, random,
} = {}) {
  const liveSessions = getLiveSessions(sessionList, liveStreamActiveIds, nowMs);
  const upNext = getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, { cap, random });

  if (!activeSessionId) {
    const activeSession = liveSessions[0] || null;
    return {
      activeSession,
      alsoLive: liveSessions.filter((s) => s.id !== activeSession?.id),
      upNext,
      endedSession: null,
    };
  }

  const stillLive = liveSessions.find((s) => s.id === activeSessionId);
  if (stillLive) {
    return {
      activeSession: stillLive,
      alsoLive: liveSessions.filter((s) => s.id !== activeSessionId),
      upNext,
      endedSession: null,
    };
  }

  return {
    activeSession: null,
    alsoLive: liveSessions,
    upNext,
    endedSession: sessionList.find((s) => s.id === activeSessionId) || null,
  };
}
