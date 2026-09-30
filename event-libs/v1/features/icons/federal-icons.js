import { logError, logWarning } from '../../utils/lana-log.js';

// Adobe's federal icon CDN, reimplemented here since this module also runs without Milo loaded.
const PROD_ROOT = 'https://www.adobe.com';

let federalRootOverride = null;

// Test-only override; not routed through miloConfig since federal isn't Milo's own config.
export function setFederalRootOverride(root) {
  federalRootOverride = root;
}

// Mirrors Milo's getFederatedContentRoot() without requiring Milo to be loaded.
function resolveFederalRoot() {
  if (federalRootOverride) return federalRootOverride;
  const { hostname, origin } = window.location;
  if (hostname.includes('.hlx.') || hostname.includes('.aem.') || hostname.includes('local')) {
    return `https://main--federal--adobecom.aem.${origin.endsWith('.live') ? 'live' : 'page'}`;
  }
  return PROD_ROOT;
}

// Rewrites cloned SVG ids and <style> classes per instance, since inlined icons share one
// document and Illustrator exports reuse generic names (clippath-1, .st0) across icons.
let nextSvgIdSuffix = 0;

const URL_REF_RE = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g;
const CLASS_SELECTOR_RE = /\.(-?[_a-zA-Z][\w-]*)/g;

function namespaceSvgIds(svg) {
  const idEls = [...svg.querySelectorAll('[id]')];
  const styleEls = [...svg.querySelectorAll('style')];
  if (!idEls.length && !styleEls.length) return svg;

  nextSvgIdSuffix += 1;
  const suffix = `-fedicon${nextSvgIdSuffix}`;
  const idMap = new Map(idEls.map((el) => [el.id, `${el.id}${suffix}`]));
  idEls.forEach((el) => { el.id = idMap.get(el.id); });

  const rewriteUrlRefs = (text) => text.replace(
    URL_REF_RE,
    (match, id) => (idMap.has(id) ? `url(#${idMap.get(id)})` : match),
  );

  // Only selectors (text before each "{") are scanned for classes, so values like
  // url(foo.svg) or 0.5 are never mistaken for class names.
  const classMap = new Map();
  styleEls.forEach((styleEl) => {
    styleEl.textContent = rewriteUrlRefs(styleEl.textContent).replace(
      /([^{}]+)\{/g,
      (match, selector) => `${selector.replace(CLASS_SELECTOR_RE, (m, cls) => {
        if (!classMap.has(cls)) classMap.set(cls, `${cls}${suffix}`);
        return `.${classMap.get(cls)}`;
      })}{`,
    );
  });

  // Covers every id-referencing attribute (url(#id), href/xlink:href) rather than a fixed allowlist.
  svg.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach(({ name, value }) => {
      if (name === 'class') {
        if (classMap.size) {
          el.setAttribute(name, value.split(/\s+/).map((cls) => classMap.get(cls) || cls).join(' '));
        }
        return;
      }
      if (/^(xlink:)?href$/.test(name) && value.startsWith('#') && idMap.has(value.slice(1))) {
        el.setAttribute(name, `#${idMap.get(value.slice(1))}`);
        return;
      }
      if (value.includes('url(')) {
        const rewritten = rewriteUrlRefs(value);
        if (rewritten !== value) el.setAttribute(name, rewritten);
      }
    });
  });
  return svg;
}

async function fetchSvgFrom(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      logWarning('federal-icons', `non-ok response fetching ${url}`, resp);
      return null;
    }
    const svgText = await resp.text();
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    return doc.querySelector('svg');
  } catch (err) {
    logError('federal-icons', `failed to fetch ${url}`, err);
    return null;
  }
}

// Shared shape for all three federal namespaces below: cache (misses too, since federal has
// no manifest and a miss would otherwise re-fetch every render), fetch, tag, optional
// per-namespace transform, then a freshly id-namespaced clone per call.
// The in-flight promise is cached (not the resolved SVG) so concurrent callers — e.g. many
// cards mounting in the same tick — share one fetch/parse instead of each missing the cache.
function createFederalIconFetcher(buildUrl, { transform } = {}) {
  const cache = new Map();

  const loadMaster = async (iconName) => {
    const svg = await fetchSvgFrom(buildUrl(iconName));
    if (svg) {
      svg.classList.add('icon-federal', `icon-federal-${iconName}`);
      transform?.(svg);
    }
    return svg;
  };

  return async function fetchIcon(iconName) {
    if (!iconName) return null;
    if (!cache.has(iconName)) cache.set(iconName, loadMaster(iconName));
    const master = await cache.get(iconName);
    return master ? namespaceSvgIds(master.cloneNode(true)) : null;
  };
}

// Three separate federal SVG namespaces below - not merged into one fallback chain.
export const fetchFederalIcon = createFederalIconFetcher(
  (iconName) => `${resolveFederalRoot()}/federal/assets/icons/svgs/${iconName}.svg`,
);

export const fetchFederalProductIcon = createFederalIconFetcher(
  (iconName) => `${resolveFederalRoot()}/federal/assets/svgs/${iconName}.svg`,
);

// Recolors literal black fill/stroke to currentColor (root element included); skips
// white/none (intentional cutouts).
function useCurrentColorForBlack(svg) {
  [svg, ...svg.querySelectorAll('*')].forEach((el) => {
    ['fill', 'stroke'].forEach((attr) => {
      if ((el.getAttribute(attr) || '').toLowerCase() === 'black') {
        el.setAttribute(attr, 'currentColor');
      }
    });
  });
  return svg;
}

export function buildFederalTrackIconUrl(iconName) {
  return iconName ? `${resolveFederalRoot()}/federal/assets/icons/track-icons/${iconName}.svg` : null;
}

export const fetchFederalTrackIcon = createFederalIconFetcher(
  buildFederalTrackIconUrl,
  { transform: useCurrentColorForBlack },
);

// icons.json is federal's manifest of hosted icons, used to populate icon pickers live.
let federalIconListPromise = null;

export function fetchFederalIconList() {
  if (!federalIconListPromise) {
    federalIconListPromise = (async () => {
      try {
        const resp = await fetch(`${resolveFederalRoot()}/federal/assets/icons/icons.json`);
        if (!resp.ok) {
          logWarning('federal-icons', 'non-ok response fetching icons.json', resp);
          return [];
        }
        const { data = [] } = await resp.json();
        return data.map((entry) => entry.key).filter(Boolean);
      } catch (err) {
        logError('federal-icons', 'failed to fetch icons.json', err);
        return [];
      }
    })();
  }
  return federalIconListPromise;
}
