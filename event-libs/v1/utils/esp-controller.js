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

export async function constructRequestOptions(method, body = null, waitForIMS = true, skipAuth = false, rsvpToken = null) {
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
  // skipAuth suppresses the caller's IMS identity entirely — used only by
  // validateRsvpToken's load-time check, which authenticates solely via the
  // rsvp-token header and runs before there's necessarily any IMS session to read.
  // The override takes precedence over window.adobeIMS for callers with no IMS
  // bootstrap at all (e.g. the standalone tier-1-event-configurator DA app).
  const authToken = skipAuth ? null : (espAuthTokenOverride || window.adobeIMS?.getAccessToken()?.token);

  if (authToken) headers.append('Authorization', `Bearer ${authToken}`);
  // The rsvp-token never travels in the URL path or query string, to keep it out of access logs.
  if (rsvpToken) headers.append('x-adobe-esp-rsvp-token', rsvpToken);
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
// confirmed public. Skips Authorization (skipAuth=true): a wrong-env
// override token gets rejected outright rather than ignored.
export async function getEspEvent(eventId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET', null, false, true);

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

// Single-page ESP events list call (page-size/next-page-token/from-date,
// epoch ms). Unlike getEspEvent(), this route requires a valid IMS Bearer
// token. Skips the window.adobeIMS wait (waitForIMS=false) for callers
// feeding their own token via setEspAuthToken() instead.
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
const LIST_ALL_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;

let listAllEventsCache = null; // { fromDate, envName, expiresAt, promise }

// Walks every page of GET /v1/events into one array for client-side
// search/filter. Cached briefly; a failed fetch is never cached. No
// from-date floor for now — walks full history (bounded by MAX_PAGES);
// consider a default lookback if that proves too slow in practice.
export async function listAllEvents({ fromDate } = {}) {
  const now = Date.now();
  // Keyed on env too — callers (e.g. EventPicker) can switch getEventServiceEnv()'s
  // override mid-session, and a cache hit here must not serve one tier's
  // results for another.
  const envName = getEventServiceEnv().name;

  if (
    listAllEventsCache
    && listAllEventsCache.fromDate === fromDate
    && listAllEventsCache.envName === envName
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
      const page = await listEvents({ nextPageToken, fromDate });
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

  listAllEventsCache = { fromDate, envName, expiresAt: now + LIST_ALL_EVENTS_CACHE_TTL_MS, promise };
  return promise;
}

// Raw ESP session-catalog fetch (unmapped objects, e.g. for customAttributes)
// — confirmed public, skips Authorization like getEspEvent(). Returns
// `sessions` and `sessionTimes` separately — ESP keeps times in their own
// sessionId-keyed array (a session can have more than one, e.g. live +
// on-demand), not embedded on the session itself. Once MWPW-200314 merges,
// prefer sessions-api.js's fetchSessions(), which normalizes this same data.
export async function getEventSessionCatalog(eventId) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET', null, false, true);

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

export async function createAttendee(attendeeData, rsvpToken = null) {
  if (!attendeeData) return false;

  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const raw = JSON.stringify(attendeeData);
  // Cluster Gateway requires a valid IMS credential on every request regardless of the
  // rsvp-token header, so this always forwards whatever IMS token exists (guest or a real
  // signed-in session) rather than suppressing it — omitting it would get the request
  // rejected at the gateway before it ever reaches ESP. Which identity actually gets
  // registered is the backend's call, not ours: ESP's attendee routes give the rsvp-token
  // header precedence over any IMS identity, so an assistant registering a VIP via the link
  // while signed into their own Adobe ID still registers the VIP, not themselves.
  const options = await constructRequestOptions('POST', raw, true, false, rsvpToken);

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

export async function addAttendeeToEvent(eventId, attendee, rsvpToken = null) {
  if (!eventId || !attendee) return false;

  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const raw = JSON.stringify(attendee);
  // Same identity handling as createAttendee above. This call also consumes
  // the rsvp token server-side once the registration succeeds.
  const options = await constructRequestOptions('POST', raw, true, false, rsvpToken);

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
      `${serviceApiEndpoints.esp}/v1/events/${eventId}/campaigns/${campaignId}`,
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

// Validate-on-load for a guest rsvp token — authenticated solely by the
// x-adobe-esp-rsvp-token header. This call never consumes the token; actual
// registration (and consumption) happens via the normal attendee endpoints
// (createAttendee / addAttendeeToEvent above), with the token threaded through
// as auth instead of a separate submission endpoint.
export async function validateRsvpToken(eventId, token) {
  const eventServiceEnv = getEventServiceEnv();
  const { serviceApiEndpoints } = ENV_MAP[eventServiceEnv.name];
  const options = await constructRequestOptions('GET', null, false, true, token);

  try {
    const response = await fetch(`${serviceApiEndpoints.esp}/v1/events/${eventId}/rsvpTokenRegistrations`, options);
    const data = await response.json();

    if (!response.ok) {
      window.lana?.log(`Error: Failed to validate RSVP token. Status:${JSON.stringify(response)}`);
      return { ok: false, status: response.status, error: data };
    }

    return { ok: true, data };
  } catch (error) {
    window.lana?.log(`Error: Failed to validate RSVP token:${JSON.stringify(error)}`);
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
export async function getAndCreateAndAddAttendee(eventId, attendeeData, rsvpToken = null) {
  const profile = BlockMediator.get('imsProfile');
  const eventObj = await getEvent(eventId);

  if (!eventObj.ok) return { ok: false, error: 'Failed to get event' };

  let attendee;
  let registrationStatus = 'registered';

  if (profile.account_type === 'guest') {
    // Use BaseAttendee filter for creating new attendee. A guest arriving via an rsvp
    // token still forwards whatever IMS token exists alongside it — see createAttendee
    // for why (Cluster Gateway requires one either way; the backend, not us, decides
    // which credential's identity the registration actually uses).
    const filteredPayload = getBaseAttendeePayload(attendeeData);
    attendee = await createAttendee(filteredPayload, rsvpToken);
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

  // Preserve the upstream status (e.g. 401/404/409/410 for a guest whose rsvp
  // token went stale between page load and submit) so callers can show the
  // specific error copy instead of a generic failure message.
  if (!attendee?.ok) return { ok: false, status: attendee?.status, error: attendee?.error || 'Failed to create or update attendee' };

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

  // For a guest, this call both registers and consumes the rsvp token
  // server-side in one step.
  return addAttendeeToEvent(eventId, eventAttendeePayload, rsvpToken);
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
