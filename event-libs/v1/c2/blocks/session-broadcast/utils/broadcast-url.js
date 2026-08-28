// Broadcast's URL never shows a param, even while switching — unlike sessions-guide's own
// utils/url.js, which deliberately keeps its params visible for a shareable widget-state URL.
// Manual switches still use the History API (ticket's option 3) but carry the session id in
// `history.state`, not the URL string, so the address bar stays "always clean" per the
// ticket's AC. Only the one-time entry param (from an external homepage/session-guide CTA)
// ever touches the visible URL, and only until it's read once.
//
// The entry param is named `watch`, not `session` — sessions-guide's own widget (always
// mounted alongside this block, for the persistent FAB) already owns `?session=<slug>` to mean
// "the detail overlay for this session is open" (see DrawerShell.js/openSessionGuideDetail),
// and `?sessions=` to mean "the guide is open." Reusing `session` here would mean a URL the
// guide writes after a card click gets misread on reload as "autoplay this session." Since
// this param is stripped immediately after being read once, giving it a distinct name fully
// avoids the collision — no shared runtime behavior needs to change on either side.
const ENTRY_PARAM = 'watch';

function cleanUrl() {
  const params = new URLSearchParams(window.location.search);
  params.delete(ENTRY_PARAM);
  const query = params.toString();
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

// One-shot read of the entry `?watch=<id>` param set by an external CTA. Callers should read
// this once on mount and immediately follow with stripWatchParam() — it is not meant to be
// re-read later, since the param won't still be there.
export function readWatchParam() {
  return new URLSearchParams(window.location.search).get(ENTRY_PARAM);
}

// Removes the entry param from the visible URL right after it's been read. Uses
// replaceState (not pushState) so this doesn't create an extra back-button stop for a URL
// the user never actually chose to visit. `sessionId` seeds history.state so a later
// popstate back to this same entry still knows what was loaded here.
export function stripWatchParam(sessionId) {
  history.replaceState({ session: sessionId || null }, '', cleanUrl());
}

// Manual in-page session switch: pushes a new history entry (so back/forward works) but the
// visible URL string never changes — only history.state carries the session id.
export function pushSessionState(sessionId) {
  history.pushState({ session: sessionId }, '', cleanUrl());
}

// What a popstate listener re-derives on back/forward, since the URL string itself never
// carries the session id for in-page switches.
export function getHistorySessionId() {
  return history.state?.session || null;
}
