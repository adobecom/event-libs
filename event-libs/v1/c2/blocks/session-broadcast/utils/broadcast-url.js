// The URL never shows a param, even mid-switch — manual switches carry the id in history.state.
// Named `watch`, not `session`, since sessions-guide's widget already owns `?session=`/`?sessions=`.
const ENTRY_PARAM = 'watch';

function cleanUrl() {
  const params = new URLSearchParams(window.location.search);
  params.delete(ENTRY_PARAM);
  const query = params.toString();
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

// One-shot read; callers should follow immediately with stripWatchParam().
export function readWatchParam() {
  return new URLSearchParams(window.location.search).get(ENTRY_PARAM);
}

// replaceState, not pushState — this URL was never a page the user chose to visit.
export function stripWatchParam(sessionId) {
  history.replaceState({ session: sessionId || null }, '', cleanUrl());
}

// Pushes a history entry (for back/forward) without changing the visible URL.
export function pushSessionState(sessionId) {
  history.pushState({ session: sessionId }, '', cleanUrl());
}

export function getHistorySessionId() {
  return history.state?.session || null;
}

// history.state doesn't survive a hard refresh — sessionStorage is the real persistence,
// wrapped in try/catch like sessions-guide's own `sg:last-view` (store/index.js).
const SS_ACTIVE_SESSION = 'sb:active-session';

export function persistActiveSession(sessionId) {
  try {
    sessionStorage.setItem(SS_ACTIVE_SESSION, sessionId);
  } catch {
    // unavailable — refresh persistence just won't work.
  }
}

export function getPersistedSessionId() {
  try {
    return sessionStorage.getItem(SS_ACTIVE_SESSION);
  } catch {
    return null;
  }
}

// A stale ?watch= link must actively discard any prior commitment — persistActiveSession()
// only ever writes a truthy id, never clears one.
export function clearPersistedSession() {
  try {
    sessionStorage.removeItem(SS_ACTIVE_SESSION);
  } catch {
    // unavailable
  }
}
