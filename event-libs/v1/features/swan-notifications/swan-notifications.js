// Public orchestration API for SWAN notifications. session-store.js's toggleSchedule()
// calls notifySessionScheduled/notifySessionUnscheduled directly, fire-and-forget, on
// every user-initiated add/remove. reconcileSwanNotifications() runs on every
// session-state-ticker.js tick (plus once right after loadMyData() resolves), since
// there's no server-side scheduled delivery anymore — a session's reminder/live/
// on-demand transition only ever gets applied to UNC's store while this tab is open
// and a tick happens to land after the trigger time passes.
import { isSwanEnabled, getSwanConfig } from './swan-config.js';
import {
  calculateSessionTimes, buildLocalNotificationEntry, buildLocalNotificationId,
} from './swan-payload.js';
import { whenUncStoreReady } from './unc-store.js';

// Per-rfCode local state, distinct from whatever UNC's own store persists: UNC's store
// is the rendering surface (and a user can clear an entry there directly via the bell),
// not a reliable diff source. If we only checked "is there an entry in the store," a
// user-dismissed entry would get silently recreated on the next reconcile pass. This
// map remembers which stage was last applied per session, so a session already at that
// stage is left alone, and a dismissed one isn't resurrected until it's unscheduled and
// scheduled again.
const LOCAL_STATE_KEY = 'swan-notification-state';

function readLocalState() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
  } catch (err) {
    window.lana?.log(`[swan-notifications] local state was corrupt, resetting: ${err.message}`);
    return {};
  }
}

function writeLocalState(state) {
  try {
    window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    window.lana?.log(`[swan-notifications] failed to persist local state: ${err.message}`);
  }
}

// A user can dismiss a notification directly via the real UNC bell UI, which calls the
// store's own remove() — this repo never hears about that call. Detect it here by
// noticing the store no longer has an entry our local state believes is active, and
// mark it dismissed so the next applyStage() pass doesn't recreate it. Must run before
// applyStage() on every reconcile pass.
function syncDismissedFromStore(store, state) {
  const existingIds = new Set(store.get().map((entry) => entry.id));
  Object.keys(state).forEach((rfCode) => {
    const entryState = state[rfCode];
    if (entryState?.stage && !entryState.dismissed && !existingIds.has(buildLocalNotificationId(rfCode))) {
      state[rfCode] = { ...entryState, dismissed: true };
    }
  });
}

function deriveStage(timingProperties, now) {
  if (now >= timingProperties.triggerOnDemandBadgeTime) return 'on-demand';
  if (now >= timingProperties.triggerLiveBadgeTime) return 'live';
  if (now >= timingProperties.triggerNotificationTime) return 'reminder';
  return null;
}

// Applies whatever stage transition (if any) is due for one session, mutating `state`
// in place. No-ops if it isn't time yet, the session is already at that stage, or the
// user dismissed this session's entry (nothing here clears `dismissed` — only
// notifySessionScheduled(), on a fresh schedule action, does that).
function applyStage(store, state, session, swanConfig, now) {
  const timingProperties = calculateSessionTimes(session, swanConfig.upcomingOffsetMinutes);
  const stage = deriveStage(timingProperties, now);
  const current = state[session.rfCode];
  if (!stage || current?.dismissed || current?.stage === stage) return;
  const entry = buildLocalNotificationEntry(session, stage, swanConfig);
  if (current?.stage) store.edit(entry.id, entry);
  else store.add(entry);
  state[session.rfCode] = { stage, dismissed: false };
}

export async function notifySessionScheduled(session) {
  if (!isSwanEnabled() || !session?.rfCode) return;
  try {
    const store = await whenUncStoreReady();
    if (!store) return;
    const state = readLocalState();
    delete state[session.rfCode]; // fresh slate — a session-guide toggle can rescind an earlier dismissal.
    applyStage(store, state, session, getSwanConfig(), Date.now());
    writeLocalState(state);
  } catch (err) {
    window.lana?.log(`[swan-notifications] notifySessionScheduled failed for ${session.rfCode}: ${err.message}`);
  }
}

export async function notifySessionUnscheduled(session) {
  if (!isSwanEnabled() || !session?.rfCode) return;
  try {
    const store = await whenUncStoreReady();
    const state = readLocalState();
    if (store && state[session.rfCode]?.stage) store.remove(buildLocalNotificationId(session.rfCode));
    delete state[session.rfCode];
    writeLocalState(state);
  } catch (err) {
    window.lana?.log(`[swan-notifications] notifySessionUnscheduled failed for ${session.rfCode}: ${err.message}`);
  }
}

// getSessions/getScheduled are getter callbacks (not signal imports), matching
// session-state-ticker.js's/poller.js's existing convention, so this module has no
// dependency on session-store.js and can't form a circular import.
export async function reconcileSwanNotifications(getSessions, getScheduled) {
  if (!isSwanEnabled()) return;
  try {
    const store = await whenUncStoreReady();
    if (!store) return;
    const swanConfig = getSwanConfig();
    const now = Date.now();
    const sessionsById = new Map(getSessions().map((s) => [s.id, s]));
    const scheduledSessions = [...getScheduled()]
      .map((id) => sessionsById.get(id))
      // A scheduled session absent from the catalog (e.g. filtered out by a published
      // check) can't be reconciled — skip rather than throw.
      .filter(Boolean);
    const scheduledRfCodes = new Set(scheduledSessions.map((s) => s.rfCode));

    const state = readLocalState();
    syncDismissedFromStore(store, state);
    scheduledSessions.forEach((session) => applyStage(store, state, session, swanConfig, now));

    Object.keys(state).forEach((rfCode) => {
      if (scheduledRfCodes.has(rfCode)) return;
      if (state[rfCode]?.stage) store.remove(buildLocalNotificationId(rfCode));
      delete state[rfCode];
    });

    writeLocalState(state);
  } catch (err) {
    window.lana?.log(`[swan-notifications] reconcile failed: ${err.message}`);
  }
}
