// RainFocus (RF) live schedule/favorites API. Endpoint + profile id normally come from the
// Tier 1 Event Configurator's tier-1-event-config payload (see session-store.js), falling
// back to the defaults below. Ported from northstar's rainFocus.js ENDPOINTS/query-param
// contract; rfAuthToken/clientId are sourced elsewhere and just passed through here.

// Confirmed live via real MAX 2025 traffic — reverse-proxies to RF, avoiding CORS/IP allowlist.
export const DEFAULT_RF_API_URL = 'https://www.adobe.com/max-api/';

// Not secrets — RainFocus restricts access by IP allowlist, not by this value.
export const RF_PROFILE_IDS = {
  max25: 'MAX25ggj84gt2s0u73vzzzSESSIONHUB',
  max26: 'MAX26sss1mIiY19qLgszzzSESSIONHUB',
};

// Current/upcoming event — update when the next MAX supersedes it.
export const DEFAULT_RF_PROFILE_ID = RF_PROFILE_IDS.max26;

const ENDPOINTS = {
  GET_FAVORITES: 'myInterests',
  GET_SCHEDULE: 'mySchedule',
  TOGGLE_FAVORITES: 'toggleSessionInterest',
  ADD_TO_SCHEDULE: 'addSession',
  REMOVE_FROM_SCHEDULE: 'removeSession',
};

function buildUrl(rfApiUrl, endpoint, params) {
  const base = rfApiUrl || DEFAULT_RF_API_URL;
  // Ensure a trailing slash so endpoint appends rather than replacing the last path segment.
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

// Only write calls carry a responseCode (0/15 = success); reads never do.
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
