// Public orchestration API for SWAN notifications. session-store.js's toggleSchedule()
// calls notifySessionScheduled/notifySessionUnscheduled directly on every user-initiated
// add/remove. reconcileSwanNotifications() runs on every session-state-ticker.js tick
// (plus once right after loadMyData() resolves) to catch a live/on-demand transition —
// with no external engine left to hand a future fire time to, this ~15s ticker is now the
// only clock driving a stage transition; see notification-store.js for the storage layer
// and notification-widget.js for what actually renders these entries.
import { isSwanEnabled, getSwanConfig } from './swan-config.js';
import { calculateSessionTimes, buildNotificationEntry } from './swan-payload.js';
import { upsertNotification, removeNotification } from './notification-display.js';
import { getEntry, getEntries, pruneStale } from './notification-store.js';

const STAGE_RANK = { reminder: 1, live: 2, 'on-demand': 3 };

// Always returns a stage rather than null before the reminder trigger time — a session's
// entry is created (as "reminder"/Upcoming) as soon as it's scheduled, and this reconcile
// pass, driven by session-state-ticker.js, is what advances it to Live/On-Demand as time
// passes, now that there's no external engine of its own to fire a future notification.
function desiredStage(timingProperties, now) {
  if (now >= timingProperties.triggerOnDemandBadgeTime) return 'on-demand';
  if (now >= timingProperties.triggerLiveBadgeTime) return 'live';
  return 'reminder';
}

// No-ops if already at (or, defensively, past) the desired stage: forward-only is the only
// guard against re-flagging an already-seen stage as unread again. One entry per rfCode,
// updated in place as its stage advances, rather than tracked as separate per-stage records.
function applyStage(session, swanConfig, now) {
  const timingProperties = calculateSessionTimes(session, swanConfig.upcomingOffsetMinutes);
  if (!Number.isFinite(timingProperties.triggerNotificationTime)
    || !Number.isFinite(timingProperties.triggerLiveBadgeTime)
    || !Number.isFinite(timingProperties.triggerOnDemandBadgeTime)) {
    window.lana?.log(`[swan-notifications] session ${session.rfCode} has invalid start/end timestamps — skipping`);
    return;
  }
  const stage = desiredStage(timingProperties, now);
  const existing = getEntry(session.rfCode);
  if (existing && STAGE_RANK[existing.stage] >= STAGE_RANK[stage]) return;

  upsertNotification(session.rfCode, buildNotificationEntry(session, stage, swanConfig));
}

export function notifySessionScheduled(session) {
  if (!isSwanEnabled() || !session?.rfCode) return;
  try {
    applyStage(session, getSwanConfig(), Date.now());
  } catch (err) {
    window.lana?.log(`[swan-notifications] notifySessionScheduled failed for ${session.rfCode}: ${err.message}`);
  }
}

export function notifySessionUnscheduled(session) {
  if (!isSwanEnabled() || !session?.rfCode) return;
  try {
    removeNotification(session.rfCode);
  } catch (err) {
    window.lana?.log(`[swan-notifications] notifySessionUnscheduled failed for ${session.rfCode}: ${err.message}`);
  }
}

// getSessions/getScheduled/isScheduleKnown are getter callbacks (not signal imports),
// matching session-state-ticker.js's/poller.js's existing convention, so this module has no
// dependency on session-store.js and can't form a circular import.
//
// This whole pass is synchronous end to end (no await point anywhere in it), so two calls
// can never interleave and race the same localStorage write.
//
// isScheduleKnown gates orphan cleanup only: session-state-ticker.js's onTick fires once
// immediately and synchronously as soon as the session catalog loads, which can (and does,
// in practice) happen before session-store.js's own separate myData fetch has resolved and
// populated the real scheduled set — an empty getScheduled() at that moment is indistinguishable
// from "genuinely nothing scheduled" otherwise, and every previously-persisted entry would be
// wiped out as "orphaned," only to reappear moments later marked unread again once the real
// schedule loads and re-creates them. Stage progression for whatever *is* in getScheduled() is
// still safe to run regardless — it's a no-op when the set is empty, never destructive.
export function reconcileSwanNotifications(getSessions, getScheduled, isScheduleKnown) {
  if (!isSwanEnabled()) return;
  try {
    const swanConfig = getSwanConfig();
    const now = Date.now();
    const sessionsById = new Map(getSessions().map((s) => [s.id, s]));
    const scheduledSessions = [...getScheduled()]
      .map((id) => sessionsById.get(id))
      // A scheduled session absent from the catalog (e.g. filtered out by a published
      // check) can't be reconciled — skip rather than throw.
      .filter(Boolean);
    const scheduledRfCodes = new Set(scheduledSessions.map((s) => s.rfCode));

    scheduledSessions.forEach((session) => applyStage(session, swanConfig, now));

    if (isScheduleKnown?.()) {
      getEntries()
        .filter((entry) => !scheduledRfCodes.has(entry.rfCode))
        .forEach((entry) => removeNotification(entry.rfCode));
    }

    pruneStale(now, swanConfig.localNotificationPersistTillDays);
  } catch (err) {
    window.lana?.log(`[swan-notifications] reconcile failed: ${err.message}`);
  }
}
