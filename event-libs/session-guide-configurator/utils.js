import { DA_ORIGIN, DA_APP_PATH } from './constants.js';

// Display title for a row: componentName is the deliberate identifying label here
// (not a fallback) — an event can have multiple configs (widget/page variants, test
// copies; see PLAN.md §2/§5), so unlike Tier 1 Event Configurator, the linked event's
// own title alone isn't unique per row.
export function getDisplayTitle(row) {
  return row?.componentName || row?.backendEventTitle || row?.eventId || '';
}

// Copies text to the clipboard, falling back to a hidden textarea +
// execCommand('copy') when navigator.clipboard isn't available (not
// guaranteed inside the DA iframe) — same as Tier 1 Event Configurator's own helper.
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

// Encodes a config blob into a URL pointing at this app, same base64 technique as
// Schedule Maker's ScheduleURLUtility.createScheduleURL (PLAN.md §3a). decorate.js's
// prebuildAutoBlock reverses this via the shared parseEncodedConfig() (v1/utils/
// utils.js) at decoration time — no manual authoring-table path exists for this block.
export function createSessionGuideConfigURL(configBlob, org, repo) {
  const jsonString = JSON.stringify(configBlob);
  const base64JsonString = btoa(unescape(encodeURIComponent(jsonString)));
  const url = new URL(`${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`);
  url.searchParams.set('sgConfig', base64JsonString);
  return url.toString();
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
