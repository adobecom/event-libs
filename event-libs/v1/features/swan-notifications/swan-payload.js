// Pure functions — session/config in, timing/payload objects out. No fetch, no
// module-level state, so these are trivially unit-testable in isolation from
// ans-controller.js's network layer.

// Matches the default northstar's authoring UI fell back to (SwanNotificationsUI.js's
// defaultProps). Guards against Number(undefined) === NaN silently turning into a
// null/dropped timestamp in the ANS request when an author omits the field.
const DEFAULT_UPCOMING_OFFSET_MINUTES = 5;

// Mirrors northstar's SWANNotificationsService.calculateSessionTimes(): three key
// instants derived from the session's start/end time and the authored lead time.
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

// sessionPageUrl is a relative path (e.g. "/sessions/my-session") — ANS payloads are
// consumed outside page context (OS push, UNC widget), so it must be absolute at
// creation time. Resolved against the creating page's own origin; see this feature's
// open-risk note on whether that's correct for every delivery context.
function resolveSessionUrl(sessionPageUrl) {
  if (!sessionPageUrl) return window.location.origin;
  try {
    return new URL(sessionPageUrl, window.location.origin).toString();
  } catch {
    return window.location.origin;
  }
}

// Builds the ANS notification payload for a session. ESP's normalized session has a
// single sessionPageUrl (unlike northstar's AEM liveUrl/cardUrl split), so targetUrl
// and onDemandUrl resolve to the same URL.
export function buildNotificationPayload(session, timingProperties, swanConfig) {
  const url = resolveSessionUrl(session.sessionPageUrl);
  const title = `Adobe ${swanConfig.eventName || 'Event'} Session`;
  const content = session.title || title;

  return {
    targetUrl: url,
    onDemandUrl: url,
    serviceIcon: { iconUrl: swanConfig.defaultNotificationIconUrl || '' },
    image: { imageUrl: swanConfig.defaultNotificationImageUrl || '' },
    // ANS expects these two fields in seconds, not ms — confirmed against northstar's
    // own implementation, which flags it as an undocumented quirk.
    goLiveTime: timingProperties.triggerLiveBadgeTime / 1000,
    goLiveExpireTime: timingProperties.triggerOnDemandBadgeTime / 1000,
    title,
    content,
    message: content,
    OSTitle: title,
    OSMessage: content,
  };
}
