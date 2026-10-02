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
  sessionEndedImageUrlMobile: '',
  sessionEndedImageUrlTablet: '',
  sessionEndedImageUrlDesktop: '',
  sessionEndedImageUrlDesktopXl: '',
};

const SESSION_ENDED_IMAGE_LABELS = [
  ['sessionEndedImageUrlMobile', 'session ended image mobile', false],
  ['sessionEndedImageUrlTablet', 'session ended image tablet', false],
  ['sessionEndedImageUrlDesktop', 'session ended image desktop', true],
  ['sessionEndedImageUrlDesktopXl', 'session ended image desktop xl', true],
];

const LEGACY_SESSION_ENDED_IMAGE_LABEL = 'session ended image';

function getRowValueEl(el, label) {
  const row = [...el.querySelectorAll(':scope > div')]
    .find((r) => r.children[0]?.textContent.trim().toLowerCase() === label);
  return row?.children[1];
}

// Absolute URL from a linked row or embedded picture. Prefer linking text — an embedded
// picture can get silently swapped for an empty <video> by Milo's decorateImageLinks() if
// alt carries a `|`-delimited convention.
function extractImageUrl(el, label) {
  const valueEl = getRowValueEl(el, label);
  return valueEl?.querySelector('a[href]')?.href || valueEl?.querySelector('img[src]')?.src || '';
}

// Unlike a.href/img.src, srcset is never auto-resolved (it's a list microsyntax, not a URL) —
// DA authors relative paths here, so this resolves by hand or safeUrl()'s absolute-URL check
// silently rejects it downstream.
function resolveUrl(url) {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return '';
  }
}

// First comma-separated candidate, stripped of its width/density descriptor (e.g. "2x").
function firstSrcsetUrl(srcset) {
  return (srcset || '').trim().split(',')[0]?.trim().split(/\s+/)[0] || '';
}

function extractLargestPictureUrl(el, label) {
  const picture = getRowValueEl(el, label)?.querySelector('picture');
  const sources = [...(picture?.querySelectorAll('source[srcset]') || [])];
  if (!sources.length) return '';
  const best = sources.reduce((acc, source) => {
    const url = firstSrcsetUrl(source.getAttribute('srcset'));
    const width = parseInt(url.match(/[?&]width=(\d+)/)?.[1] || '0', 10);
    return width > acc.width ? { url, width } : acc;
  }, { url: '', width: -1 });
  return best.url ? resolveUrl(best.url) : '';
}

function extractRowImageUrl(el, label, preferLargest) {
  if (preferLargest) {
    const largest = extractLargestPictureUrl(el, label);
    if (largest) return largest;
  }
  return extractImageUrl(el, label);
}

function fillNearestAvailable(values) {
  return values.map((value, i) => {
    if (value) return value;
    for (let d = 1; d < values.length; d += 1) {
      if (values[i - d]) return values[i - d];
      if (values[i + d]) return values[i + d];
    }
    return '';
  });
}

function stripOptimizationParams(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url, document.baseURI);
    parsed.search = '';
    return parsed.href;
  } catch {
    return url;
  }
}

function applyOptimizationPolicy(urls, mobileKey) {
  return Object.fromEntries(Object.entries(urls).map(
    ([key, url]) => [key, key === mobileKey ? url : stripOptimizationParams(url)],
  ));
}

function extractSessionEndedImageUrls(el) {
  const raw = SESSION_ENDED_IMAGE_LABELS.map(
    ([, label, preferLargest]) => extractRowImageUrl(el, label, preferLargest),
  );
  const filled = fillNearestAvailable(raw);
  const keys = SESSION_ENDED_IMAGE_LABELS.map(([key]) => key);
  const [mobileKey] = keys;

  if (filled.every((url) => !url)) {
    const legacySmall = extractImageUrl(el, LEGACY_SESSION_ENDED_IMAGE_LABEL);
    const legacyLarge = extractLargestPictureUrl(el, LEGACY_SESSION_ENDED_IMAGE_LABEL);
    return applyOptimizationPolicy({
      [keys[0]]: legacySmall || legacyLarge,
      [keys[1]]: legacyLarge || legacySmall,
      [keys[2]]: legacyLarge || legacySmall,
      [keys[3]]: legacyLarge || legacySmall,
    }, mobileKey);
  }

  return applyOptimizationPolicy(Object.fromEntries(keys.map((key, i) => [key, filled[i]])), mobileKey);
}

// Plain block-content rows, not a Configurator-app JSON blob like sessions-guide.
export function parseBroadcastConfig(el) {
  const raw = readBlockConfig(el);
  const config = {
    ...DEFAULTS,
    ...extractSessionEndedImageUrls(el),
  };
  Object.entries(CONFIG_KEYS).forEach(([rowKey, configKey]) => {
    if (raw[rowKey]) config[configKey] = raw[rowKey];
  });
  return config;
}

// Keeps --sb-fill-height (read by .sb-app's min-height in session-broadcast.css) equal to the
// gap between el and the global footer's top edge, so a short state never leaves a stretch of
// the page's default background between the block and the footer. Recomputed on resize and
// whenever the footer's own size changes — it mounts empty and hydrates asynchronously.
export function observeFillHeight(el) {
  const footer = document.querySelector('body > footer');
  const recompute = () => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    const footerHeight = footer?.offsetHeight || 0;
    const fillHeight = Math.max(0, window.innerHeight - top - footerHeight);
    el.style.setProperty('--sb-fill-height', `${fillHeight}px`);
  };
  recompute();
  window.addEventListener('resize', recompute);
  if (footer) new ResizeObserver(recompute).observe(footer);
}

export default async function init(el) {
  const config = parseBroadcastConfig(el);
  el.innerHTML = '';
  el.classList.add('session-broadcast');
  render(h(BroadcastApp, { config }), el);
  observeFillHeight(el);
}
