// Thin client for the real UNC (Universal Notification Client) engine instance. The real
// contract is two imperative calls on a `UNC` instance: UpsertReminderFeatureFlag (register
// a rule), DeleteReminderFeatureFlag (remove). This file's only job is resolving that
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
// UNC's own web-host wiki documents named methods directly on the instance as the primary
// contract. An earlier live investigation against the instance UNav hands back found only a
// shallow copy of the engine's *own* properties (missing prototype methods), reaching the
// same internal handlers only through `_uncContainer.handleMessageFromInterface(methodName,
// data)`. Both paths are confirmed (by reading the engine source directly) to dispatch to the
// exact same internal handler, so this file tries the direct method first and falls back to
// `_uncContainer` — compatible either way. See docs/swan-unc-investigation-summary.md and
// docs/swan-unc-dependencies.md.
//
// getComponent() itself internally awaits the chunk load + engine construction once called,
// but resolves `undefined` (caught internally, not thrown) if called before milo's own gnav
// decoration has reached the point of initializing that component — there's no dedicated
// "ready" event for this seam (checked milo's global-navigation.js), so this polls rather
// than waiting on one.
const POLL_INTERVAL_MS = 250;
const CALL_MAX_RETRIES = 8;
const CALL_RETRY_DELAY_MS = 500;

function hasDirectMethods(candidate) {
  return typeof candidate?.UpsertReminderFeatureFlag === 'function'
    && typeof candidate?.DeleteReminderFeatureFlag === 'function';
}

function hasContainerPath(candidate) {
  return typeof candidate?._uncContainer?.handleMessageFromInterface === 'function';
}

function isUncInstance(candidate) {
  return !!candidate && (hasDirectMethods(candidate) || hasContainerPath(candidate));
}

// Tries a direct method on the instance first, falling back to `_uncContainer` — an
// undocumented, underscore-prefixed internal field, not a published contract — kept behind
// this one call site so a future contract change only touches one function.
function callUnc(instance, methodName, payload) {
  if (typeof instance[methodName] === 'function') {
    instance[methodName](payload);
    return;
  }
  instance._uncContainer.handleMessageFromInterface(methodName, payload);
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function callUncWithRetry(instance, methodName, payload) {
  let lastErr;
  for (let attempt = 0; attempt <= CALL_MAX_RETRIES; attempt += 1) {
    try {
      callUnc(instance, methodName, payload);
      return;
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line no-await-in-loop
      if (attempt < CALL_MAX_RETRIES) await delay(CALL_RETRY_DELAY_MS);
    }
  }
  throw lastErr;
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
    const payload = { type: 'rule', action: 'upsert', campaignRules: [{ campaignId, campaignRule }] };
    await callUncWithRetry(uncInstance, 'UpsertReminderFeatureFlag', payload);
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
    const payload = { type: 'rule', action: 'delete', campaignRules: [{ campaignId }] };
    await callUncWithRetry(uncInstance, 'DeleteReminderFeatureFlag', payload);
    return true;
  } catch (err) {
    window.lana?.log(`[unc-client] deleteReminderRule failed for ${campaignId}: ${err.message}`);
    return false;
  }
}
