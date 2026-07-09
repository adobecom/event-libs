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
