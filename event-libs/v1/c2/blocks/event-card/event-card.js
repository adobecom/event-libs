import { createTag, createOptimizedPicture, loadStyle } from '../../../utils/utils.js';
import { deriveSessionState, getNowMs } from '../../../utils/session-state.js';
import { subscribe } from '../../../services/sessions/poller.js';

const VARIANTS = ['media-square', 'media-standard', 'media-standard-rev', 'standard-m', 'media-wide', 'media-tall'];
const DEFAULT_VARIANT = 'media-standard';
const BLOCK_CSS_URL = new URL('./event-card.css', import.meta.url).href;

const CTA_STATE_ATTR = { upcoming: 'ctaPrior', live: 'ctaDuring', 'on-demand': 'ctaAfter' };

function refreshCtaText(el, cta, getLiveStreamActiveIds) {
  const state = deriveSessionState({
    startTimeUtc: el.dataset.startTimeUtc,
    endTimeUtc: el.dataset.endTimeUtc,
    mrStreamId: el.dataset.mrStreamId,
  }, getLiveStreamActiveIds(), getNowMs());
  const text = cta.dataset[CTA_STATE_ATTR[state]];
  if (text) cta.textContent = text;
  return state;
}

function scheduleBoundary(atMs, onBoundary) {
  if (!Number.isFinite(atMs)) return;
  const delay = atMs - getNowMs();
  setTimeout(onBoundary, Math.max(delay, 0));
}

function attachLiveCtaText(el, cta, getLiveStreamActiveIds) {
  const mrStreamId = el.dataset.mrStreamId;
  const startMs = Date.parse(el.dataset.startTimeUtc);
  const endMs = Date.parse(el.dataset.endTimeUtc);

  const state = refreshCtaText(el, cta, getLiveStreamActiveIds);

  if (state === 'upcoming') {
    scheduleBoundary(startMs, () => refreshCtaText(el, cta, getLiveStreamActiveIds));
  }

  if (mrStreamId) {
    subscribe(() => refreshCtaText(el, cta, getLiveStreamActiveIds), [mrStreamId]);
  } else if (state !== 'on-demand') {
    scheduleBoundary(endMs, () => refreshCtaText(el, cta, getLiveStreamActiveIds));
  }
}

function getVariant(el) {
  return VARIANTS.find((variant) => el.classList.contains(variant)) || DEFAULT_VARIANT;
}

function isSameOrigin(url) {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function buildPicture(url, alt) {
  if (isSameOrigin(url)) return createOptimizedPicture(url, alt, true, false);
  return createTag('picture', {}, createTag('img', { src: url, loading: 'lazy', alt }));
}

function buildMedia(mediaWrapper) {
  const img = mediaWrapper?.querySelector('img');
  if (img) {
    return createTag('div', { class: 'card-media' }, buildPicture(img.src, img.alt || ''));
  }

  const url = mediaWrapper?.querySelector(':scope > div')?.textContent.trim();
  if (!url) return null;
  return createTag('div', { class: 'card-media' }, buildPicture(url, ''));
}

function buildTextNodes(contentWrapper) {
  const textRoot = contentWrapper?.querySelector(':scope > div') || contentWrapper;
  const paragraphs = [...(textRoot?.querySelectorAll(':scope > p') || [])];
  const [titleEl, descEl, ctaP] = paragraphs;
  const nodes = [];
  const title = titleEl?.textContent.trim() || '';

  if (title) {
    nodes.push(createTag('p', { class: 'card-title' }, title));
  }
  if (descEl?.textContent.trim()) {
    nodes.push(createTag('p', { class: 'card-description' }, descEl.textContent.trim()));
  }
  return { nodes, ctaP, title };
}

function buildBody(contentWrapper) {
  const { nodes, ctaP, title } = buildTextNodes(contentWrapper);
  const body = createTag('div', { class: 'card-body' }, nodes);
  const cta = ctaP?.querySelector('a');
  if (cta) {
    const cardCta = createTag('a', {
      class: 'card-cta',
      href: cta.href,
    }, cta.textContent.trim());
    Object.assign(cardCta.dataset, cta.dataset);
    const daaLl = cta.hasAttribute('daa-ll')
      ? cta.getAttribute('daa-ll')
      : `${cta.textContent.trim()}-1|${title}`;
    cardCta.setAttribute('daa-ll', daaLl);
    body.append(cardCta);
  }
  return body;
}

export default async function init(el) {
  loadStyle(BLOCK_CSS_URL);

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

  if (el.dataset.sessionId) {
    const { default: attachSessionRouting, getLiveStreamActiveIds } = await import('../../../utils/session-routing.js');
    attachSessionRouting(el);

    if (!el.hasAttribute('daa-ll')) {
      const title = body.querySelector('.card-title')?.textContent.trim() || '';
      el.setAttribute('daa-ll', `Session-Card-1|${title}`);
    }

    const cta = body.querySelector('.card-cta');
    if (cta) attachLiveCtaText(el, cta, getLiveStreamActiveIds);
  }
}
