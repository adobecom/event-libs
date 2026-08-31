import { deriveSessionState, isBroadcastEligible } from '../../../../utils/session-state.js';

// Ticket says 15, PRD says 30 — shipping 15 (see PLAN.md); a named constant for a one-line fix.
export const UP_NEXT_CAP = 15;

// A session can be eligible but still have no player ID authored — better to never list it
// than let a viewer click into nothing. Checks all three fields so MobileRider sessions start
// showing for free once that adapter ships.
export function hasPlayableVideoSource(session) {
  return !!(session.youTubeId || session.mpcId || session.mrStreamId);
}

// isBroadcastEligible excludes mainstage/keynote sessions (they belong on the homepage).
// Every function below filters through both this and hasPlayableVideoSource.
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

// Every currently-live session, sorted earliest-first — no cap on concurrent live sessions.
export function getLiveSessions(sessionList, liveStreamActiveIds, nowMs) {
  return sessionList
    .filter((s) => isLive(s, liveStreamActiveIds, nowMs))
    .sort(byStartTimeAsc);
}

// Upcoming sessions, capped and chronological, with a random tiebreak for same-start-time
// sessions. `random` is injectable so tests can assert a fixed order.
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

// `activeSessionId` is a commitment, not a preference: once chosen, it's never silently
// swapped for a different live session (PRD: no auto-switching). If the committed session
// ends, this returns `activeSession: null` + `endedSession` instead of picking a new default —
// the caller renders the ended state and waits for the viewer to pick something. The only
// automatic pick happens when `activeSessionId` is unset (nothing committed yet).
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
