import { getHomepagePath, getBroadcastPath } from './tier-1-event-config.js';
import { MAX_EVENT_PAGES } from './constances.js';

// `?serverTime=<ms>` simulates landing at a given instant. An origin, not a freeze — the
// clock keeps advancing, so a tester can park just before a transition and watch it happen.
const SERVER_TIME_ORIGIN = (() => {
  try {
    const raw = new URLSearchParams(window.location.search).get('serverTime');
    const ms = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
})();
const PAGE_LOAD_MS = Date.now();

export function getNowMs() {
  if (SERVER_TIME_ORIGIN == null) return Date.now();
  return SERVER_TIME_ORIGIN + (Date.now() - PAGE_LOAD_MS);
}

const HOUR_MS = 3_600_000;

// Counted from the event start, not the session end — the attribute is authored event-wide.
export function dvrAvailableAtMs(session, eventStartMs) {
  if (session?.dvrDelayHours == null || !eventStartMs) return null;
  return eventStartMs + session.dvrDelayHours * HOUR_MS;
}

// Not read by the sessions-guide's own filtering (PM decision, 2026-08-26 — see
// onDemandSessions() in sessions-guide/utils/session-filters.js) — kept as a shared utility
// for any other block that needs to know whether a session's recording window has opened.
// Fails open when either input is missing.
export function isDvrPending(session, nowMs, eventStartMs) {
  const availableAt = dvrAvailableAtMs(session, eventStartMs);
  return availableAt !== null && nowMs < availableAt;
}

// MR poll results for mrStreamId sessions, pure time-window for the rest. Never stored in
// the reducer — computed fresh at render time.
export function deriveSessionState(session, liveStreamActiveIds, nowMs) {
  // Never airing, so neither the clock nor an active MR stream applies.
  if (session.hasOnDemandFormat) return 'on-demand';

  const start = Date.parse(session.startTimeUtc);
  const end = Date.parse(session.endTimeUtc);

  if (session.mrStreamId) {
    // Inactive in the poll = on-demand regardless of time.
    if (!liveStreamActiveIds.has(session.mrStreamId)) {
      return nowMs < start ? 'upcoming' : 'on-demand';
    }
    return nowMs >= start ? 'live' : 'upcoming';
  }

  if (nowMs > end) return 'on-demand';
  if (nowMs >= start) return 'live';
  return 'upcoming';
}

// Only MR sessions past their start time and active in the MR API.
export function isInLiveNow(session, liveStreamActiveIds, nowMs) {
  if (!session.mrStreamId) return false;
  const start = Date.parse(session.startTimeUtc);
  return nowMs >= start && liveStreamActiveIds.has(session.mrStreamId);
}

// Every session on-demand, or the authored eventEndMs has passed. An empty list alone never
// satisfies the former; eventEndMs is independently sufficient.
export function isPostEvent(sessionList, liveStreamActiveIds, nowMs, eventEndMs) {
  const pastEventEnd = eventEndMs ? nowMs >= eventEndMs : false;
  const allEnded = sessionList.length > 0 && sessionList.every(
    (s) => deriveSessionState(s, liveStreamActiveIds, nowMs) === 'on-demand',
  );
  return allEnded || pastEventEnd;
}

// Root-relative: the destinations live on whatever domain is serving this page. Falls back
// to MAX's pages for configs predating the authorable homepagePath/broadcastPath.
export function getWatchDestination(session, sessionState) {
  if (sessionState === 'on-demand') return session.sessionPageUrl || '';
  if (sessionState !== 'live') return '';
  if (session.isLivestreamed) return getHomepagePath() || MAX_EVENT_PAGES.homepage;
  if (session.isOnline) return getBroadcastPath() || MAX_EVENT_PAGES.broadcast;
  return '';
}
