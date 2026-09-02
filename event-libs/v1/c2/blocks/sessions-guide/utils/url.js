// Toggles the widget's own `sessions` / `session` params, preserving any others.
// safeUrl is generic and shared with session-routing.js, so it lives in shared utils.
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

// Last path segment of the session's own url, which the catalog already slugified from
// enTitle + sessionCode. Parsed so a bare host can't be mistaken for a segment; the empties
// filter is what makes a trailing slash resolve to the segment before it.
// See "Deep linking" in docs/sessions-guide-implementation-notes.md.
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

// Falls back to the session id, which is also what openSessionGuideDetail() writes.
export function sessionParamValue(session) {
  return sessionUrlSlug(session.sessionPageUrl) || session.id || '';
}

// Matched whole against either form: both carry dashes, so splitting would truncate them.
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

// Skips reloading a "Watch now" destination the widget is already embedded on.
// `?pretend-broadcast=true` is a manual-testing override: a draft page's pathname never
// matches the authored broadcast/homepage path, so this would otherwise always be false there.
export function isSamePage(href) {
  if (!href) return false;
  if (new URLSearchParams(window.location.search).get('pretend-broadcast') === 'true') return true;
  try {
    return new URL(href, window.location.origin).pathname === window.location.pathname;
  } catch {
    return false;
  }
}
