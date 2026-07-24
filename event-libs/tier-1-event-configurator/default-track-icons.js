// Temporary copy of event-libs/v1/utils/track-icon-config.js's
// DEFAULT_TRACK_ICON_CONFIG + slugify, which lives on the not-yet-merged
// MWPW-200314 branch. Icon slugs match track-icons.svg's <symbol> ids
// (also copied locally into ./assets/track-icons.svg). Consolidate back
// onto the real utility once that branch merges.

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

// Every known icon slug — the full set of <symbol> ids in track-icons.svg,
// same list as DEFAULT_TRACK_ICON_CONFIG's own icon values.
export const KNOWN_ICON_SLUGS = Object.freeze(
  [...new Set(Object.values(DEFAULT_TRACK_ICON_CONFIG).map((entry) => entry.icon))].sort(),
);

// Deliberately not DEFAULT_TRACK_ICON_CONFIG's per-track brand colors —
// this authoring app's own default (seeded and displayed) is always plain
// black. Shared so ConfigsContext's seeding and TrackIconEditor's display
// can't drift apart.
export const DEFAULT_ICON_COLOR = '#000000';

export function slugifyTrackName(name) {
  return name ? name.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '') : '';
}

export function getDefaultTrackIcon(trackName) {
  const slug = slugifyTrackName(trackName);
  return DEFAULT_TRACK_ICON_CONFIG[trackName] || DEFAULT_TRACK_ICON_CONFIG[slug] || null;
}
