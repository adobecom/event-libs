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

// Shared, page-level state. Preact components read `.value` directly during
// render for fine-grained reactivity; non-Preact code uses `.subscribe()`/`.peek()`.
export const sessions = signal([]);
export const sessionsStatus = signal('idle'); // idle | loading | ready | error
export const liveStreamActiveIds = signal(new Set());
export const favorited = signal(new Set());
export const scheduled = signal(new Set());
export const auth = signal({ isLoggedIn: null, isRegistered: undefined, userFirstName: null });
export const pendingActions = signal(new Set());
// Bumped only when a derived session state changes. Read purely as a re-render dependency;
// the value itself carries no meaning.
export const sessionStateVersion = signal(0);
// A new object on every call, even for the same sessionId, so the signal always notifies.
export const sessionGuideRequest = signal(null);

let initialized = false;
let apiConfig = null;
let myDataAttempted = false;
let realAuthConfirmed = false;
let rfAuthToken = null;
let rfAuthTokenStarted = false;
let rfAuthTokenSettled = false;

// The media-relay backend only has dev/stage/prod, so the finer-grained envs collapse.
function deriveMrEnv() {
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

// Exchanges the IMS userId for an rfAuthToken. The response field is unconfirmed, so the
// likely candidates are tried. rfAuthTokenSettled gates maybeLoadMyData() so it can't fire
// mid-exchange with a null token.
async function exchangeRfAuthToken(clientId) {
  if (rfAuthTokenStarted) return;
  rfAuthTokenStarted = true;
  try {
    const data = await fetchAuthToken(clientId, apiConfig.profileId, apiConfig.apiUrl);
    rfAuthToken = data?.rfAuthToken ?? data?.token ?? data?.jwt ?? data?.authToken ?? null;
    if (!rfAuthToken) window.lana?.log('[session-store] jwt exchange returned no recognizable token field');
  } catch (err) {
    window.lana?.log(`[session-store] jwt exchange failed: ${err.message}`);
  }
  rfAuthTokenSettled = true;
  maybeLoadMyData();
}

// isRegistered is not set here: rsvpData doesn't apply to T1 events. loadMyData() derives it.
function syncAuth() {
  const profile = BlockMediator.get('imsProfile');
  if (profile === undefined) return;
  realAuthConfirmed = true;
  auth.value = {
    ...auth.value,
    isLoggedIn: !!(profile && !profile.noProfile && profile.account_type !== 'guest'),
    userFirstName: profile?.first_name ?? null,
  };
  if (auth.value.isLoggedIn && profile.userId) {
    exchangeRfAuthToken(profile.userId);
  } else {
    // Mark settled either way, so maybeLoadMyData() isn't blocked forever.
    rfAuthTokenSettled = true;
    maybeLoadMyData();
  }
}

// RF's own objects, not bare ids: schedule keys on sessionTimeID, favorites on sessionID.
function mapToSessionIds(entries, idField, matchField) {
  const idByRf = new Map(sessions.value.map((s) => [s[matchField], s.id]));
  return (entries || []).map((entry) => idByRf.get(entry[idField])).filter(Boolean);
}

// Needs the catalog loaded for mapToSessionIds(). isRegistered comes from loggedInUser, the
// only registration signal myData gives — mapping still unverified.
async function loadMyData() {
  try {
    const data = await fetchMyData(rfAuthToken, apiConfig.profileId, apiConfig.apiUrl);
    batch(() => {
      scheduled.value = new Set(mapToSessionIds(data.scheduled, 'sessionTimeID', 'rfCode'));
      favorited.value = new Set(mapToSessionIds(data.favorited, 'sessionID', 'rfSessionId'));
      auth.value = { ...auth.value, isRegistered: !!(data.loggedInUser && Object.keys(data.loggedInUser).length > 0) };
    });
  } catch (err) {
    window.lana?.log(`[session-store] myData fetch failed: ${err.message}`);
  }
}

// Per-attendee, so it is skipped for a logged-out visitor, unlike the catalog. Runs once,
// whichever of catalog/auth/token resolves last.
function maybeLoadMyData() {
  if (myDataAttempted) return;
  if (sessionsStatus.value !== 'ready') return;
  if (!realAuthConfirmed || !auth.value.isLoggedIn) return;
  if (!rfAuthTokenSettled) return;
  myDataAttempted = true;
  if (!rfAuthToken) {
    // No token means guaranteed failure. isRegistered stays undefined, not false.
    window.lana?.log('[session-store] no RF auth token — skipping myData, registration status unknown');
    return;
  }
  loadMyData();
}

async function loadSessions() {
  sessionsStatus.value = 'loading';
  try {
    const fetched = await fetchSessions(apiConfig.eventId);
    // Batched so components reading both `sessions` and `sessionsStatus` re-render once.
    batch(() => {
      sessions.value = fetched;
      sessionsStatus.value = 'ready';
    });
    const mrSessions = sessions.value.filter((s) => s.mrStreamId);
    startPolling(mrSessions, apiConfig.mrEnv, (active) => { liveStreamActiveIds.value = active; });
    // Always runs: non-MR sessions still need transitions without a user interaction.
    startSessionStateTicker(
      () => sessions.value,
      () => liveStreamActiveIds.value,
      () => { sessionStateVersion.value += 1; },
    );
    maybeLoadMyData();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[session-store] session catalog failed to load', {
      eventId: apiConfig.eventId,
      eventServiceEnv: getEventServiceEnv()?.name,
      error: err,
    });
    window.lana?.log(`[session-store] sessions fetch failed: ${err.message}`);
    sessionsStatus.value = 'error';
  }
}

export function getApiConfig() {
  return apiConfig;
}

// Lets any block open Session Guide straight to a detail view. No-ops if the block isn't
// mounted on the page.
export function openSessionGuideDetail(sessionId) {
  sessionGuideRequest.value = { sessionId };
}

// Parses the Tier 1 Event Configurator's payload (MWPW-200311); null if absent/invalid.
function parseTierOneEventConfig() {
  const raw = getMetadata('tier-1-event-config');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    window.lana?.log(`[session-store] invalid tier-1-event-config JSON: ${err.message}`);
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
    return;
  }
  initialized = true;

  apiConfig = {
    apiUrl: tierOneConfig.rfApiUrl || defaultRfApiUrlForEnv(),
    // The config's own eventId is the source of truth; page metadata is only a fallback.
    eventId: tierOneConfig.eventId || getMetadata('event-id'),
    profileId: tierOneConfig.rfProfileId || DEFAULT_RF_PROFILE_ID,
    registerUrl: tierOneConfig.registerUrl || '/register',
    // UTC epoch ms. DVR availability counts from eventStartMs.
    eventStartMs: tierOneConfig.eventStartDateTime || null,
    eventEndMs: tierOneConfig.eventEndDateTime || null,
    mrEnv: deriveMrEnv(),
  };

  if (!apiConfig.eventId) {
    // eslint-disable-next-line no-console
    console.warn('[session-store] no event ID found; the session catalog request will not have a valid event key');
  }

  mountToast();
  syncAuth();
  BlockMediator.subscribe('imsProfile', syncAuth);
  loadSessions();
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
      await removeSession(session.rfCode, rfAuthToken, apiConfig.profileId, apiConfig.apiUrl);
    } else {
      await addSession(session.rfCode, rfAuthToken, apiConfig.profileId, apiConfig.apiUrl);
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
}

export async function toggleFavorite(session) {
  const isFavorited = favorited.value.has(session.id);
  setPending(session.id, true);
  try {
    // Favoriting keys on rfSessionId, not rfCode — sessionTimeId is left empty.
    await toggleSessionInterest('', session.rfSessionId, rfAuthToken, apiConfig.profileId, apiConfig.apiUrl);
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
