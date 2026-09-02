import { createTag } from '../../../utils/utils.js';
import { safeUrl } from '../sessions-guide/utils/url.js';
import initEventCard from '../event-card/event-card.js';
import initEventCarousel from '../event-carousel/event-carousel.js';

// Mirrors hydrate/event-card.js's retired applySessionData mapping — the only piece of
// that mechanism still worth keeping, since these data-* attributes are what
// session-routing.js (wired up by event-card.js's own init(), see below) reads to
// resolve a card's click behavior.
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

// Builds the same "pre-hydration" DOM shape event-card.js's own init() already expects
// from hand-authored markup (media wrapper with an <img>, content wrapper with
// title/description/CTA <p>s) — letting init() do the real work (buildMedia/buildBody,
// plus wiring session-routing.js off the data-session-id we set below) instead of
// duplicating any of that here. A session with no image is left for event-card.js's own
// existing rule ("a card with no image is not a valid authored card") to drop.
//
// entry.enTitle/entry.track are attacker-influenced (decoded straight from the link's
// hash payload, not hand-authored in DA) — createTag's string `html` argument runs
// through insertAdjacentHTML, so these are set via .textContent instead to keep them
// as inert text rather than parsed markup. Same reasoning applies to entry.url below:
// it's set as an href only after passing safeUrl's http(s)/relative allowlist, since a
// card with no sessionId never gets session-routing.js's click interception (and thus
// never gets safeUrl's own re-check) and would otherwise navigate a raw click straight
// off the unsanitized href.
// Default wording, used when the configurator's own three CTA text boxes (config.cta)
// are left blank for a given state. event-card.js is the single source of truth for
// *which* state applies and *when* the text updates (deriveSessionState + getNowMs, so
// it honors ?serverTime=) — this module only supplies the authored strings per state
// and a safe static seed (prior) to paint before that logic takes over.
const DEFAULT_CTA_TEXT = {
  prior: 'Learn more',
  during: 'Watch now',
  after: 'Watch on-demand',
};

// No theme wiring here — event-card.js's own getTheme() reads dark/light straight off
// the containing DA section's "dark" style-metadata class, so a card built here themes
// itself automatically along with whatever section it ends up in.
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
