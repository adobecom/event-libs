// Pure functions — session/config in, entry objects out. No fetch, no module-level
// state, so these are trivially unit-testable in isolation from the storage/display layer.
import { getTrackIcon, getOverrideTrackIcon, getHomepagePath } from '../../utils/tier-1-event-config.js';
import { MAX_EVENT_PAGES } from '../../utils/constances.js';
import { getWatchDestination } from '../../utils/session-state.js';
import { safeUrl } from '../../utils/utils.js';
import { buildFederalTrackIconUrl } from '../icons/federal-icons.js';

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

// thumbnailUrl comes from the session-catalog endpoint (services/sessions/sessions-api.js's
// fetchSessions -> normalizeSessions) — that session's `session-card-image` asset, the same
// field sessions-guide's LiveCard.js already renders for its own thumbnail.
//
// The action path (session page, homepage, or broadcast path — see resolveActionPath below)
// is always root-relative — resolved against the current page's own origin, since that's the
// only origin this feature ever runs in. Gated through safeUrl() first, same as
// session-routing.js's resolveCardAction does for this same getWatchDestination output —
// blocks a javascript:/data:/cross-origin value from ever reaching window.location.href.
function resolveSessionUrl(path) {
  const safe = safeUrl(path);
  if (!safe) return window.location.origin;
  try {
    return new URL(safe, window.location.origin).toString();
  } catch {
    return window.location.origin;
  }
}

// Reuses session-state.js's getWatchDestination — the same routing sessions-guide's
// LiveCard/SessionDetailOverlay and session-routing.js's resolveCardAction use — so a live
// session goes to the homepage (isLivestreamed) or Broadcast (isOnline) instead of its own
// session page, matching every other entry point into a live session. getWatchDestination
// doesn't model 'reminder' at all, so that stage is handled here directly: a session that will
// livestream on the homepage already points there during its reminder window too (that's
// where its pre-show/countdown content lives), while every other upcoming session type still
// links to its own page. Also falls back to sessionPageUrl whenever getWatchDestination has
// nothing to offer (e.g. a live session that's neither isLivestreamed nor isOnline, like an
// in-person-only one) rather than leaving the row pointing at the bare origin.
function resolveActionPath(session, stage) {
  if (stage === 'reminder') {
    return session.isLivestreamed ? (getHomepagePath() || MAX_EVENT_PAGES.homepage) : session.sessionPageUrl;
  }
  return getWatchDestination(session, stage) || session.sessionPageUrl;
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
// Same precedence sessions-guide's resolveTrackBadge() uses: an author's explicit
// trackOverride wins over the session's own primaryTrack.
function resolveTrackIcon(session) {
  return getOverrideTrackIcon(session.trackOverride) || getTrackIcon(session.primaryTrack);
}

export function buildNotificationEntry(session, stage, swanConfig) {
  const category = `Adobe ${swanConfig.eventName || 'Event'} Session`;
  const trackIcon = resolveTrackIcon(session);
  return {
    title: session.title || category,
    category,
    stage,
    startTimeMs: Date.parse(session.startTimeUtc),
    endTimeMs: Date.parse(session.endTimeUtc),
    actionUrl: resolveSessionUrl(resolveActionPath(session, stage)),
    // Prefer the session's own catalog thumbnail; swanConfig.defaultNotificationIconUrl is
    // only a per-event fallback for a session that doesn't have one.
    iconUrl: session.thumbnailUrl || swanConfig.defaultNotificationIconUrl || '',
    // Icon *name* only — notification-widget.js resolves it to an SVG at render time, so a
    // failed/slow fetch never blocks building this entry.
    trackIconName: trackIcon?.icon || null,
  };
}

// --- unc mode ---
// The functions below build the campaign rule shape swan-notifications-unc.js hands to
// unc-client.js's registerReminderRule/deleteReminderRule. Ported from
// feat/swan-notifications (PR #276) — see docs/swan-unc-dependencies.md for how this shape
// was confirmed against UNC's own engine source.

// sessionPageUrl is a relative path (e.g. "/sessions/my-session") — resolved against
// the current page's own origin, since that's the only origin this feature ever runs in.
// Gated through safeUrl() first, same as buildNotificationEntry's own resolveSessionUrl
// above — this value ends up in a UNC campaign rule's defaultAction.url, which UNC's engine
// can surface as a clickable deep link, so a javascript:/data:/cross-origin sessionPageUrl
// must never reach it unsanitized.
function resolveUncSessionUrl(sessionPageUrl) {
  const safe = safeUrl(sessionPageUrl);
  if (!safe) return window.location.origin;
  try {
    return new URL(safe, window.location.origin).toString();
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

function toEpochSecondsString(isoString) {
  return String(Math.floor(Date.parse(isoString) / 1000));
}

function buildTimelineContent(session, stage, swanConfig) {
  const sessionTitle = session.title || `Adobe ${swanConfig.eventName || 'Event'} Session`;
  const trackIcon = resolveTrackIcon(session);
  const serviceIcon = session.thumbnailUrl
    || buildFederalTrackIconUrl(trackIcon?.icon)
    || swanConfig.defaultNotificationIconUrl
    || '';
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
      serviceIconDetails: { serviceIcon },
      defaultAction: { url: resolveUncSessionUrl(session.sessionPageUrl) },
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
