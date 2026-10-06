import { createTag } from '../../../utils/utils.js';
import { logError, logWarning } from '../../../utils/lana-log.js';
import { parseVideoDurationMs } from '../../../utils/session-state.js';
import { safeUrl } from '../sessions-guide/utils/url.js';
import initEventCard from '../event-card/event-card.js';
import initEventCarousel from '../event-carousel/event-carousel.js';

function setRoutingData(card, entry) {
  card.dataset.timingBasis = 'video-duration';
  if (typeof entry.videoDuration === 'string') card.dataset.videoDuration = entry.videoDuration;
  if (entry.sessionId) card.dataset.sessionId = entry.sessionId;
  if (entry.mrStreamId) card.dataset.mrStreamId = entry.mrStreamId;
  if (entry.url) card.dataset.sessionUrl = entry.url;
  if (entry.isLivestreamed) card.dataset.isLivestreamed = 'true';
  if (entry.isOnline) card.dataset.isOnline = 'true';

  if (entry.watchDestination === 'homepage' || entry.watchDestination === 'broadcast') {
    card.dataset.watchDestination = entry.watchDestination;
    if (entry.watchDestination === 'homepage' && entry.homepageAnchorId) {
      card.dataset.homepageAnchorId = entry.homepageAnchorId;
    }
  }

  const { startTimeMillis, endTimeMillis } = entry.sessionTime || {};
  if (startTimeMillis) card.dataset.startTimeUtc = new Date(startTimeMillis).toISOString();
  if (endTimeMillis) card.dataset.endTimeUtc = new Date(endTimeMillis).toISOString();
  if (!entry.mrStreamId && entry.videoDuration != null && entry.videoDuration !== '') {
    const durationMs = parseVideoDurationMs(entry.videoDuration);
    const videoEnd = Date.parse(card.dataset.startTimeUtc) + durationMs;
    if (durationMs === null || !Number.isFinite(new Date(videoEnd).getTime())) {
      logWarning('featured-sessions', `invalid Video Duration for session ${entry.sessionId}; using scheduled end`);
    }
  }
}

// Mirrors Milo's decorateImageLinks: absolute *.aem.* / *.hlx.* URLs (e.g. an authored
// https://main--<repo>--<org>.aem.live/media_x.png) load from the current origin instead.
export function toRelativeMediaUrl(src) {
  if (!src) return src;
  try {
    const url = new URL(src);
    if (url.hostname.includes('.aem.') || url.hostname.includes('.hlx.')) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return src;
  } catch {
    return src;
  }
}

const DEFAULT_CTA_TEXT = {
  prior: 'Learn more',
  during: 'Watch now',
  after: 'Watch on-demand',
};

const TIME_PARTS_OPTIONS = { hour: 'numeric', minute: '2-digit', hour12: true };

function meridiemOf(parts) {
  return parts.find((part) => part.type === 'dayPeriod')?.value.toLowerCase() || '';
}

function digitsOf(parts) {
  return parts
    .filter((part) => part.type !== 'dayPeriod'
      && part.type !== 'timeZoneName'
      && !(part.type === 'literal' && part.value.trim() === ''))
    .map((part) => part.value)
    .join('');
}

export function formatSessionDateTime(sessionTime) {
  if (!sessionTime?.startTimeMillis || !sessionTime?.endTimeMillis) return '';
  try {
    const start = new Date(sessionTime.startTimeMillis);
    const end = new Date(sessionTime.endTimeMillis);
    const dateStr = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    const startParts = new Intl.DateTimeFormat('en-US', TIME_PARTS_OPTIONS).formatToParts(start);
    const endParts = new Intl.DateTimeFormat('en-US', {
      ...TIME_PARTS_OPTIONS,
      timeZoneName: 'short',
    }).formatToParts(end);

    const startMeridiem = meridiemOf(startParts);
    const endMeridiem = meridiemOf(endParts);
    const startLabel = digitsOf(startParts) + (startMeridiem === endMeridiem ? '' : startMeridiem);
    const endLabel = digitsOf(endParts) + endMeridiem;
    const tzAbbr = endParts.find((part) => part.type === 'timeZoneName')?.value || '';

    const tzSuffix = tzAbbr ? ` ${tzAbbr}` : '';
    return `${dateStr}, ${startLabel}–${endLabel}${tzSuffix}`;
  } catch (error) {
    logError('featured-sessions', 'date/time format failed', error);
    return '';
  }
}

function buildAuthoredCard(entry, cta) {
  const card = createTag('div', { class: 'event-card media-square' });
  const mediaWrapper = createTag('div', {}, '', { parent: card });
  if (entry.imageUrl) {
    createTag('img', { src: toRelativeMediaUrl(entry.imageUrl), alt: '' }, '', { parent: mediaWrapper });
  }

  const contentWrapper = createTag('div', {}, '', { parent: card });
  const textRoot = createTag('div', {}, '', { parent: contentWrapper });
  createTag('p', {}, '', { parent: textRoot }).textContent = entry.enTitle || '';
  createTag('p', {}, '', { parent: textRoot }).textContent = formatSessionDateTime(entry.sessionTime);
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
    logError('featured-sessions', 'failed to parse config', error);
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
