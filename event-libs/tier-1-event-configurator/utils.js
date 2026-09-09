import {
  getSessionPrimaryTrack, extractDistinctPrimaryTracks, extractDistinctAllTracks,
  getSessionAdditionalTracks, getSessionOverrideText, extractDistinctOverrideTexts,
  getSessionProducts, extractDistinctProducts,
  getSessionIsLivestreamed, getSessionIsOnline,
} from '../v1/services/sessions/sessions-api.js';
import { DA_ORIGIN, DA_APP_PATH, HOMEPAGE_LINK_HASH_KEY } from './constants.js';

export {
  getSessionPrimaryTrack, extractDistinctPrimaryTracks, extractDistinctAllTracks,
  getSessionAdditionalTracks, getSessionOverrideText, extractDistinctOverrideTexts,
  getSessionProducts, extractDistinctProducts,
};

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

export function isTrackIconEntryComplete(entry) {
  if (!entry) return true;
  return !entry.color || !!entry.icon;
}

// Authors often copy the full federal asset URL instead of just the slug
// fetchFederalTrackIcon() actually needs (e.g. pasting
// ".../federal/assets/icons/track-icons/max-accelerating-creativity-ai-track-icon.svg"
// instead of typing "max-accelerating-creativity-ai-track-icon"). Recognizes any URL
// whose path ends in /track-icons/<slug>.svg — host-agnostic (prod's www.adobe.com and a
// staging .aem.page/.aem.live preview both work) — and returns just the slug; anything
// else (a plain slug already, or an unrelated/mistyped URL) passes through untouched, so
// a mistake stays visibly wrong rather than silently resolving to the wrong icon.
export function extractTrackIconSlug(value) {
  const trimmed = (value || '').trim();
  const match = trimmed.match(/\/track-icons\/([^/]+)\.svg(?:[?#].*)?$/i);
  return match ? match[1] : trimmed;
}

// Same idea as extractTrackIconSlug above, for the product-logo namespace instead
// (.../federal/assets/svgs/<slug>.svg, see fetchFederalProductIcon) — an author pastes
// the full URL instead of typing e.g. "creative-cloud-64". The distinguishing path is
// "/assets/svgs/" with nothing between "assets" and "svgs" — the generic icon namespace
// (/federal/assets/icons/svgs/) and the track-icon one (/federal/assets/icons/
// track-icons/) both have a segment in between, so neither can collide with this match.
export function extractProductIconSlug(value) {
  const trimmed = (value || '').trim();
  const match = trimmed.match(/\/assets\/svgs\/([^/]+)\.svg(?:[?#].*)?$/i);
  return match ? match[1] : trimmed;
}

// Drops any key from `map` that isn't in `validKeys`, preserving every entry that is.
// Returns the same `map` reference when nothing changed, so callers can cheaply skip a
// state update when there's nothing to prune.
function pruneStaleKeys(map, validKeys) {
  if (!map) return { next: map, removed: [] };
  const validSet = new Set(validKeys);
  const removed = Object.keys(map).filter((key) => !validSet.has(key));
  if (removed.length === 0) return { next: map, removed: [] };
  const next = {};
  Object.keys(map).forEach((key) => {
    if (validSet.has(key)) next[key] = map[key];
  });
  return { next, removed };
}

// Config.trackIcons/overrideTrackIcons.byText/products are grow-only maps (see
// ConfigsContext.js's updateTrackIcon/updateOverrideTrackIcon/updateProduct) — an entry
// authored for a track/override-text/product that later disappears from the event's
// sessions (renamed, removed, session deleted) sticks around in the saved config forever,
// invisible in the editor since those components only ever render the *current* catalog's
// keys. This is the sync: called once per catalog load with the live track/override-text/
// product lists, it drops any authored key that no longer matches anything in the current
// catalog. Deliberately does NOT add entries for new keys — those already show up
// automatically next time the editor renders (TrackIconEditor etc. iterate the live list),
// with no icon authored yet, same as any other never-configured entry.
// Returns the same `config` reference (and `hasChanges: false`) when there's nothing stale,
// so a no-op sync doesn't trigger a state update.
export function syncIconConfigWithCatalog(config, { tracks = [], overrideTexts = [], products = [] } = {}) {
  const trackResult = pruneStaleKeys(config.trackIcons, tracks);
  const overrideResult = pruneStaleKeys(config.overrideTrackIcons?.byText, overrideTexts);
  const productResult = pruneStaleKeys(config.products, products);

  const removed = {
    trackIcons: trackResult.removed,
    overrideTrackIcons: overrideResult.removed,
    products: productResult.removed,
  };
  const hasChanges = removed.trackIcons.length > 0
    || removed.overrideTrackIcons.length > 0
    || removed.products.length > 0;

  if (!hasChanges) return { config, removed, hasChanges };

  return {
    config: {
      ...config,
      trackIcons: trackResult.next,
      overrideTrackIcons: { ...config.overrideTrackIcons, byText: overrideResult.next },
      products: productResult.next,
    },
    removed,
    hasChanges,
  };
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

function isCompactObject(value) {
  return isPlainObject(value) && Object.values(value).every((v) => typeof v !== 'object' || v === null);
}

function stringifyCompact(value) {
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  const parts = entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{ ${parts.join(', ')} }`;
}

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

export function buildSessionAuthorEntry(session, sessionTimes, meta) {
  const match = (sessionTimes || []).find((st) => st.sessionId === session.sessionId);
  const entry = {
    sessionId: session.sessionId,
    sessionCode: session.sessionCode,
    enTitle: session.enTitle,
    track: getSessionPrimaryTrack(session) || '',
    url: session.url,
  };
  if (getSessionIsLivestreamed(session)) entry.isLivestreamed = true;
  if (getSessionIsOnline(session)) entry.isOnline = true;
  if (meta?.mrStreamId) entry.mrStreamId = meta.mrStreamId;
  if (meta?.imageUrl) entry.imageUrl = meta.imageUrl;
  if (meta?.watchDestination) entry.watchDestination = meta.watchDestination;
  if (meta?.watchDestination === 'homepage' && meta?.homepageAnchorId) {
    entry.homepageAnchorId = meta.homepageAnchorId;
  }
  if (match) {
    entry.sessionTime = {
      startTimeMillis: match.startTimeMillis,
      endTimeMillis: match.endTimeMillis,
      timezone: match.timezone,
    };
  }
  return entry;
}

export const EVENT_AUTHORING_TIMEZONE = 'America/Los_Angeles';

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

export function buildHomepageConfigURL(org, repo, configType, eventId, heading, entries, cta) {
  const payload = {
    eventId, configType, heading, generatedTime: new Date().toISOString(), entries,
  };
  if (cta) payload.cta = cta;
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = new URL(`${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`);
  url.hash = `${HOMEPAGE_LINK_HASH_KEY}=${base64}`;
  return url.toString();
}

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
      // empty
    }
  }
  return null;
}

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

export async function copyHomepageConfigLink(org, repo, row, homepageMeta, sessions, sessionTimes) {
  const sessionsById = new Map((sessions || []).map((s) => [s.sessionId, s]));
  const metaById = row.config[homepageMeta.metaField] || {};
  const entries = (row.config[homepageMeta.field] || [])
    .filter((id) => sessionsById.has(id))
    .map((id) => buildSessionAuthorEntry(sessionsById.get(id), sessionTimes, metaById[id]));
  const heading = homepageMeta.headingField
    ? (row.config[homepageMeta.headingField] || homepageMeta.label)
    : undefined;
  let cta;
  if (homepageMeta.ctaFields) {
    cta = {};
    Object.entries(homepageMeta.ctaFields).forEach(([state, field]) => {
      const value = row.config[field];
      if (value) cta[state] = value;
    });
  }
  const url = buildHomepageConfigURL(org, repo, row.configType, row.eventId, heading, entries, cta);
  const formattedDate = new Date().toLocaleString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const linkText = `${homepageMeta.linkPrefix}: ${getDisplayTitle(row)} – ${formattedDate}`;
  return copyLinkToClipboard(url, linkText);
}

export function zonedDateTimeToEpochMs(localDateTimeStr, timeZone = EVENT_AUTHORING_TIMEZONE) {
  if (!localDateTimeStr) return null;
  const [datePart, timePart] = localDateTimeStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = (timePart || '00:00').split(':').map(Number);
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = getTimezoneOffsetMinutes(timeZone, new Date(guessUtcMs));
  return guessUtcMs - offsetMinutes * 60000;
}

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
