import { signal, batch } from '../deps/htm-preact.js';
import BlockMediator from '../deps/block-mediator.min.js';
import { getMetadata, getEventServiceEnv, getEventConfig } from './utils.js';
import { fetchSessions } from '../services/sessions/sessions-api.js';
import { startPolling } from '../services/sessions/poller.js';
import { startSessionStateTicker } from '../services/sessions/session-state-ticker.js';
import {
  fetchAuthToken, fetchMyData, addSession, removeSession, toggleSessionInterest,
  DEFAULT_RF_API_URL, STAGE_RF_API_URL, DEFAULT_RF_PROFILE_ID,
} from '../services/sessions/rainfocus.js';
import { mountToast } from '../features/toast/toast.js';
import {
  reconcileSwanNotifications, notifySessionScheduled, notifySessionUnscheduled,
} from '../features/swan-notifications/swan-notifications.js';
import { getSwanMode } from '../features/swan-notifications/swan-config.js';
import { mountNotificationWidget } from '../features/swan-notifications/notification-widget.js';
import { logError, logWarning } from './lana-log.js';

// Shared, page-level state. Preact reads `.value` directly; non-Preact code uses `.subscribe()`/`.peek()`.
export const sessions = signal([]);
export const sessionsStatus = signal('idle'); // idle | loading | ready | error
export const liveStreamActiveIds = signal(new Set());
export const favorited = signal(new Set());
export const scheduled = signal(new Set());
export const auth = signal({ isLoggedIn: null, isRegistered: undefined, userFirstName: null });
export const pendingActions = signal(new Set());
// Bumped only when a derived session state changes; read purely as a re-render dependency.
export const sessionStateVersion = signal(0);
// A new object on every call, even for the same sessionId, so the signal always notifies.
export const sessionGuideRequest = signal(null);
// Opposite direction of sessionGuideRequest: an already-mounted multi-session page (e.g.
// Broadcast) asking to switch, since it has no other channel back to its own player state.
export const watchSameSessionRequest = signal(null);

// Console debugging only — never runs on a real prod hit. Also checks hostname since
// getEventServiceEnv() (the ESL/ESP backend env) can default to 'prod' on a preview/draft page.
const { hostname } = window.location;
const isPreviewOrDevHost = hostname.includes('.hlx.') || hostname.includes('.aem.') || hostname.includes('local');
if (isPreviewOrDevHost || getEventServiceEnv()?.name !== 'prod') {
  window.__sessionStore = {
    sessions, sessionsStatus, liveStreamActiveIds, favorited, scheduled, auth, pendingActions,
    sessionStateVersion, sessionGuideRequest, watchSameSessionRequest, getEventApiConfig,
  };
}

let initialized = false;
let eventApiConfig = null;
let myDataAttempted = false;
let realAuthConfirmed = false;
let rfAuthToken = null;
let rfAuthTokenStarted = false;
let rfAuthTokenSettled = false;
// True once `scheduled` reflects a real answer (fetched, or definitively never going to be
// fetched — e.g. logged out) rather than just its empty initial value. Gates SWAN's orphan
// cleanup (see reconcileSwanNotifications) so an empty `scheduled` before myData has loaded
// is never mistaken for "the user has nothing scheduled."
let scheduleKnown = false;
// True once da-events' registration-cache.js (window.events.getRegistrationDetails)
// has resolved isRegistered for us — gates loadMyData()'s own (weaker) fallback
// heuristic so it never clobbers the real signal once it lands.
let realRegistrationKnown = false;
// Decided once, synchronously, in initSessionState(): whether resolveRegistrationAndAuth()
// (da-events' API) owns rfAuthToken/isRegistered for this page load, or whether syncAuth()'s
// legacy jwt exchange does. Demoted to false if the primary path fails outright.
let useEventsApiForAuth = false;

// The media-relay backend only has dev/stage/prod, so the finer-grained envs collapse.
export function deriveMrEnv() {
  const env = getEventServiceEnv()?.name || 'dev';
  if (env.startsWith('stage')) return 'stage';
  if (env === 'prod') return 'prod';
  return 'dev';
}

// Milo's page env, not event-service-env — see STAGE_RF_API_URL in rainfocus.js.
function defaultRfApiUrlForEnv() {
  const isProd = getEventConfig()?.miloConfig?.env?.name === 'prod';
  return isProd ? DEFAULT_RF_API_URL : STAGE_RF_API_URL;
}

// Legacy fallback only (see resolveRegistrationAndAuth() below for the primary path) — kept
// so a Tier 1 page missing da-events' event-code metadata (and therefore window.events) still
// has some way to get an RF auth token. rfAuthTokenSettled gates maybeLoadMyData() so it can't
// fire mid-exchange with a null token.
async function exchangeRfAuthToken(clientId) {
  if (rfAuthTokenStarted) return;
  rfAuthTokenStarted = true;
  try {
    const data = await fetchAuthToken(clientId, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
    rfAuthToken = data?.rfAuthToken ?? data?.token ?? data?.jwt ?? data?.authToken ?? null;
    if (!rfAuthToken) logWarning('session-store,rf-auth-token', 'jwt exchange returned no recognizable token field');
  } catch (err) {
    logError('session-store,rf-auth-token', 'jwt exchange failed', err);
  }
  rfAuthTokenSettled = true;
  maybeLoadMyData();
}

// isRegistered is not set here: rsvpData doesn't apply to T1 events. It comes from
// resolveRegistrationAndAuth() (primary) or loadMyData() (legacy fallback) instead.
function syncAuth() {
  const profile = BlockMediator.get('imsProfile');
  if (profile === undefined) return;
  realAuthConfirmed = true;
  auth.value = {
    ...auth.value,
    isLoggedIn: !!(profile && !profile.noProfile && profile.account_type !== 'guest'),
    userFirstName: profile?.first_name ?? null,
  };
  // Gated on real login, not just the mode flag: scheduling (the only thing that ever
  // populates the notification store) requires an RF auth token from a real IMS profile,
  // so an anonymous visitor's bell would only ever render empty. This also matches real
  // UNC's own behavior — its notifications icon is excluded from SIGNED_OUT_ICONS too.
  // mountNotificationWidget() is itself idempotent, so re-firing on every syncAuth() call
  // (e.g. a later profile update) is harmless. Only feds mode has a local widget to mount —
  // unc mode relies entirely on gnav's own existing UNC-rendered bell.
  if (auth.value.isLoggedIn && getSwanMode() === 'feds') mountNotificationWidget();

  if (useEventsApiForAuth) {
    // rfAuthToken/isRegistered are resolveRegistrationAndAuth()'s job instead — but still
    // give myData a chance to run now that isLoggedIn/realAuthConfirmed just settled, in case
    // that call already resolved rfAuthTokenSettled before this profile arrived (order between
    // the two isn't guaranteed either way).
    maybeLoadMyData();
    return;
  }
  if (auth.value.isLoggedIn && profile.userId) {
    exchangeRfAuthToken(profile.userId);
  } else {
    // Mark settled either way, so maybeLoadMyData() isn't blocked forever. Also: not logged
    // in (or no userId) means there is definitively no schedule to fetch for this visitor,
    // which is itself a real, final answer — not "still don't know."
    rfAuthTokenSettled = true;
    scheduleKnown = true;
    maybeLoadMyData();
  }
}

// Primary path (see useEventsApiForAuth): da-events' registration-cache.js (see
// docs/registration-status-consumer-guide.md there) resolves a real isRegistered AND an RF
// auth token from RF's rf-auth-seq-generic endpoint in one round trip, replacing the jwt
// exchange above as the default. It does its own IMS-ready wait internally and calls
// adobeIMS.getProfile() directly, so unlike exchangeRfAuthToken() this never depends on
// imsProfile/profile.userId (sidesteps profile.js's getProfile() fallback-chain bug as a side
// effect — see not-tracked/profile-js-partial-profile-bug.md, not fixed here).
// userKey from the response is unused: it's only meaningful against the separate
// /events/api/rf-favorites endpoint, which this codebase doesn't call — our own
// addSession/removeSession/toggleSessionInterest/fetchMyData only need rfAuthToken.
// Confirmed live (2026-09) that RF accepts this token for our own /max-api/* write calls
// exactly like a token from exchangeRfAuthToken() would: same responseCode on success,
// same responseCode 27 rejection for an unregistered user attempting to schedule.
async function resolveRegistrationAndAuth() {
  try {
    const { isRegistered, authToken } = await window.events.getRegistrationDetails();
    realRegistrationKnown = true;
    auth.value = { ...auth.value, isRegistered };
    if (authToken) {
      rfAuthToken = authToken;
      rfAuthTokenSettled = true;
      maybeLoadMyData();
      return;
    }
    // isRegistered resolved for real, but no usable RF credential came with it — e.g. its
    // own IMS access-token check happened to be stale the moment its cache was read (see the
    // consumer guide's cache-layer notes). Demote to the legacy jwt exchange for the
    // credential only; realRegistrationKnown stays true above, so loadMyData()'s own weaker
    // heuristic won't clobber the isRegistered we already have once that exchange completes.
  } catch (err) {
    // The primary path failed outright (network error, RF outage) — demote to the legacy
    // jwt exchange rather than leaving rfAuthToken/isRegistered permanently unresolved.
    // realRegistrationKnown stays false here, so loadMyData()'s own fallback heuristic still
    // gets a chance to answer isRegistered once the legacy exchange completes.
    logError('session-store,registration-cache', 'window.events.getRegistrationDetails failed', err);
  }
  useEventsApiForAuth = false;
  syncAuth();
}

// RF's own objects, not bare ids: schedule keys on sessionTimeID, favorites on sessionID.
function mapToSessionIds(entries, idField, matchField) {
  const idByRf = new Map(sessions.value.map((s) => [s[matchField], s.id]));
  return (entries || []).map((entry) => idByRf.get(entry[idField])).filter(Boolean);
}

// Needs the catalog loaded for mapToSessionIds(). isRegistered comes from loggedInUser —
// a weaker signal than resolveRegistrationAndAuth() above (only proves the identity
// exists in RF, not that it's registered for the event), so it never overwrites a real
// answer that's already landed; see realRegistrationKnown.
async function loadMyData() {
  try {
    const data = await fetchMyData(rfAuthToken, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
    batch(() => {
      scheduled.value = new Set(mapToSessionIds(data.scheduled, 'sessionTimeID', 'rfCode'));
      favorited.value = new Set(mapToSessionIds(data.favorited, 'sessionID', 'rfSessionId'));
      if (!realRegistrationKnown) {
        auth.value = { ...auth.value, isRegistered: !!(data.loggedInUser && Object.keys(data.loggedInUser).length > 0) };
      }
    });
    scheduleKnown = true;
    // Immediate reconciliation now that both the session catalog and the user's
    // confirmed schedule have settled, rather than waiting for the next
    // session-state-ticker.js tick (up to intervalMs away) to apply any stage
    // transition that's already due.
    reconcileSwanNotifications(() => sessions.value, () => scheduled.value, () => scheduleKnown);
  } catch (err) {
    logError('session-store,my-data', 'myData fetch failed', err);
    // A failed fetch is still a final, non-retried answer — isRegistered must not stay undefined,
    // and SWAN's orphan cleanup must not be gated forever on a fetch that will never resolve.
    if (!realRegistrationKnown) auth.value = { ...auth.value, isRegistered: null };
    scheduleKnown = true;
  }
}

// Per-attendee, so skipped for a logged-out visitor. Runs once, whichever input resolves last.
function maybeLoadMyData() {
  if (myDataAttempted) return;
  if (sessionsStatus.value !== 'ready') return;
  if (!realAuthConfirmed || !auth.value.isLoggedIn) return;
  if (!rfAuthTokenSettled) return;
  myDataAttempted = true;
  if (!rfAuthToken) {
    // Settle isRegistered to null (not undefined) so isAuthResolved() doesn't spin forever —
    // unless resolveRegistrationAndAuth() already answered for real, in which case leave
    // it alone. There's no schedule fetch coming either way, so treat scheduleKnown as final
    // (empty) rather than leaving SWAN's orphan cleanup gated forever on a fetch that will
    // never happen.
    logWarning('session-store,my-data', 'no RF auth token — skipping myData, falling back for registration status');
    if (!realRegistrationKnown) auth.value = { ...auth.value, isRegistered: null };
    scheduleKnown = true;
    return;
  }
  loadMyData();
}

async function loadSessions() {
  sessionsStatus.value = 'loading';
  try {
    const fetched = await fetchSessions(eventApiConfig.eventId);
    // Batched so components reading both `sessions` and `sessionsStatus` re-render once.
    batch(() => {
      sessions.value = fetched;
      sessionsStatus.value = 'ready';
    });
    const mrSessions = sessions.value.filter((s) => s.mrStreamId);
    startPolling(mrSessions, eventApiConfig.mrEnv, (active) => { liveStreamActiveIds.value = active; });
    // Always runs: non-MR sessions still need transitions without a user interaction.
    startSessionStateTicker(
      () => sessions.value,
      () => liveStreamActiveIds.value,
      () => { sessionStateVersion.value += 1; },
      {
        // Must be onTick, not onChange: onChange only fires when a session's coarse
        // upcoming/live/on-demand bucket flips, which has no boundary at SWAN's
        // reminder lead time (start minus a few minutes) — gating reconcile on it would
        // mean the T-5-minute reminder is never applied by the periodic tick at all,
        // only ever by the one-shot call below or by a schedule action that happens to
        // land after the trigger time already passed.
        onTick: () => reconcileSwanNotifications(() => sessions.value, () => scheduled.value, () => scheduleKnown),
      },
    );
    maybeLoadMyData();
  } catch (err) {
    logError('session-store,sessions', `sessions fetch failed for event ${eventApiConfig.eventId} on ${getEventServiceEnv()?.name}`, err);
    sessionsStatus.value = 'error';
  }
}

export function getEventApiConfig() {
  return eventApiConfig;
}

// Lets any block open Session Guide straight to a detail view. No-ops if not mounted on the page.
export function openSessionGuideDetail(sessionId) {
  sessionGuideRequest.value = { sessionId };
}

// No-ops on pages with nothing subscribed (e.g. the homepage, which just closes the widget instead).
export function requestWatchSameSession(sessionId) {
  watchSameSessionRequest.value = { sessionId };
}

// Parses the Tier 1 Event Configurator's payload (MWPW-200311); null if absent/invalid.
function parseTierOneEventConfig() {
  const raw = getMetadata('tier-1-event-config');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    logError('session-store,tier-1-event-config', 'invalid tier-1-event-config JSON', err);
    return null;
  }
}

// Idempotent; no-ops after the first success and when the metadata is absent.
export function initSessionState() {
  if (initialized) return;
  const tierOneConfig = parseTierOneEventConfig();
  if (!tierOneConfig) {
    // eslint-disable-next-line no-console
    console.warn('[session-store] initialization skipped: tier-1-event-config metadata is missing or invalid');
    // Skips loadSessions()/syncAuth() below, so this one line silently suppresses every
    // session-catalog and RainFocus call for the page — needs to be visible in lana, not
    // just devtools.
    logWarning('session-store,init', 'initialization skipped: tier-1-event-config metadata is missing or invalid');
    return;
  }
  initialized = true;

  eventApiConfig = {
    apiUrl: tierOneConfig.rfApiUrl || defaultRfApiUrlForEnv(),
    // The config's own eventId is the source of truth; page metadata is only a fallback.
    eventId: tierOneConfig.eventId || getMetadata('event-id'),
    rfProfileId: tierOneConfig.rfProfileId || DEFAULT_RF_PROFILE_ID,
    registerUrl: tierOneConfig.registerUrl || '/register',
    eventStartMs: tierOneConfig.eventStartDateTime || null,
    eventEndMs: tierOneConfig.eventEndDateTime || null,
    mrEnv: deriveMrEnv(),
  };

  if (!eventApiConfig.eventId) {
    // eslint-disable-next-line no-console
    console.warn('[session-store] no event ID found; the session catalog request will not have a valid event key');
  }

  mountToast();
  // Decided once, before syncAuth() runs, so its branch on useEventsApiForAuth is consistent
  // for the whole page load — see resolveRegistrationAndAuth() and the dependency note in the
  // MWPW-207006 plan doc about da-events' event-code metadata being what actually creates this.
  useEventsApiForAuth = !!window.events?.getRegistrationDetails;
  syncAuth();
  BlockMediator.subscribe('imsProfile', syncAuth);
  loadSessions();
  if (useEventsApiForAuth) resolveRegistrationAndAuth();
}

function addToSet(sig, id) {
  sig.value = new Set(sig.value).add(id);
}

function removeFromSet(sig, id) {
  const next = new Set(sig.value);
  next.delete(id);
  sig.value = next;
}

function setPending(id, isPending) {
  if (isPending) addToSet(pendingActions, id);
  else removeFromSet(pendingActions, id);
}

export async function toggleSchedule(session) {
  const isScheduled = scheduled.value.has(session.id);
  setPending(session.id, true);
  try {
    if (isScheduled) {
      await removeSession(session.rfCode, rfAuthToken, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
    } else {
      await addSession(session.rfCode, rfAuthToken, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
    }
  } catch (err) {
    setPending(session.id, false);
    throw err;
  }
  // Batched so components reading both `scheduled` and `pendingActions` re-render once.
  batch(() => {
    if (isScheduled) removeFromSet(scheduled, session.id);
    else addToSet(scheduled, session.id);
    setPending(session.id, false);
  });
  // Fire-and-forget: a SWAN failure must never fail or roll back an already-successful
  // RainFocus schedule mutation — each function swallows its own errors.
  if (isScheduled) notifySessionUnscheduled(session);
  else notifySessionScheduled(session);
}

export async function toggleFavorite(session) {
  const isFavorited = favorited.value.has(session.id);
  setPending(session.id, true);
  try {
    // Favoriting keys on rfSessionId, not rfCode — sessionTimeId is left empty.
    await toggleSessionInterest('', session.rfSessionId, rfAuthToken, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
  } catch (err) {
    setPending(session.id, false);
    throw err;
  }
  batch(() => {
    if (isFavorited) removeFromSet(favorited, session.id);
    else addToSet(favorited, session.id);
    setPending(session.id, false);
  });
}
