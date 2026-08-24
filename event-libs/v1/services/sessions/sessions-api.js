import { constructRequestOptions } from '../../utils/esp-controller.js';
import { getEventServiceEnv, getEventConfig } from '../../utils/utils.js';
import { ENV_MAP, ADOBE_PROD_HOST, ADOBE_STAGE_HOST } from '../../utils/constances.js';

// The session catalog returns each session's real page URL, but always on prod's host. Point
// it at stage for any non-prod page, so a stage/local visitor isn't sent to production.
// Keyed on Milo's page env rather than the ESP tier — same distinction, and same reason, as
// session-store.js's defaultRfApiUrlForEnv(). Anything not an absolute prod-host URL (a
// root-relative path, hand-authored data) is left exactly as it came in.
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
    contentCategory: coerceArray(s.contentCategory),
    audience: coerceArray(s.audience),
    industry: coerceArray(s.industry),
    // Not in the catalog yet — see the mapper. Empty until the attribute is authored, which
    // hides its row in the detail view rather than showing a blank one.
    aiFocus: coerceArray(s.aiFocus),
    // ipodOrGdprCopy sits under the session title in the detail view, hidden when empty.
    // closedCaptions is carried but no longer rendered anywhere — see the mapper.
    closedCaptions: s.closedCaptions || '',
    ipodOrGdprCopy: s.ipodOrGdprCopy || '',
    // Additional Event Site Tracks / Override Primary Event Site Track: MAX26-only
    // fields, absent from MAX25 sessions — naturally empty/'' for those, which is exactly
    // the single-track fallback behavior we want for them.
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
    // See hasOnDemandFormat() — the Session Guide keeps these out of Live & Upcoming.
    hasOnDemandFormat: Boolean(s.hasOnDemandFormat),
    // null (not 0) when unauthored — 0 would mean "available the moment the event starts".
    dvrDelayHours: s.dvrDelayHours ?? null,
    // Unread; for the DVR playback work.
    dvrVideoId: s.dvrVideoId || '',
    mrSkinId: s.mrSkinId || '',
    videoDuration: s.videoDuration || '',
    sessionPageUrl: sessionPageUrlForEnv(s.sessionPageUrl),
    isKeynote: Boolean(s.isKeynote),
    thumbnailUrl: s.thumbnailUrl ?? null,
    customAttributeValues: s.customAttributeValues || {},
    ...(s.legalDisclaimer ? { legalDisclaimer: s.legalDisclaimer } : {}),
  }));
}

// ESP renamed this (and a few other) custom attributes for MAX26 — try the current name
// first, fall back to the MAX25 name so events authored under either schema still
// resolve. Exported so tier-1-event-configurator/utils.js (which needs the same
// attribute for its own track editor) doesn't carry a second, independently-drifting copy.
export const TRACK_ATTRIBUTE_NAMES = ['Primary Event Site Track', 'Primary Track for Agenda (Digital Agenda)'];

// Folded (case, spaces and punctuation stripped) because the catalog is inconsistent: prod
// labels the value `In-Person`, stage `In person`, and a value with no localized label falls
// back to its slug (`on-demand-post-event`). Exact comparison breaks on any of those.
const NON_ALPHANUMERIC = /[^a-z0-9]/g;
const foldFormatValue = (value) => String(value ?? '').toLowerCase().replace(NON_ALPHANUMERIC, '');

const FORMAT_ONLINE = foldFormatValue('Online');
const FORMAT_IN_PERSON = foldFormatValue('In person');
const FORMAT_ON_DEMAND_POST_EVENT = foldFormatValue('On demand, post event');

function hasFormatValue(formatValues, foldedMarker) {
  return (formatValues || []).some((value) => foldFormatValue(value) === foldedMarker);
}

// Unconditional: carrying this value at all keeps a session out of Live, Upcoming, Previously
// aired and Recommended, whatever else its Format or `Livestreamed Content` says.
export function hasOnDemandFormat(formatValues) {
  return hasFormatValue(formatValues, FORMAT_ON_DEMAND_POST_EVENT);
}

// Hours after the event starts that a recording becomes playable — see isDvrPending(). Free
// text, so blank/whitespace/non-numeric all mean "no delay" (null), not 0.
export function parseDvrDelayHours(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) return null;
  const hours = Number(trimmed);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

// Generic session/track helpers, not Tier-1-specific — shared here so
// tier-1-event-configurator and session-guide-configurator use the same implementation
// instead of one importing from the other's UI code.
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

// Additional Event Site Tracks is a multi-select drawing from the same vocabulary as the
// primary track, and the runtime treats its values as real tracks: resolveTrackBadge() gives
// them their own swimlanes and LiveCard badges the first one. Mirrors getSessionProducts()
// rather than getSessionTrack(), which only ever takes the first value.
export function getSessionAdditionalTracks(session) {
  const attr = (session?.customAttributes || []).find((a) => a?.name === ADDITIONAL_TRACK_ATTRIBUTE_NAME);
  return (attr?.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
}

// Every distinct track in the catalog, primary and additional together — what a per-track
// icon/color mapping needs to cover, since either kind can end up on a badge.
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

// Override Primary Event Site Track is free text, not a select — each distinct value an
// author has typed becomes its own swimlane, so the configurator needs to know the full
// set of distinct texts in use to offer a per-value icon mapping (mirrors getSessionTrack).
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

// Product is multi-select (a session can tag several products), unlike track/override —
// so this returns every value on the session, not just the first.
export function getSessionProducts(session) {
  const attr = (session?.customAttributes || []).find((a) => a?.name === PRODUCT_ATTRIBUTE_NAME);
  return (attr?.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
}

// Also its key in customAttributeValues, so it identifies the product filter category —
// FilterPanel.js badges product icons there only. `Illustrator` is an Audience value too.
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
//
// `name` may be a single string or an array of candidate names, tried in order — used for
// attributes ESP renamed between MAX25 and MAX26 (a given session only ever carries one of
// the two, so "first found" is unambiguous in practice).
function extractCustomAttributeValues(session, name) {
  const candidates = Array.isArray(name) ? name : [name];
  const attr = (session.customAttributes || []).find((a) => candidates.includes(a?.name));
  return (attr?.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
}

function extractCustomAttributeValue(session, name) {
  return extractCustomAttributeValues(session, name)[0] || '';
}

// Generic attributeId-keyed map of every filterable customAttribute on a session, built
// straight from the raw payload rather than a hand-named whitelist — so any attribute the
// Session Guide Configurator's FiltersEditor.js offers (via deriveFacetableAttributes())
// resolves here automatically, with no per-field mapping needed as new ones get authored.
// Same single-select/multi-select + enabled guard deriveFacetableAttributes() applies, so
// this only ever contains attributes that could actually be authored as a filter category.
function buildCustomAttributeValueMap(session) {
  const map = {};
  (session.customAttributes || []).forEach((attr) => {
    if (attr.enabled === false) return;
    if (!['single-select', 'multi-select'].includes(attr.inputType)) return;
    map[attr.attributeId] = (attr.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
  });
  return map;
}

// `published: false` marks a draft/test row that must never reach real visitors once
// ENFORCE_PUBLISHED_FILTER is on. Missing the field is treated as visible (fail open).
export function isSessionPublished(session) {
  return session.published !== false;
}

/**
 * No digital way to watch at all, so the guide drops it from the catalog rather than filtering
 * per view — one rule for every view, day tab and deep link.
 *
 * One term per Format value: `Livestreamed Content` takes no part (it only routes a live Watch
 * now — see getWatchDestination()), and no derived "is there video" flag sits in between.
 */
export function isInPersonOnly(session) {
  return session.inPerson && !session.isOnline && !session.hasOnDemandFormat;
}

// No Format says nothing about how a session can be watched, so there is no view to place it
// in and it is dropped outright. Takes a raw ESL session — it reads customAttributes.
export function isMissingFormat(session) {
  return extractCustomAttributeValues(session, 'Format').length === 0;
}

const DROP_LOG_LIMIT = 10;

// Identifies a raw catalog row in a log. sessionCode is what an author can search RainFocus
// by, the title is what they recognise it as, and the id is what the API keys on — the id
// alone is not enough to go and fix the row.
function describeRawSession(session) {
  const code = session.sessionCode || '(no code)';
  const title = session.localizations?.['en-US']?.title || session.enTitle || '(untitled)';
  return `${code} "${title}" [${session.sessionId}]`;
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

  const candidates = [];
  const dropped = [];
  (payload.sessions || []).forEach((session) => {
    if (ENFORCE_PUBLISHED_FILTER && !isSessionPublished(session)) return;
    if (isMissingFormat(session)) dropped.push(session);
    else candidates.push(session);
  });
  // An empty Format is a mis-authored row and dropping it is intentional, but the session
  // then appears in no view at all, so the removal has to be traceable. The count is always
  // exact; the enumeration is capped so a wholesale authoring failure can't emit an
  // unbounded log line.
  if (dropped.length > 0) {
    const listed = dropped.slice(0, DROP_LOG_LIMIT).map(describeRawSession).join('; ');
    const rest = dropped.length - DROP_LOG_LIMIT;
    window.lana?.log(`[sessions-api] dropped ${dropped.length} session(s) with no Format value: ${listed}${rest > 0 ? `; +${rest} more` : ''}`);
  }

  return candidates
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
    const isOnline = hasFormatValue(formatValues, FORMAT_ONLINE);
    const isLivestreamed = extractCustomAttributeValues(session, 'Livestreamed Content').includes('Live');
    const type = extractCustomAttributeValue(session, ['Type', 'Session Type']);
    const thumbnail = (session.images || []).find((img) => img.imageKind === 'session-card-image');

    return {
      id: session.sessionId,
      // Schedule (addSession/removeSession) keys on the per-time-slot id; favoriting
      // (toggleSessionInterest) keys on the session-level id instead — two distinct RF ids.
      rfCode: stripRfPrefix(firstTime?.externalSessionTimeId),
      rfSessionId: stripRfPrefix(session.externalSessionId),
      title: session.localizations?.['en-US']?.title || session.enTitle || '',
      description: session.localizations?.['en-US']?.description || '',
      startTimeUtc: firstTime ? new Date(firstTime.startTimeMillis).toISOString() : '',
      endTimeUtc: firstTime ? new Date(firstTime.endTimeMillis).toISOString() : '',
      duration: session.sessionLengthInMinutes || 0,
      track: extractCustomAttributeValue(session, TRACK_ATTRIBUTE_NAMES),
      contentCategory: extractCustomAttributeValues(session, ['Category', 'Programming Category']),
      // MAX26-only — see normalizeSessions() for why no MAX25 fallback is needed here.
      additionalTracks: extractCustomAttributeValues(session, 'Additional Event Site Tracks'),
      trackOverride: extractCustomAttributeValue(session, 'Override Primary Event Site Track'),
      type,
      technicalLevel: extractCustomAttributeValue(session, 'Technical Level'),
      audience: extractCustomAttributeValues(session, 'Audience'),
      industry: extractCustomAttributeValues(session, 'Industry'),
      // Not in the catalog yet — the attribute is coming, so the read is wired up ahead of it
      // and yields [] until then. Both casings are tried: attribute names are matched exactly
      // and every other one in the payload is Title Case (`Technical Level`, `Category`), but
      // the name reached us as "AI focus". Multi-value read so a single-select still works.
      aiFocus: extractCustomAttributeValues(session, ['AI Focus', 'AI focus']),
      // Both authored as free text. closedCaptions is mapped but no longer rendered — the
      // detail view's captions row was removed — and carries the whole sentence ("Closed
      // captions available in …"), not just a language list, so it is ready if the copy
      // reappears elsewhere. Two name spellings are tried for the IPOD/GDPR notice because
      // the audited payload and the Figma annotation disagree on the slash.
      closedCaptions: extractCustomAttributeValue(session, 'Closed Caption Information'),
      ipodOrGdprCopy: extractCustomAttributeValue(session, ['IPOD or GDPR Copy', 'IPOD/GDPR Copy']),
      speakers,
      products: extractCustomAttributeValues(session, 'Product'),
      productAttributeId: getProductAttributeId(session),
      dvrDelayHours: parseDvrDelayHours(extractCustomAttributeValue(session, 'DVR Timing (in hours)')),
      // Unread, mapped ahead of the playback work. Three different video sources are in play
      // and none of them is the live stream (see mrStreamId below):
      //   `Mobilerider Video ID (DVR)` — the Mobile Rider recording of a stream that just
      //      ended, i.e. what some sessions become watchable from once the live window closes.
      //   `MPC ID` — a VOD asset on Adobe Video TV. Deliberately unmapped: it is a separate
      //      player from Mobile Rider, and nothing reads it until the playback work lands.
      //   `Skin ID` — the Mobile Rider player skin/theme.
      // videoDuration stays verbatim: the catalog writes 60 minutes as `00:60:00`, so it is
      // not reliably HH:MM:SS.
      dvrVideoId: extractCustomAttributeValue(session, 'Mobilerider Video ID (DVR)'),
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
      // resources[]/mrStreamId intentionally omitted — no source in this payload yet.
      // resources[] is still in development backend-side. mrStreamId is the Mobile Rider
      // *live* id the poller keys on, and the catalog simply has no attribute carrying it:
      // `MPC ID` is Adobe Video TV VOD and `Mobilerider Video ID (DVR)` is the post-stream
      // recording, so neither substitutes for it. A new custom attribute is expected,
      // tentatively named `Mobilerider Live Stream ID` — map it here once the name is
      // confirmed, which is also what switches stream polling on.
      // normalizeSessions() defaults both to empty/null.
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
