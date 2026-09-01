// Thin client for the real UNC (Universal Notification Client) engine instance, replacing
// an earlier placeholder that guessed a CRUD "store" API — confirmed against UNC's actual
// engine source not to exist. The real contract is three imperative calls on a `UNC`
// instance: UpsertReminderFeatureFlag (register a rule), AnalyticsEventFromHost (host-driven
// trigger), DeleteReminderFeatureFlag (remove). This file's only job is resolving that
// instance and hiding its raw message shapes from swan-notifications.js.
//
// How the instance is exposed is now CONFIRMED, not guessed — fetched and inspected the
// actual bundles milo loads (prod.adobeccstatic.com/unav/1.6/UniversalNav.js and its
// lazily-loaded NotificationLoader.<hash>.bundle.js chunk): milo's gnav loads
// UniversalNav.js, which exposes `window.UniversalNav.getComponent('notifications')` — an
// async method that lazily loads the real UNC engine bundle
// (adobeccstatic.com/unc/<version>/UNC-shared.js), constructs it as
// `new window.UNC.default(config)`, and resolves `{ instance }`. This only ever resolves a
// real instance once the page's gnav has "notifications" configured as an active component
// (`universal-nav` metadata) — see docs/swan-unc-dependencies.md for that dependency.
//
// The `instance` UNAV hands back is a shallow copy of only the engine's *own* properties
// (`appContext`, `initializeUNC`, `_uncContainer`, etc.) — it does NOT preserve prototype
// methods, so UpsertReminderFeatureFlag/DeleteReminderFeatureFlag/AnalyticsEventFromHost
// (defined on the engine class's prototype) are never present on it directly. Each of those
// three is, on the real engine, a one-line pass-through to
// `_uncContainer.handleMessageFromInterface(methodName, data)` — and `_uncContainer` is one
// of the surviving own properties, so this file calls through that path directly instead.
// Verified live against the real engine. See docs/swan-unc-investigation-summary.md and
// docs/swan-unc-dependencies.md.
//
// getComponent() itself internally awaits the chunk load + engine construction once called,
// but resolves `undefined` (caught internally, not thrown) if called before milo's own gnav
// decoration has reached the point of initializing that component — there's no dedicated
// "ready" event for this seam (checked milo's global-navigation.js), so this polls rather
// than waiting on one.
const POLL_INTERVAL_MS = 250;

function isUncInstance(candidate) {
  return !!candidate
    && typeof candidate._uncContainer?.handleMessageFromInterface === 'function';
}

// `_uncContainer` is an undocumented, underscore-prefixed internal field, not a published
// contract — kept behind one call site so a future change to this path only touches one line.
function callUnc(instance, methodName, payload) {
  instance._uncContainer.handleMessageFromInterface(methodName, payload);
}

async function tryResolveInstance() {
  if (typeof window.UniversalNav?.getComponent !== 'function') return null;
  try {
    const result = await window.UniversalNav.getComponent('notifications');
    return isUncInstance(result?.instance) ? result.instance : null;
  } catch (err) {
    window.lana?.log(`[unc-client] getComponent('notifications') failed: ${err.message}`);
    return null;
  }
}

// Resolves with the UNC instance as soon as getComponent('notifications') yields one with
// the expected shape, polling every POLL_INTERVAL_MS until timeoutMs elapses. Never rejects:
// a page without gnav/UNC, or one where the notifications component isn't configured,
// should leave SWAN silently inert rather than throwing.
export function whenUncReady(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    async function attempt() {
      const instance = await tryResolveInstance();
      if (instance) {
        resolve(instance);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }
      setTimeout(attempt, POLL_INTERVAL_MS);
    }
    attempt();
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
    callUnc(uncInstance, 'UpsertReminderFeatureFlag', { campaignRules: [{ campaignID: campaignId, campaignRule }] });
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
    callUnc(uncInstance, 'DeleteReminderFeatureFlag', { campaignRules: [{ campaignID: campaignId }] });
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
    callUnc(uncInstance, 'AnalyticsEventFromHost', eventData);
    return true;
  } catch (err) {
    window.lana?.log(`[unc-client] fireHostEvent failed: ${err.message}`);
    return false;
  }
}
