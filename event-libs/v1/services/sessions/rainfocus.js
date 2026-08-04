// RainFocus (RF) live schedule/favorites API. Endpoint + profile id normally come from the
// Tier 1 Event Configurator's tier-1-event-config payload (see session-store.js), falling
// back to the defaults below. Ported from northstar's rainFocus.js ENDPOINTS/query-param
// contract; rfAuthToken is sourced elsewhere and just passed through here. clientId isn't
// part of this contract — northstar's determineParams() only ever sent it on the unused
// AUTH/jwt endpoint, confirmed absent from real myData/toggleSessionInterest traffic.

// Confirmed live via real MAX 2025 traffic — reverse-proxies to RF, avoiding CORS/IP allowlist.
export const DEFAULT_RF_API_URL = 'https://www.adobe.com/max-api/';

// Not secrets — RainFocus restricts access by IP allowlist, not by this value.
export const RF_PROFILE_IDS = {
  max25: 'MAX25ggj84gt2s0u73vzzzSESSIONHUB',
  max26: 'MAX26sss1mIiY19qLgszzzSESSIONHUB',
};

// Current/upcoming event — update when the next MAX supersedes it.
export const DEFAULT_RF_PROFILE_ID = RF_PROFILE_IDS.max26;

// Same value for every event seen so far (Summit and MAX alike) — the legacy northstar
// client's per-event widget ids (e.g. a separate Summit 2021 one) are retired/unused.
export const RF_WIDGET_ID = 'RCitHYXguvb7I6o4Ps9T5weDqIK9xRYb';

const ENDPOINTS = {
  MY_DATA: 'myData',
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

// The first call on landing on an event page — fetches the signed-in attendee's schedule
// and favorites in one request. Field names assumed from mySchedule/myInterests' own
// naming; unconfirmed against real myData traffic.
export async function fetchMyData(rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.MY_DATA, {
    rfApiProfileId, rfAuthToken, rfWidgetId: RF_WIDGET_ID,
  });
  return {
    scheduled: data?.mySchedule ?? [],
    favorited: data?.myInterests ?? [],
  };
}

export async function addSession(sessionTimeId, rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.ADD_TO_SCHEDULE, {
    rfApiProfileId, rfAuthToken, sessionTimeId,
  });
  return handleWriteResponse(data);
}

export async function removeSession(sessionTimeId, rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.REMOVE_FROM_SCHEDULE, {
    rfApiProfileId, rfAuthToken, sessionTimeId,
  });
  return handleWriteResponse(data);
}

export async function toggleSessionInterest(sessionTimeId, sessionId, rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.TOGGLE_FAVORITES, {
    rfApiProfileId, rfAuthToken, sessionTimeId, sessionId,
  });
  return handleWriteResponse(data);
}
