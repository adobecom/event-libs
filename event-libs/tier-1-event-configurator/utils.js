import {
  getSessionTrack, extractDistinctTracks, getSessionOverrideText, extractDistinctOverrideTexts,
  getSessionProducts, extractDistinctProducts,
} from '../v1/services/sessions/sessions-api.js';
import { MEDIA_FOLDER_PATH, DA_ORIGIN, DA_APP_PATH, HOMEPAGE_LINK_HASH_KEY } from './constants.js';

export {
  getSessionTrack, extractDistinctTracks, getSessionOverrideText, extractDistinctOverrideTexts,
  getSessionProducts, extractDistinctProducts,
};

// Builds the full, already-safe upload path for a session image — namespaced by event and
// timestamped so concurrent uploads (same or different sessions/events, even the same original
// filename) never collide. Authors never see or choose this path (see MEDIA_FOLDER_PATH).
// Lowercased: DA itself lowercases at least the filename segment on write, so matching that
// up front keeps this path predictable — though uploadMedia/uploadAndPublishMedia treat DA's
// own returned canonical path as the source of truth regardless, in case that normalization
// ever changes or extends further.
export function buildMediaAssetPath(eventId, fileName) {
  const safeName = (fileName || 'image').replace(/[^A-Za-z0-9._-]/g, '-').toLowerCase();
  const safeEventId = (eventId || 'unknown-event').replace(/[^A-Za-z0-9._-]/g, '-').toLowerCase();
  return `${MEDIA_FOLDER_PATH}/${safeEventId}/${Date.now()}-${safeName}`;
}

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

// Mirrors Schedule Maker's ScheduleURLUtility.createScheduleURL (schedule-maker/utils.js) —
// the full entries payload, base64-encoded, lives entirely in the URL hash rather than a
// server-side sheet, so decorate.js's tec-homepage auto-block builder can decode it straight
// off the authored link and render upcoming-sessions.js / featured-sessions.js with no extra
// lookup. `unescape(encodeURIComponent(...))` keeps btoa from choking on non-Latin1 characters
// (e.g. accented session titles).
export function buildHomepageConfigURL(org, repo, configType, eventId, heading, entries) {
  const payload = {
    eventId, configType, heading, generatedTime: new Date().toISOString(), entries,
  };
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = new URL(`${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`);
  url.hash = `${HOMEPAGE_LINK_HASH_KEY}=${base64}`;
  return url.toString();
}

// Reverse of buildHomepageConfigURL. Tries a few decode variants (mirroring Schedule Maker's
// decodeScheduleParam) so a link that's been through an extra layer of URL-encoding (e.g.
// pasted somewhere that percent-encodes hash fragments) still decodes.
export function decodeHomepageConfigParam(raw) {
  const attempts = [
    () => atob(decodeURIComponent(raw)),
    () => atob(decodeURIComponent(decodeURIComponent(raw))),
    () => atob(raw),
  ];
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const obj = JSON.parse(attempts[i]());
      if (obj && obj.eventId && obj.configType) return obj;
    } catch {
      // try next decode variant
    }
  }
  return null;
}

// Copies a link to the clipboard as a real HTML hyperlink (mirroring Schedule Maker's
// copyScheduleToClipboard) — a ClipboardItem carrying the anchor's outerHTML, so pasting into
// a rich-text field (DA's doc editor) yields an actual `<a>`, not the raw URL string. Falls
// back to copyTextToClipboard's plain-text path (`text (url)`) when the rich Clipboard API
// isn't available.
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
