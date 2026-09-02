import { constructRequestOptions } from '../../utils/esp-controller.js';
import { getEventServiceEnv, getEventConfig } from '../../utils/utils.js';
import { ENV_MAP, ADOBE_PROD_HOST } from '../../utils/constances.js';

// Catalog URLs always carry prod's host; on any non-prod page (stage, local, a Helix
// preview branch), point them at the current page's own origin instead, so a click on a
// session card lands back on the same domain/branch the visitor is already on rather than
// production or a hardcoded stage host. See docs/sessions-guide-implementation-notes.md.
export function sessionPageUrlForEnv(
  url,
  isProd = getEventConfig()?.miloConfig?.env?.name === 'prod',
  currentOrigin = window.location.origin,
) {
  if (!url || isProd) return url || '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== ADOBE_PROD_HOST) return url;
    return `${currentOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
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
    primaryTrack: s.primaryTrack || '',
    // The `Track` topic-tag attribute — distinct from `primaryTrack` (Primary Event Site
    // Track) and `additionalTracks`. Only consumed by the detail overlay's "Track" attr row.
    tracks: coerceArray(s.tracks),
    type: s.type || '',
    technicalLevel: s.technicalLevel || '',
    contentCategory: coerceArray(s.contentCategory),
    audience: coerceArray(s.audience),
    industry: coerceArray(s.industry),
    aiFocus: coerceArray(s.aiFocus),
    closedCaptions: s.closedCaptions || '',
    ipodOrGdprCopy: s.ipodOrGdprCopy || '',
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
    hasOnDemandFormat: Boolean(s.hasOnDemandFormat),
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
export const PRIMARY_TRACK_ATTRIBUTE_NAMES = ['Primary Event Site Track', 'Primary Track for Agenda (Digital Agenda)'];

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
export function getSessionPrimaryTrack(session) {
  const attr = (session?.customAttributes || []).find((a) => PRIMARY_TRACK_ATTRIBUTE_NAMES.includes(a?.name));
  return attr?.values?.[0]?.label ?? attr?.values?.[0]?.value ?? null;
}

export function extractDistinctPrimaryTracks(sessions) {
  const tracks = new Set();
  (sessions || []).forEach((session) => {
    const value = getSessionPrimaryTrack(session);
    if (value) tracks.add(value);
  });
  return [...tracks].sort();
}

export function getSessionIsLivestreamed(session) {
  return extractCustomAttributeValues(session, 'Livestreamed Content').includes('Live');
}

export function getSessionIsOnline(session) {
  return hasFormatValue(extractCustomAttributeValues(session, 'Format'), FORMAT_ONLINE);
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
    const primary = getSessionPrimaryTrack(session);
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

// Mirrors ESP's own /session-facets filtering, without the extra round-trip.
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
    if (!['single-select', 'multi-select'].includes(attr.inputType)) return;
    map[attr.attributeId] = (attr.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
  });
  return map;
}

// Missing field is treated as visible (fail open).
export function isSessionPublished(session) {
  return session.published !== false;
}

// Format is multi-select; only two combinations give a session a real, unambiguous way to
// be watched: Online (with or without In person), or In person + On demand, post event (a
// recording that lands after the fact). Every other combination is mis-authored and the
// session is dropped from the catalog rather than per view. Confirmed table in
// docs/sessions-guide-implementation-notes.md. Returns the drop reason, or null if valid.
export function invalidFormatReason({ inPerson, isOnline, hasOnDemandFormat }) {
  if (isOnline && hasOnDemandFormat) return 'online and on-demand, post event together';
  if (hasOnDemandFormat && !inPerson) return 'on-demand, post event without in-person';
  if (!isOnline && !hasOnDemandFormat) return inPerson ? 'in-person only' : 'no digital way to watch';
  return null;
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

// Dropping is intentional, but the session then appears in no view at all, so it has to be
// traceable. lana carries the count everywhere; below prod each row is also consoled with its
// reason, which is what an author needs to go and fix it. Count is exact, enumeration capped.
export function reportDroppedSessions(
  dropped,
  isProd = getEventConfig()?.miloConfig?.env?.name === 'prod',
) {
  if (dropped.length === 0) return;
  const listed = dropped.slice(0, DROP_LOG_LIMIT)
    .map(([session, reason]) => `${describeRawSession(session)} — ${reason}`)
    .join('; ');
  const rest = dropped.length - DROP_LOG_LIMIT;
  window.lana?.log(`[sessions-api] dropped ${dropped.length} session(s): ${listed}${rest > 0 ? `; +${rest} more` : ''}`);

  if (isProd) return;
  // eslint-disable-next-line no-console
  console.warn(`[sessions-api] ${dropped.length} session(s) hidden from every view:`, dropped.map(
    ([session, reason]) => ({
      reason,
      sessionCode: session.sessionCode || '',
      title: session.localizations?.['en-US']?.title || session.enTitle || '',
      sessionId: session.sessionId,
    }),
  ));
}

// Joins the catalog's flat relational arrays into the shape normalizeSessions() expects.
export function mapEslPayloadToRawSessions(payload) {
  const speakersById = new Map((payload.speakers || []).map((sp) => [sp.speakerId, sp]));
  const timesBySessionId = new Map();
  (payload.sessionTimes || []).forEach((t) => {
    if (!timesBySessionId.has(t.sessionId)) timesBySessionId.set(t.sessionId, []);
    timesBySessionId.get(t.sessionId).push(t);
  });

  // Every drop reason lives here, together, so there's one place to see every way a
  // session can be hidden from the catalog. Both checks derive from the same raw Format
  // customAttribute — isMissingFormat reads it directly; invalidFormatReason needs it
  // folded into booleans first, computed once here and threaded through to the map below
  // instead of recomputed there.
  const candidates = [];
  const dropped = [];
  (payload.sessions || []).forEach((session) => {
    if (ENFORCE_PUBLISHED_FILTER && !isSessionPublished(session)) return;
    if (isMissingFormat(session)) {
      dropped.push([session, 'no Format value']);
      return;
    }
    const formatValues = extractCustomAttributeValues(session, 'Format');
    const formatFlags = {
      inPerson: hasFormatValue(formatValues, FORMAT_IN_PERSON),
      isOnline: hasFormatValue(formatValues, FORMAT_ONLINE),
      hasOnDemandFormat: hasOnDemandFormat(formatValues),
    };
    const reason = invalidFormatReason(formatFlags);
    if (reason) {
      dropped.push([session, reason]);
      return;
    }
    candidates.push({ session, formatFlags });
  });

  const mapped = candidates.map(({ session, formatFlags }) => {
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

    const isLivestreamed = getSessionIsLivestreamed(session);
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
      primaryTrack: extractCustomAttributeValue(session, PRIMARY_TRACK_ATTRIBUTE_NAMES),
      trackOverride: extractCustomAttributeValue(session, 'Override Primary Event Site Track'),
      additionalTracks: extractCustomAttributeValues(session, 'Additional Event Site Tracks'),
      tracks: extractCustomAttributeValues(session, 'Track'),
      contentCategory: extractCustomAttributeValues(session, ['Category', 'Programming Category']),
      type,
      technicalLevel: extractCustomAttributeValue(session, 'Technical Level'),
      audience: extractCustomAttributeValues(session, 'Audience'),
      industry: extractCustomAttributeValues(session, 'Industry'),
      // Not in the catalog yet; both casings tried since names match exactly.
      aiFocus: extractCustomAttributeValues(session, ['AI Focus', 'AI focus']),
      closedCaptions: extractCustomAttributeValue(session, 'Closed Caption Information'),
      ipodOrGdprCopy: extractCustomAttributeValue(session, ['IPOD or GDPR Copy', 'IPOD/GDPR Copy']),
      speakers,
      products: extractCustomAttributeValues(session, 'Product'),
      productAttributeId: getProductAttributeId(session),
      dvrDelayHours: parseDvrDelayHours(extractCustomAttributeValue(session, 'DVR Timing (in hours)')),
      mpcId: extractCustomAttributeValue(session, 'MPC ID'),
      youTubeId: extractCustomAttributeValue(session, 'YouTube ID'),
      mrDvrVideoId: extractCustomAttributeValue(session, 'Mobilerider Video ID (DVR)'),
      mrSkinId: extractCustomAttributeValue(session, 'Skin ID'),
      videoDuration: extractCustomAttributeValue(session, 'Video Duration'),
      ...formatFlags,
      isLivestreamed,
      sessionPageUrl: session.url || '',
      isKeynote: type === 'Keynote',
      thumbnailUrl: thumbnail?.imageUrl ?? null,
      legalDisclaimer: extractCustomAttributeValue(session, ['Legal Disclaimer', 'LegalDisclaimer']) || undefined,
      customAttributeValues: buildCustomAttributeValueMap(session),
    };
  });

  reportDroppedSessions(dropped);
  return mapped;
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
