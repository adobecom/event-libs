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

export function extractDistinctTracks(sessions) {
  const tracks = new Set();
  (sessions || []).forEach((session) => {
    const attr = (session.customAttributes || []).find((a) => a?.name === TRACK_ATTRIBUTE_NAME);
    const value = attr?.values?.[0]?.label ?? attr?.values?.[0]?.value;
    if (value) tracks.add(value);
  });
  return [...tracks].sort();
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
