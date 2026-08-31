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
