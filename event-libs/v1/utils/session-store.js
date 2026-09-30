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
import { setNotificationScope } from '../features/swan-notifications/notification-store.js';
import { logError, logWarning } from './lana-log.js';

// Preact reads `.value` directly; non-Preact code uses `.subscribe()`/`.peek()`.
export const sessions = signal([]);
export const sessionsStatus = signal('idle'); // idle | loading | ready | error
export const liveStreamActiveIds = signal(new Set());
export const favorited = signal(new Set());
export const scheduled = signal(new Set());
export const auth = signal({ isLoggedIn: null, isRegistered: undefined, userFirstName: null });
export const pendingActions = signal(new Set());
// Re-render dependency only.
export const sessionStateVersion = signal(0);
// New object each call, even for the same id, so the signal always notifies.
export const sessionGuideRequest = signal(null);
// Reverse of sessionGuideRequest — a page asking to switch its own player.
export const watchSameSessionRequest = signal(null);

// Debug hook only; hostname check covers preview/draft hosts getEventServiceEnv() misreads as prod.
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
// Only a successful myData response is authoritative for notification cleanup.
let scheduleKnown = false;
let notificationUserId = null;
let authGeneration = 0;
let registrationStarted = false;
// True once the real isRegistered has landed, so loadMyData()'s fallback can't overwrite it.
let realRegistrationKnown = false;
// Whether resolveRegistrationAndAuth() or the legacy jwt exchange owns auth this load.
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

// Fallback only — see resolveRegistrationAndAuth() for the primary path.
async function exchangeRfAuthToken(clientId) {
  if (rfAuthTokenStarted) return;
  rfAuthTokenStarted = true;
  const generation = authGeneration;
  try {
    const data = await fetchAuthToken(clientId, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
    if (generation !== authGeneration) return;
    rfAuthToken = data?.rfAuthToken ?? data?.token ?? data?.jwt ?? data?.authToken ?? null;
    if (!rfAuthToken) logWarning('session-store,rf-auth-token', 'jwt exchange returned no recognizable token field');
  } catch (err) {
    logError('session-store,rf-auth-token', 'jwt exchange failed', err);
  }
  if (generation !== authGeneration) return;
  rfAuthTokenSettled = true;
  maybeLoadMyData();
}

// isRegistered comes from resolveRegistrationAndAuth() or loadMyData(), not here.
function syncAuth() {
  const profile = BlockMediator.get('imsProfile');
  if (profile === undefined) return;
  realAuthConfirmed = true;
  auth.value = {
    ...auth.value,
    isLoggedIn: !!(profile && !profile.noProfile && profile.account_type !== 'guest'),
    userFirstName: profile?.first_name ?? null,
  };
  if (getSwanMode() === 'feds') {
    const userId = auth.value.isLoggedIn ? (profile.userId || null) : null;
    if (notificationUserId !== userId) {
      notificationUserId = userId;
      authGeneration += 1;
      scheduleKnown = false;
      scheduled.value = new Set();
      favorited.value = new Set();
      pendingActions.value = new Set();
      rfAuthToken = null;
      rfAuthTokenStarted = false;
      rfAuthTokenSettled = false;
      myDataAttempted = false;
      registrationStarted = false;
      realRegistrationKnown = false;
      // The primary promise is memoized independently by da-events, without IMS
      // ownership. FEDS must obtain identity-specific credentials even on first use.
      useEventsApiForAuth = false;
      auth.value = { ...auth.value, isRegistered: undefined };
    }
    setNotificationScope(eventApiConfig.eventId, userId, eventApiConfig.apiUrl);
  }
  // Gated on real login: an anonymous visitor's bell would render empty. Idempotent, so
  // re-firing on later profile updates is harmless. unc mode uses gnav's own bell instead.
  if (auth.value.isLoggedIn && getSwanMode() === 'feds') mountNotificationWidget();

  if (useEventsApiForAuth) {
    if (!registrationStarted) resolveRegistrationAndAuth();
    // Auth is resolveRegistrationAndAuth()'s job; just let myData run if it's ready.
    maybeLoadMyData();
    return;
  }
  if (auth.value.isLoggedIn && profile.userId) {
    exchangeRfAuthToken(profile.userId);
  } else {
    // Not logged in (or no userId) is itself a final answer, not "still don't know."
    rfAuthTokenSettled = true;
    maybeLoadMyData();
  }
}

// Primary auth path: real isRegistered + RF token from da-events' registration-cache.js,
// replacing the jwt exchange above. Falls back to it if no token comes back either way.
async function resolveRegistrationAndAuth() {
  if (registrationStarted) return;
  if (getSwanMode() === 'feds' && !notificationUserId) return;
  registrationStarted = true;
  const generation = authGeneration;
  try {
    const { isRegistered, authToken } = await window.events.getRegistrationDetails();
    if (generation !== authGeneration) return;
    realRegistrationKnown = true;
    auth.value = { ...auth.value, isRegistered };
    if (authToken) {
      rfAuthToken = authToken;
      rfAuthTokenSettled = true;
      maybeLoadMyData();
      return;
    }
  } catch (err) {
    logError('session-store,registration-cache', 'window.events.getRegistrationDetails failed', err);
  }
  if (generation !== authGeneration) return;
  useEventsApiForAuth = false;
  syncAuth();
}

// RF's own objects, not bare ids: schedule keys on sessionTimeID, favorites on sessionID.
function mapToSessionIds(entries, idField, matchField) {
  const idByRf = new Map(sessions.value.map((s) => [s[matchField], s.id]));
  return (entries || []).map((entry) => idByRf.get(entry[idField])).filter(Boolean);
}

// isRegistered here is a weaker fallback than resolveRegistrationAndAuth()'s — see realRegistrationKnown.
async function loadMyData() {
  const generation = authGeneration;
  try {
    const data = await fetchMyData(rfAuthToken, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
    if (generation !== authGeneration) return;
    batch(() => {
      scheduled.value = new Set(mapToSessionIds(data.scheduled, 'sessionTimeID', 'rfCode'));
      favorited.value = new Set(mapToSessionIds(data.favorited, 'sessionID', 'rfSessionId'));
      if (!realRegistrationKnown) {
        auth.value = { ...auth.value, isRegistered: !!(data.loggedInUser && Object.keys(data.loggedInUser).length > 0) };
      }
    });
    scheduleKnown = true;
    // Reconcile now rather than waiting for the next ticker interval.
    reconcileSwanNotifications(
      () => sessions.value, () => scheduled.value, () => scheduleKnown, { refreshSchedule: true },
    );
  } catch (err) {
    logError('session-store,my-data', 'myData fetch failed', err);
    if (generation !== authGeneration) return;
    // A failed fetch is still a final answer — isRegistered must not stay undefined.
    if (!realRegistrationKnown) auth.value = { ...auth.value, isRegistered: null };
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
    // null, not undefined, so isAuthResolved() doesn't spin forever.
    logWarning('session-store,my-data', 'no RF auth token — skipping myData, falling back for registration status');
    if (!realRegistrationKnown) auth.value = { ...auth.value, isRegistered: null };
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
    startSessionStateTicker(
      () => sessions.value,
      () => liveStreamActiveIds.value,
      () => { sessionStateVersion.value += 1; },
      {
        // onTick, not onChange — onChange misses SWAN's reminder-lead-time boundary.
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
  useEventsApiForAuth = getSwanMode() !== 'feds' && !!window.events?.getRegistrationDetails;
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

export class SessionAuthChangedError extends Error {
  constructor() {
    super('Session action cancelled because the signed-in attendee changed');
    this.name = 'SessionAuthChangedError';
    this.reason = 'auth-changed';
  }
}

export function getSessionAuthGeneration() {
  return authGeneration;
}

export function assertSessionAuthGeneration(generation) {
  if (generation === authGeneration) return;
  logWarning('session-store,action', 'cancelled an action started by a previous attendee');
  throw new SessionAuthChangedError();
}

export async function toggleSchedule(session) {
  const generation = authGeneration;
  const isScheduled = scheduled.value.has(session.id);
  setPending(session.id, true);
  try {
    if (isScheduled) {
      await removeSession(session.rfCode, rfAuthToken, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
    } else {
      await addSession(session.rfCode, rfAuthToken, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
    }
  } catch (err) {
    if (generation === authGeneration) setPending(session.id, false);
    assertSessionAuthGeneration(generation);
    throw err;
  }
  assertSessionAuthGeneration(generation);
  // Batched so components reading both `scheduled` and `pendingActions` re-render once.
  batch(() => {
    if (isScheduled) removeFromSet(scheduled, session.id);
    else addToSet(scheduled, session.id);
    setPending(session.id, false);
  });
  // Fire-and-forget — a SWAN failure must never roll back the RF mutation.
  if (isScheduled) notifySessionUnscheduled(session);
  else notifySessionScheduled(session);
}

export async function toggleFavorite(session) {
  const generation = authGeneration;
  const isFavorited = favorited.value.has(session.id);
  setPending(session.id, true);
  try {
    // Favoriting keys on rfSessionId, not rfCode — sessionTimeId is left empty.
    await toggleSessionInterest('', session.rfSessionId, rfAuthToken, eventApiConfig.rfProfileId, eventApiConfig.apiUrl);
  } catch (err) {
    if (generation === authGeneration) setPending(session.id, false);
    assertSessionAuthGeneration(generation);
    throw err;
  }
  assertSessionAuthGeneration(generation);
  batch(() => {
    if (isFavorited) removeFromSet(favorited, session.id);
    else addToSet(favorited, session.id);
    setPending(session.id, false);
  });
}
