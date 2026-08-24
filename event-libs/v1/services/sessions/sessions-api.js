import { constructRequestOptions } from '../../utils/esp-controller.js';
import { getEventServiceEnv, getEventConfig } from '../../utils/utils.js';
import { ENV_MAP, ADOBE_PROD_HOST, ADOBE_STAGE_HOST } from '../../utils/constances.js';

// Catalog URLs always carry prod's host; point non-prod pages at stage.
// See docs/sessions-guide-implementation-notes.md.
export function sessionPageUrlForEnv(
  url,
  isProd = getEventConfig()?.miloConfig?.env?.name === 'prod',
) {
  if (!url || isProd) return url || '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== ADOBE_PROD_HOST) return url;
    parsed.hostname = ADOBE_STAGE_HOST;
    return parsed.toString();
  } catch {
    return url;
  }
}

// TEMPORARY: every MAX26 row is still a draft, so enforcing this would hide the catalog.
export const ENFORCE_PUBLISHED_FILTER = false;

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

// RainFocus expects the bare id; ESP namespaces its own with `rf-`.
function stripRfPrefix(id) {
  return id ? id.replace(/^rf-/, '') : '';
}

export function normalizeSessions(rawSessions) {
  return rawSessions.map((s) => ({
    id: s.id || '',
    rfCode: s.rfCode || '',
    // Session-level id; favoriting keys on this, scheduling on rfCode.
    rfSessionId: s.rfSessionId || '',
    title: s.title || '',
    description: s.description || '',
    startTimeUtc: s.startTimeUtc || '',
    endTimeUtc: s.endTimeUtc || '',
    duration: s.duration || 0,
    track: s.track || '',
    type: s.type || '',
    technicalLevel: s.technicalLevel || '',
    contentCategory: coerceArray(s.contentCategory),
    audience: coerceArray(s.audience),
    industry: coerceArray(s.industry),
    // Not in the catalog yet — empty hides its detail row.
    aiFocus: coerceArray(s.aiFocus),
    // closedCaptions is carried but no longer rendered anywhere.
    closedCaptions: s.closedCaptions || '',
    ipodOrGdprCopy: s.ipodOrGdprCopy || '',
    // MAX26-only; empty on MAX25 sessions, which is the fallback we want.
    additionalTracks: coerceArray(s.additionalTracks),
    trackOverride: s.trackOverride || '',
    speakers: s.speakers || [],
    products: s.products || [],
    productAttributeId: s.productAttributeId || '',
    resources: s.resources || [],
    mrStreamId: s.mrStreamId ?? null,
    inPerson: Boolean(s.inPerson),
    isLivestreamed: Boolean(s.isLivestreamed),
    isOnline: Boolean(s.isOnline),
    // Keeps a session out of Live & Upcoming — see hasOnDemandFormat().
    hasOnDemandFormat: Boolean(s.hasOnDemandFormat),
    // null, not 0: 0 means available from the moment the event starts.
    dvrDelayHours: s.dvrDelayHours ?? null,
    // One field per video source, named for its player. Alternatives, not a fallback chain.
    // All unread; see "Video sources" in docs/sessions-guide-implementation-notes.md.
    mpcId: s.mpcId || '',
    youTubeId: s.youTubeId || '',
    mrDvrVideoId: s.mrDvrVideoId || '',
    mrSkinId: s.mrSkinId || '',
    videoDuration: s.videoDuration || '',
    sessionPageUrl: sessionPageUrlForEnv(s.sessionPageUrl),
    isKeynote: Boolean(s.isKeynote),
    thumbnailUrl: s.thumbnailUrl ?? null,
    customAttributeValues: s.customAttributeValues || {},
    ...(s.legalDisclaimer ? { legalDisclaimer: s.legalDisclaimer } : {}),
  }));
}

// MAX26 name first, MAX25 fallback. Exported so the configurator shares one copy.
export const TRACK_ATTRIBUTE_NAMES = ['Primary Event Site Track', 'Primary Track for Agenda (Digital Agenda)'];

// Folded because the catalog is inconsistent (`In-Person` / `In person` / slug forms).
// See "Format value folding" in docs/sessions-guide-implementation-notes.md.
const NON_ALPHANUMERIC = /[^a-z0-9]/g;
const foldFormatValue = (value) => String(value ?? '').toLowerCase().replace(NON_ALPHANUMERIC, '');

const FORMAT_ONLINE = foldFormatValue('Online');
const FORMAT_IN_PERSON = foldFormatValue('In person');
const FORMAT_ON_DEMAND_POST_EVENT = foldFormatValue('On demand, post event');

function hasFormatValue(formatValues, foldedMarker) {
  return (formatValues || []).some((value) => foldFormatValue(value) === foldedMarker);
}

// Unconditional: this value alone bars Live, Upcoming, Previously aired and Recommended.
export function hasOnDemandFormat(formatValues) {
  return hasFormatValue(formatValues, FORMAT_ON_DEMAND_POST_EVENT);
}

// Free text, so blank/whitespace/non-numeric all mean no delay (null), not 0.
export function parseDvrDelayHours(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) return null;
  const hours = Number(trimmed);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

// Shared by both configurators so neither imports the other's UI code.
export function getSessionTrack(session) {
  const attr = (session?.customAttributes || []).find((a) => TRACK_ATTRIBUTE_NAMES.includes(a?.name));
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

const ADDITIONAL_TRACK_ATTRIBUTE_NAME = 'Additional Event Site Tracks';

// All values, not just the first — the runtime treats these as real tracks.
export function getSessionAdditionalTracks(session) {
  const attr = (session?.customAttributes || []).find((a) => a?.name === ADDITIONAL_TRACK_ATTRIBUTE_NAME);
  return (attr?.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
}

// Primary + additional: either kind can end up on a badge.
export function extractDistinctAllTracks(sessions) {
  const tracks = new Set();
  (sessions || []).forEach((session) => {
    const primary = getSessionTrack(session);
    if (primary) tracks.add(primary);
    getSessionAdditionalTracks(session).forEach((value) => tracks.add(value));
  });
  return [...tracks].sort();
}

const OVERRIDE_ATTRIBUTE_NAME = 'Override Primary Event Site Track';

// Free text, so every distinct value an author typed becomes its own swimlane.
export function getSessionOverrideText(session) {
  const attr = (session?.customAttributes || []).find((a) => a?.name === OVERRIDE_ATTRIBUTE_NAME);
  return attr?.values?.[0]?.label ?? attr?.values?.[0]?.value ?? null;
}

export function extractDistinctOverrideTexts(sessions) {
  const texts = new Set();
  (sessions || []).forEach((session) => {
    const value = getSessionOverrideText(session);
    if (value) texts.add(value);
  });
  return [...texts].sort();
}

const PRODUCT_ATTRIBUTE_NAME = 'Product';

// Multi-select, unlike track/override — returns every value.
export function getSessionProducts(session) {
  const attr = (session?.customAttributes || []).find((a) => a?.name === PRODUCT_ATTRIBUTE_NAME);
  return (attr?.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
}

// Identifies the product filter category; `Illustrator` is an Audience value too.
export function getProductAttributeId(session) {
  const attr = (session?.customAttributes || []).find((a) => a?.name === PRODUCT_ATTRIBUTE_NAME);
  return attr?.attributeId || '';
}

export function extractDistinctProducts(sessions) {
  const products = new Set();
  (sessions || []).forEach((session) => {
    getSessionProducts(session).forEach((value) => products.add(value));
  });
  return [...products].sort();
}

// Attributes the catalog sends that the guide must never surface. Matched on name, since
// attributeId is per-event. See docs/sessions-guide-implementation-notes.md.
export const IGNORED_ATTRIBUTE_NAMES = ['Gated Video'];

const isIgnoredAttribute = (attr) => IGNORED_ATTRIBUTE_NAMES.includes(attr?.name);

// Mirrors ESP's own /session-facets filtering, without the extra round-trip.
export function deriveFacetableAttributes(sessions) {
  const attributeMap = new Map(); // attributeId -> { attributeId, label, values: Map<valueId, {...}> }
  (sessions || []).forEach((session) => {
    (session.customAttributes || []).forEach((attr) => {
      if (attr.enabled === false) return;
      if (isIgnoredAttribute(attr)) return;
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

// `name` may be an array of candidates, tried in order — for attributes ESP renamed
// between MAX25 and MAX26. Names are matched exactly.
function extractCustomAttributeValues(session, name) {
  const candidates = Array.isArray(name) ? name : [name];
  const attr = (session.customAttributes || []).find((a) => candidates.includes(a?.name));
  return (attr?.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
}

function extractCustomAttributeValue(session, name) {
  return extractCustomAttributeValues(session, name)[0] || '';
}

// attributeId-keyed, built from the raw payload so newly authored filter categories
// resolve with no per-field mapping.
function buildCustomAttributeValueMap(session) {
  const map = {};
  (session.customAttributes || []).forEach((attr) => {
    if (attr.enabled === false) return;
    if (isIgnoredAttribute(attr)) return;
    if (!['single-select', 'multi-select'].includes(attr.inputType)) return;
    map[attr.attributeId] = (attr.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
  });
  return map;
}

// Missing field is treated as visible (fail open).
export function isSessionPublished(session) {
  return session.published !== false;
}

// No digital way to watch, so it is dropped from the catalog rather than per view.
// See docs/sessions-guide-implementation-notes.md.
export function isInPersonOnly(session) {
  return session.inPerson && !session.isOnline && !session.hasOnDemandFormat;
}

// Takes a raw ESL session — reads customAttributes.
export function isMissingFormat(session) {
  return extractCustomAttributeValues(session, 'Format').length === 0;
}

const DROP_LOG_LIMIT = 10;

// sessionCode is what an author can search RainFocus by; the id alone is not enough.
function describeRawSession(session) {
  const code = session.sessionCode || '(no code)';
  const title = session.localizations?.['en-US']?.title || session.enTitle || '(untitled)';
  return `${code} "${title}" [${session.sessionId}]`;
}

// Joins the catalog's flat relational arrays into the shape normalizeSessions() expects.
export function mapEslPayloadToRawSessions(payload) {
  const speakersById = new Map((payload.speakers || []).map((sp) => [sp.speakerId, sp]));
  const timesBySessionId = new Map();
  (payload.sessionTimes || []).forEach((t) => {
    if (!timesBySessionId.has(t.sessionId)) timesBySessionId.set(t.sessionId, []);
    timesBySessionId.get(t.sessionId).push(t);
  });

  const candidates = [];
  const dropped = [];
  (payload.sessions || []).forEach((session) => {
    if (ENFORCE_PUBLISHED_FILTER && !isSessionPublished(session)) return;
    if (isMissingFormat(session)) dropped.push(session);
    else candidates.push(session);
  });
  // Dropping is intentional, but the session then appears nowhere — so it must be traceable.
  // Count is exact; the enumeration is capped so a mass failure can't flood the log.
  if (dropped.length > 0) {
    const listed = dropped.slice(0, DROP_LOG_LIMIT).map(describeRawSession).join('; ');
    const rest = dropped.length - DROP_LOG_LIMIT;
    window.lana?.log(`[sessions-api] dropped ${dropped.length} session(s) with no Format value: ${listed}${rest > 0 ? `; +${rest} more` : ''}`);
  }

  return candidates
    .map((session) => {
    // Real rows can have no sessionTime yet; time.js is guarded for the '' that follows.
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
    const isOnline = hasFormatValue(formatValues, FORMAT_ONLINE);
    const isLivestreamed = extractCustomAttributeValues(session, 'Livestreamed Content').includes('Live');
    const type = extractCustomAttributeValue(session, ['Type', 'Session Type']);
    const thumbnail = (session.images || []).find((img) => img.imageKind === 'session-card-image');

    return {
      id: session.sessionId,
      // Per-time-slot id, used for scheduling. Favoriting uses rfSessionId.
      rfCode: stripRfPrefix(firstTime?.externalSessionTimeId),
      rfSessionId: stripRfPrefix(session.externalSessionId),
      title: session.localizations?.['en-US']?.title || session.enTitle || '',
      description: session.localizations?.['en-US']?.description || '',
      startTimeUtc: firstTime ? new Date(firstTime.startTimeMillis).toISOString() : '',
      endTimeUtc: firstTime ? new Date(firstTime.endTimeMillis).toISOString() : '',
      duration: session.sessionLengthInMinutes || 0,
      track: extractCustomAttributeValue(session, TRACK_ATTRIBUTE_NAMES),
      contentCategory: extractCustomAttributeValues(session, ['Category', 'Programming Category']),
      // MAX26-only; no MAX25 fallback needed.
      additionalTracks: extractCustomAttributeValues(session, 'Additional Event Site Tracks'),
      trackOverride: extractCustomAttributeValue(session, 'Override Primary Event Site Track'),
      type,
      technicalLevel: extractCustomAttributeValue(session, 'Technical Level'),
      audience: extractCustomAttributeValues(session, 'Audience'),
      industry: extractCustomAttributeValues(session, 'Industry'),
      // Not in the catalog yet; both casings tried since names match exactly.
      aiFocus: extractCustomAttributeValues(session, ['AI Focus', 'AI focus']),
      // closedCaptions is no longer rendered anywhere. ipodOrGdprCopy is authored HTML.
      // See docs/sessions-guide-implementation-notes.md.
      closedCaptions: extractCustomAttributeValue(session, 'Closed Caption Information'),
      ipodOrGdprCopy: extractCustomAttributeValue(session, ['IPOD or GDPR Copy', 'IPOD/GDPR Copy']),
      speakers,
      products: extractCustomAttributeValues(session, 'Product'),
      productAttributeId: getProductAttributeId(session),
      dvrDelayHours: parseDvrDelayHours(extractCustomAttributeValue(session, 'DVR Timing (in hours)')),
      // Three VOD sources, one field each; live is mrStreamId below. Unread, and never
      // substitutes for one another. videoDuration is verbatim (`00:60:00` is not HH:MM:SS).
      // See "Video sources" in docs/sessions-guide-implementation-notes.md.
      mpcId: extractCustomAttributeValue(session, 'MPC ID'),
      youTubeId: extractCustomAttributeValue(session, 'YouTube ID'),
      mrDvrVideoId: extractCustomAttributeValue(session, 'Mobilerider Video ID (DVR)'),
      mrSkinId: extractCustomAttributeValue(session, 'Skin ID'),
      videoDuration: extractCustomAttributeValue(session, 'Video Duration'),
      inPerson: hasFormatValue(formatValues, FORMAT_IN_PERSON),
      isOnline,
      isLivestreamed,
      hasOnDemandFormat: hasOnDemandFormat(formatValues),
      sessionPageUrl: session.url || '',
      isKeynote: type === 'Keynote',
      thumbnailUrl: thumbnail?.imageUrl ?? null,
      legalDisclaimer: extractCustomAttributeValue(session, ['Legal Disclaimer', 'LegalDisclaimer']) || undefined,
      // resources[]/mrStreamId omitted — no source in this payload yet. Mapping the inbound
      // `Mobilerider Live Stream ID` here is what switches stream polling on; see
      // REAL-API-CHECKLIST.md first. normalizeSessions() defaults both to empty/null.
      customAttributeValues: buildCustomAttributeValueMap(session),
    };
  })
    // Applied after the map because the rule reads the derived Format booleans.
    .filter((session) => !isInPersonOnly(session));
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
