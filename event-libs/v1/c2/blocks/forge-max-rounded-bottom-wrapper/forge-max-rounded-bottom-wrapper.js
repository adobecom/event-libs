/**
 * forge-max-rounded-bottom-wrapper — Milo C2 block: the Adobe Summit "in-person
 * agenda" information grid. A white, rounded-bottom card holding a 3-up grid of
 * cards (image + heading + description, two with a text CTA) in a staggered
 * masonry cascade.
 *
 * DA strips the authored Figma classes (.information-grid, .information-grid-item,
 * …) before this decorator runs, so `init(el)` receives a FLAT, class-less list:
 *   el > div > div > ul > li*(picture + h2|h3 + p + a?)
 * We PROBE BY CONTENT SHAPE (the <li> run), never by an authored class, and
 * RECONSTRUCT the rich grid structure with createElement: a grid container, a
 * role=list <ul>, and per-item tiles with media / text slots — stamping the
 * structural classes ourselves so the scoped CSS has stable hooks. Authored
 * <picture>/<img> nodes (and their loading/width/height attrs) and any MEP
 * markers are MOVED, never re-serialized.
 *
 * @param {HTMLElement} el  The block element Milo passes to every C2 decorator.
 * @returns {Promise<void>}
 */
// CANONICAL DEPTH: from libs/c2/blocks/<name>/ to libs/utils/decorate.js is
// THREE hops up (blocks -> c2 -> libs). The 3-hop '../../../' form is CORRECT.
import { decorateButtons } from '../../../utils/forge-milo-compat.js';

const BLOCK = 'forge-max-rounded-bottom-wrapper';

// MEP / personalization markers Milo may stamp on the row/cell wrappers. The
// rebuild discards those wrappers, so copy any present marker onto a kept node
// FIRST — a swap that drops them silently disables Target/MEP on the section.
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

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export default async function init(el) {
  if (!el) return;
  // Section-level analytics handle.
  el.setAttribute('daa-lh', BLOCK);

  // Probe OUTWARD by content shape (never by an authored class): the grid is the
  // run of <li> cards that carry a heading/description/media.
  const sourceItems = [...el.querySelectorAll('li')].filter(
    (li) => li.querySelector('h1, h2, h3, h4, h5, h6, p, picture, img'),
  );

  // Nothing to reconstruct (unexpected authoring) — leave content intact.
  if (!sourceItems.length) {
    el.dataset.forgeAuthored = BLOCK;
    return;
  }

  // Lift MEP markers off the discarded row/cell wrappers onto the kept root.
  preserveMepAttrs(el.querySelector(':scope > div'), el);
  preserveMepAttrs(el.querySelector(':scope > div > div'), el);

  // Rebuild the grid structure from content ORDER.
  const grid = document.createElement('ul');
  grid.className = 'information-grid';
  grid.setAttribute('role', 'list');

  sourceItems.forEach((srcLi, idx) => {
    const tile = document.createElement('li');
    tile.className = 'information-grid-item';
    preserveMepAttrs(srcLi, tile);

    // Media slot — MOVE the authored <picture> (or raw <img>) so loading/width/
    // height/srcset survive. Reserve the box in CSS via aspect-ratio (no CLS).
    const media = srcLi.querySelector('picture') || srcLi.querySelector('img');
    if (media) {
      media.classList.add('information-grid-item-image');
      const img = media.matches('img') ? media : media.querySelector('img');
      if (img && !img.hasAttribute('daa-im')) {
        img.setAttribute('daa-im', `${BLOCK}|${slugify(img.getAttribute('alt')) || `image-${idx + 1}`}`);
      }
      tile.appendChild(media);
    }

    // Text slot — heading (level preserved for the a11y outline), description(s),
    // and an optional text CTA.
    const text = document.createElement('div');
    text.className = 'information-grid-item-text';

    const heading = srcLi.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
      heading.classList.add('information-grid-item-title');
      text.appendChild(heading);
    }
    srcLi.querySelectorAll('p').forEach((p) => {
      p.classList.add('information-grid-item-description');
      text.appendChild(p);
    });
    srcLi.querySelectorAll('a').forEach((a, ai) => {
      a.classList.add('information-grid-item-text-link');
      if (!a.hasAttribute('daa-ll')) {
        a.setAttribute('daa-ll', `${BLOCK}|${slugify(a.textContent) || `link-${ai + 1}`}`);
      }
      text.appendChild(a);
    });

    tile.appendChild(text);
    grid.appendChild(tile);
  });

  const container = document.createElement('div');
  container.className = 'information-grid-container';
  container.appendChild(grid);

  // Single structural swap (never innerHTML wipe) — preserves no authored DOM
  // beyond the nodes we moved, which is all the content there is.
  el.replaceChildren(container);

  // Milo service: wire analytics/a11y on any CTA. Plain text links stay links
  // (they are not solo-in-a-paragraph), so this is a near-noop here; guarded so
  // a decorate-service surprise can never brick the block at decorate time.
  try {
    decorateButtons(container);
  } catch (e) {
    /* non-fatal: links already carry their own class + daa-ll */
  }

  el.dataset.forgeAuthored = BLOCK;
}
