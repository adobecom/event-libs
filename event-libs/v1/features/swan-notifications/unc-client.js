// Thin client for the real UNC (Universal Notification Client) engine instance, replacing
// an earlier placeholder that guessed a CRUD "store" API — confirmed against UNC's actual
// engine source not to exist. The real contract is three imperative calls on a `UNC`
// instance: UpsertReminderFeatureFlag (register a rule), AnalyticsEventFromHost (host-driven
// trigger), DeleteReminderFeatureFlag (remove). This file's only job is resolving that
// instance and hiding its raw message shapes from swan-notifications.js.
//
// How the instance is actually exposed on window is NOT confirmed — that lives in whatever
// hosts/wraps the UNC engine inside milo's nav (a separate repo we don't have). This mirrors
// an already-established, working pattern elsewhere in this repo for exactly this kind of
// handoff — event-libs/v1/c2/blocks/sessions-guide/services/feds.js's getFedsToken(), which
// checks window.feds.data.authToken then falls back to a feds.data.authToken.loaded event —
// rather than inventing a new convention. Update readUncInstance()/READY_EVENT here once the
// real handoff is confirmed; nothing else in this feature depends on how this resolves.
const READY_EVENT = 'feds.data.notifications.loaded';

function isUncInstance(candidate) {
  return !!candidate
    && typeof candidate.UpsertReminderFeatureFlag === 'function'
    && typeof candidate.DeleteReminderFeatureFlag === 'function'
    && typeof candidate.AnalyticsEventFromHost === 'function';
}

function readUncInstance() {
  const candidate = window.feds?.data?.notifications;
  return isUncInstance(candidate) ? candidate : null;
}

// Resolves with the UNC instance as soon as it exists and has the expected shape —
// immediately if it's already there, otherwise once READY_EVENT fires. Never rejects: a
// page without gnav/UNC, or one where UNC failed to load, should leave SWAN silently inert
// rather than throwing. Both settle paths tear down the other's listener/timer.
export function whenUncReady(timeoutMs = 8000) {
  const existing = readUncInstance();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve(readUncInstance());
    };
    const timer = setTimeout(() => {
      window.removeEventListener(READY_EVENT, onReady);
      resolve(null);
    }, timeoutMs);
    window.addEventListener(READY_EVENT, onReady, { once: true });
  });
}

// Every wrapper below independently resolves the instance and swallows its own errors,
// resolving `false` rather than throwing — callers (swan-notifications.js) fire these
// fire-and-forget and must never have a UNC/engine failure affect the RainFocus schedule
// mutation that triggered them.
export async function registerReminderRule(campaignId, campaignRule) {
  try {
    const uncInstance = await whenUncReady();
    if (!uncInstance) return false;
    uncInstance.UpsertReminderFeatureFlag({ campaignRules: [{ campaignID: campaignId, campaignRule }] });
    return true;
  } catch (err) {
    window.lana?.log(`[unc-client] registerReminderRule failed for ${campaignId}: ${err.message}`);
    return false;
  }
}

export async function deleteReminderRule(campaignId) {
  try {
    const uncInstance = await whenUncReady();
    if (!uncInstance) return false;
    uncInstance.DeleteReminderFeatureFlag({ campaignRules: [{ campaignID: campaignId }] });
    return true;
  } catch (err) {
    window.lana?.log(`[unc-client] deleteReminderRule failed for ${campaignId}: ${err.message}`);
    return false;
  }
}

export async function fireHostEvent(eventData) {
  try {
    const uncInstance = await whenUncReady();
    if (!uncInstance) return false;
    uncInstance.AnalyticsEventFromHost(eventData);
    return true;
  } catch (err) {
    window.lana?.log(`[unc-client] fireHostEvent failed: ${err.message}`);
    return false;
  }
}
