export function getDisplayTitle(row) {
  return row?.backendEventTitle || row?.eventId || row?.configId || '';
}

// Falls back to a hidden textarea + execCommand('copy') when navigator.clipboard isn't
// available (not guaranteed inside the DA iframe). Plain-text only — unlike the other two
// configurator apps' "copy link" outputs, this app's output is a bare configId string,
// not a link, so there's no rich-<a>-element clipboard write to support.
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

export function formatUpdatedTime(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return '';
  }
}
