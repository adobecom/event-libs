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

const SESSION_TRACKING_MECHANISM = 'local_storage';
const SESSION_TRACKING = true;
const COOLDOWN_TIMESTAMP = 0;
const GENERATE_NOTIFICATION = true;
const NOTIFICATION_TYPE = 'com.adobe.reminder.v1';
const NOTIFICATION_SUBTYPE = 'swan-session-reminder';

const STAGE_COPY = {
  reminder: 'starts soon',
  live: 'is live now',
  'on-demand': 'is available on-demand',
};

function toEpochSecondsString(isoString) {
  return String(Math.floor(Date.parse(isoString) / 1000));
}

function buildTimelineContent(session, stage, swanConfig) {
  const sessionTitle = session.title || `Adobe ${swanConfig.eventName || 'Event'} Session`;
  return {
    timeline: {
      viewtype: 'eventTimeline',
      content: `${sessionTitle} ${STAGE_COPY[stage]}`,
      dismissOnClick: true,
      eventData: {
        title: sessionTitle,
        goLiveTime: toEpochSecondsString(session.startTimeUtc),
        goLiveExpireTime: toEpochSecondsString(session.endTimeUtc),
      },
      serviceIconDetails: { serviceIcon: swanConfig.defaultNotificationIconUrl || '' },
      defaultAction: { url: resolveSessionUrl(session.sessionPageUrl) },
    },
  };
}

// scheduleAtSeconds (epoch seconds — confirmed against UNC's engine source, despite the
// wiki's stated "ms"), when given, lets UNC's own ~60s internal poller hold the notification
// until that time and fire it without any further action from this code — used for the
// reminder stage when its trigger time is still in the future. Omitted (schedule_after: 0),
// the notification's own generateNotification self-trigger fires it immediately — used for
// the reminder stage once already due, and always for live/on-demand, since those are only
// ever built once our own ticker has already determined the transition is due.
export function buildStageCampaignRule(session, stage, swanConfig, { scheduleAtSeconds } = {}) {
  const campaignId = buildCampaignId(session.rfCode, stage);
  const channelDetails = {
    local: true,
    local_notification_persist_till_days: swanConfig.localNotificationPersistTillDays,
    notification_type: NOTIFICATION_TYPE,
    notification_subtype: NOTIFICATION_SUBTYPE,
    payload: buildTimelineContent(session, stage, swanConfig),
  };
  if (scheduleAtSeconds) channelDetails.schedule_at = scheduleAtSeconds;
  else channelDetails.schedule_after = 0;

  const campaignRule = {
    session_tracking: SESSION_TRACKING,
    session_tracking_mechanism: SESSION_TRACKING_MECHANISM,
    cooldown_timestamp: COOLDOWN_TIMESTAMP,
    generateNotification: GENERATE_NOTIFICATION,
    events: [{
      stage: 1,
      wait_for_next_event: 0,
      event_details: [{ event_data: { campaignId } }],
      notification_channels: [{ channel_name: 'ADD_NOTIFICATION', channel_details: channelDetails }],
    }],
  };

  return { campaignId, campaignRule };
}
