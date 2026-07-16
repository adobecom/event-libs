import { LIBS, getEventConfig } from '../../utils/utils.js';

// Page-level, framework-agnostic icon resolver: any block (Preact or vanilla) can resolve
// an icon name to an SVG element. Delegates to Milo's own icon set first (reusing its
// cache/sprite so we don't duplicate icons Milo already maintains), falling back to
// event-libs' own track-icons.svg sprite for track/event-specific icons Milo doesn't have.
const resolvedIconCache = new Map();
let miloIconsPromise = null;
let ownIconsPromise = null;

function extractSymbols(svgText) {
  if (!svgText) return {};
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const icons = {};
  doc.querySelectorAll('symbol').forEach((symbol) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    while (symbol.firstChild) svg.appendChild(symbol.firstChild);
    [...symbol.attributes].forEach((attr) => svg.attributes.setNamedItem(attr.cloneNode()));
    svg.classList.add('icon-track', `icon-track-${svg.id}`);
    icons[svg.id] = svg;
  });
  return icons;
}

function loadMiloIcons() {
  if (!miloIconsPromise) {
    const miloLibs = getEventConfig()?.miloConfig?.miloLibs || LIBS;
    miloIconsPromise = import(`${miloLibs}/features/icons/icons.js`)
      .then(({ fetchIcons }) => fetchIcons({ miloLibs }))
      .catch((err) => {
        window.lana?.log(`[icon-resolver] failed to load Milo icons: ${err.message}`);
        return {};
      });
  }
  return miloIconsPromise;
}

function loadOwnIcons() {
  if (!ownIconsPromise) {
    const spriteUrl = new URL('./track-icons.svg', import.meta.url).href;
    ownIconsPromise = fetch(spriteUrl)
      .then((resp) => (resp.ok ? resp.text() : ''))
      .then(extractSymbols)
      .catch((err) => {
        window.lana?.log(`[icon-resolver] failed to load track-icons.svg: ${err.message}`);
        return {};
      });
  }
  return ownIconsPromise;
}

export async function resolveIcon(iconName) {
  if (!iconName) return null;
  if (resolvedIconCache.has(iconName)) return resolvedIconCache.get(iconName).cloneNode(true);

  const miloIcons = await loadMiloIcons();
  let svg = miloIcons[iconName];
  if (!svg) {
    const ownIcons = await loadOwnIcons();
    svg = ownIcons[iconName];
  }
  if (!svg) return null;

  resolvedIconCache.set(iconName, svg);
  return svg.cloneNode(true);
}
