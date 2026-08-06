const PAGES = {
  home: 'home',
  schedules: 'schedules',
};

const PAGES_CONFIG = {
  home: {
    label: 'Home',
    pageComponent: PAGES.home,
  },
  editSchedule: {
    label: 'Edit Schedule',
    pageComponent: PAGES.schedules,
    mode: 'edit',
  },
  importSheet: {
    label: 'Import Sheet',
    pageComponent: PAGES.schedules,
    mode: 'import',
  },
};

const DEFAULT_FRAGMENT_PATH = '/events/events-shared/fragments';

const DA_ADMIN_ORIGIN = 'https://admin.da.live';

const DA_ORIGIN = 'https://da.live';

const DA_APP_PATH = 'tools/da-apps/schedule-maker';

// Sync's rewrite pass that migrates non-canonical schedule links (old
// ECC-hosted links on any domain, or old ?schedule= query-param links) to the
// canonical DA app URL — see rewriteNonCanonicalScheduleLinks in
// da-controller.js. Turn this off once a live scan has migrated everything so
// routine syncs don't re-scan every doc's hrefs for something that no longer
// occurs. Flip back to true if legacy links resurface (e.g. an old doc gets
// restored, or an author pastes a stale ECC link from an old source).
const ENABLE_LEGACY_LINK_MIGRATION = false;

export {
  PAGES,
  PAGES_CONFIG,
  DEFAULT_FRAGMENT_PATH,
  DA_ADMIN_ORIGIN,
  DA_ORIGIN,
  DA_APP_PATH,
  ENABLE_LEGACY_LINK_MIGRATION,
};
