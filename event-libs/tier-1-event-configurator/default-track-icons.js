// Both default icon configs are defined once in v1/utils/tier-1-event-config.js (the
// consuming side) and re-exported here so this app's icon pickers don't carry a second,
// independently-drifting copy.
import { DEFAULT_TRACK_ICON_CONFIG, DEFAULT_OVERRIDE_TRACK_ICON } from '../v1/utils/tier-1-event-config.js';

export { DEFAULT_TRACK_ICON_CONFIG, DEFAULT_OVERRIDE_TRACK_ICON };

// Every known icon slug, plus 'star' (the override icon). Used as useIconSlugOptions()'s
// base list — the synchronous initial state before federal's live inventory resolves,
// and the fallback if that fetch fails.
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
