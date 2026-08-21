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
// Bumped only when a session's derived state (upcoming/live/on-demand) actually changes —
// see session-state-ticker.js. Components read this purely to establish a re-render
// dependency; the value itself carries no meaning beyond "something transitioned."
export const sessionStateVersion = signal(0);
// Set by openSessionGuideDetail() below; sessions-guide's DrawerShell subscribes to open
// its detail view for the given session. A new object on every call (even repeat calls
// for the same sessionId) so the signal always notifies.
export const sessionGuideRequest = signal(null);

let initialized = false;
let apiConfig = null;
let myDataAttempted = false;
let realAuthConfirmed = false;
let rfAuthToken = null;
let rfAuthTokenStarted = false;
let rfAuthTokenSettled = false;

// getEventServiceEnv() resolves dev/dev02/stage/stage02/prod/local; the media-relay
// backend only has dev/stage/prod environments, so the finer-grained names collapse.
function deriveMrEnv() {
  const env = getEventServiceEnv()?.name || 'dev';
  if (env.startsWith('stage')) return 'stage';
  if (env === 'prod') return 'prod';
  return 'dev';
}

// Milo's own page env (see mobile-rider.js's getEnv() for the same pattern), not the
// ESP-specific event-service-env — see STAGE_RF_API_URL in rainfocus.js for why this matters.
function defaultRfApiUrlForEnv() {
  const isProd = getEventConfig()?.miloConfig?.env?.name === 'prod';
  return isProd ? DEFAULT_RF_API_URL : STAGE_RF_API_URL;
}

// Exchanges the real IMS profile's userId for an rfAuthToken (RF's jwt endpoint), so
// myData/schedule/favorite calls are attributed to the real signed-in attendee. The real
// response field is unconfirmed (northstar never called this endpoint) — tries the likely
// candidates. Runs once; rfAuthTokenSettled (not rfAuthTokenStarted) gates maybeLoadMyData()
// so it can't fire mid-exchange with a still-null token.
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

// isRegistered isn't set here at all — rsvpData doesn't apply to T1 events; loadMyData()
// derives it from RF's own loggedInUser field instead, once the jwt exchange and myData call
// complete.
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
    // Not logged in, or logged in with no userId to exchange — either way, mark the
    // exchange as settled so maybeLoadMyData() isn't blocked on it forever.
    rfAuthTokenSettled = true;
    maybeLoadMyData();
  }
}

// mySchedule[]/sessionInterests[] entries are RF's own objects, not bare ids — schedule
// entries key on sessionTimeID (→ rfCode), favorite entries key on sessionID (→ rfSessionId).
function mapToSessionIds(entries, idField, matchField) {
  const idByRf = new Map(sessions.value.map((s) => [s[matchField], s.id]));
  return (entries || []).map((entry) => idByRf.get(entry[idField])).filter(Boolean);
}

// Populates scheduled/favorited from the real RF response, once the session catalog (needed
// for mapToSessionIds()) has loaded. Also derives isRegistered from loggedInUser — the only
// registration signal myData gives us (unconfirmed mapping, verify against a real unregistered
// attendee).
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

// myData is a per-attendee schedule/favorites call — pointless (and liable to error or return
// someone else's stale-looking empty state) for a logged-out visitor, unlike the ESL session
// catalog, which loads for everyone regardless of auth. Waits for the jwt exchange to have
// settled too, so it doesn't fire with a still-null rfAuthToken while that's in flight. Runs
// once, whichever of catalog/auth/token resolves last.
function maybeLoadMyData() {
  if (myDataAttempted) return;
  if (sessionsStatus.value !== 'ready') return;
  if (!realAuthConfirmed || !auth.value.isLoggedIn) return;
  if (!rfAuthTokenSettled) return;
  myDataAttempted = true;
  if (!rfAuthToken) {
    // myData can't succeed without a token — skip it rather than firing a call that's
    // guaranteed to fail. isRegistered stays undefined (unknown), not asserted false.
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
    // Unlike MR polling, this always runs — a page with only non-MR sessions still needs
    // upcoming/live/on-demand transitions to happen without waiting for a user interaction.
    startSessionStateTicker(
      () => sessions.value,
      () => liveStreamActiveIds.value,
      () => { sessionStateVersion.value += 1; },
    );
    maybeLoadMyData();
  } catch (err) {
    // Preserve the full error in DevTools (including its stack and any fetch details).
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

// General-purpose entry point for any block to open Session Guide directly to a
// session's detail view (e.g. a card click in Upcoming Sessions/Featured Sessions),
// without duplicating Session Guide's internal drawer/URL logic. No-ops if the
// sessions-guide block isn't authored/mounted on the current page — the caller is
// expected to know it's present, same as it must for the session data itself.
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

// Idempotent — safe to call multiple times; no-ops after the first successful init and
// when tier-1-event-config metadata is absent (mirrors the `event-id` gate decorateEvent
// already uses for page-wide setup).
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
    // tier-1-event-config's own eventId (stamped in by the Tier 1 Event Configurator at
    // save time) is the real source of truth for which event's catalog to fetch — page
    // `event-id` metadata is only a fallback for a config authored without one.
    eventId: tierOneConfig.eventId || getMetadata('event-id'),
    profileId: tierOneConfig.rfProfileId || DEFAULT_RF_PROFILE_ID,
    registerUrl: tierOneConfig.registerUrl || '/register',
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
