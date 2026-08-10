import { constructRequestOptions } from '../../utils/esp-controller.js';
import { getEventServiceEnv } from '../../utils/utils.js';
import { ENV_MAP } from '../../utils/constances.js';

// TEMPORARY: disabled — every session in the real MAX26 catalog is currently a draft/test
// row, so enforcing this today would hide the whole catalog. Flip to `true` once real,
// published content exists.
export const ENFORCE_PUBLISHED_FILTER = false;

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

// ESP prefixes its own external*Id fields with "rf-" as internal namespacing —
// RainFocus's own API always expects the bare id, with no prefix.
function stripRfPrefix(id) {
  return id ? id.replace(/^rf-/, '') : '';
}

export function normalizeSessions(rawSessions) {
  return rawSessions.map((s) => ({
    id: s.id || '',
    slug: s.slug || '',
    rfCode: s.rfCode || '',
    // RF-native session id (not session-time id) — toggleSessionInterest (favoriting)
    // keys on this instead of rfCode.
    rfSessionId: s.rfSessionId || '',
    title: s.title || '',
    description: s.description || '',
    startTimeUtc: s.startTimeUtc || '',
    endTimeUtc: s.endTimeUtc || '',
    duration: s.duration || 0,
    track: s.track || '',
    type: s.type || '',
    technicalLevel: s.technicalLevel || '',
    category: coerceArray(s.category),
    contentCategory: coerceArray(s.contentCategory),
    audience: coerceArray(s.audience),
    speakers: s.speakers || [],
    products: s.products || [],
    resources: s.resources || [],
    mrStreamId: s.mrStreamId ?? null,
    videoAvailable: Boolean(s.videoAvailable),
    inPerson: Boolean(s.inPerson),
    isLivestreamed: Boolean(s.isLivestreamed),
    isOnline: Boolean(s.isOnline),
    sessionPageUrl: s.sessionPageUrl || '',
    watchUrl: s.watchUrl || '',
    isKeynote: Boolean(s.isKeynote),
    thumbnailUrl: s.thumbnailUrl ?? null,
    ...(s.copyrightDisclaimer ? { copyrightDisclaimer: s.copyrightDisclaimer } : {}),
  }));
}

// Single source of truth so the name only has to change in one place — ESP is expected
// to rename this custom attribute for the MAX 2026 event; swap the string here when the
// new name lands. Exported so tier-1-event-configurator/utils.js (which needs the same
// attribute for its own track editor) doesn't carry a second, independently-drifting copy.
export const TRACK_ATTRIBUTE_NAME = 'Primary Track for Agenda (Digital Agenda)';

// Generic session/track helpers, not Tier-1-specific — shared here so
// tier-1-event-configurator and session-guide-configurator use the same implementation
// instead of one importing from the other's UI code.
export function getSessionTrack(session) {
  const attr = (session?.customAttributes || []).find((a) => a?.name === TRACK_ATTRIBUTE_NAME);
  return attr?.values?.[0]?.label ?? attr?.values?.[0]?.value ?? null;
}

export function extractDistinctTracks(sessions) {
  const tracks = new Set();
  (sessions || []).forEach((session) => {
    const value = getSessionTrack(session);
    if (value) tracks.add(value);
  });
  return [...tracks].sort();
}

// Derives facetable custom attributes + their distinct values from an already-fetched
// session catalog, mirroring the enabled/inputType/valueId filtering ESP's own
// /session-facets endpoint applies server-side, so results match it without an extra
// network round-trip.
export function deriveFacetableAttributes(sessions) {
  const attributeMap = new Map(); // attributeId -> { attributeId, label, values: Map<valueId, {...}> }
  (sessions || []).forEach((session) => {
    (session.customAttributes || []).forEach((attr) => {
      if (attr.enabled === false) return;
      if (!['single-select', 'multi-select'].includes(attr.inputType)) return;
      if (!attributeMap.has(attr.attributeId)) {
        attributeMap.set(attr.attributeId, { attributeId: attr.attributeId, label: attr.label, values: new Map() });
      }
      const group = attributeMap.get(attr.attributeId);
      (attr.values || []).forEach((v) => {
        if (!v.valueId) return; // free-text values aren't indexable
        if (!group.values.has(v.valueId)) {
          group.values.set(v.valueId, {
            valueId: v.valueId, label: v.label, ordinal: v.ordinal, count: 0,
          });
        }
        group.values.get(v.valueId).count += 1;
      });
    });
  });
  return [...attributeMap.values()].map((group) => ({
    attributeId: group.attributeId,
    label: group.label,
    values: [...group.values.values()].sort((a, b) => a.ordinal - b.ordinal),
  }));
}

// customAttributes carry things like track/audience/technical-level as name+values pairs
// rather than plain session fields. `values[]` holds the value(s) actually selected for
// that session (see events-service-platform's resolveCustomAttributes), not the full
// option list.
function extractCustomAttributeValues(session, name) {
  const attr = (session.customAttributes || []).find((a) => a?.name === name);
  return (attr?.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
}

function extractCustomAttributeValue(session, name) {
  return extractCustomAttributeValues(session, name)[0] || '';
}

// The `Watch ` customAttribute's value is a raw HTML anchor (e.g.
// `<a href="...">Watch</a>`) rather than a bare URL — pull the href out of it.
function extractWatchUrl(session) {
  const html = extractCustomAttributeValue(session, 'Watch ');
  return /href="([^"]+)"/.exec(html)?.[1] || '';
}

// `sessions[].url` is an internal drafts/staging link, not usable as a production page
// URL — but its last path segment is exactly the slug we want.
function slugFromUrl(url) {
  if (!url) return '';
  const segments = url.split('?')[0].split('#')[0].split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

// `published: false` marks a draft/test row that must never reach real visitors once
// ENFORCE_PUBLISHED_FILTER is on. Missing the field is treated as visible (fail open).
export function isSessionPublished(session) {
  return session.published !== false;
}

// Joins the ESL/ESP catalog payload's flat, relational arrays (sessions/sessionTimes/
// speakers, related by id) into the raw-session shape normalizeSessions() expects.
export function mapEslPayloadToRawSessions(payload) {
  const speakersById = new Map((payload.speakers || []).map((sp) => [sp.speakerId, sp]));
  const timesBySessionId = new Map();
  (payload.sessionTimes || []).forEach((t) => {
    if (!timesBySessionId.has(t.sessionId)) timesBySessionId.set(t.sessionId, []);
    timesBySessionId.get(t.sessionId).push(t);
  });

  return (payload.sessions || [])
    .filter((session) => !ENFORCE_PUBLISHED_FILTER || isSessionPublished(session))
    .map((session) => {
    // Some real sessions (canceled, TBD, overflow-room placeholders) have no scheduled
    // sessionTime yet — startTimeUtc/endTimeUtc fall through to '' below, and
    // utils/time.js's formatters/getSessionDayKey() are guarded to handle that gracefully.
    const times = (timesBySessionId.get(session.sessionId) || [])
      .slice()
      .sort((a, b) => (a.startTimeMillis ?? 0) - (b.startTimeMillis ?? 0));
    const [firstTime] = times;

    const speakers = (session.speakers || [])
      .slice()
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .map((ref) => speakersById.get(ref.speakerId))
      .filter(Boolean)
      .map((sp) => ({
        name: `${sp.firstName || ''} ${sp.lastName || ''}`.trim(),
        title: sp.localizations?.['en-US']?.title || '',
        photo: null,
      }));

    const formatValues = extractCustomAttributeValues(session, 'Format');
    const type = extractCustomAttributeValue(session, 'Session Type');
    const slug = slugFromUrl(session.url);
    const thumbnail = (session.images || []).find((img) => img.imageKind === 'session-card-image');

    return {
      id: session.sessionId,
      slug,
      // Schedule (addSession/removeSession) keys on the per-time-slot id; favoriting
      // (toggleSessionInterest) keys on the session-level id instead — two distinct RF ids.
      rfCode: stripRfPrefix(firstTime?.externalSessionTimeId),
      rfSessionId: stripRfPrefix(session.externalSessionId),
      title: session.localizations?.['en-US']?.title || session.enTitle || '',
      description: session.localizations?.['en-US']?.description || '',
      startTimeUtc: firstTime ? new Date(firstTime.startTimeMillis).toISOString() : '',
      endTimeUtc: firstTime ? new Date(firstTime.endTimeMillis).toISOString() : '',
      duration: session.sessionLengthInMinutes || 0,
      // "Track" is topic-like (drives the card icon); "Primary Track for Agenda" is the
      // single value shown as the card/detail track name — two distinct real attributes.
      track: extractCustomAttributeValue(session, TRACK_ATTRIBUTE_NAME),
      category: extractCustomAttributeValues(session, 'Track'),
      contentCategory: extractCustomAttributeValues(session, 'Programming Category'),
      type,
      technicalLevel: extractCustomAttributeValue(session, 'Technical Level'),
      audience: extractCustomAttributeValues(session, 'Audience'),
      speakers,
      products: extractCustomAttributeValues(session, 'Product'),
      inPerson: formatValues.includes('In-Person'),
      isOnline: formatValues.includes('Online'),
      videoAvailable: formatValues.includes('Online') || formatValues.includes('On demand, post event'),
      isLivestreamed: extractCustomAttributeValues(session, 'Livestreamed Content').includes('Live'),
      sessionPageUrl: slug ? `/sessions/${slug}` : '',
      watchUrl: extractWatchUrl(session),
      isKeynote: type === 'Keynote',
      thumbnailUrl: thumbnail?.imageUrl ?? null,
      copyrightDisclaimer: extractCustomAttributeValue(session, 'LegalDisclaimer') || undefined,
      // resources[]/mrStreamId intentionally omitted — no source in this payload yet
      // (resources still in development backend-side; video/stream data is deliberately
      // withheld from this public endpoint until the session goes live). normalizeSessions()
      // defaults both to empty/null.
    };
  });
}

// `/session-catalog` is a confirmed-public ESP endpoint — no auth token or group-id
// header required (skipAuth: true), same pattern as esp-controller.js's getEspEvent().
async function fetchEslSessions(eventId) {
  const { serviceApiEndpoints } = ENV_MAP[getEventServiceEnv().name];
  const options = await constructRequestOptions('GET', null, false, true);
  const res = await fetch(`${serviceApiEndpoints.esp}/v1/events/${eventId}/session-catalog`, options);
  if (!res.ok) {
    throw new Error(`ESL sessions fetch failed for event ${eventId}: ${res.status}`);
  }
  const payload = await res.json();
  return mapEslPayloadToRawSessions(payload);
}

export async function fetchSessions(eventId) {
  const rawSessions = await fetchEslSessions(eventId);
  return normalizeSessions(rawSessions);
}
