// One config-library sheet per content-repo (da-events, each floodgate space, etc.) —
// resolved against whichever org/repo the DA SDK handshake reports.
const CONFIGS_SHEET_PATH = '/tools/da-apps/tier-1-event-configurator/configs.json';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

// Two config surfaces: Global (pasted into an event page's tier-1-event-config
// metadata, consumed across the event experience — Session Guide, Event App, etc.)
// and Homepage (authored as a single link pasted into a homepage page's doc body,
// decoded and rendered by upcoming-sessions.js or featured-sessions.js — nothing
// else reads it).
const CONFIG_TYPES = {
  GLOBAL: 'global',
  HOMEPAGE_UPCOMING_SESSIONS: 'homepage-upcoming-sessions',
  HOMEPAGE_FEATURED_SESSIONS: 'homepage-featured-sessions',
};

const HOMEPAGE_CONFIG_TYPE_OPTIONS = [
  { value: CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS, label: 'Upcoming Sessions' },
  { value: CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS, label: 'Featured Sessions' },
];

// Same shape as Schedule Maker's DA_ORIGIN/DA_APP_PATH (event-libs/schedule-maker/constants.js).
const DA_ORIGIN = 'https://da.live';
const DA_APP_PATH = 'tools/da-apps/tier-1-event-configurator';

// Query-string key the authored Homepage link's payload is base64-encoded under, in the
// URL hash — decorate.js's tec-homepage auto-block builder reads this same key.
const HOMEPAGE_LINK_HASH_KEY = 'tecHomepage';

const HOMEPAGE_THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function isHomepageConfigType(configType) {
  return configType === CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS
    || configType === CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS;
}

// Which config field + meta field each Homepage config type owns — the single source of
// truth for emptyConfig()/startDuplicateConfig()'s type-scoped shape. ConfigEditor.js's
// own HOMEPAGE_FIELD_BY_TYPE layers UI-only labels/hints on top of these same field names,
// rather than redeclaring them.
const HOMEPAGE_SESSION_FIELDS = {
  [CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS]: { field: 'upcomingSessions', metaField: 'upcomingSessionsMeta' },
  [CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS]: { field: 'homepageFeaturedSessions', metaField: 'homepageFeaturedSessionsMeta' },
};

// UI-only labels/hints per Homepage config type, layered onto the shared field/metaField
// names above (the single source of truth ConfigsContext.js's emptyConfig()/
// startDuplicateConfig() also key off). Shared by ConfigEditor.js's own "Copy Link" button
// and Library.js's per-row "Copy Link" action so both build the exact same link with the
// same toast copy — no disparity between the two entry points.
const HOMEPAGE_FIELD_BY_TYPE = {
  [CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS]: {
    ...HOMEPAGE_SESSION_FIELDS[CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS],
    headingField: 'upcomingSessionsHeading',
    themeField: 'upcomingSessionsTheme',
    // upcoming-sessions.js is purely clock-driven off startTimeMillis (the Mobile Rider
    // poller was removed — see the upcoming-sessions block's own docs) and never reads
    // watchUrl or imageUrl either — its cards are text-only, no per-session meta needed.
    metaFields: [],
    label: 'Upcoming Sessions',
    blockHint: 'the upcoming-sessions block',
    linkPrefix: 'event-upcoming-sessions',
  },
  [CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS]: {
    ...HOMEPAGE_SESSION_FIELDS[CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS],
    // No headingField/themeField — featured-sessions.js doesn't author a heading or
    // support a theme; unlike Upcoming Sessions, this surface is always media-wide
    // cards, no config-driven visual variation.
    // The featured-sessions block's generated event-card markup + session-routing.js
    // read all three — watchUrl is where a click routes once the session goes live,
    // mrStreamId is what tells it a session is Mobile-Rider-backed at all, and
    // imageUrl is required for a session to render as a card at all (event-card.js
    // removes any card with no resolvable image).
    metaFields: ['watchUrl', 'mrStreamId', 'imageUrl'],
    metaHint: 'Watch URL / Mobile Rider stream ID are optional per-session overrides — image is required for a session to appear',
    label: 'Featured Sessions',
    blockHint: 'the featured-sessions block',
    linkPrefix: 'event-featured-sessions',
  },
};

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
  PAGES,
  EVENT_BROWSE_ENABLED,
  EVENT_SERVICE_ENV_OPTIONS,
  CONFIG_TYPES,
  HOMEPAGE_CONFIG_TYPE_OPTIONS,
  HOMEPAGE_SESSION_FIELDS,
  HOMEPAGE_FIELD_BY_TYPE,
  isHomepageConfigType,
  DA_ORIGIN,
  DA_APP_PATH,
  HOMEPAGE_LINK_HASH_KEY,
  HOMEPAGE_THEME_OPTIONS,
};
