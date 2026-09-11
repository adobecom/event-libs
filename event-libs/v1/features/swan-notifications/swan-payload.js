// Pure functions — session/config in, entry objects out. No fetch, no module-level
// state, so these are trivially unit-testable in isolation from the storage/display layer.

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

// Short status copy for a panel row's accessible label, per stage.
export const STAGE_COPY = {
  reminder: 'starts soon',
  live: 'is live now',
  'on-demand': 'is available on-demand',
};

// The single leaf payload the notification widget needs to render a row.
//
// `category` is a kicker label ("Adobe MAX Session") distinct from `title` (the real session
// title) — per the Figma spec's row layout, both render simultaneously on separate lines, so
// unlike `title` this is never a fallback-only value.
export function buildNotificationEntry(session, stage, swanConfig) {
  const category = `Adobe ${swanConfig.eventName || 'Event'} Session`;
  return {
    title: session.title || category,
    category,
    stage,
    startTimeMs: Date.parse(session.startTimeUtc),
    endTimeMs: Date.parse(session.endTimeUtc),
    actionUrl: resolveSessionUrl(session.sessionPageUrl),
    iconUrl: swanConfig.defaultNotificationIconUrl || '',
  };
}
