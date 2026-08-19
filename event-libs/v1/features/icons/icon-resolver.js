import { LIBS, getEventConfig } from '../../utils/utils.js';
import { fetchFederalIcon } from './federal-icons.js';

// Page-level, framework-agnostic icon resolver: any block (Preact or vanilla) can resolve
// an icon name to an SVG element. Tries Adobe's shared federal icon CDN first, then
// Milo's own local icon set as a backup (reusing its cache/sprite so we don't duplicate
// icons Milo already maintains). No other source is supported — an icon not in either
// one simply doesn't render.
const resolvedIconCache = new Map();
let miloIconsPromise = null;

async function fetchMiloIcons(miloLibs) {
  try {
    const { fetchIcons } = await import(`${miloLibs}/features/icons/icons.js`);
    // fetchIcons() resolves to `null` (not a throw) on a failed sprite fetch — normalize
    // to {} so lookups below never throw, and so one transient failure doesn't permanently
    // break icon resolution via loadMiloIcons()'s promise memoization.
    const icons = await fetchIcons({ miloLibs });
    return icons || {};
  } catch (err) {
    window.lana?.log(`[icon-resolver] failed to load Milo icons: ${err.message}`);
    return {};
  }
}

function loadMiloIcons() {
  if (!miloIconsPromise) {
    const miloLibs = getEventConfig()?.miloConfig?.miloLibs || LIBS;
    miloIconsPromise = fetchMiloIcons(miloLibs);
  }
  return miloIconsPromise;
}

export async function resolveIcon(iconName) {
  if (!iconName) return null;
  if (resolvedIconCache.has(iconName)) return resolvedIconCache.get(iconName).cloneNode(true);

  let svg = await fetchFederalIcon(iconName);
  if (!svg) {
    const miloIcons = await loadMiloIcons();
    svg = miloIcons[iconName];
  }
  if (!svg) return null;

  resolvedIconCache.set(iconName, svg);
  return svg.cloneNode(true);
}
