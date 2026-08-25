// Pure functions — session/config in, timing/entry objects out. No fetch, no
// module-level state, so these are trivially unit-testable in isolation from
// unc-store.js's/swan-notifications.js's storage layer.

// Guards against Number(undefined) === NaN silently turning into a null/dropped
// trigger time when an author omits the field.
const DEFAULT_UPCOMING_OFFSET_MINUTES = 5;

// Three key instants derived from the session's start/end time and the lead time.
export function calculateSessionTimes(session, upcomingOffsetMinutes) {
  const startTimeMs = Date.parse(session.startTimeUtc);
  const endTimeMs = Date.parse(session.endTimeUtc);
  const offsetMinutes = Number(upcomingOffsetMinutes);
  const offsetMs = (Number.isFinite(offsetMinutes) ? offsetMinutes : DEFAULT_UPCOMING_OFFSET_MINUTES) * 60 * 1000;
  return {
    triggerNotificationTime: startTimeMs - offsetMs,
    triggerLiveBadgeTime: startTimeMs,
    triggerOnDemandBadgeTime: endTimeMs,
  };
}

// sessionPageUrl is a relative path (e.g. "/sessions/my-session") — resolved against
// the current page's own origin, since that's the only origin this feature ever runs in.
function resolveSessionUrl(sessionPageUrl) {
  if (!sessionPageUrl) return window.location.origin;
  try {
    return new URL(sessionPageUrl, window.location.origin).toString();
  } catch {
    return window.location.origin;
  }
}

// Identifies every entry SWAN creates in UNC's (shared) local notification store, so
// reconcile/diff logic never touches an entry another product created.
export const SWAN_ENTRY_SOURCE = 'swan-events';

// Deterministic id from rfCode alone — no separate id-mapping/bookkeeping needed to
// find "this session's" entry again for an edit/remove call.
export function buildLocalNotificationId(rfCode) {
  return `swan-${rfCode}`;
}

// Builds the entry passed to UNC store's add()/edit() for a session at a given stage
// ('reminder' | 'live' | 'on-demand'). Schema is a placeholder pending confirmation
// with the UNC team — see docs/swan-unc-dependencies.md.
export function buildLocalNotificationEntry(session, stage, swanConfig) {
  const url = resolveSessionUrl(session.sessionPageUrl);
  const title = `Adobe ${swanConfig.eventName || 'Event'} Session`;
  const content = session.title || title;

  return {
    id: buildLocalNotificationId(session.rfCode),
    source: SWAN_ENTRY_SOURCE,
    stage,
    title,
    message: content,
    url,
    icon: swanConfig.defaultNotificationIconUrl || '',
    image: swanConfig.defaultNotificationImageUrl || '',
    timestamp: Date.now(),
  };
}
