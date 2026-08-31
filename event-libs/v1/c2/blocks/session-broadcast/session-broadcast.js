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

// Reads a resolved, absolute URL from either a linked row or an embedded picture. Prefer
// linking the text: an embedded picture can get silently swapped for an empty <video> by
// Milo's decorateImageLinks() if the asset's alt text carries a `|`-delimited convention.
function extractSessionEndedImageUrl(el) {
  const row = [...el.querySelectorAll(':scope > div')]
    .find((r) => r.children[0]?.textContent.trim().toLowerCase() === SESSION_ENDED_IMAGE_LABEL);
  const valueEl = row?.children[1];
  return valueEl?.querySelector('a[href]')?.href || valueEl?.querySelector('img[src]')?.src || '';
}

// Plain block-content rows, not a Configurator-app JSON blob like sessions-guide.
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
