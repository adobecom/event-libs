// One config-library sheet per content-repo (da-events, each floodgate space, etc.) —
// resolved against whichever org/repo the DA SDK handshake reports.
const CONFIGS_SHEET_PATH = '/tools/da-apps/tier-1-event-configurator/configs.json';

// Fixed, app-owned upload target for session images — authors never pick or see this path.
// Must live under the site's actual published content tree (events/...), not under
// tools/da-apps/... — that's just where this app's own loader HTML lives, and isn't part of
// the site's Helix content mount, so preview/publish never resolves it to a servable URL.
const MEDIA_FOLDER_PATH = '/events/homepage-assets';

// Used to build the "Copy Link" URL authors paste into a block's section-metadata — same
// shape as Schedule Maker's DA_ORIGIN/DA_APP_PATH (event-libs/schedule-maker/constants.js).
const DA_ORIGIN = 'https://da.live';
const DA_APP_PATH = 'tools/da-apps/tier-1-event-configurator';

// Hash param key the app looks for on mount to deep-link straight into a Homepage config's
// editor (see TierOneEventConfigurator.js) — distinct from Schedule Maker's own `schedule=`
// key since both could in principle appear in the same browser session.
const HOMEPAGE_LINK_HASH_KEY = 'tecHomepage';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

// Two config surfaces: Global (pasted into an event page's tier-1-event-config
// metadata, consumed across the event experience — Session Guide, Event App, etc.)
// and Homepage (pasted into a single homepage block's own section-metadata —
// upcoming-sessions or card-c2/Featured Sessions — nothing else reads it).
const CONFIG_TYPES = {
  GLOBAL: 'global',
  HOMEPAGE_UPCOMING_SESSIONS: 'homepage-upcoming-sessions',
  HOMEPAGE_FEATURED_SESSIONS: 'homepage-featured-sessions',
};

const HOMEPAGE_CONFIG_TYPE_OPTIONS = [
  { value: CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS, label: 'Upcoming Sessions' },
  { value: CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS, label: 'Featured Sessions' },
];

function isHomepageConfigType(configType) {
  return configType === CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS
    || configType === CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS;
}

// Default flow for New Config/Duplicate is browsing the full ESP catalog
// (EventPicker); Library.js auto-falls-back to ManualEventLookup if that
// fails at runtime for the currently selected env. Flip to false to disable
// browse outright.
const EVENT_BROWSE_ENABLED = true;

// Selectable in both EventPicker's and ManualEventLookup's env pickers.
// Excludes 'local' — that's for the localhost dev harness, and targets the
// same endpoints as 'dev'.
const EVENT_SERVICE_ENV_OPTIONS = [
  { value: 'prod', label: 'Prod' },
  { value: 'stage', label: 'Stage' },
  { value: 'stage02', label: 'Stage02' },
  { value: 'dev', label: 'Dev' },
  { value: 'dev02', label: 'Dev02' },
];

export {
  CONFIGS_SHEET_PATH,
  MEDIA_FOLDER_PATH,
  DA_ORIGIN,
  DA_APP_PATH,
  HOMEPAGE_LINK_HASH_KEY,
  PAGES,
  EVENT_BROWSE_ENABLED,
  EVENT_SERVICE_ENV_OPTIONS,
  CONFIG_TYPES,
  HOMEPAGE_CONFIG_TYPE_OPTIONS,
  isHomepageConfigType,
};
