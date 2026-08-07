import { DA_ORIGIN, DA_APP_PATH } from './constants.js';

// componentName is the primary label, not just a fallback — an event can have
// multiple configs, so its title alone isn't unique per row.
export function getDisplayTitle(row) {
  return row?.componentName || row?.backendEventTitle || row?.eventId || '';
}

// Falls back to a hidden textarea + execCommand('copy') when navigator.clipboard
// isn't available (not guaranteed inside the DA iframe).
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

// Encodes a config blob into a URL pointing at this app. decorate.js's
// prebuildAutoBlock decodes it via the shared parseEncodedConfig() (v1/utils/utils.js)
// at decoration time — there is no manual authoring-table path for this block.
export function createSessionGuideConfigURL(configBlob, org, repo) {
  const jsonString = JSON.stringify(configBlob);
  const base64JsonString = btoa(unescape(encodeURIComponent(jsonString)));
  const url = new URL(`${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`);
  url.searchParams.set('sgConfig', base64JsonString);
  return url.toString();
}

// Copies a rich hyperlink (an <a> element, not just the bare URL string) so pasting
// into DA's rich-text editor drops in a real link with display text. Falls back to a
// plain-text URL copy when the rich-clipboard write API isn't available.
export async function copySessionGuideConfigLink(url, linkText) {
  try {
    if (navigator.clipboard && navigator.clipboard.write) {
      const linkElement = document.createElement('a');
      linkElement.href = url;
      linkElement.textContent = linkText;
      const blob = new Blob([linkElement.outerHTML], { type: 'text/html' });
      // eslint-disable-next-line no-undef
      const data = [new ClipboardItem({ [blob.type]: blob })];
      await navigator.clipboard.write(data);
      return true;
    }
    return await copyTextToClipboard(url);
  } catch (error) {
    window.lana?.log(`Error copying session guide link to clipboard: ${error}`);
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

// Shared by ConfigEditor.js (the open config, saved or not) and Library.js (any saved
// row) — builds the link, copies it, and reports the result via the given toast setters.
export async function copyRowLinkWithToast(row, org, repo, setToastSuccess, setToastError) {
  const url = createSessionGuideConfigURL(row.config, org, repo);
  const formattedDate = formatUpdatedTime(row.updated);
  const linkText = formattedDate
    ? `Session Guide: ${getDisplayTitle(row)} – ${formattedDate}`
    : `Session Guide: ${getDisplayTitle(row)}`;
  const ok = await copySessionGuideConfigLink(url, linkText);
  if (ok) setToastSuccess('Link copied — paste it into the event page where the Session Guide should appear');
  else setToastError('Could not copy the link — please retry');
}
