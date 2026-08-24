// Helpers for toggling the widget's own query params (`sessions` / `session`)
// while preserving any other params already present on the URL.

// safeUrl is generic (no sessions-guide-specific logic) and shared with
// session-routing.js — defined once in the shared utils module.
export { safeUrl } from '../../../../utils/utils.js';

function buildUrl(params) {
  const query = params.toString();
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

// Opens the drawer: sets `sessions`, drops any `session` detail param.
export function setSessionsParam() {
  const params = new URLSearchParams(window.location.search);
  params.delete('session');
  params.set('sessions', '');
  return buildUrl(params);
}

// Opens a session detail: sets `session=<url-slug>`, drops the `sessions` flag.
export function setSessionParam(value) {
  const params = new URLSearchParams(window.location.search);
  params.delete('sessions');
  params.set('session', value);
  return buildUrl(params);
}

const HTML_EXT = /\.html$/;

// The catalog already slugifies enTitle + sessionCode into the session's own page url, so its
// last path segment is the identity we deep-link by — no second slug to keep in step. e.g.
// .../max/2026/sessions/acom-ipod-test-session-no-mpc-1003-1 -> acom-ipod-test-session-no-mpc-1003-1
// Parsed rather than split so the host can never be mistaken for a segment; host rewriting
// (sessionPageUrlForEnv) and root-relative authored values both leave the path alone. The
// empties filter is what makes a trailing slash resolve to the segment before it.
export function sessionUrlSlug(url) {
  if (!url) return '';
  let pathname;
  try {
    ({ pathname } = new URL(url, window.location.origin));
  } catch {
    return '';
  }
  const segments = pathname.split('/').filter(Boolean);
  return (segments[segments.length - 1] || '').replace(HTML_EXT, '');
}

// The deep-link identity of a session. Falls back to the session id for rows with no url,
// which is also what openSessionGuideDetail() writes for its own deep link.
export function sessionParamValue(session) {
  return sessionUrlSlug(session.sessionPageUrl) || session.id || '';
}

// Reverse of sessionParamValue(). Matched whole against either form — the slug and the id
// both carry dashes, so splitting the param on one would truncate it.
export function findSessionByParam(sessionList, param) {
  if (!param) return null;
  return sessionList.find(
    (s) => sessionUrlSlug(s.sessionPageUrl) === param || s.id === param,
  ) || null;
}

// Closes the drawer: removes both of the widget's params.
export function clearSessionParams() {
  const params = new URLSearchParams(window.location.search);
  params.delete('sessions');
  params.delete('session');
  return buildUrl(params);
}

// Whether `href` points at the page currently being viewed (ignoring query/hash) — used to
// skip reloading a "Watch now" destination the widget is already embedded on.
export function isSamePage(href) {
  if (!href) return false;
  try {
    return new URL(href, window.location.origin).pathname === window.location.pathname;
  } catch {
    return false;
  }
}
