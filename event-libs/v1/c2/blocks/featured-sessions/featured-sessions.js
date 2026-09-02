import { createTag } from '../../../utils/utils.js';
import { safeUrl } from '../sessions-guide/utils/url.js';
import initEventCard from '../event-card/event-card.js';
import initEventCarousel from '../event-carousel/event-carousel.js';

function setRoutingData(card, entry) {
  if (entry.sessionId) card.dataset.sessionId = entry.sessionId;
  if (entry.mrStreamId) card.dataset.mrStreamId = entry.mrStreamId;
  if (entry.url) card.dataset.sessionUrl = entry.url;
  if (entry.isLivestreamed) card.dataset.isLivestreamed = 'true';
  if (entry.isOnline) card.dataset.isOnline = 'true';

  const { startTimeMillis, endTimeMillis } = entry.sessionTime || {};
  if (startTimeMillis) card.dataset.startTimeUtc = new Date(startTimeMillis).toISOString();
  if (endTimeMillis) card.dataset.endTimeUtc = new Date(endTimeMillis).toISOString();
}

const DEFAULT_CTA_TEXT = {
  prior: 'Learn more',
  during: 'Watch now',
  after: 'Watch on-demand',
};

function buildAuthoredCard(entry, cta) {
  const card = createTag('div', { class: 'event-card media-wide' });
  const mediaWrapper = createTag('div', {}, '', { parent: card });
  if (entry.imageUrl) {
    createTag('img', { src: entry.imageUrl, alt: '' }, '', { parent: mediaWrapper });
  }

  const contentWrapper = createTag('div', {}, '', { parent: card });
  const textRoot = createTag('div', {}, '', { parent: contentWrapper });
  createTag('p', {}, '', { parent: textRoot }).textContent = entry.enTitle || '';
  createTag('p', {}, '', { parent: textRoot }).textContent = entry.track || '';
  const ctaP = createTag('p', {}, '', { parent: textRoot });
  const ctaHref = safeUrl(entry.url);
  if (ctaHref) {
    const ctaLink = createTag('a', { href: ctaHref }, cta?.prior || DEFAULT_CTA_TEXT.prior, { parent: ctaP });
    ctaLink.dataset.ctaPrior = cta?.prior || DEFAULT_CTA_TEXT.prior;
    ctaLink.dataset.ctaDuring = cta?.during || DEFAULT_CTA_TEXT.during;
    ctaLink.dataset.ctaAfter = cta?.after || DEFAULT_CTA_TEXT.after;
  }

  setRoutingData(card, entry);
  return card;
}

export default async function init(el) {
  let config = null;
  try {
    config = el.dataset.featuredSessionsConfig ? JSON.parse(el.dataset.featuredSessionsConfig) : null;
  } catch (error) {
    window.lana?.log(`featured-sessions: failed to parse config: ${error.message}`);
    el.remove();
    return;
  }

  const entries = Array.isArray(config?.entries) ? config.entries : [];
  if (!entries.length) {
    el.remove();
    return;
  }

  el.innerHTML = '';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Featured Sessions');

  const track = createTag('div', { class: 'carousel-track' });
  const cards = entries.map((entry) => buildAuthoredCard(entry, config.cta));
  cards.forEach((card) => track.append(card));

  const marker = createTag('div', { class: 'event-carousel' });
  el.append(marker, track);

  await Promise.all(cards.map((card) => initEventCard(card)));

  if (!track.children.length) {
    el.remove();
    return;
  }

  await initEventCarousel(marker);
}
