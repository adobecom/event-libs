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

// Rewrites cloned SVG ids per instance to avoid id collisions between inlined icons.
let nextSvgIdSuffix = 0;

function namespaceSvgIds(svg) {
  const idEls = [...svg.querySelectorAll('[id]')];
  if (!idEls.length) return svg;

  nextSvgIdSuffix += 1;
  const suffix = `-fedicon${nextSvgIdSuffix}`;
  const idMap = new Map(idEls.map((el) => [el.id, `${el.id}${suffix}`]));
  idEls.forEach((el) => { el.id = idMap.get(el.id); });

  // Covers every id-referencing attribute (url(#id), href/xlink:href) rather than a fixed allowlist.
  svg.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach(({ name, value }) => {
      const urlMatch = value.match(/^url\(#(.+)\)$/);
      if (urlMatch && idMap.has(urlMatch[1])) {
        el.setAttribute(name, `url(#${idMap.get(urlMatch[1])})`);
        return;
      }
      if (/^(xlink:)?href$/.test(name) && value.startsWith('#') && idMap.has(value.slice(1))) {
        el.setAttribute(name, `#${idMap.get(value.slice(1))}`);
      }
    });
  });
  return svg;
}

async function fetchSvgFrom(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const svgText = await resp.text();
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    return doc.querySelector('svg');
  } catch (err) {
    window.lana?.log(`[federal-icons] failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

// Shared shape for all three federal namespaces below: cache (misses too, since federal has
// no manifest and a miss would otherwise re-fetch every render), fetch, tag, optional
// per-namespace transform, then a freshly id-namespaced clone per call.
function createFederalIconFetcher(buildUrl, { transform } = {}) {
  const cache = new Map();
  return async function fetchIcon(iconName) {
    if (!iconName) return null;
    if (cache.has(iconName)) {
      const cached = cache.get(iconName);
      return cached ? namespaceSvgIds(cached.cloneNode(true)) : null;
    }

    const svg = await fetchSvgFrom(buildUrl(iconName));
    if (svg) {
      svg.classList.add('icon-federal', `icon-federal-${iconName}`);
      transform?.(svg);
    }

    cache.set(iconName, svg);
    return svg ? namespaceSvgIds(svg.cloneNode(true)) : null;
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

export const fetchFederalTrackIcon = createFederalIconFetcher(
  (iconName) => `${resolveFederalRoot()}/federal/assets/icons/track-icons/${iconName}.svg`,
  { transform: useCurrentColorForBlack },
);

// icons.json is federal's manifest of hosted icons, used to populate icon pickers live.
let federalIconListPromise = null;

export function fetchFederalIconList() {
  if (!federalIconListPromise) {
    federalIconListPromise = (async () => {
      try {
        const resp = await fetch(`${resolveFederalRoot()}/federal/assets/icons/icons.json`);
        if (!resp.ok) return [];
        const { data = [] } = await resp.json();
        return data.map((entry) => entry.key).filter(Boolean);
      } catch (err) {
        window.lana?.log(`[federal-icons] failed to fetch icons.json: ${err.message}`);
        return [];
      }
    })();
  }
  return federalIconListPromise;
}
