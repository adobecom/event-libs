// Helpers for toggling the widget's own query params (`sessions` / `session`)
// while preserving any other params already present on the URL.

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

// Opens a session detail: sets `session=<slug>`, drops the `sessions` flag.
export function setSessionParam(value) {
  const params = new URLSearchParams(window.location.search);
  params.delete('sessions');
  params.set('session', value);
  return buildUrl(params);
}

// Closes the drawer: removes both of the widget's params.
export function clearSessionParams() {
  const params = new URLSearchParams(window.location.search);
  params.delete('sessions');
  params.delete('session');
  return buildUrl(params);
}
