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
  sessionEndedImageUrlLarge: '',
};

const SESSION_ENDED_IMAGE_LABEL = 'session ended image';

function getSessionEndedImageValueEl(el) {
  const row = [...el.querySelectorAll(':scope > div')]
    .find((r) => r.children[0]?.textContent.trim().toLowerCase() === SESSION_ENDED_IMAGE_LABEL);
  return row?.children[1];
}

// Reads a resolved, absolute URL from either a linked row or an embedded picture. Prefer
// linking the text: an embedded picture can get silently swapped for an empty <video> by
// Milo's decorateImageLinks() if the asset's alt text carries a `|`-delimited convention.
function extractSessionEndedImageUrl(el) {
  const valueEl = getSessionEndedImageValueEl(el);
  return valueEl?.querySelector('a[href]')?.href || valueEl?.querySelector('img[src]')?.src || '';
}

// Unlike a.href/img.src, srcset is never auto-resolved to an absolute URL by the browser (it's
// a list microsyntax, not a single URL). DA authors relative paths here, so this must resolve
// by hand or the relative URL gets silently rejected by safeUrl()'s absolute-URL check downstream.
function resolveUrl(url) {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return '';
  }
}

// Takes the first comma-separated srcset candidate and strips any trailing width/density
// descriptor (e.g. "image.jpg 2x").
function firstSrcsetUrl(srcset) {
  return (srcset || '').trim().split(',')[0]?.trim().split(/\s+/)[0] || '';
}

// A bigger variant for tablet+, read from the row's own authored <picture> (nested inside the
// <a>, since a "linked image" cell can carry both). Only ever reads a URL string, never
// re-renders the <picture> — if decorateImageLinks() already swapped it for an empty <video>,
// this just degrades to reusing the single default URL everywhere.
function extractLargestPictureUrl(el) {
  const picture = getSessionEndedImageValueEl(el)?.querySelector('picture');
  const sources = [...(picture?.querySelectorAll('source[srcset]') || [])];
  if (!sources.length) return '';
  const best = sources.reduce((acc, source) => {
    const url = firstSrcsetUrl(source.getAttribute('srcset'));
    const width = parseInt(url.match(/[?&]width=(\d+)/)?.[1] || '0', 10);
    return width > acc.width ? { url, width } : acc;
  }, { url: '', width: -1 });
  return best.url ? resolveUrl(best.url) : '';
}

// Plain block-content rows, not a Configurator-app JSON blob like sessions-guide.
export function parseBroadcastConfig(el) {
  const raw = readBlockConfig(el);
  const config = {
    ...DEFAULTS,
    sessionEndedImageUrl: extractSessionEndedImageUrl(el),
    sessionEndedImageUrlLarge: extractLargestPictureUrl(el),
  };
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
