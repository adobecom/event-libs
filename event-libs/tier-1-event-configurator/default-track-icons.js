// Both default icon configs are defined once in v1/utils/tier-1-event-config.js (the
// consuming side) and re-exported here so this app's icon pickers don't carry a second,
// independently-drifting copy.
import { useState, useEffect } from '../v1/deps/htm-preact.js';
import { fetchFederalIconList } from '../v1/features/icons/federal-icons.js';
import { DEFAULT_TRACK_ICON_CONFIG, DEFAULT_OVERRIDE_TRACK_ICON } from '../v1/utils/tier-1-event-config.js';

export { DEFAULT_TRACK_ICON_CONFIG, DEFAULT_OVERRIDE_TRACK_ICON };

// Every known icon slug — the full set of <symbol> ids in track-icons.svg, plus 'star'
// (the override icon, not tied to any single track). Used as the synchronous initial
// state for useIconSlugOptions() below, and as a fallback if federal's list can't be
// fetched.
export const KNOWN_ICON_SLUGS = Object.freeze(
  [...new Set([...Object.values(DEFAULT_TRACK_ICON_CONFIG).map((entry) => entry.icon), 'star'])].sort(),
);

// Live-merges KNOWN_ICON_SLUGS with federal's actual inventory (fetched once, cached in
// federal-icons.js) — newly-uploaded federal icons show up in icon pickers with no
// event-libs code change, while already-curated/authored slugs stay selectable even
// before they land there.
export function useIconSlugOptions() {
  const [slugs, setSlugs] = useState(KNOWN_ICON_SLUGS);

  useEffect(() => {
    let cancelled = false;
    fetchFederalIconList().then((federalSlugs) => {
      if (cancelled || federalSlugs.length === 0) return;
      setSlugs([...new Set([...KNOWN_ICON_SLUGS, ...federalSlugs])].sort());
    });
    return () => { cancelled = true; };
  }, []);

  return slugs;
}

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
