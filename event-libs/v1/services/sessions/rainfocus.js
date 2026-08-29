// RainFocus schedule/favorites API, ported from northstar. Endpoint and profile id come from
// tier-1-event-config, falling back to the defaults below. clientId is only sent by
// fetchAuthToken. Several exports are unused, ported for parity, with unconfirmed shapes.

// Same-origin Adobe.com proxy over RainFocus's API, avoiding CORS and the IP allowlist.
export const DEFAULT_RF_API_URL = 'https://www.adobe.com/max-api/';

// Separate RainFocus host; tokens aren't portable between the two. Covers local dev too.
export const STAGE_RF_API_URL = 'https://www.stage.adobe.com/max-api/';

// Not secrets: RainFocus restricts by IP allowlist.
export const RF_PROFILE_IDS = {
  max25: 'MAX25ggj84gt2s0u73vzzzSESSIONHUB',
  max26: 'MAX26sss1mIiY19qLgszzzSESSIONHUB',
};

// Current/upcoming event — update when the next MAX supersedes it.
export const DEFAULT_RF_PROFILE_ID = RF_PROFILE_IDS.max26;

// Same for every event so far; per-event widget ids retired.
export const RF_WIDGET_ID = 'RCitHYXguvb7I6o4Ps9T5weDqIK9xRYb';

const ENDPOINTS = {
  AUTH: 'jwt',
  MY_DATA: 'myData',
  GET_SCHEDULE: 'mySchedule',
  GET_FAVORITES: 'myInterests',
  TOGGLE_FAVORITES: 'toggleSessionInterest',
  ADD_TO_SCHEDULE: 'addSession',
  REMOVE_FROM_SCHEDULE: 'removeSession',
  ADD_AND_REMOVE_FROM_SCHEDULE: 'dropSwapSession',
  ATTENDEE: 'attendeeAccess',
};

function buildUrl(rfApiUrl, endpoint, params) {
  const base = rfApiUrl || DEFAULT_RF_API_URL;
  // Trailing slash so the endpoint appends rather than replaces the last segment.
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

export async function fetchAuthToken(clientId, rfApiProfileId, rfApiUrl) {
  return rawFetch(rfApiUrl, ENDPOINTS.AUTH, { rfApiProfileId, clientId });
}

// Schedule + favorites in one request. A populated loggedInUser is the registration signal.
export async function fetchMyData(rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.MY_DATA, {
    rfApiProfileId, rfAuthToken, rfWidgetId: RF_WIDGET_ID,
  });
  return {
    scheduled: data?.mySchedule ?? [],
    favorited: data?.sessionInterests ?? [],
    loggedInUser: data?.loggedInUser ?? null,
  };
}

// Standalone equivalents of fetchMyData's two pieces.
export async function fetchScheduled(rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.GET_SCHEDULE, { rfApiProfileId, rfAuthToken });
  return data?.mySchedule ?? [];
}

export async function fetchFavorited(rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.GET_FAVORITES, { rfApiProfileId, rfAuthToken });
  return data?.myInterests ?? [];
}

export async function addSession(sessionTimeId, rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.ADD_TO_SCHEDULE, {
    // Required, or RF defaults to in-person-only and rejects with responseCode 27.
    rfApiProfileId, rfAuthToken, sessionTimeId, virtual: true,
  });
  return handleWriteResponse(data);
}

export async function removeSession(sessionTimeId, rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.REMOVE_FROM_SCHEDULE, {
    rfApiProfileId, rfAuthToken, sessionTimeId,
  });
  return handleWriteResponse(data);
}

// Atomic drop-and-add. dropSessionItems is semicolon-separated RF sessionTimeIds.
export async function dropAndSwapSession(sessionTimeId, dropSessionItems, rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.ADD_AND_REMOVE_FROM_SCHEDULE, {
    rfApiProfileId, rfAuthToken, sessionTimeId, dropSessionItems,
  });
  return handleWriteResponse(data);
}

export async function toggleSessionInterest(sessionTimeId, sessionId, rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.TOGGLE_FAVORITES, {
    rfApiProfileId, rfAuthToken, sessionTimeId, sessionId,
  });
  return handleWriteResponse(data);
}

export async function fetchAttendeeAccess(sessionTimeId, rfAuthToken, rfApiProfileId, rfApiUrl) {
  return rawFetch(rfApiUrl, ENDPOINTS.ATTENDEE, { rfApiProfileId, rfAuthToken, sessionTimeId });
}
