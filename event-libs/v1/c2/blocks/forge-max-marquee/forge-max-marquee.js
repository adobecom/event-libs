/**
 * forge-max-marquee — a centered editorial marquee (eyebrow + headline +
 * supporting copy), authored as a Milo C2 block.
 *
 * RUNTIME CONTRACT (why this reconstructs rather than restyles):
 * DA/EDS delivers block content class-LESS and structure-LESS. The authored
 * Figma shape was `<h1><span class="eyebrow">In-person agenda</span> Headline…`
 * inside `.heading-title-container.w-800` — but at runtime the `.eyebrow`,
 * `.heading-title-container` and `.w-800` classes are GONE and the <span> is
 * unwrapped, so `init(el)` actually receives an <h1> whose text is TWO lines
 * (the eyebrow line, then the headline) plus a supporting <p>, nested under
 * EDS row/cell <div>s. Keying CSS on the Figma classes would render the block
 * unstyled; keying on `el.children[N]` would drift. So this decorator PROBES by
 * content shape (C2), SPLITS the eyebrow off the headline, and RECONSTRUCTS the
 * centered marquee with its own `.forge-max-marquee-*` hooks that the scoped
 * stylesheet targets — then hands the rebuilt text to Milo's own
 * decorateBlockText so typography/analytics/a11y wiring is real, not re-rolled.
 *
 * @param {HTMLElement} el  The block element Milo passes to every C2 decorator.
 * @returns {Promise<void>}
 */
// CANONICAL DEPTH: libs/c2/blocks/<name>/ -> libs/utils/ is THREE hops up
// (blocks -> c2 -> libs). Keep the 3-hop '../../../' specifier (lint L30).
import { decorateBlockText, decorateViewportContent } from '../../../utils/forge-milo-compat.js';

const BLOCK = 'forge-max-marquee';

// MEP / personalization markers Milo stamps on authored nodes. A rebuild that
// drops them silently disables Target/MEP on the section, so copy any present
// marker across before discarding the source node.
const MEP_ATTRS = ['data-manifest-id', 'data-adobe-target-testid'];
function preserveMepAttrs(from, to) {
  if (!from || !to || from === to) return;
  for (const attr of MEP_ATTRS) {
    const v = from.getAttribute?.(attr);
    if (v != null) to.setAttribute(attr, v);
  }
  // data-mep-* is an open family — copy every attribute in that namespace.
  for (const a of [...(from.attributes || [])]) {
    if (a.name.startsWith('data-mep-')) to.setAttribute(a.name, a.value);
  }
}

function createTag(tag, attrs, text) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  }
  if (text != null) node.textContent = text;
  return node;
}

const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Disambiguates daa-lh across N same-name instances on one page (a 1-based
// index suffix), mirroring Milo's "index disambiguates repeats" convention.
function forgeInstanceSuffix(el, blockName) {
  const instances = [...document.querySelectorAll(`.${blockName}`)];
  const idx = instances.indexOf(el);
  return instances.length > 1 && idx >= 0 ? `-${idx + 1}` : '';
}

// Deterministic analytics floor — tags any link/button/image the content keeps
// that is not already tagged, so the section reports without depending on
// author compliance. Idempotent (skips already-tagged nodes).
function forgeTagAnalytics(scope, label) {
  if (!scope) return;
  const slug = (t) => collapse(t).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40);
  let linkIdx = 0;
  scope.querySelectorAll('a, button').forEach((node) => {
    if (node.hasAttribute('daa-ll')) return;
    linkIdx += 1;
    const text = node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || '';
    node.setAttribute('daa-ll', `${label}|${slug(text) || `link-${linkIdx}`}`);
  });
  let imgIdx = 0;
  scope.querySelectorAll('img').forEach((img) => {
    if (img.hasAttribute('daa-im')) return;
    imgIdx += 1;
    img.setAttribute('daa-im', `${label}|${slug(img.getAttribute('alt')) || `image-${imgIdx}`}`);
  });
}

/**
 * Split the authored primary heading into { eyebrow, title }. Handles both the
 * runtime DA shape (flat two-line text node) and the rarer case where an inline
 * marker element survived unwrapping — never assumes one or the other.
 */
function splitHeading(heading) {
  // (A) an inline marker element survived (span/em/strong/small/b) → eyebrow.
  const marker = heading.querySelector('span, em, strong, small, b');
  if (marker && collapse(marker.textContent)) {
    const eyebrow = collapse(marker.textContent);
    marker.remove();
    const title = collapse(heading.textContent);
    if (title) return { eyebrow, title };
  }
  // (B) flat multi-line text (the DA runtime shape): first non-empty line is the
  //     eyebrow, the remaining lines are the headline.
  const lines = heading.textContent.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length > 1) {
    return { eyebrow: lines[0], title: collapse(lines.slice(1).join(' ')) };
  }
  // (C) a single line → headline only, no eyebrow.
  return { eyebrow: '', title: collapse(lines[0] || heading.textContent) };
}

export default async function init(el) {
  if (!el) return;

  // Section-level analytics handle, disambiguated across repeats.
  const daaLh = `${BLOCK}${forgeInstanceSuffix(el, BLOCK)}`;
  el.setAttribute('daa-lh', daaLh);

  // Probe outward (C2) for the content cell. EDS nests a single-cell block as
  // `block > div > div > content`; fall back gracefully if already flatter.
  const cell = el.querySelector(':scope > div > div')
    || el.querySelector(':scope > div')
    || el;
  // Lift any MEP markers off the discarded wrapper onto the block root first.
  if (cell !== el) preserveMepAttrs(cell.parentElement, el);

  // Read content by SHAPE, in document order — never by class or fixed index.
  const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
  const paragraphs = [...cell.querySelectorAll('p')];
  const links = [...cell.querySelectorAll('a[href], button')];

  // Nothing recognizable — leave the authored DOM intact, just mark it.
  if (!heading && !paragraphs.length) {
    el.dataset.forgeAuthored = BLOCK;
    return;
  }

  const foreground = createTag('div', { class: `${BLOCK}-foreground` });

  // Headline (with the eyebrow split off it). Exactly ONE <h1> (lint L8).
  if (heading) {
    const { eyebrow, title } = splitHeading(heading);
    if (eyebrow) {
      foreground.append(createTag('p', { class: `${BLOCK}-eyebrow` }, eyebrow));
    }
    const h1 = createTag('h1', { class: `${BLOCK}-title` }, title);
    preserveMepAttrs(heading, h1);
    foreground.append(h1);
  }

  // Supporting copy — every remaining paragraph (account for ragged content;
  // never drop a node). A paragraph that only re-stated the eyebrow/headline is
  // skipped so the headline is not echoed below itself.
  const headingText = heading ? collapse(heading.textContent) : '';
  paragraphs.forEach((p) => {
    const text = collapse(p.textContent);
    if (!text || text === headingText) return;
    const copy = createTag('p', { class: `${BLOCK}-copy` }, text);
    preserveMepAttrs(p, copy);
    foreground.append(copy);
  });

  // Ragged leftovers: standalone CTAs are preserved (moved, not discarded) into
  // an actions row. Only built when links actually exist (never an empty box).
  if (links.length) {
    const actions = createTag('div', { class: `${BLOCK}-actions` });
    links.forEach((node) => actions.append(node));
    foreground.append(actions);
  }

  // Single swap at the end — never an innerHTML wipe (C3/L2).
  el.replaceChildren(foreground);

  // Promote text to C2 typography via Milo's own service (heading → title-*,
  // copy → body-*); wrapped in decorateViewportContent for SSR/CSR parity. This
  // is purely additive enhancement on top of the reconstructed hooks, so it is
  // guarded — a throw must not brick the rebuilt, already-styled section.
  const decorate = (scope) => {
    const target = scope.querySelector?.(`.${BLOCK}-foreground`) || scope;
    try {
      decorateBlockText(target);
    } catch (e) {
      /* non-fatal: the scoped CSS styles the block without it */
    }
  };
  if (typeof decorateViewportContent === 'function') {
    try {
      decorateViewportContent(el, decorate);
    } catch (e) {
      decorate(el);
    }
  } else {
    decorate(el);
  }

  // Deterministic analytics floor for any surviving CTA.
  forgeTagAnalytics(el, daaLh);

  el.dataset.forgeAuthored = BLOCK;
}
