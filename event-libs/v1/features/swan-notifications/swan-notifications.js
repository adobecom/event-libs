// Public orchestration API for SWAN notifications. session-store.js's toggleSchedule()
// calls notifySessionScheduled/notifySessionUnscheduled directly, fire-and-forget, on
// every user-initiated add/remove. reconcileSwanNotifications() runs on every
// session-state-ticker.js tick (plus once right after loadMyData() resolves) to catch a
// live/on-demand transition, which needs host-driven timing — only the reminder stage can
// lean on UNC's own schedule_at + internal poller (see swan-payload.js).
import { isSwanEnabled, getSwanConfig } from './swan-config.js';
import { calculateSessionTimes, buildStageCampaignRule } from './swan-payload.js';
import { registerReminderRule, deleteReminderRule, fireHostEvent } from './unc-client.js';

// Per-rfCode: which single stage's rule is currently registered/active, and its campaignId
// (needed to delete it once superseded). v2 because the shape changed from the previous
// placeholder-store design (no more `dismissed` — there's no read-back API in the real UNC
// contract to ever detect a bell dismissal, so that whole mechanism was dropped; a plain
// forward-only state machine, below, is what actually prevents duplicate bell entries).
const LOCAL_STATE_KEY = 'swan-notification-state-v2';

const STAGE_RANK = { reminder: 1, live: 2, 'on-demand': 3 };

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

// Unlike a prior version of this logic, always returns a stage rather than null before the
// reminder trigger time — a session gets a reminder rule registered as soon as it's
// scheduled (with schedule_at if the trigger time is still ahead), so UNC's own poller, not
// our ticker, is what actually delivers it on time.
function desiredStage(timingProperties, now) {
  if (now >= timingProperties.triggerOnDemandBadgeTime) return 'on-demand';
  if (now >= timingProperties.triggerLiveBadgeTime) return 'live';
  return 'reminder';
}

// Registers the newly-desired stage's rule, fires its matching host event, then deletes
// whatever stage was previously registered — in that order, so there's never a moment with
// nothing registered for an already-scheduled session. No-ops if already at (or,
// defensively, past) the desired stage: forward-only is the only guard against duplicate
// bell entries this design has, since there's no way to read back what UNC is currently
// showing. That guard is exactly why state must only be updated once register+fire are
// actually confirmed to have gone through — both resolve `false` rather than throw (e.g.
// UNC isn't ready yet on this page load), and marking a stage "done" that never actually
// reached UNC would permanently block ever retrying it.
async function applyStage(session, swanConfig, now, state) {
  const timingProperties = calculateSessionTimes(session, swanConfig.upcomingOffsetMinutes);
  if (!Number.isFinite(timingProperties.triggerNotificationTime)
    || !Number.isFinite(timingProperties.triggerLiveBadgeTime)
    || !Number.isFinite(timingProperties.triggerOnDemandBadgeTime)) {
    window.lana?.log(`[swan-notifications] session ${session.rfCode} has invalid start/end timestamps — skipping`);
    return;
  }
  const stage = desiredStage(timingProperties, now);
  const existing = state[session.rfCode];
  if (existing && STAGE_RANK[existing.stage] >= STAGE_RANK[stage]) return;

  const scheduleAtSeconds = stage === 'reminder' && now < timingProperties.triggerNotificationTime
    ? Math.floor(timingProperties.triggerNotificationTime / 1000)
    : undefined;
  const { campaignId, campaignRule, hostEvent } = buildStageCampaignRule(session, stage, swanConfig, { scheduleAtSeconds });

  const registered = await registerReminderRule(campaignId, campaignRule);
  const fired = registered && await fireHostEvent(hostEvent);
  if (!registered || !fired) {
    window.lana?.log(`[swan-notifications] failed to apply stage "${stage}" for ${session.rfCode} — will retry next reconcile`);
    return;
  }
  if (existing?.campaignId) await deleteReminderRule(existing.campaignId);

  state[session.rfCode] = { stage, campaignId };
}

export async function notifySessionScheduled(session) {
  if (!isSwanEnabled() || !session?.rfCode) return;
  try {
    const state = readLocalState();
    await applyStage(session, getSwanConfig(), Date.now(), state);
    writeLocalState(state);
  } catch (err) {
    window.lana?.log(`[swan-notifications] notifySessionScheduled failed for ${session.rfCode}: ${err.message}`);
  }
}

export async function notifySessionUnscheduled(session) {
  if (!isSwanEnabled() || !session?.rfCode) return;
  try {
    const state = readLocalState();
    const existing = state[session.rfCode];
    if (existing?.campaignId) await deleteReminderRule(existing.campaignId);
    delete state[session.rfCode];
    writeLocalState(state);
  } catch (err) {
    window.lana?.log(`[swan-notifications] notifySessionUnscheduled failed for ${session.rfCode}: ${err.message}`);
  }
}

// Guards against two reconcile passes overlapping: each applyStage() call can take up to
// ~24s in the worst case (three sequential unc-client.js calls, each with its own 8s
// whenUncReady() timeout if UNC is slow to initialize) — longer than the ~15s ticker
// interval that drives this. Without this guard, a slow pass still in flight when the next
// tick fires would race the new pass's read-modify-write of the same localStorage key;
// whichever writes last would silently clobber the other's update. Skipping an overlapping
// tick is harmless — the next one 15s later picks up wherever the in-flight pass left off.
let reconcileInFlight = false;

// getSessions/getScheduled are getter callbacks (not signal imports), matching
// session-state-ticker.js's/poller.js's existing convention, so this module has no
// dependency on session-store.js and can't form a circular import.
export async function reconcileSwanNotifications(getSessions, getScheduled) {
  if (!isSwanEnabled() || reconcileInFlight) return;
  reconcileInFlight = true;
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

    const state = readLocalState();
    for (const session of scheduledSessions) {
      // eslint-disable-next-line no-await-in-loop
      await applyStage(session, swanConfig, now, state);
    }

    const orphanedRfCodes = Object.keys(state).filter((rfCode) => !scheduledRfCodes.has(rfCode));
    for (const rfCode of orphanedRfCodes) {
      const existing = state[rfCode];
      // eslint-disable-next-line no-await-in-loop
      if (existing?.campaignId) await deleteReminderRule(existing.campaignId);
      delete state[rfCode];
    }

    writeLocalState(state);
  } catch (err) {
    window.lana?.log(`[swan-notifications] reconcile failed: ${err.message}`);
  } finally {
    reconcileInFlight = false;
  }
}
