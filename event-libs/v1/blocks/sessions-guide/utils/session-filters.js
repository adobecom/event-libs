import { getSessionDayKey, isSessionLive, isSessionUpcoming } from './time.js';
import { deriveSessionState, isInLiveNow } from './session-state.js';

export function sessionsForDay(sessions, activeDay, userTz) {
  return sessions.filter((s) => getSessionDayKey(s, userTz) === activeDay);
}

export function groupByStartTime(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const key = s.startTimeUtc;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.values()];
}

export function groupByTrack(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const track = s.track || 'Other';
    if (!map.has(track)) map.set(track, []);
    map.get(track).push(s);
  }
  return [...map.entries()];
}

// Live Now section: MR sessions use poll status; non-MR sessions use time window.
export function liveSessions(sessions, liveStreamActiveIds, activeDay, userTz, nowMs) {
  return sessions.filter((s) => {
    if (!getSessionDayKey(s, userTz) === activeDay) return false;
    if (s.mrStreamId) return isInLiveNow(s, liveStreamActiveIds, nowMs);
    return isSessionLive(s, nowMs) && getSessionDayKey(s, userTz) === activeDay;
  });
}

// Upcoming sessions: MR sessions use poll status; non-MR use time window.
export function upcomingSessions(sessions, liveStreamActiveIds, activeDay, userTz, nowMs) {
  // Support old 4-arg call signature: (sessions, activeDay, userTz, nowMs)
  let activeIds = liveStreamActiveIds;
  let day = activeDay;
  let tz = userTz;
  let now = nowMs;
  if (!(liveStreamActiveIds instanceof Set)) {
    activeIds = new Set();
    day = liveStreamActiveIds;
    tz = activeDay;
    now = userTz;
  }
  return sessions.filter((s) => {
    if (getSessionDayKey(s, tz) !== day) return false;
    if (s.mrStreamId) return deriveSessionState(s, activeIds, now) === 'upcoming';
    return isSessionUpcoming(s, now);
  });
}

// On-demand sessions: MR sessions use poll status; non-MR use time window.
export function onDemandSessions(sessions, liveStreamActiveIds, nowMs) {
  // Support old 2-arg call signature: (sessions, nowMs)
  let activeIds = liveStreamActiveIds;
  let now = nowMs;
  if (!(liveStreamActiveIds instanceof Set)) {
    activeIds = new Set();
    now = liveStreamActiveIds;
  }
  return sessions.filter((s) => {
    if (s.mrStreamId) return deriveSessionState(s, activeIds, now) === 'on-demand';
    return !isSessionLive(s, now) && !isSessionUpcoming(s, now);
  });
}

/**
 * Apply activeFilters + searchQuery to a session list.
 * activeFilters: { [categoryId]: Set<string> }
 * Returns a new array; does not mutate input.
 */
export function filterSessions(sessions, activeFilters, searchQuery) {
  let result = sessions;

  if (activeFilters) {
    Object.entries(activeFilters).forEach(([category, values]) => {
      if (!values || values.size === 0) return;
      result = result.filter((s) => {
        const v = s[category];
        if (Array.isArray(v)) return v.some((item) => values.has(item));
        return values.has(v);
      });
    });
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter((s) => matchesSearch(s, q));
  }

  return result;
}

function matchesSearch(session, q) {
  return (
    session.title?.toLowerCase().includes(q)
    || session.description?.toLowerCase().includes(q)
    || session.speakers?.some((sp) => sp.name?.toLowerCase().includes(q))
    || session.track?.toLowerCase().includes(q)
    || session.type?.toLowerCase().includes(q)
  );
}
