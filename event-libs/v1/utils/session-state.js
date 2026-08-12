// `?serverTime=<ms>` simulates landing on the page at a specific instant, for testing
// time-driven transitions without waiting for a real session's start/end. It's an origin,
// not a freeze — simulated time keeps advancing at the same rate as the real clock from
// whatever instant the page loaded, so a tester can park just before a transition and
// watch it happen rather than the clock staying frozen forever.
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

/**
 * Derives live/upcoming/on-demand state for a session.
 * Uses MR poll results for mrStreamId sessions; pure time-window for all others.
 * Never stored in the reducer — computed fresh at render time.
 *
 * @param {object} session
 * @param {Set<string>} liveStreamActiveIds - active mrStreamIds from latest MR poll
 * @param {number} nowMs - timestamp at render time
 * @returns {'live'|'upcoming'|'on-demand'}
 */
export function deriveSessionState(session, liveStreamActiveIds, nowMs) {
  const start = Date.parse(session.startTimeUtc);
  const end = Date.parse(session.endTimeUtc);

  if (session.mrStreamId) {
    // MR session: inactive in poll API = on-demand regardless of time
    if (!liveStreamActiveIds.has(session.mrStreamId)) {
      return nowMs < start ? 'upcoming' : 'on-demand';
    }
    return nowMs >= start ? 'live' : 'upcoming';
  }

  // Non-MR: pure time window
  if (nowMs > end) return 'on-demand';
  if (nowMs >= start) return 'live';
  return 'upcoming';
}

/**
 * Whether a session should appear in the Live Now section.
 * Only MR sessions past their start time that are active in the MR API qualify.
 */
export function isInLiveNow(session, liveStreamActiveIds, nowMs) {
  if (!session.mrStreamId) return false;
  const start = Date.parse(session.startTimeUtc);
  return nowMs >= start && liveStreamActiveIds.has(session.mrStreamId);
}

/**
 * Whether the event has functionally ended: every session is on-demand, or the manual
 * cutoff has passed. An empty session list is never "post-event".
 */
export function isPostEvent(sessionList, liveStreamActiveIds, nowMs, manualCutoff) {
  const pastManualCutoff = manualCutoff ? nowMs >= Date.parse(manualCutoff) : false;
  const allEnded = sessionList.length > 0 && sessionList.every(
    (s) => deriveSessionState(s, liveStreamActiveIds, nowMs) === 'on-demand',
  );
  return allEnded || pastManualCutoff;
}

/**
 * Where "Watch now" navigates: homepage player if isLivestreamed, broadcast page if
 * isOnline, own session page if on-demand, '' otherwise. Root-relative since the
 * destination pages live on whatever domain is currently serving this page.
 */
export function getWatchDestination(session, sessionState) {
  if (sessionState === 'on-demand') return session.sessionPageUrl || '';
  if (sessionState !== 'live') return '';
  // TODO: Maybe it needs to come from configs in case of Summit or other events with different homepage/broadcast pages.
  if (session.isLivestreamed) return '/max.html';
  if (session.isOnline) return '/max/broadcast.html';
  return '';
}
