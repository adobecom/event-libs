// Adobe's shared, cross-site icon CDN ("federal"). Reimplemented here (instead of
// importing Milo's getIcon()) because this module also runs standalone with no Milo
// loaded. Federal serves one <svg> file per icon (not a <symbol> sprite), so parsing is a
// plain DOMParser lookup.
const PROD_ROOT = 'https://www.adobe.com';

let federalRootOverride = null;

// Test-only escape hatch — same ergonomics as icon-resolver.test.js's
// setEventConfig({}, { miloLibs }) pattern, kept local to this module rather than routed
// through the shared miloConfig singleton, since federal isn't Milo's own config.
export function setFederalRootOverride(root) {
  federalRootOverride = root;
}

// Mirrors Milo's own getFederatedContentRoot() (milo/libs/utils/utils.js) without
// depending on Milo being loaded.
function resolveFederalRoot() {
  if (federalRootOverride) return federalRootOverride;
  const { hostname, origin } = window.location;
  if (hostname.includes('.hlx.') || hostname.includes('.aem.') || hostname.includes('local')) {
    return `https://main--federal--adobecom.aem.${origin.endsWith('.live') ? 'live' : 'page'}`;
  }
  return PROD_ROOT;
}

// Map<name, SVGElement|null> — caches misses too, not just hits, since federal is one
// HTTP request per icon name (no manifest); without this, rendering an icon not yet
// uploaded to federal would re-fetch a 404 on every render.
const federalIconCache = new Map();

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

// Federal has two separate SVG namespaces: /assets/icons/svgs/ for generic UI/track
// icons (has its own icons.json manifest, see fetchFederalIconList below); /assets/svgs/
// for product logos (curated per-product by the product team, no manifest). The live
// frontend resolver (below) checks both, since by render time we just want to find
// whatever was authored, regardless of which namespace it lives in. The configurator's
// own product-icon preview is scoped to the product path only, via
// fetchFederalProductIcon — it shouldn't resolve a typed product slug against the
// unrelated generic namespace.
export async function fetchFederalIcon(iconName) {
  if (!iconName) return null;
  if (federalIconCache.has(iconName)) {
    const cached = federalIconCache.get(iconName);
    return cached ? cached.cloneNode(true) : null;
  }

  const root = resolveFederalRoot();
  const svg = await fetchSvgFrom(`${root}/federal/assets/icons/svgs/${iconName}.svg`)
    || await fetchSvgFrom(`${root}/federal/assets/svgs/${iconName}.svg`);
  if (svg) svg.classList.add('icon-federal', `icon-federal-${iconName}`);

  federalIconCache.set(iconName, svg);
  return svg ? svg.cloneNode(true) : null;
}

const federalProductIconCache = new Map();

// Product-logo namespace only, no fallback to the generic /assets/icons/svgs/ path —
// used by the Tier 1 Event Configurator's product-icon preview specifically, not by the
// live frontend resolver above.
export async function fetchFederalProductIcon(iconName) {
  if (!iconName) return null;
  if (federalProductIconCache.has(iconName)) {
    const cached = federalProductIconCache.get(iconName);
    return cached ? cached.cloneNode(true) : null;
  }

  const svg = await fetchSvgFrom(`${resolveFederalRoot()}/federal/assets/svgs/${iconName}.svg`);
  if (svg) svg.classList.add('icon-federal', `icon-federal-${iconName}`);

  federalProductIconCache.set(iconName, svg);
  return svg ? svg.cloneNode(true) : null;
}

// icons.json is federal's own manifest of every icon it hosts (a standard Helix sheet
// export). Used to populate icon pickers with federal's live inventory instead of a
// hardcoded list that would drift as icons are added there.
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
