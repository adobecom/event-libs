import { getMetadata } from './utils.js';

// Page-level, one-shot bootstrap for the Tier 1 Event Configurator app's authored output
// (Config JSON pasted into the `tier-1-event-config` metadata row), mirroring
// session-store.js's initSessionState() pattern. Read once during decorateEvent, before
// any block's own init() runs, so any block on the page can call getTrackIcon()/
// getAllowDoubleBooking().
let initialized = false;
let tierOneEventConfig = {};

// Built-in fallback so real, known Track values render a curated icon/color out of the
// box even before a page authors trackIcons — authored config always takes priority
// (checked first in getTrackIcon), this only fills gaps. Ported 1:1 from the old
// CategoryBadge.js BADGE_MAP + sessions-guide.js MOCK_CATEGORY_COLORS.
const DEFAULT_TRACK_ICON_CONFIG = {
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

function slugify(name) {
  return name ? name.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '') : '';
}

export function initTierOneEventConfig() {
  if (initialized) return;
  initialized = true;
  const raw = getMetadata('tier-1-event-config');
  if (!raw) return;
  try {
    tierOneEventConfig = JSON.parse(raw);
  } catch (err) {
    window.lana?.log(`[tier-1-event-config] invalid tier-1-event-config JSON: ${err.message}`);
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

export function getAllowDoubleBooking() {
  return !!tierOneEventConfig.allowDoubleBooking;
}
