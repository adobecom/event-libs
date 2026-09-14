// Pure functions — session/config in, entry objects out. No fetch, no module-level
// state, so these are trivially unit-testable in isolation from the storage/display layer.
import { getTrackIcon, getOverrideTrackIcon } from '../../utils/tier-1-event-config.js';
import { getWatchDestination } from '../../utils/session-state.js';
import { safeUrl } from '../../utils/utils.js';

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
// doesn't model 'reminder' (it only knows 'live'/'on-demand'), so that stage keeps linking to
// the session's own page, same as before. It also returns '' for a live session that's neither
// isLivestreamed nor isOnline (e.g. in-person-only) — falling back to sessionPageUrl there,
// rather than leaving the row pointing at the bare origin, since that's still a real page.
function resolveActionPath(session, stage) {
  if (stage === 'reminder') return session.sessionPageUrl;
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
export function buildNotificationEntry(session, stage, swanConfig) {
  const category = `Adobe ${swanConfig.eventName || 'Event'} Session`;
  // Same precedence sessions-guide's resolveTrackBadge() uses: an author's explicit
  // trackOverride wins over the session's own primaryTrack.
  const trackIcon = getOverrideTrackIcon(session.trackOverride) || getTrackIcon(session.primaryTrack);
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
