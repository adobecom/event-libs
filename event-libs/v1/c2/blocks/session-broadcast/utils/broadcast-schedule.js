import { deriveSessionState } from '../../../../utils/session-state.js';

// Ticket says 15, the PRD says 30 — shipping 15 for this iteration (see plan's Up Next cap
// note); a single named constant so the real number is a one-line change once confirmed.
export const UP_NEXT_CAP = 15;

function isLive(session, liveStreamActiveIds, nowMs) {
  return deriveSessionState(session, liveStreamActiveIds, nowMs) === 'live';
}

function isUpcoming(session, liveStreamActiveIds, nowMs) {
  return deriveSessionState(session, liveStreamActiveIds, nowMs) === 'upcoming';
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

// "First session in the current time block" (ticket) — the default primary-player pick when
// no session is explicitly selected.
export function getDefaultLiveSession(sessionList, liveStreamActiveIds, nowMs) {
  return getLiveSessions(sessionList, liveStreamActiveIds, nowMs)[0] || null;
}

// Every other currently-live session, excluding whichever is active in the primary player.
// The caller hides the Also Live carousel entirely when this returns an empty array (ticket:
// "if only one session is live, the Also Live carousel is hidden").
export function getAlsoLiveSessions(sessionList, liveStreamActiveIds, nowMs, activeSessionId) {
  return getLiveSessions(sessionList, liveStreamActiveIds, nowMs)
    .filter((s) => s.id !== activeSessionId);
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

// Single entry point BroadcastApp calls on every ticker tick: the primary session (the
// explicitly-requested one if it's still live, else the default), everyone else live, and the
// capped/sorted upcoming list.
export function getBroadcastSchedule(sessionList, liveStreamActiveIds, nowMs, {
  activeSessionId, cap, random,
} = {}) {
  const liveSessions = getLiveSessions(sessionList, liveStreamActiveIds, nowMs);
  const requestedActive = activeSessionId
    ? liveSessions.find((s) => s.id === activeSessionId)
    : null;
  const activeSession = requestedActive || liveSessions[0] || null;
  return {
    activeSession,
    alsoLive: liveSessions.filter((s) => s.id !== activeSession?.id),
    upNext: getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, { cap, random }),
  };
}
