import { createTag, createOptimizedPicture } from '../../../utils/utils.js';

const VARIANTS = ['ratio-1-1', 'ratio-4-3', 'ratio-3-4', 'ratio-4-5', 'ratio-16-9'];
const DEFAULT_VARIANT = 'ratio-4-3';

function getVariant(el) {
  return VARIANTS.find((variant) => el.classList.contains(variant)) || DEFAULT_VARIANT;
}

function buildMedia(mediaWrapper) {
  const img = mediaWrapper?.querySelector('img');
  if (!img) return null;
  const picture = createOptimizedPicture(img.src, img.alt || '', true, false);
  return createTag('div', { class: 'card-media' }, picture);
}

function buildTextNodes(contentWrapper) {
  const textRoot = contentWrapper?.querySelector(':scope > div') || contentWrapper;
  const paragraphs = [...(textRoot?.querySelectorAll(':scope > p') || [])];
  const [titleEl, descEl, ctaP] = paragraphs;
  const nodes = [];

  if (titleEl?.textContent.trim()) {
    nodes.push(createTag('p', { class: 'card-title' }, titleEl.textContent.trim()));
  }
  if (descEl?.textContent.trim()) {
    nodes.push(createTag('p', { class: 'card-description' }, descEl.textContent.trim()));
  }
  return { nodes, ctaP };
}

function buildBody(contentWrapper) {
  const { nodes, ctaP } = buildTextNodes(contentWrapper);
  const body = createTag('div', { class: 'card-body' }, nodes);
  const cta = ctaP?.querySelector('a');
  if (cta) {
    body.append(createTag('a', {
      class: 'card-cta',
      href: cta.href,
    }, cta.textContent.trim()));
  }
  return body;
}

export default async function init(el) {
  if (el.classList.contains('hydrate')) {
    const { getHydrationPromise } = await import('../../../hydrate/hydrate.js');
    const hydrationPromise = getHydrationPromise();
    if (hydrationPromise) await hydrationPromise;
  }

  const [mediaWrapper, contentWrapper] = [...el.querySelectorAll(':scope > div')];
  const variant = getVariant(el);
  const media = buildMedia(mediaWrapper);

  if (!media) {
    el.remove();
    return;
  }

  const body = buildBody(contentWrapper);
  el.innerHTML = '';
  el.append(media, body);
  el.dataset.cardVariant = variant;

  // Session-hydrated cards carry routing data (data-session-id etc.); make them
  // clickable, routing by derived state. No-op for plain authored cards.
  if (el.dataset.sessionId) {
    const { default: attachSessionRouting } = await import('./session-routing.js');
    attachSessionRouting(el);
  }
}
