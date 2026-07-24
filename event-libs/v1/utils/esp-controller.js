import { LIBS } from './utils.js';
import BlockMediator from '../deps/block-mediator.min.js';
import { getBaseAttendeePayload, getEventAttendeePayload } from './data-utils.js';
import { ENV_MAP } from './constances.js';
import { getEventConfig, getEventServiceEnv } from './utils.js';

export const getCaasTags = (() => {
  let cache;
  let promise;

  return () => {
    if (cache) {
      return cache;
    }

    if (!promise) {
      promise = fetch('https://www.adobe.com/chimera-api/tags')
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }

          throw new Error('Failed to load tags');
        })
        .then((data) => {
          cache = data;
          return data;
        })
        .catch((err) => {
          window.lana?.log(`Failed to load products map JSON. Error: ${err}`);
          throw err;
        });
    }

    return promise;
  };
})();

export function waitForAdobeIMS() {
  return new Promise((resolve) => {
    const checkIMS = () => {
      if (window.adobeIMS && window.adobeIMS.getAccessToken) {
        resolve();
      } else {
        setTimeout(checkIMS, 100);
      }
    };
    checkIMS();
  });
}

// Override for callers with no window.adobeIMS at all (e.g. the standalone
// tier-1-event-configurator DA app, which has no Milo/IMS bootstrap) — set
// once a token is available from whatever auth flow that caller has, and
// every constructRequestOptions() call picks it up automatically.
let espAuthTokenOverride = null;

export function setEspAuthToken(token) {
  espAuthTokenOverride = token;
}

export async function constructRequestOptions(method, body = null, waitForIMS = true, includeAuth = true) {
  const { miloConfig } = getEventConfig();
  const miloLibs = miloConfig?.miloLibs || LIBS;

  let getUuid;
  try {
    const [{ default: importedGetUuid }] = await Promise.all([import(`${miloLibs}/utils/getUuid.js`), waitForIMS ? waitForAdobeIMS() : Promise.resolve()]);
    getUuid = importedGetUuid;
  } catch (error) {
    // Fallback for test environment or when import fails
    getUuid = (timestamp) => `test-uuid-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
  }

  const headers = new Headers();
  const authToken = includeAuth && (espAuthTokenOverride || window.adobeIMS?.getAccessToken()?.token);

  if (authToken) headers.append('Authorization', `Bearer ${authToken}`);
  headers.append('x-api-key', 'acom_event_service');
  headers.append('x-request-id', await getUuid(new Date().getTime()));
  headers.append('content-type', 'application/json');

  const options = {
    method,
    headers,
  };

  if (body) options.body = body;

  return options;
}

export async function getEvent(eventId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/events/${eventId}`, options);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 404) {
        window.lana?.log(`Event ${eventId} not found on "${eventServiceEnv.name}" ESP env. Verify the event exists in this environment or switch using ?espenv=<env>.`);
      }
      window.lana?.log(`Error: Failed to get details for event ${eventId}. Status:${JSON.stringify(response)}`);
      return { ok: response.ok, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to get details for event ${eventId}:`, error);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

// Singular event lookup directly on ESP (not ESL, unlike getEvent() above) —
// confirmed public, no Authorization needed. Skips it deliberately
// (includeAuth=false): an override token scoped to the wrong environment
// gets rejected outright by a non-prod tier's gateway rather than ignored.
export async function getEspEvent(eventId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET', null, false, false);

  try {
    const response = await fetch(`${serviceApiEndpoints.esp}/v1/events/${eventId}`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get ESP event ${eventId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to get ESP event ${eventId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

// Single-page ESP events list call, mirroring ESP's own query params
// (page-size, next-page-token, from-date — epoch ms). Unlike getEspEvent()
// above, this route genuinely requires a valid IMS Bearer token. Skips the
// window.adobeIMS wait (waitForIMS=false) for callers with no Milo/IMS
// bootstrap that feed their own token via setEspAuthToken() instead — it
// would otherwise hang forever waiting for a window.adobeIMS that never appears.
export async function listEvents({ pageSize, nextPageToken, fromDate } = {}) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET', null, false);

  const params = new URLSearchParams();
  if (pageSize) params.set('page-size', pageSize);
  if (nextPageToken) params.set('next-page-token', nextPageToken);
  if (fromDate) params.set('from-date', fromDate);
  const query = params.toString();

  try {
    // GET /v1/events lives on the ESP base URL, not ESL — getEvent's .esl
    // call above is a different endpoint and an easy precedent to copy by
    // mistake here.
    const response = await fetch(`${serviceApiEndpoints.esp}/v1/events${query ? `?${query}` : ''}`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to list events. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data: { events: data.events || [], nextPageToken: data.nextPageToken || null } };
  } catch (error) {
    window.lana?.log(`Error: Failed to list events. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

const LIST_ALL_EVENTS_MAX_PAGES = 100;
// ~6 months back — configuring current/upcoming events, not full history.
const LIST_ALL_EVENTS_DEFAULT_LOOKBACK_MS = 1000 * 60 * 60 * 24 * 30 * 6;
const LIST_ALL_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;

let listAllEventsCache = null; // { fromDate, expiresAt, promise }

// Walks every page of GET /v1/events within the fromDate floor into one
// array, so the picker can search/filter client-side over the whole catalog.
// Cached briefly so reopening the picker doesn't re-walk the full history
// each time; a failed fetch is never cached, so the next call retries.
export async function listAllEvents({ fromDate } = {}) {
  const resolvedFromDate = fromDate ?? (Date.now() - LIST_ALL_EVENTS_DEFAULT_LOOKBACK_MS);
  const now = Date.now();

  if (
    listAllEventsCache
    && listAllEventsCache.fromDate === resolvedFromDate
    && listAllEventsCache.expiresAt > now
  ) {
    return listAllEventsCache.promise;
  }

  const promise = (async () => {
    const events = [];
    let nextPageToken;
    let pageCount = 0;

    while (pageCount < LIST_ALL_EVENTS_MAX_PAGES) {
      // eslint-disable-next-line no-await-in-loop
      const page = await listEvents({ nextPageToken, fromDate: resolvedFromDate });
      if (!page.ok) {
        listAllEventsCache = null;
        return page;
      }

      events.push(...page.data.events);
      nextPageToken = page.data.nextPageToken;
      pageCount += 1;
      if (!nextPageToken) break;
    }

    return { ok: true, data: events };
  })();

  listAllEventsCache = { fromDate: resolvedFromDate, expiresAt: now + LIST_ALL_EVENTS_CACHE_TTL_MS, promise };
  return promise;
}

// Raw ESP session-catalog fetch, for callers that need the unmapped session
// objects (e.g. reading customAttributes directly) rather than
// sessions-api.js's fully-normalized shape. Confirmed public, same reasoning
// as getEspEvent() above (skips Authorization).
//
// Returns both `sessions` and `sessionTimes` — ESP keeps start/end times in a
// separate top-level array cross-referenced by sessionId (a session can have
// more than one, e.g. a live slot plus an on-demand replay), not embedded on
// the session object itself (see tier-1-event-configurator/ESP-SESSION-ENDPOINTS.md).
//
// NOTE: sessions-api.js's fetchSessions() (MWPW-200314, not yet merged) hits
// this same endpoint and normalizes it into the app's session shape — prefer
// that over this raw fetch once merged, where a caller only needs what it
// already provides.
export async function getEventSessionCatalog(eventId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET', null, false, false);

  try {
    const response = await fetch(`${serviceApiEndpoints.esp}/v1/events/${eventId}/session-catalog`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get session catalog for event ${eventId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data: { sessions: data.sessions || [], sessionTimes: data.sessionTimes || [] } };
  } catch (error) {
    window.lana?.log(`Error: Failed to get session catalog for event ${eventId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getEventAttendee(eventId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/events/${eventId}/attendees/me`, options);

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get attendee for event ${eventId}:${JSON.stringify(response)}`);
      let textResp;
      try {
        textResp = await response.text();
      } catch (e) {
        window.lana?.log(`Error: Failed to parse response text:${JSON.stringify(e)}`);
      }

      return {
        ok: response.ok,
        status: response.status,
        error: textResp || response.status,
      };
    }

    return { ok: true, data: await response.json() };
  } catch (error) {
    window.lana?.log(`Error: Failed to get attendee for event ${eventId}. E:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getAttendee() {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/attendees/me`, options);

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get attendee details. Status:${JSON.stringify(response)}`);
      let textResp;
      try {
        textResp = await response.text();
      } catch (e) {
        window.lana?.log(`Error: Failed to parse response text:${JSON.stringify(e)}`);
      }

      return {
        ok: response.ok,
        status: response.status,
        error: textResp || response.status,
      };
    }

    return { ok: true, data: await response.json() };
  } catch (error) {
    window.lana?.log(`Error: Failed to get attendee. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function createAttendee(attendeeData) {
  if (!attendeeData) return false;

  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const raw = JSON.stringify(attendeeData);
  const options = await constructRequestOptions('POST', raw);

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/attendees`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to create attendee. Status:${JSON.stringify(response)}`);
      return { ok: response.ok, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to create attendee. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function addAttendeeToEvent(eventId, attendee) {
  if (!eventId || !attendee) return false;

  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const raw = JSON.stringify(attendee);
  const options = await constructRequestOptions('POST', raw);

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/events/${eventId}/attendees/${attendee.attendeeId}`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to add attendee for event ${eventId}. Status:${JSON.stringify(response)}`);
      return { ok: response.ok, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to add attendee for event ${eventId}:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function updateAttendee(attendeeData) {
  if (!attendeeData) return false;

  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const raw = JSON.stringify(attendeeData);
  const options = await constructRequestOptions('PUT', raw);

  try {
      const response = await fetch(`${serviceApiEndpoints.esl}/v1/attendees/me`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to update attendee. Status:${JSON.stringify(response)}`);
      return { ok: response.ok, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to update attendee:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function deleteAttendeeFromEvent(eventId, attendeeId = null) {
  if (!eventId) return false;

  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('DELETE');

  try {
    let response;
    if (attendeeId) {
      response = await fetch(`${serviceApiEndpoints.esl}/v1/events/${eventId}/attendees/${attendeeId}`, options);
    } else {
      response = await fetch(`${serviceApiEndpoints.esl}/v1/events/${eventId}/attendees/me`, options);
    }

    if (!response.ok) {
      window.lana?.log(`Error: Failed to delete attendee for event ${eventId}. Status:${JSON.stringify(response)}`);
      let textResp;
      try {
        textResp = await response.text();
      } catch (e) {
        window.lana?.log(`Error: Failed to parse response text:${JSON.stringify(e)}`);
      }

      return {
        ok: response.ok,
        status: response.status,
        error: textResp || response.status,
      };
    }

    if (response.status === 204) return { ok: true, data: { status: 204, attendeeDeleted: true } };
    return { ok: true, data: await response.json() };
  } catch (error) {
    window.lana?.log(`Error: Failed to delete attendee for event ${eventId}:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getCampaign(eventId, campaignId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(
      `${serviceApiEndpoints.esl}/v1/events/${eventId}/campaigns/${campaignId}`,
      options,
    );
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get campaign ${campaignId} for event ${eventId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to get campaign ${campaignId} for event ${eventId}:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getSessions(eventId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const allSessions = [];
  let pageToken = null;

  try {
    const options = await constructRequestOptions('GET');
    const base = `${serviceApiEndpoints.esl}/v1/sessions?eventId=${eventId}`;
    do {
      const url = pageToken ? `${base}&pageToken=${pageToken}` : base;
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        window.lana?.log(`Error: Failed to get sessions for event ${eventId}. Status:${JSON.stringify(response)}`);
        return { ok: false, status: response.status, error: data };
      }

      allSessions.push(...(data.sessions || []));
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    return { ok: true, data: allSessions };
  } catch (error) {
    window.lana?.log(`Error: Failed to get sessions for event ${eventId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getSessionTimes(sessionId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/session-times?sessionId=${sessionId}`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get session times for session ${sessionId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data: data.sessionTimes || [] };
  } catch (error) {
    window.lana?.log(`Error: Failed to get session times for session ${sessionId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getSessionSpeakers(sessionId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/sessions/${sessionId}/speakers`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get speakers for session ${sessionId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data: data.speakers || [] };
  } catch (error) {
    window.lana?.log(`Error: Failed to get speakers for session ${sessionId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getAllSeriesSpeakers(seriesId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/series/${seriesId}/speakers`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get speakers for series ${seriesId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data: data.speakers || [] };
  } catch (error) {
    window.lana?.log(`Error: Failed to get speakers for series ${seriesId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getVenueLocation(venueId, locationId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/venues/${venueId}/locations/${locationId}`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get location ${locationId} for venue ${venueId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to get location ${locationId} for venue ${venueId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getMyEventSessions(eventId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/attendees/me/events/${eventId}/sessions`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get my sessions for event ${eventId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to get my sessions for event ${eventId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getSessionTimeAttendee(sessionTimeId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/session-times/${sessionTimeId}/attendees/me`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get attendee for session time ${sessionTimeId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to get attendee for session time ${sessionTimeId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

function isSessionDryrun() {
  return new URLSearchParams(window.location.search).get('sessionDryrun') !== null;
}

// NOTE: exact path for session-time registration needs backend confirmation before production use
export async function registerForSessionTime(sessionTimeId, attendeeId, registrationData) {
  if (isSessionDryrun()) return { ok: true, data: {} };

  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const raw = JSON.stringify({ attendeeId, ...registrationData });
  const options = await constructRequestOptions('POST', raw);

  try {
    const response = await fetch(`${serviceApiEndpoints.esl}/v1/session-times/${sessionTimeId}/attendees/${attendeeId}`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to register for session time ${sessionTimeId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to register for session time ${sessionTimeId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function unregisterFromSessionTime(sessionTimeId) {
  if (isSessionDryrun()) return { ok: true };

  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('DELETE');

  try {
    const response = await fetch(
      `${serviceApiEndpoints.esl}/v1/session-times/${sessionTimeId}/attendees/me`,
      options,
    );

    if (!response.ok) {
      window.lana?.log(`Error: Failed to unregister from session time ${sessionTimeId}. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status };
    }

    if (response.status === 204) return { ok: true };
    return { ok: true, data: await response.json() };
  } catch (error) {
    window.lana?.log(`Error: Failed to unregister from session time ${sessionTimeId}. Error:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

// compound helper functions
export async function getAndCreateAndAddAttendee(eventId, attendeeData) {
  const profile = BlockMediator.get('imsProfile');
  const eventObj = await getEvent(eventId);

  if (!eventObj.ok) return { ok: false, error: 'Failed to get event' };

  let attendee;
  let registrationStatus = 'registered';

  if (profile.account_type === 'guest') {
    // Use BaseAttendee filter for creating new attendee
    const filteredPayload = getBaseAttendeePayload(attendeeData);
    attendee = await createAttendee(filteredPayload);
  } else {
    const attendeeResp = await getAttendee();

    if (!attendeeResp.ok && attendeeResp.status === 404) {
      // Use BaseAttendee filter for creating new attendee
      const filteredPayload = getBaseAttendeePayload(attendeeData);
      attendee = await createAttendee(filteredPayload);
    } else if (attendeeResp.data?.attendeeId) {
      // Use BaseAttendee filter for updating existing attendee
      const payload = { ...attendeeResp.data, ...attendeeData };
      const filteredPayload = getBaseAttendeePayload(payload);
      attendee = await updateAttendee(filteredPayload);
    }
  }

  if (!attendee?.ok) return { ok: false, error: 'Failed to create or update attendee' };

  const newAttendeeData = attendee.data;

  if (eventObj.data.isFull) registrationStatus = 'waitlisted';

  if (attendeeData.campaignId && registrationStatus !== 'waitlisted') {
    const campaign = await getCampaign(eventId, attendeeData.campaignId);
    if (campaign.ok && campaign.data.attendeeLimit != null) {
      const { attendeeLimit, attendeeCount, waitlistAttendeeCount } = campaign.data;
      if (attendeeLimit === attendeeCount
        || (attendeeLimit > attendeeCount && waitlistAttendeeCount > 0)) {
        registrationStatus = 'waitlisted';
      }
    }
  }

  // Use EventAttendee filter for adding attendee to event
  const eventAttendeePayload = getEventAttendeePayload({
    ...newAttendeeData,
    ...attendeeData,
    registrationStatus,
  });

  return addAttendeeToEvent(eventId, eventAttendeePayload);
}

export async function indexPathToSchedule(scheduleId, pagePath) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const body = JSON.stringify({ pagePath });
  const options = await constructRequestOptions('POST', body);

  try {
    const response = await fetch(`${serviceApiEndpoints.esp}/v1/page-schedules/${scheduleId}/page-paths`, options);

    if (!response.ok) {
      window.lana?.log(`Error: Failed to index path to schedule. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: response.status };
    }

    return { ok: true, data: await response.json() };
  } catch (error) {
    window.lana?.log(`Error: Failed to index path to schedule:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}

export async function getSchedulePagePaths(scheduleId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET');

  try {
    const response = await fetch(`${serviceApiEndpoints.esp}/v1/page-schedules/${scheduleId}/page-paths`, options);

    if (!response.ok) {
      window.lana?.log(`Error: Failed to get schedule page paths. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: response.status };
    }

    return { ok: true, data: await response.json() };
  } catch (error) {
    window.lana?.log(`Error: Failed to get schedule page paths:${JSON.stringify(error)}`);
    return { ok: false, status: 'Network Error', error: error.message };
  }
}
