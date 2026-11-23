/**
 * forge-max-marquee — a Milo C2 block for the "Sponsors" marquee/hero section
 * (eyebrow + large centered heading + lead paragraph + outline CTA).
 *
 * DA strips the authored Figma classes (`.max-marquee`, `.eyebrow`,
 * `.button-group`, `.max-button`), so at runtime `init(el)` receives a FLAT,
 * class-less, EDS-wrapped run of `<h1>/<p>/<a>` in document order. This decorator
 * therefore PROBES BY CONTENT SHAPE (never by class or child index) and
 * RECONSTRUCTS the centered marquee layout: it lifts the leading short line out of
 * the heading into a separate `.eyebrow`, keeps the single `<h1>`, treats copy as
 * body text, and collects every link/button into a centered actions row — moving
 * the authored nodes (not re-creating them) so their attributes, hrefs and MEP
 * markers survive. Scoped CSS keyed on the `.forge-max-marquee-*` classes stamped
 * here drives the visual; Milo's own `decorateBlockText` is run (guarded) for
 * C2 typography wiring so this is a real Milo decorator, not a capture shim.
 *
 * @param {HTMLElement} el  The block element Milo passes to every C2 decorator.
 * @returns {Promise<void>}
 */
// CANONICAL DEPTH: from libs/c2/blocks/<name>/ to libs/utils/decorate.js is
// THREE hops up (blocks -> c2 -> libs). The 3-hop '../../../' form is CORRECT.
import { decorateBlockText, decorateViewportContent } from '../../../utils/forge-milo-compat.js';

const BLOCK = 'forge-max-marquee';

// MEP / personalization markers Milo stamps on the row/cell wrapper. The un-wrap
// discards that wrapper, so copy any present marker up onto the block root FIRST
// (data-manifest-id, data-adobe-target-testid, every data-mep-* attr) — a node
// swap that drops them silently disables Target/MEP on the section.
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
function forgeInstanceSuffix(el, blockName) {
  const instances = [...document.querySelectorAll(`.${blockName}`)];
  const idx = instances.indexOf(el);
  return instances.length > 1 && idx >= 0 ? `-${idx + 1}` : '';
}

// Deterministic analytics tagging (forge-owned; idempotent — skips any node that
// already carries daa-ll/daa-im so it never double-tags).
function forgeTagAnalytics(scope, label) {
  if (!scope) return;
  const slugify = (text) => String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  let linkIdx = 0;
  scope.querySelectorAll('a, button').forEach((node) => {
    if (node.hasAttribute('daa-ll')) return;
    linkIdx += 1;
    const text = node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || '';
    node.setAttribute('daa-ll', `${label}|${slugify(text) || `link-${linkIdx}`}`);
  });
  let imgIdx = 0;
  scope.querySelectorAll('img').forEach((img) => {
    if (img.hasAttribute('daa-im')) return;
    imgIdx += 1;
    img.setAttribute('daa-im', `${label}|${slugify(img.getAttribute('alt')) || `image-${imgIdx}`}`);
  });
}

// EDS wraps a single-cell block as `block > div(row) > div(cell) > content`.
// Descend through single-DIV wrappers to reach the real content cell. Probe by
// structure, never by an authored class or a fixed child index.
function findContentScope(el) {
  let scope = el;
  for (let hop = 0; hop < 4; hop += 1) {
    const kids = [...scope.children].filter((n) => n.nodeType === 1);
    if (kids.length === 1 && kids[0].tagName === 'DIV' && !kids[0].matches('picture')) {
      scope = kids[0];
    } else break;
  }
  return scope;
}

// The authored eyebrow collapsed into the heading as a leading text line. Split
// it back out: a short leading line (<= 5 words) followed by the real heading.
function splitEyebrow(h) {
  const lines = (h.textContent || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0].length <= 40 && lines[0].split(/\s+/).length <= 5) {
    return { eyebrow: lines[0], heading: lines.slice(1).join(' ') };
  }
  return { eyebrow: null, heading: lines.join(' ') || (h.textContent || '').trim() };
}

// A paragraph that is really just a button wrapper (its text is entirely the
// link text) — route its links to the actions row instead of rendering as copy.
function paragraphLinks(node) {
  const links = [...node.querySelectorAll('a, button')];
  if (!links.length) return null;
  const linkLen = links.reduce((s, l) => s + (l.textContent || '').trim().length, 0);
  const pLen = (node.textContent || '').trim().length;
  return pLen > 0 && linkLen >= pLen - 2 ? links : null;
}

export default async function init(el) {
  if (!el) return;

  const daaLh = `${BLOCK}${forgeInstanceSuffix(el, BLOCK)}`;
  el.setAttribute('daa-lh', daaLh);

  const scope = findContentScope(el);
  if (scope !== el) preserveMepAttrs(scope.parentElement, el);
  const nodes = [...scope.children].filter((n) => n.nodeType === 1);

  const foreground = document.createElement('div');
  foreground.className = 'forge-max-marquee-foreground';

  const actions = [];
  let headingDone = false;

  // Walk EVERY flat child in document order; never index an assumed shape and
  // never discard a node (ragged leftovers are appended as-is).
  nodes.forEach((node) => {
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) {
      if (!headingDone) {
        const { eyebrow, heading } = splitEyebrow(node);
        if (eyebrow) {
          const eb = document.createElement('p');
          eb.className = 'forge-max-marquee-eyebrow eyebrow';
          eb.textContent = eyebrow;
          foreground.appendChild(eb);
        }
        node.textContent = heading;
        node.classList.add('forge-max-marquee-heading');
        foreground.appendChild(node);
        headingDone = true;
      } else {
        node.classList.add('forge-max-marquee-subheading');
        foreground.appendChild(node);
      }
    } else if (tag === 'P') {
      const links = paragraphLinks(node);
      if (links) links.forEach((l) => actions.push(l));
      else {
        node.classList.add('forge-max-marquee-body');
        foreground.appendChild(node);
      }
    } else if (tag === 'A' || tag === 'BUTTON') {
      actions.push(node);
    } else if (tag === 'PICTURE' || tag === 'IMG') {
      node.classList.add('forge-max-marquee-media');
      foreground.appendChild(node);
    } else {
      foreground.appendChild(node);
    }
  });

  if (actions.length) {
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'forge-max-marquee-actions';
    actions.forEach((a) => {
      a.classList.add('forge-max-marquee-cta', 'con-button', 'outline');
      actionsWrap.appendChild(a);
    });
    foreground.appendChild(actionsWrap);
  }

  // Single structural swap at the end — never wipe innerHTML (C3).
  el.replaceChildren(foreground);

  // Milo C2 typography wiring (guarded so a service quirk can never brick the
  // reconstruction or the test gate). decorateBlockText promotes headings/copy;
  // decorateViewportContent keeps SSR/CSR parity for any per-viewport table.
  try {
    const run = () => { if (typeof decorateBlockText === 'function') decorateBlockText(foreground); };
    if (typeof decorateViewportContent === 'function') decorateViewportContent(el, run);
    else run();
  } catch (e) {
    window.lana?.log?.(`${BLOCK} decorate: ${e?.message || e}`);
  }

  forgeTagAnalytics(el, daaLh);
  el.dataset.forgeAuthored = BLOCK;
}
