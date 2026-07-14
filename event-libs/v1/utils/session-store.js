import { signal, batch } from '../deps/htm-preact.js';
import BlockMediator from '../deps/block-mediator.min.js';
import { getMetadata, getEventServiceEnv } from './utils.js';
import { fetchSessions } from '../services/sessions/sessions-api.js';
import { startPolling } from '../services/sessions/poller.js';
import { startSessionStateTicker } from '../services/sessions/session-state-ticker.js';
import { addSession, removeSession, toggleSessionInterest } from '../services/sessions/rainfocus.js';
import { mountToast } from '../features/toast/toast.js';

const LS_SCHEDULED = 'sessions:scheduled';
const LS_FAVORITED = 'sessions:favorited';

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

let initialized = false;
let apiConfig = null;

// getEventServiceEnv() resolves dev/dev02/stage/stage02/prod/local; the media-relay
// backend only has dev/stage/prod environments, so the finer-grained names collapse.
function deriveMrEnv() {
  const env = getEventServiceEnv()?.name || 'dev';
  if (env.startsWith('stage')) return 'stage';
  if (env === 'prod') return 'prod';
  return 'dev';
}

// TODO: remove once real IMS/Rainfocus auth is wired up — simulates a logged-in,
// registered user with a pre-seeded schedule/favorites across all environments.
const SEED_SCHEDULED = ['k-001', 's-001', 's-002', 's-006'];
const SEED_FAVORITED = ['k-001', 's-001', 's-003', 's-007'];

function seedDevData() {
  try {
    if (!localStorage.getItem('sg:dev-auth')) {
      localStorage.setItem('sg:dev-auth', JSON.stringify({
        isLoggedIn: true,
        isRegistered: true,
        userFirstName: 'Dev',
      }));
    }
    if (!localStorage.getItem(LS_SCHEDULED)) {
      localStorage.setItem(LS_SCHEDULED, JSON.stringify(SEED_SCHEDULED));
    }
    if (!localStorage.getItem(LS_FAVORITED)) {
      localStorage.setItem(LS_FAVORITED, JSON.stringify(SEED_FAVORITED));
    }
  } catch { /* ignore */ }
}

function loadPersisted() {
  try {
    scheduled.value = new Set(JSON.parse(localStorage.getItem(LS_SCHEDULED) || '[]'));
    favorited.value = new Set(JSON.parse(localStorage.getItem(LS_FAVORITED) || '[]'));
  } catch { /* localStorage unavailable */ }
}

function persistScheduled() {
  try { localStorage.setItem(LS_SCHEDULED, JSON.stringify([...scheduled.value])); } catch { /* unavailable */ }
}

function persistFavorited() {
  try { localStorage.setItem(LS_FAVORITED, JSON.stringify([...favorited.value])); } catch { /* unavailable */ }
}

function syncAuth() {
  // sg:dev-auth in localStorage takes priority — prevents Milo's guest IMS from
  // overwriting a dev-mode user after a block renders (TODO: remove once real IMS
  // auth is wired up end to end).
  try {
    const devAuth = JSON.parse(localStorage.getItem('sg:dev-auth') || 'null');
    if (devAuth) {
      auth.value = {
        isLoggedIn: devAuth.isLoggedIn ?? null,
        isRegistered: devAuth.isRegistered ?? undefined,
        userFirstName: devAuth.userFirstName ?? null,
      };
      return;
    }
  } catch { /* ignore */ }
  const profile = BlockMediator.get('imsProfile');
  if (profile === undefined) return;
  const rsvp = BlockMediator.get('rsvpData');
  auth.value = {
    isLoggedIn: !!(profile && !profile.noProfile && profile.account_type !== 'guest'),
    isRegistered: rsvp?.registered === true,
    userFirstName: profile?.first_name ?? null,
  };
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
  } catch (err) {
    window.lana?.log(`[session-store] sessions fetch failed: ${err.message}`);
    sessionsStatus.value = 'error';
  }
}

export function getApiConfig() {
  return apiConfig;
}

// Idempotent — safe to call multiple times; no-ops after the first successful init
// and when the essential rainfocus-api-url metadata is absent (mirrors the
// `event-id` gate that decorateEvent already uses for page-wide setup).
export function initSessionState() {
  if (initialized) return;
  const apiUrl = getMetadata('rainfocus-api-url');
  if (!apiUrl) return;
  initialized = true;

  apiConfig = {
    apiUrl,
    eventId: getMetadata('event-id'),
    profileId: getMetadata('rainfocus-api-profile-id'),
    registerUrl: getMetadata('register-url') || '/register',
    manualCutoff: getMetadata('manual-on-demand-transition-time') || null,
    mrEnv: deriveMrEnv(),
  };

  mountToast();
  seedDevData();
  loadPersisted();
  syncAuth();
  BlockMediator.subscribe('imsProfile', syncAuth);
  BlockMediator.subscribe('rsvpData', syncAuth);
  scheduled.subscribe(persistScheduled);
  favorited.subscribe(persistFavorited);
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

export async function scheduleSession(session) {
  const isScheduled = scheduled.value.has(session.id);
  setPending(session.id, true);
  try {
    // TODO: replace null credentials with real rfAuthToken/clientId from auth integration
    if (isScheduled) {
      await removeSession(session.rfCode, null, null, apiConfig.profileId, apiConfig.apiUrl);
    } else {
      await addSession(session.rfCode, null, null, apiConfig.profileId, apiConfig.apiUrl);
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

export async function favoriteSession(session) {
  const isFavorited = favorited.value.has(session.id);
  setPending(session.id, true);
  try {
    // TODO: replace null credentials with real rfAuthToken/clientId from auth integration
    await toggleSessionInterest(session.rfCode, session.id, null, null, apiConfig.profileId, apiConfig.apiUrl);
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
