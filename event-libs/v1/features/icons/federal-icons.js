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

export async function fetchFederalIcon(iconName) {
  if (!iconName) return null;
  if (federalIconCache.has(iconName)) {
    const cached = federalIconCache.get(iconName);
    return cached ? cached.cloneNode(true) : null;
  }

  const url = `${resolveFederalRoot()}/federal/assets/icons/svgs/${iconName}.svg`;
  let svg = null;
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const svgText = await resp.text();
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      svg = doc.querySelector('svg');
      if (svg) svg.classList.add('icon-federal', `icon-federal-${iconName}`);
    }
  } catch (err) {
    window.lana?.log(`[federal-icons] failed to fetch ${iconName}: ${err.message}`);
  }

  federalIconCache.set(iconName, svg);
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
