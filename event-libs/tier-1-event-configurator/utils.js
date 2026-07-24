// Copies a plain-text payload to the clipboard. Detects navigator.clipboard
// availability first (not guaranteed inside the DA iframe) and falls back to
// a hidden textarea + document.execCommand('copy') when unavailable.
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

// Same custom attribute ESP's real session-catalog payload carries the
// "Primary Digital Agenda Track" under (matches sessions-api.js's
// extractCustomAttributeValue, MWPW-200314 — not yet merged to dev, so
// duplicated here rather than imported; consolidate once it lands).
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

// A session can have more than one sessionTime (e.g. a live slot plus an
// on-demand replay) — callers pass the one they want formatted (typically
// the earliest, for a picker's "when is this" context). Formats in the
// sessionTime's own venue timezone, not the viewer's local one — this is an
// authoring tool describing when a session is scheduled at the event, not a
// viewer-facing display.
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

// An untouched track (no entry at all) is fine — it cleanly falls back to
// the built-in default icon (TrackIconEditor). An icon with no explicit
// color is *also* fine now — color implicitly defaults to black, so that's
// a normal, complete state, not a half-set one. The only state that doesn't
// make sense is a color authored with no icon to apply it to. Mirrors
// Schedule Maker's isBlockComplete pattern: a pure predicate, not validation
// logic baked into the editor component.
export function isTrackIconEntryComplete(entry) {
  if (!entry) return true;
  return !entry.color || !!entry.icon;
}

// The library-list/toast-facing title for a row: the author's own
// alternative title (config.eventTitle) if they've set one, else the real
// backend/ESP title (backendEventTitle), else the raw Event ID as a last
// resort. backendEventTitle is app-stamped (never author-editable);
// config.eventTitle is the opposite — author-set only, never auto-filled.
export function getDisplayTitle(row) {
  return row?.config?.eventTitle || row?.backendEventTitle || row?.eventId || '';
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
