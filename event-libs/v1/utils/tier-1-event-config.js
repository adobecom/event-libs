import { getMetadata } from './utils.js';

// Reads the `tier-1-event-config` metadata once during decorateEvent, before any block's
// init(), so every block on the page can read it.
let initialized = false;
let tierOneEventConfig = {};

// Authors pick icon and colour explicitly; this is the only fallback.
export const DEFAULT_ICON_COLOR = '#000000';

function slugify(name) {
  return name ? name.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '') : '';
}

// Idempotent; no-ops after the first success and when the metadata is absent.
export function initTierOneEventConfig() {
  if (initialized) return;
  const raw = getMetadata('tier-1-event-config');
  if (!raw) return;
  initialized = true;
  try {
    tierOneEventConfig = JSON.parse(raw);
  } catch (err) {
    window.lana?.log(`[tier-1-event-config] invalid tier-1-event-config JSON: ${err.message}`);
    return;
  }
  // Catches an author pasting the wrong event's Config. Silent if either side is missing.
  const pageEventId = getMetadata('event-id');
  if (tierOneEventConfig.eventId && pageEventId && tierOneEventConfig.eventId !== pageEventId) {
    window.lana?.log(`[tier-1-event-config] eventId mismatch: config authored for ${tierOneEventConfig.eventId}, page is ${pageEventId}`);
  }
}

export function getTrackIcon(trackName) {
  if (!trackName) return null;
  const slug = slugify(trackName);
  const trackIcons = tierOneEventConfig.trackIcons || {};
  return trackIcons[trackName] || trackIcons[slug] || null;
}

// Each override text is mapped explicitly; there is no event-wide fallback. null when the
// text has no entry — callers apply DEFAULT_ICON_COLOR themselves.
export function getOverrideTrackIcon(overrideText) {
  if (!overrideText) return null;
  return (tierOneEventConfig.overrideTrackIcons?.byText || {})[overrideText] || null;
}

// { icon, pageUrl } or null. Purely the authored map, keyed by exact product name —
// no product icons exist anywhere to fall back to.
export function getProduct(productName) {
  if (!productName) return null;
  const products = tierOneEventConfig.products || {};
  return products[productName] || null;
}

export function getAllowDoubleBooking() {
  return !!tierOneEventConfig.allowDoubleBooking;
}

// Live playback pages, which differ per event. '' when unauthored; caller picks a fallback.
export function getHomepagePath() {
  return tierOneEventConfig.homepagePath || '';
}

export function getBroadcastPath() {
  return tierOneEventConfig.broadcastPath || '';
}

// Where Broadcast redirects once every session for the event has aired
// (session-broadcast/components/EndedState.js).
export function getSessionGuidePath() {
  return tierOneEventConfig.sessionGuidePath || '';
}
