import { createTag } from '../../../utils/utils.js';
import initEventCard from '../event-card/event-card.js';

// Mirrors hydrate/event-card.js's retired applySessionData mapping — the only piece of
// that mechanism still worth keeping, since these data-* attributes are what
// session-routing.js (wired up by event-card.js's own init(), see below) reads to
// resolve a card's click behavior.
function setRoutingData(card, entry) {
  if (entry.sessionId) card.dataset.sessionId = entry.sessionId;
  if (entry.mrStreamId) card.dataset.mrStreamId = entry.mrStreamId;
  if (entry.url) card.dataset.sessionUrl = entry.url;
  if (entry.watchUrl) card.dataset.watchUrl = entry.watchUrl;

  const { startTimeMillis, endTimeMillis } = entry.sessionTime || {};
  if (startTimeMillis) card.dataset.startTimeUtc = new Date(startTimeMillis).toISOString();
  if (endTimeMillis) card.dataset.endTimeUtc = new Date(endTimeMillis).toISOString();
}

// Builds the same "pre-hydration" DOM shape event-card.js's own init() already expects
// from hand-authored markup (media wrapper with an <img>, content wrapper with
// title/description/CTA <p>s) — letting init() do the real work (buildMedia/buildBody,
// plus wiring session-routing.js off the data-session-id we set below) instead of
// duplicating any of that here. A session with no image is left for event-card.js's own
// existing rule ("a card with no image is not a valid authored card") to drop.
function buildAuthoredCard(entry) {
  const card = createTag('div', { class: 'event-card' });
  const mediaWrapper = createTag('div', {}, '', { parent: card });
  if (entry.imageUrl) {
    createTag('img', { src: entry.imageUrl, alt: '' }, '', { parent: mediaWrapper });
  }

  const contentWrapper = createTag('div', {}, '', { parent: card });
  const textRoot = createTag('div', {}, '', { parent: contentWrapper });
  createTag('p', {}, entry.enTitle || '', { parent: textRoot });
  createTag('p', {}, entry.track || '', { parent: textRoot });
  const ctaP = createTag('p', {}, '', { parent: textRoot });
  if (entry.url) createTag('a', { href: entry.url }, 'Learn more', { parent: ctaP });

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

  const heading = config?.heading || 'Featured Sessions';

  el.innerHTML = '';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', heading);
  createTag('h6', { class: 'featured-sessions-heading' }, heading, { parent: el });

  const track = createTag('div', { class: 'featured-sessions-track' }, '', { parent: el });
  const cards = entries.map(buildAuthoredCard);
  cards.forEach((card) => track.append(card));

  await Promise.all(cards.map((card) => initEventCard(card)));

  if (!track.children.length) el.remove();
}
