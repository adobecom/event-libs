// RainFocus (RF) live schedule/favorites API — the endpoint + profile id are per-event
// values, authored via the Tier 1 Event Configurator into the `rainfocus-api-url` /
// `rainfocus-api-profile-id` page metadata (MWPW-200311). session-store.js reads that
// metadata and falls back to DEFAULT_RF_PROFILE_ID below when an author hasn't set
// rainfocus-api-profile-id yet, so add/remove/toggle calls don't silently send
// profileId: undefined.
//
// Ported from the legacy northstar rainFocus.js client's ENDPOINTS/query-param
// contract (same RF backend), minus its AEM/FEDS-specific auth plumbing —
// rfAuthToken/clientId are still sourced elsewhere (see session-store.js's
// "TODO: replace null credentials" markers) and simply passed through here.

// Confirmed live (MAX 2025 curl examples, MWPW-200311): www.adobe.com reverse-proxies
// this path to RF's real backend, sidestepping CORS/RF's IP allowlist the same way the
// legacy northstar client's `max-api` endpoint did.
export const DEFAULT_RF_API_URL = 'https://www.adobe.com/max-api/';

// TODO(MWPW-200311): placeholder only — replace with the real default event's
// RainFocus profile id once confirmed. Per the Jira thread this isn't a secret:
// RainFocus restricts access by IP allowlisting on their side, not by this value.
export const DEFAULT_RF_PROFILE_ID = 'REPLACE_WITH_DEFAULT_RF_PROFILE_ID';

const ENDPOINTS = {
  GET_FAVORITES: 'myInterests',
  GET_SCHEDULE: 'mySchedule',
  TOGGLE_FAVORITES: 'toggleSessionInterest',
  ADD_TO_SCHEDULE: 'addSession',
  REMOVE_FROM_SCHEDULE: 'removeSession',
};

function buildUrl(rfApiUrl, endpoint, params) {
  const base = rfApiUrl || DEFAULT_RF_API_URL;
  // An author-authored rfApiUrl missing its trailing slash (e.g. ".../max-api" instead of
  // ".../max-api/") would otherwise have its last path segment replaced by `endpoint`
  // rather than appended to it, per URL's normal relative-resolution rules.
  const url = new URL(endpoint, base.endsWith('/') ? base : `${base}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url.toString();
}

async function rawFetch(rfApiUrl, endpoint, params) {
  const url = buildUrl(rfApiUrl, endpoint, params);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`RainFocus API request failed with status ${resp.status}`);
  return resp.json();
}

// Write-call envelope only: RF returns a numeric-string `responseCode` (0 or 15 = success,
// no actual failure) — ported from northstar's handleResponse. The two read calls
// (mySchedule/myInterests) never include a responseCode at all, so they skip this
// entirely and just default a missing array to empty (see below).
function handleWriteResponse(data) {
  const responseCode = data?.responseCode;
  switch (responseCode) {
    case '0': // success
    case '15': // this exact item is already in schedule — not a failure
      return data;
    case '13': // schedule conflict
      throw new Error('RainFocus schedule conflict');
    case '27': // insufficient access to schedule this session
      throw new Error('Insufficient access to schedule this session');
    default:
      throw new Error(`RainFocus API error, responseCode: ${responseCode}`);
  }
}

export async function fetchScheduled(rfAuthToken, clientId, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.GET_SCHEDULE, {
    rfApiProfileId, rfAuthToken, clientId,
  });
  return data?.mySchedule ?? [];
}

export async function fetchFavorited(rfAuthToken, clientId, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.GET_FAVORITES, {
    rfApiProfileId, rfAuthToken, clientId,
  });
  return data?.myInterests ?? [];
}

export async function addSession(sessionTimeId, rfAuthToken, clientId, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.ADD_TO_SCHEDULE, {
    rfApiProfileId, rfAuthToken, clientId, sessionTimeId,
  });
  return handleWriteResponse(data);
}

export async function removeSession(sessionTimeId, rfAuthToken, clientId, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.REMOVE_FROM_SCHEDULE, {
    rfApiProfileId, rfAuthToken, clientId, sessionTimeId,
  });
  return handleWriteResponse(data);
}

export async function toggleSessionInterest(
  sessionTimeId, sessionId, rfAuthToken, clientId, rfApiProfileId, rfApiUrl,
) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.TOGGLE_FAVORITES, {
    rfApiProfileId, rfAuthToken, clientId, sessionTimeId, sessionId,
  });
  return handleWriteResponse(data);
}
