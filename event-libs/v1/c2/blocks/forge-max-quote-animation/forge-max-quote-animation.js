/**
 * forge-max-quote-animation — a Milo C2 block authored by Forge for a dark,
 * full-bleed testimonial section: a large white attendee quote on the left and a
 * three-column wall of square, rounded photo tiles on the right (the Figma frame
 * freezes a vertically-staggered scroll of the wall). Motion is NOT emitted here
 * — the design-system catalog applies the column scroll later in
 * forge-adjustments; this block renders the FROZEN staggered state as a clipped,
 * overflow-hidden photo wall.
 *
 * DA STRIPS CLASSES: at runtime `init(el)` does NOT receive the authored
 * `.max-quote` / `.max-quote-tile-columns` / `.max-quote-tile` structure of
 * section.html. It receives a FLAT, class-less run of a `<blockquote>`, the
 * attribution text, and ~24 `<picture>` elements wrapped in EDS row/cell `<div>`s.
 * So this decorator probes by CONTENT SHAPE (blockquote / attribution / pictures)
 * and RECONSTRUCTS the structure (a `<figure>` quote + a 3-column tile grid) with
 * createElement + the part classes the scoped CSS keys on, stamped by JS itself.
 * Nodes are MOVED (appendChild), never serialized, so authored <picture>/<img>
 * attributes (loading, width, height) and MEP markers survive.
 *
 * @param {HTMLElement} el  The block element Milo passes to every C2 decorator.
 * @returns {Promise<void>}
 */
// CANONICAL DEPTH: from libs/c2/blocks/<name>/ to libs/utils/decorate.js is
// THREE hops up (blocks -> c2 -> libs). The 3-hop '../../../' form is CORRECT.
import { decorateBlockText, decorateViewportContent } from '../../../utils/forge-milo-compat.js';

const BLOCK = 'forge-max-quote-animation';
const COLUMNS = 3;

// MEP / personalization markers Milo stamps on the row/cell wrapper. The rebuild
// discards those wrappers, so copy any present marker up onto the block root
// FIRST — a node swap that drops them silently disables Target/MEP on the section.
const MEP_ATTRS = ['data-manifest-id', 'data-adobe-target-testid'];
function preserveMepAttrs(from, to) {
  if (!from || !to) return;
  for (const attr of MEP_ATTRS) {
    const v = from.getAttribute?.(attr);
    if (v != null) to.setAttribute(attr, v);
  }
  // data-mep-* is an open family — copy every attribute in that namespace.
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

// Deterministic image analytics floor (forge-owned; independent of author
// compliance). Idempotent: skips any image already carrying daa-im.
function tagImages(scope, label) {
  let i = 0;
  scope.querySelectorAll('img').forEach((img) => {
    if (img.hasAttribute('daa-im')) return;
    i += 1;
    const alt = (img.getAttribute('alt') || '').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    img.setAttribute('daa-im', `${label}|${alt || `image-${i}`}`);
  });
}

// Find the attribution ("– Adobe Summit 2026 attendee"): a <cite>, else the first
// text <p> that holds no picture, else a bare text node trailing the blockquote.
function findAttribution(scope, blockquote) {
  const cite = scope.querySelector('cite');
  if (cite) return cite;
  const para = [...scope.querySelectorAll('p')]
    .find((p) => !p.querySelector('picture, img') && p.textContent.trim());
  if (para) return para;
  if (blockquote) {
    let node = blockquote.nextSibling;
    while (node && !(node.nodeType === 3 && node.textContent.trim())) node = node.nextSibling;
    if (node) {
      const made = document.createElement('cite');
      made.textContent = node.textContent.trim();
      node.remove();
      return made;
    }
  }
  return null;
}

export default async function init(el) {
  if (!el) return;
  // Section-level analytics handle, disambiguated across N same-name instances.
  const daaLh = `${BLOCK}${forgeInstanceSuffix(el, BLOCK)}`;
  el.setAttribute('daa-lh', daaLh);

  // Lift MEP markers off the EDS row/cell wrapper onto the block root before the
  // rebuild discards those wrappers (replaceChildren below drops them).
  const cell = el.querySelector(':scope > div > div');
  if (cell) {
    preserveMepAttrs(cell, el);
    preserveMepAttrs(cell.parentElement, el);
  }

  // Probe by CONTENT SHAPE (never by authored class — DA stripped them). Deep
  // queries find the nodes wherever EDS nested them.
  const blockquote = el.querySelector('blockquote');
  const attribution = findAttribution(el, blockquote);
  const pictures = [...el.querySelectorAll('picture')];
  const looseImgs = pictures.length
    ? []
    : [...el.querySelectorAll('img')]; // defensive: images authored without <picture>

  // Reconstruct the quote (left column).
  const figure = document.createElement('figure');
  figure.className = 'max-quote';
  if (blockquote) {
    blockquote.classList.add('max-quote-text', 'title-2');
    figure.appendChild(blockquote); // MOVE — preserves attrs/MEP
  }
  if (attribution) {
    attribution.classList.add('max-quote-cite', 'body-md');
    figure.appendChild(attribution);
  }

  // Reconstruct the photo wall (right column): COLUMNS columns of square tiles.
  // Decorative (empty-alt imagery) so the whole wall is hidden from the a11y tree.
  const grid = document.createElement('div');
  grid.className = 'max-quote-tile-columns';
  grid.setAttribute('aria-hidden', 'true');
  const media = pictures.length ? pictures : looseImgs;
  const perCol = Math.max(1, Math.ceil(media.length / COLUMNS));
  for (let c = 0; c < COLUMNS; c += 1) {
    const slice = media.slice(c * perCol, (c + 1) * perCol);
    if (!slice.length) break;
    const col = document.createElement('div');
    col.className = `max-quote-tile-column column-0${c + 1}`;
    for (const node of slice) {
      const tile = document.createElement('div');
      tile.className = 'max-quote-tile';
      tile.appendChild(node); // MOVE the <picture>/<img> — attrs preserved
      col.appendChild(tile);
    }
    grid.appendChild(col);
  }

  // Swap the rebuilt section in once (never innerHTML-wipe). Keep the quote even
  // if the wall is empty, and vice-versa.
  const built = [];
  if (figure.childElementCount) built.push(figure);
  if (grid.childElementCount) built.push(grid);
  if (built.length) el.replaceChildren(...built);

  // Run Milo's own text decorator over the reconstructed quote so the block is a
  // real Milo decorator (semantic typography wiring), wrapped in
  // decorateViewportContent for consistent SSR/CSR behaviour. The scoped CSS owns
  // the visual sizing/colour; this adds Milo semantic classes on top.
  const decorate = (scope) => {
    const target = scope.querySelector?.('.max-quote') || scope;
    try { decorateBlockText(target); } catch (e) { /* non-fatal: CSS still styles */ }
  };
  try {
    if (typeof decorateViewportContent === 'function') decorateViewportContent(el, decorate);
    else decorate(el);
  } catch (e) {
    decorate(el);
  }

  // Deterministic analytics floor for the imagery.
  tagImages(el, daaLh);

  el.dataset.forgeAuthored = BLOCK;
}
