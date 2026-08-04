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

// Matches sessions-api.js's extractCustomAttributeValue (MWPW-200314, not
// yet merged) — duplicated here rather than imported; consolidate once it lands.
const TRACK_ATTRIBUTE_NAME = 'Primary Track for Agenda (Digital Agenda)';

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

// Display title for a row: the author's alternative title if set, else the
// real backend/ESP title, else the raw Event ID.
export function getDisplayTitle(row) {
  return row?.config?.eventTitle || row?.backendEventTitle || row?.eventId || '';
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
