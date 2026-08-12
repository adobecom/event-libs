import { getMetadata } from './utils.js';

// Page-level bootstrap for the Tier 1 Event Configurator app's authored output (Config
// JSON pasted into the `tier-1-event-config` metadata row). Read once during
// decorateEvent, before any block's own init() runs, so any block on the page can call
// getTrackIcon()/getAllowDoubleBooking()/getFeaturedSessionIds().
let initialized = false;
let tierOneEventConfig = {};

// Built-in fallback so real, known Track values render a curated icon/color out of the
// box even before a page authors trackIcons — authored config always takes priority
// (checked first in getTrackIcon), this only fills gaps. Exported so
// tier-1-event-configurator/default-track-icons.js (which needs the same defaults for
// its own icon pickers) doesn't carry a second, independently-drifting copy.
export const DEFAULT_TRACK_ICON_CONFIG = {
  'social-media': { icon: 'social-media', color: '#FF6B35' },
  'design-and-illustration': { icon: 'design-and-illustration', color: '#9D50BB' },
  mainstage: { icon: 'mainstage', color: '#E91E63' },
  '3d': { icon: '3d', color: '#00BCD4' },
  photography: { icon: 'photography', color: '#4CAF50' },
  business: { icon: 'business', color: '#2196F3' },
  'content-creator': { icon: 'content-creator', color: '#FF9800' },
  education: { icon: 'education', color: '#FF5722' },
  branding: { icon: 'branding', color: '#607D8B' },
  'generative-ai': { icon: 'generative-ai', color: '#8BC34A' },
  video: { icon: 'video', color: '#F44336' },
  'video-audio-and-motion': { icon: 'video-audio-and-motion', color: '#E53935' },
  'social-media-and-marketing': { icon: 'social-media-and-marketing', color: '#FF7043' },
  'graphic-design-and-illustration': { icon: 'graphic-design-and-illustration', color: '#AB47BC' },
  creator: { icon: 'creator', color: '#FFB300' },
  'creativity-and-marketing-in-business': { icon: 'creativity-and-marketing-in-business', color: '#42A5F5' },
};

// Fallback icon/color for the free-text Override Primary Event Site Track (no per-track
// lookup possible) — authored config always wins, this only fills the gap. Exported for
// the same reason as DEFAULT_TRACK_ICON_CONFIG.
export const DEFAULT_OVERRIDE_TRACK_ICON = { icon: 'star', color: '#6E6E6E' };

function slugify(name) {
  return name ? name.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '') : '';
}

// Idempotent — safe to call multiple times; no-ops after the first successful init
// and when the essential tier-1-event-config metadata is absent (mirrors
// session-store.js's initSessionState() gate on rainfocus-api-url).
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
  // Catches the real failure mode this manual copy/paste hand-off invites: an author
  // pastes the wrong event's Config onto a page. Only warn on an actual mismatch —
  // skip silently if either side is missing (e.g. an older Config with no eventId).
  const pageEventId = getMetadata('event-id');
  if (tierOneEventConfig.eventId && pageEventId && tierOneEventConfig.eventId !== pageEventId) {
    window.lana?.log(`[tier-1-event-config] eventId mismatch: config authored for ${tierOneEventConfig.eventId}, page is ${pageEventId}`);
  }
}

export function getTrackIcon(trackName) {
  if (!trackName) return null;
  const slug = slugify(trackName);
  const trackIcons = tierOneEventConfig.trackIcons || {};
  return trackIcons[trackName]
    || trackIcons[slug]
    || DEFAULT_TRACK_ICON_CONFIG[trackName]
    || DEFAULT_TRACK_ICON_CONFIG[slug]
    || null;
}

// Each distinct override text is its own swimlane — overrideTrackIcons maps a specific
// text to its own icon/color, overrideTrackIcon (singular) is the event-wide default for
// any text not yet mapped.
export function getOverrideTrackIcon(overrideText) {
  const perTextIcons = tierOneEventConfig.overrideTrackIcons || {};
  return perTextIcons[overrideText]
    || tierOneEventConfig.overrideTrackIcon
    || DEFAULT_OVERRIDE_TRACK_ICON;
}

// Returns { icon, pageUrl } for a product, or null. No built-in default map (unlike
// tracks) — no product icons exist anywhere yet (not federal, not event-libs' own
// sprite), so there's nothing sensible to fall back to; this is purely the authored map,
// keyed by the exact product name.
export function getProduct(productName) {
  if (!productName) return null;
  const products = tierOneEventConfig.products || {};
  return products[productName] || null;
}

export function getAllowDoubleBooking() {
  return !!tierOneEventConfig.allowDoubleBooking;
}

export function getFeaturedSessionIds() {
  return tierOneEventConfig.featuredSessions || [];
}
