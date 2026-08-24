// Public orchestration API for SWAN notifications. session-store.js's toggleSchedule()
// calls notifySessionScheduled/notifySessionUnscheduled directly, fire-and-forget, on
// every user-initiated add/remove — mirroring northstar's own call-site pattern
// (useSchedule.js/ScheduleModalContent.js call the SWAN service inside the click
// handlers). reconcileSwanNotifications() runs once on page load as a self-healing
// backstop for any per-action call that failed transiently, replacing northstar's
// initialize()/syncNotifications() full-diff pass.
import { isSwanEnabled, getSwanConfig, waitForSwanConfig } from './swan-config.js';
import { calculateSessionTimes, buildNotificationPayload } from './swan-payload.js';
import {
  getAdobeUserId, fetchAdobeIoNotifications, createAnsNotification, expireAnsNotification,
  storeBookkeepingEntry, deleteBookkeepingEntry,
} from './ans-controller.js';
import { showToast } from '../toast/toast.js';

// rfCode -> ANS notification id, populated by reconcile and kept in sync by
// create/expire so a same-page remove doesn't need a bookkeeping re-fetch to find
// the id to expire. Only ever mutated via .set()/.delete() (never reassigned wholesale)
// so an in-flight per-action update can't be dropped by a concurrent reconcile — see
// reconcileSwanNotifications()'s merge below.
let notificationIdsByRfCode = new Map();
let adobeUserIdPromise = null;

// Caches the in-flight/settled lookup, but only when it actually resolved to a real id —
// window.adobeIMS may not be ready yet on the very first call (e.g. a schedule action
// fired before IMS finished initializing), and caching a null result forever would send
// every subsequent notification for the rest of the page session with a null user-id.
function getCachedAdobeUserId() {
  if (!adobeUserIdPromise) {
    adobeUserIdPromise = getAdobeUserId().then((id) => {
      if (!id) adobeUserIdPromise = null;
      return id;
    });
  }
  return adobeUserIdPromise;
}

// Keyed by rfCode so a rapid double-invocation for the same session (e.g. a fast
// double-click before the first call's promise settles) reuses the in-flight request
// instead of creating/expiring the same notification twice.
const pendingCreatesByRfCode = new Map();
const pendingExpiresByRfCode = new Map();

function dedupeByRfCode(pending, rfCode, run) {
  if (pending.has(rfCode)) return pending.get(rfCode);
  const promise = run().finally(() => pending.delete(rfCode));
  pending.set(rfCode, promise);
  return promise;
}

async function createNotificationForSession(session) {
  const swanConfig = getSwanConfig();
  const timingProperties = calculateSessionTimes(session, swanConfig.upcomingOffsetMinutes);
  const payload = buildNotificationPayload(session, timingProperties, swanConfig);
  const adobeUserId = await getCachedAdobeUserId();
  const created = await createAnsNotification({ adobeUserId, timingProperties, payload });
  const results = await Promise.allSettled(created.map(async (notification) => {
    const notificationId = notification['notification-id'];
    await storeBookkeepingEntry({ notificationId, rfCode: session.rfCode });
    notificationIdsByRfCode.set(session.rfCode, notificationId);
  }));
  results.filter((r) => r.status === 'rejected').forEach((r) => {
    window.lana?.log(`[swan-notifications] bookkeeping store failed for ${session.rfCode}: ${r.reason?.message}`);
  });
}

async function expireNotificationForSession(session) {
  const notificationId = notificationIdsByRfCode.get(session.rfCode);
  if (!notificationId) return;
  await expireAnsNotification(notificationId);
  await deleteBookkeepingEntry(notificationId);
  notificationIdsByRfCode.delete(session.rfCode);
}

export async function notifySessionScheduled(session) {
  await waitForSwanConfig();
  if (!isSwanEnabled() || !session?.rfCode) return;
  try {
    await dedupeByRfCode(pendingCreatesByRfCode, session.rfCode, () => createNotificationForSession(session));
  } catch (err) {
    window.lana?.log(`[swan-notifications] createNotification failed for ${session.rfCode}: ${err.message}`);
    showToast({ message: 'Added to schedule, but the reminder notification could not be set up.', variant: 'informative' });
  }
}

export async function notifySessionUnscheduled(session) {
  await waitForSwanConfig();
  if (!isSwanEnabled() || !session?.rfCode) return;
  try {
    await dedupeByRfCode(pendingExpiresByRfCode, session.rfCode, () => expireNotificationForSession(session));
  } catch (err) {
    // No toast here — a stale notification for an unscheduled session is minor and
    // self-heals on the next reconciliation pass, not worth interrupting an already
    // successful "remove from schedule" action with an error.
    window.lana?.log(`[swan-notifications] removeNotification failed for ${session.rfCode}: ${err.message}`);
  }
}

// getSessions/getScheduled are getter callbacks (not signal imports), matching
// session-state-ticker.js's/poller.js's existing convention, so this module has no
// dependency on session-store.js and can't form a circular import.
export async function reconcileSwanNotifications(getSessions, getScheduled) {
  await waitForSwanConfig();
  if (!isSwanEnabled()) return;
  try {
    const sessionsById = new Map(getSessions().map((s) => [s.id, s]));
    const scheduledSessions = [...getScheduled()]
      .map((id) => sessionsById.get(id))
      // A scheduled session absent from the catalog (e.g. filtered out by a published
      // check) can't be reconciled — skip rather than throw.
      .filter(Boolean);

    const existingNotifications = await fetchAdobeIoNotifications();
    // Merge, never reassign: a notifySessionScheduled/Unscheduled call that completes
    // while this fetch is in flight has already updated notificationIdsByRfCode directly
    // (see createNotificationForSession/expireNotificationForSession above) — replacing
    // the whole map with this (necessarily slightly stale) snapshot would silently drop
    // that concurrent update.
    existingNotifications.forEach((n) => {
      const rfCode = n.metadata?.sessionId;
      if (rfCode) notificationIdsByRfCode.set(rfCode, n.id);
    });

    const scheduledRfCodes = new Set(scheduledSessions.map((s) => s.rfCode));
    const toExpire = existingNotifications.filter((n) => !scheduledRfCodes.has(n.metadata?.sessionId));
    const toCreate = scheduledSessions.filter((s) => !notificationIdsByRfCode.has(s.rfCode));

    const expireResults = await Promise.allSettled(toExpire.map(async (notification) => {
      await expireAnsNotification(notification.id);
      await deleteBookkeepingEntry(notification.id);
      notificationIdsByRfCode.delete(notification.metadata?.sessionId);
    }));
    const createResults = await Promise.allSettled(
      toCreate.map((session) => createNotificationForSession(session)),
    );
    [...expireResults, ...createResults].filter((r) => r.status === 'rejected').forEach((r) => {
      window.lana?.log(`[swan-notifications] reconcile item failed: ${r.reason?.message}`);
    });
  } catch (err) {
    window.lana?.log(`[swan-notifications] reconcile failed: ${err.message}`);
  }
}
