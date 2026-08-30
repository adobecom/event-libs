import { h, render } from '../../../deps/htm-preact.js';
import { readBlockConfig } from '../../../utils/utils.js';
import { BroadcastApp } from './components/BroadcastApp.js';

const CONFIG_KEYS = {
  'also-live-title': 'alsoLiveTitle',
  'upcoming-title': 'upcomingTitle',
  'view-all-details-label': 'viewAllDetailsLabel',
};

const DEFAULTS = {
  alsoLiveTitle: 'Currently Live',
  upcomingTitle: 'Upcoming',
  viewAllDetailsLabel: 'View all details',
  sessionEndedImageUrl: '',
};

const SESSION_ENDED_IMAGE_LABEL = 'session ended image';

// "Session ended image" gets its own extraction instead of readBlockConfig's generic
// raw-innerHTML fallback, because either authoring style needs a *resolved, absolute* URL —
// not the raw (often page-relative) markup a generic string read would give back:
// - Linking the row's text to the image's direct URL (readBlockConfig's own <a> branch
//   already resolves an anchor's .href to an absolute URL) is the most robust way to author
//   this: it's immune by construction to Milo's site-wide decorateImageLinks(), which runs
//   over every <img> on the page before any block's init() and silently swaps a picture for
//   an empty <video> if its alt text carries a `|`-delimited video-background convention —
//   real stored metadata on many asset-library images, regardless of which block's config row
//   they end up in.
// - Embedding a picture directly (the more natural DA authoring flow) still works too, as long
//   as the picked asset's alt text doesn't trigger that collision: reading the live img.src DOM
//   property (not a serialized HTML string) gets an already-browser-resolved absolute URL,
//   which is what safeUrl() in EndedState.js expects.
function extractSessionEndedImageUrl(el) {
  const row = [...el.querySelectorAll(':scope > div')]
    .find((r) => r.children[0]?.textContent.trim().toLowerCase() === SESSION_ENDED_IMAGE_LABEL);
  const valueEl = row?.children[1];
  return valueEl?.querySelector('a[href]')?.href || valueEl?.querySelector('img[src]')?.src || '';
}

// Authored as plain block-content rows (readBlockConfig), not a Configurator-app JSON blob
// like sessions-guide — see the plan's Authoring decision.
export function parseBroadcastConfig(el) {
  const raw = readBlockConfig(el);
  const config = { ...DEFAULTS, sessionEndedImageUrl: extractSessionEndedImageUrl(el) };
  Object.entries(CONFIG_KEYS).forEach(([rowKey, configKey]) => {
    if (raw[rowKey]) config[configKey] = raw[rowKey];
  });
  return config;
}

export default async function init(el) {
  const config = parseBroadcastConfig(el);
  el.innerHTML = '';
  el.classList.add('session-broadcast');
  render(h(BroadcastApp, { config }), el);
}
