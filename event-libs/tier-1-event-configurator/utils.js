import {
  getSessionTrack, extractDistinctTracks, getSessionOverrideText, extractDistinctOverrideTexts,
  getSessionProducts, extractDistinctProducts,
} from '../v1/services/sessions/sessions-api.js';

export {
  getSessionTrack, extractDistinctTracks, getSessionOverrideText, extractDistinctOverrideTexts,
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
// the small per-session object a homepage block (upcoming-sessions.js, or
// card-c2's Featured Sessions hydrator) reads directly from its own authored
// section-metadata (not the tier-1-event-config metadata this app otherwise
// writes to), so it's built here rather than looked up at render time. Shared
// by both Homepage config types — they need the identical shape.
// `meta` is an optional { watchUrl, mrStreamId } hand-authored override (see
// MOBILE-RIDER-STREAM-ID-GAP.md) — both omitted entirely from the entry when
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
  if (match) {
    entry.sessionTime = {
      startTimeMillis: match.startTimeMillis,
      endTimeMillis: match.endTimeMillis,
      timezone: match.timezone,
    };
  }
  return entry;
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
