import {
  getSessionTrack, extractDistinctTracks, extractDistinctAllTracks,
  getSessionAdditionalTracks, getSessionOverrideText, extractDistinctOverrideTexts,
  getSessionProducts, extractDistinctProducts,
} from '../v1/services/sessions/sessions-api.js';
import { DA_ORIGIN, DA_APP_PATH, HOMEPAGE_LINK_HASH_KEY } from './constants.js';

export {
  getSessionTrack, extractDistinctTracks, extractDistinctAllTracks,
  getSessionAdditionalTracks, getSessionOverrideText, extractDistinctOverrideTexts,
  getSessionProducts, extractDistinctProducts,
};

// Copies text to the clipboard, falling back to a hidden textarea +
// execCommand('copy') when navigator.clipboard isn't available (not
// guaranteed inside the DA iframe).
export async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (error) {
    window.lana?.log(`Error copying to clipboard: ${error}`);
    return false;
  }
}

// Formats in the sessionTime's own venue timezone, not the viewer's local
// one — this is authoring, describing when a session happens at the event.
export function formatSessionTime(sessionTime) {
  if (!sessionTime?.startTimeMillis) return '';
  try {
    return new Date(sessionTime.startTimeMillis).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: sessionTime.timezone || undefined,
      timeZoneName: 'short',
    });
  } catch {
    return '';
  }
}

// Icon-only is fine (color defaults to black) — only color-with-no-icon
// doesn't make sense. Mirrors Schedule Maker's isBlockComplete pattern.
export function isTrackIconEntryComplete(entry) {
  if (!entry) return true;
  return !entry.color || !!entry.icon;
}

// Display title for a row: the author-set config name if set, else the
// author's alternative event title (Global rows only), else the real
// backend/ESP title, else the raw Event ID.
export function getDisplayTitle(row) {
  return row?.config?.configName || row?.config?.eventTitle || row?.backendEventTitle || row?.eventId || '';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// A plain object whose own values are all primitives (e.g. a trackIcons
// entry, { icon, color }) — safe to render on one line rather than expanding.
function isCompactObject(value) {
  return isPlainObject(value) && Object.values(value).every((v) => typeof v !== 'object' || v === null);
}

// JSON.stringify(value) alone gives cramped {"icon":"3d"} with no spaces,
// and any truthy `space` arg forces it multi-line — so build the spacing by hand.
function stringifyCompact(value) {
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  const parts = entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{ ${parts.join(', ')} }`;
}

// Like JSON.stringify(value, null, 2), except a "compact" object (see above)
// renders on one line instead of expanding one property per line — used for
// the Config JSON preview/copy so e.g. trackIcons reads as
// "3D": { "icon": "3d", "color": "#000000" } instead of three lines per track.
export function stringifyConfig(value, indent = '') {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const childIndent = `${indent}  `;
    const items = value.map((item) => `${childIndent}${stringifyConfig(item, childIndent)}`);
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const childIndent = `${indent}  `;
    const lines = entries.map(([key, val]) => {
      const serialized = isCompactObject(val) ? stringifyCompact(val) : stringifyConfig(val, childIndent);
      return `${childIndent}${JSON.stringify(key)}: ${serialized}`;
    });
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

// Mirrors upcoming-sessions/docs/build-author-data.mjs's toAuthorEntry() shape —
// the small per-session object a homepage block (upcoming-sessions.js or
// featured-sessions.js) decodes directly from the authored link's hash payload
// (see buildHomepageConfigURL below), so it's built here rather than looked up at
// render time. Shared by both Homepage config types — they need the identical shape.
// `meta` is an optional { watchUrl, mrStreamId, imageUrl } hand-authored override (see
// MOBILE-RIDER-STREAM-ID-GAP.md) — all three omitted entirely from the entry when
// blank, matching upcoming-sessions.js's own authored-data shape, where an
// absent key (not an empty string) means "not applicable to this session".
export function buildSessionAuthorEntry(session, sessionTimes, meta) {
  const match = (sessionTimes || []).find((st) => st.sessionId === session.sessionId);
  const entry = {
    sessionId: session.sessionId,
    sessionCode: session.sessionCode,
    enTitle: session.enTitle,
    track: getSessionTrack(session) || '',
    url: session.url,
  };
  if (meta?.watchUrl) entry.watchUrl = meta.watchUrl;
  if (meta?.mrStreamId) entry.mrStreamId = meta.mrStreamId;
  if (meta?.imageUrl) entry.imageUrl = meta.imageUrl;
  if (match) {
    entry.sessionTime = {
      startTimeMillis: match.startTimeMillis,
      endTimeMillis: match.endTimeMillis,
      timezone: match.timezone,
    };
  }
  return entry;
}

// Editors authoring events are spread across timezones (and some events run outside LA
// entirely — Miami, London), but most events are LA-based, so the picker shows LA time by
// convention while the value stored/consumed is always a timezone-agnostic UTC epoch.
export const EVENT_AUTHORING_TIMEZONE = 'America/Los_Angeles';

// Offset (minutes) of `timeZone` at the instant `utcDate` represents. Used to correct a
// UTC-epoch guess built from wall-clock parts back to the real UTC instant those parts
// mean in `timeZone` (see zonedDateTimeToEpochMs).
function getTimezoneOffsetMinutes(timeZone, utcDate) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utcDate).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return (asUtc - utcDate.getTime()) / 60000;
}

// Mirrors Schedule Maker's ScheduleURLUtility.createScheduleURL (schedule-maker/utils.js) —
// the full entries payload, base64-encoded, lives entirely in the URL hash rather than a
// server-side sheet, so decorate.js's tec-homepage auto-block builder can decode it straight
// off the authored link and render upcoming-sessions.js / featured-sessions.js with no extra
// lookup. `unescape(encodeURIComponent(...))` keeps btoa from choking on non-Latin1 characters
// (e.g. accented session titles).
export function buildHomepageConfigURL(org, repo, configType, eventId, heading, theme, entries) {
  const payload = {
    eventId, configType, heading, theme, generatedTime: new Date().toISOString(), entries,
  };
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = new URL(`${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`);
  url.hash = `${HOMEPAGE_LINK_HASH_KEY}=${base64}`;
  return url.toString();
}

// Copies a real hyperlink (not just the bare URL string) to the clipboard, so pasting into
// DA's rich-text doc body lands as a clickable link with real link text — the ClipboardItem
// HTML path is what makes that possible; copyTextToClipboard's plain-text fallback can't
// carry an href at all, so it appends the URL after the text instead.
export async function copyLinkToClipboard(url, text) {
  try {
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      const linkElement = document.createElement('a');
      linkElement.href = url;
      linkElement.textContent = text;
      const blob = new Blob([linkElement.outerHTML], { type: 'text/html' });
      await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
      return true;
    }
    return await copyTextToClipboard(`${text} (${url})`);
  } catch (error) {
    window.lana?.log(`Error copying link to clipboard: ${error}`);
    return false;
  }
}

// Builds the shareable Homepage config link for `row` and copies it to the clipboard — the
// single implementation ConfigEditor.js's "Copy Link" button and Library.js's per-row
// "Copy Link" action both call, so a link copied from either place is built identically.
// `sessions`/`sessionTimes` are the row's event's live ESP session catalog (Library.js fetches
// it on demand since it doesn't keep one loaded per row the way ConfigEditor does for the
// single active config).
export async function copyHomepageConfigLink(org, repo, row, homepageMeta, sessions, sessionTimes) {
  const sessionsById = new Map((sessions || []).map((s) => [s.sessionId, s]));
  const metaById = row.config[homepageMeta.metaField] || {};
  const entries = (row.config[homepageMeta.field] || [])
    .filter((id) => sessionsById.has(id))
    .map((id) => buildSessionAuthorEntry(sessionsById.get(id), sessionTimes, metaById[id]));
  const heading = homepageMeta.headingField
    ? (row.config[homepageMeta.headingField] || homepageMeta.label)
    : undefined;
  const theme = homepageMeta.themeField
    ? (row.config[homepageMeta.themeField] || 'light')
    : undefined;
  const url = buildHomepageConfigURL(org, repo, row.configType, row.eventId, heading, theme, entries);
  const formattedDate = new Date().toLocaleString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const linkText = `${homepageMeta.linkPrefix}: ${getDisplayTitle(row)} – ${formattedDate}`;
  return copyLinkToClipboard(url, linkText);
}

// Converts a "YYYY-MM-DDTHH:mm" <input type="datetime-local"> value, interpreted as wall-clock
// time in `timeZone`, to a UTC epoch in milliseconds. Two-pass: the first pass's offset is
// itself computed from a UTC guess, so a DST boundary right at the entered instant could be
// off by the DST delta — acceptable for an authoring tool, not worth a correction loop.
export function zonedDateTimeToEpochMs(localDateTimeStr, timeZone = EVENT_AUTHORING_TIMEZONE) {
  if (!localDateTimeStr) return null;
  const [datePart, timePart] = localDateTimeStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = (timePart || '00:00').split(':').map(Number);
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone, new Date(guessUtcMs));
  return guessUtcMs - offsetMinutes * 60000;
}

// Converts a UTC epoch (ms) to a "YYYY-MM-DDTHH:mm" wall-clock string in `timeZone`, for
// populating an <input type="datetime-local">. 'en-CA' gives YYYY-MM-DD parts directly
// (same trick sessions-guide's getSessionDayKey uses).
export function epochMsToZonedDateTimeLocal(epochMs, timeZone = EVENT_AUTHORING_TIMEZONE) {
  if (epochMs == null || Number.isNaN(epochMs)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(epochMs)).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatUpdatedTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
