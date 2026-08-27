import { parseEncodedConfig } from '../v1/utils/utils.js';
import { DA_ORIGIN, DA_APP_PATH, CONFIG_LINK_HASH_KEY } from './constants.js';

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

// Carried in the link alongside the config blob so clicking it can rebuild an editable row.
// The block side ignores them — parse-config.js picks only the keys it knows.
const ROW_FIELDS = ['configId', 'componentName', 'backendEventTitle', 'eventServiceEnv'];

// Encodes a library row into a URL that works both ways: decorate.js's prebuildAutoBlock
// builds the block from it when pasted into an event page, and clicking it re-opens the
// config here (readConfigLinkPayload).
export function createSessionGuideConfigURL(row, org, repo) {
  const payload = { ...row.config };
  ROW_FIELDS.forEach((field) => {
    if (row[field]) payload[field] = row[field];
  });
  const base64JsonString = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = new URL(`${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`);
  url.hash = `${CONFIG_LINK_HASH_KEY}=${base64JsonString}`;
  return url.toString();
}

// Decodes a copied link's payload out of the URL, or null. Reads the hash first, then the
// search, so links copied before the payload moved to the hash still re-open — DA's shell
// forwards both into the iframe. Same decoder and 20-char floor as decorate.js, so a link
// that renders a block is exactly a link that re-opens here.
export function readConfigLinkPayload(hash = window.location.hash, search = window.location.search) {
  const hashMatch = (hash || '').match(new RegExp(`[#&]${CONFIG_LINK_HASH_KEY}=([A-Za-z0-9+/=%-]{20,})`));
  const encoded = hashMatch?.[1] || new URLSearchParams(search || '').get(CONFIG_LINK_HASH_KEY);
  if (!encoded || encoded.length < 20) return null;
  const parsed = parseEncodedConfig(encoded);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

// Drops a consumed payload from this iframe's URL, from either place it can arrive. Keeps
// every other param — `ref` in particular, which picks the branch the app is loaded from.
export function clearConfigLinkFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(CONFIG_LINK_HASH_KEY);
  url.hash = '';
  history.replaceState(null, '', `${url.pathname}${url.search}`);
}

// Rebuilds an editable row for a config missing from this repo's library (link from another
// repo, or the row was deleted). Keeps the configId so saving doesn't fork a new row.
export function rowFromConfigLinkPayload(payload) {
  const config = { ...payload };
  ROW_FIELDS.forEach((field) => delete config[field]);
  return {
    configId: payload.configId || crypto.randomUUID(),
    componentName: payload.componentName || '',
    eventId: payload.eventId || '',
    backendEventTitle: payload.backendEventTitle || payload.eventId || '',
    eventServiceEnv: payload.eventServiceEnv || 'prod',
    config,
  };
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

// Formats in the sessionTime's own venue timezone, not the viewer's local one — this is
// authoring, describing when a session happens at the event. Used by
// RecommendedSessionsEditor.js.
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
  const url = createSessionGuideConfigURL(row, org, repo);
  const formattedDate = formatUpdatedTime(row.updated);
  const linkText = formattedDate
    ? `Session Guide: ${getDisplayTitle(row)} – ${formattedDate}`
    : `Session Guide: ${getDisplayTitle(row)}`;
  const ok = await copySessionGuideConfigLink(url, linkText);
  if (ok) setToastSuccess('Link copied — paste it into the event page where the Session Guide should appear');
  else setToastError('Could not copy the link — please retry');
}
