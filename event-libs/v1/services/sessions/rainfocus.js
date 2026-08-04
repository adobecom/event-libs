// RainFocus (RF) live schedule/favorites API. Endpoint + profile id normally come from the
// Tier 1 Event Configurator's tier-1-event-config payload (see session-store.js), falling
// back to the defaults below. Ported from northstar's rainFocus.js ENDPOINTS/query-param
// contract; rfAuthToken is sourced elsewhere and just passed through here. clientId is only
// ever sent on the AUTH/jwt endpoint — confirmed absent from real myData/toggleSessionInterest
// traffic and every other endpoint's params.
//
// fetchAuthToken/fetchScheduled/fetchFavorited/fetchAttendeeAccess/dropAndSwapSession have no
// caller in this codebase yet — ported for parity with northstar's full endpoint set, in case
// a future feature needs one directly rather than through fetchMyData. Their response shapes
// aren't confirmed against real traffic (unlike fetchMyData's) — verify before relying on them.

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

// Exchanges an IMS clientId for an rfAuthToken — the only endpoint that takes clientId.
// No caller in this codebase; northstar itself never called it either (auth is sourced via
// FEDS' own token distribution instead). Response shape unconfirmed.
export async function fetchAuthToken(clientId, rfApiProfileId, rfApiUrl) {
  return rawFetch(rfApiUrl, ENDPOINTS.AUTH, { rfApiProfileId, clientId });
}

// The first call on landing on an event page — fetches the signed-in attendee's schedule
// and favorites in one request. Confirmed real response also includes exhibitorInterests,
// exhibitorLeadSetting, exhibitorLeads, and loggedInUser — not needed here, so not modeled.
export async function fetchMyData(rfAuthToken, rfApiProfileId, rfApiUrl) {
  const data = await rawFetch(rfApiUrl, ENDPOINTS.MY_DATA, {
    rfApiProfileId, rfAuthToken, rfWidgetId: RF_WIDGET_ID,
  });
  return {
    scheduled: data?.mySchedule ?? [],
    favorited: data?.sessionInterests ?? [],
  };
}

// Schedule/favorites without the exhibitor/user data myData also returns. Field names assumed
// to match myData's own (mySchedule/myInterests) — unconfirmed for these standalone endpoints.
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

// Atomically drops dropSessionItems (RF sessionTimeIds, semicolon-separated per northstar) while
// adding sessionTimeId — no caller in northstar either; its own schedule-conflict UI called
// removeSession then addSession sequentially instead of this combined endpoint.
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

// Attendee access info for a given session time — unused in northstar itself; response shape
// unconfirmed.
export async function fetchAttendeeAccess(sessionTimeId, rfAuthToken, rfApiProfileId, rfApiUrl) {
  return rawFetch(rfApiUrl, ENDPOINTS.ATTENDEE, { rfApiProfileId, rfAuthToken, sessionTimeId });
}
