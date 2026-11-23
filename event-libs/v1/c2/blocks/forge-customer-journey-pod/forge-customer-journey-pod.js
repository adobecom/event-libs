/**
 * forge-customer-journey-pod — a Milo C2 block authored by Forge for a dark,
 * full-bleed call-to-action banner ("pod"): a colourful faceted gradient art
 * field weighted to the right, with a left-aligned white heading, a short
 * supporting paragraph, and a white-outline pill CTA.
 *
 * RUNTIME CONTENT SHAPE (the DA serialization init() actually receives) is a
 * FLAT, class-LESS run of semantic nodes in document order — a heading, a
 * paragraph, and a link — with NO background div, NO container, NO Figma
 * classes. So init() PROBES the content by shape (never by an authored class)
 * and RECONSTRUCTS the banner: it builds the decorative background layer and a
 * constrained content column with createElement, MOVES the authored nodes into
 * it (preserving their attributes + MEP markers), stamps the structural +
 * typography classes the scoped CSS keys on, then runs Milo's own decorate
 * services over the content so the block is a real Milo decorator.
 *
 * @param {HTMLElement} el  The block element Milo passes to every C2 decorator.
 * @returns {Promise<void>}
 */
// CANONICAL DEPTH: from libs/c2/blocks/<name>/ to libs/utils/decorate.js is
// THREE hops up (blocks -> c2 -> libs). The 3-hop '../../../' form is CORRECT.
import { decorateBlockText, decorateViewportContent } from '../../../utils/forge-milo-compat.js';

const BLOCK = 'forge-customer-journey-pod';

// MEP / personalization markers Milo stamps on the row/cell wrapper. The
// rebuild discards that wrapper, so copy any present marker up onto the block
// root FIRST — a node swap that drops them silently disables Target/MEP.
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

// Disambiguates daa-lh across N same-name instances on one page (1-based idx).
function forgeInstanceSuffix(element, blockName) {
  const instances = [...document.querySelectorAll(`.${blockName}`)];
  const idx = instances.indexOf(element);
  return instances.length > 1 && idx >= 0 ? `-${idx + 1}` : '';
}

// Deterministic analytics floor — tags any link/button/image left untagged.
// Idempotent: skips nodes that already carry daa-ll / daa-im.
function forgeTagAnalytics(scope, label) {
  if (!scope) return;
  const slugify = (text) => String(text || '')
    .trim().toLowerCase()
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

function ce(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// Split a trailing "(opens in a new window)" affordance out of the visible
// label into a visually-hidden span, and mark the link as a new-window link.
function decorateCta(link, daaLh) {
  link.classList.add('customer-journey-pod-cta', 'con-button', 'outline');
  const raw = (link.textContent || '').trim();
  const match = raw.match(/^(.*?)\s*(\(opens in a new window\))\s*$/i);
  if (match) {
    link.textContent = match[1].trim();
    const sr = ce('span', 'sr-only');
    sr.textContent = ` ${match[2]}`;
    link.appendChild(sr);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }
  if (!link.hasAttribute('daa-ll')) {
    const label = (match ? match[1] : raw).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    link.setAttribute('daa-ll', `${daaLh}|${label || 'cta'}`);
  }
}

export default async function init(el) {
  if (!el) return;

  const daaLh = `${BLOCK}${forgeInstanceSuffix(el, BLOCK)}`;
  el.setAttribute('daa-lh', daaLh);

  // Lift MEP markers off the EDS cell wrapper before we discard it.
  const cell = el.querySelector(':scope > div > div') || el.querySelector(':scope > div');
  preserveMepAttrs(cell?.parentElement || cell, el);

  // PROBE the flat content by shape, never by an authored class.
  const title = el.querySelector('h1, h2, h3, h4, h5, h6');
  const cta = el.querySelector('a[href]');
  const ctaWrap = cta ? cta.closest('p') : null;
  const descParas = [...el.querySelectorAll('p')].filter((p) => {
    if (!cta) return true;
    // Skip a paragraph that exists only to wrap the CTA link.
    return !(p === ctaWrap && p.textContent.trim() === cta.textContent.trim());
  });

  // RECONSTRUCT the banner. Decorative art layer first, then the content column.
  const background = ce('div', 'customer-journey-pod-background');
  background.setAttribute('aria-hidden', 'true');

  const container = ce('div', 'customer-journey-pod-container');
  const content = ce('div', 'customer-journey-pod-content');

  if (title) {
    title.classList.add('customer-journey-pod-title', 'heading-xl');
    content.appendChild(title);
  }
  descParas.forEach((p) => {
    p.classList.add('customer-journey-pod-description', 'body-m');
    content.appendChild(p);
  });
  if (cta) {
    decorateCta(cta, daaLh);
    const actions = ce('div', 'customer-journey-pod-actions');
    actions.appendChild(cta);
    content.appendChild(actions);
  }
  container.appendChild(content);

  // Single structural swap (never innerHTML wipe): art layer + content column.
  el.replaceChildren(background, container);

  // Promote text to C2 typography via Milo's own service. Scoped CSS keys on the
  // block's own classes, so this is additive — the visual never depends on it.
  const decorate = (scope) => {
    const target = scope.querySelector?.('.customer-journey-pod-content') || scope;
    if (target && typeof decorateBlockText === 'function') decorateBlockText(target, ['xl', 'm', 's']);
  };
  if (typeof decorateViewportContent === 'function') {
    decorateViewportContent(el, decorate);
  } else {
    decorate(el);
  }

  forgeTagAnalytics(el, daaLh);
  el.dataset.forgeAuthored = BLOCK;
}
