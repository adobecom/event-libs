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

// Federal has two separate SVG namespaces: /assets/icons/svgs/ here, for generic
// UI/track icons (has its own icons.json manifest, see fetchFederalIconList below);
// /assets/svgs/ (fetchFederalProductIcon below) for product logos, curated per-product
// by the product team, no manifest. Deliberately not merged into one fallback chain —
// nothing today ever needs to resolve a name against both namespaces (tracks/overrides
// only ever live in this one; products only ever live in the other, via a separate,
// not-yet-built consumer), so checking both here would just double the 404s for every
// track/override name federal doesn't have yet.
export async function fetchFederalIcon(iconName) {
  if (!iconName) return null;
  if (federalIconCache.has(iconName)) {
    const cached = federalIconCache.get(iconName);
    return cached ? cached.cloneNode(true) : null;
  }

  const svg = await fetchSvgFrom(`${resolveFederalRoot()}/federal/assets/icons/svgs/${iconName}.svg`);
  if (svg) svg.classList.add('icon-federal', `icon-federal-${iconName}`);

  federalIconCache.set(iconName, svg);
  return svg ? svg.cloneNode(true) : null;
}

const federalProductIconCache = new Map();

// Product-logo namespace only — used by the Tier 1 Event Configurator's product-icon
// preview today; whatever eventually renders products on the live page (a separate,
// not-yet-built ticket) should call this directly too, rather than fetchFederalIcon above.
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
