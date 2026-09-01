// The URL never shows a param, even while switching — manual switches carry the session id in
// history.state, not the URL string. Named `watch`, not `session` — sessions-guide's own
// widget already owns `?session=`/`?sessions=` for its own detail-overlay/guide-open state.
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

// history.state survives soft in-page navigation but a hard refresh isn't code-guaranteed to
// restore it — sessionStorage is the actual persistence mechanism across a reload. Mirrors the
// try/catch-around-sessionStorage pattern already used for sessions-guide's own `sg:last-view`
// (sessions-guide/store/index.js), factored into named helpers here rather than inlined.
const SS_ACTIVE_SESSION = 'sb:active-session';

export function persistActiveSession(sessionId) {
  try {
    sessionStorage.setItem(SS_ACTIVE_SESSION, sessionId);
  } catch {
    // unavailable (private browsing, disabled storage) — refresh persistence just won't work.
  }
}

export function getPersistedSessionId() {
  try {
    return sessionStorage.getItem(SS_ACTIVE_SESSION);
  } catch {
    return null;
  }
}

// A stale/invalid ?watch= link needs to actively discard any prior commitment, not just leave
// manualSessionId unset — persistActiveSession() only ever writes on a truthy id, so it can't
// remove an old value on its own. Without this, a refresh right after landing on a dead link
// (before anything new gets a chance to commit) could resurrect the session the link was meant
// to invalidate.
export function clearPersistedSession() {
  try {
    sessionStorage.removeItem(SS_ACTIVE_SESSION);
  } catch {
    // unavailable
  }
}
