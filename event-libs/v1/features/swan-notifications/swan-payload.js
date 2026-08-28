// Pure functions — session/config in, rule/event objects out. No fetch, no module-level
// state, so these are trivially unit-testable in isolation from unc-client.js's engine layer.

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

// Deterministic per (rfCode, stage) — a UNC rule can only ever deliver one notification
// per "journey" (confirmed against UNC's engine source: multi-stage chaining is a
// drop-off/escalation model, not "the same notification, edited three times"), so
// reminder/live/on-demand are three independent rules, not one entry updated in place.
export function buildCampaignId(rfCode, stage) {
  return `swan-${rfCode}-${stage}`;
}

function buildNotificationContent(session, swanConfig) {
  const url = resolveSessionUrl(session.sessionPageUrl);
  const title = `Adobe ${swanConfig.eventName || 'Event'} Session`;
  const message = session.title || title;
  return {
    title,
    message,
    url,
    icon: swanConfig.defaultNotificationIconUrl || '',
    image: swanConfig.defaultNotificationImageUrl || '',
  };
}

// Builds a single-stage UNC rule (stage: 1, wait_for_next_event: 0 — fires on its own
// first match, no journey chaining) plus the host event that matches it. event_data's sole
// key (swan_campaign_id) is unique per call, so this can never accidentally match a
// different stage's still-registered rule. `local: true` and a plain `payload` string keep
// this network-free — never set `contentURL` (fetches from ODIN CDN) or a tracking-server
// session_tracking_mechanism here.
//
// scheduleAtSeconds (epoch seconds), when given, lets UNC's own ~60s internal poller hold
// the notification until that time and fire it without any further action from this code —
// used for the reminder stage when its trigger time is still in the future. Omitted
// (schedule_after: 0), the notification fires as soon as the host event below is sent —
// used for the reminder stage once already due, and always for live/on-demand, since those
// are only ever built once our own ticker has already determined the transition is due.
export function buildStageCampaignRule(session, stage, swanConfig, { scheduleAtSeconds } = {}) {
  const campaignId = buildCampaignId(session.rfCode, stage);
  const channelDetails = {
    local: true,
    notification_type: 'swan-session',
    notification_subtype: stage,
    schedule_time_buffer: swanConfig.scheduleTimeBufferSeconds,
    payload: JSON.stringify(buildNotificationContent(session, swanConfig)),
  };
  if (scheduleAtSeconds) channelDetails.schedule_at = scheduleAtSeconds;
  else channelDetails.schedule_after = 0;

  const campaignRule = {
    events: [{
      stage: 1,
      wait_for_next_event: 0,
      event_details: [{ surface_id: '', event_data: { swan_campaign_id: campaignId } }],
      notification_channels: [{ channel_name: 'ADD_NOTIFICATION', channel_details: channelDetails }],
    }],
  };

  return { campaignId, campaignRule, hostEvent: { swan_campaign_id: campaignId } };
}
