// RainFocus (RF) live schedule/favorites API, ported from northstar's rainFocus.js. Endpoint +
// profile id come from the Tier 1 Event Configurator's tier-1-event-config payload (see
// session-store.js), falling back to the defaults below. clientId is only sent by
// fetchAuthToken — every other endpoint's real params omit it.
//
// fetchAuthToken/fetchScheduled/fetchFavorited/fetchAttendeeAccess/dropAndSwapSession are
// unused here (ported for parity with northstar's full endpoint set) — their response shapes
// are unconfirmed, unlike fetchMyData's.

// Same-origin Adobe.com client proxy over RainFocus's real API (avoids CORS/IP allowlist) —
// confirmed live via real MAX 2025 traffic, and documented internally: maps these operation
// slugs to RainFocus's own /api/adobe/v2/* paths on events.rainfocus.com (prod backend).
// See go/rainfocus-api-integration (wiki.corp.adobe.com/.../2131569308) and go/rainfocus-api-reference
// (wiki.corp.adobe.com/.../3972304790).
export const DEFAULT_RF_API_URL = 'https://www.adobe.com/max-api/';

// Non-prod counterpart — proxies to a genuinely separate RainFocus backend host
// (events-stg.rainfocus.com, not just a different Adobe.com CDN environment fronting the
// same RF data). Confirmed empirically 2026-08-07: swapping a stage-issued rfAuthToken onto
// the prod URL (or vice versa) fails outright with responseCode 103 ("must provide... a
// valid userToken") on both sides — tokens aren't portable across the two hosts. A stage-IMS
// identity won't resolve against prod RF, and milo's local env mirrors stage IMS, so this
// covers local dev too. See go/rainfocus-api-integration's staging examples and "FEDS - MAX
// 2020" (wiki.corp.adobe.com/.../2162927534), which documents the raw stage RF host directly.
export const STAGE_RF_API_URL = 'https://www.stage.adobe.com/max-api/';

// Not secrets — RainFocus restricts access by IP allowlist, not by this value.
export const RF_PROFILE_IDS = {
  max25: 'MAX25ggj84gt2s0u73vzzzSESSIONHUB',
  max26: 'MAX26sss1mIiY19qLgszzzSESSIONHUB',
};

// Current/upcoming event — update when the next MAX supersedes it.
export const DEFAULT_RF_PROFILE_ID = RF_PROFILE_IDS.max26;

// Same value for every event so far (Summit and MAX) — legacy per-event widget ids retired.
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

export async function fetchAuthToken(clientId, rfApiProfileId, rfApiUrl) {
  return rawFetch(rfApiUrl, ENDPOINTS.AUTH, { rfApiProfileId, clientId });
}

// The first call on landing on an event page — schedule + favorites in one request. Real
// response also includes exhibitorInterests/exhibitorLeadSetting/exhibitorLeads — not needed
// here. loggedInUser: a populated attendee record is session-store.js's registration signal.
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

// Standalone equivalents of fetchMyData's two pieces, without the exhibitor/user data.
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
    // northstar only sends this for hybrid events (gated on a page-level isEventHybrid
    // flag) — MAX is always hybrid (in-person + virtual attendance both exist, see the
    // real Format values), so it's unconditional here rather than threading through a
    // flag for a distinction that's always true for us. Without it, RF defaults the
    // request to in-person-only attendance and rejects with responseCode 27
    // ("must be registered for the full conference...") even for attendees who should
    // be allowed to schedule online/hybrid sessions.
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

// Atomically drops dropSessionItems (RF sessionTimeIds, semicolon-separated per northstar)
// while adding sessionTimeId — northstar's own conflict UI called removeSession then
// addSession sequentially instead of this combined endpoint.
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
