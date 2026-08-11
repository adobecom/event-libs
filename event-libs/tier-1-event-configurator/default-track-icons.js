// Temporary copy of v1/utils/track-icon-config.js's DEFAULT_TRACK_ICON_CONFIG
// (lives on the not-yet-merged MWPW-200314 branch). Consolidate once it merges.

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

// Shown for the Override Primary Event Site Track case (free-text, not a real track — no
// per-track icon/color to look up). Not one of DEFAULT_TRACK_ICON_CONFIG's entries since
// it isn't keyed by a track name.
export const DEFAULT_OVERRIDE_TRACK_ICON = { icon: 'star', color: '#6E6E6E' };

// Every known icon slug — the full set of <symbol> ids in track-icons.svg, plus 'star'
// (the override icon, not tied to any single track).
export const KNOWN_ICON_SLUGS = Object.freeze(
  [...new Set([...Object.values(DEFAULT_TRACK_ICON_CONFIG).map((entry) => entry.icon), 'star'])].sort(),
);

// Not DEFAULT_TRACK_ICON_CONFIG's per-track brand colors — this app's own
// default is always plain black (seeding and display share this constant).
export const DEFAULT_ICON_COLOR = '#000000';

export function slugifyTrackName(name) {
  return name ? name.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '') : '';
}

export function getDefaultTrackIcon(trackName) {
  const slug = slugifyTrackName(trackName);
  return DEFAULT_TRACK_ICON_CONFIG[trackName] || DEFAULT_TRACK_ICON_CONFIG[slug] || null;
}
