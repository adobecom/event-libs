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

// Unlike a.href/img.src, source.srcset (property or attribute) is NEVER resolved to an absolute
// URL by the browser — srcset is a list microsyntax (comma-separated url+descriptor pairs), not
// a single URL, so there's nothing for the browser to resolve automatically. DA authors relative
// paths here ("./image.jpg?width=2000..."), which must be resolved by hand or a relative URL
// leaks straight into safeUrl()'s absolute-URL check downstream and gets silently rejected.
function resolveUrl(url) {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return '';
  }
}

// The first URL token of one srcset candidate (ignores any trailing width/density descriptor,
// e.g. "image.jpg 2x" — our own authored sources never carry one, but this stays correct either
// way) and takes only the first comma-separated candidate (srcset supports a list; every source
// here only ever has one).
function firstSrcsetUrl(srcset) {
  return (srcset || '').trim().split(',')[0]?.trim().split(/\s+/)[0] || '';
}

// A bigger variant for tablet+, read from the row's own authored <picture> (if DA happened to
// embed one alongside the link — the two aren't mutually exclusive; a "linked image" cell keeps
// its <picture> nested inside the <a>). Only ever reads a URL string out of it, never renders
// the <picture> itself back into the page — so unlike the original picture-embedding bug, this
// can't reintroduce the decorateImageLinks() collision: if that already swapped this picture for
// an empty <video> (alt text carrying a `|`-delimited convention), querySelector('picture')
// simply finds nothing here and this degrades to reusing the single default URL everywhere,
// identical to the behavior before this existed.
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
