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
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
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
    if (getSessionDayKey(s, userTz) !== activeDay) return false;
    if (s.mrStreamId) return isInLiveNow(s, liveStreamActiveIds, nowMs);
    return isSessionLive(s, nowMs);
  });
}

// Upcoming sessions: MR sessions use poll status; non-MR use time window.
export function upcomingSessions(sessions, liveStreamActiveIds, activeDay, userTz, nowMs) {
  return sessions.filter((s) => {
    if (getSessionDayKey(s, userTz) !== activeDay) return false;
    if (s.mrStreamId) return deriveSessionState(s, liveStreamActiveIds, nowMs) === 'upcoming';
    return isSessionUpcoming(s, nowMs);
  });
}

// On-demand sessions: MR sessions use poll status; non-MR use time window.
export function onDemandSessions(sessions, liveStreamActiveIds, nowMs) {
  return sessions.filter((s) => {
    if (s.mrStreamId) return deriveSessionState(s, liveStreamActiveIds, nowMs) === 'on-demand';
    return !isSessionLive(s, nowMs) && !isSessionUpcoming(s, nowMs);
  });
}

/**
 * Featured sessions for the active day, shown in the live carousel when nothing is live.
 * When featuredIds is non-empty, maps them to sessions on the active day (max 3).
 * Falls back to a deterministic random selection of up to 3 day sessions when no ids configured.
 */
export function getFeaturedSessions(sessions, featuredIds, activeDay, userTz) {
  const daySessions = sessionsForDay(sessions, activeDay, userTz);

  if (featuredIds && featuredIds.length > 0) {
    const idSet = new Set(featuredIds);
    return daySessions.filter((s) => idSet.has(s.id)).slice(0, 3);
  }

  return deterministicShuffle(daySessions, activeDay).slice(0, 3);
}

function deterministicShuffle(arr, seed) {
  const result = [...arr];
  let s = [...seed].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  for (let i = result.length - 1; i > 0; i--) {
    s = Math.abs(Math.sin(s + i) * 10000);
    const j = Math.floor(s) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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
