/**
 * forge-container — Adobe Summit "Meet the sponsors" tier grid (C2, Forge-authored).
 *
 * RUNTIME CONTENT SHAPE (author-content.html, the source of truth): DA serialises
 * this block as a FLAT, class-less run of `<h2>` tier labels each followed by a
 * `<ul>` of `<li><picture><img></picture></li>` sponsor logos, in document order —
 * NO `.sponsor-level` / `.sponsors-grid` wrappers, NO size classes (those live only
 * in section.html and are STRIPPED before init() runs). So init() must PROBE BY
 * CONTENT (the h2 → following logos pairing) and RECONSTRUCT the tier grid itself,
 * re-adding the structural classes the scoped CSS keys on.
 *
 * PROPORTIONS ARE THE DESIGN: section.html assigns a per-tier size — Diamond=large,
 * Platinum/Gold=medium, Silver/Bronze/Showcase=small — which drives how many logo
 * tiles sit per row (large 4-up, medium 5-up, small 6-up) and thus each tile's size.
 * That sequence vanishes from the runtime content, so it is carried here as a
 * tier-name map with a positional fallback and expressed RELATIVELY in CSS (a
 * `--forge-cols` count + % calc), never as pinned Figma-frame pixels.
 *
 * @param {HTMLElement} el  The block element Milo passes to every C2 decorator.
 * @returns {Promise<void>}
 */
// CANONICAL DEPTH: libs/c2/blocks/<name>/ → libs/utils/decorate.js is THREE hops up
// (blocks → c2 → libs). The 3-hop '../../../' form is CORRECT; do not "fix" it.
import { decorateBlockText, decorateViewportContent } from '../../../utils/forge-milo-compat.js';

const BLOCK = 'forge-container';

// Per-tier size carried from section.html (name map, primary) with a positional
// fallback for any tier name not in the map, so the real large→medium→small
// sequence survives the class-stripping. Column counts live in CSS via --forge-cols.
const SIZE_BY_NAME = {
  diamond: 'large',
  platinum: 'medium',
  gold: 'medium',
  silver: 'small',
  bronze: 'small',
  showcase: 'small',
};
const SIZE_SEQUENCE = ['large', 'medium', 'medium', 'small', 'small', 'small'];

function sizeForTier(name, idx) {
  const key = String(name || '').trim().toLowerCase();
  return SIZE_BY_NAME[key] || SIZE_SEQUENCE[idx] || 'small';
}

// MEP / personalization markers Milo stamps on the row/cell wrapper. The rebuild
// discards that wrapper, so copy any present marker onto the block root FIRST — a
// node swap that drops them silently disables Target/MEP on the section.
const MEP_ATTRS = ['data-manifest-id', 'data-adobe-target-testid'];
function preserveMepAttrs(from, to) {
  if (!from || !to) return;
  for (const attr of MEP_ATTRS) {
    const v = from.getAttribute?.(attr);
    if (v != null) to.setAttribute(attr, v);
  }
  for (const a of [...(from.attributes || [])]) {
    if (a.name.startsWith('data-mep-')) to.setAttribute(a.name, a.value);
  }
}

// Disambiguates daa-lh across N same-name instances on one page (1-based suffix).
function forgeInstanceSuffix(root, blockName) {
  const instances = [...document.querySelectorAll(`.${blockName}`)];
  const idx = instances.indexOf(root);
  return instances.length > 1 && idx >= 0 ? `-${idx + 1}` : '';
}

// Walk the block in document order, grouping each tier heading with the sponsor
// logos (pictures, or bare imgs) that follow it — independent of how deeply DA
// nested them in row/cell wrappers (probe by content, never by position/class).
function collectTiers(root) {
  const tiers = [];
  let current = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  while (node) {
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) {
      current = { heading: node, logos: [] };
      tiers.push(current);
    } else if (current && tag === 'PICTURE') {
      current.logos.push(node);
    } else if (current && tag === 'IMG' && !node.closest('picture')) {
      current.logos.push(node);
    }
    node = walker.nextNode();
  }
  return tiers.filter((t) => t.logos.length > 0);
}

function buildTile(logo, label) {
  const li = document.createElement('li');
  li.className = 'sponsor-card';
  const img = logo.tagName === 'IMG' ? logo : logo.querySelector('img');
  if (img) {
    img.classList.add('sponsor-image');
    if (!img.hasAttribute('daa-im')) img.setAttribute('daa-im', `${label}|logo`);
  }
  li.appendChild(logo);
  return li;
}

function buildTier(tier, idx, label) {
  const size = sizeForTier(tier.heading.textContent, idx);
  const level = document.createElement('div');
  level.className = `sponsor-level sponsor-level-size-${size}`;

  tier.heading.classList.add('sponsor-level-name');
  level.appendChild(tier.heading);

  const grid = document.createElement('ul');
  grid.className = 'sponsors-grid';
  grid.setAttribute('role', 'list');
  tier.logos.forEach((logo) => grid.appendChild(buildTile(logo, label)));
  level.appendChild(grid);
  return level;
}

export default async function init(el) {
  if (!el) return;

  const daaLh = `${BLOCK}${forgeInstanceSuffix(el, BLOCK)}`;
  el.setAttribute('daa-lh', daaLh);

  // Preserve MEP markers off the cell wrapper before the rebuild drops it.
  const cell = el.querySelector(':scope > div > div');
  if (cell) preserveMepAttrs(cell.parentElement, el);

  const tiers = collectTiers(el);
  if (!tiers.length) {
    // Unexpected content — never wipe; leave authored DOM intact.
    el.dataset.forgeAuthored = BLOCK;
    return;
  }

  // Build the reconstructed grid off-DOM, then swap in once (no innerHTML wipe).
  const rebuilt = document.createElement('div');
  rebuilt.className = 'sponsors-grid-container';
  tiers.forEach((tier, idx) => rebuilt.appendChild(buildTier(tier, idx, daaLh)));
  el.replaceChildren(rebuilt);

  // Promote tier headings with Milo's own typography service (keeps SSR/CSR text
  // decoration consistent); scoped CSS owns final sizing by higher specificity.
  const decorateText = (scope) => {
    try { decorateBlockText(scope); } catch (e) { /* milo service optional */ }
  };
  try {
    if (typeof decorateViewportContent === 'function') decorateViewportContent(el, decorateText);
    else decorateText(el);
  } catch (e) { /* typography is progressive enhancement; reconstruction already stands */ }

  el.dataset.forgeAuthored = BLOCK;
}
