import { getMetadata } from '../../utils/utils.js';
import { parseRowConfig } from '../../utils/da-sheet-controller.js';

// Page-level bootstrap for SWAN's ANS/notification config. The swan-notification-config
// metadata row holds a short configId (authored via the "SWAN Notifications" tab in the
// Tier 1 Event Configurator DA app), not raw JSON — the full config is stored in that
// app's own published DA sheet and resolved here at runtime. Read once during
// session-store.js's initSessionState(), before any schedule action can fire.
//
// Must stay in sync with event-libs/swan-notification-configurator/constants.js's
// CONFIGS_SHEET_PATH — the app writes to this path, this resolves from it.
const CONFIGS_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';

let initialized = false;
let initPromise = null;
let swanConfig = {};

// Sheet's own JSON shape (from da-sheet-controller.js's writeSheet): a plain, single-sheet
// document has rows directly under `data`; this repo's SWAN sheet never grows into a
// multi-sheet document, so that shape isn't handled here.
function extractRows(sheetJson) {
  const raw = sheetJson?.data;
  if (Array.isArray(raw)) return raw;
  return raw ? [raw] : [];
}

async function fetchConfigById(configId) {
  // Plain relative fetch against the current page's own origin — NOT da-sheet-controller.js's
  // readSheet(), which requires a DA-SDK Bearer token that doesn't exist on a real visited
  // page. Relies on the sheet having been published (see the authoring app's publish-after-save
  // step) so it's fetchable here unauthenticated, same as any other published EDS content.
  const res = await fetch(CONFIGS_SHEET_PATH);
  if (!res.ok) throw new Error(`SWAN config sheet fetch failed: ${res.status}`);
  const sheetJson = await res.json();
  const row = extractRows(sheetJson).find((r) => r?.configId === configId);
  if (!row) throw new Error(`no config found for id "${configId}"`);
  return parseRowConfig(row, 'swan-config');
}

// Now async — must never throw synchronously or reject uncaught, since nothing awaits
// the caller (session-store.js's initSessionState() calls this fire-and-forget).
//
// Mirrors tier-1-event-config.js's idempotency semantics: absent metadata is never
// "locked in" (no initPromise created, initialized stays false), so a page where the
// metadata isn't present yet at first check can still resolve correctly later. Only a
// resolvable configId lock in — success or failure, since a failed lookup shouldn't be
// retried on every call.
export function initSwanConfig() {
  if (initialized || initPromise) return initPromise || Promise.resolve();
  const configId = getMetadata('swan-notification-config');
  if (!configId) return Promise.resolve();
  initPromise = (async () => {
    try {
      swanConfig = await fetchConfigById(configId.trim());
    } catch (err) {
      window.lana?.log(`[swan-config] failed to resolve swan-notification-config: ${err.message}`);
    } finally {
      initialized = true;
    }
  })();
  return initPromise;
}

// Lets a caller that can't itself be awaited from session-store.js's fire-and-forget
// initSwanConfig() call (swan-notifications.js's exported functions) wait for that same
// resolution before checking isSwanEnabled(), so an early user action doesn't race ahead
// of the fetch and get incorrectly treated as disabled. We own the whole async operation
// via initPromise, so this can be a simple race rather than a polling/watcher mechanism
// (contrast utils.js's waitForAdobeIMS(), which watches a third-party global this repo
// doesn't control the timing of).
export function waitForSwanConfig(timeoutMs = 8000) {
  if (initialized) return Promise.resolve();
  if (!initPromise) return Promise.resolve(); // initSwanConfig() was never called — nothing to wait for.
  return Promise.race([initPromise, new Promise((resolve) => { setTimeout(resolve, timeoutMs); })]);
}

// ansEndpoint ultimately came from an authored DA sheet, not hardcoded — unlike every
// other external endpoint this codebase calls with an IMS bearer token (see
// esp-controller.js's ENV_MAP), which are fixed in source. The authoring app locks it
// to a Stage/Production dropdown rather than free text, but this check remains valuable
// defense-in-depth against the sheet being hand-edited outside the app. The bookkeeping
// endpoint no longer needs this check — it's resolved from ENV_MAP like every other ESP
// call (see ans-controller.js), not authored.
const ALLOWED_HOST_SUFFIXES = ['.adobe.io', '.adobeioruntime.net', '.adobe.com'];

function isAllowedEndpointHost(url) {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOST_SUFFIXES.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

// ansEndpoint is the one required field — everything else (appId, notificationType/
// SubType, offsets, icon/image) has a sensible fallback in swan-payload.js/
// ans-controller.js, but without a real, trusted ANS endpoint there's nothing safe to
// call.
export function isSwanEnabled() {
  const { ansEndpoint } = swanConfig;
  if (!ansEndpoint) return false;
  if (!isAllowedEndpointHost(ansEndpoint)) {
    window.lana?.log('[swan-config] ansEndpoint host is not on the trusted Adobe allowlist — SWAN disabled rather than send the IMS token to an untrusted origin');
    return false;
  }
  return true;
}

export function getSwanConfig() {
  return swanConfig;
}
