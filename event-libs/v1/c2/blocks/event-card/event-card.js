import { createTag, createOptimizedPicture, loadStyle } from '../../../utils/utils.js';
import { deriveSessionState, getNowMs } from '../../../utils/session-state.js';
import { subscribe } from '../../../services/sessions/poller.js';

const VARIANTS = ['media-square', 'media-standard', 'media-standard-rev', 'standard-m', 'media-wide', 'media-tall'];
const DEFAULT_VARIANT = 'media-standard';
const BLOCK_CSS_URL = new URL('./event-card.css', import.meta.url).href;

// live/on-demand swap the authored CTA copy to reflect session state; upcoming keeps
// whatever was authored (e.g. "Add to calendar"), since it isn't a watch action yet.
const LIVE_CTA_TEXT = { live: 'Watch now', 'on-demand': 'Watch on demand' };

function refreshCtaText(el, cta, getLiveStreamActiveIds) {
  const state = deriveSessionState({
    startTimeUtc: el.dataset.startTimeUtc,
    endTimeUtc: el.dataset.endTimeUtc,
    mrStreamId: el.dataset.mrStreamId,
  }, getLiveStreamActiveIds(), getNowMs());
  const text = LIVE_CTA_TEXT[state];
  if (text) cta.textContent = text;
  return state;
}

// Mirrors upcoming-sessions.js's scheduleStateTimers: an exact setTimeout fired right at
// the boundary instant, not a shared poll, so the CTA text flips in lockstep with that
// block instead of lagging behind on some independent interval.
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
    // MR sessions have no fixed end instant to schedule against — the poller (already
    // registered by session-routing.js's attachSessionRouting) is the only signal for
    // when the stream actually goes inactive, so re-check on every one of its updates.
    subscribe(() => refreshCtaText(el, cta, getLiveStreamActiveIds), [mrStreamId]);
  } else if (state !== 'on-demand') {
    scheduleBoundary(endMs, () => refreshCtaText(el, cta, getLiveStreamActiveIds));
  }
}

function getVariant(el) {
  return VARIANTS.find((variant) => el.classList.contains(variant)) || DEFAULT_VARIANT;
}

// Dark/light is section-driven, not per-card: decorate.js's applyAreaTheme() (and DA's
// own Section Metadata "style: dark" authoring) already lands a plain "dark" class
// directly on the ancestor `.section` — the same signal every other themed block in
// this repo keys off, so a card automatically flips to dark the moment its section
// does, with nothing to author or wire up per-card or per-block. `dark-card` on the
// card itself is still honored as a manual override, for a card that needs to force
// dark independent of its section (or a section not yet migrated to the metadata
// convention). Light is the default: no class anywhere means light.
const DEFAULT_THEME = 'light';

function getTheme(el) {
  if (el.classList.contains('dark-card')) return 'dark';
  if (el.closest('.section')?.classList.contains('dark')) return 'dark';
  return DEFAULT_THEME;
}

function isSameOrigin(url) {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

// createOptimizedPicture's relative=true mode drops everything but the URL's pathname —
// correct for same-origin, Helix-optimized authored images, but it silently requests the
// wrong host for a cross-origin one (e.g. a DA content.da.live upload, or any other full
// URL a data-driven card carries). Cross-origin sources get a plain <img> at the real
// absolute URL instead, trading away responsive width variants for the image loading at
// all regardless of where it's hosted.
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
  loadStyle(BLOCK_CSS_URL);

  const [mediaWrapper, contentWrapper] = [...el.querySelectorAll(':scope > div')];
  const variant = getVariant(el);
  const theme = getTheme(el);
  const media = buildMedia(mediaWrapper);

  if (!media) {
    el.remove();
    return;
  }

  const body = buildBody(contentWrapper);
  el.innerHTML = '';
  el.append(media, body);
  el.dataset.cardVariant = variant;
  el.dataset.cardTheme = theme;

  if (el.dataset.sessionId) {
    const { default: attachSessionRouting, getLiveStreamActiveIds } = await import('../../../utils/session-routing.js');
    attachSessionRouting(el);

    const cta = body.querySelector('.card-cta');
    if (cta) attachLiveCtaText(el, cta, getLiveStreamActiveIds);
  }
}
