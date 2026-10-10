// Feds-mode orchestration: the local widget's stage machine. session-store.js never calls
// this directly — see swan-notifications.js, the mode router that dispatches here only when
// getSwanMode() === 'feds'. reconcileSwanNotifications() runs on every session-state-ticker.js
// tick (plus once right after loadMyData() resolves) to catch a live/on-demand transition —
// with no external engine left to hand a future fire time to, this ~15s ticker is now the
// only clock driving a stage transition; see notification-store.js for the storage layer
// and notification-widget.js for what actually renders these entries.
import { getSwanConfig } from './swan-config.js';
import { calculateSessionTimes, buildNotificationEntry } from './swan-payload.js';
import { upsertNotification } from './notification-display.js';
import {
  getEntry, getEntries, pruneStale, daysToMs, removeEntry, setNotificationsReady,
  batchNotifications, allowNotification, wasNotificationRemoved,
  correctEntry,
} from './notification-store.js';
import { getNowMs } from '../../utils/session-state.js';
import { logError, logWarning } from '../../utils/lana-log.js';

const STAGE_RANK = { reminder: 1, live: 2, 'on-demand': 3 };

// Returns null before the reminder trigger time (start - upcomingOffsetMinutes) has actually
// arrived — a session's entry isn't created until it's genuinely due, rather than the instant
// it's scheduled, so "Upcoming" keeps meaning "starting soon." This reconcile pass, driven by
// session-state-ticker.js, is what both creates the reminder once due and advances it to
// Live/On-Demand as time passes, now that there's no external engine of its own to fire a
// future notification.
function desiredStage(timingProperties, now) {
  if (now >= timingProperties.triggerOnDemandBadgeTime) return 'on-demand';
  if (now >= timingProperties.triggerLiveBadgeTime) return 'live';
  if (now >= timingProperties.triggerNotificationTime) return 'reminder';
  return null;
}

// The current clock/catalog is authoritative; cached stages can be ahead after a
// serverTime reset or a catalog correction. Forward advances keep read/dismiss.
function applyStage(session, swanConfig, now) {
  const timingProperties = calculateSessionTimes(session, swanConfig.upcomingOffsetMinutes);
  if (!Number.isFinite(timingProperties.triggerNotificationTime)
    || !Number.isFinite(timingProperties.triggerLiveBadgeTime)
    || !Number.isFinite(timingProperties.triggerOnDemandBadgeTime)
    || timingProperties.triggerOnDemandBadgeTime < timingProperties.triggerLiveBadgeTime) {
    logWarning('swan-notifications-feds', `session ${session.rfCode} has invalid start/end timestamps — skipping`);
    return;
  }
  const stage = desiredStage(timingProperties, now);
  const existing = getEntry(session.rfCode);
  if (!stage) {
    if (existing) correctEntry(session.rfCode, null, existing);
    return;
  }
  // Expiry is anchored to session time, not the last write: deleting an expired
  // entry must not make the next tick eligible to create it again.
  if (stage === 'on-demand'
    && now - timingProperties.triggerOnDemandBadgeTime > daysToMs(swanConfig.localNotificationPersistTillDays, 3)) {
    removeEntry(session.rfCode);
    return;
  }
  if (wasNotificationRemoved(session.rfCode)) return;

  const entry = buildNotificationEntry(session, stage, swanConfig);
  if (swanConfig.eventId) entry.eventId = swanConfig.eventId;
  if (existing && STAGE_RANK[existing.stage] >= STAGE_RANK[stage]) {
    if (Object.entries(entry).some(([key, value]) => existing[key] !== value)) {
      correctEntry(session.rfCode, entry, existing);
    }
    return;
  }
  upsertNotification(session.rfCode, entry);
}

export function notifySessionScheduled(session) {
  if (!session?.rfCode) return;
  try {
    allowNotification(session.rfCode);
    applyStage(session, getSwanConfig(), getNowMs());
  } catch (err) {
    logError('swan-notifications-feds', `notifySessionScheduled failed for ${session.rfCode}`, err);
  }
}

export function notifySessionUnscheduled(session) {
  if (!session?.rfCode) return;
  try {
    removeEntry(session.rfCode);
  } catch (err) {
    logError('swan-notifications-feds', `notifySessionUnscheduled failed for ${session.rfCode}`, err);
  }
}

// getSessions/getScheduled/isScheduleKnown are getter callbacks (not signal imports),
// matching session-state-ticker.js's/poller.js's existing convention, so this module has no
// dependency on session-store.js and can't form a circular import.
//
// isScheduleKnown gates rendering: session-state-ticker.js's onTick fires once
// immediately and synchronously as soon as the session catalog loads, which can (and does,
// in practice) happen before session-store.js's own separate myData fetch has resolved and
// populated the real scheduled set — an empty getScheduled() at that moment is indistinguishable
// from "genuinely nothing scheduled" otherwise, and every previously-persisted entry would be
// wiped out as "orphaned," only to reappear moments later marked unread again once the real
// schedule loads and re-creates them. Cleanup runs only against a fresh authoritative
// schedule, never a ticker's increasingly stale tab-local snapshot.
export function reconcileSwanNotifications(getSessions, getScheduled, isScheduleKnown, {
  refreshSchedule = false,
} = {}) {
  try {
    const swanConfig = getSwanConfig();
    const now = getNowMs();
    const sessionsById = new Map(getSessions().map((s) => [s.id, s]));
    const scheduledSessions = [...getScheduled()]
      .map((id) => sessionsById.get(id))
      // A scheduled session absent from the catalog (e.g. filtered out by a published
      // check) can't be reconciled — skip rather than throw.
      .filter(Boolean);
    const scheduledRfCodes = new Set(scheduledSessions.map((s) => s.rfCode));
    const catalogRfCodes = new Set([...sessionsById.values()].map((session) => session.rfCode));

    batchNotifications(() => {
      if (refreshSchedule && isScheduleKnown?.()) {
        scheduledSessions.forEach((session) => allowNotification(session.rfCode));
        getEntries()
          .filter((entry) => !scheduledRfCodes.has(entry.rfCode)
            && (entry.eventId
              ? entry.eventId === swanConfig.eventId
              : catalogRfCodes.has(entry.rfCode)))
          .forEach((entry) => removeEntry(entry.rfCode));
      }
      scheduledSessions.forEach((session) => applyStage(session, swanConfig, now));
      pruneStale(now, swanConfig.localNotificationPersistTillDays, swanConfig.notificationExpirationDays);
    });
    if (isScheduleKnown?.()) setNotificationsReady(true);
  } catch (err) {
    logError('swan-notifications-feds', 'reconcile failed', err);
  }
}
