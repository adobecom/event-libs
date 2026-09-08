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

// Federal's SVGs are Illustrator exports that reuse generic ids (clip-path, clip-path-2,
// linear-gradient, ...) across unrelated icons — cloneNode(true) preserves those ids
// verbatim, so inlining more than one icon on the same page (or the same icon twice)
// collides: a <clipPath id="clip-path"> from one icon can silently satisfy another
// icon's (or another instance's) url(#clip-path) reference instead of its own. The
// result renders broken — wrong clip region, missing gradient — with nothing throwing
// to explain why. Rewriting every id to be unique per returned instance, and every
// reference to it within the same tree, makes each clone safe to inline alongside any
// other. See MWPW ticket for the reported symptom (creative-cloud-64/frame-io-64
// rendering as a flat, mostly-monochrome smudge instead of their real multi-color art).
let nextSvgIdSuffix = 0;

function namespaceSvgIds(svg) {
  const idEls = [...svg.querySelectorAll('[id]')];
  if (!idEls.length) return svg;

  nextSvgIdSuffix += 1;
  const suffix = `-fedicon${nextSvgIdSuffix}`;
  const idMap = new Map(idEls.map((el) => [el.id, `${el.id}${suffix}`]));
  idEls.forEach((el) => { el.id = idMap.get(el.id); });

  // Covers every attribute that can reference an id: url(#id) (fill, stroke, clip-path,
  // mask, filter, ...) and the bare #id form (href/xlink:href on <use>, gradient
  // xlink:href chaining). Attribute-by-attribute rather than a fixed allowlist, so this
  // doesn't need updating if federal's export starts referencing ids some other way.
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
    return cached ? namespaceSvgIds(cached.cloneNode(true)) : null;
  }

  const svg = await fetchSvgFrom(`${resolveFederalRoot()}/federal/assets/icons/svgs/${iconName}.svg`);
  if (svg) svg.classList.add('icon-federal', `icon-federal-${iconName}`);

  federalIconCache.set(iconName, svg);
  return svg ? namespaceSvgIds(svg.cloneNode(true)) : null;
}

const federalProductIconCache = new Map();

// Product-logo namespace only — used by the Tier 1 Event Configurator's product-icon
// preview and the sessions-guide FilterPanel's product filter options, both of which
// call this directly rather than fetchFederalIcon above.
export async function fetchFederalProductIcon(iconName) {
  if (!iconName) return null;
  if (federalProductIconCache.has(iconName)) {
    const cached = federalProductIconCache.get(iconName);
    return cached ? namespaceSvgIds(cached.cloneNode(true)) : null;
  }

  const svg = await fetchSvgFrom(`${resolveFederalRoot()}/federal/assets/svgs/${iconName}.svg`);
  if (svg) svg.classList.add('icon-federal', `icon-federal-${iconName}`);

  federalProductIconCache.set(iconName, svg);
  return svg ? namespaceSvgIds(svg.cloneNode(true)) : null;
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
