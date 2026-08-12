// Adobe's shared, cross-site icon CDN ("federal") — the centralized SVG repo Milo, DA,
// and other adobe.com properties fetch at runtime. Reimplemented here (rather than
// dynamically importing Milo's own getIcon()/fetchFederalIcon()) because the Tier 1
// Event Configurator app runs standalone in a DA-hosted iframe with no Milo loaded at
// all — this module works identically from both that app and a real Milo-decorated page.
// Federal serves one standalone <svg> file per icon name, not a <symbol> sprite, so
// parsing here is a plain DOMParser lookup for the <svg> root (no symbol extraction).
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

// Map<name, SVGElement|null> — caches misses too, not just hits. Federal is one HTTP
// request per icon name (no manifest), unlike the sprite-based tiers where a miss is a
// free in-memory lookup — without this, every render of an icon not yet uploaded to
// federal (e.g. any of the Digital Agenda track icons today) would re-fetch a 404 every
// time.
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

// icons.json is federal's own manifest of every icon it hosts — a standard Helix sheet
// export ({ data: [{ key, icon, notation }] }), the same convention DA's library plugin
// reads for its per-org icon config sheets. Used to populate icon pickers (e.g. the Tier
// 1 Event Configurator's track icon dropdown) with federal's live inventory, rather than
// a hardcoded list that drifts as icons are added there.
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
