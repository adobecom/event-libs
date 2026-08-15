import { getSessionDayKey, isSessionLive, isSessionUpcoming } from './time.js';
import { deriveSessionState, isInLiveNow } from '../../../utils/session-state.js';
import { getTrackIcon, getOverrideTrackIcon, DEFAULT_ICON_COLOR } from '../../../utils/tier-1-event-config.js';

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

// Digital Agenda Track badge/swimlane model — full case table in PLAN.md §16.2. In short:
// an override, when present, always wins the lane and badge over the primary track; a
// session with neither is excluded entirely (no "Other" bucket).
export function resolveTrackBadge(session) {
  const hasPrimary = !!session.track;
  const hasOverride = !!session.trackOverride;
  // Only one additional track is supported even though the ESP field is multi-select.
  const additional = (session.additionalTracks || []).slice(0, 1);

  if (!hasPrimary && !hasOverride) return null;

  if (hasOverride) {
    const overrideIcon = getOverrideTrackIcon(session.trackOverride);
    return {
      label: session.trackOverride,
      icon: overrideIcon?.icon || null,
      color: overrideIcon?.color || DEFAULT_ICON_COLOR,
      count: additional.length,
      isOverride: true,
      swimlanes: [session.trackOverride, ...additional],
      stackedTracks: additional.length > 0 ? additional : null,
    };
  }

  const trackIcon = getTrackIcon(session.track);
  return {
    label: session.track,
    icon: trackIcon?.icon || null,
    color: trackIcon?.color || DEFAULT_ICON_COLOR,
    count: additional.length,
    isOverride: false,
    swimlanes: [session.track, ...additional],
    stackedTracks: additional.length > 0 ? [session.track, ...additional] : null,
  };
}

// Places each session into every lane from resolveTrackBadge().swimlanes. swimlaneOrder
// (authored [{ track, displayName, enabled }]) controls a lane's enabled state, display
// name, and order; unlisted swimlanes stay enabled under their raw name, appended last.
export function groupByTrack(sessions, swimlaneOrder) {
  const map = new Map();
  for (const s of sessions) {
    const badge = resolveTrackBadge(s);
    if (!badge) continue;
    badge.swimlanes.forEach((track) => {
      if (!map.has(track)) map.set(track, []);
      map.get(track).push(s);
    });
  }

  const configByTrack = new Map((swimlaneOrder || []).map((entry) => [entry.track, entry]));
  const entries = [...map.entries()]
    .filter(([track]) => configByTrack.get(track)?.enabled !== false)
    .map(([track, trackSessions]) => [track, trackSessions, configByTrack.get(track)?.displayName || track]);

  if (!swimlaneOrder || swimlaneOrder.length === 0) return entries;
  const orderIndex = new Map(swimlaneOrder.map((entry, i) => [entry.track, i]));
  return entries.sort(
    ([a], [b]) => (orderIndex.get(a) ?? swimlaneOrder.length) - (orderIndex.get(b) ?? swimlaneOrder.length),
  );
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
 * Recommended sessions for the active day, shown in the live carousel when nothing is
 * live. When recommendedIds is non-empty, maps them to sessions on the active day in
 * authored order (max 3) — not the catalog's order, so
 * RecommendedSessionsEditor.js's reorder UI actually affects display order.
 * Falls back to a deterministic random selection of up to 3 day sessions when no ids configured.
 */
export function getRecommendedSessions(sessions, recommendedIds, activeDay, userTz) {
  const daySessions = sessionsForDay(sessions, activeDay, userTz);

  if (recommendedIds && recommendedIds.length > 0) {
    const daySessionsById = new Map(daySessions.map((s) => [s.id, s]));
    return recommendedIds.map((id) => daySessionsById.get(id)).filter(Boolean).slice(0, 3);
  }

  return deterministicShuffle(daySessions, activeDay).slice(0, 3);
}

/**
 * Recommended sessions for the on-demand view: same authored recommendedIds array as
 * getRecommendedSessions, in the same authored order, but ID-membership only — no
 * day-scoping (on-demand content isn't tied to a single event day) and no shuffle
 * fallback (nothing to show when nothing's authored, unlike the live carousel's need
 * to fill dead space when nothing's live).
 */
export function getOnDemandRecommendedSessions(sessions, recommendedIds) {
  if (!recommendedIds || recommendedIds.length === 0) return [];
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  return recommendedIds.map((id) => sessionsById.get(id)).filter(Boolean).slice(0, 3);
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
